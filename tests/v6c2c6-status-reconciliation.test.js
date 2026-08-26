import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { evaluateStatus, STATUS_INVARIANTS, SELECTION_STATES, LOCK_STATES } from "../scripts/calibration/c6-status.mjs";
import { versionOf } from "../src/versions.js";
import { activeParameters, defaultRuntimeParameterSet } from "../src/v3/calibration/runtimeParameters.js";
import { verifyArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";

const C6 = (n) => JSON.parse(readFileSync(`data/calibration/c6/${n}.json`, "utf8"));
const C5 = (n) => JSON.parse(readFileSync(`data/calibration/c5/${n}.json`, "utf8"));

// A status set is a claim about readiness. These invariants are the difference
// between a status that means something and a word that happens to sound strong.
describe("status invariants", () => {
  const base = {
    candidateId: "Candidate 0", candidateSelectionStatus: "SELECTED",
    candidateLockStatus: "UNLOCKED", calibrationStatus: "NOT_LOCKED",
    possessionCalibrationVersion: null, parameterChanges: 0,
    candidateLockBlockers: [], lockManifestPresent: false,
  };

  it("accepts the truthful selected-but-unlocked state", () => {
    expect(evaluateStatus(base).coherent).toBe(true);
  });

  it("LOCKED requires a non-null possessionCalibrationVersion", () => {
    const v = evaluateStatus({ ...base, candidateLockStatus: "LOCKED", lockManifestPresent: true });
    expect(v.coherent).toBe(false);
    expect(v.violations.map((x) => x.invariant)).toContain("lockedRequiresCalibrationVersion");
  });

  it("LOCKED requires a lock manifest", () => {
    const v = evaluateStatus({ ...base, candidateLockStatus: "LOCKED", possessionCalibrationVersion: "1.0.0", lockManifestPresent: false });
    expect(v.violations.map((x) => x.invariant)).toContain("lockedRequiresLockManifest");
  });

  it("LOCKED requires zero unresolved blockers", () => {
    const v = evaluateStatus({ ...base, candidateLockStatus: "LOCKED", possessionCalibrationVersion: "1.0.0",
      lockManifestPresent: true, candidateLockBlockers: ["PROBABILITY_SIDE_BIAS_GATE_UNRESOLVED"] });
    expect(v.violations.map((x) => x.invariant)).toContain("lockedRequiresZeroBlockers");
  });

  it("UNLOCKED forbids any DEVELOPMENT_LOCKED_* calibration status", () => {
    const v = evaluateStatus({ ...base, calibrationStatus: "DEVELOPMENT_LOCKED_BASELINE" });
    expect(v.violations.map((x) => x.invariant)).toContain("unlockedForbidsDevelopmentLockedStatus");
  });

  it("DEVELOPMENT_LOCKED_BASELINE requires zero parameter changes", () => {
    const v = evaluateStatus({ ...base, candidateLockStatus: "LOCKED", possessionCalibrationVersion: "1.0.0",
      lockManifestPresent: true, calibrationStatus: "DEVELOPMENT_LOCKED_BASELINE", parameterChanges: 3 });
    expect(v.violations.map((x) => x.invariant)).toContain("baselineLockRequiresZeroParameterChanges");
  });

  it("DEVELOPMENT_LOCKED_SCOPED requires at least one parameter change", () => {
    const v = evaluateStatus({ ...base, candidateLockStatus: "LOCKED", possessionCalibrationVersion: "1.0.0",
      lockManifestPresent: true, calibrationStatus: "DEVELOPMENT_LOCKED_SCOPED", parameterChanges: 0 });
    expect(v.violations.map((x) => x.invariant)).toContain("scopedLockRequiresParameterChanges");
  });

  it("a non-null calibration version requires a LOCKED candidate", () => {
    const v = evaluateStatus({ ...base, possessionCalibrationVersion: "1.0.0" });
    expect(v.violations.map((x) => x.invariant)).toContain("calibrationVersionRequiresLock");
  });

  it("catches the exact Phase 6C2C5 state as incoherent", () => {
    // What 6C2C5 published: a LOCKED-sounding status, a null calibration
    // version, and one failing gate. This is the regression this file exists for.
    const v = evaluateStatus({
      candidateId: "C0", candidateSelectionStatus: "SELECTED", candidateLockStatus: "LOCKED",
      calibrationStatus: "DEVELOPMENT_LOCKED_BASELINE", possessionCalibrationVersion: null,
      parameterChanges: 0, candidateLockBlockers: ["probabilityValidationAllGatesPass"], lockManifestPresent: true,
    });
    expect(v.coherent).toBe(false);
    expect(v.violations.map((x) => x.invariant)).toEqual(
      expect.arrayContaining(["lockedRequiresCalibrationVersion", "lockedRequiresZeroBlockers"]));
  });
});

describe("the reconciliation artifact", () => {
  it("exists and verifies", () => {
    expect(existsSync("data/calibration/c6/candidate-status-reconciliation.json")).toBe(true);
    const v = verifyArtifact("candidate-status-reconciliation", ARTIFACT_DIR_C6);
    expect(v.missingProvenance).toEqual([]);
    expect(v.hashMatches).toBe(true);
    expect(v.valid).toBe(true);
  });

  it("records the 6C2C5 contradiction rather than quietly fixing it", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.contradictionFound.detected).toBe(true);
    expect(d.contradictionFound.violations.length).toBeGreaterThan(0);
    expect(d.contradictionFound.publishedState.status).toBe("DEVELOPMENT_LOCKED_BASELINE");
    expect(d.contradictionFound.publishedState.possessionCalibrationVersion).toBeNull();
    expect(d.contradictionFound.rootCause).toMatch(/one field carried two claims/i);
  });

  it("names selection and lock as separate fields, which 6C2C5 lacked", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.contradictionFound.publishedState.hadSelectionStatusField).toBe(false);
    expect(d.contradictionFound.publishedState.hadLockStatusField).toBe(false);
    expect(d.truthfulCurrentState.candidateSelectionStatus).toBeDefined();
    expect(d.truthfulCurrentState.candidateLockStatus).toBeDefined();
  });

  it("reports a coherent current state", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.currentStateCoherent).toBe(true);
    expect(d.currentStateViolations).toEqual([]);
    expect(d.reconciliation.reconciles).toBe(true);
  });

  it("preserves the 6C2C5 artifact unedited", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.supersedes.preserved).toBe(true);
    // The original still says what it said.
    expect(C5("candidate-lock").data.status).toBe("DEVELOPMENT_LOCKED_BASELINE");
  });
});

