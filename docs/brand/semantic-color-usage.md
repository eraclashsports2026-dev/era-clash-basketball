# Semantic colour usage — EraClash Basketball

Meanings are **permanent**. A theme may adjust a semantic colour's luminance to keep contrast on its own surfaces; it
may never reverse a meaning. Solo play labels: **TEAM GOLD · YOUR FIVE** and **TEAM BLUE · LEGEND RIVAL**.

| Colour | Base | Deep | Text on night panels | Text on ivory | Meaning |
|---|---|---|---|---|---|
| Team Gold | `#E8B13C` | `#8E6416` | `#E8B13C` | `#8A6410` | Team Gold — the user's side in solo play; scores, edges and holds on that side; winning emphasis |
| Team Blue | `#2F83E7` | `#174F94` | `#4A92EA` | `#2461B8` | Team Blue — the opposing side (Legend Rival in solo play); scores, edges and holds on that side |
| Coach / Era Violet | `#7656D7` | `#432A88` | `#A08AE6` | `#5B3FB8` | Coach Chaos, Era intelligence and time mechanics — a third identity, never a team |
| Success | `#2FA96D` | — | `#2FA96D` | `#237A4F` | success and valid states |
| Warning | `#C58B23` | — | — | — | warnings that are not yet errors |
| Danger | `#D95050` | — | `#E06060` | `#B54040` | errors, destructive actions and losses |
| Disabled | context-derived neutral grey | | | | unavailable controls |
| Neutral | Platinum / Graphite | | | | neutral structure and typography |

Why two values: the specification hex is the **base** — used for edges, lights, fills and card tints. As **text** on
the night panels a base like `#2F83E7` measures ~4.4:1, so text-bearing uses are lifted at the same hue
(the same rule the four Phase 9A.1 candidates followed).

## Use / do not use

**Team Gold** — player-card edge, team title, selected/held state, gold score, gold-side result emphasis, gold-side
lighting; the primary action. Never on a Blue card's action.

**Team Blue (Cobalt)** — player-card edge, team title, held state, blue score, blue-side emphasis and lighting; the cool
half of the Era Fracture. Never a decorative border on neutral content.

**Coach / Era Violet** — Coach Chaos heading, coach offer category, selected coach, Era Reveal, era-impact emphasis,
time distortion. Never navigation, body text, a team, a standard error or a universal border. Coach cards stay
graphite with restrained violet.

**Success / Danger** — success and valid states; errors, destructive actions, losses, BIGGEST RISK.

## Verified on the rendered arena (`data/validation/9a2/semantic-color-qa.json`)

- ✓ Team Gold is gold, Team Blue is blue, Coach/Era is violet, success is green, danger is red, warning is amber
- ✓ the specification's semantic hexes are the bases
- ✓ text-bearing blue, violet and red are lifted to AA on the night panels at the same hue
- ✓ platinum/graphite is the neutral structure (arena text is Metallic Platinum, panels are graphite)
- ✓ no orange CTA system: every CTA stop is EraClash gold (hue 36–50°)
- ✓ Blue cards never use Gold action styling (footers and OVR read cobalt, never gold)
- ✓ Gold cards read gold (OVR and held footer)
- ✓ neutral panels carry no decorative cobalt or gold border
- ✓ Coach Chaos heading and coach roles are violet; violet is not used for navigation or body text
- ✓ BIGGEST RISK is red; team labels are gold and cobalt
- ✓ solo labels say YOUR FIVE and LEGEND RIVAL; CPU is not the public opponent identity
- ✓ no league or competitor asset file, hotlink or copied wording in the product
