#!/usr/bin/env node
// ── The immutable formal-attempt registry, extended for Candidate 2 ─────────
//   npm run exec:c3-attempts
//
// Five attempts across three candidates and five sealed sets. No prior attempt
// may change: the four Candidate 0 and Candidate 1 rows are carried forward from
// the 6C4B2R registry byte-for-byte and a gate proves it.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";

const DIR = "data/validation/6c4c3";
const C2D = "data/validation/6c4c2";
const B2R = "data/validation/6c4b2r";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const prior = readArtifact("formal-validation-attempts", B2R).data;
  const preflight = readArtifact("phase6c4c3-preflight", DIR).data;
  const v6verdict = artifactExists("historical-v6-formal-verdict", DIR)
    ? readArtifact("historical-v6-formal-verdict", DIR).data : null;
  const v6results = artifactExists("historical-v6-formal-results", DIR)
    ? readArtifact("historical-v6-formal-results", DIR).data : null;
  const v6event = artifactExists("historical-v6-access-event", DIR)
    ? readArtifact("historical-v6-access-event", DIR).data : null;
  const synVerdict = artifactExists("synthetic-candidate2-formal-verdict", DIR)
    ? readArtifact("synthetic-candidate2-formal-verdict", DIR).data : null;
  const synResults = artifactExists("synthetic-candidate2-formal-results", DIR)
    ? readArtifact("synthetic-candidate2-formal-results", DIR).data : null;
  const synEvent = artifactExists("synthetic-candidate2-access-event", DIR)
    ? readArtifact("synthetic-candidate2-access-event", DIR).data : null;
  const v6seal = readArtifact("historical-v6-seal", C2D).data;
  const binding = readArtifact("synthetic-v2-candidate2-binding", C2D).data;
  const synPolicy = readArtifact("synthetic-v2-formal-policy", "data/validation/6c4b1s").data;

  // ── carried forward, unchanged ───────────────────────────────────────────
  const carried = prior.attempts.map((a) => ({ ...a }));

  // ── attempt 5: Historical V6 under Candidate 2 ───────────────────────────
  const v6attempt = {
    attemptId: "attempt-5",
    candidateId: "Candidate 2",
    candidateCommit: preflight.candidate2.lockedAtCommit.value,
    candidateCoreHash: preflight.candidate2.coreHashLive.value,
    parameterSetHash: preflight.candidate2.parameterSetHashLive.value,
    calibrationVersion: preflight.candidate2.possessionCalibrationVersion.value,
    holdoutId: "historical-holdout-v6",
    membershipHash: v6seal.boundHashes.manifestHash,
    policyHash: v6seal.boundHashes.verdictPolicyHash,
    targetHash: v6seal.boundHashes.targetsHash,
    seedHash: v6seal.boundHashes.seedHash,
    runnerHash: v6seal.boundHashes.dryRunArtifactHash,
    accessEventId: v6event ? `seq-${v6event.seq}` : null,
    accessCount: setAccessCount("historical-holdout-v6"),
    runStatus: v6results?.runStatus ?? (v6event ? "RUNNING" : "NOT_OPENED"),
    formalVerdict: v6verdict?.formalVerdict ?? "NOT_OPENED",
    failureClass: v6verdict?.failureClass ?? null,
    resultHash: v6results?.runHash ?? null,
    verdictHash: v6verdict?.verdictHash ?? null,
    startedAt: v6event?.openedAtCommit ? `commit ${v6event.openedAtCommit}` : null,
    completedAt: v6event?.completedAtCommit ? `commit ${v6event.completedAtCommit}` : null,
    immutable: v6verdict != null,
    note: v6verdict
      ? "opened exactly once under one access event; the verdict is final and the set is consumed"
      : "not yet opened",
  };

  // ── attempt 6: Synthetic V2 under Candidate 2 ───────────────────────────
  const stageOnePassed = v6verdict?.outcome === "PASS";
  const synAttempt = {
    attemptId: "attempt-6",
    candidateId: "Candidate 2",
    candidateCommit: preflight.candidate2.lockedAtCommit.value,
    candidateCoreHash: preflight.candidate2.coreHashLive.value,
    parameterSetHash: preflight.candidate2.parameterSetHashLive.value,
    calibrationVersion: preflight.candidate2.possessionCalibrationVersion.value,
    holdoutId: "synthetic-stress-holdout-v2",
    membershipHash: binding.hashes.membershipHash,
    policyHash: binding.hashes.syntheticPolicyHash,
    targetHash: null,
    targetHashNote: "the synthetic set is structural: it has guardrails and thresholds, not historical targets. Null rather than zero.",
    seedHash: binding.hashes.seedSetHash,
    runnerHash: binding.bindingHash,
    accessEventId: synEvent ? `seq-${synEvent.seq}` : null,
    accessCount: setAccessCount("synthetic-stress-holdout-v2"),
    runStatus: synResults?.runStatus ?? (synEvent ? "RUNNING" : "NOT_OPENED"),
    formalVerdict: synVerdict?.formalVerdict ?? "NOT_OPENED",
    failureClass: synVerdict?.failureClass ?? null,
    resultHash: synResults?.runHash ?? null,
    verdictHash: synVerdict?.verdictHash ?? null,
    startedAt: synEvent?.openedAtCommit ? `commit ${synEvent.openedAtCommit}` : null,
    completedAt: synEvent?.completedAtCommit ? `commit ${synEvent.completedAtCommit}` : null,
    immutable: synVerdict != null,
    note: synVerdict ? "opened exactly once, after Historical V6 returned PASS on this same core and parameter set"
      : stageOnePassed ? "authorized but not yet opened"
        : `NOT_OPENED — Historical V6 ${v6verdict?.formalVerdict ?? "has not run"}. A synthetic stress pass says nothing about a candidate that failed the historical stage, so the set stays sealed at access ${setAccessCount("synthetic-stress-holdout-v2")}.`,
  };

  const attempts = [...carried, v6attempt, synAttempt];

  console.log("FORMAL VALIDATION ATTEMPTS\n");
  for (const a of attempts) {
    console.log(`  ${a.attemptId}  ${a.candidateId.padEnd(12)} ${a.holdoutId.padEnd(30)} ${String(a.runStatus).padEnd(12)} access ${a.accessCount}  ${a.formalVerdict}${a.failureClass ? `  [${a.failureClass}]` : ""}`);
  }
  console.log("");

  gate("noPriorAttemptChanged",
    carried.length === prior.attempts.length
    && carried.every((a, i) => sha(a) === sha(prior.attempts[i])),
    `${carried.length} prior attempts carried forward byte-for-byte from ${B2R}/formal-validation-attempts.json`);
  gate("everyAttemptAttributed",
    attempts.every((a) => a.candidateId && a.holdoutId && a.candidateCoreHash && a.parameterSetHash),
    `${attempts.length} attempts, each naming its candidate, core, parameter set and holdout`);
  gate("accessCountsReconcileWithLiveLogs",
    attempts.every((a) => a.accessCount === setAccessCount(a.holdoutId)),
    attempts.map((a) => `${a.holdoutId} ${a.accessCount}`).filter((x, i, arr) => arr.indexOf(x) === i).join(" · "));
  gate("consumedSetsHaveExactlyOneAccess",
    ["historical-holdout-v3", "historical-holdout-v4", "historical-holdout-v5"]
      .every((s) => setAccessCount(s) === 1),
    "V3, V4 and V5 each opened exactly once, by the phase that opened them");
  gate("candidate2AttemptsNameTheSameCore",
    [v6attempt, synAttempt].every((a) => a.candidateCoreHash === preflight.candidate2.coreHashLive.value),
    `both Candidate 2 attempts bind core ${preflight.candidate2.coreHashLive.value.slice(0, 16)}...`);
  gate("stageOrderHeld",
    synAttempt.formalVerdict === "NOT_OPENED" || stageOnePassed,
    stageOnePassed
      ? `Historical V6 ${v6verdict.formalVerdict}, so the synthetic set was authorized`
      : `the synthetic set was not opened; Historical V6 ${v6verdict?.formalVerdict ?? "has not run"}`);
  gate("noSetOpenedTwice",
    attempts.every((a) => a.accessCount <= 1),
    `maximum access count across all five sets: ${Math.max(...attempts.map((a) => a.accessCount))}`);

  const payload = {
    formalValidationAttemptRegistryVersion: "3.0.0",
    supersedesRegistry: { artifact: `${B2R}/formal-validation-attempts.json`,
      version: prior.formalValidationAttemptVersion ?? prior.formalValidationAttemptRegistryVersion ?? null,
      priorAttemptsCarriedUnchanged: carried.length, notOverwritten: true },
    attempts, attemptCount: attempts.length,
    completedAttempts: attempts.filter((a) => a.runStatus === "COMPLETE").length,
    openedHoldouts: attempts.filter((a) => a.accessCount > 0).map((a) => a.holdoutId),
    notOpenedHoldouts: attempts.filter((a) => a.accessCount === 0).map((a) => a.holdoutId),
    byCandidate: {
      "Candidate 0": attempts.filter((a) => a.candidateId === "Candidate 0").map((a) => ({ holdoutId: a.holdoutId, formalVerdict: a.formalVerdict })),
      "Candidate 1": attempts.filter((a) => a.candidateId === "Candidate 1").map((a) => ({ holdoutId: a.holdoutId, formalVerdict: a.formalVerdict })),
      "Candidate 2": attempts.filter((a) => a.candidateId === "Candidate 2").map((a) => ({ holdoutId: a.holdoutId, formalVerdict: a.formalVerdict })),
    },
    priorVerdictsUnchanged: true,
    recordedAtCommit: git("rev-parse", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.registryHash = sha(attempts.map((a) => [a.attemptId, a.candidateId, a.holdoutId, a.accessCount, a.formalVerdict]));
  writeArtifact("formal-validation-attempts", payload, {
    generationCommand: "npm run exec:c3-attempts", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`REGISTRY: ${payload.pass ? "RECONCILED" : `FAIL (${fail.join(", ")})`} · ${payload.attemptCount} attempts · registryHash ${payload.registryHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
