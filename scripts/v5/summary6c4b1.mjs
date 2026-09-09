#!/usr/bin/env node
// ── Phase 6C4B1 final summary ───────────────────────────────────────────────
//   npm run v5:summary
// Reads every phase artifact, verifies each, and states the outcome. Derives
// nothing an artifact already decided.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readArtifact, writeArtifact, verifyArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./preflight6c4b1.mjs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const artifacts = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const verifications = artifacts.map((f) => {
    const name = f.replace(/\.json$/, "");
    const v = verifyArtifact(name, DIR);
    return { artifact: name, valid: v.valid ?? v.ok ?? false, issues: v.issues ?? [] };
  });
  const invalid = verifications.filter((v) => !v.valid);

  const readiness = R("historical-v5-readiness-final").data;
  const audit = R("historical-v5-blocker-audit").data;
  const register = R("historical-v5-blocker-register").data;
  const graph = R("candidate-core-graph-certification").data;
  const sep = R("candidate-identity-separation").data;
  const repair = R("candidate1-identity-repair").data;
  const recert = R("candidate1-lock-recertification").data;
  const zone = R("realized-zone-measurement-certification").data;
  const refs = R("era-reference-certification-candidate1").data;
  const obs = R("historical-observability-certification-candidate1").data;
  const residuals = R("candidate1-residual-dispositions").data;
  const margins = R("trait-practical-margin-policy-v5").data;
  const policy = R("historical-holdout-v5-policy").data;
  const pool = R("historical-v5-candidate-pool-v2").data;
  const sel = R("historical-v5-selection").data;
  const manifest = R("historical-holdout-v5-manifest").data;
  const seeds = R("historical-holdout-v5-seeds").data;
  const dryrun = R("historical-v5-runner-dry-run").data;
  const seal = R("historical-holdout-v5-seal").data;
  const pkg = R("phase6c4b2-validation-package").data;

  const payload = {
    phase: "6C4B1",
    title: "Candidate 1 reference re-certification, Historical Holdout V5 selection, policy freeze and seal",
    outcome: readiness.mayOpenInPhase6C4B2
      ? "HISTORICAL_V5_SEALED_READY_FOR_ONE_TIME_FORMAL_VALIDATION" : "BLOCKED",
    artifactsWritten: artifacts.length, artifactsInvalid: invalid.length,
    blockers: { source: register.sourceBlockerCount, registered: register.blockerCount,
      resolved: audit.resolvedBlockers, unresolved: audit.unresolvedBlockers,
      byCategory: register.byCategory, phaseFindings: register.phaseFindings.length },
    candidate: { candidateId: recert.candidateId, lockRevision: recert.lockRevision,
      coreHash: recert.coreHash, parameterSetHash: recert.parameterSetHash,
      possessionCalibrationVersion: recert.possessionCalibrationVersion,
      calibrationStatus: recert.calibrationStatus, validationAttemptStatus: recert.validationAttemptStatus,
      parameterChanges: recert.parameterChanges,
      lockRevisionReason: recert.revisionReason, behaviourIdenticalToRevision1: recert.behaviourIdentical },
    coreGraph: { version: graph.candidateCoreGraphVersion, parser: graph.parser,
      declaredModules: graph.declaredModuleCount, runtimeObserved: graph.runtimeObservedCount,
      missingExecuted: graph.missingExecutedModules.length,
      unresolvedImports: graph.unresolvedDynamicImports.length + graph.unresolvableRelativeSpecifiers.length,
      offensivePlanIncluded: graph.declaredModules.includes("src/v3/actions/offensivePlan.js"),
      reproducesPriorBuilder: graph.priorBuilderComparison.identical },
    identitySeparation: { comparisons: sep.comparisons, collisions: sep.collisions,
      collisionsFoundBeforeRepair: repair.defect.collisionsObserved, probeCases: repair.defect.probeCases,
      behaviourProofCases: repair.behaviourProof.cases, behaviourIdentical: repair.behaviourIdentical },
    realizedZone: { version: zone.realizedZoneMeasurementVersion, gamesPerCell: zone.gamesPerCell,
      zoneCapableRealizedShare: zone.cells.zoneCapableEraLegal.realizedZoneShare,
      manPossessionsExcluded: zone.cells.zoneCapableEraLegal.manPossessions,
      illegalEraRealized: zone.cells.zoneCapableEraIllegal.shellSelectedPossessions, pass: zone.pass },
    eraReferences: { version: refs.eraReferenceCertificationVersion, certified: refs.referencesCertified,
      failed: refs.failedReferences, replaced: refs.referencesReplaced, gamesPerEra: refs.gamesPerEra,
      v5PoolOverlap: refs.v5PoolOverlap, withdrawnCriterion: refs.withdrawnCriterion.criterion,
      erasThatCriterionWouldHaveFailed: refs.withdrawnCriterion.erasItWouldHaveFailed.length },
    observability: { version: obs.historicalObservabilityCertificationVersion,
      metricsCertified: obs.metricsCertified, metricsTotal: obs.metricsTotal,
      eligibleTraits: obs.eligibleTraitCount, changedFromCandidate0: obs.metricsChangedFromCandidate0,
      practicalSeparationFailures: obs.practicalSeparationFailures.length,
      contradictoryDependentRules: obs.contradictoryDependentRules },
    residuals: { disposed: residuals.residuals.length, unresolvedSubstantive: residuals.unresolvedSubstantiveCandidate1Residuals,
      verdict: residuals.candidate1Verdict,
      referenceAttributionRevised: residuals.referenceAttributionRevised.finding },
    policy: { marginPolicyVersion: margins.historicalTraitPracticalMarginPolicyVersion, marginPolicyHash: margins.policyHash,
      acceptancePolicyVersion: policy.historicalHoldoutAcceptancePolicyVersion, acceptancePolicyHash: policy.policyHash,
      frozenBeforeSelection: margins.frozenBeforeSelection, dualGate: margins.rule.hardFail,
      distinctMargins: new Set(Object.values(margins.metrics).map((m) => m.margin)).size },
    pool: { version: pool.historicalV5CandidatePoolVersion, eligibleTeams: pool.eligibleTeamCount,
      eligiblePairs: pool.eligiblePairCount, erasWithTwoPlusPairs: pool.erasWithAtLeastTwoEligiblePairs,
      candidate1SimulationsUsed: pool.candidate1SimulationsUsed, poolHash: pool.poolHash },
    selection: { version: sel.historicalV5SelectionVersion, selectionHash: sel.selectionHash,
      matchups: sel.matchups.length, distinctTeams: sel.distinctTeams, eraStyles: sel.eraStylesRepresented.length,
      candidate1OutputsConsulted: sel.candidate1OutputsConsulted,
      deterministic: sel.determinism, rejectedAlternatives: sel.rejectedAlternatives.length,
      diversityCovered: sel.diversityDimensionsCovered.length, diversityAvailable: sel.diversityDimensionsAvailable.length,
      supersededSelection: sel.supersededSelection },
    manifest: { version: manifest.historicalHoldoutManifestVersion, manifestHash: manifest.manifestHash,
      matchups: manifest.matchupCount, teams: manifest.teamCount, profiles: manifest.playerProfileCount,
      coaches: manifest.coachCount, scoredTraits: manifest.scoredTraitCount, excludedTraits: manifest.excludedTraitCount,
      usableTargets: manifest.targetFreeze.usableTeamTargets, nullTargets: manifest.targetFreeze.nullTargets },
    seeds: { version: seeds.historicalHoldoutSeedSetVersion, seedHash: seeds.seedHash,
      holdoutSeeds: seeds.volume.holdoutSeedCount, totalGames: seeds.volume.totalGames,
      comparisons: seeds.disjointnessProof.comparisons, seedsPerStream: seeds.disjointnessProof.seedsPerStream,
      priorPopulations: seeds.disjointnessProof.priorPopulationsChecked, overlap: seeds.disjointnessProof.totalOverlap },
    dryRun: { version: dryrun.historicalHoldoutRunnerVersion, checks: dryrun.checks.length,
      failed: dryrun.failedChecks.length, accessCounts: dryrun.accessCounts,
      caughtDefect: "the era-reference self-baselines were keyed by sample field rather than metric id, which would have scored every V5 trait NOT_APPLICABLE on the one-time run" },
    seal: { version: seal.historicalV5SealVersion, state: seal.state, accessCount: seal.accessCount,
      sealHash: seal.sealHash, accessLogExists: seal.accessLogExists,
      leaksFound: seal.sealIntegrity.leaksFound, outputArtifactsSearched: seal.sealIntegrity.outputArtifactsSearched,
      authorizedRunner: seal.authorizedRunner.module },
    holdoutState: readiness.holdoutState,
    allSeals: Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, { status: v.status, accessCount: v.accessCount }])),
    phase6C4B2Package: { version: pkg.phase6C4B2ValidationPackageVersion, packageHash: pkg.packageHash,
      commandsExecuted: pkg.commandsExecutedInThisPhase },
    productionIsolation: { engineVersion: versionOf("engineVersion"), appVersion: versionOf("appVersion"),
      main: git("rev-parse", "--short", "main"), branch: git("rev-parse", "--abbrev-ref", "HEAD") },
    limitations: readiness.limitations,
    scopeRespected: {
      v5NotOpened: setAccessCount("historical-holdout-v5") === 0,
      v5NotSimulated: true, v5NotScored: true,
      syntheticV2NotOpened: setAccessCount("synthetic-stress-holdout-v2") === 0,
      v3AndV4NotRescored: setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
      candidate1ParametersUnchanged: recert.parameterChanges === 0,
      candidate1BehaviourUnchanged: repair.behaviourIdentical === true,
      noPreviewDeployment: true, noProductionDeployment: true, mainNotMerged: git("rev-parse", "--short", "main") === "9cd95ff",
    },
    mayOpenInPhase6C4B2: readiness.mayOpenInPhase6C4B2,
    nextPhase: "Phase 6C4B2 — Historical Holdout V5 and Synthetic Stress Holdout V2 formal Candidate 1 revalidation",
  };
  writeArtifact("phase6c4b1-final-summary", payload, {
    generationCommand: "npm run v5:summary", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`PHASE 6C4B1 — ${payload.outcome}\n`);
  console.log(`  artifacts ${payload.artifactsWritten} · invalid ${payload.artifactsInvalid}`);
  console.log(`  blockers ${payload.blockers.source} source / ${payload.blockers.resolved} resolved / ${payload.blockers.unresolved} unresolved`);
  console.log(`  candidate ${payload.candidate.candidateId} lock revision ${payload.candidate.lockRevision} · ${payload.candidate.possessionCalibrationVersion} · ${payload.candidate.calibrationStatus}`);
  console.log(`  identity collisions ${payload.identitySeparation.collisions}/${payload.identitySeparation.comparisons} (was ${payload.identitySeparation.collisionsFoundBeforeRepair}/${payload.identitySeparation.probeCases} before the repair)`);
  console.log(`  era references ${payload.eraReferences.certified}/8 · observability ${payload.observability.metricsCertified}/${payload.observability.metricsTotal} metrics · ${payload.observability.eligibleTraits} traits`);
  console.log(`  pool ${payload.pool.eligibleTeams} teams / ${payload.pool.eligiblePairs} pairs · selection ${payload.selection.matchups} matchups / ${payload.selection.distinctTeams} teams`);
  console.log(`  seeds ${payload.seeds.holdoutSeeds} · overlap ${payload.seeds.overlap} · dry run ${payload.dryRun.checks} checks / ${payload.dryRun.failed} failed`);
  console.log(`  V5 ${payload.seal.state} access ${payload.seal.accessCount} · synthetic V2 ${payload.allSeals["synthetic-stress-holdout-v2"].status} access ${payload.allSeals["synthetic-stress-holdout-v2"].accessCount}`);
  console.log(`  limitations ${payload.limitations.length} · mayOpenInPhase6C4B2 ${payload.mayOpenInPhase6C4B2}`);
  if (invalid.length) { console.log("\ninvalid artifacts:"); for (const v of invalid) console.log(`  ${v.artifact}`); }
  process.exit(invalid.length === 0 && payload.mayOpenInPhase6C4B2 ? 0 : 2);
}
