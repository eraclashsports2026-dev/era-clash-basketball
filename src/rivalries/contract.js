// ── Rivalries V1: the pure contract ──────────────────────────────────────────
// A Rivalry is a PRIVATE relationship between TWO authenticated accounts who
// both explicitly agreed to track their Challenge comparisons. Everything a
// Rivalry DECIDES without a browser, a database or a network lives here, so the
// server, the client, the fake cloud and the tests read one source:
//
//   · the versioned contract and the bounded request constants
//   · the relationship states and which lifecycle actions each one allows
//   · which comparisons count, and how a comparison outcome maps to each side
//   · the record (W–L–T) and the streak, from an ordered list of events
//   · what a participant may see of the other, and what must never leave
//
// A Rivalry consumes the existing authoritative Challenge Comparison
// (src/challenges/contract.js). It never reinterprets a basketball score, never
// rates, never awards XP and never changes who may accept a Challenge.
export const RIVALRY_CONTRACT_VERSION = "1.0.0";

// ── Bounded request behaviour (server-enforced; the browser only reads these) ─
export const REQUEST_TTL_DAYS = 7;           // a pending request expires, unrefreshed by retries
export const REQUESTS_PER_DAY = 10;          // new requests one account may send in 24 hours
export const MAX_OUTGOING_PENDING = 5;       // outstanding outgoing requests at once
export const DECLINE_COOLDOWN_DAYS = 7;      // after a decline, no re-request to that account for a week
export const CLOSE_COOLDOWN_DAYS = 1;        // after a cancel or an ended Rivalry, one day before a fresh request
export const HISTORY_PAGE_SIZE = 20;

// ── States ───────────────────────────────────────────────────────────────────
// idle    no current relationship (never asked, or the last one was declined,
//         cancelled, expired or ended); the pair row remembers WHY and WHEN
// pending one side asked; the other has not answered
// active  mutually accepted; a period is open
export const STATE = Object.freeze({ IDLE: "idle", PENDING: "pending", ACTIVE: "active" });
export const CLOSE_REASONS = Object.freeze(["declined", "canceled", "expired", "ended", "blocked", "account_deleted"]);

/** Lifecycle actions and who may take them, from the actor's point of view. */
export const ACTIONS = Object.freeze({ ACCEPT: "accept", DECLINE: "decline", BLOCK: "block", UNBLOCK: "unblock", CANCEL: "cancel", END: "end" });
export const allowedActions = ({ state, pendingFromMe = false, blockedByMe = false }) => {
  const out = [];
  if (state === STATE.PENDING && !pendingFromMe) out.push(ACTIONS.ACCEPT, ACTIONS.DECLINE, ACTIONS.BLOCK);
  if (state === STATE.PENDING && pendingFromMe) out.push(ACTIONS.CANCEL);
  if (state === STATE.ACTIVE) out.push(ACTIONS.END, ACTIONS.BLOCK);
  if (blockedByMe) out.push(ACTIONS.UNBLOCK);
  return out;
};

/** The pending request has lapsed: it reads as idle, and accepting it fails safely. */
export const requestExpired = (row, now = Date.now()) => row?.state === STATE.PENDING && !!row.pending_expires_at && new Date(row.pending_expires_at).getTime() <= now;
export const effectiveState = (row, now = Date.now()) => (!row ? STATE.IDLE : requestExpired(row, now) ? STATE.IDLE : row.state);

// ── Canonical pair ───────────────────────────────────────────────────────────
/** One row per UNORDERED pair: the lower uuid first. The database enforces the same rule. */
export const canonicalPair = (a, b) => (String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)]);

// ── Which comparisons count ──────────────────────────────────────────────────
/**
 * Eligibility of ONE official attempt for a Rivalry period. `attemptStartedAt`
 * is the server's attempt row creation time (never a client clock); the attempt
 * must have STARTED inside the period, so an attempt enrolled before the
 * Rivalry ended may still settle into its archived record, and nothing that
 * predates mutual acceptance is backfilled.
 */
export const ELIGIBILITY_REASONS = Object.freeze({
  OK: "ok", NOT_COMPLETED: "not_completed", GUEST_PARTICIPANT: "guest_participant", SAME_ACCOUNT: "same_account",
  NOT_RIVALS: "not_rivals", NOT_IN_PERIOD: "not_in_period", ALREADY_RECORDED: "already_recorded",
});
export const eligibility = ({ status, challengeOutcome, creatorUserId, recipientUserId, attemptStartedAt, period, alreadyRecorded = false }) => {
  if (alreadyRecorded) return { eligible: false, reason: ELIGIBILITY_REASONS.ALREADY_RECORDED };
  if (status !== "completed" || !["creator", "recipient", "tie"].includes(challengeOutcome)) return { eligible: false, reason: ELIGIBILITY_REASONS.NOT_COMPLETED };
  if (!creatorUserId || !recipientUserId) return { eligible: false, reason: ELIGIBILITY_REASONS.GUEST_PARTICIPANT };
  if (creatorUserId === recipientUserId) return { eligible: false, reason: ELIGIBILITY_REASONS.SAME_ACCOUNT };
  if (!period) return { eligible: false, reason: ELIGIBILITY_REASONS.NOT_RIVALS };
  const t = new Date(attemptStartedAt).getTime(), s = new Date(period.started_at).getTime(), e = period.ended_at ? new Date(period.ended_at).getTime() : Infinity;
  if (!Number.isFinite(t) || t < s || t >= e) return { eligible: false, reason: ELIGIBILITY_REASONS.NOT_IN_PERIOD };
  return { eligible: true, reason: ELIGIBILITY_REASONS.OK };
};

