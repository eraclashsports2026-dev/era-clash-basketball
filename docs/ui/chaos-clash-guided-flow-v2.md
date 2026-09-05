# Chaos Clash Guided Flow V2 (Phase 9B.3)

One route, `/play/chaos`. One continuously evolving board. Six state-driven
presentations of it, each with one primary decision. The six owner-approved
references (`docs/ui/references/chaos-guided-flow-v2/UI1…UI6`, hashes in
`data/validation/9b3/reference-manifest.json`) are the design authority; the
build is compared against them at 1536×1024, 1440×900 and 1280×800 on desktop,
1024×1366 and 768×1024 on a tablet, and 430×932 and 390×844 on a phone
(`data/validation/9b3/screens/contact/`).

Gameplay is unchanged. Candidate 4 (core `55bb26a2…`, calibration 1.4.0), the
roll / hold / lock rules, Legend Rival, era effects, coach effects and every
server route are byte-identical to the parent. The API is still 12 routes and
the middleware. This phase is presentation, sequencing and disclosure.

## The continuity principle

The roster is one mounted `ChaosStage`. The ten cards a player deals on roll 1
are the same DOM nodes at the box score. Nothing navigates; the stage sets
`data-guided-state` and `data-roster` and the CSS and the contextual rail follow:

```
EMPTY ─ROLL─▶ DRAFTING ─ROLL 2─▶ ERA_REVEAL ─ADAPT─▶ DRAFTING ─FINAL ROLL─▶
COACH_SELECT ─CONTINUE WITH COACH─▶ READY ─RUN CLASH─▶ RESULT
```

The five you built persists into Coach Chaos (compressed, HOLD gone), compresses
further into Clash Ready under the two staff lines, and is the matchup the
result reports on, framed to the same width as the score above it.

## The six states, against their references

| State | Reference | What the build shows |
| --- | --- | --- |
| 1 Foundation | UI1 | Empty frame: ten deliberate card backs, `CHAOS CLASH` title, one Gold **ROLL** (sub `ROLL 1 OF 3`), a five-step HOW CHAOS WORKS guide in the rail, LAST CLASH if there is one. No Coach Chaos, no Result Dock, no era, no Draft Pressure. |
| 2 Drafting / Hold | UI2 | Ten cards, HOLD on the five you control (LOCKED with a lock glyph and `aria-pressed` when held; KEPT ribbons after a re-roll), one **ROLL 2** / **FINAL ROLL**, Live Intel compact with four single-line reads and VIEW DETAILS, Draft Pressure once. The era is hidden until Roll 2. |
| 3 Era Reveal | UI3 | A dedicated state: `ERA REVEALED`, the era's name at 56px, three headline rule cards built from the run's own facts (full fact on hover and for screen readers), the board dimmed beneath, one **ADAPT TO ERA** (sub `FINAL ROLL NEXT`), the era panel in the rail with CHANGE ERA where the account allows it. |
| 4 Coach Chaos | UI4 | Three coaching offers as the hero under `COACH CHAOS`, the finished five compressed above them, a compact era chip, YOUR FIVE, READ in the rail, **CONTINUE WITH COACH** enabled once an offer is picked. No staff line until a decision exists. |
| 5 Clash Ready | UI5 | Both fives compressed with Gold's hire and Blue's coach as staff lines, the era chip, MATCHUP INTEL in the rail, one Gold **RUN CLASH** (sub `LET HISTORY DECIDE`). The three offers no longer compete with the action. |
| 6 Result | UI6 | The score leads in the stage head — final, `TEAM GOLD WINS` / `TEAM BLUE WINS`, MVP with a stat line — above the matchup that produced it, then the result hero: story open, box score, coaching and analysis on tabs, FULL REPORT, RUN IT BACK, NEW CLASH, challenge. No rail. |

## Run Clash

