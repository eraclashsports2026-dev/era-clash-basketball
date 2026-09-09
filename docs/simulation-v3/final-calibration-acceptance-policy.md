# Phase 6C2C2 — frozen acceptance policy

**Frozen before any Phase 6C2C2 experiment ran.**

| | |
|---|---|
| Policy hash | `a3583d6ada42d61ff9ee40322d999154250613ba94a2cd6f073e2196315919b0` |
| Machine-readable | [`src/v3/calibration/acceptancePolicy.js`](../../src/v3/calibration/acceptancePolicy.js) |
| Default parameter hash at freeze | `b8c81cd99161b605c14cceb703885554` |
| Artefacts frozen | 24 |

The policy lives in code, not only in prose, so that tests can assert against it
and a silent edit fails the suite instead of passing unnoticed.

## Changing a threshold

A threshold that can be adjusted after seeing the number it judges is not a
threshold. Changing any value requires all four of:

1. incrementing the owning policy version;
2. recording the old value, the new value and the date;
3. a justification valid **independent of the result that prompted it**;
4. re-running every stage the threshold governs.

### On the Phase 6C2C1 precedent

Phase 6C2C1 froze a per-cell side-bias threshold of 0.05 without accounting for
sampling error, and it failed on what was almost certainly noise (0.0625 = 2 SE
at n = 256). That result **stands as recorded and is not retroactively revised.**

The thresholds below are new, set for a new phase, and are sampling-error aware
*before* any 6C2C2 result exists — which is the only legitimate moment to make
them so. This is a new policy, not a rescue of the old one.

---

## WS1 · Actual-game side symmetry

Two different questions, deliberately separated. Paired Monte Carlo orientation
can produce a fair *probability* while the underlying single-game engine still
favours a display side. A player plays one game, not a paired average, so
averaging may not stand in for fairness.

| Gate | Threshold |
|---|---|
| Aggregate Gold win-rate advantage | ≤ 0.5 pp |
| 95% CI containment | within ±1.0 pp |
| Per-cell practical effect flag | > 2.0 pp |
| Multiple-comparison control | Benjamini–Hochberg, FDR 0.05 |
| Systematic-bias t-statistic | ≤ 2.0 |
| Same-direction cell fraction | ≤ 0.70 |
| Mean score-margin difference | ≤ 0.30 pts |
| Possession-count difference | ≤ 0.50 per game |
| First-possession imbalance | ≤ 1.0 pp |
| Overtime side advantage | ≤ 2.0 pp |
| Paired games per major cell | ≥ 5,000 |
| Paired games aggregate | ≥ 50,000 |

A single noisy cell must not fail the engine; a consistent same-direction tilt
across cells must not pass it.

## WS2 · Tier B coverage

Required metrics: pace, ORtg, DRtg, net rating, eFG%, TS%, TOV%, ORB%, DRB%,
FTr, 3PAr, assist rate.

Permitted unavailability reasons: `NOT_RECORDED_IN_ERA`,
`INSUFFICIENT_SOURCE_TOTALS`, `SOURCE_BLOCKED_LICENSING`, `NOT_APPLICABLE`.

| Gate | Threshold |
|---|---|
| Unjustified missing fields | **0** |
| Unprovenanced values | 0 |
| Unauthorized-source values | 0 |
| Zero substituted for missing | forbidden |
| Holdout enriched blind | required |
| Holdout simulation access during enrichment | 0 |
| Derivation with incomplete inputs | forbidden |

A target may be unavailable. It may not be silently missing. A rating derived
from a guessed possession count is a guess wearing a formula.

## WS3 · Independent source verification

A second source that re-publishes the first is not a second source.

| Scope | Requirement |
|---|---|
| Holdout fixture rosters | 8 / 8 |
| Holdout coach-seasons | 8 / 8 |
| Holdout season/team identities | 8 / 8 |
| Holdout core Tier A rows | 100% |
| Calibration fixtures per era | ≥ 25%, min 1 |
| Calibration player-seasons per era | ≥ 20% |
| Ambiguous identities, alias migrations, critical holdout roles | all |
| Unresolved disputes (membership, coach, critical target) | 0 |
| Prohibited-source uses | 0 |

Disagreements are preserved, never silently averaged, and **never resolved
toward the value that improves model fit.**

## WS4 · Parameter identifiability

The corpus holds 24 tunable historical fixtures. Simulation volume reduces Monte
Carlo noise; it does not manufacture independent historical examples. Tuning 53
parameters against 24 contexts would fit noise and call it calibration.

| Category | Criteria |
|---|---|
| `IDENTIFIABLE` | SNR ≥ 3.0, direction consistency ≥ 0.75, max cosine < 0.90 |
| `WEAKLY_IDENTIFIABLE` | SNR ≥ 2.0, direction consistency ≥ 0.60 |
| `CONFOUNDED` | cosine similarity ≥ 0.90 with another parameter |
| `NO_MEASURABLE_EFFECT` | SNR < 2.0 across the full allowed range |
| `UNSUPPORTED_BY_TARGET_DATA` | moves output, no authorized target can judge it |
| `FIXED_RULE_NOT_TUNABLE` | a rule constant, deliberately unregistered |

