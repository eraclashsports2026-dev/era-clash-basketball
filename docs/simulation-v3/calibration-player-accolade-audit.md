# Calibration-cohort accolade audit

Accolades feed `rawRating` → `displayOVR` → Player Intelligence → Team Intelligence, so an accolade
error is a **calibration** error. Only honours the model actually consumes are audited: MVP, All-NBA
First/Second/Third Team, All-Defensive First/Second Team, DPOY, Finals MVP, championships and the
`win`/`pop` weights.

Corrections are made **only** with source agreement, and the decade convention applies: a season
belongs to the decade of its **starting** year.

## Oscar Robertson

**Sources:** [landofbasketball award list](https://www.landofbasketball.com/nba_players/oscar_robertson.htm)
· [NBA.com legends profile / corroborating search](https://www.nba.com/news/history-nba-legend-oscar-robertson)
· [NBA All-Defensive Team](https://en.wikipedia.org/wiki/NBA_All-Defensive_Team)
· [Wikipedia career article](https://en.wikipedia.org/wiki/Oscar_Robertson)

**Verified:** All-NBA First Team **9×** (1960-61 … 1968-69) · All-NBA Second Team **2×** (1969-70,
1970-71) · MVP **1×** (1963-64) · All-Defensive **0**.

Applying the start-year convention: all nine First Teams fall in the 1960s; the 1969-70 Second Team
falls in the 1960s and the 1970-71 Second Team in the 1970s.

| Card | Field | Before | After |
|---|---|---|---|
| `oscar-60s` | `an1` | 6 | **9** |
| `oscar-60s` | `an2` | 2 | **1** |
| `oscar-70s` | `an2` | 2 | **1** |

The cards previously carried **four** Second Teams between them where only two exist.

### Impact

| | Before | After |
|---|---|---|
| `oscar-60s` `rawRating` | 229.5 | **252.5** (+10%) |
| `oscar-60s` `displayOVR` | 96 | **96** (unchanged) |
| `oscar-60s` OVR percentile | 91% | 91% |
| `oscar-70s` `displayOVR` | 89 | **88** |
| `oscar-70s` `selfCreation` | 7.7 | 7.5 |
| Baseline engine fixtures | — | **0 changed** |

**Finding worth carrying into Phase 6C2:** a source-verified 10% raw-rating correction produced
**zero** movement in displayed OVR, because the display scale saturates near the top. The engine
consumes intelligence derived from card statistics rather than `rawRating`, so `oscar-60s` behaved
identically before and after. That saturation means accolade accuracy has *less* calibration leverage
at the top of the distribution than expected — recorded in the priority register.

## Previously corrected (Phase 6B2, re-verified here)

| Card | Field | Was | Is | Source |
|---|---|---|---|---|
| `wilt-70s` | `ad1` | 1 | **2** | All-Defensive First Team 1971-72 and 1972-73 |
| `oscar-70s` | `ad1` | 1 | **0** | no All-Defensive selection in any season |

## Method and limits

- No value is changed from memory. Every correction cites at least two independent sources.
- Where sources disagree, the disagreement is recorded and source priority applies (official NBA →
  Hall of Fame → established statistical source → reputable award list). No correction is forced to
  satisfy a handoff.
- `basketball-reference.com` returns HTTP 403 to automated fetches, so it could not be used directly;
  award lists that reproduce its data were used with that limitation stated.
- Cards outside the calibration cohort are **not** audited in this phase. Irrelevant honours the model
  does not consume are not audited at all.
