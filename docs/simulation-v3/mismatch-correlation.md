# Mismatch correlation (Phase 6B2 Workstream 0B)

## The double-counting problem

A small defender on a dominant centre legitimately produces:

```
SIZE_MISMATCH · STRENGTH_MISMATCH · POST_MISMATCH
REBOUNDING_MISMATCH · FOUL_RISK_MISMATCH · HELP_DEPENDENCY
```

Every one of those descriptions is true and worth keeping. But they are **six symptoms of one latent
disadvantage**, and summing them charged that disadvantage six times — 44 cost units for a single
pairing, enough to drown every other consideration in the plan.

## Clusters

| Cluster | Types | Secondary discount | Interaction | Cap |
|---|---|---|---|---|
| `INTERIOR_PHYSICAL` | size, strength, post, rebounding, foul-risk | 0.30 | 0.16 | 15 |
| `PERIMETER_MOBILITY` | speed, pull-up, movement shooting, screen navigation | 0.42 | 0.10 | 14 |
| `RIM_ACCESS` | rim pressure, rim protection, help dependency | 0.35 | 0.12 | 11 |
| `SWITCHING` | switchability, recovery | 0.50 | 0.08 | 7 |

The discounts differ on purpose. Interior symptoms are the most tightly correlated — being outsized
*is* being out-muscled *is* being out-posted — so secondaries retain only 30%. Perimeter symptoms are
more separable: a slow defender may still navigate screens well, so secondaries retain 42%.

A type listed in two clusters is priced in its **primary** cluster only (the first that claims it), so
cluster membership cannot itself double-count.

## Numerical model

```
clusterEffect = min(cap, largest + Σ(others) × secondaryDiscount
                         + largest × interaction × min(count-1, 3))
```

The interaction term is real and deliberately small: the symptoms *do* compound — being outsized
**and** slow is worse than either — but the compounding is bounded.

**Descriptive tags are untouched.** Clustering changes only what the labels cost, never which labels
are produced. A coach still sees all six problems named with their evidence and consequences.

## Measured behaviour

| Case | Naive sum | Clustered |
|---|---|---|
| 6 interior labels (3 SEVERE, 2 MAJOR + help dependency) | 44 | **24** |
| One `POST_MISMATCH` SEVERE | 9 | 9 |
| + redundant `SIZE_MISMATCH` SEVERE (same cluster) | 18 | **13.1** |
| + independent `MOVEMENT_SHOOTING_MISMATCH` SEVERE | 18 | **18** |

Redundant labels add 4.1; genuinely independent ones add the full 9. That is exactly the required
behaviour.

## Tests

- one physical disadvantage yields several labels but under 60% of the naive cost
- a redundant label costs something but under 60% of a full penalty
- an independent label still adds a full penalty
- four correlated SEVERE labels cost under 2.2× one of them
- optimizer plan **identity** is stable when a redundant label is added to every cell
- small-ball versus size stays clearly disadvantaged (>2 severe mismatches) while no single pairing
  carries more than 55% of the plan cost
- possession make probabilities stay bounded in [0.05, 0.87] and conservation holds across 60 games
