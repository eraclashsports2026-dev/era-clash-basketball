# Statistical invariants

Not a formality. Every invariant here has a failure mode behind it that a simulation engine reaches
for naturally: allocating assists after the fact to match made shots, generating steals independently
of turnovers, handing out rebounds from historical RPG, letting a blocked shot vanish instead of
staying an attempt, tallying points separately from the shots that produced them.

**A violation is a defect, not a warning.** `assertInvariants` defaults to on, so any engine call in
development or tests throws on the first violation. The benchmark disables it and *counts* instead,
because a benchmark that throws on the first violation cannot tell you how many there are.

## Conservation

```
sum(player PTS)  = team PTS          sum(player OREB) = team OREB
sum(player FGM)  = team FGM          sum(player DREB) = team DREB
sum(player FGA)  = team FGA          sum(player REB)  = team REB
sum(player 3PM)  = team 3PM          sum(player AST)  = team AST
sum(player 3PA)  = team 3PA          sum(player STL)  = team STL
sum(player FTM)  = team FTM          sum(player BLK)  = team BLK
sum(player FTA)  = team FTA          sum(player TO)   = team TO
```

These hold **by construction**, not by reconciliation. `credit(box, playerIndex, stat, n)` is the only
way any statistic changes, and it increments the player row and the team total in the same call. A
conservation bug would have to be a bug in that one function rather than anywhere in the engine.

## Internal consistency

```
3PM <= 3PA          FGM <= FGA          FTM <= FTA
3PM <= FGM          3PA <= FGA          OREB + DREB = REB
(FGM - 3PM) * 2 + 3PM * 3 + FTM = PTS
```

The last one is the important one: **points are derived from shots**, never tallied independently. If
a possession could add points without adding the shot that produced them, the box score would stop
describing the game.

## Event linkage

```
team AST <= team FGM              an assist requires a made field goal to assist
team STL <= opponent TO           a steal is how a turnover happened, not a thing on its own
team BLK <= opponent FGA          a block requires an attempt to block
```

These are inequalities, not equalities, on purpose. Not every made basket is assisted, not every
turnover is stolen, not every attempt is blocked. An engine that made them equalities would be
allocating, not simulating.

## Validity

```
no negative values      no NaN      no Infinity
```

## Game-level

```
winner has strictly more points than the loser
a game NEVER ends level
regulation is 4 periods; periods = 4 + overtimes
a tie at the end of regulation enters overtime
3PA = 3PM = 0 in an era with no three-point line
```

## Measured result

| | |
|---|---|
| Benchmark sweep | **1,000 games** |
| Invariant violations | **0** |
| Final ties | **0** |
| Guard firings | **0** |
| Per-era sweep (8 eras × 25 seeds) | **0** violations |
| In-test sweep | **500 games, 0** violations |

## The checker is falsifiable

A checker that cannot fail proves nothing, so a test deliberately corrupts a finished game — adds
three points to one player's line, then sets team assists above team made field goals — and asserts
the checker catches both. Without that, a silently broken checker would report perfect conservation
forever.
