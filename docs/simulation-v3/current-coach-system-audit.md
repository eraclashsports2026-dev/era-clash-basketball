# Current coach system audit

Verified by reading and grepping the engine at `d61a27d`.

## Pool

**25 coaches before Phase 4, 30 after.** Loaded by `src/v3/coaches.js` from
`src/v3/data/coaches.js` (research + provenance), merged with career phases from
`src/v3/data/coachPhases.js`. `NEUTRAL_COACH` (every attribute 5) is used when
V3 runs without an explicit pick.

## Data fields

- **offense (11):** tempo, transition, motion, pnr, post, iso, threeEmphasis, insideOut, offBall, ballMovement, starFreedom
- **defense (8):** man, zone, switching, drop, pressure, helpAggression, rimPriority, defRebPriority
- **management (5):** adaptability, rotationDepth, roleDiscipline, starEmpowerment, tacticalAdjustment
- **rosterFit (9):** traditionalCenters, passingBigs, shootingBigs, primaryCreators, multipleCreators, switchableWings, shooters, defenders, transitionAthletes
- **plus:** span, record, championships, teams, eras, systemTags, bestWith, concern, documented, inferred, sources, confidence, careerPhases, toolkit

**There is no coach OVR anywhere**, and there was none before Phase 4 either.
That constitutional rule was already upheld.

## Production consumers

`src/v3/gameplan.js` translates a coach into a game plan the possession loop
consumes: `adaptability` (halftime/Q3 adjustments), `roleDiscipline`, tempo,
scheme and concentration. `src/v3/defense.js` reads the defensive scheme fields.
`eraInteraction` in `gameplan.js` reads `threeEmphasis`, `zone`, `pressure`,
`motion` against era rules.

## Dormant fields — SIX, not four

The prior audit reported four. Grepping property access across `gameplan.js`,
`possession.js`, `defense.js` and `engine.js` found **six**:

| Field | Prior audit | Reality |
| --- | --- | --- |
| `pnr` | dormant | ✅ dormant |
| `insideOut` | dormant | ✅ dormant |
| `starEmpowerment` | dormant | ✅ dormant |
| `tacticalAdjustment` | dormant | ✅ dormant |
| **`man`** | not reported | ❌ **also dormant** |
| **`rotationDepth`** | not reported | ❌ **also dormant** |

Resolution for each in `coach-field-consumption.md`.

## Use by mode

| Mode | Coaches applied? |
| --- | --- |
| Single game | **Yes** — player-selected |
| Best of 7 | **Yes** |
| Win 82 / Tournament | Yes, with generated opponents using `NEUTRAL_COACH` |
| **Daily Challenge** | **No** — bypasses coach selection entirely |
| **Challenges** | **No** |

The highest-traffic mode does not exercise the coach path, so coach regressions
would ship undetected. This remains an open CEO decision.

## Recommendation logic before Phase 4

`gameplan.js` computed an era-and-roster fit used for coach suggestions in
`/api/v3meta`. It had no access to Team Intelligence, so it could not reason
about usage compression, creation hierarchy, spacing geometry, or defensive gaps.
