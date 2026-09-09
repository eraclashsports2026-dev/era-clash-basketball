// ── Fixture classification ──────────────────────────────────────────────────
// What kind of thing each fixture actually IS, and therefore what it may be
// used to calibrate.
//
// Phase 6C2A measured that only one fixture in the original corpus was the
// documented starting five of its named season, while several were labelled
// `DOCUMENTED_STARTING_FIVE`. A label that overstates what a fixture is turns
// every error computed from it into a claim about a team that never played.
import { versionOf } from "../../src/versions.js";

export const FIXTURE_CLASSIFICATION_VERSION = versionOf("fixtureClassificationVersion");

export const CLASSIFICATIONS = Object.freeze({
  HISTORICAL_LINEUP:
    "The five verifiably appeared for the named team-season. Eligible for team AND player-share calibration.",
  HISTORICAL_STARTER_PROXY:
    "A documented starting, closing, playoff or principal five for the named team-season, without exact lineup-frequency data.",
  HISTORICAL_TEAM_SEASON_PROXY:
    "Represents the team-season but is not claimed as a simultaneous lineup. May use team-season environment targets; may NOT use exact five-player usage or lineup-efficiency targets.",
  SYNTHETIC_ARCHETYPE:
    "A constructed lineup that tests a basketball identity. Contributes NO historical numerical error.",
  CROSS_ERA_STRESS_TEST:
    "A constructed cross-era lineup that tests translation, balance or edge cases. Contributes NO historical numerical error.",
});

/**
 * What each classification may be used for. One matrix, consulted everywhere,
 * because the failure this prevents is a synthetic lineup quietly contributing
 * to a historical error number.
 */
export const ELIGIBILITY = Object.freeze({
  HISTORICAL_LINEUP: {
    historicalTeamCalibration: true,
    playerShareCalibration: true,
    playerShareConfidenceCeiling: "HIGH",
    historicalHoldout: true,
    syntheticStructuralTest: false,
  },
  HISTORICAL_STARTER_PROXY: {
    historicalTeamCalibration: true,
    playerShareCalibration: true,
    playerShareConfidenceCeiling: "MEDIUM_HIGH",
    historicalHoldout: true,
    syntheticStructuralTest: false,
  },
  HISTORICAL_TEAM_SEASON_PROXY: {
    historicalTeamCalibration: true,
    // Only the low-confidence selected-five season-share proxy, never an exact
    // lineup usage target: these five are not claimed to have shared the floor.
    playerShareCalibration: true,
    playerShareConfidenceCeiling: "LOW",
    historicalHoldout: false,
    syntheticStructuralTest: false,
  },
  SYNTHETIC_ARCHETYPE: {
    historicalTeamCalibration: false,
    playerShareCalibration: false,
    playerShareConfidenceCeiling: null,
    historicalHoldout: false,
    syntheticStructuralTest: true,
  },
  CROSS_ERA_STRESS_TEST: {
    historicalTeamCalibration: false,
    playerShareCalibration: false,
    playerShareConfidenceCeiling: null,
    historicalHoldout: false,
    syntheticStructuralTest: true,
  },
});

export const CONFIDENCE_BANDS = Object.freeze(["HIGH", "MEDIUM_HIGH", "MEDIUM", "LOW", "SOURCE_BLOCKED"]);

export const eligibilityOf = (classification) => {
  const e = ELIGIBILITY[classification];
  if (!e) throw new Error(`eligibilityOf: unknown classification "${classification}"`);
  return e;
};

export const mayContributeHistoricalError = (classification) => eligibilityOf(classification).historicalTeamCalibration;
export const mayEnterHistoricalHoldout = (classification) => eligibilityOf(classification).historicalHoldout;
export const isSynthetic = (classification) => eligibilityOf(classification).syntheticStructuralTest;

/**
 * Reclassification of the original 26-fixture corpus, from measured evidence.
 *
 * `matchedOfFive` is the number of the fixture's cards that verifiably appeared
 * for the named team-season, measured in Phase 6C2A against Wikipedia season
 * articles. It is not an opinion.
 *
 * Nothing is deleted. A fixture that is not historical keeps its structural
 * purpose as a synthetic archetype or a cross-era stress test — those are
 * useful, they simply must not contribute historical numerical error.
 */
