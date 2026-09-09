// ── Phase 6C2C1 sets ────────────────────────────────────────────────────────
// Four sets, four different jobs, four different access policies:
//
//   historical calibration v3   24 fixtures  AVAILABLE_FOR_TUNING
//   historical holdout v3        8 fixtures  SEALED_UNREAD
//   synthetic development v2    14 fixtures  AVAILABLE_FOR_DEVELOPMENT
//   synthetic stress holdout v2 16 fixtures  SEALED_UNREAD
//
// The two synthetic sets are deliberately separate. Phase 6C2B collapsed them
// into one and called the result a holdout, when 19 of its 25 fixtures had
// already been simulated. A set that development may look at and a set that
// validates generalisation cannot be the same set.
import { createHash } from "node:crypto";
import { versionOf } from "../../src/versions.js";
import { loadCorpusV3 } from "../../scripts/calibration/build-corpus-v3.mjs";

/**
 * Historical holdout v3 — one fixture per Era Style, declared BEFORE any
 * tuning, by stratified criteria rather than by engine performance.
 *
 * Criteria, in order:
 *   1. exactly one per era, so every era is validated
 *   2. a franchise that is not over-represented in that era's calibration half
 *   3. spread of offensive identity: transition, motion, post, pace, defence
 *   4. spread of coach system
 *   5. at least one unusual but source-valid team
 */
export const HISTORICAL_HOLDOUT_V3_IDS = Object.freeze([
  "h3-1953-54-lakers",    // 1950s · post-centred, size-heavy · Kundla · the only non-Celtics 1950s identity
  "h3-1968-69-knicks",    // 1960s · motion, non-champion · Holzman
  "h3-1976-77-blazers",   // 1970s · passing-hub centre · Ramsay · unusual: an offence run through a centre
  "h3-1982-83-sixers",    // 1980s · transition and post · Cunningham
  "h3-1993-94-knicks",    // 1990s · very slow, elite defence, non-champion · Riley
  "h3-2006-07-suns",      // 2000s · pace extreme, seven seconds or less · D'Antoni
  "h3-2012-13-heat",      // 2010s · small-ball, switching defence · Spoelstra
  "h3-2022-23-raptors",   // 2020s · zone-capable, no true centre · Nurse
]);

export const HISTORICAL_HOLDOUT_V3_RATIONALE =
  "One fixture per Era Style, declared before any tuning. Stratified on franchise, offensive identity, defensive identity, coach system and pace environment. Includes deliberately unusual but source-valid teams: a 1977 offence run through a passing centre, a 1994 team at the slowest pace in the corpus, and a 2023 team with no true centre.";

export const historicalCalibrationV3Ids = () => {
  const c = loadCorpusV3();
  if (!c) return [];
  return c.fixtures.map((f) => f.fixtureId).filter((id) => !HISTORICAL_HOLDOUT_V3_IDS.includes(id)).sort();
};

// ── Synthetic sets ──────────────────────────────────────────────────────────
// Built from PUBLIC cards, because their job is structural: exploit resistance,
// balance and edge-case stability, none of which needs a historical roster.

