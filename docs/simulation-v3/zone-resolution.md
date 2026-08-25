# Zone resolution

`zoneResolutionVersion` **1.0.0**, DEVELOPMENT, behind `ZONE_RESOLUTION_ENABLED` (default false).

## What changed

Phase 6B1 shipped `ZONE_MIXED` as a scheme **label**. It capped help aggression and pre-rotation —
a real constraint — but every possession still resolved through ordinary man code with five primary
assignments. That was documented as a limitation; this replaces it.

A zone does not assign five men to five men. It assigns **areas**, and the offence attacks the seams.
So a zone possession has **no primary defender**: the ledger records `primaryDefenderId: null` and
`assignmentState: "ZONE_AREA"`, which is the honest difference. A test asserts every zone possession
across 30 games does exactly that.

## Shells

Three base plus two evidence-gated specials — bounded on purpose, not every zone in history.

| Shell | Protects | Concedes | Rebound exposure |
|---|---|---|---|
| **2-3** | rim, low blocks, top | high post, corners, short corners | 0.14 |
| **3-2** | top, wings, high post | low blocks, corners, baseline, rim | 0.20 |
| **MATCHUP** | balanced | breaks down under fast ball movement | 0.10 |
| **BOX_AND_ONE** | one dominant creator | everyone else, corners, the glass | 0.22 |
| **TRIANGLE_AND_TWO** | two dominant scorers | the other three, corners, the glass | 0.26 |

Every shell states what it gives up, because a zone is a **trade**, not a bonus.

## Gating

Three gates, in order of authority:

1. **Era.** `zoneLegal: false` returns `available: []` with `reason: "ERA_ILLEGAL"`. A coach with
   `zonePreference: 10` and adaptability 10 in the 1990s plays **man**. Verified across five eras.
2. **Personnel and coach.** Each shell declares requirements — the matchup zone needs communication
   ≥6.5, switchability ≥6, help ≥6 **and** coach adaptability ≥7, the highest bar in the module, so
   it cannot be a default. Failures return `PERSONNEL_OR_COACH` with the requirement.
3. **Opponent.** `BOX_AND_ONE` requires **exactly one** dominant creator; `TRIANGLE_AND_TWO` exactly
   two. Otherwise `OPPONENT_NOT_APPLICABLE` — a box-and-one against a balanced five is a gift.

Shell choice protects what the opponent is best at and concedes what they are worst at. A
zone-preferring coach gets a zone **more often**, never a **better** one. There is no zone-coach bonus.

## Shell state

```
{ shellType, label, areas, protects, concedes, defenderResponsibilities,
  primaryThreatTracker, rotationRules: { quality, communication, closeoutSpeed },
  gapVulnerabilities, reboundResponsibilities, pressurePoints,
  coachToolkitSource, eraLegality, confidence, zoneResolutionVersion }
```

Areas are assigned by capability in a canonical order (rim to the best protector, top to the best
point-of-attack), so the shell is deterministic — asserted byte-identical across rebuilds.

`primaryThreatTracker` is populated **only** for hybrid and special shells: 5 entries for a matchup
zone, 1 for box-and-one, 2 for triangle-and-two, and **0** for a pure area shell. Pretending a 2-3
tracks men is what the old label did.

## Possession resolution

`attackZone()` picks the gap by vulnerability × the offence's ability to use it, then rolls whether
the rotation arrived. Eight gaps: `HIGH_POST`, `CORNER`, `SHORT_CORNER`, `SKIP_PASS`, `BASELINE`,
`LOW_POST`, `ZONE_OVERLOAD`, `TOP`.

The gap decides **who shoots** — a high-post entry goes to a passer/post threat, a corner to a
shooter, a baseline to a cutter — which is what makes the shell matter. An open gap the rotation did
not close is a good look; a closed one is not.

Outcomes feed the **same** event system: shot, turnover, foul, rebound, assist, steal, block. There
is no separate non-conserving box-score path, and 120 zone-heavy games produce zero invariant
violations.

Measured over 80 games (matchup zone): `ZONE_OVERLOAD` 1188 · `SKIP_PASS` 925 · `CORNER` 925 ·
`HIGH_POST` 925 · `BASELINE` 744 · `TOP` 606. Zone team win rate **67.5%** — neither always winning
nor always losing.

## Rebounding

Zone defenders box out an **area**, not a man, so the assignment is ambiguous by construction.
Exposure is a shell property (0.10–0.26) offset by who is actually back there: better interior
personnel lowers it, asserted by test. It is **not** an automatic zone penalty.
