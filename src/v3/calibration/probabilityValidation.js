// ── Probability validation scoring ──────────────────────────────────────────
// Thresholds and scoring live here, not in the CLI script, so that a test can
// import a constant without executing a simulation campaign as a side effect.
//
// The two Brier scales below are kept deliberately separate. Scoring a forecast
// against a cell's empirical RATE measures calibration and lands near zero;
// scoring it against individual binary OUTCOMES measures forecasting skill and
// cannot fall below the irreducible randomness of the games themselves. Phase
// 6C2B's 0.2507 baseline is on the outcome scale, so only outcome-scale numbers
// may be compared to it. Mixing them would flatter this estimator by two orders
// of magnitude.
import { versionOf } from "../../versions.js";

const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

/**
 * Frozen before any result was observed. Changing one requires a new
 * probabilityValidationVersion and a recorded reason — a threshold moved after
 * seeing the number it judges is not a threshold.
 */
export const THRESHOLDS = Object.freeze({
  probabilityValidationVersion: versionOf("probabilityValidationVersion"),
  reliabilityBinCount: 10,
  analyticalBaselineBrier: 0.2507,
  constantBaselineBrier: 0.25,
  maxExpectedCalibrationError: 0.10,
  maxSideBiasDifference: 0.05,
  mirrorTolerance: 0.03,
  minValidationGamesPerCell: 256,
  minFractionOfAchievableSkill: 0.75,
  requireMonotonicLadder: true,
  requireSharpnessReported: true,
});

export const reliabilityBins = (cells, binCount = THRESHOLDS.reliabilityBinCount) => {
  const bins = Array.from({ length: binCount }, (_, i) => ({ lo: r3(i / binCount), hi: r3((i + 1) / binCount), n: 0, predSum: 0, empSum: 0, games: 0 }));
  for (const c of cells) {
    const b = bins[Math.min(binCount - 1, Math.max(0, Math.floor(c.predicted * binCount)))];
    b.n++; b.predSum += c.predicted; b.empSum += c.empirical; b.games += c.games ?? c.outcomes?.length ?? 0;
  }
  return bins.map((b) => ({
    lo: b.lo, hi: b.hi, cells: b.n, games: b.games,
    meanPredicted: b.n ? r4(b.predSum / b.n) : null,
    meanEmpirical: b.n ? r4(b.empSum / b.n) : null,
    gap: b.n ? r4(b.empSum / b.n - b.predSum / b.n) : null,
  }));
};

