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
import {
  generateOffers, explainOffer, cpuCoachChoice, COACH_OFFER_VERSION, OFFER_ROLES,
  rosterMaximizerScore, opponentCounterScore, eraAdapterScore,
} from "./coachOffers.js";
import { COACHES } from "../v3/coaches.js";

const COACHES_BY_ID = new Map(COACHES.map((c) => [c.id, c]));
import { hashString, mulberry32, deriveSeed } from "../v3/seed.js";
import { challengeId } from "./challenge.js";

export const CHAOS_RUN_VERSION = "2.0.0";
export const RUN_TTL_SECONDS = 60 * 60 * 6;

export const PHASES = Object.freeze([
  "ROLL_1_REVEALED", "ROLL_2_REVEALED", "ROLL_3_REVEALED", "ROSTERS_LOCKED",
  "COACH_ROLL_1", "COACH_ROLL_2", "COACH_ROLL_3", "COACH_SELECTION",
  "READY", "SIMULATED", "ABANDONED",
]);

export const TOTAL_COACH_ROLLS = 3;

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

/**
 * ONE roster-summary schema, used by both sides.
 *
 * Every field is always present. A row that had no value used to be dropped by
 * the renderer, so Team Blue could show four rows where Team Gold showed five
 * and the two panels looked like different products. A truthful neutral value
 * is shown instead of removing the row.
 */
const analysis = (roster, opponent) => {
  const full = POSITIONS.every((s) => roster[s]);
  if (!full) return null;
  const tier = constructionTier(roster);
  const strength = bestStrength(roster);
  const risk = biggestRisk(roster);
  const oppFull = opponent && POSITIONS.every((s) => opponent[s]);
  return {
    talentTier: talentTier(roster),
    constructionTier: tier,
    constructionBlurb: CONSTRUCTION_BLURB[tier],
    bestStrength: strength || { label: "No standout strength", detail: "This five is even across the board." },
    biggestRisk: risk || { label: "No critical weakness identified", detail: "Nothing here crosses the threshold that decides games." },
    opponentMatchup: oppFull ? matchupFit(roster, opponent) : "No clear edge",
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
  const expected = run.currentRoll === 1 ? "ROLL_1_REVEALED" : "ROLL_2_REVEALED";
  if (run.currentPhase !== expected) {
    return { ok: false, code: "INVALID_TRANSITION", phase: run.currentPhase };
  }
  // The submitted set must be well formed: real slots, no duplicates, and no
  // slot whose card is missing. A malformed list is refused rather than
  // silently coerced, so a confused client cannot burn a card by accident.
  const raw = Array.isArray(holdSlots) ? holdSlots : null;
  if (!raw) return { ok: false, code: "VALIDATION_FAILURE" };
  if (raw.length > POSITIONS.length) return { ok: false, code: "VALIDATION_FAILURE" };
  if (raw.some((x) => !POSITIONS.includes(x))) return { ok: false, code: "UNKNOWN_SLOT" };
  if (new Set(raw).size !== raw.length) return { ok: false, code: "DUPLICATE_SLOT" };
  const slots = [...new Set(raw)];
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
    // The era is revealed WITH Roll 2 and stays on screen from here on, so the
    // final holds are made with full knowledge of the environment (#23, #24).
    run.revealedEraStyleId = revealEra(run.seedId);
    run.currentPhase = "ROLL_2_REVEALED";
    commitCpuHolds(run, { gold: nextGold, blue: nextBlue });
  } else {
    run._cpuHold = null;
    run.currentPhase = "ROSTERS_LOCKED";
    openCoachDraft(run, { gold: nextGold, blue: nextBlue });
  }
  return { ok: true, run };
};

