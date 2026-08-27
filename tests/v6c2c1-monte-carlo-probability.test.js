import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateWinProbability, wilsonInterval, canonicalPair, canonicalMatchupFingerprint,
  probabilityCacheKey, activeVersionsFor, complement, observability,
  cacheStats, resetCache, LABEL, SAMPLE_TIERS,
} from "../src/v3/calibration/monteCarloProbability.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { domainSeed, MASTERS, seedSetFor, overlapBetween } from "../src/v3/calibration/seedDomains.js";
import { THRESHOLDS } from "../scripts/calibration/probability-v3.mjs";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";
import { versionOf } from "../src/versions.js";
import { assertSealDiscipline, assertImportChangedNoSeal, sealSnapshot } from "./helpers/sealDiscipline.js";

const A = { teamId: "A", playerIds: ["curry-10s", "klay-10s", "kawhi-10s", "draymond-10s", "jokic-10s"], coachId: "steve-kerr" };
const B = { teamId: "B", playerIds: ["wall-2010s", "demar-2010s", "prince-00s", "ibaka-2010s", "drummond-2010s"], coachId: "tom-thibodeau" };
const MIRROR = { teamId: "A2", playerIds: A.playerIds, coachId: A.coachId };
const est = (o = {}) => estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, ...o });

describe("Wilson score interval", () => {
  it("is symmetric about a half", () => {
    const ci = wilsonInterval(50, 100);
    expect(ci.lower + ci.upper).toBeCloseTo(1, 6);
  });

  it("stays inside [0,1] at the extremes where the naive interval does not", () => {
    for (const [w, n] of [[0, 10], [10, 10], [1, 200], [199, 200]]) {
      const ci = wilsonInterval(w, n);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeLessThanOrEqual(1);
      // The naive p ± 1.96·SE gives a zero-width interval at w=0; Wilson does not.
      expect(ci.upper).toBeGreaterThan(ci.lower);
    }
  });

  it("narrows as the sample grows", () => {
    const widths = [64, 256, 1024].map((n) => wilsonInterval(n / 2, n).halfWidth);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it("returns nulls rather than NaN for an empty sample", () => {
    expect(wilsonInterval(0, 0)).toMatchObject({ lower: null, upper: null, halfWidth: null });
  });
});

describe("canonical matchup identity", () => {
  it("gives the same fingerprint whichever way round the pair is presented", () => {
    expect(canonicalMatchupFingerprint({ teamA: A, teamB: B, eraStyleId: "2010s" }))
      .toBe(canonicalMatchupFingerprint({ teamA: B, teamB: A, eraStyleId: "2010s" }));
  });

  it("separates matchups that differ only by era", () => {
    expect(canonicalMatchupFingerprint({ teamA: A, teamB: B, eraStyleId: "2010s" }))
      .not.toBe(canonicalMatchupFingerprint({ teamA: A, teamB: B, eraStyleId: "1990s" }));
  });

  it("separates matchups that differ only by coach", () => {
    expect(canonicalMatchupFingerprint({ teamA: A, teamB: B, eraStyleId: "2010s" }))
      .not.toBe(canonicalMatchupFingerprint({ teamA: { ...A, coachId: "phil-jackson" }, teamB: B, eraStyleId: "2010s" }));
  });

  it("flags which orientation was reversed", () => {
    const f = canonicalPair(A, B);
    const r = canonicalPair(B, A);
    expect(f.reversed).toBe(!r.reversed);
    expect(f.first.teamId).toBe(r.first.teamId);
  });
});

describe("estimateWinProbability", () => {
  beforeEach(resetCache);

  it("labels the output as model-implied and never as true probability", () => {
    const r = est();
    expect(r.label).toBe("ERACLASH_MODEL_IMPLIED_PROBABILITY");
    expect(LABEL).not.toMatch(/TRUE|ACTUAL|GUARANTEED|HISTORICAL_PROBABILITY/);
    expect(JSON.stringify(r)).not.toMatch(/TRUE_PROBABILITY|GUARANTEED_ODDS/);
  });

  it("returns probabilities that sum to one with matching win counts", () => {
    const r = est();
    // Each probability is independently rounded to 4 decimals from its own
    // win count, so the pair can each round upward: the exact invariant is
    // |sum - 1| <= 1e-4, not float-equality of the rounded halves.
    expect(Math.abs(r.goldWinProbability + r.blueWinProbability - 1)).toBeLessThanOrEqual(1.0000001e-4);
    expect(r.goldWins + r.blueWins).toBe(r.sampleCount);
    expect(r.goldWins / r.sampleCount).toBeCloseTo(r.goldWinProbability, 4);
  });

  it("is deterministic across repeated uncached calls", () => {
    const a = est({ cache: false });
    const b = est({ cache: false });
    expect(a.goldWinProbability).toBe(b.goldWinProbability);
    expect(a.predictionFingerprint).toBe(b.predictionFingerprint);
  });

  it("places the point estimate inside its own confidence interval", () => {
    const r = est();
    expect(r.goldWinProbability).toBeGreaterThanOrEqual(r.confidenceInterval.lower);
    expect(r.goldWinProbability).toBeLessThanOrEqual(r.confidenceInterval.upper);
  });

  it("narrows the interval as the sample tier grows", () => {
    const fast = est({ sampleTier: "FAST" });
    const deep = est({ sampleTier: "DEEP" });
    expect(deep.sampleCount).toBeGreaterThan(fast.sampleCount);
    expect(deep.confidenceInterval.halfWidth).toBeLessThan(fast.confidenceInterval.halfWidth);
  });

  it("rejects an odd sample tier, which could not be paired", () => {
    expect(() => estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: "NOT_A_TIER", buildInput: buildPossessionInput }))
      .toThrow();
  });

  it("keeps every sample tier even so both orientations are always balanced", () => {
    for (const n of Object.values(SAMPLE_TIERS)) expect(n % 2).toBe(0);
  });
});

