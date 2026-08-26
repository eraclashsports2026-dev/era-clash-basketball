#!/usr/bin/env node
// ── Record attempt 2 in the validation-attempt registry ─────────────────────
//   npm run validation:6c3r:attempts
import { readArtifact, writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";

if (import.meta.url === `file://${process.argv[1]}`) {
  const prior = readArtifact("formal-validation-attempts", DIR).data;
  const v4 = readArtifact("historical-holdout-v4-results", DIR).data;
  const verdict = readArtifact("replacement-formal-verdict", DIR).data;
  const def = defaultRuntimeParameterSet();

  const attempts = {
    ...prior,
    candidateStatus: { ...prior.candidateStatus,
      calibrationStatus: verdict.calibrationStatusAfterVerdict },
    attempts: [
      { ...prior.attempts[0], supersededBy: "attempt-2-historical-v4 — supersession as the valid revalidation attempt; the V3 FAIL record itself is permanent" },
      {
        attemptId: "attempt-2-historical-v4",
        holdoutVersion: VALIDATION_VERSIONS.historicalHoldoutSetVersion,
        candidateId: "Candidate 0",
        candidateCommit: v4.identity.candidateCommit,
        candidateCoreHash: v4.identity.coreHash,
        parameterSetHash: v4.identity.parameterSetHash,
        policyHash: v4.identity.policyHash,
        seedVersion: `${VALIDATION_VERSIONS.historicalHoldoutSeedSetVersion} (stream historical-holdout-v4, hash ${v4.identity.seedSetHash.slice(0, 16)}...)`,
        accessEvent: v4.accessEvent,
        accessCount: setAccessCount("historical-holdout-v4"),
        formalVerdict: "HISTORICAL_HOLDOUT_V4_FAIL",
        failureClass: "CANDIDATE_TRAIT_FIDELITY_FAILURE_ON_A_VALID_SURFACE",
        createdAt: "phase-6c3r", completedAt: "phase-6c3r",
        supersededBy: null, immutable: true,
        invalidRunRecovery: verdict.historicalV4.invalidRunRecovery,
      },
      {
        attemptId: "synthetic-v2",
        holdoutVersion: "2.0.0",
        formalVerdict: "NOT_OPENED",
        accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        reason: "The frozen failure policy forbids opening the synthetic holdout after a historical failure.",
      },
    ],
    replacementValidationStatus: "FAILED",
    syntheticHoldoutV2Status: "SEALED_UNREAD",
  };
  const { path } = writeArtifact("formal-validation-attempts", attempts, {
    generationCommand: "npm run validation:6c3r:attempts",
    sourceArtifacts: [`${DIR}/historical-holdout-v4-results.json`, `${DIR}/replacement-formal-verdict.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });
  console.log(`attempts: ${attempts.attempts.map((a) => `${a.attemptId}=${a.formalVerdict}`).join(" · ")}`);
  console.log(`replacementValidationStatus ${attempts.replacementValidationStatus} · calibrationStatus ${attempts.candidateStatus.calibrationStatus}`);
  console.log(`wrote ${path}`);
}
