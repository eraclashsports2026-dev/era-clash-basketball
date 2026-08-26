# Parameter confounding groups

**State: MEASURED. 3 confounded pairs among 53 active parameters.**

Method: each parameter's response **signature** is its signed t-statistic across
all 32 metrics at its widest perturbation, oriented toward increasing parameter
value so a parameter measured on its downside is comparable with one measured on
its upside. Two signatures with |cosine| ≥ 0.90 cannot be separated by this
corpus.

## Confounded pairs

| A | B | cosine | Why |
|---|---|---|---|
| `shotLocation.rimWeight` | `shotLocation.rimBiasMultiplier` | **0.959** | Both inflate rim share — one through the shooter's profile, one through the action's rim bias. Their effects on the shot mix are collinear. |
| `coach.actionMixInfluence` | `coach.rosterSensitivity` | **0.968** | Both scale terms of the *same six* family weights — one the coach-preference addend, one the roster-response addend. Exactly as predicted before wiring. |
| `coach.offensiveAdjustmentMinEvents` | `coach.offensiveAdjustmentCooldown` | **0.941** | Both gate how often an offensive adjustment may fire. Raising either lowers adjustment frequency; the corpus cannot say which gate did it. |

## Six confoundings that were artefacts of a bug in this instrument

An earlier run reported **9** pairs, including all three conversion parameters
mutually confounded (`rimBonus` ~ `paintBonus` ~ `midrangePenalty`, cosines
0.95–0.97) and three shot-location weights.

Those were not real. The response vector read `p.shot.location`, but the ledger
stores `shot` as the location **string** — so `rimShare`, `paintShare`,
`midShare` and `threeShare` were permanently zero. With their direct metrics
dead, all three conversion parameters peaked on team `fgPct`, which made three
genuinely separable coefficients look parallel.

With the extraction fixed and per-location conversion rates added, each separates
cleanly on its own metric:

| Parameter | Peak metric | SNR |
|---|---|---|
| `conversion.rimBonus` | `rimMakeRate` | 37.4 |
| `conversion.midrangePenalty` | `midMakeRate` | 26.7 |
| `conversion.paintBonus` | `paintMakeRate` | 26.5 |
| `shotLocation.midrangeWeight` | `midShare` | 66.4 |
| `shotLocation.postWeight` | `paintShare` | 56.9 |

**A confounding measured on the wrong metrics is a property of the measurement,
not of the model.** Six of nine reported pairs disappeared once the parameters
were measured on the quantities they actually set.

## Recommended future tuning policy

- **Never tune a confounded pair jointly.** Fit one, hold the other at its
  default, and record which was chosen and why.
- `rimWeight` / `rimBiasMultiplier`: prefer `rimWeight`. It is the shooter-profile
  coefficient and has the cleaner basketball meaning; the bias multiplier is an
  action-level modifier on top of it.
- `actionMixInfluence` / `rosterSensitivity`: these are arguably one parameter
  wearing two names, since both scale the same six weights. A future phase should
  decide whether the distinction is real before tuning either. If it is real,
  separating them needs a fixture where coach preference and roster quality point
  in *opposite* directions.
- `offensiveAdjustmentMinEvents` / `offensiveAdjustmentCooldown`: prefer the
  cooldown. Its runtime value (30) has a recorded empirical justification —
  `liveState.js` documents that 12 produced ~3.3 assignment changes a game,
  "which is not how coaches behave" — so it is the one already anchored to
  observed behaviour.

## Matrix conditioning

The frozen policy caps the sensitivity matrix condition number at 1000. With
three confounded pairs out of 1,378 possible pairings, and 15 parameters clearing
the multiplicity-adjusted critical value on distinct metrics, the response matrix
is far better conditioned than the 6C2C2 expectation — but note that condition
number was **not** computed directly here. Pairwise cosine was, which is a weaker
statement about the whole matrix than a rank analysis would be. That gap is
recorded rather than papered over.
