# Phase 6C2A limitations

What this phase did **not** establish.

## No parameter calibration exists

Structural defects were corrected; **no coefficient was tuned**.
`possessionCalibrationVersion` remains `null` / PLANNED, and the cache-key
builder for calibrated results still throws by design.

## The engine is not accurate

Status: **DEVELOPMENT — CALIBRATION REQUIRED**. Team FG% remains above its era
in seven of eight eras, shot location is too interior (58.6% rim-or-paint),
zone fires on ~55% of possessions where real usage is low single digits, and
three cards still average over 45 points per game.

## The historical error surface is still thin

Tier A coverage is **48 fields** (team win-loss records) across 16 fixtures.
**Tier B is zero** — no advanced team metric could be sourced under an
acceptable licence. Tier C is a **LOW-confidence scoring-share proxy**, not the
shot-attempt share this phase actually changed.

So the structural corrections were validated primarily against **internal
consistency and the era environment**, not against published team-season data.

## Findings that rest on thin samples

| Finding | Sample | Status |
| --- | --- | --- |
| Zone concedes ~+7 points of ORB% | **1 zone-capable coach** | directional, confirmed in both directions |
| 3-2, MATCHUP, BOX-AND-ONE, TRIANGLE-AND-TWO | **never selected** | untested |
| Real-roster shooting hierarchy | **1 of 8 eras** | controlled arm covers all 8 |
| Coach identity signatures | 1 fixture per coach | directional |

## Not measured at all

- **Probability calibration.** The engine emits no pregame win probability on this path.
- **The holdout.** `SEALED_UNREAD`, access count 0. Nothing here says anything about generalisation.
- **Bench, rotations, foul-outs, substitutions.** Deferred; `rotationDepth` stays `RESEARCH_ONLY`. Every result comes from five-man lineups, which inflates per-player usage relative to a real rotation — a real caveat on the remaining concentration, though not enough to explain all of it.

## Deliberately not done

No broad coefficient tuning · no global shooting nerf · no post-up nerf · no
universal zone bonus · no hard FGA cap · no tuning against the holdout · no
module promoted to production · no public exposure · no fabricated data · no
increase in simulation randomness to widen an error bar.

## Corrections to earlier phases, recorded

Two Phase 6C1 conclusions were wrong and are corrected here rather than quietly
carried forward:

1. **basketball-reference was recorded as HTTP 403.** It is reachable; the real
   barrier is a terms-of-use prohibition on AI/model use. The remedy is a
   licence, not engineering — and recording the wrong reason would have sent
   this phase building a scraper that must not exist.
2. **The zone deltas were read against the wrong side.** A guard now makes that
   impossible.

Three errors of my own in this phase are recorded in the commit history for the
same reason: a no-op reordering of commutative multiplications, an
allocator-versus-anchor hypothesis that measurement disproved, and re-creating
the unbounded-fit anti-pattern that an earlier phase had already fixed.

## Interpretation warnings

**Fixture lineup labels overstate fidelity.** Only 1 of 26 fixtures is the true
documented five of its named season. Labels were **not** rewritten — editing the
corpus is a decision of its own and must never be made to improve a result.

**Style comparisons are not statistics.** Anything drawn from
`qualitativeIdentity` is labelled `DOCUMENTED_STYLE_COMPARISON`.

**Lower scoring is not by itself success.** The delta report states the
tradeoffs, including a three-point rate that now overshoots in the 2010s where
it was previously accurate.
