# Possession Engine 1.0 — core architecture

**Status: DEVELOPMENT — CALIBRATION REQUIRED.** `possessionEngineVersion` is **1.0.0** with status
`DEVELOPMENT`. `POSSESSION_ENGINE_ENABLED` defaults to **false**. No production route selects it; the
live production engine remains `engineVersion` **3.2.0** and is untouched.

This engine is **not** historically authoritative, definitive, scientifically proven, or fully
accurate, and must not be described that way. See `phase-6a-limitations.md`.

## The product rule

```
Prepared basketball context
      ↓  possessions
      ↓  actions
      ↓  shots / turnovers / fouls
      ↓  rebounds / continuations
      ↓  points and player statistics
      ↓  final score
      ↓  winner
```

The engine does **not** pick a winner, pick a score, and manufacture a box score to match. Nothing in
the loop reads the score to decide an outcome. Game state feeds **pace, urgency and shot selection**
— the things a real late-game situation changes — never make/miss.

## Modules

| File | Responsibility |
|---|---|
| `src/v3/possession/index.js` | public surface, result fingerprint, series/season runner |
| `context.js` | input validation and the prepared-context boundary |
| `actions.js` | action selection and resolution (PnR, generic half-court, transition) |
| `game.js` | the possession loop, periods, overtime, fatigue |
| `boxScore.js` | event-written statistics; team totals are player sums by construction |
| `invariants.js` | statistical conservation checks |
| `rng.js` | counted deterministic PRNG and child-seed derivation |
| `testContext.js` | prepared-context builder for tests and benchmarks |

## Input contract

```
{ simulationId, simulationSeed, mode, eraStyleId,
  gold: { playerCards, playerIntelligence, teamIntelligence,
          coachIntelligence | coachId, positionAssignments },
  blue: { ...same } }
```

The core **fetches nothing, calls no model, reads no clock, and reads no global state.** A test greps
every engine file for `fetch(`, `node:fs`, `Date.now()`, `new Date(`, `Math.random`, and any provider
name.

It trusts nothing from a caller. Anything that would author the outcome —
`winProbability`, `forcedWinner`, `forcedScore`, `shotProbabilities`, `makeProbability` — is
**refused**, not clamped. Silently ignoring such a field would let a caller believe it worked.

A later server adapter will build the prepared context from canonical server-side data. Until then
`testContext.js` builds it for tests and benchmarks, and lives beside the engine so the two cannot
drift.

## The prepared-context boundary

```
Intelligence + matchup preparation   →   WHAT IS POSSIBLE
Possession resolution                →   WHAT HAPPENED
```

`context.js` consumes the versioned outputs of Player, Team, Coach and Era Style Intelligence. It
does **not** recompute them — a test asserts it never imports `buildIntelligence` or
`buildTeamIntelligence`, because two derivations of one quantity always drift.

What it prepares: usage shares (renormalised from Team Intelligence, never reinvented), per-player
shot profiles and shooting skill, team offence/defence/rebounding summaries, coach tempo and
structure, era strategic effects, the crash-glass position, and the pregame expectation.

### Era anchors

The era's **documented** environment anchors frequency, never effectiveness:

- three-point attempt share from `tpaPerGame`
- free-throw trip rate from `ftaPerGame`
- offensive-rebound rate from `orebPct`
- baseline conversion per shot category from `fgPct` and `tpPct`
- pace from `pace`, moved by both coaches' tempo within ±14%

Without these anchors a roster's own ability set its three-point volume, and a 2010s game produced
seven attempts — erasing the thing Era Style exists to express. The roster still decides its share
*relative* to the anchor: a great shooting team in 1985 shoots more threes than a poor one, and both
shoot far fewer than anyone in 2020.

## Game structure

Four regulation periods. Possessions per period derive from the prepared pace with a small seeded
jitter, so periods are not identical in length. Tracked game state distinguishes early, normal, late,
close-late, protecting-a-lead and trailing-late, and feeds bounded urgency.

## Coach influence

Coach Intelligence sets **how often** something is attempted, never how well it works. Measured
pick-and-roll share of gold possessions, same roster, 2010s:

| Coach | `pickAndRoll` tendency | realised PnR share |
|---|---|---|
| Mike D'Antoni | 10 | 0.37 |
| Jack Ramsay | 4 | 0.21 |
| Phil Jackson | 2 | 0.14 |

This was broken on first implementation and the tests caught it: Coach Intelligence renames the raw
coach fields (`pickAndRoll` not `pnr`, `transitionEmphasis` not `transition`, `postUsage` not `post`,
`defensiveReboundingPriority` not `defRebPriority`), so reading the raw names returned the default 5
for **every** coach and coach tendency had no effect at all. The lookup now accepts either shape
before defaulting.

## Performance

Measured locally, 1,000 games, same prepared matchup:

| | |
|---|---|
| single game | ~0.4 ms warm (11 ms first, module load) |
| 100 games | ~50 ms |
| 1,000 games | ~400 ms |
| best-of-7 child seeds | ~5 ms |
| 82-game child seeds | ~24 ms |
| heap after 1,000 games | ~16 MB |

Comfortably inside the soft targets (single game < 100 ms, 1,000 games < 10 s). No AI, network or
research call is made on any path.
