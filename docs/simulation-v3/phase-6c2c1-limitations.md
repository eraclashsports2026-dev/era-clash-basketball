# Phase 6C2C1 — limitations

What this phase did **not** establish, and what remains wrong. Read this before
quoting any number from the other Phase 6C2C1 documents.

## 1. The engine is not calibrated

`possessionCalibrationVersion` is `null`, status `NOT_LOCKED`. All 53 registered
parameters are at defaults and the regularization penalty is exactly 0. No
parameter was tuned in this phase, by instruction.

Every probability in this phase is a faithful sample of an **uncalibrated**
engine. A faithful sample of an uncalibrated engine is an accurate statement
about that engine and not a statement about basketball.

## 2. The probability validation measures the estimator, not the engine

All 30 validation cells are synthetic, and every "outcome" is engine output.
What was shown is that Monte Carlo estimates on prediction seeds predict engine
behaviour on disjoint validation seeds, capturing 94.4% of achievable skill.

What was **not** shown is that engine behaviour resembles real basketball. That
question requires the historical corpus, and `historical-target-coverage-v3.md`
records that 81.7% of the team-level target fields needed to ask it are
licensing-blocked.

## 3. Calibration is unestablished outside 0.2–0.8

The reliability bins below 0.1 and above 0.8 contain **one cell each**, and the
0.9–1.0 bin is empty. The two largest calibration gaps in the whole run
(−0.0234 and −0.0469) are in exactly those single-cell bins.

Related: the strength ladder **saturates** near 0.85. Downgrading a fifth player
moved the estimate by 0.012. The engine does not currently produce probabilities
above ~0.85 for this construction, so nothing above that range is measured.

## 4. A frozen threshold failed and was not moved

Max per-cell side bias was **0.0625** against a frozen threshold of 0.05. The
gate records `sideBiasPerCellWithinTolerance: FAIL`.

The threshold is very likely wrong rather than the engine: at 256 games the
standard error of a 0.5 rate is 0.0313, so 0.0625 is 2 SE, and ~1.4 such cells
are expected from noise across 30. The systematic test — the statistically
correct one — passes clearly (mean 0.0022 ± 0.0042, t = 0.53).

Both are reported. The frozen threshold was **not** raised after seeing the
number it judges, because a threshold moved to fit its result is not a threshold.
Setting a sampling-error-aware threshold is a Phase 6C2C2 decision.

## 5. Single-publisher concentration

All 160 calibration profiles come from **one** publisher (Wikipedia, CC BY-SA
4.0). There is no independent source to contradict an error, and a change in one
publisher's terms would invalidate the entire data plane at once. Revision ids
and content hashes detect *change*; they do not detect a value that was wrong
when retrieved.

## 6. Three fixtures rest on membership-only evidence

3 of 160 profiles were resolved by `TEAM_SEASON_ROSTER_ONLY` — the source
confirms the player was on the roster, but supplies no statistics. All their
stat fields are `null` and their confidence is `LOW`, which propagates to their
fixtures by the weakest-link rule. They are usable for lineup membership and
nothing else.

## 7. Corpus coverage is thin against the space it represents

32 fixtures across 8 eras and 23 franchises is a large improvement on 10 across
4 and 3, and it is still a small sample of league history. Four fixtures per era
cannot represent an era's full stylistic range, and `styleIdentityConfidence` is
`MEDIUM` everywhere because style tags derive from prose rather than measurement.

## 8. Fives are season-level

A season's "starting five" is a simplification of a season that usually had
several, and mid-season trades make the nominal five wrong for part of the year.
Where a trade made it clearly wrong the actual most-used five was substituted,
but the general approximation remains.

## 9. Prior-phase errors corrected here, and what they imply

- **`synthetic-stress-v1` was not a holdout.** Phase 6C2B reported it as
  `SEALED_UNREAD`; 19 of its 25 fixtures had simulated output in committed
  6C2A artefacts. Any 6C2B conclusion resting on that set being unread is
  invalid. It is now `PREVIOUSLY_INSPECTED_ARCHIVE`.
- **Importing a script ran a simulation campaign.** Importing
  `probability-v3.mjs` for one constant executed its entire 30-cell validation.
  Three other calibration scripts had the same defect. All four are now guarded
  and a test asserts every calibration script is inert on import.
- **A test count reported in this phase was stale.** "1,017 passing" was quoted
  after a commit that had already broken a seal-count assertion. The correct
  figure is 1,057 across 35 files.
- **Two Brier scales were nearly conflated.** The first validation run scored
  forecasts against empirical rates (0.0018) and would have compared that to the
  outcome-scale 0.2507 baseline — an apparent 100× improvement that does not
  exist. Both scales are now computed and each carries a note stating it must
  not be compared to the other.

## 10. What no artefact in this phase claims

The engine is not historically authoritative, definitive, validated or accurate.
No probability produced here is a true probability; every one is labelled
`ERACLASH_MODEL_IMPLIED_PROBABILITY`. No formal holdout was opened. No public
probability endpoint exists.
