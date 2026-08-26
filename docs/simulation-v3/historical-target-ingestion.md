# Historical target ingestion

`scripts/calibration/import-targets.mjs` · `historicalTargetDataVersion` **1.0.0**

```bash
npm run calibration:import-targets
```
```bash
npm run calibration:verify-targets
```
```bash
npm run calibration:coverage
```

## Authorized sources

| Source | Type | Licence | What it supplies |
| --- | --- | --- | --- |
| Wikipedia | `AUTHORIZED_PUBLIC_API` | CC BY-SA 4.0 | Team win-loss records; per-player season lines |
| EraClash player cards | `IN_REPO_VERIFIED` | own data | Selected-five share proxies |

Wikipedia's licence explicitly permits reuse with attribution, which is why it
is usable at all. Every value it produces carries that attribution.

## Excluded sources, and the real reason

### basketball-reference.com — excluded on **licensing**, not access

Phase 6C1 recorded this source as blocked by **HTTP 403**. That was wrong, and
the correction matters.

The 403 was an artifact of one fetch tool's user agent. With an honest,
self-identifying agent on a robots-permitted path, the site returns **HTTP 200**
and the full advanced team table. `robots.txt` disallows `GPTBot` entirely but
permits `/leagues/` and `/teams/` for `User-agent: *` with a 3-second crawl
delay.

The actual barrier is the terms of use, which forbid using the site's
statistics:

> "for purposes of training, fine-tuning, prompting, or instructing artificial
> intelligence models or technologies in any manner"

Calibrating a simulation model against that data sits squarely inside that
prohibition. **Being able to reach data is not the same as being allowed to use
it**, and no user-agent trick changes that.

This distinction is not pedantic. A technical block invites a technical
workaround; a licence term does not. Recording the wrong reason would have sent
the next phase hunting for a scraper that must not be built. The remedy is a
`LICENSED_EXPORT` or express written permission — a CEO decision.

### stats.nba.com — excluded on access

No response from this environment; nba.com denies even `robots.txt`. Remedy: an
official data agreement.

## What the pipeline refuses

A number with no provenance never enters the store. Every populated value
carries source type, publisher, URL or file identity, retrieval date, content
hash, licence note and verification status. Derived values additionally carry
their formula.

The importer rejects, rather than stores: unknown metrics, impossible
percentages, out-of-range values, shares that do not sum to one, unresolved
fixture IDs, values without provenance, derived values without a formula, and
any blocked metric that arrived as `0`.

## What is stored, and what is not

Only structured facts: values, formulas, source URLs, revision IDs, content
hashes, retrieval dates. **No page text is committed.** Raw responses are cached
under `.cache/` (git-ignored) so a re-run is reproducible without re-fetching
and the content hash stays verifiable.

## Rate limiting

The adapter waits 1.5 s between Wikipedia calls. An initial 300 ms interval was
rate-limited, and the correct response to a rate limit is to slow down, not to
work around it. The adapter does not retry past one.

It identifies itself as `EraClashCalibration/1.0` with a contact address, and
never as a browser — spoofing one would misrepresent affiliation.

## Parsing: rendered HTML, not wikitext

The adapter parses the API's rendered HTML. A first attempt on wikitext parsed
**9 of 16** articles and produced names like `Stephen|Curry}}`, because
`{{sortname}}` templates and per-cell styling contain pipes indistinguishable
from cell separators. The rendered HTML has already resolved every template, so
one parser handles a 1971 article and a 2024 one.

Three normalisations it performs, each fixing a defect found in real data:

1. **Season totals → per game**, detected **per column**. The 1985-86 Celtics
   article publishes totals (Larry Bird `PTS 2115`); the 1986-87 Lakers article
   mixes per-game scoring with total rebounds in the *same table*, which a
   whole-table verdict misread as Magic Johnson taking 504 rebounds per game.
   The test is plausibility: no player has averaged more than 55 points, 30
   rebounds or 16 assists per game, so a column exceeding its ceiling is totals.
2. **Percentages** written as `.433` or as `50.4` are normalised to one scale.
   Mixing them is silent and catastrophic — both look plausible in a table.
3. **Statistics tables only.** Draft and roster tables also carry a "Player"
   column; a table qualifies only if it also has games and points.

15 of 16 mapped articles parse. The 1982-83 76ers article genuinely has no
player statistics table, which is reported as absent rather than filled in.

## Measured lineup fidelity

The pipeline records how many of each fixture's five players actually played for
that team in that season — measured, not taken from the fixture's own label.

**Only 1 of 26 fixtures is genuinely the documented starting five of its named
season**, and it is in the holdout. `2010s-warriors-movement` is labelled
`DOCUMENTED_STARTING_FIVE` for 2015-16 but contains LeBron James and Nikola
Jokić; `2020s-nuggets-hub` matches 1 of 5. Mean fidelity is 56% across the
calibration set.

This is why **card-derived shares are the primary Tier C method** and season
data is a cross-check. A season-based unit share would describe a five that
never existed. Partial matches deliberately produce *no* season share:
normalising two matched players to 100% would invent a two-man team.
