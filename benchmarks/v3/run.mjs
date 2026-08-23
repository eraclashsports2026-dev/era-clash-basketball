#!/usr/bin/env node
// ── EraClash Labs: V3 benchmark suite (Parts 49–54) ────────────────────────────
// Distributions over ≥1,000 games per canonical matchup; construction, coach-
// only, era-only, era-dominance, and style-vs-style batteries; performance.
//   node benchmarks/v3/run.mjs [gamesPerMatchup=1000]
import { PLAYERS } from "../../src/players.js";
import { simulateGameV3, simulateSeriesV3, simulateSeasonV3, resolveCoach, resolveEra } from "../../src/v3/engine.js";
import { genOpponent } from "../../src/draft.js";

const N = Number(process.argv[2]) || 1000;
const t = (ids) => ids.map((id) => PLAYERS.find((p) => p.id === id));
const NEUTRAL = resolveCoach("neutral");

const ARCHETYPES = {
  five_superstars: t(["luka-20s", "jordan-90s", "lebron-10s", "giannis-20s", "jokic-20s"]),
  balanced_elite: t(["magic-80s", "moncrief-80s", "bird-80s", "duncan-00s", "hak-90s"]),
  defense_heavy: t(["gary-90s", "bowen-2ks", "pippen-90s", "kg-00s", "gobert-10s"]),
  high_spacing: t(["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"]),
  poor_spacing: t(["westphal-70s", "monroe-70s", "kenon-70s", "moses-80s", "wilt-60s"]),
  interior_heavy: t(["stock-90s", "hal-60s", "elvin-70s", "moses-80s", "wilt-60s"]),
  small_ball: t(["curry-10s", "klay-10s", "butler-10s", "draymond-10s", "bam-20s"]),
  elite_playmaking: t(["magic-80s", "stock-90s", "lebron-10s", "jokic-20s", "kidd-00s"]),
  role_players: t(["smart-20s", "klay-10s", "bowen-2ks", "horace-90s", "camby-2ks"]),
  high_ovr_poor_fit: t(["russ-10s", "harden-10s", "carmelo-00s", "zion-20s", "embiid-20s"]),
};

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return { p5: s[Math.floor(s.length * 0.05)], p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)] };
};

const duel = (A, B, era, coachA = NEUTRAL, coachB = NEUTRAL, n = N, seedBase = 50000) => {
  let aw = 0; const margins = [], scores = [], poss = []; const mvps = new Set();
  for (let s = 0; s < n; s++) {
    const g = simulateGameV3(A, B, coachA, coachB, era, seedBase + s);
    if (g.winner === "Gold") aw++;
    margins.push(Math.abs(g.finalScore.gold - g.finalScore.blue));
    scores.push(g.finalScore.gold);
    poss.push(g.possessions);
    mvps.add(g.mvp.name);
  }
  return { winPct: +(aw / n * 100).toFixed(1), score: stats(scores), margin: stats(margins), poss: stats(poss), mvpCount: mvps.size };
};

console.log(`\n══ EraClash Labs V3 — ${N} games per matchup ══\n`);
let flags = 0;
const flag = (msg) => { flags++; console.log(`  ⚠ ${msg}`); };

// ── Part 49/50: canonical + construction matchups ─────────────────────────────
console.log("── Construction battery (2020s, neutral coaches) ──");
const E20 = resolveEra("2020s");
const constructionPairs = [
  ["balanced_elite", "five_superstars", "construction vs raw talent stack"],
  ["high_spacing", "poor_spacing", "spacing vs cramped"],
  ["defense_heavy", "high_ovr_poor_fit", "defense/fit vs talent/poor fit"],
  ["elite_playmaking", "five_superstars", "playmaking vs stacking"],
  ["role_players", "five_superstars", "pure role players vs stars (talent should win big)"],
  ["small_ball", "interior_heavy", "small ball vs size"],
];
for (const [a, b, note] of constructionPairs) {
  const r = duel(ARCHETYPES[a], ARCHETYPES[b], E20);
  console.log(`${a} vs ${b}: A wins ${r.winPct}% · score p50 ${r.score.p50} (p5 ${r.score.p5}, p95 ${r.score.p95}) · margin p50 ${r.margin.p50} · ${r.mvpCount} distinct MVPs — ${note}`);
  if (r.winPct === 0 || r.winPct === 100) flag(`${a} vs ${b}: degenerate 0/100 split`);
  if (r.mvpCount < 2) flag(`${a} vs ${b}: MVP never varies`);
  if (r.score.p5 === r.score.p95) flag(`${a} vs ${b}: scores do not vary`);
}

