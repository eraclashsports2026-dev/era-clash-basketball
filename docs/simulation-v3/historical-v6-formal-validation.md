# Historical Holdout V6 — formal Candidate 2 validation

Rendered from `data/validation/6c4c3/historical-v6-access-event.json`,
`data/validation/6c4c3/historical-v6-formal-run.json`,
`data/validation/6c4c3/historical-v6-fixture-results.json`,
`data/validation/6c4c3/historical-v6-formal-results.json` and
`data/validation/6c4c3/historical-v6-formal-verdict.json`.

## Verdict

**HISTORICAL_HOLDOUT_V6_FAIL** — `OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE`

Allowed verdicts: `HISTORICAL_HOLDOUT_V6_PASS`, `HISTORICAL_HOLDOUT_V6_FAIL`, `HISTORICAL_HOLDOUT_V6_INVALID_RUN`. No
conditional pass, no near pass, no operator waiver.

## Access

| Property | Value |
| --- | --- |
| access event sequence | 1 |
| access count before | 0 |
| access count after | 1 |
| live access count | 1 |
| access-log lines | 1 |
| operator | joseph.johnson@indagare.com |
| opened at commit | `a7d1606c4e134e9d8307b873c335bdfb8c7df237` |
| completed at commit | `a7d1606c4e134e9d8307b873c335bdfb8c7df237` |
| run status | COMPLETE |
| interruptions | 0 |
| resumes | 0 |

A second independent `--run` was probed: exit 2,
refused with `SECOND_RUN_REFUSED`, access count unchanged
(1 → 1).

this event is permanent. Historical Holdout V6 has been opened and cannot be restored to SEALED_UNREAD. The event is not reset, deleted or reissued.

## Coverage

| Quantity | Value |
| --- | --- |
| matchups evaluated | 8 |
| team-seasons | 16 |
| eras covered | 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s |
| player profiles | 80 |
| coaches | 15 |
| scored trait instances | 46 |
| excluded trait instances | 36 |
| scored metrics | assistedRate, gamePace, movementShare, orebRate, orebRateAgainst, postUpShare, refPppVsTeam, transitionShare |
| metrics certified under Candidate 2 | 11 of 16 |
| total games | 172,032 |
| matchups escalated | v6m-1980s |

## Sample stages applied

| Matchup | Precheck games | Decision games | Escalation games | Governing tier |
| --- | --- | --- | --- | --- |
| `v6m-1950s` | 6144 | 12288 | — | 3 |
| `v6m-1960s` | 6144 | 12288 | — | 3 |
| `v6m-1970s` | 6144 | 12288 | — | 3 |
| `v6m-1980s` | 6144 | 12288 | 24576 | 4 |
| `v6m-1990s` | 6144 | 12288 | — | 3 |
| `v6m-2000s` | 6144 | 12288 | — | 3 |
| `v6m-2010s` | 6144 | 12288 | — | 3 |
| `v6m-2020s` | 6144 | 12288 | — | 3 |

Decision tier 4096 games per surface; escalation
8192.
escalation is triggered by indeterminacy or disagreement alone. It is never conditioned on the sign of the difference, so it cannot preferentially rescue a failing measurement or a passing one.

## Numeric proxy

| Quantity | Value |
| --- | --- |
| `teamSurfacesScored` | 16 |
| `holdoutComposite` | 0.0345 |
| `internalBaselineMean` | 0.0431 |
| `ratio` | 0.80054 |
| `ratioGate` | 1.5 |
| `catastrophicThreshold` | 0.13038 |
| `catastrophicTeams` | none |

## Traits

| Quantity | Value |
| --- | --- |
| scored | 46 |
| passed | 31 |
| failed | 15 |
| pass rate | 0.67391 (minimum 0.75) |
| hard-fail labels | 12 |
| independent hard-fail clusters | 8 |
| cluster gate | maximum 0 |
| excluded as unobservable | 36 |
| aggregation unit | INDEPENDENT_MEASUREMENT_CLUSTER |

### By metric

