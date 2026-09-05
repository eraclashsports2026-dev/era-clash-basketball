# Chaos Clash — progressive disclosure (Phase 9B.3)

The principle: **show what the current decision needs, and nothing that
belongs to a later one.** The previous arena rendered every panel at once —
Coach Chaos offers, a full Result Dock from the last game, Live Intel with the
era section, Draft Pressure in two places — beside a five that was still being
drafted. The guided flow gives each state one job.

## What each state shows and hides

| Surface | EMPTY | DRAFTING | ERA_REVEAL | COACH_SELECT | READY | RESULT |
| --- | --- | --- | --- | --- | --- | --- |
| Board | ten card backs | ten cards, HOLD on Gold | ten cards, dimmed under the era | ten cards, compressed | ten cards, compressed | ten cards, compressed |
| Primary action | ROLL | ROLL 2 / FINAL ROLL | ADAPT TO ERA | CONTINUE WITH COACH | RUN CLASH | — |
| Coach Chaos offers | — | — | — | **three offers, the hero** | — (decision shown as staff lines) | — |
| Staff lines under the fives | — | — | — | — | Gold hire + Blue's coach | both, from the recorded game |
| Era | hidden (`ERA: HIDDEN` in the utility bar is suppressed) | hidden on roll 1 | **the focus**: name, three rule cards, ADAPT | compact chip | compact chip | in the result |
| Contextual rail | HOW CHAOS WORKS (five steps) | Live Intel, compact: four single-line reads + VIEW DETAILS | the era panel: rules, CHANGE ERA where the account allows it | YOUR FIVE, READ | MATCHUP INTEL | — (no rail) |
| Draft Pressure | — | once, inside Live Intel | — | — | — | — |
| Previous result | LAST CLASH control → sheet | LAST CLASH control → sheet | LAST CLASH control → sheet | LAST CLASH control → sheet | LAST CLASH control → sheet | — |
| Result Dock | — | — | — | — | — | **the hero**, below the score-led stage head |

Rules the gates enforce (`chaos:guided-flow-qa` →
`data/validation/9b3/progressive-disclosure-qa.json`):

- Coach Chaos renders zero offer cards until `coachDraft.selecting` is true,
  then exactly three.
- No `.ec-dock` exists in any state before the result. A previous game is one
  tap away through the compact LAST CLASH control and its sheet, which closes
  on Escape, on the scrim, and whenever the state stops permitting it.
- Live Intel is compact while drafting; the era section appears only after
  VIEW DETAILS (`live_intel_expanded`).
- The text DRAFT PRESSURE appears exactly once while drafting.
- The era reveal is a dedicated state, never a badge inside Live Intel while
  the player is also being asked to roll.
- At the result the contextual rail is gone; the story, box score, coaching
  and analysis are the result's own tabs, and the score sits above all of them.

## Continuity: one board, six presentations

The roster is one mounted `ChaosStage`. Its cards are the same DOM nodes from
roll 1 to the box score. From Coach Chaos onward the stage sets
`data-roster="compressed"` and the cards shrink (`--player-card-h`,
`--player-portrait-h`) with HOLD / KEPT controls removed — the five you built
persists under the coaching decision, compresses into Clash Ready, and is the
matchup the result reports on. The result's hero is framed to the board's
width so the score, the story and the fives read as one column.

## Progressive detail inside a state

- **Live Intel** — four reads (positional balance, era fit, strength, draft
  pressure) as single lines; VIEW DETAILS expands to the full read and the
  era section.
- **Era rules** — three headline cards at the reveal, each carrying its full
  fact as a title and for screen readers; VIEW ALL ERA RULES opens the full
  list in the rail (`era_rules_expanded`).
- **Coach cards** — offense identity first; the role blurb behind MORE.
- **Result** — score and winner first; story open by default; box score,
  coaching and analysis on demand; FULL REPORT for the whole thing.

## On a tablet and a phone

Through 1179px every control is a 44px touch target (the rail's links and
chips, the era reveal's VIEW ALL ERA RULES, the coach card's detail toggle, the
result tabs); above it desktop pointer sizes apply. Below 768px the columns
stack, the board shows one team at a time — Gold first, Blue one tap away on a
semantic tablist — and the primary action is sticky so the decision is never
scrolled out of reach. The states are captured at 1536×1024, 1440×900,
1280×800, 1024×1366, 768×1024, 430×932 and 390×844.
