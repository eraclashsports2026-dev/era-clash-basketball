// ── /api/narrative — optional enhanced recap for a stored result ───────────────
// Strictly cosmetic: reads the immutable result, asks the model to EXPLAIN it,
// and caches the narrative separately (narrative:{resultId}). Failure here can
// never invalidate a game, burn a Daily attempt, or change a record.
import { hasStore, getJSON, setJSON, rateLimit, clientIp } from "./_lib/store.js";
import { getOrCreateSession, sameOrigin } from "./_lib/session.js";
import { sendError, newRequestId, logReq } from "./_lib/errors.js";
import { flags, limits } from "./_lib/flags.js";
import { tooLarge, validResultId } from "./_lib/validate.js";
import { generateNarrative, circuitState } from "./_lib/ai.js";
import { validateTeamIds } from "./_lib/validate.js";

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
    if (resultId && hasStore()) {
      result = await getJSON(`result:${resultId}`);
      if (!result) return sendError(res, "NOT_FOUND", requestId);
      const cached = await getJSON(`narrative:${resultId}`);
      if (cached?.status === "complete") {
        return res.status(200).json({ requestId, status: "complete", narrative: cached.narrative, cached: true });
      }
    } else {
      result = validInlineResult(req.body?.result);
      resultId = null;
      if (!result) return sendError(res, "VALIDATION_FAILURE", requestId);
    }

    const out = await generateNarrative(result, apiKey, chaosHeader(req));
    if (!out.ok) {
      if (resultId && hasStore()) {
        // short-lived failure marker damps retry storms but allows manual retry
        await setJSON(`narrative:${resultId}`, { status: "failed", code: out.code, ts: Date.now() }, 60);
      }
      logReq({ requestId, route: "narrative", status: 503, ms: Date.now() - started, error_code: out.code, circuit: await circuitState() });
      return sendError(res, out.code, requestId);
    }

    if (resultId && hasStore()) {
      await setJSON(`narrative:${resultId}`, { status: "complete", narrative: out.narrative, usage: out.usage, ts: Date.now() }, 60 * 60 * 24 * 180);
    }
    logReq({ requestId, route: "narrative", status: 200, ms: Date.now() - started, tokens: out.usage.input_tokens + out.usage.output_tokens, retries: out.usage.retries });
    return res.status(200).json({ requestId, status: "complete", narrative: out.narrative });
  } catch (err) {
    logReq({ requestId, route: "narrative", status: 500, ms: Date.now() - started, error_code: "UNKNOWN_ERROR", msg: String(err?.message).slice(0, 200) });
    return sendError(res, "UNKNOWN_ERROR", requestId);
  }
}
