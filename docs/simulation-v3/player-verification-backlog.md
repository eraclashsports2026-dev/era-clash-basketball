# Player verification backlog

Wave 1 is complete. This is the ranked plan for the remaining **310
`LEGACY_UNVERIFIED`** cards.

> **The pool is not verified.** 310 of 381 cards (81%) have no recorded
> averaging rule. This document exists so that fact stays visible and gets
> retired in priority order rather than all at once by guesswork.

## Wave status

| Wave | Cards | Status |
| --- | ---: | --- |
| `WAVE_1_COMPLETE` | 43 | ✅ done — the `REPRESENTATIVE_PRIME` set, see `player-rederivation-wave-1.md` |
| `BLOCKED_BY_SOURCE` | 1 | `lucas-m-70s` — career totals only, no per-season table |
| `WAVE_2_HIGH_PRIORITY` | 80 | next |
| `WAVE_3_MEDIUM_PRIORITY` | 120 | after Wave 2 |
| `WAVE_4_LOW_PRIORITY` | 110 | opportunistic |

## Ranking method

Reproducible, not editorial. Priority score =

```
OVR × 0.05  +  popularity × 0.9  +  unknownFields × 1.2  +  eraSensitiveSkills × 0.5
```

- **popularity** dominates because a card nobody drafts is a card whose errors
  nobody meets. (Draft telemetry does not exist yet; when it does it should
  replace `pop` here, and this weighting should be revisited.)
- **unknownFields** counts missing verified physical and missing measured
  shooting — cards where verification adds the most, not merely corrects.
- **eraSensitiveSkills** counts strengths whose value the Era Style engine will
  price, so the cards most exposed to Phase 5B rank higher.

## Why these criteria and not others

Draft frequency would be the best signal and is unavailable. Coach-fit
sensitivity is captured indirectly: the dimensions most sensitive to weak player
data (spacing, post play, interior geometry) are exactly the ones driven by
shooting and physical data, which `unknownFields` measures.

## WAVE_2_HIGH_PRIORITY (80)

