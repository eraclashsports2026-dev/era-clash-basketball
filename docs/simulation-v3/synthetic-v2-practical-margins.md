# Synthetic V2 practical margins

A significance test at 2,048 games will call almost any difference real. So
every gate is dual: a threshold, and a practical margin the observation must
clear before it decides anything. Phase 6C4A established why — four of
Historical V4's twelve hard failures were sub-margin artifacts, and the margin
policy is what withdrew them.

## The rule, stated before the numbers

margin = max(3 x the largest standard error observed for that metric on the development surfaces, a predeclared domain floor). The three-sigma term keeps sampling noise from deciding a verdict; the domain floor keeps a very precise measurement from making a trivially small difference decisive.

floor = the largest step-multiple at or below (smallest development observation - 3 x largest standard error - the practical margin). So the weakest legitimate construction observed on a non-holdout fixture still clears the floor by the full margin, and a FAIL requires a genuine collapse rather than an unlucky sample.

Shares are clustered on the **game**, not the possession. Possessions inside one
game share a seed and a matchup; treating 200,000 correlated possessions as
independent would understate the error by roughly an order of magnitude and make
every margin look safe.

## The margins

| metric | margin | largest observed SE | 3 sigma | domain floor | binding |
|---|---|---|---|---|---|
| `maxActionFamilyShare` | 0.01 | 0.00119 | 0.00357 | 0.01 | DOMAIN_FLOOR |
| `shellSideWinRate` | 0.03315 | 0.01105 | 0.03315 | 0.02 | THREE_SIGMA |
| `combinedScoreSd` | 0.82962 | 0.27654 | 0.82962 | 0.5 | THREE_SIGMA |
| `coherentLowerControlWinRate` | 0.03315 | 0.01105 | 0.03315 | 0.02 | THREE_SIGMA |
| `roleMatchedUpgradeWinRate` | 0.03312 | 0.01104 | 0.03312 | 0.02 | THREE_SIGMA |

## Frozen thresholds, carried through unchanged

| threshold | value |
|---|---|
| `maxSingleActionFamilyShare` | 0.6 |
| `maxSingleShellWinRate` | 0.65 |
| `minSingleShellWinRate` | 0.35 |
| `minGamesPerHoldoutFixture` | 1000 |

Development evidence sits far from all of them. The largest action-family share
observed on any non-holdout fixture was 0.37418
against a ceiling of 0.6, and shell win rates ran
0.49512 to 0.54102
inside a band of [0.35, 0.65]. The gates are not sitting on the operating point.

## Derived thresholds

Three thresholds had no frozen number and were derived from non-holdout evidence.

### `minCombinedScoreSd` = 13

a FAIL needs the combined-score spread to fall to 12.17038 or below, about 19% below the weakest development observation — a collapse toward determinism, not an unlucky sample

The distinct-scoreline ratio is **reported but never adjudicates**. On the same
fixtures it read about 0.486 at 102 games and
0.35596–0.39941
at 2,048, so one frozen floor cannot serve both the mirror and the
tail-extension volumes. The combined-score standard deviation adjudicates
instead, being a property of the distribution rather than of the sample size.

### `constructionWinRateFloor` = 0.02, and it is declared weak

a weak floor by construction. The evidence does not support a strong one: on non-holdout fixtures a coherent control at 80% of the fixture's teamRating won between the min and max above, a spread driven by WHICH construction it faced, which is the thing the guardrail is about. A floor high enough to be demanding would fail legitimate constructions.

the guardrail says construction CAN beat higher rating. The per-fixture floor establishes that construction is not literally irrelevant anywhere; the set-level existential bar below carries the substantive claim.

The set-level existential bar is
0.35:
the SET, not a fixture. At least one applicable fixture must show the coherent lower-rated control winning at least this share, or requireConstructionCanBeatHigherOvr has not been demonstrated at all.

### `talentWinRateFloor` = 0.5

the rule derived 0.47624, below one half, which would say a substantially upgraded five is allowed to LOSE. That is vacuous, so the floor is clamped to 0.5 and a FAIL requires the upgraded side to win 0.46688 or less — talent inverted, not merely talent weak.

requireConstructionCanBeatHigherOvr is the guardrail that forbids talent from being absolute, and requireNewSeedVariance forbids a degenerate deterministic outcome. A ceiling here would double-count one failure.

## Counts have no margin

requireZeroInvariantFailures, requireZeroImpossibleResults and requireSameSeedReplay compare exact counts against zero. A count has no sampling noise, so no margin applies and one violation is one failure.

