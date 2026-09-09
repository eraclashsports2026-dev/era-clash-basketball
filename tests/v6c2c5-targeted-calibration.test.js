import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { activeParameters, defaultRuntimeParameterSet, compileRuntimeParameterSet } from "../src/v3/calibration/runtimeParameters.js";
import { reconcile, payloadHash, verifyArtifact } from "../src/v3/calibration/artifacts.js";
import { gridPoints, twoSidedP, holmBonferroni, pairedTest, SEARCH_POLICY } from "../scripts/calibration/c5-search.mjs";
import { EXERCISE_CONTRACTS } from "../src/v3/calibration/exerciseContracts.js";

const A = (n) => JSON.parse(readFileSync(`data/calibration/c5/${n}.json`, "utf8"));
const DOC = (n) => readFileSync(`docs/simulation-v3/${n}`, "utf8");

describe("6C2C5 artifacts exist and verify", () => {
  const names = ["targeted-fixture-coverage", "no-effect-triage", "confounding-resolution",
    "calibration-scope", "candidate-history", "candidate-comparison", "validation-summary", "candidate-lock"];
  for (const n of names) {
    it(`${n} carries complete provenance and a matching hash`, () => {
      expect(existsSync(`data/calibration/c5/${n}.json`)).toBe(true);
      const v = verifyArtifact(n);
      expect(v.missing ?? []).toEqual([]);
      expect(v.hashMatches ?? true).toBe(true);
    });
  }
});

describe("every class partition sums to the active parameter count", () => {
  const active = activeParameters().length;
  it("readiness classes sum to the active count", () => {
    const d = A("no-effect-triage").data;
    expect(Object.values(d.readinessCounts).reduce((a, b) => a + b, 0)).toBe(active);
  });
  it("identifiability classes sum to the active count", () => {
    const d = A("no-effect-triage").data;
    expect(Object.values(d.identifiabilityCounts).reduce((a, b) => a + b, 0)).toBe(active);
  });
  it("triage classes sum to the prior no-effect count", () => {
    const d = A("no-effect-triage").data;
    expect(Object.values(d.triageCounts).reduce((a, b) => a + b, 0)).toBe(d.priorNoEffectCount);
  });
  it("eligible plus frozen equals the active count", () => {
    const d = A("no-effect-triage").data;
    expect(d.eligibleForSearch + d.frozen).toBe(active);
  });
  it("the scope reconciles eligible plus frozen against the population", () => {
    const d = A("calibration-scope").data;
    expect(d.reconciliation.reconciles).toBe(true);
    expect(d.eligibleCount + d.frozenCount).toBe(d.activeParameterCount);
  });
  it("accepted plus rejected equals the changed candidate count", () => {
    const d = A("candidate-history").data;
    expect(d.acceptedCount + d.rejectedCount).toBe(d.changedCandidates);
    expect(d.reconciliation.reconciles).toBe(true);
  });
  it("one exercise contract per active parameter, no orphans", () => {
    const d = A("targeted-fixture-coverage").data;
    expect(d.coverage.exerciseContracts).toBe(active);
    expect(d.coverage.missingContracts).toBe(0);
    expect(d.coverage.orphanContracts).toBe(0);
    expect(Object.keys(EXERCISE_CONTRACTS).length).toBe(active);
  });
});

// The failure this guards against is specific: Phase 6C2C4 shipped a readiness
// table written by hand whose counts summed to 59 against 53 active parameters.
// Any total in a rendered document must appear in the artifact it was rendered
// from, or it was typed rather than measured.
describe("rendered documents contain no hand-written totals", () => {
  const docs = ["targeted-mechanic-coverage.md", "no-effect-triage.md", "calibration-readiness-v3.md",
    "targeted-calibration-scope.md", "candidate-history.md", "candidate-comparison.md",
    "candidate-validation-summary.md", "candidate-lock.md", "parameter-confounding-resolution-v3.md"];
  for (const d of docs) {
    it(`${d} declares its source artifact and hash`, () => {
      const body = DOC(d);
      expect(body).toMatch(/RENDERED FROM ARTIFACT/);
      expect(body).toMatch(/outputHash: [0-9a-f]{64}/);
      expect(body).toMatch(/npm run calibration:c5:report/);
    });
    it(`${d} has no undefined or NaN placeholders`, () => {
      expect(DOC(d)).not.toMatch(/undefined|NaN/);
    });
  }
  it("the readiness document's total matches the artifact, not a typed number", () => {
    const d = A("no-effect-triage").data;
    const body = DOC("calibration-readiness-v3.md");
    const total = Object.values(d.readinessCounts).reduce((a, b) => a + b, 0);
    expect(body).toContain(`| **TOTAL** | **${total}** |`);
    for (const [cls, n] of Object.entries(d.readinessCounts)) {
      expect(body).toContain(`| \`${cls}\` | ${n} |`);
    }
  });
  it("the lock document reports the same candidate the artifact locked", () => {
    const d = A("candidate-lock").data;
    const body = DOC("candidate-lock.md");
    expect(body).toContain(d.lockedCandidateId);
    expect(body).toContain(d.status);
    expect(body).toContain(d.parameterSetHash);
    expect(body).toContain(d.manifestHash);
  });
});

