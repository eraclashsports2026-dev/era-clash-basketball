// ── Canonical cache-key registry ──────────────────────────────────────────────
// ONE builder for every cache identity in EraClash. Before this file, keys were
// hand-assembled as template literals at ~35 call sites, which made two things
// impossible: knowing what was cached, and invalidating it correctly.
//
// ── THE RULE THAT MATTERS ────────────────────────────────────────────────────
// A cache key must change when — and only when — the thing it names changes.
// Too coarse and you serve a stale narrative after a prompt rewrite; too fine
// and you never hit at all. Version segments come from the canonical registry
// (src/versions.js), never from a string typed here, so a version bump
// invalidates exactly what it should without anyone remembering to.
//
// ── WHY SOME NAMESPACES ARE DELIBERATELY UNVERSIONED ─────────────────────────
// `result:`, `idem:`, `ch:`, `profile:`, `dl:` hold LIVE PRODUCTION DATA. Adding
// a version segment to them would not invalidate anything — it would ORPHAN it,
// silently detaching every stored game, challenge and profile from the product.
// Those records already carry their versions INSIDE the payload, which is the
// right place for immutable data: the record explains itself, and the key just
// finds it. Versioned keys are for DERIVED and REGENERABLE things, where a
// miss costs a recomputation rather than a lost record.
//
// ── SECURITY ─────────────────────────────────────────────────────────────────
// Every segment is validated. Keys never contain API keys, tokens, cookies,
// authorization headers, or email addresses. Session identifiers are truncated
// (never the full value) exactly as the pre-existing rate-limit keys do.
import { versionOf, statusOf, VERSION_STATUS } from "../../src/versions.js";

// Conservative allowlist. Anything outside it is rejected rather than escaped —
// a cache key is not a place to be clever about sanitising user input.
const SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

const seg = (value, label) => {
  const s = String(value ?? "");
  if (!SEGMENT.test(s)) throw new Error(`cacheKey: invalid ${label} segment ${JSON.stringify(s)}`);
  return s;
};

/** Short version tag for a key segment, e.g. "3.2.0" → "3-2-0". */
const vtag = (domain) => {
  // Guard on STATUS, not on the value. The old check only refused domains
  // whose value happened to be null, so a PLANNED domain carrying a
  // placeholder number built a key just fine — which is exactly what the
  // registry exists to prevent, and the opposite of what the docs promised.
  // A PLANNED system does not exist, so nothing it would key can be cached.
  if (statusOf(domain) === VERSION_STATUS.PLANNED) {
    throw new Error(`cacheKey: cannot build a key from PLANNED version domain "${domain}"`);
  }
  const v = versionOf(domain);
  if (v == null) throw new Error(`cacheKey: version domain "${domain}" has no value`);
  return String(v).replace(/[^A-Za-z0-9]+/g, "-");
};

/**
 * Namespace catalogue. `retention` is the intended TTL policy, `visibility`
 * says whether the value may ever be served publicly, and `versioned` records
 * whether the key carries a version segment.
 */
export const NAMESPACES = {
  result:          { versioned: false, retention: "PERMANENT — competitive records and user history must not expire under an operational TTL", visibility: "public-safe (immutable game record, no private data)" },
  idempotency:     { versioned: false, retention: "24h — long enough to absorb retries of one simulation", visibility: "private" },
  narrative:       { versioned: true,  retention: "PERMANENT per identity — regenerating costs a paid provider call", visibility: "public-safe (explains an immutable public result)" },
  "narrative-lock": { versioned: true, retention: "SHORT (provider timeout + margin) — must expire if a worker dies", visibility: "private" },
  teamintel:       { versioned: true,  retention: "process-memory only by default — see caching-and-cost.md", visibility: "private" },
  coachfit:        { versioned: true,  retention: "process-memory only by default", visibility: "private" },
  era:             { versioned: true,  retention: "process-memory only by default", visibility: "private" },
  daily:           { versioned: false, retention: "until the daily rolls over", visibility: "private (claims) / public (board)" },
  "daily-ptr":     { versioned: true,  retention: "IMMUTABLE for the UTC date — advanced only by an explicit emergency revision", visibility: "public-safe (names the official config, holds no secrets)" },
  "dev-possession": { versioned: true, retention: "DEVELOPMENT ONLY — safe to flush at any time; never read by a production route", visibility: "private (development engine output)" },
  "dev-calibration": { versioned: true, retention: "DEVELOPMENT ONLY — a calibration run is reproducible from its manifest and seed set, so discarding it costs only CPU", visibility: "private (calibration benchmark output)" },
  "rate-limit":    { versioned: false, retention: "one window", visibility: "private" },
  circuit:         { versioned: false, retention: "2 × breaker window", visibility: "private" },
  playercard:      { versioned: true,  retention: "immutable — a design or data change produces a new URL", visibility: "public-safe (no private data, no photos)" },
  research:        { versioned: true,  retention: "until the source content hash changes", visibility: "build-time only, never served" },
  "share-image":   { versioned: true,  retention: "immutable per render configuration", visibility: "public-safe" },
  "public-result": { versioned: true,  retention: "immutable — a result never changes", visibility: "public-safe" },
};

