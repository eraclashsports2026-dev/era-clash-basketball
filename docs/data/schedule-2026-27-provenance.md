# 2026–27 schedule provenance

Verified on 2026-10-02. [Official schedule release](https://pr.nba.com/2026-27-nba-regular-season-schedule), published 2026-08-13, links the [by-date PDF](https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf). The local data file is `data/schedule/2026-27.json`.

The PDF supplies 1,200 uniquely numbered assigned games, October 20, 2026 through April 11, 2027. Extraction validated all game numbers 1–1200, all 30 team identifiers, 80 appearances per team, and 40 designated home/40 designated away games per team. Three `vs` games have a neutral venue designation; five arena note codes are preserved separately, including Spurs games in Austin that remain designated home games.

PDF SHA-256: `5e82e37ef1b19e226dee57be69958b95b5694516280d3034aa7c1d64292b3570`.

The official release assigns only 80 of each team's 82 games. Two additional games per team (30 games in total) during December 4–10 depend on Cup group-play outcomes. They are explicit metadata, **not fabricated fixtures**, and a date with no assigned games may still lie inside that unresolved window. The championship itself is not added as a regular-season game by this extraction. The release is subject to change, so refresh the schedule after official updates; do not silently claim the August PDF is live data.

Times come from the PDF's ET column, with `America/New_York` and DST-aware UTC conversion. For example, Oklahoma City at San Antonio on October 20 at 9:30 PM ET is October 21 at 01:30 UTC; it remains an October 20 Tonight card. Nightly default dates use the Eastern calendar rather than a server's UTC date. Game-day arena/broadcast fields are descriptive and do not alter the protected neutral-court simulation.

## Opening-night fact check

The official release confirms Tuesday, 2026-10-20: Boston at Detroit at 3:00 PM ET; Philadelphia at New York at 7:00 PM ET; Oklahoma City at San Antonio at 9:30 PM ET. Its NBCUniversal section explicitly describes James and Brown making their Philadelphia debuts and New York raising its championship banner. It separately calls the October 22 Cleveland matchup James's Philadelphia **home** debut. The handoff's opening-night premise is supported by that official source, not treated as an assumed transfer.

Tonight's Clash still uses curated all-time fives. The opening-night narrative does not move LeBron into the curated Philadelphia five or reassign existing card data. The product's all-time simulation is not a contemporary roster forecast or a real-game result.

## Reproduction

1. Download the by-date official PDF linked above.
2. Extract its rows, keeping the away/home relationship and ET date/time columns separate from local time.
3. Map the 30 official schedule city identifiers to `FRANCHISES` ids. Preserve arena notes and `vs` neutrality separately.
4. Reject unknown teams, duplicate game numbers, malformed calendar dates, or count discrepancies. Verify 1,200 games and the per-team 80/40/40 counts for this release.
5. Convert ET instants with `America/New_York`; preserve original ET date keys.
6. Keep Cup-dependent missing games in metadata until a later official release assigns them. Record refreshed source URL, date, and hash.

No provider API credentials or paid sports-data subscription are required.
