# Runtime calibration literal audit

**State: MEASURED.** Every registered parameter's runtime literal located by
semantics, not by value.

## Method, and why value-matching would have failed

The obvious approach — find the literal equal to the parameter's default — is
wrong here, and demonstrably so. In `src/v3/possession/context.js` the value
`0.42` appears at four lines with four different meanings:

| Line | Expression | Meaning |
|---|---|---|
| 79 | `0.5 + post * 0.42` | **`shotLocation.postWeight`** |
| 108 | `clamp(3.6 + perim * 0.42, 0, 10)` | free-throw skill prior |
| 114 | `clamp(..., 0.42, 0.93)` | FT% floor |
| 261 | `team.crashGlass * 0.42` | transition vulnerability |

Only one is the parameter. Similar decoys: `1.6` is both
`shotLocation.rimBiasMultiplier` (`game.js:68`) and the `MIDRANGE_CREATOR`
identity bump (`context.js:80`) — *on the same line as another parameter*.
`0.015` is both `conversion.paintBonus` (`game.js:88`) and the lower bound of the
foul-probability clamp (`game.js:218`), 130 lines apart.

Each parameter was therefore matched against its **documented meaning** and the
enclosing function, and every match recorded in
[`data/calibration/runtime-parameter-map.json`](../../data/calibration/runtime-parameter-map.json)
with the prior literal so a reviewer can check the substitution rather than trust
it.

## Clean substitutions — 11

`shotLocation.rimWeight` · `postWeight` · `midrangeWeight` · `threeWeight` ·
`rimBiasMultiplier` · `perimeterBiasMultiplier` · `conversion.rimBonus` ·
`paintBonus` · `era.paceTempoScale` · `era.threeAnchorMax` ·
`era.freeThrowTripRate`

## Substitutions needing care — 2

**`era.paceBoundFraction`** is one parameter written as **two** literals. The old
code held `basePace * 0.86` and `basePace * 1.14` — that is `1 − 0.14` and
`1 + 0.14`. Both had to move together; replacing only one would have made the
band asymmetric.

**`conversion.midrangePenalty`** is stored **negative** (`−0.055`) while the code
read `fg - 0.055`. The wiring is `fg + parameter`. Substituting into the existing
minus would have double-negated it, turning a 5.5-point penalty into a bonus.

## Registry defaults that were WRONG — 5

The audit's most consequential finding. Wiring these as declared would have
**changed behaviour**, not preserved it.

| Registry claimed | Engine actually ran | Resolution |
|---|---|---|
| `adjustmentCooldown` = 12 | **30** offensive, **34** defensive | split per engine, corrected |
| `adjustmentThreshold` = 3 | **6** offensive, **5** defensive | split per engine, corrected |
| `adjustmentMagnitude` = 0.05 | **0.06** | corrected |

The cooldown is the sharpest case. `src/v3/defense/liveState.js` documents in
comments that **12 was deliberately abandoned**: at 12 the engine produced ~3.3
assignment changes per game, *"which is not how coaches behave."* Wiring the
declared value would have silently reverted a measured, deliberate fix and
roughly tripled adjustment frequency.

One registry entry also cannot represent two engines whose values were tuned
independently, so each was split against the engine it governs.

**This is not tuning.** The runtime is the truth about current default behaviour;
a registry that disagrees with it is a registry that breaks parity the moment it
is wired. Each correction records `correctedFrom` and a `correctionReason` on the
entry.

## Entries with no legitimate 1:1 consumer — 2

Reclassified `DERIVED_PARAMETER` rather than given a fake consumer.

**`zone.selectionFrequency` (0.55)** — zone usage is the product of a *binary*
per-game gate (`defense/plan.js:102`, `scheme.zoneUsage >= 5`, so a coach plays
zone all game or never) and a per-possession attack share
(`possession/actions.js:72`). The 0.55 is the measured emergent product, i.e. an
outcome. Wiring it to either literal would misrepresent it; making shell
selection probabilistic would change default behaviour, which this phase forbids.

**`zone.offensiveReboundExposure` (0.073)** — a target **metric** registered as a
parameter. The real coefficients are five per-shell `reboundExposure` values in
`defense/zone.js` (0.10 to 0.26, mean ~0.184 before the rim-ceiling offset), and
0.073 is the ORB delta they produce. A genuine lever would be a scalar over those
five, which is a different parameter with a different default.

## Identity multipliers that did not exist — 4

Four parameters defaulted to exactly `1.0` and had **no consumer at all**,
because multiplying by 1 is a no-op nobody had written.

| Parameter | Wired as |
|---|---|
| `zone.highPostVulnerability` | scalar on the high-post gap value in `attackZone` |
| `zone.cornerVulnerability` | scalar on the corner gap value in `attackZone` |
| `coach.actionMixInfluence` | scalar on the coach-preference term of six family weights |
| `coach.rosterSensitivity` | scalar on the roster-response term of six family weights |

These are real wiring, not fake consumers: the mechanic exists in code as
per-shell tables and per-family coefficients, and the scalar says how far it may
be exploited. At the default `1.0` each is an exact no-op, which is what keeps
parity — multiplying by `1.0` is exact in IEEE 754.

The zone scalars are applied at **all three** sites that read a gap value — the
selection weight, the rotation-closure probability and the reported vulnerability
— because scaling one and not the others would make the weight and the closeout
disagree about the same gap.

## Coefficients deliberately left as literals

Not every number is a tunable. These ride the same mechanics as registered
parameters but have no registry entry, so they stay literals rather than
borrowing a parameter that does not describe them:

- `game.js:69` `PAINT_OR_POST *= 1 + max(0, bias) * 0.5` and `game.js:71`
  `MIDRANGE *= 1 + max(0, -bias) * 0.6` — rim-bias siblings
- `opportunityAllocation.js` late-game SECONDARY multiplier `0.12` and the
  tertiary decay `0.3`
- `context.js:80` `MIDRANGE_CREATOR` identity bump `1.6`
- `context.js` three-anchor lower clamp `0.05`
- `offensivePlan.js:41` `MAX_ADJUSTED_SHARE = 0.42`
- Rule constants: shot clock, regulation periods, three-point legality, zone
  legality, conservation identities — `FIXED_NOT_CALIBRATABLE`, and registering
  them would imply they are open to tuning.
