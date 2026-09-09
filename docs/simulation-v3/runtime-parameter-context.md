# Runtime parameter context

**State: RUNTIME_CONNECTED. 53 of 53 active parameters reach the engine.**

`runtimeParameterBindingVersion 1.0.0` ·
[`src/v3/calibration/runtimeParameters.js`](../../src/v3/calibration/runtimeParameters.js)

## What this replaced

Before Phase 6C2C3 the repository held two independent copies of every
coefficient:

```js
// src/v3/actions/opportunityAllocation.js — what the engine read
export const SATURATION = Object.freeze({ strength: 1.35, ... });

// src/v3/calibration/parameters.js — what the registry declared
{ id: "opportunity.saturation.strength", defaultValue: 1.35, min: 0.6, max: 2.5 }
```

Two `1.35`s with nothing between them. Phase 6C2C2 proved the consequence: every
parameter pushed to its maximum, the parameter-set hash changed, and five seeded
games returned byte-identical scores.

## Design

### Compile, never mutate

`compileRuntimeParameterSet({ registry, overrides })` returns one deep-frozen
object. It **rejects** rather than coerces:

| Input | Result |
|---|---|
| unknown parameter id | `ParameterSetError` |
| value outside declared bounds | `ParameterSetError` |
| `NaN`, `±Infinity` | `ParameterSetError` |
| a string, even `"1.35"` | `ParameterSetError` |
| `null`, `undefined`, object, array | `ParameterSetError` |

Coercion is refused deliberately. A silently-coerced parameter is worse than a
thrown one: the run continues, the hash records a value nobody chose, and the
result gets attributed to a calibration that never existed.

### No process-global state

The set rides on the prepared context and on each allocator. Nothing is
installed anywhere shared, so three candidate sets can run interleaved in one
process, each reproducing exactly, none touching the others. A test asserts
this over four seeds — one seed is not enough, because two different sets can
coincidentally land on the same scoreline.

### Canonical, order-independent hash

The hash covers the registry version, the binding version and the values in
sorted id order. The same candidate written two ways produces one hash, so a
cache cannot split on formatting.

### Hot-path access

A nested accessor tree is built once at compile time, so the possession loop
does `params.get.opportunity.saturation.strength` — a plain property read on a
frozen object, the same cost as the module constant it replaced. No string
splitting, no `Map` lookup, no registry parsing inside the loop.

### Status is truthful

| Condition | `status` |
|---|---|
| defaults only | `UNCALIBRATED_DEFAULTS` |
| any override | `CANDIDATE_OVERRIDES` |

Defaults are not a calibration, and the field says so.
`calibrationVersion` remains `null`.

## Override security

Parameter overrides are internal development inputs. No `api/` handler imports
the binding, accepts a `parameterSet`, or reads parameters from a request body —
each asserted by test. There is no admin HTTP endpoint for parameter changes;
CLI and test tooling only.

## Consumption trace

Development-only. Off by default, costing one boolean check when off, because it
sits in the possession loop. `startParameterTrace()` records `{ id, invocations,
lastValue }` per parameter.

It exists because a static import check can be satisfied by an unreachable
branch. Connectivity has to be **observed**, not inferred — that was the whole
shape of the 6C2C2 defect.

A test asserts enabling the trace does not change any result.

## The registry is now frozen

Each entry is `Object.freeze`d. Before wiring, mutating `currentValue` looked
like it should change the engine and did not — and that trap survived the wiring
itself, because the runtime reads `defaultValue` plus explicit overrides. The
6C2C2 test that asserted "moving every parameter changes nothing" therefore kept
passing after everything was wired, for the wrong reason. Freezing removes the
trap rather than documenting it.

`registryDefaultsHash()` is exposed alongside `parameterSetHash()` so the
distinction between the registry's declared values and a running set is stated
rather than assumed.
