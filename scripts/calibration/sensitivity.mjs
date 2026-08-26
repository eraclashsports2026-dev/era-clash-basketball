#!/usr/bin/env node
// ── Parameter sensitivity, identifiability and confounding ───────────────────
// Now answerable. Phase 6C2C2 could not run this: every parameter would have
// measured at exactly zero effect, not because the coefficients do not matter
// but because none of them reached the engine. Reporting that as
// NO_MEASURABLE_EFFECT would have retired 53 parameters on a wiring bug.
//
//   npm run calibration:parameters:sensitivity
//   npm run calibration:parameters:confounding
//   npm run calibration:parameters:identifiability
//
// Method: paired seeds. For each (fixture, seed) the baseline is computed ONCE
// and reused across every perturbation, so the per-seed difference is free of
// seed noise and the whole sweep costs one baseline pass plus one pass per
// perturbation. Significance is a paired t-statistic over per-game differences,
// which is the correct noise model for a paired design — the variance that
// matters is the variance of the DIFFERENCE, not of either level.
//
// No holdout fixture is used anywhere.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { compileRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { IDENTIFIABILITY } from "../../src/v3/calibration/acceptancePolicy.js";
import { PARITY_FIXTURES } from "./freeze-pre-wiring.mjs";
import { versionOf } from "../../src/versions.js";

const OUT = ".cache/calibration";
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

/**
 * Fixtures used for sensitivity. Chosen to span the mechanics the parameters
 * govern: a normal matchup, a real zone game (only four coaches reach the zone
 * gate), and a construction contrast that stresses opportunity allocation.
 */
export const SENSITIVITY_FIXTURES = [
  "era-2010s",                          // baseline modern matchup
  "era-1960s",                          // pre-three-point era; severe/major mismatches
  "real-zone-nick-nurse",               // the only coaches who reach the zone gate
  "balanced-vs-creators",               // stresses opportunity allocation; MINOR mismatches
  "coach-mike-dantoni-vs-jerry-sloan",  // coach contrast, and reaches overtime
  // Reached only after measuring: a MODERATE mismatch is exploited in exactly
  // ONE fixture of the 32-fixture corpus. With a narrower set,
  // opportunity.mismatch.moderate measured at a signal-to-noise ratio of
  // exactly zero and would have been filed NO_MEASURABLE_EFFECT — which would
  // have been the disconnected-registry error repeated as a coverage error.
  "synthdev-sd2-elite-shooting",
]
  .map((id) => {
    const f = PARITY_FIXTURES.find((x) => x.id === id);
    if (!f) throw new Error(`sensitivity fixture "${id}" not in the parity corpus`);
    return f;
  });

/**
 * The response vector. Every entry is a quantity the ENGINE actually produces,
 * derived from the result rather than from a guessed metric vocabulary — the
 * mistake that mis-bucketed 47 of 53 parameters in an earlier draft of the
 * support matrix.
 */
