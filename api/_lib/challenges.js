// ── Challenges V1: the server side ───────────────────────────────────────────
// Phase 9C. A completed Chaos Clash becomes a governed challenge; a recipient
// accepts it, gets the SAME starting opportunity (the seeded Chaos draft the
// creator faced, under the sequence it was minted in) and makes their own
// decisions; the two results are compared under the versioned contract.
//
// Authority lives here and in the run store, never in the browser:
//   · identity comes from a verified bearer token (or the HttpOnly device session
//     for a guest), never from the body;
//   · the creator's result is read from the authoritative result record and the
//     run that produced it, both owned by the creator's own device session;
//   · the recipient's score is read from the result the server stored when
//     their run was simulated; the client never posts a score;
//   · the seed reaches Postgres only in `challenge_secrets`, a table no client
//     role can read, and reaches the browser never.
//
// Nothing in src/chaos changes: runs are created through the existing
// createRun (same-seed manifests) and the draft, odds, Legend Rival, era and
// coach mechanics are untouched.
import { createHash, randomInt } from "node:crypto";
import {
  CHALLENGE_VERSION, COMPARISON_VERSION, CHALLENGE_MODE, CHALLENGE_TTL_DAYS, CODE_ALPHABET, CODE_LENGTH, codeFromIndices, normalizeCode,
  challengeStatus, STATUS, ATTEMPT_STATUS, outcomeOf, performanceScore, compareResults, invitationView, displaySnapshot,
  fingerprintMaterial, expiresAt,
} from "../../src/challenges/contract.js";
import { rest, readAuthoritativeResult, cloudAccountsReady, sha256, serverKeyRejected } from "./cloudAccounts.js";
import { loadRun, saveRun, ownsRun, createRun, publishChallenge, guestRunsUsed, guestLimitReached, consumeGuestRun, view as chaosView, sequenceFromManifest } from "./chaosRun.js";
import { buildManifest } from "../../src/chaos/challenge.js";
import { setJSON } from "./store.js";
import { DRAFT_VERSIONS, CURRENT_SEQUENCE } from "../../src/chaos/runState.js";
import { can, CAPABILITIES, GUEST_CHAOS_RUNS } from "../../src/entitlements.js";
import { PLAYERS } from "../../src/players.js";
import { COACHES } from "../../src/v3/coaches.js";
const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
const COACH_BY_ID = new Map(COACHES.map((c) => [c.id, c]));

export const CHALLENGES_SERVER_VERSION = "1.0.0";

/** A fresh public code from crypto randomness. */
export const newPublicCode = (rand = randomInt) => codeFromIndices(Array.from({ length: CODE_LENGTH }, () => rand(0, CODE_ALPHABET.length)));

/** sha256 over the ordered fingerprint fields (§14). */
export const challengeFingerprint = (inputs) => createHash("sha256").update(fingerprintMaterial(inputs)).digest("hex");

const q = (s) => encodeURIComponent(String(s));
const one = (r) => (Array.isArray(r.body) && r.body.length ? r.body[0] : null);
const failure = (r, detail) => (serverKeyRejected(r.status) ? { status: "save_failed", detail: "provider_rejected_server_key" } : { status: "save_failed", detail: `${detail}_http_${r.status}` });

// The stored result record: the engines put the final score, winner and MVP
// under `core`; older test records carry them at the top level. Read both.
const rosterOf = (ids, record) => {
  const byId = new Map((record?.pregame?.cards || []).map((c) => [c.id, c]));
  return (Array.isArray(ids) ? ids : []).slice(0, 5).map((id) => { const c = byId.get(id) || PLAYER_BY_ID.get(id); return { id: String(id).slice(0, 40), name: c?.name ? String(c.name).slice(0, 40) : null, pos: (c?.pos || c?.positions?.[0]) ? String(c.pos || c.positions[0]).slice(0, 4) : null }; });
};
const coachOf = (c, id = null) => {
  const cid = c?.id ?? id;
  const known = cid ? COACH_BY_ID.get(cid) : null;
  if (!cid && !c?.name) return null;
  return { id: cid ? String(cid).slice(0, 40) : null, name: (c?.name || known?.name) ? String(c?.name || known.name).slice(0, 40) : null };
};
const scoreOf = (record) => { const f = record?.core?.finalScore || record?.finalScore || {}; return { gold: Number(f.gold), blue: Number(f.blue) }; };
const mvpOf = (record) => {
  const m = record?.mvp ?? record?.core?.mvp;
  if (!m) return null;
  if (typeof m === "string") return { name: m.slice(0, 40), pts: Number(record?.core?.mvpLine?.pts) || null };
  return { name: String(m.name || "").slice(0, 40), pts: Number(m.pts) || null };
};

