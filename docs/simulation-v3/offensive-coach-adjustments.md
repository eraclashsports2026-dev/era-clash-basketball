# Offensive coach adjustments

`coachAdjustmentVersion` **1.0.0**, DEVELOPMENT, behind `OFFENSIVE_COACH_ADJUSTMENTS_ENABLED`
(default false). A separate domain from `coachIntelligenceVersion`: the **data** about a coach and the
in-game **adjustment engine** change for different reasons.

## Game plan state

```
{ baselineActionMix, currentActionMix, creatorHierarchy, mismatchTargets,
  paceTarget, spacingPriority, crashGlassPriority, zoneAttackPlan,
  adjustmentHistory, toolkit, evidence, coachAdjustmentVersion }
```

The baseline comes from Coach Intelligence, Team Intelligence, Era Style and the opposing defensive
plan. Deterministic — asserted identical for the same coach and context, and different across coaches.

## Triggers read process, not points

14 triggers. Evidence is **expected shot quality**, turnover rate and rim access — never points. So:

- 20 possessions at quality 7.2 that all **missed** → no failure trigger
- 20 possessions at quality 3.4 that all **made** → `PNR_FAILURE` fires

Both asserted. That is the whole distinction between *bad process* and *good process, unlucky shots*.

A live post mismatch that is **not being attacked** is the clearest signal and the highest-strength
candidate.

## Responses are gated by the coach's documented system

15 responses. Each is available only if the coach's researched tendency supports it — derived from
`postUsage`, `isolation`, `pickAndRoll`, `offBallMovement`, `motion`, `ballMovement`, `insideOut`,
`tempo`, `adaptability`, `tacticalAdjustment` and `roleDiscipline`. **No narrative stereotype is
hard-coded**; a test greps the module for coach names and requires zero matches.

Measured over 40 games each (2010s):

| Coach | Applied/game | Rejected/game | Distinct responses |
|---|---|---|---|
| Nick Nurse | 3.80 | 0.00 | 5 |
| Phil Jackson | 3.13 | 0.00 | 4 |
| Mike D'Antoni | 1.15 | **5.85** | 3 |
| Steve Kerr | 0.80 | **6.22** | 3 |

D'Antoni's and Kerr's documented systems barely post, so the strongest available trigger —
`POST_MISMATCH_AVAILABLE` — is **rejected** with `NO_SUPPORTED_OFFENSIVE_ADJUSTMENT`. That is the
requirement: not every coach is equally adaptable, and "why didn't the coach adjust" is answerable.

## Bounded

- **Cooldown 30 possessions.** A coach cannot change every possession.
- **Evidence floor** of 6 events, scaled up by up to 6 more for a rigid coach. Tested on the
  mechanism rather than the emergent rate, because the rate is confounded by which responses each
  coach supports.
- **`MAX_ADJUSTED_SHARE` 0.42** — no family can be pushed past it, so the offence never becomes one
  action. Asserted per family in play.
- **Ceiling check.** A response whose lever is already maxed is unavailable: the coach has already made
  that change. Without it the same trigger fired every cooldown and the history filled with seven
  identical entries after the mix had stopped moving.
- **Evidence resets** after an adjustment: the next decision must be earned.

## Renormalisation protects the adjusted family

Making room scales the **other** families, not the one just adjusted. Scaling everything pulled the
bumped family straight back below its cap, so it never reached a ceiling, the ceiling check never
fired, and the trigger repeated all game.

## Frequency is bounded, not calibrated

Adjustment frequency is measurable and bounded. It is **not** calibrated against real coaching
behaviour, and nothing here claims otherwise. That is Phase 6C.
