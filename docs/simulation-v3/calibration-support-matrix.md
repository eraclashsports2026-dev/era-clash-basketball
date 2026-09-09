# Calibration support matrix

**State: MEASURED. One parameter of 53 has historical numeric support.**

`data/calibration/calibration-support-matrix.json` · hash `0dfebd4c17501897`

## The question this asks

Not "does this parameter move the engine?" — that is Workstream 4. This asks
something prior: **is there any authorized target that could judge whether a
change to it is an improvement?**

A parameter can move the engine measurably and still be untunable, because
nothing authorized exists to say which direction is better. Tuning it would be
choosing a number and calling the choice calibration.

## Result

| Support class | Parameters |
|---|---|
| `SYNTHETIC_CONTROL_SUPPORT` | 26 |
| `UNSUPPORTED` | 14 |
| `STRUCTURAL_VALIDATION_ONLY` | 12 |
| **`HISTORICAL_NUMERIC_SUPPORT`** | **1** |

| | |
|---|---|
| Tunable on data grounds | 27 |
| Frozen on data grounds | 26 |
| Blocked by source policy | 14 |

**Exactly one registered parameter — `opportunity.saturation.strength` — has a
populated authorized historical numeric target**, via Tier C player-share maps.
Its support is distributional, not team-efficiency.

The other 26 "tunable" parameters carry only synthetic-control support. Tuning
those fits the engine to itself; it can make the engine more self-consistent, and
it cannot make it more historical.

## Method, and a correction to it

Classification reads the registry's own `calibrationSource` field:

| Declared source | Parameters | Support |
|---|---|---|
| `SYNTHETIC_GUARDRAIL` | 26 | synthetic control |
| `ERA_ENVIRONMENT` | 14 | **unsupported — source-blocked** |
| `STRUCTURAL` | 12 | structural validation only |
| `HISTORICAL_TIER_C + SYNTHETIC_GUARDRAIL` | 1 | historical numeric |

A declared source is honoured only if the evidence it names actually exists.

**A correction.** The first version of this analysis inferred support from
`targetMetrics` names, using a vocabulary I guessed rather than read. It
mis-bucketed **47 of 53** parameters into `STRUCTURAL_VALIDATION_ONLY` and
reported 3 with historical support for the wrong reasons. The registry declares
`calibrationSource` explicitly; the guess was not authoritative and the
declaration is. The result above is from the declaration.

## The 14 source-blocked parameters

All shot-location weights, all conversion bonuses, the era pace and three-point
anchors, the free-throw trip rate, and zone selection frequency are judged
against **Era Style environment values** — pace, FG%, 3PA/game, 3P%, FTA/game,
AST/game, TOV/game, OREB% for each of the eight eras.

`src/v3/data/eras.js` records the source of those values as
**"Basketball Reference league index"**.

Under the standing source policy those values cannot be used as calibration
targets, so a parameter whose only judge is the era environment has no usable
target. This is why the entire shot-location and conversion group is frozen —
Workstreams 7 and 8 have no authorized target to calibrate against.

Three things must be said plainly about this:

1. **It predates Phase 6C2C2.** These are pre-existing values, not something this
   phase introduced.
2. **It is live production data.** Engine 3.2.0 is ACTIVE and consumes
   `eras.js`. Nothing here touches it, and nothing here should.
3. **It is 64 league-average constants** (8 eras × 8 values), not a bulk import —
   and whether they require re-sourcing is a legal and CEO question, not one for
   this workstream to settle.

Recorded in `independent-source-verification.md` as an open risk.

## Consequence

Per the phase's own failure rules, a parameter without support remains at its
default. With 26 of 53 frozen on data grounds and 26 of the remaining 27
supported only by synthetic controls, **full historical calibration is not
achievable from the currently authorized corpus.**

The frozen acceptance policy does not provide for a scoped lock of
`possessionCalibrationVersion`, and adding one now — after seeing this result —
would be exactly the post-hoc accommodation the policy exists to prevent. So
`possessionCalibrationVersion` remains `null`.
