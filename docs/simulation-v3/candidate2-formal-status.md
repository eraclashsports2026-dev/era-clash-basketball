# Candidate 2 formal status

Rendered from `data/validation/6c4c3/candidate2-formal-status.json` and
`data/validation/6c4c3/formal-validation-attempts.json`.

| Property | Value |
| --- | --- |
| candidate | Candidate 2 |
| parent | Candidate 1 |
| selection status | SELECTED |
| lock status | LOCKED |
| possession calibration version | 1.2.0 |
| core hash | `3733b648f050a4f5…` |
| parameter-set hash | `83f5a17dea0c36d4…` |
| formal state | **CANDIDATE2_HISTORICAL_V6_FAILED** |
| calibration status | **DEVELOPMENT_LOCKED_SCOPED** |
| formal validation status | **HISTORICAL_V6_FAILED** |
| HOLDOUT_VALIDATED claimed | false |
| preview status | NOT_PREPARED |
| production status | UNCHANGED |

unchanged. A status change does not move a calibration version.

calibrationStatus and formalValidationStatus become HOLDOUT_VALIDATED only under CANDIDATE2_FORMAL_VALIDATION_PASSED. Under every other state the calibration status is exactly what the lock recorded.

## Changes made after access

| Kind | Count |
| --- | --- |
| `postHoldoutTuning` | 0 |
| `engineChanges` | 0 |
| `dataChanges` | 0 |
| `policyChanges` | 0 |
| `targetChanges` | 0 |
| `marginChanges` | 0 |
| `seedChanges` | 0 |
| `referenceChanges` | 0 |
| `traitChanges` | 0 |
| `runnerSemanticChanges` | 0 |

## Formal attempt history

| Attempt | Candidate | Holdout | Run status | Access | Verdict | Failure class |
| --- | --- | --- | --- | --- | --- | --- |
| attempt-1 | Candidate 0 | `historical-holdout-v3` | COMPLETE | 1 | FAIL | NONIDENTIFIABLE_MEASUREMENT_SURFACE |
| attempt-2 | Candidate 0 | `historical-holdout-v4` | COMPLETE | 1 | FAIL | OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE |
| attempt-3 | Candidate 1 | `historical-holdout-v5` | COMPLETE | 1 | HISTORICAL_HOLDOUT_V5_FAIL | OBSERVABLE_DEFENSIVE_SUPPRESSION_AND_ASSISTED_OFFENCE_TRAIT_FAILURE |
| attempt-4 | Candidate 1 | `synthetic-stress-holdout-v2` | NOT_STARTED | 0 | NOT_OPENED | — |
| attempt-5 | Candidate 2 | `historical-holdout-v6` | COMPLETE | 1 | HISTORICAL_HOLDOUT_V6_FAIL | OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE |
| attempt-6 | Candidate 2 | `synthetic-stress-holdout-v2` | NOT_OPENED | 0 | NOT_OPENED | — |

No prior attempt changed: 4 carried
forward byte-for-byte from `data/validation/6c4b2r/formal-validation-attempts.json`.

## Seal state

| Set | Access count | Status |
| --- | --- | --- |
| `legacy-holdout-v1` | 0 | SEALED_UNREAD |
| `historical-holdout-v2` | 0 | SEALED_UNREAD |
| `synthetic-stress-v1` | 0 | PREVIOUSLY_INSPECTED_ARCHIVE |
| `historical-holdout-v3` | 1 | UNSEALED |
| `synthetic-stress-holdout-v2` | 0 | SEALED_UNREAD |
| `historical-holdout-v4` | 1 | UNSEALED |
| `historical-holdout-v5` | 1 | UNSEALED |
| `historical-holdout-v6` | 1 | UNSEALED |

## What comes next

Candidate 2 formal validation has failed. A Candidate 3 would require its own repair, its own lock and a NEW unseen historical holdout — V6 is consumed and may be used only as a failed-holdout diagnostic set. Synthetic Stress Holdout V2 remains sealed and unread and is still available to a future candidate.
