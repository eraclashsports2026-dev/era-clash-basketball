# Calibration parameter registry

`src/v3/calibration/parameters.js` · `calibrationParameterRegistryVersion` **1.0.0**
**53 parameters · 6 modules · parameter-set hash `b8c81cd99161b605`**

Every coefficient that Phase 6C2B or later may tune lives here, once.

## Why one registry

A tuned magic number inside an action file is invisible to the parameter
history. A model whose coefficients are scattered cannot be audited, reproduced
or rolled back, and nobody can say afterwards which change caused which effect.

## Coverage

| Module | Parameters | Examples |
| --- | --- | --- |
| `opportunityAllocation` | 31 | saturation strength and floor, mismatch ladder, seeded form, 10 action-family fit bands |
| `possessionContext` | 8 | shot-location base weights, pace tempo scale, three-point anchor clamp |
| `possessionGame` | 5 | rim-bias multiplier, rim/paint/midrange conversion offsets |
| `zoneResolution` | 4 | shell selection frequency, offensive-rebound exposure, gap vulnerabilities |
| `coachIntelligence` | 2 | action-mix influence, roster sensitivity |
| `coachAdjustment` | 3 | evidence threshold, cooldown, magnitude |

Every entry carries: id, module, description, current and default value, bounds,
step, prior, target metrics, calibration source, confidence, regularisation
strength, and an append-only change history.

## What is deliberately NOT registered

Registering a rule constant would imply evidence could move it. It cannot.

- Shot clock, backcourt count, three-point distance — **rules of the era**
- `REGULATION_PERIODS`, `OT_PERIOD_FRACTION` — structural definitions
- Conservation identities — arithmetic; `AST ≤ FGM` is not a coefficient
- Era `zoneLegal` / illegal-defense flags — historical rules, authoritative
- Pre-1974 steals and blocks — not recorded, never invented

## State at the end of Phase 6C2B

**Every parameter sits at its default.** Nothing was tuned, so the
regularisation penalty is exactly **0** and the change history is empty. A
non-zero penalty would mean a value moved without a recorded change, and a test
asserts it has not.

## Parameter-set identity

`parameterSetHash` is content-sensitive: two engines with different hashes are
different engines, and a result produced under one must never be attributed to
the other. It enters the result fingerprint once a calibration is locked.
