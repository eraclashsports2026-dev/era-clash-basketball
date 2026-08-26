#!/usr/bin/env node
// ── Historical Holdout V4 — ONE-TIME formal revalidation ────────────────────
//   npm run validation:historical-holdout-v4 -- --unlock-holdout \
//     --unlock-historical-holdout-v4 --operator="..." --reason="..."
//
// Opens the replacement set once, runs the frozen three-surface protocol on the
// frozen seeds, scores only certified traits on their identifiable surfaces,
// and writes an immutable result. Every threshold, seed, reference, registry
// and manifest hash was frozen and pushed before this command could run, and
// the runner refuses to start if any of them has moved.
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, realSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "./evalV4.mjs";
import { loadReferences, referenceTeam } from "./eraReferences.mjs";
import { loadCorpusV4, loadTargetsV4 } from "./buildCorpusV4.mjs";
import { loadPlayersV4 } from "./buildPlayersV4.mjs";
import { registryHash, detectContradictions, TRAIT_TABLE } from "./traitRegistry.mjs";
import { METRICS } from "./surface.mjs";
import { buildCoreManifest } from "./preflight.mjs";
import { seedManifest, v4Seed } from "./v4seeds.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const SET = "historical-holdout-v4";
const RUN_PATH = `${DIR}/historical-holdout-v4-run.json`;
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const operator = arg("operator"); const reason = arg("reason");
  const resume = process.argv.includes("--resume");
  if (!operator || !reason) { console.error("REFUSED: --operator and --reason are required."); process.exit(2); }

  // ── Part 37: every identity verified before the seal is touched ───────────
  const policy = readArtifact("historical-holdout-v4-policy", DIR).data;
  const manifest = readArtifact("historical-holdout-v4-manifest", DIR).data;
  const seeds = readArtifact("historical-holdout-v4-seeds", DIR).data;
  const dryrun = readArtifact("historical-holdout-v4-dryrun", DIR).data;
  const observability = readArtifact("observability-control-results", DIR);
  const refsArtifact = readArtifact("era-reference-opponents", DIR);
  const baseline = readArtifact("internal-baseline-v2-reference-surface", DIR).data;
  const def = defaultRuntimeParameterSet();
  const core = buildCoreManifest();

  const verify = [];
  const must = (name, ok, detail) => { verify.push({ name, ok }); if (!ok) { console.error(`REFUSED (${name}): ${detail}`); process.exit(2); } };
  must("dryRunPassed", dryrun.allPass === true, "the pipeline dry run has not passed");
  must("candidateCoreUnchanged", core.aggregateCoreHash === policy.hashes.candidateCoreHash, `core ${core.aggregateCoreHash} != policy ${policy.hashes.candidateCoreHash}`);
  must("parameterSetUnchanged", def.parameterSetHash === policy.hashes.parameterSetHash, "parameter set moved since the policy froze");
  must("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue), "a parameter drifted from its registry default");
  must("traitRegistryUnchanged", registryHash() === policy.hashes.traitRegistryHash, "the trait registry moved since the policy froze");
  must("observabilityUnchanged", observability.outputHash === policy.hashes.observabilityHash, "the certification artifact moved");
  must("referencesUnchanged", refsArtifact.outputHash === policy.hashes.referenceOpponentHash, "the era references moved");
  must("holdoutManifestUnchanged", manifest.manifestHash === policy.hashes.holdoutManifestHash, "the V4 manifest moved");
  must("seedManifestUnchanged", seedManifest(16384).manifestHash === policy.hashes.seedManifestHash && seeds.manifestHash === policy.hashes.seedManifestHash, "the seed manifest moved");

  const identity = {
    candidateCommit: readArtifact("candidate-core-manifest", "data/validation/6c3").data.candidateCommit,
    coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    policyHash: policy.policyHash, holdoutManifestHash: manifest.manifestHash,
    traitRegistryHash: registryHash(), observabilityHash: observability.outputHash,
    referenceOpponentHash: refsArtifact.outputHash, seedSetHash: seeds.manifestHash,
    seedStream: "historical-holdout-v4", pairsPerSurface: policy.protocol.pairsPerSurface,
  };

  const corpus = loadCorpusV4(); const targetStore = loadTargetsV4(); const store = loadPlayersV4();
  const profiles = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const fixtures = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));
  const tm = new Map(targetStore.records.map((r) => [r.fixtureId, r]));
  const refs = loadReferences().data.references;
  const eligibleTraits = new Set(observability.data.finalTraitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const pairs = policy.protocol.pairsPerSurface;

  // pre-run rubric contradiction check per matchup: the machine that rejects V3-style rules
  for (const m of manifest.matchups) {
    for (const side of [m.teamA, m.teamB]) {
      const claims = side.scoredTraits.filter((t) => eligibleTraits.has(t)).map((t) => ({
        traitId: t, metric: TRAIT_TABLE[t].claim.metric, direction: TRAIT_TABLE[t].claim.direction,
        surface: METRICS[TRAIT_TABLE[t].claim.metric].identifiableOn[0] }));
      const problems = detectContradictions(claims);
      must(`rubricClean:${side.fixtureId}`, problems.length === 0, problems.join("; "));
    }
  }

  console.log("HISTORICAL HOLDOUT V4 — ONE-TIME FORMAL REVALIDATION\n");
  console.log(`  operator ${operator}`);
  console.log(`  candidate ${identity.candidateCommit?.slice(0, 8)} core ${identity.coreHash.slice(0, 16)}... set ${identity.parameterSetHash.slice(0, 16)}...`);
  console.log(`  policy ${policy.policyHash.slice(0, 16)}... manifest ${manifest.manifestHash.slice(0, 16)}...`);
  console.log(`  ${manifest.matchups.length} matchups x 3 surfaces x ${pairs * 2} games = ${manifest.matchups.length * 3 * pairs * 2} games\n`);

  const seal = await realSeal(SET);
  let state;
  try {
    state = runSealedSetOnce({
      seal, identity, members: manifest.matchups.map((m) => m.matchupId), runPath: RUN_PATH,
      reason, actor: operator, resume,
      evaluate: (matchupId, mi) => {
        const m = manifest.matchups.find((x) => x.matchupId === matchupId);
        const fa = fixtures.get(m.teamA.fixtureId); const fb = fixtures.get(m.teamB.fixtureId);
        const refDef = refs.find((r) => r.era === m.eraStyleId);
        const A = teamFromFixture(fa, profiles); const B = teamFromFixture(fb, profiles);
        const ref = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
        const blk = (surface) => (i) => v4Seed("historical-holdout-v4", mi * 300000 + surface * 100000 + i);
        const t0 = performance.now();
        const sAB = playSurface({ subject: A, opponent: B, eraStyleId: m.eraStyleId, seedAt: blk(0), pairs });
        const sARef = playSurface({ subject: A, opponent: ref, eraStyleId: m.eraStyleId, seedAt: blk(1), pairs });
        const sBRef = playSurface({ subject: B, opponent: ref, eraStyleId: m.eraStyleId, seedAt: blk(2), pairs });
        const evalTeam = (fixture, run, scoredTraits, excludedTraits) => {
          const mae = shareMae({ fixture, target: tm.get(fixture.fixtureId), profiles, games: run.subjectBoxes });
          const traits = scoredTraits.filter((t) => eligibleTraits.has(t)).map((t) =>
            scoreTrait({ traitId: t, vsRefSamples: run.samples, refBaselines: refDef.selfBaselines, eraStyleId: m.eraStyleId }));
          const notScored = [...excludedTraits, ...scoredTraits.filter((t) => !eligibleTraits.has(t))]
            .map((t) => ({ traitId: t, result: TRAIT_TABLE[t]?.cls === "UNOBSERVABLE_ON_THIS_SURFACE" || !TRAIT_TABLE[t]?.claim ? "NOT_SCORED_UNOBSERVABLE" : "NOT_SCORED_METRIC_UNCERTIFIED" }));
          return { ...mae, traits, notScored };
        };
        const a = evalTeam(fa, sARef, m.teamA.scoredTraits, m.teamA.excludedTraits);
        const b = evalTeam(fb, sBRef, m.teamB.scoredTraits, m.teamB.excludedTraits);
        const winA = sAB.samples.filter((s) => s.orientation === "GOLD").reduce((x, s) => x + s.win, 0)
                   + sAB.samples.filter((s) => s.orientation === "BLUE").reduce((x, s) => x + s.win, 0);
        const line = `  [${mi + 1}/8] ${matchupId.padEnd(14)} A mae ${String(a.compositeMae ?? "n/a").padStart(8)}  B mae ${String(b.compositeMae ?? "n/a").padStart(8)}  traits ${[...a.traits, ...b.traits].filter((t) => t.result === "PASS").length}/${a.traits.length + b.traits.length}  inv ${sAB.invariantViolations + sARef.invariantViolations + sBRef.invariantViolations}  ${(Math.round((performance.now() - t0) / 100) / 10)}s`;
        console.log(line);
        return {
          matchupId, eraStyleId: m.eraStyleId, pairType: m.pairType,
          teamA: { fixtureId: m.teamA.fixtureId, teamName: fa.teamName, season: fa.season, ...a },
          teamB: { fixtureId: m.teamB.fixtureId, teamName: fb.teamName, season: fb.season, ...b },
          headToHead: { games: sAB.games, teamAWins: winA, teamAWinRate: r5(winA / sAB.games) },
          structural: {
            invariantViolations: sAB.invariantViolations + sARef.invariantViolations + sBRef.invariantViolations,
            finalTies: sAB.ties + sARef.ties + sBRef.ties,
            impossibleScores: sAB.impossible + sARef.impossible + sBRef.impossible,
            preThreeEraThreePointAttempts: (sAB.preThreeAttempts ?? 0) + (sARef.preThreeAttempts ?? 0) + (sBRef.preThreeAttempts ?? 0),
            replayExactAllSurfaces: sAB.replayExact && sARef.replayExact && sBRef.replayExact,
          },
          gamesPlayed: sAB.games + sARef.games + sBRef.games,
        };
      },
    });
  } catch (e) {
    if (e instanceof RunRefused || e.code === "HOLDOUT_SEALED") {
      console.error(`\nREFUSED (${e.code}): ${e.message.split("\n")[0]}`);
      console.error(`  access count remains ${seal.accessCount()}`);
      process.exit(2);
    }
    throw e;
  }

  // ── frozen gate evaluation ──────────────────────────────────────────────────
  const results = state.results;
  const teamMaes = results.flatMap((r) => [
    { id: r.teamA.fixtureId, mae: r.teamA.compositeMae }, { id: r.teamB.fixtureId, mae: r.teamB.compositeMae }])
    .filter((t) => t.mae != null);
  const holdoutComposite = teamMaes.reduce((a, t) => a + t.mae, 0) / teamMaes.length;
  const ratio = holdoutComposite / policy.numericGates.compositeShareMae.internalBaselineMean;
  const catastrophic = teamMaes.filter((t) => t.mae > policy.numericGates.compositeShareMae.catastrophicThreshold);

  const allTraits = results.flatMap((r) => [...r.teamA.traits, ...r.teamB.traits]);
  const traitPassRate = allTraits.length ? allTraits.filter((t) => t.result === "PASS").length / allTraits.length : null;
  const hardFails = allTraits.filter((t) => t.hardFail);
  const perMatchupMajority = results.map((r) => {
    const ts = [...r.teamA.traits, ...r.teamB.traits];
    return { matchupId: r.matchupId, scored: ts.length, failed: ts.filter((t) => t.result === "FAIL").length,
      failsMajority: ts.length > 0 && ts.filter((t) => t.result === "FAIL").length * 2 > ts.length };
  });

  const gates = {
    everyMatchupExecuted: results.length === 8,
    zeroInvariantFailures: results.every((r) => r.structural.invariantViolations === 0),
    zeroFinalTies: results.every((r) => r.structural.finalTies === 0),
    zeroImpossibleScores: results.every((r) => r.structural.impossibleScores === 0),
    zeroPreThreeEraThreePointAttempts: results.every((r) => r.structural.preThreeEraThreePointAttempts === 0),
    replayExactEverywhere: results.every((r) => r.structural.replayExactAllSurfaces),
    compositeRatioWithinPolicy: ratio <= policy.numericGates.compositeShareMae.maxHoldoutToInternalRatio,
    zeroCatastrophicTeams: catastrophic.length === 0,
    traitPassRateMet: traitPassRate != null && traitPassRate >= policy.traitGates.aggregate.minTraitPassRate,
    zeroTraitHardFails: hardFails.length === 0,
    noMatchupFailsMajorityOfTraits: perMatchupMajority.every((m) => !m.failsMajority),
  };
  const outcome = Object.values(gates).every(Boolean) ? RUN_OUTCOMES.PASS : RUN_OUTCOMES.FAIL;
  const verdict = outcome === RUN_OUTCOMES.PASS ? "HISTORICAL_HOLDOUT_V4_PASS" : "HISTORICAL_HOLDOUT_V4_FAIL";

  const payload = {
    formalValidationAttemptVersion: VALIDATION_VERSIONS.formalValidationAttemptVersion,
    set: SET, verdict, outcome, identity,
    accessEvent: state.accessEvent, accessCountBefore: state.accessCountBefore, accessCountAfter: seal.accessCount(),
    runStatus: state.status, runHash: state.runHash,
    matchupsEvaluated: results.length, gamesPerSurface: pairs * 2, totalGames: results.reduce((a, r) => a + r.gamesPlayed, 0),
    erasCovered: [...new Set(results.map((r) => r.eraStyleId))],
    numeric: {
      teamSurfacesScored: teamMaes.length, holdoutComposite: r5(holdoutComposite),
      internalBaselineMean: policy.numericGates.compositeShareMae.internalBaselineMean,
      ratio: r5(ratio), ratioGate: policy.numericGates.compositeShareMae.maxHoldoutToInternalRatio,
      catastrophicThreshold: policy.numericGates.compositeShareMae.catastrophicThreshold,
      catastrophicTeams: catastrophic,
    },
    traits: {
      scored: allTraits.length, passed: allTraits.filter((t) => t.result === "PASS").length,
      failed: allTraits.filter((t) => t.result === "FAIL").length,
      passRate: r5(traitPassRate), minPassRate: policy.traitGates.aggregate.minTraitPassRate,
      hardFails: hardFails.map((t) => t.traitId),
      notScoredUnobservable: results.reduce((a, r) => a + r.teamA.notScored.length + r.teamB.notScored.length, 0),
      perMatchupMajority,
    },
    gates, results,
  };
  const { path } = writeArtifact("historical-holdout-v4-results", payload, {
    generationCommand: "npm run validation:historical-holdout-v4",
    sourceArtifacts: [`${DIR}/historical-holdout-v4-policy.json`, `${DIR}/historical-holdout-v4-manifest.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });

  console.log(`\n  NUMERIC   holdout composite ${r5(holdoutComposite)} vs internal ${policy.numericGates.compositeShareMae.internalBaselineMean} -> ratio ${r5(ratio)} (gate <= ${policy.numericGates.compositeShareMae.maxHoldoutToInternalRatio})`);
  console.log(`  TRAITS    ${payload.traits.passed}/${payload.traits.scored} pass (${r5(traitPassRate)}) · hard fails ${hardFails.length} · unobservable excluded ${payload.traits.notScoredUnobservable}`);
  console.log(`\n  GATES`);
  for (const [k, v] of Object.entries(gates)) console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
  console.log(`\n  VERDICT: ${verdict}`);
  console.log(`  access count: ${state.accessCountBefore} -> ${seal.accessCount()}`);
  console.log(`\nwrote ${path}`);
  process.exit(outcome === RUN_OUTCOMES.PASS ? 0 : 1);
}