describe("repository truth at phase start", () => {
  it("Candidate 0 holds every registry default", () => {
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
    expect(def.status).toBe("UNCALIBRATED_DEFAULTS");
  });

  it("accepted parameter changes are zero", () => {
    expect(C5("candidate-history").data.acceptedCount).toBe(0);
  });

  it("the registry and the reconciliation artifact agree on the calibration version", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.truthfulCurrentState.possessionCalibrationVersion).toBe(versionOf("possessionCalibrationVersion"));
  });

  it("both formal holdouts report an access count of zero", () => {
    const h = C5("validation-summary").data.sections.find((s) => s.name === "holdoutDiscipline");
    expect(h.historicalHoldoutV3.accessCount).toBe(0);
    expect(h.syntheticStressHoldoutV2.accessCount).toBe(0);
    expect(h.sealedMembersTouchedDuringValidation).toEqual([]);
  });

  it("every Phase 6C2C5 artifact verifies on the CORRECT field", () => {
    // The 6C2C5 lock gate tested `verifyArtifact(n).ok !== false`. verifyArtifact
    // returns `valid`, never `ok`, so that gate was unfailable. This asserts the
    // field that exists.
    const d = C6("candidate-status-reconciliation").data;
    expect(d.artifactVerification.invalid).toBe(0);
    for (const r of d.artifactVerification.results) {
      expect(r.valid, `${r.artifact} must verify`).toBe(true);
      expect(r.ok).toBeUndefined();
    }
  });
});

describe("status vocabulary", () => {
  it("exposes exactly the states the phase is allowed to use", () => {
    expect(Object.keys(SELECTION_STATES).sort()).toEqual(["NOT_SELECTED", "SELECTED", "SELECTED_PENDING_GATE"]);
    expect(Object.keys(LOCK_STATES).sort()).toEqual(["LOCKED", "UNLOCKED"]);
  });
  it("declares every invariant it checks", () => {
    expect(STATUS_INVARIANTS.length).toBeGreaterThanOrEqual(8);
    for (const i of STATUS_INVARIANTS) expect(typeof i.check).toBe("function");
  });
});
