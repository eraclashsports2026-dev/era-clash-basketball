// EXP 1 — era win matrix. Production V3. seed = 1_000_000 + (i*8+j)*1000 + k
import { DECADES, topFiveOfDecade, run, table, pct, teamOvr } from "./lib.mjs";
const N = 50, ERA = "2020s";
const fives = Object.fromEntries(DECADES.map((d) => [d, topFiveOfDecade(d)]));
const W = {};
for (const [i, a] of DECADES.entries()) {
  W[a] = {};
  for (const [j, b] of DECADES.entries()) {
    let wins = 0;
    for (let k = 0; k < N; k++) {
      const r = run(fives[a], fives[b], ERA, 1_000_000 + (i * 8 + j) * 1000 + k);
      if (r.winner === "Gold") wins++;
    }
    W[a][b] = wins;
  }
}
console.log(`# EXP 1 — ${DECADES.length}x${DECADES.length} win matrix, ${N} games/cell, era ${ERA}, NEUTRAL_COACH both sides`);
console.log(`# cell = row decade's win% as GOLD vs column decade as BLUE\n`);
console.log(table(["row\\col", ...DECADES.map((d) => d.slice(0, 4)), "OVR"],
  DECADES.map((a) => [a, ...DECADES.map((b) => pct(W[a][b], N)), teamOvr(fives[a])])));
const overall = DECADES.map((a) => {
  const asGold = DECADES.reduce((n, b) => n + W[a][b], 0);            // a wins as Gold
  const asBlue = DECADES.reduce((n, b) => n + (N - W[b][a]), 0);      // a wins as Blue
  return [a, pct(asGold, N * 8), pct(asBlue, N * 8), pct(asGold + asBlue, N * 16)];
});
console.log(`\n# overall: as Gold (8x${N}), as Blue (8x${N}), combined`);
console.log(table(["decade", "asGold%", "asBlue%", "overall%"], overall));
console.log(`\n# mirror diagonal (same five both sides) — isolates side bias`);
console.log(table(["decade", "gold%"], DECADES.map((d) => [d, pct(W[d][d], N)])));
