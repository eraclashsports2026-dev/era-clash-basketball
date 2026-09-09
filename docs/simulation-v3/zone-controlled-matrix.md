# Zone controlled matrix

`npm run calibration:zone-matrix` · `.cache/calibration/zone-matrix.json`

## Design

Both teams attack **and** defend inside a game, so every metric is reported per
**named side** and the shell is recorded per side. Seeds are identical across
conditions; only the zone flag varies.

## The side-attribution guard

Phase 6C1 read the zone deltas against the wrong side, which inverted the
conclusion. A guard now makes that impossible to repeat:

> **ZONE_ATTACK possessions must belong to the side FACING a shell, never the
> side holding one.**

It also asserts the converse — a side that holds a shell must have its opponent
attacking one. The guard caught a flaw in my own first design (which assumed one
team attacks and the other defends) before it reached a conclusion. Current
result: **0 violations**.

No row uses a label like "zone team ORtg" without naming who has the ball.

## Era gating

| Eras | Shells selected | Δ win rate | Δ ORtg |
| --- | --- | --- | --- |
| 1950s–1990s (5) | **0** | **0.000** | **0.0** |

Zone was illegal until 2001-02, and the delta is *exactly* zero — not
approximately zero. Era gating is correct.

## Where zone is legal

Only one coach in the corpus selects a shell (Erik Spoelstra, a 2-3). Every
other 2000s/2010s/2020s coach declines it — a **coach** decision, not a rules
decision.

Measured in both directions of the same matchup:

| Condition | Attacking team ORtg | Attacking team ORB% |
| --- | --- | --- |
| vs MAN | 108.4 | 0.236 |
| vs 2-3 zone | **113.3** | **0.312** |
| *(mirror)* vs MAN | 108.7 | 0.239 |
| *(mirror)* vs 2-3 zone | **113.9** | **0.306** |

**Facing a 2-3 costs roughly +5 offensive rating and +7 points of offensive
rebounding conceded**, confirmed in both directions. The Phase 6C1 finding of a
+38% offensive-rebound concession is **general to the shell**, not
matchup-specific — but it still rests on one zone-capable coach, so it is
personnel-limited rather than proven across shells.

## What could not be tested

The corpus contains exactly one zone-capable coach, so **3-2, MATCHUP,
BOX-AND-ONE and TRIANGLE-AND-TWO were never selected** and remain untested. The
matrix runs them the moment a fixture's coach carries them. This is a corpus
limitation, reported rather than papered over.

## Correction policy

No zone coefficient was changed. The measured deltas describe a real structural
tradeoff (a zone rebounds worse because defenders guard areas, so nobody owns a
box-out), and the magnitude question is deferred to Phase 6C2B. No universal
zone bonus exists.
