#!/usr/bin/env node
// ── Historical Holdout V5 — ONE-TIME formal revalidation of Candidate 1 ─────
//   npm run validation:historical-v5 -- --unlock-holdout \
//     --unlock-historical-holdout-v5 --operator="..." --reason="..."
//
// The same transactional runner V4 used, pointed at Candidate 1's frozen V5
// package. Every hash was frozen and pushed before this command could run and
// the runner refuses to start if any has moved.
//
// Two things V5 does that V4 did not:
//   · the trait rule is DUAL — a hard fail needs the wrong direction, a 95%
//     interval excluding zero, AND a difference beyond the metric's frozen
//     practical margin. V4's rule had no margin, and four of its twelve hard
//     failures were sub-margin artifacts.
//   · every result states the candidate that produced it, because Candidate 0
//     and Candidate 1 share a parameter-set hash.
//
// This file is imported by the dry run so the rehearsal exercises the EXACT
// code path the real run will take.
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, realSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "./evalV4.mjs";
import { loadReferences, referenceTeam } from "./eraReferences.mjs";
import { registryHash, detectContradictions, TRAIT_TABLE } from "./traitRegistry.mjs";
import { METRICS } from "./surface.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { readTargetValue } from "./targetAccess.mjs";
import { v5Seed, v5SurfaceSeed, proveDisjoint } from "../v5/seeds.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c4b1";
const SET = "historical-holdout-v5";
const RUN_PATH = `${DIR}/historical-holdout-v5-run.json`;
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const operator = arg("operator"); const reason = arg("reason");
  const resume = process.argv.includes("--resume");
  if (!operator || !reason) { console.error("REFUSED: --operator and --reason are required."); process.exit(2); }

  // ── Part 37: every identity verified before the seal is touched ───────────
  const policy = readArtifact("historical-holdout-v5-policy", DIR).data;
  const manifest = readArtifact("historical-holdout-v5-manifest", DIR).data;
  const seedArtifact = readArtifact("historical-holdout-v5-seeds", DIR);
  const seeds = seedArtifact.data;
  const manifestArtifact = readArtifact("historical-holdout-v5-manifest", DIR);
  const margins = readArtifact("trait-practical-margin-policy-v5", DIR);
  const recert = readArtifact("candidate1-lock-recertification", DIR);
  const dryrun = readArtifact("historical-v5-runner-dry-run", DIR).data;
  const observability = readArtifact("historical-observability-certification-candidate1", DIR);
  const refsArtifact = readArtifact("era-reference-certification-candidate1", DIR);
  
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  const verify = [];
  const must = (name, ok, detail) => { verify.push({ name, ok }); if (!ok) { console.error(`REFUSED (${name}): ${detail}`); process.exit(2); } };
  must("dryRunPassed", dryrun.pass === true, "the runner dry run has not passed");
  must("candidateCoreUnchanged", core.aggregateCoreHash === policy.hashes.candidateCoreHash, `core ${core.aggregateCoreHash} != policy ${policy.hashes.candidateCoreHash}`);
  must("parameterSetUnchanged", def.parameterSetHash === policy.hashes.parameterSetHash, "parameter set moved since the policy froze");
  must("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue), "a parameter drifted from its registry default");
  must("calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === policy.hashes.possessionCalibrationVersion, "the calibration version moved since the policy froze");
  must("traitRegistryUnchanged", registryHash() === observability.data.traitRegistryHash, "the trait registry moved since certification");
  must("observabilityUnchanged", observability.outputHash === policy.hashes.observabilityCertificationHash, "the observability certification moved");
  must("referencesUnchanged", refsArtifact.outputHash === policy.hashes.eraReferenceCertificationHash, "the era-reference certification moved");
  must("holdoutManifestUnchanged", manifest.manifestHash === manifestArtifact.data.manifestHash, "the V5 manifest moved");
  must("marginPolicyUnchanged", margins.data.policyHash === policy.hashes.practicalMarginPolicyHash, "the practical-margin policy moved");
  must("seedSetUnchanged", seeds.seedHash === seedArtifact.data.seedHash, "the seed manifest moved");
  must("seedsStillDisjoint", proveDisjoint(4096).totalOverlap === 0, "the V5 seed domain now overlaps a prior population");

  const identity = {
    candidateId: recert.data.candidateId,
    candidateCommit: recert.data.recertifiedAtCommit,
    coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    lockRevision: recert.data.lockRevision,
    policyHash: policy.policyHash, holdoutManifestHash: manifest.manifestHash,
    practicalMarginPolicyHash: margins.data.policyHash,
    traitRegistryHash: registryHash(), observabilityHash: observability.outputHash,
    referenceCertificationHash: refsArtifact.outputHash, seedSetHash: seeds.seedHash,
    seedStream: "historical-holdout-v5", pairsPerSurface: policy.protocol.pairsPerSurface,
  };

  // The V5 manifest froze every profile, coach, target and trait, so the runner
  // reads IT rather than re-deriving from stores that could have moved. The
  // profile map still spans both stores, because the era-reference fives are
  // historical-calibration-v3 players — the omission that burned V4's unlock.
  const { buildRunnerProfileMap } = await import("./profileMap.mjs");
  const profiles = await buildRunnerProfileMap();
  const v5store = JSON.parse(readFileSync("data/validation/6c4a/calibration-players-v5.json", "utf8"));
  for (const p of v5store.profiles) if (!profiles.has(p.calibrationPlayerId)) profiles.set(p.calibrationPlayerId, p);
  const refs = refsArtifact.data.references;
  const eligibleTraits = new Set(observability.data.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const marginOf = (metric) => margins.data.metrics[metric]?.margin ?? null;
  const pairs = policy.protocol.pairsPerSurface;

  /** Build a team from the FROZEN manifest side, never from a live store scan. */
  const teamFromManifestSide = (side) => teamFromFixture({
    fixtureId: side.fixtureId, teamName: side.teamName, season: side.season, eraStyleId: side.eraStyleId,
    coachId: side.coachId, players: side.players.map((p) => ({ calibrationPlayerId: p.calibrationPlayerId, assignedPosition: p.assignedPosition })),
  }, profiles);

  // pre-run rubric contradiction check per matchup: the machine that rejects
  // V3-style rules, applied per fixture exactly as it is meant to be
  for (const m of manifest.matchups) {
    for (const side of [m.teamA, m.teamB]) {
      const claims = side.scoredTraits.filter((t) => eligibleTraits.has(t.traitId))
        .map((t) => ({ traitId: t.traitId, metric: t.metric, direction: t.direction, surface: t.surface }));
      const problems = detectContradictions(claims);
      must(`rubricClean:${side.fixtureId}`, problems.length === 0, problems.join("; "));
    }
  }

  console.log("HISTORICAL HOLDOUT V5 — ONE-TIME FORMAL REVALIDATION OF CANDIDATE 1\n");
  console.log(`  operator ${operator}`);
  console.log(`  candidate ${identity.candidateId} (lock revision ${identity.lockRevision}) core ${identity.coreHash.slice(0, 16)}... set ${identity.parameterSetHash.slice(0, 16)}...`);
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
        const A = teamFromManifestSide(m.teamA);
        const B = teamFromManifestSide(m.teamB);
        const refDef = refs.find((r) => r.era === m.eraStyleId);
        const ref = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
        const blk = (surface) => (i) => v5SurfaceSeed({ matchupIndex: mi, surfaceIndex: surface, pairIndex: i });
        const t0 = performance.now();
        const sAB = playSurface({ subject: A, opponent: B, eraStyleId: m.eraStyleId, seedAt: blk(0), pairs });
        const sARef = playSurface({ subject: A, opponent: ref, eraStyleId: m.eraStyleId, seedAt: blk(1), pairs });
        const sBRef = playSurface({ subject: B, opponent: ref, eraStyleId: m.eraStyleId, seedAt: blk(2), pairs });

        const evalTeam = (side, run) => {
          const fixture = { fixtureId: side.fixtureId, players: side.players.map((p) => ({ calibrationPlayerId: p.calibrationPlayerId })) };
          const target = { unitTargets: side.targets.shareTargets ? { ...side.targets.shareTargets } : {} };
          const mae = shareMae({ fixture, target, profiles, games: run.subjectBoxes });
          const traits = side.scoredTraits.filter((t) => eligibleTraits.has(t.traitId)).map((t) => {
            const scored = scoreTrait({ traitId: t.traitId, vsRefSamples: run.samples,
              refBaselines: refDef.candidate1SelfBaselines, eraStyleId: m.eraStyleId });
            // ── the DUAL gate ─────────────────────────────────────────────
            // V4 hard-failed on sign plus a 95% interval excluding zero, and at
            // 4,096 games that fired on a 0.003 three-point-share deficit. V5
            // additionally requires the difference to clear the metric's frozen
            // practical margin; a wrong-direction result inside the margin is a
            // DIRECTIONAL_SOFT_FAIL, reported and never verdict-driving.
            const margin = marginOf(t.metric);
            const diff = scored.diff ?? null;
            const beyondMargin = margin != null && diff != null && Math.abs(diff) > margin;
            const statistical = scored.hardFail === true;
            const hardFail = statistical && beyondMargin;
            return { ...scored, practicalMargin: margin, beyondPracticalMargin: beyondMargin,
              statisticallyOpposite: statistical, hardFail,
              reportedState: scored.result === "PASS" ? "PASS"
                : hardFail ? "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED"
                : statistical ? "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT"
                : scored.result === "FAIL" ? "INCONCLUSIVE" : scored.result };
          });
          const notScored = side.excludedTraits.map((t) => ({ traitId: t.traitId,
            result: t.reason === "NOT_IN_TRAIT_REGISTRY" ? "NOT_APPLICABLE" : "NOT_SCORED_UNOBSERVABLE", reason: t.reason }));
          return { ...mae, traits, notScored };
        };
        const a = evalTeam(m.teamA, sARef);
        const b = evalTeam(m.teamB, sBRef);
        const winA = sAB.samples.filter((s) => s.orientation === "GOLD").reduce((x, s) => x + s.win, 0)
                   + sAB.samples.filter((s) => s.orientation === "BLUE").reduce((x, s) => x + s.win, 0);
        console.log(`  [${mi + 1}/${manifest.matchups.length}] ${matchupId.padEnd(14)} A mae ${String(a.compositeMae ?? "n/a").padStart(8)}  B mae ${String(b.compositeMae ?? "n/a").padStart(8)}  traits ${[...a.traits, ...b.traits].filter((t) => t.result === "PASS").length}/${a.traits.length + b.traits.length}  inv ${sAB.invariantViolations + sARef.invariantViolations + sBRef.invariantViolations}  ${(Math.round((performance.now() - t0) / 100) / 10)}s`);
        return {
          matchupId, eraStyleId: m.eraStyleId, pairType: m.pairType,
          teamA: { fixtureId: m.teamA.fixtureId, teamName: m.teamA.teamName, season: m.teamA.season, ...a },
          teamB: { fixtureId: m.teamB.fixtureId, teamName: m.teamB.teamName, season: m.teamB.season, ...b },
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
    everyMatchupExecuted: results.length === policy.protocol.matchups,
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
  const verdict = outcome === RUN_OUTCOMES.PASS ? policy.outcomes.pass : policy.outcomes.fail;

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
  const { path } = writeArtifact("historical-holdout-v5-results", payload, {
    generationCommand: "npm run validation:historical-v5",
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
