#!/usr/bin/env node
// ── Pre-6C2A structural baseline ────────────────────────────────────────────
// Captures what the engine does BEFORE the shot-opportunity correction, so
// every structural change in Phase 6C2A produces an explicit before/after
// rather than a claim.
//
// This is NOT a claim of historical correctness. Several of the numbers it
// freezes are known to be wrong — a leading option taking 38.8% of team shots
// is the defect this phase exists to fix. The point is that a defect measured
// precisely can be shown to have moved.
//
//   npm run calibration:freeze-structural          -- verify against the frozen file
//   npm run calibration:freeze-structural -- --write  -- regenerate it deliberately
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { teamMetrics, styleMetrics, quantiles } from "../../src/v3/calibration/metrics.js";
import { calibrationFixtures, buildManifest } from "../../data/calibration/split.mjs";
import { fixtureSeeds } from "../../data/calibration/seeds.mjs";
import { versionOf } from "../../src/versions.js";

export const BASELINE_PATH = "tests/fixtures/calibration-framework/pre-6c2a/structural-baseline.json";
// The AFTER state. Kept in a separate file so the "before" can never be
// overwritten by a routine rerun — a before/after comparison whose before moves
// is not a comparison.
export const POST_PATH = "tests/fixtures/calibration-framework/post-6c2a/structural-baseline.json";

// Deliberately modest: this file is a REGRESSION anchor, run on every test
// pass, not the full 1,000-game diagnostic. The heavy runs live in the
// benchmark harness where their cost is paid once.
const SIMS = Number(process.env.STRUCTURAL_BASELINE_SIMS ?? 120);

const ids = (f) => f.roster.map((r) => r.playerCardId);

/**
 * The opponent choice is part of the frozen design. A fixture measured against
 * a different opponent is a different measurement — the opponent's quality is
 * half of every number produced.
 */
export const opponentFor = (fixture, pool) => {
  const sameEra = pool.filter((f) => f.eraStyleId === fixture.eraStyleId && f.fixtureId !== fixture.fixtureId);
  const candidates = sameEra.length ? sameEra : pool.filter((f) => f.fixtureId !== fixture.fixtureId);
  return [...candidates].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId))[0];
};

/**
 * Usage entropy, in bits, over the five players' shot shares. It answers a
 * question a "leading share" number cannot: is the offence genuinely shared, or
 * is one player carrying it? Five equal shares gives log2(5) = 2.322 bits; one
 * player taking everything gives 0.
 */
export const usageEntropy = (shares) => {
  const s = shares.filter((x) => x > 0);
  if (!s.length) return 0;
  return -s.reduce((a, p) => a + p * Math.log2(p), 0);
};

/** Shot-distribution shape for one side of one game. */
const distributionOf = (side) => {
  const total = side.totals.fga;
  if (!total) return null;
  const shares = side.players.map((p) => p.fga / total).sort((a, b) => b - a);
  return {
    leadingShare: shares[0],
    topTwoShare: shares[0] + (shares[1] ?? 0),
    entropy: usageEntropy(shares),
    // "Meaningful" is a documented threshold, not a natural constant: 8% of a
    // team's shots is roughly seven attempts in a 90-shot game — enough to be a
    // participant rather than a passenger.
    meaningfulShooters: shares.filter((x) => x >= 0.08).length,
    shares,
  };
};

