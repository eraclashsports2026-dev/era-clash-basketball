// EXP 6b — isolated effect of each defect. Prints one row of aggregates that a
// driver can diff across patched/unpatched source states.
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { mean, r3, r2, DECADES } from "./lib.mjs";
const N = 40;
const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"];
const COACHES = [["neutral", "neutral"], ["phil-jackson", "nick-nurse"], ["mike-dantoni", "pat-riley"]];
const out = {};
for (const group of ["pre", "post"]) {
  const eras = DECADES.filter((e) => (group === "pre" ? e < "1980s" : e >= "1980s"));
  const cat = { RIM: 0, PAINT_OR_POST: 0, MIDRANGE: 0, THREE_POINT: 0 };
  const a = { fga: [], fgm: [], pts: [], ast: [], to: [] };
  for (const [i, era] of eras.entries()) {
    for (const [ci, [cg, cb]] of COACHES.entries()) {
      for (let k = 0; k < N; k++) {
        let g;
        try {
          g = runPossessionGame(buildPossessionInput({ goldIds: GOLD, blueIds: BLUE, eraStyleId: era,
            coachGoldId: cg, coachBlueId: cb, simulationSeed: 6_500_000 + i * 10_000 + ci * 1000 + k }),
            { assertInvariants: false, includeLedger: true });
        } catch { continue; }
        for (const r of g.possessionLedger ?? []) if (typeof r.shot === "string" && cat[r.shot] !== undefined) cat[r.shot]++;
        for (const s of ["gold", "blue"]) {
          const t = g[s].totals;
          a.fga.push(t.fga); a.fgm.push(t.fgm); a.pts.push(t.pts); a.ast.push(t.ast); a.to.push(t.to);
        }
      }
    }
  }
  const tot = Object.values(cat).reduce((x, y) => x + y, 0) || 1;
  out[group] = { RIM: r3(cat.RIM / tot), PAINT: r3(cat.PAINT_OR_POST / tot), MID: r3(cat.MIDRANGE / tot),
    THREE: r3(cat.THREE_POINT / tot), FGA: r2(mean(a.fga)), FGpct: r3(mean(a.fgm) / Math.max(1, mean(a.fga))),
    PTS: r2(mean(a.pts)), AST: r2(mean(a.ast)), TO: r2(mean(a.to)) };
}
console.log(JSON.stringify(out));
