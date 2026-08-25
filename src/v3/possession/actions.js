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

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

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

/** The nominal primary defender for a shooter, by position then by matchup. */
export const pickDefender = (defense, shooter) => {
  const byPos = defense.players.find((d) => d.position && d.position === shooter.position);
  return byPos ?? defense.players[shooter.index] ?? defense.players[0];
};

// ── GENERIC_HALF_COURT ───────────────────────────────────────────────────────
// A fallback, and labelled as one. It uses real inputs — usage hierarchy, shot
// profile, spacing, rim pressure, the defensive profile, era and game state —
// but it claims no tactical specificity, and its `tacticalSpecificity` field
// says so explicitly so no downstream narrator can dress it up.
const resolveGenericHalfCourt = ({ offense, defense, eff, state, rng }) => {
  const shooter = pickShooter(offense, rng, { state });
  const defender = pickDefender(defense, shooter);

  // Shot quality: what the offence generated, before anyone shoots.
  const creation = shooter.selfCreation * 0.45 + offense.offense.shotCreation * 0.3 + offense.offense.passing * 0.25;
  const pressure = defense.defense.pointOfAttack * 0.35 + defense.defense.helpDefense * 0.3
    + defense.defense.rimProtection * 0.2 + defender.defense.perimeter * 0.15;
  const spacingHelp = (offense.offense.spacing - 5) * 0.22 + (eff.spacingIncentive - 4) * 0.12;

  return {
    actionType: "GENERIC_HALF_COURT",
    actionLabel: "Half-court offence (generic)",
    tacticalSpecificity: "NONE — a fallback action, not a modelled system",
    shooter, defender,
    passerCandidate: pickPasser(offense, shooter, rng),
    assistLikelihood: clamp(0.18 + offense.offense.passing * 0.035 + shooter.offBallValue * 0.012, 0.1, 0.72),
    shotQuality: r2(clamp(4.6 + (creation - pressure) * 0.42 + spacingHelp, 0.5, 9.5)),
    rimBias: r2((offense.offense.rimPressure - 5) * 0.05),
    turnoverRisk: r2(clamp(2.4 + offense.offense.turnoverProne * 0.22 + defense.defense.playmaking * 0.16 + eff.turnoverPressure * 0.1, 0.5, 9)),
    foulPressure: r2(clamp(3.2 + shooter.rimThreat * 0.22 + eff.physicalPerimeterPressure * 0.1, 0.5, 9)),
    blockPressure: r2(clamp(defense.defense.rimProtection * 0.6 + defender.defense.rim * 0.4, 0, 10)),
    transitionAllowed: true,
  };
};

// ── TRANSITION ───────────────────────────────────────────────────────────────
// Created by a live-ball turnover, a defensive rebound, or pace — never
// spontaneously, and never worth automatic points. It can also be pulled out
// into half-court, which is what usually happens when the defence gets back.
const resolveTransition = ({ offense, defense, eff, state, rng }) => {
  const shooter = pickShooter(offense, rng, { state, preferCreator: 0.15 });
  const defender = pickDefender(defense, shooter);
  const advantage = clamp(
    offense.transitionPref * 0.3 + eff.transitionFrequency * 0.22 + defense.transitionVulnerability * 0.32
    - defense.defense.pointOfAttack * 0.14, 0, 10,
  );

  // The defence recovers often enough that transition is not free points.
  if (rng.chance(clamp(0.42 - advantage * 0.028, 0.14, 0.5))) {
    const pulled = resolveGenericHalfCourt({ offense, defense, eff, state, rng });
    return { ...pulled, actionType: "TRANSITION", actionLabel: "Transition, pulled out into half-court", pulledOut: true };
  }

  return {
    actionType: "TRANSITION",
    actionLabel: "Transition",
    tacticalSpecificity: "EARLY_OFFENCE",
    shooter, defender,
    passerCandidate: pickPasser(offense, shooter, rng),
    assistLikelihood: clamp(0.34 + offense.offense.passing * 0.03, 0.2, 0.78),
    // Early offence generates better looks; it does not generate certainties.
    shotQuality: r2(clamp(5.8 + advantage * 0.28 - defense.defense.rimProtection * 0.1, 1, 9.7)),
    rimBias: 0.34,
    turnoverRisk: r2(clamp(3.1 + offense.offense.turnoverProne * 0.2 + eff.turnoverPressure * 0.12, 0.5, 9)),
    foulPressure: r2(clamp(4.4 + shooter.rimThreat * 0.2, 0.5, 9.5)),
    blockPressure: r2(clamp(defense.defense.rimProtection * 0.45, 0, 10)),
    pulledOut: false,
    transitionAllowed: false,
  };
};

// ── PICK_AND_ROLL ────────────────────────────────────────────────────────────
// Consumes the versioned action library and translates its CONSEQUENCES into
// possession-event terms. There is no "+5 for PnR" anywhere: the coverage the
// defence plays decides which consequence dominates, and the same action
// produces a different possession against a drop than against a blitz.
const resolvePickAndRoll = ({ offense, defense, eff, state, rng, eraStyleId }) => {
  const handler = rng.weighted(offense.players, (p) => p.usageShare * (p.creationTier === "PRIMARY" ? 2.4 : p.creationTier === "SECONDARY" ? 1.3 : 0.5) * (0.4 + p.selfCreation * 0.09));
  const screener = rng.weighted(
    offense.players.filter((p) => p.index !== handler.index),
    (p) => 0.3 + p.postThreat * 0.35 + p.rimThreat * 0.35,
  );
  const handlerDefender = pickDefender(defense, handler);
  const screenerDefender = defense.players.find((d) => d.index !== handlerDefender.index) ?? defense.players[0];

  const ev = evaluatePickAndRoll({
    handler: handler.profile, screener: screener.profile,
    handlerDefender: handlerDefender.profile, screenerDefender: screenerDefender.profile,
    spacing: offense.teamIntelligence.offense?.spacing,
    offenseCoach: offense.coachRecord ?? offense.coachId, defenseCoach: defense.coachRecord ?? defense.coachId,
    eraStyleId,
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

  return {
    actionType: "PICK_AND_ROLL",
    actionLabel: ev.actionLabel,
    tacticalSpecificity: "MODELLED",
    pnrVariant: ev.actionType,
    pnrCoverage: ev.coverageType,
    pnrRoute: route.key,
    shooter,
    defender: pickDefender(defense, shooter),
    passerCandidate: route.passer ?? pickPasser(offense, shooter, rng),
    // A pass that created the shot is an assist opportunity; the handler
    // shooting off his own dribble is not.
    assistLikelihood: route.passer ? clamp(0.52 + handler.passing * 0.035, 0.3, 0.86) : 0.06,
    shotQuality: r2(clamp(2.4 + route.quality * 0.62 - containment * 0.16 + (eff.perimeterShotValue - 3) * 0.05, 0.5, 9.6)),
    rimBias: r2(route.rimBias),
    turnoverRisk: r2(clamp(o.turnoverRisk * 0.72 + d.helpCommitment * 0.2 + eff.turnoverPressure * 0.08, 0.5, 9)),
    foulPressure: r2(clamp(o.foulPressure * 0.78, 0.5, 9.5)),
    blockPressure: r2(clamp(d.rimProtection * 0.62, 0, 10)),
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
