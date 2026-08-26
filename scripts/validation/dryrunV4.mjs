#!/usr/bin/env node
// ── V4 pipeline dry run: construct validity + transactional runner, mock only ─
//   npm run validation:6c3r:dryrun
//
// Exercises the FULL V4 evaluation on non-holdout fixtures — opponent-paired
// games, era-reference games, side balancing, trait scoring, unobservable
// exclusion, numeric scoring, replay — plus the transactional seal machinery on
// a disposable mock set. No V4 member id is touched, and both real seals are
// asserted unchanged at the end.
import { readFileSync, existsSync, rmSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { runSealedSetOnce, mockSeal, RunRefused, RUN_STATES } from "./runner.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "./evalV4.mjs";
import { loadReferences, referenceTeam } from "./eraReferences.mjs";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { detectContradictions, TRAIT_TABLE } from "./traitRegistry.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { v4Seed } from "./v4seeds.mjs";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const LOG = ".cache/validation/mock-v4-access-log.jsonl";
const RUN = ".cache/validation/mock-v4-run.json";

if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); };
  for (const p of [LOG, RUN]) if (existsSync(p)) rmSync(p);

  const refs = loadReferences();
  const store = loadPlayers();
  const profiles = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const tm = new Map(targets.records.map((r) => [r.fixtureId, r]));
  const calib = historicalCalibrationV3Ids();
  const v4Members = new Set(readArtifact("historical-holdout-v4-manifest", DIR).data.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId]));

  // Mock matchup: two same-era CALIBRATION fixtures (development data).
  const era = "2010s";
  const eraFixtures = corpus.fixtures.filter((f) => f.eraStyleId === era && calib.includes(f.fixtureId));
  const [fa, fb] = eraFixtures;
  check("mockUsesNoV4Member", !v4Members.has(fa.fixtureId) && !v4Members.has(fb.fixtureId),
    `${fa.fixtureId} vs ${fb.fixtureId} — development fixtures only`);

  const refDef = refs.data.references.find((r) => r.era === era);
  const ref = referenceTeam({ era, five: refDef.five }, profiles);
  const A = teamFromFixture(fa, profiles);
  const B = teamFromFixture(fb, profiles);
  const pairs = 128;

  console.log("\nCONSTRUCT VALIDITY, on the full three-surface protocol\n");
  const sAB = playSurface({ subject: A, opponent: B, eraStyleId: era, seedAt: (i) => v4Seed("v4-dryrun", i), pairs });
  const sARef = playSurface({ subject: A, opponent: ref, eraStyleId: era, seedAt: (i) => v4Seed("v4-dryrun", 100000 + i), pairs });
  const sBRef = playSurface({ subject: B, opponent: ref, eraStyleId: era, seedAt: (i) => v4Seed("v4-dryrun", 200000 + i), pairs });
  check("threeSurfacesRun", sAB.games === pairs * 2 && sARef.games === pairs * 2 && sBRef.games === pairs * 2,
    `${sAB.games + sARef.games + sBRef.games} games across A-vs-B, A-vs-ref, B-vs-ref, side-balanced`);
  check("replayExactOnEverySurface", sAB.replayExact && sARef.replayExact && sBRef.replayExact, "repeat of the first pair is byte-identical on all three surfaces");
  check("invariantsCleanEverywhere", [sAB, sARef, sBRef].every((s) => s.invariantViolations === 0 && s.ties === 0),
    "zero invariant violations and zero ties across all surfaces");

  const maeA = shareMae({ fixture: fa, target: tm.get(fa.fixtureId), profiles, games: sARef.subjectBoxes });
  check("numericScoringProducesSupportedOnlyError", maeA.compositeMae != null && maeA.supportedShareMetrics.length >= 3,
    `composite ${maeA.compositeMae} over ${maeA.supportedShareMetrics.length} supported share metrics; unsupported maps contribute nothing`);

  // trait machinery: a certified trait scores; an uncertified one is refused
  const eligible = new Set(readArtifact("observability-control-results", DIR).data.finalTraitEligibility
    .filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const scored = scoreTrait({ traitId: "TRANSITION", vsRefSamples: sARef.samples, refBaselines: refDef.selfBaselines, eraStyleId: era });
  check("certifiedTraitScores", ["PASS", "FAIL"].includes(scored.result) && scored.surface === "VS_ERA_REFERENCE",
    `TRANSITION scored ${scored.result} on ${scored.surface} (diff ${scored.diff}, z ${scored.z})`);
  check("uncertifiedTraitExcludedBeforeScoring", !eligible.has("ZONE_CAPABLE") && !eligible.has("pressure man"),
    "ZONE_CAPABLE and the pressure strings failed certification and are not in the eligible set the runner consumes");
  const mirrorProblems = detectContradictions([
    { traitId: "ELITE_OFFENSE", metric: "pppVsReference", direction: "ABOVE_REFERENCE_BASELINE", surface: "MIRROR" },
    { traitId: "ELITE_DEFENSE", metric: "refPppVsTeam", direction: "BELOW_REFERENCE_BASELINE", surface: "MIRROR" },
  ]);
  check("mirrorOffenseDefenseScoringRejected", mirrorProblems.length >= 3, mirrorProblems[mirrorProblems.length - 1]);

  // strong/weak construct sanity ON THIS PROTOCOL: an offence gap visible vs ref
  const pppA = scoreTrait({ traitId: "ELITE_OFFENSE", vsRefSamples: sARef.samples, refBaselines: refDef.selfBaselines, eraStyleId: era });
  check("offenseQualityIdentifiableVsReference", pppA.diff != null && pppA.surface === "VS_ERA_REFERENCE",
    `ELITE_OFFENSE machinery produces a defined vs-reference differential (${pppA.diff})`);

  console.log("\nTRANSACTIONAL RUNNER, on the mock seal\n");
  const seal = mockSeal("mock-v4", LOG);
  const identity = { candidate: "c0", core: "h", policy: "p", holdout: "m" };
  let refused = null;
  try { runSealedSetOnce({ seal, identity, members: [fa.fixtureId, fb.fixtureId], runPath: RUN, reason: "dry", actor: "dry", evaluate: () => ({}) }); }
  catch (e) { refused = e; }
  check("mockSealedWithoutUnlock", refused?.code === "MOCK_SEALED", refused?.message ?? "not refused");
  process.argv.push("--unlock-mock-v4");
  let crashed = null;
  try {
    runSealedSetOnce({ seal, identity, members: [fa.fixtureId, fb.fixtureId], runPath: RUN, reason: "dry", actor: "dry",
      evaluate: (id, i) => { if (i === 1) throw new Error("boom"); return { id }; } });
  } catch (e) { crashed = e; }
  check("mockAccessIncrementsOnce", seal.accessCount() === 1 && crashed?.message === "boom", `access ${seal.accessCount()} after injected crash`);
  let second = null;
  try { runSealedSetOnce({ seal, identity, members: [fa.fixtureId, fb.fixtureId], runPath: RUN, reason: "again", actor: "dry", evaluate: () => ({}) }); }
  catch (e) { second = e; }
  check("mockDuplicateRunRefused", second?.code === "SECOND_RUN_REFUSED", second?.message.split("\n")[0] ?? "not refused");
  const resumed = runSealedSetOnce({ seal, identity, members: [fa.fixtureId, fb.fixtureId], runPath: RUN, reason: "resume", actor: "dry", resume: true, evaluate: (id) => ({ id }) });
  check("mockResumeCompletesSameEvent", resumed.status === RUN_STATES.COMPLETE && seal.accessCount() === 1,
    `status ${resumed.status}, access still ${seal.accessCount()}`);
  check("mockArtifactsReconcile", resumed.results.length === 2 && new Set(resumed.completedMembers).size === 2, "2 members, evaluated exactly once each");

  check("realV4SealUntouched", setAccessCount("historical-holdout-v4") === 0, `historical-holdout-v4 access ${setAccessCount("historical-holdout-v4")}`);
  check("realSyntheticSealUntouched", setAccessCount("synthetic-stress-holdout-v2") === 0, `synthetic-stress-holdout-v2 access ${setAccessCount("synthetic-stress-holdout-v2")}`);
  check("realV3SealUntouched", setAccessCount("historical-holdout-v3") === 1, `historical-holdout-v3 access still exactly 1`);

  for (const p of [LOG, RUN]) if (existsSync(p)) rmSync(p);

  const pass = checks.every((c) => c.pass);
  const { path } = writeArtifact("historical-holdout-v4-dryrun", {
    historicalHoldoutRunnerVersion: VALIDATION_VERSIONS.historicalHoldoutRunnerVersion,
    mockMatchup: [fa.fixtureId, fb.fixtureId], pairsPerSurface: pairs,
    checks, checksPassed: checks.filter((c) => c.pass).length, checksTotal: checks.length, allPass: pass,
  }, {
    generationCommand: "npm run validation:6c3r:dryrun",
    sourceArtifacts: [`${DIR}/historical-holdout-v4-manifest.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR });
  console.log(`\n  ${checks.filter((c) => c.pass).length}/${checks.length} checks pass — DRY RUN ${pass ? "PASSED" : "FAILED"}`);
  console.log(`wrote ${path}`);
  process.exit(pass ? 0 : 2);
}
