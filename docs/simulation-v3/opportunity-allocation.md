# Opportunity allocation

`src/v3/actions/opportunityAllocation.js` · `opportunityAllocationVersion` **1.0.0** · DEVELOPMENT

Who receives each offensive opportunity.

## The model

```
  team usage plan
+ role fit for THIS action
+ bounded mismatch bias
+ coach system
+ game state
+ seeded game form
- soft opportunity saturation
= selection weight
```

Every term is bounded and multiplicative, so no single term drives a weight to
zero or to infinity, and **no player is ever made ineligible**.

## What it replaced

Three families selected their shooter as `mism ? mism.player : rng.weighted(...)`.
That is not a bias, it is a **replacement**: when a mismatch existed the
weighted draw was skipped entirely and one player was chosen deterministically,
every possession, across every seed.

A 7'2" centre has a post mismatch against most lineups, so the condition held
nearly always. Measured: **100.0% of post-ups and 99.9% of isolations** to one
player, 57.2% of the team's shots.

## Separate dimensions

Six, kept apart because they are genuinely different jobs:

| Dimension | Meaning |
| --- | --- |
| `touch` | how often the ball reaches him at all |
| `creation` | how often he initiates |
| `shotAttempt` | how often he finishes with a shot |
| `finishing` | how often he converts someone else's creation |
| `passing` | how often he is the assist source |
| `offBall` | how often he is the off-ball action target |

A passing hub has a high touch target and a modest shot target. Collapsing these
into one distribution is how the best interior player came to own every shot.
Passer, screener and shooter are drawn separately, with the shooter excluded, so
a player never passes to himself and a hub never becomes a shot monopoly.

## Targets are expectations, not limits

Every dimension normalises to exactly 1 across the five. Nothing refuses a
player an opportunity for exceeding his target; the target sets the point at
which saturation begins to push back.

## Soft saturation

```
ratio  = realized share / target share
above  = ratio ^ -1.35,  floored at 0.16
below  = 1 + (1 - ratio) × 0.35,  capped at 1.35
```

- **Smooth and monotone.** No step collapses a weight; no cliff exists.
- **Never zero.** A player at four times his target still draws at 0.16. A real
  mismatch late in a real game is a reason to keep going to him.
- **Modest lift below target**, capped — an over-correction just inverts the
  problem.
- **Inert for the first 8 possessions.** Three possessions into a game a
  "share" is noise, and reacting to it would fight the plan rather than
  implement it.

There is no `if (share > X) reject` anywhere. A hard cap would produce a visible
ceiling and kill the outlier games that make a matchup interesting.

## Mismatch bias

| Severity | Multiplier |
| --- | --- |
| SEVERE | 2.6 |
| MAJOR | 2.0 |
| MODERATE | 1.55 |
| MINOR | 1.25 |

Bounded, severity-graded, **action-specific** (a post mismatch is a reason to
post up, not to shoot a spot-up three), and it carries a reason string. It
applies only to the player who actually has the mismatch.

## Seeded game form

A hot or cold night in `[0.82, 1.18]`, scaled by the player's volatility.

Derived from the game seed and the player id **before any outcome**, and
memoised, so a player who makes his first two shots cannot thereby earn more
shots. That runaway loop is the thing this design exists to prevent. Form draws
from a separate RNG stream, so adding form does not shift any other draw.

## No silent fallback

`rng.weighted` previously returned `items[0]` when every weight was invalid.
That made a NaN bug indistinguishable from a modelling decision, and it hid a
defect that gave one player 3,749 attempts in an 80-game sample. It now throws,
and `selectForOpportunity` throws too rather than defaulting to the first
player.

A related trap was removed in the same pass: weights were floored at `1e-6`
unconditionally, which turned a NaN into a valid tiny weight and made the guard
**unreachable**. Only finite weights are floored now — a safety net that cannot
fire is worse than none, because it reads as protection.

## A latent order-dependence, found and fixed

`prepareTeam` paired the canonical usage plan with the caller-ordered roster
**by index**:

```js
const rawShares = ti.usagePlan.map(...);
players = profiles.map((p, i) => ({ usageShare: rawShares[i] / total }));
```

Every corpus fixture happens to already be in canonical order, so no stored
result was affected — but reversing a roster moved a player's shot share by
**9.8 percentage points** against a **0.24pp** control (same order, different
seeds). Now keyed by card id: **0.41pp**, inside the noise band.

## Measured effect

Across 4,560 team-games on the calibration set, allocation off → on:

| | Before | After |
| --- | --- | --- |
| Leading FGA share, mean | 0.387 | **0.322** |
| Leading FGA share, p95 | 0.562 | **0.408** |
| Leading FGA share, max | 0.702 | **0.551** |
| Top-two combined | 0.620 | **0.563** |
| Usage entropy (max 2.322) | 2.09 | **2.20** |
| Players with ≥8% of shots | 4.50 | **4.79** |

Per family, on the 1970s Bucks fixture:

| Family | Before | After |
| --- | --- | --- |
| POST_UP | **100.0%** | 68.0% |
| ISOLATION | **99.9%** | 50.3% |
| Mismatch-flagged possessions | **100.0%** | 62.5% |

Team shares: Kareem 57.2% → **41.1%**; Oscar Robertson 11.9% → **16.0%**;
Marques Johnson 13.2% → 18.7%; Lou Hudson 10.5% → 14.7%; Curtis Perry 7.3% →
9.5%.

An extraordinary game is still reachable: the maximum single-game share across
200 seeds remains above 0.45, so a severe mismatch can still produce a huge
night — just not on every seed.

## Still outstanding

41% for a dominant centre with a standing severe mismatch remains above the
~25–30% a real primary option sustains. Some of that gap is structural — these
are five-man lineups with no bench, where an even split is 20% — but not all of
it. Recorded in the priority register rather than tuned here: this phase fixes
**who receives** opportunities, and coefficient tuning is Phase 6C2B.
