// ── Action interface ─────────────────────────────────────────────────────────
// Three actions in Phase 6A, honestly labelled:
//
//   PICK_AND_ROLL      — the real, versioned action library (src/v3/actions/)
//   GENERIC_HALF_COURT — an explicit temporary fallback, NOT a motion offence
//   TRANSITION         — early offence created by a live-ball turnover, a
//                        defensive rebound, or pace
//
// Post-ups, isolations, handoffs, off-ball screens and motion are NOT
// implemented. They are not pretended to be either: nothing in this file names
// a system it does not model, and the postgame may not describe a
// GENERIC_HALF_COURT possession as anything more specific than what it is.
//
// The interface is stable so Phase 6B can add action families without touching
// the possession loop:
//   selectAction(context)  →  resolveAction(action, context, rng)  →  applyOutcome(...)
import { evaluatePickAndRoll } from "../actions/pickAndRoll.js";
import { defenderFor, stateFor, canSwitch, applySwitch } from "../defense/liveState.js";
import { selectCoverage } from "../defense/coverage.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

// The defensive engine's coverage vocabulary → the action library's. Kept
// explicit: the library has its own nine coverages and a silent mismatch here
// would mean the plan's choice was quietly ignored.
const COVERAGE_TO_LIBRARY = {
  DROP: "DROP", SWITCH: "SWITCH", HEDGE: "HEDGE", BLITZ: "BLITZ", ICE: "ICE",
  UNDER: "UNDER", OVER: "OVER", LATE_SWITCH: "LATE_SWITCH", HELP_AND_RECOVER: "HEDGE",
};

export const ACTION_TYPES = ["PICK_AND_ROLL", "GENERIC_HALF_COURT", "TRANSITION"];

// A single action family must not dominate merely because it is the only one
// modelled in detail. PnR is capped at a share the coach's own tendency has to
// earn, and the cap is a basketball statement: no NBA offence runs 90% pick-
// and-roll, however good its handler is.
export const PNR_FREQUENCY_CAP = 0.46;
export const PNR_FREQUENCY_FLOOR = 0.06;

/**
 * How often each action is attempted. Frequency only — never effectiveness.
 * Coach tendency, roster construction and era conditions decide the mix; the
 * outcome of the chosen action is resolved separately.
 */
export const actionMix = (offense, defense, eff, { inTransition = false } = {}) => {
  if (inTransition) return { TRANSITION: 1, PICK_AND_ROLL: 0, GENERIC_HALF_COURT: 0 };

  // PnR weight: the coach's stated preference, supported by whether the roster
  // can actually run it (a handler who can create, a screener worth guarding).
  const rosterSupport = clamp((offense.offense.shotCreation * 0.5 + offense.offense.postPlay * 0.2 + offense.offense.spacing * 0.3) / 10, 0.15, 1);
  const pnrRaw = clamp((offense.pnrPref / 10) * 0.62 * rosterSupport + 0.05, PNR_FREQUENCY_FLOOR, PNR_FREQUENCY_CAP);
  return { TRANSITION: 0, PICK_AND_ROLL: r2(pnrRaw), GENERIC_HALF_COURT: r2(1 - pnrRaw) };
};

/** Pick the action for this possession. Deterministic given the rng. */
export const selectAction = ({ offense, defense, eff, state, rng, inTransition }) => {
  const mix = actionMix(offense, defense, eff, { inTransition });
  // Late and trailing, a team hunts a creator rather than running the base
  // offence. Bounded: it shifts the mix, it does not replace it.
  const urgency = state?.lateGameUrgency ?? 0;
  const weights = {
    TRANSITION: mix.TRANSITION,
    PICK_AND_ROLL: mix.PICK_AND_ROLL * (1 + urgency * 0.35),
    GENERIC_HALF_COURT: mix.GENERIC_HALF_COURT * (1 - urgency * 0.15),
  };
  const type = rng.weighted(ACTION_TYPES, (t) => weights[t]);
  return { type, mix };
};

