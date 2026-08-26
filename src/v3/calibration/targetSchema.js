// ── Historical calibration target schema ────────────────────────────────────
// One canonical shape for every historical target, and one rule that governs
// all of it: a number with no provenance never enters the store.
//
// The store holds STRUCTURED FACTS ONLY — values, formulas, source URLs,
// hashes, retrieval dates. Never page text, never a copy of anyone's article.
import { versionOf } from "../../versions.js";

export const HISTORICAL_TARGET_SCHEMA_VERSION = versionOf("historicalTargetSchemaVersion");
export const HISTORICAL_TARGET_DATA_VERSION = versionOf("historicalTargetDataVersion");

/** Where a value came from. Determines how far it can be trusted. */
export const SOURCE_TYPES = Object.freeze({
  OFFICIAL_PUBLIC_SOURCE: "A league or governing-body publication.",
  AUTHORIZED_PUBLIC_API: "A public API whose licence permits this use (e.g. Wikipedia, CC BY-SA 4.0).",
  LICENSED_EXPORT: "Data obtained under an explicit commercial licence.",
  MANUAL_VERIFIED_IMPORT: "Hand-entered from a published source, with the source recorded.",
  DERIVED_FROM_SOURCED_TOTALS: "Calculated from other sourced values. Must carry its formula.",
  IN_REPO_VERIFIED: "Already-verified data in this repository (player cards), carrying its own provenance.",
  SOURCE_BLOCKED: "The statistic exists but no authorized path to it is available.",
  NOT_APPLICABLE: "The statistic does not exist for this fixture or era.",
});

/**
 * Why a target is missing — or why it is present but weak. These are NOT
 * interchangeable, and collapsing them would make a licensing problem look
 * like a historical fact, or a synthetic lineup look like a measurement.
 */
export const AVAILABILITY = Object.freeze({
  RECORDED_STATISTIC: "Verified from a published source.",
  DERIVED_STATISTIC: "Computed from sourced totals using a recorded formula.",
  SELECTED_FIVE_SEASON_SHARE_PROXY: "A five-player share derived from each player's own season/decade averages. NOT actual on-court lineup usage.",
  ACTUAL_LINEUP_MEASUREMENT: "Measured from real five-man lineup data.",
  SOURCE_BLOCKED_LICENSING: "The statistic is published, but its licence forbids this use. Needs a licence, not a workaround.",
  SOURCE_BLOCKED_ACCESS: "No authorized technical path to the statistic.",
  NOT_RECORDED_IN_ERA: "The statistic did not exist then (3PA before 1979-80, steals/blocks before 1973-74).",
  NOT_APPLICABLE_SYNTHETIC_LINEUP: "The fixture's roster spans multiple franchises, so no real team-season corresponds to it. A team-season target would be a comparison to a team that never played.",
});

export const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

/** Every field the store accepts. Anything outside this is rejected, not stored. */
export const TEAM_TARGET_FIELDS = Object.freeze([
  "games", "wins", "losses",
  "pointsPerGame", "pointsAllowedPerGame",
  "fieldGoalAttempts", "fieldGoalPct",
  "twoPointAttempts", "twoPointPct",
  "threePointAttempts", "threePointPct",
  "freeThrowAttempts", "freeThrowPct",
  "rebounds", "offensiveRebounds", "defensiveRebounds",
  "assists", "steals", "blocks", "turnovers",
  "pace", "offensiveRating", "defensiveRating", "netRating",
  "efgPct", "trueShootingPct", "turnoverPct", "offensiveReboundPct",
  "freeThrowRate", "threePointAttemptRate",
]);

export const UNIT_SHARE_FIELDS = Object.freeze([
  "playerOpportunityShares", "playerUsageShares", "playerScoringShares",
  "playerAssistShares", "playerReboundShares",
]);

/** Metrics that simply did not exist before a given season. */
export const ERA_UNAVAILABLE = Object.freeze({
  threePointAttempts: 1979, threePointPct: 1979, threePointAttemptRate: 1979,
  steals: 1973, blocks: 1973,
  turnovers: 1973, turnoverPct: 1973,
  offensiveRebounds: 1973, defensiveRebounds: 1973, offensiveReboundPct: 1973,
});

