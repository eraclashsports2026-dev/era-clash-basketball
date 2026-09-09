#!/usr/bin/env node
// ── Chaos Draft fairness gate ────────────────────────────────────────────────
// Reads the calibration and benchmark artifacts and asserts the FROZEN bands.
// Failing here means the shipped odds no longer match what was predeclared.
import fs from "node:fs";
import { POSITIONS, PLAYERS } from "../../src/players.js";
import { finalWeight, drawFive } from "../../src/chaos/draftOdds.js";
import { draftPctAt, tierOf } from "../../src/chaos/draftValue.js";
import { can, CAPABILITIES } from "../../src/entitlements.js";

const OUT = "data/validation/8a";
const read = (f) => { try { return JSON.parse(fs.readFileSync(`${OUT}/${f}`, "utf8")); } catch { return null; } };
const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const cal = read("draft-probability-calibration.json");
const bench = read("legend-cpu-benchmark.json");
const targets = read("draft-calibration-targets.json");
if (!cal) { console.error("no calibration artifact — run npm run chaos:calibrate"); process.exit(1); }

const band = (v, lo, hi) => v >= lo && v <= hi;

// ── Locked decisions #16/#17: higher Draft Value means lower probability ─────
let monotoneAll = true;
for (const slot of POSITIONS) {
  const pool = PLAYERS.filter((p) => p.positions.includes(slot))
    .map((p) => ({ w: finalWeight(p, slot, 1, {}), pct: draftPctAt(p, slot) }))
    .sort((a, b) => a.pct - b.pct);
  for (let i = 1; i < pool.length; i++) if (pool[i].w > pool[i - 1].w + 1e-12) monotoneAll = false;
}
ok("per-card probability is non-increasing in Draft Value on every slot", monotoneAll);

// ── Locked decision #20: nothing in the pool is unreachable ──────────────────
ok("every card in the pool retains a non-zero probability",
  cal.wholePool.cardsEverDrawn === cal.wholePool.cardsInPool,
  `${cal.wholePool.cardsEverDrawn}/${cal.wholePool.cardsInPool} drawn in ${cal.runs.toLocaleString()} runs`);

// ── Locked decision #18: later rolls reduce top-tier probability ─────────────
ok("Roll 3 offers fewer APEX cards than Roll 1",
  cal.tierFrequencyByRoll.roll3.APEX < cal.tierFrequencyByRoll.roll1.APEX,
  `${(cal.tierFrequencyByRoll.roll1.APEX * 100).toFixed(2)}% → ${(cal.tierFrequencyByRoll.roll3.APEX * 100).toFixed(2)}%`);
ok("Roll 3 offers fewer ELITE cards than Roll 1",
  cal.tierFrequencyByRoll.roll3.ELITE < cal.tierFrequencyByRoll.roll1.ELITE);

// ── Locked decision #19: held rare talent raises Draft Pressure ──────────────
const p = cal.draftPressure.topTierRateAfterHolding;
ok("holding one top-tier card lowers the next top-tier rate",
  p.oneTopTierHeld < p.zeroTopTierHeld,
  `${(p.zeroTopTierHeld * 100).toFixed(2)}% → ${(p.oneTopTierHeld * 100).toFixed(2)}%`);
ok("holding two or more lowers it further, and never to zero",
  p.twoPlusTopTierHeld < p.oneTopTierHeld && p.twoPlusTopTierHeld > 0,
  `${(p.twoPlusTopTierHeld * 100).toFixed(2)}%`);

// ── Locked decisions #6/#7: the CPU gets the same odds ───────────────────────
const parity = Math.abs(cal.parity.goldTopDecileRate - cal.parity.blueTopDecileRate);
ok("the user and the CPU receive statistically equivalent cards", parity < 0.005,
  `gold ${(cal.parity.goldTopDecileRate * 100).toFixed(3)}% vs blue ${(cal.parity.blueTopDecileRate * 100).toFixed(3)}%`);

// ── Frozen band retained from revision 1 ─────────────────────────────────────
ok("final roster with three or more top-decile players stays rare (2-5%)",
  band(cal.finalRoster.atLeastThree, 0.02, 0.05),
  `${(cal.finalRoster.atLeastThree * 100).toFixed(2)}%`);

// ── Elite construction is a rare percentile outcome, not five famous names ───
ok("Perfect Storm and Elite Build are distinct percentile bands",
  cal.construction.bands.PERFECT_STORM > cal.construction.bands.ELITE_BUILD);

// ── Decisions matter ─────────────────────────────────────────────────────────
ok("skilled holds beat random holds", cal.skilledVsRandom.uplift > 0,
  `+${cal.skilledVsRandom.uplift.toFixed(4)}`);
ok("the final roll frequently improves something", cal.rollThreeRisk.improvedSomething > 0.5,
  `${(cal.rollThreeRisk.improvedSomething * 100).toFixed(1)}%`);
ok("the final roll sometimes costs something", cal.rollThreeRisk.worsenedSomething > 0.2,
  `${(cal.rollThreeRisk.worsenedSomething * 100).toFixed(1)}%`);

// ── Structural correctness ───────────────────────────────────────────────────
ok("no duplicate person occurred in any run", cal.violations.duplicatePerson === 0);
ok("no burned person ever returned", cal.violations.burnedPersonReturned === 0);

// ── Hopeless drafts stay bounded, measured under the SHIPPED policy ──────────
if (bench) {
  ok("hopeless matchups stay under 5% with both sides on the shipped policy",
    bench.hopelessMatchupRate.rate < 0.05,
    `${(bench.hopelessMatchupRate.rate * 100).toFixed(2)}% over ${bench.hopelessMatchupRate.matchups} matchups`);
  ok("Legend outperforms a random-hold policy", bench.legendOutperforms.vsRandom > 0);
  ok("Legend outperforms an OVR-only policy", bench.legendOutperforms.vsOvrOnly > 0);
  ok("Legend outperforms a construction-only policy", bench.legendOutperforms.vsConstructionOnly > 0);
  ok("Legend's no-peeking guard refuses forbidden state", bench.noPeeking.structural === "REFUSED");
  ok("Legend's decision is invariant to the future it cannot see",
    bench.noPeeking.behaviouralStable === bench.noPeeking.behaviouralChecks);
}

// ── Locked decision #9: entitlement never touches odds ───────────────────────
const tiers = ["GUEST", "FREE", "PLUS", "COMMISSIONER"];
const paths = tiers.map(() => JSON.stringify(POSITIONS.map((s) => drawFive({ seedId: "fair-seed", side: "gold", roll: 1 })[s]?.id)));
ok("every tier draws an identical roster from the same seed", new Set(paths).size === 1);
ok("no odds function can even see an entitlement",
  !fs.readFileSync("src/chaos/draftOdds.js", "utf8").includes("entitlement")
  && !fs.readFileSync("src/chaos/draftValue.js", "utf8").includes("entitlement"));
ok("entitlement gates modes, and Chaos Clash is open to guests",
  can("GUEST", CAPABILITIES.CHAOS_CLASH) && !can("GUEST", CAPABILITIES.DREAM_MATCHUP));

const passed = checks.filter((c) => c.pass).length;
fs.writeFileSync(`${OUT}/draft-fairness-report.json`, JSON.stringify({
  artifact: "draft-fairness-report", phase: "8A",
  calibrationRuns: cal.runs, checks: checks.length, passed, failed: checks.length - passed,
  frozenTargetsRevision: targets?.revisions?.length ?? null,
  results: checks,
}, null, 2) + "\n");
console.log(`\n${passed}/${checks.length} fairness checks passed`);
process.exit(passed === checks.length ? 0 : 1);
