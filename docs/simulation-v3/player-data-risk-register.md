# Player-data risk register

**The player dataset is NOT fully verified.** This register exists so future
possession-engine work consumes that fact rather than rediscovering it.

Counts verified 2026-08-25 against the pool at 381 cards / 323 persons.

## Current coverage

| Dimension | Verified | Total | Coverage |
| --- | ---: | ---: | ---: |
| Cards on the rigorous stat convention (`DECADE_SEASON_AVERAGE`) | 16 | 381 | **4%** |
| Cards with hand-set prime figures (`REPRESENTATIVE_PRIME`) | 44 | 381 | 12% |
| Cards with undocumented provenance (`LEGACY_UNVERIFIED`) | **310** | 381 | **81%** |
| Single-season cards (2025 draft class) | 11 | 381 | 3% |
| Cards with measured shooting splits | 43 | 381 | **11%** |
| Persons with verified height/weight | 44 | 323 | **14%** |
| Cards carrying verified physical data | 65 | 381 | 17% |
| Human-reviewed intelligence profiles | 33 | 381 | 9% |
| Uncurated cards whose defence derives from unrecorded steals/blocks | **50** | 381 | 13% |
| Persons with verified wingspan | 0 | 323 | **0%** (by policy) |

## The four standing risks

### R1 — Mixed statistical conventions (HIGH)
81% of cards have no recorded averaging rule. The 44 `REPRESENTATIVE_PRIME`
cards are **systematically higher** than a true decade mean (Rasheed Wallace's
2000s mean ≈ 14.8; his card reads 16.5). Player DNA inherits the inflation
through `usageTendency`, `creation`, and `rimPressure`.

**Blocks:** treating the possession engine as historically authoritative.
**Does not block:** Coach or Era Intelligence, which read *relative* construction.

### R2 — Inferred shooting (HIGH)
89% of cards infer shooting from position, decade, and scoring volume — three
things that cannot distinguish Dennis Rodman from Dražen Petrović beyond
"wing, 90s". Spacing conclusions for those cards rest on a prior, not a measurement.

### R3 — Pre-1974 defensive blindness (MEDIUM)
Steals and blocks were not recorded until 1973-74. 50 uncurated cards still
derive defensive event creation from zeroes. Corrected by hand for the reviewed
set only — Bill Russell's derived event creation was **0.0** before curation.

### R4 — Sparse physical data (MEDIUM)
86% of persons have no verified measurement. Wingspan is 0% **by policy**: no
accessible source publishes it for historical players and it is not derivable
from height.

## Why this does not block Coach Intelligence

Coach fit is about **relative construction** — does this roster have one creator
or four, is the floor spaced, can it protect the rim. Those readings survive
imperfect inputs because they are comparative, and because low-confidence inputs
propagate into a **lower coach-fit confidence** rather than a confident wrong answer.

## What it DOES block

Claiming the future possession engine is **historically authoritative**. A
possession engine consumes absolute rates — shot volume, efficiency, block rate.
With 89% of shooting inferred and 81% of cards on an unrecorded convention, a
simulated box score cannot be presented as a historical reconstruction.

It can be presented as **a plausible game between these cards**, which is what
EraClash actually promises.

## Coach-fit dimensions most sensitive to weak player data

| Dimension | Sensitivity | Why |
| --- | --- | --- |
| Spacing / movement-shooting fit | **HIGH** | Rests directly on R2 |
| Post / inside-out fit | MEDIUM-HIGH | Post threat is largely inferred |
| Rim-protection & drop-coverage fit | MEDIUM-HIGH | R3 for pre-1974 lineups |
| Switching / size fit | MEDIUM | R4 |
| Usage hierarchy & role balance | **LOW** | Derives from usage and creation, the best-evidenced dimensions |
| Transition fit | LOW-MEDIUM | Composite of better-evidenced inputs |

## Parallel verification plan

Waves, prioritised by leverage per unit of research:

1. **The 44 `REPRESENTATIVE_PRIME` cards** — known-biased, smallest set, highest
   distortion per card.
2. **Shooting splits for the most-drafted 100 cards** — directly retires R2 where
   it matters most.
3. **Physical data for the remaining benchmark and high-usage persons.**
4. **Pre-1974 defensive review** for the rest of the 1950s–60s pool.
5. **The 310 `LEGACY_UNVERIFIED` cards**, re-derived in batches.

**Rules:** never fabricate a measurement · preserve nulls where evidence does not
support a value · every added value carries source, tier, and date · verify
accolades against per-season award pages, never a player article alone.
