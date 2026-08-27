# Synthetic V2 sample plan

Volumes are frozen before any Synthetic V2 result exists, so statistical power
cannot be chosen after seeing an outcome. Every volume is a power of two, so a
run can be halved for a split-half diagnostic without remainders.

## Per-surface volumes, in side-balanced pairs

| surface | pairs | games |
|---|---|---|
| `MIRROR` | 1,024 | 2,048 |
| `MIRROR_TAIL_EXTENSION` | 4,096 | 8,192 |
| `ZONE_ASYMMETRIC` | 1,024 | 2,048 |
| `ZONE_ABLATION_TWIN` | 256 | 512 |
| `VS_COHERENT_LOWER_CONTROL` | 1,024 | 2,048 |
| `VS_ROLE_MATCHED_UPGRADE` | 1,024 | 2,048 |

## Competition modes

| mode | volume | applies where |
|---|---|---|
| replay seeds per fixture | 64 | every fixture — determinism is catastrophic, so it is checked everywhere |
| best-of-seven series | 256 | purpose `SERIES_VARIANCE` |
| 82-game seasons | 32 | purpose `WIN82_VARIANCE` |
| tournament brackets | 24 over a field of 16 | set level, structural only |

Competition modes run only where a fixture's purpose names them. No frozen
guardrail and no fixture purpose names tournament play, so the bracket
contributes only to the two structural guardrails and never decides a per-fixture
verdict.

## Total

**79,444 games** across sixteen fixtures. The smallest fixture plan
is 2,112 games against a frozen
minimum of 1,000.

## Why these shapes

- **Side balance.** every adjudicating surface plays each seed twice with the sides swapped. Phase 6C3R established that an opponent-relative claim scored on an unbalanced surface cannot separate a construction effect from a side effect.
- **Tail extension.** the STATISTICAL_TAILS fixture gets four times the mirror volume because a p01/p99 scoreline claim needs the extra resolution; no other fixture's guardrails depend on the extreme tail
- **Frozen first.** these volumes are frozen in this preparation phase and hashed into the package, so the execution phase cannot raise them after seeing a marginal result

