#!/usr/bin/env node
// ── Candidate 1 draft manifest ───────────────────────────────────────────────
//   npm run c1:draft-manifest        (re-run after every engine-repair commit)
//
// Candidate 1 is a SEPARATE candidate. Candidate 0 is never mutated: it stays
// SELECTED/LOCKED at its recorded hashes and replays from the preservation
// commit. This manifest is what makes the succession attributable — every test
// that pins "the engine has not moved" now pins "the engine has not moved
// EXCEPT as this manifest records, and matches the successor exactly".
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifest, coreClosure } from "../validation/preflight.mjs";
import { DIR } from "./failureRegister.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

if (import.meta.url === `file://${process.argv[1]}`) {
  const preservation = readArtifact("candidate0-preservation", DIR).data;
  const parentCommit = preservation.candidate0.gitCommitBeforeCandidate1;
  const live = buildCoreManifest();
  const def = defaultRuntimeParameterSet();

  // core files changed since the preservation commit — the candidate diff
  const changedAll = git("diff", "--name-only", parentCommit, "HEAD", "--").split("\n").filter(Boolean);
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean).map((l) => l.slice(3));
  const coreFiles = new Set(coreClosure().files);
  const changedCoreFiles = [...new Set([...changedAll, ...dirty])].filter((f) => coreFiles.has(f)).sort();

  const payload = {
    candidateId: "Candidate 1",
    parentCandidateId: "Candidate 0",
    candidateSelectionStatus: "DRAFT",
    candidateLockStatus: "UNLOCKED",
    validationAttemptStatus: "NOT_RUN",
    engineBehaviourChanged: true,
    parentCoreHash: preservation.candidate0.coreHash,
    parentParameterSetHash: preservation.candidate0.parameterSetHash,
    parentCommit,
    coreHash: live.aggregateCoreHash,
    parameterSetHash: def.parameterSetHash,
    coreFileCount: live.fileCount,
    closureBuilderVersion: live.closureBuilderVersion,
    parentClosureBuilderVersion: "1.0.0",
    closureCorrection: {
      defect: "closure builder v1 could not see multi-line import statements; src/v3/actions/offensivePlan.js ran in every game while sitting outside every core manifest",
      filesV1Missed: ["src/v3/actions/offensivePlan.js"],
      consequence: "Candidate 0's recorded 52-file hash stands as the frozen fact it always was; Candidate 1 manifests are computed under builder v2 (53 files)",
    },
    changedCoreFiles,
    changeBasis: "data/validation/6c4a/candidate1-root-cause-analysis.json — no engine change exists without a root-caused failure it repairs",
    note: "DRAFT: grows through WS4-WS7; finalised (with the full change list and possessionCalibrationVersion 1.1.0) at candidate lock.",
  };
  const { path } = writeArtifact("candidate1-draft-manifest", payload, {
    generationCommand: "npm run c1:draft-manifest", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`Candidate 1 DRAFT · parent core ${payload.parentCoreHash.slice(0, 16)}... -> live ${payload.coreHash.slice(0, 16)}...`);
  console.log(`changed core files (${changedCoreFiles.length}):`);
  for (const f of changedCoreFiles) console.log(`  ${f}`);
  console.log(`wrote ${path}`);
}
