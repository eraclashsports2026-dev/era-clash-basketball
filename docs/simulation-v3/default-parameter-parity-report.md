# Default parameter parity report

**State: MEASURED. 32 of 32 fixtures byte-identical, including RNG step counts.**

`defaultParityFixtureVersion 1.0.0`

## The claim, and how it was tested

Phase 6C2C3 is plumbing. Connecting the registry must change the engine's
**metadata** and nothing else.

The reference was captured on the **pre-wiring commit** (`4cf0b8f`) in a separate
git worktree, not by re-recording after the change. That distinction is the whole
value of the test: a baseline recorded after the change it is meant to validate
proves nothing.

Four fixtures (`real-zone-*`) were added mid-phase, after wiring had begun. They
were captured at `4cf0b8f` with the old engine and only then compared — the same
discipline, applied to the additions.

## Result

| | |
|---|---|
| Fixtures | 32 |
| Exact | **32** |
| Drifted | **0** |
| RNG step count parity | exact on all 32 |
| Invariant violations | 0 |

Nineteen fields compared per fixture: final score, winner, periods, overtimes,
period scores, RNG steps, ledger size, both teams' totals, both hashed player
lines, ledger hash, action mix, shot-location mix, zone shells, offence hash,
defence hash, first offence, invariant count.

**RNG step parity is the load-bearing one.** A parameter lookup that consumed
randomness would move it even where the score happened to land the same, which
is the failure a score comparison would miss.

## Aggregate confirmation

Two independent 240,000-game measurements returned **numerically identical**
results before and after wiring:

| Metric | Pre-wiring | Post-wiring |
|---|---|---|
| Gold win rate | 0.4989 | 0.4989 |
| Gold advantage | −0.1108pp | −0.1108pp |
| 95% CI | −0.31 to +0.09pp | −0.31 to +0.09pp |
| Possession difference | −0.0004 | −0.0004 |
| Overtime Gold win rate | 0.5018 | 0.5018 |

Probability likewise: Brier 0.2209, floor 0.2192, ECE 0.0145, MCE 0.0312,
sharpness 0.1836 — unchanged to four decimals.

## Two traps the parity check caught in advance

Neither was found by running the fixtures; both were found by reading the code
the audit pointed at, and would have produced silent drift.

- **`era.paceBoundFraction` is one parameter written as two literals.** The old
  code held `basePace * 0.86` and `basePace * 1.14`, i.e. `1 − 0.14` and
  `1 + 0.14`. Replacing only the upper bound would have made the band asymmetric.
- **`conversion.midrangePenalty` is stored negative** while the code read
  `fg - 0.055`. Substituting the parameter into the existing minus would have
  double-negated it, turning a 5.5-point penalty into a 5.5-point bonus.

## Corrections to this report's own instruments

- **The parity corpus recorded an empty shot-location distribution.** The ledger
  stores `shot` as the location *string*, and the capture read `p.shot.location`,
  which is always `undefined`. The field compared equal trivially. Fixed, the
  baseline re-captured on the pre-wiring commit, and parity re-verified at 32/32
  with a real distribution (`RIM 58, THREE 44, MIDRANGE 34, PAINT 28` for
  `era-2010s`). The same bug zeroed four sensitivity metrics.
- **`zone-2010s` contained no zone.** steve-kerr and thibodeau never reach the
  zone gate, so it was byte-identical to `man-2010s`. Only four coaches in the
  pool do — measured, not assumed. Four `real-zone-*` fixtures were added and
  `assertZoneCoverage` now fails the capture if any stops producing a shell.
- **Two "overtime" fixtures contained no overtime.** The first attempt used
  round-number seeds and both came back OT0. Seeds 13 and 252 were found by
  search and verified at OT1 and OT2, guarded by `assertOvertimeCoverage`.

## Performance

| | Before | After |
|---|---|---|
| Parity corpus (32 fixtures) | ~1.4s | ~1.4s |
| 240,000-game symmetry matrix | 134s | 136s |
| Sensitivity sweep (53 params) | n/a | 460s |

Within the ≤10% preferred band. The accessor tree is compiled once and read as
plain properties, so the loop cost is unchanged.

## Regeneration guard

`--write` refuses to overwrite an existing baseline without `--force`.
Re-recording the reference would make any wiring bug pass, which is the one
outcome this file exists to prevent.
