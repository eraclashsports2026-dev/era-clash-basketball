// ── Era Style Intelligence (V3) ───────────────────────────────────────────────
// An Era Style is a basketball ENVIRONMENT. It is not a power ranking.
//
// There is no "2020s offense +10" and no "1990s defense +10" anywhere in this
// file. There is no best decade. ONE shared era applies to both teams, and what
// it changes is what is LEGAL, what is VALUABLE, what is DIFFICULT, what is
// COMMON, and what is EFFICIENT. It never decides who wins.
//
//     player capability × team construction × coach philosophy × era environment
//
// ── THE TRANSLATION DOCTRINE ─────────────────────────────────────────────────
// Transport the basketball player, not the historical circumstances that
// created the player. A player keeps demonstrated skill, athleticism, size, IQ,
// passing, shooting touch, rebounding instinct and defensive capability. The
// era changes how those capabilities are EXPRESSED.
//
// Stephen Curry before the three-point line keeps his shooting skill, his
// movement, his gravity, his handle and his off-ball value. What changes is
// that a shot from 26 feet is worth two, and that three-point VOLUME is not
// available to him. His skill is not erased and no bonus is invented.
//
// Wilt Chamberlain in the 2020s keeps his size, athleticism, interior scoring,
// rebounding and rim protection. He does not acquire modern three-point range.
//
// ── NO NATIVE-ERA BONUS ──────────────────────────────────────────────────────
// A coach or player gets nothing for matching the selected decade. A 1980s
// coach in the 1980s receives no multiplier. What they may get is a system that
// happens to be legal and a roster that happens to be able to run it — and both
// of those are mechanisms, computed from rules and personnel, not identity.
//
// ── ISOLATION ────────────────────────────────────────────────────────────────
// Opponent-independent, seed-independent, deterministic, and imported by no
// simulation module. Enforced by test.
import { ERA_STYLES, getEra } from "./eraStyles.js";
import { buildCoachIntelligence } from "./coachIntelligence.js";
import { versionOf } from "../versions.js";

export const ERA_STYLE_VERSION = versionOf("eraStyleVersion");
export const ERA_STYLE_IDS = ERA_STYLES.map((e) => e.id);

const clamp10 = (v) => Math.max(0, Math.min(10, v));
const r1 = (v) => Math.round(clamp10(v) * 10) / 10;
const lerp = (v, lo, hi) => clamp10(((v - lo) / (hi - lo)) * 10);

// ── Strategic effects ─────────────────────────────────────────────────────────
// Derived from RULES and LEAGUE ENVIRONMENT, which are kept apart on purpose:
// a rule says what was legal, a league average says what was typical, and
// turning a statistical trend into a rule (or a stereotype into either) is the
// specific error this separation prevents.
export const strategicEffects = (era) => {
  const r = era.rules, v = era.environment;

  // What a perimeter shot is WORTH. Zero without a line — not "low", zero.
  // With a line, worth scales with how much the league actually rewarded it.
  const perimeterShotValue = r.threePoint ? r1(lerp(v.tpaPerGame, 3, 40) * 0.7 + lerp(v.tpPct, 0.28, 0.38) * 0.3) : 0;

  // How much the environment PAYS for spreading the floor. Legal zones punish
  // a non-spacing lineup harder, because help no longer has to be earned.
  const spacingIncentive = r1(perimeterShotValue * 0.75 + (r.zoneLegal ? 2.5 : 0));

  // How crowded the paint is. Illegal-defense rules FORBID pre-rotated help,
  // so the 1950s-1990s paint is emptier than its reputation: a post scorer got
  // genuine one-on-one looks. Legal zones reverse that.
  const helpDefenseFreedom = r1((r.illegalDefenseRestrictions ? 2 : 7) + (r.zoneLegal ? 2 : 0) + (r.defensiveThreeSeconds ? -0.5 : 0));
  const interiorDensity = r1(helpDefenseFreedom * 0.55 + (10 - perimeterShotValue) * 0.45);

  // Perimeter contact. Hand-checking makes on-ball creation physically harder.
  const physicalPerimeterPressure = r.handCheckAllowed ? r1(7.5) : r1(3);

  const transitionFrequency = r1(lerp(v.pace, 88, 122));
  // Misses are what make an offensive rebound valuable, so a low-efficiency
  // era pays more for one.
  const offensiveReboundValue = r1(lerp(1 - v.fgPct, 0.51, 0.62) * 0.7 + lerp(v.orebPct ?? 0.28, 0.22, 0.34) * 0.3);
  // Turnovers relative to how many possessions the era produced.
  const turnoverPressure = r1(lerp((v.tovPerGame ?? 15) / Math.max(1, v.pace) * 100, 12, 20));

  return {
    spacingIncentive, perimeterShotValue, interiorDensity, helpDefenseFreedom,
    physicalPerimeterPressure, transitionFrequency, offensiveReboundValue, turnoverPressure,
  };
};

