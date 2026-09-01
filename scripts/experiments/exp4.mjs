// EXP 4 — variance. Production V3, era 2020s, NEUTRAL_COACH. 200 seeds each.
// seed = 4_000_000 + matchupIndex*10_000 + k
import { cards, run, table, mean, sd, r2, deciles, pct, teamOvr } from "./lib.mjs";
const N = 200, ERA = "2020s";
const M = [
  { name: "balanced", gold: ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"],
    blue: ["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"] },
  { name: "lopsided", gold: ["lebron-10s", "curry-10s", "kawhi-10s", "durant-10s", "dwight-10s"],
    blue: ["cousy-50s", "sharman-50s", "arizin-50s", "pettit-50s", "mikan-50s"] },
];
const rows = [], decRows = [];
for (const [i, m] of M.entries()) {
  const g = cards(m.gold), b = cards(m.blue);
  const margins = [];
  let gw = 0;
  for (let k = 0; k < N; k++) {
    const r = run(g, b, ERA, 4_000_000 + i * 10_000 + k);
    margins.push(r.finalScore.gold - r.finalScore.blue);
    if (r.winner === "Gold") gw++;
  }
  rows.push([m.name, teamOvr(g), teamOvr(b), teamOvr(g) - teamOvr(b),
    r2(mean(margins)), r2(sd(margins)), Math.min(...margins), Math.max(...margins),
    pct(gw, N), pct(N - gw, N)]);
  decRows.push([m.name, ...deciles(margins)]);
}
console.log(`# EXP 4 — variance. ${N} seeds per matchup, era ${ERA}, NEUTRAL_COACH both sides.`);
console.log(`# margin = gold points - blue points. OVR = summed displayOVR at each slot.\n`);
console.log(table(["matchup", "goldOVR", "blueOVR", "dOVR", "meanMargin", "SD", "min", "max", "gold%", "blue%"], rows));
console.log(`\n# margin deciles (D1..D9)`);
console.log(table(["matchup", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"], decRows));
for (const m of M) console.log(`# ${m.name}: gold ${m.gold.join(" ")} | blue ${m.blue.join(" ")}`);
