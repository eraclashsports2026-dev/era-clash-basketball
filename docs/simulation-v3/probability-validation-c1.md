# Probability validation — Phase 6C2C1

Estimates were produced on **prediction** seeds and measured on
**probability-validation** seeds. The two sets are disjoint. No formal holdout
was touched; every cell comes from `synthetic-development-v2`, which development
is permitted to inspect.

Thresholds were frozen in `src/v3/calibration/probabilityValidation.js` before
any result was observed.

## The two Brier scales

This matters more than any single number below, and getting it wrong would have
overstated the result by two orders of magnitude.

A forecast can be scored against a cell's **empirical rate** or against
**individual binary outcomes**. These are different quantities:

- **Rate scale** measures calibration and approaches 0 for a well-calibrated
  forecaster. Monte Carlo scores **0.0018** here.
- **Outcome scale** measures forecasting skill and *cannot* fall below the
  irreducible randomness of the games themselves. A forecaster that knew every
  true rate exactly would still score **0.2177** on this corpus.

Phase 6C2B's 0.2507 baseline is an **outcome-scale** number. Comparing it to the
rate-scale 0.0018 would claim a 100× improvement that does not exist. Only
outcome-scale numbers are compared to it here, and the report prints both scales
with the incomparability stated on each.

## Results — 30 cells, `STANDARD` estimates, 256 independent validation games each

### Outcome scale

| Metric | Value |
|---|---|
| Monte Carlo Brier | **0.2195** |
| Irreducible floor (perfect forecaster) | 0.2177 |
| Constant-0.5 baseline | 0.2500 |
| Phase 6C2B analytical baseline | 0.2507 |
| Monte Carlo log loss | 0.6277 |
| Constant-0.5 log loss | 0.6931 |

Raw Brier differences look small because ~87% of the score is irreducible game
randomness on near-even matchups. The informative statistic is the share of the
*achievable* range — the distance from constant-0.5 down to the floor:

| Forecaster | Fraction of achievable skill |
|---|---|
| **Monte Carlo** | **0.944** |
| Phase 6C2B analytical model | **−0.022** |

The analytical model captured slightly *less* than nothing: it was marginally
worse than a constant. That independently confirms the R² = 0.035 finding from a
different direction. The Monte Carlo estimator captures 94.4% of what is
achievable, and the remaining 5.6% is within the sampling error of a 256-game
estimate.

### Calibration

| Metric | Value | Threshold |
|---|---|---|
| Expected calibration error | 0.0186 | ≤ 0.10 |
| Maximum calibration error | 0.0469 | — |
| Sharpness | 0.1914 | must be reported |
| Upset rate | 0.033 | — |
| Favourite win rate | 0.967 | — |

Reliability by bin:

| Bin | Cells | Games | Predicted | Empirical | Gap |
|---|---|---|---|---|---|
| 0.0–0.1 | 1 | 256 | 0.0586 | 0.0352 | −0.0234 |
| 0.2–0.3 | 4 | 1024 | 0.2705 | 0.3037 | +0.0332 |
| 0.3–0.4 | 3 | 768 | 0.3659 | 0.3464 | −0.0195 |
| 0.4–0.5 | 4 | 1024 | 0.4590 | 0.4639 | +0.0049 |
| 0.5–0.6 | 6 | 1536 | 0.5540 | 0.5462 | −0.0078 |
| 0.6–0.7 | 4 | 1024 | 0.6426 | 0.6319 | −0.0107 |
| 0.7–0.8 | 7 | 1792 | 0.7461 | 0.7193 | −0.0268 |
| 0.8–0.9 | 1 | 256 | 0.8047 | 0.7578 | −0.0469 |

No bin below 0.1 or above 0.9 has more than one cell. Calibration at the
extremes is therefore **not established** by this run, and the two largest gaps
are in exactly those single-cell bins.

## Gate

| Check | Result |
|---|---|
| Beats the analytical baseline (outcome scale) | PASS |
| Beats constant-0.5 (outcome scale) | PASS |
| Within the irreducible floor + 0.01 | PASS |
| Captures ≥ 75% of achievable skill | PASS |
| Expected calibration error ≤ 0.10 | PASS |
| Max per-cell side bias ≤ 0.05 | **FAIL** |
| Side bias not systematic | PASS |
| Sharpness reported | PASS |

