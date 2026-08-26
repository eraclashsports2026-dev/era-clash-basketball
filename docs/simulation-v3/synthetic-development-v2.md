# Synthetic development set v2

**`AVAILABLE_FOR_DEVELOPMENT`.** 14 fixtures, hash `2789728a8220cc24`.

Freely inspectable. This is the set engineering is *supposed* to look at, which
is what makes it safe to use for probability validation, diagnostics and
iteration.

## Purpose

Synthetic fixtures probe engine behaviour that history does not conveniently
supply: lineups with no centre, five ball-dominant creators, extreme spacing,
coach-toolkit edges. They test that the engine behaves sensibly under
constructions the historical corpus never contains.

They are **not** historical evidence and are never used as calibration targets.
No synthetic fixture has a historical target record.

## Fixtures

`sd2-action-family-stress`, `sd2-balanced-lower-ovr`, `sd2-creator-stack`, and 11
others spanning positional-extreme, spacing-extreme, coach-toolkit and
role-duplication constructions.

## How they were generated

The first attempt was hand-written and contained **27 errors** — invented card
ids and illegal slot assignments. They were replaced by fixtures generated from
the real card pool with a backtracking position solver and a uniqueness guard, so
that an invalid fixture is now unconstructible rather than merely unlikely.

## Use in this phase

All 30 probability-validation cells and both benchmark comparisons come from this
set. Two fixtures carry the balanced-versus-higher-OVR benchmark:

| Fixture | Five |
|---|---|
| `sd2-balanced-lower-ovr` | Chris Paul, Kawhi Leonard, Jimmy Butler, Nikola Jokić, Dwight Howard |
| `sd2-creator-stack` | James Harden, Russell Westbrook, LeBron James, Kevin Durant, Giannis Antetokounmpo |

Result: 0.486 for the balanced side over 1,000 games. See
`probability-validation-c1.md`.

## Limits

Synthetic fixtures measure the engine against itself. Agreement between a
prediction and a synthetic outcome says the estimator samples the engine
faithfully. It says nothing about whether the engine resembles basketball — only
the historical corpus can speak to that, and only within the coverage that
`historical-target-coverage-v3.md` records.
