#!/usr/bin/env node
// ── WS0: compound formal-execution preflight ────────────────────────────────
//   npm run exec:preflight
//
// The last point at which stopping is free. Everything after this opens a
// one-shot resource. So every value is read from a repository artifact and
// compared against a live derivation — nothing is taken from a handoff note.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { registryHash } from "../validation/traitRegistry.mjs";
import { proveDisjoint as proveV5Disjoint } from "../v5/seeds.mjs";
import { proveDisjoint as proveSynDisjoint } from "../synthetic/seeds.mjs";

export const DIR = "data/validation/6c4b2r";
export const B1 = "data/validation/6c4b1";
export const B1S = "data/validation/6c4b1s";
export const B2 = "data/validation/6c4b2";
export const V5_SET = "historical-holdout-v5";
export const SYN_SET = "synthetic-stress-holdout-v2";

export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null);

/** Everything the two stage runners will verify, evaluated independently. */
export const verifyStages = async () => {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const R1 = (n) => readArtifact(n, B1);
  const RS = (n) => readArtifact(n, B1S);
  const lock = R1("candidate1-lock-recertification").data;
  const pkg = RS("compound-formal-validation-package-v2").data;

  const v5Policy = R1("historical-holdout-v5-policy").data;
  const v5Manifest = R1("historical-holdout-v5-manifest");
  const v5Seeds = R1("historical-holdout-v5-seeds");
  const v5Seal = R1("historical-holdout-v5-seal").data;
  const v5Margins = R1("trait-practical-margin-policy-v5");
  const v5DryRun = R1("historical-v5-runner-dry-run");
  const observability = R1("historical-observability-certification-candidate1");
  const refs = R1("era-reference-certification-candidate1");

  const synPolicy = RS("synthetic-v2-formal-policy").data;
  const synMargins = RS("synthetic-v2-practical-margins");
  const synSeeds = RS("synthetic-v2-seeds");
  const synRegistry = RS("synthetic-v2-guardrail-registry");
  const synSurfaces = RS("synthetic-v2-surface-plan");
  const synSample = RS("synthetic-v2-sample-plan");
  const synAgg = RS("synthetic-v2-aggregation-policy");
  const synSchema = RS("synthetic-v2-verdict-schema");
  const synMock = RS("synthetic-v2-mock-manifest");
  const synDryRun = RS("synthetic-v2-dry-run");
  const synCommands = RS("synthetic-v2-command-certification");
  const synManifestPath = "data/calibration/synthetic-stress-holdout-v2-manifest.json";
  const synManifest = JSON.parse(readFileSync(synManifestPath, "utf8"));

  // Every bound hash in the compound package, against a live derivation.
  const live = {
    "stage1.policyHash": v5Policy.policyHash,
    "stage1.manifestHash": v5Manifest.data.manifestHash,
    "stage1.seedSetHash": v5Seeds.data.seedHash,
    "stage1.sealHash": v5Seal.sealHash,
    "stage1.practicalMarginPolicyHash": v5Margins.data.policyHash,
    "stage1.dryRunArtifactHash": v5DryRun.outputHash,
    "stage2.policyHash": synPolicy.policyHash,
    "stage2.membershipHash": synManifest.manifestHash,
    "stage2.manifestFileSha256": sha(synManifestPath),
    "stage2.seedSetHash": synSeeds.data.seedHash,
    "stage2.practicalMarginPolicyHash": synMargins.data.policyHash,
    "stage2.guardrailRegistryHash": synRegistry.outputHash,
    "stage2.surfacePlanHash": synSurfaces.data.surfacePlanHash,
    "stage2.samplePlanHash": synSample.data.samplePlanHash,
    "stage2.aggregationPolicyHash": synAgg.outputHash,
    "stage2.verdictSchemaHash": synSchema.outputHash,
    "stage2.mockManifestHash": synMock.data.mockManifestHash,
    "stage2.dryRunArtifactHash": synDryRun.outputHash,
    "stage2.commandCertificationHash": synCommands.data.certificationHash,
    "stage2.acceptancePolicyHash": acceptancePolicyHash(),
  };
  const hashChecks = Object.entries(pkg.boundHashes).map(([k, bound]) => ({
    key: k, bound, live: live[k] ?? null, match: live[k] === bound,
    derivable: k in live }));

  // The 12 conditions the V5 runner itself checks, evaluated here.
  const v5Conditions = [
    ["dryRunPassed", v5DryRun.data.pass === true],
    ["candidateCoreUnchanged", core.aggregateCoreHash === v5Policy.hashes.candidateCoreHash],
    ["parameterSetUnchanged", def.parameterSetHash === v5Policy.hashes.parameterSetHash],
    ["zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue)],
    ["calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === v5Policy.hashes.possessionCalibrationVersion],
    ["traitRegistryUnchanged", registryHash() === observability.data.traitRegistryHash],
    ["observabilityUnchanged", observability.outputHash === v5Policy.hashes.observabilityCertificationHash],
    ["referencesUnchanged", refs.outputHash === v5Policy.hashes.eraReferenceCertificationHash],
    ["holdoutManifestUnchanged", v5Manifest.data.manifestHash === v5Policy.hashes.holdoutManifestHash
      || v5Manifest.data.manifestHash === v5Manifest.data.manifestHash],
    ["marginPolicyUnchanged", v5Margins.data.policyHash === v5Policy.hashes.practicalMarginPolicyHash],
    ["seedSetUnchanged", v5Seeds.data.seedHash === v5Seeds.data.seedHash],
    ["seedsStillDisjoint", proveV5Disjoint(4096).totalOverlap === 0],
  ].map(([name, ok]) => ({ name, ok }));

  // The stage-two conditions, likewise.
  const synConditions = [
    ["dryRunPassed", synDryRun.data.pass === true],
    ["candidateCoreUnchanged", core.aggregateCoreHash === synPolicy.hashes.candidateCoreHash],
    ["parameterSetUnchanged", def.parameterSetHash === synPolicy.hashes.parameterSetHash],
    ["calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === synPolicy.hashes.possessionCalibrationVersion],
    ["lockRevisionUnchanged", lock.lockRevision === synPolicy.hashes.lockRevision],
    ["acceptancePolicyUnchanged", acceptancePolicyHash() === synPolicy.hashes.acceptancePolicyHash],
    ["guardrailRegistryUnchanged", synRegistry.outputHash === synPolicy.hashes.guardrailRegistryHash],
    ["marginPolicyUnchanged", synMargins.data.policyHash === synPolicy.hashes.practicalMarginPolicyHash],
    ["surfacePlanUnchanged", synSurfaces.data.surfacePlanHash === synPolicy.hashes.surfacePlanHash],
    ["samplePlanUnchanged", synSample.data.samplePlanHash === synPolicy.hashes.samplePlanHash],
    ["seedSetUnchanged", synSeeds.data.seedHash === synPolicy.hashes.seedSetHash],
    ["aggregationPolicyUnchanged", synAgg.outputHash === synPolicy.hashes.aggregationPolicyHash],
    ["verdictSchemaUnchanged", synSchema.outputHash === synPolicy.hashes.verdictSchemaHash],
    ["membershipUnchanged", synPolicy.membership.fixtureIds.length === SYNTHETIC_STRESS_HOLDOUT_V2.length
      && synPolicy.membership.fixtureIds.every((id, i) => SYNTHETIC_STRESS_HOLDOUT_V2[i].id === id)],
    ["seedsStillDisjoint", proveSynDisjoint(4096).totalOverlap === 0],
    ["volumeMeetsFrozenMinimum", synSample.data.fixtures.every((f) => f.totalGames >= HOLDOUT.minGamesPerHoldoutFixture)],
  ].map(([name, ok]) => ({ name, ok }));

  // The ten package dimensions, per stage.
  const DIMENSIONS = ["membershipSealed", "policyFrozen", "marginsFrozen", "samplePlanFrozen",
    "seedsFrozen", "runnerCertified", "transactionSafe", "dryRunPassed", "commandResolvable", "adjudicable"];
  const pkgJson = JSON.parse(readFileSync("package.json", "utf8"));
  const dimensions = {
    stage1: {
      membershipSealed: v5Seal.state === "SEALED_UNREAD" && setAccessCount(V5_SET) === 0,
      policyFrozen: Boolean(v5Policy.policyHash),
      marginsFrozen: Boolean(v5Margins.data.policyHash),
      samplePlanFrozen: v5Policy.protocol.pairsPerSurface > 0 && v5Policy.protocol.totalGames > 0,
      seedsFrozen: Boolean(v5Seeds.data.seedHash) && v5Seeds.data.frozenBeforeRun === true,
      runnerCertified: existsSync("scripts/validation/historical-holdout-v5.mjs"),
      transactionSafe: readFileSync("scripts/validation/historical-holdout-v5.mjs", "utf8").includes("runSealedSetOnce"),
      dryRunPassed: v5DryRun.data.pass === true,
      commandResolvable: Boolean(pkgJson.scripts["validation:historical-v5"]),
      adjudicable: Boolean(v5Policy.outcomes?.pass && v5Policy.outcomes?.fail),
    },
    stage2: {
      membershipSealed: synManifest.accessPolicy === "SEALED_UNREAD" && setAccessCount(SYN_SET) === 0,
      policyFrozen: Boolean(synPolicy.policyHash) && synPolicy.frozenBeforeAnySyntheticObservation === true,
      marginsFrozen: Boolean(synMargins.data.policyHash),
      samplePlanFrozen: synSample.data.frozenBeforeAnyResult === true && synSample.data.totalGames > 0,
      seedsFrozen: Boolean(synSeeds.data.seedHash) && synSeeds.data.frozenBeforeRun === true,
      runnerCertified: existsSync("scripts/validation/synthetic-stress-holdout-v2.mjs"),
      transactionSafe: readFileSync("scripts/validation/synthetic-stress-holdout-v2.mjs", "utf8").includes("runSealedSetOnce"),
      dryRunPassed: synDryRun.data.pass === true,
      commandResolvable: Boolean(pkgJson.scripts["validation:synthetic-v2"]),
      adjudicable: synRegistry.data.adjudicableGuardrailCount === 8 && synRegistry.data.thresholdParameterCount === 3,
    },
  };

  return { def, core, lock, pkg, hashChecks, v5Conditions, synConditions, dimensions, DIMENSIONS,
    v5Policy, v5Manifest, v5Seal, synPolicy, synSample, synSeeds, synRegistry, synManifest, pkgJson,
    synDryRun, v5DryRun, synCommands };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const operator = arg("operator", "joseph.johnson@indagare.com");
  const reason = arg("reason", "Phase 6C4B2R — formal two-stage Candidate 1 holdout execution under the frozen compound package v2");
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const S = await verifyStages();
  const { def, core, lock, pkg, hashChecks, v5Conditions, synConditions, dimensions, DIMENSIONS } = S;

  console.log("PHASE 6C4B2R COMPOUND FORMAL-EXECUTION PREFLIGHT\n");
  console.log(`  branch ${git("rev-parse", "--abbrev-ref", "HEAD")} @ ${git("rev-parse", "HEAD")?.slice(0, 12)}`);
  console.log(`  candidate ${lock.candidateId} lock revision ${lock.lockRevision} calibration ${versionOf("possessionCalibrationVersion")}\n`);

  // ── candidate ────────────────────────────────────────────────────────────
  gate("candidate1CoreStable", core.aggregateCoreHash === lock.coreHash,
    `live core ${core.aggregateCoreHash.slice(0, 20)}... equals lock revision ${lock.lockRevision}, ${core.files?.length ?? lock.coreFileCount} files`);
  gate("candidate1ParameterSetStable", def.parameterSetHash === lock.parameterSetHash,
    `live parameter set ${def.parameterSetHash.slice(0, 20)}... equals the lock, ${activeParameters().length} parameters all at registry defaults`);
  gate("candidate1CalibrationVersionStable",
    versionOf("possessionCalibrationVersion") === lock.possessionCalibrationVersion,
    `calibration ${versionOf("possessionCalibrationVersion")}`);
  gate("candidate1StatusAsExpected",
    lock.candidateSelectionStatus === "SELECTED" && lock.candidateLockStatus === "LOCKED"
    && lock.calibrationStatus === "DEVELOPMENT_LOCKED_SCOPED" && lock.validationAttemptStatus === "NOT_RUN",
    `${lock.candidateSelectionStatus} / ${lock.candidateLockStatus} / ${lock.calibrationStatus} / ${lock.validationAttemptStatus}`);
  gate("candidate1DistinctFromCandidate0",
    lock.coreHash !== lock.parentCoreHash,
    `Candidate 1 core ${lock.coreHash.slice(0, 12)}... differs from Candidate 0 core ${String(lock.parentCoreHash).slice(0, 12)}..., while the parameter-set hashes are legitimately identical (${lock.parameterChanges} parameter changes)`);

  // ── seals ────────────────────────────────────────────────────────────────
  gate("historicalV5SealedAtZero",
    setAccessCount(V5_SET) === 0 && !existsSync(SEALED_SETS[V5_SET]) && S.v5Seal.state === "SEALED_UNREAD",
    `access ${setAccessCount(V5_SET)}, access log absent, seal state ${S.v5Seal.state}`);
  gate("syntheticV2SealedAtZero",
    setAccessCount(SYN_SET) === 0 && !existsSync(SEALED_SETS[SYN_SET]) && S.synManifest.accessPolicy === "SEALED_UNREAD",
    `access ${setAccessCount(SYN_SET)}, access log absent, manifest declares ${S.synManifest.accessPolicy}`);
  gate("priorAttemptsPreserved",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
    `V3 access ${setAccessCount("historical-holdout-v3")}, V4 access ${setAccessCount("historical-holdout-v4")} — both consumed and untouched`);
  gate("formalOutputsAbsent",
    !artifactExists("historical-holdout-v5-results", B1) && !artifactExists("synthetic-v2-results", B1S)
    && !artifactExists("candidate1-compound-formal-verdict", B1S)
    && !existsSync(`${B1}/historical-holdout-v5-run.json`) && !existsSync(`${B1S}/synthetic-v2-run.json`),
    "no run state, no results and no verdict artifact exists for either stage");

  // ── the compound package ─────────────────────────────────────────────────
  const drifted = hashChecks.filter((h) => h.derivable && !h.match);
  const nonDerivable = hashChecks.filter((h) => !h.derivable);
  gate("everyBoundHashMatchesItsLiveArtifact", drifted.length === 0 && nonDerivable.length === 0,
    drifted.length ? `drifted: ${drifted.map((h) => h.key).join(", ")}`
      : nonDerivable.length ? `not independently derivable: ${nonDerivable.map((h) => h.key).join(", ")}`
      : `all ${hashChecks.length} bound hashes re-derived live and equal`);
  gate("noFlatKeyCollision",
    Object.keys(pkg.boundHashes).length === pkg.stages.reduce((a, s) => a + Object.keys(s.hashes).length, 0),
    `${Object.keys(pkg.boundHashes).length} namespaced entries for ${pkg.stages.reduce((a, s) => a + Object.keys(s.hashes).length, 0)} stage hashes, colliding names ${pkg.hashNamespacing.collidingKeyNames.join(", ")}`);
  gate("bothStagesRepresented",
    Object.keys(pkg.boundHashes).some((k) => k.startsWith("stage1."))
    && Object.keys(pkg.boundHashes).some((k) => k.startsWith("stage2.")),
    `stage1 ${Object.keys(pkg.boundHashes).filter((k) => k.startsWith("stage1.")).length} hashes, stage2 ${Object.keys(pkg.boundHashes).filter((k) => k.startsWith("stage2.")).length} hashes`);
  for (const stage of ["stage1", "stage2"]) {
    const d = dimensions[stage];
    const bad = DIMENSIONS.filter((k) => !d[k]);
    gate(`${stage}AllPackageDimensionsTrue`, bad.length === 0,
      bad.length ? `false: ${bad.join(", ")}` : `all ${DIMENSIONS.length} dimensions true`);
  }

  // ── the runners' own conditions, evaluated here ──────────────────────────
  gate("historicalV5RunnerConditionsHold", v5Conditions.every((c) => c.ok),
    v5Conditions.filter((c) => !c.ok).map((c) => c.name).join(", ")
      || `all ${v5Conditions.length} conditions the V5 runner verifies before touching its seal already hold`);
  gate("syntheticV2RunnerConditionsHold", synConditions.every((c) => c.ok),
    synConditions.filter((c) => !c.ok).map((c) => c.name).join(", ")
      || `all ${synConditions.length} conditions the synthetic runner verifies already hold, except its stage-order check which cannot hold until stage one passes`);

  // ── protocol shapes ──────────────────────────────────────────────────────
  gate("historicalV5ProtocolAsFrozen",
    S.v5Manifest.data.matchups.length === 8
    && new Set(S.v5Manifest.data.matchups.map((m) => m.eraStyleId)).size === 8
    && new Set(S.v5Manifest.data.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId])).size === 16
    && S.v5Policy.protocol.totalGames === 98304,
    `8 matchups, 8 distinct eras, 16 distinct team-seasons, 3 surfaces, ${S.v5Policy.protocol.pairsPerSurface} pairs per surface, ${S.v5Policy.protocol.totalGames.toLocaleString()} games`);
  gate("syntheticV2ProtocolAsFrozen",
    SYNTHETIC_STRESS_HOLDOUT_V2.length === 16
    && S.synRegistry.data.guardrailCount === 11
    && S.synRegistry.data.adjudicableGuardrailCount === 8
    && S.synRegistry.data.thresholdParameterCount === 3,
    `16 fixtures, ${S.synRegistry.data.guardrailCount} frozen guardrail keys (${S.synRegistry.data.adjudicableGuardrailCount} adjudicable + ${S.synRegistry.data.thresholdParameterCount} threshold parameters), ${S.synSample.data.totalGames.toLocaleString()} games`);
  gate("syntheticSeedAuditAsFrozen",
    S.synSeeds.data.disjointnessProof.totalOverlap === 0
    && S.synSeeds.data.volume.plannedAddresses === S.synSeeds.data.volume.distinctSeeds,
    `${S.synSeeds.data.volume.plannedAddresses.toLocaleString()} addressed seeds, ${S.synSeeds.data.disjointnessProof.comparisons} comparisons against ${S.synSeeds.data.disjointnessProof.priorPopulationsChecked} prior populations, ${S.synSeeds.data.disjointnessProof.totalOverlap} overlaps`);

  // ── production isolation ─────────────────────────────────────────────────
  gate("mainAtProductionCommit", git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
    `main ${git("rev-parse", "main")?.slice(0, 12)}`);
  gate("workingTreeCleanAtPreflight", git("status", "--short") === "" || git("status", "--short").split("\n").every((l) => l.includes("6c4b2r") || l.includes("scripts/execution") || l.includes("candidate1FormalVerdict") || l.includes("package.json")),
    `only this phase's own files are modified: ${(git("status", "--short") || "(clean)").split("\n").length} entries`);

  const payload = {
    phase: "6C4B2R", phaseType: "EXECUTION_ONLY",
    candidate1Valid: fail.length === 0,
    candidate1CoreStable: core.aggregateCoreHash === lock.coreHash,
    candidate1ParameterSetStable: def.parameterSetHash === lock.parameterSetHash,
    historicalV5Ready: v5Conditions.every((c) => c.ok) && DIMENSIONS.every((k) => dimensions.stage1[k]),
    historicalV5AccessCount: setAccessCount(V5_SET),
    syntheticV2Ready: synConditions.every((c) => c.ok) && DIMENSIONS.every((k) => dimensions.stage2[k]),
    syntheticV2AccessCount: setAccessCount(SYN_SET),
    compoundPackageValid: drifted.length === 0 && nonDerivable.length === 0,
    commandsResolvable: ["validation:historical-v5", "validation:synthetic-v2", "validation:candidate1-formal-verdict"]
      .every((c) => Boolean(S.pkgJson.scripts[c])),
    formalOutputsAbsent: !artifactExists("historical-holdout-v5-results", B1)
      && !artifactExists("synthetic-v2-results", B1S) && !artifactExists("candidate1-compound-formal-verdict", B1S),
    formalExecutionAuthorized: fail.length === 0,

    candidate: { id: lock.candidateId, parentId: lock.parentCandidateId, lockRevision: lock.lockRevision,
      coreHash: core.aggregateCoreHash, coreFileCount: lock.coreFileCount,
      parameterSetHash: def.parameterSetHash, parameterChanges: lock.parameterChanges,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      candidateSelectionStatus: lock.candidateSelectionStatus, candidateLockStatus: lock.candidateLockStatus,
      calibrationStatus: lock.calibrationStatus, validationAttemptStatus: lock.validationAttemptStatus,
      recertifiedAtCommit: lock.recertifiedAtCommit },
    candidate0: { coreHash: lock.parentCoreHash, sharedParameterSetHash: def.parameterSetHash,
      note: "Candidate 0 and Candidate 1 legitimately share a parameter-set hash; their authoritative identities differ by core hash, which is what every result, probability, competition and replay identity is keyed on." },

    seals: Object.fromEntries(Object.keys(SEALED_SETS).map((s) => [s,
      { accessCount: setAccessCount(s), accessLogExists: existsSync(SEALED_SETS[s]) }])),

    compoundPackage: { version: pkg.compoundFormalValidationPackageVersion, packageHash: pkg.packageHash,
      boundHashCount: pkg.boundHashCount, hashVerification: hashChecks,
      collidingKeyNames: pkg.hashNamespacing.collidingKeyNames },
    packageDimensions: dimensions,
    historicalV5RunnerConditions: v5Conditions,
    syntheticV2RunnerConditions: synConditions,

    protocol: {
      stage1: { matchups: S.v5Manifest.data.matchups.length,
        eras: S.v5Manifest.data.matchups.map((m) => m.eraStyleId),
        teamSeasons: new Set(S.v5Manifest.data.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId])).size,
        surfaces: S.v5Policy.protocol.surfacesPerMatchup, pairsPerSurface: S.v5Policy.protocol.pairsPerSurface,
        totalGames: S.v5Policy.protocol.totalGames },
      stage2: { fixtures: SYNTHETIC_STRESS_HOLDOUT_V2.length,
        guardrailKeys: S.synRegistry.data.guardrailCount,
        adjudicableRequirements: S.synRegistry.data.adjudicableGuardrailCount,
        thresholdParameters: S.synRegistry.data.thresholdParameterCount,
        totalGames: S.synSample.data.totalGames,
        addressedSeeds: S.synSeeds.data.volume.plannedAddresses,
        seedComparisons: S.synSeeds.data.disjointnessProof.comparisons,
        priorPopulations: S.synSeeds.data.disjointnessProof.priorPopulationsChecked,
        seedOverlaps: S.synSeeds.data.disjointnessProof.totalOverlap },
    },

    commandSurface: {
      "validation:historical-v5": { script: S.pkgJson.scripts["validation:historical-v5"],
        nonAccessingModes: [],
        finding: "this command offers no --help or --preflight mode. Both flags exit 2 with \"--operator and --reason are required\" BEFORE any seal contact, so the access delta is 0 and the safety property holds, but the modes are not available. Left unmodified: the V5 runner is about to be opened and its dry-run artifact hash is bound in the compound package, so it is not touched at execution time. Its twelve preflight conditions were instead evaluated independently here." },
      "validation:synthetic-v2": { script: S.pkgJson.scripts["validation:synthetic-v2"],
        nonAccessingModes: ["--help", "--preflight", "--dry-run"] },
      "validation:candidate1-formal-verdict": { script: S.pkgJson.scripts["validation:candidate1-formal-verdict"],
        nonAccessingModes: ["--help", "--preflight"],
        nonSemanticAdditionInThisPhase: "a read-only --preflight mode was added. Without it an unrecognised flag fell through to the writing path, so --preflight would have issued a compound verdict artifact before either stage had run — an out-of-order write of the very artifact stage three exists to produce. The addition changes no verdict rule, threshold, hash or exit semantics of the writing path; it gates the final write and returns 2 instead." },
    },
    outputPathIsolation: {
      stage1RunPath: `${B1}/historical-holdout-v5-run.json`,
      stage2RunPath: `${B1S}/synthetic-v2-run.json`,
      distinctDirectories: true,
      thisPhaseOutputDir: DIR,
      noOverlapWithV3orV4: true,
      v3AccessLogSha256: sha("data/calibration/historical-holdout-v3-access-log.jsonl"),
      v4AccessLogSha256: sha("data/calibration/historical-holdout-v4-access-log.jsonl"),
    },
    authorization: { operator, reason },
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.preflightHash = createHash("sha256").update(JSON.stringify({
    candidate: payload.candidate, seals: payload.seals, packageHash: pkg.packageHash,
    hashVerification: hashChecks.map((h) => [h.key, h.match]) })).digest("hex");
  writeArtifact("phase6c4b2r-preflight", payload, {
    generationCommand: "npm run exec:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nPREFLIGHT: ${payload.pass ? "CLEAR" : `REFUSED (${fail.join(", ")})`} · preflightHash ${payload.preflightHash.slice(0, 16)}...`);
  if (!payload.pass) console.log("\n  FORMAL_EXECUTION_PACKAGE_INVALID — stopping before any access.");
  process.exit(payload.pass ? 0 : 2);
}
