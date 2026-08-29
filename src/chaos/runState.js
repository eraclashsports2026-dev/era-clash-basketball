// ── Chaos run state machine ──────────────────────────────────────────────────
// Server-authoritative. The client submits DECISIONS (which slots to hold, which
// of three offered coaches to take) and nothing else: never a player id, never
// the era, never the CPU's holds, never a seed. Every transition is validated
// against the stored phase, and an invalid transition refuses WITHOUT mutating
// the run.
//
// publicView() is the only thing the client ever sees. Unrevealed future cards
// do not exist in the run object at all — they are drawn at the moment their
// roll is revealed — so there is nothing for a client to peek at even if the
// view leaked.
import { POSITIONS } from "../players.js";
import { drawFive, fingerprintIds, CHAOS_DRAFT_VERSION, DRAFT_PROBABILITY_VERSION, draftPressureLabel, heldTierCensus, DRAFT_PRESSURE_TOOLTIP } from "./draftOdds.js";
import { DRAFT_VALUE_VERSION, tierOf } from "./draftValue.js";
import { talentTier, constructionTier, constructionScore, talentScore, bestStrength, biggestRisk, matchupFit, CONSTRUCTION_BLURB } from "./construction.js";
import { CHAOS_ERA_IDS, eraRevealFacts, eraImplications, playerEraSwing, ERA_TRANSLATION_VERSION } from "./eraTranslation.js";
import { cpuHoldDecision, cpuHoldCommitment, LEGEND_CPU_VERSION } from "./legendCpu.js";
import { generateOffers, explainOffer, cpuCoachChoice, COACH_OFFER_VERSION } from "./coachOffers.js";
import { hashString, mulberry32, deriveSeed } from "../v3/seed.js";
import { challengeId } from "./challenge.js";

export const CHAOS_RUN_VERSION = "1.0.0";
export const RUN_TTL_SECONDS = 60 * 60 * 6;

export const PHASES = Object.freeze([
  "ROLL_1_REVEALED", "ROLL_1_HOLDS_LOCKED", "ROLL_2_REVEALED", "ERA_REVEALED",
  "FINAL_HOLDS_LOCKED", "ROLL_3_REVEALED", "ROSTERS_LOCKED",
  "COACH_OFFERS_REVEALED", "COACHES_LOCKED", "READY", "SIMULATED",
]);

export const DRAFT_VERSIONS = Object.freeze({
  chaosDraftVersion: CHAOS_DRAFT_VERSION,
  draftValueVersion: DRAFT_VALUE_VERSION,
  draftProbabilityVersion: DRAFT_PROBABILITY_VERSION,
  legendCpuVersion: LEGEND_CPU_VERSION,
  coachOfferVersion: COACH_OFFER_VERSION,
  eraTranslationVersion: ERA_TRANSLATION_VERSION,
  chaosRunVersion: CHAOS_RUN_VERSION,
});

const USER_SIDE = "gold";
const CPU_SIDE = "blue";
const ids = (roster) => POSITIONS.map((s) => roster[s]?.id || null);
const names = (roster) => POSITIONS.map((s) => roster[s]?.name).filter(Boolean);

/** Era is generated from the server seed alone — never personalised. */
export const revealEra = (seedId) => {
  const rng = mulberry32(deriveSeed(hashString(`era|${seedId}|${CHAOS_RUN_VERSION}`), 0));
  return CHAOS_ERA_IDS[Math.floor(rng() * CHAOS_ERA_IDS.length)];
};

const analysis = (roster, opponent) => {
  const full = POSITIONS.every((s) => roster[s]);
  if (!full) return null;
  return {
    talentTier: talentTier(roster),
    constructionTier: constructionTier(roster),
    constructionBlurb: CONSTRUCTION_BLURB[constructionTier(roster)],
    bestStrength: bestStrength(roster),
    biggestRisk: biggestRisk(roster),
    opponentMatchup: opponent && POSITIONS.every((s) => opponent[s]) ? matchupFit(roster, opponent) : null,
  };
};

