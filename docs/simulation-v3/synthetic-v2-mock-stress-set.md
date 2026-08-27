# The Synthetic V2 mock stress set

The runner has to be rehearsed on something shaped exactly like the sealed set
but containing none of it.

## Members

11 members, all drawn from `SYNTHETIC_DEVELOPMENT_V2`, the
non-holdout counterpart set.

| mock id | source | shared people with nearest sealed five | stands in for |
|---|---|---|---|
| `mock-role-overlap` | `sd2-extreme-small` | 1 / 5 | EXPLOIT_ROLE_OVERLAP, EXTREME_STRENGTH_GAP |
| `mock-no-spacing` | `sd2-weak-shooting` | 2 / 5 | IMPOSSIBLE_SPACING |
| `mock-duplicate-role` | `sd2-no-rim-protection` | 2 / 5 | DUPLICATE_ROLE_OVERLOAD |
| `mock-mismatch-chain` | `sd2-weak-defender-hiding` | 3 / 5 | DEFENSIVE_MISMATCH_CHAIN |
| `mock-zone-legal` | `sd2-passing-hub` | 2 / 5 | ZONE_EDGE_CASE |
| `mock-zone-illegal` | `sd2-post-mismatch` | 3 / 5 | ZONE_EDGE_CASE |
| `mock-era-edge` | `sd2-cross-era` | 3 / 5 | ERA_EDGE_CASE |
| `mock-coach-toolkit` | `sd2-action-family-stress` | 2 / 5 | COACH_TOOLKIT_EDGE, SERIES_VARIANCE |
| `mock-usage` | `sd2-creator-stack` | 3 / 5 | USAGE_CONCENTRATION |
| `mock-tails` | `sd2-balanced-lower-ovr` | 2 / 5 | STATISTICAL_TAILS |
| `mock-season` | `sd2-movement-shooters` | 3 / 5 | WIN82_VARIANCE |

## Person overlap is bounded, not forbidden

bounded, not forbidden. Both sets came from one card pool in one design phase, so 24 of the development set's 42 people also appear in the sealed set. A member is rejected only if it sits within one substitution of a sealed five; three development fixtures were excluded on that rule. Controls, which are constructed opponents rather than existing fixtures, still exclude every sealed person outright.

Three development fixtures are excluded:

| excluded | nearest sealed five | shared |
|---|---|---|
| `sd2-elite-shooting` | `ss2-duplicate-role` | 4 / 5 |
| `sd2-extreme-size` | `ss2-coach-toolkit-edge` | 4 / 5 |
| `sd2-zone-attack` | `ss2-era-edge-modern-in-old` | 4 / 5 |

Each sits one substitution from a sealed five. Running those at volume would
produce a close proxy for a sealed fixture's result, which a rehearsal has no
business generating.

## Branch coverage survives the exclusions

All 12 sealed stress purposes
have a stand-in, with 8 zone-legal and
3 zone-illegal members, so the
rehearsal exercises both the win-rate band and the `NOT_APPLICABLE` branch, both
control surfaces, and both competition modes.

