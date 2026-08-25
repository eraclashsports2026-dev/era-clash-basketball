#!/usr/bin/env node
// ── Defensive Matchup Engine 1.0 benchmark ───────────────────────────────────
// Reports the assignments themselves, not a defensive-quality score. There is
// deliberately no single "defence rating" here: the whole point of the module
// is that defensive fit is multi-dimensional, and collapsing it into one number
// for a benchmark would undo that.
//
//   node benchmarks/v3/defensive-matchups.mjs
//   node benchmarks/v3/defensive-matchups.mjs --games=1000
import { runPossessionGame, checkGame } from "../../src/v3/possession/index.js";
import { preparePossessionContext } from "../../src/v3/possession/context.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { childSeeds } from "../../src/v3/possession/rng.js";
import { buildDefensivePlan, greedyAssignments, buildMatchupMatrix, buildMatchupProfiles, buildSchemePlan, scorePlan } from "../../src/v3/defense/index.js";
import { getEra } from "../../src/v3/eraStyles.js";
import { strategicEffects } from "../../src/v3/eraStyleIntelligence.js";

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? Number(hit.slice(n.length + 3)) : d;
};

export const LINEUPS = {
  showtime: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
  splash: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
  shaqEra: ["gary-90s", "kobe-00s", "pippen-90s", "duncan-00s", "shaq-00s"],
  smallBall: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
  size: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
  stoppers: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
  spacing: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
  lowThreat: ["curry-10s", "klay-10s", "draymond-10s", "dirk-00s", "rob-90s"],
};

const FAST = { assertInvariants: false, includeLedger: false };
const line = (l, v) => console.log(`   ${l.padEnd(30)} ${v}`);

const planFor = (defIds, offIds, eraId, coachId) => {
  const ctx = preparePossessionContext(buildPossessionInput({
    goldIds: defIds, blueIds: offIds, eraStyleId: eraId, simulationSeed: 1,
    coachGoldId: coachId, coachBlueId: "phil-jackson",
  }));
  return buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era: getEra(eraId) });
};

const showPlan = (label, plan) => {
  console.log(`\n▶ ${label}`);
  line("scheme", `${plan.scheme.shellType} / ${plan.scheme.ballScreenCoverage}  switch ${plan.scheme.switchingFrequency} help ${plan.scheme.helpAggression} zone ${plan.scheme.zoneUsage} press ${plan.scheme.pressureLevel}`);
  if (plan.scheme.constraints.length) line("limited by", plan.scheme.constraints.map((c) => `${c.dimension}←${c.limitedBy}`).join(", "));
  for (const a of plan.baselineAssignments) {
    console.log(`     ${a.defenderName.padEnd(18)} → ${a.offensivePlayerName.padEnd(18)} ${(a.crossMatched ? "[X]" : "   ")} ${a.reason.code.padEnd(24)} sev${a.severeCount} maj${a.majorCount} ${a.isHide ? "HIDE" : ""}`);
  }
  line("help", plan.help.responsibilities.map((h) => `${h.role.replace(/_/g, " ").toLowerCase()}=${h.defenderName.split(" ").slice(-1)[0]}`).join(", ") || "(none)");
  if (plan.help.unavailableRoles.length) line("unavailable help roles", plan.help.unavailableRoles.join(", "));
  line("cross-matches", plan.summary.crossMatches);
  line("severe / major mismatches", `${plan.summary.severeMismatches} / ${plan.summary.majorMismatches}`);
  line("rim preservation", plan.summary.rimPreservation);
  line("hidden", plan.summary.hidden.length ? plan.summary.hidden.map((h) => h.defenderId).join(", ") : "(none)");
  line("severe baseline violations", plan.optimization.severeBaselineViolations.length === 0 ? "0  ✓" : `${plan.optimization.severeBaselineViolations.length}  ✗`);
  line("assignment confidence", plan.confidence.assignments);
};

