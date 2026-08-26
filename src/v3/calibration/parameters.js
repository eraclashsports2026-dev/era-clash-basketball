// ── Calibration parameter registry ──────────────────────────────────────────
// Every coefficient that Phase 6C2B or later may tune lives HERE, once.
//
// The failure this prevents: a tuned magic number sitting inside an action file
// where the parameter history cannot see it. A model whose coefficients are
// scattered is a model nobody can audit, reproduce or roll back.
//
// Not every constant belongs here. Rule constants (a shot clock is 24 seconds),
// schema constants and structural thresholds are FIXED, not calibratable, and
// registering them would imply they are open to tuning. What belongs here is a
// coefficient whose value is a judgement that evidence could move.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const CALIBRATION_PARAMETER_REGISTRY_VERSION = versionOf("calibrationParameterRegistryVersion");

const P = ({ id, module, description, value, min, max, step, targetMetrics, calibrationSource, confidence, regularization = "MEDIUM", affectsResult = true }) => ({
  id, module, description,
  currentValue: value,
  defaultValue: value,
  min, max, step,
  // The prior is the default: absent evidence, do not move. Regularization
  // penalises distance from it, so a parameter that drifts far has to earn it.
  prior: value,
  targetMetrics,
  calibrationSource,
  confidence,
  regularizationStrength: regularization,
  affectsResult,
  changeHistory: [],
});

