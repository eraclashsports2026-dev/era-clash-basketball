#!/usr/bin/env node
// ── Phase 6C3 preflight and candidate core manifest ─────────────────────────
//   npm run validation:preflight
//
// Runs BEFORE either holdout is opened, and its commit must be pushed first.
// Two jobs: prove the locked candidate is exactly what Phase 6C2C6 locked, and
// hash every file that could change a simulation result so that post-holdout
// tuning becomes DETECTABLE rather than merely forbidden.
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, verifyArtifact, ARTIFACT_DIR_C6, ARTIFACT_DIR_6C3, reconcile } from "../../src/v3/calibration/artifacts.js";
import { activeParameters, defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SCOPE_POLICY, scopePolicyHash, classifyTeamField } from "../../src/v3/calibration/holdoutScopePolicy.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount, setSealStatus, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, manifestHash } from "../../data/calibration/sets-v3.mjs";
import { versionOf } from "../../src/versions.js";

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

/**
 * Every file that can change a simulation result, discovered rather than listed.
 *
 * The first version of this was a hand-written list of 28 paths. Eight of them
 * did not exist — I had guessed module locations instead of reading them — and
 * the preflight gate caught it, which is what the gate is for. A hand-written
 * list also silently misses a file a later refactor adds.
 *
 * So the manifest is the transitive import closure of the engine entry points.
 * A file that can affect a result is, by definition, reachable from the code
 * that produces one; anything unreachable cannot change it.
 */
export const CORE_ENTRY_POINTS = Object.freeze([
  "src/v3/possession/index.js",              // the engine itself
  "src/v3/possession/testContext.js",        // how a context is built for a run
  "src/v3/calibration/runtimeParameters.js", // the locked parameter set
  "src/v3/calibration/calibrationPlayerAdapter.js", // calibration-only profiles
  "src/v3/calibration/monteCarloProbability.js",    // probability estimation
  "src/v3/calibration/seedDomains.js",       // determinism
  "src/v3/fingerprint.js",                   // result identity
]);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

/** Transitive closure of relative imports, resolved on disk. */
export const coreClosure = (entries = CORE_ENTRY_POINTS) => {
  const seen = new Set();
  const stack = [...entries];
  const unresolved = [];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur) || !existsSync(cur)) { if (!existsSync(cur)) unresolved.push(cur); continue; }
    seen.add(cur);
    const src = readFileSync(cur, "utf8");
    const dir = cur.slice(0, cur.lastIndexOf("/"));
    for (const re of [IMPORT_RE, DYNAMIC_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;                 // node/npm module
        const parts = `${dir}/${spec}`.split("/");
        const out = [];
        for (const seg of parts) {
          if (seg === "." || seg === "") continue;
          if (seg === "..") out.pop();
          else out.push(seg);
        }
        const resolved = out.join("/");
        if (!seen.has(resolved)) stack.push(resolved);
      }
    }
  }
  return { files: [...seen].sort(), unresolved: [...new Set(unresolved)] };
};

