# Parameter identifiability

**State: BLOCKED. The analysis cannot be run, and the reason is not statistical.**

`parameterIdentifiabilityVersion 1.0.0`

## The finding

**Zero of the 53 registered calibration parameters are connected to the engine.**

| Check | Result |
|---|---|
| Engine files scanned | 70 |
| Files importing `calibration/parameters.js` | **0** |
| Files calling `valueOf()` | **0** |
| Registry reachable from the engine | **false** |
| Wired parameters | **0 / 53** |

Static analysis alone would be a weak claim, so it was verified by running the
engine:

```
Every parameter set to its declared maximum.
parameterSetHash changed:  true
opportunity.saturation.strength:  1.35 -> 2.5

scores BEFORE:  106-123  99-113  111-127  96-110  116-104
scores AFTER :  106-123  99-113  111-127  96-110  116-104
```

**Byte-identical.** The parameter-set hash moves, the simulation does not.

## Why this blocks the workstream rather than answering it

The sensitivity analysis would have run cleanly and returned a confident,
completely misleading result: all 53 parameters classified
`NO_MEASURABLE_EFFECT`, with signal-to-noise ratios of exactly zero.

That would have been true and worthless. `NO_MEASURABLE_EFFECT` is supposed to
mean *this coefficient does not move the engine within its allowed range* — a
finding about the model. Here the effect is zero because **the knob is not
attached to anything**, which is a finding about the plumbing. Reporting the
first when the second is true would have retired 53 parameters as inert on the
strength of a wiring bug.

So the classification is recorded as `BLOCKED_UNWIRED` for all 53, and the
frozen identifiability categories are left unused. No parameter has been
classified against the frozen SNR thresholds, because none can be.

## How this happened

The registry is a duplicate, not a controller. Its own header states the
intent — *"Every coefficient that Phase 6C2B or later may tune lives HERE,
once"*, existing to prevent *"a tuned magic number sitting inside an action file
where the parameter history cannot see it"*.

The intent was right. The wiring was never done. The engine still holds its own
copies:

```js
// src/v3/actions/opportunityAllocation.js:54
export const SATURATION = Object.freeze({
  strength: 1.35,
  ...
```

```js
// src/v3/calibration/parameters.js — a separate, unconnected declaration
{ id: "opportunity.saturation.strength", defaultValue: 1.35, min: 0.6, max: 2.5 }
```

Two independent copies of `1.35`, with nothing between them. The registry
documents an intention to make these tunable; it does not make them tunable.

The values are also `Object.freeze`d, so wiring cannot be done by mutating them
at runtime — each consumer needs an injection path. `saturationMultiplier`
already accepts `cfg = SATURATION`, which is the shape the rest needs.

## What this means for the phase

Workstreams 5 through 10 are **mechanically impossible**, independent of every
data question. Even with a purchased licence, complete Tier B coverage and a
verified second source, there would be nothing to tune: a calibration run would
search the parameter space, find every candidate scored identically to the
default, and terminate having changed nothing.

`possessionCalibrationVersion` remains `null`.

## Why this is the most tractable of the three blockers

Phase 6C2C2 found three independent blockers. This one is different in kind:

| Blocker | Needs |
|---|---|
| Tier B coverage (2 of 384 fields) | a purchased licence, and 82 fields are permanently unavailable |
| Independent second source | a purchased licence plus a written rider |
| **Parameter wiring (0 of 53)** | **engineering only — no licence, no data, no vendor** |

It is entirely within the team's control, it gates everything downstream, and it
should be done first. Sequencing it after data procurement would leave a bought
licence waiting on a code change.

## Recommended scope for the wiring work

1. Thread a resolved parameter set through `preparePossessionContext`, so the
   engine reads one snapshot per simulation rather than importing module
   constants. A snapshot passed in also keeps replay honest: the values that
   produced a result travel with it.
2. Replace each frozen constant with a lookup against that snapshot, defaulting
   to the current literal so behaviour is unchanged at defaults.
3. Add a test that fails if any registered parameter is unreachable — the check
   this document exists because nobody had.
4. Record `parameterSetHash` in the development fingerprint, which is only
   meaningful once the parameters actually shape the result.
5. **Then** run the identifiability analysis, which becomes answerable rather
   than vacuous.

Step 2 must not change any default value. A wiring change and a calibration
change arriving together would make it impossible to tell which one moved a
result.
