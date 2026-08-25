// ── /api/narrative — optional enhanced recap for a stored result ───────────────
// Strictly cosmetic: reads the immutable result, asks the model to EXPLAIN it,
// and caches the narrative separately (narrative:{resultId}). Failure here can
// never invalidate a game, burn a Daily attempt, or change a record.
import { hasStore, getJSON, setJSON, setNX, cmd, rateLimit, clientIp } from "./_lib/store.js";
import { getOrCreateSession, sameOrigin } from "./_lib/session.js";
import { sendError, newRequestId, logReq } from "./_lib/errors.js";
import { flags, limits } from "./_lib/flags.js";
import { tooLarge, validResultId, validNarrativeKeyId } from "./_lib/validate.js";
import { generateNarrative, circuitState, MODEL, PROVIDER } from "./_lib/ai.js";
import { cacheKeys } from "./_lib/cacheKeys.js";
import { cacheEvent, estimateCostUsd } from "./_lib/cacheTelemetry.js";
import { validateTeamIds } from "./_lib/validate.js";

// Lock TTL must exceed the provider timeout plus margin so a slow-but-alive
// generation is never duplicated, and must be finite so a dead worker's lock
// always expires instead of deadlocking the result forever.
const LOCK_TTL_SEC = 75;
const LOCK_POLL_MS = 400;
const LOCK_POLL_ATTEMPTS = 12;   // ~4.8s before reporting pending
const NARRATIVE_TTL_SEC = 60 * 60 * 24 * 180;
const NEGATIVE_TTL_SEC = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const releaseLock = async (key) => { try { await cmd("DEL", key); } catch { /* the TTL is the real guarantee */ } };

const chaosHeader = (req) =>
  process.env.ENABLE_CHAOS_TESTS === "true" && process.env.NODE_ENV !== "production"
    ? String(req.headers["x-chaos"] || "") : "";

// Minimal shape check for the no-KV fallback path (narration only — this can
// never touch records because there are no records without a store).
const validInlineResult = (r) => {
  if (!r || typeof r !== "object" || !r.core) return null;
  if (!validateTeamIds(r.goldIds)) return null;
  const c = r.core;
  if (!c.winner || !Array.isArray(c.teamAStats) || c.teamAStats.length !== 5) return null;
  if (JSON.stringify(r).length > 20000) return null;
  return r;
};

