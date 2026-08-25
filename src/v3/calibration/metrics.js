// ── Canonical calibration metrics ───────────────────────────────────────────
// ONE definition per metric, used by every benchmark. The failure mode this
// prevents is two scripts computing "offensive rating" slightly differently and
// a tuning pass chasing the difference between them instead of a real error.
//
// Every formula is documented, divide-by-zero-safe, and never returns NaN or
// Infinity. A null is honest; a NaN silently corrupts every aggregate it
// enters.
import { versionOf } from "../../versions.js";

export const CALIBRATION_FRAMEWORK_VERSION = versionOf("calibrationFrameworkVersion");

const safe = (n, d) => (d > 0 && Number.isFinite(n / d) ? n / d : null);
const sub = (a, b) => (a == null || b == null ? null : a - b);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

export const METRIC_DEFINITIONS = Object.freeze({
  pace: "Team possessions per 48 minutes, taken from the engine's own possession ledger rather than estimated.",
  offensiveRating: "Points scored per 100 team possessions.",
  defensiveRating: "Points allowed per 100 opponent possessions.",
  netRating: "offensiveRating minus defensiveRating.",
  efgPct: "(FGM + 0.5 x 3PM) / FGA. Values a three at its actual worth.",
  trueShootingPct: "PTS / (2 x (FGA + 0.44 x FTA)).",
  twoPointPct: "(FGM - 3PM) / (FGA - 3PA).",
  threePointPct: "3PM / 3PA. Null when 3PA is zero, which is the correct answer in a pre-three-point era rather than 0.000.",
  threePointAttemptRate: "3PA / FGA.",
  freeThrowRate: "FTA / FGA.",
  turnoverPct: "TOV / possessions.",
  offensiveReboundPct: "ORB / (own ORB + opponent DRB).",
  assistRate: "AST / FGM, the share of made field goals that were assisted.",
  usageShare: "A player's share of team (FGA + 0.44 x FTA + TOV).",
  scoreMargin: "Own points minus opponent points.",
  winPct: "Wins / games.",
});

// The classic box-score possession estimator. The engine COUNTS possessions, so
// this is only used to compare against historical sources that publish box-score
// totals and nothing else.
export const estimatedPossessions = (t) => t.fga - t.oreb + t.to + 0.44 * t.fta;

/** Every team metric for one side of one game. */
export const teamMetrics = (own, opp, { periods = 4, otFraction = 5 / 12 } = {}) => {
  const t = own.totals;
  const o = opp.totals;
  const poss = t.possessions || 0;
  const oppPoss = o.possessions || 0;
  // Overtime lengthens a game. Without this, an OT game reads as a faster team.
  const gameFraction = periods <= 4 ? 1 : 1 + (periods - 4) * otFraction;
  const twoA = t.fga - t.tpa;
  const ortg = safe(t.pts * 100, poss);
  const drtg = safe(o.pts * 100, oppPoss);
  return {
    possessions: poss,
    pace: r1(safe(poss, gameFraction)),
    offensiveRating: r1(ortg),
    defensiveRating: r1(drtg),
    netRating: r1(sub(ortg, drtg)),
    efgPct: r3(safe(t.fgm + 0.5 * t.tpm, t.fga)),
    trueShootingPct: r3(safe(t.pts, 2 * (t.fga + 0.44 * t.fta))),
    twoPointPct: r3(safe(t.fgm - t.tpm, twoA)),
    // Null, not zero: a pre-three-point era took no threes, and a 0.000 would
    // pollute every average it entered.
    threePointPct: t.tpa > 0 ? r3(safe(t.tpm, t.tpa)) : null,
    threePointAttemptRate: r3(safe(t.tpa, t.fga)),
    freeThrowRate: r3(safe(t.fta, t.fga)),
    turnoverPct: r3(safe(t.to, poss)),
    offensiveReboundPct: r3(safe(t.oreb, t.oreb + o.dreb)),
    assistRate: r3(safe(t.ast, t.fgm)),
    points: t.pts,
    rebounds: t.reb,
    assists: t.ast,
    turnovers: t.to,
    fieldGoalPct: r3(safe(t.fgm, t.fga)),
    fieldGoalAttempts: t.fga,
    threePointAttempts: t.tpa,
    freeThrowAttempts: t.fta,
    scoreMargin: t.pts - o.pts,
    estimatedPossessions: r1(estimatedPossessions(t)),
  };
};

/** Per-player usage and production shares. */
export const playerMetrics = (box) => {
  const t = box.totals;
  const teamUsage = t.fga + 0.44 * t.fta + t.to;
  return box.players.map((p) => ({
    cardId: p.cardId,
    name: p.name,
    usageShare: r3(safe(p.fga + 0.44 * p.fta + p.to, teamUsage)),
    scoringShare: r3(safe(p.pts, t.pts)),
    shotShare: r3(safe(p.fga, t.fga)),
    assistShare: r3(safe(p.ast, t.ast)),
    reboundShare: r3(safe(p.reb, t.reb)),
    turnoverShare: r3(safe(p.to, t.to)),
    threeShare: t.tpa > 0 ? r3(safe(p.tpa, t.tpa)) : null,
    pts: p.pts, fgm: p.fgm, fga: p.fga, tpm: p.tpm, tpa: p.tpa,
    ftm: p.ftm, fta: p.fta, reb: p.reb, oreb: p.oreb, dreb: p.dreb,
    ast: p.ast, stl: p.stl, blk: p.blk, to: p.to,
  }));
};

