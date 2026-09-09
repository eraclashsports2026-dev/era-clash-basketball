#!/usr/bin/env node
// ── Synthetic Stress Holdout V2 — stage two, bound to CANDIDATE 2 ───────────
//   npm run validation:synthetic-candidate2 -- --help
//   npm run validation:synthetic-candidate2 -- --preflight
//   npm run validation:synthetic-candidate2 -- --run --unlock-holdout \
//     --unlock-synthetic-stress-holdout-v2 --operator="..." --reason="..."
//
// The set itself is unchanged and is NOT replaced. The 6C4C1 compatibility audit
// disposed it POLICY_COMPATIBLE_REBIND_REQUIRED: membership, metric definitions,
// guardrail meanings, competition definitions, the result and replay schemas and
// the runner interface are all preserved, so what changes is the identity binding
// and the development-derived thresholds. A replacement V3 would be required only
// if a metric or guardrail had changed meaning, and none did.
//
// What this command changes relative to the Candidate 1 command:
//   · the stage-one precondition names Historical Holdout V6, not V5. V5 is
//     consumed and FAILED, so a gate naming V5 could never clear — and worse, a
//     gate that merely required "a historical stage" would have been satisfied by
//     a failure. It requires V6 to exist, to have returned PASS, and to have run
//     the same core and parameter set.
//   · every bound hash is Candidate 2's.
//   · the derived thresholds are re-derived under Candidate 2 from the 14
//     development fixtures, never carried over from Candidate 1.
//   · modes are explicit and unknown flags are refused.
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, realSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { policyHash as acceptancePolicyHash, HOLDOUT } from "../../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { aggregate } from "../synthetic/evalSynthetic.mjs";
import { proveDisjoint } from "../synthetic/seeds.mjs";
import { buildEvaluator } from "./synthetic-stress-holdout-v2.mjs";

export const DIR = "data/validation/6c4c2";
export const DIR_B1S = "data/validation/6c4b1s";
export const DIR_C1 = "data/validation/6c4c1";
export const SET = "synthetic-stress-holdout-v2";
export const RUN_PATH = `${DIR}/synthetic-v2-candidate2-run.json`;

export const KNOWN_FLAGS = Object.freeze([
  "--help", "--preflight", "--run", "--resume",
  "--unlock-holdout", `--unlock-${SET}`, "--operator", "--reason",
]);

export const USAGE = `Synthetic Stress Holdout V2 — stage two, bound to Candidate 2

MODES (exactly one required)
  --help        print this and exit. Touches nothing.
  --preflight   verify the rebind read-only. Opens no seal, plays no game.
  --run         the one-time formal stress run. Requires --unlock-holdout,
                --unlock-${SET}, --operator and --reason.

STAGE ORDER
  This set may not be opened unless Historical Holdout V6 has been opened and
  returned PASS on the same candidate core and parameter set. Otherwise the
  command exits SYNTHETIC_ACCESS_REFUSED before the seal is touched. A synthetic
  stress pass says nothing about a candidate that failed the historical stage,
  and opening this set would consume a one-shot resource for no evidence.

Any unrecognised flag is refused.`;

/**
 * Every check that must hold BEFORE the seal is touched. Exported so the
 * command certification verifies the identical list against the same artifacts.
 */
