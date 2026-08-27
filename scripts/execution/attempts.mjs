#!/usr/bin/env node
// ── The immutable formal-attempt registry ───────────────────────────────────
//   npm run exec:attempts
//
// Prior rows are copied forward verbatim from the artifacts that issued them.
// A gate refuses if any prior row's candidate, access count, verdict or failure
// class differs from the registry this one supersedes.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { DIR, B1, B1S, B2, git } from "./preflight6c4b2r.mjs";

const PRIOR = `${B2}/formal-validation-attempts.json`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const prior = readArtifact("formal-validation-attempts", B2).data;

  // live outcomes for the two Candidate 1 stages, if they have run
  const v5 = artifactExists("historical-v5-formal-results", DIR)
    ? readArtifact("historical-v5-formal-results", DIR).data : null;
  const syn = artifactExists("synthetic-v2-formal-results", DIR)
    ? readArtifact("synthetic-v2-formal-results", DIR).data : null;

  const carried = prior.attempts.filter((a) => a.candidateId === "Candidate 0");
  const attempts = [
    ...carried,
    // The prior registry keys the set as `holdoutId`. Its schema is followed
    // exactly rather than replaced with one invented here, so a reader can
    // diff the two registries field by field.
    ...prior.attempts.filter((a) => a.candidateId === "Candidate 1").map((a) => {
      const setName = a.holdoutId;
      const isV5 = setName === "historical-holdout-v5";
      const live = isV5 ? v5 : syn;
      const access = setAccessCount(setName);
      return { ...a,
        accessEventId: access > 0 ? 1 : null,
        accessCount: access,
        runStatus: access === 0 ? "NOT_STARTED" : live ? "COMPLETE" : "RUNNING",
        formalVerdict: live ? live.verdict : (access === 0 ? "NOT_OPENED" : "RUN_IN_PROGRESS"),
        failureClass: live?.failureClass ?? null,
        startedAt: live?.startedAt ?? a.startedAt ?? null,
        completedAt: live?.completedAt ?? a.completedAt ?? null,
        resultHash: live?.runHash ?? a.resultHash ?? null,
        verdictHash: live?.verdictHash ?? a.verdictHash ?? null,
        blockedBy: access === 0 && !isV5 ? "historical-holdout-v5 has not returned PASS" : null,
        resultArtifact: live ? `${DIR}/${isV5 ? "historical-v5" : "synthetic-v2"}-formal-results.json` : null,
        immutable: Boolean(live) };
    }),
  ];

  const c0 = attempts.filter((a) => a.candidateId === "Candidate 0");
  const priorC0 = prior.attempts.filter((a) => a.candidateId === "Candidate 0");
  gate("priorCandidate0RowsCopiedVerbatim",
    JSON.stringify(c0) === JSON.stringify(priorC0),
    `${c0.length} Candidate 0 rows byte-identical to the registry this supersedes`);
  gate("priorVerdictsUnchanged",
    c0.every((a) => a.formalVerdict === "FAIL") && c0.every((a) => a.accessCount === 1),
    `${c0.map((a) => `${a.attemptId} ${a.formalVerdict} access ${a.accessCount}`).join(", ")}`);
  gate("priorFailureClassesPreserved",
    c0.some((a) => a.failureClass === "NONIDENTIFIABLE_MEASUREMENT_SURFACE")
    && c0.some((a) => a.failureClass === "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE"),
    c0.map((a) => a.failureClass).filter(Boolean).join("; "));
  gate("v3AndV4AccessCountsStillOne",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
    `V3 ${setAccessCount("historical-holdout-v3")}, V4 ${setAccessCount("historical-holdout-v4")}`);
  gate("everyAttemptHasACandidateAndAHoldout",
    attempts.every((a) => a.candidateId && a.holdoutId),
    attempts.every((a) => a.candidateId && a.holdoutId)
      ? `${attempts.length} attempts, all attributed to a candidate and a holdout`
      : `unattributed: ${attempts.filter((a) => !a.candidateId || !a.holdoutId).map((a) => a.attemptId).join(", ")}`);
  gate("candidate1AttemptsCarryThisPhasesCandidateIdentity",
    attempts.filter((a) => a.candidateId === "Candidate 1")
      .every((a) => a.candidateCoreHash === readArtifact("phase6c4b2r-preflight", DIR).data.candidate.coreHash),
    "both Candidate 1 rows name the core hash this phase verified live");

  const opened = attempts.filter((a) => a.accessCount > 0).map((a) => a.holdoutId);
  const payload = {
    formalValidationAttemptVersion: "4.0.0",
    supersedesRegistry: { artifact: PRIOR, priorAttemptCount: prior.attemptCount,
      note: "prior Candidate 0 rows are copied forward verbatim; the two Candidate 1 rows are updated from this phase's own result artifacts and from the live access logs" },
    attempts, attemptCount: attempts.length,
    completedAttempts: attempts.filter((a) => a.formalVerdict && !["NOT_OPENED", "RUN_IN_PROGRESS"].includes(a.formalVerdict)).length,
    openedHoldouts: [...new Set(opened)],
    notOpenedHoldouts: attempts.filter((a) => a.accessCount === 0).map((a) => a.holdoutId),
    priorVerdictsUnchanged: JSON.stringify(c0) === JSON.stringify(priorC0),
    candidate1FormalVerdictAvailable: Boolean(v5 && syn),
    candidate1FormalVerdictReason: v5 && syn ? "both stages have completed formal runs"
      : v5 ? "Historical V5 has completed; Synthetic V2 has not"
      : "neither Candidate 1 stage has completed a formal run",
    recordedAtCommit: git("rev-parse", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.registryHash = createHash("sha256").update(JSON.stringify(
    attempts.map((a) => [a.attemptId, a.candidateId, a.holdoutId, a.accessCount, a.formalVerdict]))).digest("hex");
  writeArtifact("formal-validation-attempts", payload, {
    generationCommand: "npm run exec:attempts", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("\nFORMAL VALIDATION ATTEMPTS\n");
  for (const a of attempts) {
    console.log(`  ${a.attemptId}  ${a.candidateId.padEnd(12)} ${a.holdoutId.padEnd(30)} ${String(a.runStatus).padEnd(12)} access ${a.accessCount}  ${a.formalVerdict}${a.failureClass ? `  [${a.failureClass}]` : ""}`);
  }
  console.log(`\nATTEMPT REGISTRY: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.registryHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
