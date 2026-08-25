// ── Coach Intelligence (V3) ───────────────────────────────────────────────────
// Answers ONE question:
//
//        HOW DOES THIS COACH TRY TO USE THIS ROSTER?
//
// It deliberately does NOT answer "how good is this coach?". There is no
// universal Coach OVR here and a test asserts the field does not exist.
//
// ── WHY NO COACH OVR ─────────────────────────────────────────────────────────
// Coach effectiveness is contextual, not absolute. Mike Fratello's tempo
// suppression is a gift to a lineup with no transition athletes and an act of
// vandalism against one built to run. Doug Moe's passing game is brilliant with
// five willing passers and unplayable with one ball-dominant isolation scorer.
// Collapsing that into "Fratello = 88" throws away the only thing that matters.
// Player OVR already demonstrates the failure mode; this layer refuses to
// repeat it one level up.
//
// ── FOUR INDEPENDENCES, ENFORCED BY TEST ─────────────────────────────────────
// ERA-INDEPENDENT      no era import. Whether a coach's system suits the 1960s
//                      is the Era Style engine's question (Phase 5).
// OPPONENT-INDEPENDENT no opponent parameter. BASE fit only.
// SEED-INDEPENDENT     no RNG anywhere.
// PRODUCTION-ISOLATED  no simulation module imports this file.
//
// ── HIDDEN ───────────────────────────────────────────────────────────────────
// Nothing here is exposed to users in this phase.
import { COACHES, getCoach, NEUTRAL_COACH } from "./coaches.js";
import { versionOf } from "../versions.js";

export const COACH_INTELLIGENCE_VERSION = versionOf("coachIntelligenceVersion");
export const FIT_BANDS = ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"];

