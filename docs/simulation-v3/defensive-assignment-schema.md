# Defensive assignment schema

## Threat profile

Matchup-specific, not a universal score. A lower-OVR movement shooter is a harder assignment than a
higher-OVR interior role player, and an engine built on one overall number cannot say that.

```
{ playerCardId, personId, name, nominalPosition, functionalRoles, primaryRole,
  threats: { primaryCreation, secondaryCreation, pullUpShooting, movementShooting,
             spotUpShooting, rimPressure, postScoring, passing, screening,
             rollThreat, popThreat, cutting, offensiveRebounding, transition, foulPressure },
  usageShare, expectedTouchShare, creationTier, gravity,
  threatHeightIn, threatWeightLb,     // null when unverified; position NEVER written here
  dataConfidence: { offense, shooting, physical, overall } }
```

Movement and spot-up shooting are **separate**: one is a chase, the other a closeout. Shooting threats
are era-gated — a movement shooter in 1962 is still a hard chase, but the shot being chased is a long
two.

## Defender profile

```
{ playerCardId, personId, name, nominalPosition,
  capabilities: { pointOfAttack, screenNavigation, movementChasing, wingContainment,
                  postDefense, interiorDefense, rimProtection, helpDefense,
                  switchability, defensivePlaymaking, defensiveRebounding, foulDiscipline },
  physical: { heightIn, weightLb, wingspanIn, strength, speed, athleticism,
              sizeProxy, sizeProxySource, measuredFields },
  roleAvailability: { canTakePrimaryCreator, canChaseShooter, canGuardPost,
                     canProtectRim, canSwitch, canHideOnLowUsagePlayer },
  confidence: { defense, physical, physicalCoverage, derivedProxies, overall } }
```

**No single `defenceScore` exists**, deliberately. A defender can be elite at the point of attack,
average against large wings, poor in the post and vulnerable chasing movement shooting, all at once.

`screenNavigation` and `movementChasing` are separate from `wingContainment` — they are the two things
a big guard gets wrong against a shooter, and collapsing them into "containment" is what let Magic
guard Curry.

### Missing physical data

`wingspanIn` is **null everywhere by policy** and never inferred. `heightIn`/`weightLb` are null when
unverified. Where height is missing, a `sizeProxy` is derived from the position with
`sizeProxySource: "POSITIONAL_FALLBACK"` — recorded as a fallback and **never written into the
physical fields**. `strength` and `speed` are declared derived proxies in `confidence.derivedProxies`.

`canHideOnLowUsagePlayer` requires weakness **across the board** — perimeter, wing, post and rim.
Gating on perimeter defence alone labelled Tim Duncan the weak link and "hid" him on a low-usage
forward. Every big is poor at the point of attack; that is his role, not a weakness.

## Pairwise matrix

25 cells, each retaining its dimensions:

```
creationContainment · sizeCompatibility · speedCompatibility · postResistance
pullUpDefense · movementChase · screenNavigation · rimAccessPrevention
spotUpClosing · reboundingPosition · foulRiskExposure · schemeCompatibility
```

Each dimension records `{ fit, demand, shortfall, surplus }`. Shortfall is capability below demand,
**scaled by how much demand exists** — a defender's poor post defence is irrelevant against a player
who never posts, and that weighting is what stops the matrix rewarding generic size.

`surplus` is capability above demand. It is deliberately excluded from the plan cost (being able to
guard someone twice over is not twice as useful) but included at possession level, so a matchup the
defence genuinely wins lowers shot quality.

Cell cost is `shortfallCost × usageWeight + mismatchCost × usageWeight × 0.8`, where usage weight
reflects that a problem against a 25%-usage creator costs far more than the same problem against a
12%-usage shooter.

## Baseline assignment record

```
{ offensivePlayerId, offensivePlayerName, offensivePosition, offensiveRole, usageShare,
  defenderId, defenderName, defenderPosition,
  crossMatched, isHide, cost, severeCount, majorCount, mismatches, confidence,
  reason: { code, strongestDimension, worstMismatch } }
```

Reason codes: `HIDE_WEAK_DEFENDER`, `CONTAIN_PRIMARY_THREAT`, `PRESERVE_RIM_PROTECTION`,
`CROSS_MATCH_FOR_FIT`, `POSITIONAL_FIT`.

## Constraints (all enforced by test)

- every offensive player has exactly one primary defender
- every defender has exactly one assignment
- no defender covers two players; no player is unassigned
- deterministic, and independent of array order
- duplicate-person protection unchanged; the same person on **opposing** teams remains valid

## Optimizer objectives

Beyond the sum of pairwise costs, because team defence is not five one-on-one matchups:

| Objective | Why it cannot be pairwise |
|---|---|
| severe / major mismatch count | a plan property, not a sum |
| rim-protector preservation | assigning the best rim protector to a shooter wins that pairing and loses the paint |
| primary-creator containment | penalises leaving an elite stopper on a 12%-usage shooter |
| weak-defender hide credit | scheme-policy dependent |
| team rebounding shortfall | positional, across the plan |
| severe baseline violations | ×400, large enough that no accumulation of small fits can outweigh it |

**Exhaustive, not greedy.** Greedy assigns the best defender to the biggest threat and leaves the
remainder — measured across 168 matchup×era cells: greedy produced **26** severe baseline violations,
the exhaustive optimizer **0**, and was never worse on total cost (168/168).

A Hungarian solver would match the linear part but cannot express rim preservation or mismatch counts,
which are whole-plan properties. At 120 candidates and 0.09 ms, exhaustive evaluation handles them
directly and stays readable.

## Ledger fields

```
primaryDefenderId · helpDefenderId · coverageType · assignmentState
forcedSwitch · mismatchType · mismatchSeverity · schemeId
```

Structured reason codes only. Every ledger string is under 48 characters, asserted by test.

## Result metadata

Compact by design — the full plan carries a 25-cell matrix and ten profiles per side, and none of it
is needed to explain a result. The summary holds the scheme, the five baseline pairs with reasons,
help roles, the change history, counters and the exploitation table. Asserted under 20 KB, and the
matrix and profiles are asserted **absent**.
