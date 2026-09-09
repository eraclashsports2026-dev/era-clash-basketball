# Calibration player verification cohort

A prioritised list of **90 player-decade cards** whose data most needs
verification before Phase 6C2 tuning. Generated from measured evidence, not
assembled by hand — the ranking script is reproducible from
`.cache/calibration/diagnostics.json` plus the card pool.

## Why these cards, in this order

A card is prioritised by how much a wrong value would distort calibration:

| Signal | Weight | Reasoning |
| --- | --- | --- |
| Appears in the calibration corpus | 40 | its data directly shapes every measured error |
| Simulated PPG ≥ 40 | 35 | the engine is already producing an implausible line for it |
| Simulated PPG 25–39 | 18 | high but not yet absurd |
| No curated shooting tier | 20 | blocks the shooting-hierarchy test (L1 in the register) |
| No shooting splits on file | 12 | the shooting model falls back to inference |
| High visibility (`pop` ≥ 9) | 8 | a wrong value here is the most publicly visible |
| Accolade-heavy | 6 | more accolade fields, more chances for an error |

Bands: **CRITICAL** ≥ 90 · **HIGH** ≥ 65 · **MEDIUM** ≥ 45 · **LOW** < 45.

## Distribution

| Band | Cards | | Decade | Cards |
| --- | --- | --- | --- | --- |
| CRITICAL | 20 | | 1950s | 4 |
| HIGH | 65 | | 1960s | 13 |
| MEDIUM | 5 | | 1970s | 12 |
| | | | 1980s | 16 |
| | | | 1990s | 13 |
| | | | 2000s | 8 |
| | | | 2010s | 8 |
| | | | 2020s | 16 |

## What verification means here

For each card, against **per-season published sources**:

1. **Per-decade averages** (`pts`, `reb`, `ast`, `stl`, `blk`) — computed from the seasons belonging to that decade, where a season belongs to the decade of its **starting year**.
2. **Accolades** (`mvp`, `fmvp`, `dpoy`, `an1`/`an2`/`an3`, `ad1`/`ad2`, `win`) — cross-checked against **per-season award pages**, never a player article alone. A player article's summary line is the single most common source of accolade errors.
3. **Shooting splits** (`fgPct`, `threePct`, `ftPct`) and the perimeter tier.
4. **Era-legality** — no steals or blocks for seasons before 1973-74, when they were not recorded. Missing stays missing.

Rules that do not bend:

- **No value from memory.** If a source cannot be reached, the field stays null and the card stays on this list.
- **No inference.** Wingspan is not derived from height, weight is not derived from position, and a missing statistic never becomes zero ability.
- **Nulls are preserved.** A null is a real statement about what is known.

## Precedent from Phase 6C1

Two cards were corrected this phase, and both illustrate why the cross-check
rule exists:

- **Oscar Robertson** — All-NBA First Team counts were wrong on two cards (`oscar-60s` 6→**9**, second team 2→**1**; `oscar-70s` 2→**1**). Found only by reading per-season award pages.
- **Wilt Chamberlain** — `wilt-70s` All-Defensive First Team 1→**2**.

The Oscar correction raised his raw rating from 229.5 to 252.5 — a **10%**
change — and moved his displayed OVR by **zero points**, because the OVR scale
saturates at the top. A card can be materially wrong in a way the UI cannot
show, which is exactly why verification cannot be driven by what looks wrong on
screen.

**Maurice Lucas remains blocked** — his data could not be verified from an
accessible source and was not filled in.

---

## CRITICAL — 20 cards

