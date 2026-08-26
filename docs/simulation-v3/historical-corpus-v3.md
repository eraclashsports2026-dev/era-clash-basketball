# Historical corpus v3

`data/calibration/historical-corpus-v3.json` — 32 fixtures, hash `c962797e3dd34d05`.

## What changed, and why it mattered

Phase 6C2B's corpus could field only **10 fixtures across 4 eras and 3
franchises**, and the corpus gate failed. The cause was not effort but a
constraint: fixtures were built from the public player-card pool, which holds
all-time greats. Intact starting fives composed entirely of all-time greats
barely exist, so most real teams could not be assembled at all.

The calibration-only player data plane removed that constraint. Role players are
now available at the same evidence standard as stars — verified against their own
team-season's record, through an authorized source, with revision-level
provenance — while remaining invisible to the game (`publicEligibility: false`,
no OVR, no rating, no popularity).

The result:

| | 6C2B | 6C2C1 |
|---|---|---|
| Fixtures | 10 | **32** |
| Eras | 4 | **8** (4 per era) |
| Franchises | 3 | **23** |
| Corpus gate | FAIL | **PASS** |

This is the first phase in which the corpus gate passes.

## Composition

| Era | Fixtures | Era | Fixtures |
|---|---|---|---|
| 1950s | 4 | 1990s | 4 |
| 1960s | 4 | 2000s | 4 |
| 1970s | 4 | 2010s | 4 |
| 1980s | 4 | 2020s | 4 |

By lineup basis:

| Type | Count | Meaning |
|---|---|---|
| `HISTORICAL_LINEUP` | 22 | Documented starting five |
| `HISTORICAL_STARTER_PROXY` | 9 | Documented starting or closing five |
| `HISTORICAL_PRINCIPAL_FIVE_PROXY` | 1 | Source-backed principal five |

The distinction is kept because a documented five and a reconstructed one are
different evidence, and collapsing them would let the weaker claim inherit the
stronger one's authority.

## Validation

Every fixture is checked before acceptance, and a failure rejects the fixture
rather than downgrading it:

- the coach is in the pool **and** coached that team that season;
- exactly five players, in `PG,SG,SF,PF,C` order;
- every player has a verified calibration profile for **that team, that season**;
- each player's profiled primary position matches the slot assigned;
- no person appears twice — a duplicate would be a lineup that never existed.

0 of 32 rejected.

## Confidence is weakest-link

A fixture's `playerDataConfidence` is the **minimum** across its five members, not
the mean. A five is only as verified as its least-verified player, and averaging
would let four well-sourced players conceal one that is not.

## Known limits

- Fives are season-level, not game-level. Mid-season trades mean a documented
  "starting five" is a simplification of a season that had several. Where a
  trade made the nominal five wrong — Jakob Pöltl arriving at the 2023 deadline —
  the fixture uses the season's actual most-used five instead.
- `styleIdentityConfidence` is `MEDIUM` for every fixture. Style tags come from
  prose descriptions, which are interpretation rather than measurement.
- 23 franchises across 8 eras still leaves most of league history unrepresented.
