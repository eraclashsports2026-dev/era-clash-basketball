// ── Challenges V1: the pure contract ─────────────────────────────────────────
// Phase 9C. Everything a challenge DECIDES without a browser, a database or a
// network lives here, so it can be tested as plain functions and read by the
// server and the client alike:
//
//   · what a public code looks like, how it is normalised and validated
//   · how long a challenge lives, and which status a row is in right now
//   · the comparison: one performance score per result, one outcome per pair
//   · what an invitation may show before the recipient has played
//   · what a share link may carry, and what it must never carry
//   · the closed telemetry vocabulary
//
// A challenge is NOT an exact replay. It freezes the STARTING opportunity (the
// same seeded Chaos draft, the same rules) and lets the recipient make their
// own decisions; different holds branch deterministically (src/chaos). Nothing
// here touches odds, the draft, Legend Rival, eras or coaches.

export const CHALLENGE_VERSION = "1.0.0";
export const COMPARISON_VERSION = "1.0.0";
export const CHALLENGE_MODE = "chaos";

// ── Public code ──────────────────────────────────────────────────────────────
// EC-XXXX-XXXX from a 32-symbol alphabet with no 0/O or 1/I. 32^8 ≈ 1.1e12
// codes: not sequential, not derived from any id, and case-insensitive.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const CODE_PREFIX = "EC";

/** A code from 8 random indices into the alphabet (the server supplies the randomness). */
export const codeFromIndices = (indices) => {
  if (!Array.isArray(indices) || indices.length !== CODE_LENGTH) throw new Error("code needs 8 indices");
  const body = indices.map((i) => CODE_ALPHABET[((i % CODE_ALPHABET.length) + CODE_ALPHABET.length) % CODE_ALPHABET.length]).join("");
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
};

/** Upper-case, strip spaces and dashes, drop an optional EC prefix; null when it is not a code. */
export const normalizeCode = (input) => {
  const raw = String(input || "").toUpperCase().replace(/[\s-]+/g, "");
  const body = raw.startsWith(CODE_PREFIX) ? raw.slice(CODE_PREFIX.length) : raw;
  if (body.length !== CODE_LENGTH) return null;
  for (const ch of body) if (!CODE_ALPHABET.includes(ch)) return null;
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
};
export const isCode = (input) => normalizeCode(input) !== null;

/** The link a creator shares. It carries the public code and nothing else. */
export const invitationUrl = (origin, code) => {
  const c = normalizeCode(code);
  if (!c) throw new Error("not a challenge code");
  return `${String(origin).replace(/\/$/, "")}/?challenge=${encodeURIComponent(c)}`;
};
export const codeFromSearch = (search) => {
  try { return normalizeCode(new URLSearchParams(String(search || "")).get("challenge")); } catch { return null; }
};

/** Anything on this list in a link or a public payload is a leak. */
export const FORBIDDEN_LINK_FIELDS = Object.freeze([
  "seedId", "seed", "serverSeed", "chaosManifestId", "chaos", "resultId", "result_id", "creator_result_id",
  "userId", "user_id", "creator_user_id", "email", "testerId", "pv", "previewKey", "session", "pv_session",
  "accessToken", "token", "cookie", "commitSecret", "_commitSecret", "id",
]);

// ── Lifetime and status ──────────────────────────────────────────────────────
export const CHALLENGE_TTL_DAYS = 30;
export const expiresAt = (createdAt) => new Date(new Date(createdAt).getTime() + CHALLENGE_TTL_DAYS * 86_400_000).toISOString();

export const STATUS = Object.freeze({ OPEN: "open", EXPIRED: "expired", REVOKED: "revoked", UNAVAILABLE: "unavailable" });
/** The status a row is in NOW, derived — no cron flips a flag. */
export const challengeStatus = (row, now = Date.now()) => {
  if (!row) return STATUS.UNAVAILABLE;
  if (row.revoked_at || row.status === STATUS.REVOKED) return STATUS.REVOKED;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return STATUS.EXPIRED;
  return STATUS.OPEN;
};
export const canStartAttempt = (row, now = Date.now()) => challengeStatus(row, now) === STATUS.OPEN;

// ── Attempts ─────────────────────────────────────────────────────────────────
export const ATTEMPT_STATUS = Object.freeze({ STARTED: "started", COMPLETED: "completed", ABANDONED: "abandoned" });
/** One official attempt per account per challenge; a guest gets one per device. */
export const ONE_OFFICIAL_ATTEMPT = Object.freeze({ perAccount: 1, perGuestDevice: 1, rerunsVisible: "every attempt stays visible; none is hidden behind a best" });