export default async function handler(req, res) {
  const requestId = newRequestId();
  const started = Date.now();
  const f = flags();

  if (req.method !== "POST") return sendError(res, "VALIDATION_FAILURE", requestId);
  if (f.maintenance) return sendError(res, "MAINTENANCE", requestId);
  if (!f.aiNarrative) return sendError(res, "FEATURE_DISABLED", requestId);
  if (!sameOrigin(req)) return sendError(res, "FORBIDDEN", requestId);
  if (tooLarge(req, 25000)) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return sendError(res, "MODEL_UNAVAILABLE", requestId);

  const session = getOrCreateSession(req, res);
  const L = limits();
  if (!(await rateLimit(`nar:s:${session.slice(0, 16)}`, L.narrativePerMinSession, 60)) ||
      !(await rateLimit(`nar:ip:${clientIp(req)}`, L.narrativePerMinSession * 2, 60))) {
    return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });
  }

  try {
    let result = null;
    let resultId = validResultId(req.body?.resultId);
    // Narrative identity: the immutable result PLUS the exact configuration
    // that would produce the text. A prompt, schema, provider or model change
    // is a different artefact and must miss rather than serve stale writing.
    //
    // Identity is resolved AFTER the result is loaded, because a result may
    // declare a shared identity of its own (see narrativeKeyId in api/game.js):
    // a Daily where every player who chose the same coach played the exact
    // same game should be narrated once, not once per player.
    let narrativeId = null, narrKey = null, lockKey = null;
    const bindIdentity = (id) => {
      narrativeId = { resultId: id, provider: PROVIDER, model: MODEL };
      narrKey = cacheKeys.narrative(narrativeId);
      lockKey = cacheKeys.narrativeLock(narrativeId);
    };
    let holdsLock = false;

    if (resultId && hasStore()) {
      result = await getJSON(`result:${resultId}`);
      if (!result) return sendError(res, "NOT_FOUND", requestId);
      // Shared identity only from OUR OWN stored record — never from the
      // request body, which the browser controls. A client that could name
      // the narrative key could read another game's recap or poison one.
      bindIdentity(validNarrativeKeyId(result.narrativeKeyId) || resultId);
      const cached = await getJSON(narrKey);
      if (cached?.status === "complete") {
        const inTok = cached.usage?.input_tokens, outTok = cached.usage?.output_tokens;
        await cacheEvent("cache_hit", {
          namespace: "narrative", key: narrKey, resultId, provider: PROVIDER, model: MODEL,
          hitSource: "kv", requestId, narrativeRequest: true, latency: Date.now() - started,
          tokensAvoidedInput: inTok, tokensAvoidedOutput: outTok,
          costAvoidedUsd: estimateCostUsd(MODEL, inTok, outTok),
        });
        return res.status(200).json({ requestId, status: "complete", narrative: cached.narrative, cached: true });
      }
      // A failure marker is recorded for diagnostics but is DELIBERATELY NOT
      // short-circuited on. Returning early here starved the circuit breaker of
      // the very failures it counts: two failing requests became one provider
      // call, the breaker stayed HALF_OPEN instead of OPEN, and the global
      // outage protection silently stopped working. Provider-outage damping is
      // the circuit breaker's job and it already does it well; the lock below
      // handles the stampede case this endpoint actually needed.
      if (cached?.status === "failed") {
        await cacheEvent("cache_stale", { namespace: "narrative", key: narrKey, resultId, requestId, priorFailure: cached.code });
      }

      await cacheEvent("cache_miss", { namespace: "narrative", key: narrKey, resultId, requestId, narrativeRequest: true });

      // ── generation lock ──────────────────────────────────────────────────
      // Without this, five people opening the same result at once produce five
      // paid provider calls for one piece of text. TTL exceeds the provider
      // timeout plus margin, and it EXPIRES — a dead worker must never leave a
      // permanent deadlock.
      holdsLock = await setNX(lockKey, requestId, LOCK_TTL_SEC);
      if (!holdsLock) {
        const waitStarted = Date.now();
        for (let i = 0; i < LOCK_POLL_ATTEMPTS; i++) {
          await sleep(LOCK_POLL_MS);
          const done = await getJSON(narrKey);
          if (done?.status === "complete") {
            await cacheEvent("cache_lock_wait", {
              namespace: "narrative", key: narrKey, resultId, requestId, resolved: true,
              lockWaitMs: Date.now() - waitStarted, narrativeRequest: true,
              tokensAvoidedInput: done.usage?.input_tokens, tokensAvoidedOutput: done.usage?.output_tokens,
              costAvoidedUsd: estimateCostUsd(MODEL, done.usage?.input_tokens, done.usage?.output_tokens),
            });
            return res.status(200).json({ requestId, status: "complete", narrative: done.narrative, cached: true });
          }
          if (done?.status === "failed") break;
        }
        // Still not ready: report pending rather than starting a second call.
        await cacheEvent("cache_lock_wait", { namespace: "narrative", key: narrKey, resultId, requestId, resolved: false, lockWaitMs: Date.now() - waitStarted });
        return res.status(202).json({ requestId, status: "pending" });
      }
    } else {
      result = validInlineResult(req.body?.result);
      resultId = null;
      if (!result) return sendError(res, "VALIDATION_FAILURE", requestId);
    }

    const out = await generateNarrative(result, apiKey, chaosHeader(req));
    if (!out.ok) {
      if (resultId && hasStore()) {
        // Short-lived failure marker: damps retry storms, carries an explicit
        // error state, and NEVER masquerades as a narrative. Invalid model
        // output is never stored as a success.
        await setJSON(narrKey, { status: "failed", code: out.code, ts: Date.now() }, NEGATIVE_TTL_SEC);
        if (holdsLock) await releaseLock(lockKey);
      }
      await cacheEvent("cache_error", { namespace: "narrative", key: narrKey, resultId, requestId, errorCode: out.code, providerFailure: true, providerCall: true, narrativeRequest: false });
      logReq({ requestId, route: "narrative", status: 503, ms: Date.now() - started, error_code: out.code, circuit: await circuitState() });
      return sendError(res, out.code, requestId);
    }

    if (resultId && hasStore()) {
      await setJSON(narrKey, { status: "complete", narrative: out.narrative, usage: out.usage, ts: Date.now() }, NARRATIVE_TTL_SEC);
      if (holdsLock) await releaseLock(lockKey);
      await cacheEvent("cache_write", {
        namespace: "narrative", key: narrKey, resultId, requestId, provider: PROVIDER, model: MODEL,
        providerCall: true, inputTokens: out.usage?.input_tokens, outputTokens: out.usage?.output_tokens,
      });
    }
    logReq({ requestId, route: "narrative", status: 200, ms: Date.now() - started, tokens: out.usage.input_tokens + out.usage.output_tokens, retries: out.usage.retries });
    return res.status(200).json({ requestId, status: "complete", narrative: out.narrative });
  } catch (err) {
    await cacheEvent("cache_error", { namespace: "narrative", requestId, errorCode: "UNKNOWN_ERROR" });
    logReq({ requestId, route: "narrative", status: 500, ms: Date.now() - started, error_code: "UNKNOWN_ERROR", msg: String(err?.message).slice(0, 200) });
    return sendError(res, "UNKNOWN_ERROR", requestId);
  }
}
