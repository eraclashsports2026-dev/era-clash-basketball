# Phase 6C2C5 limitations

What this phase established, what it did not, and what went wrong on the way.

## The headline result is a non-result, and that is the finding

84 on-grid candidate parameter values were measured against an authorized
historical target on leak-free folds. None survived. Candidate 0 — the wired
defaults — is locked as `DEVELOPMENT_LOCKED_BASELINE`.

This is not a failure to calibrate. It is the outcome of calibrating and finding
that the defaults are the best-supported values available. The alternative would
have been to adopt a change that the evidence did not support, which is the one
outcome the phase was designed to prevent.

## The objective is a proxy, and a narrow one

The search was judged on Tier C player scoring-share error over the selected
five, on 23 historical calibration fixtures. That target is the only authorized
numeric historical evidence in this corpus that the eligible parameters could
plausibly move. It carries real limits:

- It is a **season share proxy**, derived from season totals over a documented
  five. It is not observed possession-level allocation.
- A share proxy cannot distinguish a correct allocation mechanism from two
  compensating incorrect ones.
- Five-player normalisation discards bench scoring entirely.
- 23 fixtures is small. One fixture is roughly 4% of the objective.
- Each fixture plays a **mirror** of itself. That isolates the internal scoring
  distribution from opponent quality, which is what the target describes, but it
  also means no result here speaks to cross-team matchups.

## Three of the eligible parameters could not be adjudicated at all

At the full registry range — deliberately wider than the search's own movement
cap — these produce bit-identical objective values:

| Parameter | Registry range | Objective cells differing |
| --- | --- | --- |
| `opportunity.mismatch.severe` | 1 – 4 | 0 / 288 |
| `zone.highPostVulnerability` | 0.3 – 2 | 0 / 288 |
| `zone.cornerVulnerability` | 0.3 – 2 | 0 / 288 |

They are not inert. The corpus contains 212 SEVERE-mismatch and 1,353
ZONE_MIXED possessions. These parameters change something about those
possessions; they do not change **which of the five players scores**, which is
all the Tier C target can see.

So the honest count is 8 of 11 eligible parameters adjudicated, not 11. Calling
the other three "tested and rejected" would claim evidence that does not exist.
They are locked at their defaults for want of a target that can distinguish
their values.

## What no result here supports

- No claim that the engine is historically authoritative, definitive, validated
  or accurate.
- No holdout has been opened. Both sealed sets remain at access count 0.
- No private preview has been run.
- Nothing here authorises production. `possessionCalibrationVersion` is still
  `null`.
- The Monte Carlo probability suite does **not** pass. One of its gates fails and
  is recorded in the lock manifest.

## The failing probability gate

`sideBiasPerCellWithinTolerance` fails: max absolute per-cell side bias 0.0781
against a frozen threshold of 0.05. It predates this phase (Phase 6C2C1 recorded
0.0625 against the same threshold) and cannot have been caused by calibration,
since no parameter value changed.

Its threshold was **not** altered. For context on the gate's power: the
threshold sits at 1.60 per-cell standard errors, the observation at 2.49, and
the expected maximum of 30 independent null draws is about 2.4. A per-cell
maximum compared against a fixed absolute threshold, with no multiplicity
correction across 30 cells, will exceed it in most runs by construction. That is
an argument for revising the gate in a later phase with the revision justified
before the data is seen — not a reason to treat this run as passing.

The dedicated side-symmetry suite, which does apply Benjamini–Hochberg control
across its 48 cells, passes all 10 of its gates over 240,000 paired games.

## Errors made in this phase

Four before the summary, five after. The pattern is consistent enough to be
worth naming: **my first instinct is to assert coverage rather than verify it.**

1. `zoneGap` read `r.action` where the gap lives in `r.variant`. Reported 0
   activated possessions against a true 10,299.
2. `freeThrowTrip` tested points values instead of the `SHOOTING_FOUL` outcome.
3. `makeRate` tested `points > 0`, which counts a made free throw as a made
   field goal.
4. A worker double-post made an activation counter read 6 against a true 3.
5. The factorial resolution rule tested effect **sign** only. A pair passed while
   one member's effect collapsed from -28.0 to -0.33.
6. **The search scanned off-grid.** Every eligible parameter declares a registry
   `step`; the first search ignored it and generated 44 of 44 off-grid
   candidates, then "accepted"
   `coach.offensiveAdjustmentMinEvents = 7.8` — a fractional count of evidence
   events.
7. **The search had no multiplicity control.** 44 candidates against a fixed
   0.0005 threshold. The gain distribution had mean -0.00020 and sd 0.00054, so
   the threshold sat 0.93 sd out and ~8 of 44 crossings were expected by chance.
   The "winner" reached 1.70 sd above the family mean while the expected maximum
   of 44 null draws is ~2.15 — weaker than the best of pure noise. This is the
   `max|t| >= 2.0` error that Phase 6C2C4 retired, reproduced in a new costume.
8. A diagnostic read `r.mismatch` instead of `r.mismatchSeverity`, reporting 0
   SEVERE possessions where there are 212 — and it contradicted a measurement I
   already had, which is what exposed it.
9. A parameter-read trace reported "NEVER READ" for everything, because
   `noteParameterRead` is instrumented on only two paths. Had I trusted it, I
   would have concluded three parameters were unwired.
10. Five new scripts ran their full measurement on import — the third phase in a
    row for this defect.
11. A gate compared two hashes that differ by design, then hid the mismatch
    behind `|| true`, producing a gate that could not fail.
12. Bumping `parameterIdentifiabilityVersion` for a new methodology broke the
    frozen v2 policy hash, because the v2 object embeds that string.

### What actually caught these

Not review. In every case it was a **direct behavioural test at extreme values**,
or an **existing test**, or **two measurements disagreeing**. Errors 6 and 7 were
caught by looking at the distribution of the thing I was about to accept. Error 8
was caught because 0 SEVERE contradicted a non-zero effect I had already
measured. Errors 10, 11 and 12 were caught by the suite.

The mitigation that works is the same one as last phase: prefer a test that
depends on nothing — no predicate, no instrumentation, no pipeline — over a
number the pipeline hands you.

## Disclosure: a method corrected after seeing a result

The first search run was completed and read before its two defects were found.
It is retained unaltered as `candidate-history-v1-superseded.json` with both
defects and this disclosure recorded in it.

The corrections are strictly stricter in both respects — on-grid values only,
plus family-wise significance added on top of the existing practical and
validation gates — so neither can turn a rejection into an acceptance. But the
ordering is real: I saw a passing result, then changed the method, and the
passing result became a rejection. That sequence is recorded rather than tidied
away, because a reader has no way to audit it otherwise.

The correction was independently vindicated afterwards, from evidence the gate
never used: on a disjoint confirmation seed block, the strongest contender's
advantage did not merely shrink, it **reversed sign**, from +0.00102 to -0.00080.
