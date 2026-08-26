// ── Phase 6C2C2 frozen acceptance policy ────────────────────────────────────
// Every threshold that will judge a Phase 6C2C2 result, declared BEFORE the
// experiments that produce those results were run.
//
// This file is the integrity backbone of the phase. A threshold that can be
// adjusted after seeing the number it judges is not a threshold, it is a
// narrative device. Changing any value here requires:
//
//   1. incrementing the owning policy version,
//   2. recording the old value, the new value, and the date,
//   3. a justification valid INDEPENDENT of the result that prompted it,
//   4. re-running every stage the threshold governs.
//
// A test asserts this file's hash against a committed baseline, so a silent
// edit fails the suite rather than passing unnoticed.
import { createHash } from "node:crypto";

export const POLICY_VERSIONS = Object.freeze({
  actualGameSymmetryVersion: "1.0.0",
  tierBTargetDataVersion: "1.0.0",
  independentSourceVerificationVersion: "1.0.0",
  parameterIdentifiabilityVersion: "1.0.0",
  calibrationObjectiveVersion: "2.0.0",
  internalCalibrationFoldVersion: "2.0.0",
  holdoutAcceptancePolicyVersion: "1.0.0",
  holdoutValidationVersion: "1.0.0",
  privatePreviewValidationVersion: "1.0.0",
  productionRolloutPolicyVersion: "1.0.0",
});

// ── WS1 · Actual-game side symmetry ─────────────────────────────────────────
// Two DIFFERENT questions, deliberately separated. Paired Monte Carlo
// orientation can produce a fair probability estimate while the underlying
// single-game engine still favours a display side. Averaging cannot be allowed
// to stand in for fairness: a player plays one game, not a paired average.
export const SIDE_SYMMETRY = Object.freeze({
  version: POLICY_VERSIONS.actualGameSymmetryVersion,

  // Aggregate practical-equivalence test, in percentage points.
  maxAggregateGoldAdvantagePp: 0.5,
  aggregateCiMustFitWithinPp: 1.0,
  aggregateCiLevel: 0.95,

  // Per-cell reporting. A single noisy cell must not fail the engine, and a
  // consistent same-direction tilt across cells must not pass it.
  perCellPracticalEffectPp: 2.0,
  perCellMultipleComparisonControl: "benjamini-hochberg",
  perCellFalseDiscoveryRate: 0.05,
  // The check that actually matters: bias with a consistent sign across cells.
  maxSystematicTStatistic: 2.0,
  maxSameDirectionCellFraction: 0.70,

  // Secondary orientation effects, all reported, all gated.
  maxMeanScoreMarginDifference: 0.30,   // points
  maxPossessionCountDifference: 0.50,   // possessions per game
  maxFirstPossessionImbalancePp: 1.0,
  maxOvertimeSideAdvantagePp: 2.0,

  // Sample sizes, frozen so a result cannot be rescued by shrinking the sample.
  minPairedGamesPerMajorCell: 5000,
  minPairedGamesAggregate: 50000,

  // NOTE on the Phase 6C2C1 precedent. That phase froze a per-cell side-bias
  // threshold of 0.05 without accounting for sampling error, and it failed on
  // what was almost certainly noise (0.0625 = 2 SE at n=256). That result
  // stands as recorded and is NOT retroactively revised. The thresholds here
  // are new, set for a new phase, and are sampling-error aware BEFORE any
  // 6C2C2 result exists — which is the only legitimate moment to set them.
  samplingErrorAware: true,
});

// ── WS2 · Tier B historical target coverage ─────────────────────────────────
export const TIER_B_COVERAGE = Object.freeze({
  version: POLICY_VERSIONS.tierBTargetDataVersion,
  requiredMetrics: Object.freeze([
    "pace", "offensiveRating", "defensiveRating", "netRating", "efgPct",
    "tsPct", "tovPct", "orbPct", "drbPct", "ftr", "threePar", "assistRate",
  ]),
  permittedUnavailableReasons: Object.freeze([
    "NOT_RECORDED_IN_ERA", "INSUFFICIENT_SOURCE_TOTALS",
    "SOURCE_BLOCKED_LICENSING", "NOT_APPLICABLE",
  ]),
  // The gate. A target may be unavailable; it may not be silently missing.
  maxUnjustifiedMissingFields: 0,
  maxUnprovenancedValues: 0,
  maxUnauthorizedSourceValues: 0,
  forbidZeroForMissing: true,
  requireHoldoutEnrichedBlind: true,
  maxHoldoutSimulationAccessDuringEnrichment: 0,
  // Derived metrics may only be computed when the authorized totals that the
  // formula consumes are all present. A rating derived from a guessed
  // possession count is a guess wearing a formula.
  requireCompleteInputsForDerivation: true,
});