describe("the search grid respects the registry step", () => {
  it("generates only on-grid values, anchored at the default", () => {
    expect(gridPoints({ defaultValue: 6, step: 1, lo: 3, hi: 9 })).toEqual([3, 4, 5, 7, 8, 9]);
    expect(gridPoints({ defaultValue: 0.3, step: 0.05, lo: 0.21, hi: 0.39 })).toEqual([0.25, 0.35]);
  });
  it("never proposes the default itself as a candidate", () => {
    for (const d of [0.5, 1, 2.6, 0.06]) {
      expect(gridPoints({ defaultValue: d, step: 0.05, lo: d - 0.2, hi: d + 0.2 })).not.toContain(d);
    }
  });
  it("refuses to run without a declared step", () => {
    expect(() => gridPoints({ defaultValue: 1, step: 0, lo: 0, hi: 2 })).toThrow(/declared step/);
  });
  it("every candidate in the history sits on its parameter's grid", () => {
    const d = A("candidate-history").data;
    const reg = new Map(activeParameters().map((p) => [p.id, p]));
    for (const h of d.history.filter((x) => x.candidateId !== "C0")) {
      const c = h.changes[0];
      const step = reg.get(c.id).step;
      const k = (c.to - reg.get(c.id).defaultValue) / step;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });
});

describe("the acceptance test controls for multiplicity", () => {
  it("matches published Student-t two-sided tail values", () => {
    expect(twoSidedP(2.0, 10)).toBeCloseTo(0.0734, 3);
    expect(twoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(twoSidedP(3.169, 10)).toBeCloseTo(0.01, 3);
    expect(twoSidedP(0, 5)).toBeCloseTo(1, 6);
  });
  it("applies Holm-Bonferroni step-down, not raw p-values", () => {
    expect(holmBonferroni([0.04, 0.5], 0.05).reject).toEqual([false, false]);
    expect(holmBonferroni([0.001, 0.9, 0.9], 0.05).reject).toEqual([true, false, false]);
  });
  it("keeps adjusted p-values monotone in rank", () => {
    const { adjusted } = holmBonferroni([0.01, 0.02, 0.03], 0.05);
    const sorted = [...adjusted].sort((a, b) => a - b);
    expect(adjusted).toEqual(sorted);
  });
  it("declines to test fewer than three paired observations", () => {
    expect(pairedTest([0.1, -0.2]).p).toBe(1);
  });
  it("requires all three gates, so a practical gain alone cannot accept", () => {
    expect(SEARCH_POLICY.acceptanceRequires).toContain("PRACTICAL_FLOOR");
    expect(SEARCH_POLICY.acceptanceRequires).toContain("FAMILY_WISE_SIGNIFICANT");
    expect(SEARCH_POLICY.acceptanceRequires).toContain("VALIDATION_NOT_DEGRADED");
  });
  it("records the family size the correction was applied over", () => {
    const d = A("candidate-history").data;
    expect(d.familySize).toBe(d.changedCandidates);
    expect(d.familyDiagnostics.candidatesClearingPracticalFloor)
      .toBeGreaterThanOrEqual(d.familyDiagnostics.candidatesFamilyWiseSignificant);
  });
});

describe("the superseded first search is retained, not deleted", () => {
  it("exists and records both defects", () => {
    const p = "data/calibration/c5/candidate-history-v1-superseded.json";
    expect(existsSync(p)).toBe(true);
    const a = JSON.parse(readFileSync(p, "utf8"));
    expect(a.supersededReason).toBe("INVALID_METHOD_TWO_DEFECTS");
    expect(a.defects.length).toBe(2);
    expect(a.defects.join(" ")).toMatch(/OFF_GRID_SCAN/);
    expect(a.defects.join(" ")).toMatch(/NO_MULTIPLICITY_CONTROL/);
    expect(a.disclosure).toMatch(/AFTER seeing this result/);
  });
  it("the current history points back to it", () => {
    const d = A("candidate-history").data;
    expect(d.supersedes.artifact).toBe("candidate-history-v1-superseded.json");
  });
});

describe("Candidate 0 competed and won on the evidence", () => {
  it("locked the wired defaults with zero parameter changes", () => {
    const d = A("candidate-lock").data;
    expect(d.lockedCandidateId).toBe("C0");
    expect(d.status).toBe("DEVELOPMENT_LOCKED_BASELINE");
    expect(d.changedParameterCount).toBe(0);
    expect(d.changedParameters).toEqual([]);
  });
  it("the locked set holds the registry default for every active parameter", () => {
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
    expect(def.status).toBe("UNCALIBRATED_DEFAULTS");
  });
  it("no changed candidate was accepted", () => {
    const d = A("candidate-history").data;
    expect(d.acceptedCount).toBe(0);
    expect(d.outcome).toBe("CANDIDATE_ZERO_WINS_NO_CHANGE_ACCEPTED");
  });
  it("the strongest contender failed to hold up on fresh seeds", () => {
    const d = A("candidate-comparison").data;
    expect(d.contenderHoldsUpOnFreshSeeds).toBe(false);
    expect(d.winner).toBe("C0");
  });
});

describe("the lock refuses to overclaim", () => {
  it("names every status it is not", () => {
    const d = A("candidate-lock").data;
    const text = d.isNotClaiming.join(" ");
    for (const s of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(text).toContain(s);
    }
  });
  it("records the failing probability gate rather than waiving it", () => {
    const d = A("candidate-lock").data;
    expect(d.allEngineeringGatesPass).toBe(false);
    expect(d.probabilityValidation.allGatesPass).toBe(false);
    expect(d.probabilityValidation.failingGates).toContain("sideBiasPerCellWithinTolerance");
    expect(d.probabilityValidation.thresholdUnchanged).toBe(true);
    expect(d.carriedForwardFailures.length).toBeGreaterThan(0);
    expect(d.gatePartitionDisclosure).toMatch(/AFTER it was seen to fail/);
  });
  it("keeps possessionCalibrationVersion null — nothing was calibrated", () => {
    const d = A("candidate-lock").data;
    expect(d.versions.possessionCalibrationVersion).toBeNull();
  });
});

describe("holdout discipline", () => {
  it("both sealed sets report an access count of zero", () => {
    const d = A("validation-summary").data;
    const h = d.sections.find((s) => s.name === "holdoutDiscipline");
    expect(h.historicalHoldoutV3.accessCount).toBe(0);
    expect(h.syntheticStressHoldoutV2.accessCount).toBe(0);
    expect(h.sealedMembersTouchedDuringValidation).toEqual([]);
    expect(h.verified).toBe(true);
  });
  it("no sealed fixture appears in the calibration scope", () => {
    const d = A("calibration-scope").data;
    expect(d.sealedSets.contaminationCheck).toBe("PASS");
    expect(d.sealedSets.historicalHoldoutV3.accessed).toBe(0);
  });
});

describe("the compiled parameter set stays immutable and validated", () => {
  it("rejects an unknown parameter id", () => {
    expect(() => compileRuntimeParameterSet({ overrides: { "not.a.parameter": 1 } })).toThrow();
  });
  it("rejects a value outside the registry bounds", () => {
    expect(() => compileRuntimeParameterSet({ overrides: { "coach.adjustmentMagnitude": 999 } })).toThrow();
  });
  it("is frozen", () => {
    const set = defaultRuntimeParameterSet();
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set.values)).toBe(true);
  });
});

