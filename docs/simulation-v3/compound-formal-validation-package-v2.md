# Compound formal validation package v2

The 6C4B2 blocker's last key: "the Phase 6C4B2 validation package binds V5
hashes only — it names no synthetic manifest, policy, seed or seal hash, so
there is no recorded expectation to verify the synthetic package against."

## Both stages bound

| | stage 1 | stage 2 |
|---|---|---|
| set | `historical-holdout-v5` | `synthetic-stress-holdout-v2` |
| seal state | SEALED_UNREAD | SEALED_UNREAD |
| access count | 0 | 0 |
| bound hashes | 6 | 14 |
| dry run | PASS | PASS |
| planned games | 98,304 | 79,444 |

`packageHash` fed02b5c407b5b38... over 20 bound
hashes.

## A binding bug worth recording

The first version of this package merged the two stages' hash objects flat. Four
key names exist on both stages — `policyHash`, `seedSetHash`, `practicalMarginPolicyHash`, `dryRunArtifactHash`
— so the merge bound stage two's values under stage one's names and left stage
one unbound entirely. The package hash covered 16 entries where it should have
covered 20.

That is the same class of silent binding gap this package exists to close. Every
entry is now namespaced by stage, and two gates check that the count adds up and
that every stage-one hash is still bound to its own value.

## The superseded package

`data/validation/6c4b1/phase6c4b2-validation-package.json` is marked `SUPERSEDED_INCOMPLETE` and left
untouched on disk. the original file is left exactly as the earlier phase wrote it. It is the record of what that phase actually had, and rewriting it would erase the evidence that the gap existed.

## The compound verdict rule

1. both stages must run; one stage is not a compound verdict
2. both stages must have scored the same candidate core and parameter set
3. any stage FAIL gives STAGE_FAILED
4. any stage INVALID_RUN with no FAIL gives INVALID_RUN
5. otherwise BOTH_STAGES_PASSED

## What both stages passing does not authorize

It does not make Candidate 1 HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and it authorizes no preview or production deployment. Each of those statuses belongs to the phase that earns it, and production activation requires an explicit CEO GO LIVE.

