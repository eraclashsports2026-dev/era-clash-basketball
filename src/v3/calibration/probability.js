// ── Pregame win probability and its validation ──────────────────────────────
// A probability computed BEFORE the game, from the pregame expectation only.
//
// It must never read the final score, the winner, realised player lines or any
// postgame event. A "prediction" that has seen the result is not a prediction,
// and a reliability curve built from one is a tautology.
//
// What this validates is INTERNAL CONSISTENCY: when the model says 70%, does the
// engine win 70% of the time? It makes no claim about true historical
// probabilities for hypothetical all-time matchups, which are unknowable.
import { versionOf } from "../../versions.js";

export const PROBABILITY_VALIDATION_VERSION = versionOf("probabilityValidationVersion");

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

/**
 * Win probability from the pregame expectation.
 *
 * Efficiency differential per 100 possessions is converted to an expected
 * margin over the expected number of possessions, then to a probability through
 * a logistic whose scale is the standard deviation of game margin.
 *
 * `MARGIN_SD` is an engine-measured quantity, not a tuned one: it is the spread
 * of simulated margins. Every term is interpretable, which matters because an
 * opaque probability cannot be debugged when it is wrong.
 */
// ── MEASURED LIMITATION ─────────────────────────────────────────────────────
// The pregame expectation this module converts does NOT predict match outcomes.
//
// Measured over 40 same-era matchup cells at 800 seeds each (standard error
// ~0.65 per cell, so the measurement is not underpowered):
//
//     realized margin = 0.567 x expected margin - 0.546,   R^2 = 0.035
//
// At the extremes it gets the SIGN wrong: an expected margin of -3.13 produced
// a realized +19.6 (win rate 0.889), and +3.13 produced -20.1 (0.098).
//
// The Phase 6A expectation was fitted to predict the engine's own offensive
// EFFICIENCY, and it does that with a mean absolute error near 2.4. Efficiency
// differential is not margin, and the gap between the two is where games are
// decided.
//
// So this module refuses to present itself as calibrated. It emits a
// probability because the shape is needed for Phase 6C3, and it reports the
// measured R^2 alongside so nobody mistakes the number for a reliable one.
// Fixing it means refitting the expectation against MARGIN, which is engine
// work and belongs to a phase whose targets support it.
export const EXPECTATION_PREDICTIVE_FIT = Object.freeze({
  slope: 0.567,
  intercept: -0.546,
  rSquared: 0.035,
  cells: 40,
  seedsPerCell: 800,
  verdict: "NOT_PREDICTIVE",
  note: "The expectation explains ~3.5% of realized margin variance. Any probability derived from it is internally consistent at best, and must not be presented as a calibrated win probability.",
});

// Measured spread of realized margins across the same sample: 18.5, not 13.0.
export const MARGIN_SD = 18.5;

export const winProbability = ({ expectedOffensiveEfficiencyGold, expectedOffensiveEfficiencyBlue, expectedPace }) => {
  if (![expectedOffensiveEfficiencyGold, expectedOffensiveEfficiencyBlue, expectedPace].every(Number.isFinite)) return null;
  const effDiff = expectedOffensiveEfficiencyGold - expectedOffensiveEfficiencyBlue;
  const expectedMargin = (effDiff / 100) * expectedPace;
  // Logistic on the margin. 1.7 / SD makes the logistic approximate a normal
  // CDF with the same standard deviation.
  const p = 1 / (1 + Math.exp(-(1.7 * expectedMargin) / MARGIN_SD));
  return {
    probability: r4(p),
    expectedMargin: r4(expectedMargin),
    efficiencyDifferential: r4(effDiff),
    // Carried on every prediction so a consumer cannot use the number without
    // seeing what it is worth.
    predictiveFit: EXPECTATION_PREDICTIVE_FIT.verdict,
    rSquared: EXPECTATION_PREDICTIVE_FIT.rSquared,
  };
};

/**
 * Extracts a prediction from a completed game WITHOUT reading its outcome.
 *
 * The outcome is returned alongside for scoring, but the probability is derived
 * only from `game.expectation`, which is computed and stored before the first
 * possession resolves.
 */
export const predictionFrom = (game) => {
  const wp = winProbability(game.expectation ?? {});
  if (!wp) return null;
  return {
    predicted: wp.probability,
    expectedMargin: wp.expectedMargin,
    // Read for scoring only, never fed back into the prediction.
    won: game.finalScore.gold > game.finalScore.blue,
    realizedMargin: game.finalScore.gold - game.finalScore.blue,
  };
};