/** Available for development and as Phase 6C2C2 tuning guardrails. NOT a holdout. */
export const SYNTHETIC_DEVELOPMENT_V2 = Object.freeze([
{ id: "sd2-balanced-lower-ovr", purpose: "BALANCED_CONSTRUCTION", era: "2010s", coach: "gregg-popovich",
    five: ["cp3-10s","kawhi-10s","butler-10s","jokic-10s","dwight-10s"] },
  { id: "sd2-creator-stack", purpose: "SUPERSTAR_STACK", era: "2010s", coach: "mike-dantoni",
    five: ["harden-10s","russ-10s","lebron-10s","durant-10s","giannis-10s"] },
  { id: "sd2-elite-shooting", purpose: "ELITE_SHOOTING", era: "2010s", coach: "steve-kerr",
    five: ["harden-10s","durant-10s","klay-10s","dirk-10s","boogie-2010s"] },
  { id: "sd2-weak-shooting", purpose: "WEAK_SHOOTING", era: "2010s", coach: "tom-thibodeau",
    five: ["russ-10s","demar-2010s","draymond-10s","love-10s","drummond-2010s"] },
  { id: "sd2-extreme-size", purpose: "EXTREME_SIZE", era: "1960s", coach: "red-auerbach",
    five: ["oscar-60s","barry-60s","elgin-60s","nate-60s","wilt-60s"] },
  { id: "sd2-extreme-small", purpose: "EXTREME_SMALL_BALL", era: "2020s", coach: "steve-kerr",
    five: ["clayton-20s","trejohnson-20s","klay-20s","acebailey-20s","cmb-20s"] },
  { id: "sd2-passing-hub", purpose: "PASSING_HUB", era: "2020s", coach: "nick-nurse",
    five: ["tyrese-20s","cade-20s","luka-20s","jokic-20s","draymond-20s"] },
  { id: "sd2-no-rim-protection", purpose: "NO_RIM_PROTECTION", era: "2010s", coach: "mike-dantoni",
    five: ["curry-10s","kobe-10s","kawhi-10s","melo-10s","jokic-10s"] },
  { id: "sd2-movement-shooters", purpose: "MOVEMENT_SHOOTERS", era: "2010s", coach: "steve-kerr",
    five: ["curry-10s","durant-10s","kawhi-10s","dirk-10s","jokic-10s"] },
  { id: "sd2-post-mismatch", purpose: "POST_MISMATCH", era: "1970s", coach: "lenny-wilkens",
    five: ["pete-70s","rick-70s","julius-70s","elvin-70s","artis-70s"] },
  { id: "sd2-zone-attack", purpose: "ZONE_ATTACK", era: "2010s", coach: "erik-spoelstra",
    five: ["harden-10s","curry-10s","lebron-10s","durant-10s","giannis-10s"] },
  { id: "sd2-weak-defender-hiding", purpose: "WEAK_DEFENDER_HIDING", era: "2010s", coach: "mike-dantoni",
    five: ["harden-10s","durant-10s","kobe-10s","melo-10s","embiid-10s"] },
  { id: "sd2-action-family-stress", purpose: "ACTION_FAMILY_STRESS", era: "1990s", coach: "jerry-sloan",
    five: ["isiah-90s","gary-90s","jordan-90s","grant-90s","malone-90s"] },
  { id: "sd2-cross-era", purpose: "CROSS_ERA_TRANSLATION", era: "1960s", coach: "phil-jackson",
    five: ["oscar-60s","jordan-90s","elgin-60s","lebron-10s","wilt-60s"] },
]);

/**
 * Synthetic stress holdout v2 — SEALED.
 *
 * Every lineup here is DISTINCT from every development lineup, checked by
 * construction: a holdout that shares a five with a development set is not a
 * holdout. Version 2 rather than a reuse of v1, whose 25 fixtures were
 * simulated during Phase 6C2A and therefore cannot validate anything.
 */
