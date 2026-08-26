// ── Probability side-bias policy v2 ─────────────────────────────────────────
// Frozen BEFORE any fresh result is generated. Its hash is asserted by a test.
//
// v1 compared a per-cell POINT ESTIMATE against a fixed 0.05 with no
// multiplicity control across 30 cells, using a standard error that assumed
// independence for a paired design. It failed on one cell of 30 and could not
// say whether that cell was biased or unlucky, because it never expressed
// uncertainty about the quantity it was gating.
//
// v2 changes only the METHOD. The 0.05 practical margin is preserved.
//
// ── A DISCLOSED SCALE CORRECTION ────────────────────────────────────────────
// v1's statistic was `goldWinsOverall / n - 0.5`. For the balanced paired design
// the estimator actually runs, that quantity is algebraically
//
//     (firstAsGoldWinRate - firstAsBlueWinRate) / 2
//
// which is exactly HALF the paired orientation effect. Verified both
// symbolically and numerically on the failing cell: reported -0.0781, paired
// effect -0.1562.
//
// v2 tests the paired effect itself, because that is the quantity with a product
// meaning: "team A wins this much more often when it is labelled Gold". Keeping
// the 0.05 margin on the corrected scale makes the gate TWICE AS STRICT as v1 in
// effect (v1's |delta/2| <= 0.05 permitted |delta| <= 0.10). That is a
// tightening, never a loosening, and it is disclosed here rather than absorbed
// silently into a methodology change.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const SIDE_BIAS_POLICY_VERSION = versionOf("probabilitySideBiasPolicyVersion");
export const SIDE_BIAS_SEED_SET_VERSION = versionOf("probabilitySideBiasSeedSetVersion");

export const EFFECT = Object.freeze({
  name: "paired orientation effect",
  symbol: "delta",
  perPairObservation: "D = Y_gold - Y_blue, where Y_gold = 1 when the PERSPECTIVE team wins with the Gold label and Y_blue = 1 when the same team wins with the Blue label, both on the SAME seed",
  support: [-1, 0, 1],
  estimator: "delta = mean(D) over paired seeds",
  mirrorEquivalent: "For an exact mirror matchup the two teams are identical, so delta reduces to 2 * (Gold win rate - 0.5).",
  positiveMeaning: "The perspective team performs BETTER when labelled Gold.",
  negativeMeaning: "The perspective team performs BETTER when labelled Blue.",
  perspectiveRule: "Every reported delta names its perspective team explicitly. A bare 'Gold advantage' is not reportable: without a perspective it cannot be signed.",
  supersedesV1Statistic: "goldWinsOverall / n - 0.5, which equals delta / 2 for this design",
});

export const MARGINS = Object.freeze({
  perCell: 0.05,
  aggregate: 0.01,
  perCellNote: "Preserved from v1 in magnitude. Applied to the corrected paired scale, which makes it strictly stricter than v1.",
  aggregateNote: "A systematic effect across the whole family must be an order of magnitude smaller than a tolerable local anomaly, because it would apply to every match rather than one.",
  notDerivedFromObservation: "Neither margin was chosen after seeing 0.0781. The per-cell margin is v1's. The aggregate margin is the tighter of v1's implied aggregate tolerance and the actual-game side-symmetry suite's own aggregate tolerance.",
});

export const ALPHA = 0.05;

export const FAMILY_WISE = Object.freeze({
  method: "holm-bonferroni",
  alpha: ALPHA,
  appliedTo: "BOTH directions, separately and for different reasons",
  equivalenceDirection: "Holm-adjusted TOST. Claiming 'this cell is equivalent' at an adjusted alpha is CONSERVATIVE: a smaller alpha demands a tighter interval, so correction makes equivalence harder to establish, never easier.",
  detectionDirection: "Holm-adjusted two-sided paired test. This is the direction v1 got wrong: it took the MAXIMUM of 30 point estimates and compared it against an unadjusted fixed threshold, which is the same error as a max|t| rule that cannot see how many comparisons happened.",
  bothRequired: "A cell passes only if it is positively established as EQUIVALENT. Failing to detect a difference is not equivalence — that is INCONCLUSIVE, and it does not pass.",
});

export const CONFIDENCE = Object.freeze({
  primary: "paired large-sample (Wald) interval on mean(D), SE = sd(D) / sqrt(pairs)",
  secondary: "paired percentile bootstrap, 10,000 resamples, resampling PAIRS not games",
  agreementRequired: true,
  agreementNote: "The two intervals must agree on the classification. D has three-point discrete support, so a normal approximation is an approximation; a bootstrap that disagrees with it is a signal to trust neither.",
  whyNotTwoIndependentProportions: "The two orientations share a seed. Treating them as independent proportions discards the pairing and uses the wrong variance. Measured on the v1 failing cell, 40.6% of pairs were discordant, giving sd(D) = 0.620 against the 0.707 that independence implies — so the paired design is genuinely more precise, and the independent formula is not merely wrong but wrong in the direction that hides real effects.",
});