describe("artifact hashing is deterministic across re-runs", () => {
  it("excludes generatedAt so an identical measurement hashes identically", () => {
    const base = { artifact: "x", data: { a: 1 }, generatedAt: "2026-01-01T00:00:00.000Z" };
    const later = { artifact: "x", data: { a: 1 }, generatedAt: "2026-08-26T00:00:00.000Z" };
    expect(payloadHash(base)).toBe(payloadHash(later));
  });
  it("changes when the data changes", () => {
    expect(payloadHash({ artifact: "x", data: { a: 1 } })).not.toBe(payloadHash({ artifact: "x", data: { a: 2 } }));
  });
});

describe("reconcile catches the 6C2C4 failure mode", () => {
  it("flags counts that do not sum to the population", () => {
    const r = reconcile({ label: "t", counts: { a: 30, b: 29 }, expectedTotal: 53 });
    expect(r.reconciles).toBe(false);
    expect(r.problems[0]).toMatch(/counts sum to 59, expected 53/);
  });
  it("flags a member classified twice", () => {
    const r = reconcile({ label: "t", counts: { a: 1, b: 1 }, expectedTotal: 2,
      members: { a: ["x", "y"], b: ["y"] }, population: ["x", "y"] });
    expect(r.reconciles).toBe(false);
    expect(r.problems.join(" ")).toMatch(/appears in 2 classes/);
  });
  it("flags a member in no class", () => {
    const r = reconcile({ label: "t", counts: { a: 1 }, expectedTotal: 1,
      members: { a: ["x"] }, population: ["x", "z"] });
    expect(r.reconciles).toBe(false);
    expect(r.problems.join(" ")).toMatch(/z appears in no class/);
  });
});