describe("paired side orientation", () => {
  beforeEach(resetCache);

  it("returns exactly one half for a mirror matchup", () => {
    // Identical rosters and coaches. Pairing makes this an identity, not an
    // approximation — any deviation is a defect in the pairing itself.
    const r = estimateWinProbability({ teamA: A, teamB: MIRROR, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput });
    expect(r.goldWinProbability).toBe(0.5);
    expect(r.goldWins).toBe(r.blueWins);
  });

  it("still reports the raw gold-slot advantage that pairing removed", () => {
    const r = estimateWinProbability({ teamA: A, teamB: MIRROR, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput });
    // A mirror pair that shows a non-zero gold rate proves a real side effect
    // exists in the engine, even though the estimate is protected from it.
    expect(r.sideBias.goldOrientationRate).toBeGreaterThan(0);
    expect(r.sideBias.goldOrientationRate).toBeLessThan(1);
    expect(r.sideBias.goldOrientationRate + r.sideBias.blueOrientationRate).toBeCloseTo(1, 6);
    expect(r.sideBias.difference).toBe(Math.round((r.sideBias.goldOrientationRate - 0.5) * 10000) / 10000);
  });

  it("keeps the mirror's raw side bias small enough to be sampling noise", () => {
    // The bound has needed re-examination at every candidate change, and the
    // reason is that its power was mis-derived rather than that the engine
    // moved. sideBias.difference is firstAsGold minus firstAsBlue, each
    // estimated on HALF the tier's games. At the DEEP tier that is 256 games
    // per orientation, so one standard error of the DIFFERENCE is
    // sqrt(0.25/256 + 0.25/256) = 0.044 — the 0.05 bound was about 1.1 sigma,
    // which fails roughly a quarter of the time on a true mirror whatever the
    // engine does. Candidate 1 drew 0.10 here; Candidate 2 drew 0.0547.
    //
    // The bound stays at 0.05 and the tier moves to INTERNAL_VALIDATION, where
    // 4,096 games give a difference standard error of 0.0156 and 0.05 is a
    // genuine 3.2 sigma. A structural side bias fails; a noisy draw does not.
    // Phase 6C4C1 also measured this at 8,000 games per cell across eight
    // era/coach mirrors: see candidate2-side-symmetry.json.
    const r = estimateWinProbability({ teamA: A, teamB: MIRROR, eraStyleId: "2010s", sampleTier: "INTERNAL_VALIDATION", buildInput: buildPossessionInput });
    const perOrientation = 4096 / 2;
    const se = Math.sqrt(0.25 / perOrientation + 0.25 / perOrientation);
    expect(se, "the tier must give the 0.05 bound at least three sigma of power").toBeLessThan(0.05 / 3);
    expect(Math.abs(r.sideBias.difference)).toBeLessThan(0.05);
  }, 240000);

  it("splits each estimate evenly between the two orientations", () => {
    const r = est();
    expect(r.sideBias.firstAsGoldWinRate).not.toBeNull();
    expect(r.sideBias.firstAsBlueWinRate).not.toBeNull();
    // Both orientation rates average to the reported probability.
    expect((r.sideBias.firstAsGoldWinRate + r.sideBias.firstAsBlueWinRate) / 2)
      .toBeCloseTo(r.goldWinProbability, 3);
  });
});

