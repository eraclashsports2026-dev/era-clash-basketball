# V3 module design

## Contracts

| Module | Input | Output | May import |
| --- | --- | --- | --- |
| `playerProfile.js` | player card | DNA (27 capabilities) + provenance | players, attributes, leagueNorms |
| `intelligence.js` | player card | profile: roles, offense, defense, fit, shooting, physical, eraTranslation | playerProfile, data/* |
| `teamIntelligence.js` | 5 cards + positions | lineup construction analysis | intelligence, roles, data/* |
| `gameplan.js` | coach, DNA, era, opponent | game plan | coaches, eraStyles |
| `possession.js` | prepared sides, era | realized events | seed |
| `engine.js` | teams, coaches, era, seed | structured result + fingerprint | all of the above |

## Isolation rules, enforced by test

- **No simulation module imports `intelligence.js` or `teamIntelligence.js`.**
  A test greps every `src/v3/*.js` for such imports.
- **Team Intelligence must not import coach or era logic.** Tested by grep.
- **Player and Team Intelligence take no era.** Tested by building every profile
  under conflicting era contexts and asserting byte-identical output.
- **No seed anywhere in the intelligence layers.** They are descriptive and
  deterministic; variance belongs to the possession engine alone.

## Versioning

Each layer carries an explicit model version so stored results stay reproducible
and old results are never recomputed with newer logic:

- `V3_VERSIONS` in `engine.js` (engine, possession model, data vintages)
- `TEAM_INTELLIGENCE_VERSION` in `teamIntelligence.js`
- `ROLE_CALIBRATION` in `intelligence.js` is **frozen**, not recomputed from the
  live pool, so adding a card never silently restates what an existing player is

## Extension points for Phase 4+

`buildTeamIntelligence` accepts a context argument that it deliberately ignores,
exactly as `buildIntelligence` does. Coach and era hooks attach there when those
layers exist — the parameter exists today so the isolation test has something
real to vary.
