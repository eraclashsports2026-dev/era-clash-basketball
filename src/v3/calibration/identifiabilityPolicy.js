// ── Identifiability v2 policy ───────────────────────────────────────────────
// Frozen BEFORE the v2 analysis was run.
//
// v1 used max|t| across every available metric against a threshold of 2.0. That
// was invalid: with 32 metrics the null median of max|t| is ~2.42 and the
// Bonferroni critical value ~3.16, so the threshold sat BELOW what noise
// typically produces. v1's categories are preserved as historical evidence and
// are not used for calibration.
//
// v2 fixes the methodology in four ways, each declared here before any result:
//
//   1. DECLARED FAMILIES. Each parameter is tested against the small set of
//      metrics its documented meaning predicts it moves — not against all 32.
//      A coefficient that sets midrange conversion is judged on midrange
//      conversion. Testing everything against everything is what created the
//      multiplicity problem in the first place.
//   2. FAMILY-WISE CONTROL WITHIN THE FAMILY. Holm-Bonferroni over the primary
//      family only. Secondary metrics corroborate; guardrails detect regression.
//      Neither enters the significance decision.
//   3. PRACTICAL EFFECT SIZE. Significance is necessary and insufficient. A
//      parameter must move its primary metric by a basketball-relevant amount,
//      declared per metric below.
//   4. DIRECTION STABILITY. Measured across fixtures and perturbations. An
//      unexplained sign reversal disqualifies a parameter from free
//      calibration however significant its magnitude.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const PARAMETER_IDENTIFIABILITY_VERSION = versionOf("parameterIdentifiabilityVersion");

/**
 * Minimum practically meaningful effect, per metric, in the metric's own units.
 *
 * These are basketball judgements, not statistical ones, and they are declared
 * before any v2 result exists. A statistically detectable change of 0.1
 * percentage points in three-point rate is real and irrelevant; calibrating
 * against it would be fitting noise that happens to be significant.
 */
export const PRACTICAL_EFFECT = Object.freeze({
  // Share-of-shots and share-of-plays metrics: one percentage point.
  rimShare: 0.01, paintShare: 0.01, midShare: 0.01, threeShare: 0.01,
  pnrShare: 0.01, postShare: 0.01, isoShare: 0.01, spotUpShare: 0.01,
  genericShare: 0.01, transitionShare: 0.01, zoneActionShare: 0.01,
  leadingFgaShare: 0.01, topTwoShare: 0.01,
  // Conversion and efficiency: half a percentage point.
  fgPct: 0.005, efgPct: 0.005, tsPct: 0.005,
  rimMakeRate: 0.005, paintMakeRate: 0.005, midMakeRate: 0.005,
  // Rate metrics.
  threePar: 0.01, ftr: 0.01, tovRate: 0.005, orebRate: 0.005, astRate: 0.01,
  stlRate: 0.002, blkRate: 0.002,
  // Counts and other scales.
  pace: 0.5, points: 1.0, margin: 1.0, usageEntropy: 0.02,
  adjustments: 0.25, overtimes: 0.02,
});

/**
 * Declared metric families, one entry per active parameter.
 *
 * `primary` is the family the significance test runs over — what the
 * parameter's documented meaning says it controls. `secondary` corroborates.
 * `guardrails` must NOT move materially; they catch a parameter that reaches
 * the wrong domain.
 */
