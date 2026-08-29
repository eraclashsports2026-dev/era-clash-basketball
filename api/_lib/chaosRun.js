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
import { startRun, submitHolds, submitCoachHolds, selectCoach, abandonRun, publicView, RUN_TTL_SECONDS } from "../../src/chaos/runState.js";
import { buildManifest, challengeId } from "../../src/chaos/challenge.js";
import { GUEST_CHAOS_RUNS } from "../../src/entitlements.js";

export const CHAOS_NAMESPACES = Object.freeze(["chaos-run", "chaos-chal", "chaos-guest"]);
const RUN_KEY = (id) => `chaos-run:${id}`;
const CHAL_KEY = (id) => `chaos-chal:${id}`;
const GUEST_KEY = (s) => `chaos-guest:${String(s).slice(0, 32)}`;

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
/** Resolve stored card ids back into canonical cards. Ids are server-written. */
export const hydrate = (arr) =>
  Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr?.[i]) || null]));

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
  let seedId = null, originChallenge = null;
  if (chalId) {
    const manifest = await getJSON(CHAL_KEY(chalId));
    if (!manifest) return { ok: false, code: "NOT_FOUND" };
    seedId = manifest.seedId;
    originChallenge = chalId;
  } else {
    seedId = newId(14);
  }
  const runId = newId(12);
  const run = startRun({ runId, seedId, createdAt: now });
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
  const manifest = buildManifest({ seedId: run.seedId, createdAt: now, originRunId: run.chaosRunId });
  await setJSON(CHAL_KEY(manifest.challengeId), manifest, 60 * 60 * 24 * 60);
  return manifest;
};

export const view = (run, opts = {}) => publicView(run, { hydrate, ...opts });

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
