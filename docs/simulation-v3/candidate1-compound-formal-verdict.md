# Candidate 1 compound formal verdict

**CANDIDATE1_HISTORICAL_V5_FAILED**

Historical Holdout V5 returned FAIL. Synthetic Stress Holdout V2 is correctly never opened, so the validation is decided by stage one.

## The two stages

| stage | set | opened | access count | verdict |
|---|---|---|---|---|
| 1 | `historical-holdout-v5` | true | 1 | HISTORICAL_HOLDOUT_V5_FAIL |
| 2 | `synthetic-stress-holdout-v2` | false | 0 | NOT_OPENED |

## The rule applied

1. If stage one FAILED or was INVALID, that decides the verdict on its own: the frozen stage order means stage two is not opened after a stage-one failure, so its absence is correct rather than incomplete.

2. Otherwise both stages must have produced a formal result. One stage that PASSED is not a compound verdict.

3. Both stages must have scored the same candidate core and parameter set, or the results cannot be combined.

4. A stage-two FAIL or INVALID_RUN gives the corresponding stage-two verdict.

5. Otherwise CANDIDATE1_HOLDOUT_VALIDATED.

A validated verdict requires all of: Historical V5 PASS, Synthetic V2 PASS, candidate core drift 0, parameter drift 0, policy drift 0, seed drift 0, target drift 0, post-holdout tuning 0.

## What the command did

none. Each stage's verdict is the one its own frozen policy produced at run time; this command reads them and applies the compound rule above.

It opened 0 seals. Access counts after:
`historical-holdout-v5` 1, `synthetic-stress-holdout-v2` 0.

Verdict hash `1ac695b23c9dd11d3b4bb3cc5cc500d82ebbf0c14c9c30ffd2cfb55742e3addc`.

## What this does not authorize

BOTH_STAGES_PASSED does not make Candidate 1 HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and authorizes no preview or production deployment. Those statuses belong to the phase that earns each of them, and production activation requires an explicit CEO GO LIVE.
