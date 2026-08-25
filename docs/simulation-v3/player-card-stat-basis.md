# Player card statistical basis

**The pool is not statistically uniform.** Four different things are stored
under the field name `pts`, and every downstream layer currently treats them as
one comparable quantity. This document records which is which and why it
matters. `src/v3/data/cardStatBasis.js` is the machine-readable form.

## The four bases

| Basis | Cards | Meaning | Reproducible? |
| --- | ---: | --- | --- |
| `DECADE_SEASON_AVERAGE` | 16 | Unweighted mean of the player's per-season averages inside the decade, read off a published career table | **Yes** |
| `REPRESENTATIVE_PRIME` | 44 | Hand-set figures for the player's typical prime form in that decade | No |
| `SINGLE_SEASON` | 11 | One real season (the 2025 draft class, who have exactly one) | **Yes** |
| `LEGACY_UNVERIFIED` | 310 | Inherited from the pre-V3 database; values look like genuine multi-season averages but no averaging rule was recorded | No |

## The rigorous convention

For `DECADE_SEASON_AVERAGE` — the convention new cards must follow:

1. **A season belongs to the decade of its STARTING year.** 1959-60 is 1950s;
   1960-61 is 1960s.
2. **The card stat is the UNWEIGHTED MEAN of that player's per-season averages**
   inside the decade — not a games-weighted career average.
3. **Accolades are decade-scoped and dated by the season won in.** Award year
   1990 = the 1989-90 season = the 1980s. This is why Chris Mullin's 1990 All-NBA
   Third Team does not appear on his 1990s card, and why Larry Nance's 1992 and
   1993 All-Defensive Second Teams sit on his 1990s card rather than his 1980s one.
4. **A mid-season team split is games-weighted into one season row first**, then
   treated as a single season (Petrović's 1990-91 Portland/New Jersey split).
5. **Seasons under 20 games are excluded.** Added in Phase 2B when Walt
   Bellamy's one-game 1974-75 season would have moved his 1970s card by 2.4
   points. A token season is not a season.

This convention was not invented — it was **reverse-engineered from
`russell-50s`**, which it reproduces exactly (16.55 → 16.6 / 22.33 → 22.3 /
2.9), and then written down so the next contributor does not have to guess.

## How the classification was derived

By provenance, not by inspection. Cards were grouped by the section of
`players.js` that introduced them (each maps to a known release commit), and the
grouping was corroborated against a rounding signal — the share of cards whose
`pts`/`reb`/`ast` all land exactly on `.0` or `.5`:

| Group | n | Fully rounded | Reading |
| --- | ---: | ---: | --- |
| verified-decade | 16 | 0% | computed averages |
| core-pool | 286 | 3% | look computed, provenance undocumented |
| modern-allstars | 24 | 4% | look computed, provenance undocumented |
| rookie-season | 11 | 0% | one real season |
| **v2-expansion** | **44** | **77%** | **hand-set prime figures** |

The 77%-vs-3% split is the finding. It is not a rounding artefact, and the group
size matches its own section header ("+44") exactly.

## Why mixed conventions are a real risk

`REPRESENTATIVE_PRIME` cards are **systematically higher** than the same player's
true decade mean, because a prime-form figure ignores decline years. Rasheed
Wallace's 2000s decade mean is roughly 14.8; his card reads 16.5. Bruce Bowen's
is roughly 6.4; his card reads 7.5.

Consequences:

- **Player DNA inherits the inflation.** `usageTendency`, `creation`, and
  `rimPressure` all derive from `pts`.
- **Cross-era comparison is distorted** in a way era normalization cannot fix,
  because the distortion is per-card, not per-decade.
- **A decade card and a prime card mean different things** while looking
  identical in the UI.

## Recommended migration

1. **Do not mass-rewrite.** 310 legacy cards cannot be re-derived without
   per-player source verification, and a bulk rewrite from recall is exactly the
   failure mode that produced 84 errors across 31 cards in an earlier pass.
2. **Re-derive opportunistically.** Any card touched for another reason gets
   re-derived to the rigorous convention and moved to `verified-decade`.
3. **Prioritise the 44 prime-form cards.** They are the known-biased set and the
   smallest.
4. **New cards follow the rigorous convention.** No exceptions.
5. **Consumers may weight by basis.** `statBasisFor(cardId).reproducible` is
   available today for any layer that wants to discount unverified inputs.

Whether to fund a full re-derivation is a CEO decision, not a technical one.
