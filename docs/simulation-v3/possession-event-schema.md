# Possession event schema

## Possession lifecycle

A possession is one team's turn with the ball. It ends when the ball changes hands or the period does.

| Path | Statistics written | Possession |
|---|---|---|
| **Made field goal** | shooter FGA, FGM, PTS (+3PA/3PM); passer AST if the pass created it | ends |
| **Miss → defensive rebound** | shooter FGA (+3PA); defender DREB; blocker BLK if blocked | ends |
| **Miss → offensive rebound** | shooter FGA (+3PA); teammate OREB; blocker BLK if blocked | **continues** |
| **Turnover** | loser TO; opponent STL only if forced | ends |
| **Shooting foul** | shooter FTA×n, FTM, PTS; fouler internal PF | ends, unless the last free throw misses and the offence wins the board |
| **End of period** | — | ends |

An **offensive rebound continues the same team possession**. It is not a new one and the ledger does
not count it as one. This is why the ledger has more entries than the possession count, and why any
per-possession rate anchored on a documented per-game figure is divided by the measured ~1.15 calls
per possession — without that, the realised free-throw rate overshot the documented era environment
by about a third.

## Actions

Three, honestly labelled. Post-ups, isolations, handoffs, off-ball screens and motion are **not
implemented and not pretended to be**.

| Action | What it is |
|---|---|
| `PICK_AND_ROLL` | the real versioned action library (`src/v3/actions/pickAndRoll.js`) |
| `GENERIC_HALF_COURT` | an explicit fallback; `tacticalSpecificity: "NONE"` |
| `TRANSITION` | early offence from a live-ball steal, a defensive rebound, or pace |

Interface, stable so Phase 6B can add families without touching the loop:

```js
selectAction(context)          // frequency only
resolveAction(action, ctx, rng) // → shot context
// applied by the loop, which writes the statistics
```

### Pick-and-roll translation

The action library returns consequences; the engine turns them into events. The **coverage the
defence played** decides which consequence dominates, so the same action resolves differently against
a drop than against a blitz:

| Route | Weighted by | Shooter | Rim bias |
|---|---|---|---|
| `HANDLER` | ball-handler shot quality + rim pressure | handler | +0.1…+0.4 |
| `ROLL` | roll opportunity | screener | +0.62 |
| `POP` | pop opportunity | screener | −0.35 |
| `SHORT_ROLL` | short-roll playmaking | screener | +0.2 |
| `WEAK_SIDE` | weak-side opportunity | a third player | −0.3 |

There is no `pnrBonus`, `coachBonus` or `eraBonus` anywhere — a test greps for them. Pick-and-roll is
also frequency-capped at **0.46** so a single detailed action cannot crowd out everything else merely
by being the only one modelled.

## Shot categories

`RIM`, `PAINT_OR_POST`, `MIDRANGE`, `THREE_POINT`. Every attempt belongs to a player, a category, an
action, a period, an offensive team and a defensive context.

A three-point attempt is legal only in an era with a three-point line. In a pre-three-point era the
weight moves to the **long two the player would actually have taken** — the shot goes away, the skill
does not. Outside skill still shapes spacing, defensive positioning and action geometry.

## Shot quality vs shot making

`expectedShotQuality` and the realised make are separate. Quality (0–9.6) is what the offence
generated: shooter ability, category, creation, spacing, action quality, containment, help, rim
protection, coach structure, era, fatigue. The make is a bounded seeded realisation of it, clamped to
**[0.06, 0.86]** — no shot is a certainty and none is hopeless.

Measured over 120 games: realised conversion tracks expectation to within 0.006, and per-era pooled
three-point percentage matches the documented league value (1980s 0.299 vs 0.301, 2010s 0.354 vs
0.354, 2020s 0.367 vs 0.366).

Percentages must be **pooled**, not averaged per game — averaging per-game ratios over-weights
low-attempt games and reads about 0.03 low. The benchmark pools.

## Assists, steals, blocks

- An **assist** is credited on the made basket, by the teammate whose pass created it. Never
  allocated afterwards, never on a free throw, never to the shooter.
- A **steal** is credited only for a *forced* live-ball turnover. Not every turnover has one, which
  is why steals are bounded strictly below opponent turnovers rather than equal to them.
- A **block** requires an opponent field-goal attempt. A blocked shot stays an FGA and a miss; it does
  not vanish.

## Rebounding and the crash-glass trade-off

Rebounds emerge from misses. Assignment weighs player rebounding, lineup size, position, verified
physical data, team rebounding profile, shot category (a long three comes off differently than a rim
miss), the coach's crash-glass preference, the era's documented offensive-rebound environment, and
seeded variance. Historical RPG is never allocated directly. Missing physical data lowers confidence;
it never triggers a fabricated measurement.

A team cannot maximise offensive rebounding **and** transition defence. The coach's rebounding
priority sets where on that axis it starts, and `transitionVulnerability` is computed once from the
same number so both directions of the trade-off agree.

## Fouls and free throws

Shooting fouls produce two free throws (three on a three-point attempt). `FTM <= FTA`, and free-throw
points reconcile into `PTS`.

**No disqualification is modelled.** Personal fouls are tracked internally for analysis and are
deliberately **absent from the consumer box score**: with no bench to replace a fouled-out starter, a
six-foul rule would end the game with four players, so a displayed PF total would imply a rule that
does not exist. The limitation is stated in `internal.personalFoulNote`.

## Possession ledger

One compact record per call, enough to debug and no more. No prose: every string field is under 48
characters, asserted by test.

```
{ i, period, offense, action, variant, coverage, route,
  primary, secondary, shot, expectedMake, outcome, points,
  assist, turnover, steal, block, offensiveRebound, defensiveRebound,
  freeThrows: { attempted, made }, step }
```

`step` is the RNG draw count at the start of the possession — the deterministic event id. Two runs of
the same game consume the same draws in the same order, so a divergence surfaces at the exact
possession where it began rather than as a mysterious score difference at the end.

`outcome` is one of `MADE_FG`, `MISS_DREB`, `MISS_OREB`, `TURNOVER_STOLEN`, `TURNOVER_UNFORCED`,
`SHOOTING_FOUL`.

**Storage:** the ledger is kept in full in development, tests and benchmarks (`includeLedger: true`,
the default). It is omitted for bulk sweeps. When possession results are eventually persisted, only a
compact summary should be stored — a full ledger per game is roughly 200 records and does not belong
in a durable result record.

## Overtime

If regulation ends level, an overtime period is played at 5/12 of a regulation period's possessions.
Repeated while still level. Fatigue and game state carry through. **No random tie-breaker exists.**

A `MAX_OVERTIMES = 6` guard prevents a pathological context from hanging the process. If it fires,
resolution stays possession-based — additional short sequences until the tie breaks — never a coin
flip, and the event is recorded as an internal error, because a context that cannot break a tie in six
overtimes is implausible and should be investigated. Over 1,000 benchmark games the guard never fired
and no game ended level.

## Box score

**Player:** PTS, FGM, FGA, 3PM, 3PA, FTM, FTA, OREB, DREB, REB, AST, STL, BLK, TO.
**Team:** the same plus FG%, 3P%, FT% and possessions.

Nothing is exposed that is not modelled. PF is internal. There is no stamina meter.
