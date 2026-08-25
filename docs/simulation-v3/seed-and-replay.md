# Seeds and replay

## One seed per game

Every game uses one server-generated seed and one PRNG implementation (`mulberry32`, via
`createRng`). **`Math.random()` is never called anywhere in the engine** — a test greps every engine
file for it, reading code with comments stripped so the guard cannot match the sentence documenting
the rule.

Same prepared context + same seed + same module versions → **byte-identical game**. A new seed →
a different plausible game.

## Counted draws

`createRng` counts every draw, and the count is recorded on each possession as `step`. Two runs of the
same game must consume the same draws in the same order, so a divergence shows up at the exact
possession where it began rather than as an unexplained score difference at the end.

A weighted pick with an all-zero weight vector returns the first item rather than `undefined` — a
possession must always produce an action.

## Seed rules by mode

| Situation | Behaviour |
|---|---|
| Duplicate / idempotent request | same simulation id and seed → same result |
| Rematch | new simulation id → new seed → new plausible result |
| Best of 7 | one parent series seed; each game gets an independently derived child seed |
| Win 82 | one season seed; each game gets an independently derived child seed |

Child seeds come from `deriveSeed(parent, index)` (splitmix32-style avalanche). **A single game-form
modifier is never reused across a series or a season** — that is precisely how one unlucky draw
repeats itself in all seven games. Verified: 7 distinct child seeds produce more than four distinct
scorelines, and 30 of an 82-game season produce more than 20 distinct scorelines.

## Result fingerprint

```
engineVersion              playerIntelligenceVersion   eraDataVersion
possessionEngineVersion    teamIntelligenceVersion     eraStyleVersion
actionLibraryVersion       coachDataVersion            calibrationVersion
playerDataVersion          coachIntelligenceVersion
matchupFingerprint         simulationSeed
```

Only modules that **actually shaped the result**. A fingerprint listing modules the result did not
depend on is a false reproducibility claim — it would invalidate stored games on an unrelated version
bump. `chemistryVersion` is deliberately absent: Chemistry remains display-only and never touches a
possession.

## Cache identity

```
dev-possession:pe{ver}:al{ver}:pd{ver}:pi{ver}:ti{ver}:cd{ver}:ci{ver}:ed{ver}:es{ver}:{matchupFingerprint}:s{seed}
```

Content-addressed on the matchup **and the seed**. Keying by matchup alone would make a rematch
collide with the game it is a rematch of — the whole point of a rematch is a new seed and a new game,
so it must get its own entry.

| Request | Result |
|---|---|
| same matchup + same seed | same key, existing result |
| same matchup + new seed | different key, new result |
| reload / duplicate request | existing result |

The namespace is **`dev-possession`**, not `result`. A development engine's runs must not land where
production results live. `NAMESPACES` records it as development-only and safe to flush at any time.

## Replay tool

```bash
npm run simulation:replay -- --self-check
npm run simulation:replay -- --fingerprint=path/to/game.json
```

Internal development tool; not exposed by any route. It rebuilds the input from the stored record,
runs the game twice, and compares the score, winner, periods, overtimes, RNG step count, possession
counts, every player line, and the full ledger — reporting the **first divergent possession** rather
than only that a divergence occurred.

Verified: the self-check reproduces its game exactly, and a test confirms the comparator actually
detects a divergence when given two different games (a comparator that cannot fail proves nothing).
