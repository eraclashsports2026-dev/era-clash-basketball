// ── Prepared possession context ──────────────────────────────────────────────
// The boundary the whole engine rests on.
//
//   Intelligence + matchup preparation  →  WHAT IS POSSIBLE
//   Possession resolution               →  WHAT HAPPENED
//
// This module is the first half. It reads the versioned outputs of Player,
// Team, Coach and Era Style Intelligence and turns them into the small set of
// basketball parameters a possession needs. It does NOT recompute any of those
// systems — if a number here duplicates one of theirs, that is a bug, because
// two derivations of one quantity always drift.
//
// It also does no I/O, makes no network or AI call, and reads no global state.
import { getEra } from "../eraStyles.js";
import { strategicEffects } from "../eraStyleIntelligence.js";
import { buildCoachIntelligence } from "../coachIntelligence.js";
import { buildDefensivePlans } from "../defense/plan.js";
import { NEUTRAL_COACH, getCoach } from "../coaches.js";

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (x, fallback = 0) => (Number.isFinite(Number(x)) ? Number(x) : fallback);

export const SHOT_CATEGORIES = ["RIM", "PAINT_OR_POST", "MIDRANGE", "THREE_POINT"];

export class PossessionInputError extends Error {}

/**
 * Validate the engine input. The core trusts nothing: a client-submitted rating,
 * probability or game plan must never reach a possession, so anything that
 * looks like an authored probability is rejected outright rather than clamped.
 */
export const validatePossessionInput = (input) => {
  const fail = (m) => { throw new PossessionInputError(m); };
  if (!input || typeof input !== "object") fail("input must be an object");
  if (!Number.isFinite(Number(input.simulationSeed))) fail("simulationSeed must be a finite number");
  if (!input.eraStyleId) fail("eraStyleId is required");
  if (!getEra(input.eraStyleId)) fail(`unknown eraStyleId "${input.eraStyleId}"`);

  for (const side of ["gold", "blue"]) {
    const t = input[side];
    if (!t) fail(`${side} team is required`);
    if (!Array.isArray(t.playerCards) || t.playerCards.length !== 5) fail(`${side}.playerCards must be exactly 5 players`);
    if (!Array.isArray(t.playerIntelligence) || t.playerIntelligence.length !== 5) fail(`${side}.playerIntelligence must be 5 profiles`);
    for (const p of t.playerIntelligence) {
      if (!p?.offense || !p?.defense) fail(`${side}: every entry must be a Player Intelligence profile`);
    }
    if (!t.teamIntelligence?.usagePlan) fail(`${side}.teamIntelligence must include a usagePlan`);
    if (t.teamIntelligence.usagePlan.length !== 5) fail(`${side}.usagePlan must cover 5 players`);
    // Authored outcome control is refused, not sanitised. Silently ignoring it
    // would let a caller believe it worked.
    for (const banned of ["winProbability", "forcedWinner", "forcedScore", "shotProbabilities", "makeProbability"]) {
      if (t[banned] != null || input[banned] != null) fail(`${banned} is not an input to the possession engine`);
    }
  }
  return true;
};

