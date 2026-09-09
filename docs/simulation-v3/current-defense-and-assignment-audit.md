# Current defensive logic — audit (pre-Phase 6B1)

Traced from code, not from documentation. Every claim below cites the file and line it came from.

## Classification

| Input | Where | Status |
|---|---|---|
| Primary defender selection | `actions.js:81` `pickDefender` | **ACTIVE_POSSESSION_ENGINE** — position-only |
| Handler defender (PnR) | `actions.js:164` | **ACTIVE_PICK_AND_ROLL** — same position-only call |
| Screener defender (PnR) | `actions.js:165` | **ACTIVE_PICK_AND_ROLL** — first defender who is not the handler defender |
| Team rim protection | `actions.js:98,112`, `game.js:220` | **ACTIVE_POSSESSION_ENGINE** — team aggregate |
| Team help defence | `actions.js:98` | **ACTIVE_POSSESSION_ENGINE** — team aggregate |
| Team point-of-attack | `actions.js:98`, `context.js:234` | **ACTIVE_POSSESSION_ENGINE** — team aggregate |
| Defensive playmaking → forced turnovers | `game.js:138` | **ACTIVE_POSSESSION_ENGINE** — team aggregate |
| Individual event creation → steal credit | `game.js:141` | **ACTIVE_POSSESSION_ENGINE** — per player, but not assignment-linked |
| Individual rim/interior → block credit | `game.js:222` | **ACTIVE_POSSESSION_ENGINE** — per player, not assignment-linked |
| Individual rebounding → rebound credit | `game.js:242,252` | **ACTIVE_POSSESSION_ENGINE** |
| Defender contest in make probability | `game.js` `makeProbability` | **ACTIVE_POSSESSION_ENGINE** — uses the nominal defender's `rim`/`perimeter` only |
| Foul assignment | `game.js:168` | **ACTIVE_POSSESSION_ENGINE** — weighted by interior/rim, not by matchup |
| `switchability` | `context.js:213` | **DORMANT** — read into the prepared context and never used anywhere |
| Coach `defensiveReboundingPriority` | `context.js:185` | **ACTIVE_POSSESSION_ENGINE** — the only coach defensive field consumed |
| Coach `pressure`, `helpAggression`, `zonePreference`, `dropCoverage`, `switching`, `manPreference`, `rimProtectionPriority` | Coach Intelligence | **MISSING** — never read by the possession engine |
| Era `zoneLegal`, `illegalDefenseRestrictions`, `defensiveThreeSeconds`, `handCheckAllowed` | `eraStyleIntelligence.js:59-103` | **DESCRIPTIVE_ONLY** — collapsed into `helpDefenseFreedom` and `physicalPerimeterPressure` scalars; the rules themselves constrain nothing |
| Switching | — | **MISSING** |
| Cross-matching | — | **MISSING** |
| Mismatch identification | — | **MISSING** |
| Mismatch targeting | — | **MISSING** |
| In-game assignment change | — | **MISSING** |
| Assignment context in the ledger | `game.js:112-118` | **MISSING** — the ledger records offensive `primary`/`secondary` and no defender at all |
| Postgame defensive reconstruction | — | **MISSING** — nothing to reconstruct from |

## How defenders are currently selected

```js
// actions.js:81
export const pickDefender = (defense, shooter) => {
  const byPos = defense.players.find((d) => d.position && d.position === shooter.position);
  return byPos ?? defense.players[shooter.index] ?? defense.players[0];
};
```

Position first, array index as fallback. Since `positionAssignments` is always `["PG","SG","SF","PF","C"]` for both teams, the position match **always** succeeds and the assignment is **always** strictly positional. Demonstrated:

```
PG Stephen Curry     guarded by -> PG Magic Johnson
SG Klay Thompson     guarded by -> SG Michael Jordan
SF Larry Bird        guarded by -> SF Scottie Pippen
PF Dirk Nowitzki     guarded by -> PF Tim Duncan
C  David Robinson    guarded by -> C  Hakeem Olajuwon
```

Two problems visible in that single example:

1. **Magic Johnson is chasing Stephen Curry** because both are labelled PG. Magic's documented weakness is screen navigation and chasing off-ball movement; Curry's documented strength is exactly that. No coach would plan this.
2. **Scottie Pippen — the best perimeter defender on the floor — is locked onto Larry Bird** because both are labelled SF, and is therefore unavailable for the assignment that actually matters. The engine cannot express "put Pippen on Curry", which is the first thing any coach would consider.

The screener defender is worse: `defense.players.find((d) => d.index !== handlerDefender.index)` returns whichever defender happens to come first in array order. It is not a basketball decision at all.

## What the aggregates hide

Rim protection, help defence and point-of-attack are consumed as **team averages**. That means:

- an elite rim protector pulled to the perimeter still contributes full rim protection
- a single weak defender is diluted across the lineup instead of being targeted
- no defender's individual matchup affects anything except the shooter's contest term

The contest term itself (`makeProbability`) reads only the nominal defender's `rim` and `perimeter` values, so a post mismatch, a speed mismatch and a movement-shooting chase are all the same number.

## Era legality

The era's defensive **rule facts** exist and are sourced, but the possession engine never sees them. `strategicEffects` collapses them into `helpDefenseFreedom` (2.0 with illegal-defense restrictions, up to 8.5 when zones are legal) and `physicalPerimeterPressure`. Those scalars shift magnitudes; they do not make a structure legal or illegal. There is no scheme for legality to constrain.

## Coach influence

Exactly one coach defensive field reaches a possession: `defensiveReboundingPriority`, via `crashGlass`. Every other documented defensive tendency — pressure, help aggression, zone preference, drop coverage, switching, man preference, rim-protection priority — is computed by Coach Intelligence and then discarded. Two coaches with opposite defensive philosophies currently produce identical defence.

## Integration points for Phase 6B1

The audit identifies five places the new system must attach, and no others:

1. **`context.js` `preparePossessionContext`** — build the defensive plan once, deterministically, from the prepared context. This is where threat profiles, defender profiles, the pairwise matrix, the optimizer and the scheme belong.
2. **`actions.js` `pickDefender` / `resolvePickAndRoll`** — replace positional lookup with a lookup into the current assignment state; take the handler and screener defenders from the plan.
3. **`game.js` `playPossession`** — thread the live assignment state, apply matchup-derived modifiers to shot quality, turnover pressure, foul pressure and rebound position, and record switches.
4. **`game.js` ledger record** — add compact defensive fields.
5. **`index.js` result** — add `defensiveMatchupVersion`, the plans and the assignment summary; extend the fingerprint and the development cache key.

Nothing in `boxScore.js` or `invariants.js` needs to change: the defensive system alters *conditions*, and the existing event-written conservation continues to hold. That is the property to protect.
