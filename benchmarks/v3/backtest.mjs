#!/usr/bin/env node
// ── EraClash Labs: HISTORICAL BACKTEST (Addendum 19/20/37) ─────────────────────
// Runs real historical five-man units (built from the player pool, coached by
// their real coach) inside their NATIVE Era Style and asks: does the engine
// produce this team's known basketball identity? We do NOT chase exact game
// scores — we check direction and shape: pace, shot distribution, efficiency,
// defense, and usage hierarchy.
//
// CALIBRATION vs HOLDOUT: formulas may be tuned against calibration teams
// only. Holdout teams measure generalization — if calibration passes and
// holdout collapses, we overfit. Both are reported every run.
//   node benchmarks/v3/backtest.mjs [gamesPerTeam=120]
import { PLAYERS } from "../../src/players.js";
import { simulateGameV3, resolveCoach, resolveEra } from "../../src/v3/engine.js";
import { genOpponent } from "../../src/draft.js";
import { mulberry32, deriveSeed } from "../../src/v3/seed.js";
import BACKTEST from "./data/backtestTeams.mjs";

const N = Number(process.argv[2]) || 120;
const byId = new Map(PLAYERS.map((p) => [p.id, p]));

const DIR = { "well-above-league": 1, "above-league": 1, "league-average": 0, "below-league": -1, "well-below-league": -1, "era-no-threes": null, elite: 1 };