| Card | Player | Decade | Sim PPG | Shooting tier | Splits | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `mikan-50s` | George Mikan | 1950s | 46.9 | UNKNOWN | NONE | in calibration corpus; simulated PPG 46.9; no curated shooting tier; no shooting splits on file; high visibility; accolade-heavy |
| `julius-80s` | Julius Erving | 1980s | 43.7 | UNKNOWN | NONE | in calibration corpus; simulated PPG 43.7; no curated shooting tier; no shooting splits on file; high visibility; accolade-heavy |
| `george-70s` | George Gervin | 1970s | 47.3 | UNKNOWN | NONE | in calibration corpus; simulated PPG 47.3; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `mcHale-80s` | Kevin McHale | 1980s | 75.1 | UNKNOWN | NONE | in calibration corpus; simulated PPG 75.1; no curated shooting tier; no shooting splits on file |
| `ewing-90s` | Patrick Ewing | 1990s | 49.6 | UNKNOWN | NONE | in calibration corpus; simulated PPG 49.6; no curated shooting tier; no shooting splits on file |
| `barkley-90s` | Charles Barkley | 1990s | 28.3 | UNKNOWN | NONE | in calibration corpus; simulated PPG 28.3; no curated shooting tier; no shooting splits on file; high visibility; accolade-heavy |
| `bill-60s` | Bill Russell | 1960s | 49.9 | NONE | NONE | in calibration corpus; simulated PPG 49.9; no shooting splits on file; high visibility; accolade-heavy |
| `jordan-90s` | Michael Jordan | 1990s | 45.1 | AVERAGE | NONE | in calibration corpus; simulated PPG 45.1; no shooting splits on file; high visibility; accolade-heavy |
| `giannis-20s` | Giannis Antetokounmpo | 2020s | 31.2 | UNKNOWN | NONE | in calibration corpus; simulated PPG 31.2; no curated shooting tier; no shooting splits on file; high visibility |
| `tatum-20s` | Jayson Tatum | 2020s | 38.8 | UNKNOWN | NONE | in calibration corpus; simulated PPG 38.8; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `rob-90s` | David Robinson | 1990s | 25.1 | UNKNOWN | NONE | in calibration corpus; simulated PPG 25.1; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `russell-50s` | Bill Russell | 1950s | 65.4 | NONE | NONE | in calibration corpus; simulated PPG 65.4; no shooting splits on file; accolade-heavy |
| `ja-20s` | Ja Morant | 2020s | 35.7 | UNKNOWN | NONE | in calibration corpus; simulated PPG 35.7; no curated shooting tier; no shooting splits on file |
| `grant-90s` | Grant Hill | 1990s | 30.6 | UNKNOWN | NONE | in calibration corpus; simulated PPG 30.6; no curated shooting tier; no shooting splits on file |
| `bosh-10s` | Chris Bosh | 2010s | 30.1 | UNKNOWN | NONE | in calibration corpus; simulated PPG 30.1; no curated shooting tier; no shooting splits on file |
| `kj-90s` | Kevin Johnson | 1990s | 29.3 | UNKNOWN | NONE | in calibration corpus; simulated PPG 29.3; no curated shooting tier; no shooting splits on file |
| `billy-p-70s` | Billy Paultz | 1970s | 28.7 | UNKNOWN | NONE | in calibration corpus; simulated PPG 28.7; no curated shooting tier; no shooting splits on file |
| `charles-80s` | Charles Barkley | 1980s | 27.9 | UNKNOWN | NONE | in calibration corpus; simulated PPG 27.9; no curated shooting tier; no shooting splits on file |
| `middleton-20s` | Khris Middleton | 2020s | 25.7 | UNKNOWN | NONE | in calibration corpus; simulated PPG 25.7; no curated shooting tier; no shooting splits on file |
| `terry-80s` | Terry Cummings | 1980s | 25.1 | UNKNOWN | NONE | in calibration corpus; simulated PPG 25.1; no curated shooting tier; no shooting splits on file |

## HIGH — 65 cards

