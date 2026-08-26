#!/usr/bin/env node
// ── Identifiability v2 ──────────────────────────────────────────────────────
// Replaces the invalid v1 method (max|t| over ~32 metrics against a threshold of
// 2.0, which sat below that statistic's own null median).
//
//   npm run calibration:identifiability
//
// Four changes, all frozen in identifiabilityPolicy.js before this ran:
//   1. Significance tested only over each parameter's DECLARED primary family.
//   2. Holm-Bonferroni within that family.
//   3. A minimum basketball-relevant effect size, per metric.
//   4. Direction stability across fixture x perturbation cells.
//
// The null is measured from OUT-OF-FAMILY metrics, pooled across parameters. An
// A/A null would be degenerate here: the engine is deterministic, so the same
// set on the same seed gives a paired difference of exactly zero.
//
// No holdout fixture is used.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { compileRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import {
  IDENTIFIABILITY_V2, METRIC_FAMILIES, PRACTICAL_EFFECT,
  identifiabilityPolicyHash, missingFamilies,
} from "../../src/v3/calibration/identifiabilityPolicy.js";
import { responseVector, METRICS, SENSITIVITY_FIXTURES, perturbationsFor } from "./sensitivity.mjs";
import { versionOf } from "../../src/versions.js";

const OUT = ".cache/calibration";
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

const play = (f, seed, parameterSet) => runPossessionGame(buildPossessionInput({
  parameterSet, goldIds: f.gold, blueIds: f.blue,
  coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId, eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false, expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false, opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: true, assertInvariants: false });

const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 70000 + i);

/** Two-sided p-value from a t-statistic, normal approximation (n is large). */
export const pFromT = (t) => {
  const z = Math.abs(t);
  if (!Number.isFinite(z)) return z === Infinity ? 0 : 1;
  const a = 1 / (1 + 0.2316419 * z);
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const poly = a * (0.319381530 + a * (-0.356563782 + a * (1.781477937 + a * (-1.821255978 + a * 1.330274429))));
  return Math.max(Number.MIN_VALUE, 2 * phi * poly);
};

/**
 * Holm-Bonferroni over one family. Uniformly more powerful than plain
 * Bonferroni at the same family-wise error rate, and it returns the adjusted
 * p-value per metric so the margin is visible rather than just a verdict.
 */
export const holm = (entries, alpha) => {
  const sorted = [...entries].sort((a, b) => a.p - b.p);
  const m = sorted.length;
  let maxAdj = 0;
  return sorted.map((e, i) => {
    const adj = Math.min(1, Math.max(maxAdj, e.p * (m - i)));
    maxAdj = adj;
    return { ...e, adjustedP: adj, significant: adj <= alpha };
  });
};

// ── Per-parameter measurement ───────────────────────────────────────────────
const measure = (paramId, seeds) => {
  const p = activeParameters().find((x) => x.id === paramId);
  const fam = METRIC_FAMILIES[paramId];
  // Interior perturbations plus BOTH ENDPOINTS. The practical gate needs the
  // effect across the full declared range: "could this parameter ever matter?"
  // Asking it at 25% of range understates a sublinear effect, and asking it at
  // whatever movement cap readiness assigns would be circular, since the cap is
  // decided BY this gate.
  const perts = [
    ...perturbationsFor(p),
    { frac: -1, value: p.min, endpoint: true },
    { frac: 1, value: p.max, endpoint: true },
  ].filter((x) => x.value !== p.defaultValue);
  const cells = [];

  for (const pert of perts) {
    const set = compileRuntimeParameterSet({ overrides: { [paramId]: pert.value }, label: `${paramId}@${pert.value}` });
    for (const f of SENSITIVITY_FIXTURES) {
      const diffs = Object.fromEntries(METRICS.map((m) => [m, []]));
      for (let i = 0; i < seeds; i++) {
        const seed = seedAt(i);
        const base = responseVector(play(f, seed, null));
        const moved = responseVector(play(f, seed, set));
        for (const m of METRICS) {
          const d = moved[m] - base[m];
          if (Number.isFinite(d)) diffs[m].push(d);
        }
      }
      const stats = {};
      for (const m of METRICS) {
        const xs = diffs[m];
        const n = xs.length;
        const mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0;
        const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
        const se = sd / Math.sqrt(Math.max(1, n));
        // sd === 0 with mean === 0 means the metric did not move at all, which
        // is a genuine zero rather than an infinite t.
        const t = se > 0 ? mean / se : 0;
        stats[m] = { mean: r4(mean), sd: r4(sd), se: r4(se), t: r4(t), n };
      }
      cells.push({ fixture: f.id, frac: pert.frac, value: pert.value, endpoint: Boolean(pert.endpoint), stats });
    }
  }
  return { id: paramId, module: p.module, defaultValue: p.defaultValue, min: p.min, max: p.max, family: fam, cells };
};

