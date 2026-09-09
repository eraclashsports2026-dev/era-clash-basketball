# Historical corpus v2

`data/calibration/historical-corpus-v2.json` · `historicalCorpusVersion` **2.0.0**
**10 fixtures · 4 of 8 eras · corpus hash `f15a289cf99c281b`**

Generated, not hand-written. Every fixture satisfies four checks by
measurement before it is accepted:

1. all five cards verifiably appear on that team-season's own roster or statistics table
2. the coach coached that team-season
3. every card's decade contains the season
4. the five fill PG–SG–SF–PF–C legally

## The corpus

| Fixture | Era | Classification | Confidence | Five |
| --- | --- | --- | --- | --- |
| `h2-1962-63-celtics` | 1960s | **HISTORICAL_LINEUP** | HIGH | Cousy, Jones, Havlicek, Heinsohn, Russell |
| `h2-1964-65-celtics` | 1960s | STARTER_PROXY | MEDIUM | Siegfried, Jones, Havlicek, Heinsohn, Russell |
| `h2-1972-73-celtics` | 1970s | STARTER_PROXY | MEDIUM | White, Westphal, Havlicek, Silas, Cowens |
| `h2-1974-75-celtics` | 1970s | STARTER_PROXY | MEDIUM | White, Westphal, Havlicek, Silas, Cowens |
| `h2-1983-84-celtics` | 1980s | **HISTORICAL_LINEUP** | HIGH | Johnson, Ainge, Bird, McHale, Parish |
| `h2-1985-86-celtics` | 1980s | **HISTORICAL_LINEUP** | HIGH | Johnson, Ainge, Bird, McHale, Parish |
| `h2-1984-85-lakers` | 1980s | STARTER_PROXY | MEDIUM_HIGH | Johnson, Scott, Cooper, Worthy, Abdul-Jabbar |
| `h2-1986-87-lakers` | 1980s | STARTER_PROXY | MEDIUM_HIGH | Johnson, Scott, Worthy, Thompson, Abdul-Jabbar |
| `h2-1987-88-lakers` | 1980s | STARTER_PROXY | MEDIUM_HIGH | Johnson, Scott, Cooper, Thompson, Abdul-Jabbar |
| `h2-2003-04-pistons` | 2000s | STARTER_PROXY | MEDIUM_HIGH | Billups, Hamilton, Prince, Okur, Wallace |

## The blocker, stated plainly

**The phase target of ≥24 historical fixtures across all eight Era Styles is not
achievable with this card pool.**

| | Target | Actual |
| --- | --- | --- |
| Fixtures | ≥24 | **10** |
| Eras covered | 8 | **4** |
| Per era | 3–5 | 1960s 2 · 1970s 2 · 1980s 5 · 2000s 1 |
| Franchises | diverse | **Celtics 6 · Lakers 3 · Pistons 1** |

**1950s, 1990s, 2010s and 2020s contain zero eligible fixtures.**

### Why, measured

**64 candidate team-seasons were scanned** across all eight eras — champions,
pace extremes, defensive teams, shooting teams, non-champions. Only **14**
could field a legal five from carded players, collapsing to **10** distinct
fixtures once identical fives and unverifiable coaches were removed.

The cause is structural. The pool is 381 all-time greats spread across 30
franchises and 75 seasons — roughly 48 cards per decade against 30 teams. A real
starting five contains role players who are not all-time greats, so intact fives
survive only on dynasties with unusual card density:

- **1997-98 Bulls**: Jordan, Pippen, Kukoc, Longley, Rodman all carded — **no point guard**, because Ron Harper has no card.
- **2004-05 Suns**: Nash, Marion, Stoudemire, Joe Johnson carded — no centre.
- **2019-20 Lakers**: four carded, and the apparent fifth was a **false name match** (Danny Green matched to Draymond Green), corrected by tightening the matcher to exact names and documented aliases only.

### Consequence

Per Part 18, broad parameter tuning does **not** proceed on this corpus. Seven
calibration fixtures from two franchises across three eras cannot support tuning
that generalises; it would fit the Celtics and the Lakers.

## Sources

Wikipedia (CC BY-SA 4.0) only, with attribution, revision ID and content hash on
every fixture. **Basketball-Reference is prohibited** for model calibration by
its own terms and was not used.

Evidence grade is recorded per fixture: `PLAYER_STATISTICS` (6 fixtures) or
`ROSTER_ONLY` (4). A roster table proves membership and says nothing about
production, so those four carry `playerShareConfidence: SOURCE_BLOCKED`.
