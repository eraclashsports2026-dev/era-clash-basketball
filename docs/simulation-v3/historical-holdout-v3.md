# Historical holdout v3

**`SEALED_UNREAD`. Comparison access count: 0.**

8 fixtures, one per era, hash `9e799c4bfc84eedf`, manifest at
`data/calibration/historical-holdout-v3-manifest.json`.

## Composition

One fixture per Era Style, drawn from 7 franchises with 8 distinct coaches and 18
style tags. Selection maximised coverage of era, franchise, coach and style
rather than being random: a random 8 of 32 could easily have duplicated a
franchise or missed an era, and a holdout that does not span the space cannot
detect era-specific overfitting.

Zero fixture-id overlap and zero lineup overlap with `historical-calibration-v3`
(24 fixtures, `AVAILABLE_FOR_TUNING`). Both are asserted by test, not by
inspection — the same five players under two different fixture ids would defeat
the split while passing an id check.

## The seal

`src/v3/calibration/holdoutSeal.js` counts comparison accesses. The count is 0
and must remain 0 until a formal validation phase deliberately opens it.

Phase 6C2C1 ran **no** possession-engine comparison against this set. Every
probability estimate and validation cell in this phase comes from
`synthetic-development-v2`.

## Why the counter is not sufficient on its own

Phase 6C2B reported `synthetic-stress-v1` as `SEALED_UNREAD` with a count of 0.
**That report was wrong.** 19 of that set's 25 fixtures had simulated output
sitting in committed Phase 6C2A artefacts. The counter read 0 because the seal
was created *after* those simulations ran, under the fixtures' original
corpus-v1 identities — so the counter was accurate about its own lifetime and
misleading about the set.

The lesson generalises: a counter can only observe accesses that occur after it
exists. `data/calibration/set-status.mjs` therefore records, for every set,
whether it has *ever* been simulated, independent of the counter, and
`statusInconsistencies()` asserts that no set claiming `SEALED_UNREAD` has
simulated output anywhere in the repository.

Under that stricter test, `historical-holdout-v3` is genuinely unread: it was
created in this phase, and no artefact in the repository contains its output.

## Rules

- Do not tune the 53 registered parameters against this set.
- Do not report metrics computed on it as calibration progress.
- Do not open it to diagnose a calibration failure — that is tuning with extra
  steps.
- Opening it requires an explicit decision, a recorded reason, and a version bump.
