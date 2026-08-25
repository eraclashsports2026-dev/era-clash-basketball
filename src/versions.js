// ── EraClash canonical version registry ───────────────────────────────────────
// ONE source of truth for every version this product records. Every persisted
// result, narrative, and versioned cache key must derive its versions from
// here rather than hard-coding a string at the call site.
//
// ── THE NAMING COLLISION THIS FILE RESOLVES ──────────────────────────────────
// Before Phase 3.5 there were TWO overlapping version registries with clashing
// vocabulary:
//
//   src/versions.js      VERSIONS.simulation_engine = "2.2"
//   src/v3/engine.js     V3_VERSIONS.engine         = "3.1.0-alpha"
//
// V2 results recorded the first, V3 results the second, and neither recorded
// Player Intelligence or Team Intelligence at all. Worse, "V3" was used for
// BOTH the live production engine and the future possession architecture that
// does not exist yet — so "is V3 on?" had two different correct answers.
//
// The collision is now resolved by giving each concern its OWN version domain:
//
//   appVersion               the deployed product release          2.7.2
//   engineVersion            the LIVE production result engine     3.x
//   possessionEngineVersion  the FUTURE event/possession engine    1.x (planned)
//
// These are independent. A product release may be numbered anything without
// renaming an engine, and the future possession engine starts at 1.0.0 without
// pretending to be a successor to "V3".
//
// ── ENGINE VERSION PROMOTED 3.1.0-alpha → 3.2.0 ──────────────────────────────
// Not a behaviour change — a truthfulness correction. The engine carrying the
// "-alpha" suffix has decided every real production game since v2.5.0. Calling
// a live engine alpha in the record that is supposed to explain results was
// itself part of the naming problem. Simulation behaviour is untouched; only
// the label it records changed. Results already stored keep the version they
// were stamped with and are never recomputed.
//
// ── DATA VERSIONS ARE NOT ALGORITHM VERSIONS ─────────────────────────────────
// coachDataVersion and coachIntelligenceVersion are separate on purpose. Adding
// a coach changes the data; changing how coach fit is computed changes the
// algorithm. Conflating them makes a cache impossible to invalidate correctly.

export const VERSION_STATUS = {
  /** In the live production path right now. Materially affects results. */
  ACTIVE: "ACTIVE",
  /** Built and tested, but wired to nothing. Must not enter a result fingerprint. */
  DEVELOPMENT: "DEVELOPMENT",
  /** Does not exist yet. Value is null — never a fake number. */
  PLANNED: "PLANNED",
};
const { ACTIVE, DEVELOPMENT, PLANNED } = VERSION_STATUS;

// `affectsResult` is separate from `status` on purpose. Chemistry is ACTIVE —
// it ships, it is displayed, it has a real version — and it changes NOTHING
// about a simulated result. A result fingerprint that recorded it would claim a
// provenance chemistry does not have. Status answers "does this exist and
// ship?"; affectsResult answers "did this shape the game?".
const entry = (value, status, note, affectsResult = true) => ({ value, status, note, affectsResult });