### The side-bias failure

One cell reached a raw side bias of **0.0625** against a frozen threshold of
0.05. The threshold is recorded as failed and has **not** been moved.

It is, however, almost certainly a defect in the threshold rather than in the
engine. At 256 games the standard error of a 0.5 rate is 0.0313, so 0.0625 is
exactly 2 SE; across 30 cells roughly 1.4 such cells are expected from sampling
noise alone. The threshold was frozen without accounting for sampling error at
the sample size it would be applied to.

The statistically correct question is whether the bias is *systematic*, and that
test was added alongside rather than in place of the frozen one:

```
mean across cells  0.0022 ± 0.0042   t = 0.53   systematic = false
```

No detectable systematic side advantage. Both results are reported because
substituting the favourable one for the failing one would be exactly the move
this discipline exists to prevent. Raising the threshold on a principled basis
is a decision for the next phase, not something to do after seeing the number.

## Mirror and side-swap

A mirror matchup — identical rosters, identical coach — returns **exactly
0.5000**, predicted and empirical. This is an identity, not an approximation:
paired orientation makes it exact. The mirror's *raw* gold rate was 0.5391,
which is the side artifact that pairing removes and which would have been
invisible had it been averaged away silently.

The reversed matchup returns the exact complement (0.1289 against 0.8711) from
the same cached estimate, not a second sample.

## Controlled strength ladder

Fixed team; opponent degraded one player at a time. `STANDARD` estimate, 256
independent validation games per rung.

| Rung | Predicted | 95% CI | Empirical | Gap |
|---|---|---|---|---|
| MIRROR | 0.5000 | 0.4392–0.5608 | 0.5000 | 0.0000 |
| SLIGHT_FAVORITE | 0.5273 | 0.4662–0.5876 | 0.5391 | +0.0118 |
| MODERATE_FAVORITE | 0.6602 | 0.6001–0.7154 | 0.6484 | −0.0118 |
| STRONG_FAVORITE | 0.8398 | 0.7899–0.8797 | 0.7891 | −0.0507 |
| EXTREME_FAVORITE | 0.8516 | 0.8028–0.8899 | 0.8438 | −0.0078 |

Monotonic in both predicted and empirical. Two honest observations:

1. **The ladder saturates.** STRONG → EXTREME moves the estimate by only 0.012
   despite a fifth player being downgraded. The engine does not extend past
   ~0.85 for this construction, so behaviour above 0.9 is **unmeasured**, which
   is also why the 0.9–1.0 reliability bin is empty.
2. **Monotonicity is sample-size dependent.** At 64 validation games per rung the
   empirical ordering breaks. It holds at 256. Any future claim of monotonicity
   must state the sample size it was established at.

## Balanced versus higher-OVR poor fit

| | |
|---|---|
| Balanced | Chris Paul, Kawhi Leonard, Jimmy Butler, Nikola Jokić, Dwight Howard |
| Creator-heavy | James Harden, Russell Westbrook, LeBron James, Kevin Durant, Giannis Antetokounmpo |

Predicted for the balanced side **0.4863** (CI 0.4433–0.5296); empirical
**0.4860** over 1,000 independent games. Agreement to 0.0003.

Substantively, a balanced lineup of individually lesser players holds five
ball-dominant superstars to a coin flip. That is the locked calibration doctrine
behaving as specified — roster construction determines performance relative to
the era environment, and stacking five players who each need the ball is a
construction cost. It is a statement about this engine's values, not a
historical claim.

## What this validation does not establish

- **Calibration outside 0.2–0.8.** Single-cell bins at the extremes; nothing
  above 0.85 at all.
- **Historical accuracy.** Every cell is synthetic and every game is engine
  output. This measures the estimator against the engine, not the engine
  against basketball.
- **Anything about a calibrated engine.** These estimates sample an engine whose
  53 parameters are all at defaults. `possessionCalibrationVersion` is `null`.
- **Stability across versions.** All 30 cells share one parameter-set hash.
