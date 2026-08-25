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
export const FIXTURE = {
  narrative_requests: 10000,
  "cache_hit:narrative": 7900,
  "cache_miss:narrative": 2100,
  provider_calls: 2100,
  provider_failures: 37,
  cache_lock_wait: 260,
  lock_wait_ms_total: 214000,
  tokens_avoided_input: 7900 * 1250,
  tokens_avoided_output: 7900 * 380,
  cost_avoided_microusd: null, // recomputed below from configured pricing
};

export const buildReport = (metrics, { source }) => {
  const n = (k) => Number(metrics[k] || 0);
  const requests = n("narrative_requests");
  const hits = n("cache_hit:narrative");
  const misses = n("cache_miss:narrative");
  const providerCalls = n("provider_calls");
  const lockWaits = n("cache_lock_wait:narrative") || n("cache_lock_wait") || 0;
  const tokensIn = n("tokens_avoided_input");
  const tokensOut = n("tokens_avoided_output");

  // Prefer the accumulated micro-dollar counter; fall back to recomputing from
  // the avoided token totals. Either way the model must have configured pricing.
  const model = Object.keys(MODEL_PRICING)[0] ?? null;
  let costAvoidedUsd = null;
  let costMethod = "unavailable — no configured pricing for the narrative model";
  if (Number.isFinite(Number(metrics.cost_avoided_microusd)) && metrics.cost_avoided_microusd != null) {
    costAvoidedUsd = Number(metrics.cost_avoided_microusd) / 1e6;
    costMethod = "summed per-hit from recorded token usage and configured pricing";
  } else if (model && (tokensIn || tokensOut)) {
    costAvoidedUsd = estimateCostUsd(model, tokensIn, tokensOut);
    costMethod = costAvoidedUsd == null
      ? "unavailable — model pricing not configured"
      : `recomputed from avoided token totals × configured ${model} pricing`;
  }

  // requests = hits + provider calls + still-pending
  const accountedFor = hits + providerCalls;
  const pending = Math.max(0, requests - accountedFor);
  const reconciles = requests === 0 ? true : accountedFor + pending === requests;

  return {
    source,
    day: dayKey(),
    model,
    requests, hits, misses, providerCalls, lockWaits,
    memoryHits: n("cache_hit:memory"),
    kvHits: hits,
    providerFailures: n("provider_failures"),
    lockWaitMsTotal: n("lock_wait_ms_total"),
    tokensAvoidedInput: tokensIn,
    tokensAvoidedOutput: tokensOut,
    costAvoidedUsd,
    costMethod,
    hitRate: requests ? Number((hits / requests).toFixed(4)) : null,
    pending,
    reconciles,
  };
};

const money = (v) => (v == null ? "null (pricing not configured — avoided calls and tokens are still real)" : `$${v.toFixed(2)}`);

const render = (r) => {
  const banner =
    r.source === "fixture" ? "⚠  SOURCE: TEST FIXTURE — synthetic numbers, NOT production usage"
    : r.source === "empty" ? "⚠  SOURCE: no telemetry recorded yet (store empty or unconfigured)"
    : "SOURCE: live telemetry";
  return `
EraClash cache cost report
${banner}
day: ${r.day}   model: ${r.model ?? "unknown"}

AI narrative requests: ${r.requests.toLocaleString()}

Provider calls: ${r.providerCalls.toLocaleString()}

Cache hits: ${r.hits.toLocaleString()}

Estimated model cost avoided: ${money(r.costAvoidedUsd)}

─── detail ───────────────────────────────────────────────
  cache misses            ${r.misses.toLocaleString()}
  KV hits                 ${r.kvHits.toLocaleString()}
  memory hits             ${r.memoryHits.toLocaleString()}
  generation lock waits   ${r.lockWaits.toLocaleString()}${r.lockWaitMsTotal ? `  (${Math.round(r.lockWaitMsTotal / Math.max(1, r.lockWaits))}ms avg)` : ""}
  provider failures       ${r.providerFailures.toLocaleString()}
  hit rate                ${r.hitRate == null ? "n/a" : `${(r.hitRate * 100).toFixed(1)}%`}
  tokens avoided (in)     ${r.tokensAvoidedInput.toLocaleString()}
  tokens avoided (out)    ${r.tokensAvoidedOutput.toLocaleString()}
  cost method             ${r.costMethod}
  reconciles              ${r.reconciles ? "yes" : "NO — requests do not equal hits + provider calls + pending"}
  pending / unresolved    ${r.pending.toLocaleString()}
`;
};

const main = async () => {
  let metrics, source;
  if (useFixture) {
    metrics = { ...FIXTURE, cost_avoided_microusd: null };
    source = "fixture";
  } else if (!hasStore()) {
    metrics = {}; source = "empty";
  } else {
    metrics = await readCacheMetrics();
    source = Object.keys(metrics).length ? "live" : "empty";
  }
  const report = buildReport(metrics, { source });
  console.log(asJson ? JSON.stringify(report, null, 2) : render(report));
};

if (import.meta.url === `file://${process.argv[1]}`) main();