export const PARAMETERS = Object.freeze([
  // ── Opportunity allocation ──
  P({ id: "opportunity.saturation.strength", module: "opportunityAllocation",
    description: "How hard a player's selection weight decays once he is above his target share. Higher flattens the distribution.",
    value: 1.35, min: 0.6, max: 2.5, step: 0.05,
    targetMetrics: ["leadingShareMean", "leadingShareP95", "usageEntropy", "playerScoringShares"],
    calibrationSource: "HISTORICAL_TIER_C + SYNTHETIC_GUARDRAIL", confidence: "MEDIUM" }),
  P({ id: "opportunity.saturation.floor", module: "opportunityAllocation",
    description: "Lowest multiplier a saturated player can reach. Never zero: a real mismatch late in a game is a reason to keep going to him.",
    value: 0.16, min: 0.05, max: 0.4, step: 0.01,
    targetMetrics: ["leadingShareMax", "outlierGameRate"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
  P({ id: "opportunity.saturation.underTargetCeiling", module: "opportunityAllocation",
    description: "Largest lift an under-target teammate receives. Over-correcting simply inverts the concentration problem.",
    value: 1.35, min: 1.0, max: 2.0, step: 0.05,
    targetMetrics: ["usageEntropy", "meaningfulShooters"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
  P({ id: "opportunity.saturation.warmupPossessions", module: "opportunityAllocation",
    description: "Possessions before saturation engages. Below this a realised share is noise, and reacting to it fights the plan.",
    value: 8, min: 0, max: 30, step: 1,
    targetMetrics: ["earlyGameDistribution"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "opportunity.mismatch.severe", module: "opportunityAllocation",
    description: "Selection multiplier for a SEVERE mismatch in the relevant action.",
    value: 2.6, min: 1.0, max: 4.0, step: 0.1,
    targetMetrics: ["mismatchAttackShare", "postUpConcentration"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "MEDIUM" }),
  P({ id: "opportunity.mismatch.major", module: "opportunityAllocation", description: "Selection multiplier for a MAJOR mismatch.",
    value: 2.0, min: 1.0, max: 3.5, step: 0.1, targetMetrics: ["mismatchAttackShare"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "MEDIUM" }),
  P({ id: "opportunity.mismatch.moderate", module: "opportunityAllocation", description: "Selection multiplier for a MODERATE mismatch.",
    value: 1.55, min: 1.0, max: 3.0, step: 0.05, targetMetrics: ["mismatchAttackShare"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
  P({ id: "opportunity.mismatch.minor", module: "opportunityAllocation", description: "Selection multiplier for a MINOR mismatch.",
    value: 1.25, min: 1.0, max: 2.0, step: 0.05, targetMetrics: ["mismatchAttackShare"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
  P({ id: "opportunity.form.low", module: "opportunityAllocation",
    description: "Lower bound of the seeded game-form multiplier — a cold night.",
    value: 0.82, min: 0.6, max: 1.0, step: 0.02, targetMetrics: ["playerGameVariance"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "opportunity.form.high", module: "opportunityAllocation",
    description: "Upper bound of the seeded game-form multiplier — a hot night.",
    value: 1.18, min: 1.0, max: 1.6, step: 0.02, targetMetrics: ["playerGameVariance", "outlierGameRate"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "opportunity.lateGame.primaryBoost", module: "opportunityAllocation",
    description: "How much late-game urgency tilts selection toward a primary creator.",
    value: 0.5, min: 0.0, max: 1.5, step: 0.05, targetMetrics: ["lateGameConcentration"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),

  // ── Action-family fit bands ──
  // How much suitability may modulate the usage plan, per family. A spot-up is
  // almost entirely about who can shoot; a generic possession is almost
  // entirely about whose turn it is.
  ...[["SPOT_UP", 0.2, 2.4], ["OFF_BALL_SCREEN", 0.25, 2.2], ["POST_UP", 0.3, 2.1], ["HANDOFF", 0.35, 2.0],
      ["ZONE_ATTACK", 0.4, 1.9], ["CUT", 0.4, 1.9], ["ISOLATION", 0.5, 1.8], ["PICK_AND_ROLL", 0.55, 1.7],
      ["TRANSITION", 0.6, 1.6], ["GENERIC_HALF_COURT", 0.75, 1.35]].flatMap(([fam, lo, hi]) => [
    P({ id: `fitBand.${fam}.lo`, module: "opportunityAllocation",
      description: `Lowest fit multiplier for ${fam}: how far a poorly-suited player is discounted.`,
      value: lo, min: 0.1, max: 1.0, step: 0.05,
      targetMetrics: ["actionFamilyShares", "roleFidelity"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
    P({ id: `fitBand.${fam}.hi`, module: "opportunityAllocation",
      description: `Highest fit multiplier for ${fam}: how far the best-suited player is favoured.`,
      value: hi, min: 1.0, max: 3.0, step: 0.05,
      targetMetrics: ["actionFamilyShares", "roleFidelity"], calibrationSource: "SYNTHETIC_GUARDRAIL", confidence: "LOW" }),
  ]),

  // ── Shot location ──
  // Calibrated BEFORE conversion. Phase 6C2A measured expected and realised
  // make percentages agreeing to within 0.003, so high FG% is a location
  // problem, not a conversion problem.
  P({ id: "shotLocation.rimWeight", module: "possessionContext",
    description: "Base rim weight in a player's shot profile, scaled by rim threat.",
    value: 0.34, min: 0.15, max: 0.6, step: 0.01,
    targetMetrics: ["rimShare", "fieldGoalPct", "efgPct"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "shotLocation.postWeight", module: "possessionContext",
    description: "Base paint/post weight, scaled by post threat.",
    value: 0.42, min: 0.2, max: 0.7, step: 0.01,
    targetMetrics: ["paintShare", "fieldGoalPct"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "shotLocation.midrangeWeight", module: "possessionContext",
    description: "Base midrange weight, scaled by perimeter skill.",
    value: 0.18, min: 0.05, max: 0.5, step: 0.01,
    targetMetrics: ["midrangeShare"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "shotLocation.threeWeight", module: "possessionContext",
    description: "Base three-point weight, scaled by perimeter skill and three volume.",
    value: 0.22, min: 0.05, max: 0.6, step: 0.01,
    targetMetrics: ["threePointAttemptRate"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "shotLocation.rimBiasMultiplier", module: "possessionGame",
    description: "How strongly an action's rim bias inflates the rim weight. The dominant driver of the interior-heavy shot mix.",
    value: 1.6, min: 0.5, max: 3.0, step: 0.05,
    targetMetrics: ["rimShare", "rimOrPaintShare"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "shotLocation.perimeterBiasMultiplier", module: "possessionGame",
    description: "How strongly a negative rim bias inflates the three-point weight.",
    value: 1.5, min: 0.5, max: 3.0, step: 0.05,
    targetMetrics: ["threePointAttemptRate"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),

  // ── Conversion ── (tuned only after location)
  P({ id: "conversion.rimBonus", module: "possessionGame",
    description: "Rim make percentage above the era's league field-goal percentage.",
    value: 0.155, min: 0.05, max: 0.28, step: 0.005,
    targetMetrics: ["fieldGoalPct", "rimMakePct"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "conversion.paintBonus", module: "possessionGame",
    description: "Paint/post make percentage relative to the era baseline.",
    value: 0.015, min: -0.1, max: 0.12, step: 0.005,
    targetMetrics: ["fieldGoalPct"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "conversion.midrangePenalty", module: "possessionGame",
    description: "Midrange make percentage relative to the era baseline. Negative by design.",
    value: -0.055, min: -0.15, max: 0.02, step: 0.005,
    targetMetrics: ["fieldGoalPct"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),

  // ── Era environment ──
  P({ id: "era.paceTempoScale", module: "possessionContext",
    description: "How far both coaches' tempo may move the era's documented pace.",
    value: 1.35, min: 0.5, max: 3.0, step: 0.05,
    targetMetrics: ["pace", "paceSpreadByCoach"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "era.paceBoundFraction", module: "possessionContext",
    description: "How far pace may deviate from the era anchor, as a fraction. A coach cannot invent a tempo the era's rules never produced.",
    value: 0.14, min: 0.05, max: 0.3, step: 0.01,
    targetMetrics: ["pace"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "era.threeAnchorMax", module: "possessionContext",
    description: "Upper clamp on the three-point odds-ratio anchor.",
    value: 12, min: 2, max: 30, step: 1,
    targetMetrics: ["threePointAttempts", "threePointAttemptRate"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "era.freeThrowTripRate", module: "possessionContext",
    description: "Foul trips per possession, derived from the era's documented free-throw attempts.",
    value: 0.5, min: 0.2, max: 1.0, step: 0.01,
    targetMetrics: ["freeThrowRate", "freeThrowAttempts"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),

  // ── Zone ──
  P({ id: "zone.selectionFrequency", module: "zoneResolution",
    description: "How often a zone-capable coach selects a shell. Phase 6C2A measured ~55% of possessions against real single-digit NBA usage.",
    value: 0.55, min: 0.02, max: 0.8, step: 0.01,
    targetMetrics: ["zoneShare", "coachIdentitySpread"], calibrationSource: "ERA_ENVIRONMENT", confidence: "MEDIUM" }),
  P({ id: "zone.offensiveReboundExposure", module: "zoneResolution",
    description: "Extra offensive rebounding conceded by a zone. Measured at ~+7 points of ORB%; real differentials run 2-4.",
    value: 0.073, min: 0.0, max: 0.15, step: 0.005,
    targetMetrics: ["offensiveReboundPct", "zoneOrbDelta"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "zone.highPostVulnerability", module: "zoneResolution",
    description: "How exposed a shell is through the high post.",
    value: 1.0, min: 0.3, max: 2.0, step: 0.05, targetMetrics: ["zoneGapDistribution"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "zone.cornerVulnerability", module: "zoneResolution",
    description: "How exposed a shell is in the corners.",
    value: 1.0, min: 0.3, max: 2.0, step: 0.05, targetMetrics: ["zoneGapDistribution", "threePointAttemptRate"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),

  // ── Coach ──
  P({ id: "coach.actionMixInfluence", module: "coachIntelligence",
    description: "How far a coach's documented system moves the baseline action mix.",
    value: 1.0, min: 0.3, max: 2.0, step: 0.05,
    targetMetrics: ["coachActionSpread", "actionFamilyShares"], calibrationSource: "STRUCTURAL", confidence: "MEDIUM" }),
  P({ id: "coach.rosterSensitivity", module: "coachIntelligence",
    description: "How far the roster moves the action mix away from the coach's baseline.",
    value: 1.0, min: 0.3, max: 2.0, step: 0.05,
    targetMetrics: ["rosterActionSpread"], calibrationSource: "STRUCTURAL", confidence: "MEDIUM" }),
  P({ id: "coach.adjustmentThreshold", module: "coachAdjustment",
    description: "Evidence required before a coach adjusts. Guards the rule that bad process may trigger a change even when shots went in.",
    value: 3, min: 1, max: 10, step: 1,
    targetMetrics: ["adjustmentsPerGame"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "coach.adjustmentCooldown", module: "coachAdjustment",
    description: "Possessions before the same trigger may fire again.",
    value: 12, min: 4, max: 40, step: 1,
    targetMetrics: ["adjustmentsPerGame"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
  P({ id: "coach.adjustmentMagnitude", module: "coachAdjustment",
    description: "How far one adjustment may move an action-family weight.",
    value: 0.05, min: 0.01, max: 0.2, step: 0.005,
    targetMetrics: ["actionMixDrift"], calibrationSource: "STRUCTURAL", confidence: "LOW" }),
]);

// ── Access ──────────────────────────────────────────────────────────────────
const BY_ID = new Map(PARAMETERS.map((p) => [p.id, p]));

export const parameter = (id) => {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`parameter: unknown id "${id}" — register it rather than using a loose constant`);
  return p;
};

export const valueOf = (id) => parameter(id).currentValue;

export const duplicateIds = () => {
  const seen = new Set();
  const dupes = [];
  for (const p of PARAMETERS) {
    if (seen.has(p.id)) dupes.push(p.id);
    seen.add(p.id);
  }
  return dupes;
};

export const outOfBounds = () =>
  PARAMETERS.filter((p) => p.currentValue < p.min || p.currentValue > p.max)
    .map((p) => ({ id: p.id, value: p.currentValue, min: p.min, max: p.max }));

export const modules = () => [...new Set(PARAMETERS.map((p) => p.module))].sort();

export const byModule = () =>
  PARAMETERS.reduce((a, p) => ({ ...a, [p.module]: [...(a[p.module] ?? []), p.id] }), {});

/**
 * The identity of a whole parameter set. Two engines with different hashes are
 * different engines, and a result produced under one must never be attributed
 * to the other.
 */
export const parameterSetHash = (params = PARAMETERS) =>
  createHash("sha256")
    .update(JSON.stringify([...params].sort((a, b) => a.id.localeCompare(b.id)).map((p) => [p.id, p.currentValue])))
    .digest("hex");

export const snapshot = () => ({
  calibrationParameterRegistryVersion: CALIBRATION_PARAMETER_REGISTRY_VERSION,
  parameterCount: PARAMETERS.length,
  parameterSetHash: parameterSetHash(),
  parameters: PARAMETERS.map((p) => ({ id: p.id, module: p.module, value: p.currentValue, default: p.defaultValue, min: p.min, max: p.max, confidence: p.confidence })),
});

/**
 * Constants that are deliberately NOT calibratable. Listed so the distinction
 * is explicit rather than implied by absence: registering a rule constant would
 * suggest evidence could move it, and it cannot.
 */
export const FIXED_NOT_CALIBRATABLE = Object.freeze([
  { value: "shot clock, backcourt count, three-point distance", why: "Rules of the era. Facts, not judgements." },
  { value: "REGULATION_PERIODS, OT_PERIOD_FRACTION", why: "Structural definitions of a game." },
  { value: "possession conservation identities", why: "Arithmetic. AST <= FGM is not a coefficient." },
  { value: "era zoneLegal / illegalDefenseRestrictions", why: "Historical rules. Era gating is authoritative." },
  { value: "steals and blocks before 1973-74", why: "Not recorded. RESEARCH_ONLY, never invented." },
]);