export const SAMPLE_LADDER = Object.freeze({
  stages: Object.freeze([
    Object.freeze({ stage: 1, cumulativePairs: 256 }),
    Object.freeze({ stage: 2, cumulativePairs: 1024 }),
    Object.freeze({ stage: 3, cumulativePairs: 4096 }),
    Object.freeze({ stage: 4, cumulativePairs: 16384 }),
  ]),
  cumulative: true,
  cumulativeNote: "Each stage EXTENDS the previous seed block. Earlier observations are never discarded, so a stage boundary cannot be used to drop an unfavourable sample.",
  maximumPairs: 16384,
  maximumJustification: "Measured throughput is 537 games/sec single-threaded. Stage 4 is 32,768 games per cell, about 61s, and the full 30-cell family reaches at most about 41 minutes single-threaded or roughly 5 minutes across 8 workers. The maximum is set by what resolves the question, not by what is convenient.",
  perCellGamesAtMax: 32768,
});

export const STOPPING = Object.freeze({
  equivalenceEstablished: "The adjusted interval lies entirely inside [-perCell, +perCell]. Stop: EQUIVALENT.",
  materialBiasEstablished: "The adjusted interval lies entirely outside [-perCell, +perCell] on one side. Stop: MATERIALLY_BIASED.",
  maximumReached: "At the maximum sample a cell is EQUIVALENT, MATERIALLY_BIASED, or INCONCLUSIVE.",
  inconclusiveDoesNotPass: true,
  forbidden: Object.freeze([
    "Stopping a cell because its point estimate looks favourable.",
    "Adding samples only to cells whose direction is unfavourable.",
    "Discarding an earlier stage.",
    "Raising a margin after seeing an interval.",
    "Choosing the stage at which to report.",
  ]),
  uniformEscalation: "Every unresolved cell escalates together. The decision to escalate depends only on classification, never on sign or magnitude.",
});

export const AGGREGATE_GATE = Object.freeze({
  statistic: "mean of per-cell delta across the family, and the pooled paired mean across all pairs",
  margin: 0.01,
  requires: Object.freeze([
    "The aggregate adjusted interval lies inside the aggregate margin.",
    "No stratum shows a systematic same-direction effect: by era, by coach family, by defensive shell, by competition mode, by strength band.",
  ]),
  stratifiedNote: "Per-cell pairing can hide a systematic engine effect if every cell leans the same way by a little. The strata exist to make that visible.",
});

export const FAILURE_SEMANTICS = Object.freeze({
  EQUIVALENT: "Positively established as practically equivalent to zero. Passes.",
  MATERIALLY_BIASED: "Positively established as beyond the practical margin. Does NOT pass; requires root-cause diagnosis.",
  INCONCLUSIVE: "Neither established at the maximum sample. Does NOT pass. The margin must not be widened to convert this into a pass.",
});

export const CLASSIFICATIONS = Object.freeze(["EQUIVALENT", "MATERIALLY_BIASED", "INCONCLUSIVE"]);

export const AUDIT_CLASSES = Object.freeze([
  "SAMPLING_NOISE", "HARNESS_PERSPECTIVE_DEFECT", "CACHE_COMPLEMENT_DEFECT",
  "SEED_DOMAIN_DEFECT", "SIDE_REVERSAL_STATE_DEFECT", "LOCAL_ACTUAL_GAME_SIDE_BIAS",
  "SYSTEMATIC_ACTUAL_GAME_SIDE_BIAS", "INCONCLUSIVE",
]);

export const BLOCKS_LOCK = Object.freeze(["INCONCLUSIVE", "LOCAL_ACTUAL_GAME_SIDE_BIAS", "SYSTEMATIC_ACTUAL_GAME_SIDE_BIAS"]);

export const POLICY = Object.freeze({
  version: SIDE_BIAS_POLICY_VERSION,
  seedSetVersion: SIDE_BIAS_SEED_SET_VERSION,
  seedDomain: "side-bias-v2",
  phase: "6C2C6",
  frozenBeforeResults: true,
  supersedes: Object.freeze({
    version: "1.0.0",
    rule: "absolute per-cell point estimate <= 0.05, no multiplicity control, SE from the wrong sample and the wrong design",
    preservedUnedited: true,
    v1Observation: 0.0781,
    v1Threshold: 0.05,
    marginNotMovedInResponse: true,
  }),
  EFFECT, MARGINS, ALPHA, FAMILY_WISE, CONFIDENCE, SAMPLE_LADDER, STOPPING,
  AGGREGATE_GATE, FAILURE_SEMANTICS, CLASSIFICATIONS, AUDIT_CLASSES, BLOCKS_LOCK,
});

export const policyHash = () => createHash("sha256").update(JSON.stringify(POLICY)).digest("hex");