const runTeam = (t) => {
  const lineup = t.lineup.map((id) => byId.get(id));
  if (lineup.some((p) => !p)) return { label: t.label, error: `missing ids: ${t.lineup.filter((id) => !byId.get(id)).join(",")}` };
  const coach = resolveCoach(t.coachId);
  const era = resolveEra(t.eraId);
  const neutral = resolveCoach("neutral");
  const oppRng = mulberry32(deriveSeed(424242, t.label.length));

  const agg = { poss: 0, fga: 0, fgm: 0, tpa: 0, oppFga: 0, oppFgm: 0, games: 0 };
  const shareSum = new Map(t.lineup.map((id) => [id, 0]));
  for (let i = 0; i < N; i++) {
    const opp = genOpponent(oppRng);
    const g = simulateGameV3(lineup, opp, coach, neutral, era, deriveSeed(31337, i));
    agg.poss += g.possessions; agg.games++;
    agg.fga += g.gold.totals.fga; agg.fgm += g.gold.totals.fgm; agg.tpa += g.gold.totals.tpa;
    agg.oppFga += g.blue.totals.fga; agg.oppFgm += g.blue.totals.fgm;
    for (const u of g.gold.usage) shareSum.set(u.id, shareSum.get(u.id) + u.share);
  }

  const possPerGame = agg.poss / agg.games;
  const fgPct = agg.fgm / agg.fga;
  const oppFgPct = agg.oppFgm / agg.oppFga;
  const tpaPerGame = agg.tpa / agg.games;

  // usage hierarchy: engine usage ranking vs the researched historical order
  const engineRank = [...shareSum.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const want = t.usageOrder || t.lineup;
  const rankErr = want.reduce((s, id, i) => s + Math.abs(engineRank.indexOf(id) - i), 0) / want.length;

  return {
    label: t.label, set: t.set, identity: t.identity, rankErr,
    // raw deltas vs the era baseline; identity checks are scored FIELD-
    // RELATIVE afterwards (every team faces the same elite random-opponent
    // model, so the league average is the wrong bar for efficiency)
    deltas: {
      pace: possPerGame - era.environment.pace,
      threes: t.identity.threeRel === "era-no-threes" ? (tpaPerGame === 0 ? null : tpaPerGame) : tpaPerGame - era.environment.tpaPerGame,
      threesScale: era.environment.tpaPerGame || 1,
      offEff: fgPct - era.environment.fgPct,
      defEff: oppFgPct - era.environment.fgPct,
    },
    metrics: { possPerGame: +possPerGame.toFixed(1), eraPace: era.environment.pace, fgPct: +(fgPct * 100).toFixed(1), eraFg: +(era.environment.fgPct * 100).toFixed(1), tpaPerGame: +tpaPerGame.toFixed(1), eraTpa: era.environment.tpaPerGame },
  };
};

console.log(`\n══ EraClash Labs — HISTORICAL BACKTEST (${N} games/team vs era-random opponents) ══\n`);
const results = BACKTEST.teams.map(runTeam).filter((r) => !r.error || (console.log(`✗ ${r.label}: ${r.error}`), false));
// field means: what an average backtest team shows against the same opponent model
const mean = (f) => results.reduce((s, r) => s + f(r), 0) / results.length;
const FIELD = { offEff: mean((r) => r.deltas.offEff), defEff: mean((r) => r.deltas.defEff) };
console.log(`field means vs era baseline (elite-opponent model): own FG% ${(FIELD.offEff * 100).toFixed(1)} · opp FG% ${(FIELD.defEff * 100).toFixed(1)}\n`);

const scoreTeam = (r) => {
  const checks = [];
  const dir = (name, expectDir, delta, tol) => {
    if (expectDir == null) return;
    const pass = expectDir === 0 ? Math.abs(delta) <= tol : Math.sign(delta) === expectDir;
    checks.push({ name, pass, detail: `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` });
  };
  dir("pace", DIR[r.identity.paceRel], r.deltas.pace, 1.6);
  if (r.identity.threeRel === "era-no-threes") checks.push({ name: "threes", pass: r.deltas.threes === null, detail: "0 3PA pre-line" });
  else dir("threes", DIR[r.identity.threeRel], r.deltas.threes, r.deltas.threesScale * 0.25);
  dir("offEff", DIR[r.identity.offEffRel] ?? 0, r.deltas.offEff - FIELD.offEff, 0.02);
  if (r.identity.defEffRel) dir("defEff", -(DIR[r.identity.defEffRel] ?? 0), r.deltas.defEff - FIELD.defEff, 0.015);
  checks.push({ name: "usage", pass: r.rankErr <= 1.2, detail: `mean rank error ${r.rankErr.toFixed(2)}` });
  return checks;
};

const bySet = { calibration: [], holdout: [] };
for (const r of results) {
  const checks = scoreTeam(r);
  const scored = { ...r, checks, passed: checks.filter((c) => c.pass).length, total: checks.length };
  bySet[r.set].push(scored);
  const marks = checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.name}(${c.detail})`).join("  ");
  console.log(`${r.set === "holdout" ? "HOLD" : "CAL "} ${r.label.padEnd(36)} ${scored.passed}/${scored.total}  ${marks}`);
  console.log(`      pace ${r.metrics.possPerGame} (era ${r.metrics.eraPace}) · FG% ${r.metrics.fgPct} (era ${r.metrics.eraFg}) · 3PA ${r.metrics.tpaPerGame} (era ${r.metrics.eraTpa})`);
}
const rate = (rs) => { const p = rs.reduce((s, r) => s + r.passed, 0), t = rs.reduce((s, r) => s + r.total, 0); return `${p}/${t} (${Math.round((p / t) * 100)}%)`; };
console.log(`\ncalibration identity checks: ${rate(bySet.calibration)}`);
console.log(`holdout identity checks:     ${rate(bySet.holdout)}  ← generalization`);
const calPct = bySet.calibration.reduce((s, r) => s + r.passed, 0) / bySet.calibration.reduce((s, r) => s + r.total, 0);
const holPct = bySet.holdout.reduce((s, r) => s + r.passed, 0) / bySet.holdout.reduce((s, r) => s + r.total, 0);
if (calPct - holPct > 0.25) console.log("⚠ holdout collapse: engine may be overfit to calibration teams");
else console.log("✓ holdout within range of calibration — engine generalizes, not memorizes");
