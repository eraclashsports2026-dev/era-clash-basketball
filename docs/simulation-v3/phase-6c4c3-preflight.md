# Phase 6C4C3 preflight

Rendered from `data/validation/6c4c3/phase6c4c3-preflight.json` and
`data/validation/6c4c3/candidate2-formal-execution-authorization.json`.

Committed and pushed **before** either seal opened. Historical V6 was opened at
commit `a7d1606c4e134e9d8307b873c335bdfb8c7df237`, which is the preflight commit.

## Candidate 2, as verified from the repository

| Property | Value | Source |
| --- | --- | --- |
| `candidateId` | `Candidate 2` | data/validation/6c4c1/candidate2-lock.json |
| `parentCandidateId` | `Candidate 1` | data/validation/6c4c1/candidate2-lock.json |
| `candidateSelectionStatus` | `SELECTED` | data/validation/6c4c1/candidate2-lock.json |
| `candidateLockStatus` | `LOCKED` | data/validation/6c4c1/candidate2-lock.json |
| `calibrationStatus` | `DEVELOPMENT_LOCKED_SCOPED` | data/validation/6c4c1/candidate2-lock.json |
| `formalValidationStatus` | `NOT_RUN` | data/validation/6c4c1/candidate2-lock.json |
| `possessionCalibrationVersion` | `1.2.0` | src/versions.js |
| `coreHashFromLock` | `3733b648f050a4f5…` | data/validation/6c4c1/candidate2-lock.json |
| `coreHashLive` | `3733b648f050a4f5…` | scripts/v5/coreGraph.mjs, recomputed |
| `parameterSetHashFromLock` | `83f5a17dea0c36d4…` | data/validation/6c4c1/candidate2-lock.json |
| `parameterSetHashLive` | `83f5a17dea0c36d4…` | src/v3/calibration/runtimeParameters.js, recomputed |
| `coreFileCount` | `53` | core closure |
| `lockedAtCommit` | `136b6446a8a65c7b9b551eed120cf0d4aa5078fd` | data/validation/6c4c1/candidate2-lock.json |

## Both sets before access

| Set | State | Access count | Formal outputs |
| --- | --- | --- | --- |
| `historical-holdout-v6` | SEALED_UNREAD | 0 | 0 |
| `synthetic-stress-holdout-v2` | SEALED_UNREAD | 0 | 0 |

## Historical V6 scope, counted from the manifest

| Quantity | Value |
| --- | --- |
| `matchups` | 8 |
| `teamSeasons` | 16 |
| `distinctTeamSeasons` | 16 |
| `eraStyles` | 8 |
| `playerProfiles` | 80 |
| `coaches` | 15 |
| `scoredTraitInstances` | 46 |
| `excludedTraitInstances` | 36 |
| `scoredMetrics` | assistedRate, gamePace, movementShare, orebRate, orebRateAgainst, postUpShare, refPppVsTeam, transitionShare |
| `metricsCertified` | 11 |
| `metricsTotal` | 16 |
| `eligibleTraits` | 53 |
| `decisionTierGames` | 98304 |

## Synthetic frozen registry

| Quantity | Value |
| --- | --- |
| frozen keys | 11 |
| adjudicable behavioural requirements | 8 |
| numeric threshold parameters | 3 |

Phase prose has referred to 'ten conceptual guardrails'. The frozen object holds eleven keys: eight boolean requirements plus three numeric thresholds parameterising two of them. Both prior artifacts (the 6C4B2 preflight and blocker) recorded eleven. All eleven are registered here; the thresholds are classified as THRESHOLD_PARAMETER rather than merged into their parents, so nothing is reinterpreted and the count reconciles with the frozen source rather than with the prose.

## Command surfaces, measured

Each non-accessing mode was actually invoked, with both access logs and the
formal-output file set read before and after.