export const REGISTRY = {
  // ── product ──
  appVersion: entry("2.7.2", ACTIVE, "Deployed product release. Does not shape a result — a redeploy must not invalidate stored games.", false),

  // ── engines ──
  engineVersion: entry("3.2.0", ACTIVE,
    "The live production result engine (src/v3/engine.js). Family 3.x. Promoted from 3.1.0-alpha in Phase 3.5: it has been production since v2.5.0 and the alpha suffix was inaccurate."),
  possessionEngineVersion: entry(null, PLANNED,
    "The FUTURE event/possession architecture. Family 1.x. Deliberately null: reporting a version for a module that does not exist would be the same dishonesty the naming collision caused."),

  // ── intelligence layers (built, unwired) ──
  playerIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/intelligence.js — 381 profiles. No simulation module imports it."),
  teamIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/teamIntelligence.js — lineup construction. No simulation module imports it."),
  // DEVELOPMENT, not ACTIVE: the module exists and is tested, but no
  // simulation module imports it, so it has never shaped a result and must not
  // appear in a result fingerprint.
  coachIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/coachIntelligence.js — contextual coach fit. No simulation module imports it."),
  eraStyleVersion: entry(null, PLANNED, "Phase 5. Era STYLE intelligence, distinct from the era data the engine already uses."),

  // ── datasets (independent of the algorithms that read them) ──
  playerDataVersion: entry("2026-08-24", ACTIVE, "src/players.js — 381 player-decade cards, 323 canonical persons."),
  coachDataVersion: entry("1.1.0", ACTIVE, "src/v3/data/coaches.js — 30 coaches. ACTIVE: coaches already shape the live game plan. Bumped 1.0.0→1.1.0 when the pool grew by five."),
  eraDataVersion: entry("1.0.0", ACTIVE, "src/v3/data/eras.js — 8 era styles. ACTIVE: era already shapes the live shared environment."),

  // ── scoring / display ──
  ratingVersion: entry("2.0", ACTIVE, "src/rating.js — POS_WEIGHTS + out-of-position penalty. CEO approval required to change."),
  chemistryVersion: entry("2.5", ACTIVE, "Display layer only — zero engine consumers, so it never enters a result fingerprint.", false),

  // ── AI narrative ──
  narrativePromptVersion: entry("2.1", ACTIVE, "The prompt that asks the model to explain a finished result. Narrative identity only — it explains a game, it does not play one.", false),
  narrativeSchemaVersion: entry("1.0.0", ACTIVE, "The shape a valid narrative must satisfy before it may be cached. Narrative identity only.", false),

  // ── assets ──
  // A defined SPEC with no implementation yet — which is different from a
  // module that does not exist. The cache identity is settled and testable so
  // the UI phase inherits it rather than inventing one; the renderer itself is
  // unbuilt, which PLANNED records.
  playerCardDesignVersion: entry("1.0.0", PLANNED, "Player-card asset cache identity (spec v1). The RENDERER belongs to the UI phase; only the key shape exists today.", false),

  // ── calibration ──
  calibrationVersion: entry("backtest-1", ACTIVE, "Engine calibration pass the live tuning derives from."),
};

/** The version string for a domain, or null when it is PLANNED. Throws on an
 *  unknown name so a typo can never silently become an unversioned cache key. */
export const versionOf = (name) => {
  if (!(name in REGISTRY)) throw new Error(`versionOf: unknown version domain "${name}"`);
  return REGISTRY[name].value;
};

export const statusOf = (name) => {
  if (!(name in REGISTRY)) throw new Error(`statusOf: unknown version domain "${name}"`);
  return REGISTRY[name].status;
};

export const isActive = (name) => statusOf(name) === ACTIVE;

/** True only for domains that materially shaped a simulated result. This — not
 *  `isActive` — is what a result fingerprint must gate on. */
export const affectsResult = (name) => {
  if (!(name in REGISTRY)) throw new Error(`affectsResult: unknown version domain "${name}"`);
  return REGISTRY[name].status === ACTIVE && REGISTRY[name].affectsResult !== false;
};

/** Only the domains that materially affect a live result. This is what a result
 *  fingerprint may record — a DEVELOPMENT or PLANNED version must never appear
 *  in one, because it did not influence the game. */
export const activeVersions = () =>
  Object.fromEntries(Object.entries(REGISTRY).filter(([, v]) => v.status === ACTIVE).map(([k, v]) => [k, v.value]));

export const versionsByStatus = (status) =>
  Object.fromEntries(Object.entries(REGISTRY).filter(([, v]) => v.status === status).map(([k, v]) => [k, v.value]));

// ── Back-compat ───────────────────────────────────────────────────────────────
// The historical VERSIONS shape is still stamped onto V2 records, /api/health,
// and analytics. It is DERIVED from the registry now rather than independently
// declared, so the two can no longer drift apart. Its key names are frozen for
// back-compat; new code should read the registry.
export const VERSIONS = {
  app: REGISTRY.appVersion.value,
  rating: REGISTRY.ratingVersion.value,
  chemistry: REGISTRY.chemistryVersion.value,
  simulation_engine: "2.2",              // the LEGACY V2 elo engine's own version — unchanged on purpose
  player_data: REGISTRY.playerDataVersion.value,
  prompt: REGISTRY.narrativePromptVersion.value,
};

// v2.3: ALL core results (every mode) are decided by the deterministic engine
// on the server (/api/game); the AI layer only narrates stored results. This
// flag is retained for documentation/back-compat — the server is authoritative
// regardless of client flags.
export const USE_ENGINE_SEASON = true;
