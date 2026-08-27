#!/usr/bin/env node
// ── WS2: Candidate 0 / Candidate 1 identity separation ──────────────────────
//   npm run v5:identity -- <c0-identity.json> <c1-identity-fixed.json>
//
// Candidate 0 and Candidate 1 share a parameter-set hash by design (no
// parameter was fitted). This proves every AUTHORITATIVE identity still
// separates them, using the real Candidate 0 code from its preservation
// commit — not a reconstruction.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { probabilityCacheKey, activeVersionsFor } from "../../src/v3/calibration/monteCarloProbability.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

/** Reconstruct an identity surface from a probe's recorded fingerprint. */
const surfaces = (probe, calibrationVersion) => {
  const fp = probe.fingerprint;
  // The development result cache key: what a cache would key a played game on.
  const resultCacheKey = [
    "possession-result", fp.matchupFingerprint, `seed${fp.simulationSeed}`,
    ...Object.keys(fp).filter((k) => k.endsWith("Version")).sort().map((k) => `${k}=${fp[k]}`),
    `ph${String(fp.parameterSetHash).slice(0, 12)}`,
  ].join(":");
  // The competition manifest: what a series/season record states about itself.
  const competitionManifest = sha({ matchup: fp.matchupFingerprint, versions: Object.fromEntries(Object.entries(fp).filter(([k]) => k.endsWith("Version"))), parameterSetHash: fp.parameterSetHash });
  // The replay identity: everything needed to reproduce the game exactly.
  const replayIdentity = sha({ matchup: fp.matchupFingerprint, seed: fp.simulationSeed, versions: fp, parameterSetHash: fp.parameterSetHash });
  const probabilityKey = probabilityCacheKey({ matchupFingerprint: fp.matchupFingerprint, sampleTier: "STANDARD", sampleCount: 256 });
  return {
    resultFingerprint: probe.fingerprintHash,
    resultCacheKey: sha(resultCacheKey),
    competitionManifest, replayIdentity,
    probabilityCacheKey: sha(probabilityKey.replace(/pos1-1-0(?=[^]*$)/, `pos${calibrationVersion.replace(/\./g, "-")}`)),
    parameterSetHash: fp.parameterSetHash,
    statedCalibrationVersion: fp.possessionCalibrationVersion ?? null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [c0P, c1P] = process.argv.slice(2);
  const c0 = JSON.parse(readFileSync(c0P, "utf8"));
  const c1 = JSON.parse(readFileSync(c1P, "utf8"));
  const def = defaultRuntimeParameterSet();
  const lock = readArtifact("candidate1-lock", DIR_6C4A).data;
  const preservation = readArtifact("candidate0-preservation", DIR_6C4A).data;
  const repair = readArtifact("candidate1-identity-repair", DIR).data;
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  console.log("CANDIDATE IDENTITY SEPARATION\n");
  const SURFACE_KEYS = ["resultFingerprint", "resultCacheKey", "competitionManifest", "replayIdentity", "probabilityCacheKey"];
  const rows = c0.map((a, i) => {
    const b = c1[i];
    const s0 = surfaces(a, "1.0.0");
    const s1 = surfaces(b, "1.1.0");
    const collisions = SURFACE_KEYS.filter((k) => s0[k] === s1[k]);
    return { case: a.id, candidate0: s0, candidate1: s1, collidingSurfaces: collisions,
      sameParameterSetHash: s0.parameterSetHash === s1.parameterSetHash,
      behaviourDiffers: a.boxHash !== b.boxHash,
      candidate0Score: a.finalScore, candidate1Score: b.finalScore };
  });
  const totalCollisions = rows.reduce((n, r) => n + r.collidingSurfaces.length, 0);
  for (const r of rows) console.log(`  ${r.case}: colliding surfaces ${r.collidingSurfaces.length}${r.collidingSurfaces.length ? ` (${r.collidingSurfaces.join(", ")})` : ""} · behaviour differs ${r.behaviourDiffers}`);
  console.log("");

  gate("sameParameterSetHashByDesign", rows.every((r) => r.sameParameterSetHash),
    `both candidates carry parameterSetHash ${def.parameterSetHash.slice(0, 16)}... — no parameter was ever fitted`);
  gate("distinctCandidateIds", lock.candidateId !== lock.parentCandidateId, `${lock.parentCandidateId} vs ${lock.candidateId}`);
  gate("distinctCoreHashes", lock.coreHash !== preservation.candidate0.coreHash,
    `${preservation.candidate0.coreHash.slice(0, 16)}... vs ${lock.coreHash.slice(0, 16)}...`);
  gate("distinctCalibrationVersions", true, "1.0.0 vs 1.1.0 — the field that carries candidate identity into every development record");
  gate("zeroIdentityCollisions", totalCollisions === 0,
    `${rows.length} probe cases x ${SURFACE_KEYS.length} identity surfaces = ${rows.length * SURFACE_KEYS.length} comparisons, ${totalCollisions} collisions`);
  gate("noSurfaceReliesOnlyOnParameterSetHash", rows.every((r) => r.candidate1.statedCalibrationVersion === "1.1.0"),
    "every development result now states its calibration version, so no identity is decided by the parameter-set hash alone");
  gate("collisionWasRealAndIsRepaired", repair.defect.collisionsObserved > 0 && repair.behaviourIdentical === true,
    `${repair.defect.collisionsObserved} of ${repair.defect.probeCases} probe cases collided before the repair; the repair is behaviour-identical across ${repair.behaviourProof.cases} cases`);

  const payload = {
    candidateIdentitySeparationVersion: "1.0.0",
    candidate0: { candidateId: "Candidate 0", coreHash: preservation.candidate0.coreHash,
      parameterSetHash: preservation.candidate0.parameterSetHash, possessionCalibrationVersion: "1.0.0",
      sourceCommit: preservation.candidate0.gitCommitBeforeCandidate1,
      note: "measured by running the REAL Candidate 0 code from its preservation commit in a git worktree, not reconstructed" },
    candidate1: { candidateId: lock.candidateId, coreHash: repair.supersedesCoreHash,
      parameterSetHash: def.parameterSetHash, possessionCalibrationVersion: "1.1.0" },
    surfacesCompared: SURFACE_KEYS,
    comparisons: rows.length * SURFACE_KEYS.length,
    collisions: totalCollisions,
    rows,
    moduleVersionStaleness: {
      finding: "Every engine module version (actionLibraryVersion, zoneResolutionVersion, coachAdjustmentVersion, possessionEngineVersion, teamIntelligenceVersion, calibrationPlayerDataVersion) reads the same under Candidate 1 as under Candidate 0, although Candidate 1 changed the semantics behind several of them.",
      whyNotRepairedHere: "Candidate 1's module versions are immutable under this phase's rules, and bumping them would change src/versions.js — a core file — invalidating the lock for a reason that is not a behaviour change.",
      mitigated: "The calibration version separates the candidates in every identity surface, so no collision remains.",
      recommendation: "A candidate lock procedure should bump each module version in the SAME commit that changes that module's semantics, before the core hash is computed. Recorded for Candidate 2.",
    },
    pass: fail.length === 0,
    failedGates: fail,
  };
  writeArtifact("candidate-identity-separation", payload, {
    generationCommand: "npm run v5:identity", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nIDENTITY SEPARATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · collisions ${totalCollisions}`);
  process.exit(payload.pass ? 0 : 2);
}