| Card | Player | Decade | Sim PPG | Shooting tier | Splits | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `kareem-70s` | Kareem Abdul-Jabbar | 1970s | 90.1 | LIMITED | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 90.1; high visibility; accolade-heavy |
| `shaq-00s` | Shaquille O'Neal | 2000s | 60 | NONE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 60; high visibility; accolade-heavy |
| `lebron-10s` | LeBron James | 2010s | 33.8 | GOOD | NONE | in calibration corpus; simulated PPG 33.8; no shooting splits on file; high visibility; accolade-heavy |
| `cousy-60s` | Bob Cousy | 1960s | 47.9 | AVERAGE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 47.9; accolade-heavy |
| `wade-10s` | Dwyane Wade | 2010s | 15.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; high visibility |
| `embiid-20s` | Joel Embiid | 2020s | 23.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `cp3-10s` | Chris Paul | 2010s | 18.8 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `sharman-50s` | Bill Sharman | 1950s | 16.1 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `dave-c-70s` | Dave Cowens | 1970s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `john-h-70s` | John Havlicek | 1970s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `malone-90s` | Karl Malone | 1990s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `jerry-l-60s` | Jerry Lucas | 1960s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file; accolade-heavy |
| `barry-60s` | Rick Barry | 1960s | 62.2 | ELITE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 62.2 |
| `bird-80s` | Larry Bird | 1980s | 26.2 | ELITE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 26.2; high visibility; accolade-heavy |
| `cousy-50s` | Bob Cousy | 1950s | 26.1 | AVERAGE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 26.1; high visibility; accolade-heavy |
| `jbrown-20s` | Jaylen Brown | 2020s | 22.8 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `blake-10s` | Blake Griffin | 2010s | 22.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `dame-20s` | Damian Lillard | 2020s | 22.2 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `manu-00s` | Manu Ginobili | 2000s | 21.7 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `tree-80s` | Tree Rollins | 1980s | 21.4 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `john-h-60s` | John Havlicek | 1960s | 20.4 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `nate-60s` | Nate Thurmond | 1960s | 18.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `james-70s` | James Silas | 1970s | 18.1 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `mark-80s` | Mark Aguirre | 1980s | 17.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `dmitch-20s` | Donovan Mitchell | 2020s | 17.2 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `lauri-20s` | Lauri Markkanen | 2020s | 17.1 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `coward-20s` | Cedric Coward | 2020s | 17.1 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `sam-60s` | Sam Jones | 1960s | 17 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `fred-h-60s` | Fred Hetzel | 1960s | 16.6 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `parker-00s` | Tony Parker | 2000s | 16.2 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `kenon-70s` | Larry Kenon | 1970s | 15.6 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `dj-10s` | DeAndre Jordan | 2010s | 14.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `isiah-90s` | Isiah Thomas | 1990s | 13.6 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `parish-80s` | Robert Parish | 1980s | 13 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `okur-00s` | Mehmet Okur | 2000s | 12.6 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `gus-60s` | Gus Johnson | 1960s | 12 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `ricky-80s` | Ricky Pierce | 1980s | 12 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `jack-80s` | Jack Sikma | 1980s | 11.4 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `swen-70s` | Swen Nater | 1970s | 11 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `billups-00s` | Chauncey Billups | 2000s | 10.8 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `tom-s-60s` | Tom Sanders | 1960s | 10.4 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `walker-k-20s` | Walker Kessler | 2020s | 10.3 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `marion-90s` | Shawn Marion | 1990s | 10.1 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `jallen-20s` | Jarrett Allen | 2020s | 9.35 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `tiny-80s` | Nate Archibald | 1980s | 8.31 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `hassan-10s` | Hassan Whiteside | 2010s | 8.21 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `danny-80s` | Danny Ainge | 1980s | 7.8 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `dumars-90s` | Joe Dumars | 1990s | 7.67 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `curtis-perry-70s` | Curtis Perry | 1970s | 7.52 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `luc-90s` | Luc Longley | 1990s | 7.5 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `mo-80s` | Maurice Cheeks | 1980s | 7.47 | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `stock-90s` | John Stockton | 1990s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `rip-00s` | Richard Hamilton | 2000s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `ad-20s` | Anthony Davis | 2020s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `wayne-60s` | Wayne Embry | 1960s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `jojo-70s` | Jo Jo White | 1970s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `charlie-70s` | Charlie Scott | 1970s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `paul-s-70s` | Paul Silas | 1970s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `byron-80s` | Byron Scott | 1980s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `worthy-80s` | James Worthy | 1980s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `garland-20s` | Darius Garland | 2020s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `reaves-20s` | Austin Reaves | 2020s | — | UNKNOWN | NONE | in calibration corpus; no curated shooting tier; no shooting splits on file |
| `duncan-00s` | Tim Duncan | 2000s | 24.4 | LIMITED | NONE | in calibration corpus; no shooting splits on file; high visibility; accolade-heavy |
| `kobe-00s` | Kobe Bryant | 2000s | 18.4 | GOOD | NONE | in calibration corpus; no shooting splits on file; high visibility; accolade-heavy |
| `jokic-20s` | Nikola Jokic | 2020s | — | GOOD | NONE | in calibration corpus; no shooting splits on file; high visibility; accolade-heavy |

## MEDIUM — 5 cards

| Card | Player | Decade | Sim PPG | Shooting tier | Splits | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `moncrief-80s` | Sidney Moncrief | 1980s | 37.7 | AVERAGE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 37.7 |
| `klay-10s` | Klay Thompson | 2010s | 33.1 | ELITE | PARTIAL_OR_FULL | in calibration corpus; simulated PPG 33.1 |
| `pippen-90s` | Scottie Pippen | 1990s | 16.6 | AVERAGE | PARTIAL_OR_FULL | in calibration corpus; high visibility; accolade-heavy |
| `oscar-60s` | Oscar Robertson | 1960s | — | GOOD | PARTIAL_OR_FULL | in calibration corpus; high visibility; accolade-heavy |
| `jerry-60s` | Jerry West | 1960s | — | ELITE | PARTIAL_OR_FULL | in calibration corpus; high visibility; accolade-heavy |