// ── Coach Draft ──────────────────────────────────────────────────────────────
// The same three-roll shape as the player draft: three offer slots, three
// rolls, hold or release any offer between them, and a burned coach cannot
// return in this run.
const rollCoachOffers = (run, rosters, { goldHeld = [], blueHeld = [] } = {}) => {
  const common = { eraId: run.revealedEraStyleId, seedId: run.seedId, roll: run.coachRoll };
  const gold = generateOffers({
    ...common, roster: rosters.gold, opponentRoster: rosters.blue, side: USER_SIDE,
    held: goldHeld, current: run.coachOffers?.gold || [], burnedCoachIds: run.burnedCoachIds,
  });
  const blue = generateOffers({
    ...common, roster: rosters.blue, opponentRoster: rosters.gold, side: CPU_SIDE,
    held: blueHeld, current: run.coachOffers?.blue || [], burnedCoachIds: run.burnedCoachIds,
  });
  run.coachOffers = { gold, blue };
  run.goldCoachHeld = goldHeld;
  run.blueCoachHeld = blueHeld;
  return { gold, blue };
};

/** Legend's coach holds: keep the offers it would actually want to choose from. */
const commitCpuCoachHolds = (run, rosters) => {
  const offers = run.coachOffers?.blue || [];
  const ranked = [...offers].map((o) => ({
    o, s: coachOfferValue(o, rosters.blue, rosters.gold, run.revealedEraStyleId),
  })).sort((a, b) => b.s - a.s);
  // Hold the best, and the second when it is genuinely close — otherwise keep
  // rerolling for something better. Deterministic in visible state.
  const hold = [];
  if (ranked[0]) hold.push(ranked[0].o.role);
  if (ranked[1] && ranked[1].s > ranked[0].s * 0.94) hold.push(ranked[1].o.role);
  run._cpuCoachHold = hold;
  run.cpuCoachHoldCommit = String(hashString(`${run.chaosRunId}|coachhold|${run.coachRoll}|${[...hold].sort().join(",")}`) >>> 0);
  return hold;
};

const coachOfferValue = (offer, roster, opponentRoster, eraId) => {
  const c = COACHES_BY_ID.get(offer.coachId);
  if (!c) return 0;
  return rosterMaximizerScore(c, roster) * 0.40
    + opponentCounterScore(c, roster, opponentRoster) * 0.30
    + eraAdapterScore(c, roster, eraId) * 0.30;
};

/** Enter the coach draft at Roll 1. */
export const openCoachDraft = (run, rosters) => {
  run.coachRoll = 1;
  run.burnedCoachIds = run.burnedCoachIds || [];
  run.coachOffers = null;
  rollCoachOffers(run, rosters);
  commitCpuCoachHolds(run, rosters);
  run.currentPhase = "COACH_ROLL_1";
  return run;
};

/** Submit the user's coach holds for this roll and advance. */
export const submitCoachHolds = (run, { holdRoles, hydrate }) => {
  if (!["COACH_ROLL_1", "COACH_ROLL_2"].includes(run.currentPhase)) {
    return { ok: false, code: "INVALID_TRANSITION", phase: run.currentPhase };
  }
  const raw = Array.isArray(holdRoles) ? holdRoles : null;
  if (!raw) return { ok: false, code: "VALIDATION_FAILURE" };
  if (raw.some((r) => !OFFER_ROLES.includes(r))) return { ok: false, code: "UNKNOWN_ROLE" };
  if (new Set(raw).size !== raw.length) return { ok: false, code: "DUPLICATE_ROLE" };

  const gold = hydrate(run.goldRoster), blue = hydrate(run.blueRoster);
  const cpuHold = run._cpuCoachHold || [];
  // Burn every offer being rerolled, on both sides.
  const burned = new Set(run.burnedCoachIds || []);
  for (const o of run.coachOffers?.gold || []) if (!raw.includes(o.role)) burned.add(o.coachId);
  for (const o of run.coachOffers?.blue || []) if (!cpuHold.includes(o.role)) burned.add(o.coachId);

  run.coachHistory = run.coachHistory || [];
  run.coachHistory.push({
    roll: run.coachRoll,
    gold: (run.coachOffers?.gold || []).map((o) => ({ role: o.role, coachId: o.coachId })),
    blue: (run.coachOffers?.blue || []).map((o) => ({ role: o.role, coachId: o.coachId })),
    goldHeld: raw, blueHeld: cpuHold,
  });

  run.burnedCoachIds = [...burned];
  run.coachRoll += 1;
  rollCoachOffers(run, { gold, blue }, { goldHeld: raw, blueHeld: cpuHold });
  if (run.coachRoll >= TOTAL_COACH_ROLLS) {
    run.currentPhase = "COACH_SELECTION";
    run._cpuCoachHold = null;
    // The CPU's final coach is committed before the user's choice is revealed.
    const pick = cpuCoachChoice({ offers: run.coachOffers.blue, roster: blue, opponentRoster: gold, eraId: run.revealedEraStyleId });
    run._cpuCoach = pick.coachId;
    run.cpuCoachCommit = String(hashString(`${run.chaosRunId}|coach|${pick.coachId}`) >>> 0);
  } else {
    run.currentPhase = `COACH_ROLL_${run.coachRoll}`;
    commitCpuCoachHolds(run, { gold, blue });
  }
  return { ok: true, run };
};

