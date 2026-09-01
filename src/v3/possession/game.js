// ── The possession loop ──────────────────────────────────────────────────────
// The product rule, restated because it is easy to violate by accident:
//
//   The engine does NOT pick a winner, pick a score, and then manufacture a
//   box score to match. It plays possessions. Points are what the shots
//   produced. The winner is whoever had more of them.
//
// Nothing in this file reads the score to decide an outcome. Game state feeds
// PACE, URGENCY and SHOT SELECTION — the things a real late-game situation
// changes — never make/miss.
import { createRng } from "./rng.js";
import { preparePossessionContext } from "./context.js";
import { selectAction, resolveAction } from "./actions.js";
import { createTeamBox, credit, finaliseBox } from "./boxScore.js";
import { ftPctFor } from "./context.js";
import {
  createDefensiveState, recoverAssignments, recordExploitation,
  considerAdjustment, applyAdjustment,
} from "../defense/liveState.js";
import {
  buildOffensivePlan, recordOffensiveOutcome, considerOffensiveAdjustment,
  applyOffensiveAdjustment, refreshMismatchTargets,
} from "../actions/offensivePlan.js";
import { expandedActionMix } from "./actions.js";
import { noteParameterRead, traceEnabled } from "../calibration/runtimeParameters.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export const REGULATION_PERIODS = 4;
export const MAX_OVERTIMES = 6;          // guard, documented in PART 10
export const OT_PERIOD_FRACTION = 5 / 12; // a 5-minute period against 12

// Offensive rebounds continue a possession, so playPossession runs more than
// once per team possession. Measured at ~1.15 calls per possession across eras.
// Per-possession rates that are anchored on a documented per-game figure have
// to be divided by this or they overshoot.
const CALLS_PER_POSSESSION = 1.15;

// ── Bounded fatigue (PART 26) ────────────────────────────────────────────────
// Minimal by design. There are no substitutions, so fatigue must never be
// strong enough to turn a great player into a poor one — it nudges the margins
// of efficiency, ball security and effort. Every bound is stated here.
export const FATIGUE_BOUNDS = {
  maxLoad: 1.0,                 // normalised accumulated load
  shootingPenaltyMax: 0.055,    // ≤5.5% relative shot-quality effect
  turnoverPenaltyMax: 0.09,     // ≤9% relative turnover-risk increase
  defencePenaltyMax: 0.07,      // ≤7% relative defensive-effectiveness effect
  reboundPenaltyMax: 0.06,      // ≤6% relative rebounding-effort effect
  quarterRecovery: 0.22,        // fraction of accumulated load shed at a break
  perPossessionUsage: 0.016,    // load from being the focal player
  perPossessionBase: 0.0045,    // load from simply being on the floor
};

const fatigueFactor = (load, maxPenalty) => 1 - clamp(load, 0, FATIGUE_BOUNDS.maxLoad) * maxPenalty;

// ── Shot resolution ──────────────────────────────────────────────────────────
// expectedShotQuality and realizedMakeOrMiss are deliberately separate
// (PART 18). Quality is what the offence generated; the make is a bounded
// seeded realisation of it. A great look misses, a bad one drops.
const SHOT_POINTS = { RIM: 2, PAINT_OR_POST: 2, MIDRANGE: 2, THREE_POINT: 3 };

const chooseShotCategory = (shooter, shot, env, rng, threeWeightScale = 1, params) => {
  const w = { ...shooter.shotProfile };
  // Rim bias comes from the ACTION (a roll to the rim, a transition attack),
  // not from the shooter's habits alone.
  const bias = shot.rimBias ?? 0;
  const sl = params.get.shotLocation;
  if (traceEnabled()) {
    noteParameterRead("shotLocation.rimBiasMultiplier", sl.rimBiasMultiplier);
    noteParameterRead("shotLocation.perimeterBiasMultiplier", sl.perimeterBiasMultiplier);
  }
  w.RIM *= 1 + Math.max(0, bias) * sl.rimBiasMultiplier;
  // The paint and midrange siblings (0.5, 0.6) are unregistered: they ride the
  // same rim bias but have no registry entry, so they stay as literals rather
  // than borrowing a parameter that does not describe them.
  w.PAINT_OR_POST *= 1 + Math.max(0, bias) * 0.5;
  w.THREE_POINT *= 1 + Math.max(0, -bias) * sl.perimeterBiasMultiplier;
  w.MIDRANGE *= 1 + Math.max(0, -bias) * 0.6;
  // A pre-three-point era removes the SHOT, not the SKILL: the weight goes to
  // the long two the player would actually have taken (PART 17).
  //
  // ORDER MATTERS HERE, and a comment used to say it did not. anchorThreeScale
  // returns 0 whenever the era has no line, so scaling first zeroed the weight
  // and the transfer below then added exactly nothing — the documented
  // behaviour never happened once, in three of eight eras. The perimeter weight
  // was instead renormalised away across the other categories, which is the
  // opposite of "the skill becomes a long two".
  if (!env.threePointLegal) {
    w.MIDRANGE += w.THREE_POINT;
    w.THREE_POINT = 0;
  } else {
    // The era's documented three-point volume scales the ATTEMPT weight.
    w.THREE_POINT *= threeWeightScale;
  }
  return rng.weighted(Object.keys(w), (k) => w[k]);
};