/** Full Era Style Intelligence profile. Takes no opponent and no seed. */
export const buildEraStyleIntelligence = (eraOrId, ctx = {}) => {
  void ctx; // opponent/seed independence: never read
  const era = typeof eraOrId === "string" ? getEra(eraOrId) : eraOrId;
  if (!era) return null;
  const r = era.rules, v = era.environment;
  return {
    eraStyleId: era.id,
    name: era.label ?? era.id,
    anchorSeason: era.anchorSeason,
    // ── RULE FACTS: what was legal. Discrete and checkable. ──
    rules: {
      shotClockSeconds: r.shotClock,
      threePointAvailable: r.threePoint,
      threePointDistance: r.threeDistance,
      zoneLegal: r.zoneLegal,
      illegalDefenseRestrictions: r.illegalDefenseRestrictions,
      defensiveThreeSeconds: r.defensiveThreeSeconds,
      backcourtSeconds: r.backcourtSeconds,
      handCheckEnvironment: r.handCheckAllowed ? "PERMITTED" : "RESTRICTED",
      contactEnvironment: r.handCheckAllowed ? "PHYSICAL" : "FREEDOM_OF_MOVEMENT",
    },
    // ── LEAGUE ENVIRONMENT: what was typical. Continuous, and an estimate for
    //    the earliest eras. Never to be read as a rule. ──
    leagueEnvironment: {
      pace: v.pace,
      fieldGoalPct: v.fgPct,
      threePointAttempts: v.tpaPerGame,
      threePointPct: r.threePoint ? v.tpPct : null,   // null, not 0 — there was no line
      freeThrowAttempts: v.ftaPerGame,
      assists: v.astPerGame,
      turnovers: v.tovPerGame,
      offensiveReboundShare: v.orebPct ?? null,
    },
    strategicEffects: strategicEffects(era),
    ruleFacts: era.ruleFacts ?? [],
    leagueTrends: era.leagueTrends ?? [],
    styleSummary: era.styleSummary ?? [],
    provenance: {
      sources: era.sources ?? [],
      separation: "Rule facts and league trends are stored and reported separately. A statistical trend is never presented as a rule.",
      estimateNote: "Pace and turnover figures for the 1950s and 1960s are league estimates: turnovers were not tracked until 1977-78 and offensive/defensive rebound splits begin in 1973-74.",
      noEraBonus: "This layer contains no era bonus, no native-era bonus, and no power ranking. It prices skills; it does not rate decades.",
      engineUse: "NONE — no simulation module imports this layer.",
      anchorCaveat: "An Era Style represents a TYPICAL environment for the decade. Individual seasons within a decade used different rules and league conditions.",
    },
    confidence: era.confidence ?? "MEDIUM",
    eraDataVersion: versionOf("eraDataVersion"),
    eraStyleVersion: ERA_STYLE_VERSION,
  };
};

export const allEraStyleIntelligence = (ctx) => ERA_STYLE_IDS.map((id) => buildEraStyleIntelligence(id, ctx));

