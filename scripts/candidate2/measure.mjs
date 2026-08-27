#!/usr/bin/env node
// ── The candidate measurement harness ───────────────────────────────────────
//   node scripts/candidate2/measure.mjs --out=<path> [--pairs=800]
//
// Runs identically under Candidate 1 and Candidate 2 on identical seeds, so the
// comparison is a comparison. Written as a standalone file with no artifact
// dependencies so it can be copied into a worktree at the parent commit.
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { versionOf } from "../../src/versions.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import COACH_DATA from "../../src/v3/data/coaches.js";
import { coachToolkit } from "../../src/v3/defense/scheme.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const M = 0x6c4c10;
const S = { ladderA: 1, ladderD: 4, controlsA: 2, controlsD: 5, comparison: 7, tails: 8, sym: 9, comp: 10 };
const seedAt = (k, i) => deriveSeed(M + k * 0x1000, i);

const spearman = (xs, ys) => {
  const rank = (v) => { const s = [...v].map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length); let i = 0;
    while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j += 1;
      const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) r[s[k][1]] = avg; i = j + 1; }
    return r; };
  const a = rank(xs), b = rank(ys); const ma = mean(a), mb = mean(b);
  const num = a.reduce((s2, x, i) => s2 + (x - ma) * (b[i] - mb), 0);
  const den = Math.sqrt(a.reduce((s2, x) => s2 + (x - ma) ** 2, 0) * b.reduce((s2, x) => s2 + (x - mb) ** 2, 0));
  return den ? r5(num / den) : null;
};

// ── rosters, all public cards, none from any holdout ────────────────────────
const R = {
  passingHub: ["cp3-10s", "klay-10s", "butler-10s", "jokic-10s", "dwight-10s"],
  isoHeavy: ["kyrie-10s", "demar-2010s", "melo-10s", "love-10s", "dwight-10s"],
  secondaryHigh: ["nash-00s", "manu-00s", "pippen-90s", "draymond-10s", "jokic-10s"],
  secondaryLow: ["harden-10s", "beal-20s", "melo-10s", "love-10s", "dj-10s"],
  strongDefence: ["gary-90s", "kawhi-10s", "pippen-90s", "draymond-10s", "gobert-10s"],
  weakDefence: ["nash-00s", "beal-20s", "melo-10s", "love-10s", "jokic-10s"],
  rimStrong: ["beal-20s", "demar-2010s", "melo-10s", "draymond-10s", "gobert-10s"],
  perimStrong: ["gary-90s", "kawhi-10s", "pippen-90s", "love-10s", "jokic-10s"],
  rebStrong: ["nash-00s", "beal-20s", "pippen-90s", "moses-80s", "dwight-10s"],
  pressStrong: ["gary-90s", "manu-00s", "kawhi-10s", "draymond-10s", "jokic-10s"],
  neutralOpp: ["bibby-00s", "monroe-70s", "cooper-80s", "mcHale-80s", "elvin-70s"],
};
const bm = (c) => (c === "neutral" ? 5 : COACH_DATA.coaches.find((x) => x.id === c)?.offense?.ballMovement ?? 5);
const help = (c) => (c === "neutral" ? 5 : coachToolkit(COACH_DATA.coaches.find((x) => x.id === c)).helpAggression);

