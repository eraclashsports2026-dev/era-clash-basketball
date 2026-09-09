#!/usr/bin/env node
// ── Synthetic Stress Holdout V2 — ONE-TIME formal stress run ────────────────
//   npm run validation:synthetic-v2 -- --unlock-holdout \
//     --unlock-synthetic-stress-holdout-v2 --operator="..." --reason="..."
//
// The second stage of Candidate 1's formal validation. It uses the SAME
// transactional runner Historical V4 and V5 use, so the set is opened once, the
// run resumes under the same access event after a crash, and a second
// independent run is refused.
//
// Stage order is enforced here, not by convention: the run refuses unless
// Historical Holdout V5 has already been opened and returned PASS. A synthetic
// stress pass means nothing about a candidate that failed the historical stage,
// and opening this set would consume it for no evidence.
//
// This file is imported by the dry run so the rehearsal exercises the EXACT
// code path the real run takes.
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, realSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { evaluateFixture, aggregate, SET as SET_VERDICTS } from "../synthetic/evalSynthetic.mjs";
import { synSurfaceSeed, proveDisjoint } from "../synthetic/seeds.mjs";

export const DIR = "data/validation/6c4b1s";
export const DIR_B1 = "data/validation/6c4b1";
export const SET = "synthetic-stress-holdout-v2";
export const RUN_PATH = `${DIR}/synthetic-v2-run.json`;

/**
 * Every check that must hold BEFORE the seal is touched. Exported so the dry
 * run verifies the identical list against the identical artifacts.
 */
