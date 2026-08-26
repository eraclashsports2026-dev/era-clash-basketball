// ── Validation-attempt version registry (Phase 6C3R) ────────────────────────
// Deliberately SEPARATE from src/versions.js, and the separation is the point:
// src/versions.js is inside the frozen candidate core — it is one of the 52
// files whose aggregate hash the holdout verdicts assert — so adding validation
// version keys there would mutate the candidate core, which is exactly the
// thing a validation phase is forbidden to do. Result-affecting versioning
// lives in the frozen core; validation-ATTEMPT versioning lives here, outside
// it, because validation must be able to evolve while the candidate cannot.
//
// Nothing in the engine imports this file. A test asserts it stays out of the
// candidate core closure.
export const VALIDATION_VERSIONS = Object.freeze({
  formalValidationAttemptRegistryVersion: "1.0.0",
  historicalTraitRegistryVersion: "1.0.0",
  historicalMeasurementSurfaceVersion: "1.0.0",
  historicalReferenceOpponentVersion: "1.0.0",
  observabilityCertificationVersion: "1.0.0",
  replacementHoldoutSelectionVersion: "1.0.0",
  historicalHoldoutSetVersion: "4.0.0",
  historicalHoldoutManifestVersion: "4.0.0",
  historicalHoldoutSeedSetVersion: "2.0.0",
  historicalHoldoutAcceptancePolicyVersion: "2.0.0",
  historicalHoldoutRunnerVersion: "2.0.0",
  formalValidationAttemptVersion: "2.0.0",
  formalHoldoutVerdictVersion: "2.0.0",
  replacementValidationPackageVersion: "1.0.0",
  // The v4 corpus/players/targets stores. The in-core calibrationPlayerDataVersion
  // string cannot be bumped without mutating the core, so the v4 STORE carries
  // its own version here and every v4 artifact records both.
  calibrationPlayerStoreV4Version: "1.0.0",
  historicalCorpusV4Version: "1.0.0",
  historicalTargetsV4Version: "1.0.0",
});

export const validationVersionOf = (k) => {
  if (!(k in VALIDATION_VERSIONS)) throw new Error(`validationVersionOf: unknown key "${k}"`);
  return VALIDATION_VERSIONS[k];
};
