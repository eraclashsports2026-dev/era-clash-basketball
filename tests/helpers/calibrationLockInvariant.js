import { expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { versionOf } from "../../src/versions.js";

const LOCK_PATH = "data/calibration/c6/baseline-candidate-lock.json";

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
  const lockExists = existsSync(LOCK_PATH);
  const lock = lockExists ? JSON.parse(readFileSync(LOCK_PATH, "utf8")).data : null;

  if (v == null) {
    expect(lock?.candidateLockStatus, "a null calibration version forbids a LOCKED manifest").not.toBe("LOCKED");
    return { locked: false, version: null };
  }

  expect(lockExists, `possessionCalibrationVersion is ${v} but ${LOCK_PATH} does not exist`).toBe(true);
  expect(lock.candidateLockStatus).toBe("LOCKED");
  expect(lock.allEngineeringGatesPass, "a locked calibration requires every engineering gate to pass").toBe(true);
  expect(lock.candidateLockBlockers, "a locked calibration requires zero unresolved blockers").toEqual([]);
  expect(lock.possessionCalibrationVersion, "the manifest and the registry must agree").toBe(v);
  expect(lock.parameterSetHash).toBeTruthy();

  if (lock.calibrationStatus === "DEVELOPMENT_LOCKED_BASELINE") {
    expect(lock.parameterChanges, "a BASELINE lock means no parameter moved").toBe(0);
  }
  // This lifecycle may not claim anything beyond a development lock.
  for (const forbidden of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
    expect(lock.calibrationStatus).not.toBe(forbidden);
  }
  expect(lock.formalHoldoutAccessCounts.historicalHoldoutV3).toBe(0);
  expect(lock.formalHoldoutAccessCounts.syntheticStressHoldoutV2).toBe(0);
  // Production is never touched by a development lock.
  expect(lock.engineVersions.productionEngineVersion).toBe("3.2.0");

  return { locked: true, version: v, status: lock.calibrationStatus, parameterChanges: lock.parameterChanges };
};