export const captureFixture = (fixture, pool, { sims = SIMS } = {}) => {
  const opp = opponentFor(fixture, pool);
  const seeds = fixtureSeeds("CALIBRATION", `${fixture.fixtureId}|${opp.fixtureId}|${fixture.eraStyleId}`, sims);
  const games = seeds.map((seed) => runPossessionGame(buildPossessionInput({
    goldIds: ids(fixture), blueIds: ids(opp),
    coachGoldId: fixture.coachId, coachBlueId: opp.coachId,
    eraStyleId: fixture.eraStyleId, simulationSeed: seed,
  })));

  const team = games.map((g) => teamMetrics(g.gold, g.blue, { periods: g.periods }));
  // Both sides, because a defect that only shows on one side of the matchup is
  // still a defect and the calibration set is small enough to afford it.
  const dists = games.flatMap((g) => [distributionOf(g.gold), distributionOf(g.blue)]).filter(Boolean);

  // Per-card lines, so a player-level regression is visible without rerunning
  // the whole diagnostic.
  const byCard = {};
  for (const g of games) {
    for (const s of ["gold", "blue"]) {
      for (const p of g[s].players) {
        const r = (byCard[p.cardId] = byCard[p.cardId] ?? { name: p.name, pts: [], fga: [], tpa: [], fta: [], reb: [], ast: [], to: [] });
        r.pts.push(p.pts); r.fga.push(p.fga); r.tpa.push(p.tpa); r.fta.push(p.fta);
        r.reb.push(p.reb); r.ast.push(p.ast); r.to.push(p.to);
      }
    }
  }

  const q = (k) => quantiles(team.map((t) => t[k]));
  return {
    fixtureId: fixture.fixtureId,
    opponentId: opp.fixtureId,
    eraStyleId: fixture.eraStyleId,
    coachId: fixture.coachId,
    sims,
    team: {
      pace: q("pace"), offensiveRating: q("offensiveRating"), defensiveRating: q("defensiveRating"),
      efgPct: q("efgPct"), trueShootingPct: q("trueShootingPct"), fieldGoalPct: q("fieldGoalPct"),
      turnoverPct: q("turnoverPct"), offensiveReboundPct: q("offensiveReboundPct"),
      freeThrowRate: q("freeThrowRate"), threePointAttemptRate: q("threePointAttemptRate"),
      assistRate: q("assistRate"), points: q("points"),
    },
    distribution: {
      leadingShare: quantiles(dists.map((d) => d.leadingShare)),
      topTwoShare: quantiles(dists.map((d) => d.topTwoShare)),
      entropy: quantiles(dists.map((d) => d.entropy)),
      meaningfulShooters: quantiles(dists.map((d) => d.meaningfulShooters)),
    },
    actionMix: styleMetrics(games).share,
    players: Object.fromEntries(Object.entries(byCard).map(([id, r]) => [id, {
      name: r.name,
      pts: quantiles(r.pts), fga: quantiles(r.fga), tpa: quantiles(r.tpa),
      fta: quantiles(r.fta), reb: quantiles(r.reb), ast: quantiles(r.ast), to: quantiles(r.to),
    }])),
    winRate: games.filter((g) => g.finalScore.gold > g.finalScore.blue).length / games.length,
    invariantViolations: games.reduce((a, g) => a + (g.invariantViolations?.length ?? 0), 0),
  };
};

