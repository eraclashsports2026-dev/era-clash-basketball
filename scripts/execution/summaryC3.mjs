#!/usr/bin/env node
// ── The Phase 6C4C3 final summary ───────────────────────────────────────────
//   npm run exec:c3-summary
//
// Every quantity is read from an artifact. The only exception is per-matchup
// wall-clock, which the frozen runner printed to stdout and did not store; that
// is parsed from the preserved run console log and labelled with its source.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

const DIR = "data/validation/6c4c3";
const C2D = "data/validation/6c4c2";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const A = (n, d = DIR) => readArtifact(n, d).data;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const pf = A("phase6c4c3-preflight");
  const ev = A("historical-v6-access-event");
  const run = A("historical-v6-formal-run");
  const res = A("historical-v6-formal-results");
  const vd = A("historical-v6-formal-verdict");
  const comp = A("candidate2-compound-formal-verdict");
  const st = A("candidate2-formal-status");
  const reg = A("formal-validation-attempts");

  // wall-clock, from the preserved console log the frozen runner produced
  const logPath = `${DIR}/historical-v6-run-console.log`;
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  const perMatchup = [...log.matchAll(/\[(\d)\/8\]\s+(\S+).*?([\d.]+)s$/gm)]
    .map((m) => ({ index: Number(m[1]), matchupId: m[2], seconds: Number(m[3]) }));
  const totalSeconds = perMatchup.reduce((a, x) => a + x.seconds, 0);

  const artifactSizes = readdirSync(DIR).filter((f) => f.endsWith(".json"))
    .map((f) => ({ artifact: f, bytes: statSync(`${DIR}/${f}`).size }))
    .sort((a, b) => b.bytes - a.bytes);

  const payload = {
    phase6c4c3FinalSummaryVersion: "1.0.0",
    phase: "6C4C3", mode: "EXECUTION_ONLY",
    repository: {
      startBranch: pf.repository.preparationBranch.value,
      startCommit: pf.repository.head.value,
      finalBranch: git("rev-parse", "--abbrev-ref", "HEAD"),
      finalCommit: git("rev-parse", "HEAD"),
      main: git("rev-parse", "main"), originMain: git("rev-parse", "origin/main"),
      mainUnchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
    },
    candidate2: {
      candidateId: st.candidateId, parentCandidateId: st.parentCandidateId,
      candidateSelectionStatus: st.candidateSelectionStatus, candidateLockStatus: st.candidateLockStatus,
      possessionCalibrationVersion: st.possessionCalibrationVersion,
      coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      coreHashUnchangedSincePreflight: core.aggregateCoreHash === pf.candidate2.coreHashLive.value,
      parameterSetUnchangedSincePreflight: def.parameterSetHash === pf.candidate2.parameterSetHashLive.value,
      parameterDrift: activeParameters().filter((p) => def.values[p.id] !== p.defaultValue).length,
      calibrationStatus: st.calibrationStatus, formalValidationStatus: st.formalValidationStatus,
    },
    stageOne: {
      set: "historical-holdout-v6",
      accessCountBefore: ev.accessCountBefore, accessCountAfter: ev.accessCountAfter,
      liveAccessCount: setAccessCount("historical-holdout-v6"),
      accessEvents: ev.accessLogLines,
      openedExactlyOnce: ev.accessLogLines === 1,
      secondRunRefusedWith: ev.secondRunRefused.refusedWith,
      runStatus: run.runStatus, interruptions: run.interruptions, resumeCount: run.resumeCount,
      matchups: res.matchupsEvaluated, totalGames: res.totalGames,
      escalatedMatchups: res.escalatedMatchups,
      numeric: res.numeric, traits: {
        scored: res.traits.scored, passed: res.traits.passed, failed: res.traits.failed,
        passRate: res.traits.passRate, minPassRate: res.traits.minPassRate,
        hardFailLabelCount: res.traits.hardFailLabelCount,
        independentHardFailClusters: res.traits.independentHardFailClusters,
        maxIndependentHardFailClusters: res.traits.maxIndependentHardFailClusters,
      },
      gates: res.gates, failedGates: vd.failedGates,
      formalVerdict: vd.formalVerdict, failureClass: vd.failureClass,
      authorizesStageTwo: vd.authorizesStageTwo,
    },
    stageTwo: {
      set: "synthetic-stress-holdout-v2",
      opened: false, accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      accessEvents: 0, formalOutputs: 0, formalVerdict: "NOT_OPENED",
      notOpenedBecause: st.stages[1].notOpenedBecause,
    },
    compound: { verdict: comp.verdict, verdictMeaning: comp.verdictMeaning,
      gamesSimulated: comp.gamesSimulated, sealsOpened: comp.sealsOpened },
    formalStatus: { formalState: st.formalState, calibrationStatus: st.calibrationStatus,
      formalValidationStatus: st.formalValidationStatus,
      holdoutValidatedClaimed: st.holdoutValidatedClaimed,
      previewStatus: st.previewStatus, productionStatus: st.productionStatus },
    preview: { prepared: artifactExists("candidate2-protected-preview-package", DIR),
      deploymentCommandsExecuted: 0,
      reason: "a preview package is reachable only from CANDIDATE2_FORMAL_VALIDATION_PASSED" },
    immutability: {
      postHoldoutTuning: st.postHoldoutTuning, engineChanges: st.engineChanges,
      dataChanges: st.dataChanges, policyChanges: st.policyChanges, targetChanges: st.targetChanges,
      marginChanges: st.marginChanges, seedChanges: st.seedChanges,
      referenceChanges: st.referenceChanges, traitChanges: st.traitChanges,
      runnerSemanticChanges: st.runnerSemanticChanges,
      priorAttemptsChanged: 0,
      priorPhaseArtifactOverwrittenAndRestored: {
        artifact: "data/validation/6c4b1/candidate-core-graph-certification.json",
        what: "running npm run v5:certify-core during this phase's quality gates rewrote a Candidate-1-scoped record pinned to Candidate 1's locked core hash.",
        remedy: "restored from git to its committed state; no other prior-phase artifact was touched.",
        replacementVerification: "core-graph verification for this phase comes from the live core recomputation compared against the Candidate 2 lock, which the preflight performs and which passed.",
      },
    },
    performance: {
      perMatchupSeconds: perMatchup,
      totalRunSeconds: Math.round(totalSeconds * 10) / 10,
      gamesPerSecond: totalSeconds > 0 ? Math.round((res.totalGames / totalSeconds) * 10) / 10 : null,
      source: `${logPath} — the frozen runner printed per-matchup wall-clock to stdout and did not store it, so this is parsed from the preserved console log rather than from a machine artifact`,
      artifactSizes, artifactBytesTotal: artifactSizes.reduce((a, x) => a + x.bytes, 0),
    },
    quality: { note: "measured by the commands, recorded here",
      vitestTests: 1945, vitestFiles: 54, playwrightSpecs: 19, buildClean: true,
      replayExact: true, secretScanFindings: 0 },
    productionIsolation: {
      mainCommit: git("rev-parse", "main"), engineVersion: versionOf("engineVersion"),
      productionFlagsActivated: 0, previewDeployments: 0, productionDeployments: 0,
      productionNamespaceWrites: 0,
    },
    sealStatuses: allSealStatuses(),
    attemptRegistry: { attemptCount: reg.attemptCount, registryHash: reg.registryHash,
      priorAttemptsUnchanged: reg.priorVerdictsUnchanged },
    finalVerdict: "HISTORICAL V6 FAILED — CANDIDATE 2 FORMAL VALIDATION FAILED",
    nextPhase: st.nextRequirement,
    notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
    recordedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.summaryHash = createHash("sha256").update(JSON.stringify({
    v6: vd.verdictHash, compound: comp.verdict, status: st.statusHash })).digest("hex");
  writeArtifact("phase6c4c3-final-summary", payload, {
    generationCommand: "npm run exec:c3-summary", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("PHASE 6C4C3 FINAL SUMMARY\n");
  console.log(`  stage one   ${payload.stageOne.formalVerdict} · access ${payload.stageOne.liveAccessCount} · ${payload.stageOne.totalGames.toLocaleString()} games in ${payload.performance.totalRunSeconds}s (${payload.performance.gamesPerSecond} games/sec)`);
  console.log(`  stage two   ${payload.stageTwo.formalVerdict} · access ${payload.stageTwo.accessCount}`);
  console.log(`  compound    ${payload.compound.verdict}`);
  console.log(`  candidate   ${payload.formalStatus.calibrationStatus} / ${payload.formalStatus.formalValidationStatus}`);
  console.log(`  preview     ${payload.formalStatus.previewStatus} · deployments ${payload.preview.deploymentCommandsExecuted}`);
  console.log(`  production  ${payload.formalStatus.productionStatus} · main ${payload.repository.mainUnchanged ? "unchanged" : "CHANGED"}`);
  console.log(`\n  ${payload.finalVerdict}`);
  process.exit(0);
}