// ── Create ───────────────────────────────────────────────────────────────────
/**
 * The creator (signed in) challenges from the Chaos run they just finished.
 * Binds: the verified user, the authoritative result, the run that produced it
 * (same device session, simulated, its result id), a fresh public code, the
 * seed manifest (KV) plus the seed in challenge_secrets, and the frozen
 * contract versions. Closed statuses: created · already_created · not_found ·
 * not_your_result · not_simulated · not_eligible · not_configured · save_failed
 */
export const createChallenge = async ({ chaosRunId, userId, deviceSession, displayName, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const run = deps.run !== undefined ? deps.run : await loadRun(chaosRunId);
  if (!run) return { status: "not_found" };
  if (!ownsRun(run, deviceSession)) return { status: "not_your_result" };
  if (run.status !== "SIMULATED" || !run.resultId) return { status: "not_simulated" };
  const record = deps.record !== undefined ? deps.record : await readAuthoritativeResult(run.resultId);
  if (!record) return { status: "not_found" };
  if (record.session !== deviceSession) return { status: "not_your_result" };
  if (!record.chaosDraft) return { status: "not_eligible", detail: "not_a_chaos_clash" };   // only a Chaos Clash can be challenged
  const score = scoreOf(record);
  const outcome = outcomeOf(score.gold, score.blue);
  if (!outcome) return { status: "not_eligible", detail: "no_final_score" };

  // The same-seed manifest (KV) the recipient's run will be created from.
  const manifest = deps.manifest || await publishChallenge(run, now);
  const fingerprint = challengeFingerprint({
    challengeVersion: CHALLENGE_VERSION, draftModelVersion: JSON.stringify(DRAFT_VERSIONS), playerPoolVersion: run.chaosDraftVersion || DRAFT_VERSIONS.chaosDraftVersion,
    candidateId: record.previewCandidate?.candidateId || null, parameterHash: record.previewCandidate?.candidateCoreHash || null,
    eraContractVersion: DRAFT_VERSIONS.eraTranslationVersion, cpuPolicyVersion: DRAFT_VERSIONS.legendCpuVersion,
    creatorChallengeSeedDomain: manifest.challengeId, chaosSequenceVersion: manifest.chaosSequenceVersion,
  });

  // The saved career row, if the result has already been saved (it is the
  // authoritative history the challenge points at; absent for a race).
  const savedRow = await rest(`saved_clashes?user_id=eq.${q(userId)}&result_id=eq.${q(run.resultId)}&select=id`, {}, fetchImpl);
  const savedId = one(savedRow)?.id || null;

  const createdAt = new Date(now).toISOString();
  const base = {
    creator_user_id: userId, creator_result_id: String(run.resultId), creator_saved_clash_id: savedId,
    creator_display_snapshot: displaySnapshot(displayName),
    challenge_version: CHALLENGE_VERSION, comparison_version: COMPARISON_VERSION, mode: CHALLENGE_MODE,
    chaos_manifest_id: manifest.challengeId, chaos_sequence_version: manifest.chaosSequenceVersion,
    draft_model_version: DRAFT_VERSIONS, player_pool_version: run.chaosDraftVersion || null,
    candidate_id: record.previewCandidate?.candidateId || null, calibration_version: record.previewCandidate?.calibrationVersion || null,
    parameter_hash: record.previewCandidate?.candidateCoreHash || null,
    era_contract_version: DRAFT_VERSIONS.eraTranslationVersion, cpu_policy_version: DRAFT_VERSIONS.legendCpuVersion,
    challenge_fingerprint: fingerprint,
    creator_outcome: outcome, creator_gold_score: score.gold, creator_blue_score: score.blue, creator_performance: performanceScore(score),
    creator_era_id: record.eraId ? String(record.eraId).slice(0, 20) : null, era_custom: !!run.eraCustom,
    creator_roster: rosterOf(record.goldIds, record), creator_coach: coachOf(record.pregame?.coachGold || record.coachGold, record.coachIds?.gold || run.selectedCoaches?.gold || null),
    creator_mvp: mvpOf(record),
    status: STATUS.OPEN, created_at: createdAt, expires_at: expiresAt(createdAt),
  };

  // One challenge per (creator, result): a second press returns the first.
  const existing = one(await rest(`challenges?creator_user_id=eq.${q(userId)}&creator_result_id=eq.${q(run.resultId)}&select=id,public_code,status,expires_at,revoked_at,created_at`, {}, fetchImpl));
  if (existing) return { status: "already_created", code: existing.public_code, challenge: existing };

  // Collisions on the code are decided by the unique index; try a few codes.
  for (let attempt = 0; attempt < 5; attempt++) {
    const public_code = deps.code || newPublicCode();
    const ins = await rest("challenges", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ ...base, public_code }) }, fetchImpl);
    if (ins.status === 409 && !deps.code) continue;                    // code collision → another code
    if (ins.status === 409) return { status: "already_created" };
    if (!ins.ok) return failure(ins, "challenge_insert");
    const row = one(ins);
    const sec = await rest("challenge_secrets", { method: "POST", body: JSON.stringify({ challenge_id: row.id, seed_id: String(run.seedId), pinned_era_style_id: manifest.eraStyleId || null }) }, fetchImpl);
    if (!sec.ok) return failure(sec, "secret_insert");
    return { status: "created", code: row.public_code, challenge: row };
  }
  return { status: "save_failed", detail: "code_collisions" };
};

