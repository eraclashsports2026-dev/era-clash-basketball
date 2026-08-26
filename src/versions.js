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

  // ── Calibration lifecycle ────────────────────────────────────────────────
  // A calibration earns its way forward through evidence, and the VALUE does
  // not change as it does — 1.0.0 locked and 1.0.0 in production are the same
  // parameters. Only the strength of the evidence behind them changes, so the
  // status carries that and the version number stays honest.
  /** Parameters frozen and hashed. Internal gates passed. No holdout opened yet. */
  DEVELOPMENT_LOCKED: "DEVELOPMENT_LOCKED",
  /** A scoped candidate: some parameters moved, within their eligible bounds. */
  DEVELOPMENT_LOCKED_SCOPED: "DEVELOPMENT_LOCKED_SCOPED",
  /**
   * The wired defaults, selected as the model because no supported change beat
   * them. A legitimate outcome, not a failure: it says the search ran and the
   * defaults won, which is different from saying no search ran.
   */
  DEVELOPMENT_LOCKED_BASELINE: "DEVELOPMENT_LOCKED_BASELINE",
  /** Both formal holdouts opened once and passed. Not yet previewed. */
  HOLDOUT_VALIDATED: "HOLDOUT_VALIDATED",
  /** Private preview soak and human review passed. Not yet in production. */
  PRIVATE_PREVIEW_VALIDATED: "PRIVATE_PREVIEW_VALIDATED",
  /** A formal holdout rejected this parameter set. It may never be retuned against that holdout. */
  HOLDOUT_FAILED: "HOLDOUT_FAILED",
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
  // ── Phase 6C1 calibration framework ──────────────────────────────────────
  // Separate from the PRODUCTION calibrationVersion ("backtest-1"), which
  // belongs to engine 3.2.0 and must not be repurposed.
  calibrationFrameworkVersion: entry("1.0.0", DEVELOPMENT,
    "Calibration metrics, benchmark harness and reporting. Changing it changes what a measurement MEANS, so it belongs in the calibration cache identity.", false),

  historicalFixtureDataVersion: entry("1.0.0", DEVELOPMENT,
    "The historical fixture corpus: units, coaches, era anchors, documented identities and sourced targets. A fixture edit must invalidate cached calibration output.", false),

  calibrationPlayerSchemaVersion: entry("1.0.0", DEVELOPMENT,
    "The shape of a calibration-only player-SEASON profile. Separate from the public card schema because a season profile and a decade card are different objects with different evidence.", false),

  calibrationPlayerDataVersion: entry("1.0.0", DEVELOPMENT,
    "The calibration-only player-season values. These NEVER enter the public product. They affect a development simulation only when a calibration fixture is run.", false),

  fixtureSourceRegistryVersion: entry("1.0.0", DEVELOPMENT,
    "Which sources are approved, prohibited or pending, and under what licence. A source's status gates whether its data may enter calibration at all.", false),

  historicalCalibrationSetVersion: entry("3.0.0", DEVELOPMENT,
    "The historical calibration partition. Separate from the corpus version because membership can change without the corpus changing.", false),

  syntheticDevelopmentSetVersion: entry("2.0.0", DEVELOPMENT,
    "Synthetic fixtures available for development and as tuning guardrails. Explicitly NOT a holdout.", false),

  syntheticStressHoldoutVersion: entry("2.0.0", DEVELOPMENT,
    "A NEW sealed synthetic stress set. v2 rather than a reuse of v1 because 19 of v1's 25 fixtures had their outputs read during Phase 6C2A, which disqualifies it as a holdout.", false),

  monteCarloProbabilityVersion: entry("1.0.0", DEVELOPMENT,
    "The Monte Carlo win-probability estimator. Affects prediction fingerprints and probability cache keys; must NEVER affect a game simulation result.", false),

  predictionSeedSetVersion: entry("1.0.0", DEVELOPMENT,
    "Seeds used to ESTIMATE a probability. Disjoint from validation and actual-game seeds, so a probability is never validated against the games that produced it.", false),

  probabilityValidationSeedSetVersion: entry("1.0.0", DEVELOPMENT,
    "Seeds used to measure empirical outcomes when validating a probability. Disjoint from prediction seeds by construction.", false),

  probabilityCacheSchemaVersion: entry("1.0.0", DEVELOPMENT,
    "The shape of a cached probability estimate. Bumping it invalidates every cached estimate, which is correct when the stored shape changes.", false),

  fixtureClassificationVersion: entry("1.0.0", DEVELOPMENT,
    "What KIND of thing each fixture is — historical lineup, proxy, synthetic archetype, cross-era stress test — and therefore what it may calibrate. Does not affect game results.", false),

  historicalCorpusVersion: entry("3.0.0", DEVELOPMENT,
    "The source-valid historical corpus. 2.0.0 because v1 mixed historical and synthetic fixtures under labels that overstated them; v1 is preserved unchanged as a frozen artefact.", false),

  historicalHoldoutSetVersion: entry("3.0.0", DEVELOPMENT,
    "The source-valid historical holdout. Separate from holdoutSetVersion, which describes the legacy mixed holdout and stays at 1.0.0 forever.", false),

  syntheticStressSetVersion: entry("1.0.0", DEVELOPMENT,
    "The synthetic stress holdout: archetypes, cross-era constructions and exploit tests. Validates structure and balance, never historical accuracy.", false),

  calibrationParameterRegistryVersion: entry("2.0.0", DEVELOPMENT,
    "The single registry every tunable coefficient must live in. A tuned value outside it is invisible to the parameter history, which is how a model becomes untraceable. v2 (Phase 6C2C3) is a STRUCTURAL change, not a calibration change: two entries were reclassified as derived, three were split or corrected to the values the engine actually runs, and every entry gained a registryClass. The prior snapshot and hash are preserved in data/calibration/registry-v1-snapshot.json.", false),

  calibrationObjectiveVersion: entry("3.0.0", DEVELOPMENT,
    "The objective function and its acceptance rules. Bumped whenever a weight or threshold changes, so a result can never be attributed to the wrong objective. v2 (Phase 6C2C2) adds separately-reported components for zone behaviour, coach identity, adjustment behaviour and probability reliability, and refuses to collapse them into one opaque score.", false),

  probabilityValidationVersion: entry("2.0.0", DEVELOPMENT,
    "The probability reliability suite: bins, scoring rules and the strength ladder. Does not affect game results.", false),

  historicalTargetSchemaVersion: entry("1.0.0", DEVELOPMENT,
    "The shape of a calibration target record: fields, provenance requirements, availability vocabulary. Changing it changes what a target IS, so cached target output must be invalidated. Does NOT affect game results.", false),

  historicalTargetDataVersion: entry("3.0.0", DEVELOPMENT,
    "The target VALUES themselves. Bumped whenever targets are added, corrected or re-derived — including blind holdout enrichment, which changes the data without touching holdout membership. Does NOT affect game results: a target is what the engine is measured AGAINST, never an input to it.", false),

  opportunityAllocationVersion: entry("1.0.0", DEVELOPMENT,
    "Who receives each offensive opportunity. This one DOES change results — it changes which player shoots — so it belongs in development fingerprints, possession cache keys and replay identity.", true),

  // ── Phase 6C2C2 policy domains ───────────────────────────────────────────
  // Each governs a gate rather than a computation, so none affects a result.
  // They exist so that a threshold cannot move without leaving a trace.
  // ── Phase 6C2C3 runtime wiring domains ───────────────────────────────────
  runtimeParameterBindingVersion: entry("1.0.0", DEVELOPMENT,
    "How the calibration registry reaches the running engine: the compiled parameter set, its threading through the prepared context, and each consumer binding. DOES affect results once wired — the engine now reads its coefficients from here — so it belongs in the development fingerprint.", true),

  // ── Phase 6C2C4 scoped-calibration domains ───────────────────────────────
  // ── Phase 6C2C5 measurement governance ───────────────────────────────────
  calibrationReportArtifactSchemaVersion: entry("1.0.0", DEVELOPMENT,
    "The shape of a measurement artifact: provenance fields, data envelope and output hash. Bumping it invalidates every artifact written under the old shape.", false),

  calibrationReportRendererVersion: entry("1.0.0", DEVELOPMENT,
    "The renderer that turns artifacts into documents. It may format and nothing else — a renderer that computes is a renderer that can disagree with its own artifact.", false),

  measurementGovernanceVersion: entry("1.0.0", DEVELOPMENT,
    "The rule that every quantitative claim originates from a machine-readable artifact written by the command that measured it. Exists because two prior phases published category totals typed into prose that did not reconcile.", false),

  targetedMechanicFixtureVersion: entry("1.0.0", DEVELOPMENT,
    "Per-parameter exercise contracts: the fixtures, activation predicate and conditional metrics that prove a parameter's mechanic actually occurred before its effect is judged.", false),

  noEffectTriageVersion: entry("1.0.0", DEVELOPMENT,
    "The triage that re-examines every parameter a broad sweep called no-effect, at intermediate, conditional-possession and game-distribution levels separately.", false),

  parameterConfoundingResolutionVersion: entry("1.0.0", DEVELOPMENT,
    "Factorial resolution of each confounding group, with main effects and interaction measured rather than inferred from response-vector similarity alone.", false),

  targetedCalibrationPolicyVersion: entry("1.0.0", DEVELOPMENT,
    "Scope, bounds, regularization, objective components and acceptance rules for a targeted bounded search. Frozen before search; Candidate 0 (the wired defaults) always competes.", false),

  calibrationReadinessVersion: entry("2.0.0", DEVELOPMENT,
    "The mapping from identifiability and support onto exactly one calibration-eligibility class per parameter. v2 because v1's readiness numbers were asserted in prose rather than computed, and did not reconcile to the active parameter count. Held at 2.0.0 deliberately: the v2 policy object embeds this string, so bumping it here would silently change the frozen v2 policy hash even though the v2 methodology had not changed. The v3 methodology has its own key.", false),

  calibrationReadinessV3Version: entry("1.0.0", DEVELOPMENT,
    "Readiness under the targeted-mechanic methodology, which adds classes for parameters that are active only in rare conditional contexts and for those a target cannot adjudicate at all. Separate from calibrationReadinessVersion so the v2 freeze stays byte-stable.", false),

  calibrationScopeVersion: entry("1.0.0", DEVELOPMENT,
    "Which parameters a calibration search may touch, with per-parameter bounds and movement limits. Frozen before search; mutating it mid-search would let the scope follow the results.", false),

  scopedCalibrationPolicyVersion: entry("1.0.0", DEVELOPMENT,
    "Acceptance rules for a scoped calibration candidate: fold structure, objective weights, regularization, movement caps and rejection criteria.", false),

  calibrationSearchVersion: entry("1.0.0", DEVELOPMENT,
    "The deterministic staged search procedure. Bumped when the search itself changes, so a candidate can never be attributed to the wrong procedure.", false),

  calibrationCandidateSetVersion: entry("2.0.0", DEVELOPMENT,
    "The locked candidate parameter values and their provenance.", false),

  parameterHistoryVersion: entry("1.0.0", DEVELOPMENT,
    "Append-only record of every candidate evaluated, accepted or rejected, with the reason.", false),

  sideSymmetryValidationVersion: entry("2.0.0", DEVELOPMENT,
    "The side-symmetry validation procedure and seed sets. v2 uses a fresh seed block so a candidate is not judged on the seeds its predecessor was measured against.", false),

  parameterConnectivityVersion: entry("1.0.0", DEVELOPMENT,
    "The procedure that proves each active parameter reaches a real runtime consumer and moves its intended output. A gate, not a computation.", false),

  calibrationSupportMatrixVersion: entry("2.0.0", DEVELOPMENT,
    "Which parameters have evidence that could judge a change to them. v2 separates runtime connectivity from evidential support, because Phase 6C2C2 showed a parameter can be neither, either, or both.", false),

  parameterSensitivitySeedSetVersion: entry("1.0.0", DEVELOPMENT,
    "Fixed paired seeds for sensitivity and identifiability measurement, generated reproducibly so favourable-seed selection cannot hide in a re-run.", false),

  defaultParityFixtureVersion: entry("1.0.0", DEVELOPMENT,
    "The frozen pre-wiring behaviour corpus that default parity is judged against. Bumping it means the reference moved, which invalidates every parity claim made against the old one.", false),

  actualGameSymmetryVersion: entry("1.0.0", DEVELOPMENT,
    "How a single actual game assigns sides, opening possession, period order and RNG streams. This one DOES affect results — it changes who gets the ball — so it belongs in the development fingerprint.", true),

  tierBTargetDataVersion: entry("1.0.0", DEVELOPMENT,
    "Advanced historical target values (pace, ratings, eFG%, TS%, TOV%, ORB%, DRB%, FTr, 3PAr, assist rate) and the formulas that derive them. A target is what the engine is measured against, never an input.", false),

  independentSourceVerificationVersion: entry("1.0.0", DEVELOPMENT,
    "The second-source verification policy and its coverage requirements. Bumped when the required coverage or the disagreement-resolution rules change.", false),

  parameterIdentifiabilityVersion: entry("2.0.0", DEVELOPMENT,
    "The sensitivity and confounding analysis that decides which parameters may be tuned at all. Bumped when a classification threshold changes — never to enlarge the tunable set after seeing a result. Held at 2.0.0 deliberately: IDENTIFIABILITY_V2 embeds this string in the object its own frozen hash covers, so bumping it for a NEW methodology would break the v2 freeze while claiming v2 was untouched. The v3 methodology has its own key.", false),

  parameterIdentifiabilityV3Version: entry("1.0.0", DEVELOPMENT,
    "Identifiability under the targeted-mechanic methodology: a parameter is judged inside the possession population it governs rather than against game-level aggregates, and is additionally probed for whether the objective can see it at all. Separate from parameterIdentifiabilityVersion so the v2 freeze stays byte-stable.", false),

  internalCalibrationFoldVersion: entry("3.0.0", DEVELOPMENT,
    "Fold membership for internal tuning and internal validation. Frozen before tuning; a bump means the split changed and every prior fold measurement is void.", false),

  holdoutAcceptancePolicyVersion: entry("1.0.0", DEVELOPMENT,
    "The pass/fail rules a formal holdout is judged by, frozen before any holdout is opened. Changing this after an opening invalidates that holdout permanently.", false),

  holdoutValidationVersion: entry("1.0.0", DEVELOPMENT,
    "The holdout evaluation procedure and its recorded access events.", false),

  privatePreviewValidationVersion: entry("1.0.0", DEVELOPMENT,
    "Private preview soak volumes, latency and error thresholds, and the human-review requirement.", false),

  productionRolloutPolicyVersion: entry("1.0.0", DEVELOPMENT,
    "Staged rollout definition, per-stage activation thresholds and rollback triggers.", false),

  holdoutSetVersion: entry("1.0.0", DEVELOPMENT,
    "The frozen holdout partition. Bumping it means the holdout changed, which is a deliberate act that invalidates every prior holdout measurement.", false),

  benchmarkSeedSetVersion: entry("1.0.0", DEVELOPMENT,
    "Fixed benchmark seed sets. Generated reproducibly rather than chosen; a new version is a new result identity so favourable-seed selection cannot hide in a re-run.", false),

  // The CALIBRATED model does not exist yet. Phase 6C1 builds the framework and
  // measures the untuned baseline; Phase 6C2 performs the tuning that would
  // produce an approved calibration. Reporting a version here before then would
  // claim a calibration that has not happened.
  possessionCalibrationVersion: entry(null, PLANNED,
    "The approved calibration of the possession engine. Deliberately null until Phase 6C2 tunes and an approved calibration exists.", false),

  zoneResolutionVersion: entry("1.0.0", DEVELOPMENT,
    "Zone shells, area responsibilities, gap vulnerabilities and zone possession resolution. Its own domain because Phase 6B1 shipped ZONE_MIXED as a scheme LABEL that resolved through man code — a real zone path is a different system, not a bigger label. DEVELOPMENT, ZONE_RESOLUTION_ENABLED defaults to false."),

  coachAdjustmentVersion: entry("1.0.0", DEVELOPMENT,
    "Offensive game-plan state, adjustment triggers and bounded responses. Separate from coachIntelligenceVersion: the DATA about a coach and the in-game ADJUSTMENT ENGINE change for different reasons, and conflating them would invalidate stored games on a data edit. DEVELOPMENT, OFFENSIVE_COACH_ADJUSTMENTS_ENABLED defaults to false."),

  defensiveMatchupVersion: entry("1.1.0", DEVELOPMENT,
    "Defensive assignment planning, era-legal schemes, mismatch classification, switching state and bounded coach adjustments. Its OWN domain: a change to how defenders are assigned is not a change to the possession loop, and conflating them would invalidate stored games on an unrelated edit. DEVELOPMENT — DEFENSIVE_MATCHUP_ENGINE_ENABLED defaults to false."),

  possessionEngineVersion: entry("1.1.0", DEVELOPMENT,
    "Possession Engine 1.0 core: the score and box score emerge from simulated possessions. Family 1.x, DEVELOPMENT — POSSESSION_ENGINE_ENABLED defaults to false and no production route selects it. It is not historically authoritative and carries no calibration claim until Phase 6C backtesting."),

  // ── intelligence layers (built, unwired) ──
  playerIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/intelligence.js — 381 profiles. No simulation module imports it."),
  teamIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/teamIntelligence.js — lineup construction. No simulation module imports it."),
  // DEVELOPMENT, not ACTIVE: the module exists and is tested, but no
  // simulation module imports it, so it has never shaped a result and must not
  // appear in a result fingerprint.
  coachIntelligenceVersion: entry("1.0.0", DEVELOPMENT, "src/v3/coachIntelligence.js — contextual coach fit. No simulation module imports it."),
  // DEVELOPMENT, not ACTIVE: the module exists and is tested, but no simulation
  // module imports it, so it has never priced a result and must not appear in a
  // result fingerprint. Distinct from eraDataVersion, which IS active — the
  // engine already uses era DATA; this is the intelligence layer over it.
  eraStyleVersion: entry("1.0.0", DEVELOPMENT, "src/v3/eraStyleIntelligence.js — strategic effects, coach-era and player-era translation. No simulation module imports it."),

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
  // The action library the pick-and-roll model belongs to. DEVELOPMENT: it
  // exists and is tested, and it is NOT the possession engine — one action is
  // not an engine, and possessionEngineVersion stays null to say so.
  actionLibraryVersion: entry("2.0.0", DEVELOPMENT, "src/v3/actions/ — versioned basketball action models. Pick-and-roll is the first.", false),

  playerCardDesignVersion: entry(null, PLANNED, "Player-card asset cache identity. The RENDERER belongs to the UI phase; only the key SHAPE exists today, so the value stays null — a placeholder number here let a PLANNED domain build a real cache key.", false),

  // ── Daily ──
  // The SHAPE of an official Daily configuration. Bumping it produces a new
  // cache key, which is how a live Daily is protected from being reinterpreted
  // mid-day by a change to its own schema.
  dailyConfigSchemaVersion: entry("1.0.0", ACTIVE, "src/v3/dailyCoachEra.js — official Daily configuration schema.", false),

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