// Baseline conversion by category, anchored on the era's DOCUMENTED league
// shooting environment rather than an invented constant.
const baseMakePct = (category, env, params) => {
  const fg = env.leagueFgPct;
  const cv = params.get.conversion;
  if (traceEnabled()) {
    noteParameterRead("conversion.rimBonus", cv.rimBonus);
    noteParameterRead("conversion.paintBonus", cv.paintBonus);
    noteParameterRead("conversion.midrangePenalty", cv.midrangePenalty);
  }
  switch (category) {
    case "RIM": return clamp(fg + cv.rimBonus, 0.44, 0.75);
    case "PAINT_OR_POST": return clamp(fg + cv.paintBonus, 0.34, 0.60);
    // ADDED, not subtracted. The registry stores this penalty as a negative
    // number (-0.055) and the old code read `fg - 0.055`. Substituting the
    // parameter into the existing minus would double-negate it and turn a
    // 5.5-point penalty into a 5.5-point bonus.
    case "MIDRANGE": return clamp(fg + cv.midrangePenalty, 0.28, 0.52);
    case "THREE_POINT": return clamp(env.leagueThreePct, 0.22, 0.42);
    default: return fg;
  }
};

// How strongly an offence's documented ball-movement identity scales the
// finishing of a pass-created look into a credited assist. Centred on 5 so the
// neutral coach is a fixed point. The ball-movement and motion coefficients are
// the prior engine generation's own values (src/v3/possession.js); the
// isolation term is its mirror, so an iso-first identity reads as less assisted
// rather than merely not-more-assisted.
const ASSIST_IDENTITY = Object.freeze({
  ballMovement: 0.030, motion: 0.020, isolation: 0.014,
  minMultiplier: 0.72, maxMultiplier: 1.30,
});

// How much a coach's help-defence contribution moves an opponent's chance of
// making a shot, per point of scheme differential. The differential is the
// realized help minus what the SAME personnel would realize under a generic
// coach, so a neutral coach contributes exactly zero on any roster and the
// league mean does not move — a flat defensive bonus would move every team.
//
// Historical V5 exposed the gap: helpCommitment is computed for every action
// family and carried on every shot, but it is consumed only for turnoverRisk
// and, in one family, for shot quality. Coach help intent therefore correlated
// with opponent scoring at Spearman +0.29 — the wrong sign — and the whole
// dimension moved opponent points per possession by 0.014 across a ladder
// spanning help 4 to 9. Help defence degrades the quality of the look it
// contests; that is what this term expresses, and only that.
const HELP_SUPPRESSION = Object.freeze({ perPoint: 0.005, rimBonus: 0.002, maxShift: 0.030 });

const makeProbability = ({ category, shooter, shot, env, fatigue, defender, params, helpDifferential = 0 }) => {
  const base = baseMakePct(category, env, params);
  const skill = shooter.skill[category] ?? 5;
  // Quality is centred at 5: a 5 look converts at the era baseline for that
  // shot, a 9 look well above it, a 1 look well below.
  const qualityShift = (shot.shotQuality - 5) * 0.021;
  const skillShift = (skill - 5) * 0.026;
  const contest = ((defender?.defense?.rim ?? 5) * 0.4 + (defender?.defense?.perimeter ?? 5) * 0.6 - 5)
    * (category === "RIM" ? -0.011 : -0.007);
  // Help arrives at the rim before it arrives at the arc, so the interior
  // carries a small additional coefficient.
  const helpShift = clamp(-helpDifferential
    * (HELP_SUPPRESSION.perPoint + (category === "RIM" || category === "PAINT_OR_POST" ? HELP_SUPPRESSION.rimBonus : 0)),
    -HELP_SUPPRESSION.maxShift, HELP_SUPPRESSION.maxShift);
  const p = (base + qualityShift + skillShift + contest + helpShift) * fatigueFactor(fatigue, FATIGUE_BOUNDS.shootingPenaltyMax);
  // Hard bounds: no shot is a certainty and none is hopeless. A great look at
  // the rim can still miss; a contested three can still go in.
  return clamp(p, 0.06, 0.86);
};

