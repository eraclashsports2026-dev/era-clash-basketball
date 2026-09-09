# Parameter identifiability after wiring

**State: MEASURED — for the first time. Phase 6C2C2 could not run this analysis at all.**

`parameterIdentifiabilityVersion 1.0.0` ·
`parameterSensitivitySeedSetVersion 1.0.0` ·
[`.cache/calibration/parameter-sensitivity.json`](../../.cache/calibration/parameter-sensitivity.json)

6 fixtures × 256 paired seeds × 4 perturbations × 32 metrics, plus a
1,024-seed confirmation pass for borderline cases. No holdout fixture is used.

## Why this is now answerable

In Phase 6C2C2 every parameter would have measured at a signal-to-noise ratio of
exactly zero — not because the coefficients do not matter, but because none of
them reached the engine. Filing 53 `NO_MEASURABLE_EFFECT` verdicts on a wiring
bug would have retired the entire registry on the strength of broken plumbing.

## Method

Paired seeds. For each (fixture, seed) the baseline is computed **once** and
reused across every perturbation, so the per-seed difference carries no seed
noise. Significance is a paired t-statistic over per-game differences — the
variance that matters in a paired design is the variance of the *difference*, not
of either level. A t-statistic **is** an effect measured in units of its own
noise, so it is the signal-to-noise ratio directly.

## Frozen-policy classification

| Category | Count |
|---|---|
| `WEAKLY_IDENTIFIABLE` | 30 |
| **`IDENTIFIABLE`** | **15** |
| `CONFOUNDED` | 6 |
| `NO_MEASURABLE_EFFECT` | 2 |
| **Total** | **53** |

## The caveat that matters more than the table

The classifier's statistic is **max|t| across all 32 metrics**, and a maximum
over many metrics has an inflated null distribution.

| | |
|---|---|
| Metrics | 32 |
| Null *median* of max\|t\| | **≈ 2.42** |
| Bonferroni critical value (α = 0.05) | **≈ 3.16** |
| **Frozen policy threshold** | **2.00** |

**The frozen threshold sits below the null median.** A parameter reading 2.0–2.42
across 32 metrics is producing *less* than noise typically produces. The frozen
policy was set without accounting for metric multiplicity — the same class of
error as the Phase 6C2C1 side-bias threshold, and recorded here for the same
reason.

**The threshold was not moved.** Moving it after seeing the result is the
post-hoc adjustment this discipline exists to prevent. The adjusted view is
reported alongside:

| | Frozen categories | Clearing the adjusted critical value |
|---|---|---|
| `IDENTIFIABLE` | 15 | **14** |
| `CONFOUNDED` | 6 | 6 |
| `WEAKLY_IDENTIFIABLE` | 30 | **2** |
| Total clearing 3.16 | — | **22 of 53** |

**28 of the 30 weakly-identifiable parameters do not clear it**, and 18 of the 30
have direction consistency below 0.6 — their peak metric moves inconsistently
across perturbations of the same sign. Read honestly, most of the weak tier is
not distinguishable from noise on this corpus.

## The defensible picture

| Tier | Count | Meaning |
|---|---|---|
| Measurable, distinct, clears multiplicity | **14** | genuinely fittable |
| Measurable, clears multiplicity, **confounded** | 6 | real but not separable |
| Weak, clears multiplicity, inconsistent direction | 2 | real, needs regularization |
| Weak, below multiplicity threshold | 28 | probably noise on this corpus |
| Inactive guard rails | 2 | connected, never binding |

The 14 clean parameters:

| Parameter | Peak metric | SNR |
|---|---|---|
| `shotLocation.midrangeWeight` | `midShare` | 66.4 |
| `shotLocation.postWeight` | `paintShare` | 56.9 |
| `era.freeThrowTripRate` | `ftr` | 45.6 |
| `conversion.rimBonus` | `rimMakeRate` | 37.4 |
| `conversion.midrangePenalty` | `midMakeRate` | 26.7 |
| `conversion.paintBonus` | `paintMakeRate` | 26.5 |
| `shotLocation.perimeterBiasMultiplier` | `threeShare` | 22.8 |
| `coach.adjustmentMagnitude` | `spotUpShare` | 20.0 |
| `era.paceTempoScale` | `pace` | 11.8 |
| `shotLocation.threeWeight` | `threeShare` | 7.8 |
| `zone.cornerVulnerability` | `threePar` | 6.3 |
| `opportunity.saturation.underTargetCeiling` | `usageEntropy` | 3.5 |
| `fitBand.GENERIC_HALF_COURT.hi` | `leadingFgaShare` | 3.5 |
| `fitBand.GENERIC_HALF_COURT.lo` | `leadingFgaShare` | 3.3 |

Every one peaks on the metric it is *supposed* to move, with direction
consistency 1.0. That coherence is itself evidence the wiring is correct.

## The two with no measurable effect are inactive guard rails, not dead knobs

Both were investigated before being classified, as the policy requires.

**`era.paceBoundFraction`** — the clamp never binds. Unclamped pace lands at
96.5–98.5 inside an 82.4–109.2 band, so no coach tempo in the pool comes near it.

**`era.threeAnchorMax`** — likewise. The three-point odds ratio runs 1.12–2.12
against a clamp at 12; even perturbed down to 5 it never engages.

Both are *connected* — pushed to a bound they move a result somewhere in the
32-fixture corpus — and both are guard rails against extreme inputs the corpus
does not contain. That is a different finding from "this coefficient does
nothing", and the distinction is the whole point of investigating before
classifying.

## Threshold confirmation caught two misclassifications

Two parameters landed just under the frozen threshold at 256 seeds and crossed it
at 1,024:

| Parameter | SNR @256 | SNR @1024 | Category change |
|---|---|---|---|
| `fitBand.ZONE_ATTACK.hi` | 1.899 | **2.92** | `NO_MEASURABLE_EFFECT` → `WEAKLY_IDENTIFIABLE` |
| `fitBand.ISOLATION.lo` | 1.998 | **2.48** | `NO_MEASURABLE_EFFECT` → `WEAKLY_IDENTIFIABLE` |

Escalation is automatic for borderline cases and skipped for parameters at
exactly zero, where there is no signal to resolve.

## Two coverage findings

**`opportunity.mismatch.moderate` measured at exactly zero on a narrower corpus.**
A MODERATE mismatch is exploited in **1 of 32** fixtures. With three sensitivity
fixtures it never fired, and the honest-looking verdict would have been
`NO_MEASURABLE_EFFECT` — the disconnected-registry error repeated as a coverage
error. The corpus was widened to six fixtures including the one that reaches it,
and it now measures 2.85.

**Four metrics were permanently zero.** The response vector read
`p.shot.location`, but the ledger stores `shot` as the location *string*. Every
shot-location metric was dead, which forced shot-location and conversion
parameters onto indirect proxies and manufactured **six spurious confoundings**.
Fixed, with per-location conversion rates added; confounded pairs fell from 9 to
3 and identifiable parameters rose from 10 to 15.

## Per-parameter detail

Full records — category, runtime consumer, dynamic invocation count, default,
bounds, per-metric mean/sd/se/t at every perturbation, confounding group,
direction consistency, multiplicity-adjusted verdict — are in the JSON artefact.

## What this does not establish

Nothing about historical accuracy. Sensitivity says a knob turns and by how much
relative to noise; it says nothing about whether the current value is right.
Only **1** of these 53 parameters has authorized historical data able to judge
that — see [`calibration-support-matrix-v2.md`](calibration-support-matrix-v2.md).