export const METRIC_FAMILIES = Object.freeze({
  // ── Opportunity: who gets the ball ────────────────────────────────────────
  "opportunity.saturation.strength": { primary: ["leadingFgaShare", "topTwoShare", "usageEntropy"], secondary: ["postShare", "isoShare"], guardrails: ["pace", "tovRate", "fgPct"] },
  "opportunity.saturation.floor": { primary: ["leadingFgaShare", "topTwoShare"], secondary: ["usageEntropy"], guardrails: ["pace", "fgPct"] },
  "opportunity.saturation.underTargetCeiling": { primary: ["usageEntropy", "topTwoShare"], secondary: ["leadingFgaShare"], guardrails: ["pace", "fgPct"] },
  "opportunity.saturation.warmupPossessions": { primary: ["leadingFgaShare", "usageEntropy"], secondary: ["topTwoShare"], guardrails: ["pace", "fgPct"] },
  "opportunity.mismatch.severe": { primary: ["postShare", "isoShare", "leadingFgaShare"], secondary: ["rimShare", "topTwoShare"], guardrails: ["pace", "tovRate"] },
  "opportunity.mismatch.major": { primary: ["postShare", "isoShare", "leadingFgaShare"], secondary: ["rimShare", "topTwoShare"], guardrails: ["pace", "tovRate"] },
  "opportunity.mismatch.moderate": { primary: ["postShare", "isoShare", "leadingFgaShare"], secondary: ["rimShare", "topTwoShare"], guardrails: ["pace", "tovRate"] },
  "opportunity.mismatch.minor": { primary: ["postShare", "isoShare", "leadingFgaShare"], secondary: ["rimShare", "topTwoShare"], guardrails: ["pace", "tovRate"] },
  "opportunity.form.low": { primary: ["leadingFgaShare", "usageEntropy"], secondary: ["topTwoShare"], guardrails: ["pace", "fgPct"] },
  "opportunity.form.high": { primary: ["leadingFgaShare", "usageEntropy"], secondary: ["topTwoShare"], guardrails: ["pace", "fgPct"] },
  "opportunity.lateGame.primaryBoost": { primary: ["leadingFgaShare", "topTwoShare"], secondary: ["usageEntropy", "isoShare"], guardrails: ["pace", "tovRate"] },

  // ── Fit bands: which player takes which action ────────────────────────────
  // Each band's primary family is its own action share plus the concentration
  // metrics a band necessarily moves.
  ...Object.fromEntries([
    ["SPOT_UP", "spotUpShare"], ["OFF_BALL_SCREEN", "spotUpShare"], ["POST_UP", "postShare"],
    ["HANDOFF", "pnrShare"], ["ZONE_ATTACK", "zoneActionShare"], ["CUT", "genericShare"],
    ["ISOLATION", "isoShare"], ["PICK_AND_ROLL", "pnrShare"], ["TRANSITION", "transitionShare"],
    ["GENERIC_HALF_COURT", "genericShare"],
  ].flatMap(([fam, share]) => [
    [`fitBand.${fam}.lo`, { primary: [share, "leadingFgaShare", "usageEntropy"], secondary: ["topTwoShare"], guardrails: ["pace", "fgPct"] }],
    [`fitBand.${fam}.hi`, { primary: [share, "leadingFgaShare", "usageEntropy"], secondary: ["topTwoShare"], guardrails: ["pace", "fgPct"] }],
  ])),

  // ── Shot location: where the shot comes from ──────────────────────────────
  "shotLocation.rimWeight": { primary: ["rimShare"], secondary: ["paintShare", "midShare", "threeShare"], guardrails: ["pace", "tovRate", "leadingFgaShare"] },
  "shotLocation.postWeight": { primary: ["paintShare"], secondary: ["rimShare", "midShare"], guardrails: ["pace", "tovRate"] },
  "shotLocation.midrangeWeight": { primary: ["midShare"], secondary: ["threeShare", "rimShare"], guardrails: ["pace", "tovRate"] },
  "shotLocation.threeWeight": { primary: ["threeShare", "threePar"], secondary: ["midShare"], guardrails: ["pace", "tovRate"] },
  "shotLocation.rimBiasMultiplier": { primary: ["rimShare"], secondary: ["paintShare"], guardrails: ["pace", "tovRate"] },
  "shotLocation.perimeterBiasMultiplier": { primary: ["threeShare", "threePar"], secondary: ["midShare"], guardrails: ["pace", "tovRate"] },

  // ── Conversion: whether the shot goes in ──────────────────────────────────
  "conversion.rimBonus": { primary: ["rimMakeRate"], secondary: ["fgPct", "efgPct"], guardrails: ["rimShare", "pace", "tovRate"] },
  "conversion.paintBonus": { primary: ["paintMakeRate"], secondary: ["fgPct", "efgPct"], guardrails: ["paintShare", "pace"] },
  "conversion.midrangePenalty": { primary: ["midMakeRate"], secondary: ["fgPct", "efgPct"], guardrails: ["midShare", "pace"] },

  // ── Era environment ───────────────────────────────────────────────────────
  "era.paceTempoScale": { primary: ["pace"], secondary: ["points"], guardrails: ["fgPct", "leadingFgaShare"] },
  "era.paceBoundFraction": { primary: ["pace"], secondary: ["points"], guardrails: ["fgPct"] },
  "era.threeAnchorMax": { primary: ["threeShare", "threePar"], secondary: ["midShare"], guardrails: ["pace", "fgPct"] },
  "era.freeThrowTripRate": { primary: ["ftr"], secondary: ["points", "tsPct"], guardrails: ["pace", "fgPct"] },

  // ── Zone ──────────────────────────────────────────────────────────────────
  "zone.highPostVulnerability": { primary: ["zoneActionShare", "paintShare"], secondary: ["fgPct"], guardrails: ["pace", "tovRate"] },
  "zone.cornerVulnerability": { primary: ["zoneActionShare", "threeShare", "threePar"], secondary: ["fgPct"], guardrails: ["pace", "tovRate"] },

  // ── Coach ─────────────────────────────────────────────────────────────────
  "coach.actionMixInfluence": { primary: ["pnrShare", "postShare", "isoShare", "spotUpShare"], secondary: ["genericShare"], guardrails: ["pace", "fgPct"] },
  "coach.rosterSensitivity": { primary: ["pnrShare", "postShare", "isoShare", "spotUpShare"], secondary: ["genericShare"], guardrails: ["pace", "fgPct"] },
  "coach.offensiveAdjustmentMinEvents": { primary: ["adjustments"], secondary: ["pnrShare", "spotUpShare"], guardrails: ["pace", "fgPct"] },
  "coach.defensiveAdjustmentMinEvents": { primary: ["adjustments"], secondary: ["fgPct"], guardrails: ["pace", "leadingFgaShare"] },
  "coach.offensiveAdjustmentCooldown": { primary: ["adjustments"], secondary: ["pnrShare", "spotUpShare"], guardrails: ["pace", "fgPct"] },
  "coach.defensiveAdjustmentCooldown": { primary: ["adjustments"], secondary: ["fgPct"], guardrails: ["pace", "leadingFgaShare"] },
  "coach.adjustmentMagnitude": { primary: ["adjustments", "spotUpShare", "pnrShare"], secondary: ["genericShare"], guardrails: ["pace", "fgPct"] },
});