describe("reversed perspective", () => {
  beforeEach(resetCache);

  it("gives the exact complement rather than a second sample", () => {
    const fwd = est();
    const rev = estimateWinProbability({ teamA: B, teamB: A, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput });
    expect(rev.goldWinProbability).toBeCloseTo(1 - fwd.goldWinProbability, 6);
    expect(rev.perspective).toBe("COMPLEMENT_OF_CANONICAL");
  });

  it("reuses the cached estimate instead of simulating again", () => {
    est();
    const generatedAfterFirst = cacheStats.generated;
    estimateWinProbability({ teamA: B, teamB: A, eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput });
    expect(cacheStats.generated).toBe(generatedAfterFirst);
    expect(cacheStats.hits).toBeGreaterThan(0);
  });

  it("mirrors the confidence interval about a half", () => {
    const fwd = est();
    const rev = complement(fwd);
    expect(rev.confidenceInterval.lower).toBeCloseTo(1 - fwd.confidenceInterval.upper, 4);
    expect(rev.confidenceInterval.upper).toBeCloseTo(1 - fwd.confidenceInterval.lower, 4);
    expect(rev.confidenceInterval.lower).toBeLessThan(rev.confidenceInterval.upper);
  });

  it("is its own inverse", () => {
    const fwd = est();
    expect(complement(complement(fwd)).goldWinProbability).toBeCloseTo(fwd.goldWinProbability, 6);
  });
});

