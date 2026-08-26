#!/usr/bin/env node
// ── Targeted mechanic measurement ───────────────────────────────────────────
// Measures every active parameter through the mechanic it controls, at three
// separate levels, and refuses to judge a parameter whose mechanic never ran.
//
//   npm run calibration:c5:targeted
//
// Level 1  activation      did the mechanic occur, and often enough?
// Level 2  conditional     among ONLY those possessions, did the outcome change?
// Level 3  game            did a broader distribution move?
// Level 4  guardrails      did anything it should not touch stay put?
//
// Phase 6C2C4 measured level 3 alone and filed 37 parameters as no-effect. A
// zone corner scalar acts on the possessions where a corner is attacked against
// a live zone; a whole-game average dilutes that to nothing. Both levels matter,
// and they are reported separately rather than combined.
//
// No holdout fixture is used.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { compileRuntimeParameterSet, activeParameters, defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import {
  EXERCISE_CONTRACTS, FIXTURE_SETS, resolvePredicate, resolveConditional,
  contractsHash, missingContracts, orphanContracts, TARGETED_FIXTURE_VERSION,
} from "../../src/v3/calibration/exerciseContracts.js";
import { PARITY_FIXTURES } from "./freeze-pre-wiring.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { writeArtifact, reconcile } from "../../src/v3/calibration/artifacts.js";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

/** Frozen seed batches. Volume escalates in a predetermined order, never by result. */
export const SEED_BATCHES = Object.freeze([64, 128, 256, 512]);
export const MAX_SEED_BUDGET = SEED_BATCHES.reduce((a, b) => a + b, 0);