| Command | Flags | Exit | Sets opened | Formal outputs written |
| --- | --- | --- | --- | --- |
| `validation:historical-v6` | `--help` | 0 | 0 | 0 |
| `validation:historical-v6` | `--preflight` | 0 | 0 | 0 |
| `validation:historical-v6` | `--dry-run` | 2 | 0 | 0 |
| `validation:synthetic-candidate2` | `--help` | 0 | 0 | 0 |
| `validation:synthetic-candidate2` | `--preflight` | 2 | 0 | 0 |
| `validation:synthetic-candidate2` | `--dry-run` | 2 | 0 | 0 |
| `validation:candidate2-formal-verdict` | `--help` | 0 | 0 | 0 |
| `validation:candidate2-formal-verdict` | `--preflight` | 2 | 0 | 0 |

Access counts across this section: historical-holdout-v6 0 → 0 · synthetic-stress-holdout-v2 0 → 0.

## Verification corrections

the first run of this preflight refused on six gates. Every one was this file reading a field name the artifact does not use — a defect in the verification, not in what it verifies. No frozen package, hash, seal, access count or policy was changed to make them pass.

| Gate | Was reading | Actually is | Now checks |
| --- | --- | --- | --- |
| `candidateIdentityCollisionsZero` | candidate2-identity-separation.data.collisions, expecting a number | collisions is an object of named booleans; collisionCount is the number | collisionCount === 0, every named flag false, and replayIdentityDistinct |
| `candidate0And1Preserved` | preservation artifact .pass | the artifacts record drift and alteredInThisPhase; there is no pass field | drift === 0, alteredInThisPhase === false, lockStatus contains LOCKED |
| `candidate2PreservedSincePreparation` | preservation artifact .pass | same | drift, alteredInThisPhase, identityCollisions and parameterChanges |
| `guardrailAndSampleSemanticsUnchanged` | guardrail registry data.outputHash | the artifact hash is the wrapper's top-level outputHash | the wrapper outputHash, which is what the package binds |
| `everyBoundHashEqualsLiveContent` | same | same | same |
| `priorVerdictsUnchanged` | holdout-history .pass | the artifact records sets[] and noArtifactOverwritten | each consumed set's accessCount, formalVerdict and candidateTested, reconciled against its live access log |
| `candidateIdentityCollisionsZero (second correction)` | replayIdentityDistinct === true | that field is prose in this artifact | every replayProbe fingerprint carries possessionCalibrationVersion and possessionEngineVersion 1.2.0 |
| `candidate0And1Preserved / candidate2PreservedSincePreparation (second correction)` | lockStatus as a bare string | some fields in these artifacts are wrapped as {value, source} and some are not, in the same object | an explicit unwrap before every comparison |

## Reconciliation with the phase brief

| Item | Brief expected | Repository | Why |
| --- | --- | --- | --- |
| Vitest tests | approximately 1,793 | 1874 | 1,793 was the full-suite count in Phase 6C4C2 measured BEFORE that phase's own test file was added. Adding its 81 tests gives 1,874. No test was removed. |
| test files | approximately 52 | 53 | the same 6C4C2 test file: 52 + 1. |
| Historical V6 scored trait instances | approximately 45 | 46 | the brief's 45 was reported before Phase 6C4C2's wave-three ingestion replaced the 1950s matchup. The current manifest carries 46. Counted from the manifest, not from prose. |
| Historical V6 profiles / coaches / scored metrics / metrics certified / eligible traits | 80 / 15 / 8 / 11 of 16 / 53 | 80 / 15 / 8 / 11 of 16 / 53 | all match. |
| Synthetic frozen registry | 11 keys / 8 adjudicable / 3 thresholds | 11 / 8 / 3 | all match. |

## Authorization

Permits, and only these:

- Historical Holdout V6 formal access, exactly once
- Synthetic Stress Holdout V2 formal access, exactly once, and only after Historical V6 returns PASS on this same core and parameter set
- compound Candidate 2 formal verdict generation

Does not permit:

- any change to the candidate source, core, parameters, data, coaches, eras or module versions
- any change to a policy, target, margin, seed, reference, trait scope or runner semantic
- post-holdout tuning of any kind
- opening either set a second time
- opening the Synthetic set without a passing Historical V6
- building or deploying a preview, deploying production, activating a production flag, or merging to main
