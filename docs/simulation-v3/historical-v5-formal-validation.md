# Historical Holdout V5 — formal Candidate 1 validation

**Verdict: HISTORICAL_HOLDOUT_V5_FAIL**

Opened once, on 1 access event, by joseph.johnson@indagare.com. Access
count 0 → 1. Run status
COMPLETE, 8/8 matchups,
0 interruptions and 0 resumes. Run hash
`0140e9ad8d0e9ef08683c491d041e0cdbc812db24fa9a65ad42848cc7fedb370`.

## Coverage

| | |
|---|---|
| matchups | 8 |
| eras | 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s |
| surfaces per matchup | TEAM_A_VS_TEAM_B, TEAM_A_VS_ERA_REFERENCE, TEAM_B_VS_ERA_REFERENCE |
| games per surface | 4,096 |
| total games | 98,304 |
| trait instances scored | 74 |
| trait instances excluded as unobservable | 19 |

unavailable and unobservable metrics remain null and excluded. None was converted to zero, none contributed pass credit, and none contributed failure.

## Per matchup

| matchup | era | team A | A share MAE | team B | B share MAE |
|---|---|---|---|---|---|
| `v5m-1950s` | 1950s | Boston Celtics 1957-58 | n/a | Minneapolis Lakers 1950-51 | n/a |
| `v5m-1960s` | 1960s | San Francisco Warriors 1966-67 | n/a | Boston Celtics 1960-61 | n/a |
| `v5m-1970s` | 1970s | Los Angeles Lakers 1972-73 | n/a | Boston Celtics 1975-76 | n/a |
| `v5m-1980s` | 1980s | Los Angeles Lakers 1984-85 | n/a | Boston Celtics 1983-84 | n/a |
| `v5m-1990s` | 1990s | Chicago Bulls 1992-93 | n/a | Seattle SuperSonics 1995-96 | n/a |
| `v5m-2000s` | 2000s | Phoenix Suns 2004-05 | n/a | Dallas Mavericks 2002-03 | n/a |
| `v5m-2010s` | 2010s | Los Angeles Clippers 2013-14 | n/a | San Antonio Spurs 2015-16 | n/a |
| `v5m-2020s` | 2020s | New York Knicks 2020-21 | n/a | Philadelphia 76ers 2020-21 | n/a |

## Numeric result

| | |
|---|---|
| team surfaces scored | 13 |
| holdout composite share MAE | 0.03741 |
| internal baseline mean | 0.0431 |
| ratio | 0.86789 |
| ratio gate | ≤ 1.5 |
| catastrophic threshold | 0.13038 |
| catastrophic teams | 0 |

The numeric side passed comfortably: the holdout composite is *below* the
internal baseline, so Candidate 1 reproduced these unseen team-seasons' shot
and action shares slightly better than it does its own development corpus.

## Trait result

| | |
|---|---|
| scored | 74 |
| passed | 58 |
| failed | 16 |
| pass rate | 0.78378 |
| minimum pass rate | 0.75 |
| hard failures | 3 instances / 2 distinct measurements |
| soft failures | 13 |

of 16 failing trait instances, 13 are inside their metric's practical margin and 3 are both statistically opposite and beyond it. Only the latter are hard failures. Phase 6C4A withdrew four of Historical V4's twelve hard failures as sub-margin artifacts; the margin is doing the same work here, in the other direction.

3 hard-failing trait instances resolve to 2 distinct measurements: ELITE_DEFENSE and "elite team man defence" are both keyed on refPppVsTeam on the same surface for the same team, so they report one observation twice.

### The hard failures


**1. Dallas Mavericks 2002-03 — `ball movement, drive and kick, corner threes`** (v5m-2000s, 2000s, teamB)

| | |
|---|---|
| metric | `assistedRate` |
| required direction | ABOVE_REFERENCE_BASELINE |
| surface | VS_ERA_REFERENCE |
| subject mean | 0.44784 |
| reference mean | 0.4763 |
| difference | -0.02846 |
| z | -17.03917 |
| 95% CI | [-0.03173, -0.02519] |
| practical margin | 0.02 |
| beyond margin | true |
| statistically opposite | true |
| reported state | PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED |


**2. New York Knicks 2020-21 — `ELITE_DEFENSE`** (v5m-2020s, 2020s, teamA)

| | |
|---|---|
| metric | `refPppVsTeam` |
| required direction | BELOW_REFERENCE_BASELINE |
| surface | REFERENCE_VS_TEAM |
| subject mean | 1.36011 |
| reference mean | 1.32206 |
| difference | 0.03805 |
| z | 14.84653 |
| 95% CI | [0.03303, 0.04307] |
| practical margin | 0.02 |
| beyond margin | true |
| statistically opposite | true |
| reported state | PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED |


**3. New York Knicks 2020-21 — `elite team man defence`** (v5m-2020s, 2020s, teamA)

| | |
|---|---|
| metric | `refPppVsTeam` |
| required direction | BELOW_REFERENCE_BASELINE |
| surface | REFERENCE_VS_TEAM |
| subject mean | 1.36011 |
| reference mean | 1.32206 |
| difference | 0.03805 |
| z | 14.84653 |
| 95% CI | [0.03303, 0.04307] |
| practical margin | 0.02 |
| beyond margin | true |
| statistically opposite | true |
| reported state | PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED |


### The soft failures, for contrast

Each of these is in the wrong direction but inside its metric's practical
margin, so none decides anything.

| matchup | team | trait | diff | margin | beyond margin |
|---|---|---|---|---|---|
| `v5m-1950s` | Boston Celtics | `ELITE_DEFENSE` | 0.0009 | 0.02 | false |
| `v5m-1970s` | Los Angeles Lakers | `ELITE_DEFENSE` | 0.01432 | 0.02 | false |
| `v5m-1970s` | Los Angeles Lakers | `elite team man` | 0.01432 | 0.02 | false |
| `v5m-1980s` | Los Angeles Lakers | `PASSING_HUB` | -0.0124 | 0.02 | false |
| `v5m-1980s` | Boston Celtics | `POST_HEAVY` | -0.00482 | 0.03 | false |
| `v5m-1980s` | Boston Celtics | `half-court execution, elite passing front line` | -0.0107 | 0.02 | false |
| `v5m-1990s` | Chicago Bulls | `triangle: post reads, cuts, spacing` | -0.00138 | 0.03 | false |
| `v5m-2000s` | Dallas Mavericks | `ZONE_CAPABLE` | 0 | 0.05 | false |
| `v5m-2000s` | Dallas Mavericks | `zone-capable, scheme-heavy` | 0 | 0.05 | false |
| `v5m-2010s` | Los Angeles Clippers | `fast` | -0.79569 | 1 | false |
| `v5m-2010s` | San Antonio Spurs | `ELITE_DEFENSE` | 0.01648 | 0.02 | false |
| `v5m-2010s` | San Antonio Spurs | `elite team man defence` | 0.01648 | 0.02 | false |
| `v5m-2020s` | Philadelphia 76ers | `SIZE_HEAVY` | -0.00314 | 0.02 | false |

## Gates

| gate | result |
|---|---|
| everyMatchupExecuted | PASS |
| zeroInvariantFailures | PASS |
| zeroFinalTies | PASS |
| zeroImpossibleScores | PASS |
| zeroPreThreeEraThreePointAttempts | PASS |
| replayExactEverywhere | PASS |
| compositeRatioWithinPolicy | PASS |
| zeroCatastrophicTeams | PASS |
| traitPassRateMet | PASS |
| zeroTraitHardFails | **FAIL** |
| noMatchupFailsMajorityOfTraits | PASS |

## Why FAIL and not INVALID_RUN

the run completed all eight matchups under one access event with zero invariant failures, zero impossible scores, zero final ties and exact replay everywhere. The apparatus worked; the candidate did not clear a frozen gate. That is a FAIL, not an INVALID_RUN.

there is no conditional pass, no near pass and no waiver. One frozen gate failed, so the verdict is FAIL.

Verdict hash `232d9b84d639b3842d223f8adae25f4692686c8ffc0227263dccd1e50bf32b50`.

## Consequence

Synthetic Stress Holdout V2 must NOT be opened. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence.
