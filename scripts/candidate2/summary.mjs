#!/usr/bin/env node
// ── the phase summary, rendered from artifacts ──────────────────────────────
//   npm run c2:summary
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR, git } from "./preflight.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const R = (n) => readArtifact(n, DIR).data;
  const pf = R("phase6c4c1-preflight"), reg = R("historical-v5-diagnostic-register");
  const pol = R("candidate2-repair-policy"), ao = R("assisted-offense-diagnosis");
  const ds = R("defensive-suppression-diagnosis"), chg = R("candidate2-change-manifest");
  const idn = R("candidate2-identity-separation"), cmp = R("candidate2-vs-candidate1");
  const rem = R("remaining-v5-diagnostic-results"), lock = R("candidate2-lock");
  const pool = R("historical-v6-candidate-pool"), rdy = R("historical-v6-readiness");
  const compat = R("synthetic-v2-candidate2-compatibility"), sym = R("candidate2-side-symmetry");
  const comp = R("candidate2-competition-validation"), iv = R("candidate2-internal-validation");

  const payload = {
    phase: "6C4C1", phaseType: "TARGETED_REPAIR_AND_INTERNAL_LOCK",
    question: "can Candidate 2 repair the two independent Historical V5 failures generically, preserve everything Candidate 1 did well, and lock ready for an unseen Historical Holdout V6?",
    answer: lock.candidateLockStatus === "LOCKED" ? "Yes." : "No.",
    finalVerdict: lock.candidateLockStatus === "LOCKED"
      ? "CANDIDATE 2 LOCKED — READY FOR HISTORICAL V6 PREPARATION"
      : "CANDIDATE 2 NOT LOCKED — INTERNAL VALIDATION FAILED",

    preservedState: { candidate0: "LOCKED at 1.0.0, untouched", candidate1: "LOCKED at 1.1.0, untouched, zero drift",
      historicalV3: 1, historicalV4: 1, historicalV5: 1,
      syntheticV2AccessCount: setAccessCount("synthetic-stress-holdout-v2"),
      historicalV5Role: "FAILED_HOLDOUT_DIAGNOSTIC_SET" },

    reconciliationsAtPreflight: pf.reconciliations,

    diagnosticRegister: { nominalFailures: reg.nominalFailingInstances,
      formalHardFailLabels: reg.formalHardFailInstances,
      independentEvidenceClusters: reg.independentEvidenceClusters,
      practicalMarginContained: reg.practicalMarginContainedInstances,
      defensiveSurvey: reg.defensiveSuppressionSurvey.patternCharacterisation },

    rootCauses: {
      assistedOffense: { firstDivergence: ao.firstDivergence.layer,
        evidence: ao.firstDivergence.evidence, conclusion: ao.firstDivergence.conclusion },
      defensiveSuppression: { layer: ds.rootCause.layer,
        engineRespondsCorrectly: ds.rootCause.engineRespondsCorrectly,
        inversion: ds.rootCause.fault3_theInversion,
        undecidableEras: ds.rootCause.fault4_undecidableEras },
    },

    repairs: chg.changes.map((c) => ({ changeId: c.changeId, file: c.file,
      clusters: c.failureClustersAddressed, rootCause: c.rootCause })),
    repairProperties: { entityHardcodes: chg.entityHardcodes, flatBonuses: chg.flatBonuses,
      parameterChanges: chg.parameterChanges, dataChanges: chg.dataChanges,
      registryParametersAtDefault: activeParameters().length },

    candidate2: { id: "Candidate 2", parent: "Candidate 1",
      coreHash: lock.coreHash, parameterSetHash: lock.parameterSetHash,
      calibrationVersion: lock.possessionCalibrationVersion,
      possessionEngineVersion: versionOf("possessionEngineVersion"),
      defensiveMatchupVersion: versionOf("defensiveMatchupVersion"),
      identityCollisions: idn.collisionCount,
      selectionStatus: lock.candidateSelectionStatus, lockStatus: lock.candidateLockStatus,
      calibrationStatus: lock.calibrationStatus, formalValidationStatus: lock.formalValidationStatus },

    comparison: { criteriaEvaluated: cmp.criteriaEvaluated, criteriaPassed: cmp.criteriaPassed,
      criteriaFailed: cmp.criteriaFailed, identicalSeeds: cmp.identicalSeeds,
      gamesPerCandidate: cmp.gamesPerCandidate,
      assistLadder: { candidate1: cmp.ladders.candidate1.assist, candidate2: cmp.ladders.candidate2.assist },
      defenceLadder: { candidate1: cmp.ladders.candidate1.defence, candidate2: cmp.ladders.candidate2.defence } },

    thresholdCorrectionsRecorded: [
      pol.regressionGuardrails.performance.thresholdCorrection,
      "the in-harness side-symmetry cells ran 1,600 games, where one standard error of the paired difference is 0.0125; a single 2-sigma cell out of five cannot separate structure from noise. The claim moved to a dedicated 8,000-games-per-cell measurement across eight era and coach mirrors, plus an asymmetric side swap, both run under each candidate.",
    ],

    globalValidation: { replayMismatches: iv.replay.mismatches,
      invariantViolations: iv.structuralTotals.invariantViolations,
      finalTies: iv.structuralTotals.finalTies, astGtFgm: iv.structuralTotals.astGtFgm,
      sideSymmetryCellsContainingHalf: `${sym.atPower.cellsContainingHalf}/${sym.atPower.cells.length} at ${sym.atPower.gamesPerCell} games`,
      asymmetricSwapConsistentWithZero: { candidate1: sym.candidate1AtPower.asymmetricSideSwap.consistentWithZero,
        candidate2: sym.atPower.asymmetricSideSwap.consistentWithZero },
      competition: { meanSeriesLength: comp.meanSeriesLength, meanSeasonWins: comp.meanSeasonWins,
        seriesInvariants: comp.seriesInvariants, seasonInvariants: comp.seasonInvariants } },

    v5FindingResolution: { counts: rem.resolutionCounts, unresolved: rem.unresolved,
      dataLimitations: rem.dataLimitations, historicalV5NotRescored: rem.historicalV5NotRescored },

    historicalV6: { poolReady: rdy.poolReady, eligibleTeams: pool.eligibleCount,
      pairsByEra: pool.pairsByEra, candidate2SimulationsUsed: pool.candidate2SimulationsUsed,
      notSelected: pool.notSelected, notSealed: pool.notSealed, notSimulated: pool.notSimulated,
      storesRead: pool.storesRead },

    syntheticV2: { accessCount: compat.accessCount, disposition: compat.disposition,
      dispositionReason: compat.dispositionReason, whatMustBeRebound: compat.whatMustBeRebound },

    production: { mainCommit: git("rev-parse", "main"),
      unchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
      productionEngineVersion: "3.2.0", previewDeployments: 0, productionDeployments: 0,
      mergedToMain: false, productionFlagsChanged: 0 },

    statusesNotClaimed: { notClaimed: lock.notClaimed,
      why: "Candidate 2 is locked for development and scoped to a future Historical Holdout V6. It has run no formal validation. A locked candidate is not a validated one." },

    nextPhase: "Phase 6C4C2 — Historical Holdout V6 selection, policy freeze, seal and Synthetic Candidate 2 rebinding",
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: lock.candidateLockStatus === "LOCKED" && cmp.pass && rem.unresolved === 0 && rdy.poolReady,
  };
  payload.summaryHash = createHash("sha256").update(JSON.stringify({
    verdict: payload.finalVerdict, coreHash: lock.coreHash, criteria: cmp.criteriaPassed })).digest("hex");
  writeArtifact("phase6c4c1-final-summary", payload, {
    generationCommand: "npm run c2:summary", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("PHASE 6C4C1 SUMMARY\n");
  console.log(`  ${payload.finalVerdict}`);
  console.log(`  Candidate 2: ${payload.candidate2.selectionStatus} / ${payload.candidate2.lockStatus} / ${payload.candidate2.calibrationStatus} / formal ${payload.candidate2.formalValidationStatus}, calibration ${payload.candidate2.calibrationVersion}`);
  console.log(`  acceptance ${payload.comparison.criteriaPassed}/${payload.comparison.criteriaEvaluated}, V5 findings unresolved ${payload.v5FindingResolution.unresolved}`);
  console.log(`  V6 pool ${payload.historicalV6.eligibleTeams} teams, Candidate 2 simulations used ${payload.historicalV6.candidate2SimulationsUsed}`);
  console.log(`  Synthetic V2 access ${payload.syntheticV2.accessCount}, disposition ${payload.syntheticV2.disposition}`);
  console.log(`  summaryHash ${payload.summaryHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
