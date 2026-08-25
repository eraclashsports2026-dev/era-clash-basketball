# Pre-recording defensive research — final accounting

Canonical source: **`npm run audit:pre1974-defense`**. Every figure derived at run time.

## Final counts

| | |
|---|---|
| Affected cards | **98** |
| **Reviewed** | **97** |
| · Recorded-stat | 44 |
| · Documented-role | 14 |
| · Calculated | 27 |
| · Inferred | 5 |
| · Curated-attribute | 7 |
| **Unreviewed** | **0** |
| **Blocked** | **1** |

Reconciles exactly: 97 + 0 + 1 = 98.

## What the 45 "unreviewed" cards actually were

All 45 were 1970s cards — 40 `INDETERMINATE_WINDOW` (decade label only) and 5
`MIXED_RECORDING_WINDOW`. The Phase 6A audit classified them as unreviewed because it could not tell
**which seasons** they represented, and conservatively read "unknown window" as "unreviewed defence".

**42 of the 45 were never a data gap.** A card carrying a **non-zero** steal or block average cannot
have derived that value from a pre-recording season, because the statistic did not exist. Those
values are recorded measurements, and the audit now classifies them `RECORDED_STAT` on exactly that
reasoning.

Only **three** cards carried `stl: 0` and `blk: 0` and needed a source-verified review.

## The three reviews

### Wilt Chamberlain (1970s) — `DOCUMENTED_ROLE`

- **Final NBA season 1972-73** ([Wikipedia](https://en.wikipedia.org/wiki/Wilt_Chamberlain)). The card
  therefore has **no** recorded seasons and its zeros are correct.
- **All-Defensive First Team 1971-72 and 1972-73** — both inside this card's decade
  ([NBA All-Defensive Team](https://en.wikipedia.org/wiki/NBA_All-Defensive_Team)).
- 19.2 rebounds per game on the card.
- Bands: interior **ELITE**, perimeter AVERAGE, event creation **ELITE**. No rate claimed.

**Data error corrected:** the card claimed **one** All-Defensive First Team. It has **two**.

### Oscar Robertson (1970s) — `INFERRED`

- **No All-Defensive selections in any season**, verified against the league All-Defensive listing and
  confirmed by a second source ([NBA.com legends profile / search corroboration](https://www.nba.com/news/history-nba-legend-oscar-robertson)).
- Played **1973-74** (70 games, Milwaukee) ([Wikipedia](https://en.wikipedia.org/wiki/Oscar_Robertson)),
  so the card spans a mixed window — but its own averages carry no event data.
- A 6ft5 lead guard at 5.7 rebounds per game.
- Bands: interior LIMITED, perimeter AVERAGE, event creation AVERAGE.

**Data error corrected:** the card claimed **one** All-Defensive First Team. He has **none**. This is
the same class of error the earlier verification pass found — an invented honour — and it is why
accolades are checked against per-season award listings rather than a player article.

### Connie Hawkins (1970s) — `DOCUMENTED_ROLE`

- NBA **1969-70 through 1975-76** ([Wikipedia](https://en.wikipedia.org/wiki/Connie_Hawkins)).
- Per-season records **do** exist for his post-1973 seasons: **1.5 steals / 1.4 blocks in 1973-74**.
- 8.8 rebounds per game on the card.
- Bands: interior AVERAGE, perimeter **STRONG**, event creation **STRONG**. The band reflects the
  recorded evidence without asserting a decade mean the card does not contain.

## Still blocked

`lucas-m-70s` (Maurice Lucas) — Wikipedia provides career totals only across ABA+NBA and no
per-season NBA table is available, so the decade mean cannot be reproduced. **Blocked, not guessed.**

## Nothing was fabricated

No steal, block, modern tracking metric, point-of-attack rating or switching rate was invented. The
three reviews produced **categorical bands** and, where a recorded value exists, cited it as evidence
rather than copying it into a decade average it does not describe.

## Separate findings raised while researching

1. **`luol-70s` is named "Curtis Perry".** The card id suggests a different player entirely. The id is
   used as a stable key across the codebase so renaming it is not a data fix — it is a migration, and
   it is recorded here rather than done silently.
2. **`oscar-60s` claims 6 All-NBA First Teams.** Sources list Robertson with **nine** consecutive
   All-NBA First Teams (1961–1969), all of which fall in the 1960s under the season-start-year
   convention. This is an *offensive* accolade and outside this workstream's defensive scope, but it
   looks like an undercount and belongs in the next verification wave.
