#!/usr/bin/env node
// ── Probability validation suite ────────────────────────────────────────────
//   npm run calibration:probability
//   npm run calibration:strength-ladder
//   npm run calibration:balanced-vs-ovr
import { writeFileSync, mkdirSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { predictionFrom, report, monotonicity } from "../../src/v3/calibration/probability.js";
import { seedSet } from "../../data/calibration/seeds.mjs";
import { loadCorpusV2 } from "../../data/calibration/sets-v2.mjs";
import { historicalCalibrationV2Ids } from "../../data/calibration/sets-v2.mjs";

const OUT = ".cache/calibration";
const SIMS = Number(process.env.PROB_SIMS ?? 5000);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

const play = (goldIds, blueIds, eraStyleId, seed, coachGoldId = "neutral", coachBlueId = "neutral") =>
  runPossessionGame(buildPossessionInput({ goldIds, blueIds, coachGoldId, coachBlueId, eraStyleId, simulationSeed: seed }), { includeLedger: false });

const cell = (goldIds, blueIds, eraStyleId, n, purpose = "PROBABILITY") =>
  seedSet(purpose, n).map((s) => predictionFrom(play(goldIds, blueIds, eraStyleId, s))).filter(Boolean);

const write = (name, payload) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/${name}.json`);
};

// Strength ladder: one dimension varied at a time, from an even matchup upward.
// Built from the historical corpus so the teams are real, and the OPPONENT is
// held fixed so only the tested side's strength moves.
const LADDER = [
  { label: "even (mirror)", swap: 0 },
  { label: "slight favourite", swap: 1 },
  { label: "moderate favourite", swap: 2 },
  { label: "strong favourite", swap: 3 },
  { label: "extreme favourite", swap: 4 },
];

// Guarded: importing this module for a helper must never run a command.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "reliability";

  if (cmd === "reliability") {
    const corpus = loadCorpusV2();
    const calIds = new Set(historicalCalibrationV2Ids());
    const fixtures = corpus.fixtures.filter((f) => calIds.has(f.fixtureId));
    const all = [];
    for (const a of fixtures) {
      for (const b of fixtures) {
        if (a.fixtureId === b.fixtureId) continue;
        if (a.eraStyleId !== b.eraStyleId) continue;
        all.push(...cell(a.roster.map((r) => r.playerCardId), b.roster.map((r) => r.playerCardId), a.eraStyleId,
          Math.max(200, Math.floor(SIMS / 10)), "PROBABILITY"));
      }
    }
    const rep = report(all);
    console.log(`PROBABILITY RELIABILITY — ${rep.n} predictions\n`);
    console.log(`  Brier score        ${rep.brierScore}`);
    console.log(`  log loss           ${rep.logLoss}`);
    console.log(`  sharpness          ${rep.sharpness}   (0 = always 50%, useless)`);
    console.log(`  upset rate         ${rep.upsetRate}`);
    console.log(`  calibration error  ${rep.calibrationError}`);
    console.log(`  observed range     ${rep.clamp.observedMin} .. ${rep.clamp.observedMax}  suspected clamp: ${rep.clamp.suspectedClamp}`);
    console.log(`\n  reliability bins:`);
    console.log(`    ${"bin".padEnd(12)} ${"n".padStart(6)} ${"predicted".padStart(10)} ${"observed".padStart(9)} ${"gap".padStart(8)}`);
    for (const b of rep.reliabilityBins) {
      if (!b.n) continue;
      console.log(`    ${`${b.lo}-${b.hi}`.padEnd(12)} ${String(b.n).padStart(6)} ${String(b.meanPredicted).padStart(10)} ${String(b.observed).padStart(9)} ${String(b.gap).padStart(8)}`);
    }
    write("probability-reliability", rep);
  } else if (cmd === "strength-ladder") {
    // Built from a TRUE MIRROR downward, not by swapping players upward.
    //
    // A first attempt swapped one player at a time from a weak roster into a
    // strong one and was not monotonic — replacing Draymond Green with Kevin
    // Durant made the team slightly worse. That is the engine valuing team
    // construction over raw talent, which is correct behaviour, but it means
    // one-at-a-time swaps do not produce a monotonic strength ladder.
    //
    // A mirror is the cleanest possible calibration test: identical rosters,
    // identical coaches, identical era. The prediction MUST be 0.500 and the
    // empirical win rate must land near it, or the probability model has a bias
    // that no matchup can excuse.
    const base = ["lowry-2010s", "klay-10s", "kawhi-10s", "draymond-10s", "jokic-10s"];
    const downgrades = ["wall-2010s", "demar-2010s", "prince-00s", "ibaka-2010s", "drummond-2010s"];
    const rungs = [];
    for (const [i, label] of ["mirror (identical)", "slight favourite", "moderate favourite", "strong favourite", "extreme favourite"].entries()) {
      // Weaken the OPPONENT progressively; the tested side never changes, so the
      // ladder isolates relative strength rather than roster construction.
      const opponent = base.map((b, j) => (j < i ? (downgrades[j] ?? b) : b));
      const ps = cell(base, opponent, "2010s", Math.max(500, Math.floor(SIMS / 4)), "PROBABILITY");
      const predicted = r3(ps.reduce((a, p) => a + p.predicted, 0) / ps.length);
      const empirical = r3(ps.filter((p) => p.won).length / ps.length);
      rungs.push({ label, downgrades: i, predicted, empirical, n: ps.length, opponent });
    }
    console.log(`CONTROLLED STRENGTH LADDER — the tested side is fixed; the opponent weakens\n`);
    console.log(`    ${"rung".padEnd(22)} ${"n".padStart(6)} ${"predicted".padStart(10)} ${"empirical".padStart(10)} ${"gap".padStart(7)}`);
    for (const r of rungs) console.log(`    ${r.label.padEnd(22)} ${String(r.n).padStart(6)} ${String(r.predicted).padStart(10)} ${String(r.empirical).padStart(10)} ${String(r3(r.empirical - r.predicted)).padStart(7)}`);
    const m = monotonicity(rungs);
    console.log(`\n  monotonic: ${m.monotonic}`);
    for (const v of m.violations) console.log(`    ✗ ${v.kind}: ${v.from} -> ${v.to} (${v.values.join(" -> ")})`);
    const mirror = rungs[0];
    console.log(`\n  mirror check — identical rosters must predict 0.500:`);
    console.log(`    predicted ${mirror.predicted}  empirical ${mirror.empirical}  (a mirror that is not 0.5 is a model bias, not a matchup)`);
    write("strength-ladder", { rungs, monotonicity: m, mirrorCheck: { predicted: mirror.predicted, empirical: mirror.empirical } });
  } else if (cmd === "balanced-vs-ovr") {
    // A balanced lower-rated team against a creator-heavy higher-rated one.
    // No balance bonus and no stacking penalty exist anywhere in the engine; if
    // the balanced team wins, it wins through basketball dimensions.
    const balanced = ["lowry-2010s", "klay-10s", "kawhi-10s", "draymond-10s", "jokic-10s"];
    const stacked = ["luka-10s", "harden-10s", "russ-10s", "demar-2010s", "ad-10s"];
    const ps = cell(balanced, stacked, "2010s", Math.max(1000, Math.floor(SIMS / 2)), "PROBABILITY");
    const predicted = r3(ps.reduce((a, p) => a + p.predicted, 0) / ps.length);
    const empirical = r3(ps.filter((p) => p.won).length / ps.length);
    console.log(`BALANCED vs CREATOR-HEAVY — ${ps.length} games\n`);
    console.log(`  balanced : ${balanced.join(", ")}`);
    console.log(`  stacked  : ${stacked.join(", ")}`);
    console.log(`\n  predicted win probability (balanced) : ${predicted}`);
    console.log(`  simulated win rate (balanced)        : ${empirical}`);
    console.log(`  mean expected margin                 : ${r3(ps.reduce((a, p) => a + p.expectedMargin, 0) / ps.length)}`);
    console.log(`  mean realised margin                 : ${r3(ps.reduce((a, p) => a + p.realizedMargin, 0) / ps.length)}`);
    write("balanced-vs-ovr", { balanced, stacked, predicted, empirical, n: ps.length });
  } else {
    console.error(`unknown command "${cmd}"`);
    process.exit(1);
  }
}