/** Start a new run. Draws Roll 1 for BOTH sides and commits the CPU's holds. */
export const startRun = ({ runId, seedId, createdAt }) => {
  const gold = drawFive({ seedId, side: USER_SIDE, roll: 1 });
  const blue = drawFive({ seedId, side: CPU_SIDE, roll: 1, opponentNames: names(gold) });
  const run = {
    chaosRunId: runId,
    ...DRAFT_VERSIONS,
    seedId,
    currentRoll: 1,
    currentPhase: "ROLL_1_REVEALED",
    revealedEraStyleId: null,
    goldRoster: ids(gold), blueRoster: ids(blue),
    goldHeldSlots: [], blueHeldSlots: [],
    revealedPersonIds: [...ids(gold), ...ids(blue)].filter(Boolean),
    burnedPersonIds: [],
    cpuDecisionCommit: null,
    coachOffers: null, selectedCoaches: {},
    history: [],
    createdAt, expiresAt: createdAt + RUN_TTL_SECONDS * 1000,
    status: "ACTIVE",
  };
  commitCpuHolds(run, { gold, blue });
  return run;
};

/**
 * Compute and COMMIT the CPU's hold decision from currently visible state.
 * Committed BEFORE the user's holds are accepted, so the CPU cannot change its
 * mind after seeing what the user kept (locked decision #13).
 */
export const commitCpuHolds = (run, rosters) => {
  const decision = cpuHoldDecision({
    side: CPU_SIDE,
    roll: run.currentRoll,
    roster: rosters.blue,
    held: {},
    opponentRoster: rosters.gold,
    burnedIds: run.burnedPersonIds,
    revealedEraId: run.revealedEraStyleId,
  });
  run._cpuHold = decision.hold;              // server-only
  run.cpuDecisionCommit = cpuHoldCommitment(decision, `${run.chaosRunId}|${run.currentRoll}`);
  return decision;
};

const heldMap = (roster, slots) => {
  const out = {};
  for (const s of slots) if (roster[s]) out[s] = roster[s];
  return out;
};

/**
 * Submit the user's holds for the current roll and advance.
 * `hydrate` resolves stored ids back into cards (injected so this module stays
 * pure and testable).
 */
export const submitHolds = (run, { holdSlots, hydrate }) => {
  const expected = run.currentRoll === 1 ? "ROLL_1_REVEALED" : "ERA_REVEALED";
  if (run.currentPhase !== expected) {
    return { ok: false, code: "INVALID_TRANSITION", phase: run.currentPhase };
  }
  const slots = [...new Set((holdSlots || []).filter((s) => POSITIONS.includes(s)))];
  const gold = hydrate(run.goldRoster), blue = hydrate(run.blueRoster);
  const cpuHold = run._cpuHold || [];

  // Burn every card that is being rerolled, on BOTH sides. Burned people never
  // return for the rest of the run (locked decision #14).
  const burned = new Set(run.burnedPersonIds);
  for (const s of POSITIONS) {
    if (!slots.includes(s) && gold[s]) burned.add(gold[s].id);
    if (!cpuHold.includes(s) && blue[s]) burned.add(blue[s].id);
  }
  run.burnedPersonIds = [...burned];

  const goldHeld = heldMap(gold, slots), blueHeld = heldMap(blue, cpuHold);
  const nextRoll = run.currentRoll + 1;

  run.history.push({
    roll: run.currentRoll,
    goldRoster: [...run.goldRoster], blueRoster: [...run.blueRoster],
    goldHeld: slots, blueHeld: cpuHold,
    goldPressure: draftPressureLabel(heldTierCensus(Object.values(goldHeld))),
    goldTalentTier: talentTier(gold), goldConstructionTier: constructionTier(gold),
    blueTalentTier: talentTier(blue), blueConstructionTier: constructionTier(blue),
  });

  const nextGold = drawFive({
    seedId: run.seedId, side: USER_SIDE, roll: nextRoll, held: goldHeld,
    burnedIds: run.burnedPersonIds, opponentNames: Object.values(blueHeld).map((c) => c.name),
  });
  const nextBlue = drawFive({
    seedId: run.seedId, side: CPU_SIDE, roll: nextRoll, held: blueHeld,
    burnedIds: run.burnedPersonIds, opponentNames: names(nextGold),
  });

  run.goldRoster = ids(nextGold); run.blueRoster = ids(nextBlue);
  run.goldHeldSlots = slots; run.blueHeldSlots = cpuHold;
  run.currentRoll = nextRoll;
  run.revealedPersonIds = [...new Set([...run.revealedPersonIds, ...ids(nextGold), ...ids(nextBlue)])].filter(Boolean);

  if (nextRoll === 2) {
    // Era is revealed AFTER Roll 2 is displayed and BEFORE the final holds are
    // submitted, so the last roll is a real adaptation decision (#23, #24).
    run.revealedEraStyleId = revealEra(run.seedId);
    run.currentPhase = "ERA_REVEALED";
    commitCpuHolds(run, { gold: nextGold, blue: nextBlue });
  } else {
    run.currentPhase = "ROSTERS_LOCKED";
    run._cpuHold = null;
    const offersGold = generateOffers({ roster: nextGold, opponentRoster: nextBlue, eraId: run.revealedEraStyleId, seedId: run.seedId, side: USER_SIDE });
    const offersBlue = generateOffers({ roster: nextBlue, opponentRoster: nextGold, eraId: run.revealedEraStyleId, seedId: run.seedId, side: CPU_SIDE });
    run.coachOffers = { gold: offersGold, blue: offersBlue };
    // The CPU's coach is committed before the user's choice is revealed (#11).
    const cpuPick = cpuCoachChoice({ offers: offersBlue, roster: nextBlue, opponentRoster: nextGold, eraId: run.revealedEraStyleId });
    run._cpuCoach = cpuPick.coachId;
    run.cpuCoachCommit = String(hashString(`${run.chaosRunId}|coach|${cpuPick.coachId}`) >>> 0);
    run.currentPhase = "COACH_OFFERS_REVEALED";
  }
  return { ok: true, run };
};