/** Action-family shares from possession ledgers, optionally for one side. */
export const styleMetrics = (games, side = null) => {
  const counts = {};
  let total = 0;
  let zoneResolved = 0;
  let mismatchAttacks = 0;
  for (const g of games) {
    for (const r of g.possessionLedger ?? []) {
      if (side && r.offense !== side) continue;
      const key = r.action ?? r.family ?? "UNKNOWN";
      counts[key] = (counts[key] ?? 0) + 1;
      total++;
      if (r.zoneGap || r.vsZone) zoneResolved++;
      if (r.targetedMismatch) mismatchAttacks++;
    }
  }
  return {
    counts,
    total,
    share: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, r3(safe(v, total))])),
    zoneShare: r3(safe(zoneResolved, total)),
    mismatchAttackShare: r3(safe(mismatchAttacks, total)),
  };
};

// ── Distributions ───────────────────────────────────────────────────────────
/**
 * Precision has to follow MAGNITUDE. Rounding to one decimal is right for a
 * pace of 104.7 and destroys an eFG% of 0.598, which would round to 0.6 and
 * make every shooting comparison meaningless — a whole percentage point of
 * eFG% is a large effect, and it was disappearing into the rounding.
 */
const auto = (x) => {
  if (x == null || !Number.isFinite(x)) return null;
  const m = Math.abs(x);
  if (m >= 10) return Math.round(x * 10) / 10;      // 104.7
  if (m >= 1) return Math.round(x * 100) / 100;     // 1.15
  return Math.round(x * 10000) / 10000;             // 0.5981
};

export const quantiles = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) {
    return { n: 0, mean: null, median: null, p05: null, p25: null, p75: null, p95: null, min: null, max: null, sd: null };
  }
  const at = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return {
    n: v.length,
    mean: auto(mean), median: auto(at(0.5)),
    p05: auto(at(0.05)), p25: auto(at(0.25)), p75: auto(at(0.75)), p95: auto(at(0.95)),
    min: auto(v[0]), max: auto(v[v.length - 1]), sd: auto(sd),
  };
};

// ── Error metrics ───────────────────────────────────────────────────────────
// MAPE is deliberately ABSENT. Several targets here can be zero or near zero —
// three-point attempts in a pre-three-point era, for one — and a percentage
// error against zero is undefined or explodes to a meaningless magnitude.
export const ERROR_METRIC_NOTES = Object.freeze({
  absoluteError: "|simulated mean - target|. The primary measure, interpretable in the metric's own units.",
  signedError: "simulated mean - target. Keeps the direction, so a systematic bias is visible rather than averaged away.",
  standardizedError: "(simulated - target) / simulated standard deviation. Answers whether a miss is large relative to the engine's own spread.",
  relativeError: "(simulated - target) / |target|, only when |target| is comfortably non-zero. Null otherwise, rather than a huge number.",
  mae: "Mean absolute error across fixtures.",
  rmse: "Root mean squared error, reported alongside MAE because it exposes a few large misses that MAE averages away.",
  withinBand: "Whether the target falls inside the simulated 5th-95th percentile band. A distribution check that assumes no particular distribution.",
  mapeExcluded: "MAPE is NOT used. Several targets can legitimately be zero (3PA in a pre-three-point era), where a percentage error is undefined or explodes.",
});

const NEAR_ZERO = 0.01;

export const fixtureError = ({ metric, target, simulated }) => {
  if (target == null) return { metric, target: null, available: false, reason: "TARGET_UNAVAILABLE" };
  const q = simulated;
  if (q?.mean == null) return { metric, target, available: false, reason: "NO_SIMULATED_VALUE" };
  return {
    metric,
    target,
    available: true,
    simulatedMean: q.mean,
    simulatedMedian: q.median,
    p05: q.p05, p25: q.p25, p75: q.p75, p95: q.p95, sd: q.sd,
    absoluteError: auto(Math.abs(q.mean - target)),
    signedError: auto(q.mean - target),
    standardizedError: q.sd > 0 ? r1((q.mean - target) / q.sd) : null,
    relativeError: Math.abs(target) > NEAR_ZERO ? r3((q.mean - target) / Math.abs(target)) : null,
    // A miss outside the engine's own spread is a different kind of problem
    // from a miss inside it, and the two deserve different priorities.
    withinBand: q.p05 != null && q.p95 != null ? target >= q.p05 && target <= q.p95 : null,
  };
};

