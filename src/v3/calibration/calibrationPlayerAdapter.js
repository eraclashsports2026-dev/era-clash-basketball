// ── Calibration player-season → Player Intelligence ─────────────────────────
// Converts a sourced season profile into the contract the possession engine
// expects, deterministically and with provenance intact.
//
// What it deliberately does NOT produce: OVR, rating, popularity, archetype
// badge, draft rank. Those are public-product concepts. A calibration profile
// exists to reconstruct a real team, not to be drafted, and attaching a rating
// would be the first step toward it leaking into the selector.
//
// Every derivation below is documented and conservative. Where a value cannot
// be derived from the source, confidence drops and the value stays null rather
// than being invented — an invented measurement is indistinguishable from a
// real one downstream, which is the whole problem.
import { notRecordedIn, CALIBRATION_PLAYER_DATA_VERSION, CALIBRATION_PLAYER_SCHEMA_VERSION } from "./calibrationPlayerSchema.js";
import { perimeterSkillScore, threeVolumeFactor } from "../data/shooting.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/**
 * Scale a per-game rate onto the engine's 0-10 capability axis.
 *
 * `at10` is the per-game value a genuinely elite season produces — a documented
 * anchor, not a fitted coefficient. These are calibration inputs, not tunable
 * engine parameters, so they are not in the parameter registry.
 */
const scale = (value, at10, floor = 0) => {
  if (value == null) return null;
  return clamp(floor + (value / at10) * (10 - floor), 0, 10);
};

// Per-game anchors for an elite season in each category. Deliberately generous
// so a strong role player does not read as elite.
const ANCHORS = Object.freeze({
  points: 30, assists: 10, rebounds: 14, offensiveRebounds: 4.5,
  defensiveRebounds: 10, steals: 2.5, blocks: 3.0, turnovers: 4.0, fga: 22,
});

/**
 * Defensive evidence before steals and blocks existed.
 *
 * Returns a CATEGORICAL band, never a rate. A band says "at least this good";
 * a rate would claim a measurement that was never taken. The same discipline
 * the public historical profiles use.
 */
export const preRecordingDefensiveBand = ({ seasonStartYear, lineupRole, accolades = [], reboundsPerGame, documentedRole }) => {
  if (!notRecordedIn("steals", seasonStartYear)) return null;
  const marks = [];
  if (documentedRole) marks.push(documentedRole);
  const strong = accolades.some((a) => /all-defensive|defensive player/i.test(a));
  const anchor = /rim|shot.?block|anchor|interior/i.test(documentedRole ?? "");
  const stopper = /stopper|lockdown|perimeter defen/i.test(documentedRole ?? "");
  let band = "AVERAGE";
  if (strong && anchor) band = "ELITE";
  else if (strong || anchor) band = "STRONG";
  else if (stopper) band = "STRONG";
  else if (lineupRole === "RESERVE" || lineupRole === "MARGINAL") band = "LIMITED";
  else if ((reboundsPerGame ?? 0) >= 10) band = "STRONG";
  return {
    band,
    basis: "DOCUMENTED_ROLE_AND_ACCOLADES",
    evidence: marks,
    note: "A capability band, not a rate. Steals and blocks were not recorded in this season, and no exact value is created for one.",
    confidence: strong || anchor ? "MEDIUM" : "LOW",
  };
};

const BAND_FLOOR = Object.freeze({ ELITE: 8.5, STRONG: 6.5, AVERAGE: 4.5, LIMITED: 2.5, MINIMAL: 1.0 });

/**
 * Builds the minimum Player Intelligence contract the engine requires.
 *
 * Never substitutes a public player-decade profile when a season profile
 * exists: the decade card carries a different season's production, and quietly
 * swapping one for the other is how a fixture stops describing the team it
 * claims to.
 */