// ── Read: the public invitation ──────────────────────────────────────────────
const CHALLENGE_COLUMNS = "id,public_code,creator_user_id,creator_display_snapshot,challenge_version,comparison_version,chaos_manifest_id,chaos_sequence_version,creator_outcome,creator_gold_score,creator_blue_score,creator_performance,creator_era_id,era_custom,status,created_at,expires_at,revoked_at";
export const loadChallengeByCode = async (code, deps = {}) => {
  const c = normalizeCode(code);
  if (!c) return null;
  const r = await rest(`challenges?public_code=eq.${q(c)}&select=${CHALLENGE_COLUMNS}`, {}, deps.fetch || fetch);
  return one(r);
};
const countResponses = async (challengeId, fetchImpl) => {
  const r = await rest(`challenge_attempts?challenge_id=eq.${q(challengeId)}&status=eq.completed&select=id`, { headers: { prefer: "count=exact" } }, fetchImpl);
  return Array.isArray(r.body) ? r.body.length : 0;
};
const viewerAttempt = async (row, { userId, deviceHash }, fetchImpl) => {
  const filter = userId ? `user_id=eq.${q(userId)}` : `device_session_hash=eq.${q(deviceHash)}&user_id=is.null`;
  const a = one(await rest(`challenge_attempts?challenge_id=eq.${q(row.id)}&${filter}&select=id,status,chaos_run_id,outcome,gold_score,blue_score,performance_score,challenge_outcome,completed_at`, {}, fetchImpl));
  return a ? { status: a.status, chaosRunId: a.chaos_run_id, outcome: a.outcome, score: a.gold_score == null ? null : { gold: a.gold_score, blue: a.blue_score }, performance: a.performance_score, challengeOutcome: a.challenge_outcome, completedAt: a.completed_at } : null;
};
/**
 * What a link opens to. Unknown, deleted-creator and malformed codes all read
 * as one generic `unavailable`; a real code reports open/expired/revoked.
 */
