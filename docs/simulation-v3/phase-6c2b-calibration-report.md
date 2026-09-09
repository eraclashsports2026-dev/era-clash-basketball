# Phase 6C2B calibration report

**Status: `possessionCalibrationVersion` = `null` / PLANNED — NOT LOCKED.**

**Broad parameter calibration did not proceed.** The Part 18 gate failed, for
reasons that are structural rather than a matter of effort, and the phase
correctly stopped at that gate.

---

## The gate

```
── PART 18 TUNING GATE: FAILED ──
  ✗ corpus has 10 historical fixtures, target is 24
  ✗ corpus covers 4 of 8 Era Styles
  ✗ Tier B (derived advanced targets) coverage is zero
  ✗ corpus spans 3 franchises (Boston Celtics, Los Angeles Lakers,
    Detroit Pistons), which cannot support tuning that generalises
```

An independent second confirmation came from the fold builder: with 7
calibration fixtures split three ways, **the smallest fold holds one fixture**.
A validation error over one team moves on noise, so cross-validation could not
have detected overfitting even if tuning had proceeded.

## Why the corpus cannot be larger

**64 candidate team-seasons were scanned** across all eight eras — champions,
pace extremes, defensive teams, shooting teams, non-champions. Only **14** could
field a legal five from carded players, collapsing to **10** once identical
fives and unverifiable coaches were removed.

The cause is structural. The pool is 381 all-time greats across 30 franchises
and 75 seasons — roughly 48 cards per decade against 30 teams. A real starting
five contains role players who are not all-time greats, so intact fives survive
only where a dynasty happens to be densely carded:

| Team-season | Carded | Blocker |
| --- | --- | --- |
| 1997-98 Bulls | 5 | **no point guard** — Ron Harper has no card |
| 2004-05 Suns | 4 | no centre |
| 2019-20 Lakers | 4 | the apparent fifth was a false name match |

**1950s, 1990s, 2010s and 2020s yield zero eligible fixtures.**

This is not fixable by more research. It is fixable only by adding cards, which
is a product decision.

## What was delivered

| Workstream | Status |
| --- | --- |
| 0 · Baseline verification | **complete** — no discrepancies; 15 artefacts hash-pinned |
| 1 · Fixture reclassification | **complete** — all 26 classified, 18 labels corrected |
| 2 · Historical corpus v2 | **complete within evidence** — 10 verified fixtures |
| 3 · Source-valid holdouts | **complete** — both created, frozen, sealed unread |
| 4 · Target coverage | **complete** — gate formally evaluated and failed |
| 5 · Parameter registry | **complete** — 53 parameters, 6 modules, objective and folds |
| 6–10 · Parameter calibration | **not attempted** — gate failed |
| 11 · Probability validation | **complete** — and it found a serious defect |
| 12 · Lock | **NOT LOCKED** |

## The probability finding

Workstream 11 needed no historical targets, so it ran — and produced the
phase's most significant engineering result.

**The pregame expectation does not predict match outcomes.** Over 40 same-era
cells at 800 seeds each:

```
realized margin = 0.567 × expected margin − 0.546      R² = 0.035
```

At the extremes it inverts the sign: an expected margin of −3.13 produced a
realized **+19.6**, and +3.13 produced **−20.1**.

Reliability over 4,200 predictions gives Brier **0.2507** — the no-skill
baseline — with sharpness **0.061** and predictions never leaving 0.394–0.606.
It is calibrated only in the sense that always saying 50% is calibrated.

**The engine itself is sound on this axis.** The strength ladder is monotonic in
both predicted and empirical win rate, and a mirror matchup predicts exactly
0.500 and wins 0.521. The engine ranks teams correctly; the expectation module
cannot express how large the gaps are.

## Corpus and holdout state

| Set | Version | Fixtures | Hash | State |
| --- | --- | --- | --- | --- |
| Historical calibration v2 | 2.0.0 | 7 | `86791fab9d12ff8e` | in use |
| Historical holdout v2 | 2.0.0 | 3 | `16c2d1e3b7f35fae` | **SEALED_UNREAD**, access 0 |
| Synthetic stress v1 | 1.0.0 | 25 | `1132a36d145f772e` | **SEALED_UNREAD**, access 0 |
| Legacy holdout v1 | 1.0.0 | 7 | `cb863d5de2734f74` | **SEALED_UNREAD**, access 0, preserved unchanged |

No engine comparison was run against any holdout.

## Target coverage

| | Calibration (7) | Holdout (3) |
| --- | --- | --- |
| Tier A | 21 fields | 9 fields |
| **Tier B** | **0** | **0** |
| Tier C | 15 share maps / 5 fixtures | 6 / 2 |
| Tier D | 35 notes | 15 notes |
| Source-blocked | 169 fields | 81 fields |

Tier B is zero because no authorized source supplies the totals those metrics
derive from. Basketball-Reference is **prohibited for model calibration** by its
own terms and was not used.

## Why nothing was tuned

Tuning 53 parameters against 7 fixtures from two franchises across three eras
would have produced a model fitted to the Celtics and the Lakers, with no way to
detect that it had happened. Every parameter therefore sits at its default, the
regularisation penalty is exactly **0**, and the change history is empty.

That is the correct outcome, not a shortfall of effort.