// ── Usage-weighted player selection ──────────────────────────────────────────
// The five players share one ball. Shares come from Team Intelligence and sum
// to 1.0; game state tilts WHO gets it, never how many touches exist.
export const pickShooter = (offense, rng, { state, preferCreator = 0 } = {}) => {
  const urgency = (state?.lateGameUrgency ?? 0) + preferCreator;
  return rng.weighted(offense.players, (p) => {
    const tierBoost = p.creationTier === "PRIMARY" ? 1 + urgency * 0.55
      : p.creationTier === "SECONDARY" ? 1 + urgency * 0.12 : 1 - urgency * 0.25;
    return p.usageShare * Math.max(0.1, tierBoost);
  });
};

/** A plausible passer for an assist: a teammate, weighted by playmaking. */
export const pickPasser = (offense, shooter, rng) => {
  const others = offense.players.filter((p) => p.index !== shooter.index);
  if (!others.length) return null;
  return rng.weighted(others, (p) => 0.4 + p.passing * 0.6 + (p.creationTier === "PRIMARY" ? 1.6 : 0));
};

/**
 * Who is actually guarding this player.
 *
 * With the defensive engine on, this reads the LIVE assignment state, so a
 * cross-match, a temporary switch or a coach reassignment is reflected
 * immediately. With it off, it falls back to Phase 6A's positional lookup
 * unchanged — which is what makes the A/B comparison a real comparison.
 *
 * The old behaviour was: find the defender whose position label matches. Since
 * both teams always field PG/SG/SF/PF/C, that match always succeeded, so the
 * assignment was always strictly positional and no cross-match was expressible.
 */
export const pickDefender = (defense, shooter, defState = null) => {
  if (defState) {
    const id = defenderFor(defState, shooter.cardId);
    const assigned = id ? defense.players.find((d) => d.cardId === id) : null;
    if (assigned) return assigned;
  }
  const byPos = defense.players.find((d) => d.position && d.position === shooter.position);
  return byPos ?? defense.players[shooter.index] ?? defense.players[0];
};

/** The assignment state label for this matchup, for the ledger. */
export const assignmentStateFor = (defState, shooter) => (defState ? stateFor(defState, shooter.cardId) : "BASELINE");

/**
 * How the matchup changes what this possession can produce.
 *
 * Returns MULTIPLIERS and DELTAS on possession conditions — never points, never
 * a score, and never a flat "good assignment = +8". A severe post mismatch
 * raises shot quality and foul pressure against that defender; it does not
 * award a basket.
 */
