# Defensive Matchup Engine 1.0

**Status: DEVELOPMENT.** `defensiveMatchupVersion` **1.0.0**, `DEFENSIVE_MATCHUP_ENGINE_ENABLED`
defaults to **false**. Production remains `engineVersion` **3.2.0**. No `api/` route or UI file
imports this module.

## Why it exists

Traced from code, Phase 6A's defender selection was:

```js
const byPos = defense.players.find((d) => d.position === shooter.position);
return byPos ?? defense.players[shooter.index] ?? defense.players[0];
```

Both teams always field PG/SG/SF/PF/C, so the position match **always** succeeded and assignment was
**always** strictly positional. Magic Johnson chased Stephen Curry because both were labelled PG,
and Scottie Pippen — the best perimeter defender on the floor — was locked onto Larry Bird by label.
The screener defender was whichever defender came first in array order. Full audit:
`current-defense-and-assignment-audit.md`.

## Four layers

```
1. Threat analysis          profiles.js   what problem does each attacker create?
2. Baseline optimization    matrix.js     25 pairings, every dimension retained
                            optimizer.js  exhaustive over all 120 permutations
3. Scheme and help          scheme.js     min(coach intent, era cap, personnel ceiling)
                            plan.js       help responsibilities, era-gated
4. Live state               liveState.js  switches, scrambles, cross-matches, adjustments
                            coverage.js   ball-screen coverage per screen
```

## Determinism

The baseline plan uses **no game randomness**. Same teams, positions, coaches, era and module
versions → same plan and same scheme. Verified: 40 different seeds produce **one** distinct baseline
plan. Switches and adjustments happen later, driven by deterministic possession events from the
simulation seed — never by a separate assignment roll.

The matrix is ordered canonically by card id, so a reordered roster cannot change the plan. Tie-breaks
are explicit: lowest total, then fewest severe mismatches, then fewest major, then the
lexicographically smallest pairing key.

## Position labels are not defensive destiny

The engine distinguishes nominal position, functional offensive role, defensive capability and actual
assignment. Cross-matching is driven by basketball logic and recorded as a fact
(`crossMatched: true`) with a reason code. On the canonical matchup, all five assignments are
cross-matches and Pippen takes Curry.

Sometimes position matching **is** right — Gary Payton on Stephen Curry reports `POSITIONAL_FIT`. It
is an outcome, not a rule.

## What changes in a possession

The engine changes **conditions**, never points:

| Condition | Source |
|---|---|
| shot quality | signed, centred matchup deviation for the relevant shot category |
| turnover pressure | creation containment surplus/shortfall |
| foul pressure | foul-risk exposure plus severe-mismatch presence |
| block pressure | rim-access prevention surplus/shortfall |
| rebound position | rebounding shortfall plus a non-baseline assignment penalty |
| coverage consequence | which concession the chosen coverage made |

**The modifier is centred on the plan's own average.** The possession baseline already accounts for
team defence through team aggregates, so an absolute matchup penalty double-counts it. Measured: the
uncentred modifier averaged **+0.55** and was positive 72% of the time — because all-time offensive
threats exceed even all-time defensive capability on their best dimension — so turning defence **on
raised** scoring, the opposite of defending. Centred, it averages **−0.02**.

## A/B — defence off vs on, same seeds

| | Showtime vs Splash (1990s) | Stoppers vs Spacing (2010s) | Small-ball vs Size (2010s) |
|---|---|---|---|
| Blue FG% | +0.04 | **−0.42** | +1.07 |
| Blue 3PA | −0.1 | +0.9 | +0.6 |
| Blue TO | −0.4 | +0.5 | −0.1 |
| Blue OREB | −0.4 | +0.9 | **+3.6** |
| Gold win% | +9.5 | +6.0 | **−18.0** |

Bidirectional, as it must be. Small-ball defending size is punished on the glass and loses 18% more
often. The goal was never "defence on lowers scoring everywhere" — it was that **specific matchups
change outcomes**.

## Performance

| | |
|---|---|
| plan only (120 permutations, 25 cells) | **0.09 ms** |
| plan including prepared context | 0.36 ms |
| one game with defensive state | **0.80 ms** |
| 1,000 games | ~800 ms |

Comfortably inside the soft targets (plan < 5 ms, game < 100 ms, 1,000 games < 15 s). No AI, network,
research, filesystem or clock access anywhere in the defensive path — grep-enforced, comments
stripped.

## Cache and fingerprint

`defensiveMatchupVersion` joins the development possession-result fingerprint and the
`dev-possession` cache key (`dm1-0-0`). With the flag **off** the key is absent from the fingerprint:
a flag-off game is a Phase 6A game, and claiming a defensive version would be a false reproducibility
claim that invalidated stored games on an unrelated defensive edit.

Plans are **not** network-cached. They are deterministic and cost 0.09 ms; adding KV latency to save
that would be a net loss. The only memoisation is the per-plan modifier baseline, computed once per
plan object.
