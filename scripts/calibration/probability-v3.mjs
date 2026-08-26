#!/usr/bin/env node
// ── Probability estimation and validation ───────────────────────────────────
//   npm run probability:estimate -- --matchup=<fixture-id>
//   npm run probability:validate
//   npm run probability:ladder
//   npm run probability:balanced-vs-ovr
//   npm run probability:report
//   npm run probability:cache-report
//   npm run probability:replay -- --fingerprint=<id>
//
// Validation runs on PROBABILITY_VALIDATION seeds, which are disjoint from the
// PREDICTION seeds the estimate was built on. Validating against the same games
// that produced the estimate would measure nothing but arithmetic.
//
// No formal holdout is touched. The sets used are historical calibration v3 and
// synthetic development v2, both of which development may look at.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { estimateWinProbability, cacheStats, observability, LABEL } from "../../src/v3/calibration/monteCarloProbability.js";
import { domainSeed, MASTERS, SAMPLE_TIERS } from "../../src/v3/calibration/seedDomains.js";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";
import { loadPlayers } from "./build-players-v3.mjs";
import { SYNTHETIC_DEVELOPMENT_V2, HISTORICAL_HOLDOUT_V3_IDS } from "../../data/calibration/sets-v3.mjs";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { THRESHOLDS, scoreCells, evaluateGate } from "../../src/v3/calibration/probabilityValidation.js";
export { THRESHOLDS };

const OUT = ".cache/calibration";
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

/**
 * Empirical win rate on VALIDATION seeds — disjoint from the prediction seeds.
 * Returns the individual binary outcomes, not just the rate: a Brier score
 * against a rate is a calibration statistic, while a Brier score against binary
 * outcomes is the forecasting statistic Phase 6C2B's 0.2507 baseline used. They
 * live on different scales and must never be compared to each other.
 */
const empiricalWinRate = ({ teamA, teamB, eraStyleId, games, buildInput }) => {
  const outcomes = [];
  const pairs = Math.floor(games / 2);
  for (let i = 0; i < pairs; i++) {
    const seed = domainSeed(MASTERS["probability-validation"], "probability-validation", i);
    const g1 = runPossessionGame(buildInput({ goldIds: teamA.playerIds, blueIds: teamB.playerIds,
      coachGoldId: teamA.coachId, coachBlueId: teamB.coachId, eraStyleId, simulationSeed: seed }), { includeLedger: false });
    outcomes.push(g1.finalScore.gold > g1.finalScore.blue ? 1 : 0);
    const g2 = runPossessionGame(buildInput({ goldIds: teamB.playerIds, blueIds: teamA.playerIds,
      coachGoldId: teamB.coachId, coachBlueId: teamA.coachId, eraStyleId, simulationSeed: seed }), { includeLedger: false });
    outcomes.push(g2.finalScore.blue > g2.finalScore.gold ? 1 : 0);
  }
  const wins = outcomes.reduce((a, b) => a + b, 0);
  return { wins, n: outcomes.length, rate: r4(wins / outcomes.length), outcomes };
};

/** Append to the fingerprint index so any recorded estimate can be replayed. */
const recordFingerprints = (entries) => {
  mkdirSync(OUT, { recursive: true });
  const f = `${OUT}/probability-fingerprints.json`;
  const idx = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  for (const e of entries) idx[e.predictionFingerprint] = e;
  writeFileSync(f, JSON.stringify(idx, null, 2) + "\n");
  console.log(`indexed ${entries.length} fingerprints in ${f}`);
};

