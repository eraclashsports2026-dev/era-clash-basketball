# Mode visual signatures

Seven original EraClash motifs, one per game mode, in one shared grammar. They
sit behind a card's top-right corner at a few percent opacity so a mode card
feels like a sports-game experience rather than a software card — without
becoming an illustration, a second brand, or clutter.

## The grammar

- Thin linework: 1.5px strokes, round caps and joins (one 2.6px emphasis stroke
  for the season progression).
- `currentColor`, tinted by the card's accent role through the theme's own
  tokens — never a new palette.
- One 120×120 viewBox; no fills heavier than a dot; no text; no imagery.
- Opacity 0.07 at rest, 0.12 on card hover (one restrained transition; none
  under `prefers-reduced-motion`).
- Positioned absolutely, clipped by the card (`overflow: hidden`), behind the
  content (`pointer-events: none`).
- Decorative: `aria-hidden="true"`, `focusable="false"`. Every card still names
  its mode and its action in words.
- Drawn locally in `src/components/lobby/ModeSignature.jsx`; ids declared in
  `src/components/lobby/signatureIds.js`; chosen by the registry's
  `visualSignature`. No downloaded imagery, no competitor iconography, no
  league mark.

## The seven

| Mode | Signature id | Visual idea | Accent role | Motif tint |
| --- | --- | --- | --- | --- |
| Chaos Clash | `fracture-dice` | a die caught mid-turn, the Era Fracture through it, possibilities branching | gold | `--ec-l-glyph` |
| Dream Matchup | `crossing-timelines` | two historical timelines crossing at one point | platinum-cobalt | `--ec-l-text-secondary`, cobalt arrow |
| Daily Clash | `spotlight-calendar` | a calendar leaf under a single spotlight, today pulsing | cobalt | `--ec-l-glyph-cool` |
| Best of 7 | `series-ticks` | seven series ticks, four won | platinum-gold | `--ec-l-text-secondary`, gold accent |
| Win 82 | `season-arc` | the season arc, an 82-game track to the finish | cobalt-platinum | `--ec-l-glyph-cool`, graphite accent |
| Tournament | `bracket` | bracket geometry converging on one | gold-platinum | `--ec-l-glyph`, graphite accent |
| Era Gauntlet | `era-steps` | ascending era steps, a timeline climbing | violet | `--ec-l-glyph-era` |

"Platinum" on the ivory lobby canvas is rendered as Editorial graphite
(`--ec-l-text-secondary`), since metallic platinum has no contrast on ivory;
on the obsidian shell the same role is the Mk1 mark's platinum face.

## Accent slots

Each card exposes two colour slots from its accent role:
`--ec-sig-color` (the motif) and `--ec-acc-color` (the secondary action's arrow
and, on the quieter row, a 2px inset accent under the glyph tile). Semantic
families only: gold, cobalt, violet, graphite-as-platinum.

## Rules

- One motif per card. Never two, never on the Continue card, never on the hero.
- No motif may carry meaning on its own; remove it and the card still reads.
- Maximum decorative opacity 10% at rest.
- No player portraits, screenshots, league marks or competitor assets.
