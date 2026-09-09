// ── Monte Carlo win probability ─────────────────────────────────────────────
// The probability authority, replacing the analytical expectation that
// Phase 6C2B measured at Brier 0.2507 with R² 0.035 — a no-skill baseline.
//
// This one asks the engine instead of modelling it: run the matchup N times on
// PREDICTION seeds and count. It cannot be miscalibrated against the engine's
// own behaviour, because it IS the engine's behaviour.
//
// Three separations hold it honest:
//
//   1. Prediction seeds are disjoint from validation seeds, so a probability is
//      never measured against the games that produced it.
//   2. Both are disjoint from actual-game seeds, so a prediction never reads
//      the game it precedes.
//   3. The estimator reads no result, and no game reads the estimator. There is
//      no feedback loop in either direction.
import { createHash } from "node:crypto";
import { runPossessionGame } from "../possession/index.js";
import { domainSeed, MASTERS, tierSize, SAMPLE_TIERS } from "./seedDomains.js";
import { parameterSetHash } from "./parameters.js";
import { versionOf } from "../../versions.js";

export const MONTE_CARLO_PROBABILITY_VERSION = versionOf("monteCarloProbabilityVersion");
export const PROBABILITY_CACHE_SCHEMA_VERSION = versionOf("probabilityCacheSchemaVersion");

export const LABEL = "ERACLASH_MODEL_IMPLIED_PROBABILITY";

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

/**
 * Wilson score interval for a binomial proportion.
 *
 * Not p ± 1.96·SE: the naive interval misbehaves badly near 0 and 1 and can
 * produce bounds outside [0,1], which for a probability is not a rounding
 * quibble but a nonsense result.
 */
export const wilsonInterval = (wins, n, z = 1.96) => {
  if (!(n > 0)) return { method: "wilson", level: 0.95, lower: null, upper: null, halfWidth: null };
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return {
    method: "wilson", level: 0.95,
    lower: r4(Math.max(0, centre - spread)),
    upper: r4(Math.min(1, centre + spread)),
    halfWidth: r4(spread),
  };
};

/**
 * The canonical order of an unordered pair, so A-vs-B and B-vs-A share one
 * cached estimate. Without this the reversed display of the same matchup would
 * run a second independent Monte Carlo job and, being a different sample, would
 * disagree with the first.
 */
export const canonicalPair = (a, b) => {
  const ka = JSON.stringify({ ids: a.playerIds, coach: a.coachId });
  const kb = JSON.stringify({ ids: b.playerIds, coach: b.coachId });
  return ka <= kb ? { first: a, second: b, reversed: false } : { first: b, second: a, reversed: true };
};

export const canonicalMatchupFingerprint = ({ teamA, teamB, eraStyleId }) => {
  const { first, second } = canonicalPair(teamA, teamB);
  return createHash("sha256").update(JSON.stringify({
    era: eraStyleId,
    first: { ids: first.playerIds, coach: first.coachId },
    second: { ids: second.playerIds, coach: second.coachId },
  })).digest("hex").slice(0, 32);
};

/** Every version that materially shapes an estimate. A change to any must miss. */
export const activeVersionsFor = () => ({
  possessionEngineVersion: versionOf("possessionEngineVersion"),
  actionLibraryVersion: versionOf("actionLibraryVersion"),
  defensiveMatchupVersion: versionOf("defensiveMatchupVersion"),
  zoneResolutionVersion: versionOf("zoneResolutionVersion"),
  coachAdjustmentVersion: versionOf("coachAdjustmentVersion"),
  opportunityAllocationVersion: versionOf("opportunityAllocationVersion"),
  // Truthful about the uncalibrated state rather than omitting the field.
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion") ?? "UNCALIBRATED",
  playerDataVersion: versionOf("playerDataVersion"),
  playerIntelligenceVersion: versionOf("playerIntelligenceVersion"),
  teamIntelligenceVersion: versionOf("teamIntelligenceVersion"),
  coachDataVersion: versionOf("coachDataVersion"),
  coachIntelligenceVersion: versionOf("coachIntelligenceVersion"),
  eraDataVersion: versionOf("eraDataVersion"),
  eraStyleVersion: versionOf("eraStyleVersion"),
  calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
});

export const probabilityCacheKey = ({ matchupFingerprint, sampleTier, sampleCount }) => {
  const v = activeVersionsFor();
  const tag = (x) => String(x).replace(/[^A-Za-z0-9]+/g, "-");
  return [
    "mc-probability",
    `mc${tag(MONTE_CARLO_PROBABILITY_VERSION)}`,
    `cs${tag(PROBABILITY_CACHE_SCHEMA_VERSION)}`,
    `ps${tag(versionOf("predictionSeedSetVersion"))}`,
    `t${tag(sampleTier)}`, `n${sampleCount}`,
    ...Object.entries(v).map(([k, val]) => `${k.slice(0, 3)}${tag(val)}`),
    `ph${parameterSetHash().slice(0, 12)}`,
    matchupFingerprint,
  ].join(":");
};

