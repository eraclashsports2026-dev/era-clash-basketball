#!/usr/bin/env node
// ── Freeze the V4 acceptance policy, seeds and same-surface internal baseline ─
//   npm run validation:6c3r:policy [-- --pairs=2048]
//
// Everything a verdict will depend on, fixed before any V4 fixture is
// simulated: thresholds, seed manifest, and the internal baseline RECOMPUTED on
// the V4 surface — team versus its era reference — with the same evaluation
// code, so the generalisation ratio compares two datasets rather than two
// methods. The baseline uses only historical-calibration-v3 fixtures, which the
// candidate has already seen.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { historicalCalibrationV3Ids, HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { loadReferences, referenceTeam } from "./eraReferences.mjs";
import { teamFromFixture, playSurface, shareMae } from "./evalV4.mjs";
import { median } from "./holdoutEval.mjs";
import { registryHash } from "./traitRegistry.mjs";
import { scopePolicyHash } from "../../src/v3/calibration/holdoutScopePolicy.js";
import { seedManifest, v4Seed } from "./v4seeds.mjs";
import { buildCoreManifest } from "./preflight.mjs";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 2048); // 2048 pairs = 4096 side-balanced games per surface

  const refs = loadReferences();
  const store = loadPlayers();
  const profiles = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const tm = new Map(targets.records.map((r) => [r.fixtureId, r]));
  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const calibIds = historicalCalibrationV3Ids();

  console.log(`INTERNAL BASELINE v2 — calibration fixtures vs their era references, ${pairs * 2} games each\n`);
  const perFixture = [];
  for (const [i, id] of calibIds.entries()) {
    if (sealed.has(id)) throw new Error(`sealed fixture ${id} in the calibration set`);
    const fixture = corpus.fixtures.find((f) => f.fixtureId === id);
    const refDef = refs.data.references.find((r) => r.era === fixture.eraStyleId);
    const team = teamFromFixture(fixture, profiles);
    const ref = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
    const run = playSurface({ subject: team, opponent: ref, eraStyleId: fixture.eraStyleId,
      seedAt: (k) => v4Seed("era-reference-cert", 900000 + i * 30000 + k), pairs });
    const mae = shareMae({ fixture, target: tm.get(id), profiles, games: run.subjectBoxes });
    perFixture.push({ fixtureId: id, eraStyleId: fixture.eraStyleId, compositeMae: mae.compositeMae,
      supportedShareMetrics: mae.supportedShareMetrics, invariantViolations: run.invariantViolations, ties: run.ties });
    process.stdout.write(`\r  ${i + 1}/${calibIds.length}`);
  }
  console.log("");
  const composites = perFixture.map((r) => r.compositeMae).filter((x) => x != null);
  const baseline = {
    surface: "TEAM_VS_ERA_REFERENCE",
    internalCompositeMean: r5(composites.reduce((a, b) => a + b, 0) / composites.length),
    internalCompositeMedian: r5(median(composites)),
    fixturesContributing: composites.length, fixturesTotal: calibIds.length,
    gamesPerFixture: pairs * 2, perFixture,
  };
  console.log(`  internal composite MAE on the V4 surface: mean ${baseline.internalCompositeMean} · median ${baseline.internalCompositeMedian} (${composites.length}/${calibIds.length} fixtures)`);

  const manifest = readArtifact("historical-holdout-v4-manifest", DIR);
  const observability = readArtifact("observability-control-results", DIR);
  const seeds = seedManifest(16384);
  const core = buildCoreManifest();

  const policy = {
    historicalHoldoutAcceptancePolicyVersion: VALIDATION_VERSIONS.historicalHoldoutAcceptancePolicyVersion,
    frozenBeforeAnyV4Output: true,
    basedOnly: ["target availability", "trait observability certification", "non-holdout development controls",
      "the internal-validation distribution recomputed on the V4 surface", "structural invariants", "replay requirements"],
    protocol: {
      surfacesPerMatchup: ["TEAM_A_VS_TEAM_B", "TEAM_A_VS_ERA_REFERENCE", "TEAM_B_VS_ERA_REFERENCE"],
      sideBalanced: true, pairsPerSurface: pairs, gamesPerSurface: pairs * 2,
      gamesPerMatchup: pairs * 2 * 3, totalGames: pairs * 2 * 3 * 8,
      seedStream: "historical-holdout-v4",
      surfaceSeedBlock: "matchupIndex*300000 + surfaceIndex*100000 + pairIndex",
    },
    numericGates: {
      compositeShareMae: {
        measuredOn: "each team's five-share distribution in its TEAM_VS_ERA_REFERENCE games, against the Tier C season-share proxy",
        internalBaselineMean: baseline.internalCompositeMean,
        internalBaselineMedian: baseline.internalCompositeMedian,
        maxHoldoutToInternalRatio: 1.5,
        ratioNote: "The V3 gate preserved: holdout composite error over internal composite error, both measured by the same code on the same surface. Not weakened because V3 happened to pass it.",
        catastrophicThreshold: r5(3 * baseline.internalCompositeMedian),
        maxCatastrophicTeams: 0,
      },
      unavailableMetrics: "A null share map (pre-1974 steals and blocks, or any missing target) contributes no error, no pass credit and no failure.",
    },
    traitGates: {
      scoredTraits: "Only traits certified by observability-control-results, on their registry surface, against the frozen era-reference self-baselines.",
      perTrait: "PASS when the team-vs-reference metric mean sits on the claimed side of the reference self-baseline; FAIL otherwise; hard fail when the opposite side is statistically significant (95% interval excluding zero).",
      confidenceNote: "Every V4 identity carries MEDIUM style confidence, so the high-confidence failure rule binds through hard fails: a significantly-opposite trait is treated as a high-confidence failure whatever the label.",
      aggregate: { minTraitPassRate: 0.75, maxHardFails: 0, perFixtureRule: "no matchup may fail a majority of its scored traits" },
      reporting: ["PASS", "FAIL", "NOT_SCORED_UNOBSERVABLE", "NOT_APPLICABLE"],
    },
    structuralGates: {
      zeroInvariantFailures: true, zeroFinalTies: true, replayExactPerSurface: true,
      zeroImpossibleScores: true, zeroPreThreeEraThreePointAttempts: true,
    },
    outcomes: { pass: "HISTORICAL_HOLDOUT_V4_PASS", fail: "HISTORICAL_HOLDOUT_V4_FAIL", invalid: "HISTORICAL_HOLDOUT_V4_INVALID_RUN" },
    failureSemantics: "FAIL preserves all artifacts, forbids tuning, keeps Synthetic V2 sealed, and ends formal validation. INVALID_RUN resumes under the same access event only.",
    hashes: {
      candidateCoreHash: core.aggregateCoreHash,
      parameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
      traitRegistryHash: registryHash(),
      observabilityHash: observability.outputHash,
      referenceOpponentHash: readArtifact("era-reference-opponents", DIR).outputHash,
      holdoutManifestHash: manifest.data.manifestHash,
      scopePolicyHash: scopePolicyHash(),
      seedManifestHash: seeds.manifestHash,
    },
  };
  policy.policyHash = createHash("sha256").update(JSON.stringify(policy)).digest("hex");

  const w1 = writeArtifact("historical-holdout-v4-policy", policy, {
    generationCommand: "npm run validation:6c3r:policy",
    sourceArtifacts: [`${DIR}/historical-holdout-v4-manifest.json`, `${DIR}/observability-control-results.json`, `${DIR}/era-reference-opponents.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR });
  const w2 = writeArtifact("historical-holdout-v4-seeds", seeds, {
    generationCommand: "npm run validation:6c3r:policy", sourceArtifacts: [],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR });
  const w3 = writeArtifact("internal-baseline-v2-reference-surface", baseline, {
    generationCommand: "npm run validation:6c3r:policy",
    sourceArtifacts: [`${DIR}/era-reference-opponents.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR });

  console.log(`\n  policyHash ${policy.policyHash}`);
  console.log(`  seed manifest overlap ${seeds.disjointnessProof.totalOverlap}`);
  for (const w of [w1, w2, w3]) console.log(`  wrote ${w.path}`);
}
