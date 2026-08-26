# Parameter identifiability v2

**State: MEASURED with a valid methodology. 2 identifiable, and neither is calibratable.**

`parameterIdentifiabilityVersion 2.0.0` · policy hash `04c4b45bf1752ce0` ·
[`.cache/calibration/identifiability-v2.json`](../../.cache/calibration/identifiability-v2.json)

6 fixtures × 256 paired seeds × 4 interior perturbations + both range endpoints,
per parameter. No holdout fixture.

## Why v1 was retired

v1 tested `max|t|` across ~32 metrics against a threshold of **2.0**. That
statistic's own null has a median near 2.42 and a Bonferroni critical value near
3.16 — the threshold sat **below** what noise typically produces. v1's counts
(15/30/6/2) are preserved as historical evidence and were not used here.

## Results

| Category | Count |
|---|---|
| `NO_MEASURABLE_EFFECT` | 37 |
| `CONFOUNDED` | 7 |
| `UNSUPPORTED_BY_TARGET_DATA` | 7 |
| **`IDENTIFIABLE`** | **2** |
| **Total** | **53** |

Empirical null of pooled \|t\| on out-of-family metrics: 1,396 samples, median
0.84, p90 2.24, p95 3.00, p99 10.62. Response-matrix approximate condition
number **3.83** against a cap of 1000.

### The two identifiable parameters

| Parameter | Peak metric | pooled t | Support |
|---|---|---|---|
| `coach.adjustmentMagnitude` | `spotUpShare` | 20.9 | `STRUCTURAL_VALIDATION_ONLY` |
| `zone.cornerVulnerability` | `threePar` | 6.4 | `STRUCTURAL_VALIDATION_ONLY` |

Both are identifiable and **neither has a numeric target to fit against**. They
are checkable for structural sanity only, so both remain at their defaults.

### The 16 parameters with a real effect

16 of 53 clear both family-wise significance and their practical threshold at the
full range. Every one of them is then either confounded or unsupported:

| Parameter | Metric | Full-range effect | Threshold | Blocked by |
|---|---|---|---|---|
| `shotLocation.rimWeight` | rimShare | 0.081 | 0.01 | confounded |
| `shotLocation.midrangeWeight` | midShare | 0.076 | 0.01 | no target |
| `shotLocation.postWeight` | paintShare | 0.062 | 0.01 | no target |
| `conversion.rimBonus` | rimMakeRate | 0.111 | 0.005 | no target |
| `conversion.paintBonus` | paintMakeRate | 0.106 | 0.005 | no target |
| `conversion.midrangePenalty` | midMakeRate | 0.081 | 0.005 | no target |
| `era.freeThrowTripRate` | ftr | 0.192 | 0.01 | no target |
| `era.paceTempoScale` | pace | 1.109 | 0.5 | no target |
| `coach.offensiveAdjustmentCooldown` | adjustments | 4.366 | 0.25 | confounded |
| `coach.offensiveAdjustmentMinEvents` | adjustments | 3.559 | 0.25 | confounded |
| `shotLocation.rimBiasMultiplier` | rimShare | 0.042 | 0.01 | confounded |
| `coach.actionMixInfluence` | pnrShare | 0.039 | 0.01 | confounded |
| `coach.rosterSensitivity` | pnrShare | 0.031 | 0.01 | confounded |
| `shotLocation.perimeterBiasMultiplier` | threePar | 0.024 | 0.01 | confounded |
| `zone.cornerVulnerability` | threePar | 0.018 | 0.01 | structural only |
| `coach.adjustmentMagnitude` | spotUpShare | 0.011 | 0.01 | structural only |

**This is the finding of the phase.** The engine's measurable knobs are exactly
the ones with no authorized target, and the parameters with authorized targets
have no measurable effect. Not a threshold artefact — a data problem, confirmed
now with a valid method.

## The 37 with no measurable effect

Almost all are opportunity-allocation parameters and action-family fit bands.
They fail on **practical effect**, not on significance: 20 are statistically
significant on a primary metric and still move it less than the declared
basketball-relevant amount across their entire declared range.

Verified independently at the extremes. `opportunity.saturation.strength` — the
parameter whose stated purpose is controlling usage concentration — moves the
leading player's FGA share by **0.006 across its full 0.6→2.5 range**, against a
threshold of 0.010. A knob that shifts concentration by six tenths of a
percentage point across a fourfold change in its own value cannot govern
concentration.

That call is close enough to state the margin: halving the share thresholds from
0.010 to 0.005 would promote several of these. **The thresholds were not
lowered.** They were declared before any v2 result existed, and moving them now
to enlarge the tunable set is exactly the move the policy forbids.

## Three corrections to this analysis, all mine

Each changed the answer, and each was found by checking rather than by trusting
the pipeline.

**1. The null model was degenerate.** The frozen policy first declared an A/A
null — identical parameter sets on disjoint seed blocks. On a deterministic
engine that gives a paired difference of exactly zero with zero variance, so the
t-statistic is 0/0. Corrected before any result to an out-of-family empirical
null. The noise here is chaotic, not sampling: a small parameter change perturbs
RNG consumption and cascades, and the mean of those differences tends to zero
only for metrics the parameter does not systematically move.

**2. Practical effect was measured at the wrong dose.** The first implementation
compared a pooled mean *across perturbation magnitudes* to the threshold — an
average of a 10%-of-range dose and a 25% dose, which is neither. It reported
**0 identifiable**, with `era.paceTempoScale` at 0.28 against a 0.5 threshold. At
the full range that parameter moves pace by **1.11**. Both endpoints are now
measured, and the gate asks the non-circular question: *can this parameter matter
across its whole declared range?* Asking at a movement cap would be circular,
since the cap is decided by this gate.

**3. Confounding was measured on the wrong basis.** The first implementation used
each parameter's own primary family, padded with zeros. That measures family
*membership*: two parameters declared against the same three metrics get
near-parallel sparse vectors by construction. It reported **42** pairs, 14 of them
sharing an identical declared family. On the full 32-metric basis the answer is
**7**, and every one is mechanically explicable.

A fourth, smaller: the classifier routed `STRUCTURAL_VALIDATION_ONLY` support
through the `UNSUPPORTED_BY_TARGET_DATA` branch, collapsing "only structural
checks apply" into "nothing can judge it". Fixing it moved two parameters into
`IDENTIFIABLE` — the only two in that category.

## Method detail

- **Significance:** Holm–Bonferroni at α = 0.05 over the declared primary family
  (1–4 metrics), on interior perturbations only. Endpoints are excluded from the
  significance pooling so the largest dose cannot dominate the inverse-variance
  weighting.
- **Practical effect:** unweighted endpoint effect, compared to the per-metric
  declared threshold.
- **Direction stability:** sign agreement across interior fixture × perturbation
  cells; `IDENTIFIABLE` requires ≥ 0.75.
- **Guardrails:** a parameter breaching a guardrail by more than 2× its practical
  threshold is demoted — it reaches a domain it should not.
- **Secondary metrics:** reported as corroboration, never part of the decision.
