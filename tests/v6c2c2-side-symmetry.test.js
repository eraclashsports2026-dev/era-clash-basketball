import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { domainSeed, MASTERS } from "../src/v3/calibration/seedDomains.js";
import { SIDE_SYMMETRY } from "../src/v3/calibration/acceptancePolicy.js";
import { ARCHETYPES, measureCell, aggregate, evaluateGate, wilson, benjaminiHochberg } from "../scripts/calibration/side-symmetry.mjs";
import { checkGame, assertNoViolations } from "../src/v3/possession/invariants.js";
import { versionOf } from "../src/versions.js";

const A = ARCHETYPES.SHOOTING_2010s;
const B = ARCHETYPES.INTERIOR_2010s;

const play = (goldIds, blueIds, seed, era = "2010s", cg = "steve-kerr", cb = "tom-thibodeau") =>
  runPossessionGame(buildPossessionInput({
    goldIds, blueIds, coachGoldId: cg, coachBlueId: cb, eraStyleId: era, simulationSeed: seed,
  }), { includeLedger: true });

const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", i);

describe("opening possession is seeded, not assigned to a side", () => {
  it("does not give gold the first possession of every game", () => {
    // Before actualGameSymmetryVersion 1.0.0 this was 200/200. The starter was
    // chosen by period parity alone, so gold opened every game ever simulated.
    let goldFirst = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const g = play(A, B, seedAt(i));
      if (g.possessionLedger[0].offense === "gold") goldFirst++;
    }
    expect(goldFirst).toBeGreaterThan(0);
    expect(goldFirst).toBeLessThan(n);
    // Within 4 standard errors of even.
    const se = Math.sqrt(0.25 / n) * n;
    expect(Math.abs(goldFirst - n / 2)).toBeLessThan(4 * se);
  });

  it("depends on the seed rather than on which roster was passed first", () => {
    // The same seed opens the same SLOT regardless of the teams in it. That is
    // what makes a paired orientation balance which TEAM opens.
    for (let i = 0; i < 25; i++) {
      const s = seedAt(i);
      expect(play(A, B, s).possessionLedger[0].offense)
        .toBe(play(B, A, s).possessionLedger[0].offense);
    }
  });

  it("gives different seeds different openings", () => {
    const opens = new Set();
    for (let i = 0; i < 40; i++) opens.add(play(A, B, seedAt(i)).possessionLedger[0].offense);
    expect(opens.size).toBe(2);
  });
});

describe("period starts are fair", () => {
  const periodStarters = (g) => {
    const seen = new Map();
    for (const p of g.possessionLedger) if (!seen.has(p.period)) seen.set(p.period, p.offense);
    return seen;
  };

  it("alternates regulation periods from the opening tip, two starts each", () => {
    for (let i = 0; i < 30; i++) {
      const g = play(A, B, seedAt(i));
      const s = periodStarters(g);
      const opening = s.get(1);
      expect(s.get(2)).not.toBe(opening);
      expect(s.get(3)).toBe(opening);
      expect(s.get(4)).not.toBe(opening);
      const regulation = [1, 2, 3, 4].map((p) => s.get(p));
      expect(regulation.filter((x) => x === "gold")).toHaveLength(2);
      expect(regulation.filter((x) => x === "blue")).toHaveLength(2);
    }
  });

  // Overtime is rare (~2% of games), so the sample is collected once and both
  // overtime facts are asserted against it rather than scanning twice.
  const otSample = (() => {
    const rows = [];
    for (let i = 0; i < 6000 && rows.length < 60; i++) {
      const g = play(A, B, seedAt(i));
      if ((g.overtimes ?? 0) > 0) {
        const s = periodStarters(g);
        rows.push({ opening: s.get(1), ot: s.get(5) });
      }
    }
    return rows;
  })();

  it("collected enough overtime games to say anything", () => {
    expect(otSample.length).toBeGreaterThan(20);
  }, 60000);

  it("does not hand every overtime to the same side", () => {
    // Under parity alone period 5 is odd, so gold started every first overtime
    // — unpaired against regulation's 2-2 balance, and worth 4.6pp of overtime
    // win rate at 6.7 standard errors.
    expect(new Set(otSample.map((r) => r.ot)).size,
      "every overtime started with the same side").toBe(2);
  }, 60000);

  it("gives overtime a fresh jump ball rather than continuing period parity", () => {
    // If overtime continued regulation parity its starter would be a pure
    // function of the opening tip. It must not be.
    const combos = new Set(otSample.map((r) => `${r.opening}->${r.ot}`));
    expect(combos.size).toBeGreaterThanOrEqual(3);
  }, 60000);
});