export const IDENTIFIABILITY_V2 = Object.freeze({
  version: PARAMETER_IDENTIFIABILITY_VERSION,
  supersedes: "1.0.0",
  supersededReason: "v1 used max|t| across ~32 metrics against a threshold of 2.0. Measured null median of that statistic is ~2.42 and the Bonferroni critical value ~3.16, so the threshold sat below what noise typically produces. v1 categories are preserved as historical evidence and are not used for calibration.",

  // Significance is judged ONLY over the declared primary family.
  familyWiseMethod: "holm-bonferroni",
  familyWiseAlpha: 0.05,
  // ── Null model ────────────────────────────────────────────────────────────
  // CORRECTED before any v2 result was produced. The first draft declared "A/A
  // paired batches, identical parameter set, disjoint seed blocks". That null is
  // DEGENERATE: the engine is deterministic, so running the same parameter set
  // on the same seed gives a paired difference of exactly zero with zero
  // variance, and the t-statistic is 0/0 rather than a distribution.
  //
  // The real noise here is chaotic, not sampling: a tiny parameter change
  // perturbs RNG consumption and cascades, so any single paired game differs
  // substantially even for a metric the parameter does not systematically
  // affect. Averaged over many paired games that component tends to zero while a
  // systematic effect persists — which is exactly what a paired t-statistic
  // measures.
  //
  // So the null is estimated from OUT-OF-FAMILY metrics: for each perturbation,
  // the t-statistics on metrics the parameter's documented meaning says it
  // should NOT move. Pooled across parameters, those are draws from the true
  // null of this statistic on this engine.
  nullModel: "Pooled t-statistics on out-of-family metrics across all parameter perturbations. Empirical, and not degenerate the way an A/A paired comparison would be on a deterministic engine.",
  nullMinSamples: 500,

  minPairedSeeds: 256,
  nearThresholdPairedSeeds: 1024,
  // A result within this factor of the critical value is re-measured at the
  // higher sample before being classified.
  nearThresholdFactor: 1.5,

  // Direction stability across fixture x perturbation cells.
  identifiableMinDirectionConsistency: 0.75,
  weaklyIdentifiableMinDirectionConsistency: 0.60,

  requirePracticalEffect: true,
  practicalEffect: PRACTICAL_EFFECT,

  // A guardrail moving by more than this multiple of its own practical
  // threshold means the parameter reaches a domain it should not.
  guardrailToleranceMultiple: 2.0,

  categories: Object.freeze([
    "IDENTIFIABLE", "WEAKLY_IDENTIFIABLE", "CONFOUNDED",
    "NO_MEASURABLE_EFFECT", "UNSUPPORTED_BY_TARGET_DATA",
  ]),

  // Confounding, recomputed over the v2 primary families.
  confoundedMinCosine: 0.90,
  requireConditionNumber: true,
  maxConditionNumber: 1000,

  forbidMethodSelectionByOutcome: true,
  forbidReclassificationToEnlargeScope: true,
});

