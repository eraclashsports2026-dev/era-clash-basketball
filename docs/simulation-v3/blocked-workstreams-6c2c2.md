# Phase 6C2C2 — blocked workstreams

The phase brief names twenty documents. This one records, for each document that
**does not exist**, why it does not — so that its absence is a finding rather
than an omission.

An empty or speculative version of any of these would be worse than its absence:
a file called `possession-calibration-1.0.md` implies a calibration exists.

## Written and real

| Document | State |
|---|---|
| `final-calibration-acceptance-policy.md` | frozen before results, hash asserted by test |
| `actual-game-side-symmetry.md` | measured, corrected, re-measured, gate PASS |
| `tier-b-target-coverage.md` | measured; gate PASS on its terms |
| `independent-source-verification.md` | **BLOCKED**, with the procurement requirement |
| `calibration-support-matrix.md` | measured |
| `parameter-identifiability.md` | **BLOCKED**, with empirical proof |
| `probability-revalidation-final.md` | measured, gate holds |
| `production-rollout-plan.md` | prepared, **not exercised** |
| `production-rollback-runbook.md` | prepared, **not exercised** |
| `phase-6c2c2-limitations.md` | this phase's honest ledger |

## Not written, and why

### `calibration-objective-v2.md`

`calibrationObjectiveVersion` was bumped to 2.0.0 and the eleven required
components are declared in the frozen policy. The objective was **not finalised**
because a objective is defined by the data it consumes, and:

- 26 of its potential inputs (all Tier B metrics) are unavailable;
- the era-environment component has no authorized target;
- no parameter it would optimise is connected to the engine.

Writing the objective now would fix weights against evidence that does not exist.
The component list stands in `acceptancePolicy.js` as the specification; the
weighting is deferred until there is something to weigh.

### `opportunity-calibration-final.md`

Blocked. `opportunity.saturation.strength` is the **only** parameter in the
registry with populated authorized historical numeric support — and it is not
wired to the engine. Calibrating one disconnected parameter is not a calibration.

### `shot-location-calibration-final.md`

Blocked twice over. All six shot-location weights and all three conversion
bonuses are judged solely against Era Style environment values whose recorded
source is excluded by policy, so they are `UNSUPPORTED`. They are also unwired.
The brief requires location to be calibrated **before** conversion; neither can
be.

### `era-and-three-point-calibration-final.md`

Blocked. `era.paceTempoScale`, `era.paceBoundFraction`, `era.threeAnchorMax` and
`era.freeThrowTripRate` are all `UNSUPPORTED` for the same reason, and unwired.

Structurally verified and unchanged: pre-1979 eras still produce 3PA = 0 and
3PM = 0, asserted by the `THREE_IN_PRE_THREE_ERA` invariant across every game in
the 240,000-game symmetry matrix — **zero violations**.

### `zone-calibration-final.md`

Blocked. `zone.selectionFrequency` is `UNSUPPORTED`; the other three zone
parameters are `STRUCTURAL_VALIDATION_ONLY`. All four unwired.

Structurally verified: the four zone-legal-era cells in the symmetry matrix
(1950s, 2000s, 2010s, 2020s) produced no invariant violations and no side bias
beyond ±1.12pp.

### `coach-calibration-final.md`

Blocked. All five coach parameters are `STRUCTURAL_VALIDATION_ONLY` — no numeric
target can judge them — and all are unwired.

Structurally verified: the four coach-contrast cells in the symmetry matrix
behaved within noise, so no coach pairing carries a hidden side advantage.

### `possession-calibration-1.0.md`

**Does not exist because there is no calibration 1.0.**
`possessionCalibrationVersion` is `null`, status `PLANNED`. The internal lock gate
(Workstream 12) requires the Tier B gate, the independent-source gate and the
identifiability gate to pass. Two failed and one could not be run.

### `formal-holdout-validation-report.md`

**Does not exist because no holdout was opened.**

The frozen policy requires the lock commit pushed, the independent-source gate
passed, and 8 of 8 holdout fixtures independently verified before an opening. Zero
were verified, because no authorized independent source exists.

`historical-holdout-v3` and `synthetic-stress-holdout-v2` remain `SEALED_UNREAD`.
All five seal access counts are **0**. Opening a holdout against an unwired,
uncalibrated parameter set would have burned a one-time resource to measure
nothing.

### `private-preview-validation-report.md`

**Does not exist because no preview was deployed.** Its precondition is a
holdout-validated calibration. Additionally, the frozen policy requires **real
human review**, forbids fabricated reviewer responses, and makes human review
block production. No reviewers were available, so that gate would stand at
`PENDING_REAL_REVIEW` regardless.

### `production-activation-report.md`

**Does not exist because no production change was made.**

Production activation requires explicit CEO approval with the phrase `GO LIVE`,
and the frozen policy forbids inferred and self-approval. No approval was given
and none was requested, because the ten preconditions were not met. `main` remains
at `9cd95ff`; engine 3.2.0 is untouched; every development flag defaults false.

## The gate chain, and where it stopped

```
Repository truth verified            PASS
Actual-game side symmetry            PASS   <- the phase's real product
Tier B target gate                   PASS   (0 unjustified missing, 2/384 populated)
Independent source gate              FAIL   <- stopped here
All 53 parameters classified         BLOCKED (0/53 wired)
Internal calibration                 NOT ATTEMPTED
Probability revalidation             PASS
Possession calibration 1.0 locked    NOT REACHED
Historical holdout                   NOT OPENED
Synthetic holdout                    NOT OPENED
Private preview                      NOT ATTEMPTED
Production activation                NOT ATTEMPTED
```

## What unblocks this, in order

1. **Wire the parameter registry to the engine.** No licence, no data, no vendor.
   Entirely internal, and it gates everything else. Scope in
   `parameter-identifiability.md`.
2. **Procure an authorized independent source.** SportsDataIO plus a one-line
   written rider is the recommended path; approach StatsCrew in parallel.
3. **Obtain legal review** of the two posture findings — the Wikipedia upstream
   provenance question, and the era-environment data already live in production.
4. **Then** re-run identifiability, which becomes answerable, and only then
   calibrate.

Doing 2 before 1 leaves a purchased licence waiting on a code change.
