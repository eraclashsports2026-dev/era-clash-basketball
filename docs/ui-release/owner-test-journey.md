# Unified Light UI release candidate — owner test journey

Preview: `__PREVIEW_ALIAS__` (durable, protected branch alias; owner access key as before).
Candidate: branch `ui/light-court-release-candidate` @ `__RC_COMMIT__`, stacked on the verified 9F head `aae565c`.

What changed, in one line each: the game surfaces now read on the Light Court
(ivory canvas, ink text, gold CTA) through the shared theme tokens; the dark
global navigation is unchanged; a Chaos result offers only the governed
Challenge (the legacy "Challenge a Friend" roster link is withdrawn on Chaos
results); rail links, coach scouting toggles and result tabs are 44px targets.

## Journeys (say which letter, and REVISE: with what you saw)

- **A — Home.** Open the preview. Home should look as before: ivory canvas, obsidian header, Mk1 logo, one gold START CHAOS CLASH. Nothing else should have moved.
- **B — Chaos, six states.** Play one Clash end to end: ROLL → hold one → ROLL 2 → era reveal → ADAPT → FINAL ROLL → coach → CONTINUE → RUN CLASH. Every state should be light with a dark header; player portrait wells stay dark; the gold CTA has dark ink.
- **C — Result hierarchy.** On the result: basketball result first, then (if this was a Challenge attempt) the comparison, then rating movement, then Career XP. Open VIEW FULL REPORT; tabs should be comfortable to tap.
- **D — Run It Back.** From the result, Run it back: same five, staff and era, new seed.
- **E — Challenge (creator).** On a Chaos result, use CHALLENGE → COPY LINK. The link must be `/?challenge=EC-XXXX-XXXX`. There should be NO "Challenge a Friend" button on a Chaos result.
- **F — Challenge (recipient).** Open the copied link in a private window (guest) and signed in. You must land in the Chaos flow with the same opening rolls, never in a roster builder or another mode.
- **G — Daily and Dream/Best 7 unchanged.** Daily still reads light; on a Dream Matchup result, "Challenge a Friend" still exists (legacy modes keep it).
- **H — Browser update.** With the preview open in a tab from before this release, reload once; the new build should be picked up without a manual cache clear (service worker cache identity is build-derived).

Also worth a glance on a phone (390×844 or your own): no horizontal scrolling on any state; controls easy to hit.

## Your two answers
- `APPROVE UI — PREPARE FINAL DOMAIN PROMOTION`
- `REVISE: <what you saw, which journey letter, which device>`
