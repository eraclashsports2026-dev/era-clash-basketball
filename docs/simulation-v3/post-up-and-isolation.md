# Post-up and isolation

These two came first because they are what turn a **detected** mismatch into **exploitation**. Before
them the engine could identify a post mismatch and had no way to attack it — the single biggest
limitation recorded at the end of Phase 6B1.

## Post-up

**Selection** reads coach post tendency, roster post skill and the era's interior value, then rises
with a detected post mismatch scaled by coach willingness. Late-game urgency **lowers** it: a trailing
team hunts a creator, not a post entry.

**Mismatch targeting** searches `POST_MISMATCH`, `SIZE_MISMATCH` and `STRENGTH_MISMATCH` across the
five current assignments and takes the most severe. Measured on a size-vs-small matchup over 40
games: post-ups occur and are attributed to a **named** mismatch in the ledger's `targetedMismatch`.

**The defence answers.** A double team is available only where the scheme carries real double-team
aggression **and** the era permits it — illegal-defense eras double measurably less, asserted by test.
A double concedes the **kickout**: the possession continues through a teammate, which is how a post
mismatch creates weak-side offence. Measured: 391 kickouts from 1,385 post-ups against a small five.

**Outcomes:** `POST_FINISH`, `DOUBLED_FINISH`, `KICKOUT`. A double takes 1.6 shot quality straight
back off the post finish and raises turnover risk by 2.4.

**A mismatch is not an automatic basket.** Asserted: attacked mismatches convert under 75% of the
time, and above 0%.

Post play draws fouls, and a mismatch draws more — foul pressure scales with post threat and mismatch
severity. Post-ups also leave the offence *better* placed for the glass (`reboundEdge +0.06`).

## Isolation

**Selection** reads coach isolation tendency and roster self-creation, rises with a speed, pull-up,
foul-risk or size mismatch (again scaled by willingness), rises with **late-game urgency** — the
opposite of the post entry — and is scaled by floor spacing, because a crowded paint makes driving
isolation worse.

**Defensive context:** the assigned defender, the scheme's help aggression (which *subtracts* from
isolation shot quality), and the named helper.

**Outcomes:** `ISO_ATTACK` and `POST_CONVERSION` — a size mismatch on the perimeter taken into the
post, the same detected advantage attacked from where the creator actually is.

`POST_CONVERSION` was **dead code** on first implementation: the isolation mismatch finder searched
speed, pull-up and foul-risk but not `SIZE_MISMATCH`, so the conversion branch could never fire. A
test caught it.

**Isolation is unassisted by definition** — `assistLikelihood: 0.02`, asserted under 10% in play — and
leaves the offence badly placed for the glass (`reboundEdge −0.12`).

## Neither is universally optimal

A test compares mean expected make across post-up, isolation, pick-and-roll and off-ball screen and
requires the best to be under **1.6×** the worst. A family that were reliably best would make the
choice fake.

## No player-specific logic

The mismatch finders are general. A test greps `families.js` (comments stripped) for card ids and
requires zero matches.
