import { describe, it, expect, afterEach } from "vitest";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { PARAMETERS, parameterSetHash, valueOf } from "../src/v3/calibration/parameters.js";
import { compileRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { auditWiring } from "../scripts/calibration/wiring-audit.mjs";
import { ARCHETYPES } from "../scripts/calibration/side-symmetry.mjs";
import { buildMatrix } from "../scripts/calibration/support-matrix.mjs";

const A = ARCHETYPES.SHOOTING_2010s;
const B = ARCHETYPES.INTERIOR_2010s;
const score = (seed, parameterSet = null) => {
  const g = runPossessionGame(buildPossessionInput({
    parameterSet,
    goldIds: A, blueIds: B, coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau",
    eraStyleId: "2010s", simulationSeed: seed,
  }), { includeLedger: false });
  return `${g.finalScore.gold}-${g.finalScore.blue}`;
};

describe("parameter wiring", () => {
  // Phase 6C2C2 wrote these tests to FAIL once wiring landed, with instructions
  // in the failure message to invert them. Phase 6C2C3 wired the registry, so
  // they are inverted here. The history matters: the assertions now say the
  // opposite of what they said, and that is the point.

  it("registers 55 entries, 53 of them active runtime tunables", () => {
    // Was 53 flat. Phase 6C2C3 split two coach entries into four and
    // reclassified two zone entries as derived.
    expect(PARAMETERS).toHaveLength(55);
    expect(activeParameters()).toHaveLength(53);
  });

  it("WIRED: moving a parameter through the compiled set changes results", () => {
    // The old version of this test mutated p.currentValue and asserted results
    // did NOT change. It passed for the wrong reason even after wiring, because
    // the runtime reads a compiled set rather than the registry's mutable field.
    // Overrides are the real mechanism, so the test uses them.
    const base = [1, 2, 3, 4, 5].map((s) => score(s));
    const moved = compileRuntimeParameterSet({
      overrides: { "opportunity.saturation.strength": 2.5, "conversion.rimBonus": 0.28 },
      label: "wiring-proof",
    });
    const after = [1, 2, 3, 4, 5].map((s) => score(s, moved));
    expect(moved.parameterSetHash).not.toBe(compileRuntimeParameterSet().parameterSetHash);
    expect(after, "a compiled override must reach the engine").not.toEqual(base);
  });

  it("WIRED: the engine imports the registry through the runtime binding", () => {
    const a = auditWiring();
    expect(a.coverage.registryReachableFromEngine).toBe(true);
    expect(a.registryImportersOutsideCalibrationPlane.length).toBeGreaterThan(0);
  });

  it("mutating the registry in place is impossible", () => {
    // The pre-wiring trap: currentValue looked like it should change the engine
    // and did not. Freezing removes the trap rather than documenting it.
    expect(PARAMETERS.every(Object.isFrozen)).toBe(true);
    expect(() => { PARAMETERS[0].currentValue = 999; }).toThrow(TypeError);
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

  it("records why each corrected default moved, and that it was not tuning", () => {
    const corrected = PARAMETERS.filter((p) => p.correctedFrom);
    expect(corrected.length).toBe(5);
    for (const p of corrected) {
      expect(p.correctionReason.length).toBeGreaterThan(60);
      // A correction aligns the registry with what the engine already ran. If a
      // corrected default equalled the old declared value it would not be a
      // correction at all.
      expect(p.defaultValue).not.toBe(p.correctedFrom.value);
    }
  });
});

describe("calibration support matrix", () => {
  const m = buildMatrix();

  it("classifies every registered parameter", () => {
    expect(m.parameters).toHaveLength(53);
    // Derived entries are reported but not given a support class they cannot use.
    expect(m.nonActiveEntries).toHaveLength(2);
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
    // Was 14 in Phase 6C2C2. Phase 6C2C3 reclassified zone.selectionFrequency
    // as DERIVED_PARAMETER — it has no 1:1 runtime coefficient — so it left the
    // active set and is no longer counted here.
    expect(blocked.length).toBe(13);
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
    // Still 26, but the COMPOSITION changed: Phase 6C2C2 had 12 structural + 14
    // unsupported; Phase 6C2C3 has 13 + 13, because zone.selectionFrequency left
    // the active set as derived and the coach-adjustment split added structural
    // entries. The total coinciding is arithmetic, not significance.
    expect(m.coverage.frozenOnDataGrounds).toBe(26);
    expect(m.coverage.byClass.STRUCTURAL_VALIDATION_ONLY).toBe(13);
    expect(m.coverage.byClass.UNSUPPORTED).toBe(13);
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
