#!/usr/bin/env node
// ── Candidate 2 formal status ───────────────────────────────────────────────
//   npm run exec:c3-status
//
// Reads the compound verdict and the two stage verdicts and states what
// Candidate 2 is. HOLDOUT_VALIDATED is set only by
// CANDIDATE2_FORMAL_VALIDATION_PASSED; every other state leaves the calibration
// status exactly where the lock left it.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

const DIR = "data/validation/6c4c3";
const C1D = "data/validation/6c4c1";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

/** The high-level state machine. Pure, so a test can drive every transition. */
export const formalState = ({ v6, syn }) => {
  if (!v6) return "CANDIDATE2_FORMAL_VALIDATION_NOT_STARTED";
  if (v6.outcome === "INVALID_RUN") return "CANDIDATE2_HISTORICAL_V6_INVALID";
  if (v6.outcome === "FAIL") return "CANDIDATE2_HISTORICAL_V6_FAILED";
  if (!syn) return "CANDIDATE2_STAGE1_PASSED_STAGE2_PENDING";
  if (syn.outcome === "INVALID_RUN") return "CANDIDATE2_SYNTHETIC_INVALID";
  if (syn.outcome === "FAIL") return "CANDIDATE2_SYNTHETIC_FAILED";
  return "CANDIDATE2_FORMAL_VALIDATION_PASSED";
};

export const STATES = Object.freeze({
  CANDIDATE2_FORMAL_VALIDATION_NOT_STARTED: "no formal stage has produced a result",
  CANDIDATE2_HISTORICAL_V6_FAILED: "Historical Holdout V6 returned FAIL. The synthetic set is correctly never opened.",
  CANDIDATE2_HISTORICAL_V6_INVALID: "Historical Holdout V6 could not produce a formal result. The synthetic set is correctly never opened.",
  CANDIDATE2_STAGE1_PASSED_STAGE2_PENDING: "Historical Holdout V6 passed; the synthetic set has not yet been opened",
  CANDIDATE2_SYNTHETIC_FAILED: "Historical Holdout V6 passed and the synthetic set returned FAIL",
  CANDIDATE2_SYNTHETIC_INVALID: "Historical Holdout V6 passed and the synthetic set could not produce a formal result",
  CANDIDATE2_FORMAL_VALIDATION_PASSED: "both formal stages returned PASS on the same locked candidate",
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const lock = readArtifact("candidate2-lock", C1D).data;
  const v6 = artifactExists("historical-v6-formal-verdict", DIR) ? readArtifact("historical-v6-formal-verdict", DIR).data : null;
  const syn = artifactExists("synthetic-candidate2-formal-verdict", DIR) ? readArtifact("synthetic-candidate2-formal-verdict", DIR).data : null;
  const state = formalState({ v6, syn });
  const passed = state === "CANDIDATE2_FORMAL_VALIDATION_PASSED";

  const payload = {
    candidate2FormalStatusVersion: "1.0.0",
    candidateId: lock.candidateId, parentCandidateId: lock.parentCandidateId,
    candidateSelectionStatus: lock.candidateSelectionStatus,
    candidateLockStatus: lock.candidateLockStatus,
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    calibrationVersionNote: "unchanged. A status change does not move a calibration version.",
    coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    formalState: state, formalStateMeaning: STATES[state], stateVocabulary: STATES,
    // ── the only transition that may set HOLDOUT_VALIDATED ──
    calibrationStatus: passed ? "HOLDOUT_VALIDATED" : lock.calibrationStatus,
    formalValidationStatus: passed ? "HOLDOUT_VALIDATED"
      : state === "CANDIDATE2_HISTORICAL_V6_FAILED" ? "HISTORICAL_V6_FAILED"
        : state === "CANDIDATE2_HISTORICAL_V6_INVALID" ? "HISTORICAL_V6_INVALID_RUN"
          : state === "CANDIDATE2_SYNTHETIC_FAILED" ? "SYNTHETIC_FAILED"
            : state === "CANDIDATE2_SYNTHETIC_INVALID" ? "SYNTHETIC_INVALID_RUN"
              : state === "CANDIDATE2_STAGE1_PASSED_STAGE2_PENDING" ? "STAGE1_PASSED_STAGE2_PENDING"
                : "NOT_RUN",
    holdoutValidatedClaimed: passed,
    holdoutValidatedRule: "calibrationStatus and formalValidationStatus become HOLDOUT_VALIDATED only under CANDIDATE2_FORMAL_VALIDATION_PASSED. Under every other state the calibration status is exactly what the lock recorded.",
    stages: [
      { stage: 1, set: "historical-holdout-v6", accessCount: setAccessCount("historical-holdout-v6"),
        formalVerdict: v6?.formalVerdict ?? "NOT_OPENED", outcome: v6?.outcome ?? null,
        failureClass: v6?.failureClass ?? null, verdictHash: v6?.verdictHash ?? null },
      { stage: 2, set: "synthetic-stress-holdout-v2", accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        formalVerdict: syn?.formalVerdict ?? "NOT_OPENED", outcome: syn?.outcome ?? null,
        failureClass: syn?.failureClass ?? null, verdictHash: syn?.verdictHash ?? null,
        notOpenedBecause: syn ? null : `Historical Holdout V6 returned ${v6?.formalVerdict ?? "no result"}. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence.` },
    ],
    previewStatus: passed ? "PACKAGE_READY_NOT_DEPLOYED" : "NOT_PREPARED",
    previewNote: passed ? "prepared, not deployed" : "a preview package may not be prepared unless both formal stages pass",
    productionStatus: "UNCHANGED",
    production: { mainCommit: git("rev-parse", "main"), engineVersion: versionOf("engineVersion"),
      flagsActivated: 0, deploymentsExecuted: 0 },
    postHoldoutTuning: 0,
    engineChanges: 0, dataChanges: 0, policyChanges: 0, targetChanges: 0, marginChanges: 0,
    seedChanges: 0, referenceChanges: 0, traitChanges: 0, runnerSemanticChanges: 0,
    nextRequirement: passed ? "Phase 6C5 protected private preview"
      : state === "CANDIDATE2_HISTORICAL_V6_FAILED"
        ? "Candidate 2 formal validation has failed. A Candidate 3 would require its own repair, its own lock and a NEW unseen historical holdout — V6 is consumed and may be used only as a failed-holdout diagnostic set. Synthetic Stress Holdout V2 remains sealed and unread and is still available to a future candidate."
        : "see the compound verdict",
    sealStatuses: allSealStatuses(),
    recordedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.statusHash = createHash("sha256").update(JSON.stringify({ state, calibrationStatus: payload.calibrationStatus, stages: payload.stages })).digest("hex");
  writeArtifact("candidate2-formal-status", payload, {
    generationCommand: "npm run exec:c3-status", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("CANDIDATE 2 FORMAL STATUS\n");
  for (const s of payload.stages) console.log(`  stage ${s.stage}  ${s.set.padEnd(31)} access ${s.accessCount}  ${s.formalVerdict}${s.failureClass ? `  [${s.failureClass}]` : ""}`);
  console.log(`\n  formalState              ${payload.formalState}`);
  console.log(`  calibrationStatus        ${payload.calibrationStatus}`);
  console.log(`  formalValidationStatus   ${payload.formalValidationStatus}`);
  console.log(`  HOLDOUT_VALIDATED        ${payload.holdoutValidatedClaimed}`);
  console.log(`  previewStatus            ${payload.previewStatus}`);
  console.log(`  productionStatus         ${payload.productionStatus}`);
  process.exit(0);
}