// ── Shot profile ─────────────────────────────────────────────────────────────
// Where a player's attempts come from, as weights over the four categories.
// Derived from documented shooting identity plus interior/perimeter capability
// — never from a per-player attempt-rate table, which does not exist for most
// cards. A pre-three-point era zeroes the three-point weight at selection time,
// not here, so outside SKILL is retained structurally even when the SHOT is not
// available (see PART 17).
const shotProfileFor = (p) => {
  const o = p.offense || {};
  const sh = p.shooting || {};
  const rim = num(o.rimThreat, 5);
  const post = num(o.postThreat, 3);
  const perim = { ELITE: 9, STRONG: 7.5, AVERAGE: 5, LIMITED: 3, MINIMAL: 1.5 }[sh.perimeterSkill] ?? 5;
  const vol = { HIGH: 1.6, MEDIUM: 1.15, LOW: 0.7, NONE: 0.15 }[sh.threeVolume] ?? 0.7;

  const weights = {
    RIM: 1.0 + rim * 0.34,
    PAINT_OR_POST: 0.5 + post * 0.42,
    MIDRANGE: 1.4 + perim * 0.18 + (sh.identity === "MIDRANGE_CREATOR" ? 1.6 : 0),
    THREE_POINT: (0.4 + perim * 0.22) * vol,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const profile = {};
  for (const k of SHOT_CATEGORIES) profile[k] = r3(weights[k] / total);
  return profile;
};

// Per-category shooting skill, 0-10. Where a verified FG%/3P% exists it anchors
// the value; otherwise the documented categorical identity does. Confidence is
// recorded separately and NEVER widens the variance (PART 31).
const shootingSkillFor = (p) => {
  const o = p.offense || {};
  const sh = p.shooting || {};
  const perim = { ELITE: 9, STRONG: 7.5, AVERAGE: 5, LIMITED: 3, MINIMAL: 1.5 }[sh.perimeterSkill] ?? 5;
  const measuredFg = Number.isFinite(Number(sh.fgPct)) ? clamp((Number(sh.fgPct) - 0.40) * 40 + 5, 0, 10) : null;
  const measuredThree = Number.isFinite(Number(sh.threePct)) ? clamp((Number(sh.threePct) - 0.30) * 55 + 5, 0, 10) : null;
  const finishing = num(o.rimThreat, 5);
  return {
    RIM: clamp(measuredFg == null ? finishing : finishing * 0.6 + measuredFg * 0.4, 0, 10),
    PAINT_OR_POST: clamp((num(o.postThreat, 3) * 0.6 + finishing * 0.4) || 3, 0, 10),
    MIDRANGE: clamp(perim * 0.55 + num(o.selfCreation, 5) * 0.25 + num(o.shotSelection, 5) * 0.2, 0, 10),
    THREE_POINT: clamp(measuredThree == null ? perim : perim * 0.5 + measuredThree * 0.5, 0, 10),
    // Free throws: a verified FT% anchors it; otherwise a bounded prior from
    // perimeter skill, which correlates with touch. Flagged in confidence.
    FREE_THROW: Number.isFinite(Number(sh.ftPct))
      ? clamp((Number(sh.ftPct) - 0.60) * 28 + 5, 0, 10)
      : clamp(3.6 + perim * 0.42, 0, 10),
    ftMeasured: Number.isFinite(Number(sh.ftPct)),
  };
};

// Bounded free-throw conversion, anchored on the era's documented environment.
export const ftPctFor = (skill, eraFtBaseline) => clamp(eraFtBaseline + (skill - 5) * 0.031, 0.42, 0.93);

// ── Team preparation ─────────────────────────────────────────────────────────
const prepareTeam = (side, team, eff, era) => {
  const cards = team.playerCards;
  const profiles = team.playerIntelligence;
  const ti = team.teamIntelligence;
  // "neutral" is a real, deliberate staff — the Daily's opponent uses it — but
  // it lives outside COACHES, so getCoach cannot find it by id.
  const coachRecord = team.coachRecord ?? (team.coachId === "neutral" ? NEUTRAL_COACH : getCoach(team.coachId));
  const coach = team.coachIntelligence ?? (coachRecord ? buildCoachIntelligence(coachRecord) : null);
  if (!coach) throw new PossessionInputError(`${side}: a resolved coach is required`);

  // Usage comes from Team Intelligence and is renormalised, never reinvented.
  // Rounding in a five-way split does not sum to 1.0 on its own, and a
  // possession allocator that draws from a 0.999 distribution silently biases
  // the last player.
  const rawShares = ti.usagePlan.map((u) => Math.max(0.02, num(u.share, 0.2)));
  const shareTotal = rawShares.reduce((a, b) => a + b, 0);
  const players = profiles.map((p, i) => {
    const u = ti.usagePlan[i];
    return {
      index: i,
      cardId: cards[i]?.id ?? p.id,
      personId: p.personId ?? null,
      name: p.name ?? cards[i]?.name ?? `${side}-${i}`,
      position: ti.positionAssignments?.[i] ?? cards[i]?.pos ?? null,
      usageShare: r3(rawShares[i] / shareTotal),
      creationTier: (ti.creationHierarchy?.order || []).find((o) => o.cardId === (cards[i]?.id ?? p.id))?.tier ?? "TERTIARY",
      offBallValue: num(p.offense?.offBallMovement, 5),
      passing: num(p.offense?.passingVision, 5),
      ballSecurity: num(p.offense?.ballSecurity, 5),
      selfCreation: num(p.offense?.selfCreation, 5),
      rimThreat: num(p.offense?.rimThreat, 5),
      postThreat: num(p.offense?.postThreat, 3),
      // Consistency governs how wide tonight's form can swing. It is a
      // basketball property, not a data-quality property.
      consistency: clamp(4 + num(p.offense?.shotSelection, 5) * 0.35 + num(p.offense?.ballSecurity, 5) * 0.25, 2, 9.5),
      shotProfile: shotProfileFor(p),
      skill: shootingSkillFor(p),
      defense: {
        perimeter: num(p.defense?.perimeterContainment, 5),
        wing: num(p.defense?.wingContainment, 5),
        interior: num(p.defense?.interiorDeterrence, 5),
        rim: num(p.defense?.rimDeterrence, 5),
        events: num(p.defense?.eventCreation, 5),
        rebounding: num(p.defense?.defensiveRebounding, 5),
      },
      profile: p,
      usagePlanEntry: u,
    };
  });

  const off = ti.offense || {};
  const def = ti.defense || {};
  const reb = ti.rebounding || {};

  // Coach tempo and structure, read from Coach Intelligence. These shape HOW
  // OFTEN something is attempted, never how WELL it works — a coach is not a
  // bonus.
  // Coach Intelligence RENAMES the raw coach fields: pickAndRoll not pnr,
  // transitionEmphasis not transition, postUsage not post,
  // defensiveReboundingPriority not defRebPriority. Reading the raw names here
  // silently returned the default 5 for every coach, so coach tendency had no
  // effect on the action mix at all. The fallback chain accepts either shape
  // and only then defaults, so a rename cannot quietly neutralise a coach again.
  const pick = (obj, names, fallback) => {
    for (const n of names) if (Number.isFinite(Number(obj?.[n]))) return Number(obj[n]);
    return fallback;
  };
  const tempo = pick(coach.offense, ["tempo"], 5);
  // Offensive action preferences, from the coach's documented system. These set
  // HOW OFTEN a family is attempted, never how well it works — a coach is not
  // a bonus. Coach Intelligence renames the raw fields, so both shapes are
  // accepted before defaulting.
  const postPref = pick(coach.offense, ["postUsage", "post"], 5);
  const isoPref = pick(coach.offense, ["isolation", "iso"], 5);
  const offBallPref = pick(coach.offense, ["offBallMovement", "offBall"], 5);
  const motionPref = pick(coach.offense, ["motion"], 5);
  const ballMovementPref = pick(coach.offense, ["ballMovement"], 5);
  const insideOutPref = pick(coach.offense, ["insideOut"], 5);
  const transitionPref = pick(coach.offense, ["transitionEmphasis", "transition"], 5);
  const pnrPref = pick(coach.offense, ["pickAndRoll", "pnr"], 5);
  const crashGlass = pick(coach.defense, ["defensiveReboundingPriority", "defRebPriority"], 5);

  return {
    side,
    players,
    coach,
    // Coach Intelligence reports its identity as coachId, not id. The RAW
    // record travels too: the action library resolves a coach itself, and
    // "neutral" lives outside COACHES so an id alone cannot be resolved there.
    // Passing the record avoids a second resolution that can fail differently.
    coachId: coach.coachId ?? team.coachId ?? null,
    coachRecord: coachRecord ?? null,
    teamIntelligence: ti,
    lineupFingerprint: ti.lineupFingerprint ?? null,
    offense: {
      shotCreation: num(off.shotCreation, 5),
      passing: num(off.passing, 5),
      rimPressure: num(off.rimPressure, 5),
      postPlay: num(off.postPlay, 5),
      spacing: num(off.spacing?.floorSpacing, 5),
      nonShooters: num(off.spacing?.nonShooters, 1),
      turnoverProne: 10 - clamp(players.reduce((a, p) => a + p.ballSecurity, 0) / 5, 0, 10),
    },
    defense: {
      pointOfAttack: num(def.pointOfAttack, 5),
      wingContainment: num(def.wingContainment, 5),
      rimProtection: num(def.rimProtection, 5),
      helpDefense: num(def.helpDefense, 5),
      switchability: num(def.switchability, 5),
      defensiveRebounding: num(def.defensiveRebounding, 5),
      playmaking: num(def.defensivePlaymaking, 5),
    },
    rebounding: {
      offensiveGlass: num(reb.offensiveGlass, 5),
      defensiveGlass: num(reb.defensiveGlass, 5),
    },
    // ── The crash-glass / transition-defence trade-off (PART 24) ────────────
    // A team cannot maximise both. The coach's rebounding priority sets where
    // on the axis it starts, and the cost is real: chasing the offensive glass
    // means conceding transition the other way.
    crashGlass: r2(clamp(crashGlass * 0.6 + num(reb.offensiveGlass, 5) * 0.4, 0, 10)),
    tempo, transitionPref, pnrPref, postPref,
    isoPref, offBallPref, motionPref, ballMovementPref, insideOutPref,
    // Handoffs live between motion and inside-out in the documented fields;
    // cuts between motion and ball movement. Named explicitly so a reader can
    // see they are PROXIES rather than dedicated coach fields.
    handoffPref: r2((motionPref * 0.55 + insideOutPref * 0.45)),
    cutPref: r2((motionPref * 0.6 + ballMovementPref * 0.4)),
    confidence: ti.confidence ?? null,
  };
};

// Transition vulnerability is the price of crashing the glass, computed once so
// both directions of the trade-off come from the same number.
export const transitionVulnerability = (team, eff) =>
  r2(clamp(team.crashGlass * 0.42 + eff.transitionFrequency * 0.18 - team.defense.pointOfAttack * 0.12 + 2, 0, 10));

/**
 * Build the prepared context. Pure: same input, same output, no I/O.
 */
export const preparePossessionContext = (input) => {
  validatePossessionInput(input);
  const era = getEra(input.eraStyleId);
  const eff = strategicEffects(era);
  const envir = era.environment || {};

  const gold = prepareTeam("gold", input.gold, eff, era);
  const blue = prepareTeam("blue", input.blue, eff, era);
  gold.transitionVulnerability = transitionVulnerability(gold, eff);
  blue.transitionVulnerability = transitionVulnerability(blue, eff);

  // Expected pace: the era's documented possessions-per-48 moved by both
  // coaches' tempo. Bounded — a coach cannot invent a tempo the era's rules
  // and conditions never produced.
  const basePace = num(envir.pace, 96);
  const tempoPush = ((gold.tempo + blue.tempo) / 2 - 5) * 1.35;
  const expectedPace = r2(clamp(basePace + tempoPush, basePace * 0.86, basePace * 1.14));

  // ── Pregame efficiency baseline (PART 30) ──────────────────────────────────
  // Stored BEFORE the game and never rewritten after seeing the winner.
  //
  // The coefficients are FITTED TO THIS ENGINE'S OWN OUTPUT (80 matchup-era
  // cells, 40 seeds each, mean absolute error ~2.4 points per 100
  // possessions). That is the honest description: it predicts what the engine
  // will do, and it makes no claim about history — historical calibration is
  // Phase 6C's job.
  //
  // Three composite terms, deliberately, with interpretable signs. A fit over
  // the raw features produced a NEGATIVE shot-creation coefficient and a
  // POSITIVE opponent-help-defence coefficient — collinearity artefacts that
  // would have shipped a model claiming better shot creation lowers offensive
  // efficiency. A number that looks like knowledge and says something false is
  // worse than a coarser number that says something true.
  const EXPECTATION_FIT = { intercept: 28.97, offGeneration: 0.81, defResistance: 2.42, leagueShooting: 2.05 };
  const offGeneration = (t) => t.offense.shotCreation * 0.6 + t.offense.spacing * 0.4;
  const defResistance = (t) => t.defense.pointOfAttack * 0.55 + t.defense.rimProtection * 0.3 + t.defense.helpDefense * 0.15;
  const expectedEff = (o, d) => r2(clamp(
    EXPECTATION_FIT.intercept
    + offGeneration(o) * EXPECTATION_FIT.offGeneration
    - defResistance(d) * EXPECTATION_FIT.defResistance
    + num(envir.fgPct, 0.455) * 100 * EXPECTATION_FIT.leagueShooting,
    82, 132,
  ));

  // ── Era anchors ────────────────────────────────────────────────────────────
  // The era's DOCUMENTED shot mix and foul environment, not an invented one.
  // Without this, a roster's own shooting ability sets its three-point volume
  // and a 2010s game produces seven attempts while a 1980s game produces the
  // same seven — which erases exactly the thing Era Style exists to express.
  // The roster still decides its share RELATIVE to the target: a great
  // shooting team in 1985 shoots more threes than a poor one, and both shoot
  // far fewer than anyone in 2020.
  const expectedFgaPerTeam = expectedPace * 0.92;
  const targetThreeShare = clamp(num(envir.tpaPerGame, 0) / expectedFgaPerTeam, 0, 0.62);
  const anchorThreeScale = (team) => {
    if (!era.rules?.threePoint || targetThreeShare <= 0) return 0;
    const natural = team.players.reduce((a, p) => a + p.usageShare * p.shotProfile.THREE_POINT, 0);
    return r3(clamp(targetThreeShare / Math.max(0.02, natural), 0.05, 6));
  };
  gold.threeWeightScale = anchorThreeScale(gold);
  blue.threeWeightScale = anchorThreeScale(blue);

  // Free-throw environment, likewise documented. A foul trip is ~2 attempts,
  // so the target trip rate follows from the era's FTA per game.
  const targetFtTripRate = clamp(num(envir.ftaPerGame, 24) / 2 / expectedPace, 0.04, 0.34);

  // ── Defensive plans (Phase 6B1) ────────────────────────────────────────────
  // Built HERE, in the prepared context, because a plan is preparation rather
  // than resolution — and because it must be deterministic. It uses no game
  // randomness at all: the same teams, positions, coaches, era and module
  // versions always produce the same baseline plan. Switches and adjustments
  // happen later, driven by deterministic possession events.
  //
  // Flag-gated: with the defensive engine off, no plan is built and the
  // possession loop falls back to Phase 6A's positional matching unchanged,
  // which is what makes the A/B comparison honest.
  const defenseEnabled = input.defensiveMatchups !== false;
  // Phase 6B2 systems, each independently switchable so the A/B comparisons
  // can isolate them.
  const zoneEnabled = input.zoneResolution !== false;
  const expandedActions = input.expandedActions !== false;
  const offensiveAdjustments = input.offensiveAdjustments !== false;
  const defensivePlans = defenseEnabled ? buildDefensivePlans({ gold, blue, era, eff, zoneEnabled }) : null;

  return {
    simulationId: input.simulationId ?? null,
    simulationSeed: input.simulationSeed | 0,
    mode: input.mode ?? "single",
    eraStyleId: era.id,
    era, eff,
    defensiveMatchupsEnabled: defenseEnabled,
    zoneResolutionEnabled: zoneEnabled,
    expandedActionsEnabled: expandedActions,
    offensiveAdjustmentsEnabled: offensiveAdjustments,
    defensivePlans,
    anchors: {
      expectedFgaPerTeam: r2(expectedFgaPerTeam),
      targetThreeShare: r3(targetThreeShare),
      targetFtTripRate: r3(targetFtTripRate),
      note: "Documented era environment. Anchors FREQUENCY only — never whether a shot goes in.",
    },
    environment: {
      pace: expectedPace,
      leagueFgPct: num(envir.fgPct, 0.455),
      leagueThreePct: num(envir.tpPct, 0.33),
      leagueFtPct: 0.75,
      leagueTovPerGame: num(envir.tovPerGame, 14),
      leagueFtaPerGame: num(envir.ftaPerGame, 24),
      orebPct: num(envir.orebPct, 0.28),
      threePointLegal: Boolean(era.rules?.threePoint),
    },
    gold, blue,
    expectation: {
      expectedPace,
      expectedOffensiveEfficiencyGold: expectedEff(gold, blue),
      expectedOffensiveEfficiencyBlue: expectedEff(blue, gold),
    },
    // Input confidence travels with the context and is reported in the result.
    // It describes how much is KNOWN, never how much the basketball varied.
    confidence: {
      gold: gold.confidence,
      blue: blue.confidence,
      shooting: [...gold.players, ...blue.players].filter((p) => p.skill.ftMeasured).length,
      note: "Confidence describes input certainty. It never widens or narrows game variance.",
    },
  };
};
