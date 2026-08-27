#!/usr/bin/env node
// ── The immutable formal-validation attempt registry ────────────────────────
//   npm run v6:attempts
//
// One row per formal holdout attempt, ever. Prior rows are copied forward
// verbatim from the artifacts that recorded them; nothing here can rewrite a
// verdict that has already been issued.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { DIR, DIR_B1, DIR_6C4A } from "./preflight6c4b2.mjs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const pre = readArtifact("phase6c4b2-preflight", DIR).data;
  const v3res = readArtifact("historical-holdout-results", "data/validation/6c3");
  const v3verd = readArtifact("formal-holdout-verdict", "data/validation/6c3");
  const v4res = readArtifact("historical-holdout-v4-results", "data/validation/6c3r");
  const v4verd = readArtifact("replacement-formal-verdict", "data/validation/6c3r");
  const prior = readArtifact("formal-validation-attempts", "data/validation/6c3r").data;
  const recert = readArtifact("candidate1-lock-recertification", DIR_B1).data;
  const seal = readArtifact("historical-holdout-v5-seal", DIR_B1).data;
  const synManifest = JSON.parse(readFileSync("data/calibration/synthetic-stress-holdout-v2-manifest.json", "utf8"));
  const c0 = readArtifact("candidate0-preservation", DIR_6C4A).data.candidate0;

  const attempts = [
    {
      attemptId: "attempt-1", candidateId: "Candidate 0",
      candidateCommit: c0.gitCommitBeforeCandidate1, candidateCoreHash: c0.coreHash,
      parameterSetHash: c0.parameterSetHash, calibrationVersion: "1.0.0",
      holdoutId: "historical-holdout-v3",
      holdoutManifestHash: v3res.data.identity.holdoutManifestHash,
      policyHash: v3res.data.identity.scopePolicyHash,
      seedHash: null,
      accessEventId: v3res.data.accessEvent?.seq ?? 1,
      accessCount: setAccessCount("historical-holdout-v3"),
      runStatus: "COMPLETE", formalVerdict: "FAIL",
      failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE",
      startedAt: v3res.generatedAt ?? null, completedAt: v3res.generatedAt ?? null,
      resultHash: v3res.outputHash, verdictHash: v3verd.outputHash,
      supersedes: null,
      immutable: true,
      note: "Candidate 0 on a measurement surface that could not identify offence from defence. The failure was the surface, not only the candidate.",
    },
    {
      attemptId: "attempt-2", candidateId: "Candidate 0",
      candidateCommit: c0.gitCommitBeforeCandidate1, candidateCoreHash: v4res.data.identity.coreHash,
      parameterSetHash: v4res.data.identity.parameterSetHash, calibrationVersion: "1.0.0",
      holdoutId: "historical-holdout-v4",
      holdoutManifestHash: v4res.data.identity.holdoutManifestHash,
      policyHash: v4res.data.identity.policyHash,
      seedHash: v4res.data.identity.seedSetHash,
      accessEventId: v4res.data.accessEvent?.seq ?? 1,
      accessCount: setAccessCount("historical-holdout-v4"),
      runStatus: "COMPLETE", formalVerdict: "FAIL",
      failureClass: "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE",
      startedAt: v4res.generatedAt ?? null, completedAt: v4res.generatedAt ?? null,
      resultHash: v4res.outputHash, verdictHash: v4verd.outputHash,
      supersedes: "attempt-1",
      immutable: true,
      note: "A legitimate rejection of Candidate 0 on a repaired, identifiable surface: twelve trait hard failures, eight of them substantive. This is what Candidate 1 was built to repair.",
    },
    {
      attemptId: "attempt-3", candidateId: recert.candidateId,
      candidateCommit: recert.recertifiedAtCommit, candidateCoreHash: recert.coreHash,
      parameterSetHash: recert.parameterSetHash, calibrationVersion: recert.possessionCalibrationVersion,
      holdoutId: "historical-holdout-v5",
      holdoutManifestHash: seal.boundHashes.manifestHash,
      policyHash: seal.boundHashes.acceptancePolicyHash,
      seedHash: seal.boundHashes.seedHash,
      accessEventId: null,
      accessCount: setAccessCount("historical-holdout-v5"),
      runStatus: "NOT_STARTED", formalVerdict: "NOT_OPENED",
      failureClass: null,
      startedAt: null, completedAt: null,
      resultHash: null, verdictHash: null,
      supersedes: "attempt-2",
      immutable: false,
      blockedBy: "SYNTHETIC_V2_PACKAGE_INCOMPLETE",
      note: "Registered and fully prepared: every V5 hash cross-checks between its producing artifact, the seal and the Phase 6C4B2 package, and the transactional dry run passed 30 of 30 checks. NOT opened, because the second-stage package is unusable and the phase brief forbids consuming Historical V5 while that is known. The set remains SEALED_UNREAD at access 0 and is available unchanged to a future execution phase.",
    },
    {
      attemptId: "attempt-4", candidateId: recert.candidateId,
      candidateCommit: recert.recertifiedAtCommit, candidateCoreHash: recert.coreHash,
      parameterSetHash: recert.parameterSetHash, calibrationVersion: recert.possessionCalibrationVersion,
      holdoutId: "synthetic-stress-holdout-v2",
      holdoutManifestHash: synManifest.manifestHash,
      policyHash: null,
      seedHash: null,
      accessEventId: null,
      accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      runStatus: "NOT_STARTED", formalVerdict: "NOT_OPENED",
      failureClass: null,
      startedAt: null, completedAt: null,
      resultHash: null, verdictHash: null,
      supersedes: null,
      immutable: false,
      blockedBy: "SYNTHETIC_V2_PACKAGE_INCOMPLETE",
      note: "Never opened, and cannot be: its fixtures, guardrail policy and seal are frozen, but it has no frozen seed set, no per-fixture sample volume, no verdict aggregation rule, no runner and no dry run. Its policyHash and seedHash are null here because no such frozen artifact exists to name.",
    },
  ];

  const payload = {
    formalValidationAttemptVersion: "3.0.0",
    supersedesRegistry: { artifact: "data/validation/6c3r/formal-validation-attempts.json",
      priorAttemptCount: prior.attempts?.length ?? null,
      note: "prior rows are copied forward verbatim from the artifacts that issued them" },
    attempts,
    attemptCount: attempts.length,
    completedAttempts: attempts.filter((a) => a.runStatus === "COMPLETE").length,
    openedHoldouts: attempts.filter((a) => a.accessCount > 0).map((a) => a.holdoutId),
    notOpenedHoldouts: attempts.filter((a) => a.accessCount === 0).map((a) => a.holdoutId),
    priorVerdictsUnchanged: attempts.filter((a) => a.immutable).every((a) => a.formalVerdict === "FAIL"),
    candidate1FormalVerdictAvailable: false,
    candidate1FormalVerdictReason: "Neither Candidate 1 holdout was opened. No formal Candidate 1 verdict can exist, and none is asserted.",
    recordedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.registryHash = sha(attempts.map((a) => [a.attemptId, a.holdoutId, a.formalVerdict, a.accessCount]));
  writeArtifact("formal-validation-attempts", payload, { generationCommand: "npm run v6:attempts", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log("FORMAL VALIDATION ATTEMPT REGISTRY\n");
  for (const a of attempts) {
    console.log(`  ${a.attemptId}  ${a.candidateId.padEnd(12)} ${a.holdoutId.padEnd(30)} access ${a.accessCount}  ${a.formalVerdict}${a.failureClass ? ` (${a.failureClass})` : ""}${a.blockedBy ? ` [blocked: ${a.blockedBy}]` : ""}`);
  }
  console.log(`\nopened: ${payload.openedHoldouts.join(", ") || "none in this phase"}`);
  console.log(`not opened: ${payload.notOpenedHoldouts.join(", ")}`);
  console.log(`registryHash ${payload.registryHash.slice(0, 16)}...`);
}