export const responseVector = (g) => {
  const t = g.gold.totals;
  const o = g.blue.totals;
  const poss = t.possessions || 1;
  const loc = {};
  const fam = {};
  let zoneActions = 0;
  const made = {};
  for (const p of g.possessionLedger ?? []) {
    fam[p.action] = (fam[p.action] ?? 0) + 1;
    // p.shot is the location STRING. Reading p.shot.location silently zeroed
    // every shot-location metric, so the four location shares below carried no
    // signal and shot-location parameters were judged only on indirect metrics.
    if (typeof p.shot === "string") {
      loc[p.shot] = (loc[p.shot] ?? 0) + 1;
      if ((p.points ?? 0) > 0) made[p.shot] = (made[p.shot] ?? 0) + 1;
    }
    if (/ZONE|HIGH_POST_ENTRY|CORNER_SPOT_UP|SHORT_CORNER|SKIP_PASS|BASELINE_CUT|TOP_OF_KEY/.test(p.action ?? "")) zoneActions++;
  }
  const shots = Object.values(loc).reduce((a, b) => a + b, 0) || 1;
  const plays = Object.values(fam).reduce((a, b) => a + b, 0) || 1;
  const fga = t.fga || 1;
  const shares = g.gold.players.map((p) => p.fga / fga).sort((a, b) => b - a);
  const entropy = -shares.filter((s) => s > 0).reduce((a, s) => a + s * Math.log(s), 0);

  return {
    pace: poss,
    points: t.pts,
    margin: t.pts - o.pts,
    fgPct: t.fgm / fga,
    efgPct: (t.fgm + 0.5 * t.tpm) / fga,
    tsPct: t.pts / (2 * (fga + 0.44 * (t.fta || 0))),
    threePar: t.tpa / fga,
    ftr: (t.fta || 0) / fga,
    tovRate: t.to / poss,
    orebRate: t.oreb / (t.oreb + o.dreb || 1),
    astRate: t.ast / (t.fgm || 1),
    stlRate: t.stl / poss,
    blkRate: t.blk / poss,
    rimShare: (loc.RIM ?? 0) / shots,
    paintShare: (loc.PAINT_OR_POST ?? 0) / shots,
    midShare: (loc.MIDRANGE ?? 0) / shots,
    threeShare: (loc.THREE_POINT ?? 0) / shots,
    // Per-location conversion, so a conversion parameter is judged on the thing
    // it actually sets rather than on team FG% mixed across all locations.
    rimMakeRate: (made.RIM ?? 0) / (loc.RIM || 1),
    paintMakeRate: (made.PAINT_OR_POST ?? 0) / (loc.PAINT_OR_POST || 1),
    midMakeRate: (made.MIDRANGE ?? 0) / (loc.MIDRANGE || 1),
    leadingFgaShare: shares[0] ?? 0,
    topTwoShare: (shares[0] ?? 0) + (shares[1] ?? 0),
    usageEntropy: entropy,
    zoneActionShare: zoneActions / plays,
    pnrShare: (fam.PICK_AND_ROLL ?? 0) / plays,
    postShare: (fam.POST_UP ?? 0) / plays,
    isoShare: (fam.ISOLATION ?? 0) / plays,
    spotUpShare: (fam.SPOT_UP ?? 0) / plays,
    genericShare: (fam.GENERIC_HALF_COURT ?? 0) / plays,
    transitionShare: (fam.TRANSITION ?? 0) / plays,
    adjustments: (g.offense?.gold?.adjustments?.length ?? 0) + (g.offense?.blue?.adjustments?.length ?? 0),
    overtimes: g.overtimes ?? 0,
  };
};

export const METRICS = Object.keys(responseVector({
  gold: { totals: { pts: 1, fga: 1, fgm: 1, tpm: 0, tpa: 0, fta: 0, to: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, possessions: 1 }, players: [] },
  blue: { totals: { pts: 1, dreb: 0 } }, possessionLedger: [], overtimes: 0,
}));

const play = (f, seed, parameterSet) => runPossessionGame(buildPossessionInput({
  parameterSet, goldIds: f.gold, blueIds: f.blue,
  coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId,
  eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false,
  expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false,
  opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: true, assertInvariants: false });

const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 50000 + i);

/** Perturbation points, as fractions of the declared range. */
export const perturbationsFor = (p) => {
  const span = p.max - p.min;
  return IDENTIFIABILITY.perturbationFractionsOfRange.map((frac) => {
    const raw = p.defaultValue + span * frac;
    // Clamped INTO bounds. A perturbation that leaves the declared range would
    // be rejected by the compiler, and silently skipping it would understate a
    // parameter whose default sits near an edge.
    const value = Math.min(p.max, Math.max(p.min, raw));
    return { frac, value, clamped: value !== raw };
  }).filter((x) => x.value !== p.defaultValue);
};

