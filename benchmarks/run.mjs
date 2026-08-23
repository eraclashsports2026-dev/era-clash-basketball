#!/usr/bin/env node
// ── Simulation benchmark harness ───────────────────────────────────────────────
// Runs the deterministic engine over the scenario matchups and reports win
// distributions, score averages, ratings/chemistry, and anomalies. Seeded, so
// runs are reproducible. Usage:
//   node benchmarks/run.mjs [samples-per-matchup=300] [seed=42]
// (An optional LLM sampling mode is intentionally NOT implemented here — it
// would spend real API credits; add behind an explicit env flag if wanted.)
import { PLAYERS } from "../src/players.js";
import { teamRating, analyzeBalance } from "../src/rating.js";
import { simulateGame, simulateSeries, mulberry32, matchupEdges } from "../src/engine.js";
import { LINEUPS, MATCHUPS } from "./scenarios.js";

const N = Number(process.argv[2]) || 300;
const SEED = Number(process.argv[3]) || 42;

const team = (key) => {
  const t = LINEUPS[key].map((id) => PLAYERS.find((p) => p.id === id));
  const missing = LINEUPS[key].filter((id, i) => !t[i]);
  if (missing.length) throw new Error(`Lineup ${key}: unknown ids ${missing.join(", ")}`);
  return t;
};

console.log(`EraClash benchmark — ${MATCHUPS.length} matchups × ${N} games (seed ${SEED})\n`);

let flagged = 0;
for (const m of MATCHUPS) {
  const A = team(m.a), B = team(m.b);
  const rng = mulberry32(SEED);
  let aWins = 0, sumA = 0, sumB = 0, blowouts = 0;
  let minMargin = Infinity, maxMargin = -Infinity;
  for (let i = 0; i < N; i++) {
    const g = simulateGame(A, B, rng);
    if (g.winner === "Gold") aWins++;
    sumA += g.finalScore.gold; sumB += g.finalScore.blue;
    const margin = Math.abs(g.finalScore.gold - g.finalScore.blue);
    blowouts += margin >= 25 ? 1 : 0;
    minMargin = Math.min(minMargin, margin); maxMargin = Math.max(maxMargin, margin);
  }
  // series distribution (smaller sample)
  const srng = mulberry32(SEED + 1);
  let aSeries = 0;
  for (let i = 0; i < Math.min(N, 100); i++) {
    if (simulateSeries(A, B, srng).winner === "Gold") aSeries++;
  }

  const pctA = ((aWins / N) * 100).toFixed(1);
  const edges = matchupEdges(A, B).slice(0, 2).map((e) => `${e.category} ${e.edge > 0 ? "+" : ""}${e.edge}`).join(", ");
  const chemA = analyzeBalance(A).multiplier, chemB = analyzeBalance(B).multiplier;

  const anomalies = [];
  if (m.expect === "a" && aWins / N < 0.5) anomalies.push("EXPECTED A TO WIN MAJORITY");
  if (m.expect === "b" && aWins / N > 0.5) anomalies.push("EXPECTED B TO WIN MAJORITY");
  if (aWins === 0 || aWins === N) anomalies.push("DEGENERATE 0/100% SPLIT");
  if (blowouts / N > 0.5) anomalies.push("BLOWOUT-HEAVY (>50% of games ≥25 margin)");
  if (anomalies.length) flagged++;

  console.log(`▶ ${m.a} vs ${m.b} — ${m.note}`);
  console.log(`   game win% A: ${pctA}%   series win% A: ${((aSeries / Math.min(N, 100)) * 100).toFixed(0)}%`);
  console.log(`   avg score: ${(sumA / N).toFixed(1)} - ${(sumB / N).toFixed(1)}   margins ${minMargin}-${maxMargin}, blowouts ${((blowouts / N) * 100).toFixed(0)}%`);
  console.log(`   ratings: ${teamRating(A)} vs ${teamRating(B)}   chem: ${chemA.toFixed(2)} vs ${chemB.toFixed(2)}   top edges: ${edges}`);
  if (anomalies.length) console.log(`   ⚠ ${anomalies.join("; ")}`);
  console.log("");
}

console.log(flagged ? `⚠ ${flagged} matchup(s) flagged — review above.` : "✓ No anomalies flagged.");
