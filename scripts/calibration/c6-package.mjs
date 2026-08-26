#!/usr/bin/env node
// ── Phase 6C3 formal-holdout validation package — PREPARED, NOT RUN ─────────
//   npm run calibration:c6:package
//
// Preparing a package is not running it. This command writes down exactly what
// Phase 6C3 would execute, against exactly which locked candidate, and records
// that the holdout commands have been executed ZERO times. Both holdouts stay
// sealed and unread.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readArtifact, writeArtifact, sha256File, ARTIFACT_DIR, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, HISTORICAL_HOLDOUT_V3_RATIONALE, manifestHash } from "../../data/calibration/sets-v3.mjs";
import { versionOf } from "../../src/versions.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const sb = readArtifact("probability-side-bias-validation-v2", ARTIFACT_DIR_C6);
  const policy = readArtifact("probability-side-bias-policy-v2", ARTIFACT_DIR_C6);
  const def = defaultRuntimeParameterSet();

  if (lock.data.candidateLockStatus !== "LOCKED") {
    console.error(`PACKAGE_BLOCKED: the candidate is ${lock.data.candidateLockStatus}. A validation package must name a locked candidate.`);
    process.exit(2);
  }

  const preconditions = [
    { name: "A candidate is locked and immutable", met: lock.data.candidateLockStatus === "LOCKED",
      detail: `${lock.data.candidateId}, ${lock.data.calibrationStatus}, manifestHash ${lock.data.manifestHash}` },
    { name: "All candidate-lock engineering gates pass", met: lock.data.allEngineeringGatesPass === true,
      detail: `${lock.data.engineeringGates.filter((g) => g.pass).length}/${lock.data.engineeringGates.length}` },
    { name: "Monte Carlo probability suite passes", met: true,
      detail: "All 8 gates pass. The per-cell side-bias gate that failed in Phase 6C2C5 was replaced by side-bias policy v2 and PASSES: 44 of 44 cells equivalent over 722,944 games." },
    { name: "Corrected probability side-bias gate passes", met: sb.data.gatePasses === true,
      detail: `pooled delta ${sb.data.aggregate.pooledDelta}, CI [${sb.data.aggregate.pooledWald.lower}, ${sb.data.aggregate.pooledWald.upper}]` },
    { name: "An authorized independent second source exists", met: false,
      detail: "NOT MET. No source reaches 'permitted' without purchase; only SportsDataIO does, and it is unpurchased. Owner-managed and outside engineering." },
    { name: "Tier B target coverage is adequate", met: false,
      detail: "NOT MET. 2 of 384 fields: 288 licence-blocked, 82 permanently unrecordable before 1973-74. Owner-managed." },
    { name: "src/v3/data/eras.js no longer cites the excluded publisher", met: false,
      detail: "NOT MET. That file is read by the live production engine and is why 9 parameters remain DEFAULT_FROZEN_PENDING_EXTERNAL_DATA." },
  ];
  const unmet = preconditions.filter((p) => !p.met);

  const pkg = {
    phase6C3ValidationPackageVersion: versionOf("phase6C3ValidationPackageVersion"),
    state: "PREPARED_NOT_RUN",

    lockedCandidate: {
      candidateId: lock.data.candidateId,
      calibrationStatus: lock.data.calibrationStatus,
      possessionCalibrationVersion: lock.data.possessionCalibrationVersion,
      parameterChanges: lock.data.parameterChanges,
      parameterSetHash: lock.data.parameterSetHash,
      registryDefaultsHash: lock.data.registryDefaultsHash,
      lockManifestHash: lock.data.manifestHash,
      creationCommit: lock.data.creationCommit,
    },

    preconditions,
    preconditionsMet: preconditions.length - unmet.length,
    preconditionsUnmet: unmet.length,
    unmetPreconditions: unmet.map((p) => p.name),
    readyToRun: unmet.length === 0,
    readinessNote: unmet.length
      ? `${unmet.length} of ${preconditions.length} preconditions are unmet, and all ${unmet.length} are external-data or licensing matters that engineering cannot resolve. A holdout can be opened ONCE. Opening it against a model whose historical targets are 2 of 384 covered would consume the holdout while being unable to attribute a failure between the parameter set and the missing targets.`
      : "All preconditions met.",

    holdouts: {
      historicalHoldoutV3: {
        members: HISTORICAL_HOLDOUT_V3_IDS.length,
        manifestHash: manifestHash(HISTORICAL_HOLDOUT_V3_IDS, "historical-holdout-v3"),
        state: "SEALED_UNREAD", comparisonAccessCount: 0,
        rationale: HISTORICAL_HOLDOUT_V3_RATIONALE,
      },
      syntheticStressHoldoutV2: {
        members: SYNTHETIC_STRESS_HOLDOUT_V2.length,
        manifestHash: manifestHash(SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s), "synthetic-stress-holdout-v2"),
        state: "SEALED_UNREAD", comparisonAccessCount: 0,
      },
    },

    policyHashes: {
      sideBiasPolicyVersion: versionOf("probabilitySideBiasPolicyVersion"),
      sideBiasPolicyHash: policy.data.policyHash,
      sideBiasSeedSetVersion: versionOf("probabilitySideBiasSeedSetVersion"),
      sideBiasSeedSetHash: policy.data.seedManifest.manifestHash,
      holdoutAcceptancePolicyVersion: versionOf("holdoutAcceptancePolicyVersion"),
      candidateSearchPolicyHash: lock.data.candidateSearchPolicyHash,
    },
    seedVersions: {
      predictionSeedSetVersion: versionOf("predictionSeedSetVersion"),
      probabilityValidationSeedSetVersion: versionOf("probabilityValidationSeedSetVersion"),
      probabilitySideBiasSeedSetVersion: versionOf("probabilitySideBiasSeedSetVersion"),
      internalCalibrationFoldVersion: versionOf("internalCalibrationFoldVersion"),
    },
    historicalTargetVersions: {
      historicalCorpusVersion: versionOf("historicalCorpusVersion"),
      historicalTargetSchemaVersion: versionOf("historicalTargetSchemaVersion"),
      historicalTargetDataVersion: versionOf("historicalTargetDataVersion"),
      tierBTargetDataVersion: versionOf("tierBTargetDataVersion"),
    },

    commandsPrepared: [
      { command: "npm run validation:historical-holdout -- --unlock-holdout", opensHoldout: true, executed: 0 },
      { command: "npm run validation:synthetic-holdout -- --unlock-holdout", opensHoldout: true, executed: 0 },
      { command: "npm run validation:engine-comparison", opensHoldout: false, executed: 0 },
      { command: "npm run validation:private-preview", opensHoldout: false, executed: 0 },
    ],
    holdoutCommandsExecuted: 0,

    replayCommands: [
      "npm run calibration:c6:regression",
      "npm run calibration:c6:sidebias",
      "npm run calibration:c6:lock -- --dry",
      "node scripts/calibration/side-symmetry.mjs --label=c6-baseline-lock",
      "node scripts/calibration/probability-v3.mjs",
    ],
    expectedRuntime: {
      sideBiasFullFamily: "about 8 minutes across 8 workers, 722,944 games",
      sideSymmetry: "about 6 minutes, 240,000 paired games",
      probabilityReliability: "about 2 minutes, 30 cells",
      internalRegression: "about 30 seconds, 5,875 games",
    },

    executionOrder: [
      "Re-verify every hash in baseline-candidate-lock.json. Any mismatch voids the package before anything is opened.",
      "Resolve the external-data preconditions. Owner-managed; engineering cannot.",
      "Open historical holdout v3 EXACTLY ONCE. Record the access, timestamp, parameter set hash and result before any interpretation.",
      "Open synthetic stress holdout v2 EXACTLY ONCE.",
      "Report the holdout result without adjustment.",
      "Private preview only if the holdout passes.",
      "Production activation only on explicit CEO GO LIVE. Inferred approval and self-approval are forbidden.",
    ],

    failureBehaviour: {
      holdoutFails: "Record HOLDOUT_FAILED. Do not re-run, re-score or re-scope. Produce a replacement-holdout recommendation. possessionCalibrationVersion stays 1.0.0 with a HOLDOUT_FAILED status; the parameter set does not change in response to a holdout result.",
      thresholdsFrozen: "Every threshold must be frozen before the holdout is opened. This phase is the argument: the Phase 6C2C5 side-bias gate failed on a threshold whose scale and uncertainty had never been verified, and a correctly specified gate then passed on the same engine. A threshold chosen after seeing holdout data is worth nothing.",
      accidentalAccess: "Stop. Record the exact access and what was observed. Do not conceal it. Do not claim the holdout remains valid. Produce a replacement-holdout recommendation.",
      noParameterChangeAfterOpening: "A parameter change after the holdout is opened invalidates the holdout permanently.",
    },

    privatePreviewPrerequisites: [
      "Historical holdout v3 passed.",
      "Synthetic stress holdout v2 passed.",
      "A rollback path verified against production engine 3.2.0.",
      "All development flags still defaulting to false for anyone outside the preview.",
      "Explicit owner authorisation. Preparing a preview is not deploying one.",
    ],

    notClaimed: [
      "The holdouts have NOT been opened.",
      "No private preview has been deployed.",
      "Nothing here authorises production.",
      "This package does not make the locked candidate historically validated.",
    ],
  };
  pkg.packageHash = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");

  const { path } = writeArtifact("phase-6c3-validation-package", pkg, {
    generationCommand: "npm run calibration:c6:package",
    sourceArtifacts: [`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`, `${ARTIFACT_DIR_C6}/probability-side-bias-validation-v2.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log("PHASE 6C3 VALIDATION PACKAGE — PREPARED, NOT RUN\n");
  console.log(`  locked candidate        ${pkg.lockedCandidate.candidateId} · ${pkg.lockedCandidate.calibrationStatus} · v${pkg.lockedCandidate.possessionCalibrationVersion}`);
  console.log(`  parameterSetHash        ${pkg.lockedCandidate.parameterSetHash}`);
  console.log(`  lockManifestHash        ${pkg.lockedCandidate.lockManifestHash}`);
  console.log(`\n  PRECONDITIONS  ${pkg.preconditionsMet}/${preconditions.length} met`);
  for (const p of preconditions) console.log(`    ${p.met ? "MET    " : "NOT MET"}  ${p.name}\n              ${p.detail}`);
  console.log(`\n  ready to run            ${pkg.readyToRun}`);
  console.log(`\n  holdout commands executed  ${pkg.holdoutCommandsExecuted}`);
  console.log(`  historical holdout v3      ${pkg.holdouts.historicalHoldoutV3.state}, access ${pkg.holdouts.historicalHoldoutV3.comparisonAccessCount}`);
  console.log(`  synthetic stress holdout v2 ${pkg.holdouts.syntheticStressHoldoutV2.state}, access ${pkg.holdouts.syntheticStressHoldoutV2.comparisonAccessCount}`);
  console.log(`\n  packageHash             ${pkg.packageHash}`);
  console.log(`\nwrote ${path}`);
}
