# Mismatch taxonomy

A mismatch is a **named basketball problem with a stated consequence**, not a number. "Severity 7.3"
tells a coach nothing; "SEVERE post mismatch, expect deep catches and foul trouble" tells them what to
do about it.

## Types

| Type | Fires when |
|---|---|
| `SIZE_MISMATCH` | ≥4in height deficit **and** the attacker actually posts |
| `STRENGTH_MISMATCH` | ≥40lb deficit against a post threat |
| `SPEED_MISMATCH` | creation exceeds point-of-attack |
| `POST_MISMATCH` | post scoring exceeds post defence |
| `PULLUP_SHOOTING_MISMATCH` | pull-up shooting exceeds on-ball containment |
| `MOVEMENT_SHOOTING_MISMATCH` | movement shooting exceeds chase ability |
| `SCREEN_NAVIGATION_MISMATCH` | screening + movement exceeds navigation |
| `RIM_PRESSURE_MISMATCH` | rim pressure exceeds interior resistance |
| `SWITCHABILITY_MISMATCH` | low switchability against a screening or moving threat |
| `RIM_PROTECTION_MISMATCH` | a rim protector assigned to a perimeter shooter |
| `REBOUNDING_MISMATCH` | offensive rebounding exceeds defensive rebounding |
| `FOUL_RISK_MISMATCH` | foul pressure exceeds discipline |
| `HELP_DEPENDENCY` | ≥2 major-or-worse problems in one pairing |
| `LOW_USAGE_HIDE_ASSIGNMENT` | an intent, not a problem — a weak defender parked on a low threat |

## Severity bands, not decimals

`MINOR` (gap ≥1) · `MODERATE` (≥1.8) · `MAJOR` (≥3) · `SEVERE` (≥4.5). Below `MINOR` it is not a
mismatch, it is basketball.

Bands rather than decimals because the underlying inputs are **categorical for most historical
players** — `perimeterSkill: "ELITE"`, a documented defensive band, an unverified measurement. A
decimal severity on top of that would be false precision. A test asserts no severity string contains a
digit.

Optimizer costs: MINOR 0.5 · MODERATE 1.6 · MAJOR 4 · SEVERE 9. A hide assignment costs 0 — it is an
intent, not a problem.

## Every mismatch carries

```
{ type, severity, offensivePlayerId, defenderId, evidence, confidence,
  expectedBasketballConsequence }
```

`evidence` cites the numbers that produced it ("7in height deficit against a post threat").
`confidence` is per-pairing — a size claim about two unmeasured players is weaker than the same claim
about two measured ones (`MEASURED` / `POSITIONAL_FALLBACK` / `DERIVED`).

## Only claimed where it matters

Size is only claimed against a threat that punishes size. A 6-inch advantage over a spot-up shooter
who never posts is not a mismatch worth naming, and a test asserts Hakeem-on-Klay produces **no**
`SIZE_MISMATCH` in either direction.

## Worked example — Magic Johnson and Stephen Curry

**Magic guarding Curry:** `SPEED_MISMATCH` SEVERE · `PULLUP_SHOOTING_MISMATCH` SEVERE ·
`MOVEMENT_SHOOTING_MISMATCH` SEVERE (movement 9.5 vs chase 4.3) · `SCREEN_NAVIGATION_MISMATCH` MAJOR ·
`SWITCHABILITY_MISMATCH` MODERATE · `HELP_DEPENDENCY` SEVERE

**Curry guarding Magic:** `SIZE_MISMATCH` SEVERE (7in) · `POST_MISMATCH` SEVERE (post 7 vs defence
1.1) · `RIM_PRESSURE_MISMATCH` SEVERE · `REBOUNDING_MISMATCH` SEVERE (8 vs 3) · `SPEED_MISMATCH`
MODERATE · `PULLUP_SHOOTING_MISMATCH` MODERATE · `HELP_DEPENDENCY` SEVERE

Both directions are problems, derived from the data. **Neither player is hard-coded** — a test greps
the matrix, optimizer and mismatch modules for their card ids and requires zero matches.

## Weak-defender hiding

Requires low usage **and** low creation **and** low post scoring **and** low movement shooting **and**
low spot-up **and** low cutting. Low usage alone is not enough: an elite movement shooter is the worst
possible place to hide a defender who cannot chase, however few touches he gets — the offence does not
need to give him the ball to run you off three screens.

Against an all-threat lineup the plan reports `hidden: []` rather than faking a hiding spot, and the
Magic-on-Klay assignment is honestly labelled `CROSS_MATCH_FOR_FIT`.

Hiding is never permanently safe. The recorded consequence is *"the weak link is off the ball — until a
screen or a switch drags him into the action"*, and a test drives exactly that: a screen switch puts
the hidden defender onto the primary creator.
