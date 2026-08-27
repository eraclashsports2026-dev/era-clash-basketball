# Superseded Phase 6C4B1 artifacts

These are preserved, never deleted, because they record what was true when
they were issued.

## `historical-v5-selection-v1.0.0-INVALIDATED.json` and its policy

The V5 runner dry run found that the Candidate 1 era-reference certification
stored its self-baselines keyed by SAMPLE FIELD (`ppp`, `possessions`) while
`scoreTrait` — the function the V5 runner calls — looks baselines up by METRIC
ID (`pppVsReference`, `gamePace`). Every trait would have scored
`NOT_APPLICABLE` on the one-time V5 run.

Re-issuing the reference certification changed its artifact hash, and the
acceptance policy binds that hash. The frozen-policy rule is that a policy may
not be re-frozen after a selection exists, so the prescribed remedy applied:
**invalidate the selection, re-freeze the policy, increment the selection
version, and re-run selection before sealing.**

Nothing about the pool changed — its hash is identical across both runs — so
the re-selection is expected to reproduce the same eight matchups. That it
does is recorded in the new selection artifact as a determinism observation,
not assumed.

## `historical-holdout-v5-manifest-v1-INVALIDATED.json`, `...-seeds-v1-INVALIDATED.json`

Downstream of the invalidated selection: both bound the superseded selection
hash, so both were re-issued rather than edited.