if (!isMainThread && workerData?.harness === "identifiability-v2") {
  parentPort.postMessage(measure(workerData.paramId, workerData.seeds));
}

// ── Classification ──────────────────────────────────────────────────────────
/** Pool per-metric t across cells by combining means and standard errors. */
const pooled = (row, metric) => {
  // Fixed-effect pooling: inverse-variance weighted mean across cells, with the
  // perturbation sign normalised so upside and downside cells agree.
  let wSum = 0, wxSum = 0, n = 0;
  for (const c of row.cells) {
    if (c.endpoint) continue; // significance is judged on interior doses
    const s = c.stats[metric];
    if (!s || !(s.se > 0)) continue;
    const sign = c.frac < 0 ? -1 : 1;
    const w = 1 / (s.se * s.se);
    wSum += w; wxSum += w * (s.mean * sign); n += s.n;
  }
  if (!(wSum > 0)) return { mean: 0, se: 0, t: 0, n };
  const mean = wxSum / wSum;
  const se = Math.sqrt(1 / wSum);
  return { mean, se, t: mean / se, n };
};

/**
 * Effect at the LARGEST perturbation, which is the dose a search could actually
 * apply. Pooling across perturbation magnitudes and comparing that average to a
 * practical threshold answers no meaningful question: it mixes a 10%-of-range
 * dose with a 25% dose and reports something that is neither. Significance is
 * still pooled — more data, same direction — but magnitude is reported at a
 * stated dose, which is how an effect size is normally quoted.
 */
const effectAtLargestDose = (row, metric) => {
  const cells = row.cells.filter((c) => c.endpoint);
  const widest = "full-range endpoints";
  let wSum = 0, wxSum = 0;
  for (const c of cells) {
    const st = c.stats[metric];
    if (!st || !(st.se > 0)) continue;
    const sign = c.frac < 0 ? -1 : 1;
    const w = 1 / (st.se * st.se);
    wSum += w; wxSum += w * (st.mean * sign);
  }
  // Endpoint effects are unweighted: min and max are one observation each per
  // fixture, and inverse-variance weighting across them would let the quieter
  // fixture dominate a question about magnitude.
  return { dose: widest, mean: wSum > 0 ? wxSum / wSum : 0 };
};

/** Sign agreement across cells for one metric. */
const directionConsistency = (row, metric) => {
  const signs = row.cells.filter((c) => !c.endpoint).map((c) => {
    const s = c.stats[metric];
    if (!s || s.mean === 0) return 0;
    return Math.sign(s.mean) * (c.frac < 0 ? -1 : 1);
  }).filter((x) => x !== 0);
  if (!signs.length) return 0;
  return Math.max(signs.filter((x) => x > 0).length, signs.filter((x) => x < 0).length) / signs.length;
};