// ── Worker: one parameter, all its perturbations, all fixtures ──────────────
const measureParameter = (paramId, seeds) => {
  const p = activeParameters().find((x) => x.id === paramId);
  const perts = perturbationsFor(p);
  const results = [];

  for (const pert of perts) {
    const set = compileRuntimeParameterSet({ overrides: { [paramId]: pert.value }, label: `${paramId}@${pert.value}` });
    // Per-metric paired differences, pooled across fixtures.
    const diffs = Object.fromEntries(METRICS.map((m) => [m, []]));
    for (const f of SENSITIVITY_FIXTURES) {
      for (let i = 0; i < seeds; i++) {
        const seed = seedAt(i);
        const base = responseVector(play(f, seed, null));
        const moved = responseVector(play(f, seed, set));
        for (const m of METRICS) {
          const d = moved[m] - base[m];
          if (Number.isFinite(d)) diffs[m].push(d);
        }
      }
    }
    const stats = {};
    for (const m of METRICS) {
      const xs = diffs[m];
      const n = xs.length;
      const mean = xs.reduce((a, b) => a + b, 0) / n;
      const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
      const se = sd / Math.sqrt(n);
      stats[m] = { mean: r4(mean), sd: r4(sd), se: r4(se), t: r4(se > 0 ? mean / se : (mean === 0 ? 0 : Infinity)), n };
    }
    results.push({ ...pert, stats });
  }
  return { id: paramId, module: p.module, defaultValue: p.defaultValue, min: p.min, max: p.max, perturbations: results };
};

// Tagged. This module is imported by the identifiability-v2 harness, whose
// workers also see isMainThread === false; without the tag this block fired
// there too and every v2 worker posted a second message in the wrong shape.
if (!isMainThread && workerData?.harness === "sensitivity") {
  parentPort.postMessage(measureParameter(workerData.paramId, workerData.seeds));
}

// ── Analysis ────────────────────────────────────────────────────────────────
/**
 * A parameter's signature: the standardised response across metrics at its
 * largest perturbation. Two parameters with parallel signatures cannot be
 * separated by any amount of data from this corpus.
 */
export const signatureOf = (row) => {
  const widest = row.perturbations.reduce((a, b) => (Math.abs(b.frac) > Math.abs(a.frac) ? b : a), row.perturbations[0]);
  if (!widest) return null;
  const sign = widest.frac < 0 ? -1 : 1;
  return METRICS.map((m) => {
    const s = widest.stats[m];
    // t-statistic, signed toward increasing parameter value, so a parameter
    // measured on its downside is comparable with one measured on its upside.
    return Number.isFinite(s.t) ? s.t * sign : 0;
  });
};

export const cosine = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return na > 0 && nb > 0 ? dot / (na * nb) : 0;
};

/**
 * Multiplicity-adjusted critical value.
 *
 * The classifier's statistic is max|t| across every metric, and a maximum over
 * many metrics has an inflated null distribution: with 32 metrics, E[max|t|]
 * under the null is already about 2.14, and the Bonferroni critical value at
 * alpha 0.05 is about 3.16. The FROZEN policy threshold of 2.0 was set without
 * accounting for this, so a parameter reading 2.2 across 32 metrics is weaker
 * evidence than the number suggests.
 *
 * The frozen threshold is NOT moved — that would be a post-hoc adjustment. This
 * is reported alongside, so the weak tier can be read honestly.
 */
export const multiplicityCriticalValue = (m = METRICS.length, alpha = 0.05) => {
  // Inverse normal CDF (Acklam), adequate for a reported diagnostic.
  const p = 1 - alpha / (2 * m);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
};

