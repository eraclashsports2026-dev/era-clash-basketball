import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  FIXTURES, ERAS_COVERED, validateCorpus, validateFixture, fixtureById,
  HISTORICAL_FIXTURE_DATA_VERSION, CONFIDENCE, LINEUP_BASIS, FIXTURE_TYPES,
} from "../data/calibration/fixtures.mjs";
import {
  CALIBRATION_FIXTURE_IDS, HOLDOUT_FIXTURE_IDS, calibrationFixtures, holdoutFixtures,
  buildManifest, manifestHash, overlap, splitSummary,
} from "../data/calibration/split.mjs";
import { seedSet, fixtureSeeds, SEED_ROOTS } from "../data/calibration/seeds.mjs";
import {
  teamMetrics, playerMetrics, quantiles, fixtureError, aggregateErrors, confidenceRollup,
  reliabilityBins, brierScore, logLoss, sharpness, upsetRate, estimatedPossessions,
  ERROR_METRIC_NOTES, METRIC_DEFINITIONS, CONFIDENCE_WEIGHTS, expectedVsRealized,
} from "../src/v3/calibration/metrics.js";
import { requireHoldoutUnlock, sealStatus, HoldoutSealError } from "../src/v3/calibration/holdoutSeal.js";
import { cacheKeys, namespaceOf, NAMESPACES } from "../api/_lib/cacheKeys.js";
import { versionOf, statusOf, VERSION_STATUS } from "../src/versions.js";
import { findCard } from "../src/players.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";