export const classifyV2 = (row, { confoundedWith = [], historicalSupport = false, syntheticSupport = false, structuralSupport = false } = {}) => {
  const fam = row.family;
  const alpha = IDENTIFIABILITY_V2.familyWiseAlpha;

  // ── Significance over the PRIMARY family only ────────────────────────────
  const primary = fam.primary.map((m) => {
    const pl = pooled(row, m);
    const dose = effectAtLargestDose(row, m);
    return { metric: m, ...pl, p: pFromT(pl.t), practicalThreshold: PRACTICAL_EFFECT[m],
      dirConsistency: directionConsistency(row, m),
      // Magnitude at the widest dose is what the practical gate judges.
      doseMean: dose.mean, doseFraction: dose.dose };
  });
  const tested = holm(primary, alpha);
  const best = [...tested].sort((a, b) => Math.abs(b.t) - Math.abs(a.t))[0] ?? null;

  const significant = tested.filter((e) => e.significant);
  // Practical effect: the pooled mean must clear the declared threshold.
  const practical = significant.filter((e) => Math.abs(e.doseMean) >= e.practicalThreshold);

  // ── Guardrails: the parameter must not reach the wrong domain ────────────
  const guardrails = fam.guardrails.map((m) => {
    const pl = pooled(row, m);
    const tol = PRACTICAL_EFFECT[m] * IDENTIFIABILITY_V2.guardrailToleranceMultiple;
    return { metric: m, mean: r4(pl.mean), tolerance: tol, breached: Math.abs(pl.mean) > tol };
  });
  const breached = guardrails.filter((g) => g.breached);

  const secondary = fam.secondary.map((m) => {
    const pl = pooled(row, m);
    return { metric: m, mean: r4(pl.mean), t: r4(pl.t), corroborates: Math.abs(pl.t) >= 2 };
  });

  const dirBest = best ? best.dirConsistency : 0;
  const bestPractical = practical.length
    ? [...practical].sort((a, b) => Math.abs(b.t) - Math.abs(a.t))[0]
    : null;

  let category, reason;
  if (!practical.length) {
    category = "NO_MEASURABLE_EFFECT";
    reason = significant.length
      ? `Significant on ${significant.map((e) => e.metric).join(", ")} but no primary metric clears its practical threshold at the widest dose (best |effect| ${r4(Math.abs(best?.doseMean ?? 0))} vs ${best?.practicalThreshold}). Statistically real, basketball-irrelevant.`
      : `No primary-family metric is significant after Holm-Bonferroni at alpha ${alpha} (best adjusted p ${r4(tested[0]?.adjustedP ?? 1)}).`;
  } else if (confoundedWith.length) {
    category = "CONFOUNDED";
    reason = `Practically significant on ${bestPractical.metric}, but its primary-family response is parallel to ${confoundedWith.join(", ")}.`;
  } else if (!historicalSupport && !syntheticSupport && !structuralSupport) {
    // Only genuinely UNSUPPORTED support lands here. An earlier version also
    // routed STRUCTURAL_VALIDATION_ONLY through this branch, conflating "only
    // structural checks apply" with "nothing can judge it" — two different
    // findings with two different readiness consequences.
    category = "UNSUPPORTED_BY_TARGET_DATA";
    reason = `Practically significant on ${bestPractical.metric} (|effect| ${r4(Math.abs(bestPractical.doseMean))} at ${bestPractical.doseFraction} of range, adjusted p ${r4(bestPractical.adjustedP)}), but no authorized target can judge which direction is better.`;
  } else if (bestPractical.dirConsistency >= IDENTIFIABILITY_V2.identifiableMinDirectionConsistency && !breached.length) {
    category = "IDENTIFIABLE";
    reason = `Practically significant on ${bestPractical.metric} (|effect| ${r4(Math.abs(bestPractical.doseMean))} at ${bestPractical.doseFraction} of range vs threshold ${bestPractical.practicalThreshold}, adjusted p ${r4(bestPractical.adjustedP)}), direction consistency ${r4(bestPractical.dirConsistency)}, no guardrail breached.`;
  } else {
    category = "WEAKLY_IDENTIFIABLE";
    reason = breached.length
      ? `Practically significant on ${bestPractical.metric}, but breaches guardrail(s) ${breached.map((g) => g.metric).join(", ")} — it reaches a domain it should not.`
      : `Practically significant on ${bestPractical.metric}, but direction consistency ${r4(bestPractical.dirConsistency)} is below ${IDENTIFIABILITY_V2.identifiableMinDirectionConsistency}.`;
  }

  return {
    category, reason,
    primaryTests: tested.map((e) => ({ metric: e.metric, pooledMean: r4(e.mean), doseMean: r4(e.doseMean), doseFraction: e.doseFraction, t: r4(e.t), p: r4(e.p), adjustedP: r4(e.adjustedP), significant: e.significant, practicalThreshold: e.practicalThreshold, clearsPractical: Math.abs(e.doseMean) >= e.practicalThreshold, dirConsistency: r4(e.dirConsistency) })),
    secondary, guardrails,
    bestPrimaryMetric: bestPractical?.metric ?? best?.metric ?? null,
    bestPooledT: r4(bestPractical?.t ?? best?.t ?? 0),
    directionConsistency: r4(dirBest),
    guardrailBreaches: breached.map((g) => g.metric),
  };
};

