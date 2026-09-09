#!/usr/bin/env node
// ── Phase 6C4B2 formal-execution preflight ──────────────────────────────────
//   npm run v6:preflight
//
// Verifies the ENTIRE two-stage formal package before either holdout is
// touched. Historical V5 and Synthetic Stress Holdout V2 are one-shot
// resources: the whole point of this file is that nothing irreversible happens
// until every precondition for BOTH stages is proven.
//
// The phase brief is explicit about the second stage:
//   "If its frozen package is incompatible with Candidate 1: Detect the
//    incompatibility before Historical V5 opens... Do not consume Historical V5
//    while the second-stage package is known to be unusable."
// So the synthetic package is verified HERE, before V5, not after V5 passes.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { registryHash } from "../validation/traitRegistry.mjs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { versionOf } from "../../src/versions.js";

export const DIR = "data/validation/6c4b2";
export const DIR_B1 = "data/validation/6c4b1";
export const DIR_6C4A = "data/validation/6c4a";
const B1 = (n) => readArtifact(n, DIR_B1);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = [];
  const blockers = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  const recert = B1("candidate1-lock-recertification").data;
  const lock1 = readArtifact("candidate1-lock", DIR_6C4A).data;
  const c0lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
  const pkg = B1("phase6c4b2-validation-package").data;
  const seal = B1("historical-holdout-v5-seal").data;
  const manifest = B1("historical-holdout-v5-manifest");
  const policy = B1("historical-holdout-v5-policy");
  const margins = B1("trait-practical-margin-policy-v5");
  const selection = B1("historical-v5-selection");
  const selPolicy = B1("historical-v5-selection-policy");
  const seeds = B1("historical-holdout-v5-seeds");
  const refs = B1("era-reference-certification-candidate1");
  const obs = B1("historical-observability-certification-candidate1");
  const pool = B1("historical-v5-candidate-pool-v2");
  const dryrun = B1("historical-v5-runner-dry-run");
  const readiness = B1("historical-v5-readiness-final").data;
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  // ── PART 1 — CANDIDATE 1 ──────────────────────────────────────────────────
  console.log("PART 1 — CANDIDATE 1\n");
  const lockValid =
    gate("candidate1Locked", recert.candidateLockStatus === "LOCKED" && recert.candidateSelectionStatus === "SELECTED"
      && recert.calibrationStatus === "DEVELOPMENT_LOCKED_SCOPED" && recert.validationAttemptStatus === "NOT_RUN",
      `${recert.candidateId} · ${recert.candidateSelectionStatus}/${recert.candidateLockStatus}/${recert.calibrationStatus} · attempt ${recert.validationAttemptStatus}`) &
    gate("lockRevisionMatchesV5Package", recert.lockRevision === 2 && seal.candidate.lockRevision === recert.lockRevision,
      `lock revision ${recert.lockRevision}, the revision the V5 seal binds`) &
    gate("zeroLockBlockers", lock1.candidateLockBlockers.length === 0 && lock1.allEngineeringGatesPass === true,
      `${lock1.candidateLockBlockers.length} blockers on the revision-1 record, all gates ${lock1.allEngineeringGatesPass}`) &
    gate("calibrationVersion", versionOf("possessionCalibrationVersion") === "1.1.0" && recert.possessionCalibrationVersion === "1.1.0",
      versionOf("possessionCalibrationVersion"));

  const coreStable =
    gate("coreHashEqualsSealed", core.aggregateCoreHash === recert.coreHash && core.aggregateCoreHash === seal.candidate.coreHash,
      `live ${core.aggregateCoreHash.slice(0, 16)}... == re-certified lock == V5 seal`) &
    gate("parameterSetHashEqualsSealed", def.parameterSetHash === recert.parameterSetHash && def.parameterSetHash === seal.candidate.parameterSetHash
      && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
      `${def.parameterSetHash.slice(0, 16)}..., zero drift across ${def.parameterCount} parameters`);

  // replay: Candidate 1, its probability path, and the production engine source
  const rc = { goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
    blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], eraStyleId: "2010s",
    coachGoldId: "steve-kerr", coachBlueId: "phil-jackson", simulationSeed: 4242 };
  const hx = (g) => createHash("sha256").update(JSON.stringify([g.finalScore, g.gold, g.blue, g.possessionLedger])).digest("hex");
  const r1 = hx(runPossessionGame(buildPossessionInput(rc), { includeLedger: true }));
  const r2 = hx(runPossessionGame(buildPossessionInput(rc), { includeLedger: true }));
  const { estimateWinProbability } = await import("../../src/v3/calibration/monteCarloProbability.js");
  const pArgs = { teamA: { teamId: "A", playerIds: rc.goldIds, coachId: rc.coachGoldId },
    teamB: { teamId: "B", playerIds: rc.blueIds, coachId: rc.coachBlueId },
    eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false };
  const p1 = estimateWinProbability(pArgs); const p2 = estimateWinProbability(pArgs);
  const prodSha = sha("src/engine.js");
  const preservation = readArtifact("candidate0-preservation", DIR_6C4A).data;
  const replayValid =
    gate("candidate1ReplayExact", r1 === r2, `two runs of one seed byte-identical (${r1.slice(0, 16)}...)`) &
    gate("candidate1ProbabilityReplayExact", p1.goldWinProbability === p2.goldWinProbability && p1.goldWins === p2.goldWins,
      `${p1.goldWins}/${p1.sampleCount} both runs`) &
    gate("productionEngineByteIdentical", prodSha === preservation.candidate0.productionEngineSha256,
      `src/engine.js ${prodSha.slice(0, 16)}... unchanged since Candidate 0's preservation snapshot`);
  const c0Preserved = gate("candidate0Preserved", c0lock.candidateLockStatus === "LOCKED"
    && c0lock.possessionCalibrationVersion === "1.0.0"
    && sha(`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`) === preservation.candidate0.lockManifestSha256,
    "Candidate 0's lock manifest is byte-identical to its preservation hash");

  // ── PART 2 — HISTORICAL V5 PACKAGE ────────────────────────────────────────
  console.log("\nPART 2 — HISTORICAL V5 PACKAGE\n");
  const v5Bound = {
    manifestHash: [manifest.data.manifestHash, seal.boundHashes.manifestHash, pkg.holdout.manifestHash],
    selectionHash: [selection.data.selectionHash, seal.boundHashes.selectionHash, pkg.holdout.selectionHash],
    selectionPolicyHash: [selPolicy.data.policyHash, seal.boundHashes.selectionPolicyHash],
    acceptancePolicyHash: [policy.data.policyHash, seal.boundHashes.acceptancePolicyHash, pkg.holdout.acceptancePolicyHash],
    practicalMarginPolicyHash: [margins.data.policyHash, seal.boundHashes.practicalMarginPolicyHash, pkg.holdout.practicalMarginPolicyHash],
    seedHash: [seeds.data.seedHash, seal.boundHashes.seedHash, pkg.holdout.seedHash],
    eraReferenceCertificationHash: [refs.outputHash, seal.boundHashes.eraReferenceCertificationHash, pkg.holdout.eraReferenceCertificationHash],
    observabilityCertificationHash: [obs.outputHash, seal.boundHashes.observabilityCertificationHash, pkg.holdout.observabilityCertificationHash],
    candidatePoolHash: [pool.data.poolHash, seal.boundHashes.candidatePoolHash],
    traitRegistryHash: [registryHash(), seal.boundHashes.traitRegistryHash],
    sealHash: [seal.sealHash, pkg.holdout.sealHash],
  };
  const mismatched = Object.entries(v5Bound).filter(([, vals]) => new Set(vals).size !== 1).map(([k]) => k);
  const v5PackageValid =
    gate("everyV5HashAgreesAcrossArtifactSealAndPackage", mismatched.length === 0,
      `${Object.keys(v5Bound).length} hashes cross-checked between their producing artifact, the seal and the B2 package · mismatches ${mismatched.length}`) &
    gate("v5SealedUnread", seal.state === "SEALED_UNREAD" && setAccessCount("historical-holdout-v5") === 0,
      `${seal.state} · access count ${setAccessCount("historical-holdout-v5")}`) &
    gate("v5NoAccessLog", !existsSync(SEALED_SETS["historical-holdout-v5"]), `${SEALED_SETS["historical-holdout-v5"]} does not exist`) &
    gate("v5NoResultArtifacts", !artifactExists("historical-holdout-v5-results", DIR_B1) && !existsSync(`${DIR_B1}/historical-holdout-v5-run.json`)
      && !artifactExists("historical-v5-formal-run", DIR), "no V5 run state, results or formal-run artifact exists") &
    gate("v5DryRunPassed", dryrun.data.pass === true && dryrun.data.failedChecks.length === 0,
      `${dryrun.data.checks.length} dry-run checks, ${dryrun.data.failedChecks.length} failed`) &
    gate("v5ReadinessZeroUnresolvedBlockers", B1("historical-v5-blocker-audit").data.unresolvedBlockers === 0 && readiness.mayOpenInPhase6C4B2 === true,
      `${B1("historical-v5-blocker-audit").data.resolvedBlockers}/${B1("historical-v5-blocker-audit").data.totalBlockers} blockers resolved · mayOpen ${readiness.mayOpenInPhase6C4B2}`) &
    gate("v5RunnerExists", existsSync("scripts/validation/historical-holdout-v5.mjs")
      && JSON.parse(readFileSync("package.json", "utf8")).scripts["validation:historical-v5"] != null,
      "the authorized V5 runner module and its npm script both exist");

  // ── PART 3 — SYNTHETIC STRESS HOLDOUT V2 PACKAGE ──────────────────────────
  // Verified BEFORE V5, per the brief. Frozen schema and manifest metadata
  // only: no fixture is simulated and no fixture result is inspected.
  console.log("\nPART 3 — SYNTHETIC STRESS HOLDOUT V2 PACKAGE (verified BEFORE V5)\n");
  const synManifestPath = "data/calibration/synthetic-stress-holdout-v2-manifest.json";
  const synManifest = existsSync(synManifestPath) ? JSON.parse(readFileSync(synManifestPath, "utf8")) : null;
  const synScripts = Object.entries(JSON.parse(readFileSync("package.json", "utf8")).scripts)
    .filter(([k]) => /synthetic/i.test(k));
  const synRunnerModule = ["scripts/validation/synthetic-stress-holdout-v2.mjs", "scripts/validation/synthetic-v2.mjs",
    "scripts/v6/synthetic-v2.mjs"].find((p) => existsSync(p)) ?? null;

  const synParts = {
    manifest: { present: Boolean(synManifest), hash: synManifest?.manifestHash ?? null,
      fixtures: synManifest?.fixtureCount ?? null, frozenAt: synManifest?.frozenAt ?? null,
      detail: synManifest ? `${synManifest.fixtureCount} fixtures, hash ${synManifest.manifestHash.slice(0, 16)}..., frozen at ${synManifest.frozenAt}` : "absent" },
    guardrailPolicy: { present: Boolean(HOLDOUT.syntheticGuardrails), hash: acceptancePolicyHash(),
      guardrails: Object.keys(HOLDOUT.syntheticGuardrails ?? {}).length,
      detail: `HOLDOUT.syntheticGuardrails carries ${Object.keys(HOLDOUT.syntheticGuardrails ?? {}).length} named guardrails inside the frozen acceptance policy ${acceptancePolicyHash().slice(0, 16)}...` },
    seal: { present: "synthetic-stress-holdout-v2" in SEALED_SETS, accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      logExists: existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
      detail: `registered, access ${setAccessCount("synthetic-stress-holdout-v2")}, log on disk ${existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])}` },
    seedSet: { present: false, hash: null,
      detail: "NO frozen synthetic-V2 seed manifest exists. The set manifest names predictionSeedSetVersion and probabilityValidationSeedSetVersion — the shared domains — but no synthetic-specific seed set with a hash was ever frozen, so there is nothing to verify a seed hash against." },
    sampleVolume: { present: Boolean(HOLDOUT.minGamesPerHoldoutFixture), value: HOLDOUT.minGamesPerHoldoutFixture ?? null,
      detail: `the frozen acceptance policy sets minGamesPerHoldoutFixture ${HOLDOUT.minGamesPerHoldoutFixture}, but no synthetic-specific per-fixture or competition-mode volume was frozen` },
    aggregationRule: { present: false,
      detail: "NO frozen rule turns per-fixture guardrail outcomes into a set verdict. The guardrails are per-fixture predicates; the pass/fail arithmetic over 16 fixtures is undefined." },
    runner: { present: Boolean(synRunnerModule), module: synRunnerModule, npmScripts: synScripts.map(([k]) => k),
      detail: synRunnerModule ? `runner at ${synRunnerModule}` : "NO synthetic-V2 runner module exists, and no npm script matches /synthetic/. Every reference to the set in scripts/ is a seal-integrity assertion that its access count is still zero." },
    preparedCommandResolvable: { present: false, command: pkg.commands.syntheticV2,
      detail: `the B2 package prepares "${pkg.commands.syntheticV2}" but package.json has no validation:synthetic-v2 script, so the prepared command cannot execute` },
    dryRun: { present: false,
      detail: "NO synthetic-V2 runner dry run exists. Historical V5 received 30 transactional dry-run checks in Phase 6C4B1; the synthetic set received none, because no runner was ever built to rehearse." },
    packageBinding: { present: false,
      detail: "the Phase 6C4B2 validation package binds V5 hashes only — it names no synthetic manifest, policy, seed or seal hash, so there is no recorded expectation to verify the synthetic package against" },
  };
  for (const [k, v] of Object.entries(synParts)) console.log(`  ${v.present ? "OK  " : "MISS"}  ${k}\n        ${v.detail}`);

  const missingSyn = Object.entries(synParts).filter(([, v]) => !v.present).map(([k]) => k);
  const synSealValid = gate("syntheticV2SealedUnread",
    synParts.seal.present && synParts.seal.accessCount === 0 && !synParts.seal.logExists,
    `SEALED_UNREAD · access ${synParts.seal.accessCount} · no access log`);
  gate("syntheticV2NoResultArtifacts", !artifactExists("synthetic-v2-formal-run", DIR) && !artifactExists("synthetic-v2-fixture-results", DIR),
    "no synthetic result artifact exists");
  const synCompatible = gate("syntheticV2PackageCompatible", missingSyn.length === 0,
    missingSyn.length === 0 ? "every second-stage component present"
      : `${missingSyn.length} of ${Object.keys(synParts).length} components missing: ${missingSyn.join(", ")}`);

  if (!synCompatible) {
    blockers.push({
      blockerId: "SYNTHETIC_V2_PACKAGE_INCOMPLETE",
      severity: "BLOCKS_FORMAL_EXECUTION_OF_BOTH_STAGES",
      detectedBefore: "any holdout access",
      summary: "The Synthetic Stress Holdout V2 second-stage package cannot be executed: its fixtures, guardrail policy and seal exist and are frozen, but it has no frozen seed set, no per-fixture sample volume, no verdict aggregation rule, no runner, and no dry run.",
      present: Object.fromEntries(Object.entries(synParts).filter(([, v]) => v.present).map(([k, v]) => [k, v.detail])),
      missing: Object.fromEntries(Object.entries(synParts).filter(([, v]) => !v.present).map(([k, v]) => [k, v.detail])),
      whyThisStopsHistoricalV5: "The phase brief instructs: 'If its frozen package is incompatible with Candidate 1: Detect the incompatibility before Historical V5 opens. Do not alter Synthetic V2. Stop and report the blocker. Do not consume Historical V5 while the second-stage package is known to be unusable.' Historical V5 is a one-shot resource and its access is irreversible, so it is not opened.",
      whyNotFixedInThisPhase: "Authoring a synthetic seed set, per-fixture volumes, a verdict aggregation rule and a runner is validation-methodology design. This phase is execution-only and its permitted writes are access events, result artifacts, verdicts, reports, status artifacts, the preview package, and tests — none of which covers a new holdout policy or runner. Building those here would also mean the same session authored and then executed the semantics, which is precisely the independence the holdout apparatus exists to protect: every prior holdout had its policy and seeds frozen and pushed in a separate preparation phase before any runner could read them.",
      requiredToUnblock: [
        "A preparation phase that freezes a synthetic-V2 seed set in its own domain, proven disjoint from every prior domain at full generated volume.",
        "A frozen per-fixture and per-competition-mode sample volume for the 16 synthetic fixtures.",
        "A frozen aggregation rule converting the 10 per-fixture guardrails into SYNTHETIC_HOLDOUT_V2_PASS / FAIL / INVALID_RUN, including how many fixtures may fail which guardrail.",
        "A synthetic-V2 runner that uses the same transactional runSealedSetOnce path, registered as the npm script the package names.",
        "A transactional dry run of that runner on non-holdout fixtures, mirroring the 30 checks Historical V5 received.",
        "A second-stage package artifact binding the synthetic manifest, policy, seed and seal hashes so a later execution phase has a recorded expectation to verify against.",
      ],
      doesNotInvalidate: "Historical Holdout V5's package. Every V5 hash cross-checks, its dry run passed, and it remains SEALED_UNREAD at access 0, ready for a future execution phase once the second stage exists.",
    });
  }

  // ── PART 4 — PRIOR HOLDOUTS ───────────────────────────────────────────────
  console.log("\nPART 4 — PRIOR HOLDOUTS PRESERVED\n");
  const v3 = readArtifact("historical-holdout-results", "data/validation/6c3").data;
  const v4 = readArtifact("replacement-formal-verdict", "data/validation/6c3r").data;
  const v3Preserved = gate("historicalV3Preserved", setAccessCount("historical-holdout-v3") === 1 && v3.verdict === "HISTORICAL_HOLDOUT_FAIL",
    `access 1 · ${v3.verdict}`);
  const v4Preserved = gate("historicalV4Preserved", setAccessCount("historical-holdout-v4") === 1 && v4.combinedVerdict === "HISTORICAL_V4_FAILED",
    `access 1 · ${v4.combinedVerdict}`);

  // ── PART 5 — OUTPUT DESTINATIONS AND REPOSITORY ───────────────────────────
  console.log("\nPART 5 — OUTPUT DESTINATIONS AND REPOSITORY\n");
  gate("v5OutputDestinationEmpty", !existsSync(`${DIR}/historical-v5-formal-run.json`) && !existsSync(`${DIR}/historical-v5-access-event.json`),
    `${DIR} holds no V5 formal output or access event`);
  gate("syntheticOutputDestinationEmpty", !existsSync(`${DIR}/synthetic-v2-formal-run.json`) && !existsSync(`${DIR}/synthetic-v2-access-event.json`),
    `${DIR} holds no synthetic formal output or access event`);
  gate("outputPathsCannotOverwritePriorPhases", DIR !== "data/validation/6c3" && DIR !== "data/validation/6c3r" && DIR !== DIR_B1,
    `this phase writes only to ${DIR}`);
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  gate("onPhaseBranch", branch === "phase-6c4b2-candidate1-formal-revalidation", `branch ${branch}`);
  gate("mainAtProductionCommit", git("rev-parse", "--short", "main") === "9cd95ff", `main ${git("rev-parse", "--short", "main")}`);
  gate("productionVersionsUntouched", versionOf("engineVersion") === "3.2.0" && versionOf("appVersion") === "2.7.2",
    `engine ${versionOf("engineVersion")} · app ${versionOf("appVersion")}`);

  const flags = {
    candidate1LockValid: !!lockValid,
    candidate1CoreStable: !!coreStable,
    candidate1ReplayValid: !!replayValid,
    candidate0Preserved: !!c0Preserved,
    historicalV5SealValid: seal.state === "SEALED_UNREAD",
    historicalV5AccessCount: setAccessCount("historical-holdout-v5"),
    historicalV5PackageValid: !!v5PackageValid,
    syntheticV2SealValid: !!synSealValid,
    syntheticV2AccessCount: setAccessCount("synthetic-stress-holdout-v2"),
    syntheticV2PackageCompatible: !!synCompatible,
    historicalV3Preserved: !!v3Preserved,
    historicalV4Preserved: !!v4Preserved,
    formalExecutionMayBegin: fail.length === 0,
  };

  const payload = {
    ...flags,
    branch, gatesFailed: fail, blockers,
    candidate: { candidateId: recert.candidateId, candidateCommit: recert.recertifiedAtCommit,
      lockRevision: recert.lockRevision, coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      calibrationStatus: recert.calibrationStatus, formalValidationStatus: recert.validationAttemptStatus },
    historicalV5: { state: seal.state, accessCount: setAccessCount("historical-holdout-v5"),
      boundHashes: Object.fromEntries(Object.entries(v5Bound).map(([k, v]) => [k, v[0]])),
      hashMismatches: mismatched, dryRunChecks: dryrun.data.checks.length, runnerModule: "scripts/validation/historical-holdout-v5.mjs" },
    syntheticV2: { state: "SEALED_UNREAD", accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      fixtureCount: SYNTHETIC_STRESS_HOLDOUT_V2.length, components: synParts, missingComponents: missingSyn },
    priorHoldouts: {
      historicalHoldoutV3: { state: "CONSUMED", accessCount: setAccessCount("historical-holdout-v3"), verdict: "FAIL",
        failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE", candidate: "Candidate 0" },
      historicalHoldoutV4: { state: "CONSUMED", accessCount: setAccessCount("historical-holdout-v4"), verdict: "FAIL",
        failureClass: "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE", candidate: "Candidate 0" },
    },
    allSeals: Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, { status: v.status, accessCount: v.accessCount }])),
    holdoutsOpenedInThisPhase: { historicalV5: 0, syntheticV2: 0 },
  };
  writeArtifact("phase6c4b2-preflight", payload, { generationCommand: "npm run v6:preflight", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n${JSON.stringify(flags, null, 2)}`);
  if (blockers.length) {
    console.log(`\nBLOCKERS (${blockers.length}):`);
    for (const b of blockers) console.log(`  ${b.blockerId} — ${b.summary}`);
    console.log("\nNO HOLDOUT WILL BE OPENED.");
  }
  process.exit(fail.length === 0 ? 0 : 2);
}
