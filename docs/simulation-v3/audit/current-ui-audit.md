# Current UI audit — what the interface shows vs what is real

`src/App.jsx` is a **1,236-line god component**. 16 components live in
`src/components/`.

## Surface-by-surface honesty check

| Surface | Component | Backed by the engine? |
| --- | --- | --- |
| Team slots / draft | `TeamSlots.jsx`, `ManualPicker.jsx` | Yes — real cards |
| **Chemistry meter** | `ChemistryMeter.jsx` | **No.** `chemistryScore` has zero engine consumers |
| Coach select | `CoachSelect.jsx` | Yes |
| Era style select | `EraStyleSelect.jsx` | Yes |
| Matchup preview | `MatchupPreview.jsx` | Partly — V2 `categoryScores` edges, not the V3 loop |
| Postgame | `Postgame.jsx` | Yes for box score / MVP; chemistry block is decorative |
| Player OVR | `rating.js` `displayOVR` | Yes for draft guidance, **absent from V3** |
| Narrative | `api/narrative.js` | Presentation only — explains a finished result |

## The two real problems

1. **The Chemistry meter is the product's most prominent lie.** It is displayed
   during team building and again in Postgame, and it changes nothing. Users
   reasonably read a prominent meter as an input to the result.

2. **OVR and DNA disagree about what "good" means.** `displayOVR` is a
   percentile over the pool, driven heavily by accolades; the V3 engine consumes
   DNA capabilities and never sees OVR. The two can diverge sharply — Larry
   Nance's Phase 2B accolade correction moved his OVR 70→75 without changing a
   single basketball capability.

## Structural risk

`App.jsx` at 1,236 lines is the single biggest obstacle to shipping any new V3
surface safely. Splitting it is a prerequisite for the Coach/Matchup UI work,
not a cosmetic refactor.

## Out of scope

No UI change was made in Phase 2B or Phase 3. Team Intelligence is hidden by
design: no Team Identity Score, Spacing Score, or Team IQ is exposed.