export const SYNTHETIC_STRESS_HOLDOUT_V2 = Object.freeze([
{ id: "ss2-all-bigs", purpose: "EXPLOIT_ROLE_OVERLAP", era: "2000s", coach: "gregg-popovich",
    five: ["lebron-00s","tmac-00s","marion-00s","ben-00s","dwight-00s"] },
  { id: "ss2-all-guards", purpose: "EXPLOIT_ROLE_OVERLAP", era: "2010s", coach: "mike-dantoni",
    five: ["cp3-10s","harden-10s","lebron-10s","draymond-10s","jokic-10s"] },
  { id: "ss2-no-spacing-1960s", purpose: "IMPOSSIBLE_SPACING", era: "1960s", coach: "red-auerbach",
    five: ["rodgers-60s","chet-60s","jerry-l-60s","walt-b-60s","bill-60s"] },
  { id: "ss2-no-spacing-modern", purpose: "IMPOSSIBLE_SPACING", era: "2020s", coach: "tom-thibodeau",
    five: ["smart-20s","demar-20s","zion-20s","bam-20s","draymond-20s"] },
  { id: "ss2-mismatch-chain", purpose: "DEFENSIVE_MISMATCH_CHAIN", era: "2010s", coach: "erik-spoelstra",
    five: ["harden-10s","kobe-10s","melo-10s","lebron-10s","love-10s"] },
  { id: "ss2-zone-edge-legal", purpose: "ZONE_EDGE_CASE", era: "2020s", coach: "erik-spoelstra",
    five: ["luka-20s","tatum-20s","giannis-20s","wemby-20s","ad-20s"] },
  { id: "ss2-zone-edge-illegal", purpose: "ZONE_EDGE_CASE", era: "1970s", coach: "tom-heinsohn",
    five: ["tiny-70s","oscar-70s","julius-70s","dave-c-70s","wilt-70s"] },
  { id: "ss2-era-edge-old-in-modern", purpose: "ERA_EDGE_CASE", era: "2020s", coach: "red-auerbach",
    five: ["cousy-50s","sharman-50s","arizin-50s","pettit-50s","russell-50s"] },
  { id: "ss2-era-edge-modern-in-old", purpose: "ERA_EDGE_CASE", era: "1950s", coach: "john-kundla",
    five: ["harden-10s","curry-10s","durant-10s","lebron-10s","dirk-10s"] },
  { id: "ss2-coach-toolkit-edge", purpose: "COACH_TOOLKIT_EDGE", era: "1960s", coach: "mike-dantoni",
    five: ["oscar-60s","barry-60s","elgin-60s","bob-60s","wilt-60s"] },
  { id: "ss2-usage-concentration", purpose: "USAGE_CONCENTRATION", era: "1960s", coach: "red-auerbach",
    five: ["jerry-60s","barry-60s","elgin-60s","bob-60s","wilt-60s"] },
  { id: "ss2-statistical-tails", purpose: "STATISTICAL_TAILS", era: "1970s", coach: "lenny-wilkens",
    five: ["pete-70s","rick-70s","julius-70s","bob-mc-70s","kareem-70s"] },
  { id: "ss2-series-variance", purpose: "SERIES_VARIANCE", era: "1990s", coach: "phil-jackson",
    five: ["dumars-90s","jordan-90s","pippen-90s","malone-90s","hak-90s"] },
  { id: "ss2-win82-variance", purpose: "WIN82_VARIANCE", era: "2000s", coach: "larry-brown",
    five: ["parker-00s","kobe-00s","bowen-2ks","duncan-00s","shaq-00s"] },
  { id: "ss2-duplicate-role", purpose: "DUPLICATE_ROLE_OVERLOAD", era: "2010s", coach: "steve-kerr",
    five: ["harden-10s","durant-10s","klay-10s","dirk-10s","jokic-10s"] },
  { id: "ss2-extreme-strength-gap", purpose: "EXTREME_STRENGTH_GAP", era: "2010s", coach: "tom-thibodeau",
    five: ["conley-10s","klay-10s","draymond-10s","ibaka-2010s","dj-10s"] },
]);

// ── Manifests ───────────────────────────────────────────────────────────────
export const manifestHash = (ids, kind) =>
  createHash("sha256").update(JSON.stringify({ kind, ids: [...ids].sort() })).digest("hex");

const common = () => ({
  historicalCorpusVersion: versionOf("historicalCorpusVersion"),
  calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
  historicalTargetDataVersion: versionOf("historicalTargetDataVersion"),
  predictionSeedSetVersion: versionOf("predictionSeedSetVersion"),
  probabilityValidationSeedSetVersion: versionOf("probabilityValidationSeedSetVersion"),
  // No wall-clock timestamp: a manifest whose hash changes on every
  // regeneration cannot prove it was frozen.
  frozenAt: "phase-6c2c1",
});

