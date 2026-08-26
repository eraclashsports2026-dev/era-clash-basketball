#!/usr/bin/env node
// ── Candidate status reconciliation ─────────────────────────────────────────
//   npm run calibration:c6:status
//
// Phase 6C2C5 published `status: DEVELOPMENT_LOCKED_BASELINE` in an artifact
// whose own `versions.possessionCalibrationVersion` was null and whose
// `allEngineeringGatesPass` was false. Those three fields cannot all be right.
//
// The root cause was a status MODEL, not a typo: one field was carrying two
// different claims. "Candidate 0 is the candidate the evidence selects" and
// "Candidate 0 is locked and ready to be validated against a holdout" are
// separate assertions with separate preconditions, and a phase can legitimately
// establish the first while failing the second. With one field they could not be
// stated separately, so the stronger word won.
//
// This command derives both statuses from artifacts and refuses to emit a LOCKED
// status without the evidence a lock requires.
import { readArtifact, writeArtifact, verifyArtifact, ARTIFACT_DIR_C6, reconcile } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../../src/versions.js";
import { existsSync, readFileSync } from "node:fs";

export const SELECTION_STATES = Object.freeze({
  SELECTED: "SELECTED",
  SELECTED_PENDING_GATE: "SELECTED_PENDING_GATE",
  NOT_SELECTED: "NOT_SELECTED",
});

export const LOCK_STATES = Object.freeze({
  LOCKED: "LOCKED",
  UNLOCKED: "UNLOCKED",
});

/**
 * The invariants that make a status set internally coherent.
 *
 * Each returns a problem string, or null. Phase 6C2C5's published state violates
 * `lockedRequiresCalibrationVersion` and `lockedRequiresAllGates`, which is
 * exactly what these exist to catch.
 */
export const STATUS_INVARIANTS = Object.freeze([
  {
    name: "lockedRequiresCalibrationVersion",
    check: (s) => (s.candidateLockStatus === "LOCKED" && s.possessionCalibrationVersion == null)
      ? "candidateLockStatus is LOCKED but possessionCalibrationVersion is null" : null,
  },
  {
    name: "lockedRequiresLockManifest",
    check: (s) => (s.candidateLockStatus === "LOCKED" && !s.lockManifestPresent)
      ? "candidateLockStatus is LOCKED but no lock manifest exists" : null,
  },
  {
    name: "lockedRequiresZeroBlockers",
    check: (s) => (s.candidateLockStatus === "LOCKED" && s.candidateLockBlockers.length > 0)
      ? `candidateLockStatus is LOCKED with ${s.candidateLockBlockers.length} unresolved blocker(s): ${s.candidateLockBlockers.join(", ")}` : null,
  },
  {
    name: "unlockedForbidsDevelopmentLockedStatus",
    check: (s) => (s.candidateLockStatus === "UNLOCKED" && /^DEVELOPMENT_LOCKED/.test(s.calibrationStatus ?? ""))
      ? `candidateLockStatus is UNLOCKED but calibrationStatus is ${s.calibrationStatus}` : null,
  },
  {
    name: "baselineLockRequiresZeroParameterChanges",
    check: (s) => (s.calibrationStatus === "DEVELOPMENT_LOCKED_BASELINE" && s.parameterChanges !== 0)
      ? `DEVELOPMENT_LOCKED_BASELINE with ${s.parameterChanges} parameter changes` : null,
  },
  {
    name: "scopedLockRequiresParameterChanges",
    check: (s) => (s.calibrationStatus === "DEVELOPMENT_LOCKED_SCOPED" && s.parameterChanges === 0)
      ? "DEVELOPMENT_LOCKED_SCOPED with 0 parameter changes" : null,
  },
  {
    name: "calibrationVersionRequiresLock",
    check: (s) => (s.possessionCalibrationVersion != null && s.candidateLockStatus !== "LOCKED")
      ? `possessionCalibrationVersion is ${s.possessionCalibrationVersion} but candidateLockStatus is ${s.candidateLockStatus}` : null,
  },
  {
    name: "selectionRequiresACandidate",
    check: (s) => (s.candidateSelectionStatus !== "NOT_SELECTED" && !s.candidateId)
      ? "a selection status is claimed with no candidateId" : null,
  },
]);

