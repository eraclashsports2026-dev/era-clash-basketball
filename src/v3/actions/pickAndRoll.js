// ── Pick-and-roll action model (action library v1) ────────────────────────────
// The first entry in a versioned basketball ACTION LIBRARY. It is NOT the
// possession engine, and `possessionEngineVersion` stays null to say so — one
// modelled action is not an engine.
//
// ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
// The coach field `pnr` was researched across 30 coaches and read by nothing.
// The temptation is `high pnr coach = +5 offense`. That is not basketball and
// it is explicitly forbidden here: there is no bonus in this file, and the
// module returns no score and no winner.
//
// Instead a pick-and-roll is evaluated from the things that actually decide one:
//   · the BALL HANDLER's pull-up shooting, handle and rim pressure
//   · the SCREENER's roll threat, pop threat and short-roll passing
//   · the two DEFENDERS guarding them
//   · the SPACING on the strong and weak side
//   · the COVERAGE the defence chooses
//   · the COACH philosophies on both sides
//   · the ERA, which prices the shots the action produces
//
// ── WHY PICK-AND-ROLL IS NOT A MODERN ACTION ─────────────────────────────────
// It long predates three-point spacing. What the era changes is the ECONOMICS:
// pick-and-pop is worth less without an arc, drop coverage is punished harder by
// elite pull-up shooting, illegal-defense rules change where help may legally
// come from, and pace changes how often the action is run. The action itself is
// available in every era.
import { getEra } from "../eraStyles.js";
import { strategicEffects } from "../eraStyleIntelligence.js";
import { buildCoachIntelligence } from "../coachIntelligence.js";
import { versionOf } from "../../versions.js";

export const ACTION_LIBRARY_VERSION = versionOf("actionLibraryVersion");

