// ── Daily Challenge: official coach options + shared Era Style ────────────────
// PURE and SHARED. The client renders from this; the server verifies against
// it. No module state, no Math.random, no Date-of-day inside the generator —
// the UTC date is passed in, so the same date produces the same configuration
// for every player on Earth and the server can always reproduce it.
//
// ── THE FAIRNESS RULE ────────────────────────────────────────────────────────
// The Daily is ONE puzzle for the whole world, so nothing the player picks may
// be theirs to invent:
//   · the Era Style is FIXED for the day — users do not choose a decade
//   · the coach OPTIONS are fixed for the day — three of them, identical for
//     everyone — and the user picks one of the three
//   · the simulation seed is derived from the CHOICES, never from session id,
//     browser, request time or user identity
//
// Same official choices → same result. Different legal choices → different
// result. That second half is deliberate: it is what makes the coach decision a
// real decision instead of decoration.
//
// ── WHY OPTIONS AND NOT A FREE PICK ──────────────────────────────────────────
// A free coach pick would let one player run the highest-fit coach in the pool
// and everyone else guess, which is a different game per player and an
// incomparable leaderboard. Three fixed options keep one shared puzzle while
// still asking a genuine strategic question.
import { COACHES } from "./coaches.js";
import { ERA_STYLES } from "./eraStyles.js";
import { mulberry32 } from "./seed.js";
import { versionOf } from "../versions.js";

export const DAILY_CONFIG_SCHEMA_VERSION = "1.0.0";
export const DAILY_COACH_OPTION_COUNT = 3;

/** Independent seed streams so adding a coach cannot change the era, and vice
 *  versa. Sharing one stream would make every future data change reshuffle the
 *  whole configuration. */
const ERA_SALT = 0x3ea5747;
const COACH_SALT = 0xc0ac4e5f;

// ── Strategic buckets ─────────────────────────────────────────────────────────
// One option is drawn from each bucket, which is what guarantees the three
// choices are three different IDEAS rather than three shades of the same one.
// Membership is computed from coach attributes, never hand-listed, so the
// buckets stay correct as the pool grows.
export const COACH_BUCKETS = [
  {
    key: "OFFENSIVE_SYSTEM",
    label: "Offensive system",
    test: (c) => (c.offense.motion + c.offense.ballMovement + c.offense.threeEmphasis) / 3 >= 5.5,
  },
  {
    key: "DEFENSIVE_STRUCTURE",
    label: "Defensive structure",
    test: (c) => (c.defense.pressure + c.defense.rimPriority + c.defense.helpAggression) / 3 >= 6,
  },
  {
    key: "ADAPTABLE_MANAGER",
    label: "Adaptable management",
    test: (c) => (c.management.adaptability + c.management.tacticalAdjustment) / 2 >= 6.5,
  },
];

/** Which bucket labels a coach belongs to (may be several, or none). */
export const bucketsFor = (coach) => COACH_BUCKETS.filter((b) => b.test(coach)).map((b) => b.key);

/**
 * The day's three official coach options — seeded, world-identical, and drawn
 * one per strategic bucket so they are genuinely different approaches.
 *
 * Deliberately NOT the three highest-fit coaches: fit depends on the roster the
 * player builds, which does not exist yet when the options are set, and
 * pre-selecting the best answer would remove the decision.
 */
