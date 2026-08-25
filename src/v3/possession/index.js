// ── Possession Engine 1.0 — public surface ───────────────────────────────────
// DEVELOPMENT ONLY. possessionEngineVersion is 1.0.0 with status DEVELOPMENT,
// and POSSESSION_ENGINE_ENABLED defaults to false. The live production engine
// remains engineVersion 3.2.0 and is untouched by anything in this directory.
//
// This engine is NOT historically authoritative, definitive, scientifically
// proven, or fully accurate, and it must not be described that way. The player
// data it consumes still carries substantial documented uncertainty (see
// player-data-risk-register.md), and no historical backtesting or holdout
// validation has been performed. Status stays DEVELOPMENT / CALIBRATION
// REQUIRED until Phase 6C.
import { versionOf } from "../../versions.js";
import { matchupFingerprint } from "../fingerprint.js";
import { simulatePossessionGame } from "./game.js";
import { assertNoViolations, checkGame } from "./invariants.js";
import { childSeeds, deriveSeed } from "./rng.js";
import { preparePossessionContext, validatePossessionInput, PossessionInputError } from "./context.js";

export const POSSESSION_ENGINE_VERSION = versionOf("possessionEngineVersion");
export const POSSESSION_ENGINE_STATUS = "DEVELOPMENT";

/**
 * Versions that ACTUALLY shaped this result. A fingerprint that lists modules
 * the result did not depend on is a false reproducibility claim: it would
 * invalidate stored games on an unrelated version bump.
 *
 * Chemistry is deliberately absent — it remains display-only and does not
 * touch a possession.
 */
export const resultVersions = () => ({
  engineVersion: versionOf("engineVersion"),
  possessionEngineVersion: versionOf("possessionEngineVersion"),
  actionLibraryVersion: versionOf("actionLibraryVersion"),
  playerDataVersion: versionOf("playerDataVersion"),
  playerIntelligenceVersion: versionOf("playerIntelligenceVersion"),
  teamIntelligenceVersion: versionOf("teamIntelligenceVersion"),
  coachDataVersion: versionOf("coachDataVersion"),
  coachIntelligenceVersion: versionOf("coachIntelligenceVersion"),
  eraDataVersion: versionOf("eraDataVersion"),
  eraStyleVersion: versionOf("eraStyleVersion"),
  calibrationVersion: versionOf("calibrationVersion"),
});

/**
 * Run one possession game.
 *
 * @param {object} input prepared basketball context — see context.js. The core
 *   fetches nothing, calls no model, and reads no global state.
 * @param {object} [opts]
 * @param {boolean} [opts.assertInvariants=true] throw on any conservation
 *   violation. On in development and tests; a caller may disable it only to
 *   MEASURE violations (the benchmark does), never to tolerate them.
 * @param {boolean} [opts.includeLedger=true] keep the full possession ledger.
 */
export const runPossessionGame = (input, { assertInvariants = true, includeLedger = true } = {}) => {
  const game = simulatePossessionGame(input);

  const fingerprint = {
    ...resultVersions(),
    matchupFingerprint: matchupFingerprint({
      goldIds: input.gold.playerCards.map((p) => p.id),
      blueIds: input.blue.playerCards.map((p) => p.id),
      coachGoldId: input.gold.coachId ?? input.gold.coachIntelligence?.id ?? null,
      coachBlueId: input.blue.coachId ?? input.blue.coachIntelligence?.id ?? null,
      eraStyleId: input.eraStyleId,
      mode: input.mode ?? "single",
    }),
    simulationSeed: game.simulationSeed,
  };

  const violations = checkGame(game);
  if (assertInvariants) assertNoViolations(game);

  return {
    ...game,
    fingerprint,
    invariantViolations: violations,
    possessionLedger: includeLedger ? game.possessionLedger : undefined,
    ledgerSize: game.possessionLedger.length,
    engine: "possession-1.0",
    engineStatus: POSSESSION_ENGINE_STATUS,
    historicalAuthority: "NONE — development engine, calibration required",
  };
};

/**
 * A series or season: ONE parent seed, one independently derived child seed per
 * game. Reusing a single game-form modifier across a whole series is the bug
 * this prevents — one unlucky draw must not repeat itself seven times.
 */
export const runPossessionSeries = (input, { games = 7, opts } = {}) => {
  const seeds = childSeeds(input.simulationSeed, games);
  return seeds.map((seed, i) => runPossessionGame({ ...input, simulationSeed: seed, mode: input.mode ?? "series" }, opts));
};

export {
  simulatePossessionGame, preparePossessionContext, validatePossessionInput,
  PossessionInputError, checkGame, assertNoViolations, childSeeds, deriveSeed,
};