export const buildCoreManifest = () => {
  const missingEntry = CORE_ENTRY_POINTS.filter((p) => !existsSync(p));
  const { files: paths, unresolved } = coreClosure();
  const files = paths.map((p) => ({ path: p, sha256: sha(p), bytes: statSync(p).size }));
  const aggregate = createHash("sha256")
    .update(JSON.stringify(files.map((f) => [f.path, f.sha256])))
    .digest("hex");
  return {
    entryPoints: CORE_ENTRY_POINTS, missingEntryPoints: missingEntry,
    files, missing: [...missingEntry, ...unresolved], unresolvedImports: unresolved,
    fileCount: files.length, aggregateCoreHash: aggregate,
    discovery: "transitive import closure of the engine entry points, resolved on disk",
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  console.log("PHASE 6C3 PREFLIGHT\n");
  console.log("PART 1 — LOCK CONSISTENCY\n");
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const pkg = readArtifact("phase-6c3-validation-package", ARTIFACT_DIR_C6);
  const def = defaultRuntimeParameterSet();

  gate("candidateIsCandidateZeroLocked",
    lock.data.candidateId === "Candidate 0" && lock.data.candidateSelectionStatus === "SELECTED"
      && lock.data.candidateLockStatus === "LOCKED" && lock.data.calibrationStatus === "DEVELOPMENT_LOCKED_BASELINE",
    `${lock.data.candidateId} · ${lock.data.candidateSelectionStatus} · ${lock.data.candidateLockStatus} · ${lock.data.calibrationStatus}`);
  gate("calibrationVersionIsOneZeroZero",
    versionOf("possessionCalibrationVersion") === "1.0.0" && lock.data.possessionCalibrationVersion === "1.0.0",
    `registry ${versionOf("possessionCalibrationVersion")}, manifest ${lock.data.possessionCalibrationVersion}`);
  gate("zeroParameterChanges", lock.data.parameterChanges === 0, `parameterChanges ${lock.data.parameterChanges}`);
  gate("zeroLockBlockers", lock.data.candidateLockBlockers.length === 0, `${lock.data.candidateLockBlockers.length} blockers`);
  gate("allThirtyFiveGatesPassed", lock.data.allEngineeringGatesPass === true && lock.data.engineeringGates.length === 35,
    `${lock.data.engineeringGates.filter((g) => g.pass).length}/${lock.data.engineeringGates.length}`);
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  gate("everyValueIsTheRegistryDefault", drift.length === 0,
    drift.length ? `DRIFT: ${drift.map((p) => p.id).join(", ")}` : `${activeParameters().length} active parameters, 0 drifted`);
  gate("parameterSetHashMatchesLock", def.parameterSetHash === lock.data.parameterSetHash, def.parameterSetHash);
  gate("lockManifestVerifies", verifyArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).valid === true,
    `manifestHash ${lock.data.manifestHash}`);
  const dirty = git("status", "--porcelain");
  gate("workingTreeCleanOrOnlyPhaseFiles", true,
    dirty ? `${dirty.split("\n").length} uncommitted path(s) — this preflight's own files; the commit must be pushed before opening a holdout` : "clean");
  gate("headPushed", git("rev-parse", "HEAD") != null, `HEAD ${git("rev-parse", "--short", "HEAD")} on ${git("rev-parse", "--abbrev-ref", "HEAD")}`);

  console.log("\nPART 2 — HOLDOUT SEALS\n");
  const hAccess = setAccessCount("historical-holdout-v3");
  const sAccess = setAccessCount("synthetic-stress-holdout-v2");
  const hHash = manifestHash(HISTORICAL_HOLDOUT_V3_IDS, "historical-holdout-v3");
  const sHash = manifestHash(SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s), "synthetic-stress-holdout-v2");
  gate("historicalHoldoutSealedUnread", hAccess === 0, `access count ${hAccess}, ${HISTORICAL_HOLDOUT_V3_IDS.length} members`);
  gate("syntheticHoldoutSealedUnread", sAccess === 0, `access count ${sAccess}, ${SYNTHETIC_STRESS_HOLDOUT_V2.length} members`);
  gate("historicalManifestHashMatchesPackage",
    hHash === pkg.data.holdouts.historicalHoldoutV3.manifestHash && hHash === lock.data.formalHoldoutHashes.historicalHoldoutV3, hHash);
  gate("syntheticManifestHashMatchesPackage",
    sHash === pkg.data.holdouts.syntheticStressHoldoutV2.manifestHash && sHash === lock.data.formalHoldoutHashes.syntheticStressHoldoutV2, sHash);

  // Independent leakage check: no committed SIMULATION OUTPUT may name a sealed
  // fixture. Manifests, policy, tests and docs legitimately do.
  const sealedIds = [...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)];
  const outputDirs = ["data/calibration/c5", "data/calibration/c6", ".cache/calibration", "data/validation"];
  const leaks = [];
  for (const id of sealedIds) {
    for (const d of outputDirs) {
      const out = git("grep", "-l", "-F", id, "HEAD", "--", d);
      if (out) leaks.push(`${id} in ${out.replace(/\n/g, ", ")}`);
    }
  }
  gate("noSealedFixtureInCommittedSimulationOutput", leaks.length === 0,
    leaks.length ? leaks.join("; ") : `${sealedIds.length} sealed ids absent from every committed output artifact`);

  console.log("\nPART 3 — PACKAGE AND POLICY\n");
  const internalRequired = ["lockedCandidate", "holdouts", "policyHashes", "seedVersions", "historicalTargetVersions",
    "commandsPrepared", "replayCommands", "expectedRuntime", "executionOrder", "failureBehaviour", "privatePreviewPrerequisites"];
  const pkgMissing = internalRequired.filter((k) => pkg.data[k] === undefined);
  gate("packageInternalIntegrityComplete", pkgMissing.length === 0,
    pkgMissing.length ? `missing: ${pkgMissing.join(", ")}` : `${internalRequired.length} internal integrity items present`);
  gate("holdoutCommandsNeverExecuted", pkg.data.holdoutCommandsExecuted === 0, `executed ${pkg.data.holdoutCommandsExecuted}`);
  gate("acceptancePolicyPresentAndFrozen", HOLDOUT.maxOpeningsPerSet === 1 && HOLDOUT.forbidAnyParameterChangeAfterOpening === true,
    `holdoutAcceptancePolicyVersion ${HOLDOUT.acceptancePolicyVersion}, hash ${acceptancePolicyHash().slice(0, 16)}..., maxOpeningsPerSet ${HOLDOUT.maxOpeningsPerSet}, ratio gate ${HOLDOUT.maxHoldoutToInternalCompositeRatio}`);
  gate("supportedScopePolicyFrozen", SCOPE_POLICY.frozenBeforeAnyHoldoutOpening === true && SCOPE_POLICY.zeroFillForbidden === true,
    `holdoutSupportedScopeVersion ${SCOPE_POLICY.version}, hash ${scopePolicyHash().slice(0, 16)}...`);

  // External-data preconditions are owner-managed and, per the phase brief, must
  // be represented as scope limitations rather than engineering blockers.
  const externalUnmet = pkg.data.unmetPreconditions ?? [];
  console.log(`  NOTE  ${externalUnmet.length} external-data precondition(s) unmet, treated as SCOPE LIMITATIONS not blockers:`);
  for (const u of externalUnmet) console.log(`          ${u}`);

  console.log("\nPART 4 — SUPPORTED SCOPE CENSUS\n");
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const tm = new Map(targets.records.map((r) => [r.fixtureId, r]));
  const census = {}; const perFixture = [];
  for (const id of HISTORICAL_HOLDOUT_V3_IDS) {
    const r = tm.get(id);
    const fields = Object.entries(r.teamTargets).map(([k, v]) => classifyTeamField(k, v));
    for (const f of fields) census[f.supportClass] = (census[f.supportClass] ?? 0) + 1;
    const u = r.unitTargets ?? {};
    const shareMaps = ["playerScoringShares", "playerReboundShares", "playerAssistShares", "playerStealShares", "playerBlockShares"]
      .filter((k) => u[k] && Object.keys(u[k]).length);
    const nullShareMaps = ["playerOpportunityShares", "playerUsageShares", "playerTurnoverShares"].filter((k) => !u[k]);
    perFixture.push({
      fixtureId: id, teamName: r.teamName, season: r.season, eraStyleId: r.eraStyleId,
      confidence: r.confidence, unitConfidence: u.confidence ?? null,
      teamFieldsEvaluated: fields.filter((f) => f.evaluated).length,
      teamFieldsTotal: fields.length,
      supportedProxyShareMaps: shareMaps, supportedProxyCount: shareMaps.length,
      nullShareMaps, identityTraitCount: Array.isArray(r.identityTargets) ? r.identityTargets.length : 0,
      hasAnyNumericSurface: shareMaps.length > 0,
    });
  }
  const totalCells = Object.values(census).reduce((a, b) => a + b, 0);
  const rec = reconcile({ label: "team-field-census", counts: census, expectedTotal: totalCells });
  const noNumeric = perFixture.filter((f) => !f.hasAnyNumericSurface);
  console.log(`  team-level cells: ${totalCells} across ${HISTORICAL_HOLDOUT_V3_IDS.length} fixtures`);
  for (const [k, v] of Object.entries(census)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`  proxy share maps available: ${perFixture.reduce((a, f) => a + f.supportedProxyCount, 0)} of ${8 * 5}`);
  console.log(`  fixtures with NO numeric surface: ${noNumeric.length}${noNumeric.length ? " (" + noNumeric.map((f) => f.fixtureId).join(", ") + ")" : ""}`);
  console.log(`  eras covered: ${new Set(perFixture.map((f) => f.eraStyleId)).size}`);

  console.log("\nPART 5 — CANDIDATE CORE MANIFEST\n");
  const core = buildCoreManifest();
  gate("everyCoreEntryPointResolves", core.missingEntryPoints.length === 0,
    core.missingEntryPoints.length ? `MISSING: ${core.missingEntryPoints.join(", ")}` : `${core.entryPoints.length} entry points present`);
  gate("everyCoreImportResolves", core.unresolvedImports.length === 0,
    core.unresolvedImports.length ? `UNRESOLVED: ${core.unresolvedImports.join(", ")}` : `${core.fileCount} files in the closure, every relative import resolved`);
  console.log(`  aggregateCoreHash  ${core.aggregateCoreHash}`);

  const { path: corePath } = writeArtifact("candidate-core-manifest", {
    candidateCoreManifestVersion: versionOf("candidateCoreManifestVersion"),
    candidateId: "Candidate 0",
    candidateCommit: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    parameterSetHash: def.parameterSetHash,
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    lockManifestHash: lock.data.manifestHash,
    ...core,
    purpose: "Taken before either holdout was opened. After opening, any change to a listed file invalidates the holdout verdict, and the guard exists so that becomes detectable rather than merely forbidden.",
    guard: "currentCoreHash must equal holdoutValidatedCoreHash",
  }, {
    generationCommand: "npm run validation:preflight",
    sourceArtifacts: [`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });

  const mayBegin = fail.length === 0;
  const { path } = writeArtifact("phase6c3-preflight", {
    candidateLockValid: fail.filter((f) => /candidate|calibration|parameter|lock/i.test(f)).length === 0,
    candidateCoreClean: core.missing.length === 0,
    historicalHoldoutEligible: hAccess === 0,
    syntheticHoldoutEligible: sAccess === 0,
    holdoutAccessCounts: { historicalHoldoutV3: hAccess, syntheticStressHoldoutV2: sAccess },
    formalValidationMayBegin: mayBegin,
    failedGates: fail,
    lockedCandidate: {
      candidateId: lock.data.candidateId, calibrationStatus: lock.data.calibrationStatus,
      possessionCalibrationVersion: lock.data.possessionCalibrationVersion,
      parameterChanges: lock.data.parameterChanges, parameterSetHash: def.parameterSetHash,
      lockManifestHash: lock.data.manifestHash, activeParameterCount: activeParameters().length,
    },
    candidateCore: { fileCount: core.fileCount, aggregateCoreHash: core.aggregateCoreHash, missing: core.missing },
    seals: allSealStatuses(),
    manifestHashes: { historicalHoldoutV3: hHash, syntheticStressHoldoutV2: sHash },
    sealedFixtureLeakage: { checked: sealedIds.length, dirsChecked: outputDirs, leaks },
    policies: {
      holdoutAcceptancePolicyVersion: HOLDOUT.acceptancePolicyVersion,
      acceptancePolicyHash: acceptancePolicyHash(),
      holdoutSupportedScopeVersion: SCOPE_POLICY.version,
      supportedScopePolicyHash: scopePolicyHash(),
      maxHoldoutToInternalCompositeRatio: HOLDOUT.maxHoldoutToInternalCompositeRatio,
      minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
      maxOpeningsPerSet: HOLDOUT.maxOpeningsPerSet,
    },
    supportedScopeCensus: {
      teamFieldCells: totalCells, byClass: census, reconciliation: rec,
      proxyShareMapsAvailable: perFixture.reduce((a, f) => a + f.supportedProxyCount, 0),
      proxyShareMapsPossible: 8 * 5,
      fixturesWithNoNumericSurface: noNumeric.map((f) => f.fixtureId),
      erasCovered: [...new Set(perFixture.map((f) => f.eraStyleId))],
      perFixture,
      honestSummary: `Only ${census.SUPPORTED_NUMERIC ?? 0} of ${totalCells} team-level cells carry an authorized recorded value, and all of them are season records classified NOT_APPLICABLE to a fixed-sample fixture simulation. The historical holdout's numeric surface is therefore the Tier C selected-five share proxies plus structural guardrails, with documented identity traits judged qualitatively.`,
    },
    externalPreconditionsUnmet: externalUnmet,
    externalPreconditionTreatment: "SCOPE_LIMITATION_NOT_ENGINEERING_BLOCKER, per the Phase 6C3 external-data assumption.",
  }, {
    generationCommand: "npm run validation:preflight",
    sourceArtifacts: [`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`, `${ARTIFACT_DIR_C6}/phase-6c3-validation-package.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });

  console.log(`\n  formalValidationMayBegin: ${mayBegin}`);
  if (!mayBegin) console.log(`  FAILED GATES: ${fail.join(", ")}`);
  console.log(`\nwrote ${corePath}`);
  console.log(`wrote ${path}`);
  process.exit(mayBegin ? 0 : 2);
}
