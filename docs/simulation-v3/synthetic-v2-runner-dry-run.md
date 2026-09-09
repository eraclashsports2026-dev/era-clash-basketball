# The Synthetic V2 runner dry run

`npm run syn:dryrun` — **52 checks**, all passing,
5,219 games.

## Nothing is simplified for the rehearsal

| piece | what the rehearsal uses |
|---|---|
| preflight | scripts/validation/synthetic-stress-holdout-v2.mjs preflightChecks() |
| identity | the same buildIdentity() |
| evaluator | the same buildEvaluator(), pointed at the mock set and the dry-run seed stream |
| runner | runSealedSetOnce from scripts/validation/runner.mjs |

What differs: the seal (disposable), the fixtures (non-holdout mock set) and the volumes (low, because the rehearsal proves the path rather than the statistics)

## What it proves

Eight groups: the runner's own preflight against the real artifacts; the dual
gate's pass, fail and abstain behaviour on ceilings, floors, bands and counts;
the catastrophic rule; seed addressing; the transactional runner's six refusal
paths plus crash-and-resume under one access event; the evaluator's output on
every mock member; aggregation; and holdout isolation.

## Two findings from the rehearsal itself

**Volume artifacts are real and now labelled.** At 16 games per surface, six of
eleven members FAILed on win-rate bands with zero failures on the count-based
structural gates — a win rate carries a standard error near 0.125 there. At 128
games per surface every member passes. The default moved to 64 pairs, and a check
now reports which gates failed and why, so a volume artifact is never mistaken
for a fault.

**The unreachable-precondition branch fired.** `mock-role-overlap` is the weakest
five in the pool, so no coherent five sits strictly below it and the construction
claim cannot be posed at all. The rehearsal proves that yields
`NOT_APPLICABLE` with a null observation — no pass credit, no failure
contribution, and never a zero.

## Isolation

| | before | after |
|---|---|---|
| `synthetic-stress-holdout-v2` access | 0 | 0 |
| `historical-holdout-v5` access | 0 | 0 |
| sealed fixtures evaluated | | 0 |
| sealed lineups played | | 0 |

