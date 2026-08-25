#!/usr/bin/env node
// ── Cache cost report ─────────────────────────────────────────────────────────
// Answers "what did caching actually save?" from measurements, never from
// optimism.
//
//   npm run cache:report                  # live telemetry (needs a store)
//   npm run cache:report -- --fixture     # labelled synthetic example
//   npm run cache:report -- --json
//
// ── HONESTY RULES ────────────────────────────────────────────────────────────
// · Every report states its SOURCE. A fixture run is labelled as a fixture in
//   the output itself, so a synthetic number can never be mistaken for
//   production usage by someone reading a pasted terminal block.
// · Estimated cost is computed only from configured pricing for the exact model
//   that would have been called. Unknown pricing yields NULL, never zero and
//   never a guess — but the avoided CALL and avoided TOKENS are still reported,
//   because those are real regardless.
// · The report reconciles: requests must equal hits + provider calls + pending.
//   A report that does not balance is reported as not balancing rather than
//   quietly rounded into agreement.
import { readCacheMetrics, MODEL_PRICING, estimateCostUsd } from "../api/_lib/cacheTelemetry.js";
import { hasStore, dayKey } from "../api/_lib/store.js";

const args = process.argv.slice(2);
const useFixture = args.includes("--fixture");
const asJson = args.includes("--json");

// A clearly-labelled synthetic shape, sized to make the arithmetic legible.
// A clearly-labelled synthetic shape, sized to make the arithmetic legible AND
// to reconcile: 10,000 requests = 7,900 cache hits + 1,840 provider calls +
// 260 lock waits, with the 2,100 misses splitting into the provider calls and
// the lock waits. A fixture that does not obey the identity it demonstrates is
// worse than no fixture.
export const FIXTURE = {
  narrative_requests: 10000,
  "cache_hit:narrative": 7900,
  "cache_miss:narrative": 2100,
  provider_calls: 1840,
  provider_failures: 37,
  cache_lock_wait: 260,
  lock_wait_ms_total: 214000,
  tokens_avoided_input: 7900 * 1250,
  tokens_avoided_output: 7900 * 380,
  cost_avoided_microusd: null, // recomputed below from configured pricing
};

// ── Report status ─────────────────────────────────────────────────────────────
// "No data" and "no pricing" are different operational states, and the old
// report conflated them: with zero events it printed "no configured pricing for
// the narrative model" — blaming a pricing table that was in fact configured.
// An operator reading that would go looking for the wrong problem. Each state
// below is distinguishable, and the status is stated before any number.
export const REPORT_STATUS = {
  NO_TELEMETRY: "NO_TELEMETRY",
  ZERO_REQUESTS: "ZERO_REQUESTS",
  ZERO_CACHE_HITS: "ZERO_CACHE_HITS",
  MODEL_PRICING_UNAVAILABLE: "MODEL_PRICING_UNAVAILABLE",
  PARTIAL_TELEMETRY: "PARTIAL_TELEMETRY",
  TELEMETRY_AVAILABLE: "TELEMETRY_AVAILABLE",
};

export const STATUS_MEANING = {
  NO_TELEMETRY: "No cache or model-usage events exist. Nothing has been measured.",
  ZERO_REQUESTS: "Telemetry exists, but no narrative requests were recorded.",
  ZERO_CACHE_HITS: "Narrative requests exist, but none were served from cache.",
  MODEL_PRICING_UNAVAILABLE: "Requests and token data exist, but the configured model has no approved pricing.",
  PARTIAL_TELEMETRY: "Some metrics exist, but the dataset does not fully reconcile.",
  TELEMETRY_AVAILABLE: "Requests, provider calls, hits, tokens and savings all reconcile.",
};

// Where the numbers came from. A fixture must never be readable as live usage.
export const SOURCE = {
  PRODUCTION: "PRODUCTION_TELEMETRY",
  PREVIEW: "PREVIEW_TELEMETRY",
  LOCAL: "LOCAL_TELEMETRY",
  FIXTURE: "TEST_FIXTURE",
  BENCHMARK: "SYNTHETIC_BENCHMARK",
};

export const detectSource = (env = process.env) => {
  const v = String(env.VERCEL_ENV || "").toLowerCase();
  if (v === "production") return SOURCE.PRODUCTION;
  if (v === "preview") return SOURCE.PREVIEW;
  return SOURCE.LOCAL;
};

