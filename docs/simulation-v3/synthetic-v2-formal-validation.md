# Synthetic Stress Holdout V2 — not opened

**This set was not opened in Phase 6C4B2R. It remains `SEALED_UNREAD` at
access count 0, with no access log on disk.**

## Why

Historical Holdout V5 returned FAIL. The frozen stage order forbids opening stage two after a stage-one failure: a synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence.

The stage order is enforced in the runner, not by convention: stage two verifies
that Historical Holdout V5 has been opened and returned PASS on the same
candidate core and parameter set *before* it touches its seal, and exits
`SYNTHETIC_ACCESS_REFUSED` otherwise.

## What remains ready, and what that is worth

The package Phase 6C4B1S certified is intact and unconsumed:
79,444 planned games across
16 sealed fixtures,
11 frozen guardrail keys as
8 adjudicable requirements plus
3 threshold parameters,
37,432 addressed seeds with
0 overlaps across
51 comparisons against
25 prior populations.

That readiness does not transfer to a repaired candidate. A holdout is evidence
only while it is unseen relative to the work being judged. Once a repair phase
targets the traits Historical V5 exposed, Synthetic V2 will have been sitting in
the repository across that repair, and a passing result from it would no longer
be independent of the decisions made to obtain it. Whether it can still serve as
a second-stage gate for Candidate 2 is a judgement for the owner, not something
this phase decides.

## No synthetic artifacts were created

The required artifact list for this phase includes five synthetic outputs. None
exists, because none may: an access event, a run record, fixture results, formal
results and a verdict all presuppose an opened set.
