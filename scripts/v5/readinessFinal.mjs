#!/usr/bin/env node
// ── WS14: final V5 readiness and the Phase 6C4B2 package ────────────────────
//   npm run v5:readiness
//
// Every value is read from an artifact. Nothing here recomputes a count a
// producing artifact already decided.
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  const preflight = R("phase6c4b1-preflight").data;
  const audit = R("historical-v5-blocker-audit").data;
  const graph = R("candidate-core-graph-certification").data;
  const sep = R("candidate-identity-separation").data;
  const zone = R("realized-zone-measurement-certification").data;
  const refs = R("era-reference-certification-candidate1").data;
  const obs = R("historical-observability-certification-candidate1").data;
  const residuals = R("candidate1-residual-dispositions").data;
  const margins = R("trait-practical-margin-policy-v5").data;
  const policy = R("historical-holdout-v5-policy").data;
  const pool = R("historical-v5-candidate-pool-v2").data;
  const selPolicy = R("historical-v5-selection-policy").data;
  const sel = R("historical-v5-selection").data;
  const manifest = R("historical-holdout-v5-manifest").data;
  const seeds = R("historical-holdout-v5-seeds").data;
  const dryrun = R("historical-v5-runner-dry-run").data;
  const seal = R("historical-holdout-v5-seal").data;
  const recert = R("candidate1-lock-recertification").data;

  console.log("FINAL V5 READINESS\n");
  const flags = {
    candidate1LockValid: gate("candidate1LockValid", preflight.candidate1LockValid && recert.candidateLockStatus === "LOCKED",
      `${recert.candidateId} · ${recert.candidateSelectionStatus}/${recert.candidateLockStatus}/${recert.calibrationStatus} · attempt ${recert.validationAttemptStatus}`),
    candidate1CoreStable: gate("candidate1CoreStable", graph.pass && seal.candidate.coreHash === recert.coreHash,
      `core ${recert.coreHash.slice(0, 16)}... (lock revision ${recert.lockRevision}); parser-backed graph, ${graph.missingExecutedModules.length} executed-but-undeclared modules`),
    identitySeparationCertified: gate("identitySeparationCertified", sep.pass && sep.collisions === 0,
      `${sep.collisions} collisions across ${sep.comparisons} identity-surface comparisons`),
    realizedZoneMeasurementCertified: gate("realizedZoneMeasurementCertified", zone.pass,
      `four states never collapsed; illegal-era realized zone ${zone.cells.zoneCapableEraIllegal.shellSelectedPossessions}`),
    eraReferencesCertified: gate("eraReferencesCertified", refs.pass && refs.referencesCertified === 8,
      `${refs.referencesCertified}/8 certified under Candidate 1 across ${refs.gamesPerEra * 8} paired games, ${refs.referencesReplaced} replaced`),
    historicalObservabilityCertified: gate("historicalObservabilityCertified", obs.pass
      && obs.scoredTraitsWithFailedObservability === 0 && obs.contradictoryDependentRules === 0,
      `${obs.metricsCertified}/${obs.metricsTotal} metrics certified, ${obs.eligibleTraitCount} traits eligible`),
    candidate1ResidualsDisposed: gate("candidate1ResidualsDisposed", residuals.pass
      && residuals.unresolvedSubstantiveCandidate1Residuals === 0,
      `${residuals.residuals.length} residuals disposed, ${residuals.unresolvedSubstantiveCandidate1Residuals} unresolved · ${residuals.candidate1Verdict}`),
    practicalMarginPolicyFrozen: gate("practicalMarginPolicyFrozen", margins.frozen === true && policy.frozen === true
      && margins.policyHash === policy.hashes.practicalMarginPolicyHash,
      `margin ${margins.policyHash.slice(0, 16)}... · acceptance ${policy.policyHash.slice(0, 16)}...`),
    candidatePoolValid: gate("candidatePoolValid", pool.pass && pool.eligibleTeamCount >= 24
      && pool.erasWithAtLeastTwoEligiblePairs === 8 && pool.candidate1SimulationsUsed === 0,
      `${pool.eligibleTeamCount} eligible teams, ${pool.eligiblePairCount} pairs, ${pool.candidate1SimulationsUsed} candidate simulations used`),
    selectionDeterministic: gate("selectionDeterministic", sel.pass && sel.determinism.repeatIdentical
      && sel.determinism.reversedIdentical && sel.determinism.rotatedIdentical && sel.candidate1OutputsConsulted === 0,
      `8 matchups, 16 distinct teams, reorder-invariant, ${sel.candidate1OutputsConsulted} candidate outputs consulted`),
    manifestValid: gate("manifestValid", manifest.pass && manifest.matchupCount === 8 && manifest.playerProfileCount === 80,
      `${manifest.matchupCount} matchups, ${manifest.playerProfileCount} profiles, ${manifest.coachCount} coaches, ${manifest.scoredTraitCount} scored traits`),
    seedsDisjoint: gate("seedsDisjoint", seeds.pass && seeds.disjointnessProof.totalOverlap === 0,
      `${seeds.disjointnessProof.comparisons} comparisons at ${seeds.disjointnessProof.seedsPerStream} seeds, ${seeds.disjointnessProof.totalOverlap} collisions`),
    runnerDryRunPassed: gate("runnerDryRunPassed", dryrun.pass, `${dryrun.checks.length} checks on the exact runner path`),
    v5Sealed: gate("v5Sealed", seal.state === "SEALED_UNREAD" && seal.pass, `${seal.state} · sealHash ${seal.sealHash.slice(0, 16)}...`),
    v5AccessCountZero: gate("v5AccessCountZero", setAccessCount("historical-holdout-v5") === 0
      && !existsSync(SEALED_SETS["historical-holdout-v5"]), "access count 0, no access log on disk"),
    syntheticV2StillSealed: gate("syntheticV2StillSealed", setAccessCount("synthetic-stress-holdout-v2") === 0,
      "synthetic-stress-holdout-v2 access 0"),
    allBlockersResolved: gate("allBlockersResolved", audit.pass && audit.unresolvedBlockers === 0
      && audit.totalBlockers === audit.resolvedBlockers,
      `${audit.resolvedBlockers}/${audit.totalBlockers} resolved, ${audit.unresolvedBlockers} unresolved`),
    productionUntouched: gate("productionUntouched", versionOf("engineVersion") === "3.2.0"
      && versionOf("appVersion") === "2.7.2" && git("rev-parse", "--short", "main") === "9cd95ff",
      `engine ${versionOf("engineVersion")} · app ${versionOf("appVersion")} · main ${git("rev-parse", "--short", "main")}`),
  };
  const mayOpen = Object.values(flags).every(Boolean);

  const readiness = {
    historicalV5ReadinessFinalVersion: "1.0.0",
    ...flags,
    mayOpenInPhase6C4B2: mayOpen,
    gatesFailed: fail,
    candidate: { candidateId: recert.candidateId, lockRevision: recert.lockRevision,
      coreHash: recert.coreHash, parameterSetHash: recert.parameterSetHash,
      possessionCalibrationVersion: recert.possessionCalibrationVersion,
      calibrationStatus: recert.calibrationStatus, validationAttemptStatus: recert.validationAttemptStatus },
    holdoutState: {
      historicalHoldoutV3: { state: "CONSUMED", accessCount: setAccessCount("historical-holdout-v3"), verdict: "FAIL", failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE" },
      historicalHoldoutV4: { state: "CONSUMED", accessCount: setAccessCount("historical-holdout-v4"), verdict: "FAIL", failureClass: "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE" },
      historicalHoldoutV5: { state: seal.state, accessCount: setAccessCount("historical-holdout-v5"), verdict: "NOT_RUN" },
      syntheticStressHoldoutV2: { state: "SEALED_UNREAD", accessCount: setAccessCount("synthetic-stress-holdout-v2") },
    },
    limitations: [
      { id: "PAIR_TYPES_ALL_SAME_ERA_CONTRAST", detail: "All eight selected pairs are typed SAME_ERA_CONTRAST_PAIR. The pool was not built with head-to-head source verification, so no actual-opponent label could be earned honestly. One selected pair (2020-21 Knicks vs 2020-21 76ers) is same-season and could be verified as ACTUAL_REGULAR_SEASON_OPPONENTS by a future source check; the others are cross-season and cannot be actual opponents by construction." },
      { id: "FOUR_METRICS_UNCERTIFIED", detail: `${obs.failedMetrics.join(", ")} remain uncertified under Candidate 1. threeShare, stealRateForced and rimShareAgainst fail practical separation — their maximal control range is smaller than their own practical margin — and isolationShare fails its neutral-cell floor. Traits claiming them are excluded before scoring, never scored weakly.` },
      { id: "NINETIES_REFERENCE_DISCRIMINATION", detail: "The 1990s era reference separates its three era calibration teams by only 0.011 points per possession, the narrowest of the eight. It passes every frozen criterion, but a V5 offensive-quality finding in the 1990s rests on a reference that distinguishes its own era's champions weakly." },
      { id: "REFERENCE_ZONE_SHARE_ZERO", detail: "Realized zone share is 0 for all eight era references: calibration-profile fives cannot reach the zone shells' personnel gates. defensiveZoneShare is certified on public-card controls but is not observable on the reference surface, so no V5 trait is scored on it." },
      { id: "MODULE_VERSIONS_STALE", detail: "Every engine module version reads the same under Candidate 1 as under Candidate 0 although several modules changed semantics. The calibration version separates the candidates in every identity surface so no collision remains, but module-level provenance is imprecise. Recommended for the Candidate 2 lock procedure, not repairable without invalidating Candidate 1's lock." },
      { id: "V4_DIAGNOSTICS_CONSUMED", detail: "Candidate 1 was developed against Historical V4's diagnostics, so V4 can never again be evidence of generalisation for this candidate. That is precisely what V5 exists to provide, and why it must be opened exactly once." },
    ],
  };
  writeArtifact("historical-v5-readiness-final", readiness, {
    generationCommand: "npm run v5:readiness", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── the Phase 6C4B2 package ───────────────────────────────────────────────
  const pkg = {
    phase6C4B2ValidationPackageVersion: VALIDATION_VERSIONS.phase6C4B2ValidationPackageVersion,
    candidate: readiness.candidate,
    candidateCommit: recert.recertifiedAtCommit,
    holdout: {
      set: "historical-holdout-v5", setVersion: seal.setVersion, state: seal.state, accessCount: seal.accessCount,
      manifestHash: seal.boundHashes.manifestHash, selectionHash: seal.boundHashes.selectionHash,
      acceptancePolicyHash: seal.boundHashes.acceptancePolicyHash,
      practicalMarginPolicyHash: seal.boundHashes.practicalMarginPolicyHash,
      seedHash: seal.boundHashes.seedHash, sealHash: seal.sealHash,
      eraReferenceCertificationHash: seal.boundHashes.eraReferenceCertificationHash,
      observabilityCertificationHash: seal.boundHashes.observabilityCertificationHash,
    },
    runner: { version: VALIDATION_VERSIONS.historicalHoldoutV5RunnerVersion,
      module: seal.authorizedRunner.module, command: seal.authorizedRunner.command },
    expectedRuntime: { totalGames: policy.protocol.totalGames,
      estimateNote: `at the ~560 games/sec measured in Phase 6C4A's internal validation, ${policy.protocol.totalGames} games is roughly ${Math.round(policy.protocol.totalGames / 560 / 60)} minutes of simulation, plus scoring` },
    accessEventProcedure: [
      "1. Verify the repository is clean and the branch tip matches its remote.",
      "2. Run the command below with a real --operator and a --reason of substance; both are required and recorded.",
      "3. The runner verifies every bound hash BEFORE touching the seal and refuses if any moved. A refusal leaves the access count at 0.",
      "4. On success the access count becomes 1, permanently. There is no second run.",
    ],
    resumePolicy: "A crash after the unlock has already consumed the access event. Re-run with --resume to continue under the SAME event; a fresh run is refused with SECOND_RUN_REFUSED. An identity change on resume is refused with IDENTITY_MISMATCH.",
    commands: {
      historicalV5: 'npm run validation:historical-v5 -- --unlock-holdout --unlock-historical-holdout-v5 --operator="<name>" --reason="<why>"',
      syntheticV2: 'npm run validation:synthetic-v2 -- --unlock-holdout --unlock-synthetic-stress-holdout-v2 --operator="<name>" --reason="<why>"',
      formalVerdict: "npm run validation:candidate1-formal-verdict",
    },
    commandsExecutedInThisPhase: { historicalV5: 0, syntheticV2: 0, formalVerdict: 0 },
    formalVerdictRules: {
      pass: policy.outcomes.pass, fail: policy.outcomes.fail, invalid: policy.outcomes.invalid,
      traitRule: margins.rule.hardFail,
      aggregate: policy.traitGates.aggregate,
      structural: policy.structuralGates,
      onFail: policy.failureSemantics,
      syntheticGate: "Synthetic Stress Holdout V2 may be opened only AFTER Historical V5 passes. A historical failure keeps it sealed.",
    },
    previewPrerequisites: ["Historical V5 PASS", "Synthetic Stress Holdout V2 PASS", "an explicit preview authorisation",
      "production flags still false", "no main merge"],
    productionIsolationRequirements: ["engineVersion stays 3.2.0", "appVersion stays 2.7.2",
      "every possession-engine flag stays false", "no production namespace is written",
      "production activation requires an explicit CEO GO LIVE and is out of scope for 6C4B2"],
  };
  pkg.packageHash = createHash("sha256").update(JSON.stringify({ candidate: pkg.candidate, holdout: pkg.holdout })).digest("hex");
  writeArtifact("phase6c4b2-validation-package", pkg, {
    generationCommand: "npm run v5:readiness", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nmayOpenInPhase6C4B2: ${mayOpen}`);
  console.log(`limitations recorded: ${readiness.limitations.length}`);
  console.log(`B2 package hash ${pkg.packageHash.slice(0, 16)}...`);
  process.exit(mayOpen ? 0 : 2);
}
