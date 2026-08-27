// ── Synthetic V2 fixture evaluation and verdict aggregation ──────────────────
//
// Imported by BOTH the formal runner and the dry run, so the rehearsal
// exercises the same code that will score the sealed set. V4's runner crashed
// after consuming its unlock because the dry run had preflighted a simplified
// path; nothing here is simplified for the rehearsal — only the seal, the
// fixtures and the volumes differ.
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { isZoneShellSelected, isZoneAttackExecuted } from "../v5/realizedZone.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sdOf = (xs) => { if (xs.length < 2) return null; const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

export const CELL = Object.freeze({ PASS: "PASS", FAIL: "FAIL", INDETERMINATE: "INDETERMINATE",
  NOT_APPLICABLE: "NOT_APPLICABLE", NOT_MEASURED: "NOT_MEASURED" });
export const FIXTURE = Object.freeze({ PASS: "PASS", FAIL: "FAIL", INVALID_RUN: "INVALID_RUN" });
export const SET = Object.freeze({ PASS: "SYNTHETIC_HOLDOUT_V2_PASS", FAIL: "SYNTHETIC_HOLDOUT_V2_FAIL",
  INVALID_RUN: "SYNTHETIC_HOLDOUT_V2_INVALID_RUN" });

// ── the dual gate ───────────────────────────────────────────────────────────
/** A ceiling: the observation must sit BELOW the threshold by the margin. */
export const ceilingCell = ({ observed, se, ceiling, margin }) => {
  if (observed == null) return { outcome: CELL.NOT_MEASURED, observed: null, se, threshold: ceiling, practicalMargin: margin, marginSatisfied: null };
  if (observed <= ceiling - margin) return { outcome: CELL.PASS, observed, se, threshold: ceiling, practicalMargin: margin, marginSatisfied: true };
  if (observed >= ceiling + margin) return { outcome: CELL.FAIL, observed, se, threshold: ceiling, practicalMargin: margin, marginSatisfied: true };
  return { outcome: CELL.INDETERMINATE, observed, se, threshold: ceiling, practicalMargin: margin, marginSatisfied: false,
    reason: `the observation ${r5(observed)} is inside the practical margin ${margin} of the ceiling ${ceiling}, so it decides nothing in either direction` };
};
/** A floor: the observation must sit ABOVE the threshold by the margin. */
export const floorCell = ({ observed, se, floor, margin }) => {
  if (observed == null) return { outcome: CELL.NOT_MEASURED, observed: null, se, threshold: floor, practicalMargin: margin, marginSatisfied: null };
  if (observed >= floor + margin) return { outcome: CELL.PASS, observed, se, threshold: floor, practicalMargin: margin, marginSatisfied: true };
  if (observed <= floor - margin) return { outcome: CELL.FAIL, observed, se, threshold: floor, practicalMargin: margin, marginSatisfied: true };
  return { outcome: CELL.INDETERMINATE, observed, se, threshold: floor, practicalMargin: margin, marginSatisfied: false,
    reason: `the observation ${r5(observed)} is inside the practical margin ${margin} of the floor ${floor}` };
};
/** A two-sided band. */
export const bandCell = ({ observed, se, min, max, margin }) => {
  if (observed == null) return { outcome: CELL.NOT_MEASURED, observed: null, se, threshold: [min, max], practicalMargin: margin, marginSatisfied: null };
  if (observed >= min + margin && observed <= max - margin) return { outcome: CELL.PASS, observed, se, threshold: [min, max], practicalMargin: margin, marginSatisfied: true };
  if (observed <= min - margin || observed >= max + margin) return { outcome: CELL.FAIL, observed, se, threshold: [min, max], practicalMargin: margin, marginSatisfied: true,
    reason: observed <= min - margin ? `below the floor ${min} by more than the margin` : `above the ceiling ${max} by more than the margin` };
  return { outcome: CELL.INDETERMINATE, observed, se, threshold: [min, max], practicalMargin: margin, marginSatisfied: false,
    reason: `the observation ${r5(observed)} is inside the practical margin ${margin} of a band edge` };
};
/** An exact count that must be zero. No margin: a count has no sampling noise. */
export const zeroCountCell = ({ observed, what }) => {
  if (observed == null) return { outcome: CELL.NOT_MEASURED, observed: null, threshold: 0, practicalMargin: 0, marginSatisfied: null };
  return observed === 0
    ? { outcome: CELL.PASS, observed: 0, threshold: 0, practicalMargin: 0, marginSatisfied: true, se: null }
    : { outcome: CELL.FAIL, observed, threshold: 0, practicalMargin: 0, marginSatisfied: true, se: null,
        reason: `${observed} ${what} — a count, so there is no sampling noise to absorb and no margin applies` };
};