export const matchupModifiers = ({ defState, plan, shooter, defender, shotCategory = null }) => {
  if (!defState || !plan) return { shotQuality: 0, turnoverRisk: 0, foulPressure: 0, blockPressure: 0, reboundEdge: 0, mismatches: [] };
  const cell = plan.matrix.cells
    .find((row, i) => plan.matrix.defenders[i].playerCardId === defender.cardId)
    ?.find((c) => c.offensivePlayerId === shooter.cardId);
  if (!cell) return { shotQuality: 0, turnoverRisk: 0, foulPressure: 0, blockPressure: 0, reboundEdge: 0, mismatches: [] };

  const d = cell.dimensions;
  const sev = cell.severeCount, maj = cell.majorCount;
  // Only the dimensions that matter for THIS shot, not a blanket rating — and
  // SIGNED, so a matchup the defence wins lowers shot quality just as a
  // mismatch raises it. An asymmetric modifier could only ever help the
  // offence, and measurably did: switching the defensive engine on RAISED
  // scoring by ~7 points a game, which is the opposite of defending.
  const weigh = (pairs) => pairs.reduce((a, [dim, w]) => a + (dim.shortfall - dim.surplus) * w, 0);
  const raw = (dd, cat) => (cat === "THREE_POINT" || cat === "MIDRANGE"
    ? weigh([[dd.pullUpDefense, 0.5], [dd.movementChase, 0.3], [dd.spotUpClosing, 0.2]])
    : cat === "PAINT_OR_POST"
      ? weigh([[dd.postResistance, 0.6], [dd.sizeCompatibility, 0.4]])
      : cat === "RIM"
        ? weigh([[dd.rimAccessPrevention, 0.6], [dd.speedCompatibility, 0.4]])
        : weigh([[dd.creationContainment, 0.4], [dd.pullUpDefense, 0.3], [dd.rimAccessPrevention, 0.3]]));

  // ── Centred on THIS PLAN'S own average ───────────────────────────────────
  // The possession engine's baseline shot quality already accounts for team
  // defence through the team aggregates, so adding an absolute matchup penalty
  // on top double-counts it. Measured: the uncentred modifier averaged +0.55
  // and was positive 72% of the time, because all-time offensive threats
  // exceed even all-time defensive capability on their best dimension — so
  // "defence on" inflated scoring, which is the opposite of defending.
  //
  // Centring makes the modifier what it should be: how much THIS pairing
  // differs from a typical assignment in this plan. Self-normalising, so no
  // tuned constant is involved.
  if (plan._modifierBaseline == null) {
    let sum = 0, n = 0;
    plan.matrix.cells.forEach((row, i) => {
      const defId = plan.matrix.defenders[i].playerCardId;
      const assigned = plan.baselineAssignments.find((a) => a.defenderId === defId);
      if (!assigned) return;
      const c2 = row.find((x) => x.offensivePlayerId === assigned.offensivePlayerId);
      if (!c2) return;
      for (const cat of ["RIM", "PAINT_OR_POST", "MIDRANGE", "THREE_POINT", null]) { sum += raw(c2.dimensions, cat); n++; }
    });
    plan._modifierBaseline = n ? sum / n : 0;
  }
  const relevant = raw(d, shotCategory) - plan._modifierBaseline;

  return {
    // Bounded both ways. A mismatch is an edge, not a licence; good defence is
    // a tax, not an eraser.
    shotQuality: clamp(relevant * 0.42 + (sev - 1) * 0.16 + (maj - 1) * 0.06, -2.2, 2.6),
    turnoverRisk: clamp((d.creationContainment.surplus - d.creationContainment.shortfall) * 0.12, -0.9, 1.1),
    foulPressure: clamp(d.foulRiskExposure.shortfall * 0.34 + (sev > 0 ? 0.3 : 0), 0, 1.8),
    blockPressure: clamp((d.rimAccessPrevention.surplus - d.rimAccessPrevention.shortfall) * 0.18, -1.2, 1.4),
    reboundEdge: clamp((d.reboundingPosition.shortfall - d.reboundingPosition.surplus) * 0.05, -0.35, 0.5),
    mismatches: cell.mismatches,
    worstMismatch: cell.mismatches.length
      ? [...cell.mismatches].sort((a, b) => ({ SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[b.severity] - { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[a.severity]))[0]
      : null,
  };
};

// ── GENERIC_HALF_COURT ───────────────────────────────────────────────────────
// A fallback, and labelled as one. It uses real inputs — usage hierarchy, shot
// profile, spacing, rim pressure, the defensive profile, era and game state —
// but it claims no tactical specificity, and its `tacticalSpecificity` field
// says so explicitly so no downstream narrator can dress it up.
const resolveGenericHalfCourt = ({ offense, defense, eff, state, rng, defState, defPlan }) => {
  const shooter = pickShooter(offense, rng, { state });
  const defender = pickDefender(defense, shooter, defState);
  const mod = matchupModifiers({ defState, plan: defPlan, shooter, defender });

  // Shot quality: what the offence generated, before anyone shoots.
  const creation = shooter.selfCreation * 0.45 + offense.offense.shotCreation * 0.3 + offense.offense.passing * 0.25;
  const pressure = defense.defense.pointOfAttack * 0.35 + defense.defense.helpDefense * 0.3
    + defense.defense.rimProtection * 0.2 + defender.defense.perimeter * 0.15;
  const spacingHelp = (offense.offense.spacing - 5) * 0.22 + (eff.spacingIncentive - 4) * 0.12;

  // Help arrives according to the PLAN's help responsibilities and the scheme,
  // within what the era permits — not as a flat team-help number.
  const helper = defPlan ? (defPlan.help.responsibilities.find((h) => h.role === "NAIL_HELPER" || h.role === "RIM_HELPER") ?? null) : null;
  const helpCommitment = defPlan ? clamp(defPlan.scheme.helpAggression / 10, 0, 1) : 0.5;

  return {
    actionType: "GENERIC_HALF_COURT",
    actionLabel: "Half-court offence (generic)",
    tacticalSpecificity: "NONE — a fallback action, not a modelled system",
    shooter, defender,
    primaryDefenderId: defender.cardId,
    helpDefenderId: helper?.defenderId ?? null,
    assignmentState: assignmentStateFor(defState, shooter),
    mismatchType: mod.worstMismatch?.type ?? null,
    mismatchSeverity: mod.worstMismatch?.severity ?? null,
    schemeId: defPlan ? `${defPlan.scheme.shellType}:${defPlan.scheme.ballScreenCoverage}` : null,
    matchupMod: mod,
    helpCommitment,
    passerCandidate: pickPasser(offense, shooter, rng),
    assistLikelihood: clamp(0.18 + offense.offense.passing * 0.035 + shooter.offBallValue * 0.012, 0.1, 0.72),
    shotQuality: r2(clamp(4.6 + (creation - pressure) * 0.42 + spacingHelp + mod.shotQuality, 0.5, 9.5)),
    rimBias: r2((offense.offense.rimPressure - 5) * 0.05),
    turnoverRisk: r2(clamp(2.4 + offense.offense.turnoverProne * 0.22 + defense.defense.playmaking * 0.16 + eff.turnoverPressure * 0.1 + mod.turnoverRisk, 0.5, 9)),
    foulPressure: r2(clamp(3.2 + shooter.rimThreat * 0.22 + eff.physicalPerimeterPressure * 0.1 + mod.foulPressure, 0.5, 9)),
    blockPressure: r2(clamp(defense.defense.rimProtection * 0.6 + defender.defense.rim * 0.4 + mod.blockPressure, 0, 10)),
    reboundEdge: r2(mod.reboundEdge),
    transitionAllowed: true,
  };
};

// ── TRANSITION ───────────────────────────────────────────────────────────────
// Created by a live-ball turnover, a defensive rebound, or pace — never
// spontaneously, and never worth automatic points. It can also be pulled out
// into half-court, which is what usually happens when the defence gets back.
const resolveTransition = ({ offense, defense, eff, state, rng, defState, defPlan }) => {
  const shooter = pickShooter(offense, rng, { state, preferCreator: 0.15 });
  // ── Transition cross-matching (PART 19) ──────────────────────────────────
  // In transition a defender takes the NEAREST credible threat, which is a
  // legitimate way an unusual matchup appears for a possession or two. It is
  // recorded as CROSS_MATCHED with a recovery target so it can never become an
  // unexplained permanent assignment.
  let defender = pickDefender(defense, shooter, defState);
  let crossMatched = false;
  if (defState && defPlan && rng.chance(clamp(0.16 + (10 - defPlan.scheme.transitionDefensePriority) * 0.03, 0.08, 0.42))) {
    // Weighted by who could CREDIBLY pick this player up in transition. The
    // first version read `a + b + c ? 0.2 : 0.2`, which JavaScript parses as
    // `(a+b+c) ? 0.2 : 0.2` — a constant, making this a uniform random pick
    // rather than a basketball one.
    const nearest = rng.weighted(defense.players, (d) => {
      const perim = d.defense.perimeter ?? 5;
      const interior = d.defense.interior ?? 5;
      // Match the kind of defender to the kind of threat getting out.
      const fit = shooter.rimThreat >= 6.5 ? interior * 0.5 + perim * 0.5 : perim * 0.8 + interior * 0.2;
      return 0.4 + fit * 0.35;
    });
    if (nearest && nearest.cardId !== defender.cardId) {
      const partnerOff = [...defState.currentAssignments.entries()].find(([, dId]) => dId === nearest.cardId)?.[0];
      if (partnerOff) {
        applySwitch(defState, { offA: shooter.cardId, offB: partnerOff, source: "TRANSITION", possessionIndex: state.possessionIndex });
        defender = nearest;
        crossMatched = true;
      }
    }
  }
  const mod = matchupModifiers({ defState, plan: defPlan, shooter, defender });
  const advantage = clamp(
    offense.transitionPref * 0.3 + eff.transitionFrequency * 0.22 + defense.transitionVulnerability * 0.32
    - defense.defense.pointOfAttack * 0.14, 0, 10,
  );

  // The defence recovers often enough that transition is not free points.
  if (rng.chance(clamp(0.42 - advantage * 0.028, 0.14, 0.5))) {
    const pulled = resolveGenericHalfCourt({ offense, defense, eff, state, rng, defState, defPlan });
    return { ...pulled, actionType: "TRANSITION", actionLabel: "Transition, pulled out into half-court", pulledOut: true };
  }

  return {
    actionType: "TRANSITION",
    actionLabel: "Transition",
    tacticalSpecificity: "EARLY_OFFENCE",
    shooter, defender,
    primaryDefenderId: defender.cardId,
    helpDefenderId: null,
    assignmentState: crossMatched ? "CROSS_MATCHED" : assignmentStateFor(defState, shooter),
    forcedSwitch: crossMatched ? "TRANSITION" : null,
    mismatchType: mod.worstMismatch?.type ?? null,
    mismatchSeverity: mod.worstMismatch?.severity ?? null,
    schemeId: defPlan ? `${defPlan.scheme.shellType}:${defPlan.scheme.ballScreenCoverage}` : null,
    matchupMod: mod,
    passerCandidate: pickPasser(offense, shooter, rng),
    assistLikelihood: clamp(0.34 + offense.offense.passing * 0.03, 0.2, 0.78),
    // Early offence generates better looks; it does not generate certainties.
    shotQuality: r2(clamp(5.8 + advantage * 0.28 - defense.defense.rimProtection * 0.1 + mod.shotQuality, 1, 9.7)),
    rimBias: 0.34,
    turnoverRisk: r2(clamp(3.1 + offense.offense.turnoverProne * 0.2 + eff.turnoverPressure * 0.12 + mod.turnoverRisk, 0.5, 9)),
    foulPressure: r2(clamp(4.4 + shooter.rimThreat * 0.2 + mod.foulPressure, 0.5, 9.5)),
    blockPressure: r2(clamp(defense.defense.rimProtection * 0.45 + mod.blockPressure, 0, 10)),
    reboundEdge: r2(mod.reboundEdge),
    pulledOut: false,
    transitionAllowed: false,
  };
};

// ── PICK_AND_ROLL ────────────────────────────────────────────────────────────
// Consumes the versioned action library and translates its CONSEQUENCES into
// possession-event terms. There is no "+5 for PnR" anywhere: the coverage the
// defence plays decides which consequence dominates, and the same action
// produces a different possession against a drop than against a blitz.
const resolvePickAndRoll = ({ offense, defense, eff, state, rng, eraStyleId, defState, defPlan }) => {
  const handler = rng.weighted(offense.players, (p) => p.usageShare * (p.creationTier === "PRIMARY" ? 2.4 : p.creationTier === "SECONDARY" ? 1.3 : 0.5) * (0.4 + p.selfCreation * 0.09));
  const screener = rng.weighted(
    offense.players.filter((p) => p.index !== handler.index),
    (p) => 0.3 + p.postThreat * 0.35 + p.rimThreat * 0.35,
  );
  // ── The actual assigned defenders (PART 16) ──────────────────────────────
  // Phase 6A took the handler defender by position label and the screener
  // defender as "whichever defender comes first in array order" — not a
  // basketball decision. Both now come from the assignment plan.
  const handlerDefender = pickDefender(defense, handler, defState);
  const screenerDefender = pickDefender(defense, screener, defState)
    ?? defense.players.find((d) => d.index !== handlerDefender.index) ?? defense.players[0];

  // ── Coverage, chosen against THESE four players (PART 16) ────────────────
  let coverageChoice = null;
  let switchOutcome = null;
  if (defState && defPlan) {
    const hT = defPlan.threats.find((t) => t.playerCardId === handler.cardId);
    const sT = defPlan.threats.find((t) => t.playerCardId === screener.cardId);
    const hD = defPlan.defenders.find((d) => d.playerCardId === handlerDefender.cardId);
    const sD = defPlan.defenders.find((d) => d.playerCardId === screenerDefender.cardId);
    if (hT && sT && hD && sD) {
      const switchCheck = canSwitch({ defenderA: hD, defenderB: sD, scheme: defPlan.scheme, threatA: hT, threatB: sT });
      coverageChoice = selectCoverage({
        handlerThreat: hT, screenerThreat: sT, handlerDefender: hD, screenerDefender: sD,
        scheme: defPlan.scheme, legality: defPlan.scheme.legality, switchCheck,
      });
      // A SWITCH coverage produces a temporary assignment state — and whatever
      // mismatch the swap creates becomes attackable on a later possession.
      if ((coverageChoice.coverage === "SWITCH" || coverageChoice.coverage === "LATE_SWITCH")
          && switchCheck.viable && rng.chance(switchCheck.frequency)) {
        switchOutcome = applySwitch(defState, {
          offA: handler.cardId, offB: screener.cardId, source: "SCREEN",
          possessionIndex: state.possessionIndex,
          mismatchType: sT.threats.postScoring > hD.capabilities.postDefense ? "POST_MISMATCH" : "SPEED_MISMATCH",
        });
      }
    }
  }

  const ev = evaluatePickAndRoll({
    handler: handler.profile, screener: screener.profile,
    handlerDefender: handlerDefender.profile, screenerDefender: screenerDefender.profile,
    spacing: offense.teamIntelligence.offense?.spacing,
    offenseCoach: offense.coachRecord ?? offense.coachId, defenseCoach: defense.coachRecord ?? defense.coachId,
    eraStyleId,
    // The defensive plan decides the coverage; the action library then resolves
    // its consequences. Without this the library picked its own best coverage
    // and the plan was decoration.
    forceCoverage: coverageChoice ? COVERAGE_TO_LIBRARY[coverageChoice.coverage] ?? null : null,
  });

  const o = ev.offense, d = ev.defense;
  // Which consequence this coverage actually conceded decides who shoots and
  // from where. This is the translation layer: action consequence → event.
  const routes = [
    { key: "HANDLER", player: handler, weight: o.ballHandlerShotQuality * 1.15 + o.rimPressure * 0.5, quality: o.ballHandlerShotQuality, rimBias: 0.1 + o.rimPressure * 0.03, passer: null },
    { key: "ROLL", player: screener, weight: o.rollOpportunity * 1.25, quality: o.rollOpportunity, rimBias: 0.62, passer: handler },
    { key: "POP", player: screener, weight: o.popOpportunity * 1.1, quality: o.popOpportunity, rimBias: -0.35, passer: handler },
    { key: "SHORT_ROLL", player: screener, weight: o.shortRollPlaymaking * 0.9, quality: o.shortRollPlaymaking, rimBias: 0.2, passer: handler },
    { key: "WEAK_SIDE", player: null, weight: o.weakSideOpportunity * 1.2, quality: o.weakSideOpportunity, rimBias: -0.3, passer: handler },
  ];
  const route = rng.weighted(routes, (r) => r.weight);
  const shooter = route.player
    ?? rng.weighted(offense.players.filter((p) => p.index !== handler.index && p.index !== screener.index), (p) => 0.4 + p.usageShare * 4);

  const containment = d.containment * 0.45 + d.rimProtection * 0.3 + d.recoveryDifficulty * -0.15;
  const mod = matchupModifiers({ defState, plan: defPlan, shooter, defender: pickDefender(defense, shooter, defState) });

  return {
    actionType: "PICK_AND_ROLL",
    actionLabel: ev.actionLabel,
    tacticalSpecificity: "MODELLED",
    pnrVariant: ev.actionType,
    pnrCoverage: ev.coverageType,
    pnrRoute: route.key,
    shooter,
    defender: pickDefender(defense, shooter, defState),
    primaryDefenderId: pickDefender(defense, shooter, defState).cardId,
    handlerDefenderId: handlerDefender.cardId,
    screenerDefenderId: screenerDefender.cardId,
    helpDefenderId: defPlan ? (defPlan.help.responsibilities.find((h) => h.role === "LOW_MAN" || h.role === "RIM_HELPER")?.defenderId ?? null) : null,
    coverageChoice: coverageChoice ? { coverage: coverageChoice.coverage, score: coverageChoice.score, concedes: coverageChoice.concedes, switchable: coverageChoice.switchCheck.viable } : null,
    assignmentState: switchOutcome ? "TEMPORARY_SWITCH" : assignmentStateFor(defState, shooter),
    forcedSwitch: switchOutcome ? "SCREEN" : null,
    mismatchType: mod.worstMismatch?.type ?? null,
    mismatchSeverity: mod.worstMismatch?.severity ?? null,
    schemeId: defPlan ? `${defPlan.scheme.shellType}:${defPlan.scheme.ballScreenCoverage}` : null,
    matchupMod: mod,
    passerCandidate: route.passer ?? pickPasser(offense, shooter, rng),
    // A pass that created the shot is an assist opportunity; the handler
    // shooting off his own dribble is not.
    assistLikelihood: route.passer ? clamp(0.52 + handler.passing * 0.035, 0.3, 0.86) : 0.06,
    shotQuality: r2(clamp(2.4 + route.quality * 0.62 - containment * 0.16 + (eff.perimeterShotValue - 3) * 0.05 + mod.shotQuality, 0.5, 9.6)),
    rimBias: r2(route.rimBias),
    turnoverRisk: r2(clamp(o.turnoverRisk * 0.72 + d.helpCommitment * 0.2 + eff.turnoverPressure * 0.08 + mod.turnoverRisk, 0.5, 9)),
    foulPressure: r2(clamp(o.foulPressure * 0.78 + mod.foulPressure, 0.5, 9.5)),
    blockPressure: r2(clamp(d.rimProtection * 0.62 + mod.blockPressure, 0, 10)),
    reboundEdge: r2(mod.reboundEdge),
    actionEvaluation: { variant: ev.actionType, coverage: ev.coverageType, offense: o, defense: d },
    transitionAllowed: true,
  };
};

/** Resolve the selected action into a shot context. */
export const resolveAction = (action, ctx, rng) => {
  const args = { ...ctx, rng };
  if (action.type === "TRANSITION") return resolveTransition(args);
  if (action.type === "PICK_AND_ROLL") return resolvePickAndRoll({ ...args, eraStyleId: ctx.eraStyleId });
  return resolveGenericHalfCourt(args);
};