export const CORPUS_V1_RECLASSIFICATION = Object.freeze({
  "1980s-lakers-showtime": {
    was: "DOCUMENTED_STARTING_FIVE", now: "HISTORICAL_LINEUP", matchedOfFive: 5,
    reason: "All five verifiably appeared for the 1986-87 Lakers. The only fixture in the original corpus whose label was accurate.",
    retainedPurpose: "Showtime pace and transition identity.",
  },
  "1980s-celtics-halfcourt": {
    was: "DOCUMENTED_STARTING_FIVE", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 4,
    reason: "Nate Archibald left the Celtics in 1983 and did not play for the 1985-86 team. Four of five are that season's starters; the fifth is from an earlier Celtics era.",
    retainedPurpose: "Half-court offence against a size-heavy front line.",
  },
  "1990s-bulls-triangle": {
    was: "DOCUMENTED_STARTING_FIVE", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 4,
    reason: "Isiah Thomas was a Piston and never played for the Bulls. The five is four 1995-96 Bulls plus a rival franchise's point guard.",
    retainedPurpose: "Triangle offence identity.",
  },
  "2000s-pistons-defense": {
    was: "DOCUMENTED_STARTING_FIVE", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 4,
    reason: "Kevin Garnett was a Timberwolf in 2003-04 and joined Boston in 2007. Four of five are the actual Pistons starters.",
    retainedPurpose: "Elite defensive identity.",
  },
  "2000s-spurs-balanced": {
    was: "DOCUMENTED_STARTING_FIVE", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 4,
    reason: "Mehmet Okur played for Detroit and Utah, never San Antonio.",
    retainedPurpose: "Balanced two-way identity.",
  },
  "2010s-warriors-movement": {
    was: "DOCUMENTED_STARTING_FIVE", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 3,
    reason: "LeBron James and Nikola Jokic never played for the Warriors. Labelling this the documented 2015-16 starting five was the corpus's most overstated claim.",
    retainedPurpose: "Movement-shooting identity.",
  },
  "1970s-celtics-motion": {
    was: "DOCUMENTED_STARTING_FIVE", now: "SYNTHETIC_ARCHETYPE", matchedOfFive: null,
    reason: "Represents 1970s motion offence across the decade rather than one season; no season article applies.",
    retainedPurpose: "Off-ball motion identity.",
  },
  "1960s-celtics-dynasty": {
    was: "DOCUMENTED_STARTING_FIVE", now: "SYNTHETIC_ARCHETYPE", matchedOfFive: null,
    reason: "Represents the dynasty across a decade rather than one season.",
    retainedPurpose: "Rim-anchored defensive identity.",
  },
  // ── Approximations of a named season: team environment only ──
  "1970s-bucks-balanced": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 2, reason: "Lou Hudson (Hawks), Marques Johnson (a later Bucks era) and Curtis Perry did not play for the 1970-71 Bucks.", retainedPurpose: "Dominant-centre plus lead-guard construction." },
  "1980s-sixers-transition": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "The 1982-83 76ers article carries no player statistics table, and the roster includes a Sonics card.", retainedPurpose: "Transition identity." },
  "1990s-jazz-pnr": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 3, reason: "Scottie Pippen and David Robinson never played for the 1996-97 Jazz.", retainedPurpose: "Pick-and-roll identity." },
  "1990s-pistons-physical": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 2, reason: "Grant Hill (a later Pistons era), Charles Barkley and Patrick Ewing were not on the 1989-90 Pistons.", retainedPurpose: "Physical defensive identity." },
  "2000s-lakers-interior": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 2, reason: "Chauncey Billups, Tayshaun Prince and Tim Duncan were not 2000-01 Lakers.", retainedPurpose: "Interior dominance." },
  "2010s-clippers-pnr": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 3, reason: "Klay Thompson and Tayshaun Prince never played for the 2013-14 Clippers.", retainedPurpose: "Pick-and-roll with an elite lob finisher." },
  "2010s-heat-switch": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 3, reason: "Chris Paul and Hassan Whiteside were not on the 2012-13 Heat.", retainedPurpose: "Switching defence and small-ball." },
  "2020s-bucks-giannis": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 2, reason: "Damian Lillard joined Milwaukee in 2023; Jaylen Brown and Jarrett Allen never did.", retainedPurpose: "Rim-pressure superstar construction." },
  "2020s-nuggets-hub": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 1, reason: "Only Nikola Jokic was a 2022-23 Nugget. The weakest historical claim in the corpus.", retainedPurpose: "Passing-hub offence." },
  "2020s-celtics-volume-threes": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: 2, reason: "Marcus Smart, Lauri Markkanen and Walker Kessler were not on the 2023-24 Celtics.", retainedPurpose: "High-volume three-point offence." },
  "1950s-celtics-team-basketball": { was: "DOCUMENTED_CORE_UNIT", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Roster spans Celtics, Warriors and Bullets cards across two decades.", retainedPurpose: "Pass-first team basketball." },
  // ── Already honestly labelled: reconstructed from available cards ──
  "1950s-pace-extreme": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "SYNTHETIC_ARCHETYPE", matchedOfFive: null, reason: "Assembled to represent extreme pace. The original label was honest.", retainedPurpose: "Pace extreme." },
  "1960s-interior-dominance": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "SYNTHETIC_ARCHETYPE", matchedOfFive: null, reason: "Assembled to represent interior dominance.", retainedPurpose: "Interior dominance." },
  "1960s-royals-creation": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Royals and Lakers cards combined.", retainedPurpose: "Ball-dominant lead-guard creation." },
  "1970s-spurs-pace": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Spurs and Braves cards combined.", retainedPurpose: "Pace." },
  "1980s-bucks-defense": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Bucks, Mavericks and Hawks cards combined.", retainedPurpose: "1980s defensive identity." },
  "1990s-suns-pace": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Suns and Spurs cards combined.", retainedPurpose: "Pace." },
  "2020s-grizzlies-pace": { was: "RECONSTRUCTED_FROM_AVAILABLE_CARDS", now: "CROSS_ERA_STRESS_TEST", matchedOfFive: null, reason: "Grizzlies, Cavaliers and 76ers cards combined.", retainedPurpose: "Pace." },
});

export const classificationOf = (fixtureId) => CORPUS_V1_RECLASSIFICATION[fixtureId]?.now ?? null;

export const summary = () => {
  const out = {};
  for (const v of Object.values(CORPUS_V1_RECLASSIFICATION)) out[v.now] = (out[v.now] ?? 0) + 1;
  return out;
};

/** Fixtures whose original label overstated what they are. */
export const correctedLabels = () =>
  Object.entries(CORPUS_V1_RECLASSIFICATION)
    .filter(([, v]) => /DOCUMENTED/.test(v.was) && !/HISTORICAL/.test(v.now))
    .map(([id, v]) => ({ fixtureId: id, was: v.was, now: v.now, matchedOfFive: v.matchedOfFive, reason: v.reason }));