// ── Process-memory cache ────────────────────────────────────────────────────
// Development-only, and never in a production namespace. The KV adapter is a
// seam for cross-instance reuse later; nothing writes to production storage.
const memory = new Map();
export const cacheStats = { requested: 0, hits: 0, misses: 0, generated: 0 };
export const resetCache = () => { memory.clear(); cacheStats.requested = 0; cacheStats.hits = 0; cacheStats.misses = 0; cacheStats.generated = 0; };

/**
 * Balanced side orientation.
 *
 * EraClash plays on a neutral court, so any Gold/Blue advantage is an artifact.
 * Each prediction seed is run twice — once with A as gold, once with B as gold —
 * and both are converted to A's perspective. The unbalanced orientation rates
 * are REPORTED rather than quietly averaged away: a systematic side effect is a
 * bug, and hiding it inside the average would make it permanent.
 */
export const estimateWinProbability = ({
  teamA, teamB, eraStyleId, sampleTier = "STANDARD",
  buildInput, cache = true,
}) => {
  const n = tierSize(sampleTier);
  if (n % 2 !== 0) throw new Error(`estimateWinProbability: sample tier ${sampleTier} must be even for paired orientations`);
  const pairs = n / 2;

  const matchupFingerprint = canonicalMatchupFingerprint({ teamA, teamB, eraStyleId });
  const { reversed } = canonicalPair(teamA, teamB);
  const key = probabilityCacheKey({ matchupFingerprint, sampleTier, sampleCount: n });

  cacheStats.requested += 1;
  if (cache && memory.has(key)) {
    cacheStats.hits += 1;
    const stored = memory.get(key);
    // The reversed display perspective is the complement of the SAME estimate,
    // never a second Monte Carlo job — two independent samples of one matchup
    // would disagree with each other.
    return reversed ? complement(stored) : stored;
  }
  cacheStats.misses += 1;

  const { first, second } = canonicalPair(teamA, teamB);
  let firstWinsAsGold = 0;
  let firstWinsAsBlue = 0;
  let goldWinsOverall = 0;
  // The per-pair orientation difference. The side-bias statistic is a mean over
  // PAIRS that share a seed, so its uncertainty depends on how often the two
  // orientations disagree. Phase 6C2C5's gate reported sqrt(0.25/n), a single
  // proportion under independence, which is the wrong variance for this design
  // and wrong in the direction that hides real effects.
  const orientationDiffs = new Int8Array(pairs);

  for (let i = 0; i < pairs; i++) {
    const seed = domainSeed(MASTERS.prediction, "prediction", i);
    // Orientation 1: first team as gold.
    const g1 = runPossessionGame(buildInput({ goldIds: first.playerIds, blueIds: second.playerIds,
      coachGoldId: first.coachId, coachBlueId: second.coachId, eraStyleId, simulationSeed: seed }), { includeLedger: false });
    if (g1.finalScore.gold > g1.finalScore.blue) { firstWinsAsGold++; goldWinsOverall++; }

    // Orientation 2: the SAME seed, sides swapped.
    const g2 = runPossessionGame(buildInput({ goldIds: second.playerIds, blueIds: first.playerIds,
      coachGoldId: second.coachId, coachBlueId: first.coachId, eraStyleId, simulationSeed: seed }), { includeLedger: false });
    if (g2.finalScore.blue > g2.finalScore.gold) firstWinsAsBlue++;
    if (g2.finalScore.gold > g2.finalScore.blue) goldWinsOverall++;
    orientationDiffs[i] = (g1.finalScore.gold > g1.finalScore.blue ? 1 : 0)
      - (g2.finalScore.blue > g2.finalScore.gold ? 1 : 0);
  }

  // Paired summary of D in {-1, 0, 1}.
  let dSum = 0;
  for (let i = 0; i < pairs; i++) dSum += orientationDiffs[i];
  const dMean = dSum / pairs;
  let dSq = 0; let discordant = 0;
  for (let i = 0; i < pairs; i++) { dSq += (orientationDiffs[i] - dMean) ** 2; if (orientationDiffs[i] !== 0) discordant++; }
  const dSd = pairs > 1 ? Math.sqrt(dSq / (pairs - 1)) : 0;
  const dSe = pairs > 0 ? dSd / Math.sqrt(pairs) : null;

  const firstWins = firstWinsAsGold + firstWinsAsBlue;
  const p = firstWins / n;

  const result = Object.freeze({
    perspectiveTeamId: first.teamId ?? "first",
    counterpartTeamId: second.teamId ?? "second",
    goldWinProbability: r4(p),
    blueWinProbability: r4(1 - p),
    goldWins: firstWins,
    blueWins: n - firstWins,
    sampleCount: n,
    sampleTier,
    confidenceInterval: wilsonInterval(firstWins, n),
    sideBias: {
      // How often the GOLD slot won, regardless of which team held it. A
      // neutral court should give ~0.5.
      goldOrientationRate: r4(goldWinsOverall / n),
      blueOrientationRate: r4(1 - goldWinsOverall / n),
      // Retained for continuity with Phase 6C2C5 artifacts. For this balanced
      // paired design it is algebraically HALF the paired orientation effect
      // below, which is why it must never be compared against a margin meant
      // for the paired scale.
      difference: r4(goldWinsOverall / n - 0.5),
      differenceScale: "HALF_OF_PAIRED_EFFECT",
      firstAsGoldWinRate: r4(firstWinsAsGold / pairs),
      firstAsBlueWinRate: r4(firstWinsAsBlue / pairs),
      // The paired orientation effect and its OWN uncertainty. delta =
      // mean(Y_gold - Y_blue) over seeds, from the perspective of `first`.
      pairedEffect: r4(dMean),
      pairedSd: r4(dSd),
      pairedStandardError: dSe == null ? null : r4(dSe),
      pairedZ: dSe > 0 ? r4(dMean / dSe) : null,
      discordantPairs: discordant,
      pairs,
      perspectiveTeamForPairedEffect: first.teamId ?? "first",
      note: "Measured BEFORE pairing removes it. A systematic gold or blue advantage is a bug, not something to average away silently. `difference` is on the half scale; `pairedEffect` is the product-meaningful quantity and carries the standard error appropriate to a paired design.",
    },
    predictionFingerprint: createHash("sha256").update(key).digest("hex").slice(0, 32),
    matchupFingerprint,
    monteCarloProbabilityVersion: MONTE_CARLO_PROBABILITY_VERSION,
    probabilityCacheSchemaVersion: PROBABILITY_CACHE_SCHEMA_VERSION,
    predictionSeedSetVersion: versionOf("predictionSeedSetVersion"),
    activeVersions: activeVersionsFor(),
    parameterSetHash: parameterSetHash(),
    cacheKey: key,
    // Never TRUE_PROBABILITY, HISTORICAL_PROBABILITY or GUARANTEED_ODDS. It is
    // what this model implies, and nothing more.
    label: LABEL,
  });

  cacheStats.generated += 1;
  if (cache) memory.set(key, result);
  return reversed ? complement(result) : result;
};

