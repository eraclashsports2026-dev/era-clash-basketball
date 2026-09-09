import { describe, it, expect } from "vitest";
import { recordedCalibrationVersionExpectation } from "./helpers/candidateLineage.js";
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
    // The artifact records what was live when Phase 6C2C6 wrote it. Once a
    // successor candidate is locked the registry moves on, so the artifact is
    // checked against the version of ITS candidate (the parent, 1.0.0) rather
    // than against a later registry value — a drifting artifact still fails.
    expect(d.truthfulCurrentState.possessionCalibrationVersion)
      .toBe(recordedCalibrationVersionExpectation(versionOf("possessionCalibrationVersion")));
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

// ── Lock gates and package (appended: they depend on artifacts produced later
// in the phase, and belong with the status invariants they enforce) ──────────
describe("baseline candidate lock", () => {
  it("verifies as an artifact", () => {
    const v = verifyArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
    expect(v.missingProvenance).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("locks Candidate 0 with zero parameter changes", () => {
    const d = C6("baseline-candidate-lock").data;
    expect(d.candidateId).toBe("Candidate 0");
    expect(d.candidateSelectionStatus).toBe("SELECTED");
    expect(d.candidateLockStatus).toBe("LOCKED");
    expect(d.calibrationStatus).toBe("DEVELOPMENT_LOCKED_BASELINE");
    expect(d.parameterChanges).toBe(0);
    expect(d.candidateLockBlockers).toEqual([]);
  });

  it("is internally coherent under the status invariants", () => {
    const d = C6("baseline-candidate-lock").data;
    expect(evaluateStatus({
      candidateId: d.candidateId, candidateSelectionStatus: d.candidateSelectionStatus,
      candidateLockStatus: d.candidateLockStatus, calibrationStatus: d.calibrationStatus,
      possessionCalibrationVersion: d.possessionCalibrationVersion,
      parameterChanges: d.parameterChanges, candidateLockBlockers: d.candidateLockBlockers,
      lockManifestPresent: true,
    }).coherent).toBe(true);
  });

  it("agrees with the registry on the calibration version", () => {
    const d = C6("baseline-candidate-lock").data;
    // Candidate 0's manifest states 1.0.0 permanently. While it is the ACTIVE
    // lock that is also the registry value; once a successor is locked the
    // registry advances and this manifest must NOT follow it — a mutated
    // parent manifest is the failure this now catches.
    expect(d.possessionCalibrationVersion)
      .toBe(recordedCalibrationVersionExpectation(versionOf("possessionCalibrationVersion")));
    expect(d.possessionCalibrationVersion).toBe("1.0.0");
  });

  it("holds every active parameter at its registry default", () => {
    const d = C6("baseline-candidate-lock").data;
    const def = defaultRuntimeParameterSet();
    expect(d.parameterSetHash).toBe(def.parameterSetHash);
    for (const p of activeParameters()) expect(d.parameterValues[p.id]).toBe(p.defaultValue);
    expect(d.activeParameterCount).toBe(activeParameters().length);
  });

  it("passes every engineering gate", () => {
    const d = C6("baseline-candidate-lock").data;
    expect(d.allEngineeringGatesPass).toBe(true);
    for (const g of d.engineeringGates) expect(g.pass, `${g.name}: ${g.detail}`).toBe(true);
    expect(d.engineeringGates.length).toBeGreaterThanOrEqual(30);
  });

  it("content-addresses every input", () => {
    const d = C6("baseline-candidate-lock").data;
    for (const k of ["candidateHistoryHash", "candidateComparisonHash", "candidateStatusReconciliationHash",
      "probabilitySideBiasPolicyHash", "probabilitySideBiasSeedSetHash", "probabilitySideBiasValidationHash",
      "priorFailingCellHash", "orientationAuditHash", "probabilityValidationHash", "sideSymmetryValidationHash",
      "internalValidationHash", "readinessHash", "objectiveVisibilityResolutionHash", "manifestHash"]) {
      expect(d[k], `${k} must be present`).toBeTruthy();
      expect(String(d[k]).length).toBeGreaterThanOrEqual(32);
    }
  });

  it("keeps production untouched and both holdouts sealed", () => {
    const d = C6("baseline-candidate-lock").data;
    expect(d.engineVersions.productionEngineVersion).toBe("3.2.0");
    expect(d.formalHoldoutAccessCounts.historicalHoldoutV3).toBe(0);
    expect(d.formalHoldoutAccessCounts.syntheticStressHoldoutV2).toBe(0);
    expect(d.formalHoldoutState.historicalHoldoutV3).toBe("SEALED_UNREAD");
    expect(d.formalHoldoutState.syntheticStressHoldoutV2).toBe("SEALED_UNREAD");
  });

  it("refuses to overclaim", () => {
    const d = C6("baseline-candidate-lock").data;
    const text = d.scopeOfLock.doesNotMean.join(" ");
    for (const s of ["holdout validated", "preview validated", "production ready"]) {
      expect(text.toLowerCase()).toContain(s.toLowerCase());
    }
    for (const forbidden of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(d.calibrationStatus).not.toBe(forbidden);
    }
  });

  it("declares a post-lock mutation policy", () => {
    expect(C6("baseline-candidate-lock").data.postLockMutationPolicy).toMatch(/new possessionCalibrationVersion/);
  });

  it("records the phase-start state as well as the current one", () => {
    const d = C6("candidate-status-reconciliation").data;
    expect(d.phaseStartState.candidateLockStatus).toBe("UNLOCKED");
    expect(d.phaseStartState.possessionCalibrationVersion).toBeNull();
    expect(d.phaseStartBlockers).toContain("PROBABILITY_SIDE_BIAS_GATE_UNRESOLVED");
    expect(d.phaseStartCoherent).toBe(true);
    expect(d.blockerResolved).toBe(true);
    expect(d.truthfulCurrentState.candidateLockStatus).toBe("LOCKED");
  });
});

describe("internal regression under the locked candidate", () => {
  it("verifies and passes", () => {
    expect(verifyArtifact("c6-internal-regression", ARTIFACT_DIR_C6).valid).toBe(true);
    expect(C6("c6-internal-regression").data.allPass).toBe(true);
  });

  it("replays identically, and the locked candidate equals the legacy result", () => {
    const s = C6("c6-internal-regression").data.sections.find((x) => x.name === "replay");
    for (const c of s.cases) expect(c.identical, c.label).toBe(true);
    expect(s.lockedMatchesLegacy).toBe(true);
    expect(s.probabilityReplayIdentical).toBe(true);
    expect(s.complementExact).toBe(true);
    expect(s.complementRelabels).toBe(true);
    expect(s.estimatorReportsPairedUncertainty).toBe(true);
  });

  it("runs every competition mode with no violations and one parameter set", () => {
    const s = C6("c6-internal-regression").data.sections.find((x) => x.name === "competitionModes");
    expect(s.totalInvariantViolations).toBe(0);
    expect(s.oneParameterSetPerCompetition).toBe(true);
    const names = s.modes.map((m) => m.mode);
    for (const m of ["Single Game", "Best of 7", "Win 82", "Tournament", "Daily (development)"]) expect(names).toContain(m);
    expect(s.modes.find((m) => m.mode === "Best of 7").series).toBeGreaterThanOrEqual(200);
    expect(s.modes.find((m) => m.mode === "Win 82").seasons).toBeGreaterThanOrEqual(50);
    expect(s.modes.find((m) => m.mode === "Tournament").brackets).toBeGreaterThanOrEqual(20);
  });

  it("has zero final ties and zero impossible scores", () => {
    const s = C6("c6-internal-regression").data.sections.find((x) => x.name === "statisticalInvariants");
    expect(s.finalTies).toBe(0);
    expect(s.impossibleScores).toBe(0);
  });
});

describe("Phase 6C3 package is prepared and not run", () => {
  it("verifies and names the locked candidate", () => {
    expect(verifyArtifact("phase-6c3-validation-package", ARTIFACT_DIR_C6).valid).toBe(true);
    const d = C6("phase-6c3-validation-package").data;
    expect(d.state).toBe("PREPARED_NOT_RUN");
    expect(d.lockedCandidate.lockManifestHash).toBe(C6("baseline-candidate-lock").data.manifestHash);
    expect(d.lockedCandidate.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
  });

  it("has executed zero holdout commands", () => {
    const d = C6("phase-6c3-validation-package").data;
    expect(d.holdoutCommandsExecuted).toBe(0);
    for (const c of d.commandsPrepared) expect(c.executed).toBe(0);
    for (const h of Object.values(d.holdouts)) {
      expect(h.state).toBe("SEALED_UNREAD");
      expect(h.comparisonAccessCount).toBe(0);
    }
  });

  it("states its unmet preconditions rather than claiming readiness", () => {
    const d = C6("phase-6c3-validation-package").data;
    expect(d.preconditionsUnmet).toBeGreaterThan(0);
    expect(d.readyToRun).toBe(false);
    expect(d.unmetPreconditions.length).toBe(d.preconditionsUnmet);
    expect(d.readinessNote).toMatch(/opened ONCE|opened once/i);
  });

  it("declines to claim holdout or preview validation", () => {
    const t = C6("phase-6c3-validation-package").data.notClaimed.join(" ");
    expect(t).toMatch(/have NOT been opened/);
    expect(t).toMatch(/No private preview/);
    expect(t).toMatch(/does not authorise production|Nothing here authorises production/);
  });
});
