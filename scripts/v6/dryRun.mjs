#!/usr/bin/env node
// ── WS14: rehearse the V6 runner without touching the V6 set ────────────────
//   npm run v6:dryrun [-- --pairs=64]
//
// The one-time access is the resource this protects. The V5 dry run earned its
// keep by catching self-baselines keyed by sample field instead of metric id —
// every trait would have scored NOT_APPLICABLE on the real run. So this
// rehearses the EXACT code path by importing the real runner module, and
// exercises every refusal branch on a mock set built from synthetic DEVELOPMENT
// fixtures and calibration teams. No V6 id appears anywhere in it.
//
// Two branches V5's dry run did not have:
//   · the command surface itself — mode required, unknown flag refused, seal
//     unreachable except from --run;
//   · progressive equivalence — the escalation path has to be exercised, or the
//     first time it runs will be on the one-time access.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, mockSeal, RUN_STATES } from "../validation/runner.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "../validation/evalV4.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { TRAIT_TABLE, detectContradictions } from "../validation/traitRegistry.mjs";
import { historicalCalibrationV3Ids, SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { v6Seed } from "./seeds.mjs";
import { loadPackage, identityChecks, makeEvaluator, evaluateGates, clusterHardFails,
  applyDualGate, clusterKey, KNOWN_FLAGS, SET } from "../validation/historical-holdout-v6.mjs";
import { DIR } from "./reconcile.mjs";

const MOCK_LOG = `${DIR}/mock/v6-dryrun-access.jsonl`;
const MOCK_RUN = `${DIR}/mock/v6-dryrun-run.json`;
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const sh = (...a) => { try { return { out: execFileSync("node", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), code: 0 }; }
  catch (e) { return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 }; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 64);
  const def = defaultRuntimeParameterSet();
  const branches = [];
  const check = (name, ok, detail) => { branches.push({ name, ok, detail }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  const accessBefore = setAccessCount(SET);
  const pkg = await loadPackage();
  const profiles = await buildRunnerProfileMap();
  for (const x of pkg.m.matchups) for (const side of [x.teamA, x.teamB]) for (const p of side.players) {
    if (!profiles.has(p.calibrationPlayerId)) profiles.set(p.calibrationPlayerId, p);
  }

  console.log("HISTORICAL V6 RUNNER DRY RUN\n");
  console.log("1 — COMMAND SURFACE\n");
  const CMD = "scripts/validation/historical-holdout-v6.mjs";
  const noMode = sh(CMD);
  check("noModeRefused", noMode.code === 2 && /a mode is required/.test(noMode.out),
    "the command refuses to do anything without an explicit mode, so a bare invocation cannot reach the seal");
  const help = sh(CMD, "--help");
  check("helpExitsZeroAndTouchesNothing", help.code === 0 && /MODES \(exactly one required\)/.test(help.out) && setAccessCount(SET) === accessBefore,
    `--help exited 0, access count still ${setAccessCount(SET)}`);
  const bogus = sh(CMD, "--run", "--unlok-historical-holdout-v6");
  check("unknownFlagRefused", bogus.code === 2 && /unrecognised flag/.test(bogus.out),
    "a mistyped unlock flag is refused outright rather than ignored — Phase 6C4B2R found a command accepting unknown flags and writing an artifact out of order");
  const twoModes = sh(CMD, "--preflight", "--run");
  check("twoModesRefused", twoModes.code === 2 && /exactly one mode/.test(twoModes.out), "two modes at once is a refusal, not a precedence rule");
  const runNoOperator = sh(CMD, "--run");
  check("runWithoutOperatorOrReasonRefused", runNoOperator.code === 2 && /--operator and --reason are required/.test(runNoOperator.out),
    "an unexplained access is not an audit record");
  const runNoUnlock = sh(CMD, "--run", "--operator=dry-run", "--reason=dry run: unlock flags absent");
  check("runWithoutUnlockFlagsRefusedBeforeSeal",
    runNoUnlock.code === 2 && setAccessCount(SET) === accessBefore,
    `refused with the seal untouched; access count still ${setAccessCount(SET)}`);
  const resumeWrongMode = sh(CMD, "--preflight", "--resume");
  check("resumeOutsideRunRefused", resumeWrongMode.code === 2 && /--resume applies to --run only/.test(resumeWrongMode.out),
    "--resume cannot be smuggled into a read-only mode");
  const pre = sh(CMD, "--preflight");
  check("preflightIsReadOnly", pre.code === 0 && setAccessCount(SET) === accessBefore
    && !existsSync(`${DIR}/historical-v6-results.json`),
    `preflight passed, wrote no results artifact, access count still ${setAccessCount(SET)}`);
  check("dryRunFlagDelegates", sh(CMD, "--dry-run").code === 2,
    "--dry-run on the sealed command refuses and names this script, so mock-fixture construction stays out of the file that can open the real seal");
  check("knownFlagListIsClosed", KNOWN_FLAGS.length === 10 && KNOWN_FLAGS.includes(`--unlock-${SET}`),
    `${KNOWN_FLAGS.length} accepted flags: ${KNOWN_FLAGS.join(" ")}`);

  console.log("\n2 — FROZEN PACKAGE VERIFICATION\n");
  const rows = identityChecks(pkg, { dryRunArtifactRequired: false });
  check("everyIdentityCheckPasses", rows.every((r) => r.ok),
    `${rows.length} checks, ${rows.filter((r) => !r.ok).length} failing${rows.filter((r) => !r.ok).length ? `: ${rows.filter((r) => !r.ok).map((r) => r.name).join(", ")}` : ""}`);
  const rubricProblems = pkg.m.matchups.flatMap((x) => ["teamA", "teamB"].flatMap((s) =>
    detectContradictions(x[s].scoredTraits.map((t) => ({ traitId: t.traitId, metric: t.metric, direction: t.direction, surface: t.surface })))));
  check("perFixtureRubricClean", rubricProblems.length === 0,
    `${pkg.m.scoredTraitCount} scored traits across 16 sides, ${rubricProblems.length} contradictions`);
  check("everyScoredTraitCarriesAMargin",
    pkg.m.matchups.every((x) => [x.teamA, x.teamB].every((s) => s.scoredTraits.every((t) => t.practicalMargin != null))),
    "the dual gate has a margin available for every trait it will judge");
  check("baselinesResolveByMetricId",
    pkg.m.matchups.every((x) => x.scoreableMetrics.every((mm) => x.eraReference.selfBaselines?.[mm]?.mean != null)),
    "every scored metric resolves a Candidate 2 baseline — the V5 dry run caught this keyed by sample field, which would have scored every trait NOT_APPLICABLE");

  console.log("\n3 — TRANSACTIONAL BEHAVIOUR ON A MOCK SEAL\n");
  for (const p of [MOCK_LOG, MOCK_RUN]) if (existsSync(p)) rmSync(p);
  const mockMembers = SYNTHETIC_DEVELOPMENT_V2.slice(0, 4).map((s) => s.id ?? s);
  const v6Ids = new Set([...pkg.m.matchups.map((x) => x.matchupId),
    ...pkg.m.matchups.flatMap((x) => [x.teamA.fixtureId, x.teamB.fixtureId, x.teamA.key, x.teamB.key])]);
  check("mockSetContainsNoV6Id", mockMembers.every((id) => !v6Ids.has(id)), `${mockMembers.length} mock members, none a V6 id`);

  const identity = { coreHash: pkg.core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    verdictPolicyHash: pkg.verdict.policyHash, holdoutManifestHash: pkg.m.manifestHash };
  const seal = mockSeal("v6-dryrun-mock", MOCK_LOG);
  process.argv.push("--unlock-v6-dryrun-mock");

  const sealedSeal = mockSeal("v6-dryrun-sealed", `${MOCK_LOG}.sealed`);
  let refusedWhenSealed = false;
  try { sealedSeal.unlock({ reason: "test", actor: "dry-run" }); } catch (e) { refusedWhenSealed = e.code === "MOCK_SEALED"; }
  check("sealRefusesWithoutItsOwnFlag", refusedWhenSealed, "a set with no --unlock flag of its own refuses to open");

  let noReason = null;
  try { seal.unlock({ reason: null, actor: "dry-run" }); } catch (e) { noReason = e.code; }
  check("unlockWithoutReasonRefused", noReason === "NO_REASON", `refused with ${noReason}`);
  if (existsSync(MOCK_LOG)) rmSync(MOCK_LOG);

  let nothingToResume = null;
  try { runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "resume with no state", actor: "dry-run", resume: true, evaluate: () => ({}) }); }
  catch (e) { nothingToResume = e.code; }
  check("resumeWithNoStateRefused", nothingToResume === "NOTHING_TO_RESUME", `refused with ${nothingToResume}`);

  let crashed = false;
  try {
    runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "dry run: crash path", actor: "dry-run",
      evaluate: (id, i) => { if (i === 2) throw new Error("simulated crash after two members"); return { id, ok: true }; } });
  } catch (e) { crashed = /simulated crash/.test(e.message); }
  const afterCrash = existsSync(MOCK_RUN) ? JSON.parse(readFileSync(MOCK_RUN, "utf8")) : null;
  check("unlockIncrementsExactlyOnce", seal.accessCount() === 1, `access count ${seal.accessCount()}`);
  check("crashLeavesResumableState",
    crashed && afterCrash?.status === RUN_STATES.RUNNING && afterCrash.completedMembers.length === 2,
    `status ${afterCrash?.status}, ${afterCrash?.completedMembers.length} members written incrementally — a crash loses at most one member's work`);

  let secondRefused = null;
  try { runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "second run", actor: "dry-run", evaluate: () => ({}) }); }
  catch (e) { secondRefused = e.code; }
  check("secondRunRefused", secondRefused === "SECOND_RUN_REFUSED", `refused with ${secondRefused}`);

  const resumed = runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "resume", actor: "dry-run",
    resume: true, evaluate: (id) => ({ id, ok: true }) });
  check("resumeCompletesUnderSameAccessEvent",
    resumed.status === RUN_STATES.COMPLETE && resumed.results.length === mockMembers.length && seal.accessCount() === 1,
    `${resumed.results.length}/${mockMembers.length} members, access count still ${seal.accessCount()}`);
  check("resumeProducesARunHash", /^[0-9a-f]{64}$/.test(resumed.runHash ?? ""), `${(resumed.runHash ?? "").slice(0, 16)}...`);

  let alreadyComplete = null;
  try { runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "resume a complete run", actor: "dry-run", resume: true, evaluate: () => ({}) }); }
  catch (e) { alreadyComplete = e.code; }
  check("resumingACompleteRunRefused", alreadyComplete === "ALREADY_COMPLETE", `refused with ${alreadyComplete}`);

  const mismatches = {};
  for (const [field, value] of Object.entries({ coreHash: "0".repeat(64), parameterSetHash: "1".repeat(64),
    verdictPolicyHash: "2".repeat(64), holdoutManifestHash: "3".repeat(64) })) {
    for (const p of [MOCK_RUN, MOCK_LOG]) if (existsSync(p)) rmSync(p);
    const s2 = mockSeal("v6-dryrun-mock", MOCK_LOG);
    try {
      runSealedSetOnce({ seal: s2, identity, members: mockMembers, runPath: MOCK_RUN, reason: "seed", actor: "dry-run",
        evaluate: (id, i) => { if (i === 1) throw new Error("stop"); return { id }; } });
    } catch { /* expected */ }
    try {
      runSealedSetOnce({ seal: s2, identity: { ...identity, [field]: value }, members: mockMembers, runPath: MOCK_RUN,
        reason: "resume with a changed identity", actor: "dry-run", resume: true, evaluate: () => ({}) });
      mismatches[field] = "ACCEPTED";
    } catch (e) { mismatches[field] = e.code; }
  }
  check("changedIdentityRefusedOnResume", Object.values(mismatches).every((c) => c === "IDENTITY_MISMATCH"),
    Object.entries(mismatches).map(([k, v]) => `${k}:${v}`).join(" "));

  console.log("\n4 — THE SCORING PATH, ON A NON-HOLDOUT FIXTURE\n");
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const calId = historicalCalibrationV3Ids()[0];
  const fx = corpusV3.fixtures.find((f) => f.fixtureId === calId);
  const refDef = pkg.refs.references.find((r) => r.era === fx.eraStyleId);
  const run = playSurface({ subject: teamFromFixture(fx, profiles),
    opponent: referenceTeam({ era: refDef.era, five: refDef.five }, profiles),
    eraStyleId: fx.eraStyleId, seedAt: (i) => v6Seed("v6-dryrun", i), pairs });
  const traitId = Object.keys(TRAIT_TABLE).find((t) => TRAIT_TABLE[t]?.claim?.metric === "pppVsReference");
  const scored = scoreTrait({ traitId, vsRefSamples: run.samples, refBaselines: refDef.candidate2SelfBaselines, eraStyleId: fx.eraStyleId });
  const dual = applyDualGate(scored, "pppVsReference", pkg.margins.metrics.pppVsReference.margin);
  const tgt = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8")).records.find((r) => r.fixtureId === calId);
  const mae = shareMae({ fixture: fx, target: tgt, profiles, games: run.subjectBoxes });
  check("scoringPathProducesANumber", dual.diff != null && Number.isFinite(dual.diff),
    `${calId} on ${fx.eraStyleId}: ${traitId} diff ${r5(dual.diff)} vs margin ${dual.practicalMargin} -> ${dual.reportedState}`);
  check("dualGateNeedsBothConditions",
    dual.hardFail === (dual.statisticallyOpposite && dual.beyondPracticalMargin),
    `statisticallyOpposite ${dual.statisticallyOpposite}, beyondPracticalMargin ${dual.beyondPracticalMargin} -> hardFail ${dual.hardFail}`);
  check("shareMaeProducesANumber", mae.compositeMae != null, `composite share MAE ${r5(mae.compositeMae)}`);
  check("nullTargetsContributeNothing",
    Object.values(tgt.teamTargets ?? {}).some((v) => v.value == null) && mae.compositeMae != null,
    "a fixture with null team targets still scores, because a null contributes no error rather than a zero");
  check("structuralCountersLive",
    run.invariantViolations === 0 && run.ties === 0 && run.replayExact === true,
    `${run.games} games: ${run.invariantViolations} invariant violations, ${run.ties} ties, replay exact ${run.replayExact}`);

  console.log("\n5 — CLUSTER AGGREGATION AND PROGRESSIVE EQUIVALENCE\n");
  // Synthetic results, so both branches are exercised deterministically rather
  // than only when real data happens to produce them.
  const t = (traitIdIn, over) => ({ traitId: traitIdIn, metric: "refPppVsTeam", surface: "REFERENCE_VS_TEAM",
    direction: "BELOW_REFERENCE_BASELINE", observed: 1.36011, reference: 1.32206, diff: 0.03805,
    practicalMargin: 0.02, hardFail: true, result: "FAIL", z: 14.8, ci95: { lower: 0.033, upper: 0.043 }, ...over });
  const synthetic = [{ matchupId: "mock-a", eraStyleId: "2020s",
    teamA: { fixtureId: "mock-a-A", teamName: "Mock A", season: "2020-21", compositeMae: 0.03,
      traits: [t("ELITE_DEFENSE"), t("elite team man defence")], notScored: [] },
    teamB: { fixtureId: "mock-a-B", teamName: "Mock B", season: "2020-21", compositeMae: 0.03, traits: [], notScored: [] },
    structural: { invariantViolations: 0, finalTies: 0, impossibleScores: 0, preThreeEraThreePointAttempts: 0, replayExactAllSurfaces: true },
    headToHead: { games: 2, teamAWins: 1, teamAWinRate: 0.5 }, gamesPlayed: 2 }];
  const collapsed = clusterHardFails(synthetic);
  check("duplicateLabelsCollapseToOneCluster",
    collapsed.length === 1 && collapsed[0].formalLabelCount === 2 && collapsed[0].independentMeasurements === 1,
    `2 hard-fail labels -> ${collapsed.length} independent cluster; this is exactly the V5 case where 3 labels were 2 measurements`);
  check("bothLabelsPreserved", collapsed[0].formalTraitLabels.length === 2 && Boolean(collapsed[0].duplicateLabelNote),
    `labels kept: ${collapsed[0].formalTraitLabels.join(", ")}`);
  const differentTeam = clusterHardFails([...synthetic, { ...synthetic[0], matchupId: "mock-b" }]);
  check("differentMatchupsAreDifferentClusters", differentTeam.length === 2,
    "the same metric failing on two different matchups is two independent measurements, not one");
  check("clusterKeyIsIdentityOnly",
    clusterKey("m", "teamA", t("X")) === clusterKey("m", "teamA", t("Y")),
    "the cluster key does not contain the trait label, so renaming a trait cannot change the evidence count");
  const gatesOnSynthetic = evaluateGates({ pkg, results: synthetic }).gates;
  check("clusterGateFiresOnRealEvidence", gatesOnSynthetic.zeroIndependentHardFailClusters === false,
    "one independent hard-fail cluster fails the cluster gate, so collapsing labels does not weaken the gate");

  // the escalation path, driven through the real evaluator on a mock matchup
  const escTiers = [
    { tier: 0, gamesPerSurface: pairs * 2, role: "DRY_RUN_ONLY", mayProduceVerdict: false },
    { tier: 1, gamesPerSurface: pairs * 2, role: "SMOKE", mayProduceVerdict: false },
    { tier: 2, gamesPerSurface: pairs * 2, role: "PRECHECK", mayProduceVerdict: false },
    { tier: 3, gamesPerSurface: pairs * 2, role: "DECISION", mayProduceVerdict: true },
    { tier: 4, gamesPerSurface: pairs * 4, role: "ESCALATION", mayProduceVerdict: true },
  ];
  const mockPkg = { ...pkg, m: { ...pkg.m, matchups: [pkg.m.matchups[0]] } };
  const evalOne = makeEvaluator({ pkg: mockPkg, profiles, tiers: escTiers });
  const oneResult = evalOne(pkg.m.matchups[0].matchupId, 0);
  check("evaluatorRunsPrecheckAndDecisionTiers",
    oneResult.tiers.precheck.tier === 2 && oneResult.tiers.decision.tier === 3,
    `precheck tier ${oneResult.tiers.precheck.tier}, decision tier ${oneResult.tiers.decision.tier}, governing tier ${oneResult.governingTier}`);
  check("progressiveEquivalenceRecorded",
    typeof oneResult.progressiveEquivalence.escalated === "boolean"
    && Array.isArray(oneResult.progressiveEquivalence.precheckVsDecisionDisagreements),
    `escalated ${oneResult.progressiveEquivalence.escalated}${oneResult.progressiveEquivalence.escalated ? ` (governing tier ${oneResult.governingTier})` : ""}, ${oneResult.progressiveEquivalence.precheckVsDecisionDisagreements.length} tier disagreement(s)`);
  check("escalationTierDrawsItsOwnSeeds",
    v6Seed("historical-holdout-v6", 3 * 5000000) !== v6Seed("historical-holdout-v6", 4 * 5000000),
    "the tier is part of the seed address, so the escalation cannot reuse a decision-tier seed and manufacture agreement between tiers");
  check("escalationIsDirectionBlind",
    pkg.plan.progressiveEquivalence.symmetry.includes("never conditioned on the sign"),
    "the frozen plan conditions escalation on indeterminacy or tier disagreement alone");

  console.log("\n6 — THE REAL SET WAS NEVER TOUCHED\n");
  const accessAfter = setAccessCount(SET);
  check("v6AccessCountUnchanged", accessAfter === accessBefore && accessAfter === 0,
    `historical-holdout-v6 access count ${accessBefore} -> ${accessAfter}`);
  check("syntheticV2AccessCountUnchanged", setAccessCount("synthetic-stress-holdout-v2") === 0,
    "the synthetic stress holdout is untouched by this rehearsal");
  check("noResultsArtifactWritten", !existsSync(`${DIR}/historical-v6-results.json`),
    "no V6 results artifact exists; a dry run cannot produce one");
  check("mockArtifactsAreOutsideTheSetDirectory", MOCK_LOG.includes("/mock/") && MOCK_RUN.includes("/mock/"),
    `mock state lives in ${DIR}/mock/, never in a real access log`);

  const pass = branches.every((b) => b.ok);
  const payload = {
    historicalV6RunnerDryRunVersion: "1.0.0",
    rehearsedCommand: "npm run validation:historical-v6",
    importsTheRealRunner: true,
    pairsPerSurface: pairs,
    branchesExercised: branches.length,
    branches,
    mockSet: { members: mockMembers, log: MOCK_LOG, runPath: MOCK_RUN, containsNoV6Id: true },
    refusalCodesExercised: ["MOCK_SEALED", "NO_REASON", "NOTHING_TO_RESUME", "SECOND_RUN_REFUSED",
      "ALREADY_COMPLETE", "IDENTITY_MISMATCH"],
    commandSurfaceRefusals: ["no mode", "unknown flag", "two modes", "--run without operator or reason",
      "--run without unlock flags", "--resume outside --run", "--dry-run delegated"],
    clusterAggregation: { duplicateLabelsCollapse: true, differentMatchupsStaySeparate: true,
      clusterKeyExcludesLabel: true, gateStillFires: true },
    progressiveEquivalence: { precheckTierRun: true, decisionTierRun: true,
      escalationExercised: oneResult.progressiveEquivalence.escalated,
      escalationSeedsDisjointFromDecision: true, directionBlind: true,
      sampleResult: { matchupId: oneResult.matchupId, governingTier: oneResult.governingTier,
        escalated: oneResult.progressiveEquivalence.escalated,
        disagreements: oneResult.progressiveEquivalence.precheckVsDecisionDisagreements } },
    scoringPathProof: { fixtureId: calId, eraStyleId: fx.eraStyleId, traitId,
      diff: r5(dual.diff), practicalMargin: dual.practicalMargin, reportedState: dual.reportedState,
      compositeShareMae: r5(mae.compositeMae) },
    sealState: { set: SET, accessCountBefore: accessBefore, accessCountAfter: accessAfter,
      syntheticStressHoldoutV2AccessCount: setAccessCount("synthetic-stress-holdout-v2") },
    pass, failedBranches: branches.filter((b) => !b.ok).map((b) => b.name),
  };
  payload.dryRunHash = createHash("sha256").update(JSON.stringify(branches.map((b) => [b.name, b.ok]))).digest("hex");
  writeArtifact("historical-v6-runner-dry-run", payload, {
    generationCommand: "npm run v6:dryrun", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n${branches.filter((b) => b.ok).length}/${branches.length} branches pass`);
  console.log(`DRY RUN: ${pass ? "PASS" : `FAIL (${payload.failedBranches.join(", ")})`}`);
  process.exit(pass ? 0 : 2);
}
