# Synthetic stress holdout v2

**`SEALED_UNREAD`. Comparison access count: 0.**

16 fixtures, hash `71267875cbf69a9f`, manifest at
`data/calibration/synthetic-stress-holdout-v2-manifest.json`.

## Why a v2 was necessary

`synthetic-stress-v1` was reported by Phase 6C2B as a sealed holdout. It was
not. 19 of its 25 fixtures had simulated output in committed Phase 6C2A
artefacts; the seal was created after those runs, under the fixtures' original
corpus-v1 identities, so its counter truthfully read 0 while the set itself had
been extensively inspected.

That set is now classified `PREVIOUSLY_INSPECTED_ARCHIVE` rather than deleted or
quietly re-sealed. Re-sealing it would have reproduced the original error with a
fresh counter; deleting it would have erased the evidence that the error
happened.

v2 was constructed in this phase, from fixtures with no prior simulated output
anywhere in the repository.

## Composition

16 fixtures covering constructions the engine is expected to find hard:
`ss2-all-bigs`, `ss2-all-guards`, `ss2-coach-toolkit-edge`,
`ss2-duplicate-role`, and 12 others.

Zero fixture-id and zero lineup overlap with `synthetic-development-v2`,
asserted by test.

## Rules

- No engine output from this set may be inspected before a formal validation
  phase opens it.
- Opening it requires an explicit decision, a recorded reason, and a version bump.
- The access counter is necessary but not sufficient. `statusInconsistencies()`
  additionally asserts that no set claiming `SEALED_UNREAD` has simulated output
  anywhere in the repository — the check that would have caught the v1 error.
