# Phase 6C2C3 — limitations

Read this before quoting any Phase 6C2C3 number.

## What this phase actually achieved

The internal blocker is gone. The calibration registry is authoritative for the
development engine: **53 of 53 active parameters reach it**, the default set
reproduces the pre-wiring engine **exactly** across 32 fixtures including RNG
step counts, and sensitivity/identifiability/confounding analysis is answerable
for the first time.

That is a real and complete piece of work. It is also plumbing. **Nothing was
calibrated.** `possessionCalibrationVersion` remains `null`.

## The word "calibrated" does not apply to anything here

Every parameter sits at its default. The engine behaves identically to the
pre-wiring engine — that identity is the phase's success criterion, not a
limitation of it. What changed is that the coefficients are now *reachable*.

## Only one parameter is ready for historical calibration

| Tier | Count |
|---|---|
| `READY_FOR_HISTORICAL_CALIBRATION` | **1** |
| `READY_FOR_STRONGLY_REGULARIZED_CALIBRATION` | 24 |
| `READY_FOR_STRUCTURAL_CALIBRATION_ONLY` | 13 |
| `BLOCKED_BY_CONFOUNDING` | 6 |
| `BLOCKED_BY_DATA` | 13 |
| `BLOCKED_BY_NO_EFFECT` | 2 |

Phase 6C2C4's historical scope is **one parameter**. Presenting 53 wired
parameters as 53 calibratable ones would be the central dishonesty available here.

## The weak tier is probably mostly noise

The identifiability statistic is max|t| across 32 metrics. That maximum has an
inflated null: the median under the null is **≈2.42** and the Bonferroni critical
value is **≈3.16**, against a frozen policy threshold of **2.00**.

**The frozen threshold sits below the null median.** Consequently:

- 28 of 30 `WEAKLY_IDENTIFIABLE` parameters do **not** clear the adjusted value
- 18 of 30 have direction consistency below 0.6

The threshold was **not moved** — that would be post-hoc adjustment. But the
category label overstates the evidence, and the defensible count of genuinely
fittable parameters is **14**, not 45. A sampling-multiplicity-aware threshold is
a Phase 6C2C4 policy decision.

This is the same class of error as the Phase 6C2C1 side-bias threshold: a
threshold frozen without accounting for the statistics it would be applied to.
Freezing before results is necessary and not sufficient.

## Three genuine confoundings remain

`shotLocation.rimWeight` ~ `rimBiasMultiplier`; `coach.actionMixInfluence` ~
`rosterSensitivity`; `coach.offensiveAdjustmentMinEvents` ~
`offensiveAdjustmentCooldown`. None may be tuned jointly.

The coach action-mix pair may be **one parameter wearing two names** — both scale
terms of the same six family weights. That should be settled before either is
fitted.

## Confounding was measured pairwise, not by rank

The frozen policy caps the sensitivity matrix condition number at 1000. **That
number was not computed.** Pairwise cosine similarity was, which is a weaker
statement about the whole matrix than a rank or singular-value analysis would be.
A cluster of three or more parameters that are jointly collinear without any pair
exceeding 0.90 would not be detected by what was run.

## Two guard rails are connected but never bind

`era.paceBoundFraction` and `era.threeAnchorMax` clamp inputs the fixture corpus
never approaches — unclamped pace lands inside its band, and the three-point odds
ratio runs 1.1–2.1 against a clamp at 12. They are real wiring against extreme
inputs, and they are unmeasurable on this corpus. Neither can be calibrated
without fixtures that reach them.

## Corrections to my own work in this phase

Four, and each mattered:

- **Four sensitivity metrics were permanently zero.** The response vector read
  `p.shot.location`, but the ledger stores `shot` as the location *string*. This
  forced shot-location and conversion parameters onto indirect proxies and
  manufactured **six spurious confoundings** — reported as 9 pairs when the real
  number is 3. The parity baseline's `locationMix` was empty for the same reason
  and compared equal trivially.
- **The `zone-2010s` parity fixture contained no zone.** steve-kerr and
  thibodeau never reach the zone gate, so it was byte-identical to `man-2010s`.
  Only four coaches in the pool do.
- **Two "overtime" fixtures contained no overtime.** Round-number seeds, both OT0.
- **The connectivity check reported `families.js` as unwired** because it grepped
  for an import rather than for the accessor read.

Each was found by measuring rather than by assuming, and each is now guarded by an
assertion. But the pattern is consistent enough to state plainly: **my first
instinct is to assert coverage rather than verify it**, and four instances in one
phase is a rate, not an accident.

## Registry corrections were not tuning — but they did change five values

Five declared defaults were wrong and now match the running engine (cooldown
12→30/34, threshold 3→6/5, magnitude 0.05→0.06). This preserved parity rather
than breaking it, and the runtime is the truth about current behaviour.

It should still be said that **the registry that Phases 6C2B, 6C2C1 and 6C2C2
reported against contained five wrong values**, and any statement those phases
made about those parameters described numbers the engine never used. The v1
snapshot and hash are preserved so those reports remain attributable.

## What remains blocked, and by what

| Blocker | Status | Needs |
|---|---|---|
| Parameter wiring | **RESOLVED** | — |
| Tier B coverage (2 of 384) | blocked | a purchased licence; 82 fields permanently unobtainable |
| Independent second source (0 of 8 holdouts verified) | blocked | a purchase or a written grant |
| `eras.js` provenance | blocked | legal review; already in production |
| Wikipedia upstream provenance | blocked | legal review |

## What this phase does not claim

Not calibrated, not historically supported beyond one parameter, not validated
against any holdout. No formal holdout was opened — all five seal access counts
remain 0. No preview, no production change. `main` untouched at `9cd95ff`.
Production engine 3.2.0 is unmodified and remains the fallback.
