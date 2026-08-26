# Probability revalidation after the side-symmetry fix

**State: MEASURED. Gate holds. Calibration slightly improved.**

The Workstream 1 fix is result-affecting — it added a seeded draw and shifted the
RNG stream — so every probability figure from Phase 6C2C1 had to be
re-established rather than carried forward.

Estimates on **prediction** seeds, measured on **probability-validation** seeds.
Disjoint, and both disjoint from actual-game seeds. 30 cells, `STANDARD`
estimates, 256 independent validation games each.

## Outcome scale — the only scale comparable to 0.2507

| Metric | Pre-fix (6C2C1) | Post-fix |
|---|---|---|
| Monte Carlo Brier | 0.2195 | 0.2209 |
| Irreducible floor | 0.2177 | 0.2192 |
| Constant-0.5 baseline | 0.2500 | 0.2500 |
| 6C2B analytical baseline | 0.2507 | 0.2507 |
| **Fraction of achievable skill** | 0.9443 | **0.9458** |
| Analytical model's share of achievable skill | −0.0217 | **−0.0227** |
| Monte Carlo log loss | 0.6277 | 0.6306 |

Raw Brier moved by 0.0014, and the floor moved by 0.0015 in the same direction —
the engine's game-to-game randomness shifted slightly, and the estimator tracked
it. The informative number is the share of *achievable* skill, which rose.

The 6C2B analytical model remains at **negative** achievable skill: marginally
worse than a constant 0.5, from a second independent measurement.

## Calibration

| Metric | Pre-fix | Post-fix |
|---|---|---|
| Expected calibration error | 0.0186 | **0.0145** |
| Maximum calibration error | 0.0469 | **0.0312** |
| Sharpness | 0.1914 | 0.1836 |
| Upset rate | 0.033 | 0.100 |
| Favourite win rate | 0.967 | 0.963 |

Both calibration errors improved. That is a plausible consequence of the fix
rather than a coincidence: removing a systematic overtime advantage removes a
source of divergence between prediction and outcome in exactly the close games
that dominate the middle reliability bins.

The 0.9–1.0 bin is still empty and the 0–0.1 bin still holds one cell, so
**calibration at the extremes remains unestablished** — unchanged from 6C2C1.

## Mirror and strength ladder

Mirror returns **exactly 0.5000**, predicted and empirical.

| Rung | Predicted | 95% CI | Empirical |
|---|---|---|---|
| MIRROR | 0.5000 | 0.4392–0.5608 | 0.5000 |
| SLIGHT_FAVORITE | 0.5039 | 0.4431–0.5646 | 0.6055 |
| MODERATE_FAVORITE | 0.6445 | 0.5842–0.7006 | 0.6523 |
| STRONG_FAVORITE | 0.8086 | 0.7560–0.8521 | 0.7969 |
| EXTREME_FAVORITE | 0.8672 | 0.8201–0.9034 | 0.8828 |

Monotonic in both predicted and empirical. Two honest notes:

- **SLIGHT_FAVORITE has the worst miss of any rung** (+0.1016). At 256 validation
  games the standard error is 3.1pp, so a 10pp gap is ~3.3 SE and is not
  comfortably noise. The rung is also the one where predicted and empirical
  disagree about whether the matchup is even close to even. It is recorded, not
  explained.
- The ladder no longer saturates as early: EXTREME reaches 0.8672 against 0.8516
  before, and STRONG→EXTREME now moves 0.059 rather than 0.012.

## Balanced versus higher-OVR poor fit

| | |
|---|---|
| Balanced | Chris Paul, Kawhi Leonard, Jimmy Butler, Nikola Jokić, Dwight Howard |
| Creator-heavy | James Harden, Russell Westbrook, LeBron James, Kevin Durant, Giannis Antetokounmpo |

Predicted 0.4609 (CI 0.4182–0.5042); empirical **0.4660** over 1,000 independent
games. Agreement to 0.005, and the balanced side still holds five ball-dominant
superstars to near-even. Consistent with the locked calibration doctrine, and a
statement about this engine's values rather than a historical claim.

## The frozen per-cell side-bias threshold still fails

Max per-cell raw side bias **0.0781** against the frozen 0.05. **The threshold
was not moved.**

This is the probability estimator's *internal* diagnostic — the raw gold
orientation rate before pairing removes it — measured on 256-game samples, where
the standard error is 3.13pp. 0.0781 is 2.5 SE. The systematic test passes
clearly: mean across cells −0.0064 ± 0.0049, t = −1.29.

It is worth being explicit that this is **not** in tension with Workstream 1
passing. Two different measurements:

| | Actual-game symmetry (WS1) | Probability per-cell diagnostic |
|---|---|---|
| Sample | 240,000 games | 256 games per cell |
| Standard error | 0.10pp | 3.13pp |
| Result | **PASS** | threshold exceeded on one cell |

The engine's side symmetry is now measured and sound at high power. A 256-game
per-cell diagnostic judged against a threshold set without sampling-error
awareness will keep exceeding it, and that is a property of the threshold. Fixing
it requires a policy version bump with a justification independent of the result —
which is a Phase 6C2C3 decision, not something to do after seeing the number.

## Gate

| Check | Result |
|---|---|
| Beats analytical baseline (outcome scale) | PASS |
| Beats constant-0.5 (outcome scale) | PASS |
| Within irreducible floor + 0.01 | PASS |
| Captures ≥ 75% of achievable skill | PASS (0.946) |
| Expected calibration error ≤ 0.10 | PASS (0.0145) |
| Mirror within ±0.03 of 0.5 | PASS (exact) |
| Strength ladder monotonic | PASS |
| Side bias not systematic | PASS |
| Sharpness reported | PASS |
| Prediction ∩ validation ∩ actual-game seeds | PASS (∅) |
| Fingerprint replay exact | PASS |
| Per-cell raw side bias ≤ 0.05 | **FAIL — threshold, not moved** |

## What this does not establish

Every cell is synthetic and every outcome is engine output. This measures the
estimator against the engine, not the engine against basketball. And the engine
it samples remains **uncalibrated** — `possessionCalibrationVersion` is `null`,
all 53 parameters are at defaults, and none of them is even connected to the
engine (see `parameter-identifiability.md`).
