# EraClash Translation Doctrine

**The foundational rule of cross-era simulation:**

> **Transport the basketball player, not the historical circumstances that created the player.**

## What travels with a player

A player carries their demonstrated basketball capabilities into any Era Style:
shooting touch and range, finishing, passing, ball handling, basketball IQ,
rebounding instincts, defensive ability, athleticism, strength, size, movement
ability, off-ball ability, decision making.

## What does NOT happen

- A historical player does **not** automatically receive modern training.
- An older player does **not** automatically learn modern three-point shooting.
- A modern player does **not** lose skills by moving backward in time.
- No player receives technologies or developmental advantages from another period.

A player may **adapt tactically** (a coach redistributes emphasis; a shooter's
gravity still bends a 1960s defense). The engine never **invents** abilities.

### Canonical examples

**Steph Curry in a pre-three-point era** keeps his extraordinary shooting and
range. His shooting still creates defensive gravity, spacing, movement, and
long-range shot-making — but a basket from that distance is worth **two
points**, because the Era Style has no three-point line. The skill survives;
the scoring economics change. (Enforced in `src/v3/possession.js`: pre-line
eras have zero 3PT volume, deep skill routes to long twos, and the spacing
bonus survives every era. Tested in `tests/v3-addendum.test.js`.)

**Wilt Chamberlain in the modern era** keeps his physical tools, interior
scoring, rebounding, and rim defense. He does **not** become a three-point
shooter: the engine's three-volume floor applies only to players with real
demonstrated shooting skill — nobody designs threes for a non-shooter.

## Relative-to-era performance (raw vs. relative)

Raw historical statistics are never treated as universally equivalent.
30 PPG in a league averaging 117 points per team (1966-67) is not the same
feat as 30 PPG in a league averaging 97 (2004-05). The pipeline:

```
HISTORICAL STATISTIC → LEAGUE/ERA CONTEXT → RELATIVE PERFORMANCE
                     → UNDERLYING CAPABILITY → SELECTED ERA STYLE EXPRESSION
```

League context lives in `src/v3/data/leagueNorms.js` (verified per-team league
averages at each era's anchor season). Each statistic gets its **own**
treatment (`src/v3/playerProfile.js`), never one blanket formula:

| stat | exponent | why |
|---|---|---|
| points | ^0.7 | environments differ meaningfully, but talent carries — correct the environment without erasing the feat |
| rebounds | ^0.85 | the biggest artifact: 1960s miss volume alone inflated every rebound total (league 67.3 rpg vs ~44 modern) |
| assists | ^0.5 | league assist rates moved less, and scorekeeping strictness cuts both ways |
| steals/blocks | ^0.5 recorded eras; **raw** pre-1974 | pre-1974 values are estimates, not measurements — normalizing a guess pretends precision we lack |

## Uncertainty is not randomness

- **Confidence** (HIGH / MEDIUM / LOW, alongside VERIFIED / HUMAN_REVIEWED /
  CALCULATED / INFERRED) describes how sure EraClash is about an attribute.
  Pre-1974 steal/block-derived capabilities are LOW: those stats were never
  officially recorded.
- **Game variance** (seeded nightly form, bounded by consistency) describes how
  basketball performances vary.
- These never mix: a low-confidence historical player is not made randomly
  inconsistent because we know less about him. Enforced by test: mutating a
  player's confidence block changes nothing about a seeded game.

## Standing doctrine rules

- **Neutral court, always.** No home court, travel, altitude, or crowd effects
  in any V3 matchup. The fantasy is the basketball. (Venue effects may become
  a future optional mode.)
- **Injuries OFF.** The question is "which basketball team would win?" — never
  "who got hurt?" Fatigue, shooting variance, foul pressure, and nightly form
  are the only condition effects. Major injuries are not modeled.
- **No historical teammate bonuses, no feud penalties.** If Jordan + Pippen fit
  together, the engine discovers WHY (roles, defense, creation hierarchy) —
  nostalgia is not a mechanic and locker-room speculation is not data.
- **Duplicate persons:** one team cannot field two era-versions of the same
  person; different versions MAY face each other on opposite teams
  (80s Jordan vs 90s Jordan is a supported EraClash fantasy).
- **The basketball tradeoff rule:** no complexity enters the engine unless it
  creates an understandable basketball tradeoff (usage, crash-vs-get-back,
  pace-vs-fatigue, pressure-vs-fouls, switching-vs-size, small-vs-big,
  post-vs-spacing, system-vs-roster, era economics).

## Deferred (documented, not modeled)

- Foul-outs / player disqualification — five players with no bench makes
  removal structurally unsolvable today; foul PRESSURE and attributed personal
  fouls are modeled, disqualification is not.
- Bench rotations and minute management; detailed shot-location tracking;
  play-by-play coaching commands; venue effects; injuries.