/** Abandon an active run without minting a new seed. */
export const abandonRun = (run) => {
  if (run.currentPhase === "SIMULATED") return { ok: false, code: "ALREADY_SIMULATED" };
  run.currentPhase = "ABANDONED";
  run.status = "ABANDONED";
  return { ok: true, run };
};

/** The user picks one of the three coaches they were OFFERED — nothing else. */
export const selectCoach = (run, { coachId }) => {
  if (run.currentPhase !== "COACH_SELECTION") {
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
    eraContext: eraContext(run.revealedEraStyleId, gold),
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
    // ── Coach Draft ─────────────────────────────────────────────────────────
    coachDraft: run.coachOffers ? {
      roll: run.coachRoll || 1,
      totalRolls: TOTAL_COACH_ROLLS,
      selecting: run.currentPhase === "COACH_SELECTION",
      heldRoles: run.goldCoachHeld || [],
      burnedCount: (run.burnedCoachIds || []).length,
      offers: run.coachOffers.gold.map((o) => ({
        ...explainOffer({ offer: o, roster: gold, opponentRoster: blue, eraId: run.revealedEraStyleId }),
        held: (run.goldCoachHeld || []).includes(o.role),
      })),
      // The opponent's board is visible; its holds are revealed only after the
      // user has committed their own, exactly as the player draft works.
      opponent: run.coachOffers.blue.map((o) => ({
        role: o.role, name: o.name,
        held: includeCpuHolds ? (run.blueCoachHeld || []).includes(o.role) : false,
      })),
      cpuHoldCommit: run.cpuCoachHoldCommit || null,
    } : null,
    coachOffers: run.coachOffers
      ? run.coachOffers.gold.map((o) => explainOffer({ offer: o, roster: gold, opponentRoster: blue, eraId: run.revealedEraStyleId }))
      : null,
    selectedCoaches: run.currentPhase === "READY" || run.currentPhase === "SIMULATED" ? run.selectedCoaches : null,
    cpuCoachCommit: run.cpuCoachCommit || null,
    rostersLocked: !["ROLL_1_REVEALED", "ROLL_2_REVEALED"].includes(run.currentPhase),
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

/** The full era context, carried on every view once revealed. */
export const eraContext = (eraId, roster) => {
  if (!eraId) return null;
  const facts = eraRevealFacts(eraId);
  return {
    eraId,
    headline: `${eraId} ERA`,
    // Three short facts for the persistent banner; the rest stay expandable.
    highlights: [facts.threePoint, facts.defensiveLegality, facts.physicality],
    pace: facts.pace,
    rebounding: facts.rebounding,
    ruleFacts: facts.ruleFacts,
  };
};

/**
 * An opaque challenge id — never the raw seed. Delegates to challenge.js so
 * there is exactly ONE formula: an earlier version computed its own and
 * produced a different id for the same seed.
 */
export const challengeIdFor = (run) => challengeId(run.seedId);

export { USER_SIDE, CPU_SIDE };
