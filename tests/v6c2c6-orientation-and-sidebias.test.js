import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { verifyArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
import { estimateWinProbability, complement, canonicalPair, canonicalMatchupFingerprint } from "../src/v3/calibration/monteCarloProbability.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { SYNTHETIC_DEVELOPMENT_V2, HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../data/calibration/sets-v3.mjs";
import { MARGINS } from "../src/v3/calibration/sideBiasPolicy.js";
import { VISIBILITY_CLASSES, DIRECTION_CLAIMS } from "../scripts/calibration/c6-visibility.mjs";
import { activeParameters, defaultRuntimeParameterSet } from "../src/v3/calibration/runtimeParameters.js";

const C6 = (n) => JSON.parse(readFileSync(`data/calibration/c6/${n}.json`, "utf8"));
const T = (x) => ({ teamId: x.id, playerIds: x.five, coachId: x.coach });
const dev = (id) => SYNTHETIC_DEVELOPMENT_V2.find((d) => d.id === id);

describe("prior failing cell", () => {
  it("was read from the artifact, not inferred", () => {
    const d = C6("prior-failing-cell").data;
    // The v1 artifact's reported maximum must be this cell's value.
    const v1 = JSON.parse(readFileSync(".cache/calibration/probability-validation-v3.json", "utf8"));
    expect(Math.abs(d.v1PointEstimate)).toBeCloseTo(0.0781, 4);
    expect(d.v1Threshold).toBe(0.05);
    expect(d.v1GateResult).toBe("FAIL");
    expect(v1.thresholds.maxSideBiasDifference).toBe(0.05);
  });

  it("records the exact identity, rosters and coaches", () => {
    const d = C6("prior-failing-cell").data;
    expect(d.cellId).toBe("sd2-balanced-lower-ovr vs sd2-movement-shooters");
    expect(d.teamA.five).toHaveLength(5);
    expect(d.teamB.five).toHaveLength(5);
    expect(d.teamA.coach).toBeTruthy();
    expect(d.eraStyleId).toBe("2010s");
    expect(d.parameterSetHash).toBeTruthy();
  });

  it("proves the v1 statistic was HALF the paired effect", () => {
    const d = C6("prior-failing-cell").data;
    expect(d.scaleVerified).toBe(true);
    expect(d.correctedPairedEffect).toBeCloseTo(2 * d.v1PointEstimate, 6);
    expect(d.scaleRelationship).toMatch(/correctedPairedEffect \/ 2/);
  });

  it("verifies the scale relationship live, not just from the artifact", () => {
    const e = estimateWinProbability({ teamA: T(dev("sd2-balanced-lower-ovr")), teamB: T(dev("sd2-movement-shooters")),
      eraStyleId: "2010s", sampleTier: "STANDARD", buildInput: buildPossessionInput, cache: false });
    // pairedEffect and difference are rounded to 4 decimals separately, so
    // 2x(rounded half) can differ from the rounded whole by up to 1e-4.
    expect(Math.abs(e.sideBias.pairedEffect - 2 * e.sideBias.difference)).toBeLessThanOrEqual(1.0000001e-4);
    expect(e.sideBias.differenceScale).toBe("HALF_OF_PAIRED_EFFECT");
  });
});

describe("harness defects found and fixed", () => {
  it("complement now relabels its perspective", () => {
    const A = T(dev("sd2-balanced-lower-ovr")); const B = T(dev("sd2-movement-shooters"));
    const e = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
    const c = complement(e);
    expect(e.counterpartTeamId).toBeTruthy();
    expect(c.perspectiveTeamId).toBe(e.counterpartTeamId);
    expect(c.counterpartTeamId).toBe(e.perspectiveTeamId);
    expect(c.perspectiveTeamId).not.toBe(e.perspectiveTeamId);
  });

  it("applies the complement exactly once", () => {
    const A = T(dev("sd2-balanced-lower-ovr")); const B = T(dev("sd2-movement-shooters"));
    const ab = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
    const ba = estimateWinProbability({ teamA: B, teamB: A, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
    expect(ab.goldWinProbability + ba.goldWinProbability).toBeCloseTo(1, 9);
  });

  it("keeps side bias perspective-independent under reversal", () => {
    const A = T(dev("sd2-balanced-lower-ovr")); const B = T(dev("sd2-movement-shooters"));
    const ab = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
    const ba = estimateWinProbability({ teamA: B, teamB: A, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
    expect(ab.sideBias.difference).toBe(ba.sideBias.difference);
    expect(ab.sideBias.pairedEffect).toBe(ba.sideBias.pairedEffect);
  });

  it("canonicalises both request orders to one matchup", () => {
    const A = T(dev("sd2-balanced-lower-ovr")); const B = T(dev("sd2-movement-shooters"));
    expect(canonicalMatchupFingerprint({ teamA: A, teamB: B, eraStyleId: "2010s" }))
      .toBe(canonicalMatchupFingerprint({ teamA: B, teamB: A, eraStyleId: "2010s" }));
    expect(canonicalPair(A, B).reversed).toBe(!canonicalPair(B, A).reversed);
  });

  it("reports the paired standard error, not a single-proportion one", () => {
    const e = estimateWinProbability({ teamA: T(dev("sd2-balanced-lower-ovr")), teamB: T(dev("sd2-movement-shooters")),
      eraStyleId: "2010s", sampleTier: "STANDARD", buildInput: buildPossessionInput, cache: false });
    expect(e.sideBias.pairedStandardError).toBeGreaterThan(0);
    expect(e.sideBias.discordantPairs).toBeGreaterThan(0);
    expect(e.sideBias.pairs).toBe(e.sampleCount / 2);
    // sd(D) must be BELOW the independence value: the orientations share a seed.
    expect(e.sideBias.pairedSd).toBeLessThan(Math.sqrt(0.5));
  });

  it("no longer gates side bias inside the reliability suite", async () => {
    const { evaluateGate } = await import("../src/v3/calibration/probabilityValidation.js");
    const g = evaluateGate({
      outcomeScale: { monteCarloBrier: 0.22, constantBaselineBrier: 0.25, irreducibleFloorBrier: 0.219, fractionOfAchievableSkill: 0.94 },
      expectedCalibrationError: 0.01, sharpness: 0.18,
      sideBias: { systematic: false, gatedBy: "policy-v2", gatedHere: false },
    });
    expect(g.sideBiasPerCellWithinTolerance).toBeUndefined();
    expect(g.sideBiasGateDelegatedToPolicyV2).toBe(true);
    expect(g.sideBiasNotSystematic).toBe(true);
  });
});

describe("orientation audit", () => {
  it("verifies as an artifact and separates the three questions", () => {
    expect(verifyArtifact("probability-orientation-audit", ARTIFACT_DIR_C6).valid).toBe(true);
    const d = C6("probability-orientation-audit").data;
    expect(Object.keys(d.threeQuestionsSeparated)).toEqual(
      expect.arrayContaining(["actualGameAggregateSymmetry", "probabilityEstimatorOrientationSymmetry", "localCellAnomaly", "notInterchangeable"]));
  });

  it("ran at least twelve semantic checks", () => {
    const d = C6("probability-orientation-audit").data;
    expect(d.semanticChecks.length).toBeGreaterThanOrEqual(12);
    expect(d.checksPassed + d.checksFailed).toBe(d.semanticChecks.length);
  });

  it("records the defects it found without claiming they changed a number", () => {
    const d = C6("probability-orientation-audit").data;
    expect(d.harnessDefectsFound.length).toBeGreaterThan(0);
    expect(d.harnessDefectsAffectReportedNumbers).toBe(false);
    expect(d.harnessDefectNote).toMatch(/None of the three changes a probability/);
  });

  it("establishes the actual-game control as equivalent on fresh seeds", () => {
    const d = C6("probability-orientation-audit").data;
    expect(d.actualGameControlEquivalent).toBe(true);
    expect(d.actualGameControl.games).toBeGreaterThanOrEqual(10000);
    const w = d.actualGameControl.winEffect;
    expect(w.waldInterval.lower).toBeGreaterThan(-MARGINS.perCell);
    expect(w.waldInterval.upper).toBeLessThan(MARGINS.perCell);
    expect(w.bootstrapInterval.lower).toBeGreaterThan(-MARGINS.perCell);
    expect(w.bootstrapInterval.upper).toBeLessThan(MARGINS.perCell);
    expect(d.actualGameControl.invariantViolations).toBe(0);
    expect(d.actualGameControl.ties).toBe(0);
  });

  it("classifies the v1 failure as sampling noise and does not block the lock", () => {
    const d = C6("probability-orientation-audit").data;
    expect(d.classification).toBe("SAMPLING_NOISE");
    expect(d.blocksLock).toBe(false);
  });

  it("distinguishes a realization difference from a bias for roster order", () => {
    const o = C6("probability-orientation-audit").data.rosterOrderIndependence;
    // teamIntelligence PROMISES order-independence, and delivers it exactly.
    expect(o.teamIntelligenceByteIdentical).toBe(true);
    // Individual games differ, but the distribution does not.
    expect(o.differingIndividualResults).toBeGreaterThan(0);
    expect(o.distributionEquivalentWithinMargin).toBe(true);
    expect(o.finding).toBe("REALIZATION_DIFFERENCE_NOT_BIAS");
  });

  it("used reserved, non-overlapping seed index blocks", () => {
    const b = C6("probability-orientation-audit").data.indexBlocks;
    const ranges = Object.values(b).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1]);
  });
});

describe("side-bias validation v2", () => {
  it("verifies as an artifact", () => {
    expect(verifyArtifact("probability-side-bias-validation-v2", ARTIFACT_DIR_C6).valid).toBe(true);
  });

  it("ran under the policy that was frozen before it", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.policyFrozenBeforeThisRun).toBe(true);
    expect(d.policyHash).toBe(C6("probability-side-bias-policy-v2").data.policyHash);
  });

  it("classifies every cell and reconciles to the family size", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.reconciliation.reconciles).toBe(true);
    expect(Object.values(d.classificationCounts).reduce((a, b) => a + b, 0)).toBe(d.familySize);
    expect(d.cells.length).toBe(d.familySize);
  });

  it("leaves no cell materially biased or inconclusive", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.classificationCounts.MATERIALLY_BIASED ?? 0).toBe(0);
    expect(d.classificationCounts.INCONCLUSIVE ?? 0).toBe(0);
    expect(d.gates.everyCellEquivalent).toBe(true);
  });

  it("keeps the aggregate inside the tighter aggregate margin", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.aggregateMargin).toBe(0.01);
    expect(d.aggregate.pooledWald.lower).toBeGreaterThan(-d.aggregateMargin);
    expect(d.aggregate.pooledWald.upper).toBeLessThan(d.aggregateMargin);
    expect(d.aggregate.withinAggregateMargin).toBe(true);
  });

  it("finds no systematic stratum in any dimension", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.systematicStrata).toEqual([]);
    for (const dim of ["byEra", "byKind", "byCoach", "byPerspectiveTeam"]) {
      expect(Object.keys(d.strata[dim]).length).toBeGreaterThan(0);
    }
  });

  it("preserves every stage of every cell, discarding none", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    for (const c of d.cells) {
      expect(c.stages.length).toBeGreaterThanOrEqual(1);
      // Cumulative: pair counts strictly increase and never reset.
      for (let i = 1; i < c.stages.length; i++) {
        expect(c.stages[i].cumulativePairs).toBeGreaterThan(c.stages[i - 1].cumulativePairs);
      }
      // The final recorded stage is the one the classification came from.
      expect(c.stages[c.stages.length - 1].stage).toBe(c.stageReached);
    }
  });

  it("resolves the previously failing cell as equivalent on fresh seeds", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    const t = d.cells.find((c) => c.id === "pair:sd2-balanced-lower-ovr|sd2-movement-shooters");
    expect(t).toBeTruthy();
    expect(t.finalClassification).toBe("EQUIVALENT");
    expect(t.finalPairs).toBeGreaterThanOrEqual(4096);
    expect(Math.abs(t.stages[t.stages.length - 1].delta)).toBeLessThan(MARGINS.perCell);
  });

  it("finds every mirror cell equivalent — the purest side probe", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    const mirrors = d.cells.filter((c) => c.kind === "MIRROR");
    expect(mirrors.length).toBeGreaterThan(0);
    for (const m of mirrors) expect(m.finalClassification).toBe("EQUIVALENT");
  });

  it("records zero invariant violations and zero ties", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.invariantViolations).toBe(0);
    expect(d.ties).toBe(0);
  });

  it("touches no sealed holdout fixture", () => {
    const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
    for (const c of C6("probability-side-bias-validation-v2").data.cells) {
      expect(sealed.has(c.teamA)).toBe(false);
      expect(sealed.has(c.teamB)).toBe(false);
    }
  });

  it("applied a simultaneous alpha reflecting the whole family", () => {
    const d = C6("probability-side-bias-validation-v2").data;
    expect(d.simultaneousAlpha).toBeCloseTo(0.05 / d.familySize, 5);
  });
});