describe("array order does not decide the winner", () => {
  it("produces a complementary long-run record under side swap", () => {
    let aWinsAsGold = 0, aWinsAsBlue = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const s = seedAt(i);
      const g1 = play(A, B, s);
      if (g1.finalScore.gold > g1.finalScore.blue) aWinsAsGold++;
      const g2 = play(B, A, s, "2010s", "tom-thibodeau", "steve-kerr");
      if (g2.finalScore.blue > g2.finalScore.gold) aWinsAsBlue++;
    }
    // Team A's record must not depend on which slot it occupied. 4 SE band.
    const se = Math.sqrt(2 * 0.25 / n) * n;
    expect(Math.abs(aWinsAsGold - aWinsAsBlue)).toBeLessThan(4 * se);
  });
});

describe("determinism survives the symmetry fix", () => {
  it("replays a seed exactly", () => {
    for (let i = 0; i < 10; i++) {
      const s = seedAt(i);
      const a = play(A, B, s), b = play(A, B, s);
      expect(a.fingerprint).toEqual(b.fingerprint);
      expect(a.finalScore).toEqual(b.finalScore);
      expect(a.rngSteps).toBe(b.rngSteps);
    }
  });

  it("still varies across seeds", () => {
    const scores = new Set();
    for (let i = 0; i < 30; i++) { const g = play(A, B, seedAt(i)); scores.add(`${g.finalScore.gold}-${g.finalScore.blue}`); }
    expect(scores.size).toBeGreaterThan(20);
  });
});

describe("measured symmetry across eras and schemes", () => {
  // A real measurement, kept small enough to run in the suite. The frozen gate
  // is judged against the full 240,000-game matrix, not this.
  const cells = [
    { id: "t-mirror-2010s", kind: "MIRROR", era: "2010s", a: A, b: A, coachA: "steve-kerr", coachB: "steve-kerr" },
    { id: "t-style-2010s", kind: "STYLE", era: "2010s", a: A, b: B, coachA: "steve-kerr", coachB: "tom-thibodeau" },
    { id: "t-classic-1960s", kind: "STYLE", era: "1960s", a: ARCHETYPES.CLASSIC_1960s, b: ARCHETYPES.CLASSIC_1980s, coachA: "red-auerbach", coachB: "pat-riley" },
    { id: "t-zone-2020s", kind: "ZONE", era: "2020s", a: A, b: B, coachA: "steve-kerr", coachB: "tom-thibodeau", zone: true },
  ];
  const measured = aggregate(cells.map((c) => measureCell(c, 400)));

  it("gives neither side an aggregate edge", () => {
    expect(Math.abs(measured.goldAdvantagePp)).toBeLessThan(3.0);
  });

  it("splits the first possession evenly", () => {
    expect(Math.abs(measured.firstPossessionImbalancePp)).toBeLessThan(8);
  });

  it("keeps possession counts level", () => {
    expect(Math.abs(measured.possessionDifference))
      .toBeLessThanOrEqual(SIDE_SYMMETRY.maxPossessionCountDifference);
  });

  it("produces no invariant violations and no ties", () => {
    expect(measured.invariantViolations).toBe(0);
    expect(measured.ties).toBe(0);
  });
});

