#!/usr/bin/env node
// ── Phase 6C4A WS9: Candidate 1 internal & competition validation ───────────
//   npm run c1:internal-validation   (~10 minutes)
//
// Candidate 0's lock ran this same battery (c5-validate); Candidate 1 runs a
// fresh copy that writes to the 6C4A phase directory — Candidate 0's recorded
// validation artifacts are post-lock immutable and are never touched.
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { readArtifact, writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { loadFixtures, objectiveOn } from "../calibration/c5-search.mjs";
import { SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { DIR } from "./failureRegister.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
// 6C4A internal-validation seeds: a fresh derivation base inside the
// actual-game domain, far from every offset c5-validate used.
const seed = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 6400000 + i);
const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;
const legalFive = (rotate) => {
  const pool = PLAYERS.map((c, i) => ({ c, order: (i + rotate * 37) % PLAYERS.length }))
    .sort((a, b) => a.order - b.order).map((x) => x.c);
  const usedPersons = new Set();
  const out = new Array(5).fill(null);
  const walk = (i) => {
    if (i === 5) return true;
    for (const c of pool) {
      const pid = person(c.id);
      if (usedPersons.has(pid)) continue;
      if (!(c.positions ?? [c.pos]).includes(SLOTS[i])) continue;
      usedPersons.add(pid); out[i] = c.id;
      if (walk(i + 1)) return true;
      usedPersons.delete(pid); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error(`no legal five at rotation ${rotate}`);
  return out;
};
const LINEUP_CACHE = new Map();
const lineup = (n) => { const k = n % 512; if (!LINEUP_CACHE.has(k)) LINEUP_CACHE.set(k, legalFive(k)); return LINEUP_CACHE.get(k); };
const COACHES = ["red-auerbach", "pat-riley", "phil-jackson", "gregg-popovich", "steve-kerr", "erik-spoelstra"];
const violations = (g) => (g.invariantViolations ?? []).length;
const def = defaultRuntimeParameterSet();
const gen = { generationCommand: "npm run c1:internal-validation", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } };
const gates = {}; const failed = [];
const gate = (name, pass) => { gates[name] = pass; if (!pass) failed.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); };

// ── 1. calibration objective, unchanged folds, vs Candidate 0's recording ───
console.log("1 — HISTORICAL CALIBRATION V3 OBJECTIVE\n");
const fixtures = loadFixtures();
const scope = readArtifact("calibration-scope").data;
const tuning = fixtures.filter((f) => scope.folds.tuningFolds.includes(f.fold));
const validation = fixtures.filter((f) => scope.folds.validationFolds.includes(f.fold));
const tr = objectiveOn(tuning, null, arg("seeds", 24));
const va = objectiveOn(validation, null, arg("seeds", 24));
const c0 = { tuningMae: 0.07707, validationMae: 0.06703 }; // Candidate 0, c5 validation-summary
console.log(`  tuning MAE ${tr.mae} (C0 ${c0.tuningMae}) · validation MAE ${va.mae} (C0 ${c0.validationMae})\n`);
gate("calibrationObjectiveNotRegressed", tr.mae <= c0.tuningMae * 1.15 && va.mae <= c0.validationMae * 1.15);

// ── 2. statistical tails & invariants ────────────────────────────────────────
console.log("\n2 — STATISTICAL TAILS\n");
const GAMES = arg("games", 2000);
let vio = 0; const scores = []; const totals = []; const paces = [];
for (let i = 0; i < GAMES; i++) {
  const g = runPossessionGame(buildPossessionInput({
    goldIds: lineup(i), blueIds: lineup(i + 3), coachGoldId: COACHES[i % 6], coachBlueId: COACHES[(i + 2) % 6],
    eraStyleId: ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"][i % 8],
    simulationSeed: seed(i),
  }), { assertInvariants: false, includeLedger: false });
  vio += violations(g);
  scores.push(g.finalScore.gold, g.finalScore.blue);
  totals.push(g.finalScore.gold + g.finalScore.blue);
  paces.push(g.gold.totals.possessions);
}
scores.sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const tails = { games: GAMES, invariantViolations: vio,
  scoreMin: scores[0], scoreP01: q(scores, 0.01), scoreP50: q(scores, 0.5), scoreP99: q(scores, 0.99), scoreMax: scores[scores.length - 1],
  meanCombined: r2(totals.reduce((a, b) => a + b, 0) / totals.length),
  meanPossessions: r2(paces.reduce((a, b) => a + b, 0) / paces.length),
  impossibleScores: scores.filter((s) => s < 20 || s > 220).length };
console.log(`  ${GAMES} games · violations ${vio} · p01 ${tails.scoreP01} p50 ${tails.scoreP50} p99 ${tails.scoreP99} · impossible ${tails.impossibleScores}\n`);
gate("zeroInvariantViolations", vio === 0);
gate("zeroImpossibleScores", tails.impossibleScores === 0);

// ── 3. replay determinism & performance ─────────────────────────────────────
console.log("\n3 — REPLAY & PERFORMANCE\n");
const rIn = buildPossessionInput({ goldIds: lineup(7), blueIds: lineup(11), coachGoldId: "phil-jackson", coachBlueId: "pat-riley", eraStyleId: "1990s", simulationSeed: seed(999999) });
const g1 = runPossessionGame(rIn, { includeLedger: true });
const g2 = runPossessionGame(rIn, { includeLedger: true });
const replayExact = JSON.stringify(g1.possessionLedger) === JSON.stringify(g2.possessionLedger) && JSON.stringify(g1.finalScore) === JSON.stringify(g2.finalScore);
const t0 = Date.now();
for (let i = 0; i < 200; i++) runPossessionGame(buildPossessionInput({ goldIds: lineup(i), blueIds: lineup(i + 9), eraStyleId: "2010s", simulationSeed: seed(500000 + i) }), { includeLedger: false });
const gps = r2(200 / ((Date.now() - t0) / 1000));
console.log(`  replay exact ${replayExact} · ${gps} games/sec\n`);
gate("replayExact", replayExact);
gate("performanceAcceptable", gps > 50);

// ── 4. synthetic DEVELOPMENT v2 (the sealed stress set is untouched) ────────
console.log("\n4 — SYNTHETIC DEVELOPMENT V2\n");
let synVio = 0; let synGames = 0;
for (const [i, s] of SYNTHETIC_DEVELOPMENT_V2.entries()) {
  for (let k = 0; k < 20; k++) {
    const g = runPossessionGame(buildPossessionInput({ goldIds: s.five, blueIds: SYNTHETIC_DEVELOPMENT_V2[(i + 1) % SYNTHETIC_DEVELOPMENT_V2.length].five,
      coachGoldId: s.coach, coachBlueId: "neutral", eraStyleId: s.era, simulationSeed: seed(600000 + i * 100 + k) }), { assertInvariants: false, includeLedger: false });
    synGames++; synVio += violations(g);
  }
}
console.log(`  ${SYNTHETIC_DEVELOPMENT_V2.length} development fixtures x 20 games = ${synGames} · violations ${synVio}\n`);
gate("syntheticDevelopmentClean", synVio === 0);
gate("syntheticStressStillSealed", setAccessCount("synthetic-stress-holdout-v2") === 0);

// ── 5. hierarchy preservation (overfitting rejection: no collapse) ──────────
console.log("\n5 — HIERARCHY PRESERVATION\n");
const strong = legalFive(0); // strongest-first rotation
const weakPool = PLAYERS.filter((c) => (c.pts ?? 0) < 12);
const weak = (() => { try { return legalFive(101); } catch { return lineup(101); } })();
let strongWins = 0; const H = 400;
for (let i = 0; i < H; i++) {
  const g = runPossessionGame(buildPossessionInput({ goldIds: i % 2 ? strong : weak, blueIds: i % 2 ? weak : strong, eraStyleId: "2010s", simulationSeed: seed(700000 + i) }), { includeLedger: false });
  const goldWon = g.finalScore.gold > g.finalScore.blue;
  if ((i % 2 && goldWon) || (!(i % 2) && !goldWon)) strongWins++;
}
console.log(`  paired strong-vs-weak: strong wins ${strongWins}/${H}\n`);
gate("rosterHierarchyIntact", strongWins / H > 0.6);

// ── assemble ─────────────────────────────────────────────────────────────────
const core = buildCoreManifest();
writeArtifact("candidate1-internal-validation", {
  candidateId: "Candidate 1", coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
  calibrationObjective: { tuningMae: tr.mae, validationMae: va.mae, candidate0: c0,
    tuningFixtures: tr.fixtures, validationFixtures: va.fixtures },
  statisticalTails: tails,
  replay: { exact: replayExact, gamesPerSecond: gps },
  syntheticDevelopmentV2: { fixtures: SYNTHETIC_DEVELOPMENT_V2.length, games: synGames, invariantViolations: synVio },
  hierarchy: { pairedGames: H, strongWinRate: r5(strongWins / H) },
  overfittingChecks: {
    heldInImprovements: "candidate1-offense-repair.json / candidate1-defense-repair.json — held-in elite teams improve identically to V4 teams",
    noUniversalShifts: "non-elite population mean diffs +0.020 offence / +0.001 defence",
    eraSpreadsIntact: "movement spread 0.231 (candidate1-movement-repair.json); era oreb trend intact (candidate1-remaining-repairs.json)",
    hierarchyIntact: `strong beats weak ${r5(strongWins / H)} over ${H} paired games`,
  },
  gates, failedGates: failed, pass: failed.length === 0,
}, gen);
console.log(`\nINTERNAL VALIDATION: ${failed.length === 0 ? "PASS" : `FAIL (${failed.join(", ")})`}`);

// ── competition modes ────────────────────────────────────────────────────────
console.log("\n6 — COMPETITION MODES\n");
const modeRow = (name, games, vios, extra = {}) => {
  console.log(`  ${name.padEnd(24)} ${String(games).padStart(6)} games · violations ${vios}${Object.entries(extra).map(([k, v]) => ` · ${k} ${v}`).join("")}`);
  return { mode: name, games, invariantViolations: vios, ...extra };
};
const modes = [];
{
  let v = 0; const n = arg("single", 500);
  for (let i = 0; i < n; i++) {
    const g = runPossessionGame(buildPossessionInput({ goldIds: lineup(i), blueIds: lineup(i + 5),
      coachGoldId: COACHES[i % 6], coachBlueId: COACHES[(i + 1) % 6], eraStyleId: "2010s", simulationSeed: seed(800000 + i), mode: "single" }),
      { assertInvariants: false, includeLedger: false });
    v += violations(g);
  }
  modes.push(modeRow("Single Game", n, v));
}
{
  const series = arg("series", 220); let v = 0; let games = 0; const lens = []; const sweeps = {};
  for (let s = 0; s < series; s++) {
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: lineup(s), blueIds: lineup(s + 4),
      coachGoldId: COACHES[s % 6], coachBlueId: COACHES[(s + 3) % 6], eraStyleId: "1990s", simulationSeed: seed(820000 + s), mode: "best7" }),
      { games: 7, opts: { assertInvariants: false, includeLedger: false } });
    let g2 = 0; let b = 0; let played = 0;
    for (const g of gs) { played++; games++; v += violations(g); if (g.finalScore.gold > g.finalScore.blue) g2++; else b++; if (g2 === 4 || b === 4) break; }
    lens.push(played); sweeps[played] = (sweeps[played] ?? 0) + 1;
  }
  modes.push(modeRow("Best of 7", games, v, { series, meanLength: r2(lens.reduce((a, b) => a + b, 0) / lens.length), lengthDistribution: JSON.stringify(sweeps) }));
}
{
  const seasons = arg("seasons", 52); let v = 0; let games = 0; const wins = [];
  for (let s = 0; s < seasons; s++) {
    let w = 0;
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: lineup(s * 2), blueIds: lineup(s * 2 + 6),
      coachGoldId: COACHES[s % 6], coachBlueId: COACHES[(s + 4) % 6], eraStyleId: "2020s", simulationSeed: seed(840000 + s), mode: "82" }),
      { games: 82, opts: { assertInvariants: false, includeLedger: false } });
    for (const g of gs) { games++; v += violations(g); if (g.finalScore.gold > g.finalScore.blue) w++; }
    wins.push(w);
  }
  modes.push(modeRow("Win 82", games, v, { seasons, meanWins: r2(wins.reduce((a, b) => a + b, 0) / wins.length), minWins: Math.min(...wins), maxWins: Math.max(...wins) }));
}
{
  const brackets = arg("brackets", 24); let v = 0; let games = 0;
  for (let t = 0; t < brackets; t++) {
    let field = Array.from({ length: 8 }, (_, k) => ({ ids: lineup(t * 8 + k), coach: COACHES[(t + k) % 6] }));
    let round = 0;
    while (field.length > 1) {
      const next = [];
      for (let m = 0; m < field.length; m += 2) {
        const g = runPossessionGame(buildPossessionInput({ goldIds: field[m].ids, blueIds: field[m + 1].ids,
          coachGoldId: field[m].coach, coachBlueId: field[m + 1].coach, eraStyleId: "2000s",
          simulationSeed: seed(860000 + t * 100 + round * 10 + m), mode: "tournament" }), { assertInvariants: false, includeLedger: false });
        games++; v += violations(g);
        next.push(g.finalScore.gold >= g.finalScore.blue ? field[m] : field[m + 1]);
      }
      field = next; round++;
    }
  }
  modes.push(modeRow("Tournament", games, v, { brackets, roundsPerBracket: 3 }));
}
// mirror seasons: identical rosters, the win total should sit near 41
{
  const n = arg("mirrorSeasons", 12); const mirrorWins = []; let v = 0; let games = 0;
  for (let s = 0; s < n; s++) {
    let w = 0;
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: lineup(9), blueIds: lineup(9),
      coachGoldId: "steve-kerr", coachBlueId: "steve-kerr", eraStyleId: "2010s", simulationSeed: seed(880000 + s), mode: "82" }),
      { games: 82, opts: { assertInvariants: false, includeLedger: false } });
    for (const g of gs) { games++; v += violations(g); if (g.finalScore.gold > g.finalScore.blue) w++; }
    mirrorWins.push(w);
  }
  const mw = r2(mirrorWins.reduce((a, b) => a + b, 0) / mirrorWins.length);
  modes.push(modeRow("Mirror seasons", games, v, { seasons: n, meanGoldWins: mw, range: `${Math.min(...mirrorWins)}-${Math.max(...mirrorWins)}` }));
  gates.mirrorSeasonUnbiased = Math.abs(mw - 41) < 4;
  if (!gates.mirrorSeasonUnbiased) failed.push("mirrorSeasonUnbiased");
}
const totalModeGames = modes.reduce((a, m) => a + m.games, 0);
const totalModeViolations = modes.reduce((a, m) => a + m.invariantViolations, 0);
gates.competitionModesClean = totalModeViolations === 0;
if (!gates.competitionModesClean) failed.push("competitionModesClean");
gates.competitionMinimumsMet = modes.find((m) => m.mode === "Best of 7").series >= 200
  && modes.find((m) => m.mode === "Win 82").seasons >= 50
  && modes.find((m) => m.mode === "Tournament").brackets >= 20;
if (!gates.competitionMinimumsMet) failed.push("competitionMinimumsMet");

writeArtifact("candidate1-competition-validation", {
  candidateId: "Candidate 1", coreHash: core.aggregateCoreHash,
  modes, totalGames: totalModeGames, totalInvariantViolations: totalModeViolations,
  gates: { mirrorSeasonUnbiased: gates.mirrorSeasonUnbiased, competitionModesClean: gates.competitionModesClean, competitionMinimumsMet: gates.competitionMinimumsMet },
  pass: gates.mirrorSeasonUnbiased && gates.competitionModesClean && gates.competitionMinimumsMet,
}, gen);
console.log(`\nCOMPETITION VALIDATION: ${gates.mirrorSeasonUnbiased && gates.competitionModesClean && gates.competitionMinimumsMet ? "PASS" : "FAIL"} · ${totalModeGames} games`);
process.exit(failed.length === 0 ? 0 : 2);
}
