# Independent source verification

**State: BLOCKED. Gate FAIL. No formal holdout may be opened.**

`independentSourceVerificationVersion 1.0.0`

## What the gate required

| Scope | Requirement |
|---|---|
| Holdout fixture rosters | 8 / 8 independently verified |
| Holdout coach-seasons | 8 / 8 |
| Holdout season/team identities | 8 / 8 |
| Holdout core Tier A rows | 100% |
| Calibration fixtures per era | ≥ 25%, minimum 1 |
| Calibration player-seasons per era | ≥ 20% |
| Ambiguous identities, alias migrations, critical holdout roles | all |

Every one of these presupposes an **editorially independent, licence-authorized**
second source. The project's 160 calibration profiles all come from one publisher
(Wikipedia, CC BY-SA 4.0), so a second source is not an improvement here — it is
the precondition.

## Finding: no such source is available without purchase

Terms of Use pages were fetched and read for each candidate. Verdicts rest on
quoted clauses, not on assumption.

### Prohibited

| Source | Ground |
|---|---|
| **NBA.com / stats.nba.com** | Terms §9 restricts statistics to non-commercial purposes, bars use in any commercial product, and bars use in any product featuring a comprehensive statistics database |
| **data.nba.net / cdn.nba.com** | Same §9; endpoints also defunct or 403, and `robots.txt` disallows `/api/*` |
| **NBA team media guides** | "may be used only for personal or editorial purposes"; commercial use prohibited. Also Elias/NBA output, so not independent |
| **Kaggle (platform)** | Terms require "your own internal, personal, non-commercial use" and bar scraping or storing significant portions |
| **Sportradar** | Grant is display-only; derivative works barred. Deriving coefficients is not display. NBA history only to 2013 |
| **BigDataBall** | "your personal, non-commercial use" |
| **MIT-licensed GitHub packages** (`nba_api`, `hoopR`, `nbastatR`, `nbadb`) | MIT licenses the **scraper**, not the statistics. Each resolves to NBA §9; two additionally read Basketball-Reference directly |

The most dangerous single item found deserves naming: the Kaggle dataset
`sumitrodatta/nba-aba-baa-stats` is badged **CC0 Public Domain** while its own
description says it was scraped from Basketball-Reference, and its player IDs are
literal Basketball-Reference slugs. It is simultaneously the best-fitted dataset
in this entire assessment — team *and* opponent totals from 1974 — and a pure
scrape of the excluded source. **CC0 launders nothing**: the uploader waived
rights he held, and he held none in the compiler's work. An engineer reading only
the badge would reach for it. It is now excluded by name.

### Unclear — no licence granted

**StatsCrew.com** is the near-miss worth a decision. It has **exactly the right
data** — FGA, FGM, 3PA, 3PM, FTA, FTM, Off, Def, Reb, Ast, Stl, Blk, TO, PF, Pts
plus a team totals row, covering 1946-47 onward — and it is **genuinely
independent** of both Wikipedia and Sports Reference, crediting the primary-source
basketball historians instead.

But its footer carries only a copyright notice. There is no data-reuse grant, no
scraping clause, no AI clause. **Silence is not permission.** The project policy
is written as a prohibition test, which StatsCrew passes trivially by saying
nothing; the gate requires a *licence-authorized* source, which is a permission
test, and silence fails it. These two tests give opposite answers here, and the
permission test is the right one — silence gives nothing to rely on in a dispute.

**balldontlie.io** is the only vendor with an express AI grant, but states its
data is "compiled and aggregated from a variety of third-party sources" and that
it does not guarantee its own origin. An aggregator that disclaims knowing its
supply chain cannot be cleared under a derivation-based policy.

### The one buyable candidate

**SportsDataIO.** No AI, machine-learning or training clause exists in its terms;
better than silence, it markets this exact use, advertising historical data to
train models. Automated access is barred only via means "not authorized by us" —
a purchased API key is authorized. First-party collection, independent of both
Wikipedia and Basketball-Reference. Team stats include FGA, FTA, turnovers,
offensive and defensive rebounds, and possessions.

Two caveats: the grant is permissive-by-silence rather than by express term, and
the vendor's own materials contradict each other on NBA coverage start year
(2008-09 in the docs, 2010 on the historical page).

## A finding against our own posture

Every NBA team-season Wikipedia article examined carries a `bbr_team` infobox
parameter and cites Basketball-Reference as its statistical source. **The
derivation argument used to exclude Basketball-Reference mirrors applies to the
project's own 100%-Wikipedia baseline.** CC BY-SA covers Wikipedia's text; it does
not cure upstream provenance.

This is recorded because it is inconvenient. It does not by itself make the
existing corpus unusable — facts are not copyrightable in most jurisdictions, and
the extracted values are numeric facts with revision-level provenance — but it is
a live inconsistency in the posture and should be resolved by qualified legal
review rather than left implicit in a clean-looking registry.

**A related correction to this project's own records.** The source registry
previously stated that Basketball-Reference is excluded because its terms bar
AI/model use. That characterisation was written from the *policy's* wording, not
from the source's terms. NBA.com and Kaggle — both excluded — contain **no AI
clause at all**; their exclusions rest on commercial-use and database clauses. The
registry now records the classification as a standing instruction and explicitly
declines to characterise the contractual grounds, which are a matter for legal
review. Asserting a clause that may not exist would not survive that review.

## Second, independent hard floor

Offensive and defensive rebound splits, steals, blocks and team turnovers became
official NBA statistics in **1973-74**; player turnovers in **1977-78**. TOV% and
ORB% are therefore underivable before 1973-74 from **any** source, licensed or
not. Any vendor advertising "1946–present" overstates what it can supply for
those metrics. This binds every candidate equally and must scope any procurement.

## Verdict

| | |
|---|---|
| Independent authorized source exists | **No** |
| Holdout rosters verified | **0 / 8** |
| Holdout coach-seasons verified | **0 / 8** |
| Holdout core Tier A rows verified | **0%** |
| Calibration fixtures verified | **0%** |
| Player-seasons verified | **0%** |
| Prohibited sources used | 0 |
| **Gate** | **FAIL** |

Per the frozen policy and the phase's failure rules: do not tune unsupported
domains, **do not open formal holdouts**, do not lock a full calibration, do not
preview, do not deploy.

## What would need to be procured

1. **SportsDataIO subscription plus a one-line written rider** confirming the
   right to derive and calibrate model parameters from historical data, and
   confirming the NBA coverage start year. This is the recommended path: it costs
   one email and converts "arguably permitted" into "permitted".
2. **Written permission from StatsCrew** — pursued in parallel, costs only time.
   It is the only free source that is both complete and independent of Wikipedia
   *and* Sports Reference, which nothing else on the list achieves.
3. **Not worth pursuing:** a direct NBA/Elias licence. Simulation rights are
   licensed at the NBA 2K tier, and Elias has historically declined research use.
