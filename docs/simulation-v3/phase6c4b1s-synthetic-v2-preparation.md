# Phase 6C4B1S — Synthetic V2 formal execution package

Preparation only. Neither holdout was opened; both remain `SEALED_UNREAD` at
access count 0.

## Why the phase existed

Phase 6C4B2 was an execution phase. It stopped at preflight, because the
Synthetic Stress Holdout V2 second-stage package could not be run: fixtures,
guardrails and seal existed and were frozen, but there was no seed set, no
per-fixture volume, no aggregation rule, no runner and no dry run. Rather than
spend Historical V5 — a one-shot resource — for a stage-one result inside a
validation defined by both stages passing, it recorded a blocker and stopped.

This phase built the missing package. Every one of the blocker's six keys is
closed, and the register that says so reconciles against the blocker artifact
itself rather than against a restatement of it.

## Seven things measurement found that reasoning had missed

The substantive work of the phase was not writing the package. It was finding
out, by measuring, that several parts of the obvious design were wrong.

**The rating basis.** The guardrails speak of OVR. OVR is `src/rating.js` — the
position-weighted rating the product computes and shows. An earlier draft used a
summed-stat proxy invented here. A calibration ladder exposed it: a five the
proxy rated 1.75x higher **lost about 60% of games in all three eras**, because
the proxy weighted accolade counts while the engine responds to position-weighted
production and lineup balance. Every surface, control and derived threshold moved
to `teamRating` and `slotRating`.

**The talent surface could not isolate talent.** Targeting a rating level and
letting a search return any five that reaches it lets the search change the
*construction*, which is the other axis under test. The strong side is now built
by upgrading the fixture slot by slot, preserving position and functional role.
On the development set 13 of 14 upgrades win; the single exception has the
smallest upgrade in the set and falls below the 1.25x precondition.

**A mirror cannot decide the shell guardrail.** With one coach on both sides,
both defences draw zone with equal probability, so the "zoning side" is whichever
happened to draw more. Measured on four development fixtures: 0.499, 0.521,
0.523, 0.505 — pinned to 0.5 by construction, where the frozen band [0.35, 0.65]
can neither fail nor pass on evidence.

**Coherence has to be a hard constraint, not a tie-break.** Interior scoring is
the scarce requirement: 16 of 292 non-holdout cards reach `postThreat` 5.5, and a
rating-targeted beam prunes them away before coherence is evaluated. The first
control builder returned 0 of 5 coherent controls.

**A control can land on the wrong side of the rating it is meant to be below.**
`sd2-extreme-small` is rated below what a coherent five can cost, so an
unconstrained search returned a "lower" control at ratio 1.143 with a 0.777 win
rate that would have read as construction beating talent when it was simply the
better team winning.

**The compound package silently dropped four hashes.** The two stages share four
hash key names, so a flat merge bound stage two's values under stage one's names
and left stage one unbound entirely — the package hash covered 16 entries where
it should have covered 20. That is precisely the class of silent binding gap the
blocker was raising about the earlier package.

**A dry run at 16 games per surface fails on noise.** Six of eleven mock members
FAILed win-rate bands with zero failures on the count-based structural gates; a
win rate carries a standard error near 0.125 there. At 128 games per surface
every member passes.

## Judgement calls, recorded rather than hidden

- **Eleven guardrail keys, not ten.** The frozen object holds eleven: eight
  boolean requirements plus three numeric thresholds. Both the brief and the
  blocker's own note say ten. Merging the thresholds into their parents reaches
  ten but silently reinterprets a frozen object, so all eleven are registered and
  the discrepancy is recorded.
- **The construction floor is weak, and says so.** A coherent control at 80% of
  the fixture's rating won between 0.088 and 0.926 on non-holdout fixtures — a
  spread driven by which construction it faced, which is the thing the guardrail
  is about. Any demanding floor would fail legitimate constructions, so the
  substantive claim moved to a set-level existential bar. The frozen key says
  construction *can* beat higher OVR; "can" is an existential claim.
- **The talent floor was clamped.** The rule derived 0.476, which would have said
  a substantially upgraded five is allowed to lose. Clamped to 0.5, with both
  values recorded.
- **Zero fixture failures tolerated.** A failure budget would weaken a frozen
  numeric threshold. Noise is handled by the margin instead.
- **Three development fixtures excluded from the mock set**, each one
  substitution from a sealed five.

## What is now true

The package is complete and certified: 17 artifacts, 13 documents, 52 dry-run
checks on the exact runner, three commands certified non-accessing by execution,
20 hashes bound across both stages, and a seed domain proven disjoint against 25
prior populations at 65,536 seeds per stream.

## What is not

Candidate 1 carries no formal holdout verdict. Neither stage has run. A complete
execution package is not a validated candidate, and nothing here claims
`HOLDOUT_VALIDATED`, `PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_READY` or `ACTIVE`.
No preview or production deployment occurred, and production activation requires
an explicit CEO `GO LIVE`.

## The execution order, enforced in code

1. `npm run validation:historical-v5` with its unlock flags
2. only if stage one returns PASS: `npm run validation:synthetic-v2`
3. `npm run validation:candidate1-formal-verdict`

Stage two's runner verifies stage one returned PASS on the same candidate core
and parameter set *before* touching its seal, exiting `SYNTHETIC_ACCESS_REFUSED`
otherwise. The order cannot be got wrong by accident.