// ── Comparison contract 1.0.0 ────────────────────────────────────────────────
// Performance score: +margin for a win, −margin for a loss, 0 for a tie. Higher
// wins the challenge; equal is a tie. Simple, explainable, and stored with its
// version so later copy can never outrun it.
export const outcomeOf = (gold, blue) => {
  if (!Number.isFinite(gold) || !Number.isFinite(blue)) return null;
  return gold === blue ? "tie" : gold > blue ? "win" : "loss";
};
export const performanceScore = ({ gold, blue }) => {
  const o = outcomeOf(gold, blue);
  if (!o) return null;
  const margin = Math.abs(gold - blue);
  return o === "win" ? margin : o === "loss" ? -margin : 0;
};
export const CHALLENGE_OUTCOME = Object.freeze({ CREATOR: "creator", RECIPIENT: "recipient", TIE: "tie" });
export const compareResults = (creator, recipient) => {
  const c = performanceScore(creator), r = performanceScore(recipient);
  if (c === null || r === null) return null;
  const outcome = r > c ? CHALLENGE_OUTCOME.RECIPIENT : r < c ? CHALLENGE_OUTCOME.CREATOR : CHALLENGE_OUTCOME.TIE;
  return { comparisonVersion: COMPARISON_VERSION, creator: { ...creator, outcome: outcomeOf(creator.gold, creator.blue), performance: c }, recipient: { ...recipient, outcome: outcomeOf(recipient.gold, recipient.blue), performance: r }, outcome, margin: Math.abs(r - c) };
};
/** The sentence the result shows. It never says "you beat X" unless the contract did. */
export const comparisonLine = (cmp, creatorName = "the challenger") => {
  if (!cmp) return "";
  if (cmp.outcome === CHALLENGE_OUTCOME.TIE) return `Tied with ${creatorName}: the same outcome and the same margin.`;
  const you = cmp.recipient.performance, them = cmp.creator.performance;
  return cmp.outcome === CHALLENGE_OUTCOME.RECIPIENT
    ? `You beat ${creatorName}'s Clash: ${signed(you)} against ${signed(them)}.`
    : `${creatorName}'s Clash holds: ${signed(them)} against your ${signed(you)}.`;
};
const signed = (n) => (n > 0 ? `+${n}` : String(n));

// ── The invitation ───────────────────────────────────────────────────────────
// Before the recipient has played, the invitation shows the creator's display
// name, the mode, the headline result and the era — never the creator's five,
// coach or hold path, which would tilt the same opportunity. The full original
// result opens once the recipient has completed (or in the creator's own view).
export const PUBLIC_INVITATION_FIELDS = Object.freeze([
  "code", "status", "mode", "challengeVersion", "comparisonVersion", "creatorName", "creatorInitials",
  "creatorScore", "creatorOutcome", "era", "eraCustom", "createdAt", "expiresAt", "responses", "viewer",
]);
export const invitationView = (row, { viewer = null, now = Date.now(), creatorName = null } = {}) => {
  const status = challengeStatus(row, now);
  if (status === STATUS.UNAVAILABLE) return { status };
  const name = displaySnapshot(creatorName ?? row.creator_display_snapshot);
  return {
    code: row.public_code, status, mode: CHALLENGE_MODE, challengeVersion: row.challenge_version, comparisonVersion: row.comparison_version,
    creatorName: name, creatorInitials: initialsOf(name),
    creatorScore: { gold: row.creator_gold_score, blue: row.creator_blue_score }, creatorOutcome: row.creator_outcome,
    era: row.creator_era_id || null, eraCustom: !!row.era_custom,
    createdAt: row.created_at, expiresAt: row.expires_at, responses: Number(row.response_count) || 0,
    viewer: viewer || { attempt: null },
  };
};

// ── Identity snapshot ────────────────────────────────────────────────────────
// A safe display snapshot: the private profile stays the source of truth; the
// challenge keeps what the creator was called when it was made, cleaned.
export const MAX_SNAPSHOT_NAME = 24;
export const displaySnapshot = (name) => {
  const s = String(name || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_SNAPSHOT_NAME);
  return s || "Coach";
};
export const initialsOf = (name) => displaySnapshot(name).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// ── Fingerprint inputs (§14) ─────────────────────────────────────────────────
// The fields a challenge fingerprint binds. The hash itself is computed on the
// server (sha256) over this ordered list; the client never holds the seed.
export const FINGERPRINT_FIELDS = Object.freeze([
  "challengeVersion", "draftModelVersion", "playerPoolVersion", "candidateId", "parameterHash",
  "eraContractVersion", "cpuPolicyVersion", "creatorChallengeSeedDomain", "chaosSequenceVersion",
]);
export const fingerprintMaterial = (inputs) => FINGERPRINT_FIELDS.map((k) => `${k}=${inputs?.[k] ?? ""}`).join("|");

// ── Telemetry ────────────────────────────────────────────────────────────────
export const CHALLENGE_EVENTS = Object.freeze({
  CREATED: "challenge_created", LINK_COPIED: "challenge_link_copied", SHARE_INVOKED: "challenge_share_invoked",
  OPENED: "challenge_opened", ACCEPT_STARTED: "challenge_accept_started", ATTEMPT_STARTED: "challenge_attempt_started",
  ATTEMPT_COMPLETED: "challenge_attempt_completed", COMPARISON_VIEWED: "challenge_comparison_viewed",
  REVOKED: "challenge_revoked", EXPIRED_VIEWED: "challenge_expired_viewed",
});
/** Metadata keys an event may carry. Names, codes, ids, payloads, seeds and tokens are not on it. */
export const EVENT_METADATA_ALLOWED = Object.freeze(["challengeVersion", "authState", "entryPoint", "status", "mode", "success", "failureCode"]);
export const FAILURE_CODES = Object.freeze([
  "unavailable", "expired", "revoked", "already_attempted", "guest_limit", "not_signed_in", "not_eligible",
  "save_failed", "simulation_failed", "completion_failed", "network", "share_unavailable",
]);