// ── measurement ─────────────────────────────────────────────────────────────
export const structuralOf = (games) => {
  let inv = 0, imp = 0, nf = 0, neg = 0, ties = 0;
  for (const g of games) {
    inv += (g.invariantViolations ?? []).length;
    for (const v of [g.finalScore.gold, g.finalScore.blue]) if (v < 20 || v > 220) imp += 1;
    if (g.finalScore.gold === g.finalScore.blue) ties += 1;
    for (const s of ["gold", "blue"]) for (const v of Object.values(g[s].totals ?? {})) {
      if (typeof v === "number" && !Number.isFinite(v)) nf += 1;
      if (typeof v === "number" && v < 0) neg += 1;
    }
  }
  return { invariantViolationCount: inv, impossibleScoreCount: imp, nonFiniteStatCount: nf,
    negativeStatCount: neg, finalTieCount: ties, games: games.length };
};
export const actionMixOf = (games, side) => {
  const pooled = {}; let tot = 0;
  for (const g of games) for (const r of (g.possessionLedger ?? [])) {
    if (r.offense !== side) continue; pooled[r.action] = (pooled[r.action] ?? 0) + 1; tot += 1;
  }
  if (!tot) return { share: null, se: null, family: null, distribution: {}, possessions: 0 };
  const rows = Object.entries(pooled).sort((a, b) => b[1] - a[1]);
  const family = rows[0][0];
  const perGame = games.map((g) => {
    const rs = (g.possessionLedger ?? []).filter((r) => r.offense === side);
    return rs.length ? rs.filter((r) => r.action === family).length / rs.length : null;
  }).filter((x) => x != null);
  return { share: r5(mean(perGame)), se: perGame.length > 1 ? r5(sdOf(perGame) / Math.sqrt(perGame.length)) : null,
    family, possessions: tot, gamesUsed: perGame.length,
    distribution: Object.fromEntries(rows.map(([k, v]) => [k, r5(v / tot)])) };
};
export const winRateOf = (games, sideOf) => {
  const outcomes = games.map((g, i) => g.finalScore.gold === g.finalScore.blue ? null
    : ((g.finalScore.gold > g.finalScore.blue ? "gold" : "blue") === sideOf(i) ? 1 : 0)).filter((x) => x != null);
  if (!outcomes.length) return { value: null, se: null, decided: 0 };
  const p = mean(outcomes);
  return { value: r5(p), se: r5(Math.sqrt(p * (1 - p) / outcomes.length)), decided: outcomes.length };
};
export const varianceOf = (games) => {
  const combined = games.map((g) => g.finalScore.gold + g.finalScore.blue);
  const s = sdOf(combined);
  const distinct = new Set(games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size;
  return { combinedScoreSd: r5(s), combinedScoreSdSe: r5(s / Math.sqrt(2 * (games.length - 1))),
    marginSd: r5(sdOf(games.map((g) => Math.abs(g.finalScore.gold - g.finalScore.blue)))),
    distinctScorelineRatio: r5(distinct / games.length), distinctScorelines: distinct, games: games.length };
};
export const realizedZoneOf = (games) => {
  let realized = 0, tot = 0, attack = 0;
  for (const g of games) for (const r of (g.possessionLedger ?? [])) {
    tot += 1; if (isZoneShellSelected(r)) { realized += 1; if (isZoneAttackExecuted(r)) attack += 1; }
  }
  return { realizedZonePossessions: realized, totalPossessions: tot,
    realizedZoneShare: tot ? r5(realized / tot) : null, zoneAttackShare: realized ? r5(attack / realized) : null };
};

/** Side-balanced paired play. Every seed is drawn from the frozen addressing. */
export const playPaired = ({ subjectFive, subjectCoach, oppFive, oppCoach, era, seedAt, pairs, zoneResolution = true, includeLedger = true }) => {
  const games = []; const subjectSide = []; const seeds = [];
  for (let i = 0; i < pairs; i++) {
    const seed = seedAt(i); seeds.push(seed);
    games.push(runPossessionGame(buildPossessionInput({ goldIds: subjectFive, blueIds: oppFive,
      coachGoldId: subjectCoach, coachBlueId: oppCoach, eraStyleId: era, simulationSeed: seed, zoneResolution }),
      { includeLedger, assertInvariants: false }));
    subjectSide.push("gold");
    games.push(runPossessionGame(buildPossessionInput({ goldIds: oppFive, blueIds: subjectFive,
      coachGoldId: oppCoach, coachBlueId: subjectCoach, eraStyleId: era, simulationSeed: seed, zoneResolution }),
      { includeLedger, assertInvariants: false }));
    subjectSide.push("blue");
  }
  return { games, subjectSide, seeds };
};

/** Re-run designated seeds and compare byte-for-byte against the first pass. */
export const replayCheck = ({ five, coach, era, seedAt, seedCount, games }) => {
  let mismatch = 0; const mismatches = [];
  for (let k = 0; k < seedCount; k++) {
    const seed = seedAt(k);
    const again = runPossessionGame(buildPossessionInput({ goldIds: five, blueIds: five,
      coachGoldId: coach, coachBlueId: coach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false });
    const first = games[k * 2];
    const same = again.finalScore.gold === first.finalScore.gold
      && again.finalScore.blue === first.finalScore.blue
      && JSON.stringify(again.gold.totals) === JSON.stringify(first.gold.totals)
      && JSON.stringify(again.blue.totals) === JSON.stringify(first.blue.totals);
    if (!same) { mismatch += 1; mismatches.push({ seedIndex: k, seed }); }
  }
  return { replaySeedsChecked: seedCount, replayMismatchCount: mismatch, mismatches };
};

/**
 * Evaluate one fixture. Returns the per-fixture record the verdict schema
 * defines: every cell, every measured metric, and the fixture verdict.
 */
export const evaluateFixture = ({ fixture, fixtureIndex, surfacePlan, samplePlanRow, seedFor, thresholds, margins }) => {
  const surf = surfacePlan.surfaces;
  const cells = {}; const measured = {}; const surfacesRun = [];
  const allStructural = [];

  // ── MIRROR ───────────────────────────────────────────────────────────────
  const mirrorPairs = samplePlanRow.surfaces.MIRROR.pairs;
  const mirror = playPaired({ subjectFive: fixture.five, subjectCoach: fixture.coach,
    oppFive: fixture.five, oppCoach: fixture.coach, era: fixture.era,
    seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "MIRROR", pairIndex: k }), pairs: mirrorPairs });
  surfacesRun.push({ surface: "MIRROR", pairs: mirrorPairs, games: mirror.games.length });
  const mirrorStructural = structuralOf(mirror.games);
  allStructural.push(mirrorStructural);
  const action = actionMixOf(mirror.games, "gold");
  const variance = varianceOf(mirror.games);
  const mirrorZone = realizedZoneOf(mirror.games);
  const replay = replayCheck({ five: fixture.five, coach: fixture.coach, era: fixture.era,
    seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "MIRROR", pairIndex: k }),
    seedCount: Math.min(samplePlanRow.modes.REPLAY.seeds, mirrorPairs), games: mirror.games });
  measured.mirror = { action, variance, zone: mirrorZone, structural: mirrorStructural, replay };

  // ── ZONE_ASYMMETRIC and its ablation twin ────────────────────────────────
  let zoneAsym = null; let twin = null;
  if (surf.ZONE_ASYMMETRIC.applicable) {
    const zp = samplePlanRow.surfaces.ZONE_ASYMMETRIC.pairs;
    const z = playPaired({ subjectFive: fixture.five, subjectCoach: surf.ZONE_ASYMMETRIC.zoneCoachId,
      oppFive: fixture.five, oppCoach: surf.ZONE_ASYMMETRIC.manCoachId, era: fixture.era,
      seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "ZONE_ASYMMETRIC", pairIndex: k }), pairs: zp });
    surfacesRun.push({ surface: "ZONE_ASYMMETRIC", pairs: zp, games: z.games.length });
    const zs = structuralOf(z.games); allStructural.push(zs);
    zoneAsym = { winRate: winRateOf(z.games, (k) => z.subjectSide[k]), zone: realizedZoneOf(z.games), structural: zs };
    const tp = samplePlanRow.surfaces.ZONE_ABLATION_TWIN.pairs;
    const t = playPaired({ subjectFive: fixture.five, subjectCoach: surf.ZONE_ASYMMETRIC.zoneCoachId,
      oppFive: fixture.five, oppCoach: surf.ZONE_ASYMMETRIC.manCoachId, era: fixture.era,
      seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "ZONE_ABLATION_TWIN", pairIndex: k }),
      pairs: tp, zoneResolution: false });
    surfacesRun.push({ surface: "ZONE_ABLATION_TWIN", pairs: tp, games: t.games.length, adjudicates: false });
    twin = { winRate: winRateOf(t.games, (k) => t.subjectSide[k]), zone: realizedZoneOf(t.games) };
    measured.zoneAsymmetric = { ...zoneAsym, twin };
  } else {
    measured.zoneAsymmetric = { applicable: false, reason: surf.ZONE_ASYMMETRIC.reason,
      structuralExpectation: "realized zone possessions === 0",
      realizedZoneOnMirror: mirrorZone.realizedZonePossessions };
  }

  // ── VS_COHERENT_LOWER_CONTROL ────────────────────────────────────────────
  if (surf.VS_COHERENT_LOWER_CONTROL.applicable) {
    const lp = samplePlanRow.surfaces.VS_COHERENT_LOWER_CONTROL.pairs;
    const c = surf.VS_COHERENT_LOWER_CONTROL.control;
    const l = playPaired({ subjectFive: c.five, subjectCoach: "neutral", oppFive: fixture.five,
      oppCoach: "neutral", era: fixture.era,
      seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "VS_COHERENT_LOWER_CONTROL", pairIndex: k }), pairs: lp });
    surfacesRun.push({ surface: "VS_COHERENT_LOWER_CONTROL", pairs: lp, games: l.games.length });
    const ls = structuralOf(l.games); allStructural.push(ls);
    measured.vsCoherentLowerControl = { winRate: winRateOf(l.games, (k) => l.subjectSide[k]),
      controlFive: c.five, controlTeamRating: c.teamRating, fixtureTeamRating: surfacePlan.fixtureSummedRating,
      ratingRatio: r5(c.teamRating / surfacePlan.fixtureSummedRating),
      controlCoherent: c.coherence.coherent, structural: ls };
  } else measured.vsCoherentLowerControl = { applicable: false, reason: surf.VS_COHERENT_LOWER_CONTROL.reason };

  // ── VS_ROLE_MATCHED_UPGRADE ──────────────────────────────────────────────
  if (surf.VS_ROLE_MATCHED_UPGRADE.applicable) {
    const up = samplePlanRow.surfaces.VS_ROLE_MATCHED_UPGRADE.pairs;
    const u = surf.VS_ROLE_MATCHED_UPGRADE.upgrade;
    const g = playPaired({ subjectFive: u.five, subjectCoach: "neutral", oppFive: fixture.five,
      oppCoach: "neutral", era: fixture.era,
      seedAt: (k) => seedFor({ fixtureIndex, surfaceSlot: "VS_ROLE_MATCHED_UPGRADE", pairIndex: k }), pairs: up });
    surfacesRun.push({ surface: "VS_ROLE_MATCHED_UPGRADE", pairs: up, games: g.games.length });
    const gs = structuralOf(g.games); allStructural.push(gs);
    measured.vsRoleMatchedUpgrade = { winRate: winRateOf(g.games, (k) => g.subjectSide[k]),
      upgradedFive: u.five, ratingBefore: u.ratingBefore, ratingAfter: u.ratingAfter,
      achievedRatio: u.achievedRatio, slotsUpgraded: u.slotsUpgraded, structural: gs };
  } else measured.vsRoleMatchedUpgrade = { applicable: false, reason: surf.VS_ROLE_MATCHED_UPGRADE.reason };

  // ── competition modes, where the fixture's purpose names them ────────────
  measured.modes = {};
  if (samplePlanRow.modes.SERIES_BEST_OF_7.series > 0) {
    let games = 0; const lens = []; const st = [];
    for (let s = 0; s < samplePlanRow.modes.SERIES_BEST_OF_7.series; s++) {
      const gs = runPossessionSeries(buildPossessionInput({ goldIds: fixture.five, blueIds: fixture.five,
        coachGoldId: fixture.coach, coachBlueId: fixture.coach, eraStyleId: fixture.era,
        simulationSeed: seedFor({ fixtureIndex, surfaceSlot: "SERIES_BEST_OF_7", pairIndex: s }), mode: "best7" }),
        { games: 7, opts: { assertInvariants: false, includeLedger: false } });
      let a = 0, b = 0, played = 0;
      for (const g of gs) { played += 1; games += 1; st.push(g);
        if (g.finalScore.gold > g.finalScore.blue) a += 1; else b += 1; if (a === 4 || b === 4) break; }
      lens.push(played);
    }
    const ss = structuralOf(st); allStructural.push(ss);
    measured.modes.seriesBestOf7 = { series: samplePlanRow.modes.SERIES_BEST_OF_7.series, games,
      meanLength: r5(mean(lens)), minLength: Math.min(...lens), maxLength: Math.max(...lens), structural: ss };
    surfacesRun.push({ surface: "SERIES_BEST_OF_7", games });
  }
  if (samplePlanRow.modes.SEASONS_OF_82.seasons > 0) {
    let games = 0; const wins = []; const st = [];
    for (let s = 0; s < samplePlanRow.modes.SEASONS_OF_82.seasons; s++) {
      const gs = runPossessionSeries(buildPossessionInput({ goldIds: fixture.five, blueIds: fixture.five,
        coachGoldId: fixture.coach, coachBlueId: fixture.coach, eraStyleId: fixture.era,
        simulationSeed: seedFor({ fixtureIndex, surfaceSlot: "SEASONS_OF_82", pairIndex: s }), mode: "82" }),
        { games: 82, opts: { assertInvariants: false, includeLedger: false } });
      let w = 0;
      for (const g of gs) { games += 1; st.push(g); if (g.finalScore.gold > g.finalScore.blue) w += 1; }
      wins.push(w);
    }
    const ss = structuralOf(st); allStructural.push(ss);
    measured.modes.seasonsOf82 = { seasons: samplePlanRow.modes.SEASONS_OF_82.seasons, games,
      meanWins: r5(mean(wins)), minWins: Math.min(...wins), maxWins: Math.max(...wins), structural: ss };
    surfacesRun.push({ surface: "SEASONS_OF_82", games });
  }

  // ── cells ────────────────────────────────────────────────────────────────
  const totals = allStructural.reduce((a, s) => {
    for (const [k, v] of Object.entries(s)) if (k !== "games") a[k] = (a[k] ?? 0) + v; return a; }, {});
  const totalGames = allStructural.reduce((a, s) => a + s.games, 0);

  cells.requireZeroInvariantFailures = zeroCountCell({ observed: totals.invariantViolationCount,
    what: `invariant violations across ${totalGames} games` });
  cells.requireZeroImpossibleResults = zeroCountCell({
    observed: totals.impossibleScoreCount + totals.nonFiniteStatCount + totals.negativeStatCount + totals.finalTieCount,
    what: `impossible results across ${totalGames} games (scores outside [20,220], non-finite or negative statistics, or undecided games)` });
  cells.requireZeroInvariantFailures.surface = "every adjudicating surface";
  cells.requireZeroImpossibleResults.surface = "every adjudicating surface";

  cells.forbidUniversalActionDominance = { ...ceilingCell({ observed: action.share, se: action.se,
    ceiling: thresholds.maxSingleActionFamilyShare, margin: margins.maxActionFamilyShare }),
    surface: "MIRROR", dominantFamily: action.family };

  if (surf.ZONE_ASYMMETRIC.applicable) {
    const base = bandCell({ observed: zoneAsym.winRate.value, se: zoneAsym.winRate.se,
      min: thresholds.minSingleShellWinRate, max: thresholds.maxSingleShellWinRate,
      margin: margins.shellSideWinRate });
    // A breach the coach ablation twin also shows is not attributable to the
    // shell. It is recorded as INDETERMINATE, never converted into a pass.
    const twinDeviation = twin.winRate.value == null ? null : r5(twin.winRate.value - 0.5);
    const zoneDeviation = zoneAsym.winRate.value == null ? null : r5(zoneAsym.winRate.value - 0.5);
    const attributable = twinDeviation == null || zoneDeviation == null ? null
      : Math.abs(zoneDeviation) - Math.abs(twinDeviation) > margins.shellSideWinRate;
    cells.forbidUniversalShellDominance = base.outcome === CELL.FAIL && attributable === false
      ? { ...base, outcome: CELL.INDETERMINATE, marginSatisfied: false,
          reason: `the raw zoning-side win rate ${zoneAsym.winRate.value} breaches the band, but the zone-ablation twin deviates from 0.5 by ${twinDeviation} with the shell removed, so the breach is not attributable to the shell. Recorded as INDETERMINATE: no pass credit and no failure.`,
          surface: "ZONE_ASYMMETRIC", coachOnlyWinRate: twin.winRate.value, twinDeviation, zoneDeviation, shellAttributable: false }
      : { ...base, surface: "ZONE_ASYMMETRIC", coachOnlyWinRate: twin.winRate.value,
          twinDeviation, zoneDeviation, shellAttributable: attributable,
          realizedZoneShare: zoneAsym.zone.realizedZoneShare };
  } else {
    // Zone illegal: the win-rate band cannot be posed. The fixture is held to
    // the structural expectation instead, which is a real check, not a skip.
    const zeroZone = zeroCountCell({ observed: mirrorZone.realizedZonePossessions,
      what: `zone possessions realized in ${fixture.era}, where zone defence is illegal` });
    cells.forbidUniversalShellDominance = { outcome: CELL.NOT_APPLICABLE, observed: null, se: null,
      threshold: [thresholds.minSingleShellWinRate, thresholds.maxSingleShellWinRate],
      practicalMargin: margins.shellSideWinRate, marginSatisfied: null, surface: "n/a",
      reason: `zone defence is illegal in ${fixture.era}, so no zone possession can be realized and no shell win rate exists. No pass credit and no failure contribution.`,
      structuralExpectationOutcome: zeroZone.outcome, realizedZonePossessions: mirrorZone.realizedZonePossessions };
    // A realized zone in a zone-illegal era is an engine contradiction, so it
    // lands on the impossible-results guardrail rather than vanishing.
    if (zeroZone.outcome === CELL.FAIL) {
      cells.requireZeroImpossibleResults = { ...cells.requireZeroImpossibleResults, outcome: CELL.FAIL,
        observed: (cells.requireZeroImpossibleResults.observed ?? 0) + mirrorZone.realizedZonePossessions,
        reason: `${mirrorZone.realizedZonePossessions} zone possessions were realized in ${fixture.era}, where zone defence is illegal` };
    }
  }

  cells.requireSameSeedReplay = { ...zeroCountCell({ observed: replay.replayMismatchCount,
    what: `replay mismatches across ${replay.replaySeedsChecked} designated seeds` }), surface: "MIRROR" };

  cells.requireNewSeedVariance = { ...floorCell({ observed: variance.combinedScoreSd,
    se: variance.combinedScoreSdSe, floor: thresholds.minCombinedScoreSd, margin: margins.combinedScoreSd }),
    surface: "MIRROR", distinctScorelineRatio: variance.distinctScorelineRatio,
    distinctScorelineRatioFloorForThisVolume: thresholds.distinctScorelineRatioFloorByGames?.[String(variance.games)] ?? null,
    secondaryNote: "the distinct-scoreline ratio is reported but does not adjudicate: it is strongly sample-size dependent, so a single frozen floor would not be comparable across the mirror and tail-extension volumes" };

  cells.requireConstructionCanBeatHigherOvr = surf.VS_COHERENT_LOWER_CONTROL.applicable
    ? { ...floorCell({ observed: measured.vsCoherentLowerControl.winRate.value,
        se: measured.vsCoherentLowerControl.winRate.se,
        floor: thresholds.constructionWinRateFloor, margin: margins.coherentLowerControlWinRate }),
        surface: "VS_COHERENT_LOWER_CONTROL", ratingRatio: measured.vsCoherentLowerControl.ratingRatio,
        countsTowardExistentialBar: measured.vsCoherentLowerControl.winRate.value != null
          && measured.vsCoherentLowerControl.winRate.value >= thresholds.constructionExistentialBar }
    : { outcome: CELL.NOT_APPLICABLE, observed: null, se: null, threshold: thresholds.constructionWinRateFloor,
        practicalMargin: margins.coherentLowerControlWinRate, marginSatisfied: null, surface: "n/a",
        reason: surf.VS_COHERENT_LOWER_CONTROL.reason };

  // A FLOOR, not a band. An upper bound here would duplicate
  // requireConstructionCanBeatHigherOvr, which is exactly the protection
  // against talent being absolute; the two guardrails bracket one axis and the
  // ceiling belongs to the other one.
  cells.requireExtremeTalentRemainsMeaningful = surf.VS_ROLE_MATCHED_UPGRADE.applicable
    ? { ...floorCell({ observed: measured.vsRoleMatchedUpgrade.winRate.value,
        se: measured.vsRoleMatchedUpgrade.winRate.se,
        floor: thresholds.talentWinRateFloor, margin: margins.roleMatchedUpgradeWinRate }),
        surface: "VS_ROLE_MATCHED_UPGRADE", upgradeRatio: measured.vsRoleMatchedUpgrade.achievedRatio,
        upperBoundNote: "no ceiling is applied here: requireConstructionCanBeatHigherOvr is the guardrail that forbids talent from being absolute, and requireNewSeedVariance forbids a degenerate deterministic outcome. A second ceiling would double-count one failure." }
    : { outcome: CELL.NOT_APPLICABLE, observed: null, se: null,
        threshold: thresholds.talentWinRateFloor,
        practicalMargin: margins.roleMatchedUpgradeWinRate, marginSatisfied: null, surface: "n/a",
        reason: surf.VS_ROLE_MATCHED_UPGRADE.reason };

  // ── the catastrophic rule ────────────────────────────────────────────────
  const CATASTROPHIC = ["requireZeroInvariantFailures", "requireZeroImpossibleResults", "requireSameSeedReplay"];
  const catastrophicFailed = CATASTROPHIC.filter((k) => cells[k].outcome === CELL.FAIL);
  if (catastrophicFailed.length) {
    for (const [k, c] of Object.entries(cells)) {
      if (CATASTROPHIC.includes(k)) continue;
      if (c.outcome === CELL.PASS || c.outcome === CELL.FAIL) {
        cells[k] = { ...c, outcome: CELL.INDETERMINATE, marginSatisfied: false,
          reason: `measured on games the engine itself contradicts (${catastrophicFailed.join(", ")} failed on this fixture), so this observation carries no credit in either direction` };
      }
    }
  }

  const outcomes = Object.values(cells).map((c) => c.outcome);
  const verdict = outcomes.includes(CELL.NOT_MEASURED) ? FIXTURE.INVALID_RUN
    : outcomes.includes(CELL.FAIL) ? FIXTURE.FAIL
    : outcomes.includes(CELL.PASS) ? FIXTURE.PASS
    : FIXTURE.INVALID_RUN;

  return { fixtureId: fixture.id, purpose: fixture.purpose, era: fixture.era, coach: fixture.coach,
    verdict, cells, measured, surfacesRun, totalGames, structuralTotals: totals,
    catastrophicFailed, replayMismatchCount: replay.replayMismatchCount };
};

