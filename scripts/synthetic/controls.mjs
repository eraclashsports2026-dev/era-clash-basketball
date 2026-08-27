#!/usr/bin/env node
// ── WS3 basis: measure the guardrail metrics on NON-HOLDOUT controls ────────
//   npm run syn:controls [-- --pairs=1000]
//
// Every threshold and margin in the formal policy has to come from somewhere.
// It comes from here: the synthetic DEVELOPMENT fixtures, measured with the
// exact metric functions the formal runner will use. No Synthetic V2 fixture is
// simulated and no Synthetic V2 output is read — that is the whole point.
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_DEVELOPMENT_V2, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { isZoneShellSelected, isZoneAttackExecuted } from "../v5/realizedZone.mjs";
import { DIR } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;

// ── the frozen balanced control five ────────────────────────────────────────
// Built by a documented deterministic rule from the public card pool: the five
// legal starters whose card rating sits closest to the pool median, one card
// per person, under the neutral coach. Median-by-construction, so it is neither
// a super-team nor a scrub team, and it is derived without reference to any
// holdout fixture.
export const cardRating = (c) => (c.pts ?? 0) + (c.reb ?? 0) * 0.8 + (c.ast ?? 0) * 0.9
  + (c.stl ?? 0) * 1.5 + (c.blk ?? 0) * 1.5 + (c.mvp ?? 0) * 3 + (c.an1 ?? 0) * 2;