describe("statistics used by the gate", () => {
  it("gives a Wilson interval that brackets the estimate", () => {
    const ci = wilson(500, 1000);
    expect(ci.lower).toBeLessThan(0.5);
    expect(ci.upper).toBeGreaterThan(0.5);
  });

  it("controls false discoveries across many cells", () => {
    // 48 cells at alpha 0.05 uncorrected would manufacture ~2 findings from
    // noise alone. BH must reject a spray of uniform p-values.
    const noise = Array.from({ length: 48 }, (_, i) => (i + 1) / 49);
    expect(benjaminiHochberg(noise, 0.05).filter(Boolean)).toHaveLength(0);
    // ...and must still detect a genuinely tiny one.
    expect(benjaminiHochberg([1e-9, ...noise.slice(1)], 0.05).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("fails the gate when a side advantage is large", () => {
    const fake = aggregate([{ id: "x", kind: "M", era: "2010s", games: 10000, goldWins: 6000, blueWins: 4000,
      ties: 0, goldMarginSum: 50000, goldPossSum: 1000000, bluePossSum: 900000, goldFirstOffense: 10000,
      otGames: 100, otGoldFirst: 100, otGoldWins: 80, invariantViolations: 0 }]);
    const g = evaluateGate(fake);
    expect(g.aggregateAdvantageWithinTolerance).toBe(false);
    expect(g.firstPossessionFair).toBe(false);
    expect(g.overtimeFair).toBe(false);
  });
});

describe("invariant reporting covers both sides", () => {
  it("labels every team violation with its side", () => {
    const box = (pts) => ({
      totals: { pts, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 },
      players: Array.from({ length: 8 }, (_, i) => ({ cardId: `p${i}`, pts: 1, fgm: 1, fga: 0, tpm: 2, tpa: 1, ftm: 1, fta: 0, oreb: 1, dreb: 1, reb: 5, ast: 0, stl: 0, blk: 0, to: 0 })),
    });
    const g = { gold: box(100), blue: box(99), winner: "Gold", periods: 4, overtimes: 0, threePointLegal: true, eraStyleId: "2010s" };
    const v = checkGame(g);
    expect(v.filter((x) => x.side === "gold").length).toBeGreaterThan(6);
    expect(v.filter((x) => x.side === "blue").length).toBeGreaterThan(6);
  });

  it("reports both sides rather than truncating one away", () => {
    // A flat slice(0, 12) showed gold's violations and silently dropped blue's,
    // which would let a side-symmetry gate read "zero failures" off a message
    // that had hidden them.
    const box = (pts) => ({
      totals: { pts, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 },
      players: Array.from({ length: 10 }, (_, i) => ({ cardId: `p${i}`, pts: 1, fgm: 1, fga: 0, tpm: 2, tpa: 1, ftm: 1, fta: 0, oreb: 1, dreb: 1, reb: 5, ast: 0, stl: 0, blk: 0, to: 0 })),
    });
    const g = { gold: box(100), blue: box(99), winner: "Gold", periods: 4, overtimes: 0, threePointLegal: true, eraStyleId: "2010s" };
    let msg = "";
    try { assertNoViolations(g); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/gold/);
    expect(msg).toMatch(/blue/);
    expect(msg).toMatch(/gold \d+, blue \d+/);
  });
});

describe("the symmetry fix is versioned", () => {
  it("registers actualGameSymmetryVersion as result-affecting", async () => {
    const { REGISTRY } = await import("../src/versions.js");
    expect(versionOf("actualGameSymmetryVersion")).toBe("1.0.0");
    // It changes who gets the ball, so it must not be treated as cosmetic.
    expect(REGISTRY.actualGameSymmetryVersion.affectsResult).toBe(true);
  });
});

describe("recorded measurement artefacts", () => {
  it("kept the pre-fix baseline for comparison", () => {
    const p = ".cache/calibration/side-symmetry-baseline.json";
    if (!existsSync(p)) return; // artefact is a cache, not a committed fixture
    const b = JSON.parse(readFileSync(p, "utf8"));
    expect(b.aggregate.goldFirstOffenseRate).toBe(1);
    expect(b.aggregate.overtimeGoldFirstRate).toBe(1);
    expect(b.passed).toBe(false);
  });
});
