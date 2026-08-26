#!/usr/bin/env node
// ── Factorial confounding resolution ────────────────────────────────────────
// Resolves each confounding group by moving both mechanisms independently in a
// 2x2 design and measuring main effects and interaction, rather than inferring
// dependence from response-vector similarity.
//
//   npm run calibration:c5:confounding
//
// Similarity says two parameters MOVE THE SAME METRICS. A factorial says whether
// they move them the same WAY, and whether one's effect survives holding the
// other fixed. Phase 6C2C4 had only the former, which is why the coach pair was
// left unresolved.
import { activeParameters, compileRuntimeParameterSet, defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { EXERCISE_CONTRACTS, FIXTURE_SETS, resolveConditional } from "../../src/v3/calibration/exerciseContracts.js";
import { PARITY_FIXTURES } from "./freeze-pre-wiring.mjs";
import { writeArtifact, reconcile } from "../../src/v3/calibration/artifacts.js";
import { readFileSync } from "node:fs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 120000 + i);
const fixtureFor = (id) => {
  const f = PARITY_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fixture "${id}"`);
  return f;
};

const play = (f, seed, set) => runPossessionGame(buildPossessionInput({
  parameterSet: set, goldIds: f.gold, blueIds: f.blue,
  coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId, eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false, expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false, opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: true, assertInvariants: false });

/**
 * A 2x2 factorial on one metric.
 *
 * Main effect A = mean over the two cells where A is high, minus the two where
 * it is low. Interaction = whether A's effect depends on B's level. A near-zero
 * interaction with two real main effects means the mechanisms are separable; a
 * large interaction, or one main effect vanishing when the other moves, means
 * they are not.
 */
export const factorial = ({ paramA, paramB, fixtures, metric, seeds }) => {
  const pa = activeParameters().find((p) => p.id === paramA);
  const pb = activeParameters().find((p) => p.id === paramB);
  const metricFn = resolveConditional(metric);
  const cells = {};
  for (const [label, va, vb] of [
    ["lowlow", pa.min, pb.min], ["highlow", pa.max, pb.min],
    ["lowhigh", pa.min, pb.max], ["highhigh", pa.max, pb.max],
  ]) {
    const set = compileRuntimeParameterSet({ overrides: { [paramA]: va, [paramB]: vb }, label });
    const vals = [];
    for (const id of fixtures) {
      const f = fixtureFor(id);
      for (let i = 0; i < seeds; i++) {
        const g = play(f, seedAt(i), set);
        const v = metricFn(g.possessionLedger ?? [], g);
        if (Number.isFinite(v)) vals.push(v);
      }
    }
    const n = vals.length;
    const mean = n ? vals.reduce((a, b) => a + b, 0) / n : null;
    const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    cells[label] = { valueA: va, valueB: vb, n, mean: r5(mean), se: r5(sd / Math.sqrt(Math.max(1, n))) };
  }
  const m = (k) => cells[k].mean ?? 0;
  const mainA = ((m("highlow") + m("highhigh")) - (m("lowlow") + m("lowhigh"))) / 2;
  const mainB = ((m("lowhigh") + m("highhigh")) - (m("lowlow") + m("highlow"))) / 2;
  const interaction = ((m("highhigh") - m("lowhigh")) - (m("highlow") - m("lowlow"))) / 2;
  // A's effect measured with B held at each level, which is the question that
  // matters for separability.
  const aAtBLow = m("highlow") - m("lowlow");
  const aAtBHigh = m("highhigh") - m("lowhigh");
  const bAtALow = m("lowhigh") - m("lowlow");
  const bAtAHigh = m("highhigh") - m("highlow");
  const pooledSe = Math.sqrt(Object.values(cells).reduce((a, c) => a + (c.se ?? 0) ** 2, 0)) / 2;
  return {
    metric, cells,
    mainEffectA: r5(mainA), mainEffectB: r5(mainB), interaction: r5(interaction),
    aAtBLow: r5(aAtBLow), aAtBHigh: r5(aAtBHigh), bAtALow: r5(bAtALow), bAtAHigh: r5(bAtAHigh),
    pooledSe: r5(pooledSe),
    tMainA: r5(pooledSe > 0 ? mainA / pooledSe : 0),
    tMainB: r5(pooledSe > 0 ? mainB / pooledSe : 0),
    tInteraction: r5(pooledSe > 0 ? interaction / pooledSe : 0),
  };
};

/**
 * Resolution rule, applied to the factorial rather than to similarity.
 *
 * Separable means: both main effects clear noise AND each survives holding the
 * other fixed AND the interaction does not dominate. Anything else keeps them
 * tied together.
 */
/**
 * Minimum share of its own effect a parameter must retain when its partner
 * moves to the other end of ITS range.
 *
 * Added after the factorial exposed a gap in the first version of this rule,
 * which tested only that the effect kept its SIGN. The adjustment pair passed
 * that test while the cooldown's effect fell from -28.0 adjustments to -0.33
 * when the evidence bar was raised — a 75-fold collapse. Those two are
 * SUBSTITUTES: either gate alone suppresses adjustments, so once one is tight
 * the other does nothing. Sign survival is necessary and nowhere near
 * sufficient.
 */
export const MIN_EFFECT_RETENTION = 0.25;

export const resolve = ({ paramA, paramB, results, threshold = 2.0 }) => {
  const best = [...results].sort((a, b) => Math.max(Math.abs(b.tMainA), Math.abs(b.tMainB)) - Math.max(Math.abs(a.tMainA), Math.abs(a.tMainB)))[0];
  const aReal = Math.abs(best.tMainA) >= threshold;
  const bReal = Math.abs(best.tMainB) >= threshold;
  const retention = (x, y) => {
    const lo = Math.min(Math.abs(x), Math.abs(y));
    const hi = Math.max(Math.abs(x), Math.abs(y));
    return hi > 0 ? lo / hi : 0;
  };
  const aRetention = retention(best.aAtBLow, best.aAtBHigh);
  const bRetention = retention(best.bAtALow, best.bAtAHigh);
  const aSurvives = Math.sign(best.aAtBLow) === Math.sign(best.aAtBHigh) && aRetention >= MIN_EFFECT_RETENTION;
  const bSurvives = Math.sign(best.bAtALow) === Math.sign(best.bAtAHigh) && bRetention >= MIN_EFFECT_RETENTION;
  const interactionDominates = Math.abs(best.interaction) > Math.max(Math.abs(best.mainEffectA), Math.abs(best.mainEffectB));

  if (aReal && bReal && aSurvives && bSurvives && !interactionDominates) {
    return { resolution: "KEEP_BOTH_CONTEXTUALLY_IDENTIFIED",
      effectRetention: { a: r5(aRetention), b: r5(bRetention) },
      reason: `On ${best.metric}, both main effects clear noise (t ${best.tMainA} and ${best.tMainB}), and each retains its effect when the other moves (A ${best.aAtBLow} to ${best.aAtBHigh}, retention ${r5(aRetention)}; B ${best.bAtALow} to ${best.bAtAHigh}, retention ${r5(bRetention)}). Interaction ${best.interaction} does not dominate. Separable.` };
  }
  // Substitutes: both are individually effective, but one absorbs the other.
  if (aReal && bReal && (!aSurvives || !bSurvives)) {
    const keepA = aRetention >= bRetention;
    return { resolution: "FREEZE_ONE_TUNE_ONE",
      tune: keepA ? paramA : paramB, freeze: keepA ? paramB : paramA,
      effectRetention: { a: r5(aRetention), b: r5(bRetention) },
      reason: `On ${best.metric}, both main effects are real but one absorbs the other: A retains ${r5(aRetention)} of its effect when B moves, B retains ${r5(bRetention)} (minimum ${MIN_EFFECT_RETENTION}). They are substitutes — either gate alone produces the effect — so ${keepA ? paramB : paramA} is frozen and ${keepA ? paramA : paramB} carries the mechanism.` };
  }
  if (aReal && !bReal) {
    return { resolution: "FREEZE_ONE_TUNE_ONE", tune: paramA, freeze: paramB,
      reason: `On ${best.metric}, only ${paramA} has a main effect above noise (t ${best.tMainA} vs ${best.tMainB}). ${paramB} is frozen.` };
  }
  if (bReal && !aReal) {
    return { resolution: "FREEZE_ONE_TUNE_ONE", tune: paramB, freeze: paramA,
      reason: `On ${best.metric}, only ${paramB} has a main effect above noise (t ${best.tMainB} vs ${best.tMainA}). ${paramA} is frozen.` };
  }
  if (aReal && bReal && interactionDominates) {
    return { resolution: "FREEZE_BOTH_PENDING_TARGET",
      reason: `On ${best.metric}, both have main effects but the interaction (${best.interaction}) exceeds both (${best.mainEffectA}, ${best.mainEffectB}). Their joint behaviour cannot be attributed to either alone.` };
  }
  if (aReal && bReal) {
    return { resolution: "COLLAPSED",
      reason: `On ${best.metric}, both main effects are real but neither survives holding the other fixed (A: ${best.aAtBLow} vs ${best.aAtBHigh}; B: ${best.bAtALow} vs ${best.bAtAHigh}). They are one degree of freedom wearing two names.` };
  }
  return { resolution: "FREEZE_BOTH_PENDING_TARGET",
    reason: `Neither main effect clears noise on any tested metric (best t ${best.tMainA}, ${best.tMainB}). Nothing to separate.` };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("seeds", 64));

  const idv2 = JSON.parse(readFileSync(".cache/calibration/identifiability-v2.json", "utf8"));
  const pairs = idv2.confoundedPairs.map((p) => ({ a: p.a, b: p.b, cosine: p.cosine }));

  console.log(`FACTORIAL CONFOUNDING RESOLUTION — ${pairs.length} groups\n`);
  console.log(`  2x2 cells per group x ${seeds} seeds per fixture, paired\n`);

  const out = [];
  for (const pr of pairs) {
    const ca = EXERCISE_CONTRACTS[pr.a];
    const cb = EXERCISE_CONTRACTS[pr.b];
    // Use the union of both parameters' conditional metrics, on the fixture set
    // that exercises them — a factorial on a metric neither moves says nothing.
    const metrics = [...new Set([...ca.conditional, ...cb.conditional])].slice(0, 3);
    const fixtures = [...new Set([...FIXTURE_SETS[ca.fixtures], ...FIXTURE_SETS[cb.fixtures]])].slice(0, 3);
    const results = metrics.map((m) => factorial({ paramA: pr.a, paramB: pr.b, fixtures, metric: m, seeds }));
    const r = resolve({ paramA: pr.a, paramB: pr.b, results });
    out.push({ ...pr, fixtures, metrics, results, ...r });
    console.log(`  ${pr.a}\n  ~ ${pr.b}   cosine ${pr.cosine}`);
    console.log(`    -> ${r.resolution}`);
    console.log(`       ${r.reason.slice(0, 150)}\n`);
  }

  const counts = out.reduce((a, r) => ({ ...a, [r.resolution]: (a[r.resolution] ?? 0) + 1 }), {});
  const rec = reconcile({ label: "confounding-resolution", counts, expectedTotal: pairs.length });

  const { path } = writeArtifact("confounding-resolution", { groups: out, counts, reconciliation: rec }, {
    generationCommand: "npm run calibration:c5:confounding",
    sourceArtifacts: [".cache/calibration/identifiability-v2.json"],
    extra: {
      parameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
      parameterConfoundingResolutionVersion: versionOf("parameterConfoundingResolutionVersion"),
      seedsPerCell: seeds,
    },
  });

  for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\n  reconciles: ${rec.reconciles} (${rec.sum}/${rec.expectedTotal})`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles ? 0 : 2);
}
