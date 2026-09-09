// ── Phase 6C2B calibration sets ─────────────────────────────────────────────
// Three frozen sets, each with a different job:
//
//   historical calibration v2  — tuning against real team-seasons
//   historical holdout v2      — did the tuning generalise?  SEALED
//   synthetic stress v1        — structure, balance, exploits. SEALED
//
// The legacy holdout v1 is preserved untouched and is NOT reused: it mixes
// historical and synthetic fixtures under labels that overstated them, so it
// cannot serve as formal historical validation.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { versionOf } from "../../src/versions.js";
import { CORPUS_V1_RECLASSIFICATION, isSynthetic, mayEnterHistoricalHoldout } from "./classification.mjs";

export const CORPUS_V2_PATH = "data/calibration/historical-corpus-v2.json";

export const loadCorpusV2 = () =>
  existsSync(CORPUS_V2_PATH) ? JSON.parse(readFileSync(CORPUS_V2_PATH, "utf8")) : null;

/**
 * Historical holdout v2 — declared BEFORE any tuning, by stratified criteria,
 * never by which fixtures the engine currently struggles with.
 *
 * Criteria, in order:
 *   1. one fixture from each era the corpus covers beyond the 1960s
 *   2. prefer a different franchise in each
 *   3. prefer distinct offensive identities
 *   4. never both seasons of an identical five
 *
 * It is far below the 8-12 the phase brief asks for, because the whole
 * historical corpus is 10 fixtures. Holding out 8 would leave nothing to
 * calibrate on. That is a corpus limitation, stated rather than disguised by
 * padding the set with synthetic teams.
 */
export const HISTORICAL_HOLDOUT_V2_IDS = Object.freeze([
  "h2-1974-75-celtics",   // 1970s · fast motion offence · Celtics
  "h2-1987-88-lakers",    // 1980s · half-court Showtime · Lakers
  "h2-2003-04-pistons",   // 2000s · elite defence, slow pace · Pistons
]);

export const HISTORICAL_HOLDOUT_V2_RATIONALE =
  "Stratified by era, franchise and offensive identity, declared before tuning. Three eras (1970s, 1980s, 2000s), three franchises, three distinct identities: fast motion, half-court star offence, and slow elite defence. Deliberately small because the historical corpus is only 10 fixtures — the alternative was a holdout that consumed the corpus, or one padded with synthetic teams that cannot validate historical accuracy.";

export const historicalCalibrationV2Ids = () => {
  const c = loadCorpusV2();
  if (!c) return [];
  return c.fixtures.map((f) => f.fixtureId).filter((id) => !HISTORICAL_HOLDOUT_V2_IDS.includes(id));
};

/**
 * Synthetic stress holdout v1.
 *
 * Every fixture reclassified out of the historical corpus keeps its structural
 * purpose here. These validate STRUCTURE — exploit resistance, edge-case
 * stability, balance, invariants — and contribute no historical numerical
 * error, because none of these teams ever played.
 */
export const SYNTHETIC_STRESS_V1_IDS = Object.freeze(
  Object.entries(CORPUS_V1_RECLASSIFICATION)
    .filter(([, v]) => isSynthetic(v.now))
    .map(([id]) => id)
    .sort(),
);

export const SYNTHETIC_STRESS_PURPOSES = Object.freeze({
  "1950s-pace-extreme": "PACE_EXTREME",
  "1960s-interior-dominance": "EXTREME_SIZE",
  "1960s-celtics-dynasty": "DEFENSE_FIRST",
  "1970s-celtics-motion": "MOVEMENT_OFFENSE",
  "1960s-royals-creation": "CREATOR_OVERLOAD",
  "1970s-spurs-pace": "PACE_EXTREME",
  "1980s-bucks-defense": "DEFENSE_FIRST",
  "1990s-suns-pace": "PACE_EXTREME",
  "2020s-grizzlies-pace": "PACE_EXTREME",
  "1950s-celtics-team-basketball": "CROSS_ERA_TRANSLATION",
  "1980s-celtics-halfcourt": "EXTREME_SIZE",
  "1990s-bulls-triangle": "CROSS_ERA_TRANSLATION",
  "2000s-pistons-defense": "DEFENSE_FIRST",
  "2000s-spurs-balanced": "BALANCED_CONSTRUCTION",
  "2010s-warriors-movement": "ELITE_SHOOTING",
  "1970s-bucks-balanced": "POST_MISMATCH",
  "1980s-sixers-transition": "TRANSITION",
  "1990s-jazz-pnr": "PICK_AND_ROLL",
  "1990s-pistons-physical": "WEAK_SHOOTING",
  "2000s-lakers-interior": "POST_MISMATCH",
  "2010s-clippers-pnr": "PICK_AND_ROLL",
  "2010s-heat-switch": "SMALL_BALL",
  "2020s-bucks-giannis": "SUPERSTAR_STACK",
  "2020s-nuggets-hub": "PASSING_HUB",
  "2020s-celtics-volume-threes": "ELITE_SHOOTING",
});

