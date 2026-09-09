#!/usr/bin/env node
// ── WS2: re-certify the Candidate 1 lock after the identity repair ──────────
//   npm run v5:recertify
//
// Phase 6C4A's lock stands byte-unchanged as history. This is a NEW artifact
// recording lock revision 2: the same candidate, the same behaviour, a new
// core hash, because one core file changed for identity reasons only.
//
// The phase brief permits exactly this and requires exactly this evidence:
// "Fix versioned identity infrastructure only if it does not alter Candidate 1
// results. Re-certify Candidate 1 lock."
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifestV3 } from "./coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

if (import.meta.url === `file://${process.argv[1]}`) {
  const lock = readArtifact("candidate1-lock", DIR_6C4A);
  const repair = readArtifact("candidate1-identity-repair", DIR).data;
  const graph = readArtifact("candidate-core-graph-certification", DIR).data;
  const separation = readArtifact("candidate-identity-separation", DIR).data;
  const def = defaultRuntimeParameterSet();
  const live = await buildCoreManifestV3();
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  console.log("CANDIDATE 1 LOCK RE-CERTIFICATION (revision 2)\n");
  gate("sameCandidate", lock.data.candidateId === "Candidate 1" && versionOf("possessionCalibrationVersion") === lock.data.possessionCalibrationVersion,
    `${lock.data.candidateId} · calibration ${lock.data.possessionCalibrationVersion} unchanged — a behaviour-identical repair does not make a new candidate`);
  gate("behaviourIdentical", repair.behaviourIdentical === true,
    `${repair.behaviourProof.cases} behaviour cases byte-identical (${repair.behaviourProof.behaviourHashBefore.slice(0, 16)}...)`);
  gate("exactlyOneCoreFileChanged", graph.changedSinceLock.length === 1 && graph.changedSinceLock[0].path === "src/v3/possession/index.js",
    graph.changedSinceLock.map((c) => c.path).join(", "));
  gate("priorLockReproducible", graph.lockReproducedFromCurrentGraph === lock.data.coreHash,
    `restoring that file's locked content reproduces ${lock.data.coreHash.slice(0, 16)}... exactly`);
  gate("parametersUnchanged", def.parameterSetHash === lock.data.parameterSetHash && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `parameterSetHash ${def.parameterSetHash.slice(0, 16)}..., zero drift`);
  gate("coreGraphCertified", graph.pass === true, `parser-backed graph, ${graph.declaredModuleCount} modules, ${graph.missingExecutedModules.length} executed-but-undeclared`);
  gate("identitySeparated", separation.pass === true && separation.collisions === 0, `${separation.collisions} collisions across ${separation.comparisons} comparisons`);
  gate("productionEngineStillThreeTwoZero", versionOf("engineVersion") === "3.2.0" && lock.data.engineVersions.productionEngineVersion === "3.2.0",
    `production engine ${versionOf("engineVersion")} — untouched by any candidate work`);
  gate("priorLockArtifactUntouched", lock.data.coreHash === repair.supersedesCoreHash,
    "data/validation/6c4a/candidate1-lock.json is preserved byte-unchanged as the revision-1 record");

  if (fail.length) { console.log(`\nRE-CERTIFICATION REFUSED: ${fail.join(", ")}`); process.exit(2); }

  const payload = {
    candidateId: "Candidate 1",
    lockRevision: 2,
    revisionReason: "IDENTITY_INFRASTRUCTURE_REPAIR — Candidate 0 and Candidate 1 produced byte-identical development result fingerprints; resultVersions() now states the calibration version. No simulated result changed.",
    supersedesCoreHash: lock.data.coreHash,
    supersedesArtifact: `${DIR_6C4A}/candidate1-lock.json`,
    supersedesLockRevision: 1,
    coreHash: live.aggregateCoreHash,
    coreFileCount: live.fileCount,
    candidateCoreGraphVersion: live.candidateCoreGraphVersion,
    changedCoreFiles: repair.changedCoreFiles,
    behaviourIdentical: true,
    behaviourProofCases: repair.behaviourProof.cases,
    behaviourHash: repair.behaviourProof.behaviourHashAfter,
    // everything else is carried forward from revision 1, unchanged
    parentCandidateId: lock.data.parentCandidateId,
    parentCoreHash: lock.data.parentCoreHash,
    candidateSelectionStatus: lock.data.candidateSelectionStatus,
    candidateLockStatus: lock.data.candidateLockStatus,
    calibrationStatus: lock.data.calibrationStatus,
    validationAttemptStatus: lock.data.validationAttemptStatus,
    possessionCalibrationVersion: lock.data.possessionCalibrationVersion,
    parameterSetHash: def.parameterSetHash,
    parameterChanges: 0,
    scope: lock.data.scope,
    notClaimed: lock.data.notClaimed,
    // A lock manifest states its production isolation. Carried forward from
    // revision 1 and re-verified live, so the claim is current rather than copied.
    engineVersions: { ...lock.data.engineVersions, productionEngineVersion: versionOf("engineVersion") },
    formalHoldoutAccessCounts: lock.data.formalHoldoutAccessCounts,
    postLockMutationPolicy: "Unchanged from revision 1. This revision exists because an identity defect made the lock's own promise unverifiable; a behaviour change would have required a new candidate, not a revision.",
    supportingArtifacts: {
      identityRepair: readArtifact("candidate1-identity-repair", DIR).outputHash,
      coreGraphCertification: readArtifact("candidate-core-graph-certification", DIR).outputHash,
      identitySeparation: readArtifact("candidate-identity-separation", DIR).outputHash,
    },
    recertifiedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.manifestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  writeArtifact("candidate1-lock-recertification", payload, {
    generationCommand: "npm run v5:recertify", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nCANDIDATE 1 RE-CERTIFIED · revision 2 · core ${payload.coreHash.slice(0, 16)}... (was ${payload.supersedesCoreHash.slice(0, 16)}...) · manifest ${payload.manifestHash.slice(0, 16)}...`);
}