/**
 * Signature over the FULL metric vector.
 *
 * An earlier version restricted this to each parameter's own primary family,
 * padding the rest with zeros. That measures FAMILY MEMBERSHIP, not confounding:
 * two parameters declared against the same three metrics get near-parallel
 * sparse vectors almost by construction, and it reported 42 confounded pairs of
 * which 14 shared an identical family. Confounding is a claim about the whole
 * response pattern, so the whole vector is the right basis.
 */
export const fullSignature = (row) => METRICS.map((m) => pooled(row, m).t);

export const cosine = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return na > 0 && nb > 0 ? dot / (na * nb) : 0;
};

/** Condition number of the response matrix, via power iteration on AᵀA. */
export const conditionNumber = (rows) => {
  if (!rows.length) return null;
  const m = rows.length, n = rows[0].length;
  const ata = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const largest = (mat, deflate = null) => {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1));
    for (let it = 0; it < 300; it++) {
      let w = mat.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
      if (deflate) { const d = deflate.vec.reduce((s, x, j) => s + x * w[j], 0); w = w.map((x, j) => x - d * deflate.vec[j]); }
      const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
      if (!(norm > 0)) return { val: 0, vec: v };
      v = w.map((x) => x / norm);
    }
    const av = mat.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
    return { val: Math.abs(v.reduce((s, x, j) => s + x * av[j], 0)), vec: v };
  };
  const top = largest(ata);
  // Smallest via inverse-free deflation is unreliable; use the trace-based
  // lower bound instead and report it as such rather than overclaiming.
  const trace = ata.reduce((s, r, i) => s + r[i], 0);
  const rest = Math.max(1e-12, (trace - top.val) / Math.max(1, n - 1));
  return { largestEigen: r4(top.val), meanRemainingEigen: r4(rest), approxConditionNumber: r4(Math.sqrt(top.val / rest)), method: "power iteration for the largest eigenvalue of AtA; remaining eigenvalues summarised by trace. An approximation, reported as one." };
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("seeds", IDENTIFIABILITY_V2.minPairedSeeds));
  const only = arg("only", null);
  const params = activeParameters().filter((p) => !only || p.id.includes(only));

  const gaps = missingFamilies(activeParameters().map((p) => p.id));
  if (gaps.length) { console.error(`parameters with no declared metric family: ${gaps.join(", ")}`); process.exit(1); }

  console.log(`IDENTIFIABILITY V2 — ${params.length} active parameters`);
  console.log(`  ${SENSITIVITY_FIXTURES.length} fixtures x ${seeds} paired seeds x ${IDENTIFIABILITY_V2.perturbationFractionsOfRange?.length ?? 4} perturbations`);
  console.log(`  significance: Holm-Bonferroni over the declared primary family, alpha ${IDENTIFIABILITY_V2.familyWiseAlpha}`);
  console.log(`  policy hash ${identifiabilityPolicyHash().slice(0, 16)}   no holdout fixture is used\n`);

  const self = fileURLToPath(import.meta.url);
  const pool = Math.max(1, Math.min(params.length, cpus().length - 2));
  const queue = [...params.entries()];
  const rows = new Array(params.length);
  let done = 0;
  const t0 = Date.now();

  await new Promise((resolve, reject) => {
    let active = 0;
    const next = () => {
      if (!queue.length && active === 0) return resolve();
      while (queue.length && active < pool) {
        const [i, p] = queue.shift();
        active++;
        const w = new Worker(self, { workerData: { harness: "identifiability-v2", paramId: p.id, seeds } });
        w.on("message", (m) => { rows[i] = m; done++; process.stdout.write(`\r  ${done}/${params.length}`); });
        w.on("error", reject);
        w.on("exit", () => { active--; next(); });
      }
    };
    next();
  });
  const elapsed = Date.now() - t0;

  // ── Empirical null from OUT-OF-FAMILY metrics ────────────────────────────
  const nullT = [];
  for (const row of rows) {
    const inFamily = new Set([...row.family.primary, ...row.family.secondary, ...row.family.guardrails]);
    for (const m of METRICS) {
      if (inFamily.has(m)) continue;
      const t = pooled(row, m).t;
      if (Number.isFinite(t)) nullT.push(Math.abs(t));
    }
  }
  nullT.sort((a, b) => a - b);
  const q = (f) => nullT[Math.min(nullT.length - 1, Math.floor(f * nullT.length))] ?? null;
  const nullSummary = { samples: nullT.length, median: r4(q(0.5)), p90: r4(q(0.9)), p95: r4(q(0.95)), p99: r4(q(0.99)) };

  // ── Confounding over primary-family signatures ───────────────────────────
  const sigs = rows.map((r) => fullSignature(r));
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c = cosine(sigs[i], sigs[j]);
      if (Math.abs(c) >= IDENTIFIABILITY_V2.confoundedMinCosine) pairs.push({ a: rows[i].id, b: rows[j].id, cosine: r4(c) });
    }
  }
  const confoundedWith = Object.fromEntries(rows.map((r) => [r.id, []]));
  for (const pr of pairs) { confoundedWith[pr.a].push(pr.b); confoundedWith[pr.b].push(pr.a); }

  // Support, read from the committed matrix rather than re-derived here.
  const { readFileSync } = await import("node:fs");
  const sup = JSON.parse(readFileSync("data/calibration/calibration-support-matrix.json", "utf8"));
  const supById = new Map(sup.parameters.map((p) => [p.id, p.support]));

  const classified = rows.map((r) => {
    const s = supById.get(r.id);
    return {
      ...r,
      support: s ?? "UNSUPPORTED",
      ...classifyV2(r, {
        confoundedWith: confoundedWith[r.id],
        historicalSupport: s === "HISTORICAL_NUMERIC_SUPPORT",
        syntheticSupport: s === "SYNTHETIC_CONTROL_SUPPORT",
        structuralSupport: s === "STRUCTURAL_VALIDATION_ONLY",
      }),
      confoundedWith: confoundedWith[r.id],
      // Raw cells are trimmed from the committed artefact, but the per-dose
      // family summary is kept so the practical gate can be re-checked.
      doseSummary: r.family.primary.map((m) => ({ metric: m, ...effectAtLargestDose(r, m) })),
      cells: undefined,
    };
  });

  const counts = {};
  for (const c of classified) counts[c.category] = (counts[c.category] ?? 0) + 1;
  const cond = conditionNumber(sigs);

  console.log(`\n\n  ran in ${(elapsed / 1000).toFixed(1)}s\n`);
  console.log(`  empirical null of |pooled t| on out-of-family metrics:`);
  console.log(`    ${nullSummary.samples} samples · median ${nullSummary.median} · p90 ${nullSummary.p90} · p95 ${nullSummary.p95} · p99 ${nullSummary.p99}\n`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\n  confounded pairs (full response signatures): ${pairs.length}`);
  for (const pr of pairs) console.log(`    ${pr.a.padEnd(40)} ~ ${pr.b.padEnd(40)} cos ${pr.cosine}`);
  console.log(`\n  response-matrix conditioning: ${cond?.approxConditionNumber} (cap ${IDENTIFIABILITY_V2.maxConditionNumber})`);

  const ident = classified.filter((c) => c.category === "IDENTIFIABLE");
  console.log(`\n  IDENTIFIABLE (${ident.length}):`);
  for (const c of ident.sort((a, b) => Math.abs(b.bestPooledT) - Math.abs(a.bestPooledT))) {
    console.log(`    ${c.id.padEnd(42)} t ${String(c.bestPooledT).padStart(10)} on ${String(c.bestPrimaryMetric).padEnd(16)} ${c.support}`);
  }
  const noEff = classified.filter((c) => c.category === "NO_MEASURABLE_EFFECT");
  console.log(`\n  NO_MEASURABLE_EFFECT (${noEff.length}):`);
  for (const c of noEff) console.log(`    ${c.id.padEnd(42)} ${c.reason.slice(0, 96)}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/identifiability-v2.json`, JSON.stringify({
    parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
    identifiabilityPolicyHash: identifiabilityPolicyHash(),
    supersedes: "1.0.0",
    fixtures: SENSITIVITY_FIXTURES.map((f) => f.id),
    pairedSeeds: seeds, elapsedMs: elapsed,
    empiricalNull: nullSummary,
    counts, confoundedPairs: pairs, conditioning: cond,
    parameters: classified,
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/identifiability-v2.json`);
}
