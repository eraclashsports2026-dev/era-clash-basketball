#!/usr/bin/env node
// ── WS12: the superseding compound formal validation package ────────────────
//   npm run syn:package
//
// The Phase 6C4B1 package bound Historical V5's hashes only. Its blocker key
// read: "the Phase 6C4B2 validation package binds V5 hashes only — it names no
// synthetic manifest, policy, seed or seal hash, so there is no recorded
// expectation to verify the synthetic package against."
//
// This package binds BOTH stages. The original is marked SUPERSEDED_INCOMPLETE
// in this artifact and is NOT overwritten: it is the record of what the earlier
// phase actually had, and rewriting it would erase the evidence that the gap
// existed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { COMMANDS } from "./commandCertification.mjs";
import { DIR, DIR_B1, DIR_B2, syntheticMembership, git } from "./preflight.mjs";

const ORIGINAL = `${DIR_B1}/phase6c4b2-validation-package.json`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("compound-formal-validation-package-v2", DIR) && !process.argv.includes("--refreeze")) {
    console.log("compound package already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const original = JSON.parse(readFileSync(ORIGINAL, "utf8"));
  const blocker = JSON.parse(readFileSync(`${DIR_B2}/synthetic-v2-package-blocker.json`, "utf8"));
  const core = await buildCoreManifestV3();
  const recert = readArtifact("candidate1-lock-recertification", DIR_B1);
  const mem = syntheticMembership();

  // stage one, read from the artifacts the 6C4B1 phase froze
  const v5Policy = readArtifact("historical-holdout-v5-policy", DIR_B1);
  const v5Manifest = readArtifact("historical-holdout-v5-manifest", DIR_B1);
  const v5Seeds = readArtifact("historical-holdout-v5-seeds", DIR_B1);
  const v5Seal = readArtifact("historical-holdout-v5-seal", DIR_B1);
  const v5Margins = readArtifact("trait-practical-margin-policy-v5", DIR_B1);
  const v5DryRun = readArtifact("historical-v5-runner-dry-run", DIR_B1);

  // stage two, frozen in this phase
  const synPolicy = readArtifact("synthetic-v2-formal-policy", DIR);
  const synMargins = readArtifact("synthetic-v2-practical-margins", DIR);
  const synSeeds = readArtifact("synthetic-v2-seeds", DIR);
  const synRegistry = readArtifact("synthetic-v2-guardrail-registry", DIR);
  const synSurfaces = readArtifact("synthetic-v2-surface-plan", DIR);
  const synSample = readArtifact("synthetic-v2-sample-plan", DIR);
  const synAgg = readArtifact("synthetic-v2-aggregation-policy", DIR);
  const synSchema = readArtifact("synthetic-v2-verdict-schema", DIR);
  const synMock = readArtifact("synthetic-v2-mock-manifest", DIR);
  const synDryRun = readArtifact("synthetic-v2-dry-run", DIR);
  const synCommands = readArtifact("synthetic-v2-command-certification", DIR);

  const stageOne = {
    stage: 1, set: "historical-holdout-v5",
    sealState: v5Seal.data.state ?? "SEALED_UNREAD", accessCount: setAccessCount("historical-holdout-v5"),
    hashes: {
      policyHash: v5Policy.data.policyHash, manifestHash: v5Manifest.data.manifestHash,
      seedSetHash: v5Seeds.data.seedHash, sealHash: v5Seal.data.sealHash,
      practicalMarginPolicyHash: v5Margins.data.policyHash, dryRunArtifactHash: v5DryRun.outputHash,
    },
    protocol: { matchups: v5Policy.data.protocol.matchups, surfaces: v5Policy.data.protocol.surfacesPerMatchup.length,
      pairsPerSurface: v5Policy.data.protocol.pairsPerSurface, gamesPerSurface: v5Policy.data.protocol.gamesPerSurface,
      totalGames: v5Policy.data.protocol.totalGames },
    command: COMMANDS.find((c) => c.stage === 1).preparedCommand,
    dryRunPassed: v5DryRun.data.pass === true,
  };
  const stageTwo = {
    stage: 2, set: "synthetic-stress-holdout-v2",
    sealState: mem.manifest.accessPolicy, accessCount: setAccessCount("synthetic-stress-holdout-v2"),
    hashes: {
      policyHash: synPolicy.data.policyHash, membershipHash: mem.membershipHash,
      manifestFileSha256: mem.fileSha256,
      seedSetHash: synSeeds.data.seedHash,
      practicalMarginPolicyHash: synMargins.data.policyHash,
      guardrailRegistryHash: synRegistry.outputHash, surfacePlanHash: synSurfaces.data.surfacePlanHash,
      samplePlanHash: synSample.data.samplePlanHash, aggregationPolicyHash: synAgg.outputHash,
      verdictSchemaHash: synSchema.outputHash, mockManifestHash: synMock.data.mockManifestHash,
      dryRunArtifactHash: synDryRun.outputHash, commandCertificationHash: synCommands.data.certificationHash,
      acceptancePolicyHash: acceptancePolicyHash(),
    },
    protocol: { fixtures: mem.fixtures.length, totalGames: synSample.data.totalGames,
      volumes: synSample.data.volumes, minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
      adjudicableGuardrails: synRegistry.data.adjudicableGuardrailCount },
    command: COMMANDS.find((c) => c.stage === 2).preparedCommand,
    dryRunPassed: synDryRun.data.pass === true,
    accessPrecondition: "Historical Holdout V5 must have been opened and returned PASS on the same candidate core and parameter set. Otherwise the command exits SYNTHETIC_ACCESS_REFUSED before the seal is touched.",
  };

  console.log("COMPOUND FORMAL VALIDATION PACKAGE V2\n");
  console.log(`  supersedes ${ORIGINAL}`);
  console.log(`  original bound ${Object.keys(original.data.holdout ?? {}).length} holdout fields and named no synthetic hash\n`);
  for (const s of [stageOne, stageTwo]) {
    console.log(`  stage ${s.stage}  ${s.set.padEnd(30)} ${s.sealState}  access ${s.accessCount}  ${Object.keys(s.hashes).length} hashes  dryRun ${s.dryRunPassed ? "PASS" : "FAIL"}`);
  }

  // Namespaced by stage. A flat merge silently dropped four stage-one hashes —
  // policyHash, seedSetHash, practicalMarginPolicyHash and dryRunArtifactHash
  // all exist on both stages — so the package hash was binding stage two's
  // values under stage one's names and not binding stage one at all. That is
  // the same class of silent binding gap the blocker was raising.
  const collidingKeys = Object.keys(stageOne.hashes).filter((k) => k in stageTwo.hashes);
  const allHashes = {
    ...Object.fromEntries(Object.entries(stageOne.hashes).map(([k, v]) => [`stage1.${k}`, v])),
    ...Object.fromEntries(Object.entries(stageTwo.hashes).map(([k, v]) => [`stage2.${k}`, v])),
  };
  const synHashCount = Object.keys(stageTwo.hashes).length;

  console.log("");
  gate("bothStagesAreBound",
    stageOne.hashes.policyHash && stageTwo.hashes.policyHash,
    `stage one contributes ${Object.keys(stageOne.hashes).length} hashes, stage two ${synHashCount}`);
  gate("theBlockerKeyIsResolved", synHashCount >= 10,
    `the blocker recorded that the earlier package "names no synthetic manifest, policy, seed or seal hash". This one names ${synHashCount}, including the membership hash ${mem.membershipHash.slice(0, 16)}..., the policy hash ${synPolicy.data.policyHash.slice(0, 16)}... and the seed hash ${synSeeds.data.seedHash.slice(0, 16)}...`);
  gate("everyBoundHashIsShaped",
    Object.entries(allHashes).every(([, v]) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)),
    `${Object.keys(allHashes).length} bound hashes, all 64-character hex`);
  gate("noStageHashWasLostToAKeyCollision",
    Object.keys(allHashes).length === Object.keys(stageOne.hashes).length + Object.keys(stageTwo.hashes).length,
    `${Object.keys(stageOne.hashes).length} + ${Object.keys(stageTwo.hashes).length} = ${Object.keys(allHashes).length} bound entries, so nothing was overwritten. ${collidingKeys.length} key name(s) appear on both stages (${collidingKeys.join(", ")}) and are namespaced stage1./stage2. — an unnamespaced merge would have bound stage two's values under stage one's names and left stage one unbound.`);
  gate("everyStageOneHashIsStillDistinctlyBound",
    Object.entries(stageOne.hashes).every(([k, v]) => allHashes[`stage1.${k}`] === v),
    `all ${Object.keys(stageOne.hashes).length} stage-one hashes are bound under their own namespace with their own values`);
  gate("theOriginalIsMarkedNotOverwritten",
    existsSync(ORIGINAL) && JSON.parse(readFileSync(ORIGINAL, "utf8")).data.phase6C4B2ValidationPackageVersion != null,
    `${ORIGINAL} is untouched on disk; this artifact records it as SUPERSEDED_INCOMPLETE rather than rewriting it, because it is the record of what that phase actually had`);
  gate("bothDryRunsPassed", stageOne.dryRunPassed && stageTwo.dryRunPassed,
    `stage one dry run ${stageOne.dryRunPassed}, stage two dry run ${stageTwo.dryRunPassed} (${synDryRun.data.checkCount} checks)`);
  gate("everyCommandResolves", COMMANDS.every((c) => {
      const pkg = JSON.parse(readFileSync("package.json", "utf8"));
      return Boolean(pkg.scripts?.[c.npmScript]); }),
    `all ${COMMANDS.length} prepared commands resolve to a registered npm script, certified by execution in ${synCommands.data.certificationMethod.slice(0, 60)}...`);
  gate("bothSetsStillSealed",
    setAccessCount("historical-holdout-v5") === 0 && setAccessCount("synthetic-stress-holdout-v2") === 0,
    `historical-holdout-v5 access ${setAccessCount("historical-holdout-v5")}, synthetic-stress-holdout-v2 access ${setAccessCount("synthetic-stress-holdout-v2")} — this phase opened neither`);
  gate("candidateIdentityConsistentAcrossBothStages",
    core.aggregateCoreHash === v5Policy.data.hashes.candidateCoreHash
    && core.aggregateCoreHash === synPolicy.data.hashes.candidateCoreHash
    && def.parameterSetHash === v5Policy.data.hashes.parameterSetHash
    && def.parameterSetHash === synPolicy.data.hashes.parameterSetHash,
    `both stage policies pin core ${core.aggregateCoreHash.slice(0, 16)}... and parameter set ${def.parameterSetHash.slice(0, 16)}...`);
  gate("zeroParameterDrift",
    activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "no runtime parameter has drifted from its registry default");

  const payload = {
    compoundFormalValidationPackageVersion: "2.0.0",
    supersedes: { path: ORIGINAL,
      version: original.data.phase6C4B2ValidationPackageVersion ?? null,
      packageHash: original.data.packageHash ?? null,
      status: "SUPERSEDED_INCOMPLETE",
      why: blocker.data.missing.packageBinding,
      notOverwritten: "the original file is left exactly as the earlier phase wrote it. It is the record of what that phase actually had, and rewriting it would erase the evidence that the gap existed.",
      missingKeysItLeft: Object.keys(blocker.data.missing) },
    candidate: { id: recert.data.candidateId, lockRevision: recert.data.lockRevision,
      coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      recertifiedAtCommit: recert.data.recertifiedAtCommit },
    stages: [stageOne, stageTwo],
    stageOrder: "one then two. Stage two's runner verifies stage one returned PASS on the same candidate before it touches its seal; there is no supported order in which the synthetic set is opened first.",
    commands: COMMANDS.map((c) => ({ stage: c.stage, npmScript: c.npmScript, preparedCommand: c.preparedCommand,
      nonAccessingModes: c.nonAccessingModes })),
    commandsExecutedInThisPhase: { "validation:historical-v5": 0, "validation:synthetic-v2": 0,
      "validation:candidate1-formal-verdict": 0,
      note: "only the non-accessing modes were executed, as part of the command certification: --help, --dry-run and --preflight. No unlock was passed and no access log changed." },
    compoundVerdictRule: [
      "both stages must run; one stage is not a compound verdict",
      "both stages must have scored the same candidate core and parameter set",
      "any stage FAIL gives STAGE_FAILED",
      "any stage INVALID_RUN with no FAIL gives INVALID_RUN",
      "otherwise BOTH_STAGES_PASSED",
    ],
    whatBothStagesPassingDoesNotAuthorize: "It does not make Candidate 1 HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and it authorizes no preview or production deployment. Each of those statuses belongs to the phase that earns it, and production activation requires an explicit CEO GO LIVE.",
    boundHashCount: Object.keys(allHashes).length,
    boundHashes: allHashes,
    hashNamespacing: { collidingKeyNames: collidingKeys,
      why: "policyHash, seedSetHash, practicalMarginPolicyHash and dryRunArtifactHash exist on both stages. An unnamespaced merge bound stage two's values under stage one's names and left stage one unbound — the same silent binding gap this package exists to close — so every entry is namespaced by stage." },
    recordedAtCommit: git("rev-parse", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.packageHash = createHash("sha256").update(JSON.stringify(allHashes)).digest("hex");
  writeArtifact("compound-formal-validation-package-v2", payload, {
    generationCommand: "npm run syn:package", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nCOMPOUND PACKAGE: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · packageHash ${payload.packageHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
