// EXP 6 — quantify the four known defects. CANDIDATE 3 possession engine
// (src/v3/possession/), which is where all four live. Production V3 is a
// different file and does not contain them.
// seed = 6_000_000 + eraIndex*10_000 + coach*1000 + k
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { table, mean, r2, r3, DECADES } from "./lib.mjs";
const N = 60;
const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"];
const COACHES = [["neutral", "neutral"], ["phil-jackson", "nick-nurse"], ["mike-dantoni", "pat-riley"]];

const rows = [];
for (const [i, era] of DECADES.entries()) {
  const cat = { RIM: 0, PAINT_OR_POST: 0, MIDRANGE: 0, THREE_POINT: 0 };
  const acc = { fga: [], pts: [], fgm: [], poss: [] };
  let games = 0;
  for (const [ci, [cg, cb]] of COACHES.entries()) {
    for (let k = 0; k < N; k++) {
      let g;
      try {
        g = runPossessionGame(buildPossessionInput({
          goldIds: GOLD, blueIds: BLUE, eraStyleId: era, coachGoldId: cg, coachBlueId: cb,
          simulationSeed: 6_000_000 + i * 10_000 + ci * 1000 + k,
        }), { assertInvariants: false, includeLedger: true });
      } catch { continue; }
      games++;
      for (const r of g.possessionLedger ?? []) if (typeof r.shot === "string" && cat[r.shot] !== undefined) cat[r.shot]++;
      for (const s of ["gold", "blue"]) {
        acc.fga.push(g[s].totals.fga); acc.pts.push(g[s].totals.pts); acc.fgm.push(g[s].totals.fgm);
      }
      acc.poss.push(g.gold.totals.possessions);
    }
  }
  const tot = Object.values(cat).reduce((a, b) => a + b, 0) || 1;
  rows.push([era, era < "1980s" ? "pre" : "post", games,
    r3(cat.RIM / tot), r3(cat.PAINT_OR_POST / tot), r3(cat.MIDRANGE / tot), r3(cat.THREE_POINT / tot),
    r2(mean(acc.fga)), r3(mean(acc.fgm) / Math.max(1, mean(acc.fga))), r2(mean(acc.pts)), r2(mean(acc.poss))]);
}
console.log(`# EXP 6a — DEFECT 1. Shot distribution by category, Candidate 3 engine AS SHIPPED.`);
console.log(`# ${N} games x ${COACHES.length} coach pairs per era. Shares are of all categorised shots.`);
console.log(`# gold ${GOLD.join(" ")} | blue ${BLUE.join(" ")}\n`);
console.log(table(["era", "line", "games", "RIM", "PAINT", "MID", "THREE", "FGA/tm", "FG%", "PTS/tm", "poss"], rows));
const pre = rows.filter((r) => r[1] === "pre"), post = rows.filter((r) => r[1] === "post");
const col = (rs, i) => r3(mean(rs.map((r) => Number(r[i]))));
console.log(`\n# group means`);
console.log(table(["group", "RIM", "PAINT", "MID", "THREE", "FGA/tm", "FG%", "PTS/tm"],
  [["pre-1979 (3 eras)", col(pre, 3), col(pre, 4), col(pre, 5), col(pre, 6), col(pre, 7), col(pre, 8), col(pre, 9)],
   ["post-1979 (5 eras)", col(post, 3), col(post, 4), col(post, 5), col(post, 6), col(post, 7), col(post, 8), col(post, 9)]]));