describe("probability cache key", () => {
  beforeEach(resetCache);
  const key = (o) => probabilityCacheKey({ matchupFingerprint: "fp", sampleTier: "FAST", sampleCount: 128, ...o });

  it("lives in the development namespace", () => {
    expect(key().startsWith("mc-probability:")).toBe(true);
  });

  it("carries every material version and the parameter-set hash", () => {
    const k = key();
    for (const v of Object.values(activeVersionsFor())) {
      expect(k).toContain(String(v).replace(/[^A-Za-z0-9]+/g, "-"));
    }
    expect(k.length).toBeGreaterThan(80);
  });

  // This asserted the literal "UNCALIBRATED" until Phase 6C2C6 locked a
  // calibration. The point was never that word — it was that the calibration
  // state is STATED in the key rather than omitted, so a cached probability can
  // never outlive the calibration behind it. That is what is asserted now, in
  // both directions.
  it("states the calibration state in the key rather than omitting it", () => {
    const v = versionOf("possessionCalibrationVersion");
    const stated = activeVersionsFor().possessionCalibrationVersion;
    expect(stated).toBe(v ?? "UNCALIBRATED");
    expect(key()).toContain(String(stated).replace(/\./g, "-"));
  });

  it("separates sample tiers and sample counts", () => {
    expect(key({ sampleTier: "FAST" })).not.toBe(key({ sampleTier: "DEEP" }));
    expect(key({ sampleCount: 128 })).not.toBe(key({ sampleCount: 256 }));
  });

  it("separates matchups", () => {
    expect(key({ matchupFingerprint: "a" })).not.toBe(key({ matchupFingerprint: "b" }));
  });

  it("never carries a secret, an identifier or an actual game seed", () => {
    const k = key();
    for (const forbidden of ["@", "session", "cookie", "authorization", "token", "apikey", "api_key", "bearer", "email", "userId", "resultId", "actual-game"]) {
      expect(k.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("seed domain separation", () => {
  it("keeps prediction and validation seeds disjoint at the sizes used", () => {
    expect(overlapBetween("prediction", "probability-validation", 4096)).toEqual([]);
  });

  it("keeps both disjoint from actual-game seeds", () => {
    expect(overlapBetween("actual-game", "prediction", 4096)).toEqual([]);
    expect(overlapBetween("actual-game", "probability-validation", 4096)).toEqual([]);
  });

  it("produces distinct seeds within a domain", () => {
    const s = seedSetFor("prediction", 2048);
    expect(new Set(s).size).toBe(s.length);
  });

  it("draws estimates from prediction seeds only", () => {
    const first = domainSeed(MASTERS.prediction, "prediction", 0);
    const validation = seedSetFor("probability-validation", 4096);
    expect(validation).not.toContain(first);
  });
});

describe("observability", () => {
  beforeEach(resetCache);

  it("carries fingerprints and versions but no roster payload", () => {
    const o = observability(est(), 1234, "miss");
    expect(o.event).toBe("mc_probability_generated");
    expect(o.matchupFingerprint).toBeTruthy();
    expect(o.sampleCount).toBeGreaterThan(0);
    expect(o.latencyMs).toBe(1234);
    const s = JSON.stringify(o);
    for (const id of [...A.playerIds, ...B.playerIds, A.coachId, B.coachId]) expect(s).not.toContain(id);
  });

  it("reports the interval width and the side bias it measured", () => {
    const o = observability(est(), 1, "hit");
    expect(o.confidenceIntervalWidth).toBeGreaterThan(0);
    expect(o.sideBiasDifference).not.toBeUndefined();
    expect(o.cacheSource).toBe("hit");
  });
});

describe("frozen validation thresholds", () => {
  it("are declared before results and record the baseline they judge against", () => {
    expect(THRESHOLDS.analyticalBaselineBrier).toBe(0.2507);
    expect(THRESHOLDS.constantBaselineBrier).toBe(0.25);
    expect(THRESHOLDS.requireMonotonicLadder).toBe(true);
    expect(THRESHOLDS.requireSharpnessReported).toBe(true);
  });

  it("demand a validation sample large enough to resolve the effects claimed", () => {
    expect(THRESHOLDS.minValidationGamesPerCell).toBeGreaterThanOrEqual(256);
    // The per-cell side-bias threshold must exceed one standard error, or it
    // would fail on noise alone at every sample size.
    expect(THRESHOLDS.maxSideBiasDifference).toBeGreaterThan(Math.sqrt(0.25 / THRESHOLDS.minValidationGamesPerCell));
  });
});

describe("no production exposure", () => {
  it("is not reachable from any api handler", async () => {
    const { readdirSync, readFileSync, existsSync } = await import("node:fs");
    const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [`${d}/${e.name}`] : []) : []);
    for (const f of walk("api")) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must not import the probability estimator`).not.toMatch(/monteCarloProbability|estimateWinProbability/);
      expect(src, `${f} must not expose a probability endpoint`).not.toMatch(/mc-probability/);
    }
  });
});

describe("scripts are inert on import", () => {
  // A test that imports a script for one constant must not run a simulation
  // campaign. This regression exists because it happened: importing
  // probability-v3.mjs for THRESHOLDS executed the whole 30-cell validation.
  it("guards every calibration script behind a main-module check", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const scripts = readdirSync("scripts/calibration").filter((f) => f.endsWith(".mjs"));
    expect(scripts.length).toBeGreaterThan(3);
    for (const f of scripts) {
      const src = readFileSync(`scripts/calibration/${f}`, "utf8");
      expect(src, `scripts/calibration/${f} runs work at import time`)
        .toContain("import.meta.url === `file://${process.argv[1]}`");
    }
  });

  it("leaves every seal untouched when the probability script is imported", async () => {
    // The invariant was never "the counts are zero" — it is that an IMPORT
    // does not change them. Comparing before and after says that directly, and
    // keeps saying it now that one set has been legitimately opened.
    const before = sealSnapshot();
    await import("../../scripts/calibration/probability-v3.mjs").catch(() => import("../scripts/calibration/probability-v3.mjs"));
    assertImportChangedNoSeal(before);
  });
});
