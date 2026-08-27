#!/usr/bin/env node
// ── WS5: the frozen Synthetic V2 sample plan ─────────────────────────────────
//   npm run syn:sample-plan
//
// Volumes are fixed here, before any Synthetic V2 result exists, so statistical
// power cannot be chosen after seeing an outcome. Every volume is a power of
// two so a run can be halved for split-half diagnostics without remainders.
import { createHash } from "node:crypto";
import { writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { planFor } from "./surfaces.mjs";
import { DIR } from "./preflight.mjs";

/** Frozen per-surface volumes, in SIDE-BALANCED PAIRS. Games are twice these. */
export const VOLUMES = Object.freeze({
  MIRROR: 1024,
  MIRROR_TAIL_EXTENSION: 4096,          // only where a fixture's purpose is STATISTICAL_TAILS
  ZONE_ASYMMETRIC: 1024,
  ZONE_ABLATION_TWIN: 256,              // diagnostic only, never adjudicates
  VS_COHERENT_LOWER_CONTROL: 1024,
  VS_ROLE_MATCHED_UPGRADE: 1024,
});
/** Frozen competition-mode volumes, applied only where a purpose names them. */
export const MODES = Object.freeze({
  REPLAY_SEEDS_PER_FIXTURE: 64,
  SERIES_BEST_OF_7: 256,                // purpose SERIES_VARIANCE
  SEASONS_OF_82: 32,                    // purpose WIN82_VARIANCE
  TOURNAMENT_BRACKETS: 24,              // set-level structural check only
  TOURNAMENT_FIELD: 16,
});
/** Which fixture purposes trigger which competition mode. */
export const MODE_TRIGGERS = Object.freeze({
  SERIES_BEST_OF_7: ["SERIES_VARIANCE"],
  SEASONS_OF_82: ["WIN82_VARIANCE"],
  MIRROR_TAIL_EXTENSION: ["STATISTICAL_TAILS"],
});

export const buildSamplePlan = () => {
  const plan = planFor(SYNTHETIC_STRESS_HOLDOUT_V2);
  const rows = plan.map((p) => {
    const tailExt = MODE_TRIGGERS.MIRROR_TAIL_EXTENSION.includes(p.purpose);
    const mirrorPairs = tailExt ? VOLUMES.MIRROR_TAIL_EXTENSION : VOLUMES.MIRROR;
    const surfaces = {
      MIRROR: { pairs: mirrorPairs, games: mirrorPairs * 2, adjudicates: true,
        tailExtension: tailExt, extensionReason: tailExt ? "purpose STATISTICAL_TAILS: the tail guardrail needs the extra volume to resolve a p01/p99 scoreline" : null },
      ZONE_ASYMMETRIC: p.surfaces.ZONE_ASYMMETRIC.applicable
        ? { pairs: VOLUMES.ZONE_ASYMMETRIC, games: VOLUMES.ZONE_ASYMMETRIC * 2, adjudicates: true }
        : { pairs: 0, games: 0, adjudicates: false, reason: p.surfaces.ZONE_ASYMMETRIC.reason },
      ZONE_ABLATION_TWIN: p.surfaces.ZONE_ASYMMETRIC.applicable
        ? { pairs: VOLUMES.ZONE_ABLATION_TWIN, games: VOLUMES.ZONE_ABLATION_TWIN * 2, adjudicates: false,
            role: "DIAGNOSTIC_ONLY", note: "identical era, coaches and personnel with zoneResolution disabled, so any win-rate deviation here is the coach confound with the shell removed. Runs the engine in a non-production module configuration and therefore never adjudicates a guardrail." }
        : { pairs: 0, games: 0, adjudicates: false, reason: "no zone-asymmetric surface to diagnose" },
      VS_COHERENT_LOWER_CONTROL: p.surfaces.VS_COHERENT_LOWER_CONTROL.applicable
        ? { pairs: VOLUMES.VS_COHERENT_LOWER_CONTROL, games: VOLUMES.VS_COHERENT_LOWER_CONTROL * 2, adjudicates: true }
        : { pairs: 0, games: 0, adjudicates: false, reason: p.surfaces.VS_COHERENT_LOWER_CONTROL.reason },
      VS_ROLE_MATCHED_UPGRADE: p.surfaces.VS_ROLE_MATCHED_UPGRADE.applicable
        ? { pairs: VOLUMES.VS_ROLE_MATCHED_UPGRADE, games: VOLUMES.VS_ROLE_MATCHED_UPGRADE * 2, adjudicates: true }
        : { pairs: 0, games: 0, adjudicates: false, reason: p.surfaces.VS_ROLE_MATCHED_UPGRADE.reason },
    };
    const modes = {
      REPLAY: { seeds: MODES.REPLAY_SEEDS_PER_FIXTURE, reRunGames: MODES.REPLAY_SEEDS_PER_FIXTURE,
        adjudicates: true, note: "the first N mirror seeds are re-run and compared byte-for-byte" },
      SERIES_BEST_OF_7: MODE_TRIGGERS.SERIES_BEST_OF_7.includes(p.purpose)
        ? { series: MODES.SERIES_BEST_OF_7, estimatedGames: Math.round(MODES.SERIES_BEST_OF_7 * 4.67), adjudicates: true }
        : { series: 0, estimatedGames: 0, adjudicates: false, reason: `purpose ${p.purpose} does not name series play` },
      SEASONS_OF_82: MODE_TRIGGERS.SEASONS_OF_82.includes(p.purpose)
        ? { seasons: MODES.SEASONS_OF_82, games: MODES.SEASONS_OF_82 * 82, adjudicates: true }
        : { seasons: 0, games: 0, adjudicates: false, reason: `purpose ${p.purpose} does not name season play` },
    };
    const games = Object.values(surfaces).reduce((a, s) => a + (s.games ?? 0), 0)
      + modes.REPLAY.reRunGames + (modes.SERIES_BEST_OF_7.estimatedGames ?? 0) + (modes.SEASONS_OF_82.games ?? 0);
    return { fixtureId: p.fixtureId, purpose: p.purpose, era: p.era, surfaces, modes, totalGames: games };
  });

  const tournament = { brackets: MODES.TOURNAMENT_BRACKETS, field: MODES.TOURNAMENT_FIELD,
    gamesPerBracket: MODES.TOURNAMENT_FIELD - 1,
    games: MODES.TOURNAMENT_BRACKETS * (MODES.TOURNAMENT_FIELD - 1),
    adjudicates: false, role: "SET_LEVEL_STRUCTURAL_ONLY",
    note: "a single-elimination bracket over the 16 sealed fixtures. No frozen guardrail and no fixture purpose names tournament play, so it contributes only to the two structural guardrails (zero invariant failures, zero impossible results) and never decides a per-fixture verdict." };

  const totalGames = rows.reduce((a, r) => a + r.totalGames, 0) + tournament.games;
  return { rows, tournament, totalGames };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-sample-plan", DIR) && !process.argv.includes("--refreeze")) {
    console.log("sample plan already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const { rows, tournament, totalGames } = buildSamplePlan();
  const minGames = HOLDOUT.minGamesPerHoldoutFixture;

  console.log("SYNTHETIC V2 SAMPLE PLAN (frozen before any result exists)\n");
  for (const r of rows) {
    const s = r.surfaces;
    console.log(`  ${r.fixtureId.padEnd(30)} mirror ${String(s.MIRROR.games).padStart(5)}  zoneAsym ${String(s.ZONE_ASYMMETRIC.games).padStart(4)}  twin ${String(s.ZONE_ABLATION_TWIN.games).padStart(3)}  lower ${String(s.VS_COHERENT_LOWER_CONTROL.games).padStart(4)}  upg ${String(s.VS_ROLE_MATCHED_UPGRADE.games).padStart(4)}  modes ${String((r.modes.SERIES_BEST_OF_7.estimatedGames ?? 0) + (r.modes.SEASONS_OF_82.games ?? 0)).padStart(4)}  total ${String(r.totalGames).padStart(6)}`);
  }
  console.log(`\n  tournament (set-level, structural only): ${tournament.brackets} brackets x ${tournament.gamesPerBracket} games = ${tournament.games}`);
  console.log(`  TOTAL GAMES: ${totalGames.toLocaleString()}\n`);

  gate("everyFixtureMeetsTheFrozenMinimumVolume",
    rows.every((r) => r.totalGames >= minGames),
    `frozen minGamesPerHoldoutFixture is ${minGames}; the smallest fixture plan is ${Math.min(...rows.map((r) => r.totalGames)).toLocaleString()} games`);
  gate("everyAdjudicatingSurfaceIsSideBalanced",
    rows.every((r) => Object.values(r.surfaces).every((s) => !s.adjudicates || s.games === s.pairs * 2)),
    "every adjudicating surface runs each seed twice with the sides swapped, so a side bias cannot masquerade as a construction effect");
  gate("volumesArePowersOfTwo",
    Object.values(VOLUMES).every((v) => Number.isInteger(Math.log2(v))),
    `${Object.entries(VOLUMES).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  gate("theDiagnosticTwinNeverAdjudicates",
    rows.every((r) => r.surfaces.ZONE_ABLATION_TWIN.adjudicates === false),
    "the zone ablation twin runs the engine with a module disabled and is marked DIAGNOSTIC_ONLY on every fixture");
  gate("tournamentNeverAdjudicatesAPerFixtureGuardrail", tournament.adjudicates === false,
    "no frozen guardrail and no fixture purpose names tournament play, so it is structural-only");
  gate("competitionModesFollowFixturePurpose",
    rows.every((r) => (r.modes.SERIES_BEST_OF_7.series > 0) === MODE_TRIGGERS.SERIES_BEST_OF_7.includes(r.purpose)
      && (r.modes.SEASONS_OF_82.seasons > 0) === MODE_TRIGGERS.SEASONS_OF_82.includes(r.purpose)),
    "series play runs only on the SERIES_VARIANCE fixture and season play only on the WIN82_VARIANCE fixture, as their purposes name");
  gate("replayIsPlannedOnEveryFixture",
    rows.every((r) => r.modes.REPLAY.seeds === MODES.REPLAY_SEEDS_PER_FIXTURE),
    `${MODES.REPLAY_SEEDS_PER_FIXTURE} designated replay seeds on all ${rows.length} fixtures — determinism is a catastrophic guardrail, so it is checked everywhere`);

  const payload = {
    syntheticSamplePlanVersion: "1.0.0",
    frozenBeforeAnyResult: true,
    minGamesPerHoldoutFixture: minGames,
    volumes: VOLUMES, competitionModes: MODES, modeTriggers: MODE_TRIGGERS,
    fixtures: rows, tournament, totalGames,
    rationale: {
      sideBalance: "every adjudicating surface plays each seed twice with the sides swapped. Phase 6C3R established that an opponent-relative claim scored on an unbalanced surface cannot separate a construction effect from a side effect.",
      powersOfTwo: "so a run can be split in half for a split-half standard-error diagnostic without remainders",
      tailExtension: "the STATISTICAL_TAILS fixture gets four times the mirror volume because a p01/p99 scoreline claim needs the extra resolution; no other fixture's guardrails depend on the extreme tail",
      volumeChosenBeforeSelection: "these volumes are frozen in this preparation phase and hashed into the package, so the execution phase cannot raise them after seeing a marginal result",
    },
    pass: fail.length === 0, failedGates: fail,
  };
  payload.samplePlanHash = createHash("sha256").update(JSON.stringify({ VOLUMES, MODES, MODE_TRIGGERS,
    perFixture: rows.map((r) => [r.fixtureId, r.totalGames]) })).digest("hex");
  writeArtifact("synthetic-v2-sample-plan", payload, {
    generationCommand: "npm run syn:sample-plan", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nSAMPLE PLAN: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.samplePlanHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
