// EXP 3 — era environment self-consistency. Production V3.
// Same fixed pair of lineups in all 8 eras. seed = 3_000_000 + eraIndex*1000 + k
import { DECADES, cards, run, table, mean, r2, r3, eraTargets } from "./lib.mjs";
const N = 100;
const GOLD = cards(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"]);
const BLUE = cards(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);
const rows = [];
for (const [i, era] of DECADES.entries()) {
  const a = { poss: [], pts: [], fgm: [], fga: [], tpm: [], tpa: [], fta: [], ast: [], to: [], oreb: [], dreb: [] };
  for (let k = 0; k < N; k++) {
    const r = run(GOLD, BLUE, era, 3_000_000 + i * 1000 + k);
    a.poss.push(r.possessions);
    for (const s of ["gold", "blue"]) {
      const t = r[s].totals;
      a.pts.push(t.pts); a.fgm.push(t.fgm); a.fga.push(t.fga); a.tpm.push(t.tpm);
      a.tpa.push(t.tpa); a.fta.push(t.fta); a.ast.push(t.ast); a.to.push(t.to);
      a.oreb.push(t.oreb); a.dreb.push(t.dreb);
    }
  }
  const t = eraTargets(era);
  const orebShare = mean(a.oreb) / Math.max(1e-9, mean(a.oreb) + mean(a.dreb));
  rows.push([era,
    r2(mean(a.poss)), t.pace ?? "-",
    r2(mean(a.pts)), "-",
    r3(mean(a.fgm) / Math.max(1, mean(a.fga))), t.fgPct ?? "-",
    r2(mean(a.tpa)), t.tpaPerGame ?? "-",
    mean(a.tpa) ? r3(mean(a.tpm) / mean(a.tpa)) : 0, t.tpPct ?? "-",
    r2(mean(a.fta)), t.ftaPerGame ?? "-",
    r2(mean(a.ast)), t.astPerGame ?? "-",
    r2(mean(a.to)), t.tovPerGame ?? "-",
    r3(orebShare), t.orebPct ?? "-"]);
}
console.log(`# EXP 3 — era environment. ${N} games per era, ONE fixed pair of lineups, NEUTRAL_COACH both sides.`);
console.log(`# gold: ${GOLD.map((p) => p.id).join(" ")}`);
console.log(`# blue: ${BLUE.map((p) => p.id).join(" ")}`);
console.log(`# 'sim' is the per-TEAM per-game average produced. 'tgt' is the era record's documented`);
console.log(`# league average for that decade. The lineups are fixed and are not league-average teams.\n`);
console.log(table(["era", "possS", "paceT", "ptsS", "ptsT", "fg%S", "fg%T", "3paS", "3paT",
  "3p%S", "3p%T", "ftaS", "ftaT", "astS", "astT", "toS", "toT", "orbS", "orbT"], rows));
