# Daily configuration immutability

**One UTC date has one official Daily.** That guarantee has to survive a deployment, or the
leaderboard compares nothing.

## The bug

Phase 5D versioned the Daily config *cache key* by player, coach and era data version, on the
reasoning that a data change must not silently reinterpret a Daily already in progress. The intent
was right; the mechanism produced the opposite outcome.

- `cacheKeys.dailyConfig` carried `pd…:cd…:ed…`. Ship a data change at 14:00 UTC and the key changed
  → a **second** official configuration was generated for the same date.
- Worse, `api/game.js` never read a stored config at all. It called `dailyConfig(today)`, rebuilding
  the record from whatever versions were live *at that moment*.

Consequence: morning players got era X with coach options A/B/C and one derived seed; afternoon
players got era Y with different coaches and a different seed. One date, two challenges, one
meaningless leaderboard — and nobody would have seen an error.

## The model

```
UTC date
   ↓
dailyPointer  (SET NX, revision 1)      daily-ptr:v{schema}:{date}
   ↓
official config record  (SET NX)        daily:v{schema}:{date}:r{revision}
   ↓
authoritative for the rest of the UTC date
```

Four identities, per the required model:

| Field | Meaning |
|---|---|
| `dailyDate` / `utcDate` | the UTC date |
| `officialDailyId` | `daily-{date}-r{revision}` — the leaderboard identity |
| `dailyRevision` | 1 normally; advanced only by an explicit emergency replacement |
| the stored record | the *officialConfigRecord*: options, era, and the versions captured at creation |

`dailyId` and `officialDailyId` are the **same value** under two names — `dailyId` is the field
already shipped to the client and analytics. A test asserts they are identical so they cannot drift
into two ideas.

### The key is no longer version-keyed

`cacheKeys.dailyConfig({utcDate, revision})` carries the schema version, the date and the revision —
and **no data versions**. Immutability belongs to the *record*, not to the key. The record captures
`playerDataVersion`, `coachDataVersion`, `eraDataVersion` and the intelligence versions that were
live when it was created, and every later read returns them.

`revision` is a required segment: an unspecified revision throws rather than silently keying `r""`.

## Mid-day version change

Daily created at 09:00 under versions **A**. At 14:00 a deployment moves the active versions to
**B**. For the rest of that UTC date:

- the stored record is returned unchanged — same `officialDailyId`, same revision, same era, same
  coach options
- `playerDataVersion` etc. still read **A**, not B
- `dailySimulationSeed` therefore produces the **same seed**, so the game itself is unchanged
- **no revision 2 is created**

The next UTC date creates a fresh record on versions **B**. Verified by
`tests/v6a-workstream0.test.js`, including that today stays on A while tomorrow starts on B.

## Atomicity

The pointer is claimed with `SET NX`, so among simultaneous first requests exactly one decides the
revision. The config record is written with `SET NX` too, so a worker that generated a different
record defers to whatever is already stored rather than trusting its own. Tested with 8 concurrent
first requests: one configuration, one revision, one era, one coach-option set, and exactly one
caller reporting `CREATED`.

`source` is reported explicitly — `CREATED`, `STORED`, `CREATED_ELSEWHERE`, or `EPHEMERAL`. With no
store configured the resolver returns `EPHEMERAL` rather than implying a persistence that did not
happen.

## Emergency replacement

Only an operator can replace a Daily:

```bash
npm run daily:emergency-revision -- --date=20260825 --operator="ops:jj" --reason="..." --confirm
```

Without `--confirm` it is a dry run. It refuses without a store, without a named operator, or without
a reason of at least ten characters.

Issuing revision N+1:

- creates a **distinct** `officialDailyId` (`daily-{date}-r2`) — a separate leaderboard identity, so
  an r2 score is never silently ranked against r1 scores played on a different puzzle
- **preserves** the prior record at its own key; it is not overwritten and stays readable via
  `dailyConfigRevision(date, n)`, so r1's results remain attributable
- records `replaces`, `replacementReason`, `replacedBy` and `replacedAt`
- produces a **genuinely different puzzle**: the revision is folded into the option and era draws.
  Replacing a Daily because its coach options were broken and then reissuing the same three coaches
  would accomplish nothing. Revision 1 contributes zero to the draw, so every existing Daily is
  byte-identical to before this existed.

A deployment never triggers this. A version change never triggers this. Nothing automatic does.

## Regression guards

- `api/game.js` must call `officialDailyConfig()` and must not contain `= dailyConfig(`; `dailyConfig`
  is not even imported there, with a comment saying why.
- `api/daily.js` and `api/game.js` share the one resolver, so the config the client is shown is the
  config the simulation runs.
- A normal deployment, exercised five times over with changed versions, must leave revision 2 absent
  and the pointer at 1.