export const buildCalibrationPlayerProfile = (season) => {
  const b = season.basicStats ?? {};
  const rate = season.rateStats ?? {};
  const shooting = season.shootingProfile ?? {};
  const year = season.seasonStartYear;

  const perim = perimeterSkillScore(shooting.perimeterSkill ?? "UNKNOWN");
  const threeVol = threeVolumeFactor(shooting.threeVolume ?? "UNKNOWN");
  const preBand = season.defensiveEvidence?.band ?? preRecordingDefensiveBand({
    seasonStartYear: year,
    lineupRole: season.lineupRole,
    accolades: season.accolades ?? [],
    reboundsPerGame: b.rebounds,
    documentedRole: season.defensiveEvidence?.documentedRole,
  })?.band;
  const floor = preBand ? BAND_FLOOR[preBand] : null;

  // Scoring VOLUME. Points per game are recorded in every era; attempts often
  // are not (the career-table source route carries ppg but null FGA). Reading
  // volume from FGA alone rendered George Gervin's scoring-title season as
  // usage 5 - the exact INPUT_QUALITY_COMPRESSION defect Historical V4
  // exposed (v4f-02, v4f-08). Both signals are used when both exist.
  const ptsScaled = scale(b.pointsPerGame, ANCHORS.points, 1);
  const fgaScaled = scale(b.fieldGoalAttempts, ANCHORS.fga, 1);
  const volume = ptsScaled != null && fgaScaled != null ? (ptsScaled + fgaScaled) / 2 : ptsScaled ?? fgaScaled ?? 5;
  const usage = volume;
  const isStarter = season.lineupRole === "STARTER";
  // Efficiency. TS% when recorded; otherwise estimated from the recorded FG%
  // and FT% (documented estimate, labelled): FG% + a bounded free-throw lift.
  const tsEst = rate.trueShootingPct
    ?? (b.fieldGoalPct != null
      ? clamp(b.fieldGoalPct + 0.04 + (b.freeThrowPct != null ? (b.freeThrowPct - 0.72) * 0.2 : 0), 0.3, 0.75)
      : null);
  // Interior share of the shot diet: measured when the two-point split exists,
  // else implied by the documented three-point volume (a LOW/NONE volume means
  // the diet was inside the arc - true by construction, not a guess).
  const insideRatio = b.fieldGoalAttempts && b.twoPointAttempts != null
    ? b.twoPointAttempts / b.fieldGoalAttempts
    : (threeVol <= 1 ? 0.95 : 0.7);

  const offense = {
    usageAppetite: r1(usage),
    // Self-creation cannot be measured directly from a box score. Assists plus
    // scoring volume is a documented proxy, and it is labelled as one.
    selfCreation: r1(clamp(volume * 0.6 + (scale(b.assists, ANCHORS.assists, 1) ?? 4) * 0.4, 0, 10)),
    spacingGravity: r1(clamp(perim * 0.85 + (threeVol - 0.7) * 2, 0, 10)),
    // Interior scoring: volume through the interior share of the diet, plus
    // free-throw pressure (estimated from points where FTA is unrecorded).
    rimThreat: r1(clamp(volume * insideRatio * 0.72
      + (scale(b.freeThrowAttempts, 10, 0) ?? (b.pointsPerGame != null ? scale(b.pointsPerGame * 0.27, 10, 0) : 3)) * 0.35, 0, 10)),
    // Post threat: offensive boards where recorded; the recorded TOTAL board
    // rate where the split is not (pre-1974 data discipline: the null stays
    // null in the store, the capability estimate uses what WAS recorded).
    postThreat: r1(clamp((scale(b.offensiveRebounds, ANCHORS.offensiveRebounds, 0) ?? scale(b.rebounds, ANCHORS.rebounds, 0) ?? 3) * 0.5
      + (["C", "PF"].includes(season.primaryPosition) ? 4 : 1), 0, 10)),
    passingVision: r1(scale(b.assists, ANCHORS.assists, 1) ?? 4),
    // Off-ball movement is NOT three-point shooting. Deriving it from
    // perimeterSkill alone graded Michael Jordan LIMITED off the ball and
    // starved the movement family to exactly zero (V4 failure v4f-09).
    // Era-neutral evidence: perimeter craft is one signal; efficient
    // finishing (cutters and screen-runners score at high TS%) and a
    // guard/wing role are the others. Documented proxy, labelled as one.
    offBallMovement: r1(clamp(
      1.5 + perim * 0.3
      + (["PG", "SG", "SF"].includes(season.primaryPosition) ? 1.0 : 0)
      + clamp(((tsEst ?? 0.5) - 0.5) * 18, -1.5, 1.8)
      + (isStarter ? 0.5 : 0.2), 0, 10)),
    // Centred on the measured store-population median (0.524 across the 323
    // profiles with recorded shooting), so a player with UNRECORDED shooting
    // (the 5 default) sits at the population's typical value rather than
    // below it — otherwise data completeness itself becomes quality, which
    // inflated every complete-data five and penalised sparse ones.
    shotSelection: r1(clamp((tsEst != null ? (tsEst - 0.524) * 45 + 5 : 5), 0, 10)),
    // Turnovers are unrecorded before 1973-74, so ball security falls back to a
    // neutral value rather than to a flattering one.
    ballSecurity: b.turnovers != null ? r1(clamp(10 - (scale(b.turnovers, ANCHORS.turnovers, 0) ?? 5), 0, 10)) : 5,
  };

  const defense = {
    perimeterContainment: r1(clamp(floor ?? ((b.steals != null ? scale(b.steals, ANCHORS.steals, 1) : 5) * 0.7
      + (["PG", "SG"].includes(season.primaryPosition) ? 2 : 0.5)), 0, 10)),
    wingContainment: r1(clamp(floor ?? ((b.steals != null ? scale(b.steals, ANCHORS.steals, 1) : 5) * 0.6
      + (["SG", "SF"].includes(season.primaryPosition) ? 2 : 1)), 0, 10)),
    interiorDeterrence: r1(clamp(floor ?? ((b.blocks != null ? scale(b.blocks, ANCHORS.blocks, 1) : 5) * 0.7
      + (["PF", "C"].includes(season.primaryPosition) ? 2 : 0.5)), 0, 10)),
    rimDeterrence: r1(clamp(floor ?? (b.blocks != null ? scale(b.blocks, ANCHORS.blocks, 1) : 4.5), 0, 10)),
    eventCreation: r1(clamp(
      b.steals != null || b.blocks != null
        ? ((scale(b.steals, ANCHORS.steals, 0) ?? 0) + (scale(b.blocks, ANCHORS.blocks, 0) ?? 0)) / 2
        : (floor ?? 5),
      0, 10)),
    defensiveRebounding: r1(scale(b.defensiveRebounds ?? b.rebounds, b.defensiveRebounds != null ? ANCHORS.defensiveRebounds : ANCHORS.rebounds, 1) ?? 5),
    schemeVersatility: r1(clamp(3 + (season.secondaryPositions?.length ?? 0) * 1.5, 0, 10)),
  };

  const confidence = season.confidence ?? "MEDIUM";
  return {
    id: season.calibrationPlayerId,
    name: season.name,
    decade: `${Math.floor(year / 10) * 10}s`,
    pos: season.primaryPosition,
    positions: [season.primaryPosition, ...(season.secondaryPositions ?? [])],
    personId: season.publicPersonId ?? season.calibrationPersonId,
    physical: season.physicalProfile ?? { heightIn: null, weightLb: null, wingspanIn: null, basis: "SOURCE_BLOCKED", confidence: "SOURCE_BLOCKED" },
    shooting: {
      fgPct: b.fieldGoalPct ?? null,
      threePct: notRecordedIn("threePointPct", year) ? null : (b.threePointPct ?? null),
      ftPct: b.freeThrowPct ?? null,
      scope: "SEASON_SCOPE",
      threePointEra: notRecordedIn("threePointAttempts", year) ? "NONE" : (shooting.threePointEra ?? "FULL"),
      threeVolume: shooting.threeVolume ?? "UNKNOWN",
      perimeterSkill: shooting.perimeterSkill ?? "UNKNOWN",
      identity: shooting.identity ?? null,
      precision: b.fieldGoalPct != null ? "EXACT" : "UNKNOWN",
      source: season.provenance?.sourceUrl ?? null,
      verifiedOn: season.provenance?.retrievedAt ?? null,
      confidence,
    },
    roles: { all: season.offensiveRoles ?? [] },
    offense,
    defense,
    fit: {
      roleScalability: r1(clamp(10 - offense.usageAppetite * 0.55, 1, 9.5)),
      spacingContribution: offense.spacingGravity,
      defensiveVersatility: defense.schemeVersatility,
      creationDependence: r1(clamp(offense.selfCreation * 0.7, 0, 10)),
      connectivity: r1(clamp(offense.passingVision * 0.6 + offense.offBallMovement * 0.4, 0, 10)),
    },
    eraTranslation: { eraStyleId: season.eraStyleId, basis: "SEASON_NATIVE", note: "This profile IS from the era being simulated, so no translation is applied." },
    provenance: {
      ...season.provenance,
      derivation: "buildCalibrationPlayerProfile — deterministic, documented anchors, no fitted coefficients",
      preRecordingDefense: preBand ? { band: preBand, note: "Categorical band; steals and blocks were not recorded in this season." } : null,
      calibrationPlayerDataVersion: CALIBRATION_PLAYER_DATA_VERSION,
      calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
    },
    confidence: {
      offense: confidence,
      defense: preBand ? "LOW" : confidence,
      shooting: b.fieldGoalPct != null ? confidence : "SOURCE_BLOCKED",
      physical: season.physicalProfile?.confidence ?? "SOURCE_BLOCKED",
    },
    // The public product must never see this profile.
    publicEligibility: false,
    calibrationOnly: true,
  };
};