Allowed movement, as a fraction of registry range: identifiable 1.00, weakly
identifiable **0.15**, everything else **0.00**.

Matrix condition number ≤ 1000. Perturbations at ±10% and ±25% of range, ≥ 400
paired seeds each. Reclassifying a parameter to enlarge the tunable set is
forbidden.

## WS5 · Objective, folds and acceptance

Eleven separately-reported components. Collapsing them into one opaque score is
forbidden. 4 folds, stratified by era, team, pace, offensive style, defensive
style and confidence. Fold membership frozen before tuning. No holdout in folds.

A candidate is accepted only when **all** hold:

- tuning objective improves;
- internal-validation objective improves, or degrades by ≤ 1% relative;
- no critical metric regresses by > 10% relative;
- synthetic guardrails pass;
- invariants perfect, zero final ties;
- parameter within registry bounds;
- history appended.

Improving the tuning fold alone is the definition of overfitting. No
player-specific or team-specific calibration exceptions.

## WS11 · Probability revalidation

| Gate | Threshold |
|---|---|
| Fraction of achievable skill | ≥ 0.75 |
| Expected calibration error | ≤ 0.10 |
| Mirror deviation from 0.5 | ≤ 0.03 |
| Strength ladder | monotonic, ≥ 256 games/rung |
| Fingerprint replay | exact |
| Prediction ∩ actual-game seeds | ∅ |
| Prediction ∩ validation seeds | ∅ |

Baselines, all outcome-scale: analytical 0.2507, constant 0.25, pre-calibration
Monte Carlo 0.2195. **Cross-scale Brier comparison is forbidden** — rate-scale
and outcome-scale Brier are different quantities and comparing them overstates
skill by roughly 100×.

## WS12–15 · Lock and formal holdout

| Gate | Threshold |
|---|---|
| Lock commit pushed before opening | required |
| Clean working tree before opening | required |
| Openings per set | **1** |
| Parameter change after opening | forbidden |
| Holdout ÷ internal composite error | ≤ **1.50** |
| Catastrophic fixtures | 0 |
| Critical metric regression vs internal | ≤ 25% relative |
| Games per holdout fixture | ≥ 1,000 |
| Invariant failures / final ties / source-integrity failures | 0 |

Catastrophic = composite error > 3× the internal-validation median, or any
invariant failure.

Synthetic guardrails: no action family > 60% share, no shell win rate outside
0.35–0.65, same-seed replay, new-seed variance, construction can beat higher OVR,
extreme talent stays meaningful.

**On failure:** mark `HOLDOUT_FAILED`, do not retune against the opened set, do
not preview, do not deploy. A future attempt requires a new unseen holdout.

## WS16–17 · Private preview

Soak: 1,000 single games · 200 series · 50 seasons · 20 tournaments · 100 dailies
· 100 challenges · 100 MC standard · 50 MC deep.

| Gate | Threshold |
|---|---|
| Core simulation success | ≥ 99.9% |
| Invariant / replay failures, final ties | 0 |
| Unexplained 5xx | < 0.5% |
| Game API p95 | < 750 ms |
| MC standard p95 | < 2,500 ms |
| Cached probability p95 | < 200 ms |
| Private-data exposure, production writes, calibration-player exposure | 0 |
| Horizontal overflow at 375/768/1280/1440/1920/2560 | 0 |

**Human review cannot be simulated.** If real reviewers are unavailable the gate
is `PENDING_REAL_REVIEW`, fabricated responses are forbidden, and production
readiness may not be claimed.

## WS18–20 · Production

Explicit CEO approval required, phrase `GO LIVE`. **Inferred approval and
self-approval are forbidden** — a general instruction to complete the phase is
not production approval.

Nine stages, 0 through 8. Skipping to full rollout is forbidden. Engines may
never be mixed within one competition object. Daily activates only at a UTC-day
boundary.

Thresholds: core success ≥ 99.9%; zero invariant failures, replay failures,
challenge corruptions, Daily splits, schema incompatibilities, PWA stale-bundle
incidents, private-data leaks, calibration-player exposures; unexplained 5xx
< 0.5%.

Rollback tested before activation. Engine 3.2.0 retained as fallback. All results
stay replayable; calibrated results are never deleted. Claiming an unobserved
watch window is forbidden.

---

## Evidence vocabulary

Every report distinguishes: `VERIFIED`, `MEASURED`, `CALIBRATED`,
`HOLDOUT_VALIDATED`, `PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_ACTIVE`,
`PARTIALLY_ACTIVE`, `ROLLED_BACK`, `BLOCKED`. Blurring these is how a phase
lies about its own state.