export const preflightChecks = async () => {
  const out = [];
  const must = (name, ok, detail) => { out.push({ name, ok, detail }); return ok; };

  const policy = readArtifact("synthetic-v2-formal-policy", DIR).data;
  const margins = readArtifact("synthetic-v2-practical-margins", DIR);
  const surfacePlan = readArtifact("synthetic-v2-surface-plan", DIR);
  const samplePlan = readArtifact("synthetic-v2-sample-plan", DIR);
  const seeds = readArtifact("synthetic-v2-seeds", DIR);
  const registry = readArtifact("synthetic-v2-guardrail-registry", DIR);
  const aggPolicy = readArtifact("synthetic-v2-aggregation-policy", DIR);
  const schema = readArtifact("synthetic-v2-verdict-schema", DIR);
  const recert = readArtifact("candidate1-lock-recertification", DIR_B1).data;
  const dryRun = existsSync(`${DIR}/synthetic-v2-dry-run.json`)
    ? readArtifact("synthetic-v2-dry-run", DIR).data : null;

  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  // ── stage order: Historical V5 must have PASSED ──────────────────────────
  const v5Path = `${DIR_B1}/historical-holdout-v5-results.json`;
  const v5 = existsSync(v5Path) ? readArtifact("historical-holdout-v5-results", DIR_B1).data : null;
  must("historicalV5HasBeenRun", v5 != null,
    v5 ? "Historical V5 results artifact present" : `no Historical V5 results artifact at ${v5Path}. Stage one has not run, so stage two has nothing to confirm. SYNTHETIC_ACCESS_REFUSED.`);
  must("historicalV5Passed", v5?.outcome === RUN_OUTCOMES.PASS,
    v5 == null ? "cannot check: stage one has not run"
      : v5.outcome === RUN_OUTCOMES.PASS ? `Historical V5 outcome ${v5.outcome}, verdict ${v5.verdict}`
      : `Historical V5 outcome is ${v5.outcome}. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening this set would consume it for no evidence. SYNTHETIC_ACCESS_REFUSED.`);
  must("historicalV5RanTheSameCandidate",
    v5 == null ? false : v5.identity?.coreHash === core.aggregateCoreHash
      && v5.identity?.parameterSetHash === def.parameterSetHash,
    v5 == null ? "cannot check: stage one has not run"
      : `stage one core ${String(v5.identity?.coreHash).slice(0, 16)}... vs current ${core.aggregateCoreHash.slice(0, 16)}...`);

  // ── the package has not moved since it was frozen ────────────────────────
  must("dryRunPassed", dryRun?.pass === true,
    dryRun == null ? "no dry-run artifact: the runner has never been rehearsed" : `dry run pass=${dryRun.pass}`);
  must("candidateCoreUnchanged", core.aggregateCoreHash === policy.hashes.candidateCoreHash,
    `core ${core.aggregateCoreHash.slice(0, 16)}... vs policy ${String(policy.hashes.candidateCoreHash).slice(0, 16)}...`);
  must("parameterSetUnchanged", def.parameterSetHash === policy.hashes.parameterSetHash,
    "the parameter set has not moved since the policy froze");
  must("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "no parameter has drifted from its registry default");
  must("calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === policy.hashes.possessionCalibrationVersion,
    `calibration ${versionOf("possessionCalibrationVersion")}`);
  must("lockRevisionUnchanged", recert.lockRevision === policy.hashes.lockRevision,
    `lock revision ${recert.lockRevision}`);
  must("acceptancePolicyUnchanged", acceptancePolicyHash() === policy.hashes.acceptancePolicyHash,
    "the frozen guardrails have not moved");
  must("guardrailRegistryUnchanged", registry.outputHash === policy.hashes.guardrailRegistryHash,
    "the guardrail registry has not moved");
  must("marginPolicyUnchanged", margins.data.policyHash === policy.hashes.practicalMarginPolicyHash,
    "the practical-margin policy has not moved");
  must("surfacePlanUnchanged", surfacePlan.data.surfacePlanHash === policy.hashes.surfacePlanHash,
    "the surface plan has not moved");
  must("samplePlanUnchanged", samplePlan.data.samplePlanHash === policy.hashes.samplePlanHash,
    "the sample plan has not moved");
  must("seedSetUnchanged", seeds.data.seedHash === policy.hashes.seedSetHash,
    "the seed manifest has not moved");
  must("aggregationPolicyUnchanged", aggPolicy.outputHash === policy.hashes.aggregationPolicyHash,
    "the aggregation rule has not moved");
  must("verdictSchemaUnchanged", schema.outputHash === policy.hashes.verdictSchemaHash,
    "the verdict schema has not moved");
  must("membershipUnchanged", policy.membership.fixtureIds.length === SYNTHETIC_STRESS_HOLDOUT_V2.length
    && policy.membership.fixtureIds.every((id, i) => SYNTHETIC_STRESS_HOLDOUT_V2[i].id === id),
    `${SYNTHETIC_STRESS_HOLDOUT_V2.length} fixtures, in the frozen order`);
  must("seedsStillDisjoint", proveDisjoint(4096).totalOverlap === 0,
    "the synthetic seed domain still overlaps no prior population");
  must("volumeMeetsFrozenMinimum",
    samplePlan.data.fixtures.every((f) => f.totalGames >= HOLDOUT.minGamesPerHoldoutFixture),
    `every fixture plans at least ${HOLDOUT.minGamesPerHoldoutFixture} games`);
  must("setStillSealed", setAccessCount(SET) === 0 || process.argv.includes("--resume"),
    `access count ${setAccessCount(SET)}`);

  return { checks: out, policy, margins, surfacePlan, samplePlan, seeds, registry, aggPolicy, schema,
    recert, core, def, v5 };
};

/** The identity a resume must match. Exported so the dry run builds the same. */
export const buildIdentity = ({ policy, margins, surfacePlan, samplePlan, seeds, registry, aggPolicy, schema, recert, core, def }) => ({
  candidateId: recert.candidateId,
  candidateCommit: recert.recertifiedAtCommit,
  coreHash: core.aggregateCoreHash,
  parameterSetHash: def.parameterSetHash,
  calibrationVersion: versionOf("possessionCalibrationVersion"),
  lockRevision: recert.lockRevision,
  policyHash: policy.policyHash,
  acceptancePolicyHash: acceptancePolicyHash(),
  guardrailRegistryHash: registry.outputHash,
  practicalMarginPolicyHash: margins.data.policyHash,
  surfacePlanHash: surfacePlan.data.surfacePlanHash,
  samplePlanHash: samplePlan.data.samplePlanHash,
  seedSetHash: seeds.data.seedHash,
  aggregationPolicyHash: aggPolicy.outputHash,
  verdictSchemaHash: schema.outputHash,
  seedStream: "synthetic-stress-holdout-v2",
});

/** The evaluate closure. Exported so the dry run runs the same scorer. */
export const buildEvaluator = ({ surfacePlan, samplePlan, policy, seedStream = "synthetic-stress-holdout-v2", fixtures = SYNTHETIC_STRESS_HOLDOUT_V2, log = () => {} }) =>
  (fixtureId, fixtureIndex) => {
    const fixture = fixtures.find((f) => f.id === fixtureId);
    if (!fixture) throw new Error(`unknown fixture "${fixtureId}"`);
    const plan = surfacePlan.holdoutFixturePlan.find((p) => p.fixtureId === fixtureId)
      ?? surfacePlan.developmentFixturePlan?.find((p) => p.fixtureId === fixtureId);
    if (!plan) throw new Error(`no surface plan row for "${fixtureId}"`);
    const row = samplePlan.fixtures.find((f) => f.fixtureId === fixtureId);
    if (!row) throw new Error(`no sample plan row for "${fixtureId}"`);
    const t0 = performance.now();
    const record = evaluateFixture({
      fixture, fixtureIndex, surfacePlan: plan, samplePlanRow: row,
      seedFor: ({ surfaceSlot, pairIndex }) => synSurfaceSeed({ stream: seedStream, fixtureIndex, surfaceSlot, pairIndex }),
      thresholds: policy.thresholds, margins: policy.margins,
    });
    const secs = (performance.now() - t0) / 1000;
    log(`  ${fixtureId.padEnd(30)} ${record.verdict.padEnd(11)} ${String(record.totalGames).padStart(6)} games in ${secs.toFixed(1)}s  ${Object.entries(record.cells).filter(([, c]) => c.outcome === "FAIL").map(([k]) => k).join(", ") || "no failed cell"}`);
    return record;
  };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };

  // ── non-accessing modes, certified never to touch a seal ─────────────────
  if (process.argv.includes("--help")) {
    console.log(`Synthetic Stress Holdout V2 — one-time formal stress run

  npm run validation:synthetic-v2 -- --unlock-holdout --unlock-${SET} \\
    --operator="<name>" --reason="<why>"

  --help        print this and exit. Touches no seal.
  --preflight   run every pre-access verification and exit. Touches no seal.
  --dry-run     point at the rehearsal instead (npm run syn:dryrun). Touches no seal.
  --resume      continue an interrupted run under the SAME access event.

  Stage order: this refuses unless Historical Holdout V5 has been opened and
  returned PASS. The set is opened exactly once; a second independent run is
  refused, and a crash is resumed rather than restarted.`);
    process.exit(0);
  }
  if (process.argv.includes("--dry-run")) {
    console.log("This command does not rehearse itself. Run: npm run syn:dryrun");
    console.log("The dry run imports this module and exercises the same evaluator and the same transactional runner against a disposable seal on non-holdout fixtures.");
    process.exit(0);
  }
  const preflightOnly = process.argv.includes("--preflight");
  const pf = await preflightChecks();
  if (preflightOnly) {
    console.log("SYNTHETIC V2 PREFLIGHT — no seal is touched by this mode\n");
    for (const c of pf.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}\n        ${c.detail}`);
    const bad = pf.checks.filter((c) => !c.ok);
    console.log(`\nPREFLIGHT: ${bad.length ? `REFUSED (${bad.map((c) => c.name).join(", ")})` : "CLEAR"}`);
    console.log(`  ${SET} access count ${setAccessCount(SET)} — unchanged by --preflight`);
    process.exit(bad.length ? 2 : 0);
  }

  const operator = arg("operator"); const reason = arg("reason");
  const resume = process.argv.includes("--resume");
  if (!operator || !reason) { console.error("REFUSED: --operator and --reason are required."); process.exit(2); }

  const failed = pf.checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error("SYNTHETIC_ACCESS_REFUSED — the set was NOT opened.\n");
    for (const c of failed) console.error(`  ${c.name}: ${c.detail}`);
    console.error(`\n  ${SET} access count ${setAccessCount(SET)} (unchanged)`);
    process.exit(2);
  }

  const identity = buildIdentity(pf);
  const { policy, surfacePlan, samplePlan, aggPolicy } = pf;

  console.log("SYNTHETIC STRESS HOLDOUT V2 — ONE-TIME FORMAL STRESS RUN\n");
  console.log(`  operator ${operator}`);
  console.log(`  candidate ${identity.candidateId} (lock revision ${identity.lockRevision}) core ${identity.coreHash.slice(0, 16)}...`);
  console.log(`  policy ${identity.policyHash.slice(0, 16)}...  seeds ${identity.seedSetHash.slice(0, 16)}...`);
  console.log(`  stage one: Historical V5 ${pf.v5.outcome} (${pf.v5.verdict})`);
  console.log(`  ${samplePlan.data.fixtures.length} fixtures, ${samplePlan.data.totalGames.toLocaleString()} planned games\n`);

  const seal = await realSeal(SET);
  let state;
  try {
    state = runSealedSetOnce({
      seal, identity, members: SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id), runPath: RUN_PATH,
      reason, actor: operator, resume,
      evaluate: buildEvaluator({ surfacePlan: surfacePlan.data, samplePlan: samplePlan.data,
        policy, log: (m) => console.log(m) }),
    });
  } catch (e) {
    if (e instanceof RunRefused) {
      console.error(`\nRUN REFUSED (${e.code}): ${e.message}`);
      console.error(`  ${SET} access count ${setAccessCount(SET)}`);
      process.exit(2);
    }
    throw e;
  }

  const agg = aggregate({ records: state.results, aggregationPolicy: aggPolicy.data });
  const def = defaultRuntimeParameterSet();
  const existential = state.results.filter((r) => r.cells.requireConstructionCanBeatHigherOvr?.countsTowardExistentialBar);
  const existentialMet = existential.length >= 1;
  const verdict = agg.verdict === SET_VERDICTS.PASS && !existentialMet
    ? SET_VERDICTS.INVALID_RUN : agg.verdict;

  const payload = {
    syntheticStressValidationAttemptVersion: "1.0.0",
    set: SET, verdict, outcome: verdict === SET_VERDICTS.PASS ? RUN_OUTCOMES.PASS
      : verdict === SET_VERDICTS.FAIL ? RUN_OUTCOMES.FAIL : RUN_OUTCOMES.INVALID_RUN,
    identity, accessEvent: state.accessEvent,
    accessCountBefore: state.accessCountBefore, accessCountAfter: seal.accessCount(),
    runStatus: state.status, runHash: state.runHash,
    stageOne: { set: "historical-holdout-v5", outcome: pf.v5.outcome, verdict: pf.v5.verdict },
    fixturesEvaluated: state.results.length,
    aggregation: agg,
    constructionExistentialBar: { bar: policy.thresholds.constructionExistentialBar,
      fixturesClearingIt: existential.map((r) => r.fixtureId), met: existentialMet,
      effect: existentialMet ? "satisfied" : "the set cannot PASS: requireConstructionCanBeatHigherOvr was never demonstrated on any applicable fixture, so the verdict is INVALID_RUN rather than a pass by absence of failure" },
    thresholds: policy.thresholds, margins: policy.margins,
    results: state.results,
    preflight: pf.checks,
  };
  writeArtifact("synthetic-v2-results", payload, {
    generationCommand: "npm run validation:synthetic-v2",
    sourceArtifacts: [`${DIR}/synthetic-v2-formal-policy.json`, `${DIR}/synthetic-v2-seeds.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });

  console.log(`\n  fixture verdicts: ${Object.entries(agg.fixtureVerdicts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (agg.shortfalls.length) console.log(`  guardrails not decided often enough: ${agg.shortfalls.map((s) => `${s.guardrailId} ${s.decidedPass}/${s.required}`).join(", ")}`);
  console.log(`\nSYNTHETIC V2 VERDICT: ${verdict}`);
  process.exit(verdict === SET_VERDICTS.PASS ? 0 : 1);
}
