# Phase 6C3 limitations

## The headline

`historical holdout v3` was opened exactly once and **failed** its frozen policy.
Verdict `HISTORICAL_HOLDOUT_FAILED`, calibration status `HOLDOUT_FAILED`. The
synthetic stress holdout was not opened. No preview was integrated or deployed.

The failure is on a qualitative sub-gate whose measurement I designed badly. The
central quantitative gate — the one this phase existed to answer — passed
decisively.

## What the holdout actually established

**Generalisation.** Internal composite share error 0.04338; holdout composite
share error 0.04339; ratio **1.00026** against a frozen gate of 1.50. Holdout
error is indistinguishable from internal error. The calibration did not overfit
its own folds. This result is valid and independent of the sub-gate defect.

**Structure.** Nine structural gates passed across 32,768 games: zero invariant
failures, zero final ties, replay exact on every fixture, no impossible
statistics, opportunity concentration inside frozen bounds, era rules
authoritative — zero three-point attempts in every pre-three era — zero
catastrophic fixtures, no high-confidence fixture failing, all 8 executed.

## What it did not, and could not, establish

**Historical accuracy at team level.** Of 240 team-level target cells, 216 were
UNAVAILABLE (196 licence-blocked, 20 never recorded in their era) and 24 were
NOT_APPLICABLE season records. Not one scoring, shooting, rebounding, pace or
rating target existed. `pointsPerGame` and `pointsAllowedPerGame` are both
licence-blocked. **The engine's team-level output was never compared to a
historical team-level value, because no authorized one was available.**

**Anything about cross-team matchups.** Every fixture plays a mirror of itself.
That is correct for the Tier C target — it describes a season's internal
distribution, and no opponent targets exist — but it means no result here speaks
to how two different teams interact.

**Nine of forty share maps.** 31 of 40 Tier C share maps were available.
`h3-1976-77-blazers` has none and was evaluated on structure alone, so one of
eight fixtures contributed no numeric evidence at all.

**Fifty-one of fifty-eight identity traits.** The qualitative gate rested on 7
scored traits across 8 fixtures. 51 traits had no predeclared rubric entry and
were recorded unscored, because inventing a rubric after seeing the corpus would
have made the rubric a function of the result.

## The defect that caused the failure

Every fixture plays a mirror of itself, so `pointsPerPossession` and
`opponentPointsPerPossession` are the same quantity: both sides are the same
roster. Across all 8 fixtures they differ by at most **0.00348**.

`ELITE_DEFENSE` requires opponent PPP below the corpus median.
`ELITE_OFFENSE` requires PPP above it. On a mirror surface those are
near-contradictory, and `h3-2012-13-heat` carries both tags — it passed one and
failed the other. All three identity failures are on mirror-ambiguous metrics;
none is on a metric the surface can decide.

More precisely: in a mirror, PPP measures a roster's offence **against its own
defence**. It is a net quantity. It cannot isolate offence, and its complement
cannot isolate defence. A rubric built on either was never going to test what it
claimed.

## What was not done

- **Nothing was re-scored.** The frozen rubric produced these results and the
  verdict stands on them. Re-scoring opened holdout data under a corrected
  rubric is precisely the post-hoc gate movement this phase forbids.
- **No threshold was moved.** The scope-policy hash is asserted by a test.
- **The verdict was not downgraded to `INVALID_RUN`.** Every other gate produced
  a valid result. Reclassifying a FAIL because the failing gate was badly
  designed is the self-serving direction, and taking it unilaterally would be
  indistinguishable from escaping a failure.
- **Candidate 0 was not changed.** Core hash 58c5fb69 and parameterSetHash
  83f5a17d are unchanged, 0 parameters drifted, verified live as well as recorded.
- **The synthetic holdout was not opened.** It remains `SEALED_UNREAD` at access
  count 0 and is still available to a future candidate.

## What is now consumed

`historical holdout v3` is at access count 1. It cannot validate this or any
candidate again, regardless of which label the failure carries. That cost is
real and was incurred by opening it with a sub-gate that could not do its job.

## Errors made in this phase

1. The candidate core manifest was a hand-written list of 28 paths, and 8 of them
   did not exist — I guessed module locations instead of reading them. The
   preflight gate hard-failed, which is what it is for. Replaced with the
   transitive import closure of the engine entry points, which found
   `src/v3/defense` (10 files) and `src/v3/actions` (3) that I would not have
   listed.
2. **The identity rubric was scored on metrics the mirror surface cannot
   distinguish.** This is the error that cost the holdout. I built the rubric
   from the trait vocabulary without asking whether the evaluation surface could
   measure each trait, and a mirror match cannot separate offence from defence.
3. I first read the Suns' `ELITE_OFFENSE` failure as a genuine near-miss on a
   valid metric. It is not: PPP is mirror-ambiguous too. My own artifact's
   classification was right and my verbal reading was wrong.
4. An early availability census checked whether the field *object* was null
   rather than its `.value`, and reported 30 of 30 fields available on all 8
   fixtures. The true figure is 24 of 240 cells, and none of them usable.
5. A sealed-set refusal printed a stack trace rather than a refusal, because the
   seal's error class is not the runner's. Fixed before opening anything.
6. Version key `phase6C3ValidationPackageVersion`-style status errors recurred:
   nothing new registered as PLANNED this phase, but the same care was needed.

### What caught them

The preflight gate caught 1. The dry run caught 5. My own artifact caught 3 —
the script classified the failure correctly while I described it incorrectly,
which is the argument for computing a classification rather than narrating one.
Errors 2 and 4 were caught by reading the data twice, and error 2 only *after*
the holdout was consumed. That is the expensive one, and no process here caught
it in time.

## What must happen before a replacement holdout is opened

1. Fix the identity rubric so no trait is scored on a metric the evaluation
   surface cannot distinguish. On a mirror surface that rules out
   opponent-relative metrics entirely.
2. Decide whether an opponent-relative identity claim is testable at all without
   opponent targets. If it is not, it must not be a gate.
3. Expand the rubric vocabulary, or accept explicitly that the qualitative gate
   covers 7 of 58 traits and weight it accordingly.
4. Freeze the corrected rubric and its reference medians before opening anything.
5. Draw a replacement historical holdout from fixtures this candidate has never
   been evaluated against.

Whether Candidate 0 is re-validated unchanged against a replacement holdout, or a
new candidate is built first, is an owner decision. The generalisation evidence
is strong; the qualitative evidence does not exist yet.