// ── WS3 · Independent source verification ───────────────────────────────────
export const INDEPENDENT_SOURCE = Object.freeze({
  version: POLICY_VERSIONS.independentSourceVerificationVersion,
  // A second source that merely re-publishes the first is not a second source.
  requireEditoriallyIndependentPublisher: true,
  forbidUnattributedMirror: true,

  historicalHoldout: Object.freeze({
    fixtureRostersVerified: 8, ofTotal: 8,
    coachSeasonsVerified: 8, ofTotal: 8,
    seasonTeamIdentitiesVerified: 8, ofTotal: 8,
    coreTierARowsVerifiedFraction: 1.0,
  }),
  historicalCalibration: Object.freeze({
    minStratifiedFixtureFractionPerEra: 0.25,
    minFixturesPerEra: 1,
  }),
  calibrationPlayers: Object.freeze({
    minStratifiedPlayerSeasonFractionPerEra: 0.20,
    requireAllAmbiguousIdentities: true,
    requireAllAliasMigrations: true,
    requireAllCriticalHoldoutRoles: true,
  }),

  maxUnresolvedHoldoutMembershipDisputes: 0,
  maxUnresolvedCoachSeasonDisputes: 0,
  maxUnresolvedCriticalTargetDisagreements: 0,
  maxProhibitedSourceUses: 0,
  // Never resolve a disagreement toward the value that improves model fit.
  forbidFitDirectedResolution: true,
  forbidSilentAveraging: true,
});

// ── WS4 · Parameter identifiability ─────────────────────────────────────────
// The corpus holds 24 tunable historical fixtures. Simulation volume reduces
// Monte Carlo noise; it does not manufacture new independent historical
// examples. Tuning 53 parameters against 24 contexts would fit noise and call
// it calibration.
export const IDENTIFIABILITY = Object.freeze({
  version: POLICY_VERSIONS.parameterIdentifiabilityVersion,
  categories: Object.freeze([
    "IDENTIFIABLE", "WEAKLY_IDENTIFIABLE", "CONFOUNDED",
    "NO_MEASURABLE_EFFECT", "UNSUPPORTED_BY_TARGET_DATA", "FIXED_RULE_NOT_TUNABLE",
  ]),
  // Signal-to-noise measured against the paired-seed simulation noise SD.
  identifiableMinSnr: 3.0,
  weaklyIdentifiableMinSnr: 2.0,
  // Direction must hold across contexts, or the "effect" is fixture-specific.
  identifiableMinDirectionConsistency: 0.75,
  weaklyIdentifiableMinDirectionConsistency: 0.60,
  // Response-vector similarity above this cannot be separated by 24 contexts.
  confoundedMinCosineSimilarity: 0.90,
  // Rank/conditioning of the sensitivity matrix.
  maxAcceptableConditionNumber: 1000,

  perturbationFractionsOfRange: Object.freeze([-0.25, -0.10, 0.10, 0.25]),
  minPairedSeedsPerPerturbation: 400,

  // Movement limits by category, as a fraction of the registry-declared range.
  maxMovementIdentifiable: 1.0,
  maxMovementWeaklyIdentifiable: 0.15,
  maxMovementOther: 0.0,

  requireEveryParameterClassified: true,
  forbidTuningUnsupported: true,
  forbidTuningConfoundedTogether: true,
  // Classifications may not be loosened to enlarge the tunable set.
  forbidReclassificationToEnlargeTunableSet: true,
});

