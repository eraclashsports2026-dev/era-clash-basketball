#!/usr/bin/env node
// ── Possession Engine 1.0 core benchmark ─────────────────────────────────────
// Measures what the engine actually does: runtime, statistical conservation,
// variance, overtime rate, era expression, and seed reproducibility.
//
// It runs with invariant assertions DISABLED and counts violations instead,
// because a benchmark that throws on the first violation cannot tell you how
// many there are. The required number is zero.
//
//   node benchmarks/v3/possession-core.mjs
//   node benchmarks/v3/possession-core.mjs --games=1000
import { runPossessionGame, runPossessionSeries, childSeeds, checkGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";

const arg = (n, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? Number(hit.slice(n.length + 3)) : d;
};

// The same canonical lineups the Team Intelligence benchmark uses, so the two
// benchmarks describe the same rosters.
export const LINEUPS = {
  superteam: ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"],
  balanced: ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"],
  spacing: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
  defense: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
  interior: ["magic-80s", "jordan-90s", "lebron-10s", "duncan-00s", "shaq-00s"],
};

const OPTS = { assertInvariants: false, includeLedger: false };

const mk = (goldIds, blueIds, era, seed, coachGold = "phil-jackson", coachBlue = "pat-riley") =>
  buildPossessionInput({ goldIds, blueIds, eraStyleId: era, simulationSeed: seed, coachGoldId: coachGold, coachBlueId: coachBlue });

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length, min: s[0], max: s[s.length - 1],
    mean: Math.round(mean * 10) / 10,
    p05: s[Math.floor(s.length * 0.05)], p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)],
  };
};

const line = (label, v) => console.log(`   ${label.padEnd(26)} ${v}`);

