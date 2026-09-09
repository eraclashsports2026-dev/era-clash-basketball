#!/usr/bin/env node
// ── Phase 6C4A preflight: preserve everything before touching the engine ────
//   npm run c1:preflight
//
// Candidate 1 development may not begin until this proves, live, that the
// facts it must never disturb are intact: Candidate 0's lock and hashes, the
// V3 and V4 FAIL verdicts, the synthetic-V2 seal, and a behaviour snapshot of
// Candidate 0 taken before any engine edit exists.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./failureRegister.mjs";

const V6C3R = "data/validation/6c3r";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  // This preflight records a MOMENT: the state before any Candidate 1 engine
  // edit existed. Re-running it after the fact would overwrite that record
  // with post-change values and report a false failure — which is exactly
  // what happened once, and is why the guard exists. Verification of the
  // recorded facts belongs to the test suite and the lock, not to a re-run.
  if (existsSync(`${DIR}/candidate1-draft-manifest.json`) || existsSync(`${DIR}/candidate1-lock.json`)) {
    const p = readArtifact("phase6c4a-preflight", DIR).data;
    console.log("PHASE 6C4A PREFLIGHT — already recorded; refusing to overwrite a historical record.");
    console.log(`  recorded at the pre-change core: candidate1DevelopmentMayBegin ${p.candidate1DevelopmentMayBegin}`);
    console.log("  a Candidate 1 manifest exists, so the live core is no longer the pre-change core by design.");
    process.exit(p.candidate1DevelopmentMayBegin ? 0 : 2);
  }
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const v3 = readArtifact("historical-holdout-results", ARTIFACT_DIR_6C3);
  const v4 = readArtifact("historical-holdout-v4-results", V6C3R);
  const verd4 = readArtifact("replacement-formal-verdict", V6C3R);
  const core = readArtifact("candidate-core-manifest", ARTIFACT_DIR_6C3);
  const live = buildCoreManifest();
  const def = defaultRuntimeParameterSet();
  const snap = JSON.parse(readFileSync(`${DIR}/behaviour-snapshot-candidate0.json`, "utf8"));

  console.log("PHASE 6C4A PREFLIGHT\n\nPART 1 — CANDIDATE 0 PRESERVED\n");
  const candidate0Preserved =
    gate("candidate0StillLocked", lock.data.candidateLockStatus === "LOCKED" && lock.data.candidateSelectionStatus === "SELECTED",
      `${lock.data.candidateId} · ${lock.data.candidateSelectionStatus} · ${lock.data.candidateLockStatus}`) &
    gate("candidate0CoreHashLive", live.aggregateCoreHash === core.data.aggregateCoreHash,
      `live ${live.aggregateCoreHash.slice(0, 16)}... === recorded (${live.fileCount} files) — no engine edit exists yet`) &
    gate("candidate0ParameterSetLive", def.parameterSetHash === lock.data.parameterSetHash
      && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
      `parameterSetHash ${def.parameterSetHash.slice(0, 16)}..., zero drift`) &
    gate("calibrationVersionStill100", versionOf("possessionCalibrationVersion") === "1.0.0", versionOf("possessionCalibrationVersion")) &
    gate("behaviourSnapshotRecorded", snap.games.length === 30 && !!snap.production.productionEngineSha256,
      `${snap.games.length} snapshot games + production engine source hash, snapshotHash ${snap.snapshotHash.slice(0, 16)}...`);

  console.log("\nPART 2 — FAILED HOLDOUTS PRESERVED, NOT RESCORED\n");
  const historicalV3Preserved =
    gate("v3FailIntact", setAccessCount("historical-holdout-v3") === 1 && v3.data.verdict === "HISTORICAL_HOLDOUT_FAIL",
      `access 1 · ${v3.data.verdict}`);
  const historicalV4Preserved =
    gate("v4FailIntact", setAccessCount("historical-holdout-v4") === 1 && verd4.data.combinedVerdict === "HISTORICAL_V4_FAILED",
      `access 1 · ${verd4.data.combinedVerdict} · calibration status ${verd4.data.calibrationStatusAfterVerdict}`) &
    // The set was consumed by its one formal run and the verdict is FAILED, so
    // this phase designates it FAILED_HOLDOUT_DIAGNOSTIC_SET: its results are
    // development diagnostics, never a fresh holdout and never rescored.
    gate("v4UsableForDevelopment", setAccessCount("historical-holdout-v4") === 1 && verd4.data.calibrationStatusAfterVerdict === "HOLDOUT_FAILED",
      "consumed once + HOLDOUT_FAILED -> designated FAILED_HOLDOUT_DIAGNOSTIC_SET for this phase") &
    gate("v4NeverRescored", verd4.data.diagnosis.wouldTheVerdictChangeWithPracticalMargins === false,
      "the verdict records that practical margins would not flip it; the FAIL stands as issued");

  console.log("\nPART 3 — SYNTHETIC V2 STILL SEALED\n");
  const syntheticV2StillSealed =
    gate("syntheticV2Sealed", setAccessCount("synthetic-stress-holdout-v2") === 0,
      `access count ${setAccessCount("synthetic-stress-holdout-v2")}`);

  console.log("\nPART 4 — REPOSITORY STATE\n");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  gate("notOnMain", branch !== "main" && branch === "phase-6c4a-candidate1-trait-fidelity", `branch ${branch}`);
  gate("mainUntouched", git("rev-parse", "main") === "9cd95ff2f6752b724b459f22001269bfd50cbf95".slice(0, git("rev-parse", "main").length)
    || git("rev-parse", "--short", "main") === "9cd95ff", `main at ${git("rev-parse", "--short", "main")}`);

  const preservation = {
    candidate0: {
      candidateId: lock.data.candidateId, coreHash: core.data.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash, possessionCalibrationVersion: "1.0.0",
      lockManifestSha256: sha(`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`),
      behaviourSnapshotSha256: sha(`${DIR}/behaviour-snapshot-candidate0.json`),
      behaviourSnapshotHash: snap.snapshotHash, productionEngineSha256: snap.production.productionEngineSha256,
      gitCommitBeforeCandidate1: git("rev-parse", "HEAD"),
      replayGuarantee: "Candidate 0 replays exactly via this commit; Candidate 1 is a separate candidate built beside it, never a mutation of it",
    },
    historicalV3: { verdict: v3.data.verdict, accessCount: 1, resultsSha256: sha(`${ARTIFACT_DIR_6C3}/historical-holdout-results.json`) },
    historicalV4: { verdict: verd4.data.combinedVerdict, setStatus: "FAILED_HOLDOUT_DIAGNOSTIC_SET", accessCount: 1,
      resultsSha256: sha(`${V6C3R}/historical-holdout-v4-results.json`), verdictSha256: sha(`${V6C3R}/replacement-formal-verdict.json`) },
    syntheticV2: { accessCount: 0, status: "SEALED" },
  };
  writeArtifact("candidate0-preservation", preservation, {
    generationCommand: "npm run c1:preflight", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  const flags = {
    candidate0Preserved: !!candidate0Preserved,
    historicalV3Preserved: !!historicalV3Preserved,
    historicalV4Preserved: !!historicalV4Preserved,
    syntheticV2StillSealed: !!syntheticV2StillSealed,
    candidate1DevelopmentMayBegin: fail.length === 0,
  };
  writeArtifact("phase6c4a-preflight", { ...flags, branch, gatesFailed: fail, preservation }, {
    generationCommand: "npm run c1:preflight", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n${JSON.stringify(flags, null, 2)}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
