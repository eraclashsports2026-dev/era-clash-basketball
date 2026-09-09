#!/usr/bin/env node
// ── WS2: the Candidate 1 identity repair and its behaviour proof ────────────
//   npm run v5:identity-repair -- <before.json> <after.json> <c0.json> <c1.json>
//
// Candidate 1 changed engine semantics while keeping every parameter at its
// registry default and every module version unchanged, and the development
// possession fingerprint did not state the calibration version. The result:
// Candidate 0 and Candidate 1 produced BYTE-IDENTICAL result fingerprints for
// materially different games — a cache keyed on that fingerprint would serve
// one candidate's game for the other's request.
//
// The repair adds the calibration version — the stable name of "which
// candidate's algorithms" — to the DEVELOPMENT possession fingerprint only.
// Production's fingerprint is deliberately untouched: the production engine
// never reads a possession calibration, so stamping it there would be false
// provenance and would invalidate every stored production game.
//
// This artifact carries the proof that the repair changed identity and
// NOTHING else: 441 behaviour cases, byte-identical before and after.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
/** The commit whose tree holds the locked Candidate 1 core. */
export const lockCommit = () => git("log", "--format=%H", "-1", "--", `${DIR_6C4A}/candidate1-lock.json`);

if (import.meta.url === `file://${process.argv[1]}`) {
  const [beforeP, afterP, c0P, c1P] = process.argv.slice(2);
  const before = JSON.parse(readFileSync(beforeP, "utf8"));
  const after = JSON.parse(readFileSync(afterP, "utf8"));
  const c0 = JSON.parse(readFileSync(c0P, "utf8"));
  const c1 = JSON.parse(readFileSync(c1P, "utf8"));
  const def = defaultRuntimeParameterSet();
  const lock = readArtifact("candidate1-lock", DIR_6C4A).data;

  const identical = before.behaviourHash === after.behaviourHash;
  const changedCases = before.cases.filter((x, i) => JSON.stringify(x) !== JSON.stringify(after.cases[i])).map((x) => x.id);
  const collisionsBefore = c0.filter((a, i) => a.fingerprintHash === c1[i].fingerprintHash);

  const payload = {
    candidateIdentitySeparationVersion: "1.0.0",
    defect: {
      title: "Candidate 0 and Candidate 1 produced identical development result fingerprints",
      discovered: "Phase 6C4B1 WS2, while building the identity-separation evidence the phase requires",
      mechanism: "Candidate 1 kept every parameter at its registry default (so parameterSetHash equals Candidate 0's) and every engine module version unchanged, and resultVersions() in src/v3/possession/index.js never stated possessionCalibrationVersion. Every field of the development result fingerprint was therefore equal between the two candidates.",
      evidence: c0.map((a, i) => ({ case: a.id, candidate0Fingerprint: a.fingerprintHash, candidate1Fingerprint: c1[i].fingerprintHash,
        collided: a.fingerprintHash === c1[i].fingerprintHash,
        candidate0Score: a.finalScore, candidate1Score: c1[i].finalScore, behaviourDiffered: a.boxHash !== c1[i].boxHash })),
      collisionsObserved: collisionsBefore.length,
      probeCases: c0.length,
      severity: "A development result cache keyed on this fingerprint would return a Candidate 0 game for a Candidate 1 request.",
    },
    repair: {
      changedCoreFiles: ["src/v3/possession/index.js"],
      change: "resultVersions() now states possessionCalibrationVersion (the candidate discriminator, 1.0.0 vs 1.1.0).",
      productionUntouched: "src/v3/fingerprint.js and the affectsResult registry flag are unchanged: the production engine never reads a possession calibration, so stamping a development version onto production records would claim a provenance production does not have and would invalidate every stored production game.",
      moduleVersionsUntouched: "No engine module version was bumped. Candidate 1's module versions are immutable under this phase's rules; their staleness is recorded as a limitation and a Candidate 2 lock-procedure recommendation, not repaired here.",
    },
    behaviourProof: {
      cases: before.cases.length,
      behaviourHashBefore: before.behaviourHash,
      behaviourHashAfter: after.behaviourHash,
      changedCases,
      coverage: "the pre-wiring parity corpus, the 6C1 baseline cases, a 400-game era x coach sweep, a best-of-7, an 82-game season, and a probability estimate — scores, box scores, ledgers, rng draws and invariants, with every version field deliberately excluded",
    },
    behaviourIdentical: identical && changedCases.length === 0,
    changedCoreFiles: ["src/v3/possession/index.js"],
    supersedesCoreHash: lock.coreHash,
    lockCommit: lockCommit(),
    pass: identical && changedCases.length === 0 && collisionsBefore.length > 0,
  };
  writeArtifact("candidate1-identity-repair", payload, {
    generationCommand: "npm run v5:identity-repair", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`identity repair: ${collisionsBefore.length}/${c0.length} probe cases collided before the repair`);
  console.log(`behaviour: ${before.cases.length} cases · identical ${payload.behaviourIdentical} · changed ${changedCases.length}`);
  console.log(`lock commit ${payload.lockCommit.slice(0, 12)}`);
  process.exit(payload.pass ? 0 : 2);
}