// ── Player–Era translation ────────────────────────────────────────────────────
// Per-card, dimension-by-dimension. Deliberately NOT one "era fit score":
// a single number would hide the whole point, which is that a player keeps
// their skill and only its EXPRESSION changes.
export const translatePlayer = (profile, eraOrId) => {
  const eff = strategicEffects(typeof eraOrId === "string" ? getEra(eraOrId) : eraOrId);
  const era = typeof eraOrId === "string" ? getEra(eraOrId) : eraOrId;
  const o = profile.offense, d = profile.defense, f = profile.fit;

  // Shooting SKILL is invariant. What moves is what the skill is worth.
  const shootingSkillRetained = o.spacingGravity;
  const shootingValueExpressed = era.rules.threePoint
    ? r1(o.spacingGravity * (0.55 + eff.perimeterShotValue * 0.045))
    // No arc: the skill still forces a defender out, but the reward is two.
    : r1(o.spacingGravity * 0.55);

  return {
    cardId: profile.id, name: profile.name, eraStyleId: era.id,
    shooting: {
      skillRetained: shootingSkillRetained,
      valueExpressed: shootingValueExpressed,
      note: era.rules.threePoint
        ? "Perimeter skill is priced by the era's shot value and volume."
        : "Perimeter skill is UNCHANGED; a deep shot is simply worth two. Volume is unavailable, ability is not removed.",
    },
    spacing: { contribution: f.spacingContribution, valueExpressed: r1(f.spacingContribution * (0.5 + eff.spacingIncentive * 0.05)) },
    physicality: { retained: r1((d.perimeterContainment + d.interiorDeterrence) / 2), advantaged: eff.physicalPerimeterPressure >= 6 },
    pace: { transitionSkill: o.rimThreat, valueExpressed: r1(o.rimThreat * (0.5 + eff.transitionFrequency * 0.05)) },
    defense: {
      perimeterValueExpressed: r1(d.perimeterContainment * (0.6 + eff.physicalPerimeterPressure * 0.04)),
      interiorValueExpressed: r1(d.rimDeterrence * (0.6 + eff.interiorDensity * 0.04)),
      helpValueExpressed: r1(d.eventCreation * (0.6 + eff.helpDefenseFreedom * 0.04)),
    },
    interior: {
      postSkillRetained: o.postThreat,
      // Illegal-defense rules FORBID pre-rotated help, so a post scorer got
      // cleaner one-on-one looks in those eras, not worse ones.
      postValueExpressed: r1(o.postThreat * (era.rules.illegalDefenseRestrictions ? 1.15 : 0.9)),
    },
    role: { scalability: f.roleScalability, creationDependence: f.creationDependence },
    // Data confidence travels with the conclusion.
    confidence: profile.confidence.overall,
    doctrine: "Skill is transported unchanged. Only its expression is priced by the era.",
  };
};

