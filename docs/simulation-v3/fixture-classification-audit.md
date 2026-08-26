# Fixture classification audit

`data/calibration/classification.mjs` · `fixtureClassificationVersion` **1.0.0**

Every fixture in the original 26-fixture corpus, reclassified from **measured
evidence** rather than from its own label.

## Why this was necessary

Phase 6C2A measured how many of each fixture's five cards verifiably appeared
for its named team-season. **One fixture of 26 matched its label.** Several
labelled `DOCUMENTED_STARTING_FIVE` contained players who never played for that
franchise at all.

A label that overstates what a fixture is turns every error computed from it
into a claim about a team that never played.

## Result

| Classification | Count |
| --- | --- |
| `HISTORICAL_LINEUP` | **1** |
| `SYNTHETIC_ARCHETYPE` | 4 |
| `CROSS_ERA_STRESS_TEST` | 21 |

**18 labels were corrected.** Nothing was deleted: every reclassified fixture
keeps its structural purpose in the synthetic stress set.

## The corrections that mattered most

| Fixture | Was | Now | Verified of 5 | Why |
| --- | --- | --- | --- | --- |
| `2010s-warriors-movement` | DOCUMENTED_STARTING_FIVE | CROSS_ERA_STRESS_TEST | **3** | Contains LeBron James and Nikola Jokić, neither of whom played for the Warriors |
| `2020s-nuggets-hub` | DOCUMENTED_CORE_UNIT | CROSS_ERA_STRESS_TEST | **1** | Only Jokić was a 2022-23 Nugget |
| `1990s-bulls-triangle` | DOCUMENTED_STARTING_FIVE | CROSS_ERA_STRESS_TEST | 4 | Isiah Thomas was a Piston and never a Bull |
| `2000s-pistons-defense` | DOCUMENTED_STARTING_FIVE | CROSS_ERA_STRESS_TEST | 4 | Kevin Garnett was a Timberwolf in 2003-04 |
| `2000s-spurs-balanced` | DOCUMENTED_STARTING_FIVE | CROSS_ERA_STRESS_TEST | 4 | Mehmet Okur never played for San Antonio |
| `1980s-celtics-halfcourt` | DOCUMENTED_STARTING_FIVE | CROSS_ERA_STRESS_TEST | 4 | Nate Archibald left Boston in 1983 |
| **`1980s-lakers-showtime`** | DOCUMENTED_STARTING_FIVE | **HISTORICAL_LINEUP** | **5** | **Accurate.** The only surviving label. |

## The eligibility matrix

| Classification | Historical team calibration | Player shares | Confidence ceiling | Historical holdout | Synthetic tests |
| --- | --- | --- | --- | --- | --- |
| `HISTORICAL_LINEUP` | ✓ | ✓ | HIGH | ✓ | — |
| `HISTORICAL_STARTER_PROXY` | ✓ | ✓ | MEDIUM_HIGH | ✓ | — |
| `HISTORICAL_TEAM_SEASON_PROXY` | ✓ | proxy only | LOW | — | — |
| `SYNTHETIC_ARCHETYPE` | **✗** | ✗ | — | ✗ | ✓ |
| `CROSS_ERA_STRESS_TEST` | **✗** | ✗ | — | ✗ | ✓ |

Enforced by test. A synthetic lineup cannot contribute to a number labelled
historical error, and a team-season proxy cannot supply an exact five-player
usage target — its five are not claimed to have shared the floor.

## Corpus v1 is preserved

The original corpus is unchanged and its fixtures keep their IDs. Prior
calibration reports were computed against it, and rewriting it would silently
invalidate them. Corpus v2 uses an `h2-` prefix so no ID collides and both
remain addressable.

A test hashes all 15 Phase 6C2A artefacts and fails if any is modified.
