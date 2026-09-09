# Player re-derivation — Wave 1

**Target:** the 44 `REPRESENTATIVE_PRIME` cards, the known-biased set and the
first verification priority under the locked CEO decision.

**Result:** **43 re-derived, 1 blocked by source.**

Reproduce with:

```bash
node scripts/rederive-wave-1.mjs
```

That script is committed on purpose. The prime-form numbers it replaced could
not be reproduced from anything — which is exactly why they needed replacing —
so the replacement has to be reproducible from the verified season rows it holds.

## Method

1. Per-season rows read from each player's published career table (Wikipedia,
   mirroring Basketball-Reference), fetched 2026-08-25.
2. Decade assignment by the established rule: a season belongs to the decade of
   its **starting year**.
3. Mid-season team splits **games-weighted into one season** before averaging.
4. Seasons under **20 games excluded**.
5. Card stat = **unweighted mean** of the per-season averages inside the decade.
6. Honors re-scoped by the season they were won in.
7. Ratings and OVR recalculated; movement reported below.

## The finding

**The prime-form convention was systematically inflationary.** Mean OVR shift
across the 43 cards is **−1.49**, and 28 of 43 moved at all. The largest
corrections are not small:

| Card | Was | Now | Δ points |
| --- | --- | --- | ---: |
| `guerin-60s` | 21.8 ppg | 16.8 | **−5.0** |
| `monroe-70s` | 21.0 | 16.2 | **−4.8** |
| `westphal-70s` | 21.5 | 16.8 | **−4.7** |
| `wicks-70s` | 22.0 | 17.4 | **−4.6** |
| `hudson-70s` | 24.0 | 20.2 | **−3.8** |

`guerin-60s` is the clearest case of what the old convention actually was: its
21.8 / 6.4 / 6.4 line is **exactly his 1960-61 season**, not a decade at all.

## Honor corrections (11 cards)

Every one is a decade-scoping error — an award credited to the wrong decade
because the award YEAR was used instead of the SEASON it was won in.

| Card | Correction |
| --- | --- |
| `arizin-60s` | an1 1→0, an2 1→0 — all four All-NBA selections (1952, 1956, 1957, 1959) are 1950s seasons |
| `monroe-70s` | an1 1→0 — his only First Team is 1968-69 |
| `hudson-70s` | an2 1→0 — his Second Team (1970) is the 1969-70 season |
| `marques-70s` | an2 2→1 — the 1981 Second Team is a 1980s season |
| `sugar-80s` | ad2 1→0 — he has no All-Defensive Second Teams at all |
| `spree-90s` | ad2 0→1 — his 1994 Second Team was missing |
| `jrue-20s` | ad1 3→2 — the 2018 First Team is a 2010s season |
| `jjj-20s` | ad2 0→1 — his 2025 Second Team was missing |
| `zion-20s` | an2 1→0 — he has no All-NBA selections |
| `smart-20s` | ad1 3→1 — two of his three First Teams are 2010s seasons |
| `siakam-20s` | an2 1→0, an3 kept 1 — the 2020 Second Team is a 2019-20 (2010s) season |

## Blocked

| Card | Reason |
| --- | --- |
| `lucas-m-70s` (Maurice Lucas) | The source carries **career totals only** (14.6 / 9.1 / 2.4 across ABA+NBA) with no per-season NBA table. The decade mean cannot be reproduced. Prior values **preserved**; card remains `REPRESENTATIVE_PRIME` and is listed `BLOCKED_BY_SOURCE`. It is **not** claimed as re-derived. |

## Full before/after

