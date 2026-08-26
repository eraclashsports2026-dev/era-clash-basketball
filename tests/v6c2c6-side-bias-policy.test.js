import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  POLICY, policyHash, EFFECT, MARGINS, SAMPLE_LADDER, STOPPING, FAMILY_WISE,
  pairedSummary, tost, erf, zFor, twoSidedZTest, waldInterval, bootstrapInterval, holm, classifyCell,
} from "../src/v3/calibration/sideBiasPolicy.js";
import { overlapBetween, DOMAINS, seedSetFor } from "../src/v3/calibration/seedDomains.js";
import { verifyArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";

const C6 = (n) => JSON.parse(readFileSync(`data/calibration/c6/${n}.json`, "utf8"));

// Frozen before results existed. A change here needs a version bump, the old and
// new values recorded, and a justification that does not reference an outcome.
const FROZEN_POLICY_HASH = "51005eccf853e9a609f8e7e2b1b026c89d90794e153c2adee95841fa6f3384a1";

describe("side-bias policy v2 is frozen", () => {
  it("has not changed since it was frozen", () => {
    expect(policyHash(), [
      "The side-bias policy v2 changed.",
      "Allowed only with a version bump, the old and new values recorded, and a",
      "justification that is valid independent of any result.",
    ].join("\n")).toBe(FROZEN_POLICY_HASH);
  });

  it("declares itself frozen before results", () => {
    expect(POLICY.frozenBeforeResults).toBe(true);
    expect(POLICY.phase).toBe("6C2C6");
    expect(C6("probability-side-bias-policy-v2").data.frozenBeforeAnyFreshResult).toBe(true);
  });

  it("preserves the v1 margin rather than moving it to clear 0.0781", () => {
    expect(MARGINS.perCell).toBe(0.05);
    expect(POLICY.supersedes.v1Threshold).toBe(0.05);
    expect(POLICY.supersedes.v1Observation).toBe(0.0781);
    expect(POLICY.supersedes.marginNotMovedInResponse).toBe(true);
    // The margin must not have been set anywhere near the observation.
    expect(MARGINS.perCell).toBeLessThan(POLICY.supersedes.v1Observation);
  });

  it("discloses that the corrected scale makes the gate stricter, not looser", () => {
    expect(EFFECT.supersedesV1Statistic).toMatch(/delta \/ 2/);
    expect(MARGINS.perCellNote).toMatch(/stricter/);
  });

  it("keeps the v1 policy unedited", () => {
    expect(POLICY.supersedes.preservedUnedited).toBe(true);
    // v1's threshold still lives in the untouched probability thresholds.
    const v1 = JSON.parse(readFileSync(".cache/calibration/probability-validation-v3.json", "utf8"));
    expect(v1.thresholds.maxSideBiasDifference).toBe(0.05);
  });

  it("requires a signed perspective for every reported effect", () => {
    expect(EFFECT.perspectiveRule).toMatch(/cannot be signed/);
    expect(EFFECT.positiveMeaning).toMatch(/Gold/);
    expect(EFFECT.negativeMeaning).toMatch(/Blue/);
  });

  it("declares a cumulative ladder that cannot drop a stage", () => {
    expect(SAMPLE_LADDER.stages.map((s) => s.cumulativePairs)).toEqual([256, 1024, 4096, 16384]);
    expect(SAMPLE_LADDER.cumulative).toBe(true);
    expect(STOPPING.forbidden.join(" ")).toMatch(/Discarding an earlier stage/);
    expect(STOPPING.forbidden.join(" ")).toMatch(/point estimate looks favourable/);
  });

  it("treats INCONCLUSIVE as a failure to pass", () => {
    expect(STOPPING.inconclusiveDoesNotPass).toBe(true);
    expect(POLICY.FAILURE_SEMANTICS.INCONCLUSIVE).toMatch(/does NOT pass/i);
    expect(POLICY.BLOCKS_LOCK).toContain("INCONCLUSIVE");
  });

  it("applies family-wise control in both directions", () => {
    expect(FAMILY_WISE.method).toBe("holm-bonferroni");
    expect(FAMILY_WISE.equivalenceDirection).toMatch(/CONSERVATIVE/);
    expect(FAMILY_WISE.detectionDirection).toMatch(/MAXIMUM of 30 point estimates/);
    expect(FAMILY_WISE.bothRequired).toMatch(/Failing to detect a difference is not equivalence/);
  });
});

describe("statistics validated against published values", () => {
  it("erf matches published values", () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(0.5)).toBeCloseTo(0.5205, 4);
    expect(erf(1)).toBeCloseTo(0.8427, 4);
    expect(erf(2)).toBeCloseTo(0.9953, 4);
    expect(erf(-1)).toBeCloseTo(-0.8427, 4);
  });

  it("zFor matches published normal quantiles", () => {
    expect(zFor(0.05)).toBeCloseTo(1.9600, 3);
    expect(zFor(0.10)).toBeCloseTo(1.6449, 3);
    expect(zFor(0.01)).toBeCloseTo(2.5758, 3);
    expect(zFor(0.001)).toBeCloseTo(3.2905, 3);
  });

  // Hand-calculated. D = [1, 1, 0, -1], n = 4.
  //   mean = 1/4 = 0.25
  //   deviations 0.75, 0.75, -0.25, -1.25  -> squares 0.5625, 0.5625, 0.0625, 1.5625
  //   sum 2.75, /(n-1)=3 -> variance 0.916667, sd 0.957427, se sd/2 = 0.478714
  it("pairedSummary matches a hand-calculated fixture", () => {
    const s = pairedSummary([1, 1, 0, -1]);
    expect(s.n).toBe(4);
    expect(s.mean).toBeCloseTo(0.25, 10);
    expect(s.sd).toBeCloseTo(0.957427, 6);
    expect(s.se).toBeCloseTo(0.478714, 6);
    expect(s.discordant).toBe(3);
  });

  it("pairedSummary is exact on an all-zero (mirror) sample", () => {
    const s = pairedSummary(new Array(64).fill(0));
    expect(s.mean).toBe(0);
    expect(s.sd).toBe(0);
    expect(s.se).toBe(0);
    expect(s.discordant).toBe(0);
  });

  it("TOST p is the larger of the two one-sided p-values", () => {
    const r = tost({ mean: 0.02, se: 0.01, margin: 0.05 });
    expect(r.p).toBe(Math.max(r.pLower, r.pUpper));
    // A mean well inside a wide margin with a small SE is strongly equivalent.
    expect(tost({ mean: 0, se: 0.005, margin: 0.05 }).p).toBeLessThan(0.001);
  });

  it("TOST refuses equivalence when the SE is large", () => {
    expect(tost({ mean: 0, se: 0.5, margin: 0.05 }).p).toBeGreaterThan(0.05);
  });

  it("twoSidedZTest agrees with the normal tail", () => {
    expect(twoSidedZTest({ mean: 1.96, se: 1 }).p).toBeCloseTo(0.05, 3);
    expect(twoSidedZTest({ mean: 0, se: 1 }).p).toBeCloseTo(1, 6);
  });

  it("waldInterval is symmetric about the mean", () => {
    const w = waldInterval({ mean: 0.1, se: 0.02, alpha: 0.05 });
    expect(w.upper - 0.1).toBeCloseTo(0.1 - w.lower, 10);
    expect(w.upper - w.lower).toBeCloseTo(2 * 1.96 * 0.02, 4);
  });

  it("bootstrap resamples pairs and is deterministic", () => {
    const D = Array.from({ length: 500 }, (_, i) => (i % 5 === 0 ? 1 : i % 7 === 0 ? -1 : 0));
    const a = bootstrapInterval({ D, alpha: 0.05 });
    const b = bootstrapInterval({ D, alpha: 0.05 });
    expect(a.lower).toBe(b.lower);
    expect(a.upper).toBe(b.upper);
    expect(a.lower).toBeLessThan(a.upper);
  });

  it("holm is step-down and monotone", () => {
    expect(holm([0.04, 0.5], 0.05).reject).toEqual([false, false]);
    expect(holm([0.001, 0.9, 0.9], 0.05).reject).toEqual([true, false, false]);
    const { adjusted } = holm([0.01, 0.02, 0.03], 0.05);
    expect([...adjusted].sort((x, y) => x - y)).toEqual(adjusted);
  });
});

