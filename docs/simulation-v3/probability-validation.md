# Probability validation

`src/v3/calibration/probability.js` · `probabilityValidationVersion` **1.0.0**

## The headline finding

**The pregame expectation does not predict match outcomes.**

Measured over **40 same-era matchup cells at 800 seeds each** (standard error
≈ 0.65 per cell, so the measurement is not underpowered):

```
realized margin = 0.567 × expected margin − 0.546      R² = 0.035
```

At the extremes it gets the **sign** wrong:

| Expected margin | Realized margin | Win rate |
| --- | --- | --- |
| −3.13 | **+19.59** | 0.889 |
| +3.13 | **−20.08** | 0.098 |

The Phase 6A expectation was fitted to predict the engine's own offensive
**efficiency**, and it does that with a mean absolute error near 2.4. Efficiency
differential is not margin, and the gap between the two is where games are
decided.

### Why this was nearly missed

A first pass measured a narrow strength ladder and found the realized margin
was **3.4× the expected** — the opposite conclusion. That was one matchup family
in which the two happened to correlate. A second pass at 60 seeds per cell gave
R² = 0.021, which could have been dismissed as underpowered noise. Only the
third pass — fewer cells, 800 seeds each — settled it.

## Consequence

A calibrated win probability cannot be built on this expectation. The module
therefore:

- emits a probability, because Phase 6C3 needs the shape
- carries `predictiveFit: "NOT_PREDICTIVE"` and the measured R² on **every**
  prediction, so a consumer cannot take the number without seeing what it is worth
- reports `usable: false`
- refuses to describe itself as calibrated

Fixing it means refitting the expectation against **margin** rather than
efficiency. That is engine work for a later phase.

## Reliability, measured anyway

4,200 predictions over same-era corpus pairs:

| | |
| --- | --- |
| Brier score | **0.2507** |
| Log loss | 0.6945 |
| **Sharpness** | **0.0614** |
| Upset rate | 0.4628 |
| Calibration error | 0.0113 |
| Observed range | 0.394 – 0.606 |

**Brier 0.2507 is the no-skill baseline** — what a constant 0.5 predictor
scores. The low calibration error is not a success: predictions cluster so
tightly around 0.5 that they are calibrated in the same trivial sense that
always saying 50% is calibrated. This is exactly why sharpness must be reported
beside Brier, and it is.

## The strength ladder — the engine is fine

The tested side is held fixed and the **opponent** weakens, so the ladder
isolates relative strength rather than roster construction.

| Rung | n | Predicted | Empirical | Gap |
| --- | --- | --- | --- | --- |
| mirror (identical) | 1000 | **0.500** | 0.521 | 0.021 |
| slight favourite | 1000 | 0.525 | 0.563 | 0.038 |
| moderate favourite | 1000 | 0.562 | 0.688 | 0.126 |
| strong favourite | 1000 | 0.643 | 0.840 | 0.197 |
| extreme favourite | 1000 | 0.673 | 0.890 | 0.217 |

**Monotonic: true**, in both predicted and empirical.

**The mirror predicts exactly 0.500** and wins 0.521 — within noise over 1,000
games. A mirror that is not 0.5 would be a model bias no matchup could excuse.

So the **engine ranks teams correctly and monotonically**; it is the
*expectation module* that cannot express how large the gaps are.

### A rejected ladder design

The first ladder swapped players one at a time from a weak roster into a strong
one, and was **not** monotonic: replacing Draymond Green with Kevin Durant made
the team slightly worse. That is the engine valuing team construction over raw
talent — correct behaviour — but it means one-at-a-time swaps do not produce a
monotonic strength ladder. The design was replaced rather than the result
explained away.

## What was not claimed

No claim is made about true historical probabilities for hypothetical all-time
matchups; those are unknowable. This validates **internal consistency** only,
and by that standard it currently fails.
