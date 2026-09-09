# Phase 6C3R limitations

## The headline

The validation surface was repaired and the repair worked — and the repaired
surface then **failed the candidate**. `HISTORICAL_HOLDOUT_V4_FAIL`, combined
verdict `HISTORICAL_V4_FAILED`, `calibrationStatus: HOLDOUT_FAILED`. The
synthetic stress holdout was not opened and remains sealed. No preview package
was prepared.

Two consecutive holdout failures now stand, and they are **different in kind**:
V3 failed because its ruler could not measure what it claimed to; V4 failed
because a valid ruler measured the candidate and found it wanting on
qualitative identity. The second failure is the phase's success as a
*validation-design* exercise, and its disappointment as a *candidate* exercise.

## What the repaired surface established

- **Quantitative generalisation, again, decisively.** Composite five-share
  error 0.04217 on sixteen never-seen team-seasons against an internal baseline
  of 0.0431 recomputed on the same surface with the same code — ratio **0.978**.
  Two independent holdout generations have now failed to find overfitting in
  the share proxy.
- **Structure at scale.** 98,304 holdout games plus 160,000 reference-
  certification games plus 96,000 control games: zero invariant failures, zero
  final ties, replay exact on all twenty-four holdout surfaces, zero impossible
  scores, zero three-point attempts in pre-three eras.
- **Identifiability discipline works.** All 81 vocabulary traits classified;
  the dependency detector rejects the exact V3 rubric; 12 of 16 metrics
  certified on documented-input controls; unobservable and uncertified traits
  excluded before the run rather than becoming failures inside it.

## What the candidate failed

Eight substantive hard fails — documented identities rendered significantly
opposite by practically meaningful margins:

- **Defensive quality.** The 1978-79 SuperSonics (+0.086 PPP conceded above the
  era-reference baseline), 1989-90 Pistons (+0.058) — two documented elite
  defences that the engine renders as below-reference defences. The 2021-22
  Heat (+0.019) is directionally the same at a smaller margin.
- **Offensive quality.** The 1991-92 Bulls (−0.065 PPP below the reference
  baseline) and 1977-78 Spurs (−0.048) — documented elite offences rendered as
  below-reference offences.
- **A degenerate coach-action rendering.** The 1991-92 Bulls produced **exactly
  zero** movement-family actions (off-ball screens, cuts, handoffs) in 4,096
  games under a documented motion identity. Combined with the zone step
  function found in certification (the max-zone coach produces 100.0% zone
  possessions), the coach action-mix model appears to saturate at extremes.
- **Rebounding identity.** The champion 1978-79 SuperSonics render 0.069 BELOW
  the reference on offensive-rebound rate against a documented strength.

These are mechanical, addressable findings: era-reference-relative team quality
and coach-action saturation. Addressing them requires a **new candidate
version** and a **Historical Holdout V5** — V4 is consumed.

## Defects in my own work this phase

1. **The V4 run crashed after the unlock**, consuming the access event, because
   the runner's profile map omitted the v3 store the era references live in.
   The transactional design absorbed it exactly as built — resume under the
   same event, zero completed members lost, identity hashes unchanged — but the
   crash was avoidable: the dry run built its reference from the same map shape
   yet happened to pass both stores. Dry runs must use the production runner's
   own data-loading path, not a parallel one.
2. **The trait hard-fail rule carries no practical-equivalence margin.** Four
   of twelve hard fails are trivially small (a 0.003 three-point-share deficit
   at z 3.6). Phase 6C2C6 established precisely this discipline for side bias
   and I failed to inherit it here. Recorded, not retro-fitted: with practical
   margins the verdict would still be FAIL (8 substantive hard fails and a
   majority-failing matchup remain), so the defect did not decide the outcome.
3. **The first observability criterion compared control cells to the reference
   baseline across populations**, failing seven metrics on a level shift.
   Corrected to within-population comparisons before any freeze, with the
   first run preserved in git history — but it was the same class of error as
   2: a comparison across populations/scales that a moment's thought about
   *what the number means* would have caught.
4. Five player-article titles hit disambiguation pages and two more needed
   birth-year qualifiers; one spec five (1972-73 Lakers) was drafted with an
   injured starter before checking his season. All caught by the builder's
   verification, which is the point of building it that way.

## Scope limitations that remain

- Trait scoring rests on **coach system scales and card statistics** as
  construct anchors; four metrics (isolation, steals, rim deterrence, zone)
  failed certification and their traits are unmeasured, not refuted.
- Team-level numeric targets remain 24 usable cells of 240 (licence-blocked or
  unrecorded); the numeric surface is still the Tier C share proxy.
- The era references are instruments, not truth: every "elite" judgement is
  relative to a median-of-calibration-era five, and the reference pool is
  three teams per era.
- Pre-1974 steal/block shares are null and contribute nothing, by design.

## What must precede any Phase 6C3R2

1. A new candidate version addressing the five defensive/offensive-quality
   renderings and the coach action-mix saturation — or an explicit owner
   decision to accept trait-level infidelity as scope.
2. A trait policy with practical-equivalence margins on the hard-fail rule.
3. Historical Holdout V5 from the 13 unconsumed eligible pool teams plus
   further source expansion; V4's sixteen teams are burned.
4. The synthetic stress holdout remains sealed and available — it should stay
   that way until a historical holdout passes.