const ERA_START_YEAR = Object.freeze({
  "1950s": 1950, "1960s": 1960, "1970s": 1970, "1980s": 1980,
  "1990s": 1990, "2000s": 2000, "2010s": 2010, "2020s": 2020,
});

/** True when the metric was not recorded anywhere in that era. */
export const notRecordedInEra = (metric, eraStyleId) => {
  const first = ERA_UNAVAILABLE[metric];
  if (first == null) return false;
  const start = ERA_START_YEAR[eraStyleId];
  if (start == null) return false;
  // The decade must END before the statistic began, or some seasons have it.
  return start + 9 < first;
};

// ── Provenance ──────────────────────────────────────────────────────────────
const PROVENANCE_REQUIRED = ["sourceType", "publisher", "retrievedAt", "licenseNote", "verificationStatus"];

/**
 * A value with no provenance is indistinguishable from a value someone
 * remembered. The store refuses it.
 */
export const validateProvenance = (p, label) => {
  const errs = [];
  if (!p || typeof p !== "object") return [`${label}: missing provenance`];
  for (const k of PROVENANCE_REQUIRED) {
    if (p[k] == null || p[k] === "") errs.push(`${label}: provenance.${k} is required`);
  }
  if (p.sourceType && !(p.sourceType in SOURCE_TYPES)) errs.push(`${label}: unknown sourceType "${p.sourceType}"`);
  // A URL or a file identity — something a reader can go and check.
  if (!p.sourceUrl && !p.sourceFile && !["NOT_APPLICABLE", "SOURCE_BLOCKED"].includes(p.sourceType)) {
    errs.push(`${label}: provenance needs a sourceUrl or sourceFile`);
  }
  if (p.sourceType === "DERIVED_FROM_SOURCED_TOTALS" && !p.formula) {
    errs.push(`${label}: a derived value must record the formula that produced it`);
  }
  if (p.contentHash != null && !/^[0-9a-f]{16,64}$/.test(p.contentHash)) {
    errs.push(`${label}: contentHash must be hex`);
  }
  return errs;
};

// ── Value sanity ────────────────────────────────────────────────────────────
const RANGES = Object.freeze({
  fieldGoalPct: [0.2, 0.75], twoPointPct: [0.2, 0.8], threePointPct: [0.0, 0.6],
  freeThrowPct: [0.4, 1.0], efgPct: [0.25, 0.8], trueShootingPct: [0.3, 0.8],
  turnoverPct: [0.0, 0.3], offensiveReboundPct: [0.0, 0.6],
  freeThrowRate: [0.0, 1.0], threePointAttemptRate: [0.0, 1.0],
  pace: [70, 145], offensiveRating: [70, 140], defensiveRating: [70, 140],
  pointsPerGame: [60, 145], pointsAllowedPerGame: [60, 145],
  games: [1, 82], wins: [0, 82], losses: [0, 82],
});

export const validateValue = (metric, value, label) => {
  if (value == null) return [];
  if (typeof value !== "number" || !Number.isFinite(value)) return [`${label}.${metric}: must be a finite number or null`];
  const r = RANGES[metric];
  if (r && (value < r[0] || value > r[1])) return [`${label}.${metric}: ${value} outside plausible range [${r[0]}, ${r[1]}]`];
  if (value < 0) return [`${label}.${metric}: negative`];
  return [];
};

/** Shares must be a real distribution: non-negative and summing to one. */
export const validateShares = (shares, label, tolerance = 0.005) => {
  const errs = [];
  if (shares == null) return errs;
  const vals = Object.values(shares);
  if (!vals.length) return [`${label}: empty share map`];
  for (const [k, v] of Object.entries(shares)) {
    if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`${label}.${k}: not a finite number`);
    else if (v < 0) errs.push(`${label}.${k}: negative share`);
    else if (v > 1) errs.push(`${label}.${k}: share above 1`);
  }
  const sum = vals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (Math.abs(sum - 1) > tolerance) errs.push(`${label}: shares sum to ${sum.toFixed(4)}, not 1`);
  return errs;
};

