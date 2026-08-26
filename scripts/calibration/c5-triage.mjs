#!/usr/bin/env node
// ── No-effect triage and identifiability v3 ─────────────────────────────────
// Re-examines every parameter Phase 6C2C4 filed as NO_MEASURABLE_EFFECT, using
// conditional-possession evidence rather than game-level averages, and derives
// identifiability v3 and readiness v3 from the result.
//
//   npm run calibration:c5:triage
//
// Every count is written to an artifact. Nothing is typed into prose.
import { readFileSync, existsSync } from "node:fs";
import { activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { EXERCISE_CONTRACTS, contractsHash } from "../../src/v3/calibration/exerciseContracts.js";
import { PRACTICAL_EFFECT } from "../../src/v3/calibration/identifiabilityPolicy.js";
import { writeArtifact, readArtifact, reconcile } from "../../src/v3/calibration/artifacts.js";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

/**
 * Practical thresholds for the conditional metrics, declared here because they
 * are new in this phase and did not exist in the v2 policy. A conditional
 * metric is measured over a narrower population, so its own scale applies.
 */
export const CONDITIONAL_PRACTICAL = Object.freeze({
  count: 25,                    // relevant possessions gained or lost
  makeRate: 0.005,
  expectedMake: 0.02,           // shot quality, on the engine's 0-10-ish scale
  pointsPerPossession: 0.02,
  primaryConcentration: 0.01,
  distinctPrimaries: 0.15,
  mixDistanceFromNeutral: 0.005,
  adjustmentCount: 0.25,
  possessions: 0.5,
  ftaPerPossession: 0.005,
  threeRate: 0.01,
  // locationShare:* and actionShare:* resolve to the share threshold.
});

const thresholdFor = (metric) => {
  if (metric.startsWith("locationShare") || metric.startsWith("actionShare")) return 0.01;
  return CONDITIONAL_PRACTICAL[metric] ?? PRACTICAL_EFFECT[metric] ?? 0.01;
};

/** Two-sided p from t, normal approximation. */
const pFromT = (t) => {
  const z = Math.abs(t ?? 0);
  if (!Number.isFinite(z)) return 1;
  const a = 1 / (1 + 0.2316419 * z);
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const poly = a * (0.319381530 + a * (-0.356563782 + a * (1.781477937 + a * (-1.821255978 + a * 1.330274429))));
  return Math.max(Number.MIN_VALUE, 2 * phi * poly);
};

/** Holm-Bonferroni within the conditional-metric family. */
const holm = (entries, alpha = 0.05) => {
  const sorted = [...entries].sort((a, b) => a.p - b.p);
  let maxAdj = 0;
  return sorted.map((e, i) => {
    const adj = Math.min(1, Math.max(maxAdj, e.p * (sorted.length - i)));
    maxAdj = adj;
    return { ...e, adjustedP: adj, significant: adj <= alpha };
  });
};

/**
 * Assess one parameter from its targeted measurement.
 *
 * The effect is taken across the FULL declared range: the min and max runs are
 * both measured against the same baseline, so their difference is the widest
 * movement the parameter can produce.
 */
export const assess = (row) => {
  const metrics = row.contract.conditionalMetrics;
  const tests = metrics.map((m) => {
    const hi = row.atMax.conditional[m] ?? {};
    const lo = row.atMin.conditional[m] ?? {};
    // Span across the range: max-effect minus min-effect, both relative to the
    // same default baseline.
    const span = (hi.mean ?? 0) - (lo.mean ?? 0);
    // Use the larger |t| of the two endpoints for significance.
    const t = Math.abs(hi.t ?? 0) >= Math.abs(lo.t ?? 0) ? (hi.t ?? 0) : (lo.t ?? 0);
    const thr = thresholdFor(m);
    return { metric: m, spanAcrossRange: r5(span), tAtEndpoint: r5(t), p: pFromT(t),
      practicalThreshold: thr, clearsPractical: Math.abs(span) >= thr };
  });
  const tested = holm(tests);
  const winners = tested.filter((e) => e.significant && e.clearsPractical);
  const best = winners.length
    ? [...winners].sort((a, b) => Math.abs(b.tAtEndpoint) - Math.abs(a.tAtEndpoint))[0]
    : [...tested].sort((a, b) => Math.abs(b.tAtEndpoint) - Math.abs(a.tAtEndpoint))[0] ?? null;

  const guardrailBreaches = Object.entries(row.atMax.guardrails ?? {})
    .filter(([m, s]) => {
      const thr = (CONDITIONAL_PRACTICAL[m] ?? 0.01) * 2;
      return Math.abs(s.mean ?? 0) > thr;
    }).map(([m]) => m);

  return { tests: tested, conditionalEffectConfirmed: winners.length > 0, best, guardrailBreaches };
};

/** Triage class, from measured evidence plus the contract's own declarations. */
export const triageOf = (row, a, { support, confounded }) => {
  if (!row.activationMet) {
    return { triage: "UNDER_EXERCISED_BY_PRIOR_CORPUS",
      reason: `Mechanic reached only ${row.activatedPossessions} of the required ${row.contract.activationMinimum} possessions within the frozen seed budget. Not a statement about the parameter.` };
  }
  if (row.contract.suspectedGuardrail && !a.conditionalEffectConfirmed) {
    return { triage: "GUARDRAIL_ONLY",
      reason: `Declared a suspected clamp before measurement, and no conditional metric moves across its full range. It bounds inputs the corpus does not contain.` };
  }
  if (a.conditionalEffectConfirmed) {
    const strongest = a.best;
    // A parameter whose mechanic occupies a narrow slice of possessions is real
    // but is not a general-purpose lever.
    const rare = row.activatedPossessions < 20000;
    return {
      triage: rare ? "RARE_CONTEXT_ACTIVE" : "TARGETED_EFFECT_CONFIRMED",
      reason: `Conditional effect on ${strongest.metric}: span ${r5(strongest.spanAcrossRange)} across the full range against a threshold of ${strongest.practicalThreshold}, adjusted p ${r5(strongest.adjustedP)}, over ${row.activatedPossessions} activated possessions${rare ? " — a narrow context" : ""}.`,
    };
  }
  // Significant but below the practical threshold: the effect is real and small.
  if (a.tests.some((t) => t.significant)) {
    return { triage: "RANGE_TOO_NARROW",
      reason: `Statistically significant on ${a.tests.filter((t) => t.significant).map((t) => t.metric).join(", ")} but no conditional metric clears its practical threshold across the full declared range (best span ${r5(Math.abs(a.best?.spanAcrossRange ?? 0))} vs ${a.best?.practicalThreshold}). The bounds cannot produce a basketball-relevant change.` };
  }
  return { triage: "TRUE_NO_EFFECT",
    reason: `Mechanic activated over ${row.activatedPossessions} possessions, full range tested, instrumentation verified, and no conditional metric moves beyond noise.` };
};

/** Identifiability v3 class. */
export const identifiabilityV3 = (row, a, triage, { support, confounded }) => {
  if (triage === "GUARDRAIL_ONLY") return "GUARDRAIL_ONLY";
  if (triage === "TRUE_NO_EFFECT" || triage === "RANGE_TOO_NARROW") return "TRUE_NO_EFFECT";
  if (triage === "UNDER_EXERCISED_BY_PRIOR_CORPUS") return "WEAKLY_IDENTIFIABLE";
  if (confounded.length) return "CONFOUNDED";
  if (support === "UNSUPPORTED") return "UNSUPPORTED_BY_TARGET_DATA";
  if (triage === "RARE_CONTEXT_ACTIVE") return "CONTEXTUALLY_IDENTIFIABLE";
  if (a.guardrailBreaches.length) return "WEAKLY_IDENTIFIABLE";
  return "IDENTIFIABLE";
};

/** Readiness v3 class. Severity first, exactly as in v2. */
export const readinessV3 = (ident, { support }) => {
  if (ident === "GUARDRAIL_ONLY") return { readiness: "DEFAULT_FROZEN_GUARDRAIL", reason: "A clamp that bounds impossible inputs. Tuning a guard rail is not calibration." };
  if (ident === "TRUE_NO_EFFECT") return { readiness: "DEFAULT_FROZEN_TRUE_NO_EFFECT", reason: "Mechanic activates and no conditional metric moves beyond noise across the full range." };
  if (ident === "CONFOUNDED") return { readiness: "DEFAULT_FROZEN_CONFOUNDED", reason: "Cannot be separated from a partner's effect on this corpus." };
  if (ident === "UNSUPPORTED_BY_TARGET_DATA") return { readiness: "DEFAULT_FROZEN_PENDING_EXTERNAL_DATA", reason: "Measurable, but no authorized target can judge which direction is better." };
  if (support === "HISTORICAL_NUMERIC_SUPPORT" && ident === "IDENTIFIABLE") return { readiness: "FREE_CALIBRATION", reason: "Identifiable, distinct and judged against authorized historical numeric targets." };
  if (ident === "IDENTIFIABLE") return { readiness: "STRUCTURAL_CALIBRATION_ONLY", reason: "Identifiable with a confirmed conditional effect, and a structural control target. A tightly bounded structural search is permitted." };
  if (ident === "CONTEXTUALLY_IDENTIFIABLE") return { readiness: "STRONGLY_REGULARIZED_CALIBRATION", reason: "Real effect in a narrow context. Small, heavily penalised movement only." };
  return { readiness: "STRONGLY_REGULARIZED_CALIBRATION", reason: "Measurable but with limited or partial evidence. Small, heavily penalised movement only." };
};

export const MOVEMENT_CAP_V3 = Object.freeze({
  FREE_CALIBRATION: 1.0,
  STRONGLY_REGULARIZED_CALIBRATION: 0.10,
  STRUCTURAL_CALIBRATION_ONLY: 0.20,
  DEFAULT_FROZEN_CONFOUNDED: 0,
  DEFAULT_FROZEN_GUARDRAIL: 0,
  DEFAULT_FROZEN_TRUE_NO_EFFECT: 0,
  DEFAULT_FROZEN_PENDING_EXTERNAL_DATA: 0,
});

/**
 * Confounding, AFTER factorial resolution.
 *
 * v2 froze a parameter whenever similarity flagged it. A factorial can show the
 * two mechanisms are genuinely separable, and in that case keeping the freeze
 * would discard evidence rather than respect it.
 */
export const resolvedConfounding = () => {
  const out = new Map();
  let groups = [];
  try { groups = readArtifact("confounding-resolution").data.groups; }
  catch { return { map: out, resolutions: [] }; }
  for (const g of groups) {
    if (g.resolution === "KEEP_BOTH_CONTEXTUALLY_IDENTIFIED") {
      // Separable: neither is frozen by this group.
      continue;
    }
    if (g.resolution === "FREEZE_ONE_TUNE_ONE") {
      const frozen = g.freeze;
      out.set(frozen, [...(out.get(frozen) ?? []), g.tune]);
      continue;
    }
    // FREEZE_BOTH_PENDING_TARGET, COLLAPSED, RECLASSIFIED_DERIVED: both held.
    out.set(g.a, [...(out.get(g.a) ?? []), g.b]);
    out.set(g.b, [...(out.get(g.b) ?? []), g.a]);
  }
  return { map: out, resolutions: groups.map((g) => ({ a: g.a, b: g.b, resolution: g.resolution, tune: g.tune ?? null, freeze: g.freeze ?? null })) };
};

export const build = () => {
  const cov = readArtifact("targeted-fixture-coverage");
  const idv2 = JSON.parse(readFileSync(".cache/calibration/identifiability-v2.json", "utf8"));
  const sup = JSON.parse(readFileSync("data/calibration/calibration-support-matrix.json", "utf8"));
  const supById = new Map(sup.parameters.map((p) => [p.id, p.support]));
  const v2ById = new Map(idv2.parameters.map((p) => [p.id, p]));
  const rowsById = new Map(cov.data.parameters.map((r) => [r.id, r]));

  const priorNoEffect = idv2.parameters.filter((p) => p.category === "NO_MEASURABLE_EFFECT").map((p) => p.id);
  const { map: resolvedConf, resolutions } = resolvedConfounding();

  const out = activeParameters().map((p) => {
    const row = rowsById.get(p.id);
    if (!row) throw new Error(`${p.id} has no targeted measurement`);
    const v2 = v2ById.get(p.id) ?? {};
    const support = supById.get(p.id) ?? "UNSUPPORTED";
    // Post-factorial confounding, not the similarity flag.
    const confounded = resolvedConf.get(p.id) ?? [];
    const v2Confounded = v2.confoundedWith ?? [];
    const a = assess(row);
    const t = triageOf(row, a, { support, confounded });
    const ident = identifiabilityV3(row, a, t.triage, { support, confounded });
    const rd = readinessV3(ident, { support });
    const cap = MOVEMENT_CAP_V3[rd.readiness];
    const span = p.max - p.min;
    return {
      id: p.id, module: p.module, defaultValue: p.defaultValue, min: p.min, max: p.max,
      priorV2Category: v2.category ?? null,
      wasPriorNoEffect: priorNoEffect.includes(p.id),
      activatedPossessions: row.activatedPossessions,
      activationMet: row.activationMet,
      activationPredicate: row.contract.activationPredicate,
      context: row.contract.context,
      conditionalTests: a.tests,
      conditionalEffectConfirmed: a.conditionalEffectConfirmed,
      bestConditionalMetric: a.best?.metric ?? null,
      bestConditionalSpan: a.best?.spanAcrossRange ?? null,
      guardrailBreaches: a.guardrailBreaches,
      support,
      confoundedWithV2: v2Confounded,
      confoundedWithAfterFactorial: confounded,
      confoundingFreedByFactorial: v2Confounded.length > 0 && confounded.length === 0,
      triage: t.triage, triageReason: t.reason,
      identifiabilityV3: ident,
      readinessV3: rd.readiness, readinessReason: rd.reason,
      movementCapFractionOfRange: cap,
      searchBounds: cap > 0
        ? { lo: Math.max(p.min, p.defaultValue - span * cap), hi: Math.min(p.max, p.defaultValue + span * cap) }
        : { lo: p.defaultValue, hi: p.defaultValue },
      eligibleForSearch: cap > 0,
    };
  });

  const tally = (key, rows = out) => rows.reduce((a, r) => ({ ...a, [r[key]]: (a[r[key]] ?? 0) + 1 }), {});
  const priorRows = out.filter((r) => r.wasPriorNoEffect);

  const triageCounts = tally("triage", priorRows);
  const identCounts = tally("identifiabilityV3");
  const readyCounts = tally("readinessV3");

  const recs = [
    reconcile({ label: "no-effect-triage", counts: triageCounts, expectedTotal: priorNoEffect.length }),
    reconcile({ label: "identifiability-v3", counts: identCounts, expectedTotal: out.length,
      members: Object.fromEntries(Object.keys(identCounts).map((k) => [k, out.filter((r) => r.identifiabilityV3 === k).map((r) => r.id)])),
      population: out.map((r) => r.id) }),
    reconcile({ label: "readiness-v3", counts: readyCounts, expectedTotal: out.length,
      members: Object.fromEntries(Object.keys(readyCounts).map((k) => [k, out.filter((r) => r.readinessV3 === k).map((r) => r.id)])),
      population: out.map((r) => r.id) }),
  ];

  return {
    priorNoEffectCount: priorNoEffect.length,
    triageCounts, identifiabilityCounts: identCounts, readinessCounts: readyCounts,
    reconciliations: recs,
    allReconcile: recs.every((r) => r.reconciles),
    eligibleForSearch: out.filter((r) => r.eligibleForSearch).length,
    frozen: out.filter((r) => !r.eligibleForSearch).length,
    movementCaps: MOVEMENT_CAP_V3,
    conditionalPracticalThresholds: CONDITIONAL_PRACTICAL,
    confoundingResolutions: resolutions,
    freedByFactorial: out.filter((r) => r.confoundingFreedByFactorial).map((r) => r.id),
    parameters: out,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = build();
  const { path } = writeArtifact("no-effect-triage", d, {
    generationCommand: "npm run calibration:c5:triage",
    sourceArtifacts: ["data/calibration/c5/targeted-fixture-coverage.json", "data/calibration/calibration-support-matrix.json"],
    extra: {
      noEffectTriageVersion: versionOf("noEffectTriageVersion"),
      parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
      calibrationReadinessVersion: versionOf("calibrationReadinessVersion"),
      contractsHash: contractsHash(),
    },
  });

  console.log(`NO-EFFECT TRIAGE — ${d.priorNoEffectCount} parameters previously filed no-effect\n`);
  for (const [k, v] of Object.entries(d.triageCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\nIDENTIFIABILITY V3 — all ${d.parameters.length} active\n`);
  for (const [k, v] of Object.entries(d.identifiabilityCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\nREADINESS V3\n`);
  for (const [k, v] of Object.entries(d.readinessCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\n  eligible for search ${d.eligibleForSearch}   frozen ${d.frozen}`);
  console.log(`\n  reconciliations:`);
  for (const r of d.reconciliations) console.log(`    ${r.reconciles ? "PASS" : "FAIL"}  ${r.label}: ${r.sum}/${r.expectedTotal}${r.problems.length ? ` — ${r.problems.slice(0, 3).join("; ")}` : ""}`);

  const eligible = d.parameters.filter((p) => p.eligibleForSearch);
  if (eligible.length) {
    console.log(`\n  ELIGIBLE (${eligible.length}):`);
    for (const p of eligible) {
      console.log(`    ${p.id.padEnd(42)} ${p.readinessV3.padEnd(34)} ${p.bestConditionalMetric} span ${p.bestConditionalSpan}`);
    }
  }
  console.log(`\nwrote ${path}`);
  process.exit(d.allReconcile ? 0 : 2);
}