const clamp10 = (v) => Math.max(0, Math.min(10, v));
const r1 = (v) => Math.round(clamp10(v) * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ── Offensive variants ────────────────────────────────────────────────────────
// `requires` gates availability on personnel and era. A variant a lineup cannot
// execute is not offered, and a coach who never ran it does not get it for free.
export const PNR_VARIANTS = [
  { key: "HIGH_PNR", label: "High pick-and-roll", about: "Screen at the top of the key; the most neutral starting point and available in every era.",
    fit: (h, s, sp, eff, c) => (h.selfCreation * 0.35 + s.rimThreat * 0.3 + c.pickAndRoll * 0.35) },
  { key: "SIDE_PNR", label: "Side pick-and-roll", about: "Screen on the wing, using the sideline as a second defender.",
    fit: (h, s, sp, eff, c) => (h.selfCreation * 0.3 + s.rimThreat * 0.3 + c.pickAndRoll * 0.25 + c.postUsage * 0.15) },
  { key: "SPREAD_PNR", label: "Spread pick-and-roll", about: "Three shooters spaced away from the action so help must choose.",
    requires: (h, s, sp, eff) => sp.shooters >= 2 && eff.perimeterShotValue >= 3,
    fit: (h, s, sp, eff, c) => (h.selfCreation * 0.3 + sp.floorSpacing * 0.35 + c.threePointEmphasis * 0.2 + eff.spacingIncentive * 0.15) },
  { key: "EMPTY_CORNER_PNR", label: "Empty-corner pick-and-roll", about: "The strong-side corner is vacated so no help can sit there.",
    requires: (h, s, sp) => h.selfCreation >= 6,
    fit: (h, s, sp, eff, c) => (h.selfCreation * 0.45 + h.rimThreat * 0.25 + c.isolation * 0.3) },
  { key: "PICK_AND_POP", label: "Pick-and-pop", about: "The screener steps back into space instead of rolling.",
    requires: (h, s, sp, eff) => s.spacingGravity >= 5.5,
    fit: (h, s, sp, eff, c) => (s.spacingGravity * 0.5 + eff.perimeterShotValue * 0.25 + c.insideOut * 0.25) },
  { key: "SHORT_ROLL", label: "Short roll", about: "Against a trap, the screener catches in the middle and plays 4-on-3.",
    requires: (h, s) => s.passingVision >= 5.5,
    fit: (h, s, sp, eff, c) => (s.passingVision * 0.5 + s.rimThreat * 0.2 + c.ballMovement * 0.3) },
  { key: "SLIP_SCREEN", label: "Slip screen", about: "The screener cuts before contact, beating an over-committed defender.",
    requires: (h, s) => s.offBallMovement >= 5.5,
    fit: (h, s, sp, eff, c) => (s.offBallMovement * 0.45 + s.rimThreat * 0.3 + c.motion * 0.25) },
  { key: "RE_SCREEN", label: "Re-screen", about: "Immediately screen again to punish a recovering defender.",
    fit: (h, s, sp, eff, c) => (h.selfCreation * 0.3 + c.pickAndRoll * 0.4 + c.motion * 0.3) },
  { key: "REJECT_SCREEN", label: "Reject the screen", about: "The handler attacks away from the screen against an over-playing defender.",
    requires: (h) => h.rimThreat >= 6,
    fit: (h, s, sp, eff, c) => (h.rimThreat * 0.45 + h.selfCreation * 0.3 + c.isolation * 0.25) },
];

// ── Defensive coverages ───────────────────────────────────────────────────────
export const PNR_COVERAGES = [
  { key: "DROP", label: "Drop", about: "The screener's defender sits back to protect the rim, conceding the pull-up.",
    fit: (h, s, dh, ds, eff, c) => (ds.rimDeterrence * 0.45 + c.dropCoverage * 0.35 + (10 - h.spacingGravity) * 0.2) },
  { key: "SWITCH", label: "Switch", about: "The two defenders exchange assignments, conceding a mismatch.",
    requires: (h, s, dh, ds, eff, c) => ds.schemeVersatility >= 5 && c.switching >= 4,
    fit: (h, s, dh, ds, eff, c) => (ds.schemeVersatility * 0.4 + c.switching * 0.4 + dh.schemeVersatility * 0.2) },
  { key: "HEDGE", label: "Hedge / show", about: "The big steps out briefly to slow the handler, then recovers.",
    fit: (h, s, dh, ds, eff, c) => (ds.perimeterContainment * 0.3 + dh.perimeterContainment * 0.3 + c.pressure * 0.4) },
  { key: "BLITZ", label: "Blitz / trap", about: "Two defenders attack the ball to force it out of the handler's hands.",
    requires: (h, s, dh, ds, eff, c) => c.pressure >= 6,
    fit: (h, s, dh, ds, eff, c) => (c.pressure * 0.4 + c.helpAggression * 0.3 + h.ballSecurity <= 5 ? 2 : 0) + (dh.eventCreation * 0.3) },
  { key: "ICE", label: "ICE / down", about: "Force the handler away from the screen toward the sideline.",
    requires: (h, s, dh, ds, eff) => eff.helpDefenseFreedom >= 4,
    fit: (h, s, dh, ds, eff, c) => (dh.perimeterContainment * 0.4 + ds.rimDeterrence * 0.3 + c.dropCoverage * 0.3) },
  { key: "UNDER", label: "Go under", about: "The handler's defender cuts beneath the screen, conceding the jumper.",
    fit: (h, s, dh, ds, eff, c) => ((10 - h.spacingGravity) * 0.6 + ds.rimDeterrence * 0.2 + c.dropCoverage * 0.2) },
  { key: "OVER", label: "Go over", about: "The handler's defender fights over the top to deny the pull-up.",
    fit: (h, s, dh, ds, eff, c) => (h.spacingGravity * 0.35 + dh.perimeterContainment * 0.45 + c.pressure * 0.2) },
  { key: "LATE_SWITCH", label: "Late switch", about: "Play it straight, then switch only if beaten.",
    requires: (h, s, dh, ds) => ds.schemeVersatility >= 4,
    fit: (h, s, dh, ds, eff, c) => (ds.schemeVersatility * 0.3 + dh.perimeterContainment * 0.3 + c.adaptabilityProxy * 0.4) },
  { key: "HELP_AND_RECOVER", label: "Help and recover", about: "A third defender helps at the rim and scrambles back out.",
    requires: (h, s, dh, ds, eff) => eff.helpDefenseFreedom >= 5,
    fit: (h, s, dh, ds, eff, c) => (c.helpAggression * 0.45 + eff.helpDefenseFreedom * 0.35 + ds.rimDeterrence * 0.2) },
];

const pick = (defs, args, minScore = 0) => {
  const scored = defs
    .filter((d) => !d.requires || d.requires(...args))
    .map((d) => ({ key: d.key, label: d.label, about: d.about, score: r1(d.fit(...args)) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return { best: scored[0] ?? null, available: scored.filter((s) => s.score >= minScore) };
};

/**
 * Evaluate one pick-and-roll.
 *
 * Returns structured basketball CONSEQUENCES. It does not return a score, a
 * point total, or a winner — those belong to a possession engine that does not
 * exist yet.
 */
export const evaluatePickAndRoll = ({
  handler, screener, handlerDefender, screenerDefender,
  spacing, offenseCoach, defenseCoach, eraStyleId = "2020s",
  forceVariant = null, forceCoverage = null, ctx = {},
} = {}) => {
  void ctx;
  for (const [name, v] of Object.entries({ handler, screener, handlerDefender, screenerDefender })) {
    if (!v?.offense || !v?.defense) throw new Error(`evaluatePickAndRoll: ${name} must be a Player Intelligence profile`);
  }
  const era = getEra(eraStyleId);
  if (!era) throw new Error(`evaluatePickAndRoll: unknown era "${eraStyleId}"`);
  const eff = strategicEffects(era);

  const oc = buildCoachIntelligence(offenseCoach);
  const dc = buildCoachIntelligence(defenseCoach);
  if (!oc || !dc) throw new Error("evaluatePickAndRoll: both coaches must resolve");

  const h = handler.offense, s = screener.offense, sPass = screener.offense;
  const dh = handlerDefender.defense, ds = screenerDefender.defense;
  // spacing may be supplied directly or read off a Team Intelligence profile
  const sp = spacing?.floorSpacing != null ? spacing : { floorSpacing: 5, shooters: 2, nonShooters: 1 };

  const oCoach = { ...oc.offense, insideOut: oc.offense.insideOut, adaptabilityProxy: oc.management.adaptability };
  const dCoach = { ...dc.defense, helpAggression: dc.defense.helpAggression, adaptabilityProxy: dc.management.adaptability };

  const vArgs = [h, { ...s, passingVision: sPass.passingVision, spacingGravity: s.spacingGravity, offBallMovement: s.offBallMovement }, sp, eff, oCoach];
  const cArgs = [h, s, dh, ds, eff, dCoach];

  const variants = pick(PNR_VARIANTS, vArgs);
  const coverages = pick(PNR_COVERAGES, cArgs);
  const variant = forceVariant
    ? (variants.available.find((v) => v.key === forceVariant) ?? PNR_VARIANTS.filter((v) => v.key === forceVariant).map((v) => ({ key: v.key, label: v.label, about: v.about, score: r1(v.fit(...vArgs)), forced: true }))[0])
    : variants.best;
  const coverage = forceCoverage
    ? (coverages.available.find((c) => c.key === forceCoverage) ?? PNR_COVERAGES.filter((c) => c.key === forceCoverage).map((c) => ({ key: c.key, label: c.label, about: c.about, score: r1(c.fit(...cArgs)), forced: true }))[0])
    : coverages.best;
  if (!variant) throw new Error("evaluatePickAndRoll: no variant available");
  if (!coverage) throw new Error("evaluatePickAndRoll: no coverage available");

  // ── coverage-specific consequences ──────────────────────────────────────────
  // Each coverage concedes something specific. Drop concedes the pull-up.
  // Switch concedes a mismatch. Blitz concedes the short roll and 4-on-3.
  // Going under concedes the jumper. These are the trade-offs, not penalties.
  const C = coverage.key;
  const pullUpConceded = C === "DROP" ? 1.0 : C === "UNDER" ? 1.15 : C === "ICE" ? 0.6 : C === "OVER" ? 0.35 : C === "BLITZ" ? 0.2 : 0.6;
  const rimConceded = C === "BLITZ" ? 1.1 : C === "HEDGE" ? 0.9 : C === "SWITCH" ? 0.85 : C === "DROP" ? 0.45 : 0.7;
  const rollConceded = C === "BLITZ" ? 1.2 : C === "HEDGE" ? 1.0 : C === "DROP" ? 0.5 : C === "SWITCH" ? 0.6 : 0.75;
  const weakSideConceded = C === "BLITZ" ? 1.25 : C === "HELP_AND_RECOVER" ? 1.1 : C === "HEDGE" ? 0.85 : 0.55;
  const turnoverForced = C === "BLITZ" ? 1.35 : C === "HEDGE" ? 1.1 : C === "ICE" ? 0.95 : 0.8;

  const offense = {
    // the pull-up is priced by the era: a 26-footer is worth two without an arc
    ballHandlerShotQuality: r1(h.spacingGravity * pullUpConceded * (era.rules.threePoint ? 0.6 + eff.perimeterShotValue * 0.04 : 0.55)),
    rimPressure: r1(h.rimThreat * rimConceded),
    // Rolling into space is HARDER where help may legally pre-rotate. Illegal-
    // defense eras forbade that, so a roll man met a single defender; legal
    // zones mean he meets a wall. An earlier version used interiorDensity,
    // which barely varies, and the benchmark caught the consequence: roll
    // opportunity rose monotonically toward the 2020s alongside everything
    // else, which is the signature of an era acting as a flat bonus.
    rollOpportunity: r1(s.rimThreat * rollConceded * (1.15 - eff.helpDefenseFreedom * 0.055)),
    // pick-and-pop is worth far less where a long two is the only reward
    popOpportunity: r1(s.spacingGravity * (era.rules.threePoint ? 0.55 + eff.perimeterShotValue * 0.045 : 0.4) * (C === "DROP" ? 1.15 : 0.85)),
    shortRollPlaymaking: r1(sPass.passingVision * (C === "BLITZ" ? 1.3 : C === "HEDGE" ? 1.05 : 0.6)),
    weakSideOpportunity: r1(sp.floorSpacing * weakSideConceded * (0.5 + eff.spacingIncentive * 0.05)),
    foulPressure: r1((h.rimThreat * 0.6 + s.rimThreat * 0.4) * (eff.physicalPerimeterPressure >= 6 ? 0.8 : 1.1)),
    turnoverRisk: r1(clamp10((10 - h.ballSecurity) * turnoverForced * (0.6 + eff.turnoverPressure * 0.04))),
  };

  const defense = {
    containment: r1(dh.perimeterContainment * (C === "OVER" ? 1.1 : C === "ICE" ? 1.05 : C === "UNDER" ? 0.7 : 0.9)),
    rimProtection: r1(ds.rimDeterrence * (C === "DROP" ? 1.15 : C === "BLITZ" ? 0.5 : C === "SWITCH" ? 0.75 : 0.9)),
    // a switch is only safe if the big can actually guard the handler
    switchMismatch: C === "SWITCH" || C === "LATE_SWITCH"
      ? r1(clamp10(10 - Math.abs(ds.perimeterContainment - dh.perimeterContainment) - ds.schemeVersatility * 0.4))
      : 0,
    recoveryDifficulty: r1((C === "BLITZ" ? 8 : C === "HEDGE" ? 6.5 : C === "SWITCH" ? 2 : 4) * (1 - ds.schemeVersatility * 0.03)),
    helpCommitment: r1((C === "BLITZ" ? 8.5 : C === "HELP_AND_RECOVER" ? 7 : C === "HEDGE" ? 5 : 2.5) * (0.6 + eff.helpDefenseFreedom * 0.04)),
    reboundPosition: r1(ds.defensiveRebounding * (C === "BLITZ" ? 0.6 : C === "DROP" ? 1.1 : 0.85)),
  };

  const strengths = [], concerns = [];
  if (offense.ballHandlerShotQuality >= 7) strengths.push(`${handler.name}'s pull-up is the coverage's price`);
  if (offense.rollOpportunity >= 7) strengths.push(`${screener.name} rolls into real space`);
  if (offense.popOpportunity >= 7) strengths.push(`${screener.name} punishes a dropping big by popping`);
  if (offense.shortRollPlaymaking >= 7) strengths.push(`${screener.name} can play 4-on-3 out of the short roll`);
  if (offense.weakSideOpportunity >= 7) strengths.push("weak-side spacing punishes any help");
  if (defense.rimProtection >= 7.5) concerns.push(`${screenerDefender.name} protects the rim behind the action`);
  if (defense.containment >= 7.5) concerns.push(`${handlerDefender.name} contains the ball without help`);
  if (offense.turnoverRisk >= 6.5) concerns.push("live-dribble turnover risk against this coverage");
  if (defense.switchMismatch >= 6) strengths.push("the switch creates an exploitable mismatch");
  if (sp.nonShooters >= 3) concerns.push("crowded spacing lets help sit in the lane");
  if (!era.rules.threePoint && s.spacingGravity >= 6) concerns.push("the screener's range earns only two points here");

  const expectedOutcomes = [];
  const top = Object.entries(offense).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, v] of top) expectedOutcomes.push({ outcome: k, pressure: v });

  return {
    actionType: variant.key, actionLabel: variant.label, actionAbout: variant.about,
    coverageType: coverage.key, coverageLabel: coverage.label, coverageAbout: coverage.about,
    participants: {
      ballHandler: handler.id, screener: screener.id,
      handlerDefender: handlerDefender.id, screenerDefender: screenerDefender.id,
    },
    eraStyleId: era.id,
    availableVariants: variants.available.map((v) => v.key),
    availableCoverages: coverages.available.map((c) => c.key),
    offense, defense, expectedOutcomes, strengths, concerns,
    eraEffects: {
      perimeterShotValue: eff.perimeterShotValue,
      helpDefenseFreedom: eff.helpDefenseFreedom,
      spacingIncentive: eff.spacingIncentive,
      note: era.rules.threePoint
        ? "The era prices the shots this action produces."
        : "No arc: the pull-up and the pop are worth two, so the action's value shifts toward the rim. The ACTION is unchanged — pick-and-roll long predates three-point spacing.",
    },
    coachInputs: {
      offense: { coachId: oc.coachId, pickAndRoll: oc.offense.pickAndRoll, insideOut: oc.offense.insideOut },
      defense: { coachId: dc.coachId, dropCoverage: dc.defense.dropCoverage, switching: dc.defense.switching, pressure: dc.defense.pressure },
    },
    confidence: {
      players: [handler, screener, handlerDefender, screenerDefender]
        .map((p) => p.confidence.overall)
        .some((c) => String(c).startsWith("LOW")) ? "LOW" : "MEDIUM",
      note: "Pull-up shooting and roll/pop threat rest on the least-verified player data. See player-data-risk-register.md.",
    },
    provenance: {
      noFlatBonus: "There is no pick-and-roll bonus in this model. Every output is a consequence of personnel, coverage, spacing and era.",
      noWinner: "This action library produces no score and no winner. Those belong to a possession engine that does not exist yet.",
      engineUse: "NONE — no simulation module imports this layer.",
    },
    actionLibraryVersion: ACTION_LIBRARY_VERSION,
  };
};
