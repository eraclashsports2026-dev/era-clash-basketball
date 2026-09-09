// ── Calibration-only player-season schema ───────────────────────────────────
// A player's ONE SEASON, for historical calibration only.
//
// This is a different object from a public player-decade card, and the
// difference matters. A card carries a decade of production and exists to be
// drafted; a season profile carries one season and exists to reconstruct a real
// team. Reconstructing the 1997-98 Bulls needs Ron Harper, who should never
// appear in the public selector.
//
// Nothing here ever reaches the public product. The public pool stays at 381
// cards and 323 people, and a test asserts it.
import { versionOf } from "../../versions.js";

export const CALIBRATION_PLAYER_SCHEMA_VERSION = versionOf("calibrationPlayerSchemaVersion");
export const CALIBRATION_PLAYER_DATA_VERSION = versionOf("calibrationPlayerDataVersion");

export const SLOTS = Object.freeze(["PG", "SG", "SF", "PF", "C"]);

export const LINEUP_ROLES = Object.freeze([
  "STARTER", "SIXTH_MAN", "ROTATION", "RESERVE", "SPOT_STARTER",
]);

export const MINUTES_ROLES = Object.freeze(["HEAVY", "STARTER", "ROTATION", "LIMITED", "MARGINAL"]);

export const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM_HIGH", "MEDIUM", "LOW", "SOURCE_BLOCKED"]);

/** Statistics that simply were not recorded before a given season. */
export const FIRST_RECORDED = Object.freeze({
  steals: 1973, blocks: 1973, turnovers: 1973,
  offensiveRebounds: 1973, defensiveRebounds: 1973,
  threePointAttempts: 1979, threePointPct: 1979,
});

/**
 * True when a statistic did not exist in that season.
 *
 * The distinction this protects: a `null` steal count for 1962 means "not
 * recorded", and a `0` would mean "he never got one". Those are different
 * claims and only one of them is true.
 */
export const notRecordedIn = (metric, seasonStartYear) => {
  const first = FIRST_RECORDED[metric];
  return first != null && seasonStartYear < first;
};

/**
 * A stable identity for one player in one season.
 *
 * Not array order, and not the public card id: the same person across two
 * seasons is two profiles, and conflating them would let a 1985 line stand in
 * for a 1988 one.
 */
export const calibrationPlayerId = ({ teamId, seasonStartYear, personSlug }) => {
  if (!teamId || !seasonStartYear || !personSlug) {
    throw new Error("calibrationPlayerId: teamId, seasonStartYear and personSlug are all required");
  }
  return `cal:${teamId}:${seasonStartYear}:${personSlug}`;
};

export const personSlug = (name) =>
  String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const parseCalibrationPlayerId = (id) => {
  const m = /^cal:([^:]+):(\d{4}):(.+)$/.exec(String(id));
  return m ? { teamId: m[1], seasonStartYear: Number(m[2]), personSlug: m[3] } : null;
};

/** Any id in the calibration namespace. Public validation must reject these. */
export const isCalibrationId = (id) => typeof id === "string" && id.startsWith("cal:");

// ── Validation ──────────────────────────────────────────────────────────────
const RANGES = Object.freeze({
  games: [0, 82], starts: [0, 82], minutesPerGame: [0, 48.5],
  pointsPerGame: [0, 55], fieldGoalAttempts: [0, 40], fieldGoalPct: [0.1, 0.85],
  twoPointAttempts: [0, 40], twoPointPct: [0.1, 0.9],
  threePointAttempts: [0, 20],
  // A percentage may legitimately be 1.000 on a single attempt — Andrew Bogut
  // went 1-for-1 from three in 2015-16. The value is real; what it must not do
  // is become a skill judgement, which is handled at inference rather than by
  // refusing the number.
  threePointPct: [0, 1.0],
  freeThrowAttempts: [0, 25], freeThrowPct: [0.2, 1.0],
  offensiveRebounds: [0, 12], defensiveRebounds: [0, 22], rebounds: [0, 30],
  assists: [0, 16], steals: [0, 5], blocks: [0, 7], turnovers: [0, 8], personalFouls: [0, 6.5],
  usagePct: [0, 0.55], trueShootingPct: [0.2, 0.85], assistPct: [0, 0.6],
  turnoverPct: [0, 0.4], offensiveReboundPct: [0, 0.25], defensiveReboundPct: [0, 0.45],
});

const PROVENANCE_REQUIRED = ["sourceType", "publisher", "sourceUrl", "retrievedAt", "licenseNote", "verificationStatus"];

