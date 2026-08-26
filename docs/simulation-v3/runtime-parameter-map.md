# Runtime parameter map

**State: RUNTIME_CONNECTED. 53 of 53 active, 0 disconnected, 0 static problems.**

Machine-readable:
[`data/calibration/runtime-parameter-map.json`](../../data/calibration/runtime-parameter-map.json)
· `parameterConnectivityVersion 1.0.0`

## Registry structure after Phase 6C2C3

`calibrationParameterRegistryVersion 2.0.0` — a **structural** change, not a
calibration change.

| Class | Count |
|---|---|
| `ACTIVE_RUNTIME_TUNABLE` | **53** |
| `DERIVED_PARAMETER` | 2 |
| **Total entries** | **55** |

Registry v1 (53 entries, hash `b8c81cd99161b605`) is preserved at
[`data/calibration/registry-v1-snapshot.json`](../../data/calibration/registry-v1-snapshot.json),
because Phases 6C2B, 6C2C1 and 6C2C2 reported results against that structure and
that hash. New default hash: `210409189ebc1ff8`.

### Entry changes

| Change | Entries |
|---|---|
| Removed (split) | `coach.adjustmentThreshold`, `coach.adjustmentCooldown` |
| Added (split) | `coach.{offensive,defensive}AdjustmentMinEvents`, `coach.{offensive,defensive}AdjustmentCooldown` |
| Default corrected | those four, plus `coach.adjustmentMagnitude` (0.05 → 0.06) |
| Reclassified derived | `zone.selectionFrequency`, `zone.offensiveReboundExposure` |
| Description corrected | `era.freeThrowTripRate` |

The active count returning to 53 is arithmetic (−2 +4 −2), not significance.

## Connectivity evidence

Both halves are required, because either alone is weak. A grep can be satisfied
by an unreachable branch; a trace only covers the mechanics the fixtures reach.

| Evidence | Result |
|---|---|
| Declared consumer in the manifest | 53 / 53 |
| Declared file reads the accessor path | 53 / 53 |
| Observed reading at runtime (trace) | **53 / 53** |
| Moving the value moves a fixture result | **53 / 53** |
| Read but inert | 0 |
| **Disconnected** | **0** |

Every parameter clears *both* bars. Even the two inactive guard rails
(`era.paceBoundFraction`, `era.threeAnchorMax`) move a result somewhere in the
32-fixture corpus when pushed to a bound, though not within the six sensitivity
fixtures — which is precisely the distinction between connectivity and
measurable effect.

### A correction to the connectivity check itself

The first version required the declared file to **import** the runtime binding.
That reported `families.js` as failing for two coach parameters — wrongly.
`families.js` reads `params.get.coach.actionMixInfluence` through a local helper
that receives the compiled set as an argument, so it correctly has no import. The
check now verifies the **accessor path is read**, which is the property that
matters.

## Where each parameter is consumed

| Domain | Parameters | Consumer |
|---|---|---|
| Opportunity saturation | 4 | `opportunityAllocation.js` · `saturationMultiplier` |
| Mismatch bias | 4 | `opportunityAllocation.js` · `mismatchMultiplier` |
| Seeded form | 2 | `opportunityAllocation.js` · `formMultiplier` |
| Late-game tilt | 1 | `opportunityAllocation.js` · `opportunityWeight` |
| Action-family fit bands | 20 | `opportunityAllocation.js` · `boundedFit` |
| Shot location weights | 4 | `context.js` · `shotProfileFor` |
| Shot location bias | 2 | `game.js` · `chooseShotCategory` |
| Conversion | 3 | `game.js` · `baseMakePct` |
| Era environment | 4 | `context.js` · `preparePossessionContext`, `anchorThreeScale` |
| Zone gap exposure | 2 | `defense/zone.js` · `attackZone` |
| Coach action mix | 2 | `families.js` (5 families) + `possession/actions.js` (PnR) |
| Adjustments | 5 | `offensivePlan.js`, `defense/liveState.js` |

Full per-parameter detail — prior literal, enclosing function, basketball role,
invocation count, fixtures whose result moves — is in the JSON.

## Threading

The compiled set rides on the prepared context (`ctx.parameterSet`) and on each
allocator (`alloc.params`). The allocator route matters: it means every
`selectForOpportunity` call site already has the set in scope, so no intermediate
signature needed to learn that parameters exist.