export const buildBalancedControl = () => {
  const ratings = PLAYERS.map(cardRating).sort((a, b) => a - b);
  const median = ratings[Math.floor(ratings.length / 2)];
  const pool = [...PLAYERS].sort((a, b) => Math.abs(cardRating(a) - median) - Math.abs(cardRating(b) - median) || a.id.localeCompare(b.id));
  const used = new Set(); const out = new Array(5).fill(null);
  const walk = (i) => {
    if (i === 5) return true;
    for (const c of pool) {
      const pid = person(c.id);
      if (used.has(pid) || !(c.positions ?? [c.pos]).includes(SLOTS[i])) continue;
      used.add(pid); out[i] = c.id;
      if (walk(i + 1)) return true;
      used.delete(pid); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error("no legal balanced control five");
  return { five: out, coachId: "neutral", medianCardRating: r5(median),
    summedRating: r5(out.reduce((a, id) => a + cardRating(PLAYERS.find((c) => c.id === id)), 0)),
    rule: "the five legal starters whose card rating is closest to the public-pool median, one card per person, ties broken by card id, under the neutral coach" };
};

// ── the metric functions the formal runner will use ─────────────────────────
/** Largest single action-family share of a side's possessions. */
export const maxActionFamilyShare = (games, side) => {
  const counts = {}; let total = 0;
  for (const g of games) {
    for (const r of (g.possessionLedger ?? []).filter((x) => x.offense === side)) {
      counts[r.action] = (counts[r.action] ?? 0) + 1; total += 1;
    }
  }
  if (!total) return { share: null, family: null, distribution: {}, possessions: 0 };
  const rows = Object.entries(counts).map(([k, v]) => [k, v / total]).sort((a, b) => b[1] - a[1]);
  return { share: r5(rows[0][1]), family: rows[0][0], possessions: total,
    distribution: Object.fromEntries(rows.map(([k, v]) => [k, r5(v)])) };
};
/** Win rate of the side that actually realized zone possessions, and its share. */
export const shellSideWinRate = (games) => {
  let zoneSideWins = 0; let decided = 0; let realizedTotal = 0; let possTotal = 0; let attackTotal = 0;
  for (const g of games) {
    const rows = g.possessionLedger ?? [];
    const zoneAgainst = { gold: 0, blue: 0 };
    for (const r of rows) {
      possTotal += 1;
      if (isZoneShellSelected(r)) { zoneAgainst[r.offense] += 1; realizedTotal += 1; if (isZoneAttackExecuted(r)) attackTotal += 1; }
    }
    // the DEFENDING side of a zone possession is the other side
    const zoneDefender = zoneAgainst.gold > zoneAgainst.blue ? "blue" : zoneAgainst.blue > zoneAgainst.gold ? "gold" : null;
    if (!zoneDefender || g.finalScore.gold === g.finalScore.blue) continue;
    decided += 1;
    const winner = g.finalScore.gold > g.finalScore.blue ? "gold" : "blue";
    if (winner === zoneDefender) zoneSideWins += 1;
  }
  return { winRate: decided ? r5(zoneSideWins / decided) : null, decidedGames: decided,
    realizedZoneShare: possTotal ? r5(realizedTotal / possTotal) : null,
    zoneAttackShare: realizedTotal ? r5(attackTotal / realizedTotal) : null };
};
/** Scoreline variance across seeds. */
export const seedVariance = (games) => {
  const combined = games.map((g) => g.finalScore.gold + g.finalScore.blue);
  const margins = games.map((g) => Math.abs(g.finalScore.gold - g.finalScore.blue));
  const distinct = new Set(games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size;
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
  return { combinedScoreSd: r5(sd(combined)), marginSd: r5(sd(margins)),
    distinctScorelineRatio: r5(distinct / games.length), games: games.length };
};
/** Structural integrity of a game set. */
export const structuralOf = (games) => {
  let invariants = 0, impossible = 0, nonFinite = 0, negative = 0, ties = 0;
  for (const g of games) {
    invariants += (g.invariantViolations ?? []).length;
    for (const v of [g.finalScore.gold, g.finalScore.blue]) if (v < 20 || v > 220) impossible += 1;
    if (g.finalScore.gold === g.finalScore.blue) ties += 1;
    for (const side of ["gold", "blue"]) {
      for (const v of Object.values(g[side].totals)) {
        if (typeof v === "number" && !Number.isFinite(v)) nonFinite += 1;
        if (typeof v === "number" && v < 0) negative += 1;
      }
    }
  }
  return { invariantViolationCount: invariants, impossibleScoreCount: impossible,
    nonFiniteStatCount: nonFinite, negativeStatCount: negative, finalTieCount: ties };
};

/** Side-balanced paired play of one fixture, on one surface. */
export const playFixture = ({ five, coachId, opponentFive, opponentCoachId, era, seedAt, pairs }) => {
  const games = []; const subjectSide = [];
  for (let i = 0; i < pairs; i++) {
    const seed = seedAt(i);
    const g1 = runPossessionGame(buildPossessionInput({ goldIds: five, blueIds: opponentFive,
      coachGoldId: coachId, coachBlueId: opponentCoachId, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false });
    const g2 = runPossessionGame(buildPossessionInput({ goldIds: opponentFive, blueIds: five,
      coachGoldId: opponentCoachId, coachBlueId: coachId, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false });
    games.push(g1, g2); subjectSide.push("gold", "blue");
  }
  return { games, subjectSide };
};
/** Win rate of the SUBJECT across a side-balanced set. */
export const subjectWinRate = ({ games, subjectSide }) => {
  let wins = 0, decided = 0;
  for (const [i, g] of games.entries()) {
    if (g.finalScore.gold === g.finalScore.blue) continue;
    decided += 1;
    const winner = g.finalScore.gold > g.finalScore.blue ? "gold" : "blue";
    if (winner === subjectSide[i]) wins += 1;
  }
  return { winRate: decided ? r5(wins / decided) : null, decidedGames: decided, wins };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000);
  const def = defaultRuntimeParameterSet();
  const control = buildBalancedControl();
  const synIds = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id));
  const synFives = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [...f.five].map(person).sort().join("|")));

  // the control five must not be a holdout lineup
  const controlKey = [...control.five].map(person).sort().join("|");
  if (synFives.has(controlKey)) throw new Error("the balanced control five duplicates a Synthetic V2 lineup — refusing");

  console.log(`SYNTHETIC GUARDRAIL DEVELOPMENT CONTROLS — ${SYNTHETIC_DEVELOPMENT_V2.length} non-holdout fixtures x ${pairs * 2} games\n`);
  console.log(`  balanced control five: ${control.five.join(", ")} (summed rating ${control.summedRating}, pool median ${control.medianCardRating})\n`);

  const rows = [];
  for (const [i, f] of SYNTHETIC_DEVELOPMENT_V2.entries()) {
    if (synIds.has(f.id)) throw new Error(`${f.id} is a holdout member — refusing`);
    // MIRROR surface
    const mirror = playFixture({ five: f.five, coachId: f.coach, opponentFive: f.five, opponentCoachId: f.coach,
      era: f.era, seedAt: (k) => deriveSeed(0x6c4b15, i * 100000 + k), pairs });
    const action = maxActionFamilyShare(mirror.games, "gold");
    const shell = shellSideWinRate(mirror.games);
    const variance = seedVariance(mirror.games);
    const structural = structuralOf(mirror.games);
    // VS_BALANCED_CONTROL surface
    const vsControl = playFixture({ five: f.five, coachId: f.coach, opponentFive: control.five,
      opponentCoachId: control.coachId, era: f.era, seedAt: (k) => deriveSeed(0x6c4b16, i * 100000 + k), pairs: Math.floor(pairs / 2) });
    const subj = subjectWinRate(vsControl);
    const fixtureRating = r5(f.five.reduce((a, id) => a + cardRating(PLAYERS.find((c) => c.id === id) ?? {}), 0));
    rows.push({ devFixtureId: f.id, purpose: f.purpose, era: f.era, coach: f.coach,
      mirror: { maxActionFamilyShare: action.share, dominantFamily: action.family, actionDistribution: action.distribution,
        possessions: action.possessions, shell, variance, structural, games: mirror.games.length },
      vsBalancedControl: { subjectWinRate: subj.winRate, decidedGames: subj.decidedGames,
        controlWinRate: subj.winRate == null ? null : r5(1 - subj.winRate),
        fixtureSummedRating: fixtureRating, controlSummedRating: control.summedRating,
        ratingGap: r5(fixtureRating - control.summedRating), games: vsControl.games.length } });
    console.log(`  ${f.id.padEnd(28)} maxAction ${String(action.share).padEnd(8)} (${String(action.family).padEnd(18)}) zone ${String(shell.realizedZoneShare).padEnd(8)} shellWin ${String(shell.winRate).padEnd(8)} sd ${String(variance.combinedScoreSd).padEnd(8)} distinct ${String(variance.distinctScorelineRatio).padEnd(7)} vsCtl ${subj.winRate}`);
  }

  const shares = rows.map((r) => r.mirror.maxActionFamilyShare).filter((x) => x != null);
  const sds = rows.map((r) => r.mirror.variance.combinedScoreSd).filter((x) => x != null);
  const distincts = rows.map((r) => r.mirror.variance.distinctScorelineRatio).filter((x) => x != null);
  const shellRates = rows.map((r) => r.mirror.shell.winRate).filter((x) => x != null);
  const winRates = rows.map((r) => r.vsBalancedControl.subjectWinRate).filter((x) => x != null);
  const stat = (xs) => ({ n: xs.length, min: r5(Math.min(...xs)), max: r5(Math.max(...xs)),
    mean: r5(xs.reduce((a, b) => a + b, 0) / xs.length),
    sd: xs.length > 1 ? r5(Math.sqrt(xs.reduce((a, b) => a + (b - xs.reduce((c, d) => c + d, 0) / xs.length) ** 2, 0) / (xs.length - 1))) : null });

  const summary = {
    maxActionFamilyShare: stat(shares), combinedScoreSd: stat(sds),
    distinctScorelineRatio: stat(distincts), shellSideWinRate: stat(shellRates),
    subjectWinRateVsControl: stat(winRates),
    structuralTotals: rows.reduce((a, r) => {
      for (const [k, v] of Object.entries(r.mirror.structural)) a[k] = (a[k] ?? 0) + v; return a; }, {}),
  };
  console.log(`\n  maxActionFamilyShare  min ${summary.maxActionFamilyShare.min} max ${summary.maxActionFamilyShare.max} mean ${summary.maxActionFamilyShare.mean}`);
  console.log(`  combinedScoreSd       min ${summary.combinedScoreSd.min} max ${summary.combinedScoreSd.max} mean ${summary.combinedScoreSd.mean}`);
  console.log(`  distinctScorelineRatio min ${summary.distinctScorelineRatio.min} max ${summary.distinctScorelineRatio.max}`);
  console.log(`  shellSideWinRate      n ${summary.shellSideWinRate.n} min ${summary.shellSideWinRate.min} max ${summary.shellSideWinRate.max}`);
  console.log(`  subjectWinRateVsControl min ${summary.subjectWinRateVsControl.min} max ${summary.subjectWinRateVsControl.max} mean ${summary.subjectWinRateVsControl.mean}`);
  console.log(`  structural totals: ${JSON.stringify(summary.structuralTotals)}`);

  const payload = {
    basis: "SYNTHETIC_DEVELOPMENT_V2 only — 14 non-holdout fixtures. No Synthetic V2 fixture was simulated and no Synthetic V2 output was read.",
    pairsPerFixture: pairs, gamesPerMirror: pairs * 2, gamesPerControlSurface: Math.floor(pairs / 2) * 2,
    balancedControl: control,
    controlIsNotAHoldoutLineup: true,
    metricFunctions: ["maxActionFamilyShare", "shellSideWinRate", "seedVariance", "structuralOf", "subjectWinRate"],
    fixtures: rows, summary,
    seedDomains: { mirror: "0x6c4b15", vsControl: "0x6c4b16", note: "preparation-only development streams, distinct from the formal Synthetic V2 domain frozen in WS6" },
  };
  payload.controlsHash = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.devFixtureId, r.mirror.maxActionFamilyShare, r.vsBalancedControl.subjectWinRate]))).digest("hex");
  writeArtifact("synthetic-v2-development-controls", payload, {
    generationCommand: "npm run syn:controls", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\ncontrolsHash ${payload.controlsHash.slice(0, 16)}...`);
}