/**
 * The comparison outcome, mapped to the pair's LOW side. A creator win is the
 * creator's Rivalry win; a recipient win is the recipient's; a tie is one tie
 * for each. Stored once, read from either side, so A's win is always B's loss.
 */
export const lowOutcome = ({ challengeOutcome, creatorUserId, recipientUserId }) => {
  const [low] = canonicalPair(creatorUserId, recipientUserId);
  if (challengeOutcome === "tie") return "tie";
  const winner = challengeOutcome === "creator" ? creatorUserId : recipientUserId;
  return String(winner) === low ? "win" : "loss";
};
/** One event seen from one participant. */
export const sideOutcome = (event, userId, low) => (event.low_outcome === "tie" ? "tie" : (String(userId) === String(low)) === (event.low_outcome === "win") ? "win" : "loss");

// ── Record and streak ────────────────────────────────────────────────────────
/** W–L–T for one side over a list of events; A's wins equal B's losses by construction. */
export const recordFor = (events, userId, low) => {
  const r = { wins: 0, losses: 0, ties: 0, total: 0 };
  for (const e of events || []) { const o = sideOutcome(e, userId, low); r[o === "win" ? "wins" : o === "loss" ? "losses" : "ties"]++; r.total++; }
  return r;
};
/**
 * The streak: consecutive WINS from the newest event back. A tie or a loss ends
 * it. Null with no events. Events must be ordered newest first
 * (completed_at desc, id desc — the frozen order).
 */
export const winStreak = (eventsNewestFirst, userId, low) => {
  if (!eventsNewestFirst?.length) return null;
  let n = 0;
  for (const e of eventsNewestFirst) { if (sideOutcome(e, userId, low) === "win") n++; else break; }
  return n;
};
/** "YOU LEAD 4–3", "TIED 2–2", "THEY LEAD 1–3" — never "your team beat theirs". */
export const recordLine = (record) => {
  if (!record || record.total === 0) return "NO COMPARISONS YET";
  const w = record.wins, l = record.losses;
  return w > l ? `YOU LEAD ${w}–${l}` : l > w ? `THEY LEAD ${l}–${w}` : `TIED ${w}–${l}`;
};

// ── Deterministic ordering ───────────────────────────────────────────────────
/** completed_at desc, then id desc: the documented stable secondary key. */
export const compareEventsNewestFirst = (a, b) => (Date.parse(b.completed_at) - Date.parse(a.completed_at)) || String(b.id).localeCompare(String(a.id));

// ── What a participant may see of the other ──────────────────────────────────
// The CURRENT display name (the private profile stays the source of truth;
// nothing new is snapshotted), "Deleted account" for a deleted opponent, and a
// public-profile slug ONLY while that profile is public right now.
export const OPPONENT_FIELDS = Object.freeze(["name", "deleted", "publicSlug"]);
export const FORBIDDEN_RIVALRY_FIELDS = Object.freeze([
  "email", "user_id", "userId", "opponentUserId", "opponent_user_id", "user_low", "user_high", "auth", "token", "session",
  "current_rating", "rating", "rank", "total_xp", "xp", "seed", "seedId", "chaos_manifest_id", "device_session_hash",
]);
export const opponentView = ({ displayName, deleted = false, publicSlug = null }) => ({
  name: deleted ? "Deleted account" : String(displayName || "Coach").replace(/[<>]/g, "").slice(0, 24) || "Coach",
  deleted: !!deleted, publicSlug: deleted ? null : publicSlug || null,
});

// ── Statuses the server answers (closed) ─────────────────────────────────────
export const REQUEST_STATUSES = Object.freeze([
  "requested", "pending_incoming", "already_pending", "already_active", "unavailable", "not_eligible", "self",
  "cooldown", "daily_limit", "outgoing_limit", "not_configured", "failed",
]);
export const RESPOND_STATUSES = Object.freeze([
  "accepted", "declined", "blocked", "unblocked", "canceled", "ended", "not_pending", "not_active", "expired", "not_yours", "unavailable", "not_configured", "failed",
]);

// ── Telemetry (closed vocabulary; categories and booleans only) ──────────────
export const RIVALRY_EVENTS = Object.freeze({
  REQUESTED: "rivalry_requested", RESPONDED: "rivalry_responded", ENDED: "rivalry_ended",
  VIEWED: "rivalries_viewed", CHALLENGE_AGAIN: "rivalry_challenge_again",
});
export const RIVALRY_EVENT_METADATA_ALLOWED = Object.freeze(["contractVersion", "action", "status", "success", "failureCode", "count"]);

// ── Challenge Again context (browser memory only) ───────────────────────────
// Which Rivalry a fresh Chaos Clash is being played for, so the result surface
// can label the share step. Never an account id: the rivalry id is an opaque
// handle the server resolves for its two members and nobody else.
export const RIVALRY_CONTEXT_KEY = "ec_rivalry_ctx";
