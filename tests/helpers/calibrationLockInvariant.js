import { expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { versionOf } from "../../src/versions.js";

const C0_LOCK_PATH = "data/calibration/c6/baseline-candidate-lock.json";
const C1_LOCK_PATH = "data/validation/6c4a/candidate1-lock.json";
const C2_LOCK_PATH = "data/validation/6c4c1/candidate2-lock.json";
const C3_LOCK_PATH = "data/validation/6c4d0/candidate3-lock.json";

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
  // Phase 6C4C1 added a second succession: Candidate 2's lock (1.2.0) becomes
  // the registry's backing manifest while Candidate 1's stays LOCKED at 1.1.0
  // as its parent, and Candidate 0's at 1.0.0 as the grandparent. The ACTIVE
  // lock is always the newest that exists.
  const c3Exists = existsSync(C3_LOCK_PATH);
  const c2Exists = existsSync(C2_LOCK_PATH);
  const c1Exists = existsSync(C1_LOCK_PATH);
  const isSuccession = c3Exists || c2Exists || c1Exists;
  const LOCK_PATH = c3Exists ? C3_LOCK_PATH : c2Exists ? C2_LOCK_PATH : c1Exists ? C1_LOCK_PATH : C0_LOCK_PATH;
  const lockExists = existsSync(LOCK_PATH);
  const lock = lockExists ? JSON.parse(readFileSync(LOCK_PATH, "utf8")).data : null;

  if (v == null) {
    expect(lock?.candidateLockStatus, "a null calibration version forbids a LOCKED manifest").not.toBe("LOCKED");
    return { locked: false, version: null };
  }

  expect(lockExists, `possessionCalibrationVersion is ${v} but ${LOCK_PATH} does not exist`).toBe(true);
  expect(lock.candidateLockStatus).toBe("LOCKED");
  if (isSuccession) {
    // the whole ancestor chain must be intact, not only the immediate parent
    const c0 = JSON.parse(readFileSync(C0_LOCK_PATH, "utf8")).data;
    expect(c0.candidateLockStatus, "the grandparent lock is never mutated").toBe("LOCKED");
    expect(c0.possessionCalibrationVersion).toBe("1.0.0");
    if (c3Exists) {
      // generation 3: Candidate 2's lock is the parent and is never mutated,
      // and the whole chain beneath it must still hold.
      const c2 = JSON.parse(readFileSync(C2_LOCK_PATH, "utf8")).data;
      expect(c2.candidateLockStatus, "the parent lock is never mutated").toBe("LOCKED");
      expect(c2.possessionCalibrationVersion).toBe("1.2.0");
      expect(lock.parentCoreHash, "the succession names its parent's current core").toBe(c2.coreHash);
      expect(lock.coreHash, "a successor's core differs from its parent's").not.toBe(c2.coreHash);
      const c1chk = JSON.parse(readFileSync(C1_LOCK_PATH, "utf8")).data;
      expect(c1chk.candidateLockStatus).toBe("LOCKED");
      expect(c1chk.possessionCalibrationVersion).toBe("1.1.0");
    } else if (c2Exists) {
      const c1 = JSON.parse(readFileSync(C1_LOCK_PATH, "utf8")).data;
      expect(c1.candidateLockStatus, "the parent lock is never mutated").toBe("LOCKED");
      expect(c1.possessionCalibrationVersion).toBe("1.1.0");
      // The parent's CURRENT core is its re-certification's when one exists:
      // Phase 6C4B1 re-certified Candidate 1 at a new core hash for identity
      // reasons, so the original lock's hash is the superseded one and a
      // successor must name the re-certified value.
      const RECERT = "data/validation/6c4b1/candidate1-lock-recertification.json";
      const parentCore = existsSync(RECERT)
        ? JSON.parse(readFileSync(RECERT, "utf8")).data.coreHash : c1.coreHash;
      expect(lock.parentCoreHash, "the succession names its parent's current core").toBe(parentCore);
      expect(lock.coreHash, "a successor's core differs from its parent's").not.toBe(parentCore);
    }
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
  // (1/1); Candidate 2 locked after V5 was consumed too, with the synthetic
  // stress set still sealed throughout. Either way the manifest must record
  // what was true, and synthetic must be 0.
  expect([0, 1]).toContain(lock.formalHoldoutAccessCounts.historicalHoldoutV3);
  expect(lock.formalHoldoutAccessCounts.syntheticStressHoldoutV2).toBe(0);
  // Production is never touched by a development lock.
  expect(lock.engineVersions.productionEngineVersion).toBe("3.2.0");

  return { locked: true, version: v, status: lock.calibrationStatus,
    parameterChanges: lock.parameterChanges, lockPath: LOCK_PATH,
    generation: c3Exists ? 3 : c2Exists ? 2 : c1Exists ? 1 : 0 };
};
