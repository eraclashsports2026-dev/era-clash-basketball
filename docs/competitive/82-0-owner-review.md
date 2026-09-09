# 82-0 owner review — interaction evidence for Phase 9A

**Source.** The owner reviewed 82-0.com on 2026-09-02 and supplied 26 screenshots (home,
mode cards, team/era spin, player list with position tags, court placement, result,
sign-in, leaderboard, challenges, profile, games shelf, trivia, and the publisher's
site). The screenshots live outside the repository and are **never** referenced at
runtime. This document records what they demonstrate about interaction, and what
EraClash decided to do about each observation. The decision artifact is
`data/validation/9a/competitive-decisions.json`.

**Boundary.** Nothing of 82-0's branding, colour identity, icons, text, animation,
rules, result design or grading vocabulary is reproduced. EraClash adopts *simplicity
and progressive disclosure*, not their limitations.

## What the review established

82-0 is not deeper than EraClash. It is currently easier to understand. A first-time
82-0 visitor sees three cards, one sentence each, one button each, and is playing in
two clicks. A first-time EraClash visitor was sent straight into the Time Arena — the
strongest surface in the product, and the densest — before knowing what they had
chosen.

## Observed elements and decisions

| Observed on 82-0 | Decision | What EraClash does |
|---|---|---|
| Three mode cards on the home surface | **ADAPT** | A dedicated Play Lobby at `/` and `/play`: three primary cards (Chaos Clash · Dream Matchup · Daily Clash) and a quieter row of four, all read from the one navigation registry. |
| One obvious action at a time | **ADOPT** | One action per card; one primary CTA per Time Arena state, now attributed (`data-focus`) and measured. |
| Controls locked until actionable | **ADAPT** | The coach section is visibly subdued while not actionable (`data-active="false"`); placeholder staffs desaturate on an empty board. Nothing is hidden; nothing competes. |
| Finite, visible respin resources | **ADAPT** | Three named rolls (FOUNDATION · ADAPT · COMMIT); completed rolls compress to ticks; the abandon dialog states that a guest run counts when it starts. |
| Automatic progression after a placement | **REJECT** | Chaos progression stays on explicit decisions — hold, lock, hire, run. The decisions are the game. |
| Eligible-position highlighting on player select | **OUTPERFORM** | Player-first placement in Dream Matchup: four worded slot states, auto-placement for one legal slot, a legal swap workflow, Undo, duplicate-person refusal, and a screen-reader sentence — all from authoritative card data. |
| Concise result | **ADAPT** | The Result Dock leads with the Story; Box Score, Coaching and Analysis stay one tap away. Depth on demand, not removed. |
| Simple account / social navigation | **DEFER** | Phases 9B–9C by decision. |
| Same mental model across web and app | **ADOPT** | Same names, order, glyphs, statuses and sentences everywhere; only the layout reflows. |
| Projected record and letter grade | **REJECT** | EraClash reports simulated results. No projected record, no grading vocabulary. |
| Orange colour system, logo, icons, slot animation | **REJECT** | EraClash Logo Mk1; near-black arena base, silver, gold, cobalt, coach violet; original stroke glyphs; original copy. |
| Sign-in prompt on the result; leaderboard rank | **DEFER** | 9B / 9C. No fake sign-in is shown. |
| Language selector | **DEFER** | 9F. |
| Trivia / more-games shelf | **REJECT** | Out of scope; Fantasy stays its own pillar and is not mixed into Play. |
| Advertising between the game and the player | **REJECT** | None. |

## What did not change

Candidate 4's game-resolution behaviour, parameters, core hash and calibration
version; Player, Team, Coach and Era Style intelligence; the possession and defensive
engines; draft value, probability and pressure; the Legend CPU and its no-peeking
commitments; roll counts; hold and release; same-seed challenge semantics; postgame
evidence; result persistence; preview security and credentials; production. The
locked core closure hashes identically before and after this phase
(`data/validation/9a/production-isolation.json`).

## Where to look

- Registry and routes: `src/navigation.js`
- Lobby: `src/components/lobby/`
- Placement rules: `src/lineupPlacement.js` (tests: `tests/v9a-lineup-placement.test.js`)
- Disclosure: `src/components/arena/ChaosStage.jsx`, `ResultDock.jsx`, `src/index.css` (Phase 9A sections)
- Telemetry: `src/activation.js`, `api/events.js`
- Evidence: `data/validation/9a/`