describe("objective-visibility resolution", () => {
  it("verifies and reads its parameter ids from the artifact", () => {
    expect(verifyArtifact("objective-visibility-resolution", ARTIFACT_DIR_C6).valid).toBe(true);
    const d = C6("objective-visibility-resolution").data;
    const blind = JSON.parse(readFileSync("data/calibration/c5/candidate-history.json", "utf8")).data.adjudicability.blindParameters;
    expect(d.parametersReadFromArtifact).toEqual(blind);
    expect(d.sourceOfParameterIds).toMatch(/candidate-history\.json/);
  });

  it("declares a direction claim for every resolved parameter", () => {
    const d = C6("objective-visibility-resolution").data;
    for (const r of d.resolved) expect(DIRECTION_CLAIMS[r.id]).toBeTruthy();
  });

  it("confirms each mechanic responds in its predeclared direction", () => {
    for (const r of C6("objective-visibility-resolution").data.resolved) {
      expect(r.conditionalMechanicalTarget.predeclared).toBe(true);
      expect(r.conditionalMechanicalTarget.directionConfirmed).toBe(true);
      expect(r.conditionalMechanicalTarget.guardrailBreaches).toEqual([]);
      expect(r.conditionalMechanicalTarget.primary.directionConsistentWithClaim).toBe(true);
    }
  });

  it("refuses to claim a magnitude from a direction", () => {
    for (const r of C6("objective-visibility-resolution").data.resolved) {
      expect(r.conditionalMechanicalTarget.whatThisDoesNotEstablish).toMatch(/magnitude/i);
      expect(r.conditionalMechanicalTarget.whatThisDoesNotEstablish).toMatch(/not because it was shown to be best/);
    }
  });

  it("freezes every affected parameter at its registry default", () => {
    const d = C6("objective-visibility-resolution").data;
    for (const r of d.resolved) {
      expect(r.valueEqualsDefault).toBe(true);
      expect(r.candidateValue).toBe(r.defaultValue);
      expect(r.finalLockClassification).toBe("DEFAULT_FROZEN_UNADJUDICATED");
    }
    expect(d.allValuesAtRegistryDefault).toBe(true);
    expect(d.drift).toEqual([]);
  });

  it("ran no parameter search", () => {
    const d = C6("objective-visibility-resolution").data;
    expect(d.noParameterSearchPerformed).toBe(true);
    expect(d.noParameterSearchNote).toMatch(/No value was scored against an objective, ranked, or selected/);
  });

  it("reconciles readiness to the active parameter count", () => {
    const d = C6("objective-visibility-resolution").data;
    expect(d.readinessReconciliation.reconciles).toBe(true);
    expect(Object.values(d.readinessV4).reduce((a, b) => a + b, 0)).toBe(activeParameters().length);
    expect(d.readinessV4.DEFAULT_FROZEN_UNADJUDICATED).toBe(d.resolved.length);
  });

  it("uses only the declared visibility classes", () => {
    for (const r of C6("objective-visibility-resolution").data.resolved) {
      expect(VISIBILITY_CLASSES).toContain(r.visibilityClass);
    }
  });

  it("explains why the prior readiness class was wrong", () => {
    for (const r of C6("objective-visibility-resolution").data.resolved) {
      expect(r.priorReadinessV3).toBeTruthy();
      expect(r.reclassificationReason).toMatch(/cannot see the parameter/);
    }
  });
});

describe("candidate parameter identity is untouched by this phase", () => {
  it("every active parameter still holds its registry default", () => {
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
    expect(def.status).toBe("UNCALIBRATED_DEFAULTS");
  });
});
