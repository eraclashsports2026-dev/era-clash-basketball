#!/usr/bin/env node
// ── Phase 6C3R final summary ────────────────────────────────────────────────
//   npm run validation:6c3r:summary
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "./preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const R = (n) => readArtifact(n, DIR).data;
  const pre = R("phase6c3r-preflight"); const reg = R("historical-trait-registry");
  const obs = R("observability-control-results"); const refs = R("era-reference-opponents");
  const pool = R("replacement-holdout-candidate-pool"); const manifest = R("historical-holdout-v4-manifest");
  const v4 = R("historical-holdout-v4-results"); const verdict = R("replacement-formal-verdict");
  const attempts = R("formal-validation-attempts"); const dry = R("historical-holdout-v4-dryrun");
  const def = defaultRuntimeParameterSet(); const live = buildCoreManifest();
  const flags = readFileSync("api/_lib/flags.js", "utf8");
  const flagNames = ["POSSESSION_ENGINE_ENABLED", "DEFENSIVE_MATCHUP_ENGINE_ENABLED", "ZONE_RESOLUTION_ENABLED",
    "EXPANDED_OFFENSIVE_ACTIONS_ENABLED", "OFFENSIVE_COACH_ADJUSTMENTS_ENABLED", "DAILY_COACH_ERA_ENABLED"];
  const flagsFalse = flagNames.filter((f) => new RegExp(`bool\\("${f}",\\s*false\\)`).test(flags)).length;

  const payload = {
    phase: "6C3R",
    finalVerdict: "HISTORICAL V4 FAILED — CANDIDATE REVALIDATION FAILED",
    candidate: {
      candidateId: "Candidate 0", candidateSelectionStatus: "SELECTED", candidateLockStatus: "LOCKED",
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      calibrationStatus: verdict.calibrationStatusAfterVerdict,
      parameterChanges: 0, parameterSetHash: def.parameterSetHash,
      candidateCoreHash: live.aggregateCoreHash,
      coreUnchangedAllPhase: live.aggregateCoreHash === pre.candidateCore?.aggregateCoreHash || live.aggregateCoreHash === v4.identity.coreHash,
      parameterDrift: activeParameters().filter((p) => def.values[p.id] !== p.defaultValue).length,
    },
    v3Preservation: { verdict: "HISTORICAL_HOLDOUT_FAIL", failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE",
      accessCount: setAccessCount("historical-holdout-v3"), neverRescored: true },
    traitFramework: {
      vocabulary: reg.counts.total, byClass: reg.counts.byClass,
      metricsCertified: obs.metricsCertified, metricsTotal: obs.metricsTotal,
      failedMetrics: obs.failedMetrics, finalEligibleTraits: obs.finalEligibleTraitCount,
      v3RubricRejectedByDetector: true,
    },
    eraReferences: { count: refs.total, certified: refs.certified, gamesEach: refs.gamesPerReference },
    candidatePool: { teams: pool.teamCount, eligibleTeams: pool.eligibleTeams, eligiblePairs: pool.eligiblePairs,
      erasWithTwoPlus: pool.erasWithAtLeastTwoEligiblePairs, candidateZeroOutputsUsed: 0,
      newVerifiedProfiles: 170, coachPagesNamingCoach: "34/34" },
    historicalV4: {
      matchups: v4.matchupsEvaluated, teams: manifest.teamCount, eras: v4.erasCovered.length,
      totalGames: v4.totalGames, accessCount: setAccessCount("historical-holdout-v4"),
      verdict: v4.verdict,
      numericRatio: v4.numeric.ratio, numericGate: v4.numeric.ratioGate,
      traitPassRate: v4.traits.passRate, hardFails: v4.traits.hardFails.length,
      gatesPassed: Object.values(v4.gates).filter(Boolean).length, gatesTotal: Object.keys(v4.gates).length,
      dryRunChecks: `${dry.checksPassed}/${dry.checksTotal}`,
    },
    syntheticV2: { verdict: "NOT_OPENED", accessCount: setAccessCount("synthetic-stress-holdout-v2"), state: "SEALED_UNREAD" },
    attempts: attempts.attempts.map((a) => ({ attemptId: a.attemptId, formalVerdict: a.formalVerdict, accessCount: a.accessCount ?? null })),
    previewPackage: { prepared: false, reason: "Preview preparation requires both formal holdouts passing.",
      deploymentCommandsExecuted: 0 },
    productionIsolation: {
      mainCommit: git("rev-parse", "main"),
      mainUnchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
      productionEngineVersion: versionOf("engineVersion"),
      developmentFlagsFalse: `${flagsFalse}/${flagNames.length}`,
      previewDeployments: 0, productionDeployments: 0,
    },
    nextPhase: {
      recommended: "Candidate revision addressing the specific trait-fidelity findings, then Historical Holdout V5 from unseen team-seasons, then a fresh validation cycle",
      requires: ["a new candidate version and parameter-set hash if engine behaviour changes",
        "a trait policy carrying practical-equivalence margins on the hard-fail rule",
        "a Historical Holdout V5 drawn from the 13 remaining eligible pool teams plus further source expansion"],
      ownerDecision: "Whether to revise the engine's coach-action and defensive-quality renderings or to accept trait-level infidelity as a scope limitation is a product decision, not an engineering one.",
    },
  };
  const { path } = writeArtifact("phase6c3r-final-summary", payload, {
    generationCommand: "npm run validation:6c3r:summary",
    sourceArtifacts: [`${DIR}/replacement-formal-verdict.json`, `${DIR}/historical-holdout-v4-results.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });

  console.log("PHASE 6C3R FINAL SUMMARY\n");
  console.log(`  FINAL VERDICT   ${payload.finalVerdict}`);
  console.log(`  candidate       ${payload.candidate.candidateId} · ${payload.candidate.candidateLockStatus} · v${payload.candidate.possessionCalibrationVersion} · ${payload.candidate.calibrationStatus} · drift ${payload.candidate.parameterDrift}`);
  console.log(`  V3              ${payload.v3Preservation.verdict} (${payload.v3Preservation.failureClass}) · access ${payload.v3Preservation.accessCount} · never rescored`);
  console.log(`  traits          ${payload.traitFramework.vocabulary} classified · ${payload.traitFramework.metricsCertified}/${payload.traitFramework.metricsTotal} metrics certified · ${payload.traitFramework.finalEligibleTraits} eligible`);
  console.log(`  references      ${payload.eraReferences.certified}/${payload.eraReferences.count} certified`);
  console.log(`  pool            ${payload.candidatePool.eligibleTeams}/${payload.candidatePool.teams} teams · ${payload.candidatePool.eligiblePairs} pairs · ${payload.candidatePool.newVerifiedProfiles} new profiles`);
  console.log(`  V4              ${payload.historicalV4.verdict} · ratio ${payload.historicalV4.numericRatio} · traits ${payload.historicalV4.traitPassRate} · hard fails ${payload.historicalV4.hardFails} · ${payload.historicalV4.totalGames} games · access ${payload.historicalV4.accessCount}`);
  console.log(`  synthetic V2    ${payload.syntheticV2.verdict} · access ${payload.syntheticV2.accessCount}`);
  console.log(`  preview         prepared ${payload.previewPackage.prepared} · deploy commands ${payload.previewPackage.deploymentCommandsExecuted}`);
  console.log(`  main            unchanged ${payload.productionIsolation.mainUnchanged} · engine ${payload.productionIsolation.productionEngineVersion} · flags ${payload.productionIsolation.developmentFlagsFalse}`);
  console.log(`\nwrote ${path}`);
}
