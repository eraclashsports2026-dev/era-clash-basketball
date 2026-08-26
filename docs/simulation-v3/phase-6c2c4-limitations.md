# Phase 6C2C4 — limitations

## What this phase delivered

A **valid identifiability methodology**, a **reconciled calibration scope**, and a
clear answer to the question the phase existed to ask.

The answer is that **no parameter can be calibrated**, and the reason is data, not
method.

## What it did not deliver

No calibration. `possessionCalibrationVersion` is `null`, status `NOT_LOCKED`.
Every parameter sits at its default, every `changeHistory` is empty, the default
parameter hash is unchanged, and 32 of 32 parity fixtures remain byte-identical.

**Workstreams 5 through 10 were not run.** Opportunity, shot location, conversion
and events, era, zone and coach had **zero eligible parameters between them**.
Running a search over an empty scope would have produced a candidate identical to
the defaults and six domain reports implying work that did not happen.

## The binding constraint

16 of 53 parameters clear both family-wise significance and their practical
threshold across their full declared range. Every one is then blocked:

| Blocker | Count | Includes |
|---|---|---|
| Confounded with a partner | 7 | `offensiveAdjustmentCooldown` (4.37 adjustments/game effect) |
| No authorized target | 7 | `era.paceTempoScale` (1.11 possessions), `conversion.rimBonus` (0.111 rim conversion) |
| Structural support only | 2 | `coach.adjustmentMagnitude`, `zone.cornerVulnerability` |

**The engine's measurable knobs are exactly the ones nothing can judge.** The one
parameter that had authorized historical support — `opportunity.saturation.strength`
— has no measurable effect: it moves the leading player's FGA share by **0.006
across its full 0.6→2.5 range**, against a 0.010 threshold.

## Where I could be wrong

**The practical-effect thresholds.** Halving the share thresholds from 0.010 to
0.005 would promote several of the 37 no-effect parameters into eligibility. They
were declared before any v2 result existed and were **not** lowered afterward,
which is the correct discipline — but a reader should know the margin is that
close, and that a future phase could legitimately revisit them *before* running.

**Condition number is an approximation.** Computed by power iteration for the
largest eigenvalue of AᵀA with the remaining eigenvalues summarised by trace. A
full singular-value decomposition would be stronger. 3.83 against a cap of 1000
is not a close call, so the approximation is unlikely to matter here — but it is
an approximation and is labelled as one.

**The out-of-family null is contaminated.** It is built from metrics each
parameter should not move, but some parameters legitimately do move metrics
outside their declared family. That inflates the null, which is conservative —
the safe direction — but it is not a clean null. Its p99 of 10.62 against a median
of 0.84 shows the contamination directly.

**Only 6 fixtures drive identifiability.** They were chosen to span the mechanics
(pre-three era, real zone, coach contrast, construction contrast, and the one
fixture in 32 where a MODERATE mismatch is exploited). Six is few, and a parameter
whose mechanic none of them reaches would measure as no-effect for a coverage
reason rather than a model reason. That is exactly how
`opportunity.mismatch.moderate` was misclassified in Phase 6C2C3.

## Four corrections to my own analysis this phase

Every one changed the answer. Listed because the pattern matters more than any
single instance.

1. **The frozen null model was degenerate.** An A/A comparison on a deterministic
   engine gives a paired difference of exactly zero — the statistic is 0/0.
   Caught before any result existed.
2. **Practical effect was measured at the wrong dose** — a mean pooled across
   perturbation magnitudes, which is an average of a 10% dose and a 25% dose and
   therefore neither. This alone reported 0 identifiable.
3. **Confounding was measured on the wrong basis** — family-restricted sparse
   signatures measure family membership, not confounding. Reported 42 pairs; the
   real number is 7.
4. **The classifier collapsed structural support into no support**, hiding the
   only two identifiable parameters.

Plus a fold-grouping inconsistency where my grouping key and my leakage check
disagreed, and the check was the stricter of the two.

**Five instances in one phase, following four in the previous one.** The
consistent shape is that my first implementation of a measurement is subtly wrong
in a way that produces a plausible-looking number, and only a targeted check
against ground truth exposes it. The mitigation that actually worked was
validating against direct extreme-value tests rather than trusting the pipeline —
`era.paceTempoScale`'s 2.63-possession full-range span is what revealed the dose
error.

## Inherited limitations, unchanged

- **Tier B coverage is 2 of 384 fields.** 288 licence-blocked, 82 permanently
  unrecordable.
- **No authorized independent second source.** 0 of 8 holdout fixtures verified.
- **`src/v3/data/eras.js` cites the excluded publisher** and is consumed by the
  live production engine. This is why 7 parameters have no usable target.
- **The Wikipedia baseline carries `bbr_team` provenance**, so the derivation
  argument used to exclude that publisher's mirrors applies to our own corpus.

## Claims this phase does not make

Not calibrated. Not historically validated. Not holdout-validated. No candidate
locked. No formal holdout opened — all five seal access counts remain 0. No
preview, no production change. `main` untouched at `9cd95ff`. Production engine
3.2.0 unmodified.
