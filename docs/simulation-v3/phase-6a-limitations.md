# Phase 6A limitations

Read this before quoting any number the possession engine produces.

## Status

**DEVELOPMENT — CALIBRATION REQUIRED.**

`possessionEngineVersion` **1.0.0**, status `DEVELOPMENT`. `POSSESSION_ENGINE_ENABLED` defaults to
**false**. The live production engine remains `engineVersion` **3.2.0**.

The engine is **not** historically authoritative, **not** definitive, **not** scientifically proven,
and **not** fully accurate. No historical backtesting or holdout validation has been performed. The
player data it consumes still carries substantial documented uncertainty — 310 of 381 cards are
`LEGACY_UNVERIFIED`, 89% of cards infer shooting from position and decade, 74% of persons have no
verified physical measurement, and 45 cards with pre-recording seasons have no reviewed defensive
evidence. Every result inherits that.

## What is built

Deterministic seeded loop · four regulation periods · overtime · team possessions · finite usage
consumption · action interface with pick-and-roll, generic half-court and transition · shot attempts
in four categories · two- and three-point makes where legal · misses · shooting fouls and free throws
· turnovers, forced and unforced · offensive and defensive rebounds · assists · steals · blocks ·
player and team box scores · game state · statistical conservation · result fingerprint ·
reproducibility · replay tool · benchmark.

## What is NOT built

| Not built | Consequence |
|---|---|
| Defensive-assignment intelligence | matchups are positional, then nominal. No switching logic, no scheme assignments, no targeted mismatch hunting |
| Isolation, post-up, motion, handoff, off-ball-screen action families | everything that is not pick-and-roll or transition resolves as `GENERIC_HALF_COURT`, which claims no tactical specificity |
| Bench, rotations, substitutions, minutes | the five selected players play every possession |
| Foul-outs | personal fouls are tracked internally and deliberately not displayed; with no bench, a six-foul rule would end the game with four players |
| Coach counter-adjustments | a coach sets tendencies before the game and does not respond within it |
| Full play-by-play narration | the ledger is a debugging record, not prose |
| Historical calibration | Phase 6C |
| Production UI, production activation | later |

## Honest characterisations

**The generic half-court action is a fallback.** It uses real inputs — usage hierarchy, shot profile,
spacing, rim pressure, the defensive profile, era, game state — but it models no system. Its
`tacticalSpecificity` field reads `"NONE — a fallback action, not a modelled system"`. No postgame may
describe such a possession as motion offence, a set play, or anything more specific than half-court
offence.

**The pregame expectation is coarse and self-referential.** Its coefficients were fitted to *this
engine's own output* (80 matchup–era cells × 40 seeds, mean absolute error ~2.4 points per 100
possessions). It predicts what the engine will do; it says nothing about history. Pooled across
matchups the higher-expected team wins about **59%** of the time — better than a coin flip, and far
from authoritative. Individual matchups range roughly 45–72%.

A first fit over raw features produced a **negative** shot-creation coefficient and a **positive**
opponent-help-defence coefficient — collinearity artefacts. Shipping them would have meant a model
claiming better shot creation lowers offensive efficiency. The model uses three sign-interpretable
composite terms instead: a number that looks like knowledge and says something false is worse than a
coarser number that says something true.

**Fatigue is minimal and bounded.** Maximum effects: shooting 5.5%, turnover risk 9%, defensive
effectiveness 7%, rebounding effort 6%, with 22% of accumulated load shed at a quarter break. It
nudges margins; it cannot turn a great player into a poor one, and there is no stamina meter.

**Data confidence is not variance.** Confidence describes how certain the *inputs* are; variance
describes how the *basketball* went. They are propagated separately and a test asserts that two
lineups with very different data confidence do not get differently-wide score distributions because of
it.

**Era anchors are frequency anchors.** The documented era environment sets how often a three is
attempted, how often a foul is drawn, how often an offensive rebound is available. It never sets
whether a shot goes in.

## Known model tensions

1. **All-time rosters exceed league averages** — correctly. A superteam shooting 0.50 in a 0.441-FG%
   era is the model working, not drifting. It does mean absolute score levels run above historical
   league scoring, and calibration against real team-seasons is Phase 6C's problem.
2. **Positional matchups are crude.** The nominal defender is chosen by position, then by index. Until
   Phase 6B this under-represents both mismatch hunting and elite individual defence.
3. **Transition is triggered but not modelled in depth.** It fires from live-ball steals, defensive
   rebounds and pace, and can be pulled out into half-court, but there is no numbers-advantage model.
4. **Free-throw skill is a prior for most players.** Only verified `ftPct` anchors it; otherwise a
   bounded prior from perimeter skill, flagged in confidence.
5. **The three-point anchor is a team-level scale.** It preserves relative player differences but does
   not model individual attempt rates, which are not available for most cards.

## What must not be claimed

- that a simulated result reproduces a historical outcome
- that the engine is calibrated, validated, or accurate
- that a `GENERIC_HALF_COURT` possession expressed a coaching system
- that the pregame expectation is a probability
- that data confidence made a game more or less random
