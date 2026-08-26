#!/usr/bin/env node
// ── Actual-game side symmetry ───────────────────────────────────────────────
// Measures whether ONE normal game favours a display side.
//
// This is a different question from probability-estimator symmetry. Paired
// Monte Carlo orientation can produce a perfectly fair probability while the
// underlying single-game engine still tilts toward Gold — because pairing
// cancels the tilt in the average. A player plays one game, not a paired
// average, so the average may not stand in for fairness.
//
//   npm run symmetry:measure -- [--games=N] [--cells=all|fast]
//   npm run symmetry:report
//
// Method: for each seed, run A-as-gold and B-as-gold. If the engine were
// side-neutral the same team would win both, so the GOLD SLOT would win exactly
// half of all games. Any excess is side bias, measured directly.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { PLAYERS } from "../../src/players.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { SIDE_SYMMETRY } from "../../src/v3/calibration/acceptancePolicy.js";

const OUT = ".cache/calibration";
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

// ── Team archetypes ─────────────────────────────────────────────────────────
// Chosen to span the constructions the engine treats differently, so that a
// bias confined to one style cannot hide inside an aggregate.
/**
 * Archetypes are DERIVED from the real card pool, never hand-written. Phase
 * 6C2C1 hand-wrote synthetic fives and shipped 27 invented card ids; the fix
 * was to generate from the pool with a legal-lineup solver, and the same rule
 * applies here. A five that cannot be built from real cards is not a test case,
 * it is a crash waiting for a long run to find it.
 */
const SLOTS = ["PG", "SG", "SF", "PF", "C"];

