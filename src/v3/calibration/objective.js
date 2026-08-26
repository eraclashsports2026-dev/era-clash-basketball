// ── Calibration objective and acceptance policy ─────────────────────────────
// A transparent objective that RETAINS every component.
//
// The thing this refuses to be is a single accuracy number. One score lets an
// easily-matched metric hide a severe failure, and nobody can tell afterwards
// which of the two moved. Every component is reported, always.
import { versionOf } from "../../versions.js";
import { PARAMETERS, parameterSetHash } from "./parameters.js";

export const CALIBRATION_OBJECTIVE_VERSION = versionOf("calibrationObjectiveVersion");

/**
 * Component weights. Weighted by how much each component tells us about
 * historical plausibility, and by how well-sourced its targets are.
 *
 * Shot profile outweighs team efficiency deliberately: Phase 6C2A showed that
 * efficiency is downstream of the shot mix, so fitting efficiency first would
 * be fitting a symptom.
 */
export const COMPONENT_WEIGHTS = Object.freeze({
  teamEfficiency: 1.0,
  shotProfile: 1.3,
  possessionEvents: 0.8,
  playerDistribution: 1.2,
  styleIdentity: 0.6,
  probability: 0.9,
});

/** Confidence in a target scales how much its error counts — never whether it counts. */
export const CONFIDENCE_WEIGHTS = Object.freeze({
  HIGH: 1.0, MEDIUM_HIGH: 0.8, MEDIUM: 0.6, LOW: 0.3, SOURCE_BLOCKED: 0,
});

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

/**
 * Regularisation: distance from the prior, scaled by how strongly the parameter
 * resists movement. A parameter that drifts far from its default has to buy
 * that distance with a real error reduction.
 */
export const REGULARIZATION_STRENGTH = Object.freeze({ HIGH: 0.30, MEDIUM: 0.12, LOW: 0.04, NONE: 0 });

export const regularizationPenalty = (params = PARAMETERS) => {
  let penalty = 0;
  const terms = [];
  for (const p of params) {
    const span = p.max - p.min;
    if (!(span > 0)) continue;
    const drift = Math.abs(p.currentValue - p.prior) / span;
    const k = REGULARIZATION_STRENGTH[p.regularizationStrength] ?? REGULARIZATION_STRENGTH.MEDIUM;
    const t = k * drift * drift;
    if (t > 0) terms.push({ id: p.id, drift: r4(drift), penalty: r4(t) });
    penalty += t;
  }
  return { penalty: r4(penalty), terms: terms.sort((a, b) => b.penalty - a.penalty) };
};

/**
 * One component's error. Confidence-weighted, and it reports what it could NOT
 * measure alongside what it could — an empty component must never read as a
 * perfect one.
 */
export const componentError = (name, rows) => {
  const usable = rows.filter((r) => r.available && (CONFIDENCE_WEIGHTS[r.confidence] ?? 0) > 0);
  if (!usable.length) {
    return { component: name, n: 0, unavailable: rows.length, weightedError: null,
      note: "No usable target. This component contributes NOTHING to the objective — it is not a zero error." };
  }
  let num = 0;
  let den = 0;
  for (const r of usable) {
    const w = CONFIDENCE_WEIGHTS[r.confidence] ?? 0;
    // Standardised where a spread exists, absolute otherwise: a miss must be
    // comparable across metrics with different units.
    const e = r.standardizedError != null ? Math.abs(r.standardizedError) : Math.abs(r.relativeError ?? r.absoluteError ?? 0);
    num += w * e;
    den += w;
  }
  return {
    component: name,
    n: usable.length,
    unavailable: rows.length - usable.length,
    weightedError: r4(num / den),
    worst: usable.slice().sort((a, b) => Math.abs(b.standardizedError ?? 0) - Math.abs(a.standardizedError ?? 0)).slice(0, 3)
      .map((r) => ({ metric: r.metric, fixtureId: r.fixtureId, standardizedError: r.standardizedError })),
  };
};

