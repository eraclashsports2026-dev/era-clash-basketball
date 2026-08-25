# Naming and versioning

## The resolved vocabulary

| Concept | Domain | Value | Status |
| --- | --- | --- | --- |
| Product release | `appVersion` | **2.7.2** | ACTIVE (does **not** affect results) |
| **Live production result engine** | `engineVersion` | **3.2.0** | ACTIVE |
| **Possession engine (development)** | `possessionEngineVersion` | **1.1.0** | DEVELOPMENT |
| Defensive matchup engine | `defensiveMatchupVersion` | **1.1.0** | DEVELOPMENT |
| Zone resolution | `zoneResolutionVersion` | **1.0.0** | DEVELOPMENT |
| Coach adjustment engine | `coachAdjustmentVersion` | **1.0.0** | DEVELOPMENT |
| Player Intelligence | `playerIntelligenceVersion` | **1.0.0** | DEVELOPMENT |
| Team Intelligence | `teamIntelligenceVersion` | **1.0.0** | DEVELOPMENT |
| Coach Intelligence | `coachIntelligenceVersion` | **1.0.0** | DEVELOPMENT |
| Era Style Intelligence | `eraStyleVersion` | **1.0.0** | DEVELOPMENT |
| Action library (offensive families) | `actionLibraryVersion` | **2.0.0** | DEVELOPMENT (does **not** affect results) |
| Daily configuration schema | `dailyConfigSchemaVersion` | **1.0.0** | ACTIVE (does **not** affect results) |
| Player data | `playerDataVersion` | **2026-08-24** | ACTIVE |
| Coach data | `coachDataVersion` | **1.1.0** | ACTIVE |
| Era data | `eraDataVersion` | **1.0.0** | ACTIVE |
| Rating | `ratingVersion` | **2.0** | ACTIVE |
| Chemistry | `chemistryVersion` | **2.5** | ACTIVE (does **not** affect results) |
| Narrative prompt | `narrativePromptVersion` | **2.1** | ACTIVE (does **not** affect results) |
| Narrative schema | `narrativeSchemaVersion` | **1.0.0** | ACTIVE (does **not** affect results) |
| Player-card design | `playerCardDesignVersion` | `null` | PLANNED (does **not** affect results) |
| Calibration | `calibrationVersion` | **backtest-1** | ACTIVE |
| Calibration framework | `calibrationFrameworkVersion` | **1.0.0** | DEVELOPMENT (does **not** affect results) |
| Historical fixture data | `historicalFixtureDataVersion` | **1.0.0** | DEVELOPMENT (does **not** affect results) |
| Holdout set | `holdoutSetVersion` | **1.0.0** | DEVELOPMENT (does **not** affect results) |
| Benchmark seed set | `benchmarkSeedSetVersion` | **1.0.0** | DEVELOPMENT (does **not** affect results) |
| Possession calibration | `possessionCalibrationVersion` | `null` | PLANNED (does **not** affect results) |

### Why calibration has two domains, not one

`calibrationVersion` (**backtest-1**) is the **production** engine's calibration
and is ACTIVE. It must never be repurposed: repointing it would silently change
the identity of every stored production result.

`possessionCalibrationVersion` is the development engine's calibration and is
deliberately **`null` / PLANNED**. Phase 6C1 built the framework that will
measure a calibration; it did not produce one. A non-null value here would
assert that tuned coefficients exist, and they do not — `vtag()` therefore
throws if anything tries to build a cache key from it, which is the correct
behaviour for a system that has not been built yet.

The other four are DEVELOPMENT because they describe measurement apparatus, not
engine behaviour: changing the fixture corpus or the seed set changes what a
benchmark MEASURES, so a cached benchmark must be invalidated, but no game
result depends on them.

Source of truth: **`src/versions.js`**. `versionOf()` throws on an unknown
domain so a typo cannot silently become an unversioned cache key. The table
above is asserted against the registry by a test, because a table maintained
by hand drifts — this one did, across five rows, before that test existed.

## The collision, and how it is now impossible

"V3" previously named both the live engine and the unbuilt possession engine.
The domains are now independent: the production engine stays in the **3.x**
family forever, and the possession engine starts at **1.0.0** without pretending
to be its successor. A product release may be numbered anything without
renaming an engine.

## Engine promoted 3.1.0-alpha → 3.2.0

A truthfulness correction, not a behaviour change. The engine carrying `-alpha`
has decided every production game since v2.5.0. Simulation behaviour is
untouched; only the label it records changed. Results already stored keep the
version they were stamped with and are never recomputed.

## Three status values, and why `null` matters

- **ACTIVE** — in the live path now.
- **DEVELOPMENT** — built and tested, wired to nothing. Must not enter a result fingerprint.
- **PLANNED** — does not exist. Value is `null`, never a placeholder number.

A planned engine with a version string would be the same dishonesty the naming
collision caused. `cacheKeys` refuses to build a key from a PLANNED domain.

## ACTIVE ≠ affects the result

`chemistryVersion` is ACTIVE — it ships, it is displayed, it has a real version
— and it changes **nothing** about a simulated result. `affectsResult()` is the
separate predicate a result fingerprint gates on. `appVersion`,
`narrativePromptVersion`, and `narrativeSchemaVersion` are likewise ACTIVE but
result-irrelevant: a redeploy must not invalidate stored games.

## Feature flags

`SIM_ENGINE_V3_ENABLED` keeps its exact current meaning: the kill switch for the
**live** engine. It was not repurposed, and a test asserts it retains exactly
one read site.

The future possession engine gets its own flag — **`POSSESSION_ENGINE_ENABLED`**
— when it exists. It does not exist yet, so the flag does not exist yet.

## Legacy names still present

| Name | Why kept |
| --- | --- |
| `VERSIONS` (legacy shape) | Stamped on V2 records, `/api/health`, analytics. Now **derived** from the registry so the two cannot drift. Key names frozen for back-compat. |
| `VERSIONS.simulation_engine = "2.2"` | The **legacy V2 elo engine's own** version. Deliberately unchanged — it names a different engine. |
| `V3_VERSIONS` | The V3 engine's record shape. Now derived from the registry; model-shape fields (`possessionModel`, `fatigueModel`) stay local as they have no registry domain. |
| Service worker `eraclash-v2.3.5` | Bumped deliberately per release; not a registry domain. |