// ── One possession ───────────────────────────────────────────────────────────
// Returns how the possession ended so the caller can maintain the ledger and
// decide whether the SAME team retains the ball (offensive rebound) or the
// other team gets it.
const playPossession = ({ ctx, off, def, offBox, defBox, state, rng, ledger, period }) => {
  const inTransition = state.transitionFor === off.side;
  state.transitionFor = null;

  // The DEFENCE's live state and plan — indexed by the defending side.
  const defState = state.defense?.[def.side] ?? null;
  const defPlan = ctx.defensivePlans?.[def.side] ?? null;
  // Expired temporary switches return to the plan before this possession is
  // resolved, so a switch from two possessions ago is not still in force.
  if (defState) recoverAssignments(defState, state.possessionIndex);

  // A zone possession resolves against AREAS, so the zone shell replaces the
  // man assignment as the thing the offence is attacking. USE of the shell is
  // per-possession and continuous in the coach's zone preference: real zone
  // usage is a share of possessions, not a per-game on/off switch.
  const builtShell = ctx.zoneResolutionEnabled ? (defPlan?.zoneShell ?? null) : null;
  const zoneP = builtShell ? Math.min(0.8, Math.pow((defPlan.scheme?.zoneUsage ?? 0) / 10, 1.35) * 0.8) : 0;
  const zoneShell = builtShell && rng.chance(zoneP) ? builtShell : null;
  const offPlan = state.offensePlan?.[off.side] ?? null;
  const { type, mix } = selectAction({
    offense: off, defense: def, eff: ctx.eff, state, rng, inTransition,
    defPlan, zoneShell, expanded: ctx.expandedActionsEnabled,
    // A coach adjustment moves the MAN mix; a zone possession attacks the
    // zone instead, so the override applies only when the defence is in man.
    overrideMix: zoneShell ? null : offPlan?.currentActionMix ?? null,
    params: ctx.parameterSet,
  });
  const shot = resolveAction({ type }, {
    offense: off, defense: def, eff: ctx.eff, state, eraStyleId: ctx.eraStyleId,
    defState, defPlan, zoneShell,
    // The offence's own allocator: its targets and its live ledger. Per side,
    // because saturation is a property of one team's distribution.
    alloc: ctx.allocators?.[off.side] ?? null,
  }, rng);

  const shooter = shot.shooter;
  const record = {
    i: state.possessionIndex, period, offense: off.side,
    action: shot.actionType,
    variant: shot.pnrVariant ?? shot.actionVariant ?? null,
    coverage: shot.pnrCoverage ?? null,
    route: shot.pnrRoute ?? null,
    primary: shooter.cardId, secondary: shot.passerCandidate?.cardId ?? null,
    step: rng.steps(),
    // ── Defensive context (PART 28) ─────────────────────────────────────────
    // Structured reason codes, no prose. Enough for a future Postgame to say
    // who guarded whom, which mismatch was targeted, which coverage was played
    // and which adjustment followed.
    ...(defState ? {
      primaryDefenderId: shot.primaryDefenderId ?? null,
      helpDefenderId: shot.helpDefenderId ?? null,
      coverageType: shot.coverageChoice?.coverage ?? null,
      assignmentState: shot.assignmentState ?? "BASELINE",
      forcedSwitch: shot.forcedSwitch ?? null,
      mismatchType: shot.mismatchType ?? null,
      mismatchSeverity: shot.mismatchSeverity ?? null,
      schemeId: shot.schemeId ?? null,
      // Phase 6B2 additions, all compact reason codes.
      ...(shot.targetedMismatch ? { targetedMismatch: shot.targetedMismatch } : {}),
      ...(shot.secondaryPlayerId ? { secondaryPlayerId: shot.secondaryPlayerId } : {}),
      ...(shot.secondaryDefenderId ? { secondaryDefenderId: shot.secondaryDefenderId } : {}),
      ...(shot.zoneGap ? { zoneGap: shot.zoneGap, shellType: shot.shellType } : {}),
    } : {}),
  };

  // Load accrues for everyone on the floor; more for the focal player.
  for (const p of off.players) state.load[off.side][p.index] += FATIGUE_BOUNDS.perPossessionBase;
  state.load[off.side][shooter.index] += FATIGUE_BOUNDS.perPossessionUsage;
  for (const p of def.players) state.load[def.side][p.index] += FATIGUE_BOUNDS.perPossessionBase * 0.9;

  const shooterFatigue = state.load[off.side][shooter.index];

  // ── 1. Turnover ────────────────────────────────────────────────────────────
  const toP = clamp(
    (0.052 + shot.turnoverRisk * 0.0125) / fatigueFactor(shooterFatigue, FATIGUE_BOUNDS.turnoverPenaltyMax),
    0.02, 0.28,
  );
  if (rng.chance(toP)) {
    const loser = rng.weighted(off.players, (p) => p.usageShare * (11 - p.ballSecurity));
    credit(offBox, loser.index, "to");
    // Forced vs unforced. A steal may only be credited for a forced,
    // live-ball turnover — and not every turnover has one, which is why
    // steals are bounded BELOW opponent turnovers rather than equal to them.
    const forcedP = clamp(0.34 + def.defense.playmaking * 0.035, 0.2, 0.72);
    let stealer = null;
    if (rng.chance(forcedP)) {
      stealer = rng.weighted(def.players, (d) => 0.4 + d.defense.events * 0.7);
      credit(defBox, stealer.index, "stl");
      // A live-ball steal is the classic transition trigger.
      state.transitionFor = def.side;
    }
    record.outcome = stealer ? "TURNOVER_STOLEN" : "TURNOVER_UNFORCED";
    record.turnover = loser.cardId;
    record.steal = stealer?.cardId ?? null;
    ledger.push(record);
    return { ended: true, retain: false };
  }

  // ── 2. Shooting foul ───────────────────────────────────────────────────────
  const category = chooseShotCategory(shooter, shot, ctx.environment, rng, off.threeWeightScale, ctx.parameterSet);
  // Foul rate is anchored on the era's documented free-throw environment; the
  // action and the shot type move it around that anchor.
  //
  // Divided by CALLS_PER_POSSESSION because this roll happens once per call
  // into playPossession, and an offensive rebound makes several calls within
  // ONE team possession. Without it the realised free-throw rate overshot the
  // documented era environment by about a third — measured, not assumed.
  const foulBase = ctx.anchors.targetFtTripRate / CALLS_PER_POSSESSION;
  const foulP = clamp(
    foulBase * (0.55 + shot.foulPressure * 0.055) + (category === "RIM" ? foulBase * 0.35 : 0),
    0.015, 0.30,
  );
  if (rng.chance(foulP)) {
    const fouler = rng.weighted(def.players, (d) => 0.5 + d.defense.interior * 0.3 + d.defense.rim * 0.3);
    credit(defBox, fouler.index, "_pf");
    const shots = category === "THREE_POINT" ? 3 : 2;
    const ftp = ftPctFor(shooter.skill.FREE_THROW, ctx.environment.leagueFtPct);
    let made = 0;
    for (let i = 0; i < shots; i++) {
      credit(offBox, shooter.index, "fta");
      if (rng.chance(ftp)) { credit(offBox, shooter.index, "ftm"); credit(offBox, shooter.index, "pts"); made++; }
    }
    record.outcome = "SHOOTING_FOUL";
    record.freeThrows = { attempted: shots, made };
    record.points = made;
    // A missed final free throw is a live rebound. Modelled simply and
    // honestly: the possession ends unless the offence wins that board.
    if (made < shots && rng.chance(0.24 + off.rebounding.offensiveGlass * 0.012)) {
      const reb = rng.weighted(off.players, (p) => 0.3 + p.postThreat * 0.3 + p.defense.rebounding * 0.5);
      credit(offBox, reb.index, "oreb");
      record.offensiveRebound = reb.cardId;
      ledger.push(record);
      return { ended: false, retain: true };
    }
    ledger.push(record);
    return { ended: true, retain: false };
  }

  // ── 3. The shot ────────────────────────────────────────────────────────────
  credit(offBox, shooter.index, "fga");
  if (category === "THREE_POINT") credit(offBox, shooter.index, "tpa");
  record.shot = category;

  const p = makeProbability({ category, shooter, shot, env: ctx.environment, fatigue: shooterFatigue,
    defender: shot.defender, params: ctx.parameterSet,
    helpDifferential: defPlan?.scheme?.helpDifferential ?? 0 });
  record.expectedMake = r3(p);

  // Evidence for a possible coach adjustment. SHOT QUALITY, not points — a
  // made contested three must not read as a beaten matchup, and a wide-open
  // miss must still count as one.
  if (offPlan) {
    recordOffensiveOutcome(offPlan, {
      family: shot.actionType, shotQuality: shot.shotQuality,
      outcome: null, shotCategory: category, targetedMismatch: shot.targetedMismatch ?? null,
    });
  }
  if (defState && shot.primaryDefenderId) {
    recordExploitation(defState, {
      offensivePlayerId: shooter.cardId, defenderId: shot.primaryDefenderId,
      shotQuality: shot.shotQuality, action: shot.actionType,
      isPost: category === "PAINT_OR_POST", isPnr: shot.actionType === "PICK_AND_ROLL",
    });
  }

  if (rng.chance(p)) {
    credit(offBox, shooter.index, "fgm");
    if (category === "THREE_POINT") credit(offBox, shooter.index, "tpm");
    const pts = SHOT_POINTS[category];
    credit(offBox, shooter.index, "pts", pts);
    // An assist requires a teammate's pass to have created the shot. It is
    // credited HERE, on the made basket, never allocated afterwards.
    //
    // The offence's own ball-movement identity scales how often a pass-created
    // look is actually FINISHED as an assisted basket. Without this the coach
    // identity reached action selection (cutPref) and stopped: Historical V5
    // measured Steve Kerr at ballMovement 10 producing an assisted rate 0.0002
    // BELOW the neutral coach, and the assist-crediting stage correlated with
    // ball movement at Spearman -0.20. The previous engine generation had the
    // lever — src/v3/possession.js computes assistedP from
    // (ballMovement - 5) * 0.03 + (motion - 5) * 0.02 — and the possession
    // rewrite dropped it. The same shape is restored here, as a multiplier so
    // it scales each family's own likelihood rather than replacing it.
    //
    // Centred on 5: a neutral coach is a fixed point, so this differentiates
    // identities without shifting the league mean. A pure multiplier cannot
    // create an assist where no pass created the look, and the AST <= FGM
    // invariant is untouched.
    // Read from the prepared side, which is where context.js puts the coach's
    // documented preferences. An earlier draft read them off state.offensePlan,
    // which only exists when coach adjustments are enabled and carries the
    // ADJUSTED action mix rather than the identity — so the lift silently
    // stayed at 1 and the repair measured as inert.
    const movementLift = clamp(1
      + ((off.ballMovementPref ?? 5) - 5) * ASSIST_IDENTITY.ballMovement
      + ((off.motionPref ?? 5) - 5) * ASSIST_IDENTITY.motion
      - ((off.isoPref ?? 5) - 5) * ASSIST_IDENTITY.isolation,
      ASSIST_IDENTITY.minMultiplier, ASSIST_IDENTITY.maxMultiplier);
    const assistP = clamp(shot.assistLikelihood * movementLift, 0, 0.97);
    if (shot.passerCandidate && shot.passerCandidate.index !== shooter.index && rng.chance(assistP)) {
      credit(offBox, shot.passerCandidate.index, "ast");
      record.assist = shot.passerCandidate.cardId;
    }
    record.outcome = "MADE_FG";
    record.points = pts;
    ledger.push(record);
    return { ended: true, retain: false };
  }

  // ── 4. Miss → block? → rebound ─────────────────────────────────────────────
  // A blocked shot stays a field-goal attempt and a miss. It does not vanish.
  const blockP = clamp(0.012 + shot.blockPressure * 0.0105 + (category === "RIM" ? 0.035 : 0), 0.005, 0.14);
  if (rng.chance(blockP)) {
    const blocker = rng.weighted(def.players, (d) => 0.2 + d.defense.rim * 0.55 + d.defense.interior * 0.35);
    credit(defBox, blocker.index, "blk");
    record.block = blocker.cardId;
  }

  // Offensive rebounding: player ability, lineup size, the era's documented
  // offensive-rebound environment, the coach's crash-glass preference, and the
  // shot category — a long three comes off differently than a rim miss.
  const offGlass = off.rebounding.offensiveGlass * fatigueFactor(state.load[off.side][shooter.index], FATIGUE_BOUNDS.reboundPenaltyMax);
  const defGlass = def.defense.defensiveRebounding * fatigueFactor(
    state.load[def.side].reduce((a, b) => a + b, 0) / 5, FATIGUE_BOUNDS.reboundPenaltyMax,
  );
  const categoryLift = category === "THREE_POINT" ? -0.022 : category === "RIM" ? 0.03 : 0;
  // Defensive assignment affects rebound POSITION, not the rebound itself: a
  // rim protector pulled to the perimeter, a small defender switched onto a
  // centre, or a cross-match after transition all leave the glass worse
  // covered. Fed in as an edge; the resolver still assigns the board.
  const positionPenalty = (shot.reboundEdge ?? 0) + (defState && shot.assignmentState !== "BASELINE" ? 0.012 : 0);
  const orebP = clamp(
    ctx.environment.orebPct + (offGlass - defGlass) * 0.022 + (off.crashGlass - 5) * 0.011
    + (ctx.eff.offensiveReboundValue - 4) * 0.006 + categoryLift + positionPenalty,
    0.08, 0.46,
  );

  if (rng.chance(orebP)) {
    const reb = rng.weighted(off.players, (p2) => 0.25 + p2.postThreat * 0.28 + p2.defense.rebounding * 0.52);
    credit(offBox, reb.index, "oreb");
    record.outcome = "MISS_OREB";
    record.offensiveRebound = reb.cardId;
    ledger.push(record);
    // An offensive rebound CONTINUES the same team possession. It is not a new
    // one, and the possession ledger must not count it as one (PART 11).
    return { ended: false, retain: true };
  }

  const reb = rng.weighted(def.players, (d) => 0.25 + d.defense.rebounding * 0.6 + d.defense.interior * 0.15);
  credit(defBox, reb.index, "dreb");
  record.outcome = "MISS_DREB";
  record.defensiveRebound = reb.cardId;
  // A defensive rebound is the other classic transition trigger, and the
  // rebounding team's willingness to run comes from its coach.
  if (rng.chance(clamp(0.12 + def.transitionPref * 0.028 + ctx.eff.transitionFrequency * 0.012, 0.05, 0.5))) {
    state.transitionFor = def.side;
  }
  ledger.push(record);
  return { ended: true, retain: false };
};

