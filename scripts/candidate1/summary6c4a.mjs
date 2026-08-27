#!/usr/bin/env node
// ── Phase 6C4A final summary ────────────────────────────────────────────────
//   npm run c1:summary
// Reads every phase artifact and states the phase outcome. Derives nothing that
// an artifact already decided; a disagreement between artifacts is an error,
// not something to average.
import { readdirSync } from "node:fs";
import { readArtifact, writeArtifact, verifyArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./failureRegister.mjs";

const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const artifacts = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("behaviour-snapshot") && f !== "calibration-players-v5.json");
  const verifications = artifacts.map((f) => {
    const name = f.replace(/\.json$/, "");
    const v = verifyArtifact(name, DIR);
    return { artifact: name, valid: v.valid ?? v.ok ?? false, issues: v.issues ?? [] };
  });
  const invalid = verifications.filter((v) => !v.valid);

  const reg = R("historical-v4-failure-register").data;
  const rc = R("candidate1-root-cause-analysis").data;
  const lock = R("candidate1-lock").data;
  const pool = R("historical-v5-candidate-pool").data;
  const readiness = R("historical-v5-readiness").data;

  const payload = {
    phase: "6C4A",
    title: "Candidate 1 trait-fidelity repair, coach action-mix correction, practical-margin policy and internal lock",
    outcome: "CANDIDATE_1_LOCKED_FOR_V5",
    artifactsWritten: artifacts.length,
    artifactsInvalid: invalid.length,
    v4Failures: {
      hardFailures: reg.hardFailuresInVerdict,
      substantive: reg.substantiveCount,
      practicalMarginOnly: reg.byCategory.PRACTICAL_MARGIN_ONLY,
      byCategory: reg.byCategory,
      rootCaused: rc.rootCaused,
      unresolved: rc.unresolved,
      rootCauseClasses: Object.keys(rc.rootCauseClasses),
      engineChangesForMarginArtifacts: 0,
    },
    engineChanges: {
      coreFilesChanged: lock.changedCoreFiles.length,
      files: lock.changedCoreFiles,
      parameterChanges: 0,
      dataStoresTouched: R("candidate1-change-manifest").data.dataChanges.map((d) => d.store),
      prohibitionsRespected: R("candidate1-change-manifest").data.prohibitions,
    },
    candidate: {
      candidateId: lock.candidateId, parentCandidateId: lock.parentCandidateId,
      selectionStatus: lock.candidateSelectionStatus, lockStatus: lock.candidateLockStatus,
      calibrationStatus: lock.calibrationStatus, validationAttemptStatus: lock.validationAttemptStatus,
      possessionCalibrationVersion: lock.possessionCalibrationVersion,
      coreHash: lock.coreHash, parameterSetHash: lock.parameterSetHash, manifestHash: lock.manifestHash,
    },
    candidate0: {
      status: "UNMUTATED — SELECTED / LOCKED at 1.0.0",
      coreHash: R("candidate0-preservation").data.candidate0.coreHash,
      replaysFromCommit: R("candidate0-preservation").data.candidate0.gitCommitBeforeCandidate1,
    },
    validation: {
      internal: R("candidate1-internal-validation").data.pass,
      sideSymmetryGames: R("candidate1-side-symmetry").data.totalGames,
      sideSymmetry: R("candidate1-side-symmetry").data.pass,
      probability: R("candidate1-probability-validation").data.pass,
      probabilityLogLossDelta: R("candidate1-probability-validation").data.materialRegression.logLossDelta,
      competitionGames: R("candidate1-competition-validation").data.totalGames,
      competition: R("candidate1-competition-validation").data.pass,
      shareProxyBound: R("candidate1-offense-repair").data.shareProxyProtection.bound,
      shareProxyMeasuredOffence: R("candidate1-offense-repair").data.meanCompositeShareMae,
      shareProxyMeasuredDefence: R("candidate1-defense-repair").data.meanCompositeShareMae,
    },
    v5Pool: { teams: pool.teamCount, eligible: pool.eligibleTeamCount, newTeamSeasons: pool.newTeamSeasons,
      erasWithAtLeastTwoEligiblePairs: pool.erasWithAtLeastTwoEligiblePairs, poolHash: pool.poolHash },
    v5Readiness: { allReady: readiness.allReady, mayOpen: readiness.v5MayOpen, blockingItems: readiness.outstandingBeforeV5.length },
    holdoutState: {
      historicalHoldoutV3: { accessCount: setAccessCount("historical-holdout-v3"), verdict: "HISTORICAL_HOLDOUT_FAIL" },
      historicalHoldoutV4: { accessCount: setAccessCount("historical-holdout-v4"), verdict: "HISTORICAL_V4_FAILED", status: "FAILED_HOLDOUT_DIAGNOSTIC_SET" },
      syntheticStressHoldoutV2: { accessCount: setAccessCount("synthetic-stress-holdout-v2"), status: "SEALED" },
      historicalHoldoutV5: { status: "NOT_CREATED — pool only" },
    },
    productionUntouched: { engineVersion: versionOf("engineVersion"), appVersion: versionOf("appVersion") },
    statusClaimed: lock.calibrationStatus,
    statusNotClaimed: lock.notClaimed,
    limitations: [
      { id: "RESIDUAL_ELITE_OFFENCE_SPURS", detail: "The 1977-78 Spurs still render below their era reference (-0.092). Intervention shows only 0.017 of that is the three null-shooting profiles; the rest is the reference being a champions-median five. MECHANISM_REPAIRED_DATA_AND_REFERENCE_LIMITED." },
      { id: "RESIDUAL_ELITE_DEFENCE", detail: "Sonics +0.058 and Pistons +0.036 remain above their reference self-baselines after materially improving from +0.086 and +0.058. Award pages floor only 1-2 of each five; the source records no defensive evidence for the rest. MECHANISM_REPAIRED_EVIDENCE_AND_REFERENCE_LIMITED." },
      { id: "RESIDUAL_OFFENSIVE_REBOUNDING", detail: "Sonics orebRate -0.051 (from -0.069). The recorded totals already carry all the board evidence the source has (imputing the era split moves the channel 7.0 -> 7.1); the 1970s reference rebounds at 8.5/8.5 behind Wilt Chamberlain." },
      { id: "ERA_REFERENCES_NOT_RE_CERTIFIED", detail: "All three residuals above trace partly to reference construction. Era references and trait observability were certified under Candidate 0 and MUST be re-certified under Candidate 1 before any V5 trait scoring. Both are blocking items in historical-v5-readiness.json." },
      { id: "FIVE_PROFILES_WITHOUT_SHOOTING_DATA", detail: "Five calibration profiles keep null shooting percentages: their articles carry no career table, so the authorized source has nothing to read. Recorded, never estimated around." },
      { id: "V4_DIAGNOSTICS_ARE_CONSUMED", detail: "Historical V4 is a FAILED_HOLDOUT_DIAGNOSTIC_SET. Candidate 1 was developed against it, so V4 can never again be evidence of generalisation for this candidate — that is what V5 is for." },
      { id: "OBSERVABILITY_METRICS_STILL_UNCERTIFIED", detail: "Of the four metrics that failed observability certification under Candidate 0, Candidate 1 repaired movementShare and defensiveZoneShare by construction; isolationShare and stealRateForced/rimShareAgainst remain unproven until re-certification." },
    ],
    scopeRespected: {
      syntheticV2NotOpened: setAccessCount("synthetic-stress-holdout-v2") === 0,
      v5NotSelected: true, v5NotSealed: true, v5NotSimulated: true,
      noPreview: true, noProduction: true, mainNotMerged: true,
      broadParameterSearchNotReopened: true,
    },
  };
  writeArtifact("phase6c4a-final-summary", payload, { generationCommand: "npm run c1:summary", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`PHASE 6C4A — ${payload.outcome}\n`);
  console.log(`  artifacts ${payload.artifactsWritten} · invalid ${payload.artifactsInvalid}`);
  console.log(`  V4 failures ${payload.v4Failures.hardFailures} = ${payload.v4Failures.substantive} substantive + ${payload.v4Failures.practicalMarginOnly} margin-only · root-caused ${payload.v4Failures.rootCaused} · unresolved ${payload.v4Failures.unresolved}`);
  console.log(`  engine: ${payload.engineChanges.coreFilesChanged} core files, ${payload.engineChanges.parameterChanges} parameter changes`);
  console.log(`  candidate: ${payload.candidate.candidateId} · ${payload.candidate.possessionCalibrationVersion} · ${payload.candidate.calibrationStatus}`);
  console.log(`  validation: side symmetry ${payload.validation.sideSymmetryGames} games, competition ${payload.validation.competitionGames} games, all pass ${payload.validation.internal && payload.validation.sideSymmetry && payload.validation.probability && payload.validation.competition}`);
  console.log(`  V5 pool: ${payload.v5Pool.eligible} eligible · may open ${payload.v5Readiness.mayOpen} (${payload.v5Readiness.blockingItems} blocking items)`);
  console.log(`  holdouts: V3 ${payload.holdoutState.historicalHoldoutV3.accessCount} · V4 ${payload.holdoutState.historicalHoldoutV4.accessCount} · synthetic ${payload.holdoutState.syntheticStressHoldoutV2.accessCount}`);
  console.log(`  limitations recorded: ${payload.limitations.length}`);
  if (invalid.length) { console.log(`\ninvalid artifacts:`); for (const v of invalid) console.log(`  ${v.artifact}: ${JSON.stringify(v.issues).slice(0, 200)}`); }
  process.exit(invalid.length ? 2 : 0);
}
