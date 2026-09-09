# Play Lobby Polish V1 (Phase 9A.3P)

The approved Phase 9A Play Lobby, refined without redesign. Same architecture:
three primary cards, a quieter row of four, the Continue card above the grid when
a run is waiting, Night Court V1 (obsidian brand shell, ivory lobby canvas), one
Era Fracture moment under the brand band, and every card read from the ONE
navigation registry (`src/navigation.js`, version 1.2.0).

## What changed

1. **League marks.** The header's only image is EraClash Logo Mk1
   (`public/brand/eraclash-logo-mk1.png`, SHA-256 in
   `data/validation/9a2/logo-mk1-manifest.json`) with its BASKETBALL descriptor.
   No league-owned visual mark renders in the header, the lobby or the global
   shell; a test and a runtime gate scan every rendered `img`, `alt`,
   `aria-label` and `background-image` for one. Nothing was added to fill space.
   Historical league data in player, team and statistical records is untouched.
2. **CTA hierarchy.** Exactly one filled-Gold action on the lobby: Chaos Clash.
   The registry declares each mode's `actionHierarchy`; the lobby renders it as
   `data-hierarchy` on the action (`primary` · `secondary` · `unavailable`).
3. **Action language.** Buttons say what happens next; badges say what a mode
   needs. Labels live in the registry (`actionLabel`) and are shown as capitals:

   | Mode | Action | Hierarchy | Badge (guest) |
   | --- | --- | --- | --- |
   | Chaos Clash | START CHAOS CLASH | primary | — (Recommended) |
   | Dream Matchup | BUILD MATCHUP | secondary | Free account |
   | Daily Clash | PLAY TODAY’S CLASH | secondary (Cobalt-supported) | — |
   | Best of 7 | START SERIES | secondary | Free account |
   | Win 82 | START SEASON | secondary | Free account |
   | Tournament | ENTER TOURNAMENT | secondary | Free account |
   | Era Gauntlet | LEARN MORE | unavailable | Coming soon |

   Accessible names carry purpose, mode and access fact:
   "Start Chaos Clash, recommended mode" · "Build Dream Matchup, free account
   required" · "Learn more about Era Gauntlet, coming soon". The status
   fallback map (`ACTION_LABEL`) no longer contains "Open".
4. **Adaptive hero.** Decided once, synchronously, before the first paint, from
   state that already exists — the remembered run (`ec_chaos_run`), the career
   store (`ec_career`, `ec_recent`) and the analytics identity's returning flag
   (`getSession().returning`). No new cookie, storage key, event or API.
   - `full` — first-time state: large Mk1 mark, the product line, the divider.
   - `compact-active-run` — a run is waiting: 150px mark, "Your Chaos Clash is
     waiting…", the Continue card as the top action, grid moved up.
   - `compact-returning` — this device has played or been here: 150px mark,
     "Welcome back. Choose how you want to play."
   The hero never changes while the lobby is open, so the later run lookup
   cannot move the grid (CLS measured < 0.02 in every state).
5. **Mode signatures.** One restrained motif per card, drawn in
   `src/components/lobby/ModeSignature.jsx`; see
   `docs/brand/mode-visual-signatures.md`.

## Button states

| State | Face | Edge | Text | Extra | Hover | Pressed | Focus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Primary | Gold gradient (`--ec-a-cta-*`) | gold line | CTA ink | the lobby's one glow | +4% brightness, 1px lift | no lift | 3px gold outline |
| Secondary | Warm Ivory (`--ec-l-panel-raised`) | 1.5px solid `--ec-l-border-strong` (Cobalt for Daily) | Editorial Ink | arrow in the accent role | soft face, darker edge, 1px lift, shadow | no lift | 3px gold outline |
| Unavailable | transparent | 1.5px dashed | muted ink | no arrow | underline only | — | 3px gold outline |

The three are distinguishable without colour (fill+no arrow · solid+arrow ·
dashed), verified in forced-colours mode. "Learn more" stays a real link because
a real information page exists (`/modes/era-gauntlet`); `aria-disabled` is set
only on a button with no destination. Coming Soon never routes to a checkout.

## Telemetry

No new event. `play_lobby_viewed` (existing, allowlisted) carries two bounded
properties: `hero_state` (`full` | `compact-active-run` | `compact-returning`)
and `lobby_presentation_version` (`play-lobby-polish-v1`). The Wave 2 schemas,
partitions and study constants are byte-identical to the parent.

## Fixtures and gates

- Theme lab: `/dev/basketball-theme-lab?fixture=lobby&hero=<full|compact-returning|compact-active-run>`
  renders each hero state with production components (the active-run state uses
  the frozen ROLL 1 run).
- `npm run ui:play-lobby-polish-qa` · `ui:lobby-mode-registry-qa` (source and registry)
- `npm run ui:lobby-cta-hierarchy` · `ui:lobby-adaptive-hero` · `ui:mode-signature-qa` ·
  `ui:lobby-polish-responsive` · `ui:lobby-polish-accessibility` · `ui:lobby-polish-performance`
  (browser, against the local harness on 4177 — the active-run state is a real ROLL 1)
- `npm run ui:lobby-polish-deployed -- https://<branch-preview>` (the deployed preview,
  then the frozen Wave 2, Wave 1 and production reads)
- `tests/v9a3p-play-lobby-polish.test.js`, `e2e/phase9a3p-lobby-polish.spec.js`

Evidence: `data/validation/9a3p/`.

## Not changed

Layout and geometry of the cards, the mode hierarchy, routes, entitlements,
availability, feature flags, the Time Arena, Chaos Clash, Dream Matchup, the
Result Dock, Postgame, Night Court V1 tokens, the Era Fracture system, the
navigation architecture, every API route, Wave 1, the stable Wave 2 build, and
production.