export const captureBaseline = ({ sims = SIMS } = {}) => {
  const pool = calibrationFixtures();
  const fixtures = pool.map((f) => captureFixture(f, pool, { sims }));

  // Corpus-wide rollup: the headline numbers the priority register cites.
  const allLeading = fixtures.flatMap((f) => Array(1).fill(f.distribution.leadingShare.mean));
  return {
    purpose: "Pre-6C2A structural baseline. NOT a claim of historical correctness — several frozen values are known defects. This exists so a structural change produces an explicit before/after.",
    phase: "6C2A",
    sims,
    calibrationManifestHash: buildManifest("calibration").manifestHash,
    versions: Object.fromEntries(["possessionEngineVersion", "actionLibraryVersion", "defensiveMatchupVersion",
      "zoneResolutionVersion", "coachAdjustmentVersion", "playerIntelligenceVersion", "teamIntelligenceVersion",
      "coachIntelligenceVersion", "eraStyleVersion", "playerDataVersion", "coachDataVersion", "eraDataVersion",
      "benchmarkSeedSetVersion", "historicalFixtureDataVersion"].map((d) => [d, versionOf(d)])),
    rollup: {
      leadingShareMean: round(mean(fixtures.map((f) => f.distribution.leadingShare.mean)), 4),
      leadingShareP95: round(mean(fixtures.map((f) => f.distribution.leadingShare.p95)), 4),
      leadingShareMax: round(Math.max(...fixtures.map((f) => f.distribution.leadingShare.max)), 4),
      topTwoShareMean: round(mean(fixtures.map((f) => f.distribution.topTwoShare.mean)), 4),
      entropyMean: round(mean(fixtures.map((f) => f.distribution.entropy.mean)), 4),
      meaningfulShootersMean: round(mean(fixtures.map((f) => f.distribution.meaningfulShooters.mean)), 3),
      totalInvariantViolations: fixtures.reduce((a, f) => a + f.invariantViolations, 0),
    },
    fixtures,
  };
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

export const hashBaseline = (b) =>
  createHash("sha256").update(JSON.stringify({ rollup: b.rollup, fixtures: b.fixtures })).digest("hex");

export const loadBaseline = (path = BASELINE_PATH) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

/** Field-level diff, so a regression names what moved rather than "hash differs". */
export const diffBaseline = (before, after) => {
  const out = [];
  for (const [k, v] of Object.entries(before.rollup)) {
    if (after.rollup[k] !== v) out.push({ path: `rollup.${k}`, before: v, after: after.rollup[k] });
  }
  const byId = new Map(after.fixtures.map((f) => [f.fixtureId, f]));
  for (const f of before.fixtures) {
    const a = byId.get(f.fixtureId);
    if (!a) { out.push({ path: `fixtures.${f.fixtureId}`, before: "present", after: "MISSING" }); continue; }
    for (const k of ["leadingShare", "topTwoShare", "entropy", "meaningfulShooters"]) {
      if (f.distribution[k].mean !== a.distribution[k].mean) {
        out.push({ path: `${f.fixtureId}.distribution.${k}.mean`, before: f.distribution[k].mean, after: a.distribution[k].mean });
      }
    }
    for (const k of ["pace", "offensiveRating", "efgPct", "fieldGoalPct", "threePointAttemptRate"]) {
      if (f.team[k].mean !== a.team[k].mean) {
        out.push({ path: `${f.fixtureId}.team.${k}.mean`, before: f.team[k].mean, after: a.team[k].mean });
      }
    }
  }
  return out;
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const post = process.argv.includes("--post");
  const path = post ? POST_PATH : BASELINE_PATH;
  const write = process.argv.includes("--write") || post;
  const fresh = captureBaseline();
  const existing = loadBaseline(path);

  if (!existing || write) {
    mkdirSync(post ? "tests/fixtures/calibration-framework/post-6c2a" : "tests/fixtures/calibration-framework/pre-6c2a", { recursive: true });
    writeFileSync(path, JSON.stringify({ ...fresh, phase: post ? "6C2A-post" : fresh.phase }, null, 2) + "\n");
    console.log(`${existing ? "REWROTE" : "wrote"} ${path}`);
    if (existing) {
      const d = diffBaseline(existing, fresh);
      console.log(`\n${d.length} field(s) changed — this is the explicit before/after a rewrite requires:\n`);
      for (const x of d.slice(0, 40)) console.log(`  ${x.path.padEnd(56)} ${x.before} -> ${x.after}`);
      if (d.length > 40) console.log(`  ... ${d.length - 40} more`);
    }
  } else {
    const d = diffBaseline(existing, fresh);
    if (!d.length) console.log("✓ structural baseline unchanged");
    else {
      console.log(`STRUCTURAL DRIFT — ${d.length} field(s) moved:\n`);
      for (const x of d.slice(0, 40)) console.log(`  ${x.path.padEnd(56)} ${x.before} -> ${x.after}`);
      if (d.length > 40) console.log(`  ... ${d.length - 40} more`);
      console.log(`\nIf intended, rerun with --write to record the before/after.`);
      process.exitCode = 1;
    }
  }

  console.log(`\nrollup:`);
  for (const [k, v] of Object.entries(fresh.rollup)) console.log(`  ${k.padEnd(26)} ${v}`);
}
