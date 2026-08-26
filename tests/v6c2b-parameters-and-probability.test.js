import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PARAMETERS, parameter, valueOf, duplicateIds, outOfBounds, modules, byModule,
  parameterSetHash, snapshot, FIXED_NOT_CALIBRATABLE,
} from "../src/v3/calibration/parameters.js";
import {
  objective, componentError, regularizationPenalty, evaluateAcceptance,
  ACCEPTANCE, COMPONENT_WEIGHTS, CONFIDENCE_WEIGHTS, REGULARIZATION_STRENGTH,
} from "../src/v3/calibration/objective.js";
import { buildFolds, splits, splitOverlaps, foldViability } from "../src/v3/calibration/folds.js";
import {
  winProbability, predictionFrom, reliabilityBins, brierScore, logLoss, sharpness,
  upsetRate, calibrationError, detectClamp, report, monotonicity,
  EXPECTATION_PREDICTIVE_FIT, MARGIN_SD,
} from "../src/v3/calibration/probability.js";
import { loadCorpusV2, historicalCalibrationV2Ids } from "../data/calibration/sets-v2.mjs";
import { loadTargets, gateResult, coverageReport } from "../scripts/calibration/build-targets-v2.mjs";
import { versionOf } from "../src/versions.js";

describe("parameter registry", () => {
  it("registers parameters with complete metadata", () => {
    expect(PARAMETERS.length).toBeGreaterThan(30);
    for (const p of PARAMETERS) {
      expect(p.id, "a parameter without an id cannot be traced").toBeTruthy();
      expect(p.module).toBeTruthy();
      expect(p.description.length, `${p.id} has no usable description`).toBeGreaterThan(20);
      expect(Number.isFinite(p.currentValue), p.id).toBe(true);
      expect(p.min).toBeLessThan(p.max);
      expect(p.targetMetrics.length, `${p.id} tunes toward nothing`).toBeGreaterThan(0);
      expect(p.calibrationSource, `${p.id} has no calibration source`).toBeTruthy();
      expect(Array.isArray(p.changeHistory)).toBe(true);
    }
  });

  it("has no duplicate ids and nothing out of bounds", () => {
    expect(duplicateIds()).toEqual([]);
    expect(outOfBounds()).toEqual([]);
  });

  it("starts every parameter at its default, so regularization is zero", () => {
    // Nothing has been tuned in this phase. A non-zero penalty here would mean
    // a value moved without a recorded change.
    for (const p of PARAMETERS) expect(p.currentValue, `${p.id} has drifted from its default`).toBe(p.defaultValue);
    expect(regularizationPenalty().penalty).toBe(0);
  });

  it("throws on an unknown id rather than returning a default", () => {
    expect(() => parameter("not.a.parameter")).toThrow(/unknown id/);
    expect(valueOf("opportunity.saturation.strength")).toBe(1.35);
  });

  it("covers the domains this phase identified", () => {
    const m = modules();
    for (const required of ["opportunityAllocation", "possessionContext", "possessionGame", "zoneResolution", "coachIntelligence", "coachAdjustment"]) {
      expect(m, `${required} has no registered parameters`).toContain(required);
    }
    const ids = PARAMETERS.map((p) => p.id).join(" ");
    // The specific coefficients the register named as outstanding.
    expect(ids).toMatch(/saturation\.strength/);
    expect(ids).toMatch(/rimBiasMultiplier/);
    expect(ids).toMatch(/zone\.selectionFrequency/);
    expect(ids).toMatch(/era\.threeAnchorMax/);
  });

  it("distinguishes calibratable coefficients from fixed rule constants", () => {
    // Registering a shot clock would imply evidence could move it. It cannot.
    expect(FIXED_NOT_CALIBRATABLE.length).toBeGreaterThan(3);
    for (const f of FIXED_NOT_CALIBRATABLE) expect(f.why.length).toBeGreaterThan(10);
    const ids = PARAMETERS.map((p) => p.id).join(" ").toLowerCase();
    expect(ids).not.toMatch(/shotclock|regulationperiods|backcourt/);
  });

  it("produces a content-sensitive parameter-set hash", () => {
    const h = parameterSetHash();
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(parameterSetHash()).toBe(h);
    const moved = PARAMETERS.map((p) => (p.id === "opportunity.saturation.strength" ? { ...p, currentValue: 1.4 } : p));
    expect(parameterSetHash(moved), "a changed value must change the set identity").not.toBe(h);
  });

  it("snapshots itself for the report", () => {
    const s = snapshot();
    expect(s.parameterCount).toBe(PARAMETERS.length);
    expect(s.calibrationParameterRegistryVersion).toBe(versionOf("calibrationParameterRegistryVersion"));
  });
});

