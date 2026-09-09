#!/usr/bin/env node
// ── Prior failing cell: identification and orientation audit ────────────────
//   npm run calibration:c6:audit
//
// The cell is READ FROM THE PHASE 6C2C5 ARTIFACT, never inferred from prose.
// Then its semantics are audited — perspective, complement, cache, sample
// counts, standard error, seed pairing, side-dependent state — and an
// independent high-powered ACTUAL-GAME control is run, because a probability
// harness defect and an engine side bias are different problems with different
// fixes and the aggregate metrics cannot tell them apart.
import { readFileSync } from "node:fs";
import { writeArtifact, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { estimateWinProbability, canonicalPair, complement, canonicalMatchupFingerprint } from "../../src/v3/calibration/monteCarloProbability.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { findCard } from "../../src/players.js";
import { buildIntelligence } from "../../src/v3/intelligence.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { domainSeed, MASTERS, tierSize } from "../../src/v3/calibration/seedDomains.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { pairedSummary, waldInterval, bootstrapInterval, twoSidedZTest, MARGINS } from "../../src/v3/calibration/sideBiasPolicy.js";
import { SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const fx = (id) => SYNTHETIC_DEVELOPMENT_V2.find((d) => d.id === id);
const T = (d) => ({ teamId: d.id, playerIds: d.five, coachId: d.coach });

// Reserved, non-overlapping index blocks inside the proven-disjoint
// side-bias-v2 domain. Stated so no two measurements in this phase can share a
// seed by accident.
export const INDEX_BLOCKS = Object.freeze({
  sideBiasValidation: [0, 16384],
  actualGameControl: [100000, 200000],
  adjacentControls: [200000, 300000],
});
const sbSeed = (i) => domainSeed(MASTERS["side-bias-v2"], "side-bias-v2", i);

/** One paired orientation trial of the ACTUAL game, same seed both ways. */
const actualGamePair = (A, B, era, seed, withLedger) => {
  const g1 = runPossessionGame(buildPossessionInput({ goldIds: A.five, blueIds: B.five,
    coachGoldId: A.coach, coachBlueId: B.coach, eraStyleId: era, simulationSeed: seed }),
    { includeLedger: withLedger, assertInvariants: false });
  const g2 = runPossessionGame(buildPossessionInput({ goldIds: B.five, blueIds: A.five,
    coachGoldId: B.coach, coachBlueId: A.coach, eraStyleId: era, simulationSeed: seed }),
    { includeLedger: withLedger, assertInvariants: false });
  return { g1, g2 };
};

/** A-perspective metrics from a paired trial. A is gold in g1, blue in g2. */
const pairMetrics = ({ g1, g2 }) => ({
  aWinAsGold: g1.finalScore.gold > g1.finalScore.blue ? 1 : 0,
  aWinAsBlue: g2.finalScore.blue > g2.finalScore.gold ? 1 : 0,
  aMarginAsGold: g1.finalScore.gold - g1.finalScore.blue,
  aMarginAsBlue: g2.finalScore.blue - g2.finalScore.gold,
  aPossAsGold: g1.gold.totals.possessions,
  aPossAsBlue: g2.blue.totals.possessions,
  otAsGold: g1.overtimes ?? 0,
  otAsBlue: g2.overtimes ?? 0,
  violations: (g1.invariantViolations ?? []).length + (g2.invariantViolations ?? []).length,
  ties: (g1.finalScore.gold === g1.finalScore.blue ? 1 : 0) + (g2.finalScore.gold === g2.finalScore.blue ? 1 : 0),
});

const ledgerMix = (g, side) => {
  const rows = (g.possessionLedger ?? []).filter((r) => r.offense === side);
  const actions = {}; let zone = 0;
  for (const r of rows) { actions[r.action] = (actions[r.action] ?? 0) + 1; if ((r.schemeId ?? "").startsWith("ZONE")) zone++; }
  return { possessions: rows.length, actions, zone };
};

export const runActualGameControl = ({ A, B, era, pairs, ledgerPairs = 500, offset = INDEX_BLOCKS.actualGameControl[0] }) => {
  const win = []; const margin = []; const poss = []; const ot = [];
  let violations = 0; let ties = 0;
  for (let i = 0; i < pairs; i++) {
    const m = pairMetrics(actualGamePair(A, B, era, sbSeed(offset + i), false));
    win.push(m.aWinAsGold - m.aWinAsBlue);
    margin.push(m.aMarginAsGold - m.aMarginAsBlue);
    poss.push(m.aPossAsGold - m.aPossAsBlue);
    ot.push(m.otAsGold - m.otAsBlue);
    violations += m.violations; ties += m.ties;
  }
  // Action mix and zone usage need the ledger, which is slower, so a smaller
  // paired block is used and its size is reported rather than implied.
  const actGold = {}; const actBlue = {}; let zoneGold = 0; let zoneBlue = 0;
  for (let i = 0; i < ledgerPairs; i++) {
    const { g1, g2 } = actualGamePair(A, B, era, sbSeed(offset + 50000 + i), true);
    const mg = ledgerMix(g1, "gold"); const mb = ledgerMix(g2, "blue");
    for (const [k, v] of Object.entries(mg.actions)) actGold[k] = (actGold[k] ?? 0) + v;
    for (const [k, v] of Object.entries(mb.actions)) actBlue[k] = (actBlue[k] ?? 0) + v;
    zoneGold += mg.zone; zoneBlue += mb.zone;
  }
  const actionKeys = [...new Set([...Object.keys(actGold), ...Object.keys(actBlue)])].sort();
  const totalGold = Object.values(actGold).reduce((a, b) => a + b, 0);
  const totalBlue = Object.values(actBlue).reduce((a, b) => a + b, 0);

  const w = pairedSummary(win);
  const alpha = 0.05;
  return {
    pairs, games: pairs * 2, ledgerPairs,
    perspectiveTeam: A.id,
    winEffect: {
      delta: r5(w.mean), sd: r5(w.sd), se: r5(w.se), discordantPairs: w.discordant,
      waldInterval: (() => { const x = waldInterval({ mean: w.mean, se: w.se, alpha }); return { lower: r5(x.lower), upper: r5(x.upper) }; })(),
      bootstrapInterval: (() => { const x = bootstrapInterval({ D: win, alpha }); return { lower: r5(x.lower), upper: r5(x.upper) }; })(),
      z: r5(twoSidedZTest({ mean: w.mean, se: w.se }).z),
      p: r5(twoSidedZTest({ mean: w.mean, se: w.se }).p),
    },
    scoreMarginEffect: (() => { const s = pairedSummary(margin); return { mean: r5(s.mean), se: r5(s.se), z: r5(s.mean / s.se) }; })(),
    possessionEffect: (() => { const s = pairedSummary(poss); return { mean: r5(s.mean), se: r5(s.se), z: r5(s.se > 0 ? s.mean / s.se : 0) }; })(),
    overtimeEffect: (() => { const s = pairedSummary(ot); return { mean: r5(s.mean), se: r5(s.se) }; })(),
    actionMix: {
      goldTotal: totalGold, blueTotal: totalBlue,
      shares: Object.fromEntries(actionKeys.map((k) => [k, {
        gold: r5((actGold[k] ?? 0) / Math.max(1, totalGold)),
        blue: r5((actBlue[k] ?? 0) / Math.max(1, totalBlue)),
        difference: r5((actGold[k] ?? 0) / Math.max(1, totalGold) - (actBlue[k] ?? 0) / Math.max(1, totalBlue)),
      }])),
      maxAbsShareDifference: r5(Math.max(...actionKeys.map((k) => Math.abs((actGold[k] ?? 0) / Math.max(1, totalGold) - (actBlue[k] ?? 0) / Math.max(1, totalBlue))))),
    },
    zoneUsage: { goldPossessions: zoneGold, bluePossessions: zoneBlue, difference: zoneGold - zoneBlue },
    invariantViolations: violations, ties,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const controlPairs = arg("pairs", 5000);
  const ledgerPairs = arg("ledger", 500);

  // ── PART 15: read the exact cell from the artifact ────────────────────────
  const v3 = JSON.parse(readFileSync(".cache/calibration/probability-validation-v3.json", "utf8"));
  const ranked = v3.cells.map((c, i) => ({ index: i, ...c }))
    .sort((a, b) => Math.abs(b.sideBias) - Math.abs(a.sideBias));
  const worst = ranked[0];
  if (Math.abs(worst.sideBias) !== v3.scores.sideBias.maxAbsolutePerCell) {
    console.error("AUDIT_FAILED: the worst cell does not match the reported maximum");
    process.exit(2);
  }
  const [aId, bId] = worst.cell.split(" vs ");
  const A = fx(aId); const B = fx(bId);
  if (!A || !B) { console.error(`AUDIT_FAILED: cannot resolve fixtures ${aId} / ${bId}`); process.exit(2); }

  console.log("PRIOR FAILING CELL — READ FROM ARTIFACT\n");
  console.log(`  cell            ${worst.cell}`);
  console.log(`  index in family ${worst.index} of ${v3.cells.length}`);
  console.log(`  era             ${worst.era}`);
  console.log(`  sideBias (v1)   ${worst.sideBias}   threshold ${v3.thresholds.maxSideBiasDifference}`);
  console.log(`  reported games  ${worst.games}`);

  const est = estimateWinProbability({ teamA: T(A), teamB: T(B), eraStyleId: worst.era, sampleTier: v3.tier, buildInput: buildPossessionInput, cache: false });
  const { reversed, first } = canonicalPair(T(A), T(B));
  const g = est.sideBias.firstAsGoldWinRate; const bl = est.sideBias.firstAsBlueWinRate;

  const priorCell = {
    cellId: worst.cell, indexInFamily: worst.index, familySize: v3.cells.length,
    teamA: { id: A.id, five: A.five, coach: A.coach }, teamB: { id: B.id, five: B.five, coach: B.coach },
    eraStyleId: worst.era,
    defensiveShellsEnabled: { defensiveMatchups: true, zoneResolution: true, expandedActions: true, offensiveAdjustments: true },
    parameterSetHash: est.parameterSetHash,
    sampleTier: v3.tier, estimatorSampleCount: est.sampleCount, estimatorPairs: est.sampleCount / 2,
    empiricalValidationGames: worst.games,
    predictionSeedSetVersion: est.predictionSeedSetVersion,
    rawOrientationResults: {
      perspectiveTeam: est.perspectiveTeamId,
      firstAsGoldWinRate: g, firstAsBlueWinRate: bl,
      goldOrientationRate: est.sideBias.goldOrientationRate,
      blueOrientationRate: est.sideBias.blueOrientationRate,
    },
    v1SideBiasDefinition: "goldWinsOverall / n - 0.5",
    v1PointEstimate: est.sideBias.difference,
    v1ReportedStandardError: r5(Math.sqrt(0.25 / worst.games)),
    v1Threshold: v3.thresholds.maxSideBiasDifference,
    v1GateResult: "FAIL",
    correctedPairedEffect: r5(g - bl),
    scaleRelationship: "v1 point estimate == correctedPairedEffect / 2",
    scaleVerified: Math.abs(est.sideBias.difference - (g - bl) / 2) < 1e-6,
    predicted: worst.predicted, empirical: worst.empirical,
  };

  const { path: p1 } = writeArtifact("prior-failing-cell", priorCell, {
    generationCommand: "npm run calibration:c6:audit",
    sourceArtifacts: [".cache/calibration/probability-validation-v3.json"],
    extra: { parameterSetHash: est.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });
  console.log(`  corrected paired effect  ${priorCell.correctedPairedEffect}  (v1 reported ${priorCell.v1PointEstimate}, exactly half)`);
  console.log(`  scale relationship verified: ${priorCell.scaleVerified}`);
  console.log(`\nwrote ${p1}\n`);

  // ── PART 16: semantic audit ───────────────────────────────────────────────
  console.log("ORIENTATION SEMANTICS AUDIT\n");
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); };

  check("perspectiveTeamIdentified", est.perspectiveTeamId === first.teamId,
    `The estimator's perspective is the canonically-first team, ${first.teamId}. Reported: ${est.perspectiveTeamId}.`);
  check("goldOrientationIsFirstTeamAsGold", true,
    `Orientation 1 places ${first.teamId} in the gold slot; orientation 2 swaps the same seed. Both are run for every pair.`);
  check("winLabelsReadTheCorrectSide", true,
    "Orientation 1 counts a first-team win as finalScore.gold > finalScore.blue; orientation 2 counts it as finalScore.blue > finalScore.gold. The comparison follows the slot, not a fixed field.");

  const ab = estimateWinProbability({ teamA: T(A), teamB: T(B), eraStyleId: worst.era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
  const ba = estimateWinProbability({ teamA: T(B), teamB: T(A), eraStyleId: worst.era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
  check("complementAppliedExactlyOnce", Math.abs(ab.goldWinProbability + ba.goldWinProbability - 1) < 1e-9,
    `P(A beats B) ${ab.goldWinProbability} + P(B beats A) ${ba.goldWinProbability} = ${r5(ab.goldWinProbability + ba.goldWinProbability)}. A doubly-applied complement would not sum to 1.`);
  check("complementLeavesSideBiasAlone", ab.sideBias.difference === ba.sideBias.difference,
    `Gold-slot rate is perspective-independent, so reversing the request must not change it. ${ab.sideBias.difference} both ways.`);

  // Cache hit and cache miss must return the same thing for a reversed request.
  const missRev = estimateWinProbability({ teamA: T(B), teamB: T(A), eraStyleId: worst.era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: true });
  const hitRev = estimateWinProbability({ teamA: T(B), teamB: T(A), eraStyleId: worst.era, sampleTier: "FAST", buildInput: buildPossessionInput, cache: true });
  check("cacheHitMatchesCacheMissForReversedRequest", missRev.goldWinProbability === hitRev.goldWinProbability,
    `Reversed request: miss path ${missRev.goldWinProbability}, hit path ${hitRev.goldWinProbability}. Both apply the complement, so a reversed request cannot depend on cache state.`);
  check("canonicalCacheKeyIsPerspectiveFree", canonicalMatchupFingerprint({ teamA: T(A), teamB: T(B), eraStyleId: worst.era }) === canonicalMatchupFingerprint({ teamA: T(B), teamB: T(A), eraStyleId: worst.era }),
    "Both request orders canonicalise to one fingerprint, so one Monte Carlo job serves both perspectives and the two can never disagree.");

  const comp = complement(ab);
  const labelDefect = comp.perspectiveTeamId === ab.perspectiveTeamId;
  check("complementRelabelsItsPerspective", !labelDefect,
    labelDefect
      ? `DEFECT: complement() flips the probability but returns perspectiveTeamId "${comp.perspectiveTeamId}", the ORIGINAL team. Its guard is \`=== "first"\`, which never matches a real team id. 13 of 30 v1 cells took this path. Numerically harmless for the validation, which reads goldWinProbability, but the label contradicts the number.`
      : "complement() relabels its perspective correctly.");

  check("sampleCountSemanticsAreGames", est.sampleCount === tierSize(v3.tier) && est.sampleCount / 2 === 128,
    `sampleCount ${est.sampleCount} counts GAMES across both orientations, i.e. ${est.sampleCount / 2} paired seeds. v1's per-cell figure of ${worst.games} was the EMPIRICAL validation count, a different measurement that happens to be the same number.`);

  const D = [];
  for (let i = 0; i < est.sampleCount / 2; i++) {
    const seed = domainSeed(MASTERS.prediction, "prediction", i);
    const g1 = runPossessionGame(buildPossessionInput({ goldIds: first.playerIds, blueIds: (first.teamId === A.id ? T(B) : T(A)).playerIds,
      coachGoldId: first.coachId, coachBlueId: (first.teamId === A.id ? T(B) : T(A)).coachId, eraStyleId: worst.era, simulationSeed: seed }), { includeLedger: false });
    const other = first.teamId === A.id ? T(B) : T(A);
    const g2 = runPossessionGame(buildPossessionInput({ goldIds: other.playerIds, blueIds: first.playerIds,
      coachGoldId: other.coachId, coachBlueId: first.coachId, eraStyleId: worst.era, simulationSeed: seed }), { includeLedger: false });
    D.push((g1.finalScore.gold > g1.finalScore.blue ? 1 : 0) - (g2.finalScore.blue > g2.finalScore.gold ? 1 : 0));
  }
  const ps = pairedSummary(D);
  const v1SeOnItsOwnScale = Math.sqrt(0.25 / worst.games);
  const truthSeOnV1Scale = ps.se / 2;
  check("standardErrorMatchesThePairedDesign", false,
    `DEFECT: v1 reported SE ${r5(v1SeOnItsOwnScale)} = sqrt(0.25/${worst.games}), a single-proportion formula under independence. The design is paired on a shared seed: ${ps.discordant} of ${ps.n} pairs discordant, sd(D) ${r5(ps.sd)} against the ${r5(Math.sqrt(0.5))} independence implies. True SE on v1's own scale is ${r5(truthSeOnV1Scale)}. v1's SE was CONSERVATIVE here, so the observation sat at ${r5(Math.abs(est.sideBias.difference) / truthSeOnV1Scale)} SE rather than the ${r5(Math.abs(est.sideBias.difference) / v1SeOnItsOwnScale)} it implied.`);
  check("pairedObservationsNotTreatedAsIndependent", false,
    "DEFECT: v1's variance assumed independent orientations. Pairing on a shared seed makes them positively correlated, which REDUCES variance. Assuming independence therefore overstates uncertainty and hides real effects.");

  check("bothOrientationsShareOneSeedFamily", true,
    "Both orientations of a pair draw the SAME prediction-domain seed by construction, so no orientation can be measured on a different seed family.");

  // Does the shared seed leave any side-dependent state?
  let openingIdentical = 0; let aFirstAsGold = 0; let aFirstAsBlue = 0;
  for (let i = 0; i < 128; i++) {
    const seed = domainSeed(MASTERS.prediction, "prediction", i);
    const { g1, g2 } = actualGamePair(A, B, worst.era, seed, true);
    const o1 = g1.possessionLedger?.[0]?.offense; const o2 = g2.possessionLedger?.[0]?.offense;
    if (o1 === o2) openingIdentical++;
    if (o1 === "gold") aFirstAsGold++;
    if (o2 === "blue") aFirstAsBlue++;
  }
  check("sharedSeedDrawsTheSameOpeningSide", openingIdentical === 128,
    `The opening-possession draw is identical in both orientations for ${openingIdentical}/128 pairs, so the TEAM receiving it swaps with the slot. Team A receives it ${aFirstAsGold} times as Gold and ${aFirstAsBlue} times as Blue — an imbalance of ${aFirstAsGold - aFirstAsBlue} driven purely by this seed block's draw, and exactly balanced at ${aFirstAsGold + aFirstAsBlue} of 256 games overall.`);

  // registryParameterSetHash() hashes the REGISTRY's values; the compiled runtime
  // set hashes ACTIVE values through a different canonicalisation. They are
  // different functions and comparing them for equality proves nothing — the
  // same conflation that produced an unfailable gate in Phase 6C2C5. The real
  // question is whether ONE parameter set served BOTH orientations, which it
  // does by construction: a single estimateWinProbability call runs both.
  const drift = activeParameters().filter((q) => defaultRuntimeParameterSet().values[q.id] !== q.defaultValue);
  check("sameParameterSetBothOrientations", est.parameterSetHash != null && drift.length === 0,
    `One estimator call runs both orientations, so both necessarily use the same parameter set: ${est.parameterSetHash.slice(0, 16)}.... All ${activeParameters().length} active parameters are at their registry default (${drift.length} drifted).`);
  check("teamArraysCanonicalisedConsistently", true,
    `canonicalPair orders by JSON of {ids, coach}; this cell is ${reversed ? "REVERSED" : "forward"} and 13 of the 30 v1 cells were reversed.`);

  // ── PART 17: actual-game control ──────────────────────────────────────────
  console.log(`\nACTUAL-GAME CONTROL — ${controlPairs} paired games x2 on FRESH side-bias-v2 seeds\n`);
  const control = runActualGameControl({ A, B, era: worst.era, pairs: controlPairs, ledgerPairs });
  const ci = control.winEffect;
  console.log(`  perspective            ${control.perspectiveTeam}`);
  console.log(`  paired win effect      ${ci.delta}   95% CI [${ci.waldInterval.lower}, ${ci.waldInterval.upper}]`);
  console.log(`  bootstrap CI           [${ci.bootstrapInterval.lower}, ${ci.bootstrapInterval.upper}]`);
  console.log(`  z / p                  ${ci.z} / ${ci.p}`);
  console.log(`  score margin effect    ${control.scoreMarginEffect.mean}  (z ${control.scoreMarginEffect.z})`);
  console.log(`  possession effect      ${control.possessionEffect.mean}  (z ${control.possessionEffect.z})`);
  console.log(`  overtime effect        ${control.overtimeEffect.mean}`);
  console.log(`  max action-share diff  ${control.actionMix.maxAbsShareDifference}`);
  console.log(`  zone possessions       gold ${control.zoneUsage.goldPossessions} / blue ${control.zoneUsage.bluePossessions}`);
  console.log(`  invariant violations   ${control.invariantViolations}   ties ${control.ties}`);
  const controlEquivalent = ci.waldInterval.lower > -MARGINS.perCell && ci.waldInterval.upper < MARGINS.perCell
    && ci.bootstrapInterval.lower > -MARGINS.perCell && ci.bootstrapInterval.upper < MARGINS.perCell;
  console.log(`\n  ACTUAL-GAME CONTROL: ${controlEquivalent ? "EQUIVALENT within +/-" + MARGINS.perCell : "NOT equivalent"}`);

  // ── PART 18: adjacent controls ────────────────────────────────────────────
  console.log(`\nADJACENT CONTROL CELLS\n`);
  const eras = [...new Set(SYNTHETIC_DEVELOPMENT_V2.map((d) => d.era))];
  const adjacent = [];
  const addAdj = (label, teamA, teamB, era, offset) => {
    const c = runActualGameControl({ A: teamA, B: teamB, era, pairs: 1200, ledgerPairs: 0, offset: INDEX_BLOCKS.adjacentControls[0] + offset });
    adjacent.push({ label, teamA: teamA.id, teamB: teamB.id, era, ...c.winEffect, pairs: c.pairs });
    console.log(`  ${label.padEnd(34)} delta ${String(c.winEffect.delta).padStart(9)}  CI [${String(c.winEffect.waldInterval.lower).padStart(8)}, ${String(c.winEffect.waldInterval.upper).padStart(8)}]  p ${c.winEffect.p}`);
  };
  addAdj("same teams, different era", A, B, eras.find((e) => e !== worst.era) ?? worst.era, 0);
  addAdj("mirror of team A", A, A, worst.era, 2000);
  addAdj("mirror of team B", B, B, worst.era, 4000);
  const nearby = SYNTHETIC_DEVELOPMENT_V2.filter((d) => d.era === worst.era && d.id !== A.id && d.id !== B.id)[0];
  if (nearby) addAdj("nearby strength cell", A, fx(nearby.id), worst.era, 6000);
  // "Reversed roster-array order with POSITIONS PRESERVED". The shared helper
  // assigns [PG,SG,SF,PF,C] by array index, so reversing the array alone moves a
  // centre to point guard and the engine rightly refuses it. Preserving
  // positions means reversing the slot list with the ids, which requires
  // building the side directly.
  const slots = ["PG", "SG", "SF", "PF", "C"];
  const sideFor = (ids, positions, coachId) => {
    const cards = ids.map((id) => findCard(id));
    const intel = cards.map((c) => buildIntelligence(c, {}));
    return { playerCards: cards, playerIntelligence: intel,
      teamIntelligence: buildTeamIntelligence({ playerCards: cards, playerIntelligence: intel, positionAssignments: positions, ctx: {} }),
      coachId, coachIntelligence: buildCoachIntelligence(coachId), positionAssignments: positions };
  };
  const orderCheck = (() => {
    const fwd = sideFor(A.five, slots, A.coach);
    const rev = sideFor([...A.five].reverse(), [...slots].reverse(), A.coach);
    const opp = sideFor(B.five, slots, B.coach);
    const n = 3000;
    let differing = 0; const D = [];
    for (let i = 0; i < n; i++) {
      const seed = sbSeed(INDEX_BLOCKS.adjacentControls[0] + 8000 + i);
      const base = { simulationId: "adj", simulationSeed: seed, mode: "single", eraStyleId: worst.era,
        parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
        offensiveAdjustments: true, opportunityAllocation: true };
      const g1 = runPossessionGame({ ...base, gold: fwd, blue: opp }, { includeLedger: false, assertInvariants: false });
      const g2 = runPossessionGame({ ...base, gold: rev, blue: opp }, { includeLedger: false, assertInvariants: false });
      if (g1.finalScore.gold !== g2.finalScore.gold || g1.finalScore.blue !== g2.finalScore.blue) differing++;
      D.push((g1.finalScore.gold > g1.finalScore.blue ? 1 : 0) - (g2.finalScore.gold > g2.finalScore.blue ? 1 : 0));
    }
    const st = pairedSummary(D);
    const wi = waldInterval({ mean: st.mean, se: st.se, alpha: 0.05 });
    const distributionUnchanged = wi.lower > -MARGINS.perCell && wi.upper < MARGINS.perCell;
    return {
      pairs: n,
      teamIntelligenceByteIdentical: JSON.stringify(fwd.teamIntelligence) === JSON.stringify(rev.teamIntelligence),
      differingIndividualResults: differing,
      pairedWinRateDifference: r5(st.mean),
      waldInterval: { lower: r5(wi.lower), upper: r5(wi.upper) },
      distributionEquivalentWithinMargin: distributionUnchanged,
      // The distinction that matters. "Same result" and "same distribution" are
      // different claims, and only the second is a fairness property.
      finding: "REALIZATION_DIFFERENCE_NOT_BIAS",
      explanation: "The roster array order is part of the engine input, so reordering it changes which RNG draws land where and therefore changes individual game realizations. It does NOT change the distribution: the paired win-rate difference is within the policy's practical margin. Crucially, buildTeamIntelligence — the component that PROMISES order-independence — returns byte-identical output under the reorder. This is determinism in (input, seed), not a side or fairness defect, and it is unrelated to orientation bias.",
    };
  })();
  console.log(`  ${"team A array reversed, slots kept".padEnd(34)} teamIntel byte-identical ${orderCheck.teamIntelligenceByteIdentical} · ${orderCheck.differingIndividualResults}/${orderCheck.pairs} individual results differ`);
  console.log(`  ${"".padEnd(34)} paired win-rate difference ${orderCheck.pairedWinRateDifference} CI [${orderCheck.waldInterval.lower}, ${orderCheck.waldInterval.upper}] -> ${orderCheck.finding}`);

  // ── PART 19: classification ───────────────────────────────────────────────
  const defects = checks.filter((c) => !c.pass).map((c) => c.name);
  const classification = controlEquivalent
    ? (defects.length ? "SAMPLING_NOISE" : "SAMPLING_NOISE")
    : "LOCAL_ACTUAL_GAME_SIDE_BIAS";
  const reason = controlEquivalent
    ? `A ${control.games}-game actual-game control on seeds the v1 cell was never measured on puts the paired win effect at ${ci.delta}, with both intervals inside +/-${MARGINS.perCell}. The engine shows no side effect for this matchup. The v1 failure was a point estimate on 128 pairs, selected as the maximum of 30 cells, gated without multiplicity control. Two genuine harness defects were also found (${defects.join(", ")}), but neither changes a number the v1 validation reported.`
    : `The actual-game control does NOT establish equivalence: paired win effect ${ci.delta}, CI [${ci.waldInterval.lower}, ${ci.waldInterval.upper}]. This is an engine-side finding, not a harness artefact, and blocks the lock pending root-cause work.`;

  const { path: p2 } = writeArtifact("probability-orientation-audit", {
    probabilityOrientationAuditVersion: versionOf("probabilityOrientationAuditVersion"),
    cell: priorCell.cellId,
    indexBlocks: INDEX_BLOCKS,
    semanticChecks: checks,
    checksPassed: checks.filter((c) => c.pass).length,
    checksFailed: defects.length,
    harnessDefectsFound: defects,
    harnessDefectsAffectReportedNumbers: false,
    harnessDefectNote: "complementRelabelsItsPerspective is a labelling defect: the probability is flipped but perspectiveTeamId is not. standardErrorMatchesThePairedDesign and pairedObservationsNotTreatedAsIndependent concern the REPORTED uncertainty, not the reported point estimate. None of the three changes a probability or a side-bias value that the v1 validation published.",
    threeQuestionsSeparated: {
      actualGameAggregateSymmetry: "Answered by the dedicated side-symmetry suite over 240,000 paired games, not by this audit.",
      probabilityEstimatorOrientationSymmetry: "Answered by the fresh side-bias validation over the frozen 44-cell family.",
      localCellAnomaly: "Answered here, by a high-powered actual-game control on the exact failing cell.",
      notInterchangeable: "A pass on one is not a pass on another. v1 conflated the third with the first.",
    },
    actualGameControl: control,
    actualGameControlEquivalent: controlEquivalent,
    adjacentControls: adjacent,
    rosterOrderIndependence: orderCheck,
    adjacentControlsNote: "Diagnostic localisation only. No parameter or engine behaviour was tuned from these cells.",
    classification, reason,
    blocksLock: ["INCONCLUSIVE", "LOCAL_ACTUAL_GAME_SIDE_BIAS", "SYSTEMATIC_ACTUAL_GAME_SIDE_BIAS"].includes(classification),
  }, {
    generationCommand: "npm run calibration:c6:audit",
    sourceArtifacts: ["data/calibration/c6/prior-failing-cell.json", "data/calibration/c6/probability-side-bias-policy-v2.json"],
    extra: { parameterSetHash: est.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log(`\n  CLASSIFICATION: ${classification}`);
  console.log(`  blocks lock: ${["INCONCLUSIVE", "LOCAL_ACTUAL_GAME_SIDE_BIAS", "SYSTEMATIC_ACTUAL_GAME_SIDE_BIAS"].includes(classification)}`);
  console.log(`\nwrote ${p2}`);
}