| Metric | Pass | Fail | Hard fail |
| --- | --- | --- | --- |
| `assistedRate` | 2 | 3 | 1 |
| `gamePace` | 12 | 1 | 1 |
| `movementShare` | 1 | 6 | 6 |
| `orebRate` | 1 | 1 | 1 |
| `orebRateAgainst` | 1 | 0 | 0 |
| `postUpShare` | 3 | 1 | 1 |
| `refPppVsTeam` | 0 | 3 | 2 |
| `transitionShare` | 11 | 0 | 0 |

### Per matchup

| Matchup | Scored | Failed | Fails a majority |
| --- | --- | --- | --- |
| `v6m-1950s` | 6 | 0 | no |
| `v6m-1960s` | 4 | 0 | no |
| `v6m-1970s` | 4 | 1 | no |
| `v6m-1980s` | 7 | 1 | no |
| `v6m-1990s` | 8 | 2 | no |
| `v6m-2000s` | 7 | 7 | **yes** |
| `v6m-2010s` | 4 | 1 | no |
| `v6m-2020s` | 6 | 3 | no |

### Independent hard-fail clusters

| Era | Side | Team | Metric | Subject mean | Reference mean | Difference | Margin | z | Labels |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1970s | teamB | Portland Trail Blazers 1974-75 | `orebRate` | 0.31214 | 0.33772 | -0.02558 | 0.02 | -17.29919 | 1 |
| 1990s | teamA | Indiana Pacers 1994-95 | `movementShare` | 0.15075 | 0.21226 | -0.06151 | 0.03 | -80.53089 | 2 |
| 2000s | teamA | Boston Celtics 2007-08 | `refPppVsTeam` | 1.17134 | 1.14908 | 0.02226 | 0.02 | 8.87861 | 2 |
| 2000s | teamA | Boston Celtics 2007-08 | `assistedRate` | 0.43829 | 0.47555 | -0.03726 | 0.02 | -22.20968 | 1 |
| 2000s | teamB | Houston Rockets 2007-08 | `gamePace` | 92.15698 | 90.8002 | 1.35678 | 1 | 30.80383 | 1 |
| 2000s | teamB | Houston Rockets 2007-08 | `movementShare` | 0.12636 | 0.17439 | -0.04803 | 0.03 | -64.68724 | 2 |
| 2000s | teamB | Houston Rockets 2007-08 | `postUpShare` | 0.22432 | 0.2606 | -0.03628 | 0.03 | -38.44593 | 1 |
| 2020s | teamB | San Antonio Spurs 2020-21 | `movementShare` | 0.183 | 0.23644 | -0.05344 | 0.03 | -64.01033 | 2 |

the gate is on clusters. Labels are reported and never aggregated, so two trait names on one measurement cannot double-count.

## Gates

| Gate | Result |
| --- | --- |
| `everyMatchupExecuted` | PASS |
| `zeroInvariantFailures` | PASS |
| `zeroFinalTies` | PASS |
| `zeroImpossibleScores` | PASS |
| `zeroPreThreeEraThreePointAttempts` | PASS |
| `replayExactEverywhere` | PASS |
| `compositeRatioWithinPolicy` | PASS |
| `zeroCatastrophicTeams` | PASS |
| `traitPassRateMet` | **FAIL** |
| `zeroIndependentHardFailClusters` | **FAIL** |
| `noMatchupFailsMajorityOfTraits` | **FAIL** |
| `noEraFailsEveryScoredTrait` | **FAIL** |

Failed gates: `traitPassRateMet`, `zeroIndependentHardFailClusters`, `noMatchupFailsMajorityOfTraits`, `noEraFailsEveryScoredTrait`.

## The cluster-record note

the formal cluster record in historical-v6-results.json carries observed and reference as null, because clusterHardFails read t.observed and t.reference while the trait records name those fields subjectMean and referenceMean.

- Consequence: the cluster key reduced to (matchup, side, metric, surface, direction).
- Did it change the adjudication: **false**
- Proof: 12 hard-fail labels · 8 clusters under the as-run key · 8 under the intended key with the real means · the gate requires 0
- Why it was not fixed: the runner's semantics are frozen and the set is consumed. Changing the cluster key after access would make the run INVALID rather than correct it. A coarser key can only merge labels, never split them, so the recorded count is a lower bound and the verdict is identical under both keys.

## Stage two

Synthetic Stress Holdout V2 remains SEALED_UNREAD at access 0. A synthetic stress pass says nothing about a candidate that failed the historical stage.
