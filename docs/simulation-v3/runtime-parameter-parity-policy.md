# Runtime parameter parity policy

**Frozen before any parameter was wired.**

`defaultParityFixtureVersion 1.0.0` ·
`tests/fixtures/parameter-wiring/pre-wiring/behaviour-baseline.json`

## The rule

Phase 6C2C3 is plumbing. Connecting the registry to the engine must change the
engine's **metadata** and nothing else.

```
Same canonical matchup
Same seed
Same default parameter values
Same pre-existing module versions
        ↓
Same score          Same winner         Same box score
Same action ledger  Same player lines   Same adjustments
Same overtime       Same RNG step count
```

Metadata may gain `runtimeParameterBindingVersion` and `parameterSetHash`. The
basketball result may not move by one point.

**"Close enough" is not parity.** A one-point drift in one fixture means a
coefficient reached the engine at a different value than the literal it replaced,
and that is a wiring bug wearing the costume of a rounding difference.

## What is compared

Per fixture, all of: final score, winner, periods, overtimes, period scores,
**RNG step count**, ledger size, both teams' totals, both teams' hashed player
lines, ledger hash, action mix, shot-location mix, zone shells, offence hash,
defence hash, first offence, invariant-violation count.

`rngSteps` is the most sensitive signal in that list. A parameter lookup that
consumes randomness moves it even when the score happens to land the same, so it
catches the failure mode a score comparison would miss.

## The corpus — 28 fixtures

| Coverage | Fixtures |
|---|---|
| All eight Era Styles | 8 |
| Man vs zone on one seed | 2 |
| Coach systems (incl. neutral) | 4 |
| Construction contrasts | 2 |
| Mirror (identical rosters and coach) | 1 |
| Side-swapped pair on one seed | 2 |
| All development flags off | 1 |
| **Dedicated overtime** | **2 — one single, one double** |
| Synthetic development v2 | 6 |

Three fixtures reach overtime in total: the two dedicated ones plus a coach
fixture that happens to go to OT1. Zero invariant violations across the corpus.

### On the overtime fixtures

The first attempt used round-number seeds (8001, 8002) and **both came back
OT0** — two fixtures named "overtime" that contained no overtime at all. Seeds 13
and 252 were found by search and verified to reach OT1 and OT2.

`assertOvertimeCoverage` now fails the capture if either stops being an overtime
game, so the corpus cannot silently lose the coverage. The overtime path is
precisely what the parent branch changed with the seeded jump ball, so a parity
corpus without it would miss the regression most likely to occur.

### No holdout, by construction

`assertNoHoldout` refuses the capture if any fixture id matches a sealed set, or
if any fixture's five matches a sealed synthetic lineup **as a set of card ids** —
because the same five under a different fixture name would defeat an id check.

## Regeneration guard

`--write` refuses to overwrite an existing baseline without `--force`. Re-recording
the reference would make any wiring bug pass, which is the one outcome this file
exists to prevent.

## On a parity failure

Do **not** re-record the fixture. Instead:

1. Find the first divergent possession in the ledger.
2. Identify which parameter consumer is involved.
3. Check whether the registry default differs from the literal it replaced.
4. Check whether evaluation order changed.
5. Check whether floating-point operation order changed.
6. Check whether an RNG draw was added or removed.
7. Fix the wiring.

The only permitted behaviour change on this branch is the side-symmetry work
already completed on the parent branch, which is baked into this baseline.

## Performance

| | Target |
|---|---|
| Preferred | ≤ 10% runtime regression |
| Investigate | > 20% |

If parameter access is slow, compile once and read direct properties — do not
abandon registry authority for speed. A registry the engine ignores is what this
phase exists to fix.
