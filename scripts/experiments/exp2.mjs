// EXP 2 — round-trip player fidelity. Production V3.
// The subject plays 100 games in their OWN era with neutral coaches. Teammates
// and opponents are drawn per game from the same decade, excluding the subject,
// by a seeded shuffle — "randomised but comparable" means same-decade peers.
// seed = 2_000_000 + subjectIndex*10_000 + k
import { BY_ID, run, table, mean, r2 } from "./lib.mjs";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { mulberry32 } from "../../src/v3/seed.js";

const SUBJECTS = ["mikan-50s", "wilt-60s", "bill-60s", "oscar-60s", "kareem-70s", "julius-70s",
  "magic-80s", "jordan-90s", "hak-90s", "duncan-00s", "lebron-10s", "jokic-20s"];
const N = 100;

// Same-decade pool, so a 1960s subject is surrounded by 1960s players.
// A game needs TEN distinct people. The 1950s holds only 7 cards, so a
// same-decade pool cannot fill both fives; that decade alone borrows the
// adjacent one for teammates and opponents. The ERA STYLE played is still the
// subject's own in every case. Rows built this way are marked.
const SMALL = new Set(["1950s"]);
const poolFor = (decade, excludeId) => PLAYERS.filter((p) =>
  (p.decade === decade || (SMALL.has(decade) && p.decade === "1960s")) && p.id !== excludeId);

const fillFive = (subject, pool, rng) => {
  const slot = POSITIONS.indexOf(subject.pos);
  const five = new Array(5).fill(null);
  five[slot] = subject;
  const used = new Set([subject.id]);
  for (let i = 0; i < 5; i++) {
    if (five[i]) continue;
    const opts = pool.filter((p) => p.positions.includes(POSITIONS[i]) && !used.has(p.id) && p.name !== subject.name);
    if (!opts.length) return null;
    const pick = opts[Math.floor(rng() * opts.length)];
    five[i] = pick; used.add(pick.id);
  }
  return five;
};

const rows = [];
for (const [si, id] of SUBJECTS.entries()) {
  const subj = BY_ID.get(id);
  const pool = poolFor(subj.decade, subj.id);
  const acc = { pts: [], reb: [], ast: [], stl: [], blk: [], min: 0 };
  let played = 0;
  for (let k = 0; k < N; k++) {
    const rng = mulberry32(2_000_000 + si * 10_000 + k);
    const gold = fillFive(subj, pool, rng);
    const usedNames = new Set(gold?.map((p) => p.name) ?? []);
    const oppPool = pool.filter((p) => !usedNames.has(p.name));
    const blue = fillFive(oppPool[Math.floor(rng() * oppPool.length)] ?? subj, oppPool, rng);
    if (!gold || !blue) continue;
    const r = run(gold, blue, subj.decade, 2_000_000 + si * 10_000 + k);
    const line = r.gold.lines.find((l) => l.id === subj.id);
    if (!line) continue;
    played++;
    acc.pts.push(line.pts); acc.reb.push(line.oreb + line.dreb); acc.ast.push(line.ast);
    acc.stl.push(line.stl); acc.blk.push(line.blk);
  }
  const g = (k) => r2(mean(acc[k]));
  const d = (k, stored) => r2(mean(acc[k]) - stored);
  rows.push([id + (SMALL.has(subj.decade) ? "*" : ""), played,
    subj.pts, g("pts"), d("pts", subj.pts),
    subj.reb, g("reb"), d("reb", subj.reb),
    subj.ast, g("ast"), d("ast", subj.ast),
    subj.stl, g("stl"), d("stl", subj.stl),
    subj.blk, g("blk"), d("blk", subj.blk)]);
}
console.log(`# EXP 2 — round-trip fidelity. ${N} games each, own era, NEUTRAL_COACH, same-decade teammates/opponents.`);
console.log(`# card = the stored value on the card. sim = engine per-game average. d = sim - card.\n`);
console.log("# * = teammates/opponents borrowed from the 1960s (the 1950s has only 7 cards).\n");
console.log(table(
  ["card", "n", "PTSc", "PTSs", "d", "REBc", "REBs", "d", "ASTc", "ASTs", "d", "STLc", "STLs", "d", "BLKc", "BLKs", "d"],
  rows));
