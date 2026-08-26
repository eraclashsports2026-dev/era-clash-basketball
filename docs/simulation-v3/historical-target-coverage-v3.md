# Historical target coverage v3

`data/calibration/historical-targets-v3.json` — 32 records, one per corpus
fixture.

## The headline is a gap, not a total

| Availability | Fields | Share |
|---|---|---|
| `RECORDED_STATISTIC` | 96 | 10.0% |
| `SOURCE_BLOCKED_LICENSING` | **784** | **81.7%** |
| `NOT_RECORDED_IN_ERA` | 80 | 8.3% |
| **Total team-level fields** | **960** | |

**864 of 960 team-level target fields have no value.** Every one is `null`, and
every one carries a reason.

This is the cost of the source policy stated plainly. The blocked fields are not
unavailable in the world — they are unavailable *to this project*, because the
comprehensive source for them prohibits use in model calibration. That decision
stands, and this table is what it costs.

`NOT_RECORDED_IN_ERA` is a different and permanent gap: steals, blocks,
turnovers and offensive/defensive rebound splits were not recorded league-wide
before 1973-74, and three-point data does not exist before 1979-80. Those 80
fields will never be filled by any source, and inventing them is forbidden.

**No null is ever replaced by a zero.** A missing steal count is not zero steals,
and treating it as one would encode "not measured" as "no ability".

## What is present

| Tier | Coverage |
|---|---|
| **A** — team totals | 96 fields with values, all provenanced |
| **B** — opponent/possession detail | **0** — entirely licensing-blocked |
| **C** — player share maps | 132 maps across 30 of 32 fixtures |
| **D** — qualitative identity | 221 statements across 32 of 32 fixtures |

Tier C share maps, by kind:

| Map | Fixtures |
|---|---|
| `playerScoringShares` | 30 |
| `playerReboundShares` | 30 |
| `playerAssistShares` | 30 |
| `playerStealShares` | 21 |
| `playerBlockShares` | 21 |

Steal and block shares cover 21 rather than 30 because 9 fixtures predate 1973-74.
The absence is structural and correctly recorded, not a retrieval failure.

Shares are `DERIVED_FROM_AUTHORIZED_TOTALS` — computed from per-player season
values by a formula stored on the record — and are normalised across the selected
five only, which is flagged on every map (`selectedFiveOnly: true`). A share of
team scoring computed over five players is not a share of the real team's
scoring, and the field says so rather than letting the reader assume otherwise.

## Integrity

| Check | Result |
|---|---|
| Values with no provenance | **0** |
| Values from a prohibited source | **0** |
| Nulls replaced by zero | **0** |
| Records carrying a reason for every null | 32 / 32 |

## Consequence for calibration

Tier B is empty, so pace and possession-level targets cannot be calibrated
against history at all. Tier A at 10% coverage cannot support per-fixture
efficiency calibration. What the corpus can currently support is **distributional
and qualitative** comparison — player share structure and documented identity —
not point-estimate matching of team box scores.

Any Phase 6C2C2 objective must be built from what is actually present. Building
one that assumes Tier A or Tier B coverage would produce a number computed
mostly from nulls.