// ── Statistics ──────────────────────────────────────────────────────────────

/** Paired mean, sd and SE over D in {-1,0,1}. */
export const pairedSummary = (D) => {
  const n = D.length;
  if (n < 2) return { n, mean: null, sd: null, se: null };
  const mean = D.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(D.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, se: sd / Math.sqrt(n), discordant: D.filter((d) => d !== 0).length };
};

/** Inverse standard normal CDF (Acklam), for two-sided z at a given alpha. */
export const zFor = (twoSidedAlpha) => {
  const p = 1 - twoSidedAlpha / 2;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let q; let r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
};

/**
 * Two one-sided tests for equivalence within +/- margin.
 *
 * TOST's null hypothesis is NON-equivalence, so rejecting it CLAIMS
 * equivalence. Its p-value is the larger of the two one-sided p-values.
 */
export const tost = ({ mean, se, margin }) => {
  if (se == null || !(se > 0)) return { pLower: 1, pUpper: 1, p: 1 };
  const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const tUpper = (mean - margin) / se;   // H0: delta >= margin
  const tLower = (mean + margin) / se;   // H0: delta <= -margin
  const pUpper = normalCdf(tUpper);
  const pLower = 1 - normalCdf(tLower);
  return { pLower, pUpper, p: Math.max(pLower, pUpper) };
};

/** Abramowitz & Stegun 7.1.26 error function. Max absolute error 1.5e-7. */
export const erf = (x) => {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
};

export const twoSidedZTest = ({ mean, se }) => {
  if (se == null || !(se > 0)) return { z: null, p: 1 };
  const z = mean / se;
  return { z, p: 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))) };
};

/** Wald interval at a given two-sided alpha. */
export const waldInterval = ({ mean, se, alpha }) => {
  const z = zFor(alpha);
  return { lower: mean - z * se, upper: mean + z * se, z, alpha };
};

/**
 * Paired percentile bootstrap, resampling PAIRS.
 *
 * Deterministic: the generator is seeded from the data so a re-run of the same
 * measurement produces the same interval.
 */
export const bootstrapInterval = ({ D, alpha, resamples = 10000, seed = 0x6c2c6b }) => {
  const n = D.length;
  if (n < 2) return { lower: null, upper: null };
  let state = (seed ^ n) >>> 0;
  const rand = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  const means = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += D[Math.floor(rand() * n)];
    means[r] = sum / n;
  }
  means.sort();
  const lo = Math.floor((alpha / 2) * resamples);
  const hi = Math.min(resamples - 1, Math.ceil((1 - alpha / 2) * resamples) - 1);
  return { lower: means[lo], upper: means[hi], resamples };
};

/** Holm-Bonferroni step-down. Returns adjusted p-values and rejections. */
export const holm = (pvals, alpha) => {
  const m = pvals.length;
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array(m).fill(1);
  let running = 0;
  for (const [rank, o] of order.entries()) {
    running = Math.min(1, Math.max(running, (m - rank) * o.p));
    adjusted[o.i] = running;
  }
  const reject = adjusted.map((a) => a <= alpha);
  let failed = false;
  for (const o of order) { if (failed) reject[o.i] = false; else if (!reject[o.i]) failed = true; }
  return { adjusted, reject };
};

/**
 * Classify one cell under the frozen policy.
 *
 * `alphaEquivalence` and `alphaDetection` are the Holm-ADJUSTED alphas for this
 * cell's rank in the family, so the interval width already carries the
 * multiplicity correction.
 */
export const classifyCell = ({ D, margin, alphaEquivalence, alphaDetection }) => {
  const s = pairedSummary(D);
  const eq = tost({ mean: s.mean, se: s.se, margin });
  const det = twoSidedZTest({ mean: s.mean, se: s.se });
  const wald = waldInterval({ mean: s.mean, se: s.se, alpha: alphaEquivalence });
  const boot = bootstrapInterval({ D, alpha: alphaEquivalence });

  const insideWald = wald.lower > -margin && wald.upper < margin;
  const insideBoot = boot.lower > -margin && boot.upper < margin;
  const outsideWald = wald.lower >= margin || wald.upper <= -margin;
  const outsideBoot = boot.lower >= margin || boot.upper <= -margin;

  let classification = "INCONCLUSIVE";
  if (insideWald && insideBoot) classification = "EQUIVALENT";
  else if (outsideWald && outsideBoot) classification = "MATERIALLY_BIASED";

  return {
    ...s, margin,
    tostP: eq.p, detectionZ: det.z, detectionP: det.p,
    alphaEquivalence, alphaDetection,
    waldInterval: { lower: wald.lower, upper: wald.upper },
    bootstrapInterval: { lower: boot.lower, upper: boot.upper },
    intervalsAgree: insideWald === insideBoot && outsideWald === outsideBoot,
    classification,
  };
};
