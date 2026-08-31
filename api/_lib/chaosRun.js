// ── Chaos run persistence and server-authoritative glue ──────────────────────
// Chaos actions ride /api/game rather than a route of their own: the deployment
// is at its 13-function budget (12 API routes + middleware), so a new endpoint
// would fail the build. Every chaos action is a POST to /api/game carrying
// `chaosAction`.
//
// Namespaces are new (`chaos-run:`, `chaos-chal:`, `chaos-guest:`), so no
// existing production namespace is touched by this feature.
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { getJSON, setJSON, newId, cmd } from "./store.js";
import {
  startRun, submitHolds, submitCoachHolds, submitRollDecisions, chooseEra, selectCoach,
  abandonRun, publicView, sequenceOf, CURRENT_SEQUENCE, RUN_TTL_SECONDS,
} from "../../src/chaos/runState.js";
import { buildManifest, challengeId } from "../../src/chaos/challenge.js";
import { GUEST_CHAOS_RUNS } from "../../src/entitlements.js";
import { CHAOS_ERA_IDS } from "../../src/chaos/eraTranslation.js";

export const CHAOS_NAMESPACES = Object.freeze(["chaos-run", "chaos-chal", "chaos-guest"]);
const RUN_KEY = (id) => `chaos-run:${id}`;
const CHAL_KEY = (id) => `chaos-chal:${id}`;
const GUEST_KEY = (s) => `chaos-guest:${String(s).slice(0, 32)}`;

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
/** Resolve stored card ids back into canonical cards. Ids are server-written. */
export const hydrate = (arr) =>
  Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr?.[i]) || null]));

/** Major version of the sequence a challenge was minted under. */
export const sequenceFromManifest = (m) =>
  (parseInt(String(m?.chaosSequenceVersion || "1"), 10) === 2 ? 2 : 1);

export const validRunId = (v) => (/^[a-z0-9]{8,20}$/.test(String(v || "")) ? String(v) : null);
export const validChaosChallengeId = (v) => (/^[a-z0-9]{4,14}$/.test(String(v || "")) ? String(v) : null);

export const loadRun = async (runId) => getJSON(RUN_KEY(runId));
export const saveRun = (run) => setJSON(RUN_KEY(run.chaosRunId), run, RUN_TTL_SECONDS);

/** A run belongs to the session that created it. Draft state cannot cross users. */
export const ownsRun = (run, session) => !!run && run.session === session;

export const guestRunsUsed = async (session) => {
  const n = await cmd("GET", GUEST_KEY(session));
  return Number(n || 0);
};
export const consumeGuestRun = async (session) => {
  const n = await cmd("INCR", GUEST_KEY(session));
  if (Number(n) === 1) await cmd("EXPIRE", GUEST_KEY(session), 60 * 60 * 24 * 30);
  return Number(n || 0);
};
export const guestLimitReached = (used) => used >= GUEST_CHAOS_RUNS;

/**
 * Start a run. A challenge id reproduces the SAME starting chaos by reusing the
 * stored seed; different decisions still branch deterministically from there.
 */
export const createRun = async ({ session, challengeId: chalId, now = Date.now() }) => {
  let seedId = null, originChallenge = null, manifest = null;
  if (chalId) {
    manifest = await getJSON(CHAL_KEY(chalId));
    if (!manifest) return { ok: false, code: "NOT_FOUND" };
    seedId = manifest.seedId;
    originChallenge = chalId;
  } else {
    seedId = newId(14);
  }
  const runId = newId(12);
  // A challenge is replayed under the sequence it was MINTED under. A link
  // shared before the synchronized draft existed still plays the flow its
  // sender played; nothing is reinterpreted underneath it. Manifests written
  // before this phase carry no sequence, which reads as 1.
  // The manifest stores a semver STRING, so read its major version. Number()
  // on "2.0.0" is NaN, which silently dropped every challenge back to the old
  // flow — caught by the challenge-branching test.
  const sequence = manifest ? sequenceFromManifest(manifest) : CURRENT_SEQUENCE;
  const run = startRun({
    runId, seedId, createdAt: now, sequence,
    // Same-seed means same environment: a custom era travels with the link, and
    // a challenge run can never have its era changed by either player.
    pinnedEraStyleId: manifest?.eraStyleId || null,
    competitiveEraLock: !!chalId,
  });
  run.session = session;
  run.originChallenge = originChallenge;
  await saveRun(run);
  return { ok: true, run };
};