// Deterministic synthetic D with a target delta, so the classifier can be
// checked against an answer known in advance.
const makeD = (n, delta, disc, seed) => {
  let st = (seed >>> 0) || 1;
  const r = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const nd = Math.round(n * disc);
  const pPlus = (delta / disc + 1) / 2;
  const D = new Array(n).fill(0);
  for (let i = 0; i < nd; i++) D[i] = r() < pPlus ? 1 : -1;
  return D;
};
const cls = (D) => classifyCell({ D, margin: 0.05, alphaEquivalence: 0.05, alphaDetection: 0.05 }).classification;

describe("classifier validated on known cases", () => {
  it("calls a well-sampled known null EQUIVALENT", () => {
    expect(cls(makeD(4096, 0, 0.4, 12))).toBe("EQUIVALENT");
    expect(cls(makeD(16384, 0, 0.4, 13))).toBe("EQUIVALENT");
  });

  it("calls an exact mirror EQUIVALENT", () => {
    expect(cls(new Array(1024).fill(0))).toBe("EQUIVALENT");
  });

  it("refuses to call an UNDER-sampled null equivalent", () => {
    // This is the property that makes the gate honest: absence of evidence is
    // not evidence of equivalence.
    expect(cls(makeD(256, 0, 0.4, 11))).toBe("INCONCLUSIVE");
  });

  it("detects a known positive side effect", () => {
    expect(cls(makeD(256, 0.15, 0.4, 21))).toBe("MATERIALLY_BIASED");
    expect(cls(makeD(4096, 0.15, 0.4, 22))).toBe("MATERIALLY_BIASED");
  });

  it("detects a known negative side effect", () => {
    expect(cls(makeD(4096, -0.15, 0.4, 23))).toBe("MATERIALLY_BIASED");
  });

  it("calls an effect sitting exactly on the margin INCONCLUSIVE", () => {
    expect(cls(makeD(16384, 0.05, 0.4, 24))).toBe("INCONCLUSIVE");
  });

  it("requires the Wald and bootstrap intervals to agree", () => {
    const c = classifyCell({ D: makeD(4096, 0, 0.4, 31), margin: 0.05, alphaEquivalence: 0.05, alphaDetection: 0.05 });
    expect(c.intervalsAgree).toBe(true);
  });

  it("a tighter (Holm-adjusted) alpha makes equivalence harder, never easier", () => {
    const D = makeD(2048, 0, 0.4, 41);
    const loose = classifyCell({ D, margin: 0.05, alphaEquivalence: 0.05, alphaDetection: 0.05 });
    const strict = classifyCell({ D, margin: 0.05, alphaEquivalence: 0.05 / 44, alphaDetection: 0.05 / 44 });
    expect(Math.abs(strict.waldInterval.upper - strict.waldInterval.lower))
      .toBeGreaterThan(Math.abs(loose.waldInterval.upper - loose.waldInterval.lower));
    if (loose.classification !== "EQUIVALENT") expect(strict.classification).not.toBe("EQUIVALENT");
  });
});