// ── Record validation ───────────────────────────────────────────────────────
/**
 * Validates one fixture's target record. Returns an array of errors; empty
 * means the record may enter the store.
 */
export const validateTargetRecord = (rec, { fixtureIds = null } = {}) => {
  const errs = [];
  const L = rec?.fixtureId ?? "<unknown>";
  if (!rec || typeof rec !== "object") return ["target record is not an object"];
  if (!rec.fixtureId) errs.push("missing fixtureId");
  if (fixtureIds && rec.fixtureId && !fixtureIds.includes(rec.fixtureId)) {
    errs.push(`${L}: fixtureId does not resolve to a corpus fixture`);
  }
  if (!rec.targetDataVersion) errs.push(`${L}: missing targetDataVersion`);
  if (rec.confidence && !CONFIDENCE.includes(rec.confidence)) errs.push(`${L}: unknown confidence "${rec.confidence}"`);

  for (const [metric, entry] of Object.entries(rec.teamTargets ?? {})) {
    if (!TEAM_TARGET_FIELDS.includes(metric)) { errs.push(`${L}: unknown team metric "${metric}"`); continue; }
    if (!entry || typeof entry !== "object") { errs.push(`${L}.${metric}: must be an object with value+availability`); continue; }
    if (!(entry.availability in AVAILABILITY)) errs.push(`${L}.${metric}: unknown availability "${entry.availability}"`);
    errs.push(...validateValue(metric, entry.value, L));
    // A present value needs provenance. An absent one needs a reason, which
    // the availability field already carries.
    if (entry.value != null) errs.push(...validateProvenance(entry.provenance, `${L}.${metric}`));
    // The one substitution the store must never permit.
    if (entry.value === 0 && String(entry.availability).startsWith("SOURCE_BLOCKED")) {
      errs.push(`${L}.${metric}: a blocked metric became 0 — missing must stay null`);
    }
  }

  const u = rec.unitTargets;
  if (u) {
    if (typeof u.selectedFiveOnly !== "boolean") errs.push(`${L}.unitTargets: selectedFiveOnly must be explicit`);
    if (u.availability && !(u.availability in AVAILABILITY)) errs.push(`${L}.unitTargets: unknown availability`);
    for (const f of UNIT_SHARE_FIELDS) {
      if (u[f] == null) continue;
      errs.push(...validateShares(u[f], `${L}.unitTargets.${f}`));
      errs.push(...validateProvenance(u.provenance, `${L}.unitTargets`));
      // A proxy must never be presented as a measurement.
      if (u.availability === "ACTUAL_LINEUP_MEASUREMENT" && u.confidence === "LOW") {
        errs.push(`${L}.unitTargets: an actual lineup measurement should not be LOW confidence — check the label`);
      }
    }
  }
  return errs.filter(Boolean);
};

/** Coverage counts for the gate report. Says what is known and what is not. */
export const coverageOf = (records) => {
  const tally = { A: 0, B: 0, C: 0, D: 0, blockedFields: 0, blockedFixtures: 0, notApplicable: 0, notRecorded: 0 };
  const TIER_A = ["games", "wins", "losses", "pointsPerGame", "pointsAllowedPerGame", "fieldGoalAttempts", "fieldGoalPct", "freeThrowAttempts", "freeThrowPct", "rebounds", "assists"];
  for (const r of records) {
    let anyBlocked = false;
    for (const [m, e] of Object.entries(r.teamTargets ?? {})) {
      if (e.value != null) {
        if (TIER_A.includes(m)) tally.A++;
        else tally.B++;
      } else if (String(e.availability).startsWith("SOURCE_BLOCKED")) { tally.blockedFields++; anyBlocked = true; }
      else if (e.availability === "NOT_RECORDED_IN_ERA") tally.notRecorded++;
      else if (e.availability === "NOT_APPLICABLE_SYNTHETIC_LINEUP") tally.notApplicable++;
    }
    if (anyBlocked) tally.blockedFixtures++;
    for (const f of UNIT_SHARE_FIELDS) if (r.unitTargets?.[f]) tally.C++;
    if (r.identityTargets?.length) tally.D += r.identityTargets.length;
  }
  return tally;
};
