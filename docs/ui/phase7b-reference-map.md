# Phase 7B — reference map

**References received and used.** All attached images were inspectable: the
hybrid warm-ivory/navy coach-modal mockup, the hybrid four-panel composite
(rosters / modal / ready / postgame), the premium court-centered dark coaches
concept, the dark empty-roster and dark postgame concepts, and two earlier
composite boards. Nothing was missing.

**Hierarchy applied:** written truth requirements → hybrid mockups (theme) →
premium court concept (composition) → current-build screenshots (defect
evidence only) → other boards (loading, MVP hierarchy, mobile).

| Screen | Reference | Implemented | Intentional difference | Truthfulness correction | Accessibility correction |
|---|---|---|---|---|---|
| Global shell | hybrid mockups | `GameHeader` on navy over a warm page | Log In / Create Account not built — no password auth exists | account control states "On this device only" vs "Career saved" | nav is buttons with `aria-current`; AA contrast on navy |
| Roster builder | hybrid + court concept | `RosterGrid` panels flanking `ArenaCentre` | portraits are branded fallbacks — `approved.json` is empty | Chemistry score → `RosterBalance` strengths/tradeoffs; team rating totals removed; FIT only when it flags a role problem | 5→3→2→1 column reflow, no page overflow at 375px |
| Matchup preview | hybrid mockups | `MatchupGrid` (icon grid, arena variant) | — | qualitative labels only; the legacy Daily/Challenge preview lost its win-% and numeric edges too | label text, not colour alone |
| Coach selection | hybrid coach-modal mockup | `CoachPick` + `CoachModal` | coach portraits are monograms — no approved coach art | era fit hidden until an era is locked | focus trap, Escape, listbox/option, labelled search + selects, ≥44px CTA |
| Era Style | premium concept | `EraStage` | — | real rule bullets and per-roster translations; no native-era bonus | radiogroup semantics |
| Ready to run | premium concept | navy tipoff band + one CTA | — | shows the final stored read, no probability | edit controls are real buttons |
| Simulation loading | loading concepts | `SimulationLoading` on the arena inset | no `63%` figure — the engine reports no completion fraction | phase list is bound to the request lifecycle | `role=status`, reduced-motion safe |
| Final | postgame concepts | navy score hero + two-column body | chemistry dial removed | stored pregame read replaces raw edges | tabs, ≥40px targets |
| Box Score | postgame concepts | one `AuthoritativeBox` | PF column omitted | one source of truth; totals reconcile | table scrolls inside its own container |
| Game Story | postgame concepts | deterministic recap + turning point + labelled AI recap | key-moment timestamps omitted — no game clock exists | contradicting recaps are rejected, not caveated | live region for pending/failed states |
| Coaching & Strategy | composite boards | `CoachingStrategy` | no invented adjustments | real plan, scheme, constraints, triggers; duplicate people qualified | two columns → one on narrow screens |

## Deliberately not built

| Concept element | Why |
|---|---|
| `63%` loading progress | the engine reports no completion fraction |
| Win probability / numeric edges | model internals, and they answer the question the sim exists to answer |
| "Unlock bonuses", "AI Game Simulation", "Smart Rating System" | inaccurate claims about what drives the result |
| Player and coach photographs | no approved likeness assets exist; nothing is generated or scraped |
| Key moments with a `5:12` clock | the engine records periods and possessions, not a wall clock |
| PF column | fouls are recorded but carry no foul-out, substitution or rotation consequence |
| Log In / Create Account | there is no password authentication to sign into |
| Best of 7 on a Candidate 3 result | the series would run on a different engine |
