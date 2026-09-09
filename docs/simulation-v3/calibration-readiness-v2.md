# Calibration readiness v2

**State: RECONCILED. 0 of 53 parameters eligible for calibration.**

`calibrationReadinessVersion 2.0.0` · readiness hash `63fbd507faa74882` ·
[`data/calibration/calibration-readiness.json`](../../data/calibration/calibration-readiness.json)

## The reconciliation gate

| Class | Count | Movement cap |
|---|---|---|
| `FREE_CALIBRATION` | **0** | 100% of range |
| `STRONGLY_REGULARIZED_CALIBRATION` | **0** | 15% |
| `STRUCTURAL_CALIBRATION_ONLY` | 2 | 0 |
| `DEFAULT_FROZEN_CONFOUNDED` | 7 | 0 |
| `DEFAULT_FROZEN_NO_EFFECT` | 37 | 0 |
| `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` | 7 | 0 |
| **TOTAL** | **53** | |

**53 = 53. Reconciles.** Eligible for search: **0**. Frozen: **53**.

Every frozen parameter carries a zero-width search window (`lo === hi ===
default`), so a search cannot move one even by accident.

### Why this gate exists

Phase 6C2C3 failed it. That phase's readiness table was **written as prose rather
than computed**: the support-matrix JSON has no readiness field at all, the six
document counts summed to **59** against 53 active parameters, and the final
report quoted four of them summing to **44**. No code produced any of them.

Readiness is now a function of measured identifiability and measured support, and
`npm run calibration:readiness` exits non-zero on any total other than the active
count. A test asserts the same.

## Decision order, and why it is ordered that way

```
safety clamp            → DEFAULT_FROZEN_NO_EFFECT
no measurable effect    → DEFAULT_FROZEN_NO_EFFECT
confounded              → DEFAULT_FROZEN_CONFOUNDED
unsupported             → DEFAULT_FROZEN_PENDING_EXTERNAL_DATA
structural support only → STRUCTURAL_CALIBRATION_ONLY
identifiable + historical numeric → FREE_CALIBRATION
identifiable or weak    → STRONGLY_REGULARIZED_CALIBRATION
```

Severity first. A confounded parameter is frozen **however well supported** it is,
because fitting it would attribute its partner's effect to it. An unsupported
parameter is frozen **however strongly it measures**, because there is nothing to
say which direction is better.

Both of those bite here. The 7 confounded parameters include the strongest
effects in the engine (`offensiveAdjustmentCooldown`, full-range effect 4.37
adjustments per game). The 7 unsupported include the next strongest
(`era.paceTempoScale`, 1.11 possessions of pace; `conversion.rimBonus`, 11.1
points of rim conversion).

## Safety clamps, reclassified

Two parameters were reclassified from tunable to frozen after a targeted extreme
test, as the phase requires:

| Parameter | Why it never binds |
|---|---|
| `era.paceBoundFraction` | Bounds realized pace around the era anchor. Measured unclamped pace lands at 96–98 inside an 82–109 band; no coach tempo in the pool approaches it. |
| `era.threeAnchorMax` | Upper clamp on the three-point odds-ratio anchor. Measured ratios run 1.1–2.1 against a clamp at 12; even perturbed to 5 it does not engage. |

Both have real consumers and both move a result when pushed to a bound. They are
guard rails against inputs the corpus does not contain — which is a different
finding from a dead knob, and not a calibration target either way. Tuning a guard
rail is not calibration.

## The two structural-only parameters

`coach.adjustmentMagnitude` (t = 20.9 on `spotUpShare`) and
`zone.cornerVulnerability` (t = 6.4 on `threePar`) are the only two parameters
that are identifiable, unconfounded, and practically meaningful.

Neither has a numeric target. They can be checked for structural sanity —
invariants, monotonicity, bounds — and there is no value to fit them to. Both stay
at their defaults.

## Consequence

**No calibration search was run, because there was nothing eligible to search.**

Workstreams 5 through 10 — opportunity, shot location, conversion and events, era,
zone, coach — had zero eligible parameters between them. Running a search over an
empty scope would have produced a candidate identical to the default set and a
report implying work that did not happen.

`possessionCalibrationVersion` remains `null`, status `NOT_LOCKED`.

## What would change this

Only external data. See
[`external-calibration-prerequisites.md`](external-calibration-prerequisites.md).

The highest-value single item is **legal clearance of `src/v3/data/eras.js`**,
because those 64 era-environment values are already in the repository. Clearing
them would move 7 parameters from `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` toward
eligibility — and those 7 include the strongest measurable effects in the engine.
It costs a legal opinion rather than a purchase.

A licensed Tier B source would additionally supply team-efficiency and
possession-event targets, which is the only route to `FREE_CALIBRATION` for
anything.

Neither unblocks the 37 no-effect parameters. Those are weak knobs, and no amount
of data makes a knob that moves its own metric by six tenths of a percentage point
across its full range worth fitting.
