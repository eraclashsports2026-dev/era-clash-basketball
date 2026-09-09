#!/usr/bin/env node
// ── EraClash Labs: pick-and-roll benchmark ────────────────────────────────────
// Sweeps handlers × screeners × coverages × coaches × eras × spacing.
//
// Detects the failure modes that would mean the model is not doing basketball:
// one coverage always winning, one coach always dominating, one variant always
// best, an era acting as a universal bonus, or shooting gravity /
// switchability / rim protection being ignored.
//
//   node benchmarks/v3/pick-and-roll.mjs [--json]
import { evaluatePickAndRoll, PNR_VARIANTS, PNR_COVERAGES, ACTION_LIBRARY_VERSION } from "../../src/v3/actions/pickAndRoll.js";
import { intelligenceFor } from "../../src/v3/intelligence.js";

const P = (id) => intelligenceFor(id);
const sp = (floorSpacing, shooters, nonShooters) => ({ floorSpacing, shooters, nonShooters });

export const HANDLERS = [
  { key: "curry", id: "curry-10s", note: "elite movement/pull-up shooter" },
  { key: "magic", id: "magic-80s", note: "oversized creator, limited range" },
  { key: "harden", id: "harden-10s", note: "elite pull-up + isolation" },
  { key: "westbrook", id: "russ-10s", note: "rim pressure, limited range" },
  { key: "lowry", id: "lowry-2010s", note: "high-volume spot-up guard" },
];
export const SCREENERS = [
  { key: "roll-big", id: "eaton-80s", note: "rim-bound, no pop threat" },
  { key: "pop-big", id: "dirk-00s", note: "elite pop threat" },
  { key: "passing-big", id: "jokic-20s", note: "short-roll playmaker" },
  { key: "switch-big", id: "draymond-10s", note: "mobile, switchable" },
  { key: "roll-athlete", id: "bam-20s", note: "vertical roll threat" },
];
export const DEFENSE_PAIRS = [
  { key: "elite-poa+anchor", dh: "bowen-2ks", ds: "eaton-80s" },
  { key: "elite-poa+switch", dh: "bowen-2ks", ds: "bam-20s" },
  { key: "weak-poa+anchor", dh: "cousy-60s", ds: "ben-00s" },
  { key: "wing+mobile", dh: "prince-00s", ds: "draymond-10s" },
];
export const SPACINGS = [
  { key: "spaced", v: sp(9, 4, 0) },
  { key: "average", v: sp(5, 2, 1) },
  { key: "crowded", v: sp(2, 0, 3) },
];
export const COACH_PAIRS = [
  { key: "kerr-vs-thibs", o: "steve-kerr", d: "tom-thibodeau" },
  { key: "svg-vs-popovich", o: "stan-van-gundy", d: "gregg-popovich" },
  { key: "moe-vs-fratello", o: "doug-moe", d: "mike-fratello" },
];
export const ERAS = ["1960s", "1990s", "2020s"];

export const runPnrBenchmark = () => {
  const rows = [];
  for (const h of HANDLERS) for (const s of SCREENERS) for (const d of DEFENSE_PAIRS)
    for (const spc of SPACINGS) for (const cp of COACH_PAIRS) for (const era of ERAS) {
      const r = evaluatePickAndRoll({
        handler: P(h.id), screener: P(s.id), handlerDefender: P(d.dh), screenerDefender: P(d.ds),
        spacing: spc.v, offenseCoach: cp.o, defenseCoach: cp.d, eraStyleId: era,
      });
      rows.push({ handler: h.key, screener: s.key, defense: d.key, spacing: spc.key, coaches: cp.key, era, r });
    }
  return rows;
};

