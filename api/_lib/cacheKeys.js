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
import { versionOf } from "../../src/versions.js";

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
  const v = versionOf(domain);
  if (v == null) throw new Error(`cacheKey: cannot build a key from PLANNED version domain "${domain}"`);
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
