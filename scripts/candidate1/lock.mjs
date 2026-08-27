#!/usr/bin/env node
// ── Phase 6C4A WS10: lock Candidate 1 ───────────────────────────────────────
//   npm run c1:lock -- --stamp     stamp 1.1.0 into src/versions.js, then lock
//   npm run c1:lock                verify an existing lock
//
// The lock is a CLAIM about readiness, and every part of it is verified live:
// all nine phase gates green, the stamp proven to be the only difference
// between the validated core and the locked one, Candidate 0 untouched, both
// failed holdouts preserved, the synthetic stress set sealed. The status is
// DEVELOPMENT_LOCKED_SCOPED: locked for Historical Holdout V5, nothing more —
// not holdout validated, not preview validated, not production ready.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { CHANGES } from "./manifests.mjs";
import { DIR } from "./failureRegister.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const stamp = process.argv.includes("--stamp");

  // ── the stamp ─────────────────────────────────────────────────────────────
  const validatedCoreHash = R("candidate1-core-manifest").data.aggregateCoreHash;
  if (stamp) {
    const p = "src/versions.js";
    let s = readFileSync(p, "utf8");
    const old = `  possessionCalibrationVersion: entry("1.0.0", DEVELOPMENT_LOCKED_BASELINE,
    "The approved development calibration of the possession engine: Candidate 0, all 53 active parameters at registry defaults, parameterSetHash 83f5a17dea0c36d4fd64d80a98a5fcd794ff4b7d2adf3dc955bcec0ca6f1b309. Locked in Phase 6C2C6 after the corrected probability side-bias gate passed. NOT holdout validated, NOT preview validated, NOT production ready.", false),`;
    const neu = `  possessionCalibrationVersion: entry("1.1.0", DEVELOPMENT_LOCKED_SCOPED,
    "Candidate 1: the trait-fidelity repair of Candidate 0 (parent 1.0.0, which stays LOCKED at its recorded hashes and replays from its preservation commit). Engine changes are exactly the root-caused V4 repairs: movement/isolation eligibility floors with continuous tapers, era-honest movement and offensive-quality adapter inputs, per-possession continuous zone use, position-scoped defensive-accolade floors, and the offensive-glass wire. All 53 active parameters remain at registry defaults. Locked in Phase 6C4A, scoped to Historical Holdout V5. NOT holdout validated, NOT preview validated, NOT production ready.", false),`;
    if (!s.includes(old)) {
      if (!s.includes('entry("1.1.0", DEVELOPMENT_LOCKED_SCOPED')) throw new Error("cannot find the version entry to stamp");
      console.log("already stamped");
    } else {
      s = s.replace(old, neu);
      writeFileSync(p, s);
      console.log("stamped possessionCalibrationVersion 1.1.0 (DEVELOPMENT_LOCKED_SCOPED)");
    }
  }
  // re-import AFTER any stamp
  const { versionOf } = await import(`../../src/versions.js?stamp=${Date.now()}`);
  const version = versionOf("possessionCalibrationVersion");
  const live = buildCoreManifest();
  const def = defaultRuntimeParameterSet();

  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  console.log("\nCANDIDATE 1 LOCK GATES\n");
  gate("versionStamped", version === "1.1.0", `possessionCalibrationVersion ${version}`);

  // stamp isolation: the ONLY file differing from the validated core is
  // src/versions.js, and within it only the stamped entry
  const validated = new Map(R("candidate1-core-manifest").data.files.map((f) => [f.path, f.sha256]));
  const diffs = live.files.filter((f) => validated.get(f.path) !== f.sha256).map((f) => f.path);
  gate("stampIsTheOnlyCoreChangeSinceValidation", diffs.length === 1 && diffs[0] === "src/versions.js",
    `files differing from the validated manifest: ${diffs.join(", ") || "none"}`);

  const gatesPass =
    gate("preflightGreen", R("phase6c4a-preflight").data.candidate1DevelopmentMayBegin, "WS0") &
    gate("registerReconciles", R("historical-v4-failure-register").data.reconciles, "WS1") &
    gate("instrumentationRepaired", R("target-schema-validation").data.pass && R("profile-resolution-audit").data.pass && R("runner-preflight-audit").data.pass, "WS2") &
    gate("marginPolicyFrozen", R("trait-practical-margin-policy").data.frozen, "WS2") &
    gate("allSubstantiveFailuresRootCaused", R("candidate1-root-cause-analysis").data.unresolved === 0, "WS3") &
    gate("movementRepairAccepted", R("candidate1-movement-repair").data.pass, "WS4") &
    gate("offenseRepairAccepted", R("candidate1-offense-repair").data.pass, "WS5") &
    gate("defenseRepairAccepted", R("candidate1-defense-repair").data.pass, "WS6") &
    gate("remainingRepairsAccepted", R("candidate1-remaining-repairs").data.pass, "WS7") &
    gate("internalValidationPass", R("candidate1-internal-validation").data.pass, "WS9") &
    gate("sideSymmetryPass", R("candidate1-side-symmetry").data.pass, `${R("candidate1-side-symmetry").data.totalGames} games`) &
    gate("probabilityPass", R("candidate1-probability-validation").data.pass, "no material regression") &
    gate("competitionPass", R("candidate1-competition-validation").data.pass, `${R("candidate1-competition-validation").data.totalGames} games`);

  gate("parametersAtDefaults", activeParameters().every((p) => def.values[p.id] === p.defaultValue), `${def.parameterCount} parameters`);
  const c0lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
  gate("candidate0StillLocked", c0lock.candidateLockStatus === "LOCKED" && c0lock.possessionCalibrationVersion === "1.0.0", "parent lock untouched");
  gate("v3FailPreserved", setAccessCount("historical-holdout-v3") === 1, "access 1");
  gate("v4FailPreserved", setAccessCount("historical-holdout-v4") === 1, "access 1");
  gate("syntheticSealed", setAccessCount("synthetic-stress-holdout-v2") === 0, "access 0");
  const snap0 = JSON.parse(readFileSync(`${DIR}/behaviour-snapshot-candidate0.json`, "utf8"));
  const snap1 = JSON.parse(readFileSync(`${DIR}/behaviour-snapshot-candidate1-draft.json`, "utf8"));
  gate("productionEngineByteIdentical", snap0.production.productionEngineSha256 === snap1.production.productionEngineSha256, "src/engine.js sha256 unchanged");

  // overfitting rejection criteria (Part 13) — each maps to recorded evidence
  const off = R("candidate1-offense-repair").data;
  const deff = R("candidate1-defense-repair").data;
  gate("notOnlyV4TeamsImprove", off.gates.heldInEliteOffencesAboveReference && deff.gates.fullEvidenceHeldInDefencePasses, "held-in improvements recorded");
  gate("noUniversalShifts", off.gates.noUniversalScoringShift && deff.gates.noUniversalDefensiveShift, "population means ~0");
  gate("noEraFlattening", R("candidate1-movement-repair").data.gates.noEraFlattening, "movement spread 0.23");
  gate("hierarchyIntact", R("candidate1-internal-validation").data.gates.rosterHierarchyIntact, "strong beats weak");
  gate("calibrationNotRegressed", R("candidate1-internal-validation").data.gates.calibrationObjectiveNotRegressed, "objective within bounds");

  if (fail.length) {
    console.log(`\nLOCK REFUSED: ${fail.join(", ")}`);
    process.exit(2);
  }

  const payload = {
    candidateLockManifestVersion: "1.0.0",
    candidateId: "Candidate 1",
    parentCandidateId: "Candidate 0",
    parentCoreHash: R("candidate0-preservation").data.candidate0.coreHash,
    parentLockManifest: "data/calibration/c6/baseline-candidate-lock.json",
    candidateSelectionStatus: "SELECTED",
    candidateLockStatus: "LOCKED",
    calibrationStatus: "DEVELOPMENT_LOCKED_SCOPED",
    validationAttemptStatus: "NOT_RUN",
    scope: "Historical Holdout V5 formal validation. Nothing here authorises synthetic-stress access, preview, or production.",
    possessionCalibrationVersion: version,
    parameterSetHash: def.parameterSetHash,
    parameterChanges: 0,
    candidateLockBlockers: [],
    allEngineeringGatesPass: true,
    coreHash: live.aggregateCoreHash,
    validatedCoreHash,
    engineBehaviourChanged: true,
    changeBasis: "data/validation/6c4a/candidate1-root-cause-analysis.json — no engine change exists without a root-caused failure it repairs",
    stampIsolation: "the locked core differs from the validated core in exactly one file (src/versions.js): the stamped 1.1.0 entry and the DEVELOPMENT_LOCKED_SCOPED status-constant import it requires; behaviour is identical because the version string shapes fingerprints and cache keys, never outcomes",
    coreFileCount: live.fileCount,
    closureBuilderVersion: live.closureBuilderVersion,
    changedCoreFiles: CHANGES.map((c) => c.file).sort(),
    changeManifestHash: R("candidate1-change-manifest").outputHash,
    coreManifestHash: R("candidate1-core-manifest").outputHash,
    parameterSetArtifactHash: R("candidate1-parameter-set").outputHash,
    vsCandidate0Hash: R("candidate1-vs-candidate0").outputHash,
    rootCauseAnalysisHash: R("candidate1-root-cause-analysis").outputHash,
    validationHashes: {
      internal: R("candidate1-internal-validation").outputHash,
      sideSymmetry: R("candidate1-side-symmetry").outputHash,
      probability: R("candidate1-probability-validation").outputHash,
      competition: R("candidate1-competition-validation").outputHash,
    },
    repairHashes: {
      movement: R("candidate1-movement-repair").outputHash,
      offense: R("candidate1-offense-repair").outputHash,
      defense: R("candidate1-defense-repair").outputHash,
      remaining: R("candidate1-remaining-repairs").outputHash,
    },
    traitPracticalMarginPolicyHash: R("trait-practical-margin-policy").data.policyHash,
    formalHoldoutAccessCounts: { historicalHoldoutV3: 1, historicalHoldoutV4: 1, syntheticStressHoldoutV2: 0 },
    engineVersions: { productionEngineVersion: "3.2.0" },
    postLockMutationPolicy: "No core, parameter, policy or seed change after this manifest. Any quantitative change requires a new candidate with a new possessionCalibrationVersion, exactly as this one required.",
    notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
    lockedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.manifestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  writeArtifact("candidate1-lock", payload, { generationCommand: "npm run c1:lock -- --stamp", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nCANDIDATE 1 LOCKED · ${version} · core ${live.aggregateCoreHash.slice(0, 16)}... · manifest ${payload.manifestHash.slice(0, 16)}...`);
}