export const cacheKeys = {
  // ── live production data: shapes frozen, versions live inside the record ──
  /** An immutable stored game. */
  result: (resultId) => `result:${seg(resultId, "resultId")}`,
  /** Retry guard for one simulation submission. */
  idempotency: (simulationId) => `idem:${seg(simulationId, "simulationId")}`,
  challenge: (challengeId) => `ch:${seg(challengeId, "challengeId")}`,
  dailyBoard: (date) => `dl:${seg(date, "date")}:board`,
  dailyClaim: (date, session) => `daily:claim:${seg(date, "date")}:${seg(String(session).slice(0, 32), "session")}`,
  /**
   * The day's official Daily configuration. Versioned so a mid-day data change
   * produces a NEW key instead of silently reinterpreting a Daily that players
   * have already started — once a Daily is live its configuration is immutable
   * for that date, and an emergency change needs a new config id.
   */
  /**
   * The official Daily configuration for one UTC date and revision.
   *
   * Deliberately NOT versioned by player/coach/era data. It used to be, on the
   * reasoning that a data change should not silently reinterpret a Daily in
   * progress — but versioning the KEY achieves the opposite: a mid-day deploy
   * produces a new key, a second official configuration, and two leaderboards
   * for one date. The record itself captures the versions that were live when
   * it was created, and every later read returns that record. One UTC date has
   * one official Daily.
   *
   * Replacing a Daily is an explicit act, expressed as a new REVISION.
   */
  dailyConfig: ({ utcDate, revision }) =>
    `daily:v${vtag("dailyConfigSchemaVersion")}:${seg(utcDate, "utcDate")}:r${seg(revision, "revision")}`,

  /** Which revision is authoritative for a UTC date. Written once with SET NX
   *  at revision 1; only an explicit emergency replacement advances it. */
  dailyPointer: ({ utcDate }) =>
    `daily-ptr:v${vtag("dailyConfigSchemaVersion")}:${seg(utcDate, "utcDate")}`,

  profile: (sessionId) => `profile:${seg(String(sessionId).slice(0, 64), "sessionId")}`,
  rateLimit: (bucket, windowIndex) => `rl:${seg(bucket, "bucket")}:${seg(windowIndex, "window")}`,
  circuit: (service, windowIndex) => `circuit:${seg(service, "service")}:${seg(windowIndex, "window")}`,

  // ── derived / regenerable: fully versioned ──
  /**
   * A generated narrative. Identity is the immutable result PLUS the exact
   * narrative configuration that produced it. Change the prompt, the provider,
   * the model, or the output schema and this is a different artefact — so it
   * gets a different key rather than quietly serving text written by a prompt
   * that no longer exists.
   */
  narrative: ({ resultId, provider, model }) =>
    `narrative:p${vtag("narrativePromptVersion")}:s${vtag("narrativeSchemaVersion")}` +
    `:${seg(provider, "provider")}:${seg(model, "model")}:${seg(resultId, "resultId")}`,

  /** Generation lock. Shares the narrative identity so two different narrative
   *  configurations never block each other. */
  narrativeLock: ({ resultId, provider, model }) =>
    `narrative-lock:p${vtag("narrativePromptVersion")}:s${vtag("narrativeSchemaVersion")}` +
    `:${seg(provider, "provider")}:${seg(model, "model")}:${seg(resultId, "resultId")}`,

  /** Team Intelligence profile for one lineup. */
  teamIntel: ({ lineupFingerprint }) =>
    `teamintel:v${vtag("teamIntelligenceVersion")}:pi${vtag("playerIntelligenceVersion")}` +
    `:pd${vtag("playerDataVersion")}:${seg(lineupFingerprint, "lineupFingerprint")}`,

  /**
   * Base coach fit. Deliberately excludes seed, opponent, and era — none is an
   * input to BASE fit. When contextual fit exists it needs its own identity
   * including them, not a quiet widening of this one.
   */
  coachFit: ({ coachId, teamFingerprint }) =>
    `coachfit:v${vtag("coachIntelligenceVersion")}:cd${vtag("coachDataVersion")}` +
    `:ti${vtag("teamIntelligenceVersion")}:pi${vtag("playerIntelligenceVersion")}` +
    `:${seg(coachId, "coachId")}:${seg(teamFingerprint, "teamFingerprint")}`,

  /**
   * Era Style profile. Throws until Phase 5 gives eraStyleVersion a value —
   * deliberately, because a cache identity for a module that does not exist
   * would be a key nobody could ever invalidate correctly.
   */
  eraStyle: ({ eraId }) =>
    `era:v${vtag("eraStyleVersion")}:${seg(eraId, "eraId")}`,

  /** A rendered player-card asset. Immutable per design + data + presentation. */
  playerCard: ({ playerCardId, theme, size }) =>
    `playercard:d${vtag("playerCardDesignVersion")}:pd${vtag("playerDataVersion")}` +
    `:${seg(theme, "theme")}:${seg(size, "size")}:${seg(playerCardId, "playerCardId")}`,

  /** A cached research source, keyed by subject and content hash. */
  research: ({ subjectType, subjectId, contentHash }) =>
    `research:v1:${seg(subjectType, "subjectType")}:${seg(subjectId, "subjectId")}:${seg(contentHash, "contentHash")}`,

  /** An OpenGraph/share image for one result render configuration. */
  shareImage: ({ resultId, renderVersion }) =>
    `share-image:r${seg(renderVersion, "renderVersion")}:${seg(resultId, "resultId")}`,

  /**
   * A possession-engine result. Throws until possessionEngineVersion exists —
   * the last remaining PLANNED module, and therefore the only key that still
   * cannot be built. That is the point: a cache identity for a module that does
   * not exist would be a key nobody could ever invalidate correctly.
   */
  /**
   * A possession-engine result.
   *
   * Content-addressed: the identity is the MATCHUP plus the SEED plus every
   * version that shaped the game. Keying by matchup alone would make a rematch
   * collide with the game it is a rematch of — the whole point of a rematch is
   * a new seed and a new game, and it must get its own entry.
   *
   * Deliberately in a DEVELOPMENT namespace. A development engine's runs must
   * not land in the namespace production results live in.
   */
  possessionResult: ({ matchupFingerprint, simulationSeed }) =>
    `dev-possession:pe${vtag("possessionEngineVersion")}:al${vtag("actionLibraryVersion")}` +
    `:dm${vtag("defensiveMatchupVersion")}:zr${vtag("zoneResolutionVersion")}:ca${vtag("coachAdjustmentVersion")}` +
    `:pd${vtag("playerDataVersion")}:pi${vtag("playerIntelligenceVersion")}:ti${vtag("teamIntelligenceVersion")}` +
    `:cd${vtag("coachDataVersion")}:ci${vtag("coachIntelligenceVersion")}:ed${vtag("eraDataVersion")}:es${vtag("eraStyleVersion")}` +
    `:${seg(matchupFingerprint, "matchupFingerprint")}:s${seg(String(simulationSeed >>> 0), "simulationSeed")}`,

  /**
   * A result from a CALIBRATED possession engine.
   *
   * The key shape is specified now and deliberately unbuildable: it carries
   * `possessionCalibrationVersion`, which is PLANNED, so `vtag()` throws. That
   * is the intended behaviour. A calibrated result cached before a calibration
   * exists would be an untuned result wearing a tuned engine's identity, and
   * nothing downstream could tell the difference later.
   *
   * Phase 6C2 gives the domain a value; this builder starts working the moment
   * a real calibration exists, and not one commit before.
   */
  calibratedPossessionResult: ({ matchupFingerprint, simulationSeed }) =>
    `dev-possession:pc${vtag("possessionCalibrationVersion")}:pe${vtag("possessionEngineVersion")}` +
    `:${seg(matchupFingerprint, "matchupFingerprint")}:s${seg(String(simulationSeed >>> 0), "simulationSeed")}`,

  /**
   * A calibration benchmark run.
   *
   * The identity has to include the CORPUS and the SEED SET, not just the
   * engine versions: the same engine measured against a different fixture set
   * or different seeds is a different measurement, and serving one for the
   * other would silently compare unlike results. It also includes the manifest
   * hash, so editing a fixture invalidates every run that used it.
   *
   * `set` distinguishes calibration from holdout so a holdout run can never
   * collide with — or be served from — a calibration run's entry.
   */
  calibrationRun: ({ set, manifestHash, scenario, seedCount }) =>
    `dev-calibration:cf${vtag("calibrationFrameworkVersion")}:hf${vtag("historicalFixtureDataVersion")}` +
    `:ho${vtag("holdoutSetVersion")}:bs${vtag("benchmarkSeedSetVersion")}` +
    `:pe${vtag("possessionEngineVersion")}:al${vtag("actionLibraryVersion")}:dm${vtag("defensiveMatchupVersion")}` +
    `:zr${vtag("zoneResolutionVersion")}:ca${vtag("coachAdjustmentVersion")}` +
    `:pd${vtag("playerDataVersion")}:ed${vtag("eraDataVersion")}:es${vtag("eraStyleVersion")}` +
    `:${seg(set, "calibrationSet")}:m${seg(manifestHash.slice(0, 16), "manifestHash")}` +
    `:${seg(scenario, "scenario")}:n${seg(String(seedCount), "seedCount")}`,

  /** Public, immutable result page payload. */
  publicResult: ({ resultId }) =>
    `public-result:e${vtag("engineVersion")}:${seg(resultId, "resultId")}`,
};

/** The namespace a built key belongs to. Used by telemetry so every cache event
 *  is attributable without the caller having to remember to label it. */
export const namespaceOf = (key) => {
  const ns = String(key).split(":")[0];
  return ns in NAMESPACES ? ns : "unknown";
};

/** Guard for anything that will be served publicly. */
export const isPublicSafe = (key) => {
  const ns = NAMESPACES[namespaceOf(key)];
  return Boolean(ns && ns.visibility.startsWith("public-safe"));
};