/** Turn the fixture records into one set verdict, per the frozen rule. */
export const aggregate = ({ records, aggregationPolicy }) => {
  const failed = records.filter((r) => r.verdict === FIXTURE.FAIL);
  const invalid = records.filter((r) => r.verdict === FIXTURE.INVALID_RUN);
  const decidedCounts = {}; const shortfalls = [];
  for (const row of aggregationPolicy.guardrails) {
    const passes = records.filter((r) => r.cells[row.guardrailId]?.outcome === CELL.PASS).length;
    decidedCounts[row.guardrailId] = { decidedPass: passes, required: row.minDecidedFixturesForSetPass,
      applicable: row.applicableFixtures };
    if (passes < row.minDecidedFixturesForSetPass) {
      shortfalls.push({ guardrailId: row.guardrailId, decidedPass: passes, required: row.minDecidedFixturesForSetPass });
    }
  }
  const verdict = failed.length ? SET.FAIL
    : (invalid.length || shortfalls.length) ? SET.INVALID_RUN
    : SET.PASS;
  return { verdict, failedFixtures: failed.map((r) => r.fixtureId), invalidFixtures: invalid.map((r) => r.fixtureId),
    decidedCounts, shortfalls,
    fixtureVerdicts: Object.fromEntries(records.map((r) => [r.fixtureId, r.verdict])),
    totalGames: records.reduce((a, r) => a + r.totalGames, 0) };
};
