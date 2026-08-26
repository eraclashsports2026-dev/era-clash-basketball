# Internal calibration folds v3

**State: FROZEN. Leak-free.**

`internalCalibrationFoldVersion 3.0.0` · fold hash `ab4af0cb555bbe24` ·
[`data/calibration/internal-folds-v3.json`](../../data/calibration/internal-folds-v3.json)

## Membership

38 members across 4 folds: 24 historical calibration v3 fixtures and 14
synthetic development v2 fixtures. **No holdout fixture**, and the builder throws
rather than proceeding if one appears — by fixture id *and* by lineup, since the
same five under a different name would defeat an id check.

| Fold | Members | Historical | Synthetic | Eras | Franchises | Coaches |
|---|---|---|---|---|---|---|
| 0 | 10 | 8 | 2 | 7 | 4 | 7 |
| 1 | 6 | 2 | 4 | 3 | 2 | 5 |
| 2 | 8 | 4 | 4 | 5 | 3 | 7 |
| 3 | 14 | 10 | 4 | 6 | 3 | 9 |

Folds are deliberately uneven. Leakage grouping comes first, and franchise groups
are not the same size.

## Leakage grouping

26 groups. Fixtures sharing a key always share a fold.

| Kind | Key |
|---|---|
| Historical | franchise (`hist:BOS`) |
| Synthetic | the exact five, sorted (`synth:[...]`) |

### A correction made during construction

The first version keyed historical fixtures by **franchise within a three-season
window**. That put the 1956-57 and 1962-63 Celtics in different groups and
therefore different folds — and the franchise leakage check then flagged it. The
grouping key and the check disagreed, and the check was the stricter of the two.

With only 24 historical fixtures the conservative reading wins: franchise
identity is the strongest leakage channel — same organisation, overlapping
personnel, shared style tags — so a franchise never straddles folds. The cost is
coarser and more uneven folds. The alternative is a validation number that partly
measures memorisation, which is worse than a coarse split.

## Leakage checks — all clean

Three independent checks, each asserted:

1. **No leakage group straddles folds.** The grouping is only meaningful if it is
   honoured.
2. **No franchise appears in more than one fold.** The check that caught the
   three-season-window inconsistency.
3. **No identical five appears in more than one fold.** Catches an archetype
   rebuilt under a second id.

## Determinism

Assignment is by SHA-256 of the group key, with round-robin within each
(kind, era) stratum so no fold ends up era-starved. No RNG, so the split is
reproducible from the corpus alone, and the fold hash covers the full assignment
map — reordering the input cannot change it, but modifying a fixture will.

## Why this is frozen before search

A fold split chosen after seeing which split flatters a candidate is not a
validation split. The hash is recorded in the candidate manifest, so a candidate
can never be attributed to a different split than the one it was validated on.
