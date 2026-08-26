# Calibration objective

`src/v3/calibration/objective.js` · `calibrationObjectiveVersion` **1.0.0**

```
objective = team efficiency error
          + shot profile error
          + possession event error
          + player distribution error
          + style identity error
          + probability error
          + regularization penalty
```

## Components are always retained

The thing this refuses to be is a single accuracy number. One score lets an
easily-matched metric hide a severe failure, and nobody can tell afterwards
which of the two moved. The scalar exists for search; every component is
reported alongside it, always.

| Component | Weight |
| --- | --- |
| shot profile | **1.3** |
| player distribution | 1.2 |
| team efficiency | 1.0 |
| probability | 0.9 |
| possession events | 0.8 |
| style identity | 0.6 |

Shot profile outweighs team efficiency deliberately: Phase 6C2A showed
efficiency is downstream of the shot mix, so fitting efficiency first would fit
a symptom.

## Null, never zero

When no component has a usable target the objective is **`null`**, not `0`. A
zero objective from an empty corpus is the most dangerous number this module
could emit — it reads as perfect. A test asserts it.

## Confidence weighting

HIGH 1.0 · MEDIUM_HIGH 0.8 · MEDIUM 0.6 · LOW 0.3 · **SOURCE_BLOCKED 0**.

Confidence changes a target's **weight** in the rollup, never the error itself.
Low confidence never excuses a miss and never widens a tolerance.

## Regularisation

Penalty grows with the squared distance from a parameter's prior, scaled by its
regularisation strength. A parameter that drifts far from its default has to buy
that distance with a real error reduction.

## Acceptance policy, frozen before tuning

- calibration error must improve
- internal validation must not worsen by more than **0.02** — tuning improving while validation worsens is the signature of overfitting
- zero invariant failures
- synthetic guardrails pass
- no parameter out of bounds
- no parameter moves more than **35%** of its range in one step; a leap that large is fitting noise
- **no change informed by a holdout**

Moving a threshold after seeing a result requires a new
`calibrationObjectiveVersion` and says so. That is how a failed calibration
would otherwise become a passed one.

## Internal validation folds

`src/v3/calibration/folds.js`. Deterministic, era-stratified, frozen before
tuning. Stratification matters more than usual with a corpus this small: an
unstratified split could put every 1980s fixture in one fold and validate 1980s
tuning against the 1960s alone.

**Measured viability for this corpus: the smallest fold holds 1 fixture.** A
validation error over one team moves on noise, so cross-validation cannot detect
overfitting here. That is a corpus limitation, reported rather than papered
over — and it is an independent confirmation of the Part 18 gate failure.
