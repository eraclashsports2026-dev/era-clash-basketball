# Calibration player-season schema

`src/v3/calibration/calibrationPlayerSchema.js` · `calibrationPlayerSchemaVersion` **1.0.0**

A player's **one season**, for historical calibration only.

## Why this is a different object from a public card

A public card carries a **decade** of production and exists to be drafted. A
calibration profile carries **one season** and exists to reconstruct a real
team. Reconstructing the 1995-96 Bulls needs Ron Harper; he should never appear
in the public selector.

That is the whole design: the public pool stays at **381 cards and 323 people**,
and the historical corpus gets the role players it needs.

## Identity

```
cal:{teamId}:{seasonStartYear}:{personSlug}
```

Not array order, and not the public card id. The same person across two seasons
is two profiles, so a 1985 line can never stand in for a 1988 one. Public ids
are cross-referenced (`publicPersonId`, `publicCardId`) but never reused as the
season identity.

## What the schema refuses

| Rejected | Why |
| --- | --- |
| An unrecorded statistic stored as `0` | `null` means "not recorded"; `0` means "he never got one". Only one is true. |
| `ovr`, `rating`, `popularity`, `archetypeBadge`, `draftRank` | Public-product concepts. Attaching one is the first step toward a leak. |
| `publicEligibility` anything but `false` | Explicit, not implied by absence. |
| A value with no provenance | Indistinguishable from a value someone remembered. |
| A value outside its plausible range | A parse error that looks like data. |

## Statistics that did not exist

Steals, blocks, turnovers and offensive/defensive rebound splits begin in
**1973-74**; three-pointers in **1979-80**. Before those seasons the fields are
`null`, and the validator rejects a `0`.

For pre-1974 defence the adapter derives a **categorical band** from documented
role, accolades and rebounding — never a rate. A band says "at least this
good"; a rate would claim a measurement nobody took.

## One real edge case

Andrew Bogut shot **1.000** from three in 2015-16 — one attempt, one make. The
value is real and is stored. What it must not do is become a skill judgement, so
the adapter refuses to infer perimeter skill from an extreme percentage when the
source carries no attempt count, and falls back to the free-throw proxy. This is
the Mark Eaton `.000` problem in reverse.

## Public isolation, enforced

- `PLAYERS` contains no `cal:` id — asserted by test
- `validateTeamIds` **explicitly** rejects the `cal:` namespace, rather than relying on lookup failure
- no calibration profile carries an OVR, rating or card asset
- `src/players.js` does not import the calibration store

Every public entry point — roster builder, search, Random Team, Daily,
challenges, saved squads — resolves through `validateTeamIds`, so one guard
covers them all, and a test proves it rejects a real calibration id.
