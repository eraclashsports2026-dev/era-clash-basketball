#!/usr/bin/env node
// ── Phase 6C4B1 preflight ────────────────────────────────────────────────────
//   npm run v5:preflight
//
// Verifies Candidate 1's locked identity and the preservation of everything
// this phase must not disturb, before any V5 preparation begins. Core
// stability is checked against the LOCK; if an identity re-certification
// exists, its behaviour-equality proof must carry the difference — a bare
// hash mismatch with no proof is drift and fails.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { simulateGame } from "../../src/engine.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";

export const DIR = "data/validation/6c4b1";
export const DIR_6C4A = "data/validation/6c4a";
const A = (n) => readArtifact(n, DIR_6C4A);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

/** The core hash Candidate 1 is currently certified at: the lock, unless an
 *  identity re-certification supersedes it with a behaviour-equality proof. */
export const certifiedCoreHash = () => {
  const lock = A("candidate1-lock").data;
  if (artifactExists("candidate1-lock-recertification", DIR)) {
    const rec = readArtifact("candidate1-lock-recertification", DIR).data;
    if (rec.supersedesCoreHash === lock.coreHash && rec.behaviourIdentical === true) {
      return { hash: rec.coreHash, source: "RECERTIFIED", revision: rec.lockRevision, lockHash: lock.coreHash };
    }
  }
  return { hash: lock.coreHash, source: "ORIGINAL_LOCK", revision: 1, lockHash: lock.coreHash };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  const lock = A("candidate1-lock").data;
  const c0lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
  const preservation = A("candidate0-preservation").data;
  const readiness = A("historical-v5-readiness").data;
  const live = buildCoreManifest();
  const def = defaultRuntimeParameterSet();
  const certified = certifiedCoreHash();

  console.log("PHASE 6C4B1 PREFLIGHT\n\nPART 1 — CANDIDATE 1 LOCK\n");
  const lockValid =
    gate("candidate1Locked", lock.candidateLockStatus === "LOCKED" && lock.candidateSelectionStatus === "SELECTED",
      `${lock.candidateId} · ${lock.candidateSelectionStatus} / ${lock.candidateLockStatus} / ${lock.calibrationStatus}`) &
    gate("validationAttemptNotRun", lock.validationAttemptStatus === "NOT_RUN", lock.validationAttemptStatus) &
    gate("calibrationVersionIs110", lock.possessionCalibrationVersion === "1.1.0" && versionOf("possessionCalibrationVersion") === "1.1.0",
      `lock ${lock.possessionCalibrationVersion} · registry ${versionOf("possessionCalibrationVersion")}`) &
    gate("parentIsCandidate0", lock.parentCandidateId === "Candidate 0" && lock.parentCoreHash === preservation.candidate0.coreHash,
      `parent core ${lock.parentCoreHash.slice(0, 16)}...`) &
    gate("zeroLockBlockers", lock.candidateLockBlockers.length === 0 && lock.allEngineeringGatesPass === true,
      `${lock.candidateLockBlockers.length} blockers, all gates ${lock.allEngineeringGatesPass}`);

  const coreStable =
    gate("parametersAtLockedValues", def.parameterSetHash === lock.parameterSetHash
      && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
      `parameterSetHash ${def.parameterSetHash.slice(0, 16)}..., zero drift, ${def.parameterCount} parameters`) &
    gate("coreCertified", live.aggregateCoreHash === certified.hash,
      certified.source === "RECERTIFIED"
        ? `live == re-certified core ${certified.hash.slice(0, 16)}... (lock revision ${certified.revision}, supersedes ${certified.lockHash.slice(0, 16)}... with a behaviour-equality proof)`
        : `live == locked core ${certified.hash.slice(0, 16)}...`);

  console.log("\nPART 2 — REPLAY\n");
  const replayCase = { goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
    blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], eraStyleId: "2010s",
    coachGoldId: "steve-kerr", coachBlueId: "phil-jackson", simulationSeed: 4242 };
  const r1 = runPossessionGame(buildPossessionInput(replayCase), { includeLedger: true });
  const r2 = runPossessionGame(buildPossessionInput(replayCase), { includeLedger: true });
  const hx = (g) => createHash("sha256").update(JSON.stringify([g.finalScore, g.gold, g.blue, g.possessionLedger])).digest("hex");
  const replayValid = gate("candidate1ReplayExact", hx(r1) === hx(r2), `two runs of one seed byte-identical (${hx(r1).slice(0, 16)}...)`);
  // production 3.2.0: the SOURCE is the invariant, verified by hash
  const prodSha = sha("src/engine.js");
  gate("productionEngineByteIdentical", prodSha === preservation.candidate0.productionEngineSha256,
    `src/engine.js ${prodSha.slice(0, 16)}... unchanged since the Candidate 0 preservation snapshot`);

  console.log("\nPART 3 — PRIOR ATTEMPTS PRESERVED\n");
  const v3ok = gate("historicalV3Consumed", setAccessCount("historical-holdout-v3") === 1
    && readArtifact("historical-holdout-results", "data/validation/6c3").data.verdict === "HISTORICAL_HOLDOUT_FAIL",
    "access 1 · HISTORICAL_HOLDOUT_FAIL");
  const v4ok = gate("historicalV4Consumed", setAccessCount("historical-holdout-v4") === 1
    && readArtifact("replacement-formal-verdict", "data/validation/6c3r").data.combinedVerdict === "HISTORICAL_V4_FAILED",
    "access 1 · HISTORICAL_V4_FAILED");
  const synOk = gate("syntheticV2Sealed", setAccessCount("synthetic-stress-holdout-v2") === 0, "access 0 · SEALED_UNREAD");
  const c0ok = gate("candidate0Untouched", c0lock.candidateLockStatus === "LOCKED"
    && c0lock.possessionCalibrationVersion === "1.0.0"
    && sha(`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`) === preservation.candidate0.lockManifestSha256,
    `Candidate 0 lock manifest byte-identical to its preservation hash`);

  console.log("\nPART 4 — V5 NOT YET CREATED\n");
  // No V5 fixture id may appear in any committed output, and no synthetic
  // stress member may either. Both checked against the git tree, not the disk.
  const pool = A("historical-v5-candidate-pool").data;
  const v5Ids = pool.teams.map((t) => t.fixtureId).filter((id) => id.startsWith("v5-"));
  const leaks = [];
  for (const id of v5Ids) {
    const hit = git("grep", "-l", "-F", id, "HEAD", "--", "data/validation/6c3", "data/validation/6c3r", "data/calibration", ".cache");
    if (hit) leaks.push(`${id} in ${hit.replace(/\n/g, ", ")}`);
  }
  const synLeaks = [];
  for (const s of SYNTHETIC_STRESS_HOLDOUT_V2.map((x) => x.id ?? x)) {
    const hit = git("grep", "-l", "-F", s, "HEAD", "--", "data/validation", "data/calibration/c5", "data/calibration/c6");
    if (hit) synLeaks.push(`${s} in ${hit.replace(/\n/g, ", ")}`);
  }
  const v5NotSelected = gate("v5NotSelected", !artifactExists("historical-v5-selection", DIR) && readiness.v5MayOpen === false,
    `no selection artifact; readiness records v5MayOpen ${readiness.v5MayOpen} with ${readiness.outstandingBeforeV5.length} blockers`);
  const v5NotSimulated = gate("v5NotSimulatedOrLeaked", leaks.length === 0,
    `${v5Ids.length} candidate v5 ids checked against committed simulation/calibration output · leaks ${leaks.length}`);
  gate("syntheticV2NotLeaked", synLeaks.length === 0, `${SYNTHETIC_STRESS_HOLDOUT_V2.length} synthetic members checked · leaks ${synLeaks.length}`);
  gate("v5SealNotYetRegistered", setAccessCount("historical-holdout-v5") === 0,
    `historical-holdout-v5 access count ${setAccessCount("historical-holdout-v5")} (unregistered sets read 0)`);

  console.log("\nPART 5 — REPOSITORY\n");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  gate("onPhaseBranch", branch === "phase-6c4b1-v5-freeze-and-seal", `branch ${branch}`);
  gate("mainAtProductionCommit", git("rev-parse", "--short", "main") === "9cd95ff", `main ${git("rev-parse", "--short", "main")}`);
  gate("productionVersionsUntouched", versionOf("engineVersion") === "3.2.0" && versionOf("appVersion") === "2.7.2",
    `engine ${versionOf("engineVersion")} · app ${versionOf("appVersion")}`);

  const flags = {
    candidate1LockValid: !!lockValid,
    candidate1CoreStable: !!coreStable,
    candidate1ReplayValid: !!replayValid,
    candidate0Preserved: !!c0ok,
    historicalV3Preserved: !!v3ok,
    historicalV4Preserved: !!v4ok,
    syntheticV2StillSealed: !!synOk,
    v5NotSelected: !!v5NotSelected,
    v5NotSimulated: !!v5NotSimulated,
    v5PreparationMayBegin: fail.length === 0,
  };
  const identity = {
    candidateId: lock.candidateId,
    possessionCalibrationVersion: lock.possessionCalibrationVersion,
    lockedCoreHash: lock.coreHash,
    certifiedCoreHash: certified.hash,
    certifiedCoreSource: certified.source,
    lockRevision: certified.revision,
    parameterSetHash: def.parameterSetHash,
    parameterCount: def.parameterCount,
    parameterChanges: 0,
    coreFileCount: live.fileCount,
    lockManifestHash: lock.manifestHash,
    lockedAtCommit: lock.lockedAtCommit,
  };
  const extra = { parameterSetHash: def.parameterSetHash };
  writeArtifact("candidate1-integrity-verification", {
    identity,
    priorAttempts: {
      historicalHoldoutV3: { accessCount: setAccessCount("historical-holdout-v3"), state: "CONSUMED", verdict: "FAIL",
        failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE" },
      historicalHoldoutV4: { accessCount: setAccessCount("historical-holdout-v4"), state: "CONSUMED", verdict: "FAIL",
        failureClass: "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE" },
      syntheticStressHoldoutV2: { accessCount: setAccessCount("synthetic-stress-holdout-v2"), state: "SEALED_UNREAD" },
      historicalHoldoutV5: { accessCount: setAccessCount("historical-holdout-v5"), state: "NOT_CREATED" },
    },
    candidate0: { coreHash: preservation.candidate0.coreHash, parameterSetHash: preservation.candidate0.parameterSetHash,
      possessionCalibrationVersion: "1.0.0", lockManifestSha256: preservation.candidate0.lockManifestSha256,
      productionEngineSha256: preservation.candidate0.productionEngineSha256, replaysFromCommit: preservation.candidate0.gitCommitBeforeCandidate1 },
    leakChecks: { v5IdsChecked: v5Ids.length, v5Leaks: leaks, syntheticMembersChecked: SYNTHETIC_STRESS_HOLDOUT_V2.length, syntheticLeaks: synLeaks },
    gatesFailed: fail,
    pass: fail.length === 0,
  }, { generationCommand: "npm run v5:preflight", dir: DIR, extra });
  writeArtifact("phase6c4b1-preflight", { ...flags, branch, gatesFailed: fail, identity }, {
    generationCommand: "npm run v5:preflight", dir: DIR, extra });

  console.log(`\n${JSON.stringify(flags, null, 2)}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
