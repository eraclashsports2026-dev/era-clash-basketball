import { expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { versionOf } from "../../src/versions.js";

const C0_LOCK_PATH = "data/calibration/c6/baseline-candidate-lock.json";
const C1_LOCK_PATH = "data/validation/6c4a/candidate1-lock.json";

/**
 * The invariant that replaced seven separate `possessionCalibrationVersion is
 * null` assertions when Phase 6C2C6 locked the baseline candidate.
 *
 * Those assertions each encoded a true fact — no calibration was locked — and
 * each would now fail. Deleting them would have removed the only guard on the
 * most consequential version in the registry, so they were replaced by this,
 * which is strictly stronger: `null` was one bit, whereas a non-null version
 * must now be backed by a lock manifest whose every engineering gate passed,
 * with zero unresolved blockers, agreeing with the registry, and — for a
 * baseline lock — with zero parameter changes and every value at its registry
 * default. It also still permits null, so a repository that has not locked
 * anything is covered by the same check.
 */
export const assertCalibrationLockInvariant = () => {
  const v = versionOf("possessionCalibrationVersion");
  // The ACTIVE lock is the newest candidate's. Phase 6C4A introduced candidate
  // succession: Candidate 1's lock (1.1.0) is the registry's backing manifest,
  // while Candidate 0's stays LOCKED at 1.0.0 as the parent — verified below.
  const c1Exists = existsSync(C1_LOCK_PATH);
  const LOCK_PATH = c1Exists ? C1_LOCK_PATH : C0_LOCK_PATH;
  const lockExists = existsSync(LOCK_PATH);
  const lock = lockExists ? JSON.parse(readFileSync(LOCK_PATH, "utf8")).data : null;

  if (v == null) {
    expect(lock?.candidateLockStatus, "a null calibration version forbids a LOCKED manifest").not.toBe("LOCKED");
    return { locked: false, version: null };
  }

  expect(lockExists, `possessionCalibrationVersion is ${v} but ${LOCK_PATH} does not exist`).toBe(true);
  expect(lock.candidateLockStatus).toBe("LOCKED");
  if (c1Exists) {
    // the parent lock chain must be intact
    const parent = JSON.parse(readFileSync(C0_LOCK_PATH, "utf8")).data;
    expect(parent.candidateLockStatus, "the parent lock is never mutated").toBe("LOCKED");
    expect(parent.possessionCalibrationVersion).toBe("1.0.0");
    expect(lock.parentCoreHash, "the succession names its parent").toBeTruthy();
    expect(lock.validationAttemptStatus, "a fresh lock has run no formal validation").toBe("NOT_RUN");
  }
  expect(lock.allEngineeringGatesPass, "a locked calibration requires every engineering gate to pass").toBe(true);
  expect(lock.candidateLockBlockers, "a locked calibration requires zero unresolved blockers").toEqual([]);
  expect(lock.possessionCalibrationVersion, "the manifest and the registry must agree").toBe(v);
  expect(lock.parameterSetHash).toBeTruthy();

  if (lock.calibrationStatus === "DEVELOPMENT_LOCKED_BASELINE" || lock.calibrationStatus === "DEVELOPMENT_LOCKED_SCOPED") {
    expect(lock.parameterChanges, "this lock lifecycle means no parameter moved").toBe(0);
  }
  // This lifecycle may not claim anything beyond a development lock.
  for (const forbidden of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
    expect(lock.calibrationStatus).not.toBe(forbidden);
  }
  // access counts as RECORDED AT LOCK TIME: Candidate 0 locked before any
  // holdout opened (0/0); Candidate 1 locked after V3 and V4 were consumed
  // (1/1) with the synthetic stress set still sealed. Either way the manifest
  // must record what was true, and synthetic must be 0.
  expect([0, 1]).toContain(lock.formalHoldoutAccessCounts.historicalHoldoutV3);
  expect(lock.formalHoldoutAccessCounts.syntheticStressHoldoutV2).toBe(0);
  // Production is never touched by a development lock.
  expect(lock.engineVersions.productionEngineVersion).toBe("3.2.0");

  return { locked: true, version: v, status: lock.calibrationStatus, parameterChanges: lock.parameterChanges };
};