| Card | Player | Decade | OVR | Unknown fields | Score |
| --- | --- | --- | ---: | ---: | ---: |
| `julius-70s` | Julius Erving | 1970s | 97 | 4 | 19.15 |
| `wade-00s` | Dwyane Wade | 2000s | 94 | 4 | 18.6 |
| `giannis-10s` | Giannis Antetokounmpo | 2010s | 96 | 4 | 18.2 |
| `barkley-90s` | Charles Barkley | 1990s | 95 | 4 | 18.15 |
| `giannis-20s` | Giannis Antetokounmpo | 2020s | 95 | 4 | 18.15 |
| `julius-80s` | Julius Erving | 1980s | 94 | 4 | 18.1 |
| `wade-10s` | Dwyane Wade | 2010s | 92 | 4 | 18 |
| `kobe-00s` | Kobe Bryant | 2000s | 98 | 2 | 17.8 |
| `cp3-10s` | Chris Paul | 2010s | 96 | 4 | 17.8 |
| `lebron-00s` | LeBron James | 2000s | 97 | 2 | 17.75 |
| `cp3-00s` | Chris Paul | 2000s | 95 | 4 | 17.75 |
| `nash-00s` | Steve Nash | 2000s | 95 | 4 | 17.75 |
| `kobe-10s` | Kobe Bryant | 2010s | 96 | 2 | 17.7 |
| `embiid-20s` | Joel Embiid | 2020s | 93 | 4 | 17.65 |
| `shai-20s` | Shai Gilgeous-Alexander | 2020s | 90 | 4 | 17.5 |
| `jordan-90s` | Michael Jordan | 1990s | 99 | 2 | 17.35 |
| `rob-90s` | David Robinson | 1990s | 97 | 4 | 17.35 |
| `malone-90s` | Karl Malone | 1990s | 97 | 4 | 17.35 |
| `lebron-10s` | LeBron James | 2010s | 99 | 2 | 17.35 |
| `jordan-80s` | Michael Jordan | 1980s | 98 | 2 | 17.3 |
| `john-h-70s` | John Havlicek | 1970s | 95 | 4 | 17.25 |
| `isiah-80s` | Isiah Thomas | 1980s | 95 | 4 | 17.25 |
| `walt-70s` | Walt Frazier | 1970s | 94 | 4 | 17.2 |
| `ant-20s` | Anthony Edwards | 2020s | 84 | 4 | 17.2 |
| `kyrie-10s` | Kyrie Irving | 2010s | 91 | 4 | 17.05 |
| `tatum-20s` | Jayson Tatum | 2020s | 91 | 4 | 17.05 |
| `george-70s` | George Gervin | 1970s | 90 | 4 | 17 |
| `dom-80s` | Dominique Wilkins | 1980s | 90 | 4 | 17 |
| `lebron-20s` | LeBron James | 2020s | 92 | 2 | 17 |
| `charles-80s` | Charles Barkley | 1980s | 89 | 4 | 16.95 |
| `tmac-00s` | Tracy McGrady | 2000s | 89 | 4 | 16.95 |
| `wemby-20s` | Victor Wembanyama | 2020s | 89 | 4 | 16.95 |
| `jokic-20s` | Nikola Jokic | 2020s | 98 | 2 | 16.9 |
| `dwight-10s` | Dwight Howard | 2010s | 97 | 4 | 16.85 |
| `pg-10s` | Paul George | 2010s | 94 | 4 | 16.8 |
| `pete-70s` | Pete Maravich | 1970s | 85 | 4 | 16.75 |
| `stock-90s` | John Stockton | 1990s | 95 | 4 | 16.75 |
| `ewing-90s` | Patrick Ewing | 1990s | 91 | 4 | 16.65 |
| `jbrown-20s` | Jaylen Brown | 2020s | 90 | 4 | 16.6 |
| `embiid-10s` | Joel Embiid | 2010s | 89 | 4 | 16.55 |
| `duncan-00s` | Tim Duncan | 2000s | 99 | 2 | 16.45 |
| `moses-80s` | Moses Malone | 1980s | 95 | 4 | 16.35 |
| `penny-90s` | Penny Hardaway | 1990s | 87 | 4 | 16.35 |
| `dame-10s` | Damian Lillard | 2010s | 85 | 4 | 16.35 |
| `booker-20s` | Devin Booker | 2020s | 85 | 4 | 16.35 |
| `grant-90s` | Grant Hill | 1990s | 86 | 4 | 16.3 |
| `durant-10s` | Kevin Durant | 2010s | 96 | 2 | 16.3 |
| `kidd-00s` | Jason Kidd | 2000s | 93 | 4 | 16.25 |
| `ad-20s` | Anthony Davis | 2020s | 93 | 4 | 16.25 |
| `dame-20s` | Damian Lillard | 2020s | 83 | 4 | 16.25 |
| `dmitch-20s` | Donovan Mitchell | 2020s | 83 | 4 | 16.25 |
| `bob-60s` | Bob Pettit | 1960s | 92 | 4 | 16.2 |
| `mcHale-80s` | Kevin McHale | 1980s | 91 | 4 | 16.15 |
| `ad-10s` | Anthony Davis | 2010s | 91 | 4 | 16.15 |
| `luka-20s` | Luka Doncic | 2020s | 93 | 2 | 16.15 |
| `ja-20s` | Ja Morant | 2020s | 81 | 4 | 16.15 |
| `pierce-00s` | Paul Pierce | 2000s | 89 | 4 | 16.05 |
| `kyrie-20s` | Kyrie Irving | 2020s | 79 | 4 | 16.05 |
| `carmelo-00s` | Carmelo Anthony | 2000s | 88 | 4 | 16 |
| `drose-10s` | Derrick Rose | 2010s | 88 | 4 | 16 |
| `manu-00s` | Manu Ginobili | 2000s | 88 | 4 | 16 |
| `wilt-60s` | Wilt Chamberlain | 1960s | 98 | 2 | 15.9 |
| `george-80s` | George Gervin | 1980s | 85 | 4 | 15.85 |
| `david-t-70s` | David Thompson | 1970s | 85 | 4 | 15.85 |
| `vince-00s` | Vince Carter | 2000s | 83 | 4 | 15.75 |
| `dom-90s` | Dominique Wilkins | 1990s | 82 | 4 | 15.7 |
| `worthy-80s` | James Worthy | 1980s | 91 | 4 | 15.65 |
| `clyde-90s` | Clyde Drexler | 1990s | 90 | 4 | 15.6 |
| `dwight-00s` | Dwight Howard | 2000s | 90 | 4 | 15.6 |
| `clyde-80s` | Clyde Drexler | 1980s | 89 | 4 | 15.55 |
| `wes-60s` | Wes Unseld | 1960s | 89 | 4 | 15.55 |
| `butler-10s` | Jimmy Butler | 2010s | 86 | 4 | 15.5 |
| `isiah-90s` | Isiah Thomas | 1990s | 87 | 4 | 15.45 |
| `bill-60s` | Bill Russell | 1960s | 98 | 2 | 15.4 |
| `maxey-20s` | Tyrese Maxey | 2020s | 75 | 4 | 15.35 |
| `dirk-00s` | Dirk Nowitzki | 2000s | 94 | 2 | 15.3 |
| `harden-10s` | James Harden | 2010s | 94 | 2 | 15.3 |
| `butler-20s` | Jimmy Butler | 2020s | 84 | 4 | 15.3 |
| `bob-mc-70s` | Bob McAdoo | 1970s | 91 | 4 | 15.25 |
| `dj-80s` | Dennis Johnson | 1980s | 91 | 4 | 15.25 |