export const buildReport = (metrics, { source, model: modelOverride } = {}) => {
  const raw = metrics && typeof metrics === "object" ? metrics : {};
  const num = (k) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) ? v : 0;
  };
  // A metric present but non-numeric is malformed telemetry, not zero.
  const malformed = Object.keys(raw).filter((k) => raw[k] != null && k !== "model" && !Number.isFinite(Number(raw[k])));
  const hasAnyKey = Object.keys(raw).some((k) => raw[k] != null);

  const requests = num("narrative_requests");
  const hits = num("cache_hit:narrative");
  const misses = num("cache_miss:narrative");
  const providerCalls = num("provider_calls");
  const providerFailures = num("provider_failures");
  const lockWaits = num("cache_lock_wait:narrative") || num("cache_lock_wait");
  const tokensIn = num("tokens_avoided_input");
  const tokensOut = num("tokens_avoided_output");

  const model = modelOverride ?? raw.model ?? Object.keys(MODEL_PRICING)[0] ?? null;
  const pricingKnown = Boolean(model && MODEL_PRICING[model]);

  // ── Reconciliation ──────────────────────────────────────────────────────────
  // Every narrative request resolves exactly one way: served from cache, sent
  // to the provider, or still waiting on another worker's generation lock. A
  // provider FAILURE is a subset of provider calls (the miss already counted
  // the request), not a fourth term — asserting it as one would guarantee a
  // false imbalance on every failed generation.
  const accountedFor = hits + providerCalls + lockWaits;
  const residual = requests - accountedFor;
  const reconciles = requests === 0 ? hasAnyKey === false || accountedFor === 0 : residual === 0;
  const pending = residual > 0 ? residual : 0;
  const overAccounted = residual < 0 ? -residual : 0;

  // Cost: only from configured pricing for the exact model. Unknown pricing is
  // null with a stated reason — never zero, which reads as "we saved nothing".
  let costAvoidedUsd = null;
  let costMethod = null;
  if (Number.isFinite(Number(raw.cost_avoided_microusd)) && raw.cost_avoided_microusd != null) {
    costAvoidedUsd = Number(raw.cost_avoided_microusd) / 1e6;
    costMethod = "summed per-hit from recorded token usage and configured pricing";
  } else if (pricingKnown && (tokensIn || tokensOut)) {
    costAvoidedUsd = estimateCostUsd(model, tokensIn, tokensOut);
    costMethod = costAvoidedUsd == null
      ? "unavailable — estimateCostUsd returned no value"
      : `recomputed from avoided token totals × configured ${model} pricing`;
  } else if (!tokensIn && !tokensOut) {
    costMethod = "not applicable — no avoided tokens to price";
  } else {
    costMethod = `unavailable — no configured pricing for model ${model ?? "(unknown)"}`;
  }

  // Status, by precedence. Order matters: with no events at all, pricing is
  // irrelevant; with no hits, avoided tokens cannot exist, so a missing price
  // is not the story either.
  let status;
  if (!hasAnyKey) status = REPORT_STATUS.NO_TELEMETRY;
  else if (malformed.length || !reconciles) status = REPORT_STATUS.PARTIAL_TELEMETRY;
  else if (requests === 0) status = REPORT_STATUS.ZERO_REQUESTS;
  else if (hits === 0) status = REPORT_STATUS.ZERO_CACHE_HITS;
  else if (!pricingKnown && (tokensIn || tokensOut)) status = REPORT_STATUS.MODEL_PRICING_UNAVAILABLE;
  else status = REPORT_STATUS.TELEMETRY_AVAILABLE;

  const reasons = [];
  if (malformed.length) reasons.push(`malformed metrics: ${malformed.join(", ")}`);
  if (overAccounted) reasons.push(`${overAccounted} more resolutions than requests — instrumentation asymmetry`);
  if (residual > 0 && status === REPORT_STATUS.PARTIAL_TELEMETRY) reasons.push(`${residual} requests unresolved`);
  if (!pricingKnown && (tokensIn || tokensOut)) reasons.push(`no approved pricing for model ${model ?? "(unknown)"}`);

  return {
    status,
    statusMeaning: STATUS_MEANING[status],
    reasons,
    source: source ?? detectSource(),
    isLive: [SOURCE.PRODUCTION, SOURCE.PREVIEW, SOURCE.LOCAL].includes(source ?? detectSource()),
    day: dayKey(),
    model, pricingKnown,
    requests, hits, misses, providerCalls, providerFailures, lockWaits,
    memoryHits: num("cache_hit:memory"),
    kvHits: hits,
    lockWaitMsTotal: num("lock_wait_ms_total"),
    tokensAvoidedInput: tokensIn,
    tokensAvoidedOutput: tokensOut,
    costAvoidedUsd,
    costMethod,
    hitRate: requests ? Number((hits / requests).toFixed(4)) : null,
    pending, overAccounted, reconciles,
    malformed,
  };
};

