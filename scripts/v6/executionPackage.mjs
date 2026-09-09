#!/usr/bin/env node
// ── WS17A + WS19 + WS20: the two-stage execution package ────────────────────
//   npm run v6:package
//
// Everything an operator needs to run the two formal stages in order, with every
// hash the runners will verify, namespaced by stage.
//
// The namespacing is not cosmetic. Phase 6C4B1S's first compound package merged
// the two stages' hash maps flat, and four key names — policyHash, seedSetHash,
// practicalMarginPolicyHash, dryRunArtifactHash — exist on both stages. The merge
// bound stage two's values under stage one's names and left stage one's four
// unbound, silently, which is the exact class of gap a binding package exists to
// close. Every entry here carries its stage, and a gate proves the merged count
// equals the sum of the parts.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { COMPOUND_VERDICTS } from "../validation/candidate2FormalVerdict.mjs";
import { DIR, C1D, B1S } from "./reconcile.mjs";

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("candidate2-formal-execution-package", DIR) && !process.argv.includes("--refreeze")) {
    console.log("candidate2-formal-execution-package already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const lock = readArtifact("candidate2-lock", C1D).data;
  const seal = readArtifact("historical-v6-seal", DIR).data;
  const manifest = readArtifact("historical-holdout-v6-manifest", DIR).data;
  const verdict = readArtifact("historical-v6-verdict-policy", DIR).data;
  const margins = readArtifact("historical-v6-practical-margins", DIR).data;
  const plan = readArtifact("historical-v6-sample-plan", DIR).data;
  const seeds = readArtifact("historical-v6-seeds", DIR).data;
  const selection = readArtifact("historical-v6-selection", DIR).data;
  const targets = readArtifact("historical-v6-targets", DIR).data;
  const obs = readArtifact("historical-v6-observability-certification", DIR).data;
  const refs = readArtifact("era-reference-certification-candidate2", DIR).data;
  const traitPolicy = readArtifact("historical-v6-trait-policy", DIR).data;
  const v6dry = readArtifact("historical-v6-runner-dry-run", DIR);
  const binding = readArtifact("synthetic-v2-candidate2-binding", DIR).data;
  const c1synPolicy = readArtifact("synthetic-v2-formal-policy", B1S).data;
  const synDry = readArtifact("synthetic-v2-dry-run", B1S);
  const core = await buildCoreManifestV3();

  console.log("CANDIDATE 2 TWO-STAGE FORMAL EXECUTION PACKAGE\n");

  // ── stage one ────────────────────────────────────────────────────────────
  const stageOne = {
    stage: 1, set: "historical-holdout-v6",
    sealState: seal.state, accessCount: setAccessCount("historical-holdout-v6"),
    command: "npm run validation:historical-v6 -- --run",
    requiredFlags: seal.authorizedRunner.requiredFlags,
    modesThatDoNotOpenTheSeal: seal.authorizedRunner.modesThatDoNotOpenTheSeal,
    preparedCommand: 'npm run validation:historical-v6 -- --run --unlock-holdout --unlock-historical-holdout-v6 --operator="<email>" --reason="<why>"',
    scope: seal.scope,
    dryRunPassed: v6dry.data.pass,
    outcomes: verdict.outcomes,
    hashes: {
      candidateCoreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      policyHash: verdict.policyHash,
      manifestHash: manifest.manifestHash,
      selectionHash: selection.selectionHash,
      targetsHash: targets.targetsHash,
      traitPolicyHash: traitPolicy.traitPolicyHash,
      practicalMarginPolicyHash: margins.policyHash,
      samplePlanHash: plan.samplePlanHash,
      seedSetHash: seeds.seedHash,
      observabilityCertificationHash: obs.certificationHash,
      eraReferenceCertificationHash: refs.certificationHash,
      dryRunArtifactHash: v6dry.data.dryRunHash,
      sealHash: seal.sealHash,
    },
  };

  // ── stage two ────────────────────────────────────────────────────────────
  const stageTwo = {
    stage: 2, set: "synthetic-stress-holdout-v2",
    sealState: "SEALED_UNREAD", accessCount: setAccessCount("synthetic-stress-holdout-v2"),
    command: "npm run validation:synthetic-candidate2 -- --run",
    requiredFlags: ["--unlock-holdout", "--unlock-synthetic-stress-holdout-v2", "--operator=<email>", "--reason=<why>"],
    modesThatDoNotOpenTheSeal: ["--help", "--preflight"],
    preparedCommand: 'npm run validation:synthetic-candidate2 -- --run --unlock-holdout --unlock-synthetic-stress-holdout-v2 --operator="<email>" --reason="<why>"',
    action: "REBIND",
    replacedWithV3: false,
    scope: { fixtures: SYNTHETIC_STRESS_HOLDOUT_V2.length, plannedGames: c1synPolicy.protocol.totalGames },
    dryRunPassed: synDry.data.pass,
    outcomes: c1synPolicy.outcomes,
    accessPrecondition: binding.stageOrder.precondition,
    refusalCode: binding.stageOrder.refusalCode,
    hashes: {
      candidateCoreHash: binding.hashes.candidateCoreHash,
      parameterSetHash: binding.hashes.parameterSetHash,
      possessionCalibrationVersion: binding.hashes.possessionCalibrationVersion,
      policyHash: binding.hashes.syntheticPolicyHash,
      bindingHash: binding.bindingHash,
      acceptancePolicyHash: binding.hashes.acceptancePolicyHash,
      guardrailRegistryHash: binding.hashes.guardrailRegistryHash,
      practicalMarginPolicyHash: binding.hashes.practicalMarginPolicyHash,
      surfacePlanHash: binding.hashes.surfacePlanHash,
      samplePlanHash: binding.hashes.samplePlanHash,
      seedSetHash: binding.hashes.seedSetHash,
      aggregationPolicyHash: binding.hashes.aggregationPolicyHash,
      verdictSchemaHash: binding.hashes.verdictSchemaHash,
      membershipHash: binding.hashes.membershipHash,
      dryRunArtifactHash: synDry.outputHash,
      marginEvidenceHash: binding.hashes.candidate2MarginEvidenceHash,
      talentGapLadderHash: binding.hashes.candidate2TalentGapLadderHash,
    },
  };

  // ── the namespaced merge ─────────────────────────────────────────────────
  const collidingKeys = Object.keys(stageOne.hashes).filter((k) => k in stageTwo.hashes);
  const candidateHashes = {
    "candidate.coreHash": core.aggregateCoreHash,
    "candidate.parameterSetHash": def.parameterSetHash,
    "candidate.possessionCalibrationVersion": versionOf("possessionCalibrationVersion"),
    "candidate.lockStatus": lock.candidateLockStatus,
    "candidate.changeManifestHash": lock.changeManifestHash,
    "candidate.coreManifestHash": lock.coreManifestHash,
  };
  const compoundHashes = {
    "compound.verdictVocabularyHash": sha(COMPOUND_VERDICTS),
    "compound.stageOrder": "historical-holdout-v6 then synthetic-stress-holdout-v2",
  };
  const allHashes = {
    ...candidateHashes,
    ...Object.fromEntries(Object.entries(stageOne.hashes).map(([k, v]) => [`historicalV6.${k}`, v])),
    ...Object.fromEntries(Object.entries(stageTwo.hashes).map(([k, v]) => [`synthetic.${k}`, v])),
    ...compoundHashes,
  };

  gate("bothStagesContributeTheirOwnHashes",
    Object.keys(stageOne.hashes).length > 0 && Object.keys(stageTwo.hashes).length > 0,
    `stage one contributes ${Object.keys(stageOne.hashes).length} hashes, stage two ${Object.keys(stageTwo.hashes).length}`);
  gate("noHashWasOverwrittenByTheMerge",
    Object.keys(allHashes).length === Object.keys(candidateHashes).length
      + Object.keys(stageOne.hashes).length + Object.keys(stageTwo.hashes).length
      + Object.keys(compoundHashes).length,
    `${Object.keys(candidateHashes).length} + ${Object.keys(stageOne.hashes).length} + ${Object.keys(stageTwo.hashes).length} + ${Object.keys(compoundHashes).length} = ${Object.keys(allHashes).length} bound entries. ${collidingKeys.length} key name(s) appear on both stages (${collidingKeys.join(", ")}) and are namespaced — an unnamespaced merge would have bound stage two's values under stage one's names and left stage one unbound.`);
  gate("everyStageOneHashBoundUnderItsOwnNamespace",
    Object.entries(stageOne.hashes).every(([k, v]) => allHashes[`historicalV6.${k}`] === v),
    `all ${Object.keys(stageOne.hashes).length} stage-one hashes bound under historicalV6.* with their own values`);
  gate("everyStageTwoHashBoundUnderItsOwnNamespace",
    Object.entries(stageTwo.hashes).every(([k, v]) => allHashes[`synthetic.${k}`] === v),
    `all ${Object.keys(stageTwo.hashes).length} stage-two hashes bound under synthetic.* with their own values`);
  gate("collidingKeysActuallyExist", collidingKeys.length > 0,
    `${collidingKeys.length} key names genuinely collide, so the namespacing is load-bearing rather than decorative: ${collidingKeys.join(", ")}`);
  gate("bothStagesNameTheSameCandidate",
    stageOne.hashes.candidateCoreHash === stageTwo.hashes.candidateCoreHash
    && stageOne.hashes.parameterSetHash === stageTwo.hashes.parameterSetHash,
    `both stages bind core ${core.aggregateCoreHash.slice(0, 16)}... and the same parameter set`);
  gate("bothDryRunsPassed", stageOne.dryRunPassed === true && stageTwo.dryRunPassed === true,
    `stage one dry run ${stageOne.dryRunPassed} (${v6dry.data.branchesExercised} branches), stage two dry run ${stageTwo.dryRunPassed}`);
  gate("bothSetsSealedAtZero",
    stageOne.accessCount === 0 && stageTwo.accessCount === 0,
    `historical-holdout-v6 ${stageOne.accessCount}, synthetic-stress-holdout-v2 ${stageTwo.accessCount}`);
  gate("stageTwoRefusesWithoutAPassingStageOne",
    stageTwo.refusalCode === "SYNTHETIC_ACCESS_REFUSED"
    && stageTwo.accessPrecondition.includes("historical-holdout-v6"),
    "stage two's precondition names Historical V6 and is enforced in code before the seal is touched");
  gate("noStageMayRunInThisPhase",
    !existsSync(`${DIR}/historical-v6-results.json`) && !existsSync(`${DIR}/synthetic-v2-candidate2-results.json`),
    "this is a preparation phase: the package is built, and neither stage is executed");
  gate("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "no parameter drifted from its registry default");

  if (fail.length) { console.log(`\nPACKAGE REFUSED: ${fail.join(", ")}`); process.exit(2); }

  // ── WS17A: the stage-two execution package, on its own ───────────────────
  const synPackage = {
    syntheticV2Candidate2ExecutionPackageVersion: "1.0.0",
    ...stageTwo,
    bindingArtifact: `${DIR}/synthetic-v2-candidate2-binding.json`,
    thresholds: binding.thresholds,
    thresholdDerivation: binding.thresholdDerivation,
    rebindItems: binding.rebindItems,
    whyNotReplaced: binding.whyNotReplaced,
    stageOrder: binding.stageOrder,
    operatorSteps: [
      "1. npm run validation:synthetic-candidate2 -- --preflight   (refuses until stage one has passed; opens nothing)",
      "2. only after Historical V6 has returned PASS on this same core and parameter set, run the prepared command above",
      "3. npm run validation:candidate2-formal-verdict -- --preflight, then --issue",
    ],
    whatAPassDoesNotAuthorize: c1synPolicy.outcomes.whatAPassDoesNotAuthorize,
    pass: true,
  };
  synPackage.packageHash = sha({ hashes: stageTwo.hashes, thresholds: binding.thresholds });
  writeArtifact("synthetic-v2-candidate2-execution-package", synPackage, {
    generationCommand: "npm run v6:package", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS20: the compound package ───────────────────────────────────────────
  const payload = {
    candidate2FormalExecutionPackageVersion: "1.0.0",
    candidate: { candidateId: lock.candidateId, coreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      lockStatus: lock.candidateLockStatus, lockedAtCommit: lock.lockedAtCommit },
    stages: [stageOne, stageTwo],
    stageOrder: {
      order: ["historical-holdout-v6", "synthetic-stress-holdout-v2"],
      why: "a synthetic stress pass says nothing about a candidate that failed the historical stage, and opening the synthetic set after a historical failure would consume a one-shot resource for no evidence",
      enforcedBy: "scripts/validation/synthetic-candidate2.mjs preflightChecks, in code, before the seal is touched",
      refusalCode: "SYNTHETIC_ACCESS_REFUSED",
      whyNotV5: binding.stageOrder.whyNotV5,
    },
    stageThree: {
      command: "npm run validation:candidate2-formal-verdict -- --issue",
      readOnlyMode: "npm run validation:candidate2-formal-verdict -- --preflight",
      vocabulary: COMPOUND_VERDICTS,
      writeRequiresBothStages: true,
    },
    hashes: allHashes,
    hashNamespacing: {
      namespaces: ["candidate.*", "historicalV6.*", "synthetic.*", "compound.*"],
      collidingKeyNames: collidingKeys,
      why: "policyHash, parameterSetHash, candidateCoreHash, possessionCalibrationVersion, practicalMarginPolicyHash, samplePlanHash and seedSetHash exist on both stages. Phase 6C4B1S's first compound package merged the two maps flat: stage two's values were bound under stage one's names and stage one's four were left unbound, silently. Every entry is namespaced and a gate proves the merged count equals the sum of the parts.",
      boundEntries: Object.keys(allHashes).length,
    },
    operatorSteps: [
      "1. npm run validation:historical-v6 -- --preflight            (read-only; opens nothing)",
      "2. npm run validation:historical-v6 -- --run --unlock-holdout --unlock-historical-holdout-v6 --operator=\"<email>\" --reason=\"<why>\"",
      "3. npm run validation:synthetic-candidate2 -- --preflight     (refuses unless step 2 returned PASS)",
      "4. npm run validation:synthetic-candidate2 -- --run --unlock-holdout --unlock-synthetic-stress-holdout-v2 --operator=\"<email>\" --reason=\"<why>\"",
      "5. npm run validation:candidate2-formal-verdict -- --preflight",
      "6. npm run validation:candidate2-formal-verdict -- --issue",
    ],
    executionForbiddenInThisPhase: {
      why: "Phase 6C4C2 is preparation. Both stages are prepared, sealed and rehearsed; neither is executed.",
      historicalV6ResultsExists: existsSync(`${DIR}/historical-v6-results.json`),
      syntheticResultsExists: existsSync(`${DIR}/synthetic-v2-candidate2-results.json`),
    },
    sealStatuses: allSealStatuses(),
    notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE",
      "any deployment authorization", "any preview build or deployment"],
    productionActivation: "requires an explicit CEO GO LIVE. This package authorizes no deployment of any kind.",
    pass: true, failedGates: [],
  };
  payload.packageHash = sha({ hashes: allHashes, stages: [stageOne.hashes, stageTwo.hashes] });
  writeArtifact("candidate2-formal-execution-package", payload, {
    generationCommand: "npm run v6:package", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n  stage one  ${stageOne.set.padEnd(30)} ${stageOne.sealState} access ${stageOne.accessCount}`);
  console.log(`  stage two  ${stageTwo.set.padEnd(30)} ${stageTwo.sealState} access ${stageTwo.accessCount}`);
  console.log(`  ${Object.keys(allHashes).length} bound entries across 4 namespaces · ${collidingKeys.length} colliding key names`);
  console.log(`\nPACKAGE: BUILT · packageHash ${payload.packageHash.slice(0, 16)}...`);
  process.exit(0);
}