describe("frozen seed manifest", () => {
  it("verifies as an artifact", () => {
    const v = verifyArtifact("probability-side-bias-policy-v2", ARTIFACT_DIR_C6);
    expect(v.missingProvenance).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("is disjoint from every prior seed domain at the maximum sample", () => {
    const m = C6("probability-side-bias-policy-v2").data.seedManifest;
    expect(m.totalOverlap).toBe(0);
    for (const v of Object.values(m.overlapWithPriorDomains)) expect(v).toBe(0);
    // proven live, not just recorded
    for (const d of DOMAINS.filter((x) => x !== "side-bias-v2")) {
      expect(overlapBetween("side-bias-v2", d, 16384)).toEqual([]);
    }
  });

  it("draws distinct seeds across the whole ladder", () => {
    const m = C6("probability-side-bias-policy-v2").data.seedManifest;
    expect(m.allDistinct).toBe(true);
    expect(new Set(seedSetFor("side-bias-v2", 16384)).size).toBe(16384);
  });

  it("records pair counts per stage matching the ladder", () => {
    const m = C6("probability-side-bias-policy-v2").data.seedManifest;
    expect(m.pairCountByStage.map((s) => s.cumulativePairs)).toEqual([256, 1024, 4096, 16384]);
  });
});

describe("frozen cell family", () => {
  it("reconciles and excludes every sealed fixture", () => {
    const f = C6("probability-side-bias-policy-v2").data.cellFamily;
    expect(f.frozenBeforeResults).toBe(true);
    expect(f.reconciliation.reconciles).toBe(true);
    expect(f.holdoutContamination).toBe("PASS");
    expect(f.cells.length).toBe(f.count);
    expect(f.byKind.MIRROR + f.byKind.NON_MIRROR).toBe(f.count);
  });

  it("includes exact mirrors, which 6C2C5's family lacked", () => {
    const f = C6("probability-side-bias-policy-v2").data.cellFamily;
    expect(f.byKind.MIRROR).toBeGreaterThan(0);
    for (const c of f.cells.filter((x) => x.kind === "MIRROR")) {
      expect(c.teamA).toBe(c.teamB);
      expect(c.coachA).toBe(c.coachB);
    }
  });

  it("spans more than one era so the era stratum is evaluable", () => {
    const d = C6("probability-side-bias-policy-v2").data;
    expect(d.coverageAgainstBriefRequirements.distinctEras).toBeGreaterThan(1);
    expect(Object.keys(d.cellFamily.byEra).length).toBe(d.coverageAgainstBriefRequirements.distinctEras);
  });

  it("names a perspective team for every cell", () => {
    for (const c of C6("probability-side-bias-policy-v2").data.cellFamily.cells) {
      expect(c.perspectiveTeam).toBeTruthy();
      expect([c.teamA, c.teamB]).toContain(c.perspectiveTeam);
    }
  });
});
