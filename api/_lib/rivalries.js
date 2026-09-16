// ── Rivalries V1: the server side ────────────────────────────────────────────
// The server never decides a Rivalry itself and never trusts one from a
// browser: it asks the database functions (0008_rivalries_v1.sql) to resolve
// the opponent from an authorised comparison, to accept/decline/block/cancel/
// end under the pair lock, to enrol ONE completed official attempt once, and
// to read the two safe projections. Identity comes only from the verified
// bearer the route resolved; the body carries opaque handles (an attempt id
// the caller took part in, a rivalry id the caller is a member of) and never
// an account id, an email or an outcome.
import { rest, cloudAccountsReady, serverKeyRejected } from "./cloudAccounts.js";
import { loadRun } from "./chaosRun.js";
import {
  RIVALRY_CONTRACT_VERSION, REQUEST_TTL_DAYS, REQUESTS_PER_DAY, MAX_OUTGOING_PENDING, DECLINE_COOLDOWN_DAYS, CLOSE_COOLDOWN_DAYS,
  HISTORY_PAGE_SIZE, ACTIONS,
} from "../../src/rivalries/contract.js";

export const RIVALRIES_SERVER_VERSION = "1.0.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (r, detail) => (serverKeyRejected(r.status) ? { status: "failed", detail: "provider_rejected_server_key" } : { status: "failed", detail: `${detail}_http_${r.status}` });
const rpc = async (fn, body, fetchImpl) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) }, fetchImpl);

/** START A RIVALRY from a completed comparison the caller took part in. The opponent is resolved in the database. */
export const requestRivalry = async ({ userId, attemptId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || "")) || !UUID.test(String(attemptId || ""))) return { status: "not_eligible" };
  const r = await rpc("rivalry_request", {
    p_actor: userId, p_attempt_id: attemptId, p_ttl_days: REQUEST_TTL_DAYS, p_daily_limit: REQUESTS_PER_DAY, p_max_outgoing: MAX_OUTGOING_PENDING,
    p_decline_cooldown_days: DECLINE_COOLDOWN_DAYS, p_close_cooldown_days: CLOSE_COOLDOWN_DAYS,
  }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "request");
  return { contractVersion: RIVALRY_CONTRACT_VERSION, ...r.body };
};

/** accept · decline · block · unblock · cancel · end — only what the caller's side may do right now. */
export const respondRivalry = async ({ userId, rivalryId, action }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!Object.values(ACTIONS).includes(action)) return { status: "failed", detail: "unknown_action" };
  if (!UUID.test(String(userId || "")) || !UUID.test(String(rivalryId || ""))) return { status: "not_yours" };
  const r = await rpc("rivalry_respond", { p_actor: userId, p_rivalry_id: rivalryId, p_action: action }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "respond");
  return { contractVersion: RIVALRY_CONTRACT_VERSION, ...r.body };
};

/** Enrol ONE completed official attempt (idempotent). */
export const recordAttempt = async ({ attemptId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const r = await rpc("rivalry_record_attempt", { p_attempt_id: attemptId, p_version: RIVALRY_CONTRACT_VERSION }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "record");
  return { status: "ok", ...r.body };
};

/** Enrol whatever is pending, oldest first. Safe any time; a second run enrols nothing. */
export const reconcileRivalries = async ({ limit = 500 } = {}, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const r = await rpc("rivalry_reconcile", { p_version: RIVALRY_CONTRACT_VERSION, p_limit: limit }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "reconcile");
  return { status: "ok", ...r.body };
};

/**
 * The completion hook. Reads the run's attempt (never a body field) and enrols
 * it; answers the CALLER with whether this comparison counted in a Rivalry.
 * A failure here is reported, never thrown: the comparison, the rating and the
 * XP transaction have already settled and are not re-run.
 */
export const recordChallengeCompletion = async ({ chaosRunId, callerUserId = null }, fetchImpl = fetch) => {
  try {
    if (!cloudAccountsReady()) return { status: "not_configured" };
    if (!callerUserId) return { status: "ok", recorded: false, reason: "guest_participant" };
    const run = await loadRun(chaosRunId);
    if (!run?.challengeAttemptId) return { status: "ok", recorded: false, reason: "not_completed" };
    const out = await recordAttempt({ attemptId: run.challengeAttemptId }, fetchImpl);
    if (out.status !== "ok") return out;
    return { status: "ok", contractVersion: RIVALRY_CONTRACT_VERSION, recorded: !!out.recorded, reason: out.reason || null, rivalryId: out.rivalryId || null, rated: out.rated ?? null };
  } catch (e) {
    return { status: "failed", detail: "record_threw" };
  }
};

/** The account's Rivalries (reconciling pending enrolments first, in order). */
export const listRivalries = async ({ userId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || ""))) return { status: "invalid_user" };
  await reconcileRivalries({}, fetchImpl);
  const r = await rpc("rivalry_list", { p_user: userId }, fetchImpl);
  if (!r.ok || !Array.isArray(r.body)) return failure(r, "list");
  return { status: "ok", contractVersion: RIVALRY_CONTRACT_VERSION, rivalries: r.body, limits: { requestTtlDays: REQUEST_TTL_DAYS, requestsPerDay: REQUESTS_PER_DAY, maxOutgoing: MAX_OUTGOING_PENDING } };
};

/** One Rivalry for one of its members. A non-member (or a guessed id) reads as `not_yours`. */
export const rivalryDetail = async ({ userId, rivalryId, limit = HISTORY_PAGE_SIZE, offset = 0 }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || "")) || !UUID.test(String(rivalryId || ""))) return { status: "not_yours" };
  await reconcileRivalries({}, fetchImpl);
  const r = await rpc("rivalry_detail", { p_user: userId, p_rivalry_id: rivalryId, p_limit: Math.min(50, Math.max(1, limit | 0)), p_offset: Math.max(0, offset | 0) }, fetchImpl);
  if (!r.ok) return failure(r, "detail");
  if (!r.body || typeof r.body !== "object") return { status: "not_yours" };
  return { status: "ok", contractVersion: RIVALRY_CONTRACT_VERSION, rivalry: r.body };
};

export const RIVALRIES_SERVER_POLICY = Object.freeze({
  writePath: "rpc/rivalry_request · rivalry_respond · rivalry_record_attempt · rivalry_reconcile (service role only)",
  identity: "verified bearer only; the body names an attempt the caller took part in or a rivalry the caller is a member of — never an account",
  triggers: ["challenge_completed", "rivalries_opened (list/detail reconcile)"],
  projections: "rpc/rivalry_list and rpc/rivalry_detail — member only; opponent = current display name or 'Deleted account', public slug only while public",
});
