# Calibration-only player data

`data/calibration/calibration-players-v3.json` · `calibrationPlayerDataVersion` **1.0.0**
**160 profiles · 130 distinct people · 0 unresolved · hash `c20d58ddb8ba9083`**

```bash
npm run calibration:players:build
```
```bash
npm run calibration:players:verify
```
```bash
npm run calibration:players:coverage
```

## Coverage

| | |
| --- | --- |
| Profiles | **160** (5 × 32 fixtures) |
| Per era | **20** in each of the eight Era Styles |
| Per position | **32** at each of PG, SG, SF, PF, C |
| Linked to a public person | 103 |
| **Internal-only people** | **57** |
| Confidence | 157 MEDIUM_HIGH · 3 LOW |
| Unresolved | **0** |

The **57 internal-only players** are the point. They are the Ron Harpers, Jim
Loscutoffs and Marc Iavaronis without whom a real starting five cannot be
fielded — and who have no business in a draft pool of all-time greats.

## Two authorized routes

**Route 1 — the player's own career table.** Preferred: it carries the season's
statistics as well as the team.

**Route 2 — the team-season article.** Needed because:

- some player articles carry **no career table at all** (Luc Longley's has only navboxes)
- a **mid-season trade** shows only the origin team on the player's page — Rasheed Wallace's 2003-04 row reads *Portland*, though he finished the season in Detroit and won a title there

Route 2 proves membership. Whether it also supplies statistics depends on
whether that article has a statistics table, and **confidence follows the
route**: a roster-only resolution is `LOW`, and every statistic stays `null`
rather than being borrowed from an adjacent season.

## Problems found and refused

Building this surfaced four classes of error, each refused rather than guessed
around:

| Problem | Example | Resolution |
| --- | --- | --- |
| Disambiguation page | "Kevin McHale" is a 4KB disambiguation page with zero tables | Explicit qualified titles |
| League-qualified team label | Julius Erving's row reads "Philadelphia (NBA)" | Strip the league, keep the franchise |
| Mid-season trade | Rasheed Wallace, Jakob Pöltl | Team-season article route |
| A player who was not there | Pöltl joined Toronto at the February deadline | Fixture uses the season's actual most-used five, with Siakam at centre |

## Exact name matching only

No fuzzy fallback exists. Exact normalised name, or a **documented alias**
(`Kareem Abdul-Jabbar`/`Lew Alcindor`, `Nate Archibald`/`Tiny Archibald`), or
`UNRESOLVED_PLAYER`.

The rule earns its keep: a last-name-plus-first-initial matcher previously paired
**Draymond Green with the 2019-20 Lakers' Danny Green**. Regression tests cover
that pair plus similar surnames, suffixes, nicknames and diacritics.

## Sources

Wikipedia only (CC BY-SA 4.0), with attribution, revision id, content hash and
retrieval date on every profile. **Basketball-Reference is prohibited** for
model calibration by its own terms and was not used. Raw pages stay in
`.cache/`, which is git-ignored; only structured facts are committed.
