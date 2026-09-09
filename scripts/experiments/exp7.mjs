// EXP 7 — production V3 vs Candidate 3 possession engine, matched seeds.
// 20 matchups x 20 seeds. seed = 7_000_000 + m*1000 + k
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { mulberry32 } from "../../src/v3/seed.js";
import { run, table, mean, sd, r2, r3, pct, cards } from "./lib.mjs";
const M = 20, K = 20, ERA = "2020s";
const rng = mulberry32(777000777);
const pool = PLAYERS;
const five = (used) => POSITIONS.map((slot) => {
  const o = pool.filter((p) => p.positions.includes(slot) && !used.has(p.name));
  const p = o[Math.floor(rng() * o.length)]; used.add(p.name); return p;
});
const rows = [];
const agg = { dScore: [], dPoss: [], v3g: [], c3g: [], v3w: 0, c3w: 0, n: 0, v3fga: [], c3fga: [], v3tpa: [], c3tpa: [] };
for (let m = 0; m < M; m++) {
  const used = new Set(); const g = five(used), b = five(used);
  const a = { v3p: [], c3p: [], v3poss: [], c3poss: [], v3w: 0, c3w: 0, same: 0 };
  for (let k = 0; k < K; k++) {
    const seed = 7_000_000 + m * 1000 + k;
    const A = run(g, b, ERA, seed);
    let B; try {
      B = runPossessionGame(buildPossessionInput({ goldIds: g.map((p) => p.id), blueIds: b.map((p) => p.id),
        eraStyleId: ERA, coachGoldId: "neutral", coachBlueId: "neutral", simulationSeed: seed }),
        { assertInvariants: false, includeLedger: false });
    } catch { continue; }
    a.v3p.push(A.finalScore.gold + A.finalScore.blue); a.c3p.push(B.finalScore.gold + B.finalScore.blue);
    a.v3poss.push(A.possessions); a.c3poss.push(B.gold.totals.possessions);
    if (A.winner === "Gold") a.v3w++;
    if (B.winner === "Gold") a.c3w++;
    if ((A.winner === "Gold") === (B.winner === "Gold")) a.same++;
    agg.dScore.push((B.finalScore.gold + B.finalScore.blue) - (A.finalScore.gold + A.finalScore.blue));
    agg.dPoss.push(B.gold.totals.possessions - A.possessions);
    agg.v3fga.push(A.gold.totals.fga); agg.c3fga.push(B.gold.totals.fga);
    agg.v3tpa.push(A.gold.totals.tpa); agg.c3tpa.push(B.gold.totals.tpa);
    agg.n++;
  }
  agg.v3w += a.v3w; agg.c3w += a.c3w;
  rows.push([`m${m + 1}`, r2(mean(a.v3p)), r2(mean(a.c3p)), r2(mean(a.c3p) - mean(a.v3p)),
    r2(mean(a.v3poss)), r2(mean(a.c3poss)), pct(a.v3w, K), pct(a.c3w, K), pct(a.same, K)]);
}
console.log(`# EXP 7 — production V3 vs Candidate 3, ${M} matchups x ${K} matched seeds, era ${ERA}, NEUTRAL_COACH.`);
console.log(`# combined = both teams' points. agree% = same winner on the same seed.\n`);
console.log(table(["matchup", "v3pts", "c3pts", "d", "v3poss", "c3poss", "v3gold%", "c3gold%", "agree%"], rows));
console.log(`\n# aggregate over ${agg.n} matched pairs`);
console.log(table(["metric", "V3", "Candidate3", "delta"], [
  ["combined points", r2(mean(agg.v3fga) * 0 + mean(agg.dScore) * 0 + 0), "", ""],
].slice(0, 0).concat([
  ["gold FGA", r2(mean(agg.v3fga)), r2(mean(agg.c3fga)), r2(mean(agg.c3fga) - mean(agg.v3fga))],
  ["gold 3PA", r2(mean(agg.v3tpa)), r2(mean(agg.c3tpa)), r2(mean(agg.c3tpa) - mean(agg.v3tpa))],
  ["gold win%", pct(agg.v3w, agg.n), pct(agg.c3w, agg.n), r2(pct(agg.c3w, agg.n) - pct(agg.v3w, agg.n))],
  ["combined pts delta (c3-v3): mean", r2(mean(agg.dScore)), `SD ${r2(sd(agg.dScore))}`, `range ${Math.min(...agg.dScore)}..${Math.max(...agg.dScore)}`],
  ["possessions delta (c3-v3): mean", r2(mean(agg.dPoss)), `SD ${r2(sd(agg.dPoss))}`, `range ${Math.min(...agg.dPoss)}..${Math.max(...agg.dPoss)}`],
])));