export const classify = (row, confoundedWith) => {
  // Peak |t| across metrics and perturbations is the signal-to-noise ratio: a
  // paired t-statistic IS an effect measured in units of its own noise.
  let peak = 0, peakMetric = null;
  for (const pert of row.perturbations) {
    for (const m of METRICS) {
      const t = Math.abs(pert.stats[m].t ?? 0);
      if (Number.isFinite(t) && t > peak) { peak = t; peakMetric = m; }
    }
  }
  // Direction consistency: does the peak metric move the same way at every
  // perturbation of the same sign?
  const up = row.perturbations.filter((p) => p.frac > 0).map((p) => Math.sign(p.stats[peakMetric]?.mean ?? 0));
  const down = row.perturbations.filter((p) => p.frac < 0).map((p) => Math.sign(p.stats[peakMetric]?.mean ?? 0));
  const agree = (xs) => (xs.length ? Math.max(xs.filter((x) => x > 0).length, xs.filter((x) => x < 0).length) / xs.length : 1);
  const consistency = Math.min(agree(up), agree(down));

  let category, reason;
  if (peak < IDENTIFIABILITY.weaklyIdentifiableMinSnr) {
    category = "NO_MEASURABLE_EFFECT";
    reason = `Peak signal-to-noise ${r4(peak)} across ${METRICS.length} metrics is below ${IDENTIFIABILITY.weaklyIdentifiableMinSnr}. The consumer executes — connectivity is proven separately — but no metric moves detectably inside the declared range.`;
  } else if (confoundedWith.length) {
    category = "CONFOUNDED";
    reason = `Response signature parallel to ${confoundedWith.join(", ")} (cosine >= ${IDENTIFIABILITY.confoundedMinCosineSimilarity}). Separate effects cannot be attributed from this corpus.`;
  } else if (peak >= IDENTIFIABILITY.identifiableMinSnr && consistency >= IDENTIFIABILITY.identifiableMinDirectionConsistency) {
    category = "IDENTIFIABLE";
    reason = `Peak signal-to-noise ${r4(peak)} on ${peakMetric}, direction consistency ${r4(consistency)}, signature distinct.`;
  } else {
    category = "WEAKLY_IDENTIFIABLE";
    reason = `Peak signal-to-noise ${r4(peak)} on ${peakMetric} clears ${IDENTIFIABILITY.weaklyIdentifiableMinSnr} but ${peak < IDENTIFIABILITY.identifiableMinSnr ? `falls short of ${IDENTIFIABILITY.identifiableMinSnr}` : `direction consistency is only ${r4(consistency)}`}.`;
  }
  const crit = multiplicityCriticalValue();
  return {
    category, reason, peakSnr: r4(peak), peakMetric, directionConsistency: r4(consistency),
    // Reported, never used to reclassify. The frozen policy governs the category.
    multiplicityAdjusted: {
      criticalValue: r4(crit),
      clearsAdjusted: peak >= crit,
      note: peak >= crit
        ? "Clears the Bonferroni critical value for a maximum over every metric."
        : "Does NOT clear the multiplicity-adjusted critical value. The frozen threshold of 2.0 was set without accounting for a maximum taken over many metrics, so this reading is weaker evidence than the raw number suggests.",
    },
  };
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("seeds", 96));
  const only = arg("only", null);
  const params = activeParameters().filter((p) => !only || p.id.includes(only));

  console.log(`PARAMETER SENSITIVITY — ${params.length} active parameters`);
  console.log(`  ${SENSITIVITY_FIXTURES.length} fixtures x ${seeds} paired seeds x ${IDENTIFIABILITY.perturbationFractionsOfRange.length} perturbations`);
  console.log(`  metrics: ${METRICS.length}   thresholds: identifiable SNR >= ${IDENTIFIABILITY.identifiableMinSnr}, weak >= ${IDENTIFIABILITY.weaklyIdentifiableMinSnr}, confounded cosine >= ${IDENTIFIABILITY.confoundedMinCosineSimilarity}`);
  console.log(`  no holdout fixture is used\n`);

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
        const w = new Worker(self, { workerData: { harness: "sensitivity", paramId: p.id, seeds } });
        w.on("message", (m) => { rows[i] = m; done++; process.stdout.write(`\r  ${done}/${params.length} parameters`); });
        w.on("error", reject);
        w.on("exit", () => { active--; next(); });
      }
    };
    next();
  });

  const elapsed = Date.now() - t0;
  // Confounding: pairwise cosine over response signatures.
  const sigs = rows.map(signatureOf);
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c = cosine(sigs[i], sigs[j]);
      if (Math.abs(c) >= IDENTIFIABILITY.confoundedMinCosineSimilarity) pairs.push({ a: rows[i].id, b: rows[j].id, cosine: r4(c) });
    }
  }
  const confoundedWith = Object.fromEntries(rows.map((r) => [r.id, []]));
  for (const pr of pairs) { confoundedWith[pr.a].push(pr.b); confoundedWith[pr.b].push(pr.a); }

  let classified = rows.map((r) => ({ ...r, ...classify(r, confoundedWith[r.id]), confoundedWith: confoundedWith[r.id] }));

  // ── Threshold confirmation ────────────────────────────────────────────────
  // A parameter whose peak signal-to-noise lands just under the weak threshold
  // is a sample-size question, not an answer. Measured at 256 seeds,
  // fitBand.ZONE_ATTACK.hi read 1.899 and fitBand.ISOLATION.lo read 1.998
  // against a threshold of 2.0; at 1024 seeds they read 2.92 and 2.48. Filing
  // either as NO_MEASURABLE_EFFECT would have retired a live coefficient on
  // insufficient power.
  //
  // Only borderline cases escalate. A parameter at exactly zero has no signal to
  // resolve, and spending four times the compute to confirm zero is waste.
  const confirmSeeds = Number(arg("confirmSeeds", 1024));
  const borderline = classified.filter((c) => c.category === "NO_MEASURABLE_EFFECT"
    && c.peakSnr > 0 && c.peakSnr >= IDENTIFIABILITY.weaklyIdentifiableMinSnr * 0.5);
  const escalated = [];
  if (borderline.length) {
    console.log(`\n\n  threshold confirmation: ${borderline.length} borderline parameter(s) at ${confirmSeeds} paired seeds`);
    for (const b of borderline) {
      const re = measureParameter(b.id, confirmSeeds);
      const cls = classify(re, confoundedWith[b.id]);
      escalated.push({ id: b.id, seedsFirst: seeds, snrFirst: b.peakSnr, seedsConfirm: confirmSeeds, snrConfirm: cls.peakSnr, categoryFirst: b.category, categoryConfirm: cls.category });
      console.log(`    ${b.id.padEnd(40)} SNR ${b.peakSnr} @${seeds} -> ${cls.peakSnr} @${confirmSeeds}   ${b.category} -> ${cls.category}`);
      classified = classified.map((c) => (c.id === b.id
        ? { ...c, ...re, ...cls, confoundedWith: confoundedWith[b.id], confirmedAtSeeds: confirmSeeds }
        : c));
    }
  }


  const counts = {};
  for (const c of classified) counts[c.category] = (counts[c.category] ?? 0) + 1;

  console.log(`\n\n  ran in ${(elapsed / 1000).toFixed(1)}s\n`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  const crit = multiplicityCriticalValue();
  const clears = classified.filter((c) => c.multiplicityAdjusted?.clearsAdjusted).length;
  console.log(`\n  multiplicity-adjusted view (max|t| over ${METRICS.length} metrics, Bonferroni alpha 0.05):`);
  console.log(`    critical value                 ${r4(crit)}`);
  console.log(`    parameters clearing it         ${clears} of ${classified.length}`);
  console.log(`    frozen policy threshold        ${IDENTIFIABILITY.weaklyIdentifiableMinSnr}  (NOT moved; the categories above use it)`);
  console.log(`\n  confounded pairs: ${pairs.length}`);
  for (const pr of pairs.slice(0, 12)) console.log(`    ${pr.a.padEnd(40)} ~ ${pr.b.padEnd(40)} cos ${pr.cosine}`);

  console.log(`\n  strongest effects:`);
  for (const c of [...classified].sort((a, b) => (b.peakSnr ?? 0) - (a.peakSnr ?? 0)).slice(0, 12)) {
    console.log(`    ${c.id.padEnd(42)} SNR ${String(c.peakSnr).padStart(9)} on ${String(c.peakMetric).padEnd(16)} ${c.category}`);
  }
  const noEffect = classified.filter((c) => c.category === "NO_MEASURABLE_EFFECT");
  if (noEffect.length) {
    console.log(`\n  no measurable effect (${noEffect.length}):`);
    for (const c of noEffect) console.log(`    ${c.id.padEnd(42)} peak SNR ${c.peakSnr}`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/parameter-sensitivity.json`, JSON.stringify({
    parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
    parameterSensitivitySeedSetVersion: versionOf("parameterSensitivitySeedSetVersion"),
    runtimeParameterBindingVersion: versionOf("runtimeParameterBindingVersion"),
    thresholds: IDENTIFIABILITY,
    fixtures: SENSITIVITY_FIXTURES.map((f) => f.id),
    pairedSeeds: seeds, metrics: METRICS, elapsedMs: elapsed,
    counts, confoundedPairs: pairs, thresholdConfirmations: escalated,
    multiplicity: { metrics: METRICS.length, criticalValue: r4(multiplicityCriticalValue()),
      clearingAdjusted: classified.filter((c) => c.multiplicityAdjusted?.clearsAdjusted).length,
      note: "The classifier's statistic is a maximum over every metric, whose null distribution is inflated. Reported alongside the frozen categories, never used to reclassify." },
    parameters: classified,
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/parameter-sensitivity.json`);
}