export const preflightChecks = async () => {
  const checks = [];
  const must = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };

  const binding = existsSync(`${DIR}/synthetic-v2-candidate2-binding.json`)
    ? readArtifact("synthetic-v2-candidate2-binding", DIR).data : null;
  const c1policy = readArtifact("synthetic-v2-formal-policy", DIR_B1S).data;
  const compat = readArtifact("synthetic-v2-candidate2-compatibility", DIR_C1).data;
  const lock = readArtifact("candidate2-lock", DIR_C1).data;
  const margins = readArtifact("synthetic-v2-practical-margins", DIR_B1S);
  const surfacePlan = readArtifact("synthetic-v2-surface-plan", DIR_B1S);
  const samplePlan = readArtifact("synthetic-v2-sample-plan", DIR_B1S);
  const seeds = readArtifact("synthetic-v2-seeds", DIR_B1S);
  const registry = readArtifact("synthetic-v2-guardrail-registry", DIR_B1S);
  const aggPolicy = readArtifact("synthetic-v2-aggregation-policy", DIR_B1S);
  const schema = readArtifact("synthetic-v2-verdict-schema", DIR_B1S);
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  // ── stage order: Historical V6 must have PASSED ──────────────────────────
  // Enforced here, in code, before anything else. The Candidate 1 command named
  // V5; V5 is consumed and FAILED, so a gate still naming it could never clear.
  const v6Path = `${DIR}/historical-v6-results.json`;
  const v6 = existsSync(v6Path) ? readArtifact("historical-v6-results", DIR).data : null;
  must("historicalV6HasBeenRun", v6 != null,
    v6 ? "Historical V6 results artifact present"
      : `no Historical V6 results artifact at ${v6Path}. Stage one has not run, so stage two has nothing to confirm. SYNTHETIC_ACCESS_REFUSED.`);
  must("historicalV6Passed", v6?.outcome === RUN_OUTCOMES.PASS,
    v6 == null ? "cannot check: stage one has not run"
      : v6.outcome === RUN_OUTCOMES.PASS ? `Historical V6 outcome ${v6.outcome}, verdict ${v6.verdict}`
        : `Historical V6 outcome is ${v6.outcome}. A synthetic stress pass says nothing about a candidate that failed the historical stage. SYNTHETIC_ACCESS_REFUSED.`);
  must("historicalV6RanTheSameCandidate",
    v6 != null && v6.identity?.coreHash === core.aggregateCoreHash
      && v6.identity?.parameterSetHash === def.parameterSetHash,
    v6 == null ? "cannot check: stage one has not run"
      : `stage one core ${String(v6.identity?.coreHash).slice(0, 16)}... vs current ${core.aggregateCoreHash.slice(0, 16)}...`);
  must("stageOneIsNotHistoricalV5",
    !existsSync(`${DIR}/historical-holdout-v5-results.json`),
    "the precondition names Historical V6. Historical V5 is consumed and FAILED; a gate satisfied by V5 would be satisfied by a failure.");

  // ── the rebind exists and binds Candidate 2 ──────────────────────────────
  must("rebindArtifactPresent", binding != null,
    binding ? `binding ${binding.bindingHash?.slice(0, 16)}...` : `no synthetic-v2-candidate2-binding.json in ${DIR}`);
  must("dispositionIsRebindNotReplacement",
    compat.disposition === "POLICY_COMPATIBLE_REBIND_REQUIRED",
    `6C4C1 disposition ${compat.disposition} — a replacement V3 would be required only if a metric or guardrail had changed meaning, and ${compat.metricMeaningsChanged} did`);
  must("boundToCandidate2Core",
    binding?.hashes?.candidateCoreHash === core.aggregateCoreHash && core.aggregateCoreHash === lock.coreHash,
    `bound core ${String(binding?.hashes?.candidateCoreHash).slice(0, 16)}... equals the loaded core and the Candidate 2 lock`);
  must("notBoundToCandidate1Core",
    binding?.hashes?.candidateCoreHash !== c1policy.hashes.candidateCoreHash,
    `Candidate 1's core was ${c1policy.hashes.candidateCoreHash.slice(0, 16)}...; the rebind must not carry it forward`);
  must("parameterSetUnchanged", def.parameterSetHash === binding?.hashes?.parameterSetHash,
    "the parameter set has not moved since the rebind froze");
  must("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "no parameter has drifted from its registry default");
  must("calibrationVersionIsCandidate2",
    versionOf("possessionCalibrationVersion") === "1.2.0"
    && binding?.hashes?.possessionCalibrationVersion === "1.2.0",
    `calibration ${versionOf("possessionCalibrationVersion")}`);

  // ── the thresholds were re-derived, not carried over ─────────────────────
  must("thresholdsReDerivedUnderCandidate2",
    binding?.thresholdDerivation?.derivedUnder === "Candidate 2"
    && binding?.thresholdDerivation?.syntheticObservationsUsed === 0,
    binding ? `derived under ${binding.thresholdDerivation?.derivedUnder} from ${binding.thresholdDerivation?.developmentFixtures} development fixtures, ${binding.thresholdDerivation?.syntheticObservationsUsed} synthetic observations used`
      : "no binding to check");
  must("everyRequiredRebindItemAddressed",
    (binding?.rebindItems ?? []).length === compat.whatMustBeRebound.length
    && (binding?.rebindItems ?? []).every((r) => r.addressed === true),
    `${(binding?.rebindItems ?? []).filter((r) => r.addressed).length}/${compat.whatMustBeRebound.length} items the compatibility audit required`);

  // ── the shared package has not moved ────────────────────────────────────
  must("acceptancePolicyUnchanged", acceptancePolicyHash() === c1policy.hashes.acceptancePolicyHash,
    "the frozen guardrails have not moved");
  must("guardrailRegistryUnchanged", registry.outputHash === c1policy.hashes.guardrailRegistryHash,
    "the guardrail registry has not moved");
  must("marginPolicyUnchanged", margins.data.policyHash === c1policy.hashes.practicalMarginPolicyHash,
    "the practical-margin policy has not moved — margins are metric properties, not candidate properties");
  must("surfacePlanUnchanged", surfacePlan.data.surfacePlanHash === c1policy.hashes.surfacePlanHash,
    "the surface plan has not moved");
  must("samplePlanUnchanged", samplePlan.data.samplePlanHash === c1policy.hashes.samplePlanHash,
    "the sample plan has not moved");
  must("seedSetUnchanged", seeds.data.seedHash === c1policy.hashes.seedSetHash,
    "the seed manifest has not moved — the same seeds make a Candidate 2 result comparable to what a Candidate 1 result would have been");
  must("aggregationPolicyUnchanged", aggPolicy.outputHash === c1policy.hashes.aggregationPolicyHash,
    "the aggregation rule has not moved");
  must("verdictSchemaUnchanged", schema.outputHash === c1policy.hashes.verdictSchemaHash,
    "the verdict schema has not moved");
  must("membershipUnchanged",
    c1policy.membership.fixtureIds.length === SYNTHETIC_STRESS_HOLDOUT_V2.length
    && c1policy.membership.fixtureIds.every((id, i) => SYNTHETIC_STRESS_HOLDOUT_V2[i].id === id),
    `${SYNTHETIC_STRESS_HOLDOUT_V2.length} fixtures, in the frozen order`);
  must("seedsStillDisjoint", proveDisjoint(4096).totalOverlap === 0,
    "the synthetic seed domain still overlaps no prior population");
  must("volumeMeetsFrozenMinimum",
    samplePlan.data.fixtures.every((f) => f.totalGames >= HOLDOUT.minGamesPerHoldoutFixture),
    `every fixture plans at least ${HOLDOUT.minGamesPerHoldoutFixture} games`);
  must("setStillSealed", setAccessCount(SET) === 0 || process.argv.includes("--resume"),
    `${SET} access count ${setAccessCount(SET)}`);

  return { checks, binding, c1policy, compat, lock, margins, surfacePlan, samplePlan,
    seeds, registry, aggPolicy, schema, core, def, v6 };
};