/** Backtracking solver: fills PG..C from a candidate pool, respecting eligibility. */
const legalFive = (pool, rank) => {
  const used = new Set();
  const out = new Array(5).fill(null);
  const eligible = (c, slot) => (c.positions ?? [c.pos]).includes(slot) || c.pos === slot;
  const walk = (i) => {
    if (i === 5) return true;
    const cands = pool.filter((c) => !used.has(c.id) && eligible(c, SLOTS[i]))
      .sort((a, b) => rank(b) - rank(a));
    for (const c of cands) {
      used.add(c.id); out[i] = c.id;
      if (walk(i + 1)) return true;
      used.delete(c.id); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error(`no legal five from pool of ${pool.length}`);
  return out;
};

const ofDecade = (d) => PLAYERS.filter((p) => p.decade === d);
const scorer = (p) => (p.pts ?? 0) * 2 + (p.ast ?? 0) + (p.reb ?? 0) * 0.5;
const without = (pool, ids) => pool.filter((p) => !ids.includes(p.id));

// Contrasting pairs are built disjointly. Two archetypes that share their best
// players are a near-mirror wearing two names, and a "style" cell that is
// really a mirror just duplicates the mirror cells instead of adding coverage.
const SHOOTING_2010s = legalFive(ofDecade("2010s"), (p) => (p.pts ?? 0) + (p.an1 ?? 0) * 3 - (p.reb ?? 0) * 1.5);
const INTERIOR_2010s = legalFive(without(ofDecade("2010s"), SHOOTING_2010s), (p) => (p.reb ?? 0) * 2 + (p.blk ?? 0) * 4 - (p.pts ?? 0) * 0.5);
const CREATOR_HEAVY_2010s = legalFive(ofDecade("2010s"), (p) => (p.pts ?? 0) * 2 + (p.ast ?? 0) * 2);
const BALANCED_2010s = legalFive(without(ofDecade("2010s"), CREATOR_HEAVY_2010s), (p) => (p.ast ?? 0) + (p.reb ?? 0) - Math.abs((p.pts ?? 0) - 18));
const SIZE_1990s = legalFive(ofDecade("1990s"), (p) => (p.reb ?? 0) * 2 + (p.blk ?? 0) * 3);
const SMALLBALL_2020s = legalFive(ofDecade("2020s"), (p) => (p.ast ?? 0) * 2 + (p.stl ?? 0) * 3 - (p.reb ?? 0) * 1.5);
const CLASSIC_1960s = legalFive(ofDecade("1960s"), scorer);
const CLASSIC_1980s = legalFive(ofDecade("1980s"), scorer);

export const ARCHETYPES = Object.freeze({
  BALANCED_2010s, CREATOR_HEAVY_2010s, SHOOTING_2010s, INTERIOR_2010s,
  SIZE_1990s, SMALLBALL_2020s, CLASSIC_1960s, CLASSIC_1980s,
});

export const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
export const COACH_PAIRS = [
  ["steve-kerr", "tom-thibodeau"],
  ["phil-jackson", "gregg-popovich"],
  ["red-auerbach", "pat-riley"],
  ["neutral", "neutral"],
];

/**
 * Cells span era, matchup style, coach and defensive scheme. A cell that
 * produced a mirror (identical teams) is kept deliberately: it is the purest
 * test, because any deviation from 50% there cannot be a team-quality effect.
 */
export const buildCells = (mode = "all") => {
  const cells = [];
  const push = (c) => cells.push(c);

  // Mirror cells — identical rosters and coaches, one per era.
  for (const era of ERAS) {
    push({ id: `mirror-${era}`, kind: "MIRROR", era,
      a: ARCHETYPES.SHOOTING_2010s, b: ARCHETYPES.SHOOTING_2010s,
      coachA: "steve-kerr", coachB: "steve-kerr", zone: false });
  }
  if (mode === "fast") return cells;

  // Style contrasts across eras.
  const styleMatchups = [
    ["BALANCED_2010s", "CREATOR_HEAVY_2010s"],
    ["SHOOTING_2010s", "INTERIOR_2010s"],
    ["SIZE_1990s", "SMALLBALL_2020s"],
    ["CLASSIC_1960s", "CLASSIC_1980s"],
  ];
  for (const era of ERAS) {
    for (const [x, y] of styleMatchups) {
      push({ id: `style-${x}-vs-${y}-${era}`, kind: "STYLE", era,
        a: ARCHETYPES[x], b: ARCHETYPES[y], coachA: "steve-kerr", coachB: "tom-thibodeau", zone: false });
    }
  }
  // Coach contrasts, held to one era so the coach is the only variable.
  for (const [ca, cb] of COACH_PAIRS) {
    push({ id: `coach-${ca}-vs-${cb}`, kind: "COACH", era: "2010s",
      a: ARCHETYPES.BALANCED_2010s, b: ARCHETYPES.SHOOTING_2010s, coachA: ca, coachB: cb, zone: false });
  }
  // Zone-legal eras only — zone is illegal in several, and measuring a shell
  // where the rules forbid it would report a flat zero and look like evidence.
  for (const era of ["1950s", "2000s", "2010s", "2020s"]) {
    push({ id: `zone-${era}`, kind: "ZONE", era,
      a: ARCHETYPES.SHOOTING_2010s, b: ARCHETYPES.INTERIOR_2010s,
      coachA: "steve-kerr", coachB: "tom-thibodeau", zone: true });
  }
  return cells;
};

// ── One paired trial ────────────────────────────────────────────────────────
const play = (goldIds, blueIds, coachGoldId, coachBlueId, era, seed, opts) =>
  runPossessionGame(buildPossessionInput({
    goldIds, blueIds, coachGoldId, coachBlueId, eraStyleId: era, simulationSeed: seed,
    zoneResolution: opts?.zone !== false,
  }), { includeLedger: true });

const summarise = (g) => ({
  goldPts: g.finalScore.gold, bluePts: g.finalScore.blue,
  goldPoss: g.gold.totals.possessions, bluePoss: g.blue.totals.possessions,
  overtimes: g.overtimes ?? 0,
  firstOffense: g.possessionLedger?.[0]?.offense ?? null,
  otFirstOffense: (g.overtimes > 0 && g.possessionLedger)
    ? (g.possessionLedger.find((p) => p.period === 5)?.offense ?? null) : null,
  invariantViolations: (g.invariantViolations ?? []).length,
  tie: g.finalScore.gold === g.finalScore.blue,
});

/** Runs `pairs` paired trials for one cell and accumulates orientation metrics. */
export const measureCell = (cell, pairs, seedOffset = 0) => {
  const acc = {
    id: cell.id, kind: cell.kind, era: cell.era, zone: !!cell.zone,
    games: 0, goldWins: 0, blueWins: 0, ties: 0,
    goldMarginSum: 0, goldPossSum: 0, bluePossSum: 0,
    goldFirstOffense: 0, otGames: 0, otGoldFirst: 0, otGoldWins: 0,
    aWinsAsGold: 0, aWinsAsBlue: 0, invariantViolations: 0,
  };
  // A mirror cell has identical rosters AND identical coaches, so swapping the
  // sides produces byte-identical inputs — the "pair" is the same game twice.
  // Counting both would halve the true independent sample while reporting the
  // full one, which inflates significance on exactly the cells that matter most.
  // Mirrors run one orientation per seed instead; the gold win rate then
  // measures side bias directly, with no team-quality component to cancel.
  const degenerate = JSON.stringify(cell.a) === JSON.stringify(cell.b) && cell.coachA === cell.coachB;
  acc.degeneratePair = degenerate;
  const orientations = degenerate
    ? [["A", cell.a, cell.b, cell.coachA, cell.coachB]]
    : [["A", cell.a, cell.b, cell.coachA, cell.coachB],
       ["B", cell.b, cell.a, cell.coachB, cell.coachA]];
  const iterations = degenerate ? pairs * 2 : pairs;

  for (let i = 0; i < iterations; i++) {
    const seed = domainSeed(MASTERS["actual-game"], "actual-game", seedOffset + i);
    for (const [orient, goldIds, blueIds, cg, cb] of orientations) {
      const s = summarise(play(goldIds, blueIds, cg, cb, cell.era, seed, cell));
      acc.games++;
      acc.invariantViolations += s.invariantViolations;
      if (s.tie) acc.ties++;
      else if (s.goldPts > s.bluePts) acc.goldWins++;
      else acc.blueWins++;
      acc.goldMarginSum += s.goldPts - s.bluePts;
      acc.goldPossSum += s.goldPoss; acc.bluePossSum += s.bluePoss;
      if (s.firstOffense === "gold") acc.goldFirstOffense++;
      if (s.overtimes > 0) {
        acc.otGames++;
        if (s.otFirstOffense === "gold") acc.otGoldFirst++;
        if (s.goldPts > s.bluePts) acc.otGoldWins++;
      }
      // Team A's record in each slot, which isolates side from team quality.
      if (orient === "A" && s.goldPts > s.bluePts) acc.aWinsAsGold++;
      if (orient === "B" && s.bluePts > s.goldPts) acc.aWinsAsBlue++;
    }
  }
  return acc;
};

// ── Worker plumbing ─────────────────────────────────────────────────────────
if (!isMainThread) {
  const { cell, pairs, seedOffset } = workerData;
  parentPort.postMessage(measureCell(cell, pairs, seedOffset));
}

// ── Statistics ──────────────────────────────────────────────────────────────
export const wilson = (w, n, z = 1.96) => {
  if (!(n > 0)) return { lower: null, upper: null };
  const p = w / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const s = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lower: r4(Math.max(0, c - s)), upper: r4(Math.min(1, c + s)) };
};

/** Two-sided binomial p-value against p=0.5, normal approximation (n is large). */
export const binomP = (w, n) => {
  if (!(n > 0)) return 1;
  const z = Math.abs((w - n / 2) / Math.sqrt(n / 4));
  // Abramowitz-Stegun erfc approximation.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-((z / Math.SQRT2) ** 2));
  return Math.max(0, Math.min(1, 1 - y));
};

/** Benjamini-Hochberg: with ~30 cells, uncorrected testing manufactures findings. */
export const benjaminiHochberg = (pvals, fdr) => {
  const idx = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const m = pvals.length;
  let kMax = -1;
  idx.forEach((e, rank) => { if (e.p <= ((rank + 1) / m) * fdr) kMax = rank; });
  const sig = new Array(m).fill(false);
  for (let r = 0; r <= kMax; r++) sig[idx[r].i] = true;
  return sig;
};

export const aggregate = (cells) => {
  const tot = cells.reduce((a, c) => ({
    games: a.games + c.games, goldWins: a.goldWins + c.goldWins, blueWins: a.blueWins + c.blueWins,
    ties: a.ties + c.ties, goldMarginSum: a.goldMarginSum + c.goldMarginSum,
    goldPossSum: a.goldPossSum + c.goldPossSum, bluePossSum: a.bluePossSum + c.bluePossSum,
    goldFirstOffense: a.goldFirstOffense + c.goldFirstOffense,
    otGames: a.otGames + c.otGames, otGoldFirst: a.otGoldFirst + c.otGoldFirst, otGoldWins: a.otGoldWins + c.otGoldWins,
    invariantViolations: a.invariantViolations + c.invariantViolations,
  }), { games: 0, goldWins: 0, blueWins: 0, ties: 0, goldMarginSum: 0, goldPossSum: 0, bluePossSum: 0, goldFirstOffense: 0, otGames: 0, otGoldFirst: 0, otGoldWins: 0, invariantViolations: 0 });

  const decided = tot.goldWins + tot.blueWins;
  const goldRate = tot.goldWins / decided;
  const ci = wilson(tot.goldWins, decided);

  // Per-cell gold advantage in percentage points, and whether the sign is
  // consistent — one noisy cell is noise, thirty leaning the same way is a bug.
  const perCell = cells.map((c) => {
    const d = c.goldWins + c.blueWins;
    const rate = d ? c.goldWins / d : null;
    return { ...c, decided: d, goldRate: r4(rate), advantagePp: r4((rate - 0.5) * 100),
      ci: wilson(c.goldWins, d), p: binomP(c.goldWins, d) };
  });
  const sig = benjaminiHochberg(perCell.map((c) => c.p), SIDE_SYMMETRY.perCellFalseDiscoveryRate);
  perCell.forEach((c, i) => { c.significantAfterBH = sig[i]; });

  const advs = perCell.map((c) => c.advantagePp).filter((x) => x != null);
  const mean = advs.reduce((a, b) => a + b, 0) / advs.length;
  const sd = Math.sqrt(advs.reduce((a, b) => a + (b - mean) ** 2, 0) / (advs.length - 1));
  const se = sd / Math.sqrt(advs.length);
  const sameDir = Math.max(advs.filter((x) => x > 0).length, advs.filter((x) => x < 0).length) / advs.length;

  return {
    games: tot.games, decided, ties: tot.ties,
    goldWinRate: r4(goldRate),
    goldAdvantagePp: r4((goldRate - 0.5) * 100),
    ci95Pp: { lower: r4((ci.lower - 0.5) * 100), upper: r4((ci.upper - 0.5) * 100) },
    meanScoreMarginDifference: r4(tot.goldMarginSum / tot.games),
    possessionDifference: r4((tot.goldPossSum - tot.bluePossSum) / tot.games),
    goldFirstOffenseRate: r4(tot.goldFirstOffense / tot.games),
    firstPossessionImbalancePp: r4((tot.goldFirstOffense / tot.games - 0.5) * 100),
    overtimeGames: tot.otGames,
    overtimeGoldFirstRate: tot.otGames ? r4(tot.otGoldFirst / tot.otGames) : null,
    overtimeGoldWinRate: tot.otGames ? r4(tot.otGoldWins / tot.otGames) : null,
    overtimeSideAdvantagePp: tot.otGames ? r4((tot.otGoldWins / tot.otGames - 0.5) * 100) : null,
    invariantViolations: tot.invariantViolations,
    systematic: { meanCellAdvantagePp: r4(mean), sd: r4(sd), standardError: r4(se),
      tStatistic: r4(se > 0 ? mean / se : 0), sameDirectionFraction: r4(sameDir), cells: advs.length },
    perCell,
  };
};

export const evaluateGate = (a) => ({
  aggregateAdvantageWithinTolerance: Math.abs(a.goldAdvantagePp) <= SIDE_SYMMETRY.maxAggregateGoldAdvantagePp,
  aggregateCiContained: Math.abs(a.ci95Pp.lower) <= SIDE_SYMMETRY.aggregateCiMustFitWithinPp
    && Math.abs(a.ci95Pp.upper) <= SIDE_SYMMETRY.aggregateCiMustFitWithinPp,
  notSystematic: Math.abs(a.systematic.tStatistic) <= SIDE_SYMMETRY.maxSystematicTStatistic
    && a.systematic.sameDirectionFraction <= SIDE_SYMMETRY.maxSameDirectionCellFraction,
  scoreMarginWithinTolerance: Math.abs(a.meanScoreMarginDifference) <= SIDE_SYMMETRY.maxMeanScoreMarginDifference,
  possessionsWithinTolerance: Math.abs(a.possessionDifference) <= SIDE_SYMMETRY.maxPossessionCountDifference,
  firstPossessionFair: Math.abs(a.firstPossessionImbalancePp) <= SIDE_SYMMETRY.maxFirstPossessionImbalancePp,
  overtimeFair: a.overtimeSideAdvantagePp == null
    || Math.abs(a.overtimeSideAdvantagePp) <= SIDE_SYMMETRY.maxOvertimeSideAdvantagePp,
  sampleSufficient: a.games >= SIDE_SYMMETRY.minPairedGamesAggregate,
  noInvariantViolations: a.invariantViolations === 0,
  noTies: a.ties === 0,
});

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const perCellGames = Number(arg("games", SIDE_SYMMETRY.minPairedGamesPerMajorCell));
  const cells = buildCells(arg("cells", "all"));
  const label = arg("label", "baseline");
  const pairs = Math.ceil(perCellGames / 2);

  console.log(`SIDE SYMMETRY — ${cells.length} cells x ${pairs * 2} paired games = ${cells.length * pairs * 2} total`);
  console.log(`  policy: aggregate <= ${SIDE_SYMMETRY.maxAggregateGoldAdvantagePp}pp, CI within +-${SIDE_SYMMETRY.aggregateCiMustFitWithinPp}pp, min ${SIDE_SYMMETRY.minPairedGamesAggregate} games\n`);

  const self = fileURLToPath(import.meta.url);
  const poolSize = Math.max(1, Math.min(cells.length, cpus().length - 2));
  const queue = [...cells.entries()];
  const results = new Array(cells.length);
  let done = 0;
  const t0 = Date.now();

  await new Promise((resolve, reject) => {
    let active = 0;
    const next = () => {
      if (!queue.length && active === 0) return resolve();
      while (queue.length && active < poolSize) {
        const [i, cell] = queue.shift();
        active++;
        const w = new Worker(self, { workerData: { cell, pairs, seedOffset: 0 } });
        w.on("message", (m) => { results[i] = m; done++; process.stdout.write(`\r  ${done}/${cells.length} cells`); });
        w.on("error", reject);
        w.on("exit", () => { active--; next(); });
      }
    };
    next();
  });

  const elapsed = Date.now() - t0;
  const a = aggregate(results);
  const gate = evaluateGate(a);

  console.log(`\n\n  games ${a.games} (${a.decided} decided, ${a.ties} ties) in ${(elapsed / 1000).toFixed(1)}s\n`);
  console.log(`  GOLD win rate              ${a.goldWinRate}   advantage ${a.goldAdvantagePp >= 0 ? "+" : ""}${a.goldAdvantagePp}pp`);
  console.log(`  95% CI                     ${a.ci95Pp.lower >= 0 ? "+" : ""}${a.ci95Pp.lower}pp .. ${a.ci95Pp.upper >= 0 ? "+" : ""}${a.ci95Pp.upper}pp`);
  console.log(`  mean score margin (gold)   ${a.meanScoreMarginDifference >= 0 ? "+" : ""}${a.meanScoreMarginDifference} pts`);
  console.log(`  possession difference      ${a.possessionDifference >= 0 ? "+" : ""}${a.possessionDifference} per game`);
  console.log(`  gold gets 1st possession   ${a.goldFirstOffenseRate}   (${a.firstPossessionImbalancePp >= 0 ? "+" : ""}${a.firstPossessionImbalancePp}pp)`);
  console.log(`  overtime games             ${a.overtimeGames}`);
  console.log(`  overtime gold-first rate   ${a.overtimeGoldFirstRate}`);
  console.log(`  overtime gold win rate     ${a.overtimeGoldWinRate}   (${a.overtimeSideAdvantagePp >= 0 ? "+" : ""}${a.overtimeSideAdvantagePp}pp)`);
  console.log(`  invariant violations       ${a.invariantViolations}`);
  console.log(`\n  systematic across ${a.systematic.cells} cells: mean ${a.systematic.meanCellAdvantagePp >= 0 ? "+" : ""}${a.systematic.meanCellAdvantagePp}pp +- ${a.systematic.standardError}  t=${a.systematic.tStatistic}  same-direction ${a.systematic.sameDirectionFraction}`);

  const flagged = a.perCell.filter((c) => Math.abs(c.advantagePp) > SIDE_SYMMETRY.perCellPracticalEffectPp);
  console.log(`\n  cells beyond +-${SIDE_SYMMETRY.perCellPracticalEffectPp}pp: ${flagged.length} of ${a.perCell.length}   (BH-significant: ${a.perCell.filter((c) => c.significantAfterBH).length})`);
  for (const c of [...a.perCell].sort((x, y) => Math.abs(y.advantagePp) - Math.abs(x.advantagePp)).slice(0, 12)) {
    console.log(`    ${c.id.padEnd(44)} ${String(c.advantagePp >= 0 ? "+" + c.advantagePp : c.advantagePp).padStart(8)}pp  p=${c.p.toFixed(4)}${c.significantAfterBH ? "  BH-SIG" : ""}`);
  }

  console.log(`\n  gate:`);
  for (const [k, v] of Object.entries(gate)) console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
  const passed = Object.values(gate).every(Boolean);
  console.log(`\n  SIDE SYMMETRY GATE: ${passed ? "PASS" : "FAIL"}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/side-symmetry-${label}.json`, JSON.stringify({
    policy: SIDE_SYMMETRY, label, perCellGames: pairs * 2, elapsedMs: elapsed, aggregate: a, gate, passed,
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/side-symmetry-${label}.json`);
}