// ── WS5 · Calibration objective, folds and acceptance ───────────────────────
export const CALIBRATION = Object.freeze({
  objectiveVersion: POLICY_VERSIONS.calibrationObjectiveVersion,
  foldVersion: POLICY_VERSIONS.internalCalibrationFoldVersion,

  components: Object.freeze([
    "opportunityDistribution", "shotLocation", "teamEfficiency",
    "threePointEnvironment", "possessionEvents", "zoneBehavior",
    "coachIdentity", "adjustmentBehavior", "probabilityReliability",
    "syntheticGuardrail", "regularization",
  ]),
  forbidCollapsingToSingleOpaqueScore: true,
  requireAllComponentsReported: true,

  foldCount: 4,
  stratifyBy: Object.freeze(["eraStyleId", "teamId", "pace", "offensiveStyle", "defensiveStyle", "confidence"]),
  forbidHoldoutInFolds: true,
  freezeFoldMembershipBeforeTuning: true,

  // A candidate is accepted only if it generalises. Improving the tuning fold
  // alone is the definition of overfitting.
  requireTuningObjectiveImprovement: true,
  maxInternalValidationRelativeDegradation: 0.01,
  maxCriticalMetricRelativeRegression: 0.10,
  requireSyntheticGuardrailsPass: true,
  requireInvariantsPerfect: true,
  requireZeroFinalTies: true,
  requireParameterWithinRegistryBounds: true,
  requireAppendOnlyParameterHistory: true,

  // Never a per-player or per-team calibration exception.
  forbidPlayerSpecificExceptions: true,
  forbidTeamSpecificExceptions: true,
});

// ── WS11 · Probability revalidation ─────────────────────────────────────────
export const PROBABILITY = Object.freeze({
  analyticalBaselineBrier: 0.2507,      // Phase 6C2B, outcome scale
  constantBaselineBrier: 0.25,
  preCalibrationMonteCarloBrier: 0.2195, // Phase 6C2C1, outcome scale
  // Only outcome-scale Brier may be compared to these. Rate-scale Brier is a
  // different quantity and comparing them overstates skill ~100x.
  forbidCrossScaleBrierComparison: true,

  minFractionOfAchievableSkill: 0.75,
  maxExpectedCalibrationError: 0.10,
  maxMirrorDeviationFromHalf: 0.03,
  requireStrengthLadderMonotonic: true,
  minValidationGamesPerLadderRung: 256,
  requireSharpnessReported: true,
  requireFingerprintReplayExact: true,
  requirePredictionSeedsDisjointFromActualGame: true,
  requirePredictionSeedsDisjointFromValidation: true,
});

// ── WS12/13/14/15 · Lock and formal holdout acceptance ──────────────────────
export const HOLDOUT = Object.freeze({
  acceptancePolicyVersion: POLICY_VERSIONS.holdoutAcceptancePolicyVersion,
  validationVersion: POLICY_VERSIONS.holdoutValidationVersion,

  requireLockCommitPushedBeforeOpening: true,
  requireCleanWorkingTreeBeforeOpening: true,
  maxOpeningsPerSet: 1,
  requireAccessEventRecorded: true,
  forbidAnyParameterChangeAfterOpening: true,

  // The central quantitative gate. Holdout error is expected to be somewhat
  // worse than internal validation; the question is how much worse before the
  // calibration is judged to have fitted its own folds.
  maxHoldoutToInternalCompositeRatio: 1.50,
  maxCatastrophicFixtures: 0,
  catastrophicFixtureDefinition: "any fixture whose composite error exceeds 3x the internal-validation median, or any fixture producing an invariant failure",
  maxCriticalMetricRelativeRegressionVsInternal: 0.25,
  requireRoleHierarchyPreserved: true,
  requireIdentityDirectionallyPreserved: true,
  requireZeroInvariantFailures: true,
  requireZeroFinalTies: true,
  requireZeroSourceIntegrityFailures: true,
  minGamesPerHoldoutFixture: 1000,

  syntheticGuardrails: Object.freeze({
    requireZeroInvariantFailures: true,
    requireZeroImpossibleResults: true,
    forbidUniversalActionDominance: true,
    forbidUniversalShellDominance: true,
    maxSingleActionFamilyShare: 0.60,
    maxSingleShellWinRate: 0.65,
    minSingleShellWinRate: 0.35,
    requireSameSeedReplay: true,
    requireNewSeedVariance: true,
    requireConstructionCanBeatHigherOvr: true,
    requireExtremeTalentRemainsMeaningful: true,
  }),

  onFailure: "Mark HOLDOUT_FAILED. Do not retune against the opened set. Do not preview. Do not deploy. A future attempt requires a new unseen holdout.",
});

