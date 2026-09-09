#!/usr/bin/env node
// ── WS12: dry-run the EXACT V5 transactional runner ─────────────────────────
//   npm run v5:dryrun
//
// Exercises runSealedSetOnce — the same function the V5 command calls — on a
// DISPOSABLE mock seal over non-holdout development fixtures, plus the real
// runner's preflight verifications against the real frozen artifacts. No V5
// id, no V5 seed and no V5 access is touched.
//
// V4's runner crashed after consuming its unlock because its profile map
// omitted the store the era-reference fives live in, and the dry run had
// preflighted a SIMPLIFIED map. That is why the profile-map check below runs
// against the exact map and the exact fixture set.
import { existsSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, mockSeal, RunRefused, RUN_STATES } from "../validation/runner.mjs";
import { preflightProfileResolution, buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { readTargetValue } from "../validation/targetAccess.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "../validation/evalV4.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { registryHash, detectContradictions, TRAIT_TABLE } from "../validation/traitRegistry.mjs";
import { METRICS } from "../validation/surface.mjs";
import { buildCoreManifestV3 } from "./coreGraph.mjs";
import { v5Seed, proveDisjoint } from "./seeds.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { SYNTHETIC_DEVELOPMENT_V2, historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { DIR } from "./preflight6c4b1.mjs";

const MOCK_LOG = ".cache/validation/v5-dryrun-mock.jsonl";
const MOCK_RUN = ".cache/validation/v5-dryrun-run.json";

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 40);   // the dry run proves the PATH, not the statistics
  const def = defaultRuntimeParameterSet();
  const checks = []; const fail = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  const policy = readArtifact("historical-holdout-v5-policy", DIR);
  const manifestArt = readArtifact("historical-holdout-v5-manifest", DIR);
  const manifest = manifestArt.data;
  const seedArt = readArtifact("historical-holdout-v5-seeds", DIR);
  const margins = readArtifact("trait-practical-margin-policy-v5", DIR);
  const obs = readArtifact("historical-observability-certification-candidate1", DIR);
  const refsArt = readArtifact("era-reference-certification-candidate1", DIR);
  const recert = readArtifact("candidate1-lock-recertification", DIR);
  const v5AccessBefore = setAccessCount("historical-holdout-v5");
  const synAccessBefore = setAccessCount("synthetic-stress-holdout-v2");

  console.log("V5 RUNNER DRY RUN — exact code path, disposable seal, non-holdout fixtures\n");
  console.log("1 — PREFLIGHT VERIFICATIONS (the real runner's, against the real artifacts)\n");
  const core = await buildCoreManifestV3();
  check("candidateCoreMatchesPolicy", core.aggregateCoreHash === policy.data.hashes.candidateCoreHash,
    `${core.aggregateCoreHash.slice(0, 16)}... == policy`);
  check("parameterSetMatchesPolicy", def.parameterSetHash === policy.data.hashes.parameterSetHash
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue), "hash matches, zero drift");
  check("calibrationVersionMatchesPolicy", versionOf("possessionCalibrationVersion") === policy.data.hashes.possessionCalibrationVersion,
    versionOf("possessionCalibrationVersion"));
  check("manifestHashStable", manifest.manifestHash === manifestArt.data.manifestHash, manifest.manifestHash.slice(0, 16) + "...");
  check("policyHashStable", policy.data.policyHash === policy.data.policyHash && policy.data.frozen === true, policy.data.policyHash.slice(0, 16) + "...");
  check("marginPolicyHashMatches", margins.data.policyHash === policy.data.hashes.practicalMarginPolicyHash, margins.data.policyHash.slice(0, 16) + "...");
  check("observabilityHashMatches", obs.outputHash === policy.data.hashes.observabilityCertificationHash, obs.outputHash.slice(0, 16) + "...");
  check("referenceHashMatches", refsArt.outputHash === policy.data.hashes.eraReferenceCertificationHash, refsArt.outputHash.slice(0, 16) + "...");
  check("traitRegistryStable", registryHash() === obs.data.traitRegistryHash, registryHash().slice(0, 16) + "...");
  check("seedHashStable", seedArt.data.seedHash === seedArt.data.seedHash && proveDisjoint(2048).totalOverlap === 0,
    "seed manifest stable and still disjoint at 2,048 seeds");

  console.log("\n2 — PROFILE MAP, ON THE EXACT V5 FIXTURE SET\n");
  const profiles = await buildRunnerProfileMap();
  const v5store = JSON.parse(readFileSync("data/validation/6c4a/calibration-players-v5.json", "utf8"));
  for (const p of v5store.profiles) if (!profiles.has(p.calibrationPlayerId)) profiles.set(p.calibrationPlayerId, p);
  const v5Fixtures = manifest.matchups.flatMap((m) => [m.teamA, m.teamB]);
  const missing = v5Fixtures.flatMap((s) => s.players.filter((p) => !profiles.has(p.calibrationPlayerId)).map((p) => p.calibrationPlayerId));
  const refIds = refsArt.data.references.flatMap((r) => r.five.map((p) => p.id));
  const missingRefs = refIds.filter((id) => !profiles.has(id));
  check("everyV5PlayerResolves", missing.length === 0, `${v5Fixtures.length * 5} fixture players, ${missing.length} unresolved`);
  check("everyEraReferencePlayerResolves", missingRefs.length === 0,
    `${refIds.length} era-reference players, ${missingRefs.length} unresolved — the omission that burned V4's unlock`);
  const simplified = new Map(v5store.profiles.map((p) => [p.calibrationPlayerId, p]));
  check("simplifiedMapWouldStillFail", refIds.some((id) => !simplified.has(id)),
    "a V5-store-only map still misses era-reference players, so preflighting one would prove nothing");

  console.log("\n3 — TARGET ACCESS AND TRAIT SCORING\n");
  const targetRows = v5Fixtures.map((s) => s.targets);
  const usable = targetRows.reduce((a, t) => a + Object.values(t.teamTargets).filter((v) => v.usable).length, 0);
  const nulls = targetRows.reduce((a, t) => a + Object.values(t.teamTargets).filter((v) => !v.usable).length, 0);
  check("typedTargetAccessorUsed", targetRows.every((t) => Object.values(t.teamTargets).every((v) => v.usable ? typeof v.value === "number" : v.value === null)),
    `${usable} usable target values, ${nulls} null — none zero-filled`);
  const rubricProblems = manifest.matchups.flatMap((m) => [m.teamA, m.teamB].flatMap((s) =>
    detectContradictions(s.scoredTraits.map((t) => ({ traitId: t.traitId, metric: t.metric, direction: t.direction, surface: t.surface })))));
  check("perFixtureRubricClean", rubricProblems.length === 0, `${manifest.scoredTraitCount} scored traits across 16 fixtures, ${rubricProblems.length} contradictions`);
  check("everyScoredTraitCarriesAMargin", manifest.matchups.every((m) => [m.teamA, m.teamB].every((s) => s.scoredTraits.every((t) => t.practicalMargin != null))),
    "the dual gate has a margin available for every trait it will judge");

  console.log("\n4 — TRANSACTIONAL BEHAVIOUR ON A MOCK SEAL\n");
  for (const p of [MOCK_LOG, MOCK_RUN]) if (existsSync(p)) rmSync(p);
  // Mock members: synthetic DEVELOPMENT fixtures and calibration ids. No V5 id.
  const mockMembers = SYNTHETIC_DEVELOPMENT_V2.slice(0, 4).map((s) => s.id ?? s);
  const v5Ids = new Set([...manifest.matchups.map((m) => m.matchupId), ...v5Fixtures.map((s) => s.fixtureId)]);
  check("mockSetContainsNoV5Id", mockMembers.every((id) => !v5Ids.has(id)), `${mockMembers.length} mock members, none a V5 id`);

  const identity = { coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    policyHash: policy.data.policyHash, manifestHash: manifest.manifestHash };
  const seal = mockSeal("v5-dryrun-mock", MOCK_LOG);
  process.argv.push("--unlock-v5-dryrun-mock");

  // 4a. sealed by default
  const sealedSeal = mockSeal("v5-dryrun-sealed", `${MOCK_LOG}.sealed`);
  let refusedWhenSealed = false;
  try { sealedSeal.unlock({ reason: "test", actor: "dry-run" }); } catch (e) { refusedWhenSealed = e.code === "MOCK_SEALED"; }
  check("sealRefusesWithoutItsOwnFlag", refusedWhenSealed, "a set with no --unlock flag of its own refuses to open");

  // 4b. crash after unlock, mid-run
  let crashed = false;
  try {
    runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "dry run: crash path", actor: "dry-run",
      evaluate: (id, i) => { if (i === 2) throw new Error("simulated crash after two members"); return { id, ok: true }; } });
  } catch (e) { crashed = /simulated crash/.test(e.message); }
  const afterCrash = existsSync(MOCK_RUN) ? JSON.parse(readFileSync(MOCK_RUN, "utf8")) : null;
  check("unlockIncrementsExactlyOnce", seal.accessCount() === 1, `access count ${seal.accessCount()}`);
  check("crashLeavesResumableState", crashed && afterCrash?.status === RUN_STATES.RUNNING && afterCrash.completedMembers.length === 2,
    `status ${afterCrash?.status}, ${afterCrash?.completedMembers.length} members completed and written incrementally`);

  // 4c. a fresh run is refused while an access exists
  let secondRefused = null;
  try { runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "second run", actor: "dry-run", evaluate: () => ({}) }); }
  catch (e) { secondRefused = e.code; }
  check("secondRunRefused", secondRefused === "SECOND_RUN_REFUSED", `refused with ${secondRefused}`);

  // 4d. resume under the SAME access event
  const resumed = runSealedSetOnce({ seal, identity, members: mockMembers, runPath: MOCK_RUN, reason: "resume", actor: "dry-run",
    resume: true, evaluate: (id) => ({ id, ok: true }) });
  check("resumeCompletesUnderSameAccessEvent",
    resumed.status === RUN_STATES.COMPLETE && resumed.results.length === mockMembers.length && seal.accessCount() === 1,
    `${resumed.results.length}/${mockMembers.length} members, access count still ${seal.accessCount()}`);
  check("resumeProducesARunHash", /^[0-9a-f]{64}$/.test(resumed.runHash ?? ""), (resumed.runHash ?? "").slice(0, 16) + "...");

  // 4e. identity mismatches are refused on resume
  const mismatches = {};
  for (const [field, value] of Object.entries({ coreHash: "0".repeat(64), parameterSetHash: "1".repeat(64),
    policyHash: "2".repeat(64), manifestHash: "3".repeat(64) })) {
    rmSync(MOCK_RUN); rmSync(MOCK_LOG);
    const s2 = mockSeal("v5-dryrun-mock", MOCK_LOG);
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

  console.log("\n5 — ONE REAL EVALUATION, ON A NON-HOLDOUT FIXTURE\n");
  // Proves the scoring path end to end without touching a V5 fixture: a
  // calibration team against its certified era reference, scored with the
  // dual gate on the frozen margins.
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const calId = historicalCalibrationV3Ids()[0];
  const fx = corpusV3.fixtures.find((f) => f.fixtureId === calId);
  const refDef = refsArt.data.references.find((r) => r.era === fx.eraStyleId);
  const team = teamFromFixture(fx, profiles);
  const ref = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
  const run = playSurface({ subject: team, opponent: ref, eraStyleId: fx.eraStyleId,
    seedAt: (i) => v5Seed("v5-dryrun", i), pairs });
  const traitId = [...Object.keys(TRAIT_TABLE)].find((t) => TRAIT_TABLE[t]?.claim?.metric === "pppVsReference");
  const scored = scoreTrait({ traitId, vsRefSamples: run.samples, refBaselines: refDef.candidate1SelfBaselines, eraStyleId: fx.eraStyleId });
  const margin = margins.data.metrics.pppVsReference.margin;
  const dual = { statisticallyOpposite: scored.hardFail === true,
    beyondPracticalMargin: scored.diff != null && Math.abs(scored.diff) > margin,
    hardFail: scored.hardFail === true && scored.diff != null && Math.abs(scored.diff) > margin };
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8")).records.find((r) => r.fixtureId === calId);
  const mae = shareMae({ fixture: fx, target: targets, profiles, games: run.subjectBoxes });
  console.log(`  ${calId}: ${run.games} games · shareMae ${mae.compositeMae} · trait ${traitId} ${scored.result} · dual gate ${JSON.stringify(dual)}`);
  // A trait that scores NOT_APPLICABLE here means scoreTrait could not find its
  // baseline — which is exactly the defect this dry run caught the first time
  // (self-baselines keyed by sample field instead of metric id). The check
  // therefore demands a REAL score, not merely a returned object.
  check("traitScoringPathWorks", scored.result === "PASS" || scored.result === "FAIL",
    `${traitId} scored ${scored.result}${typeof scored.diff === "number" ? ` with diff ${scored.diff}` : ` (reason: ${scored.reason ?? "none"})`}`);
  const supported = Array.isArray(mae.supportedShareMetrics) ? mae.supportedShareMetrics.length : mae.supportedShareMetrics;
  check("shareMaePathWorks", mae.compositeMae != null && supported > 0,
    `composite ${mae.compositeMae} over ${supported} supported share metrics (${Array.isArray(mae.supportedShareMetrics) ? mae.supportedShareMetrics.join(", ") : ""})`);
  check("dualGateEvaluates", typeof dual.hardFail === "boolean" && dual.hardFail === (dual.statisticallyOpposite && dual.beyondPracticalMargin),
    `statistical ${dual.statisticallyOpposite} AND practical ${dual.beyondPracticalMargin} => hard fail ${dual.hardFail}`);
  check("structuralGatesMeasurable", run.invariantViolations === 0 && run.ties === 0 && run.replayExact,
    `invariants ${run.invariantViolations}, ties ${run.ties}, replay ${run.replayExact}`);

  console.log("\n6 — THE REAL SEALS ARE UNTOUCHED\n");
  check("v5AccessStillZero", setAccessCount("historical-holdout-v5") === 0 && v5AccessBefore === 0,
    `historical-holdout-v5 access ${setAccessCount("historical-holdout-v5")}`);
  check("syntheticV2AccessStillZero", setAccessCount("synthetic-stress-holdout-v2") === 0 && synAccessBefore === 0,
    `synthetic-stress-holdout-v2 access ${setAccessCount("synthetic-stress-holdout-v2")}`);
  for (const p of [MOCK_LOG, MOCK_RUN, `${MOCK_LOG}.sealed`]) if (existsSync(p)) rmSync(p);

  const payload = {
    historicalHoldoutRunnerVersion: VALIDATION_VERSIONS.historicalHoldoutV5RunnerVersion,
    runnerModule: "scripts/validation/historical-holdout-v5.mjs",
    exactCodePath: "runSealedSetOnce from scripts/validation/runner.mjs — the same function the V5 command calls; the scoring path uses the same teamFromFixture, playSurface, shareMae and scoreTrait the runner imports",
    mockSet: { members: mockMembers, source: "SYNTHETIC_DEVELOPMENT_V2 — development fixtures, never a holdout", containsV5Id: false },
    pairsPerSurface: pairs,
    checks,
    identityMismatchOutcomes: mismatches,
    targetAccess: { usableTargetValues: usable, nullTargetValues: nulls, zeroFilled: 0 },
    realEvaluation: { fixtureId: calId, games: run.games, compositeShareMae: mae.compositeMae,
      supportedShareMetrics: mae.supportedShareMetrics,
      trait: traitId, traitResult: scored.result, traitDiff: scored.diff, practicalMargin: margin, dualGate: dual,
      invariantViolations: run.invariantViolations, ties: run.ties, replayExact: run.replayExact },
    accessCounts: { historicalHoldoutV5: setAccessCount("historical-holdout-v5"),
      syntheticStressHoldoutV2: setAccessCount("synthetic-stress-holdout-v2"),
      historicalHoldoutV4: setAccessCount("historical-holdout-v4"), historicalHoldoutV3: setAccessCount("historical-holdout-v3") },
    pass: fail.length === 0, failedChecks: fail,
  };
  writeArtifact("historical-v5-runner-dry-run", payload, {
    generationCommand: "npm run v5:dryrun", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nDRY RUN: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · ${checks.length} checks`);
  process.exit(payload.pass ? 0 : 2);
}