const tally = (rows, f) => {
  const t = {};
  for (const x of rows) t[f(x)] = (t[f(x)] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
};
const pad = (s, n) => String(s).padEnd(n);

const main = () => {
  const rows = runPnrBenchmark();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ n: rows.length }, null, 2)); return; }

  console.log(`\nPick-and-roll benchmark — action library v${ACTION_LIBRARY_VERSION}`);
  console.log(`${rows.length} scenarios: ${HANDLERS.length} handlers × ${SCREENERS.length} screeners × ${DEFENSE_PAIRS.length} defences × ${SPACINGS.length} spacings × ${COACH_PAIRS.length} coach pairs × ${ERAS.length} eras\n`);

  console.log("── variant selection spread ──");
  for (const [k, n] of tally(rows, (x) => x.r.actionType)) console.log(`   ${pad(k, 20)} ${n}  (${Math.round((n / rows.length) * 100)}%)`);
  console.log("\n── coverage selection spread ──");
  for (const [k, n] of tally(rows, (x) => x.r.coverageType)) console.log(`   ${pad(k, 20)} ${n}  (${Math.round((n / rows.length) * 100)}%)`);

  console.log("\n── dominance checks ──");
  const vSpread = tally(rows, (x) => x.r.actionType);
  const cSpread = tally(rows, (x) => x.r.coverageType);
  const check = (label, spread, cap) => {
    const share = spread[0][1] / rows.length;
    console.log(`   ${label}: ${spread.length} distinct, top = ${spread[0][0]} at ${Math.round(share * 100)}%  ${share > cap ? "⚠ investigate the model" : "✓"}`);
  };
  check("variants", vSpread, 0.5);
  check("coverages", cSpread, 0.5);

  // ── the four inputs that must demonstrably matter ──
  console.log("\n── sensitivity: does each input change the outcome? ──");
  const meanOf = (filter, get) => {
    const xs = rows.filter(filter).map(get);
    return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
  };
  const pairs = [
    ["shooting gravity (handler pull-up)", () => [meanOf((x) => x.handler === "curry", (x) => x.r.offense.ballHandlerShotQuality),
                                                  meanOf((x) => x.handler === "westbrook", (x) => x.r.offense.ballHandlerShotQuality)]],
    ["screener pop threat", () => [meanOf((x) => x.screener === "pop-big", (x) => x.r.offense.popOpportunity),
                                   meanOf((x) => x.screener === "roll-big", (x) => x.r.offense.popOpportunity)]],
    ["rim protection (defence)", () => [meanOf((x) => x.defense === "elite-poa+anchor", (x) => x.r.defense.rimProtection),
                                        meanOf((x) => x.defense === "wing+mobile", (x) => x.r.defense.rimProtection)]],
    // Switchability makes recovery EASIER, so the switchable pair must show a
    // LOWER recovery difficulty. Compared in that direction on purpose — the
    // first version of this check had it backwards and reported "IGNORED" for
    // a model that was behaving correctly.
    ["switchability (lower recovery = better)", () => [meanOf((x) => x.defense === "weak-poa+anchor", (x) => x.r.defense.recoveryDifficulty),
                                                       meanOf((x) => x.defense === "elite-poa+switch", (x) => x.r.defense.recoveryDifficulty)]],
    ["spacing", () => [meanOf((x) => x.spacing === "spaced", (x) => x.r.offense.weakSideOpportunity),
                       meanOf((x) => x.spacing === "crowded", (x) => x.r.offense.weakSideOpportunity)]],
    ["era (pop economics)", () => [meanOf((x) => x.era === "2020s", (x) => x.r.offense.popOpportunity),
                                   meanOf((x) => x.era === "1960s", (x) => x.r.offense.popOpportunity)]],
  ];
  for (const [label, f] of pairs) {
    const [hi, lo] = f();
    console.log(`   ${pad(label, 36)} ${String(hi).padStart(6)} vs ${String(lo).padStart(6)}  ${hi > lo ? "✓ matters" : "⚠ IGNORED"}`);
  }

  console.log("\n── era is not a universal bonus ──");
  for (const era of ERAS) {
    const shot = meanOf((x) => x.era === era, (x) => x.r.offense.ballHandlerShotQuality);
    const rim = meanOf((x) => x.era === era, (x) => x.r.offense.rimPressure);
    const roll = meanOf((x) => x.era === era, (x) => x.r.offense.rollOpportunity);
    console.log(`   ${pad(era, 8)} pull-up ${String(shot).padStart(5)}   rim ${String(rim).padStart(5)}   roll ${String(roll).padStart(5)}`);
  }
  const eraShot = ERAS.map((e) => meanOf((x) => x.era === e, (x) => x.r.offense.ballHandlerShotQuality));
  const eraRoll = ERAS.map((e) => meanOf((x) => x.era === e, (x) => x.r.offense.rollOpportunity));
  const bestShot = ERAS[eraShot.indexOf(Math.max(...eraShot))];
  const bestRoll = ERAS[eraRoll.indexOf(Math.max(...eraRoll))];
  console.log(bestShot !== bestRoll
    ? `   ✓ different eras lead different outcomes (pull-up: ${bestShot}, roll: ${bestRoll})`
    : `   ⚠ ${bestShot} leads both — era may be acting as a flat bonus`);

  console.log("\n── no score, no winner ──");
  const sample = rows[0].r;
  const banned = ["score", "points", "winner", "result", "margin"].filter((k) => k in sample);
  console.log(banned.length ? `   ⚠ action output exposes ${banned.join(", ")}` : "   ✓ the action library returns consequences only");
  console.log("");
};

if (import.meta.url === `file://${process.argv[1]}`) main();
