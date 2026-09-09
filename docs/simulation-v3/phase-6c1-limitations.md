# Phase 6C1 limitations

What this phase did **not** establish. Read alongside
`calibration-baseline-report.md`.

## The framework is not a calibration

Phase 6C1 built the apparatus that will measure a calibration. It produced no
tuned coefficient and no calibration.

`possessionCalibrationVersion` is `null`/PLANNED, and
`cacheKeys.calibratedPossessionResult` throws by design. A version value there
would assert that tuned coefficients exist. They do not.

**A calibration does not exist merely because a framework exists.**

## No numeric error surface against real team-seasons

209 of 209 calibration-set comparisons are unavailable (`SOURCE_BLOCKED`). No
weighted MAE could be computed. Every quantitative finding in the baseline
report rests on the **era environment baselines**, which are in-repo and
confidence-graded — not on published team-season advanced metrics.

## The engine is not accurate

Status: **DEVELOPMENT — CALIBRATION REQUIRED**. Not historically authoritative,
not definitive, not scientifically proven, not validated, not fully accurate.
Measured defects are catalogued in the priority register, and one of them —
usage concentration at 38.8% of team FGA — is severe.

## Findings that rest on thin samples

| Finding | Sample | Status |
| --- | --- | --- |
| Zone concedes +38% offensive rebounds | **1 matchup** | directional |
| Shooting hierarchy ordering | 2 of 8 eras testable | supported where tested |
| Coach identity signatures | 1 fixture per coach | directional |

These are reported as directional and should not be treated as load-bearing
until the corpus widens.

## Not measured at all

- **Probability calibration.** Framework built and unit tested; the engine emits no pregame win probability on this path.
- **The holdout.** SEALED_UNREAD, access count 0. Nothing in this phase's results says anything about generalisation.
- **Bench, rotations, foul-outs, substitutions.** Deferred. `rotationDepth` remains `RESEARCH_ONLY`. Every result above comes from five-man lineups with no substitutions, which inflates per-player usage relative to a real twelve-man rotation — a real caveat on §3 and §4 of the baseline report, though not nearly enough to explain them.

## Deliberately not done

- **No broad coefficient tuning.** Out of scope by instruction.
- **No module promoted to production.** Every new system stays flag-gated, default off.
- **No public exposure.** Production remains engine 3.2.0.
- **No tuning against the holdout.**
- **No fabricated data** to complete a schema or a coverage claim.
- **No increase in simulation randomness** to make a low-confidence fixture's error bar cover its target.

## Interpretation warnings

**Style comparisons are not statistics.** Anything drawing on `styleNotes` is
labelled `DOCUMENTED_STYLE_COMPARISON`.

**The earlier 67.5% zone win rate was selection bias** and is superseded by the
controlled comparison. Do not cite it.

**Deviation from an era environment is expected**, not error. All-time rosters
should exceed their era's average. Only the *inconsistency* of the deviation
across eras is a defect.