const play = ({ aIds, bIds, aCoach, bCoach, era, stream, offset, pairs }) => {
  const games = []; const aSide = [];
  for (let i = 0; i < pairs; i += 1) {
    const seed = seedAt(stream, offset + i);
    games.push(runPossessionGame(buildPossessionInput({ goldIds: aIds, blueIds: bIds,
      coachGoldId: aCoach, coachBlueId: bCoach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false }));
    aSide.push("gold");
    games.push(runPossessionGame(buildPossessionInput({ goldIds: bIds, blueIds: aIds,
      coachGoldId: bCoach, coachBlueId: aCoach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false }));
    aSide.push("blue");
  }
  return { games, aSide };
};

const offenceOf = (games, sideOf) => {
  let ast = 0, fgm = 0, pts = 0, poss = 0, elig = 0, credited = 0, makes = 0, to = 0, fga = 0;
  const fam = new Map();
  for (const [gi, g] of games.entries()) {
    const side = sideOf(gi);
    for (const rec of g.possessionLedger ?? []) {
      if (rec.offense !== side) continue;
      poss += 1; pts += rec.points ?? 0;
      const f = rec.action ?? "UNK"; fam.set(f, (fam.get(f) ?? 0) + 1);
      const hasP = rec.secondary != null && rec.secondary !== rec.primary;
      if (hasP) elig += 1;
      if (rec.outcome === "MADE_FG") { makes += 1; if (rec.assist != null) credited += 1; }
      if (rec.outcome === "MADE_FG" || String(rec.outcome ?? "").includes("MISS")) fga += 1;
      if (String(rec.outcome ?? "").includes("TURNOVER")) to += 1;
    }
    ast += g[side].totals.ast; fgm += g[side].totals.fgm;
  }
  const total = [...fam.values()].reduce((a, b) => a + b, 0);
  const shares = [...fam.entries()].map(([k, v]) => [k, v / total]).sort((a, b) => b[1] - a[1]);
  const entropy = -shares.reduce((a, [, p]) => a + (p > 0 ? p * Math.log(p) : 0), 0);
  return { assistedRate: r5(fgm ? ast / fgm : null), ppp: r5(pts / poss),
    eligibleRate: r5(elig / poss), assistCreditRate: r5(elig ? credited / elig : null),
    turnoverRate: r5(to / poss), fgaPerPossession: r5(fga / poss),
    astLeFgm: ast <= fgm, maxActionShare: r5(shares[0]?.[1] ?? null),
    actionEntropy: r5(entropy), possessions: poss, games: games.length };
};
const defenceOf = (games, defSideOf) => {
  let pts = 0, poss = 0, fga = 0, fgm = 0, to = 0;
  for (const [gi, g] of games.entries()) {
    const d = defSideOf(gi); const o = d === "gold" ? "blue" : "gold";
    for (const rec of g.possessionLedger ?? []) {
      if (rec.offense !== o) continue;
      poss += 1; pts += rec.points ?? 0;
      if (rec.outcome === "MADE_FG" || String(rec.outcome ?? "").includes("MISS")) fga += 1;
      if (rec.outcome === "MADE_FG") fgm += 1;
      if (String(rec.outcome ?? "").includes("TURNOVER")) to += 1;
    }
  }
  return { opponentPpp: r5(pts / poss), opponentFgPct: r5(fga ? fgm / fga : null),
    turnoverForcedRate: r5(to / poss), possessions: poss };
};
const structuralOf = (games) => {
  let inv = 0, ties = 0, neg = 0, nf = 0, astGtFgm = 0;
  for (const g of games) {
    inv += (g.invariantViolations ?? []).length;
    if (g.finalScore.gold === g.finalScore.blue) ties += 1;
    for (const s of ["gold", "blue"]) {
      const t = g[s].totals;
      if ((t.ast ?? 0) > (t.fgm ?? 0)) astGtFgm += 1;
      for (const v of Object.values(t)) {
        if (typeof v === "number" && v < 0) neg += 1;
        if (typeof v === "number" && !Number.isFinite(v)) nf += 1;
      }
    }
  }
  return { invariantViolations: inv, finalTies: ties, negativeStats: neg, nonFiniteStats: nf, astGtFgm };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const out = arg("out", null); const pairs = Number(arg("pairs", 800));
  if (!out) { console.error("--out=<path> required"); process.exit(2); }
  const t0 = performance.now();
  const def = defaultRuntimeParameterSet();

  const A_LADDER = ["jerry-sloan", "neutral", "mike-dantoni", "rick-adelman", "gregg-popovich", "steve-kerr", "doug-moe"];
  const D_LADDER = ["doug-moe", "gregg-popovich", "neutral", "doc-rivers", "george-karl", "tom-thibodeau"];

  const assistLadder = A_LADDER.map((c, i) => {
    const p = play({ aIds: R.passingHub, bIds: R.neutralOpp, aCoach: c, bCoach: "neutral",
      era: "2010s", stream: S.ladderA, offset: i * 100000, pairs });
    return { coachId: c, ballMovement: bm(c), ...offenceOf(p.games, (k) => p.aSide[k]),
      structural: structuralOf(p.games) };
  });
  const defLadder = D_LADDER.map((c, i) => {
    const p = play({ aIds: R.strongDefence, bIds: R.neutralOpp, aCoach: c, bCoach: "neutral",
      era: "2010s", stream: S.ladderD, offset: i * 100000, pairs });
    return { coachId: c, helpIntent: help(c), ...defenceOf(p.games, (k) => p.aSide[k]),
      structural: structuralOf(p.games) };
  });

  const AO_CELLS = [
    ["AO-1", "gregg-popovich", "passingHub"], ["AO-2", "gregg-popovich", "isoHeavy"],
    ["AO-3", "neutral", "passingHub"], ["AO-4", "mike-dantoni", "passingHub"],
    ["AO-5", "neutral", "secondaryHigh"], ["AO-6", "neutral", "secondaryLow"],
  ];
  const aoControls = AO_CELLS.map(([id, coach, roster], i) => {
    const p = play({ aIds: R[roster], bIds: R.neutralOpp, aCoach: coach, bCoach: "neutral",
      era: "2010s", stream: S.controlsA, offset: i * 100000, pairs });
    return { cellId: id, coach, roster, ballMovement: bm(coach),
      ...offenceOf(p.games, (k) => p.aSide[k]), structural: structuralOf(p.games) };
  });

  const DS_CELLS = [
    ["DS-1", "strongDefence", "tom-thibodeau"], ["DS-2", "strongDefence", "neutral"],
    ["DS-3", "weakDefence", "tom-thibodeau"], ["DS-4", "weakDefence", "neutral"],
    ["DS-5", "rimStrong", "neutral"], ["DS-6", "perimStrong", "neutral"],
    ["DS-7", "rebStrong", "neutral"], ["DS-8", "pressStrong", "neutral"],
  ];
  const dsControls = DS_CELLS.map(([id, roster, coach], i) => {
    const p = play({ aIds: R[roster], bIds: R.neutralOpp, aCoach: coach, bCoach: "neutral",
      era: "2010s", stream: S.controlsD, offset: i * 100000, pairs });
    return { cellId: id, roster, coach, helpIntent: help(coach),
      ...defenceOf(p.games, (k) => p.aSide[k]), structural: structuralOf(p.games) };
  });

  // era expression and league-wide scoring, to catch universal inflation
  const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
  const eraCells = ERAS.map((era, i) => {
    const p = play({ aIds: R.passingHub, bIds: R.neutralOpp, aCoach: "neutral", bCoach: "neutral",
      era, stream: S.comparison, offset: i * 100000, pairs: Math.max(120, Math.floor(pairs / 4)) });
    const combined = p.games.map((g) => g.finalScore.gold + g.finalScore.blue);
    return { era, ...offenceOf(p.games, (k) => p.aSide[k]),
      meanCombinedScore: r5(mean(combined)), structural: structuralOf(p.games) };
  });

  // mirror side symmetry
  const symCells = [["2010s", "tom-thibodeau"], ["2010s", "steve-kerr"], ["2010s", "neutral"],
    ["1960s", "red-auerbach"], ["2020s", "doc-rivers"]].map(([era, coach], i) => {
    let gold = 0, decided = 0, ties = 0;
    const n = Math.max(600, pairs * 2);
    for (let k = 0; k < n; k += 1) {
      const g = runPossessionGame(buildPossessionInput({ goldIds: R.passingHub, blueIds: R.passingHub,
        coachGoldId: coach, coachBlueId: coach, eraStyleId: era, simulationSeed: seedAt(S.sym, i * 100000 + k) }),
        { includeLedger: false, assertInvariants: false });
      if (g.finalScore.gold === g.finalScore.blue) { ties += 1; continue; }
      decided += 1; if (g.finalScore.gold > g.finalScore.blue) gold += 1;
    }
    const p = gold / decided; const se = Math.sqrt(p * (1 - p) / decided);
    return { era, coach, games: n, decided, ties, goldWinRate: r5(p),
      ci95: { lower: r5(p - 1.96 * se), upper: r5(p + 1.96 * se) },
      containsHalf: p - 1.96 * se <= 0.5 && p + 1.96 * se >= 0.5 };
  });

  // replay exactness
  let replayMismatch = 0;
  for (let i = 0; i < 64; i += 1) {
    const seed = seedAt(S.comparison, 900000 + i);
    const mk = () => runPossessionGame(buildPossessionInput({ goldIds: R.passingHub, blueIds: R.neutralOpp,
      coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau", eraStyleId: "2010s", simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false });
    const a = mk(), b = mk();
    if (JSON.stringify(a.finalScore) !== JSON.stringify(b.finalScore)
      || JSON.stringify(a.gold.totals) !== JSON.stringify(b.gold.totals)
      || JSON.stringify(a.blue.totals) !== JSON.stringify(b.blue.totals)) replayMismatch += 1;
  }

  // competition modes
  let seriesGames = 0, seriesInv = 0; const seriesLen = [];
  for (let s = 0; s < 200; s += 1) {
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: R.passingHub, blueIds: R.neutralOpp,
      coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau", eraStyleId: "1990s",
      simulationSeed: seedAt(S.comp, s), mode: "best7" }), { games: 7, opts: { assertInvariants: false, includeLedger: false } });
    let a = 0, b = 0, played = 0;
    for (const g of gs) { played += 1; seriesGames += 1; seriesInv += (g.invariantViolations ?? []).length;
      if (g.finalScore.gold > g.finalScore.blue) a += 1; else b += 1; if (a === 4 || b === 4) break; }
    seriesLen.push(played);
  }
  let seasonGames = 0, seasonInv = 0; const seasonWins = [];
  for (let s = 0; s < 50; s += 1) {
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: R.passingHub, blueIds: R.passingHub,
      coachGoldId: "neutral", coachBlueId: "neutral", eraStyleId: "2010s",
      simulationSeed: seedAt(S.comp, 500000 + s), mode: "82" }), { games: 82, opts: { assertInvariants: false, includeLedger: false } });
    let w = 0;
    for (const g of gs) { seasonGames += 1; seasonInv += (g.invariantViolations ?? []).length;
      if (g.finalScore.gold > g.finalScore.blue) w += 1; }
    seasonWins.push(w);
  }

  const allStructural = [...assistLadder, ...defLadder, ...aoControls, ...dsControls, ...eraCells]
    .map((x) => x.structural);
  const totals = allStructural.reduce((a, s) => {
    for (const [k, v] of Object.entries(s)) a[k] = (a[k] ?? 0) + v; return a; }, {});
  const secs = (performance.now() - t0) / 1000;
  const totalGames = [...assistLadder, ...defLadder, ...aoControls, ...dsControls, ...eraCells]
    .reduce((a, x) => a + (x.games ?? 0), 0) + symCells.reduce((a, x) => a + x.games, 0) + seriesGames + seasonGames;

  const payload = {
    candidateMeasurementVersion: "1.0.0",
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    possessionEngineVersion: versionOf("possessionEngineVersion"),
    defensiveMatchupVersion: versionOf("defensiveMatchupVersion"),
    parameterSetHash: def.parameterSetHash,
    pairsPerCell: pairs,
    assistLadder,
    assistLadderStatistics: { spearman: spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.assistedRate)),
      range: r5(Math.max(...assistLadder.map((x) => x.assistedRate)) - Math.min(...assistLadder.map((x) => x.assistedRate))),
      creditSpearman: spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.assistCreditRate)),
      creationSpearman: spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.eligibleRate)) },
    defLadder,
    defLadderStatistics: { spearman: spearman(defLadder.map((x) => x.helpIntent), defLadder.map((x) => x.opponentPpp)),
      range: r5(Math.max(...defLadder.map((x) => x.opponentPpp)) - Math.min(...defLadder.map((x) => x.opponentPpp))) },
    assistedOffenseControls: aoControls,
    defensiveControls: dsControls,
    eraCells,
    eraSpread: r5(Math.max(...eraCells.map((x) => x.ppp)) - Math.min(...eraCells.map((x) => x.ppp))),
    meanCombinedScoreAcrossEras: r5(mean(eraCells.map((x) => x.meanCombinedScore))),
    sideSymmetry: symCells,
    replay: { seedsChecked: 64, mismatches: replayMismatch },
    competition: { seriesCount: 200, seriesGames, seriesInvariants: seriesInv,
      meanSeriesLength: r5(mean(seriesLen)),
      seasonCount: 50, seasonGames, seasonInvariants: seasonInv,
      meanSeasonWins: r5(mean(seasonWins)), minSeasonWins: Math.min(...seasonWins), maxSeasonWins: Math.max(...seasonWins) },
    structuralTotals: totals,
    performance: { seconds: r5(secs), totalGames, gamesPerSecond: r5(totalGames / secs) },
  };
  payload.measurementHash = createHash("sha256").update(JSON.stringify({
    a: assistLadder.map((x) => [x.coachId, x.assistedRate]),
    d: defLadder.map((x) => [x.coachId, x.opponentPpp]) })).digest("hex");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`  calibration ${payload.calibrationVersion}  assistRho ${payload.assistLadderStatistics.spearman}  defRho ${payload.defLadderStatistics.spearman}`);
  console.log(`  ${totalGames.toLocaleString()} games in ${r5(secs)}s (${r5(totalGames / secs)} games/sec), replay mismatches ${replayMismatch}`);
}
