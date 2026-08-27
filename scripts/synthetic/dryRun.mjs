#!/usr/bin/env node
// ── WS10: dry-run the EXACT Synthetic V2 runner ──────────────────────────────
//   npm run syn:dryrun [-- --pairs=8]
//
// Exercises runSealedSetOnce and the real evaluator on a DISPOSABLE mock seal
// over the non-holdout mock stress set, plus the real runner's preflight
// verifications against the real frozen artifacts.
//
// Historical V4's runner crashed AFTER consuming its unlock, because its dry
// run had rehearsed a simplified path. Nothing is simplified here: the same
// preflight function, the same identity builder, the same evaluator and the
// same transactional runner. Only the seal, the fixtures and the volumes differ.
import { existsSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, mockSeal, RunRefused, RUN_STATES } from "../validation/runner.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { preflightChecks, buildIdentity, buildEvaluator } from "../validation/synthetic-stress-holdout-v2.mjs";
import { CELL, FIXTURE, SET as SET_VERDICTS, applyCatastrophicRule, fixtureVerdictFrom,
  ceilingCell, floorCell, bandCell, zeroCountCell, aggregate } from "./evalSynthetic.mjs";
import { mockFixtures } from "./mockSet.mjs";
import { planFor } from "./surfaces.mjs";
import { synSurfaceSeed } from "./seeds.mjs";
import { person } from "./ratings.mjs";
import { DIR } from "./preflight.mjs";

