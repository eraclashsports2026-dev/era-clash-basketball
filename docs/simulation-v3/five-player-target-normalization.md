# Five-player target normalization

EraClash plays five selected players with no bench. Published historical
statistics are full-roster. Those are different quantities, and the store keeps
them apart.

## Policy, in priority order

1. **Actual five-man lineup data** → `ACTUAL_LINEUP_MEASUREMENT`, HIGH confidence.
   Not available for any fixture in this corpus.
2. **Documented starting- or closing-unit data** → the unit's own output.
   Available for effectively one fixture (see fidelity below).
3. **Selected-five season-share proxy** → each selected player's own season or
   decade average, normalised across the five to 100%.
   Marked `SELECTED_FIVE_SEASON_SHARE_PROXY`, **LOW confidence**.

## Why the card-derived proxy is primary here

Measuring the corpus produced an uncomfortable result:

> **Only 1 of 26 fixtures is genuinely the documented starting five of its named
> season** — and it is in the holdout.

`2010s-warriors-movement` is labelled `DOCUMENTED_STARTING_FIVE` for 2015-16 and
contains LeBron James and Nikola Jokić. `2020s-nuggets-hub` matches 1 of 5. Mean
lineup fidelity across the calibration set is **56%**.

So a season-based unit share would describe a five that never existed. Each
player's own decade-card average applies uniformly to all 26 fixtures, and is
already verified against published per-season sources.

**Partial matches produce no season share at all.** Normalising two matched
players to 100% would invent a two-man team, so the season arm is recorded as a
cross-check with an explicit `lineupFidelity`, never as a target.

## Bench contribution is never misrepresented

A team-rate target (pace, ORtg) describes the **full roster**; a selected-five
share describes **five players**. The store keeps these in separate fields —
`teamTargets` and `unitTargets` — and no code converts between them.

Concretely: a player who took 26% of his team's shots in a twelve-man rotation
would take substantially more in a five-man unit with no bench. The proxy
normalises across the five precisely so the two are not compared directly, and
carries LOW confidence because the normalisation is an assumption, not a
measurement.

## What cannot be derived

**Field-goal-attempt share.** Published per-game scoring cannot be split into
field goals and free throws without attempt counts, so
`playerOpportunityShares` and `playerUsageShares` are `null` with a recorded
reason. Scoring share is the closest available validation surface and is a
related but distinct quantity — an efficient player scores more per attempt.

This matters for Phase 6C2A specifically: the phase is about shot-attempt
allocation, and the historical target available is a **scoring**-share proxy.
The register records that gap rather than papering over it.