## WAVE_3_MEDIUM_PRIORITY (120) — first 25

| Card | Player | Decade | OVR | Unknown fields | Score |
| --- | --- | --- | ---: | ---: | ---: |
| `john-h-60s` | John Havlicek | 1960s | 82 | 4 | 15.2 |
| `trae-20s` | Trae Young | 2020s | 80 | 4 | 15.2 |
| `dirk-10s` | Dirk Nowitzki | 2010s | 92 | 2 | 15.2 |
| `alonzo-90s` | Alonzo Mourning | 1990s | 89 | 4 | 15.15 |
| `yao-00s` | Yao Ming | 2000s | 81 | 4 | 15.15 |
| `kat-20s` | Karl-Anthony Towns | 2020s | 81 | 4 | 15.15 |
| `lamelo-20s` | LaMelo Ball | 2020s | 71 | 4 | 15.15 |
| `alex-80s` | Alex English | 1980s | 88 | 4 | 15.1 |
| `willis-60s` | Willis Reed | 1960s | 79 | 4 | 15.05 |
| `amare-00s` | Amar'e Stoudemire | 2000s | 86 | 4 | 15 |
| `durant-20s` | Kevin Durant | 2020s | 88 | 2 | 15 |
| `dave-d-60s` | Dave DeBusschere | 1960s | 86 | 4 | 15 |
| `magic-80s` | Magic Johnson | 1980s | 99 | 0 | 14.95 |
| `bird-80s` | Larry Bird | 1980s | 98 | 0 | 14.9 |
| `dik-90s` | Dikembe Mutombo | 1990s | 94 | 4 | 14.9 |
| `shaq-00s` | Shaquille O'Neal | 2000s | 98 | 0 | 14.9 |
| `tiny-70s` | Nate Archibald | 1970s | 83 | 4 | 14.85 |
| `kidd-90s` | Jason Kidd | 1990s | 83 | 4 | 14.85 |
| `curry-10s` | Stephen Curry | 2010s | 97 | 0 | 14.85 |
| `dave-c-70s` | Dave Cowens | 1970s | 92 | 4 | 14.8 |
| `sharman-60s` | Bill Sharman | 1960s | 92 | 4 | 14.8 |
| `gobert-20s` | Rudy Gobert | 2020s | 92 | 4 | 14.8 |
| `elvin-70s` | Elvin Hayes | 1970s | 91 | 4 | 14.75 |
| `arenas-00s` | Gilbert Arenas | 2000s | 81 | 4 | 14.75 |
| `russ-10s` | Russell Westbrook | 2010s | 93 | 2 | 14.75 |

*(remaining 95 follow the same ordering; regenerate with the scoring formula above)*

## WAVE_4_LOW_PRIORITY (110)

Low-popularity, low-OVR, low-era-sensitivity cards. Correct them opportunistically
when touched for another reason.

## Rules for every wave

1. Never fabricate a missing value. Preserve nulls.
2. A card that cannot be reproduced stays `LEGACY_UNVERIFIED` and is listed
   `BLOCKED_BY_SOURCE` — it is never claimed as re-derived.
3. Honors verified against **per-season award pages**, never a player article alone.
4. Physical and shooting data harvested in the same pass as the season table —
   one fetch, three deliverables.
5. Record before/after and OVR movement for every corrected card.