/** P(B beats A) = 1 - P(A beats B), from the same estimate. */
export const complement = (r) => Object.freeze({
  ...r,
  // The perspective genuinely swaps. The previous guard was `=== "first"`, which
  // never matches a real team id, so a complemented estimate flipped its
  // probability while still naming the ORIGINAL team as its perspective. 13 of
  // the 30 Phase 6C2C5 cells took this path. It changed no number the validation
  // published, because that reads goldWinProbability, but a label that
  // contradicts its own number is a defect waiting to be believed.
  perspectiveTeamId: r.counterpartTeamId ?? (r.perspectiveTeamId === "first" ? "second" : r.perspectiveTeamId),
  counterpartTeamId: r.perspectiveTeamId,
  goldWinProbability: r4(1 - r.goldWinProbability),
  blueWinProbability: r4(r.goldWinProbability),
  goldWins: r.blueWins,
  blueWins: r.goldWins,
  confidenceInterval: {
    ...r.confidenceInterval,
    lower: r.confidenceInterval.upper == null ? null : r4(1 - r.confidenceInterval.upper),
    upper: r.confidenceInterval.lower == null ? null : r4(1 - r.confidenceInterval.lower),
  },
  perspective: "COMPLEMENT_OF_CANONICAL",
});

/** Telemetry properties. Carries no roster payload, user data or actual game seed. */
export const observability = (r, latencyMs, cacheSource) => ({
  event: "mc_probability_generated",
  matchupFingerprint: r.matchupFingerprint,
  predictionFingerprint: r.predictionFingerprint,
  sampleTier: r.sampleTier,
  sampleCount: r.sampleCount,
  latencyMs: Math.round(latencyMs),
  probability: r.goldWinProbability,
  confidenceIntervalWidth: r.confidenceInterval.halfWidth == null ? null : r4(r.confidenceInterval.halfWidth * 2),
  sideBiasDifference: r.sideBias.difference,
  cacheSource,
  activeVersions: r.activeVersions,
  parameterSetHash: r.parameterSetHash,
});

export { SAMPLE_TIERS };
