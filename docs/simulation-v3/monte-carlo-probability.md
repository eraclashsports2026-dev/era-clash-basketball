# Monte Carlo win probability

Development-only. No public endpoint exists and no API handler can reach the
estimator; a test asserts both.

## Why this replaced the analytical model

Phase 6C2B built an analytical expectation model and measured it honestly:
Brier **0.2507**, R² **0.035**, verdict `NOT_PREDICTIVE`. A constant 0.5 scores
0.2500. The model was, to within noise, worthless.

The failure was structural rather than a matter of coefficients. The model tried
to predict the engine's output from summary features of the two rosters. The
engine's output is produced by a possession-by-possession simulation whose result
depends on matchup interactions, opportunity allocation, zone legality and coach
adjustments — none of which reduce to a linear function of roster summaries.
Tuning the coefficients would have chased a shape that was never there.

So this estimator does not model the engine. It runs it.

## The method

For a matchup and a sample tier, play the game N times on **prediction seeds**
and count wins. The estimate cannot be miscalibrated against the engine's
behaviour, because it is a direct sample of that behaviour. What remains to get
right is everything around the count.

### Paired side orientation

EraClash plays on a neutral court, so any gold-slot or blue-slot advantage is an
artifact of the implementation, not a feature of the matchup. Each prediction
seed is played **twice** — once with each team in the gold slot — and both
results are converted to one team's perspective.

The raw orientation rate is **reported, not discarded**. Averaging a side effect
away silently would make it permanent and invisible. A mirror matchup therefore
returns exactly `0.5` by construction while still reporting the gold rate that
pairing cancelled, which is the only way to see the artifact at all.

### Canonical pair identity

`A vs B` and `B vs A` are the same matchup and share one cached estimate. The
reversed view returns `1 − p` from that same estimate rather than running a
second Monte Carlo job, because two independent samples of one matchup would
disagree with each other and both would be displayed as authoritative.

### Wilson intervals

The naive `p ± 1.96·SE` misbehaves near 0 and 1 and produces bounds outside
`[0,1]`, and a zero-width interval at `w = 0`. For a probability that is not a
presentational quibble. The Wilson score interval is used throughout.

## Sample tiers

| Tier | Games | Typical half-width at p≈0.5 |
|---|---|---|
| `FAST` | 128 | ±0.086 |
| `STANDARD` | 256 | ±0.061 |
| `DEEP` | 512 | ±0.043 |
| `INTERNAL_VALIDATION` | 4096 | ±0.015 |

Every tier is even, because an odd tier could not be split into paired
orientations. The estimator throws rather than accepting one.

## Output

```
goldWinProbability, blueWinProbability, goldWins, blueWins,
sampleCount, sampleTier, confidenceInterval { method, level, lower, upper, halfWidth },
sideBias { goldOrientationRate, blueOrientationRate, difference,
           firstAsGoldWinRate, firstAsBlueWinRate },
predictionFingerprint, matchupFingerprint,
activeVersions, parameterSetHash, label
```

`label` is always `ERACLASH_MODEL_IMPLIED_PROBABILITY`. Never
`TRUE_PROBABILITY`, `HISTORICAL_PROBABILITY` or `GUARANTEED_ODDS`. It states what
this model implies, under these versions, and nothing more.

## Caching

Namespace `mc-probability:` — development only, never a production namespace.
The key carries the Monte Carlo version, cache schema version, prediction seed
set version, sample tier, sample count, **every** material engine and data
version, the parameter-set hash, and the canonical matchup fingerprint.

`possessionCalibrationVersion` is recorded as `UNCALIBRATED` rather than omitted.
An absent field would silently share a cache entry between the uncalibrated
engine and a future calibrated one.

The key never carries an actual game seed, user id, session id, result id, email
or profile data. A test enumerates these and asserts their absence.

## Commands

```bash
npm run probability:estimate -- --matchup=<fixture-id>
npm run probability:validate
npm run probability:ladder
npm run probability:balanced-vs-ovr
npm run probability:cache-report
npm run probability:replay -- --fingerprint=<id>
```

## Known limits

- Cost is linear in sample size. `STANDARD` is ~590ms; `INTERNAL_VALIDATION` is
  ~9s. Nothing about this is suitable for a request path.
- The estimate is only meaningful against the versions in its fingerprint. When
  any material version moves, replay reports `DIVERGED` and the old value must
  not be quoted for the new engine.
- The engine it samples is **not calibrated**. A faithful sample of an
  uncalibrated engine is a faithful statement about that engine, not about
  basketball.