export const validateProvenance = (p, label) => {
  if (!p || typeof p !== "object") return [`${label}: missing provenance`];
  const errs = [];
  for (const k of PROVENANCE_REQUIRED) if (p[k] == null || p[k] === "") errs.push(`${label}: provenance.${k} required`);
  if (p.contentHash != null && !/^[0-9a-f]{16,64}$/.test(p.contentHash)) errs.push(`${label}: contentHash must be hex`);
  return errs;
};

/**
 * Validates one profile. Returns errors; empty means it may enter the store.
 *
 * The rule that matters most: a statistic that was not recorded stays `null`.
 * Never zero — "missing" and "none" are different facts, and only the source
 * can tell them apart.
 */
export const validateCalibrationPlayer = (p) => {
  const errs = [];
  const L = p?.calibrationPlayerId ?? "<unknown>";
  if (!p || typeof p !== "object") return ["profile is not an object"];

  if (!isCalibrationId(p.calibrationPlayerId)) errs.push(`${L}: id must be in the cal: namespace`);
  if (!parseCalibrationPlayerId(p.calibrationPlayerId)) errs.push(`${L}: malformed id`);
  if (!p.calibrationPersonId) errs.push(`${L}: missing calibrationPersonId`);
  if (!p.name) errs.push(`${L}: missing name`);
  if (!p.teamId) errs.push(`${L}: missing teamId`);
  if (!p.season) errs.push(`${L}: missing season`);
  if (!Number.isInteger(p.seasonStartYear)) errs.push(`${L}: seasonStartYear must be an integer`);
  if (!p.eraStyleId) errs.push(`${L}: missing eraStyleId`);

  if (!SLOTS.includes(p.primaryPosition)) errs.push(`${L}: primaryPosition "${p.primaryPosition}" is not a slot`);
  for (const s of p.secondaryPositions ?? []) if (!SLOTS.includes(s)) errs.push(`${L}: secondary position "${s}" is not a slot`);
  if (p.lineupRole && !LINEUP_ROLES.includes(p.lineupRole)) errs.push(`${L}: unknown lineupRole "${p.lineupRole}"`);
  if (p.minutesRole && !MINUTES_ROLES.includes(p.minutesRole)) errs.push(`${L}: unknown minutesRole "${p.minutesRole}"`);

  // The public product must never see these.
  if (p.publicEligibility !== false) errs.push(`${L}: publicEligibility must be exactly false`);
  for (const forbidden of ["ovr", "rating", "popularity", "archetypeBadge", "draftRank", "pop"]) {
    if (p[forbidden] != null) errs.push(`${L}: calibration profiles must carry no ${forbidden}`);
  }

  for (const [k, v] of Object.entries(p.basicStats ?? {})) {
    if (v == null) {
      // A recorded statistic that is null needs a reason; an unrecorded one is
      // self-explanatory.
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${L}.${k}: must be a finite number or null`); continue; }
    if (v < 0) errs.push(`${L}.${k}: negative`);
    const r = RANGES[k];
    if (r && (v < r[0] || v > r[1])) errs.push(`${L}.${k}: ${v} outside plausible range [${r[0]}, ${r[1]}]`);
    // The substitution this schema exists to prevent.
    if (v === 0 && notRecordedIn(k, p.seasonStartYear)) {
      errs.push(`${L}.${k}: recorded as 0 in ${p.seasonStartYear}, when the statistic was not kept — must be null`);
    }
  }
  for (const [k, v] of Object.entries(p.rateStats ?? {})) {
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${L}.${k}: must be a finite number or null`); continue; }
    const r = RANGES[k];
    if (r && (v < r[0] || v > r[1])) errs.push(`${L}.${k}: ${v} outside plausible range [${r[0]}, ${r[1]}]`);
  }

  if (p.confidence && !CONFIDENCE.includes(p.confidence)) errs.push(`${L}: unknown confidence "${p.confidence}"`);
  errs.push(...validateProvenance(p.provenance, L));
  if (p.calibrationPlayerSchemaVersion !== CALIBRATION_PLAYER_SCHEMA_VERSION) {
    errs.push(`${L}: schema version mismatch`);
  }
  return errs;
};

/** Percentages arrive as `.504` or `50.4`; both must land on one scale. */
export const normalisePct = (v) => (v == null ? null : v > 1 ? Math.round((v / 100) * 10000) / 10000 : Math.round(v * 10000) / 10000);

/**
 * Season totals to per-game, ONLY when games are sourced.
 *
 * Without a sourced game count this returns null rather than guessing a
 * denominator — a per-game figure divided by the wrong number of games looks
 * exactly as plausible as a right one.
 */
export const perGame = (total, games) => {
  if (total == null || games == null || !(games > 0)) return null;
  return Math.round((total / games) * 1000) / 1000;
};