export const buildManifest = (kind) => {
  if (kind === "historical-calibration-v3") {
    const ids = historicalCalibrationV3Ids();
    return { kind, ...common(), setVersion: versionOf("historicalCalibrationSetVersion"),
      accessPolicy: "AVAILABLE_FOR_TUNING", fixtureCount: ids.length, fixtureIds: ids,
      manifestHash: manifestHash(ids, kind),
      rationale: "Every source-valid historical fixture not held out. Three per Era Style. Phase 6C2C2 may tune against this set." };
  }
  if (kind === "historical-holdout-v3") {
    const ids = [...HISTORICAL_HOLDOUT_V3_IDS].sort();
    return { kind, ...common(), setVersion: versionOf("historicalHoldoutSetVersion"),
      accessPolicy: "SEALED_UNREAD", fixtureCount: ids.length, fixtureIds: ids,
      manifestHash: manifestHash(ids, kind), rationale: HISTORICAL_HOLDOUT_V3_RATIONALE,
      eligibility: "HISTORICAL_LINEUP, HISTORICAL_STARTER_PROXY and HISTORICAL_PRINCIPAL_FIVE_PROXY only" };
  }
  if (kind === "synthetic-development-v2") {
    const ids = SYNTHETIC_DEVELOPMENT_V2.map((f) => f.id).sort();
    return { kind, ...common(), setVersion: versionOf("syntheticDevelopmentSetVersion"),
      accessPolicy: "AVAILABLE_FOR_DEVELOPMENT", fixtureCount: ids.length, fixtureIds: ids,
      purposes: Object.fromEntries(SYNTHETIC_DEVELOPMENT_V2.map((f) => [f.id, f.purpose])),
      manifestHash: manifestHash(ids, kind),
      rationale: "Structural development and Phase 6C2C2 tuning guardrails. Explicitly NOT a holdout.",
      contributesHistoricalError: false };
  }
  if (kind === "synthetic-stress-holdout-v2") {
    const ids = SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id).sort();
    return { kind, ...common(), setVersion: versionOf("syntheticStressHoldoutVersion"),
      accessPolicy: "SEALED_UNREAD", fixtureCount: ids.length, fixtureIds: ids,
      purposes: Object.fromEntries(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [f.id, f.purpose])),
      manifestHash: manifestHash(ids, kind),
      rationale: "Combinations that appear nowhere in the development set. Version 2 rather than a reuse of v1, whose fixtures were simulated during Phase 6C2A.",
      contributesHistoricalError: false };
  }
  throw new Error(`buildManifest: unknown set "${kind}"`);
};

export const SET_KINDS = Object.freeze([
  "historical-calibration-v3", "historical-holdout-v3",
  "synthetic-development-v2", "synthetic-stress-holdout-v2",
]);

/** No fixture may appear in two sets. */
export const overlaps = () => {
  const sets = Object.fromEntries(SET_KINDS.map((k) => [k, new Set(buildManifest(k).fixtureIds)]));
  const out = {};
  for (let i = 0; i < SET_KINDS.length; i++) {
    for (let j = i + 1; j < SET_KINDS.length; j++) {
      const a = SET_KINDS[i];
      const b = SET_KINDS[j];
      out[`${a}|${b}`] = [...sets[a]].filter((x) => sets[b].has(x));
    }
  }
  return out;
};

/** Development and stress sets must not share a LINEUP either, not just an id. */
export const syntheticLineupOverlap = () => {
  const dev = new Set(SYNTHETIC_DEVELOPMENT_V2.map((f) => [...f.five].sort().join(",")));
  return SYNTHETIC_STRESS_HOLDOUT_V2.filter((f) => dev.has([...f.five].sort().join(","))).map((f) => f.id);
};

export const coverage = (ids) => {
  const c = loadCorpusV3();
  if (!c) return null;
  const byId = new Map(c.fixtures.map((f) => [f.fixtureId, f]));
  const fs = ids.map((id) => byId.get(id)).filter(Boolean);
  return {
    count: fs.length,
    eras: [...new Set(fs.map((f) => f.eraStyleId))].sort(),
    perEra: fs.reduce((a, f) => ({ ...a, [f.eraStyleId]: (a[f.eraStyleId] ?? 0) + 1 }), {}),
    franchises: [...new Set(fs.map((f) => f.teamId))].sort(),
    coaches: [...new Set(fs.map((f) => f.coachId))].sort(),
    fixtureTypes: fs.reduce((a, f) => ({ ...a, [f.fixtureType]: (a[f.fixtureType] ?? 0) + 1 }), {}),
    styleTags: [...new Set(fs.flatMap((f) => f.qualitativeIdentity.tags ?? []))].sort(),
    confidence: fs.reduce((a, f) => ({ ...a, [f.confidence.overallFixtureConfidence]: (a[f.confidence.overallFixtureConfidence] ?? 0) + 1 }), {}),
  };
};
