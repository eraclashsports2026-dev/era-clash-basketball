# Production rollout plan

**State: PREPARED, NOT EXERCISED. No production change was made in Phase 6C2C2.**

`productionRolloutPolicyVersion 1.0.0`

This plan exists so that a future phase reaching the activation gate does not have
to invent one under time pressure. Nothing in it has been executed.

## Preconditions — all ten, in order

Activation is not attempted until every one passes:

1. Actual-game side symmetry — **PASS (Phase 6C2C2)**
2. Tier B target gate — **PASS on its terms (Phase 6C2C2)**
3. Independent source verification — **FAIL**
4. Parameter identifiability — **BLOCKED (0 of 53 wired)**
5. Internal calibration — not attempted
6. `possessionCalibrationVersion` locked — not reached
7. Historical holdout v3 passed — not opened
8. Synthetic stress holdout v2 passed — not opened
9. Private preview passed — not attempted
10. **Explicit CEO approval, phrase `GO LIVE`** — not given, not requested

Inferred approval and self-approval are forbidden by the frozen policy. A general
instruction to complete a phase is not production approval.

## Flags, and their production defaults before activation

| Flag | Default |
|---|---|
| `POSSESSION_ENGINE_ENABLED` | `false` |
| `POSSESSION_ENGINE_SHADOW_PERCENT` | `0` |
| `POSSESSION_ENGINE_ROLLOUT_PERCENT` | `0` |
| `MONTE_CARLO_PROBABILITY_ENABLED` | `false` |
| `DAILY_COACH_ERA_ENABLED` | `false` |
| `POSSESSION_ENGINE_MODE_ALLOWLIST` | empty |
| `POSSESSION_ENGINE_EMERGENCY_OFF` | `false` |

Environment-controlled only. No admin write path is exposed over public HTTP.

## Stages

| Stage | Scope | Advance when |
|---|---|---|
| 0 | code deployed, all flags off | `/api/health` reports the expected version manifest |
| 1 | shadow only — output logged, never shown, never recorded | error rate, latency and invariants clean |
| 2 | 5% canary, eligible Single Game | thresholds hold |
| 3 | 25% Single Game | thresholds hold |
| 4 | 50% Single Game + Best of 7 | thresholds hold |
| 5 | 100% Single Game + Best of 7 | thresholds hold |
| 6 | Win 82 + Tournament | thresholds hold |
| 7 | Daily, **at the next UTC-day boundary only** | thresholds hold |
| 8 | Challenges created under the new manifest | thresholds hold |

Skipping to full rollout is forbidden. Engines are never mixed inside one
competition object.

## Engine locking per competition object

Every competition locks its engine and calibration manifest **at creation**:

- **Single Game** — versions stored in the result.
- **Best of 7 / Win 82 / Tournament** — one manifest for the whole series, season
  or bracket. The engine never switches mid-competition.
- **Daily** — created or activated only at a UTC-day boundary; the official config
  stores the full manifest. The current day's Daily is never altered.
- **Challenges** — manifest embedded in the challenge. An accepted challenge does
  not silently run a newer engine than the creator's locked definition unless the
  challenge explicitly expires or migrates.

## Per-stage thresholds

| Metric | Threshold |
|---|---|
| Core simulation success | ≥ 99.9% |
| Invariant failures | 0 |
| Replay failures | 0 |
| Final ties | 0 |
| Unexplained 5xx | < 0.5% |
| Challenge corruptions | 0 |
| Daily splits | 0 |
| Result-schema incompatibilities | 0 |
| PWA stale-bundle incidents | 0 |
| Private-data leaks | 0 |
| Calibration-only player exposures | 0 |

Latency thresholds are to be set from the private-preview baseline before
activation, not guessed here. Moving any threshold after a canary fails requires a
new policy version.

## Non-negotiables during rollout

- Engine 3.2.0 stays deployed as the fallback and kill switch. It is not deleted.
- Every result retains its version manifest and stays replayable.
- Calibrated results are never deleted, including on rollback.
- Rollback is tested **before** activation, not after a failure.
- Only an actually-observed watch window may be reported as observed.