export const aggregateErrors = (errors) => {
  const usable = errors.filter((e) => e.available);
  if (!usable.length) return { n: 0, unavailable: errors.length, mae: null, rmse: null, withinBandRate: null };
  const mae = usable.reduce((a, e) => a + e.absoluteError, 0) / usable.length;
  const rmse = Math.sqrt(usable.reduce((a, e) => a + e.absoluteError ** 2, 0) / usable.length);
  const banded = usable.filter((e) => e.withinBand != null);
  return {
    n: usable.length,
    unavailable: errors.length - usable.length,
    mae: auto(mae),
    rmse: auto(rmse),
    meanSignedError: auto(usable.reduce((a, e) => a + e.signedError, 0) / usable.length),
    withinBandRate: banded.length ? r3(banded.filter((e) => e.withinBand).length / banded.length) : null,
  };
};

/**
 * Confidence-weighted rollup. Component errors are RETAINED deliberately: a
 * single opaque "accuracy score" that hides which metric failed is worse than
 * no score at all, because one easily-matched metric can mask a real failure.
 */
export const CONFIDENCE_WEIGHTS = Object.freeze({ HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 });

export const confidenceRollup = (rows) => {
  const groups = {};
  for (const r of rows) {
    const k = r.confidence ?? "LOW";
    (groups[k] = groups[k] ?? []).push(r);
  }
  const byConfidence = {};
  for (const [k, v] of Object.entries(groups)) byConfidence[k] = aggregateErrors(v.flatMap((x) => x.errors ?? []));
  const acc = Object.entries(byConfidence).reduce(
    (a, [k, agg]) => {
      if (agg.mae == null) return a;
      const w = CONFIDENCE_WEIGHTS[k] ?? CONFIDENCE_WEIGHTS.LOW;
      return { sum: a.sum + agg.mae * w * agg.n, weight: a.weight + w * agg.n };
    },
    { sum: 0, weight: 0 },
  );
  return {
    byConfidence,
    weightedMae: acc.weight > 0 ? r3(acc.sum / acc.weight) : null,
    note: "Reported per confidence grade as well as weighted. Low confidence lowers a fixture's WEIGHT; it never excuses a poor result and it never increases simulation randomness.",
  };
};

// ── Probability calibration (framework only; nothing is tuned in 6C1) ───────
export const reliabilityBins = (predictions, binCount = 10) => {
  const bins = Array.from({ length: binCount }, (_, i) => ({
    lo: r3(i / binCount), hi: r3((i + 1) / binCount), n: 0, predictedSum: 0, wins: 0,
  }));
  for (const { predicted, won } of predictions) {
    if (!Number.isFinite(predicted)) continue;
    const b = bins[Math.min(binCount - 1, Math.max(0, Math.floor(predicted * binCount)))];
    b.n++;
    b.predictedSum += predicted;
    if (won) b.wins++;
  }
  return bins.map((b) => ({
    lo: b.lo, hi: b.hi, n: b.n,
    meanPredicted: r3(safe(b.predictedSum, b.n)),
    observed: r3(safe(b.wins, b.n)),
    gap: r3(sub(safe(b.wins, b.n), safe(b.predictedSum, b.n))),
  }));
};

export const brierScore = (predictions) => {
  const v = predictions.filter((p) => Number.isFinite(p.predicted));
  return v.length ? r3(v.reduce((a, p) => a + (p.predicted - (p.won ? 1 : 0)) ** 2, 0) / v.length) : null;
};

export const logLoss = (predictions, eps = 1e-6) => {
  const v = predictions.filter((p) => Number.isFinite(p.predicted));
  if (!v.length) return null;
  const clamp = (x) => Math.min(1 - eps, Math.max(eps, x));
  return r3(-v.reduce((a, p) => a + Math.log(p.won ? clamp(p.predicted) : 1 - clamp(p.predicted)), 0) / v.length);
};

/**
 * How far predictions spread from 0.5. Reported next to Brier because a model
 * that always predicts 50% is perfectly calibrated and completely useless.
 */
export const sharpness = (predictions) => {
  const v = predictions.filter((p) => Number.isFinite(p.predicted)).map((p) => p.predicted);
  return v.length ? r3(Math.sqrt(v.reduce((a, x) => a + (x - 0.5) ** 2, 0) / v.length)) : null;
};

export const upsetRate = (predictions) => {
  const v = predictions.filter((p) => Number.isFinite(p.predicted));
  const decided = v.filter((p) => Math.abs(p.predicted - 0.5) > 1e-9);
  if (!decided.length) return null;
  return r3(decided.filter((p) => (p.predicted > 0.5 ? !p.won : p.won)).length / decided.length);
};

/**
 * Expected-vs-realized separation. The pregame expectation and the simulated
 * outcome are different objects and are never allowed to be conflated: one is a
 * prediction, the other a result, and a calibration report that mixes them
 * cannot tell a bad model from a bad prediction of a good model.
 */
export const expectedVsRealized = (expected, realized) => ({
  expected,
  realized,
  divergence: r3(sub(realized, expected)),
  note: "Expected is the pregame prediction; realized is the simulated outcome. Kept separate so a prediction error is never read as an engine error.",
});