/** The user picks one of the three coaches they were OFFERED — nothing else. */
export const selectCoach = (run, { coachId }) => {
  if (run.currentPhase !== "COACH_OFFERS_REVEALED") {
    return { ok: false, code: "INVALID_TRANSITION", phase: run.currentPhase };
  }
  const offered = (run.coachOffers?.gold || []).map((o) => o.coachId);
  if (!offered.includes(coachId)) return { ok: false, code: "COACH_NOT_OFFERED" };
  run.selectedCoaches = { gold: coachId, blue: run._cpuCoach };
  run.currentPhase = "READY";
  return { ok: true, run };
};

/**
 * The client-visible view. Server-only fields (the CPU's uncommitted hold, its
 * coach before reveal, the raw seed) are stripped.
 */
export const publicView = (run, { hydrate, includeCpuHolds = false } = {}) => {
  const gold = hydrate(run.goldRoster), blue = hydrate(run.blueRoster);
  const goldFull = POSITIONS.every((s) => gold[s]);
  const heldCards = run.goldHeldSlots.map((s) => gold[s]).filter(Boolean);
  const view = {
    chaosRunId: run.chaosRunId,
    phase: run.currentPhase,
    roll: run.currentRoll,
    totalRolls: 3,
    status: run.status,
    versions: DRAFT_VERSIONS,
    gold: {
      roster: POSITIONS.map((s, i) => cardView(gold[s], s, run.goldHeldSlots.includes(s))),
      heldSlots: run.goldHeldSlots,
      analysis: analysis(gold, blue),
    },
    blue: {
      roster: POSITIONS.map((s) => cardView(blue[s], s, run.blueHeldSlots.includes(s))),
      heldSlots: includeCpuHolds ? run.blueHeldSlots : [],
      analysis: analysis(blue, gold),
    },
    draftPressure: {
      level: draftPressureLabel(heldTierCensus(heldCards)),
      tooltip: DRAFT_PRESSURE_TOOLTIP,
    },
    era: run.revealedEraStyleId
      ? {
          ...eraRevealFacts(run.revealedEraStyleId),
          goldImplications: goldFull ? eraImplications(gold, run.revealedEraStyleId) : [],
          blueImplications: eraImplications(blue, run.revealedEraStyleId),
          goldSwing: goldFull ? playerEraSwing(gold, run.revealedEraStyleId) : null,
        }
      : null,
    cpuDecisionCommit: run.cpuDecisionCommit,
    burnedCount: run.burnedPersonIds.length,
    coachOffers: run.coachOffers
      ? run.coachOffers.gold.map((o) => explainOffer({ offer: o, roster: gold, opponentRoster: blue, eraId: run.revealedEraStyleId }))
      : null,
    selectedCoaches: run.currentPhase === "READY" || run.currentPhase === "SIMULATED" ? run.selectedCoaches : null,
    cpuCoachCommit: run.cpuCoachCommit || null,
    expiresAt: run.expiresAt,
  };
  return view;
};

const cardView = (card, slot, held) =>
  card ? {
    id: card.id, name: card.name, decade: card.decade, slot,
    pos: card.pos, positions: card.positions, team: card.team,
    tier: tierOf(card, slot), held: !!held,
  } : null;

/**
 * An opaque challenge id — never the raw seed. Delegates to challenge.js so
 * there is exactly ONE formula: an earlier version computed its own and
 * produced a different id for the same seed.
 */
export const challengeIdFor = (run) => challengeId(run.seedId);

export { USER_SIDE, CPU_SIDE };