const MOCK_LOG = ".cache/validation/syn-dryrun-mock.jsonl";
const MOCK_RUN = ".cache/validation/syn-dryrun-run.json";
const MOCK_SET = "synthetic-v2-mock";

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 64);  // enough that a win-rate gate is not pure noise; the
                                   // rehearsal still proves the PATH, not the statistics
  const def = defaultRuntimeParameterSet();
  const checks = []; const fail = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); if (!pass) fail.push(name);
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  const synAccessBefore = setAccessCount("synthetic-stress-holdout-v2");
  const v5AccessBefore = setAccessCount("historical-holdout-v5");
  for (const p of [MOCK_LOG, MOCK_RUN]) if (existsSync(p)) rmSync(p);

  console.log(`SYNTHETIC V2 RUNNER DRY RUN — exact code path, disposable seal, non-holdout fixtures\n`);
  console.log("1 — PREFLIGHT VERIFICATIONS (the real runner's function, against the real artifacts)\n");

  const pf = await preflightChecks();
  const byName = Object.fromEntries(pf.checks.map((c) => [c.name, c]));
  check("preflightFunctionIsTheRunnersOwn", pf.checks.length >= 18,
    `${pf.checks.length} checks returned by the runner's exported preflightChecks(), not a copy maintained here`);
  check("stageOrderRefusesBeforeHistoricalV5",
    byName.historicalV5HasBeenRun?.ok === false && byName.historicalV5Passed?.ok === false,
    `Historical V5 has not run, so both stage-order checks correctly refuse: "${byName.historicalV5HasBeenRun?.detail?.slice(0, 90)}..."`);
  const packageChecks = ["candidateCoreUnchanged", "parameterSetUnchanged", "zeroParameterDrift",
    "calibrationVersionUnchanged", "lockRevisionUnchanged", "acceptancePolicyUnchanged",
    "guardrailRegistryUnchanged", "marginPolicyUnchanged", "surfacePlanUnchanged",
    "samplePlanUnchanged", "seedSetUnchanged", "aggregationPolicyUnchanged", "verdictSchemaUnchanged",
    "membershipUnchanged", "seedsStillDisjoint", "volumeMeetsFrozenMinimum", "setStillSealed"];
  const packageOk = packageChecks.filter((n) => byName[n]?.ok);
  check("everyPackageHashVerifies", packageOk.length === packageChecks.length,
    `${packageOk.length}/${packageChecks.length} package identity checks pass: ${packageChecks.filter((n) => !byName[n]?.ok).join(", ") || "all of them"}`);
  check("preflightIsNonAccessing",
    setAccessCount("synthetic-stress-holdout-v2") === synAccessBefore
    && setAccessCount("historical-holdout-v5") === v5AccessBefore,
    `synthetic access ${setAccessCount("synthetic-stress-holdout-v2")}, historical V5 access ${setAccessCount("historical-holdout-v5")} — both unchanged by running the preflight`);

  console.log("\n2 — THE DUAL GATE (the exact cell functions the evaluator calls)\n");
  const cc = ceilingCell({ observed: 0.30, se: 0.001, ceiling: 0.60, margin: 0.01 });
  const ccFail = ceilingCell({ observed: 0.65, se: 0.001, ceiling: 0.60, margin: 0.01 });
  const ccInd = ceilingCell({ observed: 0.598, se: 0.001, ceiling: 0.60, margin: 0.01 });
  check("ceilingGatePassesFailsAndAbstains",
    cc.outcome === CELL.PASS && ccFail.outcome === CELL.FAIL && ccInd.outcome === CELL.INDETERMINATE,
    `0.30 -> PASS, 0.65 -> FAIL, 0.598 (inside the 0.01 margin of 0.60) -> INDETERMINATE`);
  const fc = floorCell({ observed: 16, se: 0.3, floor: 13, margin: 0.83 });
  const fcFail = floorCell({ observed: 11, se: 0.3, floor: 13, margin: 0.83 });
  const fcInd = floorCell({ observed: 13.5, se: 0.3, floor: 13, margin: 0.83 });
  check("floorGatePassesFailsAndAbstains",
    fc.outcome === CELL.PASS && fcFail.outcome === CELL.FAIL && fcInd.outcome === CELL.INDETERMINATE,
    `16 -> PASS, 11 -> FAIL, 13.5 (inside the 0.83 margin of 13) -> INDETERMINATE`);
  const bc = bandCell({ observed: 0.50, se: 0.01, min: 0.35, max: 0.65, margin: 0.033 });
  const bcLow = bandCell({ observed: 0.30, se: 0.01, min: 0.35, max: 0.65, margin: 0.033 });
  const bcHigh = bandCell({ observed: 0.70, se: 0.01, min: 0.35, max: 0.65, margin: 0.033 });
  const bcInd = bandCell({ observed: 0.36, se: 0.01, min: 0.35, max: 0.65, margin: 0.033 });
  check("bandGateHandlesBothEdgesAndAbstains",
    bc.outcome === CELL.PASS && bcLow.outcome === CELL.FAIL && bcHigh.outcome === CELL.FAIL && bcInd.outcome === CELL.INDETERMINATE,
    `0.50 -> PASS, 0.30 -> FAIL low, 0.70 -> FAIL high, 0.36 (inside the margin of the 0.35 edge) -> INDETERMINATE`);
  check("countGateHasNoMargin",
    zeroCountCell({ observed: 0, what: "x" }).outcome === CELL.PASS
    && zeroCountCell({ observed: 1, what: "x" }).outcome === CELL.FAIL
    && zeroCountCell({ observed: 0, what: "x" }).practicalMargin === 0,
    "0 -> PASS, 1 -> FAIL, margin 0: a count has no sampling noise, so one violation is one failure");
  check("nullNeverBecomesZero",
    ceilingCell({ observed: null, se: null, ceiling: 0.6, margin: 0.01 }).outcome === CELL.NOT_MEASURED
    && ceilingCell({ observed: null, se: null, ceiling: 0.6, margin: 0.01 }).observed === null
    && floorCell({ observed: null, se: null, floor: 13, margin: 0.8 }).observed === null
    && bandCell({ observed: null, se: null, min: 0.35, max: 0.65, margin: 0.03 }).observed === null,
    "an unmeasured observation stays null and yields NOT_MEASURED — it is never coerced to 0, and 0 would have read as a catastrophic failure on a floor gate");

  console.log("\n3 — THE CATASTROPHIC RULE\n");
  const fakeCells = {
    requireZeroInvariantFailures: { outcome: CELL.FAIL, observed: 3 },
    requireZeroImpossibleResults: { outcome: CELL.PASS, observed: 0 },
    requireSameSeedReplay: { outcome: CELL.PASS, observed: 0 },
    forbidUniversalActionDominance: { outcome: CELL.PASS, observed: 0.2 },
    requireNewSeedVariance: { outcome: CELL.PASS, observed: 16 },
    forbidUniversalShellDominance: { outcome: CELL.NOT_APPLICABLE, observed: null },
  };
  const after = applyCatastrophicRule(fakeCells);
  check("catastrophicFailureDemotesEveryOtherCell",
    after.cells.forbidUniversalActionDominance.outcome === CELL.INDETERMINATE
    && after.cells.requireNewSeedVariance.outcome === CELL.INDETERMINATE
    && after.cells.forbidUniversalActionDominance.demotedByCatastrophicRule === true,
    `an invariant failure demoted ${Object.values(after.cells).filter((c) => c.demotedByCatastrophicRule).length} passing cells to INDETERMINATE, so a contradicted game grants no pass credit`);
  check("catastrophicRuleLeavesNotApplicableAlone",
    after.cells.forbidUniversalShellDominance.outcome === CELL.NOT_APPLICABLE,
    "a NOT_APPLICABLE cell is not demoted — there was nothing to measure, so there is nothing to discredit");
  check("catastrophicFailureStillFailsTheFixture",
    fixtureVerdictFrom(after.cells) === FIXTURE.FAIL,
    "the fixture verdict is FAIL, not INVALID_RUN: an invariant violation is the candidate's failure, not the apparatus's");
  check("allIndeterminateFixtureCannotPass",
    fixtureVerdictFrom({ a: { outcome: CELL.INDETERMINATE }, b: { outcome: CELL.NOT_APPLICABLE } }) === FIXTURE.INVALID_RUN,
    "a fixture with no decided cell is INVALID_RUN, never a pass by absence of failure");
  check("notMeasuredMakesTheFixtureInvalid",
    fixtureVerdictFrom({ a: { outcome: CELL.PASS }, b: { outcome: CELL.NOT_MEASURED } }) === FIXTURE.INVALID_RUN,
    "a missing measurement is an apparatus fault and invalidates the fixture rather than failing the candidate");

  console.log("\n4 — SEED ADDRESSING\n");
  check("everySurfaceSlotGivesADistinctSeed",
    new Set(["MIRROR", "ZONE_ASYMMETRIC", "ZONE_ABLATION_TWIN", "VS_COHERENT_LOWER_CONTROL",
      "VS_ROLE_MATCHED_UPGRADE", "SERIES_BEST_OF_7", "SEASONS_OF_82", "TOURNAMENT"]
      .map((slot) => synSurfaceSeed({ fixtureIndex: 4, surfaceSlot: slot, pairIndex: 9 }))).size === 8,
    "the eight surface slots produce eight different seeds at the same fixture and pair index");
  check("addressingIsPure",
    synSurfaceSeed({ fixtureIndex: 2, surfaceSlot: "MIRROR", pairIndex: 5 })
      === synSurfaceSeed({ fixtureIndex: 2, surfaceSlot: "MIRROR", pairIndex: 5 }),
    "the same address returns the same seed, so a resumed run re-derives exactly what it had");
  check("dryRunStreamIsDisjointFromTheFormalStream",
    synSurfaceSeed({ stream: "synthetic-v2-dryrun", fixtureIndex: 0, surfaceSlot: "MIRROR", pairIndex: 0 })
      !== synSurfaceSeed({ stream: "synthetic-stress-holdout-v2", fixtureIndex: 0, surfaceSlot: "MIRROR", pairIndex: 0 }),
    "the rehearsal draws from its own stream, so it cannot consume a seed the formal run will use");

  console.log("\n5 — THE TRANSACTIONAL RUNNER, ON A DISPOSABLE SEAL\n");
  const mocks = mockFixtures();
  const mockSurfacePlan = { holdoutFixturePlan: planFor(mocks, { forceAllSurfaces: true }),
    zoneDecidableFixtureCount: 0 };
  const mockSample = {
    fixtures: mocks.map((f) => ({ fixtureId: f.id, purpose: f.purpose, era: f.era,
      surfaces: { MIRROR: { pairs, games: pairs * 2, adjudicates: true },
        ZONE_ASYMMETRIC: { pairs, games: pairs * 2, adjudicates: true },
        ZONE_ABLATION_TWIN: { pairs: Math.max(2, pairs >> 1), games: Math.max(2, pairs >> 1) * 2, adjudicates: false },
        VS_COHERENT_LOWER_CONTROL: { pairs, games: pairs * 2, adjudicates: true },
        VS_ROLE_MATCHED_UPGRADE: { pairs, games: pairs * 2, adjudicates: true } },
      modes: { REPLAY: { seeds: Math.min(4, pairs) },
        SERIES_BEST_OF_7: { series: f.id === "mock-coach-toolkit" ? 3 : 0 },
        SEASONS_OF_82: { seasons: f.id === "mock-season" ? 1 : 0 } } })),
  };
  const identity = buildIdentity(pf);
  const evaluate = buildEvaluator({ surfacePlan: mockSurfacePlan, samplePlan: mockSample,
    policy: pf.policy, seedStream: "synthetic-v2-dryrun", fixtures: mocks, log: () => {} });
  const seal = mockSeal(MOCK_SET, MOCK_LOG);

  // refuses while sealed
  let refusedSealed = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: "dry run", actor: "dry-run", evaluate });
  } catch (e) { refusedSealed = e; }
  check("refusesWhileSealed", refusedSealed instanceof RunRefused && refusedSealed.code === "MOCK_SEALED",
    `without the unlock flag the runner refused with ${refusedSealed?.code}`);
  process.argv.push(`--unlock-${MOCK_SET}`);

  // refuses without a reason
  let refusedNoReason = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: null, actor: "dry-run", evaluate });
  } catch (e) { refusedNoReason = e; }
  check("refusesWithoutAReason", refusedNoReason instanceof RunRefused && refusedNoReason.code === "NO_REASON",
    `an unlock without a stated reason refused with ${refusedNoReason?.code}`);

  // resume with nothing to resume
  let nothing = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: "dry run", actor: "dry-run", evaluate, resume: true });
  } catch (e) { nothing = e; }
  check("refusesResumeWithNoRunState", nothing instanceof RunRefused && nothing.code === "NOTHING_TO_RESUME",
    `--resume with no prior state refused with ${nothing?.code}`);

  // crash partway, then resume under the SAME access event
  const CRASH_AT = 3;
  let crashed = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: "dry run", actor: "dry-run",
      evaluate: (id, i) => { if (i === CRASH_AT) throw new Error("simulated crash"); return evaluate(id, i); } });
  } catch (e) { crashed = e; }
  const midState = JSON.parse(readFileSync(MOCK_RUN, "utf8"));
  check("crashLeavesResumableState",
    crashed?.message === "simulated crash" && midState.status === RUN_STATES.RUNNING
    && midState.completedMembers.length === CRASH_AT,
    `crashed on member ${CRASH_AT}; run state is ${midState.status} with ${midState.completedMembers.length} of ${mocks.length} members written`);
  check("accessEventConsumedByTheCrash", seal.accessCount() === 1 && midState.accessEvent != null,
    `access count ${seal.accessCount()} — the set was seen, so the event is spent whether or not the process finished`);
  check("incrementalWriteAfterEveryMember", midState.results.length === CRASH_AT,
    `${midState.results.length} results on disk before the crash, so a crash loses at most one member's work`);

  let mismatched = null;
  try {
    runSealedSetOnce({ seal, identity: { ...identity, coreHash: "0".repeat(64) },
      members: mocks.map((f) => f.id), runPath: MOCK_RUN, reason: "dry run", actor: "dry-run", evaluate, resume: true });
  } catch (e) { mismatched = e; }
  check("refusesResumeOnIdentityMismatch", mismatched instanceof RunRefused && mismatched.code === "IDENTITY_MISMATCH",
    `a resume under a different core hash refused with ${mismatched?.code} — a resume must continue the same candidate`);

  const resumed = runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
    reason: "dry run", actor: "dry-run", evaluate, resume: true });
  check("resumeCompletesUnderTheSameAccessEvent",
    resumed.status === RUN_STATES.COMPLETE && seal.accessCount() === 1
    && JSON.stringify(resumed.accessEvent) === JSON.stringify(midState.accessEvent),
    `run COMPLETE with access count still ${seal.accessCount()} and the same access event — the resume did not open the set again`);
  check("resumeEvaluatedEveryRemainingMember",
    resumed.results.length === mocks.length && new Set(resumed.completedMembers).size === mocks.length,
    `${resumed.results.length} of ${mocks.length} members evaluated across the crash and the resume`);
  check("completedRunHasARunHash", typeof resumed.runHash === "string" && resumed.runHash.length === 64,
    `runHash ${resumed.runHash.slice(0, 16)}...`);

  let already = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: "dry run", actor: "dry-run", evaluate, resume: true });
  } catch (e) { already = e; }
  check("refusesResumeOnACompletedRun", already instanceof RunRefused && already.code === "ALREADY_COMPLETE",
    `resuming a COMPLETE run refused with ${already?.code}`);

  let second = null;
  try {
    runSealedSetOnce({ seal, identity, members: mocks.map((f) => f.id), runPath: MOCK_RUN,
      reason: "dry run", actor: "dry-run", evaluate });
  } catch (e) { second = e; }
  check("refusesASecondIndependentRun", second instanceof RunRefused && second.code === "SECOND_RUN_REFUSED",
    `a fresh run against an already-opened set refused with ${second?.code} — a second run would not be independent evidence`);

  console.log("\n6 — THE EVALUATOR'S OUTPUT ON THE MOCK SET\n");
  const results = resumed.results;
  const requiredCells = ["requireZeroInvariantFailures", "requireZeroImpossibleResults",
    "forbidUniversalActionDominance", "forbidUniversalShellDominance", "requireSameSeedReplay",
    "requireNewSeedVariance", "requireConstructionCanBeatHigherOvr", "requireExtremeTalentRemainsMeaningful"];
  check("everyMemberHasEveryCell",
    results.every((r) => requiredCells.every((k) => r.cells[k]?.outcome)),
    `all ${results.length} members carry all ${requiredCells.length} guardrail cells`);
  check("everyCellOutcomeIsFromTheClosedVocabulary",
    results.every((r) => Object.values(r.cells).every((c) => Object.values(CELL).includes(c.outcome))),
    `every cell outcome is one of ${Object.values(CELL).join("/")}`);
  const zoneLegalResults = results.filter((r) => ["2000s", "2010s", "2020s"].includes(r.era));
  const zoneIllegalResults = results.filter((r) => !["2000s", "2010s", "2020s"].includes(r.era));
  check("zoneLegalMembersProduceAShellObservation",
    zoneLegalResults.length > 0 && zoneLegalResults.every((r) => r.cells.forbidUniversalShellDominance.observed != null),
    `${zoneLegalResults.length} zone-legal members all produced a shell win rate`);
  check("zoneIllegalMembersAreNotApplicableNotZero",
    zoneIllegalResults.length > 0 && zoneIllegalResults.every((r) =>
      r.cells.forbidUniversalShellDominance.outcome === CELL.NOT_APPLICABLE
      && r.cells.forbidUniversalShellDominance.observed === null),
    `${zoneIllegalResults.length} zone-illegal members are NOT_APPLICABLE with a null observation, and each carries the structural zero-zone outcome`);
  check("zoneIllegalMembersRealizedZeroZone",
    zoneIllegalResults.every((r) => r.cells.forbidUniversalShellDominance.realizedZonePossessions === 0),
    `no zone possession was realized in any zone-illegal era, checked structurally rather than assumed`);
  check("theAblationTwinRanAndRealizedNoZone",
    zoneLegalResults.every((r) => r.measured.zoneAsymmetric.twin?.zone.realizedZonePossessions === 0),
    "the diagnostic twin ran with zone resolution disabled and realized zero zone possessions, so it isolates the coach confound");
  check("theShellCellReportsItsConfoundDiagnostic",
    zoneLegalResults.every((r) => r.cells.forbidUniversalShellDominance.coachOnlyWinRate != null
      && "shellAttributable" in r.cells.forbidUniversalShellDominance),
    "every shell cell carries the twin's coach-only win rate and an attribution flag, so a breach can be judged rather than just recorded");
  // NOT_APPLICABLE is a designed outcome here, not a gap. mock-role-overlap is
  // the weakest five in the pool, so no coherent five sits strictly below it
  // and the construction surface genuinely cannot be posed — which is exactly
  // the CONTROL_PRECONDITION_UNREACHABLE branch this rehearsal should exercise.
  const lowerObserved = results.filter((r) => r.measured.vsCoherentLowerControl.winRate?.value != null);
  const lowerNA = results.filter((r) => r.measured.vsCoherentLowerControl.applicable === false);
  const upgradeObserved = results.filter((r) => r.measured.vsRoleMatchedUpgrade.winRate?.value != null);
  check("bothControlSurfacesWereExercised",
    lowerObserved.length >= 1 && upgradeObserved.length >= 1,
    `the construction surface produced observations on ${lowerObserved.length} members and the upgrade surface on ${upgradeObserved.length}`);
  check("everyMemberEitherObservesOrDocumentsWhyNot",
    results.every((r) => (r.measured.vsCoherentLowerControl.winRate?.value != null
        || (r.measured.vsCoherentLowerControl.applicable === false && r.measured.vsCoherentLowerControl.reason))
      && (r.measured.vsRoleMatchedUpgrade.winRate?.value != null
        || (r.measured.vsRoleMatchedUpgrade.applicable === false && r.measured.vsRoleMatchedUpgrade.reason))),
    `${lowerNA.length} member(s) could not pose the construction claim and each carries a stated reason rather than a silent gap`);
  check("theUnreachablePreconditionBranchWasExercised",
    lowerNA.length >= 1 && lowerNA.every((r) => r.cells.requireConstructionCanBeatHigherOvr.outcome === CELL.NOT_APPLICABLE
      && r.cells.requireConstructionCanBeatHigherOvr.observed === null),
    lowerNA.length
      ? `${lowerNA.map((r) => r.fixtureId).join(", ")} hit CONTROL_PRECONDITION_UNREACHABLE and became NOT_APPLICABLE with a null observation, so an unposable claim contributes neither pass credit nor failure`
      : "no member exercised the unreachable-precondition branch, so it remains unrehearsed");
  check("replayWasExactOnEveryMember",
    results.every((r) => r.replayMismatchCount === 0),
    `zero replay mismatches across ${results.reduce((a, r) => a + r.measured.mirror.replay.replaySeedsChecked, 0)} designated seeds`);
  check("competitionModesRan",
    results.some((r) => r.measured.modes.seriesBestOf7?.games > 0)
    && results.some((r) => r.measured.modes.seasonsOf82?.games > 0),
    `series play ran on ${results.filter((r) => r.measured.modes.seriesBestOf7).map((r) => r.fixtureId).join(", ")} and season play on ${results.filter((r) => r.measured.modes.seasonsOf82).map((r) => r.fixtureId).join(", ")}`);
  const failingCells = results.flatMap((r) => Object.entries(r.cells)
    .filter(([, c]) => c.outcome === CELL.FAIL)
    .map(([k, c]) => ({ fixture: r.fixtureId, guardrail: k, observed: c.observed, threshold: c.threshold })));
  const structuralFailures = failingCells.filter((f) =>
    ["requireZeroInvariantFailures", "requireZeroImpossibleResults", "requireSameSeedReplay"].includes(f.guardrail));
  check("noStructuralOrDeterminismCellFailed", structuralFailures.length === 0,
    failingCells.length
      ? `${failingCells.length} cell failure(s) at rehearsal volume, all on sampled win-rate and variance gates (${[...new Set(failingCells.map((f) => f.guardrail))].join(", ")}); zero on the count-based structural and determinism gates. At ${pairs * 2} games per surface a win rate carries a standard error near ${(0.5 / Math.sqrt(pairs * 2)).toFixed(3)}, so band breaches are expected — the rehearsal proves the path, and the statistics come from the frozen volumes.`
      : "no cell failed at all");
  check("everyMemberIsStructurallyClean",
    results.every((r) => r.structuralTotals.invariantViolationCount === 0
      && r.structuralTotals.impossibleScoreCount === 0 && r.structuralTotals.finalTieCount === 0),
    `${results.reduce((a, r) => a + r.totalGames, 0).toLocaleString()} games, zero invariant violations, zero impossible scores, zero ties`);

  console.log("\n7 — AGGREGATION\n");
  const agg = aggregate({ records: results, aggregationPolicy: pf.aggPolicy.data });
  check("aggregationProducesAVerdictFromTheClosedVocabulary",
    Object.values(SET_VERDICTS).includes(agg.verdict),
    `set verdict ${agg.verdict} (fixture verdicts: ${Object.entries(agg.fixtureVerdicts).map(([k, v]) => `${k}=${v}`).join(", ")})`);
  const injectedFail = aggregate({
    records: [...results.slice(1), { ...results[0], verdict: FIXTURE.FAIL }],
    aggregationPolicy: pf.aggPolicy.data });
  check("oneFixtureFailureFailsTheSet", injectedFail.verdict === SET_VERDICTS.FAIL,
    "a single FAILed fixture takes the set to SYNTHETIC_HOLDOUT_V2_FAIL — zero fixture failures are tolerated");
  const injectedInvalid = aggregate({
    records: [...results.slice(1), { ...results[0], verdict: FIXTURE.INVALID_RUN }],
    aggregationPolicy: pf.aggPolicy.data });
  check("oneInvalidFixturePreventsAPass", injectedInvalid.verdict !== SET_VERDICTS.PASS,
    `an INVALID_RUN fixture takes the set to ${injectedInvalid.verdict} rather than a pass`);
  const allIndeterminate = aggregate({
    records: results.map((r) => ({ ...r, verdict: FIXTURE.PASS,
      cells: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, { ...c, outcome: CELL.INDETERMINATE }])) })),
    aggregationPolicy: pf.aggPolicy.data });
  check("anUndecidedRunCannotPass", allIndeterminate.verdict === SET_VERDICTS.INVALID_RUN
    && allIndeterminate.shortfalls.length > 0,
    `with every cell INDETERMINATE the set is INVALID_RUN with ${allIndeterminate.shortfalls.length} guardrails short of their minimum decided count — a run cannot pass by being unmeasurable`);

  console.log("\n8 — HOLDOUT ISOLATION\n");
  const synAccessAfter = setAccessCount("synthetic-stress-holdout-v2");
  const v5AccessAfter = setAccessCount("historical-holdout-v5");
  check("syntheticV2NeverOpened", synAccessAfter === 0 && synAccessBefore === 0,
    `synthetic-stress-holdout-v2 access count ${synAccessBefore} before, ${synAccessAfter} after`);
  check("historicalV5NeverOpened", v5AccessAfter === 0 && v5AccessBefore === 0,
    `historical-holdout-v5 access count ${v5AccessBefore} before, ${v5AccessAfter} after`);
  const sealedIds = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id));
  const sealedLineups = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [...f.five].map(person).sort().join("|")));
  check("noSealedFixtureWasEvaluated",
    results.every((r) => !sealedIds.has(r.fixtureId)),
    `the ${results.length} evaluated members are all mock ids: ${results.map((r) => r.fixtureId).join(", ")}`);
  check("noSealedLineupWasPlayed",
    mocks.every((f) => !sealedLineups.has([...f.five].map(person).sort().join("|"))),
    "no member's five matches a sealed five as an unordered set of people");
  check("theDisposableSealIsNotARealSeal",
    seal.name === MOCK_SET && MOCK_LOG.startsWith(".cache/"),
    `the rehearsal's seal is "${MOCK_SET}" over a disposable log at ${MOCK_LOG}, not a registered sealed set`);

  for (const p of [MOCK_LOG, MOCK_RUN]) if (existsSync(p)) rmSync(p);

  const payload = {
    syntheticDryRunVersion: "1.0.0",
    pairsPerSurface: pairs, mockMembers: mocks.length,
    gamesPlayed: results.reduce((a, r) => a + r.totalGames, 0),
    exactPathProven: {
      preflight: "scripts/validation/synthetic-stress-holdout-v2.mjs preflightChecks()",
      identity: "the same buildIdentity()",
      evaluator: "the same buildEvaluator(), pointed at the mock set and the dry-run seed stream",
      runner: "runSealedSetOnce from scripts/validation/runner.mjs",
      whatDiffers: "the seal (disposable), the fixtures (non-holdout mock set) and the volumes (low, because the rehearsal proves the path rather than the statistics)",
    },
    checkCount: checks.length, checks,
    setVerdictOnMockSet: agg.verdict,
    fixtureVerdictsOnMockSet: agg.fixtureVerdicts,
    isolation: { syntheticAccessBefore: synAccessBefore, syntheticAccessAfter: synAccessAfter,
      historicalV5AccessBefore: v5AccessBefore, historicalV5AccessAfter: v5AccessAfter,
      sealedFixturesEvaluated: 0, sealedLineupsPlayed: 0 },
    pass: fail.length === 0, failedChecks: fail,
  };
  payload.dryRunHash = createHash("sha256").update(JSON.stringify(checks.map((c) => [c.name, c.pass]))).digest("hex");
  writeArtifact("synthetic-v2-dry-run", payload, {
    generationCommand: "npm run syn:dryrun", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nDRY RUN: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} — ${checks.filter((c) => c.pass).length}/${checks.length} checks · ${payload.gamesPlayed.toLocaleString()} games`);
  process.exit(payload.pass ? 0 : 2);
}