/**
 * The full objective. Components are RETAINED, and the scalar is a convenience
 * for search — never a summary anyone is asked to trust on its own.
 */
export const objective = ({ components, params = PARAMETERS }) => {
  const results = Object.entries(components).map(([name, rows]) => componentError(name, rows));
  const reg = regularizationPenalty(params);
  let total = 0;
  let weight = 0;
  const missing = [];
  for (const c of results) {
    const w = COMPONENT_WEIGHTS[c.component] ?? 1;
    if (c.weightedError == null) { missing.push(c.component); continue; }
    total += w * c.weightedError;
    weight += w;
  }
  return {
    calibrationObjectiveVersion: CALIBRATION_OBJECTIVE_VERSION,
    parameterSetHash: parameterSetHash(params),
    components: results,
    // Null rather than zero when nothing could be measured. A zero objective
    // from an empty corpus is the most dangerous number this file could emit.
    scalar: weight > 0 ? r4(total / weight + reg.penalty) : null,
    fitError: weight > 0 ? r4(total / weight) : null,
    regularization: reg,
    componentsWithoutTargets: missing,
    coverage: r4(weight / Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0)),
    note: "Components are retained deliberately. A single scalar cannot say which metric failed, and one easily-matched metric would hide a severe failure.",
  };
};

// ── Acceptance policy ───────────────────────────────────────────────────────
// Frozen BEFORE tuning. Moving a threshold after seeing a result is how a
// failed calibration becomes a passed one, so a change here requires a new
// objective version and says so.
export const ACCEPTANCE = Object.freeze({
  requireCalibrationImprovement: true,
  // Internal validation may worsen slightly — noise exists — but not much, and
  // never while the tuning folds improve a lot. That pattern is overfitting.
  internalValidationTolerance: 0.02,
  maxCriticalMetricRegression: 0.05,
  requireZeroInvariantFailures: true,
  requireSyntheticGuardrailsPass: true,
  forbidOutOfBoundsParameters: true,
  // A parameter that leaps most of its range in one step is fitting noise.
  maxSingleStepDriftFraction: 0.35,
  forbidHoldoutInformedChanges: true,
});

export const evaluateAcceptance = ({ before, after, validationBefore, validationAfter, invariantFailures = 0, guardrailFailures = [], outOfBoundsParams = [], parameterDrift = [] }) => {
  const reasons = [];
  if (before?.fitError == null || after?.fitError == null) {
    reasons.push("cannot evaluate acceptance: the objective has no measurable component");
  } else if (!(after.fitError < before.fitError)) {
    reasons.push(`calibration error did not improve (${before.fitError} -> ${after.fitError})`);
  }
  if (validationBefore?.fitError != null && validationAfter?.fitError != null) {
    const worsened = validationAfter.fitError - validationBefore.fitError;
    if (worsened > ACCEPTANCE.internalValidationTolerance) {
      reasons.push(`internal validation worsened by ${r4(worsened)}, above the ${ACCEPTANCE.internalValidationTolerance} tolerance — this is the signature of overfitting`);
    }
  }
  if (ACCEPTANCE.requireZeroInvariantFailures && invariantFailures > 0) reasons.push(`${invariantFailures} statistical invariant failure(s)`);
  if (ACCEPTANCE.requireSyntheticGuardrailsPass && guardrailFailures.length) reasons.push(`synthetic guardrails failed: ${guardrailFailures.join(", ")}`);
  if (ACCEPTANCE.forbidOutOfBoundsParameters && outOfBoundsParams.length) reasons.push(`parameters out of bounds: ${outOfBoundsParams.map((p) => p.id).join(", ")}`);
  for (const d of parameterDrift) {
    if (d.fraction > ACCEPTANCE.maxSingleStepDriftFraction) {
      reasons.push(`${d.id} moved ${(d.fraction * 100).toFixed(0)}% of its range in one step — a leap that large is fitting noise`);
    }
  }
  return { accepted: reasons.length === 0, reasons };
};
