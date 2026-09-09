# Defensive adjustments, switching and live state

## Assignment states

`BASELINE` · `TEMPORARY_SWITCH` · `SCRAMBLE` · `RECOVERING` · `CROSS_MATCHED` · `COACH_REASSIGNED`

The critical invariant: **a temporary switch never rewrites the baseline.** Only an explicit coach
reassignment changes the plan. Without that separation one broken play in the first quarter silently
becomes the matchup for the rest of the game — which is how Magic Johnson ends up "guarding" David
Robinson for forty minutes with no explanation.

Every temporary state records `{ source, since, recoverTo, mismatchType }` and expires after a bounded
number of possessions. Expired assignments are recovered **before** the next possession resolves.

A switch moves **both** offensive players' defenders. Modelling only one side would leave a defender
covering two men, and a test asserts the current assignment map always holds five distinct defenders.

## Switchability

Depends on **both** defenders: `min(a, b) × 0.65 + mean(a, b) × 0.35`. A pair is only as switchable as
its weaker member, and the limiting player is named in the result.

A switch is also refused when the **size gap it would create** is too large against a real post threat:
switching a 74-inch guard onto a post hub is not a switch, it is a surrender. Reasons returned:
`PAIR_SWITCHABLE`, `PAIR_NOT_SWITCHABLE`, `SIZE_GAP_TOO_LARGE_FOR_POST_THREAT`.

Frequency comes from the coach; **viability comes from the players**.

## Transition cross-matching

In transition a defender takes the nearest credible threat, weighted by whether that defender could
plausibly pick up **that kind** of player — interior weighting against a rim threat, perimeter
weighting otherwise. It is recorded as `CROSS_MATCHED` with `forcedSwitch: "TRANSITION"` and a recovery
target.

This is the legitimate way an unusual matchup appears for a possession or two. A test asserts it never
becomes the permanent baseline.

The first implementation of the pickup weight read `0.4 + perim * 0.4 + height ? 0.2 : 0.2`, which
JavaScript parses as `(...) ? 0.2 : 0.2` — a constant. It was a uniform random pick, not a basketball
one.

## Coach adjustments

**Triggers:** `MATCHUP_REPEATEDLY_BEATEN`, `POST_REPEATEDLY_EXPLOITED`, `PNR_REPEATEDLY_SUCCESSFUL`,
`EXCESSIVE_RIM_PRESSURE`, `SWITCH_MISMATCH_TARGETED`, `HIDDEN_DEFENDER_DRAGGED_IN`.

**Responses:** `CHANGE_PRIMARY_DEFENDER`, `INCREASE_HELP`, `REDUCE_HELP`,
`CHANGE_BALL_SCREEN_COVERAGE`, `INCREASE_DOUBLE_TEAM`, `REHIDE_WEAK_DEFENDER`,
`STOP_SWITCHING_MATCHUP`, `START_SWITCHING_MATCHUP`.

### Evidence, not outcomes

The trigger counts **expected shot quality conceded**, never points. That is what separates *bad
defensive process* from *good defence, difficult shot made*. A test feeds fifteen possessions of shot
quality 2.5 and asserts no adjustment fires; another feeds twelve at 8.4 and asserts one does.

Thresholds: ≥5 events (scaled up for a rigid coach), mean conceded quality ≥6.4, and a **34-possession
cooldown**. At a 12-possession cooldown the engine produced ~3.3 assignment changes per game, which is
not how coaches behave; a real staff makes one or two matchup changes in a night.

### Response is chosen by trigger, not by a fixed ladder

A fixed "swap first, then coverage, then help" ladder meant a personnel swap answered **every**
problem — with five all-time defenders there is almost always a better one available — and the rest of
the taxonomy never fired. It is also bad basketball: you double the post, you change the coverage
against a screen, and you move a matchup only when the matchup itself is the problem.

| Trigger | Preference order |
|---|---|
| post exploited | double team → change defender → increase help |
| PnR successful | change coverage → increase help → change defender |
| excessive rim pressure | increase help → change defender |
| switch mismatch targeted | stop switching that matchup → change defender |
| hidden defender dragged in | rehide → change defender → increase help |
| matchup beaten | change defender → increase help → change coverage |

A personnel swap must clear a real bar (gain ≥2.6, net ≥1.0 after what the candidate gives up on his
own assignment), so it does not simply move the problem.

### Rejections are recorded

When nothing legitimate is available the consideration is stored as `REJECTED` with
`NO_SUPPORTED_ADJUSTMENT_AVAILABLE` and the list of responses that were tried — so *"why didn't the
coach adjust"* is answerable.

Measured behaviour:

| Coach | Era | Applied/game | Rejected/game | Distinct responses |
|---|---|---|---|---|
| Nick Nurse | 2010s | 4.40 | 0.00 | 5 |
| Pat Riley | 1990s | 1.93 | 0.77 | 3 |
| Phil Jackson | 1990s | 1.28 | 2.62 | 3 |

Nurse's modern era permits doubling and free help, so nothing is rejected. Riley and Jackson are in an
illegal-defense era where the double-team response is **unavailable** and help is already at the era
cap — so the era itself rejects adjustments. Jackson's lower adaptability produces the fewest changes.

An adjustment resets the exploitation evidence for that matchup: the next decision must be earned.

## Defensive burden

Tracked implicitly through the existing bounded fatigue model — a non-baseline assignment adds a small
rebound-position penalty and matchup work feeds the same per-possession load. It is deliberately **not**
a large hidden penalty and **not** exposed as a consumer-facing meter.