const clamp10 = (v) => Math.max(0, Math.min(10, v));
const r1 = (v) => Math.round(clamp10(v) * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Band from an internal 0–10 score. Bands, never "93.74% fit". */
export const bandOf = (score) =>
  score >= 8 ? "EXCELLENT" : score >= 6.5 ? "GOOD" : score >= 4.5 ? "WORKABLE" : score >= 2.5 ? "LIMITED" : "POOR";

// ── FIELD CONSUMPTION REGISTRY ────────────────────────────────────────────────
// Every coach attribute, and who actually reads it. Verified by grepping the
// engine, not assumed. A user-facing description must never imply that a
// RESEARCH_ONLY field changes a game.
export const FIELD_STATUS = {
  ACTIVE_CURRENT_ENGINE: "ACTIVE_CURRENT_ENGINE",
  ACTIVE_COACH_INTELLIGENCE: "ACTIVE_COACH_INTELLIGENCE",
  PLANNED_POSSESSION_ENGINE: "PLANNED_POSSESSION_ENGINE",
  RESEARCH_ONLY: "RESEARCH_ONLY",
  DEPRECATED_PENDING_REVIEW: "DEPRECATED_PENDING_REVIEW",
};
const F = (group, field, status, consumer, note) => ({ group, field, status, consumer, note });

export const COACH_FIELD_CONSUMPTION = [
  // offense
  F("offense", "tempo", "ACTIVE_CURRENT_ENGINE", "gameplan.js → possession pace", null),
  F("offense", "transition", "ACTIVE_CURRENT_ENGINE", "gameplan.js, possession.js", null),
  F("offense", "motion", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("offense", "post", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("offense", "iso", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("offense", "threeEmphasis", "ACTIVE_CURRENT_ENGINE", "gameplan.js, era interaction", null),
  F("offense", "offBall", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("offense", "ballMovement", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("offense", "starFreedom", "ACTIVE_CURRENT_ENGINE", "gameplan.js → usage concentration", null),
  F("offense", "pnr", "PLANNED_POSSESSION_ENGINE", "coachIntelligence.js (fit only)",
    "The possession loop has no pick-and-roll ACTION to consume it. Now reads in coach fit; becomes engine-active when the possession engine models PnR."),
  F("offense", "insideOut", "ACTIVE_COACH_INTELLIGENCE", "coachIntelligence.js (fit only)",
    "Zero engine consumers before Phase 4. Now drives the spacing/interior fit dimension."),
  // defense
  F("defense", "zone", "ACTIVE_CURRENT_ENGINE", "defense.js, gameplan.js, era interaction", null),
  F("defense", "switching", "ACTIVE_CURRENT_ENGINE", "defense.js", null),
  F("defense", "drop", "ACTIVE_CURRENT_ENGINE", "defense.js", null),
  F("defense", "pressure", "ACTIVE_CURRENT_ENGINE", "defense.js, possession.js", null),
  F("defense", "helpAggression", "ACTIVE_CURRENT_ENGINE", "defense.js", null),
  F("defense", "rimPriority", "ACTIVE_CURRENT_ENGINE", "defense.js", null),
  F("defense", "defRebPriority", "ACTIVE_CURRENT_ENGINE", "possession.js", null),
  F("defense", "man", "RESEARCH_ONLY", "none",
    "Zero consumers. The engine models scheme via `zone` and treats man as its complement, so `man` is redundant with `10 - zone`. Kept for research legibility; must never be described as changing a game."),
  // management
  F("management", "adaptability", "ACTIVE_CURRENT_ENGINE", "gameplan.js, possession.js halftime/Q3 adjustments", null),
  F("management", "roleDiscipline", "ACTIVE_CURRENT_ENGINE", "gameplan.js", null),
  F("management", "starEmpowerment", "ACTIVE_COACH_INTELLIGENCE", "coachIntelligence.js (fit only)",
    "Zero engine consumers before Phase 4. Now drives the usage-hierarchy fit dimension."),
  F("management", "tacticalAdjustment", "ACTIVE_COACH_INTELLIGENCE", "coachIntelligence.js (fit only)",
    "Zero engine consumers before Phase 4. Now drives the adaptability-need dimension."),
  F("management", "rotationDepth", "RESEARCH_ONLY", "none",
    "Zero consumers, and STRUCTURALLY unusable today: EraClash plays five players with no substitutions, so rotation depth has nothing to act on. It becomes meaningful only if the bench/minutes format opens — a standing CEO decision."),
];

export const fieldStatus = (group, field) =>
  COACH_FIELD_CONSUMPTION.find((f) => f.group === group && f.field === field)?.status ?? "UNKNOWN";
export const fieldsByStatus = (status) => COACH_FIELD_CONSUMPTION.filter((f) => f.status === status);

/**
 * Normalised, versioned Coach Intelligence profile.
 * A thin, validated view over the researched data — it does not invent
 * attributes the research does not support.
 */
export const buildCoachIntelligence = (coachOrId) => {
  const c = typeof coachOrId === "string" ? getCoach(coachOrId) : coachOrId;
  if (!c) return null;
  const o = c.offense, d = c.defense, m = c.management, rf = c.rosterFit;
  return {
    coachId: c.id,
    name: c.name,
    careerSpan: c.span,
    record: { wins: c.wins, losses: c.losses, pct: c.pct, championships: c.championships },
    teams: c.teams ?? [],
    systemTags: c.systemTags ?? [],
    careerPhases: c.careerPhases ?? [],
    multiPhase: Boolean(c.multiPhase),
    // The demonstrated toolkit gates adaptation: a coach may only adapt with
    // tactics their career actually showed, never with whatever the model
    // considers optimal.
    toolkit: c.toolkit ?? null,
    offense: {
      tempo: o.tempo, transitionEmphasis: o.transition, motion: o.motion,
      pickAndRoll: o.pnr, postUsage: o.post, isolation: o.iso,
      threePointEmphasis: o.threeEmphasis, insideOut: o.insideOut,
      offBallMovement: o.offBall, ballMovement: o.ballMovement, starCreatorFreedom: o.starFreedom,
    },
    defense: {
      manPreference: d.man, zonePreference: d.zone, switching: d.switching,
      dropCoverage: d.drop, pressure: d.pressure, helpAggression: d.helpAggression,
      rimProtectionPriority: d.rimPriority, defensiveReboundingPriority: d.defRebPriority,
    },
    management: {
      adaptability: m.adaptability, tacticalAdjustment: m.tacticalAdjustment,
      roleDiscipline: m.roleDiscipline, starEmpowerment: m.starEmpowerment, rotationDepth: m.rotationDepth,
    },
    rosterPreferences: {
      primaryCreator: rf.primaryCreators, multipleCreators: rf.multipleCreators,
      movementShooting: rf.shooters, passingBig: rf.passingBigs, shootingBig: rf.shootingBigs,
      traditionalCenter: rf.traditionalCenters, switchableWings: rf.switchableWings,
      defenders: rf.defenders, transitionAthletes: rf.transitionAthletes,
    },
    bestWith: c.bestWith ?? [],
    concern: c.concern ?? "",
    provenance: {
      documented: c.documented ?? [],
      inferred: c.inferred ?? [],
      sources: c.sources ?? [],
      phaseConfidence: c.phaseConfidence ?? null,
      note: "Documented facts and analyst inference are listed separately on purpose — a 0-10 rating is inference even when the system behind it is documented.",
    },
    confidence: c.confidence ?? "UNKNOWN",
    dataVersion: versionOf("coachDataVersion"),
    intelligenceVersion: COACH_INTELLIGENCE_VERSION,
  };
};

export const allCoachIntelligence = () => COACHES.map((c) => buildCoachIntelligence(c));

// ── Fit maths ─────────────────────────────────────────────────────────────────
// A dimension is a match between what the coach DEMANDS and what the roster
// SUPPLIES. Two different failures, weighted differently:
//
//   UNMET DEMAND  — the coach's system needs something the roster lacks. This
//                   is the serious one, and it scales with how central the
//                   demand is: a coach who needs 9 spacing on a 2-spacing team
//                   has no system left.
//   UNUSED SUPPLY — the roster has a strength the system does not exploit. Less
//                   damaging but real: a post-only coach handed the best
//                   shooting lineup ever is wasting it.
const dimFit = (demand, supply) => {
  const unmet = Math.max(0, demand - supply);
  const unused = Math.max(0, supply - demand);
  const centrality = 0.55 + (demand / 10) * 0.55;   // 0.55 → 1.10
  // Wasting an ELITE strength costs more than wasting a mediocre one. With a
  // flat unused penalty, every coach scored nearly identically against a
  // roster that defends everything well — a 1.2-point spread across the whole
  // pool, which is not a recommendation, it is a shrug. Scaling the penalty by
  // how good the unused strength actually is restores the distinction between
  // a system that exploits a great defence and one that merely survives it.
  const waste = 0.30 + (supply / 10) * 0.35;        // 0.30 → 0.65
  return r1(10 - unmet * centrality - unused * waste);
};

const dim = (label, demand, supply, why) => {
  const score = dimFit(demand, supply);
  return { label, demand, supply: r1(supply), score, band: bandOf(score), why };
};

/**
 * BASE coach fit for one lineup. Era-, opponent- and seed-independent.
 *
 * @param coach            coach id or object
 * @param teamIntelligence output of buildTeamIntelligence()
 * @param ctx              accepted and DELIBERATELY IGNORED — the extension
 *                         point where era and opponent attach in later phases.
 */
export const buildCoachFit = ({ coach, teamIntelligence, ctx = {} } = {}) => {
  void ctx;
  const ci = buildCoachIntelligence(coach ?? NEUTRAL_COACH);
  if (!ci) throw new Error("buildCoachFit: unknown coach");
  const t = teamIntelligence;
  if (!t || !t.offense || !t.defense) throw new Error("buildCoachFit: a Team Intelligence profile is required");

  const o = ci.offense, d = ci.defense, m = ci.management;
  const off = t.offense, def = t.defense, con = t.construction, ch = t.creationHierarchy;

  const offenseFit = {
    tempo: dim("tempo", o.tempo, off.transition, "does the roster have the transition threat this tempo demands?"),
    creation: dim("creation", o.starCreatorFreedom, off.shotCreation, "does the roster have a creator to hand freedom to?"),
    spacing: dim("spacing", o.threePointEmphasis, off.spacing.floorSpacing, "does the floor stretch as far as the system assumes?"),
    movement: dim("movement", (o.motion + o.ballMovement + o.offBallMovement) / 3, (off.offBallValue + off.cutting) / 2, "can these players produce value without the ball?"),
    postPlay: dim("post play", o.postUsage, off.postPlay, "is there a post threat to throw it to?"),
    pickAndRoll: dim("pick and roll", o.pickAndRoll, (off.rimPressure + off.passing) / 2, "are there rollers and passers to run it with?"),
    transition: dim("transition", o.transitionEmphasis, off.transition, "can this lineup actually run?"),
    roleDistribution: dim("role distribution", m.roleDiscipline, off.offBallValue, "will players hold defined roles, or does their value need the ball?"),
    interiorGeometry: dim("inside-out", o.insideOut, (off.interior.postPlay + off.spacing.floorSpacing) / 2, "does the roster support playing through the interior and kicking out?"),
  };

  const defenseFit = {
    pointOfAttack: dim("point of attack", d.pressure, def.pointOfAttack, "can these defenders pressure the ball?"),
    switching: dim("switching", d.switching, def.switchability, "can this lineup legally switch as much as the scheme wants?"),
    help: dim("help", d.helpAggression, def.helpDefense, "can they rotate behind an aggressive help scheme?"),
    rimProtection: dim("rim protection", d.rimProtectionPriority, def.rimProtection, "is there a deterrent behind the scheme?"),
    dropCoverage: dim("drop coverage", d.dropCoverage, (def.rimProtection + (10 - def.switchability)) / 2, "is there a big who can sit back and protect?"),
    defensiveRebounding: dim("defensive rebounding", d.defensiveReboundingPriority, t.rebounding.defensiveGlass, "can they finish the possessions the scheme creates?"),
    transitionDefense: dim("transition defense", 10 - o.tempo, def.switchability, "how exposed is the lineup by the pace the coach wants?"),
  };

  // Management fit reads the roster's SITUATION, not just an attribute.
  const primaries = ch.primaryCount;
  const compressed = con.usageCompression.compressedPlayers.length;
  const managementFit = {
    // a star-empowering coach needs a star worth empowering; a hierarchy-flattening
    // coach is what a creator-heavy roster needs
    usageHierarchy: dim("usage hierarchy",
      m.starEmpowerment,
      primaries >= 3 ? clamp10(10 - (primaries - 1) * 2.2) : clamp10(4 + off.shotCreation * 0.55),
      primaries >= 3 ? `${primaries} primary creators cannot all be empowered from one ball` : "one clear hierarchy to build around"),
    roleDiscipline: dim("role discipline", m.roleDiscipline, off.offBallValue, "does the roster keep value inside defined roles?"),
    // the more a roster is compressed or gap-ridden, the more adaptation it demands
    adaptabilityNeed: dim("adaptability",
      clamp10(3 + compressed * 0.9 + con.defensiveGaps.length * 0.8 + con.spacingConflicts.length * 0.8),
      (m.adaptability + m.tacticalAdjustment) / 2,
      "how much in-flight problem-solving does this roster demand of a coach?"),
    starManagement: dim("star management", m.starEmpowerment, clamp10(10 - mean(t.usagePlan.map((u) => u.compression)) * 12), "can the stars be fed without starving each other?"),
    lineupFlexibility: dim("lineup flexibility", m.rotationDepth, 5, "EraClash plays five with no substitutions, so deep-rotation systems have nothing to act on"),
  };

  const meanScore = (g) => r1(mean(Object.values(g).map((x) => x.score)));
  const strengths = [], concerns = [];
  for (const [group, entries] of Object.entries({ offense: offenseFit, defense: defenseFit, management: managementFit })) {
    for (const e of Object.values(entries)) {
      if (e.band === "EXCELLENT" && e.demand >= 6) strengths.push(`${ci.name}'s ${e.label} demands what this roster already does well`);
      if (e.band === "POOR" && e.demand >= 6) concerns.push(`${e.label}: the system asks for ${e.demand}/10 and the roster supplies ${e.supply}/10`);
      void group;
    }
  }
  if (ci.management.rotationDepth >= 8) concerns.push("a deep-rotation system has nothing to act on in a five-player format");

  const expectedStyleChanges = [];
  if (o.tempo >= 8) expectedStyleChanges.push("raises pace substantially");
  if (o.tempo <= 3) expectedStyleChanges.push("suppresses pace substantially");
  if (o.threePointEmphasis >= 8) expectedStyleChanges.push("shifts shot profile outward");
  if (o.postUsage >= 7) expectedStyleChanges.push("routes offence through the post");
  if (o.ballMovement >= 8) expectedStyleChanges.push("flattens usage through ball movement");
  if (o.starCreatorFreedom >= 8) expectedStyleChanges.push("concentrates usage on the primary creator");
  if (d.pressure >= 8) expectedStyleChanges.push("pressures the ball full-time");
  if (d.zonePreference >= 6) expectedStyleChanges.push("mixes in zone");
  if (d.switching >= 7) expectedStyleChanges.push("switches most screens");
  if (d.dropCoverage >= 8) expectedStyleChanges.push("drops the big in coverage");

  return {
    coachId: ci.coachId, coachName: ci.name,
    teamFingerprint: t.lineupFingerprint,
    offenseFit, defenseFit, managementFit,
    summary: {
      offense: { score: meanScore(offenseFit), band: bandOf(meanScore(offenseFit)) },
      defense: { score: meanScore(defenseFit), band: bandOf(meanScore(defenseFit)) },
      management: { score: meanScore(managementFit), band: bandOf(meanScore(managementFit)) },
    },
    systemStrengths: strengths.slice(0, 5),
    systemConcerns: concerns.slice(0, 5),
    expectedStyleChanges,
    // Confidence inherits the WEAKER of the two inputs. A confident coach
    // profile applied to a lineup of low-confidence player data does not
    // produce a confident conclusion.
    confidence: {
      coach: ci.confidence,
      teamInputs: t.confidence.overall,
      overall: [ci.confidence, t.confidence.overall].some((c) => String(c).startsWith("LOW")) ? "LOW"
        : [ci.confidence, t.confidence.overall].every((c) => String(c).startsWith("HIGH")) ? "HIGH" : "MEDIUM",
      sensitiveDimensions: ["spacing", "postPlay", "interiorGeometry"],
      note: "Spacing and post dimensions rest on the least-verified player data (see player-data-risk-register.md).",
    },
    provenance: {
      coachSources: ci.provenance.sources,
      documentedCount: ci.provenance.documented.length,
      inferredCount: ci.provenance.inferred.length,
      engineUse: "NONE — no simulation module imports this layer.",
      noCoachOvr: "Deliberately absent. Coach effectiveness is contextual; one number would destroy the context.",
      independence: "Era-, opponent- and seed-independent by construction.",
    },
    versions: {
      coachDataVersion: ci.dataVersion,
      coachIntelligenceVersion: ci.intelligenceVersion,
      teamIntelligenceVersion: t.modelVersion,
      playerIntelligenceVersion: versionOf("playerIntelligenceVersion"),
    },
    modelVersion: COACH_INTELLIGENCE_VERSION,
  };
};

// ── Recommendation diversity ──────────────────────────────────────────────────
// Three recommendations must be three DIFFERENT credible approaches, not the
// top three rows of one ranking. Each category names a distinct strategic angle
// and reports its own winner; a coach may lead only one category, which forces
// genuine variety instead of the same profile three times.
// Every category carries THREE things, and the second is the one that matters:
//   score()   how well the coach's system fits this roster on this axis
//   demands() how much the coach's system actually ASKS FOR this axis
//   explain() a reason drawn from THIS category, not from a generic list
//
// The demand floor exists because of a real failure. Fit is highest when demand
// and supply match — including when BOTH are near zero. That is correct as
// fit, but it meant Mike Tempo-Management Fratello, the slowest-paced coach in
// the pool, won "Best movement fit" on a low-spacing roster: his system asks
// for nothing, so nothing was missing. A category must be won by SUITABILITY,
// never by indifference, so a coach must genuinely demand an axis to headline it.
export const RECOMMENDATION_CATEGORIES = [
  { key: "offensive-structure", label: "Best offensive structure", minDemand: 0,
    pick: (f) => f.summary.offense.score,
    demands: () => 10,
    explain: (f) => `${f.coachName}'s offensive system matches this roster across ${Object.values(f.offenseFit).filter((d) => d.band === "EXCELLENT" || d.band === "GOOD").length} of ${Object.keys(f.offenseFit).length} dimensions` },
  { key: "defensive-structure", label: "Best defensive structure", minDemand: 0,
    pick: (f) => f.summary.defense.score,
    demands: () => 10,
    explain: (f) => `${f.coachName}'s defensive scheme matches this roster across ${Object.values(f.defenseFit).filter((d) => d.band === "EXCELLENT" || d.band === "GOOD").length} of ${Object.keys(f.defenseFit).length} dimensions` },
  { key: "role-balance", label: "Best role balance", minDemand: 6,
    pick: (f) => (f.managementFit.roleDiscipline.score + f.managementFit.usageHierarchy.score) / 2,
    demands: (f) => f.managementFit.roleDiscipline.demand,
    explain: (f) => `demands ${f.managementFit.roleDiscipline.demand}/10 role discipline against a roster supplying ${f.managementFit.roleDiscipline.supply}/10 off-ball value` },
  { key: "adaptability", label: "Best adaptability", minDemand: 6,
    pick: (f) => f.managementFit.adaptabilityNeed.score,
    demands: (f) => f.managementFit.adaptabilityNeed.supply,   // here the COACH is the supply
    explain: (f) => `this roster demands ${f.managementFit.adaptabilityNeed.demand}/10 in-flight problem-solving and the coach supplies ${f.managementFit.adaptabilityNeed.supply}/10` },
  { key: "transition", label: "Best transition fit", minDemand: 7,
    pick: (f) => (f.offenseFit.transition.score + f.offenseFit.tempo.score) / 2,
    demands: (f) => f.offenseFit.transition.demand,
    explain: (f) => `wants ${f.offenseFit.transition.demand}/10 transition against a roster supplying ${f.offenseFit.transition.supply}/10` },
  { key: "post", label: "Best post fit", minDemand: 6,
    pick: (f) => (f.offenseFit.postPlay.score + f.offenseFit.interiorGeometry.score) / 2,
    demands: (f) => f.offenseFit.postPlay.demand,
    explain: (f) => `routes offence through the post (${f.offenseFit.postPlay.demand}/10) into a roster supplying ${f.offenseFit.postPlay.supply}/10 post threat` },
  { key: "movement", label: "Best movement fit", minDemand: 7,
    pick: (f) => (f.offenseFit.movement.score + f.offenseFit.spacing.score) / 2,
    demands: (f) => f.offenseFit.movement.demand,
    explain: (f) => `demands ${f.offenseFit.movement.demand}/10 off-ball movement against a roster supplying ${f.offenseFit.movement.supply}/10` },
  { key: "usage-hierarchy", label: "Best usage hierarchy", minDemand: 0,
    pick: (f) => f.managementFit.usageHierarchy.score,
    demands: () => 10,
    explain: (f) => f.managementFit.usageHierarchy.why },
  { key: "pressure-defense", label: "Best pressure-defense fit", minDemand: 7,
    pick: (f) => (f.defenseFit.pointOfAttack.score + f.defenseFit.help.score) / 2,
    demands: (f) => f.defenseFit.pointOfAttack.demand,
    explain: (f) => `pressures the ball at ${f.defenseFit.pointOfAttack.demand}/10 against a roster supplying ${f.defenseFit.pointOfAttack.supply}/10 point-of-attack defence` },
];

export const recommendCoaches = (teamIntelligence, { pool = COACHES, count = 3 } = {}) => {
  const fits = pool.map((c) => buildCoachFit({ coach: c, teamIntelligence }));
  const byCategory = RECOMMENDATION_CATEGORIES.map((cat) => {
    const ranked = fits
      .filter((f) => cat.demands(f) >= cat.minDemand)   // must actually ask for it
      .map((f) => ({ f, score: r1(cat.pick(f)) }))
      .sort((a, b) => b.score - a.score || a.f.coachId.localeCompare(b.f.coachId));
    return { ...cat, ranked };
  })
    .filter((cat) => cat.ranked.length > 0)
    .sort((a, b) => b.ranked[0].score - a.ranked[0].score || a.key.localeCompare(b.key));

  // one coach may headline only one category — that is what makes three
  // recommendations three different ideas rather than one ranking three times
  const used = new Set(), out = [];
  for (const cat of byCategory) {
    if (out.length >= count) break;
    const winner = cat.ranked.find((r) => !used.has(r.f.coachId));
    if (!winner) continue;
    used.add(winner.f.coachId);
    out.push({
      category: cat.key, categoryLabel: cat.label,
      coachId: winner.f.coachId, coachName: winner.f.coachName,
      score: winner.score, band: bandOf(winner.score),
      why: cat.explain(winner.f),
      concern: winner.f.systemConcerns[0] ?? null,
      confidence: winner.f.confidence.overall,
    });
  }
  return out;
};