// ── Manifests ───────────────────────────────────────────────────────────────
/** Order-independent, content-sensitive. Reordering must not change the hash. */
export const manifestHash = (ids, extra = {}) =>
  createHash("sha256").update(JSON.stringify({ ids: [...ids].sort(), ...extra })).digest("hex");

export const buildManifest = (kind) => {
  const corpus = loadCorpusV2();
  const common = {
    fixtureClassificationVersion: versionOf("fixtureClassificationVersion"),
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    historicalTargetDataVersion: versionOf("historicalTargetDataVersion"),
    benchmarkSeedSetVersion: versionOf("benchmarkSeedSetVersion"),
    // No wall-clock timestamp. A manifest whose hash changes on every
    // regeneration cannot prove it was frozen.
    frozenAt: "phase-6c2b",
  };

  if (kind === "historical-calibration") {
    const ids = historicalCalibrationV2Ids();
    return { kind, ...common, setVersion: versionOf("historicalCorpusVersion"), fixtureCount: ids.length, fixtureIds: [...ids].sort(),
      manifestHash: manifestHash(ids, { kind }),
      rationale: "Every source-valid historical fixture not held out. Tuning operates on this set only." };
  }
  if (kind === "historical-holdout") {
    const ids = HISTORICAL_HOLDOUT_V2_IDS;
    return { kind, ...common, setVersion: versionOf("historicalHoldoutSetVersion"), fixtureCount: ids.length, fixtureIds: [...ids].sort(),
      manifestHash: manifestHash(ids, { kind }),
      rationale: HISTORICAL_HOLDOUT_V2_RATIONALE,
      eligibility: "HISTORICAL_LINEUP and HISTORICAL_STARTER_PROXY only",
      limitation: "Three fixtures, below the 8-12 the brief targets, because the whole historical corpus is 10." };
  }
  if (kind === "synthetic-stress") {
    const ids = SYNTHETIC_STRESS_V1_IDS;
    return { kind, ...common, setVersion: versionOf("syntheticStressSetVersion"), fixtureCount: ids.length, fixtureIds: [...ids].sort(),
      manifestHash: manifestHash(ids, { kind }),
      purposes: SYNTHETIC_STRESS_PURPOSES,
      rationale: "Every fixture reclassified out of the historical corpus, retained for its structural purpose.",
      contributesHistoricalError: false };
  }
  throw new Error(`buildManifest: unknown set "${kind}"`);
};

/** A fixture must never appear in two sets. */
export const overlaps = () => {
  const cal = new Set(historicalCalibrationV2Ids());
  const hold = new Set(HISTORICAL_HOLDOUT_V2_IDS);
  const syn = new Set(SYNTHETIC_STRESS_V1_IDS);
  return {
    calibrationHoldout: [...cal].filter((x) => hold.has(x)),
    calibrationSynthetic: [...cal].filter((x) => syn.has(x)),
    holdoutSynthetic: [...hold].filter((x) => syn.has(x)),
  };
};

/** Every holdout member must be an eligible historical type. */
export const holdoutEligibilityErrors = () => {
  const corpus = loadCorpusV2();
  if (!corpus) return ["historical corpus v2 not built"];
  const byId = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));
  const errs = [];
  for (const id of HISTORICAL_HOLDOUT_V2_IDS) {
    const f = byId.get(id);
    if (!f) { errs.push(`${id} is not in historical corpus v2`); continue; }
    if (!mayEnterHistoricalHoldout(f.classification)) errs.push(`${id}: ${f.classification} may not enter the historical holdout`);
  }
  return errs;
};

export const coverage = (ids) => {
  const corpus = loadCorpusV2();
  if (!corpus) return null;
  const byId = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));
  const fs = ids.map((id) => byId.get(id)).filter(Boolean);
  return {
    count: fs.length,
    eras: [...new Set(fs.map((f) => f.eraStyleId))].sort(),
    franchises: [...new Set(fs.map((f) => f.teamSeason.replace(/^\d{4}–\d{2}\s/, "")))].sort(),
    coaches: [...new Set(fs.map((f) => f.coachId))].sort(),
    classifications: fs.reduce((a, f) => ({ ...a, [f.classification]: (a[f.classification] ?? 0) + 1 }), {}),
    confidence: fs.reduce((a, f) => ({ ...a, [f.confidence.overallFixtureConfidence]: (a[f.confidence.overallFixtureConfidence] ?? 0) + 1 }), {}),
  };
};