const run = () => {
  const N = arg("games", 1000);
  console.log("── Defensive Matchup Engine 1.0 benchmark ──────────────────────────");
  console.log("   DEVELOPMENT — no historical authority claimed.\n");
  console.log("══ CANONICAL SCENARIOS ═════════════════════════════════════════════");

  showPlan("Magic Johnson's team defending the Splash lineup (1990s, Riley)", planFor(LINEUPS.showtime, LINEUPS.splash, "1990s", "pat-riley"));
  showPlan("Same defenders, MODERN era (2010s, Nurse) — scheme must change", planFor(LINEUPS.showtime, LINEUPS.splash, "2010s", "nick-nurse"));
  showPlan("Movement shooters attacked by stoppers (2010s)", planFor(LINEUPS.stoppers, LINEUPS.spacing, "2010s", "tom-thibodeau"));
  showPlan("Shaq interior matchup (2000s)", planFor(LINEUPS.showtime, LINEUPS.shaqEra, "2000s", "gregg-popovich"));
  showPlan("Small-ball defending size (2010s)", planFor(LINEUPS.smallBall, LINEUPS.size, "2010s", "steve-kerr"));
  showPlan("Size defending spacing (1990s)", planFor(LINEUPS.size, LINEUPS.spacing, "1990s", "jerry-sloan"));
  showPlan("A genuine hiding spot exists (1990s)", planFor(LINEUPS.showtime, LINEUPS.lowThreat, "1990s", "pat-riley"));

  // ── the failure mode this phase exists to prevent ──────────────────────────
  console.log("\n══ IMPOSSIBLE-ASSIGNMENT DETECTION ═════════════════════════════════");
  let violations = 0, greedyViolations = 0, optimizerBetter = 0, cells = 0;
  const combos = [];
  for (const dk of Object.keys(LINEUPS)) for (const ok of Object.keys(LINEUPS)) {
    if (dk === ok) continue;
    combos.push([dk, ok]);
  }
  for (const [dk, ok] of combos) {
    for (const eraId of ["1960s", "1990s", "2010s"]) {
      const ctx = preparePossessionContext(buildPossessionInput({
        goldIds: LINEUPS[dk], blueIds: LINEUPS[ok], eraStyleId: eraId, simulationSeed: 1,
        coachGoldId: "pat-riley", coachBlueId: "phil-jackson",
      }));
      const era = getEra(eraId), eff = strategicEffects(era);
      const plan = buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era, eff });
      violations += plan.optimization.severeBaselineViolations.length;
      cells++;
      // Compare against a deliberately greedy plan.
      const g = greedyAssignments({ matrix: plan.matrix });
      const gScore = scorePlan({ pairs: g.pairs, defenders: plan.matrix.defenders, threats: plan.matrix.threats, scheme: plan.scheme });
      greedyViolations += gScore.violations.length;
      if (plan.optimization.total <= gScore.total) optimizerBetter++;
    }
  }
  line("matchup × era cells", cells);
  line("optimizer severe violations", violations === 0 ? "0  ✓" : `${violations}  ✗`);
  line("greedy severe violations", `${greedyViolations}  (the failure mode being avoided)`);
  line("optimizer ≤ greedy cost", `${optimizerBetter}/${cells}  ${optimizerBetter === cells ? "✓" : "✗"}`);

  // ── era legality sweep ─────────────────────────────────────────────────────
  console.log("\n══ ERA LEGALITY ════════════════════════════════════════════════════");
  console.log("   era      shell                      zone  help  press  unavailable help roles");
  for (const eraId of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
    const p = planFor(LINEUPS.showtime, LINEUPS.splash, eraId, "nick-nurse");
    console.log(`   ${eraId.padEnd(8)} ${p.scheme.shellType.padEnd(26)} ${String(p.scheme.zoneUsage).padStart(4)}  ${String(p.scheme.helpAggression).padStart(4)}  ${String(p.scheme.pressureLevel).padStart(5)}  ${p.help.unavailableRoles.join(",") || "-"}`);
  }

  // ── A/B: defensive engine off vs on ────────────────────────────────────────
  console.log("\n══ A/B — DEFENSIVE ENGINE OFF vs ON (same seeds) ═══════════════════");
  const ab = (defIds, offIds, eraId, n) => {
    const seeds = childSeeds(4242, n);
    const stat = (defensiveMatchups) => {
      const gs = seeds.map((s) => runPossessionGame(buildPossessionInput({
        goldIds: defIds, blueIds: offIds, eraStyleId: eraId, simulationSeed: s,
        coachGoldId: "pat-riley", coachBlueId: "phil-jackson", defensiveMatchups,
      }), FAST));
      const avg = (f) => gs.reduce((a, g) => a + f(g), 0) / gs.length;
      const pooled = (m, a) => {
        const num = gs.reduce((x, g) => x + m(g), 0), den = gs.reduce((x, g) => x + a(g), 0);
        return den ? num / den : null;
      };
      return {
        score: `${avg((g) => g.finalScore.gold).toFixed(1)}-${avg((g) => g.finalScore.blue).toFixed(1)}`,
        goldWin: gs.filter((g) => g.winner === "Gold").length / gs.length,
        fga: avg((g) => g.blue.totals.fga), tpa: avg((g) => g.blue.totals.tpa),
        fgPct: pooled((g) => g.blue.totals.fgm, (g) => g.blue.totals.fga),
        to: avg((g) => g.blue.totals.to), fta: avg((g) => g.blue.totals.fta),
        oreb: avg((g) => g.blue.totals.oreb), blk: avg((g) => g.gold.totals.blk),
        viol: gs.reduce((a, g) => a + checkGame(g).length, 0),
      };
    };
    return { off: stat(false), on: stat(true) };
  };

  for (const [label, d, o, era] of [
    ["Showtime vs Splash (1990s)", LINEUPS.showtime, LINEUPS.splash, "1990s"],
    ["Stoppers vs Spacing (2010s)", LINEUPS.stoppers, LINEUPS.spacing, "2010s"],
    ["SmallBall vs Size (2010s)", LINEUPS.smallBall, LINEUPS.size, "2010s"],
  ]) {
    const { off, on } = ab(d, o, era, 200);
    console.log(`\n▶ ${label}   (offence = Blue, 200 seeds each)`);
    console.log("     metric        defence OFF      defence ON       delta");
    const row = (n, a, b, fmt = (x) => x.toFixed(1)) =>
      console.log(`     ${n.padEnd(13)} ${fmt(a).padStart(12)} ${fmt(b).padStart(16)} ${((b - a) >= 0 ? "+" : "") + fmt(b - a)}`);
    console.log(`     score         ${off.score.padStart(12)} ${on.score.padStart(16)}`);
    row("Blue FGA", off.fga, on.fga);
    row("Blue 3PA", off.tpa, on.tpa);
    row("Blue FG%", off.fgPct * 100, on.fgPct * 100, (x) => x.toFixed(2));
    row("Blue TO", off.to, on.to);
    row("Blue FTA", off.fta, on.fta);
    row("Blue OREB", off.oreb, on.oreb);
    row("Gold BLK", off.blk, on.blk);
    row("Gold win%", off.goldWin * 100, on.goldWin * 100);
    line("invariant violations", `${off.viol} / ${on.viol}`);
  }

  // ── distribution ───────────────────────────────────────────────────────────
  console.log(`\n══ DISTRIBUTION — ${N} games ═══════════════════════════════════════`);
  const seeds = childSeeds(9001, N);
  const t0 = process.hrtime.bigint();
  const gs = seeds.map((s) => runPossessionGame(buildPossessionInput({
    goldIds: LINEUPS.showtime, blueIds: LINEUPS.splash, eraStyleId: "1990s",
    simulationSeed: s, coachGoldId: "pat-riley", coachBlueId: "phil-jackson",
  }), FAST));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const avg = (f) => gs.reduce((a, g) => a + f(g), 0) / gs.length;
  line("runtime", `${ms.toFixed(0)} ms  (${(ms / N).toFixed(2)} ms/game)`);
  line("invariant violations", gs.reduce((a, g) => a + checkGame(g).length, 0) === 0 ? "0  ✓" : "✗");
  line("final ties", gs.filter((g) => g.finalScore.gold === g.finalScore.blue).length === 0 ? "0  ✓" : "✗");
  // The baseline plan must NOT vary across seeds.
  const plans = new Set(gs.map((g) => g.defense.gold.baseline.map((b) => `${b.def}>${b.off}`).sort().join("|")));
  line("distinct baseline plans", `${plans.size}  ${plans.size === 1 ? "✓ deterministic" : "✗ the plan randomised"}`);
  line("switches/game", avg((g) => g.defense.gold.counters.switches).toFixed(2));
  line("transition cross-matches", avg((g) => g.defense.gold.counters.transitionCrossMatches).toFixed(2));
  line("adjustments/game", avg((g) => g.defense.gold.changes.filter((c) => c.response !== "REJECTED").length).toFixed(2));
  line("rejected adjustments/game", avg((g) => g.defense.gold.changes.filter((c) => c.response === "REJECTED").length).toFixed(2));
  line("severe baseline violations", gs.reduce((a, g) => a + g.defense.gold.counters.severeBaselineViolations, 0) === 0 ? "0  ✓" : "✗");
  const coverages = {};
  for (const g of gs.slice(0, 120)) {
    for (const c of g.defense.gold.changes) void c;
  }
  const cov = {};
  const withLedger = childSeeds(9001, 40).map((s) => runPossessionGame(buildPossessionInput({
    goldIds: LINEUPS.showtime, blueIds: LINEUPS.splash, eraStyleId: "1990s", simulationSeed: s,
    coachGoldId: "pat-riley", coachBlueId: "phil-jackson",
  }), { assertInvariants: false }));
  for (const g of withLedger) for (const r of g.possessionLedger) if (r.coverageType) cov[r.coverageType] = (cov[r.coverageType] || 0) + 1;
  line("coverage diversity", `${Object.keys(cov).length} distinct — ${Object.entries(cov).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  const mm = {};
  for (const g of withLedger) for (const r of g.possessionLedger) if (r.mismatchType) mm[r.mismatchType] = (mm[r.mismatchType] || 0) + 1;
  line("mismatch types targeted", `${Object.keys(mm).length} distinct`);
  const goldWins = gs.filter((g) => g.winner === "Gold").length;
  line("winner split", `Gold ${goldWins} / Blue ${gs.length - goldWins}`);
  line("distinct scorelines", `${new Set(gs.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size} of ${gs.length}`);

  // ── performance ────────────────────────────────────────────────────────────
  console.log("\n══ PERFORMANCE ═════════════════════════════════════════════════════");
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) planFor(LINEUPS.showtime, LINEUPS.splash, "1990s", "pat-riley");
  line("assignment plan (incl. context)", `${(Number(process.hrtime.bigint() - t1) / 1e6 / 50).toFixed(2)} ms`);
  const ctxOnce = preparePossessionContext(buildPossessionInput({ goldIds: LINEUPS.showtime, blueIds: LINEUPS.splash, eraStyleId: "1990s", simulationSeed: 1, coachGoldId: "pat-riley", coachBlueId: "phil-jackson" }));
  const t2 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) buildDefensivePlan({ defendingTeam: ctxOnce.gold, offensiveTeam: ctxOnce.blue, era: getEra("1990s") });
  line("plan only (120 permutations)", `${(Number(process.hrtime.bigint() - t2) / 1e6 / 200).toFixed(2)} ms`);
  if (typeof process.memoryUsage === "function") line("heap", `${Math.round(process.memoryUsage().heapUsed / 1048576)} MB`);

  console.log(`\n${violations === 0 ? "✓ zero severe baseline mismatches across every matchup × era cell" : "✗ severe baseline mismatches present"}`);
};

if (import.meta.url === `file://${process.argv[1]}`) run();
export { run };
