# Off-ball actions: spot-up, cut, off-ball screen, handoff

## Off-ball screen

The family that makes **movement-shooter chase burden materially real** — the concern raised against
the Phase 6B1 assignment plans.

Identifies shooter, screener, chaser and screener's defender from the assignment plan, then rolls
whether the chaser **navigated**, from his perimeter containment against the shooter's off-ball
movement. That single roll decides who ends up shooting:

- **navigated** → `DENIED`, the screener shoots instead, shot quality 3.6 base
- **beaten** → `CATCH_AND_SHOOT` or `CURL`, shot quality 6.1 base

Measured on a movement lineup against elite stoppers: 381 of 825 screens denied. Both outcomes occur
in every sample — a chase that always works, or never works, would not be a chase.

## Handoff

A hub big handing off above the break is exactly what pulls a rim protector out of the paint, which is
why this family and the paint-availability correction belong in the same phase.

Requires a passer of ≥6 who is ≥78in — a hub, not a guard. Outcomes: `PULL_UP` (the receiver attacks)
and `SLIP` (the hub cuts to the rim behind the handoff, +1.1 shot quality, rim bias 0.6). Measured:
145 slips from 592 handoffs.

## Spot-up

**Emerges from a creation event.** Weight is low on its own and scales with floor spacing and the
era's perimeter shot value. Requires the era to have a three-point line at all.

Outcomes: `CATCH_AND_SHOOT` (assist likelihood 0.72+) and `CLOSEOUT_DRIVE` (0.12). Asserted: over 40%
of made spot-ups carry an assist — a spot-up shooter is created by someone else, and is never used as
a primary creator without evidence.

## Cut

Identifies cutter, passer and the denying defender, then rolls denial from the defender's scheme
versatility. Outcomes `OPEN_CUT` (assist likelihood 0.78+, shot quality 6.8) and `DENIED` (3.4).

Cut types stay **broad** — the data does not support claiming an exact historical play design, so
`cutType` is `null` rather than an invented `BACKDOOR`/`FLASH` label.

## Era behaviour

A pre-three-point era removes the **shot**, not the **action**: spot-ups still occur in a 1960s game,
3PA is 0, and conservation holds. Asserted across 20 games.

## Defensive responses

Every off-ball family reads the assignment plan for its defenders and the plan's help
responsibilities for its helper — `WEAK_SIDE_ROTATION` or `NAIL_HELPER` for perimeter actions,
`LOW_MAN` or `RIM_HELPER` for interior ones. Which of those roles **exists** is gated by era legality,
so an illegal-defense era supplies fewer helpers.