const run = () => {
  const N = arg("games", 1000);
  console.log("── Possession Engine 1.0 core benchmark ────────────────────────────");
  console.log("   DEVELOPMENT ENGINE — no historical authority is claimed.\n");

  // ── runtime ────────────────────────────────────────────────────────────────
  console.log("── runtime ──");
  const timed = (label, fn) => {
    const t0 = process.hrtime.bigint();
    const out = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    line(label, `${ms.toFixed(1)} ms`);
    return { ms, out };
  };

  const oneInput = mk(LINEUPS.superteam, LINEUPS.balanced, "2010s", 4242);
  timed("single game", () => runPossessionGame(oneInput, OPTS));
  timed("100 games", () => childSeeds(11, 100).map((s) => runPossessionGame({ ...oneInput, simulationSeed: s }, OPTS)));
  const big = timed(`${N} games`, () => childSeeds(99, N).map((s) => runPossessionGame({ ...oneInput, simulationSeed: s }, OPTS)));
  line(`per game`, `${(big.ms / N).toFixed(2)} ms`);
  timed("best-of-7 child seeds", () => runPossessionSeries({ ...oneInput }, { games: 7, opts: OPTS }));
  timed("82-game child seeds", () => childSeeds(2026, 82).map((s) => runPossessionGame({ ...oneInput, simulationSeed: s }, OPTS)));
  if (typeof process.memoryUsage === "function") {
    line("heap after sweep", `${Math.round(process.memoryUsage().heapUsed / 1048576)} MB`);
  }

  // ── conservation ───────────────────────────────────────────────────────────
  console.log("\n── statistical conservation ──");
  const games = big.out;
  let violations = 0;
  const byCode = {};
  for (const g of games) {
    for (const v of checkGame(g)) { violations++; byCode[v.code] = (byCode[v.code] || 0) + 1; }
  }
  line("games checked", games.length);
  line("invariant violations", violations === 0 ? "0  ✓" : `${violations}  ✗ ${JSON.stringify(byCode)}`);
  line("final ties", games.filter((g) => g.finalScore.gold === g.finalScore.blue).length === 0 ? "0  ✓" : "✗");

  // ── distribution ───────────────────────────────────────────────────────────
  console.log("\n── variance over the same matchup ──");
  const scores = games.flatMap((g) => [g.finalScore.gold, g.finalScore.blue]);
  const s = stats(scores);
  line("score range", `${s.min}–${s.max}   p05 ${s.p05} · p50 ${s.p50} · p95 ${s.p95}`);
  line("possessions/team", JSON.stringify(stats(games.map((g) => g.gold.totals.possessions))));
  const goldWins = games.filter((g) => g.winner === "Gold").length;
  line("winner split", `Gold ${goldWins} / Blue ${games.length - goldWins}  (${Math.round((goldWins / games.length) * 100)}% Gold)`);
  line("distinct scorelines", `${new Set(games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size} of ${games.length}`);
  line("overtime rate", `${((games.filter((g) => g.overtimes > 0).length / games.length) * 100).toFixed(1)}%`);
  line("multi-OT games", games.filter((g) => g.overtimes > 1).length);
  line("max overtimes", Math.max(...games.map((g) => g.overtimes)));
  line("guard fired", games.filter((g) => g.internalError).length === 0 ? "0  ✓" : `${games.filter((g) => g.internalError).length}  ✗`);

  // no player may own every MVP-equivalent (top scorer) in a balanced matchup
  const bal = childSeeds(77, 300).map((sd) => runPossessionGame(mk(LINEUPS.spacing, LINEUPS.defense, "1990s", sd), OPTS));
  const tops = {};
  for (const g of bal) {
    const all = [...g.gold.players, ...g.blue.players].sort((a, b) => b.pts - a.pts)[0];
    tops[all.name] = (tops[all.name] || 0) + 1;
  }
  const topShare = Math.max(...Object.values(tops)) / bal.length;
  line("distinct top scorers", `${Object.keys(tops).length}  (most dominant ${(topShare * 100).toFixed(0)}%)`);

  // ── reproducibility ────────────────────────────────────────────────────────
  console.log("\n── reproducibility ──");
  const a = runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, "2010s", 31337), OPTS);
  const b = runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, "2010s", 31337), OPTS);
  line("same seed identical", JSON.stringify(a) === JSON.stringify(b) ? "yes  ✓" : "NO  ✗");
  const c = runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, "2010s", 31338), OPTS);
  line("new seed differs", JSON.stringify(a) !== JSON.stringify(c) ? "yes  ✓" : "NO  ✗");
  line("rng steps stable", `${a.rngSteps} == ${b.rngSteps}`);

  // ── era expression ─────────────────────────────────────────────────────────
  console.log("\n── era expression (300 games each, same rosters) ──");
  console.log("   era      score      poss    FGA    3PA   3P%(pooled) FTA   OREB   AST");
  for (const era of ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
    const gs = childSeeds(5150, 300).map((sd) => runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, era, sd), OPTS));
    const avg = (f) => (gs.reduce((acc, g) => acc + f(g), 0) / gs.length);
    // POOLED, not averaged. Averaging per-game percentages over-weights games
    // with few attempts and reads ~0.03 low on three-point shooting — an
    // artefact of the reporting, not of the engine.
    const tpmTotal = gs.reduce((a2, g) => a2 + g.gold.totals.tpm + g.blue.totals.tpm, 0);
    const tpaTotal = gs.reduce((a2, g) => a2 + g.gold.totals.tpa + g.blue.totals.tpa, 0);
    const tpa = avg((g) => g.gold.totals.tpa);
    const pooled3 = tpaTotal ? tpmTotal / tpaTotal : null;
    console.log(`   ${era.padEnd(8)} ${avg((g) => g.finalScore.gold).toFixed(0)}-${avg((g) => g.finalScore.blue).toFixed(0)}    ` +
      `${avg((g) => g.gold.totals.possessions).toFixed(0).padStart(4)}  ${avg((g) => g.gold.totals.fga).toFixed(0).padStart(5)}  ` +
      `${tpa.toFixed(1).padStart(5)}  ${(pooled3 == null ? "  n/a" : pooled3.toFixed(3)).padStart(6)}  ` +
      `${avg((g) => g.gold.totals.fta).toFixed(0).padStart(5)}  ${avg((g) => g.gold.totals.oreb).toFixed(0).padStart(5)}  ${avg((g) => g.gold.totals.ast).toFixed(0).padStart(4)}`);
  }
  const pre = childSeeds(1, 120).map((sd) => runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, "1960s", sd), OPTS));
  line("pre-three 3PA total", pre.reduce((a2, g) => a2 + g.gold.totals.tpa + g.blue.totals.tpa, 0) === 0 ? "0  ✓" : "✗ NON-ZERO");

  // ── pace contexts ──────────────────────────────────────────────────────────
  console.log("\n── prepared-context pace extremes ──");
  for (const [label, cg, cb] of [["high pace (D'Antoni)", "mike-dantoni", "mike-dantoni"], ["low pace (Thibodeau)", "tom-thibodeau", "tom-thibodeau"]]) {
    const gs = childSeeds(808, 200).map((sd) => runPossessionGame(mk(LINEUPS.superteam, LINEUPS.balanced, "2010s", sd, cg, cb), OPTS));
    const poss = gs.reduce((a2, g) => a2 + g.gold.totals.possessions, 0) / gs.length;
    line(label, `${poss.toFixed(1)} possessions/team`);
  }

  // ── overtime scenario ──────────────────────────────────────────────────────
  console.log("\n── overtime games (from the sweep) ──");
  const ots = games.filter((g) => g.overtimes > 0);
  if (ots.length) {
    const g = ots[0];
    line("example", `${g.finalScore.gold}-${g.finalScore.blue} in ${g.overtimes} OT (${g.periods} periods)`);
    line("OT stat violations", ots.reduce((a2, x) => a2 + checkGame(x).length, 0) === 0 ? "0  ✓" : "✗");
    line("OT games with a tie", ots.filter((x) => x.finalScore.gold === x.finalScore.blue).length === 0 ? "0  ✓" : "✗");
  } else line("example", "none in this sweep");

  console.log(`\n${violations === 0 ? "✓ zero invariant violations" : `✗ ${violations} invariant violations`}`);
};

if (import.meta.url === `file://${process.argv[1]}`) run();
export { run };