/**
 * Final calibration readiness. Exactly one class per active parameter, and the
 * counts must sum to the active parameter count — the Phase 6C2C3 report
 * asserted six readiness numbers that were never computed and summed to 59,
 * then quoted four of them summing to 44. A test now hard-fails on any total
 * other than the active count.
 */
export const READINESS_CLASSES = Object.freeze({
  FREE_CALIBRATION: "Identifiable, distinct, practically meaningful, and supported by authorized historical numeric evidence.",
  STRONGLY_REGULARIZED_CALIBRATION: "Measurable and supported only by synthetic control or weak evidence. Small, heavily penalised movement only.",
  STRUCTURAL_CALIBRATION_ONLY: "Checkable for structural sanity — invariants, monotonicity, bounds — never fitted to a value.",
  DEFAULT_FROZEN_CONFOUNDED: "Cannot be separated from another parameter's effect on this corpus.",
  DEFAULT_FROZEN_NO_EFFECT: "No measurable effect inside its legal range, or a safety clamp that never binds.",
  DEFAULT_FROZEN_PENDING_EXTERNAL_DATA: "Measurable, possibly strongly so, but no authorized target can judge which direction is better.",
});

export const READINESS_VERSION = versionOf("calibrationReadinessVersion");

export const identifiabilityPolicyHash = () =>
  createHash("sha256").update(JSON.stringify({
    IDENTIFIABILITY_V2, METRIC_FAMILIES, PRACTICAL_EFFECT, READINESS_CLASSES,
  })).digest("hex");

/** Every active parameter must have a declared family before the analysis runs. */
export const missingFamilies = (activeIds) => activeIds.filter((id) => !METRIC_FAMILIES[id]);

/** A family metric with no declared practical threshold could never be judged. */
export const missingPracticalThresholds = () => {
  const missing = new Set();
  for (const f of Object.values(METRIC_FAMILIES)) {
    for (const m of [...f.primary, ...f.secondary, ...f.guardrails]) {
      if (PRACTICAL_EFFECT[m] === undefined) missing.add(m);
    }
  }
  return [...missing];
};
