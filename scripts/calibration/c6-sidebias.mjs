#!/usr/bin/env node
// ── Fresh probability side-bias validation under policy v2 ──────────────────
//   npm run calibration:c6:sidebias
//
// Progressive, cumulative, family-wise corrected, on a seed domain proven
// disjoint from every prior one. Every stage of every cell is preserved: the
// stopping rule reads a CLASSIFICATION, never a sign or a magnitude, so it
// cannot prefer a direction.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { cpus } from "node:os";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";

const fx = (id) => SYNTHETIC_DEVELOPMENT_V2.find((d) => d.id === id);
const sbSeed = (i) => domainSeed(MASTERS["side-bias-v2"], "side-bias-v2", i);

/**
 * Paired orientation differences for one cell over a seed index range.
 *
 * The perspective team is A. It plays the gold slot in orientation 1 and the
 * blue slot in orientation 2, on the SAME seed. D = win-as-gold minus
 * win-as-blue.
 */
export const cellDiffs = ({ teamA, teamB, era, from, to }) => {
  const A = fx(teamA); const B = fx(teamB);
  const D = new Int8Array(to - from);
  let ties = 0; let violations = 0;
  for (let i = from; i < to; i++) {
    const seed = sbSeed(i);
    const g1 = runPossessionGame(buildPossessionInput({ goldIds: A.five, blueIds: B.five,
      coachGoldId: A.coach, coachBlueId: B.coach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: false, assertInvariants: false });
    const g2 = runPossessionGame(buildPossessionInput({ goldIds: B.five, blueIds: A.five,
      coachGoldId: B.coach, coachBlueId: A.coach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: false, assertInvariants: false });
    if (g1.finalScore.gold === g1.finalScore.blue) ties++;
    if (g2.finalScore.gold === g2.finalScore.blue) ties++;
    violations += (g1.invariantViolations ?? []).length + (g2.invariantViolations ?? []).length;
    D[i - from] = (g1.finalScore.gold > g1.finalScore.blue ? 1 : 0) - (g2.finalScore.blue > g2.finalScore.gold ? 1 : 0);
  }
  return { D: Array.from(D), ties, violations };
};

if (!isMainThread && workerData?.harness === "c6-sidebias") {
  parentPort.postMessage(cellDiffs(workerData));
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const { readArtifact, writeArtifact, ARTIFACT_DIR_C6, reconcile } = await import("../../src/v3/calibration/artifacts.js");
  const { POLICY, MARGINS, ALPHA, SAMPLE_LADDER, classifyCell, pairedSummary, tost, twoSidedZTest, holm, waldInterval, bootstrapInterval, policyHash } = await import("../../src/v3/calibration/sideBiasPolicy.js");
  const { defaultRuntimeParameterSet } = await import("../../src/v3/calibration/runtimeParameters.js");
  const { versionOf } = await import("../../src/versions.js");

  const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
  const policy = readArtifact("probability-side-bias-policy-v2", ARTIFACT_DIR_C6);
  if (policy.data.policyHash !== policyHash()) {
    console.error("VALIDATION_FAILED: the frozen policy hash has changed since it was frozen.");
    process.exit(2);
  }
  const cells = policy.data.cellFamily.cells;
  const familySize = cells.length;
  const POOL = Math.max(1, Math.min(8, cpus().length - 2));

  // Simultaneous intervals across the whole frozen family. The family size does
  // NOT shrink as cells resolve: letting it shrink would make later cells easier
  // to pass, which is multiplicity control defeating itself.
  const alphaSimultaneous = ALPHA / familySize;

  console.log("PROBABILITY SIDE-BIAS VALIDATION v2\n");
  console.log(`  cells                 ${familySize} (frozen)`);
  console.log(`  effect                delta = mean(Y_gold - Y_blue), perspective named per cell`);
  console.log(`  per-cell margin       +/-${MARGINS.perCell}`);
  console.log(`  simultaneous alpha    ${r5(alphaSimultaneous)}  (${ALPHA} / ${familySize})`);
  console.log(`  ladder                ${SAMPLE_LADDER.stages.map((s) => s.cumulativePairs).join(" -> ")} pairs, cumulative`);
  console.log(`  seed domain           side-bias-v2  (proven disjoint)`);
  console.log(`  workers               ${POOL}\n`);

  const runChunk = (task) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { ...task, harness: "c6-sidebias" } });
    w.once("message", (m) => { res(m); w.terminate(); });
    w.once("error", rej);
  });

  const state = cells.map((c) => ({ cell: c, D: [], ties: 0, violations: 0, stages: [], resolved: false, classification: null }));
  let cumulativeGames = 0;

  for (const stage of SAMPLE_LADDER.stages) {
    const pending = state.filter((s) => !s.resolved);
    if (!pending.length) { console.log(`  stage ${stage.stage}: every cell already resolved, not sampled`); break; }
    const from = state[0].D.length ? SAMPLE_LADDER.stages[stage.stage - 2].cumulativePairs : 0;
    const to = stage.cumulativePairs;
    const need = to - (stage.stage === 1 ? 0 : SAMPLE_LADDER.stages[stage.stage - 2].cumulativePairs);

    process.stdout.write(`  stage ${stage.stage}: ${pending.length} unresolved cells x ${need} new pairs ... `);
    const t0 = performance.now();
    // Every unresolved cell escalates together, so the decision to sample more
    // never depends on which way a cell is leaning.
    const queue = pending.map((s) => ({ s, task: { teamA: s.cell.teamA, teamB: s.cell.teamB, era: s.cell.era, from: s.D.length, to } }));
    for (let i = 0; i < queue.length; i += POOL) {
      const batch = queue.slice(i, i + POOL);
      const results = await Promise.all(batch.map((q) => runChunk(q.task)));
      for (const [j, r] of results.entries()) {
        batch[j].s.D.push(...r.D);
        batch[j].s.ties += r.ties;
        batch[j].s.violations += r.violations;
        cumulativeGames += r.D.length * 2;
      }
    }
    console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`);

    // Classify with simultaneous intervals, then record the stage for EVERY
    // cell that was sampled at it, resolved or not.
    const tostP = []; const detP = [];
    for (const s of state) {
      if (s.resolved) { tostP.push(1); detP.push(1); continue; }
      const sm = pairedSummary(s.D);
      tostP.push(tost({ mean: sm.mean, se: sm.se, margin: MARGINS.perCell }).p);
      detP.push(twoSidedZTest({ mean: sm.mean, se: sm.se }).p);
    }
    const holmTost = holm(tostP, ALPHA);
    const holmDet = holm(detP, ALPHA);

    for (const [idx, s] of state.entries()) {
      if (s.resolved) continue;
      const c = classifyCell({ D: s.D, margin: MARGINS.perCell, alphaEquivalence: alphaSimultaneous, alphaDetection: alphaSimultaneous });
      s.stages.push({
        stage: stage.stage, cumulativePairs: s.D.length, games: s.D.length * 2,
        delta: r5(c.mean), sd: r5(c.sd), se: r5(c.se), discordantPairs: c.discordant,
        simultaneousWald: { lower: r5(c.waldInterval.lower), upper: r5(c.waldInterval.upper) },
        simultaneousBootstrap: { lower: r5(c.bootstrapInterval.lower), upper: r5(c.bootstrapInterval.upper) },
        intervalsAgree: c.intervalsAgree,
        rawTostP: r5(tostP[idx]), holmAdjustedTostP: r5(holmTost.adjusted[idx]),
        rawDetectionP: r5(detP[idx]), holmAdjustedDetectionP: r5(holmDet.adjusted[idx]),
        classification: c.classification,
      });
      if (c.classification !== "INCONCLUSIVE") { s.resolved = true; s.classification = c.classification; }
      else if (stage.stage === SAMPLE_LADDER.stages.length) { s.resolved = true; s.classification = "INCONCLUSIVE"; }
    }
    const counts = {};
    for (const s of state) counts[s.classification ?? "pending"] = (counts[s.classification ?? "pending"] ?? 0) + 1;
    console.log(`           ${JSON.stringify(counts)}`);
  }

  // ── aggregate and strata ──────────────────────────────────────────────────
  const allD = state.flatMap((s) => s.D);
  const pooled = pairedSummary(allD);
  const pooledWald = waldInterval({ mean: pooled.mean, se: pooled.se, alpha: ALPHA });
  const pooledBoot = bootstrapInterval({ D: allD, alpha: ALPHA });
  const perCellDeltas = state.map((s) => pairedSummary(s.D).mean);
  const acrossCells = pairedSummary(perCellDeltas);
  const acrossWald = waldInterval({ mean: acrossCells.mean, se: acrossCells.se, alpha: ALPHA });

  const stratum = (keyFn) => {
    const g = {};
    for (const s of state) {
      const k = keyFn(s.cell);
      (g[k] ??= []).push(pairedSummary(s.D).mean);
    }
    return Object.fromEntries(Object.entries(g).map(([k, v]) => {
      const st = pairedSummary(v);
      const ci = v.length > 1 ? waldInterval({ mean: st.mean, se: st.se, alpha: ALPHA }) : { lower: null, upper: null };
      return [k, { cells: v.length, meanDelta: r5(st.mean), se: r5(st.se),
        interval: { lower: r5(ci.lower), upper: r5(ci.upper) },
        withinAggregateMargin: ci.lower == null ? null : (ci.lower > -MARGINS.aggregate && ci.upper < MARGINS.aggregate),
        sameDirectionSystematic: ci.lower == null ? null : (ci.lower > MARGINS.aggregate || ci.upper < -MARGINS.aggregate) }];
    }));
  };
  const strata = {
    byEra: stratum((c) => c.era),
    byKind: stratum((c) => c.kind),
    byCoach: stratum((c) => c.coachA),
    byPerspectiveTeam: stratum((c) => c.perspectiveTeam),
  };
  const systematicStrata = Object.entries(strata).flatMap(([name, g]) =>
    Object.entries(g).filter(([, v]) => v.sameDirectionSystematic === true).map(([k]) => `${name}:${k}`));

  const counts = {};
  for (const s of state) counts[s.classification] = (counts[s.classification] ?? 0) + 1;
  const rec = reconcile({ label: "side-bias-cells", counts, expectedTotal: familySize });

  const aggregateWithinMargin = pooledWald.lower > -MARGINS.aggregate && pooledWald.upper < MARGINS.aggregate
    && pooledBoot.lower > -MARGINS.aggregate && pooledBoot.upper < MARGINS.aggregate;
  const everyCellEquivalent = state.every((s) => s.classification === "EQUIVALENT");
  const noneMateriallyBiased = !state.some((s) => s.classification === "MATERIALLY_BIASED");
  const noneInconclusive = !state.some((s) => s.classification === "INCONCLUSIVE");
  const totalTies = state.reduce((a, s) => a + s.ties, 0);
  const totalViolations = state.reduce((a, s) => a + s.violations, 0);
  const gatePasses = aggregateWithinMargin && everyCellEquivalent && noneMateriallyBiased && noneInconclusive
    && systematicStrata.length === 0 && totalViolations === 0 && totalTies === 0;

  const { path } = writeArtifact("probability-side-bias-validation-v2", {
    probabilitySideBiasPolicyVersion: versionOf("probabilitySideBiasPolicyVersion"),
    probabilitySideBiasSeedSetVersion: versionOf("probabilitySideBiasSeedSetVersion"),
    policyHash: policyHash(),
    policyFrozenBeforeThisRun: true,
    familySize, simultaneousAlpha: r5(alphaSimultaneous),
    perCellMargin: MARGINS.perCell, aggregateMargin: MARGINS.aggregate,
    totalGamesSimulated: cumulativeGames,
    classificationCounts: counts,
    reconciliation: rec,
    aggregate: {
      pooledPairs: pooled.n, pooledDelta: r5(pooled.mean), pooledSe: r5(pooled.se),
      pooledWald: { lower: r5(pooledWald.lower), upper: r5(pooledWald.upper) },
      pooledBootstrap: { lower: r5(pooledBoot.lower), upper: r5(pooledBoot.upper) },
      meanAcrossCells: r5(acrossCells.mean), acrossCellsSe: r5(acrossCells.se),
      acrossCellsInterval: { lower: r5(acrossWald.lower), upper: r5(acrossWald.upper) },
      withinAggregateMargin: aggregateWithinMargin,
    },
    strata, systematicStrata, noSystematicStratum: systematicStrata.length === 0,
    invariantViolations: totalViolations, ties: totalTies,
    gates: {
      aggregateWithinMargin, everyCellEquivalent, noneMateriallyBiased, noneInconclusive,
      noSystematicStratum: systematicStrata.length === 0,
      zeroInvariantViolations: totalViolations === 0, zeroTies: totalTies === 0,
    },
    gatePasses,
    cells: state.map((s) => ({
      id: s.cell.id, kind: s.cell.kind, era: s.cell.era,
      perspectiveTeam: s.cell.perspectiveTeam, teamA: s.cell.teamA, teamB: s.cell.teamB,
      finalClassification: s.classification,
      stageReached: s.stages[s.stages.length - 1].stage,
      finalPairs: s.D.length, finalGames: s.D.length * 2,
      ties: s.ties, invariantViolations: s.violations,
      stages: s.stages,
    })),
  }, {
    generationCommand: "npm run calibration:c6:sidebias",
    sourceArtifacts: ["data/calibration/c6/probability-side-bias-policy-v2.json"],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log(`\n  RESULTS  ${JSON.stringify(counts)}   reconciles ${rec.reconciles}`);
  console.log(`  games simulated        ${cumulativeGames}`);
  console.log(`  pooled delta           ${r5(pooled.mean)}  95% CI [${r5(pooledWald.lower)}, ${r5(pooledWald.upper)}]  (aggregate margin +/-${MARGINS.aggregate})`);
  console.log(`  mean across cells      ${r5(acrossCells.mean)}  CI [${r5(acrossWald.lower)}, ${r5(acrossWald.upper)}]`);
  console.log(`  systematic strata      ${systematicStrata.length ? systematicStrata.join(", ") : "none"}`);
  console.log(`  invariant violations   ${totalViolations}   ties ${totalTies}`);
  console.log(`\n  gates:`);
  for (const [k, v] of Object.entries({ aggregateWithinMargin, everyCellEquivalent, noneMateriallyBiased, noneInconclusive, noSystematicStratum: systematicStrata.length === 0, zeroInvariantViolations: totalViolations === 0, zeroTies: totalTies === 0 })) {
    console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
  }
  console.log(`\n  SIDE-BIAS GATE v2: ${gatePasses ? "PASS" : "FAIL"}`);
  const bad = state.filter((s) => s.classification !== "EQUIVALENT");
  if (bad.length) {
    console.log(`\n  cells not equivalent:`);
    for (const s of bad) {
      const f = s.stages[s.stages.length - 1];
      console.log(`    ${s.classification.padEnd(18)} ${s.cell.id}  delta ${f.delta} CI [${f.simultaneousWald.lower}, ${f.simultaneousWald.upper}] at ${f.cumulativePairs} pairs`);
    }
  }
  console.log(`\nwrote ${path}`);
  process.exit(gatePasses ? 0 : 1);
}