describe("no hidden tunables", () => {
  // A scan, not a proof. It catches the specific shape this phase created:
  // a coefficient the registry names, sitting as a loose literal somewhere else.
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });

  it("keeps registered mismatch and saturation constants in one place", () => {
    // These were literals in opportunityAllocation before the registry existed.
    // If a second copy appears elsewhere, the two will drift.
    const files = walk("src/v3").filter((f) => !f.includes("/calibration/"));
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // The exact mismatch ladder, duplicated outside the allocator.
      if (/SEVERE:\s*2\.6[\s\S]{0,80}MAJOR:\s*2\.0/.test(src) && !f.endsWith("opportunityAllocation.js")) offenders.push(f);
    }
    expect(offenders, `duplicated tunable ladder in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("declares every registered id exactly once", () => {
    const ids = PARAMETERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("calibration objective", () => {
  const row = (metric, confidence, z, available = true) => ({ metric, fixtureId: "f", confidence, standardizedError: z, available });

  it("retains every component instead of collapsing to one score", () => {
    const o = objective({ components: { teamEfficiency: [row("pace", "HIGH", 1)], shotProfile: [row("rimShare", "HIGH", 2)] } });
    expect(o.components).toHaveLength(2);
    for (const c of o.components) expect(c.weightedError).not.toBeNull();
    expect(o.note).toMatch(/single scalar cannot say which metric failed/);
  });

  it("returns null, never zero, when nothing can be measured", () => {
    // A zero objective from an empty corpus is the most dangerous number this
    // module could emit: it reads as perfect.
    const o = objective({ components: { teamEfficiency: [], shotProfile: [] } });
    expect(o.scalar).toBeNull();
    expect(o.fitError).toBeNull();
    expect(o.componentsWithoutTargets).toEqual(["teamEfficiency", "shotProfile"]);
    for (const c of o.components) expect(c.note).toMatch(/not a zero error/);
  });

  it("weights by confidence without letting low confidence excuse a miss", () => {
    const hi = componentError("x", [row("m", "HIGH", 2)]);
    const lo = componentError("x", [row("m", "LOW", 2)]);
    // Same error, same magnitude — confidence changes the WEIGHT in the rollup,
    // never the error itself.
    expect(hi.weightedError).toBe(lo.weightedError);
    expect(CONFIDENCE_WEIGHTS.HIGH).toBeGreaterThan(CONFIDENCE_WEIGHTS.LOW);
    expect(CONFIDENCE_WEIGHTS.SOURCE_BLOCKED, "a blocked target must not count at all").toBe(0);
  });

  it("excludes source-blocked targets entirely", () => {
    const c = componentError("x", [row("m", "SOURCE_BLOCKED", 5)]);
    expect(c.n).toBe(0);
    expect(c.weightedError).toBeNull();
  });

  it("weights shot profile above team efficiency", () => {
    // Efficiency is downstream of the shot mix, so fitting it first would fit a
    // symptom.
    expect(COMPONENT_WEIGHTS.shotProfile).toBeGreaterThan(COMPONENT_WEIGHTS.teamEfficiency);
  });

  it("penalises drift from the prior", () => {
    const moved = PARAMETERS.map((p) => (p.id === "opportunity.saturation.strength" ? { ...p, currentValue: p.max } : p));
    const r = regularizationPenalty(moved);
    expect(r.penalty).toBeGreaterThan(0);
    expect(r.terms[0].id).toBe("opportunity.saturation.strength");
    expect(REGULARIZATION_STRENGTH.HIGH).toBeGreaterThan(REGULARIZATION_STRENGTH.LOW);
  });

  it("reports which components had no targets at all", () => {
    const o = objective({ components: { teamEfficiency: [row("pace", "HIGH", 1)], probability: [] } });
    expect(o.componentsWithoutTargets).toContain("probability");
    expect(o.coverage).toBeLessThan(1);
  });
});

describe("acceptance policy", () => {
  const obj = (fit) => ({ fitError: fit });

  it("refuses a change that does not improve calibration", () => {
    const r = evaluateAcceptance({ before: obj(0.5), after: obj(0.6) });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/did not improve/);
  });

  it("refuses the overfitting signature: tuning improves while validation worsens", () => {
    const r = evaluateAcceptance({
      before: obj(0.5), after: obj(0.3),
      validationBefore: obj(0.5), validationAfter: obj(0.62),
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/overfitting/);
  });

  it("refuses a change that breaks an invariant or a guardrail", () => {
    expect(evaluateAcceptance({ before: obj(0.5), after: obj(0.4), invariantFailures: 1 }).accepted).toBe(false);
    expect(evaluateAcceptance({ before: obj(0.5), after: obj(0.4), guardrailFailures: ["non-shooter takes threes"] }).accepted).toBe(false);
  });

  it("refuses a parameter that leaps most of its range in one step", () => {
    const r = evaluateAcceptance({ before: obj(0.5), after: obj(0.4), parameterDrift: [{ id: "x", fraction: 0.8 }] });
    expect(r.accepted).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/fitting noise/);
  });

  it("accepts a clean improvement", () => {
    const r = evaluateAcceptance({
      before: obj(0.5), after: obj(0.4), validationBefore: obj(0.5), validationAfter: obj(0.49),
      invariantFailures: 0, guardrailFailures: [], outOfBoundsParams: [], parameterDrift: [{ id: "x", fraction: 0.1 }],
    });
    expect(r.accepted).toBe(true);
  });

  it("forbids holdout-informed changes by policy", () => {
    expect(ACCEPTANCE.forbidHoldoutInformedChanges).toBe(true);
    expect(ACCEPTANCE.requireZeroInvariantFailures).toBe(true);
  });
});

describe("internal validation folds", () => {
  const corpus = loadCorpusV2();
  const calIds = new Set(historicalCalibrationV2Ids());
  const fixtures = corpus.fixtures.filter((f) => calIds.has(f.fixtureId));

  it("is deterministic and era-stratified", () => {
    const a = buildFolds(fixtures, { k: 3 });
    const b = buildFolds(fixtures, { k: 3 });
    expect(a.hash).toBe(b.hash);
    expect(a.folds).toHaveLength(3);
    expect(a.folds.flatMap((f) => f.fixtureIds).sort()).toEqual(fixtures.map((f) => f.fixtureId).sort());
  });

  it("never puts a fixture in both halves of a split", () => {
    const fs = buildFolds(fixtures, { k: 3 });
    expect(splitOverlaps(fs)).toEqual([]);
    for (const s of splits(fs)) {
      expect(s.validationIds.length + s.tuningIds.length).toBe(fixtures.length);
    }
  });

  it("reports honestly that this corpus cannot support cross-validation", () => {
    // With a fold of one fixture, a validation error is one team and moves on
    // noise. Saying so beats producing a number nobody should believe.
    const v = foldViability(buildFolds(fixtures, { k: 3 }));
    expect(v.viable).toBe(false);
    expect(v.smallestFold).toBeLessThan(3);
    expect(v.note).toMatch(/corpus limitation, not a tuning result/);
  });
});

describe("historical target gate", () => {
  const store = loadTargets();

  it("built targets for every corpus v2 fixture", () => {
    expect(store).toBeTruthy();
    expect(store.records).toHaveLength(loadCorpusV2().fixtures.length);
    expect(store.targetDataVersion).toBe(versionOf("historicalTargetDataVersion"));
  });

  it("used no prohibited source", () => {
    const br = store.prohibitedSources.find((s) => /Sports Reference|basketball-reference/i.test(s.name));
    expect(br.status).toBe("PROHIBITED_FOR_MODEL_CALIBRATION");
    expect(br.used, "a prohibited source was used").toBe(false);
    for (const s of store.authorizedSources) expect(s.license).toBeTruthy();
    const raw = JSON.stringify(store);
    expect(raw).not.toMatch(/basketball-reference\.com\/leagues/);
  });

  it("gives every populated value provenance and every absence a reason", () => {
    for (const r of store.records) {
      for (const [m, e] of Object.entries(r.teamTargets)) {
        if (e.value != null) {
          expect(e.provenance?.sourceUrl, `${r.fixtureId}.${m}`).toBeTruthy();
          expect(e.provenance.licenseNote).toMatch(/CC BY-SA/);
        } else {
          expect(e.value).toBeNull();
          expect(e.availability, `${r.fixtureId}.${m} has no reason`).toBeTruthy();
        }
      }
    }
  });

  it("reports the Part 18 tuning gate as failed, with specific reasons", () => {
    // The corpus cannot support broad tuning, and the gate must say why rather
    // than letting tuning proceed on 7 fixtures from two franchises.
    const g = gateResult(store);
    expect(g.passed).toBe(false);
    expect(g.failures.length).toBeGreaterThanOrEqual(3);
    expect(g.failures.join(" ")).toMatch(/24/);
    expect(g.failures.join(" ")).toMatch(/8 Era Styles/);
    expect(g.failures.join(" ")).toMatch(/franchises/);
  });

  it("records zero Tier B coverage rather than inventing derived values", () => {
    const cov = coverageReport(store);
    expect(cov["historical-calibration"].tierB).toBe(0);
    expect(cov["historical-calibration"].tierA).toBeGreaterThan(0);
    expect(cov["historical-calibration"].tierD).toBeGreaterThan(0);
  });
});

describe("probability model", () => {
  it("computes from the pregame expectation only", () => {
    const wp = winProbability({ expectedOffensiveEfficiencyGold: 110, expectedOffensiveEfficiencyBlue: 100, expectedPace: 100 });
    expect(wp.probability).toBeGreaterThan(0.5);
    expect(wp.expectedMargin).toBeCloseTo(10, 5);
    // A mirror must be exactly even, or the model has a bias no matchup excuses.
    expect(winProbability({ expectedOffensiveEfficiencyGold: 105, expectedOffensiveEfficiencyBlue: 105, expectedPace: 100 }).probability)
      .toBeCloseTo(0.5, 6);
  });

  it("never reads the outcome into the prediction", () => {
    const game = {
      expectation: { expectedOffensiveEfficiencyGold: 110, expectedOffensiveEfficiencyBlue: 100, expectedPace: 100 },
      finalScore: { gold: 80, blue: 120 },
    };
    const a = predictionFrom(game);
    const b = predictionFrom({ ...game, finalScore: { gold: 120, blue: 80 } });
    expect(a.predicted, "the prediction moved with the result").toBe(b.predicted);
    expect(a.won).toBe(false);
    expect(b.won).toBe(true);
  });

  it("carries its own measured unreliability on every prediction", () => {
    // The finding this module exists to surface: the expectation explains ~3.5%
    // of realized margin variance. A consumer must not be able to take the
    // number without seeing what it is worth.
    const wp = winProbability({ expectedOffensiveEfficiencyGold: 110, expectedOffensiveEfficiencyBlue: 100, expectedPace: 100 });
    expect(wp.predictiveFit).toBe("NOT_PREDICTIVE");
    expect(wp.rSquared).toBeLessThan(0.1);
    expect(EXPECTATION_PREDICTIVE_FIT.verdict).toBe("NOT_PREDICTIVE");
    expect(EXPECTATION_PREDICTIVE_FIT.cells).toBeGreaterThanOrEqual(40);
    expect(EXPECTATION_PREDICTIVE_FIT.seedsPerCell).toBeGreaterThanOrEqual(800);
  });

  it("refuses to call itself calibrated", () => {
    const r = report([{ predicted: 0.6, won: true }, { predicted: 0.4, won: false }]);
    expect(r.usable).toBe(false);
    expect(r.note).toMatch(/NOT a calibrated win probability/);
    expect(r.expectationPredictiveFit.rSquared).toBeLessThan(0.1);
  });

  it("scores reliability, and reports sharpness beside it", () => {
    // A model that always says 50% is perfectly calibrated and useless, so the
    // two numbers only mean something together.
    const useless = Array.from({ length: 100 }, (_, i) => ({ predicted: 0.5, won: i < 50 }));
    expect(brierScore(useless)).toBeCloseTo(0.25, 3);
    expect(sharpness(useless)).toBeCloseTo(0, 6);
    const perfect = Array.from({ length: 100 }, (_, i) => ({ predicted: i < 70 ? 1 : 0, won: i < 70 }));
    expect(brierScore(perfect)).toBeCloseTo(0, 6);
    expect(sharpness(perfect)).toBeGreaterThan(0.4);
    expect(logLoss(perfect)).toBeLessThan(1);
    expect(upsetRate([{ predicted: 0.9, won: false }, { predicted: 0.9, won: true }])).toBeCloseTo(0.5, 5);
  });

  it("measures calibration error over filled bins only", () => {
    const bins = reliabilityBins([{ predicted: 0.7, won: true }, { predicted: 0.7, won: true }, { predicted: 0.3, won: false }]);
    expect(calibrationError(bins)).not.toBeNull();
    expect(calibrationError(reliabilityBins([]))).toBeNull();
  });

  it("flags a suspected clamp without claiming one exists", () => {
    const c = detectClamp([{ predicted: 0.45 }, { predicted: 0.55 }]);
    expect(c.suspectedClamp).toBe(true);
    expect(c.note).toMatch(/not proof of a hard clamp/);
    expect(detectClamp([{ predicted: 0.01 }, { predicted: 0.99 }]).suspectedClamp).toBe(false);
  });

  it("detects a non-monotonic strength ladder", () => {
    const good = [{ label: "a", predicted: 0.5, empirical: 0.5 }, { label: "b", predicted: 0.6, empirical: 0.62 }];
    const bad = [{ label: "a", predicted: 0.6, empirical: 0.6 }, { label: "b", predicted: 0.5, empirical: 0.55 }];
    expect(monotonicity(good).monotonic).toBe(true);
    expect(monotonicity(bad).monotonic).toBe(false);
    expect(monotonicity(bad).violations[0].kind).toBe("predicted");
  });

  it("uses a margin spread measured from the engine", () => {
    expect(MARGIN_SD).toBeGreaterThan(15);
    expect(MARGIN_SD).toBeLessThan(22);
  });
});
