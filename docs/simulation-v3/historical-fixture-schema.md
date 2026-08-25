# Historical fixture schema

`data/calibration/fixtures.mjs` · `historicalFixtureDataVersion` **1.0.0**

A fixture is a documented historical reference point: a real team, its era, its
coach, a lineup of player-decade cards, and whatever verified targets exist.

## Fields

| Field | Meaning |
| --- | --- |
| `fixtureId` | Stable identifier. Never reassigned. |
| `label` | Human-readable name. |
| `eraStyleId` | Which Era Style supplies the environment. |
| `coachId` | Coach card. |
| `roster` | Five `{ playerCardId, assignedPosition }` entries. |
| `fixtureType` | `CHAMPIONSHIP` · `ELITE_OFFENSE` · `ELITE_DEFENSE` · `PACE_EXTREME` · `BALANCED` |
| `lineupBasis` | How the five were chosen (below). |
| `historicalTargets` | Verified numeric targets, or `null`. |
| `targetAvailability` | Why a target is missing (below). |
| `sourceConfidence` | `HIGH` · `MEDIUM` · `LOW` |
| `sources` | URLs and verification dates. |
| `styleNotes` | Documented tactical identity, for interpretation only. |

## `lineupBasis` — what the five players actually represent

| Value | Meaning |
| --- | --- |
| `ACTUAL_STARTING_FIVE` | The real starting lineup, all five with cards. |
| `DOCUMENTED_CORE_UNIT` | The documented core, where a real starter has no card. |
| `STYLE_ARCHETYPE` | Assembled to represent a documented style, not a specific lineup. |

This distinction matters because a fixture is only as strong as its lineup
claim. `1980s-lakers-showtime` is `DOCUMENTED_CORE_UNIT`, not
`ACTUAL_STARTING_FIVE`, because A.C. Green has no card — recording it as the
real starting five would be false.

## `targetAvailability` — why a number is missing

| Value | Meaning |
| --- | --- |
| `RECORDED_STATISTIC` | Verified from a published source. |
| `SOURCE_BLOCKED` | The statistic exists but is not machine-accessible. |
| `NOT_RECORDED_IN_ERA` | The statistic did not exist (e.g. 3PA before 1979-80). |

The distinction is essential. `SOURCE_BLOCKED` means "known but unreachable";
`NOT_RECORDED_IN_ERA` means "did not exist". Collapsing them would make a
data-access problem look like a historical fact.

## The rule that matters most

**Never fabricate a value to complete the schema.**

A `null` target is a real, useful statement: *this comparison cannot be made
yet*. A plausible-looking invented number produces a complete error table that
is pure fiction and that nothing downstream can detect. The corpus currently
holds 209 of 209 calibration-set comparisons as unavailable, and that empty
column is the honest result.

Specifically prohibited: inferring wingspan from height, weight from position,
steals or blocks for pre-1974 seasons, or any physical or statistical value from
memory. "Missing statistic" never means "zero ability".

## Position legality

Every `assignedPosition` must appear in the card's own `positions` list. This is
enforced by test and by the engine's team builder. Four illegal assignments were
caught during Phase 6C1 — Mikan and Paultz at PF, Cooper at PF, Pierce at PG —
and corrected with documented reasoning rather than by relaxing the check.

## Tactical notes are not statistics

`styleNotes` records documented tactical identity. It is interpretation, and any
comparison drawing on it is labelled `DOCUMENTED_STYLE_COMPARISON` — never
presented as an official statistic.