// ── WS16/17 · Private preview ───────────────────────────────────────────────
export const PRIVATE_PREVIEW = Object.freeze({
  version: POLICY_VERSIONS.privatePreviewValidationVersion,
  soak: Object.freeze({
    singleGames: 1000, bestOf7Series: 200, win82Seasons: 50,
    tournaments: 20, dailyConfigurations: 100, challenges: 100,
    monteCarloStandard: 100, monteCarloDeep: 50,
  }),
  minCoreSimulationSuccessRate: 0.999,
  maxInvariantFailures: 0,
  maxReplayFailures: 0,
  maxFinalTies: 0,
  maxUnexplained5xxRate: 0.005,
  maxGameApiP95Ms: 750,
  maxMonteCarloStandardP95Ms: 2500,
  maxCachedProbabilityP95Ms: 200,
  maxPrivateDataExposures: 0,
  maxProductionNamespaceWrites: 0,
  maxCalibrationOnlyPlayerExposures: 0,
  requireNoSideSymmetryRegression: true,
  requireNoStalePwaBundle: true,
  browserWidths: Object.freeze([375, 768, 1280, 1440, 1920, 2560]),
  maxHorizontalOverflowIncidents: 0,
  // Human review cannot be simulated. If real reviewers are unavailable the
  // gate is PENDING_REAL_REVIEW and production readiness may not be claimed.
  requireRealHumanReview: true,
  forbidFabricatedReviewerResponses: true,
  humanReviewBlocksProduction: true,
});

// ── WS18/19/20 · Production rollout ─────────────────────────────────────────
export const PRODUCTION = Object.freeze({
  version: POLICY_VERSIONS.productionRolloutPolicyVersion,
  requireExplicitCeoApproval: true,
  approvalPhrase: "GO LIVE",
  // A general instruction to complete the phase is NOT production approval.
  forbidInferredApproval: true,
  forbidSelfApproval: true,

  stages: Object.freeze([
    "Stage 0: flags off, code deployed",
    "Stage 1: shadow only",
    "Stage 2: 5% canary, eligible Single Game",
    "Stage 3: 25% Single Game",
    "Stage 4: 50% Single Game + Best of 7",
    "Stage 5: 100% Single Game + Best of 7",
    "Stage 6: Win 82 + Tournament",
    "Stage 7: Daily at next UTC boundary",
    "Stage 8: Challenges under new manifest",
  ]),
  forbidSkippingToFullRollout: true,
  forbidMixedEnginesWithinCompetitionObject: true,
  requireDailyActivationAtUtcBoundary: true,

  minCoreSuccessRate: 0.999,
  maxInvariantFailures: 0,
  maxReplayFailures: 0,
  maxUnexplained5xxRate: 0.005,
  maxChallengeCorruptions: 0,
  maxDailySplits: 0,
  maxResultSchemaIncompatibilities: 0,
  maxPwaStaleBundleIncidents: 0,
  maxPrivateDataLeaks: 0,
  maxCalibrationOnlyPlayerExposures: 0,

  requireRollbackTestedBeforeActivation: true,
  requireFallbackEngineRetained: "3.2.0",
  requireAllResultsRemainReplayable: true,
  forbidDeletingCalibratedResults: true,
  // Only claim a watch window that was actually observed.
  forbidClaimingUnobservedWatchWindow: true,
});

export const POLICY = Object.freeze({
  phase: "6C2C2",
  frozenBeforeResults: true,
  POLICY_VERSIONS, SIDE_SYMMETRY, TIER_B_COVERAGE, INDEPENDENT_SOURCE,
  IDENTIFIABILITY, CALIBRATION, PROBABILITY, HOLDOUT, PRIVATE_PREVIEW, PRODUCTION,
});

/** Stable hash of the whole policy. A silent edit changes this and fails a test. */
export const policyHash = () =>
  createHash("sha256").update(JSON.stringify(POLICY)).digest("hex");

/** The states a report may claim. Blurring them is how a phase lies. */
export const EVIDENCE_STATES = Object.freeze([
  "VERIFIED", "MEASURED", "CALIBRATED", "HOLDOUT_VALIDATED",
  "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_ACTIVE", "PARTIALLY_ACTIVE",
  "ROLLED_BACK", "BLOCKED",
]);
