// ── Competitive Rating V1: the server side ───────────────────────────────────
// Phase 9E. The server never computes a rating itself and never trusts one
// from a browser: it asks the database function competitive_rate_attempt() to
// rate ONE official attempt (eligibility, locks, math, ledger, profiles — all
// inside one transaction), asks competitive_reconcile() to rate whatever is
// pending in frozen chronological order, and reads the safe projections
// (competitive_leaderboard, competitive_rank_of) for the leaderboard. Identity
// comes only from a verified bearer; the leaderboard exposes only the public
// projection; a private account's rating is read by that account alone.
import { rest, cloudAccountsReady, serverKeyRejected } from "./cloudAccounts.js";
import { loadRun } from "./chaosRun.js";
import {
  COMPETITIVE_RATING_VERSION, RATED_PAIR_LIMIT, RATED_PAIR_WINDOW_DAYS, LEADERBOARD_LIMIT, AROUND_ME_SPAN, INITIAL_RATING,
  VISIBILITY_PREF_KEY, VISIBILITY_DEFAULT, placementProgress, isPlaced, streakOf, publicRow, winPct, sideOutcome, UNRATED_REASONS,
} from "../../src/competitive/contract.js";

export const COMPETITIVE_SERVER_VERSION = "1.0.0";
const q = (s) => encodeURIComponent(String(s));
const rows = (r) => (Array.isArray(r?.body) ? r.body : []);
const one = (r) => rows(r)[0] || null;
const UUID = /^[0-9a-f-]{36}$/i;
const failure = (r, detail) => (serverKeyRejected(r.status) ? { status: "failed", detail: "provider_rejected_server_key" } : { status: "failed", detail: `${detail}_http_${r.status}` });

/** Rate one official attempt (idempotent: a rated attempt answers already_rated). */
export const rateAttempt = async ({ attemptId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const r = await rest("rpc/competitive_rate_attempt", { method: "POST", body: JSON.stringify({ p_attempt_id: attemptId, p_version: COMPETITIVE_RATING_VERSION, p_pair_limit: RATED_PAIR_LIMIT, p_window_days: RATED_PAIR_WINDOW_DAYS }) }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "rate");
  return { status: "ok", ...r.body };
};

/** Rate every pending eligible attempt, oldest first. Safe to run any time; a second run rates nothing. */
export const reconcileRatings = async ({ limit = 500 } = {}, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const r = await rest("rpc/competitive_reconcile", { method: "POST", body: JSON.stringify({ p_version: COMPETITIVE_RATING_VERSION, p_pair_limit: RATED_PAIR_LIMIT, p_window_days: RATED_PAIR_WINDOW_DAYS, p_limit: limit }) }, fetchImpl);
  if (!r.ok || !r.body || typeof r.body !== "object") return failure(r, "reconcile");
  return { status: "ok", ...r.body };
};

/** The rated event for one attempt, if any. */
const eventForAttempt = async (attemptId, fetchImpl) => one(await rest(`competitive_rating_events?challenge_attempt_id=eq.${q(attemptId)}&rating_version=eq.${q(COMPETITIVE_RATING_VERSION)}&select=*`, {}, fetchImpl));

/**
 * The completion hook. Reads the run's attempt (never a body field), rates it,
 * and answers from the CALLER's side: rated with both movements, or unrated
 * with its closed reason. The other participant's identity is a display name
 * read from the challenge/attempt snapshots, never an id.
 */
export const rateChallengeCompletion = async ({ chaosRunId, callerUserId = null }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const run = await loadRun(chaosRunId);
  if (!run?.challengeAttemptId) return { status: "ok", rated: false, reason: UNRATED_REASONS.NOT_ELIGIBLE };
  const attempt = one(await rest(`challenge_attempts?id=eq.${q(run.challengeAttemptId)}&select=id,challenge_id,user_id,status,challenge_outcome,display_snapshot`, {}, fetchImpl));
  if (!attempt) return { status: "ok", rated: false, reason: UNRATED_REASONS.NOT_ELIGIBLE };
  const challenge = one(await rest(`challenges?id=eq.${q(attempt.challenge_id)}&select=creator_user_id,creator_display_snapshot`, {}, fetchImpl));
  let out = await rateAttempt({ attemptId: attempt.id }, fetchImpl);
  if (out.status !== "ok") return out;
  let event = null;
  if (out.rated) event = out; else if (out.reason === UNRATED_REASONS.ALREADY_RATED) { const e = await eventForAttempt(attempt.id, fetchImpl); if (e) event = { rated: true, outcome: e.outcome, creator: { before: e.creator_rating_before, delta: e.creator_delta, after: e.creator_rating_after }, recipient: { before: e.recipient_rating_before, delta: e.recipient_delta, after: e.recipient_rating_after } }; }
  const isRecipient = !!callerUserId && attempt.user_id === callerUserId;
  const isCreator = !!callerUserId && challenge?.creator_user_id === callerUserId;
  if (!event) return { status: "ok", rated: false, reason: out.reason, ratingVersion: COMPETITIVE_RATING_VERSION };
  const you = isRecipient ? event.recipient : isCreator ? event.creator : null;
  const them = isRecipient ? event.creator : isCreator ? event.recipient : null;
  const themName = isRecipient ? challenge?.creator_display_snapshot || "Coach" : attempt.display_snapshot || "Coach";
  return {
    status: "ok", rated: true, ratingVersion: COMPETITIVE_RATING_VERSION, outcome: event.outcome,
    perspective: isRecipient ? "recipient" : isCreator ? "creator" : "observer",
    you: you ? { before: you.before, delta: you.delta, after: you.after } : null,
    them: them ? { name: themName, before: them.before, delta: them.delta, after: them.after } : null,
    // an observer (a guest browser completing an account's attempt) sees no movement
  };
};

/** The account's own competitive state: profile (default 1000, provisional), placement, record, streak, visibility, rank when public and placed, recent events. */
export const competitiveMe = async ({ userId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || ""))) return { status: "invalid_user" };
  // rate anything pending first — a completion whose callback failed is repaired here, in order
  await reconcileRatings({}, fetchImpl);
  const profile = one(await rest(`competitive_profiles?user_id=eq.${q(userId)}&select=current_rating,rated_wins,rated_losses,rated_ties,rated_matches,unique_opponents,rating_version,last_rated_at,placed_at`, {}, fetchImpl))
    || { current_rating: INITIAL_RATING, rated_wins: 0, rated_losses: 0, rated_ties: 0, rated_matches: 0, unique_opponents: 0, rating_version: COMPETITIVE_RATING_VERSION, last_rated_at: null, placed_at: null };
  const prefs = one(await rest(`user_preferences?user_id=eq.${q(userId)}&select=prefs`, {}, fetchImpl))?.prefs || {};
  const visibility = prefs[VISIBILITY_PREF_KEY] === "public" ? "public" : VISIBILITY_DEFAULT;
  const events = rows(await rest(`competitive_rating_events?or=(creator_user_id.eq.${q(userId)},recipient_user_id.eq.${q(userId)})&select=id,challenge_id,challenge_attempt_id,creator_user_id,recipient_user_id,outcome,creator_rating_before,recipient_rating_before,creator_delta,recipient_delta,creator_rating_after,recipient_rating_after,completed_at&order=completed_at.desc&limit=20`, {}, fetchImpl));
  const placed = isPlaced(profile);
  let rank = null;
  if (placed && visibility === "public") {
    const me = rows(await rest("rpc/competitive_rank_of", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_span: 0 }) }, fetchImpl));
    rank = me.find((r) => r.is_me)?.rank ?? null;
  }
  // opponents by CURRENT display name for accounts that still exist; "Deleted account" otherwise
  const oppIds = [...new Set(events.map((e) => (e.creator_user_id === userId ? e.recipient_user_id : e.creator_user_id)).filter(Boolean))];
  const names = oppIds.length ? Object.fromEntries(rows(await rest(`profiles?user_id=in.(${oppIds.map(q).join(",")})&select=user_id,display_name`, {}, fetchImpl)).map((p) => [p.user_id, p.display_name])) : {};
  return {
    status: "ok", ratingVersion: COMPETITIVE_RATING_VERSION,
    rating: profile.current_rating, record: { wins: profile.rated_wins, losses: profile.rated_losses, ties: profile.rated_ties, matches: profile.rated_matches, winPct: winPct(profile.rated_wins, profile.rated_matches) },
    uniqueOpponents: profile.unique_opponents, placement: placementProgress(profile), provisional: !placed, visibility, rank, rankBucketEligible: placed && visibility === "public",
    streak: streakOf(events, userId), lastRatedAt: profile.last_rated_at,
    history: events.map((e) => { const meIsCreator = e.creator_user_id === userId; const oppId = meIsCreator ? e.recipient_user_id : e.creator_user_id; return {
      opponent: oppId ? names[oppId] || "Coach" : "Deleted account", outcome: sideOutcome(e, userId), delta: meIsCreator ? e.creator_delta : e.recipient_delta,
      before: meIsCreator ? e.creator_rating_before : e.recipient_rating_before, after: meIsCreator ? e.creator_rating_after : e.recipient_rating_after, at: e.completed_at,
    }; }),
  };
};

