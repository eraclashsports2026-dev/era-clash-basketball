# Historical target schema

`src/v3/calibration/targetSchema.js` · `historicalTargetSchemaVersion` **1.0.0**

One canonical shape for every historical target, and one rule above all others:
**a number with no provenance never enters the store.**

## Record shape

```
{ fixtureId, teamSeasonId, season, seasonBasis, targetDataVersion, set,
  teamTargets:  { <metric>: { value, availability, provenance } },
  unitTargets:  { unitType, selectedFiveOnly, availability, confidence,
                  playerScoringShares, playerReboundShares, playerAssistShares,
                  playerOpportunityShares, playerUsageShares, provenance },
  seasonCrossCheck: { season, lineupFidelity, matchedPlayers, unmatchedPlayers,
                      fullUnitShares, provenance },
  identityTargets: [ { trait, value, kind, confidence } ],
  confidence, notes }
```

## Source types

| Type | Meaning |
| --- | --- |
| `OFFICIAL_PUBLIC_SOURCE` | A league or governing-body publication |
| `AUTHORIZED_PUBLIC_API` | A public API whose licence permits this use |
| `LICENSED_EXPORT` | Obtained under an explicit commercial licence |
| `MANUAL_VERIFIED_IMPORT` | Hand-entered, with the source recorded |
| `DERIVED_FROM_SOURCED_TOTALS` | Calculated — **must** carry its formula |
| `IN_REPO_VERIFIED` | Already-verified repository data, with its own provenance |
| `SOURCE_BLOCKED` / `NOT_APPLICABLE` | Absent, with a reason |

## Availability — why a value is missing, or weak

| Value | Meaning |
| --- | --- |
| `RECORDED_STATISTIC` | Verified from a published source |
| `DERIVED_STATISTIC` | Computed from sourced totals with a recorded formula |
| `SELECTED_FIVE_SEASON_SHARE_PROXY` | A five-player share from season averages. **Not** actual on-court lineup usage |
| `ACTUAL_LINEUP_MEASUREMENT` | Measured from real five-man lineup data |
| `SOURCE_BLOCKED_LICENSING` | Published, but its licence forbids this use. Needs a licence, not a workaround |
| `SOURCE_BLOCKED_ACCESS` | No authorized technical path |
| `NOT_RECORDED_IN_ERA` | The statistic did not exist then |
| `NOT_APPLICABLE_SYNTHETIC_LINEUP` | The roster spans franchises, so no real team-season corresponds to it |

**These four absence reasons are not interchangeable.** A licensing block, an
access block, a statistic that did not exist, and a lineup that never played are
four different facts with four different remedies. Collapsing them would make a
licensing problem look like history. A test asserts more than one reason is in
use.

## What the schema rejects

Unknown metrics · impossible percentages · out-of-range values · negative
values · shares that do not sum to one · unresolved fixture IDs · values with no
provenance · derived values with no formula · **any blocked metric that arrived
as `0`**.

## The rule that matters most

**Never fabricate a value to complete the schema.** A `null` is a real
statement: *this comparison cannot be made yet*. An invented number produces a
complete-looking error table that is pure fiction and undetectable downstream.

Specifically prohibited: inferring wingspan from height, weight from position,
steals or blocks before 1973-74, or any value from memory. A missing statistic
never means zero ability — and, as Phase 6C2A found the hard way, it must not
silently mean *average* ability either.