// ── Part 51: coach-only changes (players/opponent/era constant) ───────────────
console.log("\n── Coach-only battery (high_spacing vs balanced_elite, 2010s) ──");
const E10 = resolveEra("2010s");
const coachBattery = ["neutral", "mike-dantoni", "steve-kerr", "jerry-sloan", "pat-riley", "gregg-popovich", "phil-jackson", "red-auerbach"];
const coachRows = [];
for (const cid of coachBattery) {
  const r = duel(ARCHETYPES.high_spacing, ARCHETYPES.balanced_elite, E10, resolveCoach(cid), NEUTRAL, Math.min(N, 600), 60000);
  coachRows.push({ cid, ...r });
  console.log(`${cid.padEnd(16)} win ${r.winPct}% · poss p50 ${r.poss.p50} · score p50 ${r.score.p50}`);
}
const winSpread = Math.max(...coachRows.map((r) => r.winPct)) - Math.min(...coachRows.map((r) => r.winPct));
const possSpread = Math.max(...coachRows.map((r) => r.poss.p50)) - Math.min(...coachRows.map((r) => r.poss.p50));
console.log(`coach effect: win% spread ${winSpread.toFixed(1)} · possession spread ${possSpread}`);
if (winSpread < 3) flag("coaches barely matter (<3% win spread)");
if (winSpread > 25) flag("coaches overpower talent (>25% win spread)");
if (possSpread < 2) flag("coach tempo has no possession effect");

// ── Part 52/53: era-only changes + ERA DOMINANCE MATRIX ───────────────────────
console.log("\n── Era dominance matrix (win% of row archetype vs balanced_elite across every Era Style) ──");
const eras = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const matrixTeams = ["five_superstars", "high_spacing", "defense_heavy", "interior_heavy", "small_ball"];
const matrix = {};
for (const teamKey of matrixTeams) {
  matrix[teamKey] = {};
  const row = [];
  for (const eraId of eras) {
    const r = duel(ARCHETYPES[teamKey], ARCHETYPES.balanced_elite, resolveEra(eraId), NEUTRAL, NEUTRAL, Math.min(N, 500), 70000);
    matrix[teamKey][eraId] = r.winPct;
    row.push(`${eraId.slice(2, 4)}s:${r.winPct}%`);
  }
  console.log(`${teamKey.padEnd(18)} ${row.join("  ")}`);
  const vals = Object.values(matrix[teamKey]);
  const spread = Math.max(...vals) - Math.min(...vals);
  if (spread > 30) flag(`${teamKey}: era swings win% by ${spread.toFixed(1)} — era acting like a power multiplier`);
  // monotonic-modernity check: does win% strictly increase (or decrease) into modern eras?
  let inc = 0, dec = 0;
  for (let i = 1; i < vals.length; i++) { if (vals[i] > vals[i - 1]) inc++; if (vals[i] < vals[i - 1]) dec++; }
  if (inc === vals.length - 1 || dec === vals.length - 1) flag(`${teamKey}: strictly monotonic era trend — simplistic era behavior`);
}

// ── Part 54: style vs style across eras ───────────────────────────────────────
console.log("\n── Style vs style across eras ──");
const styleClashes = [
  ["high_spacing", "interior_heavy"],
  ["small_ball", "interior_heavy"],
  ["five_superstars", "balanced_elite"],
  ["defense_heavy", "high_spacing"],
  ["elite_playmaking", "defense_heavy"],
];
for (const [a, b] of styleClashes) {
  const row = [];
  for (const eraId of ["1960s", "1990s", "2020s"]) {
    const r = duel(ARCHETYPES[a], ARCHETYPES[b], resolveEra(eraId), NEUTRAL, NEUTRAL, Math.min(N, 500), 80000);
    row.push(`${eraId}: ${r.winPct}%`);
  }
  console.log(`${a} vs ${b}: ${row.join(" · ")}`);
}

// ── Part 55: performance ───────────────────────────────────────────────────────
console.log("\n── Performance ──");
let t0 = Date.now();
simulateGameV3(ARCHETYPES.balanced_elite, ARCHETYPES.high_spacing, NEUTRAL, NEUTRAL, E20, 1);
console.log(`single game: ${Date.now() - t0}ms`);
t0 = Date.now();
simulateSeriesV3(ARCHETYPES.balanced_elite, ARCHETYPES.high_spacing, NEUTRAL, NEUTRAL, E20, 1);
console.log(`best of 7: ${Date.now() - t0}ms`);
t0 = Date.now();
simulateSeasonV3(ARCHETYPES.balanced_elite, genOpponent, NEUTRAL, NEUTRAL, E20, 1);
console.log(`win 82 season: ${Date.now() - t0}ms`);
t0 = Date.now();
for (let s = 0; s < 1000; s++) simulateGameV3(ARCHETYPES.balanced_elite, ARCHETYPES.high_spacing, NEUTRAL, NEUTRAL, E20, s);
console.log(`1,000-game benchmark: ${Date.now() - t0}ms`);

console.log(flags ? `\n⚠ ${flags} flag(s) raised — review above.` : "\n✓ No flags: distributions healthy, era is an environment, coaches matter without dominating.");