describe("historical fixture corpus", () => {
  it("every fixture validates, with no fabricated values", () => {
    const errors = validateCorpus();
    expect(errors, `corpus validation errors:\n${errors.join("\n")}`).toEqual([]);
  });

  it("covers all eight eras", () => {
    expect(ERAS_COVERED).toHaveLength(8);
    for (const era of ERAS_COVERED) {
      expect(FIXTURES.filter((f) => f.eraStyleId === era).length, `era ${era} has no fixture`).toBeGreaterThan(0);
    }
  });

  it("every roster card exists and every assigned position is legal", () => {
    // A fixture that names a card the pool does not have, or asks a centre to
    // play point guard, is not a historical reference — it is a broken input,
    // and the engine rejects it at build time anyway.
    for (const f of FIXTURES) {
      for (const r of f.roster) {
        const card = findCard(r.playerCardId);
        expect(card, `${f.fixtureId}: unknown card ${r.playerCardId}`).toBeTruthy();
        expect(
          (card.positions ?? [card.pos]).includes(r.assignedPosition),
          `${f.fixtureId}: ${card.name} cannot play ${r.assignedPosition}`,
        ).toBe(true);
      }
    }
  });

  it("declares an availability status for every target rather than inventing one", () => {
    // The whole point: a missing advanced metric stays null and says WHY.
    // Filling it with a plausible number would make the error surface a
    // fiction, and nothing downstream could tell.
    for (const f of FIXTURES) {
      expect(f.targetAvailability, `${f.fixtureId} has no targetAvailability`).toBeTruthy();
      for (const [k, v] of Object.entries(f.historicalTargets ?? {})) {
        if (v == null) continue;
        expect(typeof v, `${f.fixtureId}.${k} must be numeric when present`).toBe("number");
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("records a source and a confidence grade on every fixture", () => {
    for (const f of FIXTURES) {
      expect(Object.values(CONFIDENCE)).toContain(f.sourceConfidence);
      expect(Object.values(LINEUP_BASIS)).toContain(f.lineupBasis);
      expect(Object.values(FIXTURE_TYPES)).toContain(f.fixtureType);
      expect(f.sources?.length, `${f.fixtureId} cites no source`).toBeGreaterThan(0);
    }
  });

  it("rejects a fabricated fixture", () => {
    const bad = { ...FIXTURES[0], fixtureId: "made-up", roster: [], sources: [] };
    expect(validateFixture(bad).length).toBeGreaterThan(0);
  });

  it("has a version domain that is DEVELOPMENT, not ACTIVE", () => {
    expect(HISTORICAL_FIXTURE_DATA_VERSION).toBe(versionOf("historicalFixtureDataVersion"));
    expect(statusOf("historicalFixtureDataVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
  });
});

describe("calibration / holdout split", () => {
  it("no fixture appears in both sets", () => {
    expect(overlap()).toEqual([]);
  });

  it("the two sets together are exactly the corpus", () => {
    const all = [...CALIBRATION_FIXTURE_IDS, ...HOLDOUT_FIXTURE_IDS].sort();
    expect(all).toEqual(FIXTURES.map((f) => f.fixtureId).sort());
    expect(new Set(all).size, "a fixture is duplicated across the split").toBe(all.length);
  });

  it("holds back 20-30% of the corpus", () => {
    const share = HOLDOUT_FIXTURE_IDS.length / FIXTURES.length;
    expect(share).toBeGreaterThanOrEqual(0.2);
    expect(share).toBeLessThanOrEqual(0.3);
  });

  it("the holdout is representative, not a bin for easy cases", () => {
    // An unrepresentative holdout is worse than no holdout: it would pass a
    // model that generalises only to conventional teams.
    const { holdout } = splitSummary();
    expect(holdout.eras.length, "holdout must span many eras").toBeGreaterThanOrEqual(5);
    expect(holdout.types.length, "holdout must span many identities").toBeGreaterThanOrEqual(4);
    expect(holdout.coaches.length, "holdout must span many coaching systems").toBeGreaterThanOrEqual(4);
    expect(Object.keys(holdout.confidence).length, "holdout must span confidence grades").toBeGreaterThanOrEqual(2);
  });

  it("the calibration set also spans every era, so tuning cannot overfit one", () => {
    expect(splitSummary().calibration.eras).toHaveLength(8);
  });

  it("manifest hashes are stable and content-sensitive", () => {
    expect(manifestHash(HOLDOUT_FIXTURE_IDS)).toBe(manifestHash([...HOLDOUT_FIXTURE_IDS].reverse()));
    expect(manifestHash(HOLDOUT_FIXTURE_IDS)).not.toBe(manifestHash(CALIBRATION_FIXTURE_IDS));
    // Editing a fixture must invalidate the manifest, or a cached calibration
    // could outlive the corpus it was measured against.
    const mutated = FIXTURES.map((f) => (f.fixtureId === HOLDOUT_FIXTURE_IDS[0] ? { ...f, eraStyleId: "1950s" } : f));
    expect(manifestHash(HOLDOUT_FIXTURE_IDS, mutated)).not.toBe(manifestHash(HOLDOUT_FIXTURE_IDS));
  });

  it("the committed manifests match what the code produces", () => {
    // A manifest file that has drifted from the split is not a freeze.
    for (const kind of ["calibration", "holdout"]) {
      const onDisk = JSON.parse(readFileSync(`data/calibration/${kind}-manifest.json`, "utf8"));
      expect(onDisk).toEqual(buildManifest(kind));
    }
  });

  it("the manifest carries no timestamp, so a rebuild proves the freeze", () => {
    const m = buildManifest("holdout");
    expect(JSON.stringify(m)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(m).toEqual(buildManifest("holdout"));
  });

  it("resolves both sets to real fixtures", () => {
    expect(calibrationFixtures()).toHaveLength(CALIBRATION_FIXTURE_IDS.length);
    expect(holdoutFixtures()).toHaveLength(HOLDOUT_FIXTURE_IDS.length);
    for (const id of [...CALIBRATION_FIXTURE_IDS, ...HOLDOUT_FIXTURE_IDS]) expect(fixtureById(id)).toBeTruthy();
  });
});

describe("benchmark seed sets", () => {
  it("are reproducible from a named root, never hand-picked", () => {
    // Choosing favourable seeds is the cheapest way to fake a calibration
    // result, so the derivation lives in the repo and is asserted here.
    expect(seedSet("CALIBRATION", 50)).toEqual(seedSet("CALIBRATION", 50));
    expect(fixtureSeeds("CALIBRATION", "abc", 20)).toEqual(fixtureSeeds("CALIBRATION", "abc", 20));
  });

  it("differ across purposes and across fixtures", () => {
    expect(seedSet("CALIBRATION", 10)).not.toEqual(seedSet("HOLDOUT", 10));
    expect(fixtureSeeds("CALIBRATION", "a", 10)).not.toEqual(fixtureSeeds("CALIBRATION", "b", 10));
  });

  it("produce distinct, well-spread seeds", () => {
    const s = seedSet("CALIBRATION", 500);
    expect(new Set(s).size, "seed collisions would silently shrink the sample").toBe(500);
  });

  it("reject an unknown purpose instead of silently using a default", () => {
    expect(() => seedSet("NOT_A_PURPOSE", 5)).toThrow(/unknown purpose/);
    expect(Object.keys(SEED_ROOTS).length).toBeGreaterThanOrEqual(6);
  });
});

describe("calibration metrics", () => {
  const side = (t) => ({ totals: t });
  const own = side({ pts: 110, fgm: 40, fga: 90, tpm: 10, tpa: 30, ftm: 20, fta: 25, oreb: 10, dreb: 30, reb: 40, ast: 25, stl: 8, blk: 5, to: 12, possessions: 100 });
  const opp = side({ pts: 105, fgm: 38, fga: 88, tpm: 8, tpa: 28, ftm: 21, fta: 26, oreb: 11, dreb: 32, reb: 43, ast: 22, stl: 7, blk: 4, to: 13, possessions: 100 });

  it("computes the standard team metrics correctly", () => {
    const m = teamMetrics(own, opp);
    expect(m.offensiveRating).toBe(110);
    expect(m.defensiveRating).toBe(105);
    expect(m.netRating).toBe(5);
    expect(m.efgPct).toBeCloseTo((40 + 5) / 90, 3);
    expect(m.trueShootingPct).toBeCloseTo(110 / (2 * (90 + 0.44 * 25)), 3);
    expect(m.turnoverPct).toBeCloseTo(0.12, 3);
    expect(m.offensiveReboundPct).toBeCloseTo(10 / (10 + 32), 3);
    expect(m.assistRate).toBeCloseTo(25 / 40, 3);
    expect(m.estimatedPossessions).toBeCloseTo(estimatedPossessions(own.totals), 1);
  });

  it("accounts for overtime in pace rather than reading an OT game as fast", () => {
    expect(teamMetrics(own, opp, { periods: 4 }).pace).toBe(100);
    expect(teamMetrics(own, opp, { periods: 5 }).pace).toBeLessThan(100);
  });

  it("returns null, never zero or NaN, where a metric does not exist", () => {
    // A pre-three-point era took no threes. Reporting 0.000 would drag down
    // every average it entered; null is the honest answer.
    const noThrees = side({ ...own.totals, tpm: 0, tpa: 0 });
    expect(teamMetrics(noThrees, opp).threePointPct).toBeNull();
    expect(teamMetrics(noThrees, opp).threePointAttemptRate).toBe(0);
    const empty = side({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, possessions: 0 });
    for (const v of Object.values(teamMetrics(empty, empty))) {
      expect(Number.isNaN(v), "a NaN corrupts every aggregate it enters").toBe(false);
    }
  });

  it("keeps precision appropriate to magnitude", () => {
    // Rounding a shooting rate to one decimal turned 0.585 into 0.6 and made
    // every shooting comparison meaningless.
    const q = quantiles([0.581, 0.585, 0.589]);
    expect(q.mean).toBeGreaterThan(0.58);
    expect(q.mean).toBeLessThan(0.59);
    expect(quantiles([104.2, 104.7, 105.1]).mean).toBeCloseTo(104.7, 1);
  });

  it("summarises a distribution rather than a single game", () => {
    const q = quantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(q.n).toBe(10);
    expect(q.p05).toBeLessThanOrEqual(q.p25);
    expect(q.p25).toBeLessThanOrEqual(q.median);
    expect(q.median).toBeLessThanOrEqual(q.p75);
    expect(q.p75).toBeLessThanOrEqual(q.p95);
    expect(quantiles([]).mean).toBeNull();
  });

  it("does not offer MAPE, and says why", () => {
    // Several targets can legitimately be zero, where a percentage error is
    // undefined or explodes.
    const names = Object.keys(ERROR_METRIC_NOTES).join(" ").toLowerCase();
    expect(names).not.toMatch(/(^|[^x])mape[^e]/);
    expect(ERROR_METRIC_NOTES.mapeExcluded).toMatch(/NOT used/);
    expect(Object.keys(METRIC_DEFINITIONS).length).toBeGreaterThan(10);
  });

  it("suppresses relative error near zero instead of reporting a huge number", () => {
    const sim = quantiles([0.001, 0.002, 0.003]);
    expect(fixtureError({ metric: "threePointAttemptRate", target: 0, simulated: sim }).relativeError).toBeNull();
    expect(fixtureError({ metric: "pace", target: 100, simulated: quantiles([104, 105, 106]) }).relativeError).toBeCloseTo(0.05, 2);
  });

  it("marks a missing target unavailable rather than scoring it as a perfect match", () => {
    const e = fixtureError({ metric: "pace", target: null, simulated: quantiles([100]) });
    expect(e.available).toBe(false);
    expect(e.reason).toBe("TARGET_UNAVAILABLE");
    expect(aggregateErrors([e]).mae, "an unavailable target must not become a zero error").toBeNull();
    expect(aggregateErrors([e]).unavailable).toBe(1);
  });

  it("keeps the sign of an error so a systematic bias stays visible", () => {
    const high = fixtureError({ metric: "pace", target: 100, simulated: quantiles([110, 110, 110]) });
    const low = fixtureError({ metric: "pace", target: 100, simulated: quantiles([90, 90, 90]) });
    expect(high.signedError).toBeGreaterThan(0);
    expect(low.signedError).toBeLessThan(0);
    expect(high.absoluteError).toBe(low.absoluteError);
    expect(aggregateErrors([high, low]).meanSignedError).toBeCloseTo(0, 5);
    expect(aggregateErrors([high, low]).mae).toBeCloseTo(10, 5);
  });

  it("reports whether the target falls inside the engine's own spread", () => {
    const sim = quantiles(Array.from({ length: 100 }, (_, i) => 90 + i * 0.2));
    expect(fixtureError({ metric: "pace", target: 100, simulated: sim }).withinBand).toBe(true);
    expect(fixtureError({ metric: "pace", target: 50, simulated: sim }).withinBand).toBe(false);
  });

  it("weights by confidence without hiding the component errors", () => {
    // A single opaque accuracy score would let one easily-matched metric mask a
    // real failure, so every component survives the rollup.
    const mk = (confidence, err) => ({ confidence, errors: [fixtureError({ metric: "pace", target: 100, simulated: quantiles([100 + err, 100 + err, 100 + err]) })] });
    const roll = confidenceRollup([mk("HIGH", 2), mk("MEDIUM", 10), mk("LOW", 20)]);
    expect(roll.byConfidence.HIGH.mae).toBeCloseTo(2, 5);
    expect(roll.byConfidence.MEDIUM.mae).toBeCloseTo(10, 5);
    expect(roll.byConfidence.LOW.mae).toBeCloseTo(20, 5);
    expect(roll.weightedMae).toBeGreaterThan(2);
    expect(roll.weightedMae).toBeLessThan(20);
    expect(CONFIDENCE_WEIGHTS.HIGH).toBeGreaterThan(CONFIDENCE_WEIGHTS.LOW);
    expect(roll.note).toMatch(/never increases simulation randomness/);
  });

  it("computes player shares that sum sensibly", () => {
    const box = {
      totals: { pts: 100, fga: 80, fta: 20, to: 10, reb: 40, ast: 20, tpa: 0 },
      players: [
        { cardId: "a", name: "A", pts: 60, fgm: 24, fga: 48, tpm: 0, tpa: 0, ftm: 12, fta: 12, oreb: 4, dreb: 8, reb: 12, ast: 4, stl: 1, blk: 1, to: 6 },
        { cardId: "b", name: "B", pts: 40, fgm: 16, fga: 32, tpm: 0, tpa: 0, ftm: 8, fta: 8, oreb: 8, dreb: 20, reb: 28, ast: 16, stl: 2, blk: 0, to: 4 },
      ],
    };
    const pm = playerMetrics(box);
    expect(pm.reduce((a, p) => a + p.scoringShare, 0)).toBeCloseTo(1, 5);
    expect(pm.reduce((a, p) => a + p.shotShare, 0)).toBeCloseTo(1, 5);
    expect(pm[0].threeShare, "no threes attempted, so a share is undefined not zero").toBeNull();
  });

  it("scores probability calibration and sharpness separately", () => {
    // A model that always predicts 50% is perfectly calibrated and useless, so
    // sharpness has to be reported next to Brier.
    const perfect = Array.from({ length: 100 }, (_, i) => ({ predicted: i < 70 ? 1 : 0, won: i < 70 }));
    const useless = Array.from({ length: 100 }, (_, i) => ({ predicted: 0.5, won: i < 50 }));
    expect(brierScore(perfect)).toBeCloseTo(0, 3);
    expect(brierScore(useless)).toBeCloseTo(0.25, 3);
    expect(sharpness(useless)).toBeCloseTo(0, 5);
    expect(sharpness(perfect)).toBeGreaterThan(0.4);
    expect(logLoss(useless)).toBeGreaterThan(0);
    expect(logLoss(perfect), "a clamp must keep log loss finite").toBeLessThan(1);
    expect(upsetRate([{ predicted: 0.9, won: false }, { predicted: 0.9, won: true }])).toBeCloseTo(0.5, 5);
  });

  it("bins reliability without dropping predictions at the edges", () => {
    const bins = reliabilityBins([{ predicted: 0, won: false }, { predicted: 1, won: true }, { predicted: 0.55, won: true }]);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(3);
    expect(bins.at(-1).n).toBeGreaterThan(0);
    expect(bins[0].n).toBeGreaterThan(0);
  });

  it("keeps expected and realized separate", () => {
    const x = expectedVsRealized(105, 112);
    expect(x.divergence).toBeCloseTo(7, 5);
    expect(x.note).toMatch(/never read as an engine error/);
  });
});

describe("holdout seal", () => {
  it("refuses to read the holdout without an explicit unlock", () => {
    expect(() => requireHoldoutUnlock({ argv: ["node", "run.mjs"], reason: "x" })).toThrow(HoldoutSealError);
    expect(() => requireHoldoutUnlock({ argv: ["node", "run.mjs"], reason: "x" })).toThrow(/sealed/);
  });

  it("requires a reason, because an unexplained access is not an audit record", () => {
    expect(() => requireHoldoutUnlock({ argv: ["node", "run.mjs", "--unlock-holdout"] })).toThrow(/requires a reason/);
  });

  it("permits access when unlocked and records it", () => {
    const rec = requireHoldoutUnlock({ argv: ["node", "run.mjs", "--unlock-holdout"], reason: "test", actor: "vitest", log: false });
    expect(rec.reason).toBe("test");
    expect(rec.actor).toBe("vitest");
  });

  it("never records anything secret-shaped in the access log", () => {
    const rec = requireHoldoutUnlock({ argv: ["node", "run.mjs", "--unlock-holdout", "--token=abc123", "SECRET=xyz"], reason: "r", log: false });
    expect(JSON.stringify(rec)).not.toMatch(/abc123|xyz/);
  });

  it("reports the seal state for the report", () => {
    const s = sealStatus();
    expect(["SEALED_UNREAD", "UNSEALED"]).toContain(s.status);
    expect(typeof s.integrity).toBe("string");
  });
});

describe("calibration versioning and cache identity", () => {
  it("registers every calibration domain with the right status", () => {
    for (const d of ["calibrationFrameworkVersion", "historicalFixtureDataVersion", "holdoutSetVersion", "benchmarkSeedSetVersion"]) {
      expect(statusOf(d), d).toBe(VERSION_STATUS.DEVELOPMENT);
      expect(versionOf(d), d).toBeTruthy();
    }
  });

  // This asserted PLANNED and null until Phase 6C2C6 locked the baseline
  // candidate. Replaced, not deleted, and the replacement is stronger: a
  // non-null version must be backed by a manifest whose every gate passed.
  it("permits a possession calibration version only when a lock manifest justifies it", () => {
    const r = assertCalibrationLockInvariant();
    if (!r.locked) {
      expect(statusOf("possessionCalibrationVersion")).toBe(VERSION_STATUS.PLANNED);
      expect(() => cacheKeys.calibratedPossessionResult({ matchupFingerprint: "abc", simulationSeed: 1 }))
        .toThrow(/PLANNED version domain "possessionCalibrationVersion"/);
      return;
    }
    // Once locked, the calibration MUST take part in the cache identity, so a
    // stored result can never outlive the calibration that produced it.
    const key = cacheKeys.calibratedPossessionResult({ matchupFingerprint: "abc", simulationSeed: 1 });
    // Keys tag a version with dots replaced, so 1.0.0 appears as 1-0-0.
    expect(key).toContain(r.version.replace(/\./g, "-"));
    // Under candidate succession the registry status is whichever DEVELOPMENT
    // lock is active (BASELINE for Candidate 0, SCOPED for Candidate 1) — a
    // production-facing status here would still be a lie, and still fails.
    expect([VERSION_STATUS.DEVELOPMENT_LOCKED_BASELINE, VERSION_STATUS.DEVELOPMENT_LOCKED_SCOPED])
      .toContain(statusOf("possessionCalibrationVersion"));
  });

  it("does not repurpose the production calibration domain", () => {
    // Repointing this would silently change the identity of every stored
    // production result.
    expect(versionOf("calibrationVersion")).toBe("backtest-1");
    expect(statusOf("calibrationVersion")).toBe(VERSION_STATUS.ACTIVE);
  });

  it("keys a calibration run by corpus and seed set, not just by engine", () => {
    // The same engine measured against a different corpus or different seeds is
    // a different measurement, and must not be served from the same entry.
    const base = { set: "calibration", manifestHash: "a".repeat(64), scenario: "era-baseline", seedCount: 1000 };
    const k = cacheKeys.calibrationRun(base);
    expect(namespaceOf(k)).toBe("dev-calibration");
    expect(k).not.toBe(cacheKeys.calibrationRun({ ...base, manifestHash: "b".repeat(64) }));
    expect(k).not.toBe(cacheKeys.calibrationRun({ ...base, seedCount: 500 }));
    expect(k).not.toBe(cacheKeys.calibrationRun({ ...base, scenario: "zone" }));
    expect(k, "a holdout run must never collide with a calibration run").not.toBe(cacheKeys.calibrationRun({ ...base, set: "holdout" }));
  });

  it("keeps calibration output in a development namespace, never a production one", () => {
    const ns = NAMESPACES["dev-calibration"];
    expect(ns).toBeTruthy();
    expect(ns.retention).toMatch(/DEVELOPMENT ONLY/);
    expect(ns.visibility).toMatch(/private/);
  });

  it("rejects an unsafe segment instead of escaping it", () => {
    expect(() => cacheKeys.calibrationRun({ set: "cal:ibration", manifestHash: "a".repeat(64), scenario: "x", seedCount: 1 })).toThrow(/invalid/);
  });
});