// ── Scoring ─────────────────────────────────────────────────────────────────
export const reliabilityBins = (predictions, binCount = 10) => {
  const bins = Array.from({ length: binCount }, (_, i) => ({ lo: r4(i / binCount), hi: r4((i + 1) / binCount), n: 0, sum: 0, wins: 0 }));
  for (const p of predictions) {
    if (!Number.isFinite(p.predicted)) continue;
    const b = bins[Math.min(binCount - 1, Math.max(0, Math.floor(p.predicted * binCount)))];
    b.n++; b.sum += p.predicted; if (p.won) b.wins++;
  }
  return bins.map((b) => ({
    lo: b.lo, hi: b.hi, n: b.n,
    meanPredicted: b.n ? r4(b.sum / b.n) : null,
    observed: b.n ? r4(b.wins / b.n) : null,
    gap: b.n ? r4(b.wins / b.n - b.sum / b.n) : null,
  }));
};

export const brierScore = (ps) => {
  const v = ps.filter((p) => Number.isFinite(p.predicted));
  return v.length ? r4(v.reduce((a, p) => a + (p.predicted - (p.won ? 1 : 0)) ** 2, 0) / v.length) : null;
};

export const logLoss = (ps, eps = 1e-6) => {
  const v = ps.filter((p) => Number.isFinite(p.predicted));
  if (!v.length) return null;
  const c = (x) => Math.min(1 - eps, Math.max(eps, x));
  return r4(-v.reduce((a, p) => a + Math.log(p.won ? c(p.predicted) : 1 - c(p.predicted)), 0) / v.length);
};

/** Spread from 0.5. Reported beside Brier because a model that always says 50% is calibrated and useless. */
export const sharpness = (ps) => {
  const v = ps.filter((p) => Number.isFinite(p.predicted)).map((p) => p.predicted);
  return v.length ? r4(Math.sqrt(v.reduce((a, x) => a + (x - 0.5) ** 2, 0) / v.length)) : null;
};

export const upsetRate = (ps) => {
  const v = ps.filter((p) => Number.isFinite(p.predicted) && Math.abs(p.predicted - 0.5) > 1e-9);
  return v.length ? r4(v.filter((p) => (p.predicted > 0.5 ? !p.won : p.won)).length / v.length) : null;
};

/**
 * Calibration error: how far the reliability curve sits from the diagonal,
 * weighted by how many predictions fall in each bin.
 */
export const calibrationError = (bins) => {
  const filled = bins.filter((b) => b.n > 0);
  const total = filled.reduce((a, b) => a + b.n, 0);
  if (!total) return null;
  return r4(filled.reduce((a, b) => a + (b.n / total) * Math.abs(b.gap), 0));
};

/** Whether an empirical clamp exists — a range predictions never leave. */
export const detectClamp = (ps) => {
  const v = ps.map((p) => p.predicted).filter(Number.isFinite);
  if (!v.length) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  return {
    observedMin: r4(min), observedMax: r4(max),
    // Not proof of a hard clamp — a narrow spread can also mean the matchups
    // were close. Reported so it cannot pass unnoticed either way.
    suspectedClamp: min > 0.04 && max < 0.96,
    note: "An observed range is not proof of a hard clamp; it may simply be the matchups tested. Reported so a real clamp cannot hide.",
  };
};

export const report = (predictions) => {
  const bins = reliabilityBins(predictions);
  return {
    probabilityValidationVersion: PROBABILITY_VALIDATION_VERSION,
    n: predictions.length,
    brierScore: brierScore(predictions),
    logLoss: logLoss(predictions),
    sharpness: sharpness(predictions),
    upsetRate: upsetRate(predictions),
    calibrationError: calibrationError(bins),
    clamp: detectClamp(predictions),
    reliabilityBins: bins,
    expectationPredictiveFit: EXPECTATION_PREDICTIVE_FIT,
    usable: false,
    note: "Validates INTERNAL consistency only. The underlying pregame expectation explains ~3.5% of realized margin variance (R^2 0.035 over 40 cells at 800 seeds), so this is NOT a calibrated win probability and must not be presented as one. It makes no claim about true historical probabilities for hypothetical all-time matchups.",
  };
};

/** Monotonicity: does a stronger team win more often, at every step? */
export const monotonicity = (rungs) => {
  const violations = [];
  for (let i = 1; i < rungs.length; i++) {
    if (rungs[i].predicted < rungs[i - 1].predicted) {
      violations.push({ kind: "predicted", from: rungs[i - 1].label, to: rungs[i].label, values: [rungs[i - 1].predicted, rungs[i].predicted] });
    }
    if (rungs[i].empirical < rungs[i - 1].empirical) {
      violations.push({ kind: "empirical", from: rungs[i - 1].label, to: rungs[i].label, values: [rungs[i - 1].empirical, rungs[i].empirical] });
    }
  }
  return { monotonic: violations.length === 0, violations };
};