| Card | Player | Seasons (found → kept) | New pts / reb / ast | OVR | Δ |
| --- | --- | --- | --- | --- | ---: |
| `arizin-60s` | Paul Arizin | 2 → 2 | 22.5 / 7.7 / 2.5 | 79 → 73 | -6 |
| `rodgers-60s` | Guy Rodgers | 10 → 10 | 11.7 / 3.9 / 7.9 | 67 → 66 | -1 |
| `beaty-60s` | Zelmo Beaty | 7 → 7 | 17.3 / 11.2 / 1.5 | 71 → 71 | 0 |
| `guerin-60s` | Richie Guerin | 9 → 8 | 16.8 / 4.1 / 5 | 73 → 68 | -5 |
| `barry-60s` | Rick Barry | 2 → 2 | 30.7 / 9.9 / 2.9 | 87 → 87 | 0 |
| `monroe-70s` | Earl Monroe | 10 → 10 | 16.2 / 2.5 / 3.5 | 82 → 75 | -7 |
| `murphy-70s` | Calvin Murphy | 10 → 10 | 19.1 / 2.3 / 4.8 | 69 → 68 | -1 |
| `westphal-70s` | Paul Westphal | 8 → 8 | 16.8 / 2.1 / 4.3 | 87 → 84 | -3 |
| `marques-70s` | Marques Johnson | 3 → 3 | 22.3 / 8.5 / 3 | 82 → 82 | 0 |
| `hudson-70s` | Lou Hudson | 8 → 8 | 20.2 / 4 / 3 | 76 → 69 | -7 |
| `wicks-70s` | Sidney Wicks | 9 → 9 | 17.4 / 8.9 / 3.3 | 71 → 66 | -5 |
| `moncrief-80s` | Sidney Moncrief | 9 → 9 | 17.1 / 4.8 / 4 | 95 → 94 | -1 |
| `king-80s` | Bernard King | 8 → 8 | 23.3 / 5.3 / 3.4 | 85 → 84 | -1 |
| `cooper-80s` | Michael Cooper | 10 → 10 | 8.9 / 3.2 / 4.4 | 92 → 92 | 0 |
| `toney-80s` | Andrew Toney | 7 → 7 | 15 / 2.1 / 4.2 | 71 → 69 | -2 |
| `sugar-80s` | Micheal Ray Richardson | 6 → 6 | 15.8 / 5.5 / 6.9 | 75 → 73 | -2 |
| `blackman-80s` | Rolando Blackman | 9 → 9 | 19.3 / 3.6 / 3.2 | 68 → 68 | 0 |
| `mookie-90s` | Mookie Blaylock | 10 → 10 | 14.3 / 4.4 / 7 | 84 → 84 | 0 |
| `hornacek-90s` | Jeff Hornacek | 10 → 10 | 15.7 / 3.4 / 4.6 | 69 → 69 | 0 |
| `oakley-90s` | Charles Oakley | 10 → 10 | 9.1 / 9.2 / 2.6 | 76 → 76 | 0 |
| `spree-90s` | Latrell Sprewell | 7 → 7 | 19.3 / 4.3 / 4.2 | 76 → 78 | +2 |
| `bigdog-90s` | Glenn Robinson | 6 → 6 | 21 / 6 / 2.8 | 68 → 68 | 0 |
| `kukoc-90s` | Toni Kukoc | 7 → 7 | 14.4 / 4.9 / 4.3 | 76 → 77 | +1 |
| `majerle-90s` | Dan Majerle | 10 → 10 | 12.3 / 4.6 / 3.2 | 70 → 68 | -2 |
| `sheed-2ks` | Rasheed Wallace | 10 → 10 | 14.8 / 7 / 1.9 | 78 → 77 | -1 |
| `jermaine-2ks` | Jermaine O'Neal | 10 → 10 | 17.7 / 8.8 / 1.9 | 80 → 78 | -2 |
| `ak47-2ks` | Andrei Kirilenko | 9 → 9 | 12.5 / 5.7 / 2.8 | 77 → 76 | -1 |
| `artest-2ks` | Ron Artest | 9 → 9 | 16 / 5.1 / 3.2 | 88 → 88 | 0 |
| `bowen-2ks` | Bruce Bowen | 9 → 9 | 6.6 / 2.9 / 1.3 | 88 → 88 | 0 |
| `camby-2ks` | Marcus Camby | 10 → 10 | 10.1 / 11 / 2.1 | 87 → 86 | -1 |
| `deron-2ks` | Deron Williams | 5 → 5 | 16.8 / 3.1 / 9.1 | 79 → 78 | -1 |
| `cassell-2ks` | Sam Cassell | 8 → 8 | 16.4 / 3.4 / 5.9 | 75 → 73 | -2 |
| `lowry-2010s` | Kyle Lowry | 10 → 10 | 16.8 / 4.8 / 7 | 78 → 77 | -1 |
| `wall-2010s` | John Wall | 9 → 9 | 19 / 4.2 / 9.1 | 79 → 79 | 0 |
| `demar-2010s` | DeMar DeRozan | 10 → 10 | 21.2 / 4.5 / 3.9 | 78 → 78 | 0 |
| `boogie-2010s` | DeMarcus Cousins | 9 → 9 | 21.4 / 10.8 / 3.4 | 81 → 79 | -2 |
| `ibaka-2010s` | Serge Ibaka | 10 → 10 | 13.2 / 7.6 / 0.8 | 80 → 80 | 0 |
| `drummond-2010s` | Andre Drummond | 8 → 8 | 14.4 / 13.8 / 1.3 | 72 → 72 | 0 |
| `jrue-20s` | Jrue Holiday | 6 → 6 | 15.9 / 4.7 / 5.8 | 89 → 86 | -3 |
| `jjj-20s` | Jaren Jackson Jr. | 5 → 5 | 19.8 / 5.9 / 1.7 | 85 → 87 | +2 |
| `zion-20s` | Zion Williamson | 5 → 5 | 24.3 / 6.6 / 4.4 | 77 → 73 | -4 |
| `smart-20s` | Marcus Smart | 6 → 6 | 11.6 / 3 / 4.7 | 86 → 80 | -6 |
| `siakam-20s` | Pascal Siakam | 6 → 6 | 22.4 / 7.3 / 4.5 | 80 → 78 | -2 |

## Side effects

- `DECADE_SEASON_AVERAGE` cards: **16 → 59**. `REPRESENTATIVE_PRIME`: **44 → 1**.
- 40 persons gained verified height/weight and career shooting splits, harvested
  from the same sources in the same pass.
- No test was loosened. The OVR-examples test is tolerance-based by prior design
  (`displayOVR` is a pool percentile) and passed unchanged.
