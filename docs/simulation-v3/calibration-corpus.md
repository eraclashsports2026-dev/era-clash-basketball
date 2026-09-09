# Calibration corpus

`data/calibration/fixtures.mjs` · `historicalFixtureDataVersion` **1.0.0**
**26 fixtures · 8 eras · 0 validation errors**

Schema in `historical-fixture-schema.md`. Split in `holdout-policy.md`.

## Coverage

| Era | Fixtures | | Type | Count | | Confidence | Count |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1950s | 2 | | CHAMPIONSHIP | 9 | | HIGH | 8 |
| 1960s | 3 | | ELITE_OFFENSE | 8 | | MEDIUM | 13 |
| 1970s | 3 | | PACE_EXTREME | 4 | | LOW | 5 |
| 1980s | 4 | | ELITE_DEFENSE | 3 | | | |
| 1990s | 4 | | BALANCED | 2 | | | |
| 2000s | 3 | | | | | | |
| 2010s | 3 | | | | | | |
| 2020s | 4 | | | | | | |

Split: **19 calibration** (`fd1a2c9fc4d8ece1`) / **7 holdout**
(`cb863d5de2734f74`). Zero overlap, asserted by test. The calibration set spans
all eight eras so tuning cannot overfit one.

## Target availability

| | |
| --- | --- |
| Fixtures with a sourced numeric target | **1** (`1980s-lakers-showtime`, 117.8 points, `RECORDED_STATISTIC`) |
| Fixtures with `SOURCE_BLOCKED` advanced targets | 25 |
| Calibration-set comparisons available | **0 of 209** |

The single sourced target is in the **holdout**, so the calibration set has no
numeric targets at all.

**Why.** Team-season advanced metrics live almost exclusively on
basketball-reference, which returns HTTP 403 to automated fetches. Wikipedia
season articles carry standings and individual leaders but no team advanced
tables. Aggregator pages carry player rows, not team rows.

Targets therefore stay `null`. See `DATA_BLOCKED` D1 in the priority register —
this is a CEO decision, not a coding problem.

## What was corrected while building it

Four **illegal position assignments**, caught by the position-legality test and
fixed with documented reasoning rather than by relaxing the check:

| Fixture | Problem | Fix |
| --- | --- | --- |
| 1950s | George Mikan (C only) at PF | moved to C |
| 1970s | Billy Paultz (C only) at PF | moved to C |
| 1980s | Michael Cooper (SG/SF) at PF | legal slot |
| 1980s | Ricky Pierce (SG only) at PG | legal slot |

One **lineup-basis downgrade**: `1980s-lakers-showtime` became
`DOCUMENTED_CORE_UNIT` rather than `ACTUAL_STARTING_FIVE`, because A.C. Green
has no card. Recording it as the real starting five would have been false.

## Known gaps

- **Zone-capable coaches are scarce.** The whole controlled zone finding rests on one matchup (L2 in the register).
- **Curated shooting tiers cover too few cards** to run the hierarchy test in six of eight eras (L1).
- No fixture has verified possession-level data; only team and player season aggregates were ever published.

## Not copyrighted content

The corpus commits structured facts, URLs, verification dates and confidence
grades. No third-party page text is committed, and `.cache/` is git-ignored.
Cache keys never contain API keys, session cookies, authorization headers, or
email addresses.