/** Compact per-side offensive summary. */
const summariseOffense = (plan) => ({
  coachId: plan.coachId,
  baselineActionMix: plan.baselineActionMix,
  finalActionMix: plan.currentActionMix,
  paceTarget: plan.paceTarget,
  crashGlassPriority: plan.crashGlassPriority,
  zoneAttackPlan: plan.zoneAttackPlan,
  initiator: plan.creatorHierarchy[0]?.cardId ?? null,
  adjustments: plan.adjustmentHistory.map((a) => ({
    id: a.id, at: a.possessionIndex, trigger: a.trigger,
    response: a.rejected ? "REJECTED" : a.response,
    reason: a.rejected ? a.reason : null, magnitude: a.magnitude ?? null,
  })),
});

/** Compact per-side defensive summary for the result record. */
const summariseDefense = (plan, live) => ({
  schemeId: live.schemeId,
  scheme: {
    shellType: plan.scheme.shellType,
    ballScreenCoverage: plan.scheme.ballScreenCoverage,
    switchingFrequency: plan.scheme.switchingFrequency,
    helpAggression: plan.scheme.helpAggression,
    zoneUsage: plan.scheme.zoneUsage,
    pressureLevel: plan.scheme.pressureLevel,
    constraints: plan.scheme.constraints,
  },
  baseline: plan.baselineAssignments.map((a) => ({
    off: a.offensivePlayerId, def: a.defenderId, crossMatched: a.crossMatched,
    isHide: a.isHide, reason: a.reason.code,
    severe: a.severeCount, major: a.majorCount,
  })),
  help: plan.help.responsibilities.map((h) => ({ role: h.role, def: h.defenderId })),
  changes: live.assignmentChangeHistory.map((c) => ({
    id: c.id, at: c.possessionIndex, trigger: c.trigger,
    response: c.rejected ? "REJECTED" : c.response, reason: c.rejected ? c.reason : null,
    meanQuality: c.meanQuality,
  })),
  counters: {
    switches: live.switchCount,
    scrambles: live.scrambleCount,
    transitionCrossMatches: live.crossMatchCount,
    severeBaselineViolations: plan.optimization.severeBaselineViolations.length,
  },
  exploitation: [...live.exploitation.values()]
    .filter((e) => e.events >= 3)
    .map((e) => ({ off: e.offensivePlayerId, def: e.defenderId, events: e.events, meanQuality: Math.round((e.qualitySum / e.events) * 10) / 10 })),
  confidence: plan.confidence,
});

