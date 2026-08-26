import { describe, it, expect, afterEach } from "vitest";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { PARAMETERS, parameterSetHash, valueOf } from "../src/v3/calibration/parameters.js";
import { auditWiring } from "../scripts/calibration/wiring-audit.mjs";
import { ARCHETYPES } from "../scripts/calibration/side-symmetry.mjs";
import { buildMatrix } from "../scripts/calibration/support-matrix.mjs";

const A = ARCHETYPES.SHOOTING_2010s;
const B = ARCHETYPES.INTERIOR_2010s;
const score = (seed) => {
  const g = runPossessionGame(buildPossessionInput({
    goldIds: A, blueIds: B, coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau",
    eraStyleId: "2010s", simulationSeed: seed,
  }), { includeLedger: false });
  return `${g.finalScore.gold}-${g.finalScore.blue}`;
};

afterEach(() => { for (const p of PARAMETERS) p.currentValue = p.defaultValue; });

describe("parameter wiring", () => {
  // These tests record a FAILURE STATE that Phase 6C2C2 found and did not fix:
  // no registered parameter reaches the engine. They are written so that they
  // start failing the moment wiring lands, which is the signal to re-run the
  // identifiability analysis and update parameter-identifiability.md.
  //
  // Do not "fix" these by deleting them. Invert them.

  it("has 53 registered parameters", () => {
    expect(PARAMETERS).toHaveLength(53);
  });

  it("CURRENTLY UNWIRED: moving every parameter to its maximum changes no result", () => {
    const before = [1, 2, 3, 4, 5].map(score);
    const hashBefore = parameterSetHash();

    for (const p of PARAMETERS) p.currentValue = p.max;
    expect(parameterSetHash(), "the hash must at least notice the change").not.toBe(hashBefore);
    expect(valueOf("opportunity.saturation.strength")).toBe(
      PARAMETERS.find((p) => p.id === "opportunity.saturation.strength").max);

    const after = [1, 2, 3, 4, 5].map(score);
    expect(after, [
      "Parameters now reach the engine — results changed when they moved.",
      "That is the GOAL, not a regression. Next steps:",
      "  1. invert this test to assert results DO change,",
      "  2. re-run npm run calibration:wiring-audit,",
      "  3. re-run the identifiability analysis, which is now answerable,",
      "  4. update docs/simulation-v3/parameter-identifiability.md.",
    ].join("\n")).toEqual(before);
  });

  it("CURRENTLY UNWIRED: nothing outside the calibration plane imports the registry", () => {
    const a = auditWiring();
    expect(a.coverage.registryReachableFromEngine, [
      "The engine now imports the parameter registry. Invert this test and",
      "re-run the identifiability analysis.",
    ].join("\n")).toBe(false);
    expect(a.registryImportersOutsideCalibrationPlane).toEqual([]);
    expect(a.valueOfCallersOutsideCalibrationPlane).toEqual([]);
    expect(a.coverage.wired).toBe(0);
    expect(a.coverage.unwired).toBe(53);
  });

  it("restores cleanly, so the audit cannot leak state into other tests", () => {
    const h = parameterSetHash();
    for (const p of PARAMETERS) p.currentValue = p.min;
    expect(parameterSetHash()).not.toBe(h);
    for (const p of PARAMETERS) p.currentValue = p.defaultValue;
    expect(parameterSetHash()).toBe(h);
  });

  it("keeps every parameter inside its declared bounds at defaults", () => {
    for (const p of PARAMETERS) {
      expect(p.defaultValue, `${p.id}`).toBeGreaterThanOrEqual(p.min);
      expect(p.defaultValue, `${p.id}`).toBeLessThanOrEqual(p.max);
      expect(p.prior).toBe(p.defaultValue);
    }
  });

  it("has an empty change history — nothing was tuned in this phase", () => {
    for (const p of PARAMETERS) {
      expect(p.changeHistory, `${p.id} was modified`).toEqual([]);
      expect(p.currentValue, `${p.id} is not at its default`).toBe(p.defaultValue);
    }
  });
});

