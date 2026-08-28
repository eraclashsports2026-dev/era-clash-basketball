# Phase 7A — design-reference map

**Inspectable reference:** the canonical concept sheet (ERAclashUI5 board: panels
A–E) attached to the phase brief. The five auxiliary files named by the brief
(`ERACLashbasketballUImk3.png`, `ERAClashUI7.png`, `EraCLashUI6.png`,
`ERACLASHUI2.png`, `ERACLASHUI.png`) do not exist on this machine; their
screens (coach detail, loading, staged Postgame, Postgame density, empty
rosters) were built from the canonical sheet plus the brief's written
specifications for each. Recorded as an intentional limitation.

| Screen state | Primary reference | Implementation | Intentional differences / omissions |
|---|---|---|---|
| Global shell + nav | Panel A | `GameHeader.jsx` | Log In / Sign Up replaced by the real account affordance (Save Career / profile) — no fake auth |
| Play dropdown | Panel B | `GameHeader.jsx` menu | Mode copy from `GAME_MODES`; "How Modes Work" is a real modal with truthful engine language |
| Roster builder (complete) | Panel A | stage 1 (`TeamShell`/`FilledSlot`) | OVR/chemistry are the existing draft guides; portraits are the approved PlayerImage set (initial fallbacks) |
| Roster builder (empty) | Panel A + brief (UI.png spec) | `EmptySlot` add-player rows, Manual/Chaos/Random controls | Ball IQ retained (existing feature); Daily promo links the real Daily route |
| Matchup preview | Panels A/E | `MatchupPreview.jsx` V3 path | Qualitative leads only (server maps the model's own nearly-even bound); no probabilities pre-sim |
| Coach selection | Panel C + brief (mk3 spec) | stage 2 + `CoachSelect.jsx` | Coach art = initials chips (no approved coach portraits exist — no likeness invented); descriptions are real systemTags/bestWith/concern |
| Era Style | Panel D | `EraStage` (StageViews.jsx) | Era bullets/notes are real `styleSummary` + `eraInteraction`; no native-era bonus implied |
| Ready to run | Panel E | READY block | Edit-stage controls added (back navigation requirement) |
| Simulation loading | brief (UI7/UI6 spec) | `SimulationLoading.jsx` | Phase checklist bound to REAL request lifecycle; no fake percentages; tip is UI copy |
| Final / Postgame | brief (UI7/UI6/UI2 spec) | `Postgame.jsx` tabs | Sample scores/MVPs never copied; every value from the stored result; key moments limited to the real turning point + engine adjustments (no invented timeline) |