export const dailyCoachOptions = (dateKey, { pool = COACHES, count = DAILY_COACH_OPTION_COUNT, revision = 1 } = {}) => {
  const rng = mulberry32(((Number(dateKey) | 0) ^ COACH_SALT) + revisionOffset(revision));
  const chosen = [];
  const taken = new Set();

  for (const bucket of COACH_BUCKETS) {
    if (chosen.length >= count) break;
    // Sort by id so the candidate order never depends on array order in the
    // data file — a reordered coaches.js must not change today's Daily.
    const candidates = pool.filter((c) => bucket.test(c) && !taken.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
    if (!candidates.length) continue;
    const pickIdx = Math.floor(rng() * candidates.length);
    const c = candidates[pickIdx];
    taken.add(c.id);
    chosen.push({ coachId: c.id, name: c.name, bucket: bucket.key, bucketLabel: bucket.label, systemTags: c.systemTags ?? [] });
  }

  // Backfill from the whole pool if a bucket was empty, so the option count is
  // stable even as the pool changes.
  const rest = pool.filter((c) => !taken.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
  while (chosen.length < count && rest.length) {
    const c = rest.splice(Math.floor(rng() * rest.length), 1)[0];
    taken.add(c.id);
    chosen.push({ coachId: c.id, name: c.name, bucket: "GENERAL", bucketLabel: "Alternative approach", systemTags: c.systemTags ?? [] });
  }
  return chosen;
};

// ── "Why these three differ" ───────────────────────────────────────────────────
// The Daily has to answer one question for the player before they choose:
// what is actually different about these three? The honest answer is the
// tendency where a coach separates most from the OTHER TWO OPTIONS TODAY —
// a contrast, not a grade. So this reads the documented coach tendencies and
// names the largest gap in plain language.
//
// What it deliberately does NOT do: publish a number, publish a coach rating,
// rank the options, or hint at which one "wins". A player choosing between
// "fastest tempo" and "most post play" is making a basketball decision, not
// reading a leaderboard. Ranking them would make the choice fake.
const CONTRAST_DIMENSIONS = [
  ["offense", "tempo", "plays the fastest", "plays the most deliberate half-court"],
  ["offense", "pnr", "lives in the pick-and-roll", "runs the least pick-and-roll"],
  ["offense", "post", "plays through the post", "almost never posts up"],
  ["offense", "threeEmphasis", "hunts the three", "keeps the offense inside the arc"],
  ["offense", "motion", "keeps everyone moving off the ball", "runs a more static offense"],
  ["offense", "iso", "leans on isolation", "avoids isolation"],
  ["offense", "ballMovement", "moves the ball the most", "moves the ball the least"],
  ["offense", "transition", "pushes in transition", "walks it up"],
  ["offense", "starFreedom", "hands the offense to its star", "runs the system over the star"],
  ["defense", "switching", "switches everything", "refuses to switch"],
  ["defense", "drop", "drops its big in coverage", "never drops its big"],
  ["defense", "pressure", "pressures the ball", "sits back and contains"],
  ["defense", "helpAggression", "helps aggressively off the ball", "stays home on shooters"],
  ["defense", "zone", "mixes in zone", "plays straight man"],
  ["defense", "rimPriority", "walls off the rim", "concedes the rim to guard the arc"],
  ["management", "adaptability", "adjusts mid-game the most", "sticks to its plan"],
  ["management", "roleDiscipline", "holds players to strict roles", "lets roles float"],
];

// A gap this small is not a real difference — below it, say nothing rather
// than dress up noise as a distinction.
const CONTRAST_MIN_GAP = 2;

/**
 * For each option, the single tendency that separates it most from the others.
 * Pure, order-stable, and derived only from documented coach data.
 */
export const coachContrasts = (options, { pool = COACHES } = {}) => {
  const coaches = options.map((o) => pool.find((c) => c.id === o.coachId)).filter(Boolean);
  if (coaches.length < 2) {
    return options.map((o) => ({ ...o, whyDifferent: o.systemTags?.[0] ?? o.bucketLabel }));
  }
  // Every candidate (option x dimension) with a real gap, strongest first.
  // Ties break on dimension order then option order — never on iteration
  // accident — so the same day always produces the same three lines.
  const candidates = [];
  options.forEach((o, oi) => {
    const me = coaches.find((c) => c.id === o.coachId);
    if (!me) return;
    const others = coaches.filter((c) => c.id !== o.coachId);
    CONTRAST_DIMENSIONS.forEach(([group, field, highPhrase, lowPhrase], di) => {
      const mine = me[group]?.[field];
      const theirs = others.map((c) => c[group]?.[field]).filter((v) => typeof v === "number");
      if (typeof mine !== "number" || !theirs.length) return;
      const gap = mine - theirs.reduce((a, b) => a + b, 0) / theirs.length;
      if (Math.abs(gap) < CONTRAST_MIN_GAP) return;
      candidates.push({ oi, di, mag: Math.abs(gap), phrase: gap > 0 ? highPhrase : lowPhrase });
    });
  });
  candidates.sort((a, b) => b.mag - a.mag || a.di - b.di || a.oi - b.oi);

  // One dimension per option. Three lines about three different aspects of
  // basketball tell the player more than three lines about tempo — and two
  // options describing the two poles of the SAME axis spends half a sentence
  // of information twice.
  const claimedDim = new Set();
  const assigned = new Map();
  for (const c of candidates) {
    if (assigned.has(c.oi) || claimedDim.has(c.di)) continue;
    assigned.set(c.oi, c.phrase);
    claimedDim.add(c.di);
  }
  // No meaningful separation: fall back to the coach's own documented system
  // rather than inventing a distinction the data does not support.
  return options.map((o, i) => ({ ...o, whyDifferent: assigned.get(i) ?? o.systemTags?.[0] ?? o.bucketLabel }));
};

/** The day's single official Era Style. Fixed for everyone, shown prominently. */
export const dailyEraStyle = (dateKey, { revision = 1 } = {}) => {
  const rng = mulberry32(((Number(dateKey) | 0) ^ ERA_SALT) + revisionOffset(revision));
  const ids = ERA_STYLES.map((e) => e.id).sort();
  return ids[Math.floor(rng() * ids.length)];
};

/**
 * The full server-authoritative Daily configuration.
 *
 * Every field is server-generated. A client may submit only legal roster
 * decisions and a coachId drawn from `coachOptionIds` — never the era, the
 * option pool, the date, the seed, the data versions, or the simulation seed.
 */
export const DAILY_FIRST_REVISION = 1;

// An emergency replacement must be a genuinely different puzzle — replacing a
// Daily because its coach options were broken and then reissuing the same three
// coaches would be pointless. Revision 1 contributes ZERO, so every existing
// Daily is byte-identical to before this existed.
const REVISION_STRIDE = 0x5f37101;
const revisionOffset = (revision) => (Math.max(1, Number(revision) | 0) - 1) * REVISION_STRIDE;

/**
 * Build an official Daily configuration record.
 *
 * This CAPTURES the currently active versions into the record. It is not a
 * lookup: calling it twice across a deployment produces two different records.
 * Production must therefore go through officialDailyConfig() in
 * api/_lib/dailyOfficial.js, which stores the first record for a UTC date and
 * returns that same record for the rest of the day.
 */
export const dailyConfig = (dateKey, { revision = DAILY_FIRST_REVISION } = {}) => {
  const coachOptions = dailyCoachOptions(dateKey, { revision });
  const officialDailyId = `daily-${dateKey}-r${revision}`;
  return {
    // dailyId and officialDailyId are the SAME identity under two names —
    // dailyId is the shipped field used by the client and analytics. A test
    // asserts they are identical so they cannot drift into two ideas.
    dailyId: officialDailyId,
    officialDailyId,
    dailyRevision: revision,
    dailyDate: dateKey,
    utcDate: dateKey,
    dailySeed: Number(dateKey) | 0,
    rosterConfiguration: { generator: "dailyChallenge.js", rolls: 3, opponent: "derived-from-date-seed" },
    coachOptionIds: coachOptions.map((c) => c.coachId),
    coachOptions,
    officialEraStyleId: dailyEraStyle(dateKey, { revision }),
    playerDataVersion: versionOf("playerDataVersion"),
    playerIntelligenceVersion: versionOf("playerIntelligenceVersion"),
    teamIntelligenceVersion: versionOf("teamIntelligenceVersion"),
    coachDataVersion: versionOf("coachDataVersion"),
    coachIntelligenceVersion: versionOf("coachIntelligenceVersion"),
    eraDataVersion: versionOf("eraDataVersion"),
    eraStyleVersion: versionOf("eraStyleVersion"),
    actionLibraryVersion: versionOf("actionLibraryVersion"),
    simulationSeedPolicy: "DERIVED_FROM_OFFICIAL_CHOICES",
    configSchemaVersion: DAILY_CONFIG_SCHEMA_VERSION,
  };
};

/**
 * The Daily's simulation seed.
 *
 * Derived ONLY from the official configuration and the player's legal choices.
 * Never from session id, browser, request time, or user identity — two players
 * who make the same decisions must get the same game, and the same player must
 * not be able to reroll by refreshing.
 */
export const dailySimulationSeed = ({ config, goldIds, coachId }) => {
  const canonical = [
    config.dailyId,
    `gold=${[...goldIds].join(",")}`,          // decision order is meaningful; not sorted
    `coach=${coachId}`,
    `era=${config.officialEraStyleId}`,
    `pd=${config.playerDataVersion}`,
    `cd=${config.coachDataVersion}`,
    `ed=${config.eraDataVersion}`,
    `schema=${config.configSchemaVersion}`,
  ].join("|");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < canonical.length; i++) { h ^= canonical.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { seed: h | 0, canonical };
};

/** Server-side validation of a Daily submission's coach and era. */
export const validateDailySelection = ({ config, coachId, eraStyleId }) => {
  if (!coachId || !config.coachOptionIds.includes(coachId)) return { ok: false, code: "DAILY_INVALID_COACH" };
  // A client may submit the era for display symmetry, but it must MATCH — it is
  // never authoritative.
  if (eraStyleId != null && eraStyleId !== config.officialEraStyleId) return { ok: false, code: "DAILY_INVALID_ERA" };
  return { ok: true };
};

/** Version guard: a Daily already in progress must not be reinterpreted by a
 *  data change mid-day. */
export const validateDailyVersions = ({ config, submitted }) => {
  if (!submitted) return { ok: true };
  for (const k of ["configSchemaVersion", "playerDataVersion", "coachDataVersion", "eraDataVersion"]) {
    if (submitted[k] != null && submitted[k] !== config[k]) return { ok: false, code: "DAILY_VERSION_MISMATCH", field: k };
  }
  return { ok: true };
};