// ── The game ─────────────────────────────────────────────────────────────────
export const simulatePossessionGame = (input) => {
  const ctx = preparePossessionContext(input);
  const rng = createRng(ctx.simulationSeed);

  const goldBox = createTeamBox(ctx.gold);
  const blueBox = createTeamBox(ctx.blue);
  const ledger = [];

  const state = {
    possessionIndex: 0,
    transitionFor: null,
    lateGameUrgency: 0,
    load: { gold: ctx.gold.players.map(() => 0), blue: ctx.blue.players.map(() => 0) },
    // Live defensive state per side. Null when the defensive engine is off, in
    // which case every action falls back to Phase 6A positional matching.
    defense: ctx.defensivePlans ? {
      gold: createDefensiveState(ctx.defensivePlans.gold),
      blue: createDefensiveState(ctx.defensivePlans.blue),
    } : null,
    // Live offensive game plan per side. The DEFENDING side's plan is the
    // opposing one, so each offence plans against the defence it faces.
    offensePlan: ctx.offensiveAdjustmentsEnabled && ctx.expandedActionsEnabled ? {
      gold: buildOffensivePlan({
        offense: ctx.gold, defense: ctx.blue, defPlan: ctx.defensivePlans?.blue ?? null, eff: ctx.eff,
        // The standing plan is the MAN-offence plan. Zone possessions replace
        // it per possession in playPossession — a plan built against a zone
        // shell that is only up for a fraction of possessions would misplan
        // the man majority.
        baselineMix: expandedActionMix({ offense: ctx.gold, defense: ctx.blue, eff: ctx.eff, state: {}, defPlan: ctx.defensivePlans?.blue ?? null, zoneShell: null, params: ctx.parameterSet }),
      }),
      blue: buildOffensivePlan({
        offense: ctx.blue, defense: ctx.gold, defPlan: ctx.defensivePlans?.gold ?? null, eff: ctx.eff,
        baselineMix: expandedActionMix({ offense: ctx.blue, defense: ctx.gold, eff: ctx.eff, state: {}, defPlan: ctx.defensivePlans?.gold ?? null, zoneShell: null, params: ctx.parameterSet }),
      }),
    } : null,
  };

  const teamPossessionsPerPeriod = ctx.environment.pace / 4;
  let period = 0;
  let overtimes = 0;
  const periodScores = [];

  // ── Opening possession (actualGameSymmetryVersion 1.0.0) ───────────────────
  // Decided by the seed, not by which team the caller happened to pass first.
  // Before this, period parity alone chose the starter, so gold opened every
  // game ever simulated. Two identical teams must not have one of them
  // guaranteed the ball.
  const openingSide = rng.chance(0.5) ? "gold" : "blue";
  const otherSide = (s) => (s === "gold" ? "blue" : "gold");

  const runPeriod = (targetPerTeam) => {
    period++;
    const startGold = goldBox.totals.pts, startBlue = blueBox.totals.pts;
    // A small seeded jitter so every period is not identical in length.
    const budget = Math.max(6, Math.round(targetPerTeam * 2 * (1 + rng.bell() * 0.06)));
    // Regulation alternates from the opening tip, so each side starts two
    // periods. Overtime takes a FRESH jump ball, as it does in basketball.
    //
    // This matters more than it looks. The period budget is a total across both
    // teams and is not forced even, so the side that starts a period takes
    // ceil(budget/2) possessions. Across regulation that cancels — each side
    // starts twice. Overtime is period 5, odd, and unpaired: under the old
    // parity rule gold started every first overtime and collected the extra
    // possession whenever the budget was odd. Measured over 240,000 games, gold
    // won 54.6% of 5,289 overtime games, and that alone accounted for the
    // engine's entire aggregate side bias.
    let offSide = period <= REGULATION_PERIODS
      ? (period % 2 === 1 ? openingSide : otherSide(openingSide))
      : (rng.chance(0.5) ? "gold" : "blue");

    for (let used = 0; used < budget; used++) {
      const off = offSide === "gold" ? ctx.gold : ctx.blue;
      const def = offSide === "gold" ? ctx.blue : ctx.gold;
      const offBox = offSide === "gold" ? goldBox : blueBox;
      const defBox = offSide === "gold" ? blueBox : goldBox;

      // Game state, recomputed each possession. It shapes urgency and shot
      // selection — never whether a shot goes in.
      const margin = (offSide === "gold" ? 1 : -1) * (goldBox.totals.pts - blueBox.totals.pts);
      const remaining = budget - used;
      const isLate = period >= REGULATION_PERIODS && remaining <= 10;
      state.lateGameUrgency = isLate
        ? clamp((margin < 0 ? Math.min(-margin, 12) / 12 : 0) * (1 - remaining / 12), 0, 1)
        : 0;
      state.phase = period === 1 ? "EARLY" : isLate ? (Math.abs(margin) <= 6 ? "CLOSE_LATE" : margin > 0 ? "PROTECTING_LEAD" : "TRAILING_LATE") : "NORMAL";
      state.possessionIndex++;

      offBox.totals.possessions++;

      // ── Bounded coach adjustment (PARTS 21-22) ──────────────────────────
      // Considered once per possession for the DEFENDING side, on accumulated
      // shot-quality evidence and behind a cooldown. Deterministic: the same
      // state at the same index always reaches the same decision.
      // Offensive adjustment for the team WITH the ball.
      if (state.offensePlan) {
        const oPlan = state.offensePlan[offSide];
        const dSide2 = offSide === "gold" ? "blue" : "gold";
        refreshMismatchTargets(oPlan, {
          defPlan: ctx.defensivePlans?.[dSide2] ?? null,
          defState: state.defense?.[dSide2] ?? null,
          offense: offSide === "gold" ? ctx.gold : ctx.blue,
        });
        const oAdj = considerOffensiveAdjustment({
          plan: oPlan, offense: offSide === "gold" ? ctx.gold : ctx.blue,
          defPlan: ctx.defensivePlans?.[dSide2] ?? null,
          defState: state.defense?.[dSide2] ?? null,
          possessionIndex: state.possessionIndex, eff: ctx.eff, params: ctx.parameterSet,
        });
        if (oAdj) applyOffensiveAdjustment(oPlan, oAdj);
      }

      if (state.defense) {
        const dSide = offSide === "gold" ? "blue" : "gold";
        const dState = state.defense[dSide];
        const dPlan = ctx.defensivePlans[dSide];
        const adj = considerAdjustment({
          state: dState, plan: dPlan, possessionIndex: state.possessionIndex,
          defenders: dPlan.defenders, threats: dPlan.threats, params: ctx.parameterSet,
        });
        if (adj) applyAdjustment(dState, adj);
      }

      let guard = 0;
      // An offensive rebound continues THIS possession. Bounded so a
      // pathological rebound loop cannot hang the game.
      for (;;) {
        const res = playPossession({ ctx, off, def, offBox, defBox, state, rng, ledger, period });
        if (res.ended || !res.retain || ++guard > 8) break;
      }
      offSide = offSide === "gold" ? "blue" : "gold";
    }

    // Quarter break: a bounded, documented recovery.
    for (const side of ["gold", "blue"]) {
      state.load[side] = state.load[side].map((l) => l * (1 - FATIGUE_BOUNDS.quarterRecovery));
    }
    periodScores.push({ period, gold: goldBox.totals.pts - startGold, blue: blueBox.totals.pts - startBlue });
  };

  for (let i = 0; i < REGULATION_PERIODS; i++) runPeriod(teamPossessionsPerPeriod);

  // ── Overtime (PART 10) ─────────────────────────────────────────────────────
  // No random tie-breaker. Play another period; repeat while level.
  let guardHit = false;
  while (goldBox.totals.pts === blueBox.totals.pts) {
    if (overtimes >= MAX_OVERTIMES) { guardHit = true; break; }
    overtimes++;
    runPeriod(teamPossessionsPerPeriod * OT_PERIOD_FRACTION);
  }

  // The guard exists so a pathological context cannot hang the process. If it
  // is ever reached, resolution is still BASKETBALL: one more possession
  // sequence for each team until the tie breaks — never a coin flip. That the
  // guard fired is recorded as an internal error, because it means the
  // parameters produced an implausible game.
  let guardResolution = null;
  if (guardHit) {
    let extra = 0;
    while (goldBox.totals.pts === blueBox.totals.pts && extra < 40) {
      extra++;
      overtimes++;
      runPeriod(2);
    }
    guardResolution = {
      code: "MAX_OVERTIME_GUARD",
      maxOvertimes: MAX_OVERTIMES,
      extraSequences: extra,
      note: "The maximum-overtime guard fired. Resolution remained possession-based; no random tie-breaker was used. This is an internal error condition — a context that cannot break a tie in six overtimes is implausible and should be investigated.",
    };
  }

  const gold = finaliseBox(goldBox);
  const blue = finaliseBox(blueBox);
  // A tie is unreachable in a normal game — the invariant check rejects one —
  // but the max-overtime guard can exit still level. Defaulting that to "Blue"
  // made an impossible state into a silent win for a fixed side. This branch
  // consumes no RNG unless it is actually reached, so no ordinary game's stream
  // is affected.
  const winner = gold.totals.pts > blue.totals.pts ? "Gold"
    : gold.totals.pts < blue.totals.pts ? "Blue"
    : (rng.chance(0.5) ? "Gold" : "Blue");

  const realizedEff = (box, opponentBox) => {
    const poss = box.totals.possessions || 1;
    return r2((box.totals.pts / poss) * 100);
  };

  return {
    simulationId: ctx.simulationId,
    simulationSeed: ctx.simulationSeed,
    mode: ctx.mode,
    eraStyleId: ctx.eraStyleId,
    threePointLegal: ctx.environment.threePointLegal,
    winner,
    finalScore: { gold: gold.totals.pts, blue: blue.totals.pts },
    periods: period,
    overtimes,
    periodScores,
    gold, blue,
    // Pregame expectation, stored BEFORE the game and never rewritten after
    // seeing the winner (PART 30).
    expectation: ctx.expectation,
    realized: {
      realizedEfficiencyGold: realizedEff(gold),
      realizedEfficiencyBlue: realizedEff(blue),
      realizedPace: r2((gold.totals.possessions + blue.totals.possessions) / 2 / (period <= 4 ? 1 : 1 + (period - 4) * OT_PERIOD_FRACTION)),
    },
    possessionLedger: ledger,
    rngSteps: rng.steps(),
    confidence: ctx.confidence,
    // ── Defensive result metadata (PART 29) ─────────────────────────────────
    // COMPACT on purpose. The full plan carries a 25-cell matrix and ten
    // profiles per side; persisting that per game would be enormous and none
    // of it is needed to explain a result. The expanded objects stay available
    // to tests and the replay tool through the prepared context.
    defensiveMatchupVersion: ctx.defensivePlans ? ctx.defensivePlans.gold.defensiveMatchupVersion : null,
    // Whether each Phase 6B2 module actually shaped this game, so the
    // fingerprint can list only what mattered.
    zoneResolutionUsed: Boolean(ctx.zoneResolutionEnabled && (ctx.defensivePlans?.gold.zoneShell || ctx.defensivePlans?.blue.zoneShell)),
    expandedActionsUsed: Boolean(ctx.expandedActionsEnabled),
    offensiveAdjustmentsUsed: Boolean(ctx.offensiveAdjustmentsEnabled),
    opportunityAllocationUsed: Boolean(ctx.opportunityAllocationEnabled),
    zoneShells: ctx.defensivePlans ? {
      gold: ctx.defensivePlans.gold.zoneShell ? ctx.defensivePlans.gold.zoneShell.shellType : null,
      blue: ctx.defensivePlans.blue.zoneShell ? ctx.defensivePlans.blue.zoneShell.shellType : null,
    } : null,
    offense: state.offensePlan ? {
      gold: summariseOffense(state.offensePlan.gold),
      blue: summariseOffense(state.offensePlan.blue),
    } : null,
    defense: state.defense ? {
      gold: summariseDefense(ctx.defensivePlans.gold, state.defense.gold),
      blue: summariseDefense(ctx.defensivePlans.blue, state.defense.blue),
    } : null,
    internalError: guardResolution,
    // Parameter identity travels with the result, so a stored game records the
    // coefficients that produced it rather than whatever the registry holds later.
    runtimeParameterBindingVersion: ctx.runtimeParameterBindingVersion,
    calibrationParameterRegistryVersion: ctx.calibrationParameterRegistryVersion,
    parameterSetHash: ctx.parameterSetHash,
    parameterSetStatus: ctx.parameterSetStatus,
    possessionCalibrationVersion: ctx.parameterSet.calibrationVersion,
    status: "DEVELOPMENT — CALIBRATION REQUIRED",
  };
};
