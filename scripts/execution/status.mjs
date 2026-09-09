#!/usr/bin/env node
// ── WS8 PART 37: Candidate 1's formal status after the compound verdict ─────
//   npm run exec:status
//
// On failure the candidate stays SELECTED and LOCKED. A failed holdout does not
// unlock a candidate or bump its calibration version; it records that the
// candidate was formally measured and did not clear a frozen gate.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, B1, B1S, git } from "./preflight6c4b2r.mjs";

const COMPOUND_PATH = `${B1S}/candidate1-compound-formal-verdict.json`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const lock = readArtifact("candidate1-lock-recertification", B1).data;
  const pf = readArtifact("phase6c4b2r-preflight", DIR).data;
  const compoundArt = JSON.parse(readFileSync(COMPOUND_PATH, "utf8"));
  const compound = compoundArt.data;
  const v5v = readArtifact("historical-v5-formal-verdict", DIR).data;
  const v5r = readArtifact("historical-v5-formal-results", DIR).data;
  const synOpened = setAccessCount("synthetic-stress-holdout-v2") > 0;
  const validated = compound.compoundVerdict === "CANDIDATE1_HOLDOUT_VALIDATED";

  // The formal status the verdict implies. The calibration status only becomes
  // HOLDOUT_VALIDATED when both stages pass; a failure leaves the development
  // status in place and records the formal outcome separately, so the two are
  // never conflated.
  const formalValidationStatus = {
    CANDIDATE1_HOLDOUT_VALIDATED: "HOLDOUT_VALIDATED",
    CANDIDATE1_HISTORICAL_V5_FAILED: "HISTORICAL_HOLDOUT_V5_FAILED",
    CANDIDATE1_HISTORICAL_V5_INVALID: "HISTORICAL_HOLDOUT_V5_INVALID_RUN",
    CANDIDATE1_SYNTHETIC_V2_FAILED: "SYNTHETIC_HOLDOUT_V2_FAILED",
    CANDIDATE1_SYNTHETIC_V2_INVALID: "SYNTHETIC_HOLDOUT_V2_INVALID_RUN",
    CANDIDATE1_IDENTITY_SPLIT: "IDENTITY_SPLIT",
    CANDIDATE1_NOT_YET_DETERMINED: "NOT_RUN",
  }[compound.compoundVerdict];

  const payload = {
    candidate1FormalStatusVersion: "1.0.0",
    candidateId: lock.candidateId,
    parentCandidateId: lock.parentCandidateId,
    candidateCommit: lock.recertifiedAtCommit,
    lockRevision: lock.lockRevision,
    coreHash: core.aggregateCoreHash,
    parameterSetHash: def.parameterSetHash,

    // unchanged by a formal failure
    candidateSelectionStatus: lock.candidateSelectionStatus,
    candidateLockStatus: lock.candidateLockStatus,
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    calibrationStatus: validated ? "HOLDOUT_VALIDATED" : lock.calibrationStatus,

    // set by this phase
    formalValidationStatus,
    compoundVerdict: compound.compoundVerdict,
    compoundVerdictMeaning: compound.meaning,
    compoundVerdictHash: compound.verdictHash,
    compoundVerdictArtifact: COMPOUND_PATH,
    compoundVerdictArtifactOutputHash: compoundArt.outputHash ?? null,

    previewStatus: validated ? "PACKAGE_READY_NOT_DEPLOYED" : "NOT_ELIGIBLE",
    productionStatus: "UNCHANGED",

    stages: [
      { stage: 1, set: "historical-holdout-v5", opened: true, accessCount: setAccessCount("historical-holdout-v5"),
        verdict: v5v.verdict, outcome: v5v.outcome, failureClass: v5r.failureClass,
        gatesFailed: v5v.gatesFailed, hardFailureCount: v5r.hardFailureCount,
        distinctHardFailMeasurements: v5r.distinctHardFailMeasurements },
      { stage: 2, set: "synthetic-stress-holdout-v2", opened: synOpened,
        accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        verdict: synOpened ? null : "NOT_OPENED",
        whyNotOpened: synOpened ? null : "Historical Holdout V5 returned FAIL. The frozen stage order forbids opening stage two after a stage-one failure: a synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence." },
    ],

    calibrationVersionNotBumped: "a status transition alone does not bump possessionCalibrationVersion. It remains 1.1.0, the version the candidate was locked and measured at.",
    candidateNotUnlocked: "a failed holdout does not unlock a candidate. Candidate 1 remains SELECTED and LOCKED, with its core and parameters exactly as they were before the seal opened.",
    noTuning: { coreDrift: 0, parameterDrift: 0, policyDrift: 0, seedDrift: 0, targetDrift: 0,
      postHoldoutTuning: 0,
      evidence: `core and parameter-set hashes identical to the preflight taken before the seal opened, and all ${activeParameters().length} parameters still at their registry defaults` },

    statusesNotClaimed: {
      notClaimed: validated ? ["PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]
        : ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
      why: validated
        ? "both formal stages passed, which earns HOLDOUT_VALIDATED and nothing beyond it. Preview and production statuses belong to later phases, and production activation requires an explicit CEO GO LIVE."
        : "Historical Holdout V5 returned FAIL, so Candidate 1 is not holdout-validated. No preview package is prepared and no deployment is authorized.",
    },
    nextStep: validated
      ? "Phase 6C5 — protected private preview"
      : "a repair phase on the failing traits, producing Candidate 2, followed by NEW unseen holdouts. Historical V5 and, when it is eventually opened, Synthetic V2 are one-shot resources: neither can be reused to validate a repaired candidate.",
    recordedAtCommit: git("rev-parse", "HEAD"),
  };
  payload.statusHash = createHash("sha256").update(JSON.stringify({
    candidateId: payload.candidateId, coreHash: payload.coreHash,
    formalValidationStatus, compoundVerdict: compound.compoundVerdict })).digest("hex");
  writeArtifact("candidate1-formal-status", payload, {
    generationCommand: "npm run exec:status", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("CANDIDATE 1 FORMAL STATUS\n");
  console.log(`  selection            ${payload.candidateSelectionStatus}`);
  console.log(`  lock                 ${payload.candidateLockStatus}`);
  console.log(`  calibration version  ${payload.possessionCalibrationVersion}`);
  console.log(`  calibration status   ${payload.calibrationStatus}`);
  console.log(`  formal validation    ${payload.formalValidationStatus}`);
  console.log(`  compound verdict     ${payload.compoundVerdict}`);
  console.log(`  preview              ${payload.previewStatus}`);
  console.log(`  production           ${payload.productionStatus}\n`);

  gate("candidateStillSelectedAndLocked",
    payload.candidateSelectionStatus === "SELECTED" && payload.candidateLockStatus === "LOCKED",
    "a failed holdout does not unlock the candidate");
  gate("calibrationVersionNotBumped",
    payload.possessionCalibrationVersion === lock.possessionCalibrationVersion,
    `still ${payload.possessionCalibrationVersion}`);
  gate("holdoutValidatedNotClaimed",
    validated || (payload.formalValidationStatus !== "HOLDOUT_VALIDATED"
      && payload.calibrationStatus !== "HOLDOUT_VALIDATED"),
    `formal status ${payload.formalValidationStatus}, calibration status ${payload.calibrationStatus} — HOLDOUT_VALIDATED is not asserted`);
  gate("noPreviewPackagePrepared",
    validated || !artifactExists("candidate1-protected-preview-package", DIR),
    "the preview package is not created unless both stages pass");
  gate("syntheticV2StillSealed", synOpened === validated ? true : !synOpened,
    `synthetic-stress-holdout-v2 access ${setAccessCount("synthetic-stress-holdout-v2")}, access log ${existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]) ? "EXISTS" : "absent"}`);
  gate("zeroDrift",
    core.aggregateCoreHash === pf.candidate.coreHash && def.parameterSetHash === pf.candidate.parameterSetHash
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "core, parameters and calibration identical to the pre-access preflight");
  gate("productionUntouched",
    git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
    `main ${git("rev-parse", "main")?.slice(0, 12)}, production status ${payload.productionStatus}`);

  console.log(`\nSTATUS: ${fail.length === 0 ? "CONSISTENT" : `INCONSISTENT (${fail.join(", ")})`} · statusHash ${payload.statusHash.slice(0, 16)}...`);
  process.exit(fail.length === 0 ? 0 : 2);
}
