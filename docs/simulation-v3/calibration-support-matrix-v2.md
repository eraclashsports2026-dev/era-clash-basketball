# Calibration support matrix v2

**State: MEASURED. 1 parameter of 53 has populated historical numeric support.**

`calibrationSupportMatrixVersion 2.0.0` ·
[`data/calibration/calibration-support-matrix.json`](../../data/calibration/calibration-support-matrix.json)

## What v2 separates that v1 did not

Phase 6C2C2 conflated two questions. v2 keeps them apart, because Phase 6C2C3
proved a parameter can be either, both, or neither:

| Dimension | Question | Answer for this engine |
|---|---|---|
| `runtimeConnected` | Does the knob turn anything? | **53 / 53** |
| `measurableEffect` | Does it move a metric above noise? | 51 / 53 |
| `distinctEffect` | Can it be told apart from its neighbours? | 47 / 53 |
| `historicalSupport` | Can authorized data judge a change? | **1 / 53** |
| `syntheticSupport` | Can a controlled comparison bound it? | 26 / 53 |

Before wiring, `runtimeConnected` was 0 and every other column was unanswerable.
The columns now disagree with each other, which is the useful state: it says
where the remaining blocker actually is.

## Support classes

| Class | Parameters |
|---|---|
| `SYNTHETIC_CONTROL_SUPPORT` | 26 |
| `STRUCTURAL_VALIDATION_ONLY` | 13 |
| `UNSUPPORTED` | 13 |
| **`HISTORICAL_NUMERIC_SUPPORT`** | **1** |

Plus 2 `DERIVED_PARAMETER` entries, reported separately rather than given a
support class they cannot use.

The single historically-supported parameter is
**`opportunity.saturation.strength`**, judged against Tier C player-share targets
(132 share maps across 30 fixtures). Distributional support — not team efficiency.

## The 13 unsupported parameters

All shot-location weights, all conversion bonuses, the era pace and three-point
anchors, and the free-throw trip rate are judged solely against **Era Style
environment values** whose recorded source in `src/v3/data/eras.js` is the
publisher classified `PROHIBITED_FOR_MODEL_CALIBRATION`.

This is the sharpest illustration of why v2 separates the dimensions. Those 13
parameters are now among the **best-measured in the engine**:

| Parameter | Peak SNR | Metric |
|---|---|---|
| `shotLocation.midrangeWeight` | 66.4 | `midShare` |
| `shotLocation.postWeight` | 56.9 | `paintShare` |
| `era.freeThrowTripRate` | 45.6 | `ftr` |
| `conversion.rimBonus` | 37.4 | `rimMakeRate` |

They are connected, strongly measurable, and cleanly distinct — and **still
uncalibratable**, because nothing authorized can say which direction is better.
A v1-style single label would have had to pick one of those facts and hide the
rest.

## Calibration readiness

| Category | Count |
|---|---|
| `READY_FOR_HISTORICAL_CALIBRATION` | **1** |
| `READY_FOR_STRUCTURAL_CALIBRATION_ONLY` | 13 |
| `READY_FOR_STRONGLY_REGULARIZED_CALIBRATION` | 24 |
| `BLOCKED_BY_CONFOUNDING` | 6 |
| `BLOCKED_BY_DATA` | 13 |
| `BLOCKED_BY_NO_EFFECT` | 2 |

Derivation: a parameter is ready for historical calibration only with
`HISTORICAL_NUMERIC_SUPPORT` *and* an identifiable, distinct effect. Anything
confounded is blocked regardless of support, because fitting it would attribute
its partner's effect to it. Anything unsupported is blocked regardless of how
well it measures.

**Phase 6C2C4 scope is therefore one parameter for historical fitting**, plus 24
that could take small strongly-regularized movement against synthetic controls.
That is not a calibration of the engine. It is worth saying plainly rather than
presenting 25 tunable parameters as though they were 53.

## What would change this

Only external procurement — see
[`external-calibration-prerequisites.md`](external-calibration-prerequisites.md).
A licensed Tier B source would move 13 parameters from `UNSUPPORTED` to
historically supported, and those 13 are the strongest-measuring group in the
engine. It is the single highest-value acquisition available.

Legal clearance of `eras.js` would achieve the same for the era anchors without
any purchase, since those values are already in the repository — which makes it
the cheapest item on the register and the one to ask about first.