RUN CLASH is the only action in Clash Ready. On press, the stage head keeps the
result's box reserved (no numbers, `LET HISTORY DECIDE`, `SIMULATING…`), both
staff lines and the actions row hold their place, and the hero reserves the
height of a typical story — so nothing on the board moves when the final lands
(measured layout shift on arrival: under 0.01). The hero shows one honest
`SIMULATING THE CLASH`; the live region announces the score when it exists.
Nothing predicts a winner before the game exists, and there is no invented
progress figure.

## What was removed, and where it went

- **The persistent Result Dock beside an active draft.** A previous game is a
  compact LAST CLASH control in the rail (score and how long ago) that opens a
  sheet with the full previous result and a way back to the draft. It is
  available in every state except the result itself, and — new in this phase —
  it survives a reload: the finished game is kept in this browser
  (`ec_prior_result`) the moment its result exists.
- **Coach Chaos during drafting.** The coaching block renders only when the
  server says `coachDraft.selecting`; until then it does not exist.
- **Draft Pressure in two places.** It is one line in Live Intel while drafting.
- **The era section inside Live Intel while rolling.** The era has its own state.
- **Staff HOLD controls on offers.** Coach Chaos presents three offers and one
  choice, as the reference does. The server still supports coach holds through
  `coachHolds`; the flow no longer surfaces them. This is the one owner-visible
  trade-off of the phase (ledger item `staff holds not surfaced`).

## Files

- `src/components/arena/guidedState.js` — the resolver, the primary action per
  state, the contextual panel per state, announcements, the event vocabulary.
- `src/components/arena/ChaosStage.jsx` — the one stage, six presentations.
- `src/components/arena/EraRevealPanel.jsx` — state 3.
- `src/components/arena/TimeArena.jsx` — state resolution, telemetry once per
  transition, the contextual rail, the LAST CLASH sheet, the result hero.
- `src/components/arena/LiveIntel.jsx` — `compact` and `panel` modes.
- `src/components/arena/ResultDock.jsx` — `variant="hero"`.
- `src/components/arena/UtilityBar.jsx` — `showEra`.
- `src/index.css` — the "PHASE 9B.3" section, scoped by `data-guided-state` /
  `data-roster` so the frozen 8C.1 fixture geometry is untouched.
- `api/events.js`, `src/activation.js` — eleven guided-flow events (allowlist 113).

Documents: `chaos-clash-state-machine.md`, `chaos-progressive-disclosure.md`.

## Accessibility

One polite live region announces every state from real values. Focus follows
the decision: the primary action when it can be taken, the first offer's Select
in Coach Chaos, and no focus grab at the reveal or the result. Holds and
selections carry `aria-pressed` and words, never colour alone. Progress is a
semantic list; the phone's team switch is a tablist. Body text meets 4.5:1 and
large text 3:1 on the Night Court palette; phone controls are 44px. Reduced
motion removes the reveal, deal and fracture animations.

## Gates

`chaos:guided-flow-qa` (six states × five viewports → per-state artifacts,
responsive, disclosure), `chaos:state-machine-qa` (the resume matrix),
`chaos:era-reveal-qa`, `chaos:coach-flow-qa`, `chaos:result-flow-qa`,
`chaos:accessibility-qa`, `chaos:performance-qa`, `chaos:contact-sheets`,
`chaos:deployed-qa <origin>` (the same drive on the protected preview plus a
bundle scan), `chaos:9b3-summary`. Unit: `tests/v9b3-guided-flow.test.js`.
End-to-end: `e2e/phase8c-time-arena.spec.js`, and the older
`phase8a-chaos`, `phase9a-play-lobby` and `phase9a3p-lobby-polish` specs, whose
presentation-level steps (labels, where Coach Chaos appears, where the result
lands) were moved to the guided-flow contract; what they assert about the game
is unchanged.
Repository gate: `ui:time-arena-qa` reads the resolver's labels.

## Owner test

On the durable branch preview, one Clash from the empty frame to the result,
then a refresh at each stop and Continue from the lobby. Acceptance:
`APPROVE CHAOS CLASH GUIDED FLOW V2` or `REVISE: [precise changes]`.
