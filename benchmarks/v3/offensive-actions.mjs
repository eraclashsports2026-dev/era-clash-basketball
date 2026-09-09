#!/usr/bin/env node
// ── Phase 6B2 offensive action benchmark ────────────────────────────────────
//   node benchmarks/v3/offensive-actions.mjs
//   node benchmarks/v3/offensive-actions.mjs --games=5000
import { runPossessionGame, checkGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { childSeeds } from "../../src/v3/possession/rng.js";

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
  movement: ["curry-10s", "ray-00s", "klay-10s", "dirk-00s", "jokic-20s"],
  stoppers: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
};

const FAST = { assertInvariants: false, includeLedger: false };
const LEDGER = { assertInvariants: false, includeLedger: true };
const line = (l, v) => console.log(`   ${String(l).padEnd(30)} ${v}`);

const play = (goldIds, blueIds, era, seed, coachGold, coachBlue, over = {}, opts = LEDGER) =>
  runPossessionGame(buildPossessionInput({
    goldIds, blueIds, eraStyleId: era, simulationSeed: seed,
    coachGoldId: coachGold, coachBlueId: coachBlue, ...over,
  }), opts);

const familyCounts = (games, side = null) => {
  const c = {};
  let total = 0;
  for (const g of games) {
    for (const r of g.possessionLedger ?? []) {
      if (side && r.offense !== side) continue;
      c[r.action] = (c[r.action] || 0) + 1; total++;
    }
  }
  return { counts: c, total, share: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / total])) };
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