const write = (name, payload) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/${name}.json`);
};

const syntheticTeam = (f) => ({ teamId: f.id, playerIds: f.five, coachId: f.coach });

// ── Commands ────────────────────────────────────────────────────────────────
// Guarded: importing this module for a helper must never run a command.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "validate";
  const arg = (flag) => { const a = process.argv.find((x) => x.startsWith(`--${flag}=`)); return a ? a.split("=")[1] : null; };
  const TIER = arg("tier") ?? "STANDARD";
  const VAL_GAMES = Number(arg("games") ?? THRESHOLDS.minValidationGamesPerCell);

  if (cmd === "validate") {
    // Diverse cells from the synthetic DEVELOPMENT set — never a holdout.
    const cells = [];
    const prints = [];
    const devs = SYNTHETIC_DEVELOPMENT_V2;
    for (let i = 0; i < devs.length; i++) {
      for (let j = i + 1; j < devs.length; j++) {
        if (devs[i].era !== devs[j].era) continue;
        const A = syntheticTeam(devs[i]);
        const B = syntheticTeam(devs[j]);
        const est = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: devs[i].era, sampleTier: TIER, buildInput: buildPossessionInput });
        const emp = empiricalWinRate({ teamA: A, teamB: B, eraStyleId: devs[i].era, games: VAL_GAMES, buildInput: buildPossessionInput });
        prints.push({ predictionFingerprint: est.predictionFingerprint, label: `${devs[i].id} vs ${devs[j].id}`,
          teamA: A, teamB: B, eraStyleId: devs[i].era, sampleTier: TIER, probability: est.goldWinProbability,
          activeVersions: est.activeVersions, parameterSetHash: est.parameterSetHash });
        cells.push({ cell: `${devs[i].id} vs ${devs[j].id}`, era: devs[i].era,
          predicted: est.goldWinProbability, empirical: emp.rate, games: emp.n, outcomes: emp.outcomes,
          sideBias: est.sideBias.difference, ci: est.confidenceInterval });
      }
    }
    const s = scoreCells(cells);
    console.log(`PROBABILITY VALIDATION — ${cells.length} cells · ${TIER} estimates · ${VAL_GAMES} independent validation games each`);
    console.log(`  estimated on PREDICTION seeds; measured on PROBABILITY-VALIDATION seeds (disjoint sets)\n`);
    console.log(`  OUTCOME SCALE — comparable to the Phase 6C2B analytical baseline`);
    console.log(`    Monte Carlo Brier          ${s.outcomeScale.monteCarloBrier}`);
    console.log(`    irreducible floor          ${s.outcomeScale.irreducibleFloorBrier}   (a perfect forecaster scores this)`);
    console.log(`    constant-0.5 baseline      ${s.outcomeScale.constantBaselineBrier}`);
    console.log(`    analytical baseline        ${THRESHOLDS.analyticalBaselineBrier}   (Phase 6C2B)`);
    console.log(`    skill score vs constant    ${s.outcomeScale.skillScoreVsConstant}`);
    console.log(`    fraction of ACHIEVABLE skill captured:`);
    console.log(`      Monte Carlo              ${s.outcomeScale.fractionOfAchievableSkill}`);
    console.log(`      6C2B analytical model    ${s.outcomeScale.analyticalFractionOfAchievableSkill}`);
    console.log(`    Monte Carlo log loss       ${s.outcomeScale.monteCarloLogLoss}  vs constant ${s.outcomeScale.constantBaselineLogLoss}`);
    console.log(`\n  RATE SCALE — calibration only; NOT comparable to 0.2507`);
    console.log(`    Monte Carlo Brier          ${s.rateScale.monteCarloBrier}  vs constant ${s.rateScale.constantBaselineBrier}`);
    console.log(`    mean absolute error        ${s.rateScale.meanAbsoluteError}`);
    console.log(`\n  sharpness ${s.sharpness} · ECE ${s.expectedCalibrationError} · MCE ${s.maximumCalibrationError} · upset rate ${s.upsetRate} · favourite win rate ${s.favoriteWinRate}`);
    console.log(`\n  side bias: max per cell ${s.sideBias.maxAbsolutePerCell} (per-cell SE ${s.sideBias.perCellStandardErrorAtSampleSize})`);
    console.log(`             mean across cells ${s.sideBias.meanAcrossCells} ± ${s.sideBias.standardError}  t=${s.sideBias.tStatistic}  systematic=${s.sideBias.systematic}`);
    console.log(`\n  reliability bins:`);
    console.log(`    ${"bin".padEnd(12)} ${"cells".padStart(6)} ${"games".padStart(7)} ${"predicted".padStart(10)} ${"empirical".padStart(10)} ${"gap".padStart(8)}`);
    for (const b of s.reliabilityBins) {
      console.log(`    ${`${b.lo}-${b.hi}`.padEnd(12)} ${String(b.cells).padStart(6)} ${String(b.games).padStart(7)} ${String(b.meanPredicted).padStart(10)} ${String(b.meanEmpirical).padStart(10)} ${String(b.gap).padStart(8)}`);
    }
    const gate = evaluateGate(s);
    console.log(`\n  gate:`);
    for (const [k, v] of Object.entries(gate)) console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
    write("probability-validation-v3", { thresholds: THRESHOLDS, tier: TIER, validationGamesPerCell: VAL_GAMES,
      cells: cells.map(({ outcomes, ...c }) => c), scores: s, gate, label: LABEL });
    recordFingerprints(prints);
  } else if (cmd === "ladder") {
    // The tested side is fixed; the opponent weakens one player at a time.
    const base = ["curry-10s", "klay-10s", "kawhi-10s", "draymond-10s", "jokic-10s"];
    const down = ["wall-2010s", "demar-2010s", "prince-00s", "ibaka-2010s", "drummond-2010s"];
    const rungs = [];
    const prints = [];
    for (const [i, label] of ["MIRROR", "SLIGHT_FAVORITE", "MODERATE_FAVORITE", "STRONG_FAVORITE", "EXTREME_FAVORITE"].entries()) {
      const A = { teamId: "base", playerIds: base, coachId: "steve-kerr" };
      const B = { teamId: `opp${i}`, playerIds: base.map((b, j) => (j < i ? down[j] : b)), coachId: "steve-kerr" };
      const est = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: TIER, buildInput: buildPossessionInput });
      const emp = empiricalWinRate({ teamA: A, teamB: B, eraStyleId: "2010s", games: VAL_GAMES, buildInput: buildPossessionInput });
      rungs.push({ label, downgrades: i, predicted: est.goldWinProbability, empirical: emp.rate,
        ci: est.confidenceInterval, sideBias: est.sideBias.difference, n: emp.n,
        predictionFingerprint: est.predictionFingerprint });
      prints.push({ predictionFingerprint: est.predictionFingerprint, label: `ladder:${label}`,
        teamA: A, teamB: B, eraStyleId: "2010s", sampleTier: TIER, probability: est.goldWinProbability,
        activeVersions: est.activeVersions, parameterSetHash: est.parameterSetHash });
    }
    console.log(`CONTROLLED STRENGTH LADDER — ${TIER} estimate, ${VAL_GAMES} independent validation games per rung\n`);
    console.log(`    ${"rung".padEnd(20)} ${"predicted".padStart(10)} ${"CI".padStart(16)} ${"empirical".padStart(10)} ${"gap".padStart(8)}`);
    for (const r of rungs) {
      console.log(`    ${r.label.padEnd(20)} ${String(r.predicted).padStart(10)} ${`${r.ci.lower}..${r.ci.upper}`.padStart(16)} ${String(r.empirical).padStart(10)} ${String(r4(r.empirical - r.predicted)).padStart(8)}`);
    }
    const monoPred = rungs.every((r, i) => i === 0 || r.predicted >= rungs[i - 1].predicted);
    const monoEmp = rungs.every((r, i) => i === 0 || r.empirical >= rungs[i - 1].empirical);
    console.log(`\n  monotonic predicted: ${monoPred}   monotonic empirical: ${monoEmp}`);
    console.log(`  mirror predicted ${rungs[0].predicted}, empirical ${rungs[0].empirical} (tolerance ${THRESHOLDS.mirrorTolerance})`);
    write("probability-ladder-v3", { thresholds: THRESHOLDS, rungs, monotonicPredicted: monoPred, monotonicEmpirical: monoEmp });
    recordFingerprints(prints);
  } else if (cmd === "balanced-vs-ovr") {
    const bal = SYNTHETIC_DEVELOPMENT_V2.find((f) => f.id === "sd2-balanced-lower-ovr");
    const stack = SYNTHETIC_DEVELOPMENT_V2.find((f) => f.id === "sd2-creator-stack");
    const A = syntheticTeam(bal);
    const B = syntheticTeam(stack);
    const est = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: bal.era, sampleTier: "DEEP", buildInput: buildPossessionInput });
    const emp = empiricalWinRate({ teamA: A, teamB: B, eraStyleId: bal.era, games: Math.max(VAL_GAMES, 1000), buildInput: buildPossessionInput });
    console.log(`BALANCED vs CREATOR-HEAVY\n`);
    console.log(`  balanced : ${bal.five.join(", ")}`);
    console.log(`  stacked  : ${stack.five.join(", ")}`);
    console.log(`\n  predicted (balanced) ${est.goldWinProbability}  CI ${est.confidenceInterval.lower}..${est.confidenceInterval.upper}`);
    console.log(`  empirical (balanced) ${emp.rate}  over ${emp.n} independent games`);
    console.log(`  side bias            ${est.sideBias.difference}`);
    write("balanced-vs-ovr-v3", { balanced: bal, stacked: stack, predicted: est.goldWinProbability, empirical: emp.rate, n: emp.n, ci: est.confidenceInterval });
  } else if (cmd === "estimate") {
    const id = arg("matchup");
    const corpus = loadCorpusV3();
    const byId = new Map(loadPlayers().profiles.map((p) => [p.calibrationPlayerId, p]));
    if (HISTORICAL_HOLDOUT_V3_IDS.includes(id)) {
      console.error(`"${id}" is in historical holdout v3 and is SEALED. This command refuses it.`);
      process.exit(1);
    }
    const f = corpus.fixtures.find((x) => x.fixtureId === id);
    if (!f) { console.error(`unknown fixture "${id}"`); process.exit(1); }
    const opp = corpus.fixtures.find((x) => x.eraStyleId === f.eraStyleId && x.fixtureId !== id && !HISTORICAL_HOLDOUT_V3_IDS.includes(x.fixtureId));
    const mk = (fx) => ({ teamId: fx.fixtureId, playerIds: fx.players.map((p) => p.calibrationPlayerId), coachId: fx.coachId, fixture: fx });
    const build = ({ goldIds, blueIds, eraStyleId, simulationSeed }) => {
      const fx = (ids) => (ids[0] === f.players[0].calibrationPlayerId ? f : opp);
      return { simulationId: "prob", simulationSeed, mode: "single", eraStyleId,
        defensiveMatchups: true, zoneResolution: true, expandedActions: true, offensiveAdjustments: true, opportunityAllocation: true,
        gold: buildCalibrationTeam(fx(goldIds), byId), blue: buildCalibrationTeam(fx(blueIds), byId) };
    };
    const t = Date.now();
    const est = estimateWinProbability({ teamA: mk(f), teamB: mk(opp), eraStyleId: f.eraStyleId, sampleTier: TIER, buildInput: build });
    console.log(`${f.fixtureId} (${f.teamName} ${f.season}) vs ${opp.fixtureId} (${opp.teamName} ${opp.season})\n`);
    console.log(`  ${LABEL}: ${est.goldWinProbability}`);
    console.log(`  ${est.confidenceInterval.method} ${est.confidenceInterval.level} CI: ${est.confidenceInterval.lower} .. ${est.confidenceInterval.upper}  (half-width ${est.confidenceInterval.halfWidth})`);
    console.log(`  sample: ${est.sampleCount} paired-orientation games (${est.sampleTier})`);
    console.log(`  side bias: ${est.sideBias.difference}  (gold ${est.sideBias.goldOrientationRate} / blue ${est.sideBias.blueOrientationRate})`);
    console.log(`  prediction fingerprint: ${est.predictionFingerprint}`);
    console.log(`  calibration: ${est.activeVersions.possessionCalibrationVersion}`);
    console.log(`\n  ${JSON.stringify(observability(est, Date.now() - t, "miss"))}`.slice(0, 400));
  } else if (cmd === "cache-report") {
    console.log(`PROBABILITY CACHE\n`);
    console.log(`  requested ${cacheStats.requested} · hits ${cacheStats.hits} · misses ${cacheStats.misses} · generated ${cacheStats.generated}`);
    console.log(`  namespace: mc-probability (development only; never a production namespace)`);
    console.log(`  key carries: monte carlo version, cache schema, prediction seed set, tier, sample count,`);
    console.log(`               every engine and data version, parameter-set hash, canonical matchup fingerprint`);
    console.log(`  key NEVER carries: actual game seed, user id, session id, result id, email, profile data`);
  } else if (cmd === "replay") {
    // Reproduce an estimate from its fingerprint alone. If the engine or any
    // material version has moved, the fingerprint will not reproduce — and that
    // is the point: a probability is only meaningful against the versions that
    // produced it.
    const want = arg("fingerprint");
    if (!want) { console.error("usage: npm run probability:replay -- --fingerprint=<id>"); process.exit(1); }
    const idx = existsSync(`${OUT}/probability-fingerprints.json`) ? JSON.parse(readFileSync(`${OUT}/probability-fingerprints.json`, "utf8")) : {};
    const entry = idx[want];
    if (!entry) {
      console.error(`fingerprint ${want} is not in the local index.`);
      console.error(`Run "npm run probability:validate" or "npm run probability:ladder" first — replay reproduces recorded estimates, it does not invent them.`);
      process.exit(1);
    }
    const A = { teamId: entry.teamA.teamId, playerIds: entry.teamA.playerIds, coachId: entry.teamA.coachId };
    const B = { teamId: entry.teamB.teamId, playerIds: entry.teamB.playerIds, coachId: entry.teamB.coachId };
    const t = Date.now();
    const re = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: entry.eraStyleId, sampleTier: entry.sampleTier, buildInput: buildPossessionInput, cache: false });
    const match = re.predictionFingerprint === want;
    console.log(`PROBABILITY REPLAY — ${want}\n`);
    console.log(`  matchup     ${entry.label}`);
    console.log(`  recorded    ${entry.probability}   (${entry.recordedAt ?? "unstamped"})`);
    console.log(`  replayed    ${re.goldWinProbability}   in ${Date.now() - t}ms`);
    console.log(`  fingerprint ${match ? "REPRODUCED" : "DIVERGED"}`);
    if (!match) {
      console.log(`\n  recorded versions vs current:`);
      for (const [k, v] of Object.entries(entry.activeVersions ?? {})) {
        const now = re.activeVersions[k];
        if (String(v) !== String(now)) console.log(`    ${k}: ${v} -> ${now}`);
      }
      if (entry.parameterSetHash !== re.parameterSetHash) console.log(`    parameterSetHash: ${entry.parameterSetHash?.slice(0, 12)} -> ${re.parameterSetHash.slice(0, 12)}`);
      console.log(`\n  A diverged fingerprint is not a failure. It records that the estimate`);
      console.log(`  belonged to a different engine, and must not be quoted for this one.`);
      process.exit(2);
    }
    console.log(`  value       ${re.goldWinProbability === entry.probability ? "IDENTICAL" : "CHANGED"}`);
  } else {
    console.error(`unknown command "${cmd}"`);
    process.exit(1);
  }
}
