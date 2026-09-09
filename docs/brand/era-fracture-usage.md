# Era Fracture — usage

The Era Fracture is **a diagonal collision between Fracture Gold and Fracture Cobalt**: one geometry
(112°, gold to 46%, a 2% bright seam), reused everywhere it appears.

```css
linear-gradient(112deg, #E1A72C 0%, #E1A72C 44%, #F7E6B8 46%, #FFFFFF 47%, #9CC2F5 48%, #267CE8 50%, #267CE8 100%)
```

It is **not** random marble cracks, kintsugi on every card, lightning around every panel, a universal border or a
repeated decorative pattern.

## Primitives (`src/components/brand/EraFracture.jsx`)

| Primitive | What it draws | Footprint |
|---|---|---|
| `EraFractureDivider` | a 2px rule carrying the divide | 2px tall |
| `EraFractureActiveEdge` | a 2px bar along the top of a selected panel, fades in | absolute, none |
| `EraFractureTransition` | one diagonal sweep of light across a stage (900ms, once); `hold` keeps it lit while the game simulates | absolute, none |
| `EraFractureWatermark` | a 5% diagonal wash for the share/result graphic | absolute, none |

CSS state hooks paint the same divide on selected states (`--ec-a-fracture`), gated by `--ec-a-fracture-on`
(1 on the production theme, 0 on the four historical candidates), so every theme renders the same DOM.

## Approved placements — and whether each paints

| # | Placement | Hook | Verified |
|---|---|---|---|
| 1 | main arena divide | `.ec-ta-roster-divider { background: var(--ec-a-fracture) }` | yes |
| 2 | selected navigation | `.ec-brand-header .ec-nav-item[aria-current="page"]::after, [data-active="true"]::after` | yes |
| 3 | roll transition (at rest) | `<EraFractureTransition kind="roll" token={run.roll}>` | yes |
| 4 | era reveal | `.ec-intel-era[data-revealed="true"]::before` | yes |
| 5 | selected player-card edge | `.ec-pc[data-held="true"]::before` | yes |
| 6 | selected coach-card edge | `.ec-coach-card[data-on="true"]::before` | yes |
| 7 | simulation transition (held while simulating) | `<EraFractureTransition kind="sim" hold>` | yes |
| 8 | Result Dock state transition | `<EraFractureActiveEdge on={!previous}> on the final-score panel` | yes |
| 9 | share / result graphic | `T.fracture on the VS mark + <EraFractureWatermark> in the result hero` | yes |
| 10 | one lobby brand moment | `<EraFractureDivider className="ec-lobby-fracture"> under the brand band` | yes |

## Forbidden

Every empty card · every paragraph panel · every table row · every coach card simultaneously · random panel corners ·
long-form reading backgrounds · a universal border. Verified: no forbidden placement paints.

## The one-glow rule

| Product state | The one dominant glow |
|---|---|
| Empty arena | the primary Roll CTA |
| Hold (Roll 1–2 decisions) | the held cards (fracture light) |
| Era Reveal | the era panel's fracture edge |
| Hire (Coach Chaos) | the selected staff (violet) |
| Simulating | the central fracture transition |
| Result | the final-score panel's fracture edge |
| Lobby | the recommended flagship card |

## Motion

The sweep runs once per roll (never loops). Under `prefers-reduced-motion: reduce` it does not animate; the
simulating hold shows a static half-strength frame. Nothing flashes.
