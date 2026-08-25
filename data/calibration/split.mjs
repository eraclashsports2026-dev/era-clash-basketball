// ── Calibration / holdout partition ─────────────────────────────────────────
// The holdout exists to answer one question Phase 6C2 cannot answer for itself:
// did the tuning generalise, or did it memorise the calibration set?
//
// So the split is FROZEN here, before any tuning, and the holdout is chosen to
// be genuinely representative. Putting all the unusual teams in calibration and
// all the conventional ones in holdout would make the holdout easy and
// worthless.
import { createHash } from "node:crypto";
import { FIXTURES, HISTORICAL_FIXTURE_DATA_VERSION } from "./fixtures.mjs";
import { versionOf } from "../../src/versions.js";

export const HOLDOUT_SET_VERSION = versionOf("holdoutSetVersion");

/**
 * The holdout: 7 of 26 (27%). Chosen by hand for coverage, not sampled — a
 * random sample of 26 cannot guarantee era and identity spread.
 *
 * Spread: 7 of 8 eras · a championship team, an elite offence, an elite
 * defence, a pace extreme and a style archetype · HIGH, MEDIUM and LOW
 * confidence · a post-heavy team, a movement team, a hub team and a
 * defence-first team · coaches from four different systems.
 */
export const HOLDOUT_FIXTURE_IDS = Object.freeze([
  "1960s-royals-creation",        // 1960s · elite offence · ball-dominant lead guard · MEDIUM
  "1970s-celtics-motion",         // 1970s · balanced · off-ball motion · MEDIUM
  "1980s-lakers-showtime",        // 1980s · championship · pace extreme in practice · HIGH
  "1990s-jazz-pnr",               // 1990s · elite offence · the canonical pick-and-roll team · HIGH
  "2000s-pistons-defense",        // 2000s · elite defence · movement shooting · HIGH
  "2010s-warriors-movement",      // 2010s · elite offence · movement shooting · HIGH
  "2020s-nuggets-hub",            // 2020s · elite offence · passing hub · MEDIUM
]);

export const CALIBRATION_FIXTURE_IDS = Object.freeze(
  FIXTURES.map((f) => f.fixtureId).filter((id) => !HOLDOUT_FIXTURE_IDS.includes(id)),
);

export const calibrationFixtures = () => FIXTURES.filter((f) => CALIBRATION_FIXTURE_IDS.includes(f.fixtureId));
export const holdoutFixtures = () => FIXTURES.filter((f) => HOLDOUT_FIXTURE_IDS.includes(f.fixtureId));

/**
 * Manifest hash. Sorted ids, so REORDERING the list cannot change the hash —
 * only changing WHICH fixtures are in it, or changing a fixture's own content.
 */
export const manifestHash = (ids, fixtures = FIXTURES) => {
  const rows = [...ids].sort().map((id) => {
    const f = fixtures.find((x) => x.fixtureId === id);
    if (!f) throw new Error(`manifestHash: unknown fixture "${id}"`);
    // Content-sensitive: editing a fixture's roster, era, coach or targets
    // changes the hash, which invalidates any cached calibration built on it.
    return JSON.stringify({
      id: f.fixtureId, era: f.eraStyleId, coach: f.coachId, type: f.fixtureType,
      basis: f.lineupBasis, confidence: f.sourceConfidence,
      roster: f.roster.map((r) => `${r.assignedPosition}=${r.playerCardId}`),
      targets: f.historicalTargets, availability: f.targetAvailability,
    });
  });
  return createHash("sha256").update(rows.join("\n")).digest("hex");
};

export const buildManifest = (kind) => {
  const ids = kind === "holdout" ? [...HOLDOUT_FIXTURE_IDS] : [...CALIBRATION_FIXTURE_IDS];
  return {
    kind,
    holdoutSetVersion: HOLDOUT_SET_VERSION,
    historicalFixtureDataVersion: HISTORICAL_FIXTURE_DATA_VERSION,
    benchmarkSeedSetVersion: versionOf("benchmarkSeedSetVersion"),
    calibrationFrameworkVersion: versionOf("calibrationFrameworkVersion"),
    fixtureCount: ids.length,
    fixtureIds: [...ids].sort(),
    manifestHash: manifestHash(ids),
    splitRationale: kind === "holdout"
      ? "Hand-chosen for coverage across 7 eras, 5 fixture types, 3 confidence grades and 4 coaching systems. A random sample of 26 cannot guarantee that spread, and an unrepresentative holdout is worse than none."
      : "Every fixture not in the holdout. Tuning in Phase 6C2 operates on this set only.",
    // No creation timestamp: a manifest that changes hash on every regeneration
    // cannot prove it was frozen.
    frozenAt: "phase-6c1",
  };
};

/** A fixture must never appear in both sets. */
export const overlap = () => CALIBRATION_FIXTURE_IDS.filter((id) => HOLDOUT_FIXTURE_IDS.includes(id));

export const splitSummary = () => {
  const summarise = (fs) => ({
    count: fs.length,
    eras: [...new Set(fs.map((f) => f.eraStyleId))].sort(),
    types: [...new Set(fs.map((f) => f.fixtureType))].sort(),
    confidence: fs.reduce((a, f) => ({ ...a, [f.sourceConfidence]: (a[f.sourceConfidence] ?? 0) + 1 }), {}),
    coaches: [...new Set(fs.map((f) => f.coachId))].sort(),
  });
  return { calibration: summarise(calibrationFixtures()), holdout: summarise(holdoutFixtures()) };
};
