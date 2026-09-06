// ── Progression V1: the server side ──────────────────────────────────────────
// Phase 9D. The server DECIDES XP; the browser only displays it. Every call
// here follows the same shape:
//
//   1. read the account's authoritative records (saved Clashes, completed
//      challenge attempts, completed responses by other accounts)
//   2. derive, with pure functions, the awards and unlocks those records earn
//   3. hand the list to ONE database function, progression_apply(), which
//      inserts what is missing (the unique constraint decides), recomputes the
//      total from the ledger and derives the level from the versioned curve
//
// Because step 2 is deterministic and step 3 is idempotent, the same function
// serves every trigger — a Clash saved, a guest result claimed, a device
// import, a challenge completed, a historical backfill, a My EraClash open, an
// explicit reconcile — and running it twice awards nothing the second time.
//
// The user id comes only from a verified bearer token (never a body); the
// records come only from the database (never a body); no score, outcome, XP or
// level is ever read from a request. PROGRESSION_POWER_EFFECT = 0: nothing
// here is imported by a game path, and nothing here reads one.
import { rest, cloudAccountsReady, serverKeyRejected } from "./cloudAccounts.js";
import { loadRun } from "./chaosRun.js";
import {
  PROGRESSION_VERSION, LEVEL_CURVE_VERSION, ACHIEVEMENT_CATALOG_VERSION,
  expectedAwards, factsFromRecords, evaluateAchievements, achievementAwards, achievementSummary,
  levelForXp, progressionDelta, awardLabel, reasonCategory,
} from "../../src/progression/contract.js";

export const PROGRESSION_SERVER_VERSION = "1.0.0";
const q = (s) => encodeURIComponent(String(s));
const rows = (r) => (Array.isArray(r?.body) ? r.body : []);
const one = (r) => rows(r)[0] || null;
const UUID = /^[0-9a-f-]{36}$/i;
const CLASH_COLUMNS = "result_id,mode,outcome,era_id,gold_score,blue_score,gold_coach,gold_roster,played_at";

/**
 * Everything progression derives from, in four reads (no per-row query):
 * the account's saved Clashes, its completed attempts, its challenges and the
 * completed attempts against them by OTHER ACCOUNTS. A guest's response is
 * not an account and earns the creator nothing — a farming door kept shut.
 */
export const loadCareerRecords = async (userId, fetchImpl = fetch) => {
  const clashes = rows(await rest(`saved_clashes?user_id=eq.${q(userId)}&select=${CLASH_COLUMNS}&order=played_at.asc&limit=2000`, {}, fetchImpl));
  const attempts = rows(await rest(`challenge_attempts?user_id=eq.${q(userId)}&status=eq.completed&select=id,challenge_id,challenge_outcome,completed_at,status&limit=2000`, {}, fetchImpl));
  const created = rows(await rest(`challenges?creator_user_id=eq.${q(userId)}&select=id&limit=1000`, {}, fetchImpl));
  const ids = created.map((c) => c.id);
  const responses = ids.length
    ? rows(await rest(`challenge_attempts?challenge_id=in.(${ids.map(q).join(",")})&status=eq.completed&select=id,user_id,completed_at,status&limit=5000`, {}, fetchImpl))
      .filter((a) => a.user_id && a.user_id !== userId)
    : [];
  return { clashes, attempts, responses };
};

/** The one write. Awards and unlocks the database does not already hold are inserted; the rest collide and vanish. */
export const applyProgression = async ({ userId, awards = [], unlocks = [] }, fetchImpl = fetch) => {
  const r = await rest("rpc/progression_apply", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_awards: awards.map((a) => ({ source_type: a.sourceType, source_id: a.sourceId, reason: a.reason, xp_delta: a.xpDelta })),
      p_unlocks: unlocks.map((u) => ({ achievement_id: u.achievementId, achievement_version: u.achievementVersion, xp_delta: u.xpDelta })),
      p_version: PROGRESSION_VERSION, p_curve_version: LEVEL_CURVE_VERSION,
    }),
  }, fetchImpl);
  if (serverKeyRejected(r.status)) return { status: "apply_failed", detail: "provider_rejected_server_key" };
  if (!r.ok || !r.body || typeof r.body !== "object") return { status: "apply_failed", detail: `rpc_http_${r.status}` };
  return { status: "ok", totalXp: Number(r.body.totalXp) || 0, level: Number(r.body.level) || 1, awarded: Array.isArray(r.body.awarded) ? r.body.awarded : [], unlocked: Array.isArray(r.body.unlocked) ? r.body.unlocked : [] };
};

/**
 * Reconcile one account: what its records say it should hold, minus what it
 * holds, is inserted. Safe to run on every trigger and every time. Returns the
 * full progression state plus the DELTA this call produced, so a postgame can
 * say "+125 XP" while a second run of the same records says "+0".
 *
 * Closed statuses: ok · not_configured · invalid_user · apply_failed
 */