export const applyHolds = async (run, holdSlots) => {
  const r = submitHolds(run, { holdSlots, hydrate });
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

/** One submit for the synchronized sequence: player holds AND coach holds. */
export const applyRollDecisions = async (run, { holdSlots, holdRoles }) => {
  const r = submitRollDecisions(run, { holdSlots, holdRoles, hydrate });
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

/** An entitled user setting the era after the reveal, before the final roll. */
export const applyEraChoice = async (run, eraStyleId) => {
  const r = chooseEra(run, { eraStyleId });
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

export const applyCoachHolds = async (run, holdRoles) => {
  const r = submitCoachHolds(run, { holdRoles, hydrate });
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

export const applyAbandon = async (run) => {
  const r = abandonRun(run);
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

export const applyCoach = async (run, coachId) => {
  const r = selectCoach(run, { coachId });
  if (!r.ok) return r;
  await saveRun(run);
  return { ok: true, run };
};

/** Publish a challenge for this run's seed. The link never carries the seed. */
export const publishChallenge = async (run, now = Date.now()) => {
  const manifest = buildManifest({
    seedId: run.seedId, createdAt: now, originRunId: run.chaosRunId,
    sequence: sequenceOf(run),
    // Only a CHOSEN era travels with the link. A rolled era is re-derived from
    // the seed, so the link stays a seed pointer rather than a result.
    eraStyleId: run.eraCustom ? run.revealedEraStyleId : null,
  });
  await setJSON(CHAL_KEY(manifest.challengeId), manifest, 60 * 60 * 24 * 60);
  return manifest;
};

export const view = (run, opts = {}) => publicView(run, { hydrate, ...opts });

/**
 * Whether this run's era may be set, and if not, why. Entitlement is decided by
 * the caller (only the request knows the tier); everything else is a property of
 * the run. Order matters: a competitive lock is reported BEFORE entitlement, so
 * a paying user is never told to pay for something no tier can do.
 */
export const eraChangeState = (run, { entitled = false, gate = null } = {}) => {
  if (sequenceOf(run) !== 2) return { allowed: false, reason: "NOT_SUPPORTED" };
  if (run.competitiveEraLock) {
    return { allowed: false, reason: "COMPETITIVE_LOCK",
      message: "Same-seed challenges keep the era they were dealt, for everyone." };
  }
  if (!entitled) return { allowed: false, reason: "NOT_ENTITLED", gate };
  if (!run.revealedEraStyleId) return { allowed: false, reason: "NOT_REVEALED" };
  if (run.currentPhase !== "ROLL_2_REVEALED") return { allowed: false, reason: "WINDOW_CLOSED" };
  return { allowed: true, reason: null, eras: [...CHAOS_ERA_IDS] };
};

/**
 * The authoritative simulation setup, read from the STORED run. The client
 * cannot substitute player ids, the era, the coaches or the CPU's choices —
 * none of them are read from the request body.
 */
export const simulationSetup = (run) => ({
  goldIds: run.goldRoster,
  blueIds: run.blueRoster,
  coachGoldId: run.selectedCoaches?.gold || "neutral",
  coachBlueId: run.selectedCoaches?.blue || "neutral",
  eraStyleId: run.revealedEraStyleId,
});

/**
 * Non-result-affecting draft history stored alongside the result. This records
 * WHAT WAS REVEALED, never unrevealed alternatives: no unchosen branch and no
 * future card is written, so a stored result cannot leak the draft's future.
 */
export const draftHistory = (run) => ({
  mode: "chaos",
  chaosRunId: run.chaosRunId,
  chaosDraftVersion: run.chaosDraftVersion,
  draftValueVersion: run.draftValueVersion,
  draftProbabilityVersion: run.draftProbabilityVersion,
  legendCpuVersion: run.legendCpuVersion,
  coachOfferVersion: run.coachOfferVersion,
  // The seed id is NOT stored on the public result; the challenge id is the
  // only shareable handle and it is a one-way hash.
  challengeId: challengeId(run.seedId),
  rolls: (run.history || []).map((h) => ({
    roll: h.roll,
    goldRoster: h.goldRoster, blueRoster: h.blueRoster,
    goldHeld: h.goldHeld, blueHeld: h.blueHeld,
    goldPressure: h.goldPressure,
    goldTalentTier: h.goldTalentTier, goldConstructionTier: h.goldConstructionTier,
    blueTalentTier: h.blueTalentTier, blueConstructionTier: h.blueConstructionTier,
  })),
  finalGold: run.goldRoster, finalBlue: run.blueRoster,
  burnedPersonIds: run.burnedPersonIds,
  revealedEraStyleId: run.revealedEraStyleId,
  coachOffers: run.coachOffers,
  coachRolls: (run.coachHistory || []).map((h) => ({
    roll: h.roll, gold: h.gold, blue: h.blue, goldHeld: h.goldHeld, blueHeld: h.blueHeld,
  })),
  burnedCoachIds: run.burnedCoachIds || [],
  selectedCoaches: run.selectedCoaches,
  cpuDecisionCommit: run.cpuDecisionCommit,
  cpuCoachCommit: run.cpuCoachCommit || null,
});
