#!/usr/bin/env node
// ── Phase 6C3 final summary ─────────────────────────────────────────────────
//   npm run validation:summary
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "./preflight.mjs";
import { versionOf } from "../../src/versions.js";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const pre = readArtifact("phase6c3-preflight", ARTIFACT_DIR_6C3).data;
  const core = readArtifact("candidate-core-manifest", ARTIFACT_DIR_6C3).data;
  const dry = readArtifact("holdout-pipeline-dryrun", ARTIFACT_DIR_6C3).data;
  const ref = readArtifact("internal-reference-baseline", ARTIFACT_DIR_6C3).data;
  const hist = readArtifact("historical-holdout-results", ARTIFACT_DIR_6C3).data;
  const verd = readArtifact("formal-holdout-verdict", ARTIFACT_DIR_6C3).data;
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
  const def = defaultRuntimeParameterSet();

  const previewArtifacts = ["preview-integration-manifest", "preview-deployment", "preview-smoke-results",
    "preview-soak-results", "preview-browser-qa", "preview-security-results", "private-preview-verdict"];
  const previewPresent = previewArtifacts.filter((n) => existsSync(`${ARTIFACT_DIR_6C3}/${n}.json`));

  const flags = readFileSync("api/_lib/flags.js", "utf8");
  const flagNames = ["POSSESSION_ENGINE_ENABLED", "DEFENSIVE_MATCHUP_ENGINE_ENABLED", "ZONE_RESOLUTION_ENABLED",
    "EXPANDED_OFFENSIVE_ACTIONS_ENABLED", "OFFENSIVE_COACH_ADJUSTMENTS_ENABLED", "DAILY_COACH_ERA_ENABLED"];
  const flagsFalse = flagNames.filter((f) => new RegExp(`bool\\("${f}",\\s*false\\)`).test(flags));

  const payload = {
    phase: "6C3",
    finalVerdict: "HOLDOUT FAILED — CANDIDATE NOT VALIDATED",
    workstreamsCompleted: ["WS0 preflight", "WS1 policy and core manifest", "WS2 pipeline dry run",
      "WS3 historical holdout", "WS5 formal verdict"],
    workstreamsNotRun: ["WS4 synthetic holdout", "WS6 engine comparison", "WS7 preview integration",
      "WS8 preview deployment", "WS9 preview smoke", "WS10 preview soak", "WS11 browser QA",
      "WS12 preview verdict", "WS13 handoff"],
    workstreamsNotRunReason: "The frozen failure policy: on a historical holdout failure, do not open the synthetic holdout, do not deploy preview, end the phase with a formal failure verdict.",

    repository: {
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      headCommit: git("rev-parse", "HEAD"),
      mainCommit: git("rev-parse", "main"),
      mainUnchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
      workingTreeClean: (git("status", "--porcelain") ?? "") === "",
    },

    lockedCandidate: {
      candidateId: lock.candidateId, calibrationStatus: verd.calibrationStatusAfterVerdict,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      parameterChanges: lock.parameterChanges, parameterSetHash: def.parameterSetHash,
      lockManifestHash: lock.manifestHash,
      coreHash: core.aggregateCoreHash, coreFileCount: core.fileCount,
      activeParameterCount: activeParameters().length,
      coreUnchangedSinceHoldout: buildCoreManifest().aggregateCoreHash === core.aggregateCoreHash,
      parameterDrift: activeParameters().filter((p) => def.values[p.id] !== p.defaultValue).map((p) => p.id),
    },

    preflight: { formalValidationMayBegin: pre.formalValidationMayBegin, failedGates: pre.failedGates },
    dryRun: { checksPassed: dry.checksPassed, checksTotal: dry.checksTotal, allPass: dry.allPass },
    referenceBaseline: {
      internalCompositeMean: ref.baseline.internalCompositeMean,
      fixturesContributing: ref.baseline.fixturesContributing,
      sealedFixturesUsed: ref.sealedFixturesUsed,
      referenceHash: ref.referenceHash,
    },

    historicalHoldout: {
      verdict: hist.verdict, accessCountBefore: hist.accessCountBefore, accessCountAfter: hist.accessCountAfter,
      fixtures: hist.fixturesEvaluated, gamesPerFixture: hist.gamesPerFixture, totalGames: hist.totalGames,
      erasCovered: hist.erasCovered.length,
      internalCompositeMae: hist.internalBaseline.mean, holdoutCompositeMae: hist.holdoutComposite,
      ratio: hist.holdoutToInternalRatio, ratioGate: hist.ratioGate,
      gatesPassed: Object.values(hist.gates).filter(Boolean).length, gatesTotal: Object.keys(hist.gates).length,
      failedGates: Object.entries(hist.gates).filter(([, v]) => !v).map(([k]) => k),
      supportedScope: hist.supportedScope,
      runHash: hist.runHash,
    },
    syntheticHoldout: { verdict: verd.syntheticHoldout.verdict, accessCount: setAccessCount("synthetic-stress-holdout-v2"), state: "SEALED_UNREAD" },

    formalVerdict: {
      combined: verd.combinedVerdict, verdictHash: verd.verdictHash,
      calibrationStatus: verd.calibrationStatusAfterVerdict,
      postHoldoutTuning: verd.candidateImmutability.postHoldoutTuning,
      diagnosis: verd.diagnosis.rootCause,
      traitsFailedOnMirrorAmbiguousMetrics: verd.diagnosis.traitsFailedOnMirrorAmbiguousMetrics,
      traitsFailedOnValidMetrics: verd.diagnosis.traitsFailedOnValidMetrics,
      scoredTraits: verd.diagnosis.scoredTraits,
    },

    privatePreview: {
      status: "NOT_ATTEMPTED",
      reason: "Gated on a passing holdout. Both integration and deployment were skipped.",
      artifactsPresent: previewPresent,
      artifactsExpectedAbsent: previewArtifacts.length,
    },
    privateUserReviewStatus: "PRIVATE_USER_REVIEW_PENDING",
    privateUserReviewNote: "No external user review was conducted, and none is claimed. No browser QA was run either, because there is no validated candidate to preview.",

    productionIsolation: {
      mainUnchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
      productionEngineVersion: versionOf("engineVersion"),
      productionEngineUnchanged: versionOf("engineVersion") === "3.2.0",
      developmentFlagsDefaultingFalse: flagsFalse.length,
      developmentFlagsChecked: flagNames.length,
      allFlagsFalse: flagsFalse.length === flagNames.length,
      productionDeployments: 0,
      previewDeployments: 0,
      productionNamespaceWrites: 0,
      publicHoldoutOrCalibrationEndpointsAdded: 0,
    },

    nextPhase: {
      recommended: "Replacement historical holdout, then a re-attempt of Phase 6C3",
      notRecommended: "Phase 7 UI integration — it depends on a holdout-validated backend candidate, and there is not one.",
      blockers: verd.replacementHoldoutRecommendation.beforeReRunning,
      ownerDecision: verd.replacementHoldoutRecommendation.candidateDecision,
    },
  };

  const { path } = writeArtifact("phase6c3-final-summary", payload, {
    generationCommand: "npm run validation:summary",
    sourceArtifacts: [`${ARTIFACT_DIR_6C3}/formal-holdout-verdict.json`, `${ARTIFACT_DIR_6C3}/historical-holdout-results.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });

  console.log("PHASE 6C3 FINAL SUMMARY\n");
  console.log(`  FINAL VERDICT              ${payload.finalVerdict}`);
  console.log(`  calibration status         ${payload.formalVerdict.calibrationStatus}`);
  console.log(`  possessionCalibrationVersion ${payload.lockedCandidate.possessionCalibrationVersion}`);
  console.log(`\n  historical holdout        ${payload.historicalHoldout.verdict}  access ${payload.historicalHoldout.accessCountBefore} -> ${payload.historicalHoldout.accessCountAfter}`);
  console.log(`    gates                   ${payload.historicalHoldout.gatesPassed}/${payload.historicalHoldout.gatesTotal}  failed: ${payload.historicalHoldout.failedGates.join(", ")}`);
  console.log(`    generalisation ratio    ${payload.historicalHoldout.ratio}  (gate <= ${payload.historicalHoldout.ratioGate})`);
  console.log(`  synthetic holdout         ${payload.syntheticHoldout.verdict}  access ${payload.syntheticHoldout.accessCount}`);
  console.log(`\n  candidate core unchanged  ${payload.lockedCandidate.coreUnchangedSinceHoldout}`);
  console.log(`  parameter drift           ${payload.lockedCandidate.parameterDrift.length}`);
  console.log(`  post-holdout tuning       ${payload.formalVerdict.postHoldoutTuning}`);
  console.log(`\n  preview                   ${payload.privatePreview.status}  (artifacts present: ${payload.privatePreview.artifactsPresent.length})`);
  console.log(`  private user review       ${payload.privateUserReviewStatus}`);
  console.log(`\n  main unchanged            ${payload.productionIsolation.mainUnchanged}`);
  console.log(`  production engine         ${payload.productionIsolation.productionEngineVersion}`);
  console.log(`  dev flags false           ${payload.productionIsolation.developmentFlagsDefaultingFalse}/${payload.productionIsolation.developmentFlagsChecked}`);
  console.log(`  production deployments    ${payload.productionIsolation.productionDeployments}`);
  console.log(`\nwrote ${path}`);
}
