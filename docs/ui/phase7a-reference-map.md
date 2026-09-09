# Phase 7A — design-reference map

**References used.** Pass 1 worked from the canonical composite board
(panels A–E). Pass 2 added three detailed screens supplied later — the coach
stage, the empty-roster screen, and the full postgame — plus two further
composite boards. Those three drove the visual rebuild recorded below.

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


## Pass 2 — rebuild against the detailed screens

| Concept element | Built as | Data behind it |
|---|---|---|
| Five-across roster cards with position headers, portrait, name split, OVR | `RosterGrid.jsx` (5→3→2→1 columns) | real cards, `displayOVR`, per-slot fit |
| Chemistry in the panel header | `TeamShell` chemistry props | real `chemistryScore` / label |
| Daily Clash card with countdown | `PlayPanels.DailyClashCard` | real time to the next UTC rollover |
| Ball IQ toggle switch | `PlayPanels.BallIqCard` | existing Ball IQ feature |
| Mode tabs on the play screen | App mode tablist (+ header Play menu) | real `GAME_MODES` |
| Matchup preview as an icon grid | `PlayPanels.MatchupGrid` | server qualitative edges + key clash |
| Feature strip | `PlayPanels.FeatureStrip` | counted card library; "POSSESSION SIMULATION", not "AI GAME SIMULATION" |
| Coach rows with portrait, tags, FIT badge, selection dot | `CoachSelect` restyle | real recommendation angles, systemTags, fit labels |
| Postgame two-column Final | `pg-final-grid` | MVP + moments beside possession context + breakdown + by-period |
| KEY MOMENTS with period labels | `PostgamePanels.KeyMoments` + `api/_lib/previewKeyMoments.js` | derived from the real possession ledger |
| BY PERIOD table | `PostgamePanels.PeriodScores` | engine `periodScores` (sums to the final score, asserted) |
| Circular CHEMISTRY SCORE dial | `PostgamePanels.ChemistryDial` | real chemistry score, with a text alternative |

### Deliberately not built

| Concept element | Why |
|---|---|
| `63%` loading progress | The engine reports no completion fraction. The loading screen shows real lifecycle phases; the only progress bar is the genuine Win-82/Tournament game count. |
| "AI GAME SIMULATION" in the feature strip | AI writes recaps; it does not decide games. Replaced with "POSSESSION SIMULATION". |
| Player and coach photographs | No approved likeness assets exist (`approved.json` is empty). Cards and coach rows use branded fallbacks sized for real art to drop in. |
| Key moments with a `5:12` game clock | The engine records periods and possessions, not a wall clock. Moments are labeled Q1–Q4/OT — asserted by test. |
| "VIEW FULL PLAY BY PLAY" | The full ledger is derived then discarded; no play-by-play view exists to link to. |
| Team logos beside the MVP | No approved team-logo assets. |
| Tournament bracket preview panel | Bracket data exists only after a tournament runs; a pre-run bracket would be invented. |
