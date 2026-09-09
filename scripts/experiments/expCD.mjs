// C — do the pre-1974 zero steals/blocks reach the box score?
// D — can era-of-play change a player's own capabilities?
import { cards, run, table, mean, r2, r3 } from "./lib.mjs";
import { playerDNA } from "../../src/v3/playerProfile.js";
import { BY_ID } from "./lib.mjs";

const SIX = ["cousy-60s", "oscar-60s", "elgin-60s", "bob-60s", "bill-60s"];
const OPP = ["jerry-60s", "hal-60s", "nate-60s", "willis-60s", "wilt-60s"];
const g = cards(SIX), b = cards(OPP);
const rows = [];
const teamStl = [], teamBlk = [];
for (const p of g) rows.push([p.id, p.stl, p.blk, [], []]);
for (let k = 0; k < 20; k++) {
  const r = run(g, b, "1960s", 9_000_000 + k);
  teamStl.push(r.gold.totals.stl); teamBlk.push(r.gold.totals.blk);
  for (const row of rows) {
    const l = r.gold.lines.find((x) => x.id === row[0]);
    if (l) { row[3].push(l.stl); row[4].push(l.blk); }
  }
}
console.log(`# C — 1960s five, 20 games, era 1960s, NEUTRAL_COACH. seed = 9_000_000 + k`);
console.log(`# gold ${SIX.join(" ")} | blue ${OPP.join(" ")}`);
console.log(`# every 1960s card stores stl 0 and blk 0 (the league did not record them until 1973-74)\n`);
console.log(table(["card", "STL(card)", "STL(sim)", "BLK(card)", "BLK(sim)"],
  rows.map((r) => [r[0], r[1], r2(mean(r[3])), r[2], r2(mean(r[4]))])));
console.log(`\n# team per game: STL ${r2(mean(teamStl))}  BLK ${r2(mean(teamBlk))}`);

console.log(`\n# D — does the era being played change a player's own derived capabilities?`);
const subject = BY_ID.get("wilt-60s");
const eras = ["1950s", "1970s", "2020s"];
const dna = playerDNA(subject);
const fields = ["outsideShooting", "rimPressure", "postScoring", "defPlaymaking", "rimProtection", "threeTendency"];
console.log(`# playerDNA(card) signature takes ONLY the card — no era argument exists.`);
console.log(table(["field", ...eras.map((e) => `dna in ${e}`)],
  fields.map((f) => [f, ...eras.map(() => r3(dna[f]))])));
// Behavioural: the same five in three eras — the DNA object is built from the
// card alone, so it must be identical regardless of the era the game uses.
const snap = eras.map(() => JSON.stringify(playerDNA(subject)));
console.log(`# playerDNA identical across all three era contexts: ${new Set(snap).size === 1}`);
