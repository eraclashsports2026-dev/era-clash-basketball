# Calibration metrics

`src/v3/calibration/metrics.js` · `calibrationFrameworkVersion` **1.0.0**

One definition per metric, used by every benchmark. The failure this prevents is
two scripts computing "offensive rating" slightly differently and a tuning pass
chasing the gap between them instead of a real error.

## Team metrics

| Metric | Definition |
| --- | --- |
| `pace` | Possessions per 48 minutes, from the engine's own possession ledger — **counted, not estimated**. Overtime is accounted for, or an OT game reads as a fast team. |
| `offensiveRating` | Points per 100 team possessions. |
| `defensiveRating` | Points allowed per 100 opponent possessions. |
| `netRating` | ORtg − DRtg. |
| `efgPct` | (FGM + 0.5 × 3PM) / FGA. |
| `trueShootingPct` | PTS / (2 × (FGA + 0.44 × FTA)). |
| `twoPointPct` | (FGM − 3PM) / (FGA − 3PA). |
| `threePointPct` | 3PM / 3PA, **null when 3PA is 0**. |
| `threePointAttemptRate` | 3PA / FGA. |
| `freeThrowRate` | FTA / FGA. |
| `turnoverPct` | TOV / possessions. |
| `offensiveReboundPct` | ORB / (own ORB + opponent DRB). |
| `assistRate` | AST / FGM. |

`estimatedPossessions` (FGA − ORB + TOV + 0.44 × FTA) exists only to compare
against historical sources that publish box-score totals and nothing else.

## Two rules the library enforces

**Null, never zero, never NaN.** A pre-three-point era took no threes, so its
three-point percentage is `null`. Reporting `0.000` would drag down every
average it entered. A `null` is honest; a `NaN` silently corrupts every
aggregate it reaches.

**Precision follows magnitude.** One decimal is right for a pace of 104.7 and
destroys an eFG% of 0.585 — which rounded to 0.6 and made every shooting
comparison meaningless during development. Values ≥10 get one decimal, ≥1 get
two, below 1 get four.

## Error metrics

| Metric | Purpose |
| --- | --- |
| `absoluteError` | Primary measure, in the metric's own units. |
| `signedError` | Keeps direction, so a systematic bias stays visible instead of averaging away. |
| `standardizedError` | Error ÷ simulated SD. Is this miss large relative to the engine's own spread? |
| `relativeError` | Only when \|target\| > 0.01. `null` otherwise. |
| `mae`, `rmse` | Reported together — RMSE exposes a few large misses that MAE hides. |
| `withinBand` | Does the target fall inside the simulated p05–p95 band? Assumes no distribution. |

### MAPE is deliberately absent

Several targets here can legitimately be zero — three-point attempts in a
pre-three-point era, most obviously — and a percentage error against zero is
undefined or explodes to a meaningless magnitude. `ERROR_METRIC_NOTES`
records the exclusion, and a test asserts it.

## Confidence weighting

`CONFIDENCE_WEIGHTS`: HIGH 1.0, MEDIUM 0.6, LOW 0.3.

Errors are reported **per confidence grade** as well as weighted. Component
errors always survive the rollup: a single opaque accuracy score would let one
easily-matched metric mask a real failure.

Low confidence lowers a fixture's **weight**. It never excuses a poor result, it
never widens a tolerance, and it never increases simulation randomness — adding
variance until an error bar covers a target hides the error rather than reducing
it.

## Unavailable ≠ zero error

A missing target returns `available: false` with a reason. It is **excluded**
from aggregates, never scored as a perfect match. `aggregateErrors` reports the
`unavailable` count alongside every result, so an empty error surface cannot be
mistaken for a clean one — which matters, since 209 of 209 calibration-set
comparisons are currently unavailable.

## Probability calibration

`reliabilityBins`, `brierScore`, `logLoss`, `sharpness`, `upsetRate`.

Sharpness is reported next to Brier on purpose: a model that always predicts 50%
is perfectly calibrated and completely useless.

`expectedVsRealized` keeps the pregame prediction and the simulated outcome as
separate objects. Conflating them makes a bad prediction indistinguishable from
a bad engine.

## Distributions, not single games

`quantiles` returns n, mean, median, p05, p25, p75, p95, min, max, SD. Every
fixture comparison runs ≥1,000 simulations and compares distributions. A single
game is a draw from a distribution and says nothing about calibration.
