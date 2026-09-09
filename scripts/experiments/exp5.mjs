// EXP 5 — sensitivity. Production V3, era 2020s, NEUTRAL_COACH.
// (a) one-at-a-time downgrades of a fixed five: seed = 5_000_000 + slot*1000 + k
// (b) OVR-vs-winrate correlation over 40 varied matchups: seed = 5_500_000 + m*100 + k
import { cards, run, table, pct, r3, teamOvr, mean, BY_ID } from "./lib.mjs";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { displayOVR } from "../../src/rating.js";
import { mulberry32 } from "../../src/v3/seed.js";
const ERA = "2020s", N = 50;

const BASE = cards(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"]);
const OPP = cards(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);
// A "substantially weaker" card: lowest displayOVR at that slot, any decade.
const weakestAt = (slot, exclude) => PLAYERS
  .filter((p) => p.positions.includes(slot) && !exclude.has(p.name))
  .sort((a, b) => displayOVR(a, slot) - displayOVR(b, slot) || a.id.localeCompare(b.id))[0];

const winRate = (g, b, base) => {
  let w = 0;
  for (let k = 0; k < N; k++) if (run(g, b, ERA, base + k).winner === "Gold") w++;
  return w / N;
};
const baseRate = winRate(BASE, OPP, 5_000_000 + 9 * 1000);
const rows = [];
for (const [i, slot] of POSITIONS.entries()) {
  const exclude = new Set([...BASE, ...OPP].map((p) => p.name));
  const weak = weakestAt(slot, exclude);
  const five = BASE.map((p, j) => (j === i ? weak : p));
  const wr = winRate(five, OPP, 5_000_000 + i * 1000);
  rows.push([slot, BASE[i].id, displayOVR(BASE[i], slot), weak.id, displayOVR(weak, slot),
    teamOvr(BASE) - teamOvr(five), pct(baseRate, 1), pct(wr, 1), r3((wr - baseRate) * 100)]);
}
console.log(`# EXP 5a — one-at-a-time downgrade. ${N} games per swap, era ${ERA}, NEUTRAL_COACH.`);
console.log(`# base five: ${BASE.map((p) => p.id).join(" ")}  (OVR ${teamOvr(BASE)})`);
console.log(`# opponent : ${OPP.map((p) => p.id).join(" ")}  (OVR ${teamOvr(OPP)})`);
console.log(`# baseline gold win rate ${pct(baseRate, 1)}%\n`);
console.log(table(["slot", "replaced", "ovr", "with", "ovr", "dTeamOVR", "base%", "new%", "delta_pp"], rows));

// ── (b) correlation across 40 matchups ─────────────────────────────────────
const rng = mulberry32(987654321);
const pool = PLAYERS.filter((p) => p.pos);
const pickFive = () => {
  const used = new Set(); const five = [];
  for (const slot of POSITIONS) {
    const opts = pool.filter((p) => p.positions.includes(slot) && !used.has(p.name));
    const p = opts[Math.floor(rng() * opts.length)];
    used.add(p.name); five.push(p);
  }
  return five;
};
const pts = [];
for (let m = 0; m < 40; m++) {
  let g, b, guard = 0;
  do { g = pickFive(); b = pickFive(); guard++; }
  while (guard < 20 && g.some((x) => b.some((y) => y.name === x.name)));
  let w = 0;
  for (let k = 0; k < N; k++) if (run(g, b, ERA, 5_500_000 + m * 100 + k).winner === "Gold") w++;
  pts.push({ d: teamOvr(g) - teamOvr(b), wr: w / N });
}
const xs = pts.map((p) => p.d), ys = pts.map((p) => p.wr);
const mx = mean(xs), my = mean(ys);
const cov = mean(pts.map((p) => (p.d - mx) * (p.wr - my)));
const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)));
const sy = Math.sqrt(mean(ys.map((y) => (y - my) ** 2)));
console.log(`\n# EXP 5b — summed displayOVR difference vs gold win rate, 40 random matchups x ${N} games`);
console.log(`# pearson r = ${r3(cov / (sx * sy))}   n = ${pts.length}`);
console.log(`# dOVR range ${Math.min(...xs)} .. ${Math.max(...xs)}   winrate range ${r3(Math.min(...ys))} .. ${r3(Math.max(...ys))}`);
const buckets = [[-999, -30], [-30, -15], [-15, -5], [-5, 5], [5, 15], [15, 30], [30, 999]];
console.log(table(["dOVR bucket", "n", "mean_winrate"], buckets.map(([lo, hi]) => {
  const inB = pts.filter((p) => p.d >= lo && p.d < hi);
  return [`${lo === -999 ? "<" : lo}${hi === 999 ? "+" : `..${hi}`}`, inB.length, inB.length ? r3(mean(inB.map((p) => p.wr))) : "-"];
})));
