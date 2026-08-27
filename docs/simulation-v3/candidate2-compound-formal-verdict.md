# Candidate 2 compound formal verdict

Rendered from `data/validation/6c4c3/candidate2-compound-formal-verdict.json`.

## Verdict

**CANDIDATE2_HISTORICAL_V6_FAILED**

Historical Holdout V6 returned FAIL. Synthetic Stress Holdout V2 is correctly never opened, so the validation is decided by stage one.

## Stages

| Stage | Set | Ran | Outcome | Verdict | Access count |
| --- | --- | --- | --- | --- | --- |
| 1 | `historical-holdout-v6` | true | FAIL | HISTORICAL_HOLDOUT_V6_FAIL | 1 |
| 2 | `synthetic-stress-holdout-v2` | false | — | — | 0 |

Historical Holdout V6 returned HISTORICAL_HOLDOUT_V6_FAIL. The frozen stage order forbids opening the synthetic set without a passing stage one, so it remains sealed at access 0.

## This stage simulated nothing

| Quantity | Value |
| --- | --- |
| games simulated | 0 |
| seals opened | 0 |
| `historical-holdout-v6` access | 1 |
| `synthetic-stress-holdout-v2` access | 0 |
| agreement cross-checks | 5, 0 disagreements |

## Decision rule

1. No stage has run -> CANDIDATE2_NOT_YET_DETERMINED.
2. Stage two ran without a PASSING stage one -> CANDIDATE2_STAGE_ORDER_VIOLATED. The synthetic result is not evidence, whatever it says.
3. Stage one FAILED or was INVALID -> the verdict names stage one. Stage two is correctly never opened.
4. Either stage has not run -> CANDIDATE2_NOT_YET_DETERMINED.
5. The two stages scored different cores or parameter sets -> CANDIDATE2_IDENTITY_SPLIT.
6. Stage two FAILED or was INVALID -> the verdict names stage two.
7. Otherwise CANDIDATE2_HOLDOUT_VALIDATED.

## Vocabulary

| Verdict | Meaning |
| --- | --- |
| `CANDIDATE2_HOLDOUT_VALIDATED` | both formal stages returned PASS on the same locked candidate, with no drift and no post-holdout tuning |
| `CANDIDATE2_HISTORICAL_V6_FAILED` | Historical Holdout V6 returned FAIL. Synthetic Stress Holdout V2 is correctly never opened, so the validation is decided by stage one. |
| `CANDIDATE2_HISTORICAL_V6_INVALID` | Historical Holdout V6 could not produce a formal result. Synthetic Stress Holdout V2 is correctly never opened. |
| `CANDIDATE2_SYNTHETIC_V2_FAILED` | Historical Holdout V6 passed and Synthetic Stress Holdout V2 returned FAIL |
| `CANDIDATE2_SYNTHETIC_V2_INVALID` | Historical Holdout V6 passed and Synthetic Stress Holdout V2 could not produce a formal result |
| `CANDIDATE2_IDENTITY_SPLIT` | the two stages did not score the same candidate core and parameter set, so their results cannot be combined |
| `CANDIDATE2_STAGE_ORDER_VIOLATED` | Synthetic Stress Holdout V2 was opened without a passing Historical Holdout V6. The synthetic result is not usable as evidence and the compound verdict cannot be issued. |
| `CANDIDATE2_NOT_YET_DETERMINED` | no stage has produced a formal result yet, so there is nothing to compound |

## The write-guard correction

the --issue guard originally required BOTH stages to have produced a formal result.

- Why: a stage-one FAIL or INVALID means stage two will never run, so under that condition the correct compound verdict was unissuable.
- Now requires: the sequence to have terminated: both stages ran, or stage one decisively ended it.
- State machine: compoundVerdict() is byte-identical in behaviour. For every input it returns what it returned before; only this write precondition changed.

## Not claimed

- HOLDOUT_VALIDATED as a repository status
- PRIVATE_PREVIEW_VALIDATED
- PRODUCTION_READY
- ACTIVE
- any deployment authorization

requires an explicit CEO GO LIVE. This artifact authorizes nothing.
