// ── Cache observability ───────────────────────────────────────────────────────
// Every cache decision emits a structured event so the cost report can answer
// "what did caching actually save us?" with measurements rather than optimism.
//
// ── COST HONESTY ─────────────────────────────────────────────────────────────
// Estimated savings are computed ONLY from configured pricing for the exact
// model that would have been called. When pricing for a model is not
// configured, `costAvoidedUsd` is NULL — never zero, never a guess. A null cost
// still records the avoided provider call and the avoided token counts, because
// those are real even when the dollar figure is not knowable.
//
// ── NEVER LOGGED ─────────────────────────────────────────────────────────────
// API keys, tokens, cookies, authorization headers, full session ids, email
// addresses, or full payloads. Everything written here passes a redaction pass
// first; a telemetry pipeline is the easiest place to leak a secret by accident.
import { cmd, hasStore, dayKey } from "./store.js";
import { logReq } from "./errors.js";
import { namespaceOf } from "./cacheKeys.js";

export const CACHE_EVENTS = ["cache_hit", "cache_miss", "cache_write", "cache_lock_wait", "cache_stale", "cache_error"];
export const HIT_SOURCES = ["memory", "kv", "cdn"];

// ── Model pricing (USD per 1M tokens) ────────────────────────────────────────
// Configured per model. A model absent from this table yields a null cost
// rather than an invented one. Update deliberately when pricing changes.
export const MODEL_PRICING = {
  "claude-sonnet-4-6": { inputPerMTok: 3.00, outputPerMTok: 15.00, source: "configured 2026-08-24" },
};

/** Estimated USD avoided, or null when pricing for the model is unknown. */
export const estimateCostUsd = (model, inputTokens, outputTokens) => {
  const p = MODEL_PRICING[model];
  if (!p) return null;
  const i = Number(inputTokens), o = Number(outputTokens);
  if (!Number.isFinite(i) || !Number.isFinite(o)) return null;
  return Number(((i / 1e6) * p.inputPerMTok + (o / 1e6) * p.outputPerMTok).toFixed(6));
};

// Anything whose key smells like a credential is dropped before it can be
// written or logged. Deny-list plus a value-shape check.
// TOKEN COUNTS ARE NOT TOKENS. A naive /token/i deny-list silently ate
// `tokensAvoidedInput` — the single most important number in the cost report —
// because "tokens" contains "token". Usage metrics are allowlisted first, then
// the credential deny-list applies to everything else.
const SAFE_FIELDS = new Set([
  "tokensAvoidedInput", "tokensAvoidedOutput", "inputTokens", "outputTokens", "totalTokens",
]);
const SECRET_KEY = /(secret|password|authorization|cookie|bearer|credential|(^|[^a-z])(api)?key([^a-z]|$)|(^|[a-z_])token$)/i;
const SECRET_VALUE = /^(sk-|Bearer\s|gh[pousr]_)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export const redact = (props = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (!SAFE_FIELDS.has(k) && SECRET_KEY.test(k)) continue;
    if (typeof v === "string") {
      if (SECRET_VALUE.test(v) || EMAIL.test(v)) continue;
      out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    } else if (v === null || ["number", "boolean"].includes(typeof v)) {
      out[k] = v;
    }
    // objects/arrays are intentionally NOT serialised — full payloads never
    // belong in telemetry
  }
  return out;
};

const METRICS_KEY = (day) => `cachemetrics:${day}`;

/**
 * Record one cache decision. Never throws: telemetry must not be able to break
 * a request that was otherwise going to succeed.
 */
export const cacheEvent = async (event, props = {}) => {
  try {
    if (!CACHE_EVENTS.includes(event)) return;
    const ns = props.namespace ?? (props.key ? namespaceOf(props.key) : "unknown");
    const safe = redact({ ...props, key: undefined, namespace: ns, event });

    logReq({ route: "cache", ...safe });

    if (!hasStore()) return;
    const day = dayKey();
    const writes = [
      ["HINCRBY", METRICS_KEY(day), `${event}:${ns}`, 1],
      ["HINCRBY", METRICS_KEY(day), `${event}:total`, 1],
    ];
    if (Number.isFinite(props.tokensAvoidedInput)) writes.push(["HINCRBY", METRICS_KEY(day), "tokens_avoided_input", Math.round(props.tokensAvoidedInput)]);
    if (Number.isFinite(props.tokensAvoidedOutput)) writes.push(["HINCRBY", METRICS_KEY(day), "tokens_avoided_output", Math.round(props.tokensAvoidedOutput)]);
    // stored in micro-dollars so the counter stays an integer
    if (Number.isFinite(props.costAvoidedUsd)) writes.push(["HINCRBY", METRICS_KEY(day), "cost_avoided_microusd", Math.round(props.costAvoidedUsd * 1e6)]);
    if (Number.isFinite(props.lockWaitMs)) writes.push(["HINCRBY", METRICS_KEY(day), "lock_wait_ms_total", Math.round(props.lockWaitMs)]);
    if (props.providerCall === true) writes.push(["HINCRBY", METRICS_KEY(day), "provider_calls", 1]);
    if (props.providerFailure === true) writes.push(["HINCRBY", METRICS_KEY(day), "provider_failures", 1]);
    if (props.narrativeRequest === true) writes.push(["HINCRBY", METRICS_KEY(day), "narrative_requests", 1]);

    for (const w of writes) await cmd(...w);
    await cmd("EXPIRE", METRICS_KEY(day), 60 * 60 * 24 * 120);
  } catch { /* telemetry must never throw */ }
};

/** Raw counters for one day, or an empty object. */
export const readCacheMetrics = async (day = dayKey()) => {
  if (!hasStore()) return {};
  try {
    const flat = await cmd("HGETALL", METRICS_KEY(day));
    if (!flat) return {};
    if (!Array.isArray(flat)) return flat;
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
    return out;
  } catch { return {}; }
};

export const METRICS_NAMESPACE = METRICS_KEY;
