# Side-symmetry regression after wiring

**State: MEASURED. Gate PASS. Numerically identical to the pre-wiring measurement.**

240,000 paired games across 48 cells — all eight Era Styles, man and zone, four
coach pairings, six archetypes derived from the real card pool.

| Metric | Pre-wiring (6C2C2) | Post-wiring | Gate |
|---|---|---|---|
| Gold win rate | 0.4989 | **0.4989** | — |
| Gold advantage | −0.1108pp | **−0.1108pp** | ≤ 0.5pp PASS |
| 95% CI | −0.31 to +0.09pp | **−0.31 to +0.09pp** | within ±1.0pp PASS |
| Gold first possession | 0.4904 | **0.4904** | PASS |
| Overtime Gold-first rate | 0.5067 | **0.5067** | PASS |
| Overtime Gold win rate | 0.5018 (+0.178pp) | **0.5018 (+0.178pp)** | ≤ 2.0pp PASS |
| Possession difference | −0.0004 | **−0.0004** | ≤ 0.50 PASS |
| Systematic t | −1.2878 | **−1.2878** | ≤ 2.0 PASS |
| Cells beyond ±2pp | 0 of 48 | **0 of 48** | PASS |
| Invariant violations / ties | 0 / 0 | **0 / 0** | PASS |

**All ten gates pass.** Identity to four decimal places across 240,000 games is
the strongest confirmation available that the wiring changed metadata and nothing
else — a corpus this size would surface a one-in-ten-thousand behavioural drift.

## On the frozen per-cell threshold

The Phase 6C2C2 acceptance policy is unchanged and **was not re-versioned**. The
sample-size-aware aggregate policy it defines is what this run was judged
against, and it passes on every criterion.

The separate per-cell side-bias threshold used by the *probability* diagnostic
still fails at 0.0781 against 0.05 — as it did in 6C2C2, for the same reason
(that diagnostic runs on 256-game samples where the standard error is 3.13pp, so
0.0781 is 2.5 SE, and the systematic test passes at t = −1.29). It was not moved.
See `probability-regression-after-wiring.md`.

## What this does and does not show

It shows the overtime jump-ball fix from the parent branch survived the wiring
intact, and that no parameter binding reintroduced a side preference.

It does not show anything new about the engine's fairness beyond what 6C2C2
established — the numbers are the same numbers, which is the point.