const money = (r) => {
  if (r.costAvoidedUsd != null) return `$${r.costAvoidedUsd.toFixed(2)}`;
  return `null   (reason: ${r.status === REPORT_STATUS.MODEL_PRICING_UNAVAILABLE ? "MODEL_PRICING_UNAVAILABLE" : r.status})`;
};

const SOURCE_BANNER = {
  PRODUCTION_TELEMETRY: "SOURCE: PRODUCTION TELEMETRY — live usage",
  PREVIEW_TELEMETRY:    "SOURCE: PREVIEW TELEMETRY — live usage in a preview environment",
  LOCAL_TELEMETRY:      "SOURCE: LOCAL TELEMETRY — this machine only",
  TEST_FIXTURE:         "⚠  SOURCE: TEST FIXTURE — synthetic numbers, NOT usage of any kind",
  SYNTHETIC_BENCHMARK:  "⚠  SOURCE: SYNTHETIC BENCHMARK — generated load, NOT real usage",
};

const render = (r) => `
EraClash cache cost report
${SOURCE_BANNER[r.source] ?? `SOURCE: ${r.source}`}

STATUS: ${r.status}
  ${r.statusMeaning}${r.reasons.length ? `\n  reasons: ${r.reasons.join("; ")}` : ""}

day: ${r.day}   model: ${r.model ?? "unknown"}   pricing: ${r.pricingKnown ? "configured" : "NOT configured"}

AI narrative requests: ${r.requests.toLocaleString()}

Provider calls: ${r.providerCalls.toLocaleString()}

Cache hits: ${r.hits.toLocaleString()}

Estimated model cost avoided: ${money(r)}

─── detail ───────────────────────────────────────────────
  cache misses            ${r.misses.toLocaleString()}
  KV hits                 ${r.kvHits.toLocaleString()}
  memory hits             ${r.memoryHits.toLocaleString()}
  generation lock waits   ${r.lockWaits.toLocaleString()}${r.lockWaitMsTotal ? `  (${Math.round(r.lockWaitMsTotal / Math.max(1, r.lockWaits))}ms avg)` : ""}
  provider failures       ${r.providerFailures.toLocaleString()}   (subset of provider calls)
  hit rate                ${r.hitRate == null ? "n/a" : `${(r.hitRate * 100).toFixed(1)}%`}
  tokens avoided (in)     ${r.tokensAvoidedInput.toLocaleString()}
  tokens avoided (out)    ${r.tokensAvoidedOutput.toLocaleString()}
  cost method             ${r.costMethod}

─── reconciliation ───────────────────────────────────────
  requests = hits + provider calls + lock waits
  ${r.requests.toLocaleString()} = ${r.hits.toLocaleString()} + ${r.providerCalls.toLocaleString()} + ${r.lockWaits.toLocaleString()}
  ${r.reconciles ? "✓ reconciles" : "✗ DOES NOT RECONCILE"}
  pending / unresolved    ${r.pending.toLocaleString()}
  over-accounted          ${r.overAccounted.toLocaleString()}
${r.malformed.length ? `  malformed metrics       ${r.malformed.join(", ")}\n` : ""}`;

const main = async () => {
  let metrics, source;
  if (useFixture) {
    metrics = { ...FIXTURE, cost_avoided_microusd: null };
    source = SOURCE.FIXTURE;
  } else if (!hasStore()) {
    metrics = {}; source = detectSource();
  } else {
    metrics = await readCacheMetrics();
    source = detectSource();
  }
  const report = buildReport(metrics, { source });
  console.log(asJson ? JSON.stringify(report, null, 2) : render(report));
};

if (import.meta.url === `file://${process.argv[1]}`) main();
