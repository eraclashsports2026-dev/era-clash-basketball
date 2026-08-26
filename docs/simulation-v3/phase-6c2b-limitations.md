# Phase 6C2B limitations

## No calibration exists

`possessionCalibrationVersion` is `null` / PLANNED. **Nothing was tuned.** Every
one of the 53 registered parameters sits at its default, the regularisation
penalty is exactly 0, and the parameter change history is empty.

The phase built the apparatus and stopped at the gate, which is what the gate is
for.

## What blocks tuning

**The historical corpus is 10 fixtures across 4 eras and 3 franchises**, against
a target of 24 across 8. It cannot be made larger by more research: 64 candidate
team-seasons were scanned and only 14 could field a legal five from carded
players. The 1950s, 1990s, 2010s and 2020s yield none.

The cause is the card pool: 381 all-time greats across 30 franchises and 75
seasons, where a real starting five contains role players who are not all-time
greats. **This is a product decision about card coverage, not an engineering
problem.**

**Tier B target coverage is zero.** No authorized source supplies the totals that
pace, ORtg, DRtg, eFG%, TS%, TOV%, ORB%, FTr and 3PAr derive from.

**Cross-validation is impossible at this corpus size.** The smallest fold holds
one fixture, so a validation error is one team and moves on noise.

## The probability model is not usable

It emits a probability because Phase 6C3 needs the shape, and it declares
`usable: false` on every report. The underlying expectation explains ~3.5% of
realized margin variance. Fixing it means refitting the expectation against
margin rather than efficiency — engine work for a phase whose targets support
it.

## Findings that rest on thin evidence

| Finding | Basis |
| --- | --- |
| Historical corpus composition | 10 fixtures, 2 of them the same five in different seasons |
| Tier C player shares | 5 of 7 calibration fixtures; 2 are `ROSTER_ONLY` and have none |
| Holdout stratification | 3 fixtures across 3 eras — real stratification, tiny sample |

## Not measured

- **Any holdout.** All three remain `SEALED_UNREAD`, access count 0. Nothing here says anything about generalisation.
- **Zone shells beyond MAN and 2-3.** Still only one zone-capable coach in the pool, so 3-2, MATCHUP, BOX-AND-ONE and TRIANGLE-AND-TWO have never been selected.
- **Bench, rotations, foul-outs, substitutions.** Deferred; `rotationDepth` stays `RESEARCH_ONLY`.

## Deliberately not done

No broad coefficient tuning · no global shooting nerf · no zone bonus · no hard
FGA cap · no holdout opened · no module promoted · no public preview · no
fabricated data · no source used against its terms · no threshold moved after
seeing a result.

## Corrections recorded rather than carried forward

Three wrong readings of my own were corrected mid-phase and are kept in the
record because the reasoning matters more than the conclusion:

1. A narrow strength ladder measured the realized margin at **3.4× expected** — the opposite of the truth. One matchup family in which the two happened to correlate.
2. A 60-seed sweep gave R² = 0.021, low enough to dismiss as underpowered. Only 800 seeds per cell settled it at 0.035.
3. The first strength-ladder design was not monotonic because swapping Draymond Green for Kevin Durant made the team worse. That is the engine valuing construction over talent, so the **design** was replaced rather than the result explained away.

A false name match was also found and fixed: a last-name-plus-first-initial rule
matched **Draymond Green to the 2019-20 Lakers' Danny Green**. In a corpus whose
purpose is that these five really played together, a fuzzy match is a
fabrication.

## Interpretation warnings

**Corpus v1 labels overstated what those fixtures were.** 18 were corrected. The
originals are preserved unchanged because prior reports were computed against
them.

**A synthetic fixture can never contribute historical error.** Enforced by the
eligibility matrix and by test.

**The legacy holdout v1 is not a historical holdout.** It mixes historical and
synthetic fixtures. It is preserved, unread, as `LEGACY_MIXED_HOLDOUT`.