export const evaluateStatus = (s) => {
  const problems = STATUS_INVARIANTS.map((i) => ({ invariant: i.name, problem: i.check(s) }))
    .filter((x) => x.problem !== null);
  return { coherent: problems.length === 0, violations: problems };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const history = readArtifact("candidate-history").data;
  const comparison = readArtifact("candidate-comparison").data;
  const c5Lock = readArtifact("candidate-lock").data;
  const def = defaultRuntimeParameterSet();

  // ── what Phase 6C2C5 actually published ───────────────────────────────────
  const published = {
    source: "data/calibration/c5/candidate-lock.json",
    candidateId: c5Lock.lockedCandidateId,
    status: c5Lock.status,
    possessionCalibrationVersion: c5Lock.versions.possessionCalibrationVersion,
    allEngineeringGatesPass: c5Lock.allEngineeringGatesPass,
    candidateLockGatesPass: c5Lock.candidateLockGatesPass,
    carriedForwardFailures: c5Lock.carriedForwardFailures.map((c) => c.gate),
    hadSelectionStatusField: c5Lock.candidateSelectionStatus !== undefined,
    hadLockStatusField: c5Lock.candidateLockStatus !== undefined,
  };
  const publishedAsStatusSet = {
    candidateId: published.candidateId,
    candidateSelectionStatus: "SELECTED",
    candidateLockStatus: "LOCKED",             // implied by the word LOCKED in its status
    calibrationStatus: published.status,
    possessionCalibrationVersion: published.possessionCalibrationVersion,
    parameterChanges: c5Lock.changedParameterCount,
    candidateLockBlockers: published.carriedForwardFailures,
    lockManifestPresent: true,
  };
  const publishedVerdict = evaluateStatus(publishedAsStatusSet);

  // ── the truthful current state ────────────────────────────────────────────
  const registryVersion = versionOf("possessionCalibrationVersion");
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  const blockers = [];
  if (published.carriedForwardFailures.includes("probabilityValidationAllGatesPass")) {
    blockers.push("PROBABILITY_SIDE_BIAS_GATE_UNRESOLVED");
  }

  const current = {
    candidateId: "Candidate 0",
    candidateSelectionStatus: blockers.length ? SELECTION_STATES.SELECTED_PENDING_GATE : SELECTION_STATES.SELECTED,
    candidateLockStatus: LOCK_STATES.UNLOCKED,
    candidateSelectionReason: `${history.changedCandidates} on-grid candidates over ${history.adjudicability.visibleToObjective + history.adjudicability.blindToObjective} eligible parameters. ${history.familyDiagnostics.candidatesClearingPracticalFloor} cleared the practical floor; ${history.familyDiagnostics.candidatesFamilyWiseSignificant} survived family-wise correction (best Holm-adjusted p ${history.familyDiagnostics.bestHolmAdjustedP}). The strongest contender's advantage reversed sign on disjoint seeds (retention ${comparison.gainRetainedOnFreshSeeds}). The wired defaults remain the strongest evidence-supported model.`,
    candidateLockBlockers: blockers,
    parameterChanges: history.acceptedCount,
    parameterValuesEqualRegistryDefaults: drift.length === 0,
    parameterDrift: drift.map((p) => p.id),
    parameterSetHash: def.parameterSetHash,
    parameterSetStatus: def.status,
    possessionCalibrationVersion: registryVersion,
    calibrationStatus: registryVersion == null ? "NOT_LOCKED" : "LOCKED",
    lockManifestPresent: existsSync(`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`),
  };
  const currentVerdict = evaluateStatus(current);

  // Artifact provenance, checked on the CORRECT field. The Phase 6C2C5 lock
  // gate tested `verifyArtifact(n).ok !== false`, and verifyArtifact returns
  // `valid`, never `ok` — so `undefined !== false` made that gate unfailable.
  const verified = ["targeted-fixture-coverage", "no-effect-triage", "confounding-resolution",
    "calibration-scope", "candidate-history", "candidate-comparison", "validation-summary", "candidate-lock"]
    .map((n) => ({ artifact: n, ...verifyArtifact(n) }));
  const invalid = verified.filter((v) => !v.valid);

  const rec = reconcile({
    label: "status-invariants",
    counts: { satisfied: STATUS_INVARIANTS.length - currentVerdict.violations.length, violated: currentVerdict.violations.length },
    expectedTotal: STATUS_INVARIANTS.length,
  });

  const { path } = writeArtifact("candidate-status-reconciliation", {
    candidateSelectionArtifactVersion: versionOf("candidateSelectionArtifactVersion"),
    candidateLockStatusVersion: versionOf("candidateLockStatusVersion"),

    contradictionFound: {
      detected: !publishedVerdict.coherent,
      where: "A SINGLE artifact, not prose against the repository. data/calibration/c5/candidate-lock.json asserted a LOCKED status while its own versions.possessionCalibrationVersion was null and allEngineeringGatesPass was false.",
      publishedState: published,
      violations: publishedVerdict.violations,
      rootCause: "One field carried two claims. Phase 6C2C5's artifact had no candidateSelectionStatus and no candidateLockStatus field; a single `status` field had to express both 'this is the selected candidate' and 'this candidate is locked'. Given a failing gate, the honest value for selection was SELECTED and for lock was UNLOCKED, and a single field cannot hold both, so the stronger word won.",
      notConcealed: "The 6C2C5 artifact is preserved unedited. It did record the failing gate, the carried-forward partition and a disclosure; what it got wrong was calling the resulting state LOCKED.",
    },

    truthfulCurrentState: current,
    statusInvariants: STATUS_INVARIANTS.map((i) => i.name),
    currentStateCoherent: currentVerdict.coherent,
    currentStateViolations: currentVerdict.violations,
    reconciliation: rec,

    artifactVerification: { checked: verified.length, invalid: invalid.length, results: verified },

    supersedes: {
      artifact: "data/calibration/c5/candidate-lock.json",
      field: "status",
      was: published.status,
      nowSplitInto: { candidateSelectionStatus: current.candidateSelectionStatus, candidateLockStatus: current.candidateLockStatus, calibrationStatus: current.calibrationStatus },
      preserved: true,
    },
  }, {
    generationCommand: "npm run calibration:c6:status",
    sourceArtifacts: ["data/calibration/c5/candidate-lock.json", "data/calibration/c5/candidate-history.json", "data/calibration/c5/candidate-comparison.json"],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log("CANDIDATE STATUS RECONCILIATION\n");
  console.log("  WHAT PHASE 6C2C5 PUBLISHED (preserved, not edited):");
  console.log(`    status                          ${published.status}`);
  console.log(`    possessionCalibrationVersion    ${published.possessionCalibrationVersion}`);
  console.log(`    allEngineeringGatesPass         ${published.allEngineeringGatesPass}`);
  console.log(`    had candidateSelectionStatus?   ${published.hadSelectionStatusField}`);
  console.log(`    had candidateLockStatus?        ${published.hadLockStatusField}`);
  console.log(`    coherent                        ${publishedVerdict.coherent}`);
  for (const v of publishedVerdict.violations) console.log(`      VIOLATION  ${v.invariant}: ${v.problem}`);
  console.log("\n  TRUTHFUL CURRENT STATE:");
  console.log(`    candidateId                     ${current.candidateId}`);
  console.log(`    candidateSelectionStatus        ${current.candidateSelectionStatus}`);
  console.log(`    candidateLockStatus             ${current.candidateLockStatus}`);
  console.log(`    calibrationStatus               ${current.calibrationStatus}`);
  console.log(`    possessionCalibrationVersion    ${current.possessionCalibrationVersion}`);
  console.log(`    parameterChanges                ${current.parameterChanges}`);
  console.log(`    values == registry defaults     ${current.parameterValuesEqualRegistryDefaults}`);
  console.log(`    candidateLockBlockers           ${current.candidateLockBlockers.join(", ") || "(none)"}`);
  console.log(`    coherent                        ${currentVerdict.coherent}`);
  for (const v of currentVerdict.violations) console.log(`      VIOLATION  ${v.invariant}: ${v.problem}`);
  console.log(`\n  artifact provenance: ${verified.length} checked, ${invalid.length} invalid`);
  console.log(`  invariants reconcile: ${rec.reconciles}`);
  console.log(`\nwrote ${path}`);
  process.exit(currentVerdict.coherent && invalid.length === 0 ? 0 : 2);
}
