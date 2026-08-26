# Phase 6C2C4 — frozen scoped-calibration acceptance policy

**Frozen before identifiability v2 was run and before any candidate was searched.**

| | |
|---|---|
| Identifiability policy hash | `04c4b45bf1752ce0` |
| `parameterIdentifiabilityVersion` | 2.0.0 |
| `calibrationReadinessVersion` | 2.0.0 |
| Machine-readable | [`src/v3/calibration/identifiabilityPolicy.js`](../../src/v3/calibration/identifiabilityPolicy.js) |

## Why v1 is retired

v1 tested `max|t|` across ~32 metrics against a threshold of **2.0**. Measured
against its own null, that statistic has a median of ~2.42 and a Bonferroni
critical value of ~3.16 — **the threshold sat below what noise typically
produces.** v1's categories (15/30/6/2) are preserved as historical evidence and
are not used for calibration.

## The four methodological fixes

### 1. Declared metric families

Each parameter is tested against the small set of metrics its documented meaning
predicts it moves. `conversion.midrangePenalty` is judged on `midMakeRate`, not
on all 32 metrics. Testing everything against everything is what created the
multiplicity problem.

All 53 active parameters have a declared family: 1–4 primary metrics, secondary
metrics for corroboration, and guardrails that must **not** move.

### 2. Family-wise control within the family

Holm–Bonferroni at α = 0.05 over the **primary family only**. Secondary metrics
corroborate and guardrails detect regression; neither enters the significance
decision.

### 3. Practical effect size

Significance is necessary and insufficient. Declared minimum basketball-relevant
effects, per metric, in the metric's own units:

| Metric group | Threshold |
|---|---|
| Shot/play shares, three-point rate, FT rate, assist rate | 0.01 (one point) |
| Conversion and efficiency rates, turnover rate, rebound rate | 0.005 |
| Steal/block rates | 0.002 |
| Pace | 0.5 possessions |
| Points, margin | 1.0 |
| Usage entropy | 0.02 |
| Adjustments per game | 0.25 |

A statistically detectable 0.1-point change in three-point rate is real and
irrelevant. Calibrating against it would be fitting significant noise.

### 4. Direction stability

Sign consistency across fixture × perturbation cells. `IDENTIFIABLE` requires
≥ 0.75; `WEAKLY_IDENTIFIABLE` requires ≥ 0.60. An unexplained sign reversal
disqualifies free calibration however large the magnitude.

## Null model — corrected before any result

The first draft of this policy declared *"A/A paired batches, identical parameter
set, disjoint seed blocks."* **That null is degenerate.** The engine is
deterministic, so the same parameter set on the same seed gives a paired
difference of exactly zero with zero variance — the t-statistic is 0/0, not a
distribution.

The noise here is **chaotic, not sampling**: a tiny parameter change perturbs RNG
consumption and cascades, so any single paired game differs substantially even on
a metric the parameter does not systematically affect. Averaged over many paired
games that component tends to zero while a systematic effect persists — which is
what a paired t-statistic measures.

The null is therefore estimated from **out-of-family metrics**: for each
perturbation, the t-statistics on metrics the parameter should not move, pooled
across all parameters. Minimum 500 samples.

This correction was made before any v2 result existed. Correcting a
mathematically degenerate method is not the same act as moving a threshold after
seeing the number it judges.

## Sampling

| | |
|---|---|
| Paired seeds per cell | 256 |
| Near-threshold re-measurement | 1,024 |
| Near-threshold trigger | within 1.5× of the critical value |

## Confounding

Recomputed over v2 primary families. Cosine ≥ 0.90 is confounded. **Condition
number is computed this time** — Phase 6C2C3 declared a cap of 1000 and then
reported only pairwise cosine, which is a weaker statement about the matrix than
a rank analysis.

Resolution options: `ORTHOGONALIZE_SEMANTICS`, `COLLAPSE_DUPLICATES`,
`FREEZE_ONE_TUNE_ONE`, `FREEZE_ALL_PENDING_DATA`,
`KEEP_BOTH_CONTEXTUALLY_IDENTIFIED`. Two unresolved confounded parameters are
never tuned together.

## Readiness reconciliation — a hard gate

Every active parameter lands in **exactly one** of:

```
FREE_CALIBRATION
STRONGLY_REGULARIZED_CALIBRATION
STRUCTURAL_CALIBRATION_ONLY
DEFAULT_FROZEN_CONFOUNDED
DEFAULT_FROZEN_NO_EFFECT
DEFAULT_FROZEN_PENDING_EXTERNAL_DATA
```

```
sum(class counts) === active parameter count
```

A test hard-fails otherwise. **This gate exists because Phase 6C2C3 failed it.**
That phase's readiness table was written as prose rather than computed — the six
numbers summed to 59 against 53 active parameters, and the report then quoted
four of them summing to 44. No code produced them. Readiness is now derived from
data and asserted.

## Search

Deterministic and staged: bounded one-at-a-time local scan → domain candidate
evaluation → internal validation → lock domain → next domain → final bounded
joint-neighbourhood check. **No unconstrained global optimizer.** No formal
holdout at any stage.

## Candidate acceptance

All of:

- tuning-fold objective improves;
- validation objective improves or degrades by ≤ 1% relative;
- the intended **primary** metric improves;
- no guardrail moves by more than 2× its practical threshold;
- side symmetry passes;
- probability reliability does not materially regress;
- synthetic development guardrails pass;
- statistical invariants perfect, zero final ties;
- parameter inside bounds and within its movement cap;
- candidate recorded in append-only history.

Movement caps: `FREE_CALIBRATION` 100% of range,
`STRONGLY_REGULARIZED_CALIBRATION` 15%, everything else **0%**.

## Evidence priority

```
historical numeric  >  historical qualitative  >  synthetic control  >  structural
```

Simulation volume reduces noise; it does not create historical evidence. Ten
thousand synthetic games do not outweigh one credible historical target.

## Holdouts

`historical-holdout-v3` and `synthetic-stress-holdout-v2` are not simulated, not
inspected, and not used for identifiability, confounding, folds, search,
acceptance, symmetry, probability or performance. Access counts must remain 0.

## Claims vocabulary

This phase may produce `DEVELOPMENT_LOCKED_SCOPED` and nothing stronger. The
terms `FULLY_HISTORICALLY_VALIDATED`, `HOLDOUT_VALIDATED`,
`PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_READY` and `ACTIVE` are forbidden here.