export const reconcileProgression = async ({ userId, trigger = "reconcile" }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!UUID.test(String(userId || ""))) return { status: "invalid_user" };
  const records = deps.records || await loadCareerRecords(userId, fetchImpl);
  const awards = expectedAwards(records);
  const first = await applyProgression({ userId, awards }, fetchImpl);
  if (first.status !== "ok") return { ...first, trigger };

  const held = rows(await rest(`achievement_unlocks?user_id=eq.${q(userId)}&select=achievement_id,achievement_version,unlocked_at,xp_awarded`, {}, fetchImpl));
  const facts = factsFromRecords(records);
  const unlocks = achievementAwards(evaluateAchievements(facts, held));
  let second = { status: "ok", awarded: [], unlocked: [], totalXp: first.totalXp, level: first.level };
  if (unlocks.length) { second = await applyProgression({ userId, unlocks }, fetchImpl); if (second.status !== "ok") return { ...second, trigger }; }

  const awarded = [...first.awarded, ...second.awarded];
  const unlocked = second.unlocked;
  const totalXp = second.totalXp;
  const stamp = new Date().toISOString();
  const just = new Set(unlocked.map((u) => u.achievementId));
  const evaluated = evaluateAchievements(facts, [...held, ...unlocked.map((u) => ({ achievement_id: u.achievementId, achievement_version: u.achievementVersion, unlocked_at: stamp }))])
    .map((a) => (just.has(a.id) ? { ...a, newlyUnlocked: true } : a));   // unlocked by THIS call
  return {
    status: "ok", trigger,
    profile: { ...levelForXp(totalXp), progressionVersion: PROGRESSION_VERSION, levelCurveVersion: LEVEL_CURVE_VERSION, catalogVersion: ACHIEVEMENT_CATALOG_VERSION },
    facts, achievements: evaluated, summary: achievementSummary(evaluated),
    delta: progressionDelta({ awarded, unlocked, totalXp }),
    repaired: { awards: awarded.length, unlocks: unlocked.length },
  };
};

/** The recent ledger, newest first, for the career page. Labels are the contract's. */
export const recentLedger = async (userId, fetchImpl = fetch, limit = 20) =>
  rows(await rest(`xp_ledger?user_id=eq.${q(userId)}&select=source_type,source_id,reason,xp_delta,created_at&order=created_at.desc&limit=${Math.max(1, Math.min(100, limit | 0))}`, {}, fetchImpl))
    .map((r) => ({ label: awardLabel(r), category: reasonCategory(r), xpDelta: r.xp_delta, at: r.created_at }));

/**
 * The compact block a postgame response carries: the delta, the level before
 * and after, and the unlocks — never a user id, never a ledger row id.
 */
export const compactProgression = (out) => {
  if (!out || out.status !== "ok") return { status: out?.status || "unavailable" };
  const d = out.delta;
  return {
    status: "ok",
    xpDelta: d.xpDelta,
    awarded: d.awarded.map((a) => ({ label: awardLabel(a), category: reasonCategory(a), xpDelta: a.xpDelta })),
    unlocked: out.achievements.filter((a) => a.newlyUnlocked).map((a) => ({ id: a.id, name: a.name, category: a.category, xp: a.xp })),
    before: { level: d.before.level }, after: out.profile, levelUp: d.levelUp, levelsGained: d.levelsGained,
    summary: out.summary,
  };
};

/**
 * Who a challenge run belongs to, for the completion hook: the recipient (an
 * account, or null for a guest) and the creator. Read from the run store and
 * the database, never from the request.
 */
export const challengeParticipants = async ({ chaosRunId }, fetchImpl = fetch) => {
  const run = await loadRun(chaosRunId);
  if (!run?.challengeAttemptId) return null;
  const attempt = one(await rest(`challenge_attempts?id=eq.${q(run.challengeAttemptId)}&select=challenge_id,user_id,status`, {}, fetchImpl));
  if (!attempt) return null;
  const challenge = one(await rest(`challenges?id=eq.${q(attempt.challenge_id)}&select=creator_user_id`, {}, fetchImpl));
  return { recipientUserId: attempt.user_id || null, creatorUserId: challenge?.creator_user_id || null, completed: attempt.status === "completed" };
};

/** Policy in one place, for the operator guide and the gates. */
export const PROGRESSION_SERVER_POLICY = Object.freeze({
  writePath: "rpc/progression_apply (service role only)",
  triggers: ["clash_saved", "guest_result_claimed", "device_import", "challenge_completed", "challenge_response_completed", "career_opened", "manual_reconcile"],
  guestResponsesEarnCreatorXp: false,
  readsPerReconcile: 5,
});