export const buildIdentity = ({ binding, core, def, v6 }) => ({
  candidateId: "Candidate 2",
  coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
  calibrationVersion: versionOf("possessionCalibrationVersion"),
  bindingHash: binding.bindingHash,
  syntheticPolicyHash: binding.hashes.syntheticPolicyHash,
  guardrailRegistryHash: binding.hashes.guardrailRegistryHash,
  practicalMarginPolicyHash: binding.hashes.practicalMarginPolicyHash,
  surfacePlanHash: binding.hashes.surfacePlanHash,
  samplePlanHash: binding.hashes.samplePlanHash,
  seedSetHash: binding.hashes.seedSetHash,
  aggregationPolicyHash: binding.hashes.aggregationPolicyHash,
  verdictSchemaHash: binding.hashes.verdictSchemaHash,
  stageOneSet: "historical-holdout-v6",
  stageOneVerdict: v6?.verdict ?? null,
  stageOneRunHash: v6?.runHash ?? null,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (f, d = null) => { const a = argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=").slice(1).join("=") : d; };

  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.includes(a.split("=")[0]));
  if (unknown.length) { console.error(`REFUSED: unrecognised flag(s) ${unknown.join(", ")}\n`); console.error(USAGE); process.exit(2); }
  const modes = ["--help", "--preflight", "--run"].filter((m) => argv.includes(m));
  if (argv.includes("--help") || modes.length === 0) {
    if (modes.length === 0) console.error("REFUSED: a mode is required. The seal is reachable only from --run.\n");
    console.log(USAGE); process.exit(modes.length === 0 ? 2 : 0);
  }
  if (modes.length > 1) { console.error(`REFUSED: exactly one mode, got ${modes.join(" ")}`); process.exit(2); }
  const mode = modes[0];

  const pf = await preflightChecks();
  const failed = pf.checks.filter((c) => !c.ok);

  if (mode === "--preflight") {
    console.log("SYNTHETIC V2 (CANDIDATE 2) PREFLIGHT — no seal is touched by this mode\n");
    for (const c of pf.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}\n        ${c.detail}`);
    console.log(`\nPREFLIGHT: ${failed.length ? `SYNTHETIC_ACCESS_REFUSED (${failed.map((c) => c.name).join(", ")})` : "CLEAR"}`);
    console.log(`  ${SET} access count ${setAccessCount(SET)} — unchanged by --preflight`);
    process.exit(failed.length ? 2 : 0);
  }

  const operator = arg("operator"); const reason = arg("reason");
  const resume = argv.includes("--resume");
  if (!operator || !reason) { console.error("REFUSED: --operator and --reason are required for --run."); process.exit(2); }

  if (failed.length) {
    console.error("SYNTHETIC_ACCESS_REFUSED — the set was NOT opened.\n");
    for (const c of failed) console.error(`  ${c.name}: ${c.detail}`);
    console.error(`\n  ${SET} access count ${setAccessCount(SET)} (unchanged)`);
    process.exit(2);
  }

  const identity = buildIdentity(pf);
  const { surfacePlan, samplePlan, binding, aggPolicy } = pf;
  console.log("SYNTHETIC STRESS HOLDOUT V2 — ONE-TIME FORMAL STRESS RUN, CANDIDATE 2\n");
  console.log(`  operator ${operator}`);
  console.log(`  candidate ${identity.candidateId} core ${identity.coreHash.slice(0, 16)}... calibration ${identity.calibrationVersion}`);
  console.log(`  binding ${identity.bindingHash.slice(0, 16)}...  seeds ${identity.seedSetHash.slice(0, 16)}...`);
  console.log(`  stage one: Historical V6 ${pf.v6.outcome} (${pf.v6.verdict})`);
  console.log(`  ${samplePlan.data.fixtures.length} fixtures, ${samplePlan.data.totalGames.toLocaleString()} planned games\n`);

  const seal = await realSeal(SET);
  let state;
  try {
    state = runSealedSetOnce({
      seal, identity, members: SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id), runPath: RUN_PATH,
      reason, actor: operator, resume,
      evaluate: buildEvaluator({ surfacePlan: surfacePlan.data, samplePlan: samplePlan.data,
        policy: { ...pf.c1policy, thresholds: binding.thresholds, hashes: binding.hashes },
        log: (m) => console.log(m) }),
    });
  } catch (e) {
    if (e instanceof RunRefused) {
      console.error(`\nRUN REFUSED (${e.code}): ${e.message}`);
      console.error(`  ${SET} access count ${setAccessCount(SET)}`);
      process.exit(2);
    }
    throw e;
  }

  const agg = aggregate({ results: state.results, policy: { ...pf.c1policy, thresholds: binding.thresholds },
    aggregationPolicy: aggPolicy.data });
  const outcome = agg.outcome ?? (agg.pass ? RUN_OUTCOMES.PASS : RUN_OUTCOMES.FAIL);
  const finalVerdict = outcome === RUN_OUTCOMES.PASS
    ? pf.c1policy.outcomes.pass : pf.c1policy.outcomes.fail;

  const payload = {
    syntheticV2Candidate2ResultsVersion: "1.0.0",
    set: SET, stage: 2, verdict: finalVerdict, outcome, identity,
    accessEvent: state.accessEvent, accessCountBefore: state.accessCountBefore,
    accessCountAfter: seal.accessCount(),
    runStatus: state.status, runHash: state.runHash,
    fixturesEvaluated: state.results.length,
    stageOne: { set: "historical-holdout-v6", outcome: pf.v6.outcome, verdict: pf.v6.verdict, runHash: pf.v6.runHash },
    aggregate: agg,
    whatAPassDoesNotAuthorize: pf.c1policy.outcomes.whatAPassDoesNotAuthorize,
    results: state.results,
  };
  const { path } = writeArtifact("synthetic-v2-candidate2-results", payload, {
    generationCommand: "npm run validation:synthetic-candidate2 -- --run",
    dir: DIR, extra: { parameterSetHash: pf.def.parameterSetHash } });

  console.log(`\n  VERDICT: ${finalVerdict}`);
  console.log(`  access count: ${state.accessCountBefore} -> ${seal.accessCount()}`);
  console.log(`\nwrote ${path}`);
  process.exit(outcome === RUN_OUTCOMES.PASS ? 0 : 1);
}