export const scoreCells = (cells) => {
  const bins = reliabilityBins(cells).filter((b) => b.cells > 0);
  const total = bins.reduce((a, b) => a + b.cells, 0);

  // ── Outcome scale: comparable to the 6C2B analytical baseline ─────────────
  const games = cells.flatMap((c) => c.outcomes.map((o) => ({ p: c.predicted, o })));
  const outcomeBrier = (pred) => games.reduce((a, g) => a + (pred(g) - g.o) ** 2, 0) / games.length;
  const EPS = 1e-12;
  const outcomeLogLoss = (pred) => -games.reduce((a, g) => {
    const p = Math.min(1 - EPS, Math.max(EPS, pred(g)));
    return a + (g.o ? Math.log(p) : Math.log(1 - p));
  }, 0) / games.length;
  // What a forecaster that knew each cell's true rate exactly would still score,
  // because individual games remain random. No forecast can beat this.
  const floor = cells.reduce((a, c) => a + c.outcomes.length * c.empirical * (1 - c.empirical), 0) / games.length;
  const mc = outcomeBrier((g) => g.p);
  const constant = outcomeBrier(() => 0.5);
  const achievable = constant - floor;

  const rateBrier = (pred) => cells.reduce((a, c) => a + (pred(c) - c.empirical) ** 2, 0) / cells.length;

  const bs = cells.map((c) => c.sideBias);
  const meanBias = bs.reduce((a, b) => a + b, 0) / bs.length;
  const seBias = bs.length > 1
    ? Math.sqrt(bs.reduce((a, b) => a + (b - meanBias) ** 2, 0) / (bs.length - 1)) / Math.sqrt(bs.length)
    : 0;

  return {
    n: cells.length,
    validationGames: games.length,
    outcomeScale: {
      note: "Scored against individual binary game outcomes — the scale of the Phase 6C2B analytical baseline (0.2507), and the only scale on which that comparison is valid.",
      monteCarloBrier: r4(mc),
      constantBaselineBrier: r4(constant),
      irreducibleFloorBrier: r4(floor),
      skillScoreVsConstant: r4(1 - mc / constant),
      // The honest headline. Most of a Brier score on near-even matchups is
      // irreducible randomness, so raw differences look tiny even for a
      // near-perfect forecast. This measures the only part anyone can win.
      fractionOfAchievableSkill: achievable > 0 ? r4((constant - mc) / achievable) : null,
      analyticalFractionOfAchievableSkill: achievable > 0 ? r4((constant - THRESHOLDS.analyticalBaselineBrier) / achievable) : null,
      monteCarloLogLoss: r4(outcomeLogLoss((g) => g.p)),
      constantBaselineLogLoss: r4(outcomeLogLoss(() => 0.5)),
    },
    rateScale: {
      note: "Scored against each cell's empirical rate. A calibration statistic. MUST NOT be compared to the 0.2507 outcome-scale baseline.",
      monteCarloBrier: r4(rateBrier((c) => c.predicted)),
      constantBaselineBrier: r4(rateBrier(() => 0.5)),
      meanAbsoluteError: r4(cells.reduce((a, c) => a + Math.abs(c.predicted - c.empirical), 0) / cells.length),
    },
    sharpness: r4(Math.sqrt(cells.reduce((a, c) => a + (c.predicted - 0.5) ** 2, 0) / cells.length)),
    expectedCalibrationError: r4(bins.reduce((a, b) => a + (b.cells / total) * Math.abs(b.gap), 0)),
    maximumCalibrationError: r4(Math.max(...bins.map((b) => Math.abs(b.gap)))),
    upsetRate: r4(cells.filter((c) => (c.predicted > 0.5 ? c.empirical < 0.5 : c.empirical > 0.5)).length / cells.length),
    favoriteWinRate: r4(cells.filter((c) => Math.abs(c.predicted - 0.5) > 0.02)
      .filter((c) => (c.predicted > 0.5 ? c.empirical > 0.5 : c.empirical < 0.5)).length
      / Math.max(1, cells.filter((c) => Math.abs(c.predicted - 0.5) > 0.02).length)),
    // The frozen threshold caps the WORST single cell. At 256 games the standard
    // error of a 0.5 rate is 0.031, so one cell at 0.0625 is 2 SE — with 30 cells,
    // ~1.4 such cells are expected from noise alone. Whether the bias is
    // SYSTEMATIC is the question that matters, so both are reported and neither
    // is allowed to stand in for the other.
    sideBias: {
      maxAbsolutePerCell: r4(Math.max(...bs.map(Math.abs))),
      meanAcrossCells: r4(meanBias),
      standardError: r4(seBias),
      tStatistic: r4(seBias > 0 ? meanBias / seBias : 0),
      systematic: seBias > 0 ? Math.abs(meanBias / seBias) > 2 : false,
      perCellStandardErrorAtSampleSize: r4(Math.sqrt(0.25 / (cells[0]?.outcomes?.length ?? 1))),
    },
    reliabilityBins: bins,
  };
};

export const evaluateGate = (s) => ({
  beatsAnalyticalOnOutcomeScale: s.outcomeScale.monteCarloBrier < THRESHOLDS.analyticalBaselineBrier,
  beatsConstantOnOutcomeScale: s.outcomeScale.monteCarloBrier < s.outcomeScale.constantBaselineBrier,
  withinIrreducibleFloorPlusTolerance: s.outcomeScale.monteCarloBrier <= s.outcomeScale.irreducibleFloorBrier + 0.01,
  capturesMostAchievableSkill: s.outcomeScale.fractionOfAchievableSkill >= THRESHOLDS.minFractionOfAchievableSkill,
  calibrationWithinTolerance: s.expectedCalibrationError <= THRESHOLDS.maxExpectedCalibrationError,
  sideBiasPerCellWithinTolerance: s.sideBias.maxAbsolutePerCell <= THRESHOLDS.maxSideBiasDifference,
  sideBiasNotSystematic: !s.sideBias.systematic,
  sharpnessReported: s.sharpness != null,
});
