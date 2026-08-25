# Player-data risk register

**The player dataset is NOT fully verified.** This register exists so future
possession-engine work consumes that fact rather than rediscovering it.

Counts verified **2026-08-25, after the Wave-1 verification pass**, against the pool at 381 cards / 323 persons.

## Current coverage

| Dimension | Verified | Total | Coverage | Change from pre-Wave-1 |
| --- | ---: | ---: | ---: | --- |
| Cards on the rigorous convention (`DECADE_SEASON_AVERAGE`) | **59** | 381 | **15%** | ▲ from 16 (4%) |
| Cards with hand-set prime figures (`REPRESENTATIVE_PRIME`) | **1** | 381 | 0.3% | ▼ from 44 (12%) |
| Cards with undocumented provenance (`LEGACY_UNVERIFIED`) | 310 | 381 | 81% | unchanged |
| Single-season cards (2025 draft class) | 11 | 381 | 3% | unchanged |
| Cards with measured shooting splits | **85** | 381 | **22%** | ▲ from 43 (11%) |
| Persons with verified height/weight | **84** | 323 | **26%** | ▲ from 44 (14%) |
| Cards carrying verified physical data | **108** | 381 | **28%** | ▲ from 65 (17%) |
| Human-reviewed intelligence profiles | 33 | 381 | 9% | unchanged |
| **Pre-1974 cards with a defensive review** | **50** | 50 | **100%** | ▲ from 7 (14%) |
| Persons with verified wingspan | 0 | 323 | **0%** | unchanged — by policy |

Profile confidence distribution: HIGH 33 · MEDIUM-HIGH 71 · MEDIUM-LOW 234 · LOW-MEDIUM 43.

## Readiness by consumer

| Consumer | Ready? | Why |
| --- | --- | --- |
| **Coach Intelligence** | ✅ yes | Reads relative construction; weak inputs lower confidence rather than producing confident wrong answers |
| **Era Style Intelligence** | ✅ yes, with caveats | Era prices *skills*; the skills most exposed (spacing, post) now have 22% measured shooting versus 11% before |
| **Pick-and-roll action modelling** | ⚠️ partly | Needs ball-handler pull-up shooting and screener roll/pop threat. 22% measured is enough to model the ACTION honestly, not enough to claim historical rates |
| **Possession Engine authority** | ❌ **no** | Consumes absolute rates. With 81% of cards on an unrecorded convention and 78% of shooting inferred, a simulated box score cannot be presented as historical reconstruction |

## The four standing risks

### R1 — Mixed statistical conventions (HIGH, reduced)
81% of cards still have no recorded averaging rule. **The prime-form set is
retired**: Wave 1 re-derived 43 of 44 and measured the bias directly — mean OVR
shift **−1.49**, with individual corrections up to **−5.0 points per game**.
`guerin-60s` turned out to be a single season (1960-61) masquerading as a decade.
The remaining risk is the 310 legacy cards, whose direction of error is now
*suspected* but unmeasured.

**Blocks:** treating the possession engine as historically authoritative.
**Does not block:** Coach or Era Intelligence, which read *relative* construction.

### R2 — Inferred shooting (HIGH)
89% of cards infer shooting from position, decade, and scoring volume — three
things that cannot distinguish Dennis Rodman from Dražen Petrović beyond
"wing, 90s". Spacing conclusions for those cards rest on a prior, not a measurement.

### R3 — Pre-1974 defensive blindness (MEDIUM → LOW)
**Resolved for all 50 cards.** `src/v3/data/preRecordingDefense.js` assigns a
categorical band per player with the evidence class recorded
(RECORDED_STAT 2 · DOCUMENTED_ROLE 11 · CALCULATED 26 · INFERRED 4). Bands lift
the derived value to a floor; **no steal or block rate is invented**, because a
number looks like a measurement and an anecdote does not. Russell's event
creation moved 0.0 → 8.5 via a documented-role band, not a fabricated rate.
Residual risk: a band is coarser than a measurement, and the 4 INFERRED entries
rest on historical consensus alone.

### R4 — Sparse physical data (MEDIUM, reduced)
74% of persons still have no verified measurement, down from 86%. Wingspan
remains 0% **by policy**: no accessible source publishes it for historical
players and it is not derivable from height.

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

1. ~~The 44 `REPRESENTATIVE_PRIME` cards~~ — ✅ **complete** (43 re-derived, 1 blocked).
2. ~~Pre-1974 defensive review~~ — ✅ **complete** (50/50).
3. **`WAVE_2_HIGH_PRIORITY` — 80 cards.** Ranked in
   `player-verification-backlog.md`. Highest-popularity, most-unknown, most
   era-sensitive first.
4. **`WAVE_3_MEDIUM_PRIORITY` — 120 cards.**
5. **`WAVE_4_LOW_PRIORITY` — 110 cards**, opportunistically.

**Rules:** never fabricate a measurement · preserve nulls where evidence does not
support a value · every added value carries source, tier, and date · verify
accolades against per-season award pages, never a player article alone.
