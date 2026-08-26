# External calibration prerequisites

**None of these is complete. None can be completed in code.**

Phase 6C2C3 removed the *internal* engineering blocker: the registry is now
authoritative and all 53 active parameters reach the engine. The blockers that
remain are external, and this register exists so that "blocked" names a specific
missing thing rather than a mood.

## 1. Licensed Tier B historical source

**Status: NOT OBTAINED.**

Tier B coverage stands at **2 of 384 fields**. 288 are
`SOURCE_BLOCKED_LICENSING`; 82 are `NOT_RECORDED_IN_ERA` and permanently
unobtainable at any price.

Measured across all 32 authorized team-season articles: FGM, 3PM, 3PA, FTM, ORB,
DRB, TRB and TOV appear in **none of them**. Eleven of twelve Tier B metrics are
derivable for zero fixtures.

| | |
|---|---|
| Recommended path | SportsDataIO subscription (~$19–99/mo self-serve) |
| Also required | a one-line **written rider** confirming the right to derive and calibrate model parameters from historical data, and confirming the NBA coverage start year (vendor materials say 2008-09 in docs and 2010 on the historical page) |
| Why the rider | the terms contain no AI or model clause at all, so permission is by silence. Silence is better than prohibition and worse than a grant |

**Parameter domains this would unlock:** team-efficiency and possession-event
targets — which is the evidence base for the 13 currently-`UNSUPPORTED`
shot-location, conversion and era parameters, and the only route to
`HISTORICAL_NUMERIC_SUPPORT` for anything beyond player share structure.

## 2. Independent authorized verification source

**Status: NOT OBTAINED.** 0 of 8 holdout fixtures independently verified.

All 160 calibration profiles come from one publisher. A second source is not an
improvement here, it is the precondition for opening a formal holdout.

**StatsCrew.com** is the strongest free candidate: it has exactly the right data
(FGA, FGM, 3PA, 3PM, FTA, FTM, ORB, DRB, AST, STL, BLK, TOV plus a team totals
row, 1946-47 onward) and is genuinely independent of both Wikipedia and the
excluded publisher. It grants **no licence at all** — only a copyright notice.

| | |
|---|---|
| Action | request written permission for non-redistributive calibration use |
| Cost | time only |
| Why worth it | it is the only free source independent of *both* Wikipedia and the excluded publisher |

**Excluded, with reasons recorded:** NBA.com (§9 non-commercial and
comprehensive-database clauses), Kaggle (platform non-commercial; its best-fitted
NBA dataset is badged CC0 while being a scrape of the excluded publisher — CC0
launders nothing), MIT-licensed GitHub packages (MIT licenses the scraper, not
the statistics), Sportradar (display-only grant), team media guides (Elias
output, non-commercial), BigDataBall (non-commercial).

## 3. Legal review — Wikipedia-derived records

**Status: NOT REQUESTED.**

Every NBA team-season Wikipedia article examined carries a `bbr_team` infobox
parameter citing the excluded publisher as its statistical source. CC BY-SA
covers Wikipedia's *text*; it does not cure upstream provenance.

This does not by itself make the corpus unusable — the extracted values are
numeric facts with revision-level provenance, and facts are not copyrightable in
most jurisdictions. But it is a live inconsistency in the posture: the derivation
argument used to exclude that publisher's mirrors applies to our own baseline.

**Question for review:** may numeric facts extracted from a CC BY-SA article be
used for model calibration when the article cites a prohibited source?

## 4. Legal review — `eras.js` provenance

**Status: NOT REQUESTED. This one is already in production.**

`src/v3/data/eras.js` records its environment values — pace, FG%, 3PA/game, 3P%,
FTA/game, AST/game, TOV/game, OREB% for all eight eras — as sourced from
*"Basketball Reference league index"*. Engine 3.2.0 is ACTIVE and reads it.

64 league-average constants (8 eras × 8 values). Nothing in Phase 6C2C2 or 6C2C3
touched them.

**This is why 13 of 53 parameters are `UNSUPPORTED`**: all shot-location weights,
all conversion bonuses and the era anchors are judged solely against these
values, so they have a target that policy forbids using.

**Question for review:** may these 64 values remain in the production engine, and
may they serve as calibration targets?

## 5. Written permission for commercial derived output

**Status: NOT REQUESTED.**

EraClash is a commercial product. Any procured source must permit not just
calibration but shipping a simulation whose coefficients were derived from that
data. Several excluded candidates fail specifically on commercial use rather than
on AI use, so this is the clause that matters most and the one most likely to be
missing from a self-serve tier.

## 6. Permanently unavailable metrics — no remedy exists

| Statistic | First recorded |
|---|---|
| Offensive/defensive rebound splits | 1973-74 |
| Steals, blocks, team turnovers | 1973-74 |
| Player turnovers | 1977-78 |
| Three-point line | 1979-80 |

TOV% and ORB% are underivable before 1973-74 from **any** source, licensed or
not. 82 Tier B fields fall here. Any vendor advertising "1946–present" is
overstating what it can supply for these metrics, and any procurement must be
scoped accordingly.

## Data-import format, when a source arrives

Whatever is procured must land as structured facts with per-value provenance:
source id, publisher, URL or licensed-file identity, source type, licence note,
retrieval timestamp, content hash, attribution, verification status, confidence,
and the derivation formula where a value is computed. Unprovenanced values remain
prohibited. No third-party page content is committed.

## Sequencing

**Wire first, buy second — already done, in that order.** Phase 6C2C3 completed
the internal work, so a purchased licence would no longer wait on a code change.
The remaining order is: (2) and (3)/(4) in parallel, since a legal answer may
change what is worth buying, then (1) with the rider from (5).