describe("calibration support matrix", () => {
  const m = buildMatrix();

  it("classifies every registered parameter", () => {
    expect(m.parameters).toHaveLength(53);
    for (const p of m.parameters) {
      expect(Object.keys(m.supportClasses)).toContain(p.support);
      expect(p.reason.length).toBeGreaterThan(20);
    }
  });

  it("reads the registry's declared calibrationSource rather than guessing metric names", () => {
    // An earlier draft inferred support from targetMetrics using an invented
    // vocabulary and mis-bucketed 47 of 53. The declaration is authoritative.
    const declared = new Set(m.parameters.map((p) => p.declaredCalibrationSource));
    expect(declared).toContain("SYNTHETIC_GUARDRAIL");
    expect(declared).toContain("ERA_ENVIRONMENT");
    expect(declared).toContain("STRUCTURAL");
  });

  it("finds exactly one parameter with populated historical numeric support", () => {
    const hist = m.parameters.filter((p) => p.support === "HISTORICAL_NUMERIC_SUPPORT");
    expect(hist).toHaveLength(1);
    expect(hist[0].id).toBe("opportunity.saturation.strength");
  });

  it("treats era-environment targets as unusable while their source is excluded", () => {
    // src/v3/data/eras.js records its environment values as sourced from the
    // publisher classified PROHIBITED_FOR_MODEL_CALIBRATION.
    expect(m.corpusEvidence.eraEnvironmentAuthorized).toBe(false);
    const blocked = m.parameters.filter((p) => p.blockedBySource);
    expect(blocked.length).toBe(14);
    for (const p of blocked) {
      expect(p.support).toBe("UNSUPPORTED");
      expect(p.tunableOnDataGrounds).toBe(false);
    }
  });

  it("freezes everything without usable support", () => {
    for (const p of m.parameters) {
      if (p.support === "UNSUPPORTED" || p.support === "STRUCTURAL_VALIDATION_ONLY") {
        expect(p.tunableOnDataGrounds, `${p.id}`).toBe(false);
      }
    }
    expect(m.coverage.frozenOnDataGrounds).toBe(26);
  });

  it("records that Tier B contributes almost nothing", () => {
    // 2 of 384 Tier B fields are populated, and only FTr is populated anywhere.
    expect(m.corpusEvidence.populatedTierBMetrics).toEqual(["ftr"]);
  });
});

describe("Tier B target completion", () => {
  it("leaves no unjustified missing field", async () => {
    const { readFileSync } = await import("node:fs");
    const tb = JSON.parse(readFileSync("data/calibration/historical-targets-tier-b.json", "utf8"));
    expect(tb.coverage.unjustifiedMissing).toBe(0);
    expect(tb.coverage.totalFields).toBe(384);
  });

  it("never substitutes zero for a missing value", async () => {
    const { readFileSync } = await import("node:fs");
    const tb = JSON.parse(readFileSync("data/calibration/historical-targets-tier-b.json", "utf8"));
    for (const r of tb.records) {
      for (const [m, f] of Object.entries(r.tierB)) {
        if (f.availability !== "RECORDED_STATISTIC") {
          expect(f.value, `${r.fixtureId}.${m} must be null, not ${f.value}`).toBeNull();
          expect(f.reason, `${r.fixtureId}.${m} needs a reason`).toBeTruthy();
        }
      }
    }
  });

  it("marks pre-1974 turnover and rebound metrics permanently unavailable", async () => {
    const { readFileSync } = await import("node:fs");
    const tb = JSON.parse(readFileSync("data/calibration/historical-targets-tier-b.json", "utf8"));
    const early = tb.records.filter((r) => r.seasonStartYear < 1973);
    expect(early.length).toBeGreaterThan(0);
    for (const r of early) {
      expect(r.tierB.tovPct.availability).toBe("NOT_RECORDED_IN_ERA");
      expect(r.tierB.tovPct.permanent).toBe(true);
      expect(r.tierB.orbPct.availability).toBe("NOT_RECORDED_IN_ERA");
    }
  });

  it("marks 3PAr not applicable rather than missing before the three-point line", async () => {
    const { readFileSync } = await import("node:fs");
    const tb = JSON.parse(readFileSync("data/calibration/historical-targets-tier-b.json", "utf8"));
    for (const r of tb.records.filter((x) => x.seasonStartYear < 1979)) {
      expect(r.tierB.threePar.availability).toBe("NOT_APPLICABLE");
    }
  });

  it("enriched the holdout blind, without simulating it", async () => {
    const { readFileSync } = await import("node:fs");
    const tb = JSON.parse(readFileSync("data/calibration/historical-targets-tier-b.json", "utf8"));
    const holdout = tb.records.filter((r) => r.set === "historical-holdout-v3");
    expect(holdout).toHaveLength(8);
    for (const r of holdout) expect(r.enrichmentMode).toBe("BLIND_SOURCE_ONLY");

    const { allSealStatuses } = await import("../src/v3/calibration/holdoutSeal.js");
    for (const [id, v] of Object.entries(allSealStatuses())) {
      expect(v.accessCount, `${id} was accessed during Tier B enrichment`).toBe(0);
    }
  });

  it("declares the inputs each formula consumes, so a derivation is checkable", async () => {
    const { FORMULAS } = await import("../scripts/calibration/build-tier-b.mjs");
    for (const [m, f] of Object.entries(FORMULAS)) {
      expect(f.formula, m).toBeTruthy();
      expect(f.inputs.length, m).toBeGreaterThan(0);
    }
    // TS% must record that its 0.44 coefficient is an estimator, not a measurement.
    expect(FORMULAS.tsPct.note).toMatch(/estimator/i);
  });
});