const run = () => {
  const N = arg("games", 5000);
  console.log("── Phase 6B2 offensive action benchmark ────────────────────────────");
  console.log("   DEVELOPMENT — no historical calibration is claimed.\n");

  // ══ ACTION DIVERSITY BY COACH ═════════════════════════════════════════════
  console.log("══ ACTION DIVERSITY BY COACH (2010s, 60 games each) ════════════════");
  const COACHES = ["phil-jackson", "mike-dantoni", "steve-kerr", "jerry-sloan", "pat-riley", "nick-nurse", "gregg-popovich"];
  const byCoach = {};
  for (const c of COACHES) {
    const gs = childSeeds(11, 60).map((s) => play(LINEUPS.showtime, LINEUPS.splash, "2010s", s, c, "phil-jackson"));
    const f = familyCounts(gs, "gold");
    byCoach[c] = f.share;
    const top = Object.entries(f.share).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k.replace("_HALF_COURT", "").replace(/_/g, "-")} ${pct(v)}`).join("  ");
    console.log(`   ${c.padEnd(17)} ${top}`);
  }
  // Nobody may run one action for everything, and coaches must differ.
  const maxShareAnyCoach = Math.max(...Object.values(byCoach).flatMap((s) => Object.values(s)));
  line("max single-family share", `${pct(maxShareAnyCoach)}  ${maxShareAnyCoach < 0.5 ? "✓ no action dominates" : "✗"}`);
  const topFamilies = new Set(Object.values(byCoach).map((s) => Object.entries(s).sort((a, b) => b[1] - a[1])[0][0]));
  line("distinct top families", `${topFamilies.size}  ${topFamilies.size > 1 ? "✓ coaches differ" : "✗ one coach identity"}`);

  // ══ GENERIC SHARE ═════════════════════════════════════════════════════════
  console.log("\n══ GENERIC_HALF_COURT SHARE ════════════════════════════════════════");
  console.log("   Generic is a truthful fallback, not something to force to zero.\n");
  for (const c of COACHES) line(`by coach: ${c}`, pct(byCoach[c].GENERIC_HALF_COURT ?? 0));
  console.log("");
  for (const era of ["1960s", "1980s", "1990s", "2010s", "2020s"]) {
    const gs = childSeeds(11, 40).map((s) => play(LINEUPS.showtime, LINEUPS.splash, era, s, "phil-jackson", "pat-riley"));
    line(`by era: ${era}`, pct(familyCounts(gs, "gold").share.GENERIC_HALF_COURT ?? 0));
  }
  console.log("");
  for (const [name, ids] of Object.entries({ showtime: LINEUPS.showtime, smallBall: LINEUPS.smallBall, size: LINEUPS.size, movement: LINEUPS.movement })) {
    const gs = childSeeds(11, 40).map((s) => play(ids, LINEUPS.splash, "2010s", s, "phil-jackson", "pat-riley"));
    line(`by roster: ${name}`, pct(familyCounts(gs, "gold").share.GENERIC_HALF_COURT ?? 0));
  }

  // ══ CANONICAL SCENARIOS ═══════════════════════════════════════════════════
  console.log("\n══ CANONICAL BASKETBALL SCENARIOS ══════════════════════════════════");
  const scenario = (label, goldIds, blueIds, era, cg, cb, probe) => {
    const gs = childSeeds(4242, 60).map((s) => play(goldIds, blueIds, era, s, cg, cb));
    console.log(`\n▶ ${label}`);
    const f = familyCounts(gs, "gold");
    line("gold action mix", Object.entries(f.share).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k.replace(/_/g, "-")} ${pct(v)}`).join("  "));
    probe(gs, f);
    line("invariant violations", gs.reduce((a, g) => a + checkGame(g).length, 0) === 0 ? "0  ✓" : "✗");
  };

  scenario("Magic's team vs the Splash lineup", LINEUPS.showtime, LINEUPS.splash, "2010s", "phil-jackson", "steve-kerr", (gs, f) => {
    const posts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.offense === "gold"));
    line("gold post-ups", `${posts.length}  (${posts.filter((r) => r.targetedMismatch).length} attacking a named mismatch)`);
    const blueMove = familyCounts(gs, "blue").share;
    line("blue off-ball + handoff", pct((blueMove.OFF_BALL_SCREEN ?? 0) + (blueMove.HANDOFF ?? 0)));
  });

  scenario("Shaq against a smaller centre", LINEUPS.shaqEra, LINEUPS.smallBall, "2000s", "pat-riley", "steve-kerr", (gs, f) => {
    line("post-up share", pct(f.share.POST_UP ?? 0));
    const posts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.offense === "gold"));
    const kick = posts.filter((r) => r.variant === "KICKOUT").length;
    line("kickouts out of doubles", `${kick} of ${posts.length}`);
    line("avg gold FTA", (gs.reduce((a, g) => a + g.gold.totals.fta, 0) / gs.length).toFixed(1));
    line("avg gold OREB", (gs.reduce((a, g) => a + g.gold.totals.oreb, 0) / gs.length).toFixed(1));
  });

  scenario("Jokic as a handoff / passing hub", LINEUPS.smallBall, LINEUPS.size, "2020s", "nick-nurse", "jerry-sloan", (gs, f) => {
    line("handoff share", pct(f.share.HANDOFF ?? 0));
    const hand = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "HANDOFF" && r.offense === "gold"));
    line("hub slips to the rim", `${hand.filter((r) => r.variant === "SLIP").length} of ${hand.length}`);
  });

  scenario("Movement-shooter lineup", LINEUPS.movement, LINEUPS.stoppers, "2010s", "steve-kerr", "tom-thibodeau", (gs, f) => {
    line("off-ball screen share", pct(f.share.OFF_BALL_SCREEN ?? 0));
    const sc = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "OFF_BALL_SCREEN" && r.offense === "gold"));
    line("screens denied by the chase", `${sc.filter((r) => r.variant === "DENIED").length} of ${sc.length}`);
    line("avg gold 3PA", (gs.reduce((a, g) => a + g.gold.totals.tpa, 0) / gs.length).toFixed(1));
  });

  scenario("Small ball vs size", LINEUPS.smallBall, LINEUPS.size, "2010s", "steve-kerr", "jerry-sloan", (gs, f) => {
    const goldWin = gs.filter((g) => g.winner === "Gold").length / gs.length;
    line("small-ball win rate", `${pct(goldWin)}  ${goldWin > 0.05 && goldWin < 0.95 ? "✓ neither side automatic" : "✗"}`);
    line("gold OREB conceded", (gs.reduce((a, g) => a + g.blue.totals.oreb, 0) / gs.length).toFixed(1));
    line("gold 3PA", (gs.reduce((a, g) => a + g.gold.totals.tpa, 0) / gs.length).toFixed(1));
  });

  // Zone vs shooting.
  console.log("\n▶ Zone vs shooting");
  const zoneGames = childSeeds(4242, 80).map((s) => play(LINEUPS.stoppers, LINEUPS.movement, "2020s", s, "nick-nurse", "steve-kerr"));
  const zg = zoneGames.filter((g) => g.zoneShells?.gold);
  line("games with a gold zone", `${zg.length} of ${zoneGames.length}  (shell ${zoneGames[0].zoneShells?.gold ?? "none"})`);
  const zonePos = zoneGames.flatMap((g) => g.possessionLedger.filter((r) => r.zoneGap));
  const gapCount = {};
  for (const r of zonePos) gapCount[r.zoneGap] = (gapCount[r.zoneGap] || 0) + 1;
  line("zone gaps attacked", Object.entries(gapCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  ") || "(none)");
  line("zone possessions", zonePos.length);
  line("no primary defender", zonePos.every((r) => r.primaryDefenderId == null) ? "✓ resolved by area" : "✗ man assignments leaked in");
  const zoneWin = zoneGames.filter((g) => g.winner === "Gold").length / zoneGames.length;
  line("zone team win rate", `${pct(zoneWin)}  ${zoneWin > 0.05 && zoneWin < 0.95 ? "✓ zone neither always wins nor always loses" : "✗"}`);

  // ══ A/B: 6B1 vs 6B2 ══════════════════════════════════════════════════════
  console.log("\n══ A/B — Phase 6B1 (defence + generic/PnR) vs Phase 6B2 (full) ═════");
  const abSeeds = childSeeds(909, 200);
  const arm = (over) => {
    const gs = abSeeds.map((s) => play(LINEUPS.showtime, LINEUPS.splash, "2010s", s, "phil-jackson", "steve-kerr", over));
    const avg = (f) => gs.reduce((a, g) => a + f(g), 0) / gs.length;
    const pooled = (m, a) => {
      const num = gs.reduce((x, g) => x + m(g), 0), den = gs.reduce((x, g) => x + a(g), 0);
      return den ? num / den : 0;
    };
    const f = familyCounts(gs, "gold");
    return {
      score: `${avg((g) => g.finalScore.gold).toFixed(1)}-${avg((g) => g.finalScore.blue).toFixed(1)}`,
      goldWin: gs.filter((g) => g.winner === "Gold").length / gs.length,
      fga: avg((g) => g.gold.totals.fga), tpa: avg((g) => g.gold.totals.tpa),
      fgPct: pooled((g) => g.gold.totals.fgm, (g) => g.gold.totals.fga),
      ast: avg((g) => g.gold.totals.ast), to: avg((g) => g.gold.totals.to),
      fta: avg((g) => g.gold.totals.fta), oreb: avg((g) => g.gold.totals.oreb),
      families: Object.keys(f.counts).length,
      generic: f.share.GENERIC_HALF_COURT ?? 0,
      postUps: f.counts.POST_UP ?? 0, offBall: f.counts.OFF_BALL_SCREEN ?? 0,
      mismatchAttacks: gs.flatMap((g) => g.possessionLedger.filter((r) => r.targetedMismatch && r.offense === "gold")).length,
      viol: gs.reduce((a, g) => a + checkGame(g).length, 0),
    };
  };
  const base = arm({ expandedActions: false, zoneResolution: false, offensiveAdjustments: false });
  const full = arm({});
  console.log("     metric              6B1 baseline        6B2 expanded");
  const row = (n, a, b, fmt = (x) => (typeof x === "number" ? x.toFixed(1) : String(x))) =>
    console.log(`     ${String(n).padEnd(19)} ${String(fmt(a)).padStart(12)} ${String(fmt(b)).padStart(19)}`);
  row("score", base.score, full.score, (x) => x);
  row("gold win%", base.goldWin * 100, full.goldWin * 100);
  row("action families", base.families, full.families, (x) => String(x));
  row("generic share", base.generic * 100, full.generic * 100);
  row("post-ups", base.postUps, full.postUps, (x) => String(x));
  row("off-ball screens", base.offBall, full.offBall, (x) => String(x));
  row("mismatch attacks", base.mismatchAttacks, full.mismatchAttacks, (x) => String(x));
  row("gold FGA", base.fga, full.fga);
  row("gold 3PA", base.tpa, full.tpa);
  row("gold FG%", base.fgPct * 100, full.fgPct * 100, (x) => x.toFixed(2));
  row("gold AST", base.ast, full.ast);
  row("gold TO", base.to, full.to);
  row("gold FTA", base.fta, full.fta);
  row("gold OREB", base.oreb, full.oreb);
  line("invariant violations", `${base.viol} / ${full.viol}`);

  // ══ CONSERVATION SWEEP ═══════════════════════════════════════════════════
  console.log(`\n══ CONSERVATION SWEEP — ${N} games ═════════════════════════════════`);
  const CELLS = [];
  for (const era of ["1960s", "1990s", "2010s", "2020s"]) {
    for (const [cg, cb] of [["phil-jackson", "steve-kerr"], ["mike-dantoni", "jerry-sloan"], ["nick-nurse", "pat-riley"]]) {
      for (const [d, o] of [[LINEUPS.showtime, LINEUPS.splash], [LINEUPS.smallBall, LINEUPS.size], [LINEUPS.movement, LINEUPS.stoppers]]) {
        CELLS.push({ era, cg, cb, d, o });
      }
    }
  }
  const perCell = Math.max(1, Math.ceil(N / CELLS.length));
  let violations = 0, ties = 0, played = 0, ot = 0, nan = 0;
  const allFamilies = new Set();
  const t0 = process.hrtime.bigint();
  for (const c of CELLS) {
    for (const s of childSeeds(2026, perCell)) {
      const g = play(c.d, c.o, c.era, s, c.cg, c.cb, {}, FAST);
      played++;
      violations += checkGame(g).length;
      if (g.finalScore.gold === g.finalScore.blue) ties++;
      if (g.overtimes > 0) ot++;
      for (const side of ["gold", "blue"]) {
        for (const p of g[side].players) {
          for (const v of Object.values(p)) if (typeof v === "number" && !Number.isFinite(v)) nan++;
          for (const [k, v] of Object.entries(p)) if (typeof v === "number" && v < 0) { nan++; void k; }
        }
      }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  line("matchup × coach × era cells", CELLS.length);
  line("games played", played);
  line("runtime", `${(ms / 1000).toFixed(1)} s  (${(ms / played).toFixed(2)} ms/game)`);
  line("invariant violations", violations === 0 ? "0  ✓" : `${violations}  ✗`);
  line("final ties", ties === 0 ? "0  ✓" : `${ties}  ✗`);
  line("NaN / Infinity / negative", nan === 0 ? "0  ✓" : `${nan}  ✗`);
  line("overtime rate", pct(ot / played));

  // ══ REPLAY ════════════════════════════════════════════════════════════════
  console.log("\n══ REPLAY ══════════════════════════════════════════════════════════");
  const a = play(LINEUPS.showtime, LINEUPS.splash, "2010s", 31337, "phil-jackson", "steve-kerr");
  const b = play(LINEUPS.showtime, LINEUPS.splash, "2010s", 31337, "phil-jackson", "steve-kerr");
  line("same seed identical", JSON.stringify(a) === JSON.stringify(b) ? "yes  ✓" : "NO  ✗");
  line("same assignments", JSON.stringify(a.defense) === JSON.stringify(b.defense) ? "yes  ✓" : "NO  ✗");
  line("same offensive plans", JSON.stringify(a.offense) === JSON.stringify(b.offense) ? "yes  ✓" : "NO  ✗");
  line("same actions", JSON.stringify(a.possessionLedger.map((r) => r.action)) === JSON.stringify(b.possessionLedger.map((r) => r.action)) ? "yes  ✓" : "NO  ✗");
  const c = play(LINEUPS.showtime, LINEUPS.splash, "2010s", 31338, "phil-jackson", "steve-kerr");
  line("new seed differs", JSON.stringify(a) !== JSON.stringify(c) ? "yes  ✓" : "NO  ✗");

  console.log(`\n${violations === 0 && ties === 0 && nan === 0 ? "✓ zero invariant failures, zero ties, zero invalid values" : "✗ failures present"}`);
};

if (import.meta.url === `file://${process.argv[1]}`) run();
export { run };
