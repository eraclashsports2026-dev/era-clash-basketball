# Current repository map

Verified against the tree at Phase 2B. Line counts are indicative.

## Data

| What | Where | Notes |
| --- | --- | --- |
| Player cards (381) | `src/players.js` | Flat array; `pts/reb/ast/stl/blk` + accolades + `win`/`pop` |
| Card statistical basis | `src/v3/data/cardStatBasis.js` | **Phase 2B.** Which convention each card's numbers follow |
| Canonical person identity | `src/v3/data/persons.js` | **Phase 2B.** 323 persons ↔ 381 cards |
| Verified physical metadata | `src/v3/data/physical.js` | **Phase 2B.** 44 persons; wingspan null everywhere |
| Shooting evidence | `src/v3/data/shooting.js` | **Phase 2B.** Splits + categorical identity |
| Curated attributes (93) | `src/attributes.js` | v2.5 chemistry-layer file, consumed by DNA |
| Curated intelligence (33) | `src/v3/data/intelligence.js` | V3 profile overlay |
| League norms | `src/v3/data/leagueNorms.js` | Per-decade environment anchors |
| Coaches (25) | `src/v3/data/coaches.js` (2347L), `src/v3/coaches.js` | Research + runtime shape |
| Coach career phases | `src/v3/data/coachPhases.js` (872L) | |
| Era styles (8) | `src/v3/data/eras.js`, `src/v3/eraStyles.js` | |

## Derived layers

| Layer | File | Consumed by |
| --- | --- | --- |
| Player DNA (27 capabilities) | `src/v3/playerProfile.js` | the live possession engine |
| Player Intelligence | `src/v3/intelligence.js` | **nothing** — deliberately unwired |
| Ratings / OVR | `src/rating.js` | UI, draft, difficulty |
| Chemistry | `src/chemistryView.js` | **UI only** — zero engine consumers |

## Simulation

| Piece | File |
| --- | --- |
| V3 orchestrator | `src/v3/engine.js` |
| Possession loop | `src/v3/possession.js` (357L) |
| Usage / role economics | `src/v3/roles.js` |
| Defensive assignment | `src/v3/defense.js` |
| Coach → game plan | `src/v3/gameplan.js` |
| Expectation bands, series | `src/v3/analysis.js` |
| Opponent difficulty | `src/v3/difficulty.js` |
| Duplicate-person rule | `src/v3/persons.js` |
| Seeding | `src/v3/seed.js` |
| **V2 legacy engine** | `src/engine.js` (264L) |

## Server

13 endpoints in `api/`. Assembly in `api/_lib/game-core-v3.js` (V3) and
`api/_lib/game-core.js` (V2). Engine selection is a server flag —
`api/_lib/flags.js` → `simV3`, default **true**.

## Client

`src/App.jsx` is a 1,236-line god component. 16 components in
`src/components/`.

## Tests

14 Vitest files (`tests/`), 1 Playwright spec (`e2e/journeys.spec.js`, 13
journeys), benchmark harnesses in `benchmarks/` and `benchmarks/v3/`.
