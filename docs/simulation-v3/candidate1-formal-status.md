# Candidate 1 formal status

| | |
|---|---|
| candidate | Candidate 1 |
| commit | `c370182bb805cd068427283ce2b45a7eda725d1c` |
| lock revision | 2 |
| core hash | `de57e1a96e1fd1450d1aea9c5463b0138a56d77bbf58c748ba042e6f78f5c94d` |
| parameter-set hash | `83f5a17dea0c36d4fd64d80a98a5fcd794ff4b7d2adf3dc955bcec0ca6f1b309` |
| selection status | SELECTED |
| lock status | LOCKED |
| calibration version | 1.1.0 |
| calibration status | DEVELOPMENT_LOCKED_SCOPED |
| **formal validation status** | **HISTORICAL_HOLDOUT_V5_FAILED** |
| compound verdict | CANDIDATE1_HISTORICAL_V5_FAILED |
| preview status | NOT_ELIGIBLE |
| production status | UNCHANGED |

## What a failure does not do

a failed holdout does not unlock a candidate. Candidate 1 remains SELECTED and LOCKED, with its core and parameters exactly as they were before the seal opened.

a status transition alone does not bump possessionCalibrationVersion. It remains 1.1.0, the version the candidate was locked and measured at.

## Drift

| axis | value |
|---|---|
| coreDrift | 0 |
| parameterDrift | 0 |
| policyDrift | 0 |
| seedDrift | 0 |
| targetDrift | 0 |
| postHoldoutTuning | 0 |

core and parameter-set hashes identical to the preflight taken before the seal opened, and all 53 parameters still at their registry defaults.

## Statuses not claimed

`HOLDOUT_VALIDATED`, `PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_READY`, `ACTIVE`.

Historical Holdout V5 returned FAIL, so Candidate 1 is not holdout-validated. No preview package is prepared and no deployment is authorized.

## Next step

a repair phase on the failing traits, producing Candidate 2, followed by NEW unseen holdouts. Historical V5 and, when it is eventually opened, Synthetic V2 are one-shot resources: neither can be reused to validate a repaired candidate.