const fixtureFor = (id) => {
  const f = PARITY_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fixture "${id}"`);
  return f;
};

/** Sealed sets are excluded by construction, by id and by lineup. */
export const assertNoHoldout = () => {
  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id)]);
  const sealedFives = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => JSON.stringify([...f.five].sort())));
  for (const ids of Object.values(FIXTURE_SETS)) {
    for (const id of ids) {
      if ([...sealed].some((s) => id.includes(s))) throw new Error(`fixture set names a sealed holdout: ${id}`);
      const f = fixtureFor(id);
      for (const five of [f.gold, f.blue]) {
        if (sealedFives.has(JSON.stringify([...five].sort()))) throw new Error(`fixture ${id} reuses a sealed lineup`);
      }
    }
  }
  return true;
};

const play = (f, seed, parameterSet) => runPossessionGame(buildPossessionInput({
  parameterSet, goldIds: f.gold, blueIds: f.blue,
  coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId, eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false, expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false, opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: true, assertInvariants: false });

const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 90000 + i);

/** Guardrails, computed at game level. */
const GUARDRAILS = {
  possessions: (g) => g.gold.totals.possessions,
  makeRateAll: (g) => g.gold.totals.fgm / (g.gold.totals.fga || 1),
  rimShareGuard: (g) => {
    const rows = (g.possessionLedger ?? []).filter((r) => typeof r.shot === "string");
    return rows.length ? rows.filter((r) => r.shot === "RIM").length / rows.length : null;
  },
};

/**
 * One paired measurement of one parameter at one value.
 *
 * Activation is counted on the BASELINE run: whether the mechanic occurs is a
 * property of the fixture, not of the perturbation, and counting it on the moved
 * run would let a parameter that suppresses its own mechanic look under-exercised.
 */
const measureAt = (paramId, value, seeds) => {
  const c = EXERCISE_CONTRACTS[paramId];
  const predicate = resolvePredicate(c.activation.predicate);
  const conds = c.conditional.map((m) => [m, resolveConditional(m)]);
  const set = value === null ? null : compileRuntimeParameterSet({ overrides: { [paramId]: value }, label: `${paramId}@${value}` });
  const fixtures = FIXTURE_SETS[c.fixtures].map(fixtureFor);

  let activatedRows = 0;
  const condPairs = Object.fromEntries(c.conditional.map((m) => [m, []]));
  const guardPairs = Object.fromEntries(c.guardrails.map((m) => [m, []]));

  for (const f of fixtures) {
    for (let i = 0; i < seeds; i++) {
      const seed = seedAt(i);
      const base = play(f, seed, null);
      const moved = play(f, seed, set);
      const baseRows = (base.possessionLedger ?? []).filter(predicate);
      const movedRows = (moved.possessionLedger ?? []).filter(predicate);
      activatedRows += baseRows.length;
      for (const [name, fn] of conds) {
        const a = fn(baseRows, base);
        const b = fn(movedRows, moved);
        if (Number.isFinite(a) && Number.isFinite(b)) condPairs[name].push(b - a);
      }
      for (const m of c.guardrails) {
        const fn = GUARDRAILS[m];
        if (!fn) continue;
        const a = fn(base); const b = fn(moved);
        if (Number.isFinite(a) && Number.isFinite(b)) guardPairs[m].push(b - a);
      }
    }
  }

  const stat = (xs) => {
    const n = xs.length;
    if (!n) return { n: 0, mean: null, se: null, t: null };
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const se = sd / Math.sqrt(n);
    return { n, mean: r5(mean), se: r5(se), t: r5(se > 0 ? mean / se : 0) };
  };

  return {
    value, seeds, fixtures: fixtures.map((f) => f.id),
    activatedPossessions: activatedRows,
    conditional: Object.fromEntries(Object.entries(condPairs).map(([k, v]) => [k, stat(v)])),
    guardrails: Object.fromEntries(Object.entries(guardPairs).map(([k, v]) => [k, stat(v)])),
  };
};

/**
 * Escalate through the frozen seed batches until the activation minimum is met.
 * Order is predetermined, so volume can never be chosen for a favourable result.
 */
const measureParameter = (paramId) => {
  const p = activeParameters().find((x) => x.id === paramId);
  const c = EXERCISE_CONTRACTS[paramId];
  let seeds = 0;
  let probe = null;
  for (const batch of SEED_BATCHES) {
    seeds = batch;
    probe = measureAt(paramId, p.max, seeds);
    if (probe.activatedPossessions >= c.activation.min) break;
  }
  const activated = probe.activatedPossessions >= c.activation.min;

  // Both endpoints, because the question is whether the parameter can matter
  // across its declared range, and an interior dose understates a sublinear one.
  const atMax = probe;
  const atMin = measureAt(paramId, p.min, seeds);

  return {
    id: paramId, module: p.module, defaultValue: p.defaultValue, min: p.min, max: p.max,
    contract: {
      fixtures: c.fixtures, activationPredicate: c.activation.predicate,
      activationMinimum: c.activation.min, conditionalMetrics: c.conditional,
      guardrailMetrics: c.guardrails, expectedDirection: c.expectedDirection,
      context: c.context, suspectedGuardrail: Boolean(c.suspectedGuardrail),
    },
    seedsUsed: seeds, seedBudget: MAX_SEED_BUDGET,
    activatedPossessions: atMax.activatedPossessions,
    activationMet: activated,
    atMax, atMin,
  };
};

if (!isMainThread && workerData?.harness === "c5-targeted") {
  parentPort.postMessage(measureParameter(workerData.paramId));
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const only = arg("only", null);
  assertNoHoldout();

  const ids = activeParameters().map((p) => p.id);
  const missing = missingContracts(ids);
  const orphans = orphanContracts(ids);
  if (missing.length) { console.error(`parameters with no exercise contract: ${missing.join(", ")}`); process.exit(1); }
  if (orphans.length) { console.error(`contracts for non-active parameters: ${orphans.join(", ")}`); process.exit(1); }

  const params = activeParameters().filter((p) => !only || p.id.includes(only));
  console.log(`TARGETED MECHANIC MEASUREMENT — ${params.length} parameters`);
  console.log(`  seed batches ${SEED_BATCHES.join(" -> ")} (budget ${MAX_SEED_BUDGET}), escalating until activation is met`);
  console.log(`  contracts hash ${contractsHash().slice(0, 16)}   no holdout fixture is used\n`);

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
        const w = new Worker(self, { workerData: { harness: "c5-targeted", paramId: p.id } });
        w.on("message", (m) => { rows[i] = m; done++; process.stdout.write(`\r  ${done}/${params.length}`); });
        w.on("error", reject);
        w.on("exit", () => { active--; next(); });
      }
    };
    next();
  });
  const elapsed = Date.now() - t0;

  const activated = rows.filter((r) => r.activationMet);
  const unactivated = rows.filter((r) => !r.activationMet);

  const coverage = {
    activeParameters: params.length,
    exerciseContracts: params.length,
    activationVerified: activated.length,
    activationUnmet: unactivated.length,
    totalActivatedPossessions: rows.reduce((a, r) => a + r.activatedPossessions, 0),
    missingContracts: missing.length,
    orphanContracts: orphans.length,
  };

  const rec = reconcile({
    label: "targeted-fixture-coverage",
    counts: { activationVerified: activated.length, activationUnmet: unactivated.length },
    expectedTotal: params.length,
  });

  const { path } = writeArtifact("targeted-fixture-coverage", {
    coverage, reconciliation: rec, parameters: rows,
  }, {
    generationCommand: "npm run calibration:c5:targeted",
    extra: {
      parameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
      targetedMechanicFixtureVersion: TARGETED_FIXTURE_VERSION,
      contractsHash: contractsHash(),
      seedBatches: SEED_BATCHES, maxSeedBudget: MAX_SEED_BUDGET,
      elapsedMs: elapsed,
    },
  });

  console.log(`\n\n  ran in ${(elapsed / 1000).toFixed(1)}s\n`);
  console.log(`  exercise contracts          ${coverage.exerciseContracts}/${coverage.activeParameters}`);
  console.log(`  activation verified         ${coverage.activationVerified}`);
  console.log(`  activation UNMET            ${coverage.activationUnmet}`);
  console.log(`  activated possessions       ${coverage.totalActivatedPossessions}`);
  if (unactivated.length) {
    console.log(`\n  UNDER_EXERCISED_OR_UNREACHABLE (${unactivated.length}):`);
    for (const r of unactivated) {
      console.log(`    ${r.id.padEnd(42)} ${r.activatedPossessions}/${r.contract.activationMinimum} via ${r.contract.activationPredicate}`);
    }
  }
  console.log(`\n  reconciles: ${rec.reconciles}`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles ? 0 : 2);
}
