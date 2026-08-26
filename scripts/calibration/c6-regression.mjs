#!/usr/bin/env node
// ── Phase 6C2C6 internal regression ────────────────────────────────────────
//   npm run calibration:c6:regression
//
// Re-runs competition modes, deterministic replay and the statistical
// invariants under the locked candidate, after the harness changes. The
// harness fixes in this phase touched the probability ESTIMATOR's reporting
// and labelling, not the game engine — so exact replay of a game result is the
// property that proves that claim rather than asserting it.
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { estimateWinProbability, complement, canonicalPair } from "../../src/v3/calibration/monteCarloProbability.js";
import { defaultRuntimeParameterSet, compileRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { writeArtifact, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { versionOf } from "../../src/versions.js";

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;

// Person-aware legal five. A card id can be unique while the PERSON is not, and
// the engine rejects a lineup holding two cards of one player.
const legalFive = (rotate) => {
  const pool = PLAYERS.map((c, i) => ({ c, o: (i + rotate * 37) % PLAYERS.length })).sort((a, b) => a.o - b.o).map((x) => x.c);
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
  if (!walk(0)) throw new Error(`no legal five at rotation ${rotate}`);
  return out;
};
const CACHE = new Map();
const lineup = (n) => { const k = n % 256; if (!CACHE.has(k)) CACHE.set(k, legalFive(k)); return CACHE.get(k); };
const COACHES = ["red-auerbach", "pat-riley", "phil-jackson", "gregg-popovich", "steve-kerr", "erik-spoelstra"];
const seed = (i) => domainSeed(MASTERS["side-bias-v2"], "side-bias-v2", 500000 + i);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const sections = [];
  const def = defaultRuntimeParameterSet();

  // ── deterministic replay ──────────────────────────────────────────────────
  console.log("REPLAY\n");
  const replay = [];
  const replayCase = (label, input) => {
    const a = runPossessionGame(input, { includeLedger: false, assertInvariants: true });
    const b = runPossessionGame(input, { includeLedger: false, assertInvariants: true });
    const identical = a.finalScore.gold === b.finalScore.gold && a.finalScore.blue === b.finalScore.blue
      && JSON.stringify(a.gold.players) === JSON.stringify(b.gold.players)
      && JSON.stringify(a.blue.players) === JSON.stringify(b.blue.players);
    replay.push({ label, identical, gold: a.finalScore.gold, blue: a.finalScore.blue,
      parameterSetHash: a.parameterSetHash ?? null, parameterSetStatus: a.parameterSetStatus ?? null });
    console.log(`  ${identical ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${a.finalScore.gold}-${a.finalScore.blue}`);
    return identical;
  };
  const base = (extra = {}) => buildPossessionInput({ goldIds: lineup(3), blueIds: lineup(9),
    coachGoldId: "phil-jackson", coachBlueId: "pat-riley", eraStyleId: "2010s", simulationSeed: seed(1), ...extra });
  replayCase("legacy development (no set)", base());
  replayCase("explicit defaults", base({ parameterSet: null }));
  replayCase("locked baseline candidate", base({ parameterSet: def }));
  replayCase("compiled default overrides {}", base({ parameterSet: compileRuntimeParameterSet({ overrides: {} }) }));

  // The locked candidate and the legacy path must produce the SAME game: a
  // baseline lock that changed a result would not be a baseline.
  const legacy = runPossessionGame(base(), { includeLedger: false, assertInvariants: false });
  const locked = runPossessionGame(base({ parameterSet: def }), { includeLedger: false, assertInvariants: false });
  const lockedMatchesLegacy = legacy.finalScore.gold === locked.finalScore.gold
    && legacy.finalScore.blue === locked.finalScore.blue
    && JSON.stringify(legacy.gold.players) === JSON.stringify(locked.gold.players);
  console.log(`  ${lockedMatchesLegacy ? "PASS" : "FAIL"}  locked candidate == legacy result`);

  // ── probability replay and complement ─────────────────────────────────────
  const T = (x) => ({ teamId: x.id, playerIds: x.five, coachId: x.coach });
  const A = T(SYNTHETIC_DEVELOPMENT_V2[0]);
  const B = T(SYNTHETIC_DEVELOPMENT_V2.find((d) => d.era === SYNTHETIC_DEVELOPMENT_V2[0].era && d.id !== SYNTHETIC_DEVELOPMENT_V2[0].id));
  const e1 = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: A.eraStyleId ?? SYNTHETIC_DEVELOPMENT_V2[0].era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
  const e2 = estimateWinProbability({ teamA: A, teamB: B, eraStyleId: SYNTHETIC_DEVELOPMENT_V2[0].era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
  const rev = estimateWinProbability({ teamA: B, teamB: A, eraStyleId: SYNTHETIC_DEVELOPMENT_V2[0].era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
  const probReplayIdentical = e1.goldWinProbability === e2.goldWinProbability && e1.predictionFingerprint === e2.predictionFingerprint;
  const complementExact = Math.abs(e1.goldWinProbability + rev.goldWinProbability - 1) < 1e-9;
  const c = complement(e1);
  const relabelled = c.perspectiveTeamId === e1.counterpartTeamId && c.counterpartTeamId === e1.perspectiveTeamId;
  console.log(`  ${probReplayIdentical ? "PASS" : "FAIL"}  probability replay identical`);
  console.log(`  ${complementExact ? "PASS" : "FAIL"}  paired complement exact (sums to 1)`);
  console.log(`  ${relabelled ? "PASS" : "FAIL"}  complement relabels its perspective`);
  console.log(`  ${e1.sideBias.pairedEffect != null ? "PASS" : "FAIL"}  estimator reports the paired effect and its own SE`);
  sections.push({ name: "replay", cases: replay, lockedMatchesLegacy,
    probabilityReplayIdentical: probReplayIdentical, complementExact, complementRelabels: relabelled,
    estimatorReportsPairedUncertainty: e1.sideBias.pairedEffect != null,
    allPass: replay.every((r) => r.identical) && lockedMatchesLegacy && probReplayIdentical && complementExact && relabelled });

  // ── competition modes ─────────────────────────────────────────────────────
  console.log("\nCOMPETITION MODES\n");
  const modes = [];
  const modeRow = (name, games, vios, extra = {}) => {
    console.log(`  ${name.padEnd(22)} ${String(games).padStart(6)} games · violations ${vios}${Object.entries(extra).map(([k, v]) => ` · ${k} ${v}`).join("")}`);
    modes.push({ mode: name, games, invariantViolations: vios, ...extra }); };
  const vio = (g) => (g.invariantViolations ?? []).length;

  { let v = 0; const n = arg("single", 400);
    for (let i = 0; i < n; i++) v += vio(runPossessionGame(buildPossessionInput({ goldIds: lineup(i), blueIds: lineup(i + 5),
      coachGoldId: COACHES[i % 6], coachBlueId: COACHES[(i + 1) % 6], eraStyleId: "2010s", simulationSeed: seed(1000 + i), mode: "single", parameterSet: def }), { assertInvariants: false, includeLedger: false }));
    modeRow("Single Game", n, v); }

  { const series = arg("series", 210); let v = 0; let games = 0; const lens = {};
    for (let s = 0; s < series; s++) {
      const gs = runPossessionSeries(buildPossessionInput({ goldIds: lineup(s), blueIds: lineup(s + 4),
        coachGoldId: COACHES[s % 6], coachBlueId: COACHES[(s + 3) % 6], eraStyleId: "1990s", simulationSeed: seed(2000 + s), mode: "best7", parameterSet: def }),
        { games: 7, opts: { assertInvariants: false, includeLedger: false } });
      let g = 0; let b = 0; let played = 0;
      for (const x of gs) { played++; games++; v += vio(x); if (x.finalScore.gold > x.finalScore.blue) g++; else b++; if (g === 4 || b === 4) break; }
      lens[played] = (lens[played] ?? 0) + 1; }
    modeRow("Best of 7", games, v, { series, lengths: JSON.stringify(lens) }); }

  { const seasons = arg("seasons", 52); let v = 0; let games = 0; const wins = [];
    for (let s = 0; s < seasons; s++) { let w = 0;
      for (const x of runPossessionSeries(buildPossessionInput({ goldIds: lineup(s * 2), blueIds: lineup(s * 2 + 6),
        coachGoldId: COACHES[s % 6], coachBlueId: COACHES[(s + 4) % 6], eraStyleId: "2020s", simulationSeed: seed(4000 + s), mode: "82", parameterSet: def }),
        { games: 82, opts: { assertInvariants: false, includeLedger: false } })) { games++; v += vio(x); if (x.finalScore.gold > x.finalScore.blue) w++; }
      wins.push(w); }
    modeRow("Win 82", games, v, { seasons, meanWins: r2(wins.reduce((a, b) => a + b, 0) / wins.length) }); }

  { const brackets = arg("brackets", 22); let v = 0; let games = 0;
    for (let t = 0; t < brackets; t++) {
      let field = Array.from({ length: 8 }, (_, k) => ({ ids: lineup(t * 8 + k), coach: COACHES[(t + k) % 6] }));
      let round = 0;
      while (field.length > 1) { const next = [];
        for (let m = 0; m < field.length; m += 2) {
          const g = runPossessionGame(buildPossessionInput({ goldIds: field[m].ids, blueIds: field[m + 1].ids,
            coachGoldId: field[m].coach, coachBlueId: field[m + 1].coach, eraStyleId: "2000s",
            simulationSeed: seed(6000 + t * 100 + round * 10 + m), mode: "tournament", parameterSet: def }), { assertInvariants: false, includeLedger: false });
          games++; v += vio(g); next.push(g.finalScore.gold >= g.finalScore.blue ? field[m] : field[m + 1]); }
        field = next; round++; } }
    modeRow("Tournament", games, v, { brackets }); }

  { const days = arg("days", 60); let v = 0;
    for (let d = 0; d < days; d++) v += vio(runPossessionGame(buildPossessionInput({ goldIds: lineup(d), blueIds: lineup(d + 2),
      coachGoldId: COACHES[d % 6], coachBlueId: COACHES[(d + 5) % 6],
      eraStyleId: ["1960s", "1980s", "2000s", "2010s"][d % 4], simulationSeed: seed(8000 + d), mode: "single", parameterSet: def }), { assertInvariants: false, includeLedger: false }));
    modeRow("Daily (development)", days, v, { days }); }

  const totalGames = modes.reduce((a, m) => a + m.games, 0);
  const totalVio = modes.reduce((a, m) => a + m.invariantViolations, 0);
  console.log(`\n  totals  ${totalGames} games · ${totalVio} invariant violations`);

  // One competition must never mix parameter sets.
  const hashes = new Set();
  for (const g of runPossessionSeries(buildPossessionInput({ goldIds: lineup(11), blueIds: lineup(17),
    coachGoldId: "gregg-popovich", coachBlueId: "steve-kerr", eraStyleId: "2010s", simulationSeed: seed(9000), mode: "best7", parameterSet: def }),
    { games: 7, opts: { assertInvariants: false, includeLedger: false } })) hashes.add(g.parameterSetHash ?? "none");
  const singleSet = hashes.size === 1;
  console.log(`  ${singleSet ? "PASS" : "FAIL"}  one parameter set across a whole competition (${[...hashes].join(", ")})`);
  sections.push({ name: "competitionModes", modes, totalGames, totalInvariantViolations: totalVio,
    oneParameterSetPerCompetition: singleSet, allPass: totalVio === 0 && singleSet });

  // ── statistical invariants under assertion ────────────────────────────────
  console.log("\nSTATISTICAL INVARIANTS\n");
  let asserted = 0; let ties = 0; let impossible = 0;
  const n = arg("invariants", 1200);
  for (let i = 0; i < n; i++) {
    const g = runPossessionGame(buildPossessionInput({ goldIds: lineup(i), blueIds: lineup(i + 7),
      coachGoldId: COACHES[i % 6], coachBlueId: COACHES[(i + 2) % 6],
      eraStyleId: ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"][i % 8],
      simulationSeed: seed(20000 + i), parameterSet: def }), { assertInvariants: true, includeLedger: false });
    asserted++;
    if (g.finalScore.gold === g.finalScore.blue) ties++;
    for (const s of [g.finalScore.gold, g.finalScore.blue]) if (s < 20 || s > 220) impossible++;
  }
  console.log(`  ${asserted} games asserted · ${ties} final ties · ${impossible} impossible scores`);
  sections.push({ name: "statisticalInvariants", gamesAsserted: asserted, finalTies: ties, impossibleScores: impossible,
    allPass: ties === 0 && impossible === 0 });

  const allPass = sections.every((s) => s.allPass);
  const { path } = writeArtifact("c6-internal-regression", {
    candidate: "Candidate 0", parameterSetHash: def.parameterSetHash, parameterSetStatus: def.status,
    activeParameterCount: activeParameters().length,
    monteCarloProbabilityVersion: versionOf("monteCarloProbabilityVersion"),
    sections, allPass,
    totalGamesSimulated: totalGames + asserted + replay.length * 2 + 4,
  }, {
    generationCommand: "npm run calibration:c6:regression",
    sourceArtifacts: [],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });
  console.log(`\n  REGRESSION ${allPass ? "PASSED" : "FAILED"}`);
  console.log(`\nwrote ${path}`);
  process.exit(allPass ? 0 : 1);
}