// ── Coach–Era fit ─────────────────────────────────────────────────────────────
// Contextual, mechanical, and explicitly free of any native-era bonus.
export const buildCoachEraFit = ({ coach, eraStyleId, teamIntelligence = null, ctx = {} } = {}) => {
  void ctx;
  const ci = buildCoachIntelligence(coach);
  if (!ci) throw new Error("buildCoachEraFit: unknown coach");
  const era = getEra(eraStyleId);
  if (!era) throw new Error(`buildCoachEraFit: unknown era "${eraStyleId}"`);
  const eff = strategicEffects(era);
  const o = ci.offense, d = ci.defense, m = ci.management;
  const adapt = m.adaptability / 10;

  // A system element is LEGAL or it is not. Where it is not, adaptability
  // decides how much of the coach survives — and adaptability is capped by the
  // demonstrated toolkit, never by what the model considers optimal.
  const legality = [];
  if (!era.rules.threePoint && o.threePointEmphasis >= 6)
    legality.push({ element: "three-point emphasis", status: "UNAVAILABLE", detail: `asks for ${o.threePointEmphasis}/10 three-point emphasis in an era with no arc`, survives: r1(o.threePointEmphasis * adapt) });
  if (!era.rules.zoneLegal && d.zonePreference >= 5)
    legality.push({ element: "zone defence", status: "ILLEGAL", detail: `prefers zone at ${d.zonePreference}/10 where zones are banned`, survives: r1(d.zonePreference * adapt) });
  if (era.rules.illegalDefenseRestrictions && d.helpAggression >= 7)
    legality.push({ element: "aggressive help", status: "RESTRICTED", detail: "illegal-defense rules forbid pre-rotated help", survives: r1(d.helpAggression * adapt) });
  if (!era.rules.handCheckAllowed && d.pressure >= 8)
    legality.push({ element: "physical ball pressure", status: "RESTRICTED", detail: "freedom-of-movement rules limit hand-checking", survives: r1(d.pressure * adapt) });

  // What TRANSLATES regardless of era, because it is a basketball concept
  // rather than a rules exploit.
  const portable = [];
  if (o.motion >= 7) portable.push("motion and cutting principles");
  if (o.ballMovement >= 7) portable.push("ball movement");
  if (o.pickAndRoll >= 7) portable.push("pick-and-roll concepts — the action long predates modern spacing");
  if (o.tempo >= 8 || o.tempo <= 3) portable.push("a definite tempo philosophy");
  if (m.adaptability >= 7) portable.push("demonstrated adaptability across different systems");
  if (d.switching >= 7 && era.rules.zoneLegal) portable.push("switching, where the rules allow it");

  const dim = (label, demand, envValue, why) => {
    const score = r1(10 - Math.abs(demand - envValue) * 0.85);
    return { label, demand, environment: envValue, score, why };
  };
  const environmentFit = {
    tempo: dim("tempo", o.tempo, eff.transitionFrequency, "does the era's possession economy suit this tempo?"),
    spacing: dim("spacing", o.threePointEmphasis, eff.spacingIncentive, "does the era pay for the floor stretch this system wants?"),
    interior: dim("interior", o.postUsage, eff.interiorDensity, "is the paint as available as this system assumes?"),
    pressure: dim("ball pressure", d.pressure, eff.physicalPerimeterPressure, "does the era permit this much contact?"),
    help: dim("help defence", d.helpAggression, eff.helpDefenseFreedom, "do the rules allow help to be pre-rotated?"),
    pickAndRoll: dim("pick and roll", o.pickAndRoll, r1((eff.spacingIncentive + eff.helpDefenseFreedom) / 2), "does the era's geometry reward the action?"),
  };

  const scores = Object.values(environmentFit).map((x) => x.score);
  const mean = r1(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    coachId: ci.coachId, coachName: ci.name, eraStyleId: era.id,
    teamFingerprint: teamIntelligence?.lineupFingerprint ?? null,
    environmentFit,
    legalityConstraints: legality,
    portableElements: portable,
    // A BAND, never a score presented as precision, and never a bonus.
    band: mean >= 8 ? "EXCELLENT" : mean >= 6.5 ? "GOOD" : mean >= 4.5 ? "WORKABLE" : mean >= 2.5 ? "LIMITED" : "POOR",
    adaptabilityApplied: m.adaptability,
    toolkitGated: Boolean(ci.toolkit),
    confidence: {
      coach: ci.confidence,
      era: era.confidence ?? "MEDIUM",
      teamInputs: teamIntelligence?.confidence?.overall ?? null,
    },
    provenance: {
      noNativeEraBonus: "A coach receives NOTHING for their career overlapping the selected decade. Every effect here is a mechanism: legality, personnel, or possession economy.",
      mechanism: "Illegal system elements are reduced by demonstrated adaptability; portable concepts are named explicitly.",
      engineUse: "NONE — no simulation module imports this layer.",
    },
    versions: {
      eraDataVersion: versionOf("eraDataVersion"),
      eraStyleVersion: ERA_STYLE_VERSION,
      coachDataVersion: ci.dataVersion,
      coachIntelligenceVersion: ci.intelligenceVersion,
    },
    modelVersion: ERA_STYLE_VERSION,
  };
};