export const viewChallenge = async ({ code, userId = null, deviceSession = null, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  const row = deps.row !== undefined ? deps.row : await loadChallengeByCode(code, deps);
  if (!row || !row.creator_user_id) return { status: STATUS.UNAVAILABLE };
  const responses = await countResponses(row.id, fetchImpl);
  const viewer = { attempt: await viewerAttempt(row, { userId, deviceHash: deviceSession ? sha256(deviceSession) : null }, fetchImpl), isCreator: !!userId && userId === row.creator_user_id };
  return invitationView({ ...row, response_count: responses }, { viewer, now });
};

// ── Accept ───────────────────────────────────────────────────────────────────
/**
 * Start the recipient's run from the challenge's manifest. Signed in: one
 * official attempt per account, bound to the user. Guest: one per device,
 * under the ordinary guest run budget, which is spent honestly. Closed
 * statuses: started · resumed · unavailable · expired · revoked ·
 * already_attempted · guest_limit · own_challenge · not_configured · save_failed
 */
export const acceptChallenge = async ({ code, userId = null, deviceSession, tier = "GUEST", displayName = null, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const row = deps.row !== undefined ? deps.row : await loadChallengeByCode(code, deps);
  if (!row || !row.creator_user_id) return { status: STATUS.UNAVAILABLE };
  const st = challengeStatus(row, now);
  if (st !== STATUS.OPEN) return { status: st };
  if (userId && userId === row.creator_user_id) return { status: "own_challenge" };
  const deviceHash = sha256(deviceSession);

  // An attempt that already exists is resumed, never duplicated.
  const prior = await viewerAttempt(row, { userId, deviceHash }, fetchImpl);
  if (prior) return prior.status === ATTEMPT_STATUS.STARTED ? { status: "resumed", chaosRunId: prior.chaosRunId, attempt: prior } : { status: "already_attempted", attempt: prior };

  if (!can(tier, CAPABILITIES.CHAOS_UNLIMITED)) {
    const used = deps.guestRunsUsed !== undefined ? deps.guestRunsUsed : await guestRunsUsed(deviceSession);
    if (guestLimitReached(used)) return { status: "guest_limit", guestRunsUsed: used, guestRunsAllowed: GUEST_CHAOS_RUNS };
  }
  // The run: the same starting chaos, under the sequence the challenge was minted in.
  let created = deps.createRun ? await deps.createRun() : await createRun({ session: deviceSession, challengeId: row.chaos_manifest_id, now });
  if (!created.ok && created.code === "NOT_FOUND" && !deps.createRun) {
    // The KV manifest has aged out (its TTL is shorter than a challenge can
    // stay reachable through history). Re-mint it from the seed the server
    // kept in challenge_secrets, then create the run the ordinary way.
    if (await remintManifest(row, fetchImpl, now)) created = await createRun({ session: deviceSession, challengeId: row.chaos_manifest_id, now });
  }
  if (!created.ok) return { status: "save_failed", detail: created.code || "run_not_created" };
  const run = created.run;

  const ins = await rest("challenge_attempts", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({
    challenge_id: row.id, user_id: userId, device_session_hash: deviceHash, display_snapshot: displaySnapshot(userId ? displayName : "Guest"),
    chaos_run_id: run.chaosRunId, attempt_number: 1, status: ATTEMPT_STATUS.STARTED, created_at: new Date(now).toISOString(),
  }) }, fetchImpl);
  if (ins.status === 409) return { status: "already_attempted" };      // the unique index decided a race
  if (!ins.ok) return failure(ins, "attempt_insert");
  const attempt = one(ins);
  run.challengeAttemptId = attempt.id; run.challengeCode = row.public_code;
  if (!deps.createRun) await saveRun(run);
  if (!can(tier, CAPABILITIES.CHAOS_UNLIMITED) && !deps.createRun) await consumeGuestRun(deviceSession);
  return { status: "started", chaosRunId: run.chaosRunId, attemptId: attempt.id, chaos: deps.createRun ? null : chaosView(run), creatorName: row.creator_display_snapshot };
};

/** Rebuild the same-seed manifest in the run store from the seed the server kept. */
export const remintManifest = async (row, fetchImpl = fetch, now = Date.now()) => {
  const sec = one(await rest(`challenge_secrets?challenge_id=eq.${q(row.id)}&select=seed_id,pinned_era_style_id`, {}, fetchImpl));
  if (!sec?.seed_id) return false;
  const manifest = buildManifest({ seedId: sec.seed_id, createdAt: now, originRunId: null, sequence: sequenceFromManifest({ chaosSequenceVersion: row.chaos_sequence_version }), eraStyleId: sec.pinned_era_style_id || null });
  if (manifest.challengeId !== row.chaos_manifest_id) return false;       // the seed must reproduce the very id the challenge binds
  await setJSON(`chaos-chal:${manifest.challengeId}`, manifest, 60 * 60 * 24 * 60);
  return true;
};

// ── Complete ─────────────────────────────────────────────────────────────────
/**
 * Bind the recipient's finished run to their attempt and compare. The score is
 * the one the server stored when the run was simulated; the request carries
 * only the run id, and the run must belong to this device session. Closed
 * statuses: completed · already_completed · not_found · not_your_run ·
 * not_simulated · not_configured · save_failed
 */
export const completeChallengeAttempt = async ({ chaosRunId, userId = null, deviceSession, displayName = null, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const run = deps.run !== undefined ? deps.run : await loadRun(chaosRunId);
  if (!run || !run.challengeAttemptId) return { status: "not_found" };
  if (!ownsRun(run, deviceSession)) return { status: "not_your_run" };
  if (run.status !== "SIMULATED" || !run.resultId) return { status: "not_simulated" };
  const record = deps.record !== undefined ? deps.record : await readAuthoritativeResult(run.resultId);
  if (!record || record.session !== deviceSession) return { status: "not_your_run" };

  const attempt = one(await rest(`challenge_attempts?id=eq.${q(run.challengeAttemptId)}&select=id,challenge_id,status,user_id,result_id,challenge_outcome,performance_score,gold_score,blue_score`, {}, fetchImpl));
  if (!attempt) return { status: "not_found" };
  const challenge = one(await rest(`challenges?id=eq.${q(attempt.challenge_id)}&select=${CHALLENGE_COLUMNS},creator_roster,creator_coach,creator_mvp`, {}, fetchImpl));
  if (!challenge) return { status: "not_found" };
  const creator = { gold: challenge.creator_gold_score, blue: challenge.creator_blue_score };
  if (attempt.status === ATTEMPT_STATUS.COMPLETED) {
    return { status: "already_completed", comparison: compareResults(creator, { gold: attempt.gold_score, blue: attempt.blue_score }), challenge: publicChallengeForRecipient(challenge) };
  }
  const score = scoreOf(record);
  const cmp = compareResults(creator, score);
  if (!cmp) return { status: "not_simulated" };
  const savedId = userId ? one(await rest(`saved_clashes?user_id=eq.${q(userId)}&result_id=eq.${q(run.resultId)}&select=id`, {}, fetchImpl))?.id || null : null;
  const upd = await rest(`challenge_attempts?id=eq.${q(attempt.id)}&status=eq.started`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({
    status: ATTEMPT_STATUS.COMPLETED, result_id: String(run.resultId), saved_clash_id: savedId,
    user_id: attempt.user_id || userId || null, display_snapshot: displaySnapshot(userId ? displayName : attempt.user_id ? undefined : "Guest") || undefined,
    outcome: cmp.recipient.outcome, gold_score: score.gold, blue_score: score.blue, performance_score: cmp.recipient.performance,
    challenge_outcome: cmp.outcome, comparison_version: COMPARISON_VERSION, completed_at: new Date(now).toISOString(),
  }) }, fetchImpl);
  if (!upd.ok) return failure(upd, "attempt_update");
  return { status: "completed", comparison: cmp, challenge: publicChallengeForRecipient(challenge) };
};
/** The original result, shown to a recipient who has completed (or the creator). */
const publicChallengeForRecipient = (c) => ({
  code: c.public_code, creatorName: c.creator_display_snapshot, era: c.creator_era_id, eraCustom: !!c.era_custom,
  creatorScore: { gold: c.creator_gold_score, blue: c.creator_blue_score }, creatorOutcome: c.creator_outcome, creatorPerformance: c.creator_performance,
  creatorRoster: c.creator_roster || [], creatorCoach: c.creator_coach || null, creatorMvp: c.creator_mvp || null,
  challengeVersion: c.challenge_version, comparisonVersion: c.comparison_version,
});

// ── Revoke ───────────────────────────────────────────────────────────────────
export const revokeChallenge = async ({ code, userId, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const row = deps.row !== undefined ? deps.row : await loadChallengeByCode(code, deps);
  if (!row || row.creator_user_id !== userId) return { status: STATUS.UNAVAILABLE };   // not yours reads as not there
  if (row.revoked_at) return { status: "already_revoked" };
  const upd = await rest(`challenges?id=eq.${q(row.id)}&creator_user_id=eq.${q(userId)}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ status: STATUS.REVOKED, revoked_at: new Date(now).toISOString() }) }, fetchImpl);
  if (!upd.ok) return failure(upd, "revoke");
  return { status: "revoked", code: row.public_code };
};

// ── My EraClash: created / accepted / responses ──────────────────────────────
export const listChallenges = async ({ userId, now = Date.now() }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const created = (await rest(`challenges?creator_user_id=eq.${q(userId)}&select=${CHALLENGE_COLUMNS}&order=created_at.desc&limit=100`, {}, fetchImpl)).body || [];
  const ids = created.map((c) => c.id);
  const responses = ids.length ? ((await rest(`challenge_attempts?challenge_id=in.(${ids.map(q).join(",")})&select=id,challenge_id,user_id,display_snapshot,status,outcome,gold_score,blue_score,performance_score,challenge_outcome,result_id,created_at,completed_at&order=completed_at.desc`, {}, fetchImpl)).body || []) : [];
  const accepted = (await rest(`challenge_attempts?user_id=eq.${q(userId)}&select=id,challenge_id,status,outcome,gold_score,blue_score,performance_score,challenge_outcome,result_id,created_at,completed_at&order=created_at.desc&limit=100`, {}, fetchImpl)).body || [];
  const acceptedIds = [...new Set(accepted.map((a) => a.challenge_id))];
  const acceptedChallenges = acceptedIds.length ? ((await rest(`challenges?id=in.(${acceptedIds.map(q).join(",")})&select=${CHALLENGE_COLUMNS},creator_roster,creator_coach,creator_mvp`, {}, fetchImpl)).body || []) : [];
  const byId = new Map(acceptedChallenges.map((c) => [c.id, c]));
  return {
    status: "ok",
    created: created.map((c) => ({
      code: c.public_code, status: challengeStatus(c, now), createdAt: c.created_at, expiresAt: c.expires_at, revokedAt: c.revoked_at,
      creatorScore: { gold: c.creator_gold_score, blue: c.creator_blue_score }, creatorOutcome: c.creator_outcome, creatorPerformance: c.creator_performance, era: c.creator_era_id,
      responses: responses.filter((r) => r.challenge_id === c.id).map((r) => ({
        name: r.user_id ? r.display_snapshot : "Guest", status: r.status, outcome: r.outcome, score: r.gold_score == null ? null : { gold: r.gold_score, blue: r.blue_score },
        performance: r.performance_score, challengeOutcome: r.challenge_outcome, completedAt: r.completed_at, startedAt: r.created_at,
      })),
    })),
    accepted: accepted.map((a) => { const c = byId.get(a.challenge_id); return {
      code: c?.public_code || null, creatorName: c ? c.creator_display_snapshot : "Deleted account", status: a.status, challengeStatus: c ? challengeStatus(c, now) : STATUS.UNAVAILABLE,
      creatorScore: c ? { gold: c.creator_gold_score, blue: c.creator_blue_score } : null, creatorOutcome: c?.creator_outcome || null, era: c?.creator_era_id || null,
      yourScore: a.gold_score == null ? null : { gold: a.gold_score, blue: a.blue_score }, yourOutcome: a.outcome, yourPerformance: a.performance_score,
      challengeOutcome: a.challenge_outcome, startedAt: a.created_at, completedAt: a.completed_at, chaosRunId: a.status === ATTEMPT_STATUS.STARTED ? undefined : undefined,
      original: c && a.status === ATTEMPT_STATUS.COMPLETED ? publicChallengeForRecipient(c) : null,
    }; }),
  };
};

/** The private profile's display name, for a snapshot. Falls back to "Coach". */
export const displayNameFor = async (userId, deps = {}) => {
  if (!cloudAccountsReady() || !userId) return null;
  const r = await rest(`profiles?user_id=eq.${q(userId)}&select=display_name`, {}, deps.fetch || fetch);
  return one(r)?.display_name || null;
};

/** Policy in one place: how long a challenge lives. */
export const CHALLENGE_POLICY = Object.freeze({ ttlDays: CHALLENGE_TTL_DAYS, oneOfficialAttemptPerAccount: true, guestsMayPlay: true, creatorMustBeSignedIn: true, sequence: CURRENT_SEQUENCE });
