# Current shot-opportunity audit

Phase 6C2A Workstream 2, Part 12. Written **before** any change, because a fix
aimed at the wrong mechanism would have moved the headline number without
fixing anything.

## The measurement

1970s Bucks fixture, 150 games, 15,209 offensive possessions that produced a
shot. Who took it, by action family:

| Family | Possessions | Leading player's share |
| --- | --- | --- |
| **POST_UP** | 3,917 | **100.0%** |
| **ISOLATION** | 1,763 | **99.9%** |
| PICK_AND_ROLL | 2,635 | 30.7% |
| TRANSITION | 2,039 | 31.4% |
| GENERIC_HALF_COURT | 1,671 | 29.1% |
| OFF_BALL_SCREEN | 1,669 | 30.8% |
| CUT | 1,515 | 37.2% |

Split by whether the possession was flagged as targeting a mismatch:

| | Possessions | Kareem's share |
| --- | --- | --- |
| Mismatch-flagged | 5,680 (37.3%) | **100.0%** |
| Not mismatch-flagged | 9,529 (62.7%) | 31.6% |

Resulting team share: Kareem 57.2%, Marques Johnson 13.2%, Oscar Robertson
11.9%, Lou Hudson 10.5%, Curtis Perry 7.3%.

## Root cause

Three families select their shooter like this:

```js
const poster = mism ? mism.player : rng.weighted(offense.players, usageWeighted(...));
```

When a mismatch exists, the ternary **replaces** the weighted draw with a single
deterministic player. There is no randomness, no saturation, and no path by
which a teammate is ever considered. The same player is selected on every such
possession, for the entire game, across every seed.

And a mismatch is not rare. A 7'2" centre has a post mismatch against most
defenders in most lineups, so the condition holds nearly always — which is why
the share is 100.0% rather than merely high.

**The usage machinery was never the problem.** `usageWeighted` works: every
family that reaches it lands at 29–37%, which is high for a dominant player but
structurally sound. The defect is that two of the highest-volume families never
reach it.

This also explains the three symptoms Phase 6C1 reported separately. Post-up is
the top action family for eight of sixteen coaches; post-ups route to the
mismatch; the mismatch player is the best interior scorer; his volume and
efficiency then drag team FG% above its era. One mechanism, three findings.

## Classification

| Family | Selection path | Class |
| --- | --- | --- |
| **POST_UP** | `mism ? mism.player : usageWeighted(postThreat)` | **UNBOUNDED** — override binds ~always |
| **ISOLATION** | `mism ? mism.player : usageWeighted(selfCreation)` | **UNBOUNDED** — override binds ~always |
| **OFF_BALL_SCREEN** | `chase ? chase.player : usageWeighted(offBallMovement)` | **UNBOUNDED** — same defect; binds only when a chase mismatch exists, so it measured 30.8% here and would bind hard for a movement-shooter team |
| PICK_AND_ROLL | `usageShare × tier × selfCreation` | USAGE_AWARE |
| GENERIC_HALF_COURT | `pickShooter` → `usageShare × tierBoost` | USAGE_AWARE |
| SPOT_UP | `usageWeighted(perimeterSkill)` | USAGE_AWARE |
| CUT | `usageWeighted(offBallMovement + rimThreat)` | USAGE_AWARE |
| TRANSITION | usage-weighted with lane context | USAGE_AWARE |
| **HANDOFF** | hub: raw `passing + height`, no usage term | **FIT_DOMINANT** |
| **ZONE_ATTACK** | `weightFor(gap)` by skill only; usage appears in the `default` branch alone | **FIT_DOMINANT** |

### Secondary findings

**`ARRAY_ORDER_RISK` — none found.** Every selection goes through
`rng.weighted`, which is order-sensitive only if weights are invalid. The
Phase 6B2 defect (a `NaN` weight flooring to 0 and returning element zero) is
fixed and the fix is load-bearing: `usageWeighted` is keyed by the player, not
by an index, because `rng.weighted` passes only the item.

**No saturation anywhere.** No family tracks what a player has already
received. A player who has taken 40 shots is weighted exactly as he was at zero.

**No makes/misses feedback loop.** Selection reads `usageShare`, skill and game
state — never prior outcomes. So there is no runaway "he's hot, feed him" loop,
which is the correct behaviour and must survive the fix.

**Passer, screener and shooter are already distinct** in every family. The
entry passer, screener and hub are separate draws excluding the shooter. That
separation is sound and must be preserved.

## What the fix must do

1. Make a mismatch **bias** selection rather than replace it. Exploiting a
   mismatch is real basketball; monopolising every possession is not.
2. Add **soft saturation**: weight declines smoothly as a player exceeds his
   target share, without ever making him ineligible.
3. Route **HANDOFF** and **ZONE_ATTACK** through the same allocator.
4. Preserve the extraordinary game. A severe mismatch should still be able to
   produce a 40-shot night on some seeds — just not on every seed.

## What the fix must not do

- No hard cap. `if (share > X) reject` would produce a visible ceiling and kill
  the outlier games that make the matchups interesting.
- No global reduction in one player's skill to reduce his volume. The
  allocation is wrong, not the player.
- No change to shooting percentages. Opportunity first; efficiency is
  Phase 6C2B, and lowering FG% now would hide the concentration rather than fix
  it.