/** The public Top N: public and placed accounts only, in the contract's order. Readable signed out. */
export const leaderboard = async ({ limit = LEADERBOARD_LIMIT, offset = 0 } = {}, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  await reconcileRatings({}, fetchImpl);
  const r = await rest("rpc/competitive_leaderboard", { method: "POST", body: JSON.stringify({ p_limit: Math.min(LEADERBOARD_LIMIT, Math.max(1, limit | 0)), p_offset: Math.max(0, offset | 0) }) }, fetchImpl);
  if (!r.ok) return failure(r, "leaderboard");
  return { status: "ok", ratingVersion: COMPETITIVE_RATING_VERSION, limit: LEADERBOARD_LIMIT, rows: rows(r).map(publicRow) };
};

/** The rows around a public, placed account (2 above, me, 2 below). Private or provisional accounts get none. */
export const aroundMe = async ({ userId, span = AROUND_ME_SPAN }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || ""))) return { status: "invalid_user" };
  const prefs = one(await rest(`user_preferences?user_id=eq.${q(userId)}&select=prefs`, {}, fetchImpl))?.prefs || {};
  if (prefs[VISIBILITY_PREF_KEY] !== "public") return { status: "ok", available: false, reason: "private" };
  const r = await rest("rpc/competitive_rank_of", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_span: span }) }, fetchImpl);
  if (!r.ok) return failure(r, "around_me");
  const list = rows(r);
  if (!list.some((x) => x.is_me)) return { status: "ok", available: false, reason: "provisional" };
  return { status: "ok", available: true, rows: list.map((x) => ({ ...publicRow(x), isMe: !!x.is_me })) };
};

export const COMPETITIVE_SERVER_POLICY = Object.freeze({
  writePath: "rpc/competitive_rate_attempt and rpc/competitive_reconcile (service role only)",
  triggers: ["challenge_completed", "career_opened (competitive-me)", "leaderboard_opened"],
  publicProjection: "rpc/competitive_leaderboard — public AND placed, display name only",
  aroundMe: "rpc/competitive_rank_of — public accounts only; private means private",
});
