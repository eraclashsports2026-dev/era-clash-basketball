# Defensive schemes and era legality

A scheme is what a coach **intends**, filtered by what the era **permits** and what the personnel can
**execute**. Every dimension is `min(intent, era cap, personnel ceiling)`, and each capped dimension
records what limited it — so "why isn't this team switching" always has an answer.

## Era legality, from sourced rule facts

Derived from the existing `zoneLegal`, `illegalDefenseRestrictions`, `defensiveThreeSeconds` and
`handCheckAllowed` facts. **No historical rule is invented.**

| Era | Shell | Zone cap | Help cap | Unavailable help roles |
|---|---|---|---|---|
| 1950s–1990s | `MAN_ILLEGAL_DEFENSE` | **0** | 4.5 | `NAIL_HELPER`, `WEAK_SIDE_ROTATION` |
| 2000s–2020s | `ZONE_MIXED` / `MODERN_MAN_HELP` | 8 | 10 | — |

Environments: `MAN_ORIENTED_ILLEGAL_DEFENSE`, `MAN_WITH_RESTRICTED_HELP`, `MODERN_MAN_HELP`,
`ZONE_CAPABLE`, `SWITCH_CAPABLE`, `DROP_CAPABLE`, `PRESSURE_CAPABLE`.

Switching and dropping existed in every era — they are man-defence techniques. What changes is how much
pre-rotation and off-ball loading is legal around them, which is why `maxPreRotation` drops to 2.5
under illegal-defense guidelines.

**Caps, never bonuses.** The era limits which structures exist; it never makes a defender better. A
test asserts the same five players produce identical capabilities in 1990 and 2010 while producing a
different `shellType`.

## Personnel ceiling

```
switchCeiling    collective, from the mean switchability and how many defenders can actually switch
helpCeiling      mean help defence
pressureCeiling  point-of-attack and speed
rimCeiling       best rim protector on the floor
```

`switchCeiling` is deliberately **collective**: a lineup switches only as well as its weakest link in
the switch, so one player's rating is never enough. A size-heavy lineup under Steve Kerr is capped by
`PERSONNEL`, not by his preference.

## Coach toolkit

Read from Coach Intelligence's documented tendencies: `manPreference`, `zonePreference`, `switching`,
`dropCoverage`, `pressure`, `helpAggression`, `rimPriority`, `reboundPriority`, plus `adaptability`,
`tacticalAdjustment` and `roleDiscipline`.

Coach Intelligence **renames** the raw fields (`pickAndRoll` not `pnr`, `defensiveReboundingPriority`
not `defRebPriority`), and reading the raw names silently returned the default 5 for every coach. The
toolkit accepts either shape before defaulting, so a rename cannot quietly neutralise a coach again.

Nick Nurse plays zone where it is legal; Phil Jackson does not. Verified by test.

## Scheme plan

```
shellType · environments · ballScreenCoverage · switchingFrequency · helpAggression
zoneUsage · pressureLevel · paintPriority · perimeterPriority · doubleTeamAggression
reboundingPriority · transitionDefensePriority · crossMatchPolicy · weakDefenderHidePolicy
legality · toolkit · personnelCeiling · constraints · confidence
```

`paintPriority` and `perimeterPriority` respond to the **opponent's** threats, which is what makes this
a plan rather than a template. `crossMatchPolicy` is `CONSERVATIVE` for a high role-discipline coach,
`AGGRESSIVE` for a highly adaptable one, `SELECTIVE` otherwise — cross-matching is a policy, not a
licence for arbitrary swapping.

## Help responsibilities

Separate from the primary assignment: `NAIL_HELPER`, `LOW_MAN`, `RIM_HELPER`, `STRONG_SIDE_DENY`,
`WEAK_SIDE_ROTATION`, `REBOUND_FINISHER`, `SCRAMBLE_RECOVERY`.

Which roles **exist** is decided by era legality. Under illegal-defense guidelines, off-ball defenders
may not stand in non-assignment help positions, so `NAIL_HELPER` and `WEAK_SIDE_ROTATION` are
**removed from the vocabulary** rather than applied at reduced strength. `STRONG_SIDE_DENY` appears
only when the scheme's pressure level is 6 or higher.

## Ball-screen coverage

Chosen per screen against **this** handler and **this** screener, defended by the **actual assigned**
defenders. Nine coverages, each with a stated concession:

| Coverage | Concedes |
|---|---|
| `DROP` | pull-up jumper |
| `SWITCH` | post or speed mismatch |
| `HEDGE` | the roll behind the hedge |
| `BLITZ` | short roll and weak-side 4-on-3 |
| `ICE` | the baseline drive |
| `UNDER` | the jumper |
| `OVER` | the drive if beaten |
| `LATE_SWITCH` | the split-second before the switch |
| `HELP_AND_RECOVER` | the weak-side spot-up |

`SWITCH` is unavailable when the pair cannot switch. `BLITZ` is unavailable under illegal-defense
guidelines unless the scheme carries real double-team aggression, and is scored down by 2.2 there.
The chosen coverage is passed to the action library as `forceCoverage` — without that the library
picked its own and the plan was decoration.

Measured coverage diversity over 40 games: **4 distinct** coverages (`OVER`, `DROP`, `SWITCH`,
`HEDGE`). Going under is never selected against an elite pull-up shooter.

There is **no flat coverage bonus**. Grep-enforced against `eraBonus`, `defenceBonus`, `coachBonus`,
`switchBonus`.
