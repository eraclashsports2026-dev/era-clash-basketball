import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  IDENTIFIABILITY_V2, METRIC_FAMILIES, PRACTICAL_EFFECT, READINESS_CLASSES,
  identifiabilityPolicyHash, missingFamilies, missingPracticalThresholds,
} from "../src/v3/calibration/identifiabilityPolicy.js";
import { activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { PARAMETERS } from "../src/v3/calibration/parameters.js";
import { holm, pFromT, cosine, conditionNumber } from "../scripts/calibration/identifiability-v2.mjs";
import { readinessOf, MOVEMENT_CAP, SAFETY_CLAMPS, buildReadiness } from "../scripts/calibration/readiness.mjs";
import { buildFolds, leakageKey, assertNoHoldout } from "../scripts/calibration/folds-v3.mjs";
import { versionOf } from "../src/versions.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";
import { assertSealDiscipline, assertImportChangedNoSeal, sealSnapshot } from "./helpers/sealDiscipline.js";

const FROZEN_POLICY_HASH = "04c4b45bf1752ce0";

// ── Identifiability v2 policy ───────────────────────────────────────────────
describe("identifiability v2 policy", () => {
  it("has not changed since it was frozen", () => {
    expect(identifiabilityPolicyHash().slice(0, 16), [
      "The identifiability v2 policy changed.",
      "Allowed only with a version bump, the old and new values recorded, a",
      "justification valid independent of the result, and a re-run.",
    ].join("\n")).toBe(FROZEN_POLICY_HASH);
  });

  it("declares a metric family for every active parameter", () => {
    expect(missingFamilies(activeParameters().map((p) => p.id))).toEqual([]);
  });

  it("declares a practical threshold for every family metric", () => {
    expect(missingPracticalThresholds()).toEqual([]);
  });

  it("records why v1 was retired", () => {
    expect(IDENTIFIABILITY_V2.supersedes).toBe("1.0.0");
    expect(IDENTIFIABILITY_V2.supersededReason).toMatch(/max\|t\|/);
    expect(IDENTIFIABILITY_V2.supersededReason).toMatch(/2\.42|null median/);
  });

  it("uses a non-degenerate null model", () => {
    // An A/A null is degenerate on a deterministic engine: the same set on the
    // same seed gives a paired difference of exactly zero.
    expect(IDENTIFIABILITY_V2.nullModel).toMatch(/out-of-family/i);
    expect(IDENTIFIABILITY_V2.nullModel).not.toMatch(/^A\/A/);
  });

  it("requires practical effect as well as significance", () => {
    expect(IDENTIFIABILITY_V2.requirePracticalEffect).toBe(true);
    expect(IDENTIFIABILITY_V2.familyWiseMethod).toBe("holm-bonferroni");
  });

  it("gives no family more metrics than the multiplicity budget can carry", () => {
    // A family of 32 metrics would recreate the v1 problem inside the family.
    for (const [id, f] of Object.entries(METRIC_FAMILIES)) {
      expect(f.primary.length, `${id} primary family`).toBeGreaterThan(0);
      expect(f.primary.length, `${id} primary family too wide`).toBeLessThanOrEqual(4);
      expect(f.guardrails.length, `${id} needs guardrails`).toBeGreaterThan(0);
    }
  });

  it("never lists a metric as both primary and guardrail", () => {
    for (const [id, f] of Object.entries(METRIC_FAMILIES)) {
      for (const g of f.guardrails) {
        expect(f.primary, `${id}: ${g} is both primary and guardrail`).not.toContain(g);
      }
    }
  });

  it("forbids choosing the method by its outcome", () => {
    expect(IDENTIFIABILITY_V2.forbidMethodSelectionByOutcome).toBe(true);
    expect(IDENTIFIABILITY_V2.forbidReclassificationToEnlargeScope).toBe(true);
  });
});

// ── Statistics ──────────────────────────────────────────────────────────────
describe("statistical machinery", () => {
  it("gives Holm the same rejection as Bonferroni at the smallest p", () => {
    const e = [{ p: 0.001 }, { p: 0.4 }, { p: 0.9 }];
    const out = holm(e, 0.05);
    expect(out[0].adjustedP).toBeCloseTo(0.003, 6);
    expect(out[0].significant).toBe(true);
    expect(out.filter((x) => x.significant)).toHaveLength(1);
  });

  it("keeps Holm adjusted p-values monotone", () => {
    const out = holm([{ p: 0.01 }, { p: 0.02 }, { p: 0.03 }, { p: 0.9 }], 0.05);
    for (let i = 1; i < out.length; i++) expect(out[i].adjustedP).toBeGreaterThanOrEqual(out[i - 1].adjustedP);
  });

  it("rejects nothing from a spray of uniform p-values", () => {
    const noise = Array.from({ length: 4 }, (_, i) => ({ p: (i + 1) / 5 }));
    expect(holm(noise, 0.05).filter((x) => x.significant)).toHaveLength(0);
  });

  it("maps t to a sane two-sided p", () => {
    expect(pFromT(0)).toBeGreaterThan(0.9);
    expect(pFromT(1.96)).toBeGreaterThan(0.03);
    expect(pFromT(1.96)).toBeLessThan(0.07);
    expect(pFromT(10)).toBeLessThan
      (1e-10);
  });

  it("gives cosine 1 for parallel and -1 for anti-parallel vectors", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(cosine([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("computes a conditioning estimate and labels it an approximation", () => {
    const c = conditionNumber([[1, 0], [0, 1], [1, 1]]);
    expect(c.approxConditionNumber).toBeGreaterThan(0);
    expect(c.method).toMatch(/approximation/i);
  });
});

// ── Readiness reconciliation ────────────────────────────────────────────────
describe("readiness reconciliation", () => {
  const r = buildReadiness();

  it("assigns every active parameter exactly one class", () => {
    expect(r.parameters).toHaveLength(activeParameters().length);
    const ids = new Set(r.parameters.map((p) => p.id));
    expect(ids.size).toBe(r.parameters.length);
    for (const p of r.parameters) expect(Object.keys(READINESS_CLASSES)).toContain(p.readiness);
  });

  it("HARD GATE: class counts sum to the active parameter count", () => {
    // Phase 6C2C3 failed this. Its readiness table was written as prose rather
    // than computed: six numbers summing to 59 against 53 parameters, and the
    // report then quoted four of them summing to 44. No code produced them.
    expect(r.reconciliation.sumOfClasses, [
      "Readiness classes do not reconcile.",
      `sum ${r.reconciliation.sumOfClasses} vs active ${r.activeParameterCount}.`,
      "Every active parameter must appear in exactly one class.",
    ].join("\n")).toBe(r.activeParameterCount);
    expect(r.reconciliation.reconciles).toBe(true);
    expect(r.reconciliation.unknownClasses).toEqual([]);
  });

  it("gives every parameter a reason, not just a label", () => {
    for (const p of r.parameters) expect(p.readinessReason.length, p.id).toBeGreaterThan(30);
  });

  it("freezes everything that is not eligible, with a zero-width search window", () => {
    for (const p of r.parameters) {
      if (p.eligibleForSearch) continue;
      expect(p.movementCapFractionOfRange, p.id).toBe(0);
      expect(p.searchBounds.lo, p.id).toBe(p.defaultValue);
      expect(p.searchBounds.hi, p.id).toBe(p.defaultValue);
    }
  });

  it("keeps the movement caps the policy declared", () => {
    expect(MOVEMENT_CAP.FREE_CALIBRATION).toBe(1.0);
    expect(MOVEMENT_CAP.STRONGLY_REGULARIZED_CALIBRATION).toBe(0.15);
    for (const k of ["STRUCTURAL_CALIBRATION_ONLY", "DEFAULT_FROZEN_CONFOUNDED",
      "DEFAULT_FROZEN_NO_EFFECT", "DEFAULT_FROZEN_PENDING_EXTERNAL_DATA"]) {
      expect(MOVEMENT_CAP[k], k).toBe(0);
    }
  });

  it("routes a confounded parameter to frozen regardless of its support", () => {
    const out = readinessOf({ identifiability: "IDENTIFIABLE", support: "HISTORICAL_NUMERIC_SUPPORT", confoundedWith: ["other.param"] });
    expect(out.readiness).toBe("DEFAULT_FROZEN_CONFOUNDED");
  });

  it("routes an unsupported parameter to frozen regardless of how well it measures", () => {
    const out = readinessOf({ identifiability: "IDENTIFIABLE", support: "UNSUPPORTED", confoundedWith: [] });
    expect(out.readiness).toBe("DEFAULT_FROZEN_PENDING_EXTERNAL_DATA");
  });

  it("only reaches free calibration with both identifiability and historical support", () => {
    expect(readinessOf({ identifiability: "IDENTIFIABLE", support: "HISTORICAL_NUMERIC_SUPPORT", confoundedWith: [] }).readiness).toBe("FREE_CALIBRATION");
    expect(readinessOf({ identifiability: "WEAKLY_IDENTIFIABLE", support: "HISTORICAL_NUMERIC_SUPPORT", confoundedWith: [] }).readiness).toBe("STRONGLY_REGULARIZED_CALIBRATION");
    expect(readinessOf({ identifiability: "IDENTIFIABLE", support: "SYNTHETIC_CONTROL_SUPPORT", confoundedWith: [] }).readiness).toBe("STRONGLY_REGULARIZED_CALIBRATION");
  });

  it("treats a safety clamp as frozen rather than as a tunable", () => {
    const out = readinessOf({ identifiability: "IDENTIFIABLE", support: "HISTORICAL_NUMERIC_SUPPORT", confoundedWith: [], safetyClamp: true });
    expect(out.readiness).toBe("DEFAULT_FROZEN_NO_EFFECT");
    expect(out.reason).toMatch(/safety clamp/i);
    // Both clamps carry a measured justification, not an assertion.
    for (const [id, note] of Object.entries(SAFETY_CLAMPS)) {
      expect(note.length, id).toBeGreaterThan(80);
      expect(activeParameters().map((p) => p.id)).toContain(id);
    }
  });
});

// ── Folds ───────────────────────────────────────────────────────────────────
describe("internal folds v3", () => {
  const f = buildFolds();

  it("covers historical calibration v3 and synthetic development v2 only", () => {
    expect(f.historicalCount).toBe(24);
    expect(f.syntheticCount).toBe(14);
    expect(f.memberCount).toBe(38);
  });

  it("is leak-free", () => {
    expect(f.leaks, `leaks: ${JSON.stringify(f.leaks)}`).toEqual([]);
    expect(f.leakFree).toBe(true);
  });

  it("never splits a franchise across folds", () => {
    const byTeam = new Map();
    for (const fold of f.folds) for (const t of fold.franchises) {
      if (!byTeam.has(t)) byTeam.set(t, new Set());
      byTeam.get(t).add(fold.fold);
    }
    for (const [t, folds] of byTeam) expect(folds.size, `${t} straddles folds`).toBe(1);
  });

  it("groups historical fixtures by franchise, not by a season window", () => {
    // A three-season window put the 1956-57 and 1962-63 Celtics in different
    // folds and the franchise check caught it.
    expect(leakageKey({ kind: "historical", teamId: "BOS", seasonStartYear: 1956 }))
      .toBe(leakageKey({ kind: "historical", teamId: "BOS", seasonStartYear: 1962 }));
  });

  it("groups a synthetic lineup by its five, regardless of order or id", () => {
    expect(leakageKey({ kind: "synthetic", id: "a", five: ["x", "y"] }))
      .toBe(leakageKey({ kind: "synthetic", id: "b", five: ["y", "x"] }));
  });

  it("is deterministic — the same corpus gives the same hash", () => {
    expect(buildFolds().foldHash).toBe(f.foldHash);
  });

  it("refuses a sealed holdout member", () => {
    expect(() => assertNoHoldout([{ id: "h3-1953-54-lakers" }])).toThrow(/holdout/i);
  });

  it("gives every fold at least one historical and one synthetic member", () => {
    for (const fold of f.folds) {
      expect(fold.historical, `fold ${fold.fold} has no historical member`).toBeGreaterThan(0);
      expect(fold.synthetic, `fold ${fold.fold} has no synthetic member`).toBeGreaterThan(0);
    }
  });
});

// ── The phase outcome, asserted ─────────────────────────────────────────────
describe("scoped calibration outcome", () => {
  // Phase 6C2C4 accepted no parameter change, which is still true and is what
  // this test was really about. Phase 6C2C6 later locked a BASELINE calibration
  // — a lock whose defining property is that no parameter moved — so the
  // assertion becomes: if anything is locked, it is a baseline lock.
  it("accepted no parameter change, so any later lock must be a baseline lock", () => {
    const r = assertCalibrationLockInvariant();
    if (r.locked) {
      expect(r.status).toBe("DEVELOPMENT_LOCKED_BASELINE");
      expect(r.parameterChanges).toBe(0);
    }
  });

  it("left every parameter at its default", () => {
    for (const p of PARAMETERS) {
      expect(p.currentValue, `${p.id} moved`).toBe(p.defaultValue);
      expect(p.changeHistory, `${p.id} has history`).toEqual([]);
    }
  });

  it("recorded that no parameter was eligible for search", () => {
    const r = JSON.parse(readFileSync("data/calibration/calibration-readiness.json", "utf8"));
    expect(r.reconciliation.eligibleForSearch).toBe(0);
    expect(r.reconciliation.frozen).toBe(r.activeParameterCount);
  });

  it("kept both formal holdouts sealed", async () => {
    assertSealDiscipline();
  });

  it("used no holdout fixture in identifiability", async () => {
    const idv2 = JSON.parse(readFileSync(".cache/calibration/identifiability-v2.json", "utf8"));
    const { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } = await import("../data/calibration/sets-v3.mjs");
    const sealed = [...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id)];
    for (const fx of idv2.fixtures) {
      expect(sealed.some((s) => fx.includes(s)), fx).toBe(false);
    }
  });
});
