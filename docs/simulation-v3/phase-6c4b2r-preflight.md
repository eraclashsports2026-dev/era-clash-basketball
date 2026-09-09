# Phase 6C4B2R preflight

The last point at which stopping was free. Every value below was read from a
repository artifact and compared against a live derivation.

## Candidate 1

| | |
|---|---|
| id | Candidate 1 |
| parent | Candidate 0 |
| commit | `c370182bb805cd068427283ce2b45a7eda725d1c` |
| lock revision | 2 |
| core hash | `de57e1a96e1fd1450d1aea9c5463b0138a56d77bbf58c748ba042e6f78f5c94d` |
| core files | 53 |
| parameter-set hash | `83f5a17dea0c36d4fd64d80a98a5fcd794ff4b7d2adf3dc955bcec0ca6f1b309` |
| parameter changes | 0 |
| calibration version | 1.1.0 |
| selection / lock | SELECTED / LOCKED |
| calibration status | DEVELOPMENT_LOCKED_SCOPED |
| validation attempt status at preflight | NOT_RUN |

Candidate 0 and Candidate 1 legitimately share a parameter-set hash; their authoritative identities differ by core hash, which is what every result, probability, competition and replay identity is keyed on.

## Seals at preflight

| set | access count | access log |
|---|---|---|
| `historical-holdout-v2` | 0 | absent |
| `synthetic-stress-v1` | 0 | absent |
| `historical-holdout-v3` | 1 | present |
| `synthetic-stress-holdout-v2` | 0 | absent |
| `historical-holdout-v4` | 1 | present |
| `historical-holdout-v5` | 0 | absent |

## Compound package v2

20 bound hashes, package hash
`fed02b5c407b5b3888187e1194141fa6380b3a3d189522fdfbd7401f3ad1f5ea`. Every one was re-derived from its live
artifact and compared. Four key names occur on both stages
(`policyHash`, `seedSetHash`, `practicalMarginPolicyHash`, `dryRunArtifactHash`), so
all entries are namespaced by stage and none is lost to a collision.

Both stages reported all ten package dimensions true:

| dimension | stage 1 | stage 2 |
|---|---|---|
| membershipSealed | true | true |
| policyFrozen | true | true |
| marginsFrozen | true | true |
| samplePlanFrozen | true | true |
| seedsFrozen | true | true |
| runnerCertified | true | true |
| transactionSafe | true | true |
| dryRunPassed | true | true |
| commandResolvable | true | true |
| adjudicable | true | true |

## Protocol, as frozen

| | stage 1 — Historical V5 | stage 2 — Synthetic V2 |
|---|---|---|
| units | 8 matchups | 16 fixtures |
| eras | 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s | n/a |
| team-seasons | 16 | n/a |
| surfaces | 3 | 5 |
| pairs per surface | 2048 | varies by surface |
| planned games | 98,304 | 79,444 |
| guardrail keys | n/a | 11 = 8 adjudicable + 3 threshold parameters |
| addressed seeds | n/a | 37,432 |
| seed comparisons | n/a | 51 against 25 prior populations, 0 overlaps |

## Two findings recorded before access

**The Historical V5 command has no `--help` or `--preflight` mode.**
this command offers no --help or --preflight mode. Both flags exit 2 with "--operator and --reason are required" BEFORE any seal contact, so the access delta is 0 and the safety property holds, but the modes are not available. Left unmodified: the V5 runner is about to be opened and its dry-run artifact hash is bound in the compound package, so it is not touched at execution time. Its twelve preflight conditions were instead evaluated independently here.

**The compound-verdict command would have written out of order.**
a read-only --preflight mode was added. Without it an unrecognised flag fell through to the writing path, so --preflight would have issued a compound verdict artifact before either stage had run — an out-of-order write of the very artifact stage three exists to produce. The addition changes no verdict rule, threshold, hash or exit semantics of the writing path; it gates the final write and returns 2 instead.

## Verdict

Preflight **CLEAR**, hash `323df9f90299ad49d5ec88d7894c01274d3a3a3a9b5e2ae5c7f8ffc864bf346a`.
Authorization `30174f6a0d37ae57599ba80b6b3d08bf970e04a6523a8a81c826ea2b50fd7446` permits 3 actions
and forbids 6 classes of change.
