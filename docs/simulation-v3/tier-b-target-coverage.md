# Tier B target coverage

**State: MEASURED. Coverage gate PASS on its terms. Tier B is not usable for calibration.**

Both sentences are true and neither may be quoted without the other.

`tierBTargetDataVersion 1.0.0` · `data/calibration/historical-targets-tier-b.json`
· hash `2f8213bfd5487564`

## The gate, and what it does not mean

The frozen gate is **unjustified missing fields = 0**, not *missing fields = 0*.
A target may be unavailable; it may not be silently missing.

| | |
|---|---|
| Fields (32 fixtures × 12 metrics) | 384 |
| **Populated** | **2 (0.5%)** |
| Justified unavailable | 382 |
| **Unjustified missing** | **0 — gate PASS** |

The gate passes because every gap carries a specific, evidence-backed reason. It
does not pass because Tier B is usable. **11 of 12 Tier B metrics are derivable
for zero fixtures.**

## Why: measured, not assumed

`scripts/calibration/probe-tier-b.mjs` fetched all 32 authorized team-season
articles and asked one question — does this source publish the raw counting
totals the formulas consume?

| Required total | Articles publishing it |
|---|---|
| FGM, 3PM, 3PA, FTM, ORB, DRB, TRB, TOV | **0 / 32** |
| FGA, FTA | 2 / 32 |
| REB, AST, STL, BLK, PTS | 9 / 32 |
| Team totals row | 4 / 32 |

Derivability by metric, across 32 fixtures:

| Metric | Derivable |
|---|---|
| FTr | 2 |
| eFG%, TS%, 3PAr, assist rate, TOV%, ORB%, DRB%, pace, ORtg, DRtg, net rating | **0** |

Summing the fixture's five players would not rescue this. Five players are not a
team, and the frozen policy sets `requireCompleteInputsForDerivation: true` — a
rating derived from a guessed possession count is a guess wearing a formula.

## The four reasons, and which money can fix

| Reason | Fields | Share | Remedy |
|---|---|---|---|
| `SOURCE_BLOCKED_LICENSING` | 288 | 75.0% | **a purchased licence could fix** |
| `NOT_RECORDED_IN_ERA` | 82 | 21.4% | **permanent — no source on earth has it** |
| `NOT_APPLICABLE` | 12 | 3.1% | undefined concept |
| `RECORDED_STATISTIC` | 2 | 0.5% | populated |

Reporting these as one number would hide which part of the problem is
purchasable. Offensive/defensive rebound splits, steals, blocks and team
turnovers became official NBA statistics only in **1973-74**; the three-point line
arrived in **1979-80**. For fixtures before those lines, the gap is permanent —
82 fields will never be filled by any source, at any price.

**No null is ever replaced by a zero.** A missing turnover count is not zero
turnovers, and encoding "not measured" as "no ability" is the failure this whole
discipline exists to prevent.

## Formulas

Committed as data (`FORMULAS` in `build-tier-b.mjs`) so a value can never be
attributed to a formula that was not the one used, and so each metric's required
inputs are checkable rather than implied. TS% records that its 0.44 free-throw
coefficient is an **estimator, not a measurement**.

## Consequence for calibration

Every parameter whose only judge is a Tier B metric is
`UNSUPPORTED_BY_TARGET_DATA` and must remain at its default. Pace, offensive and
defensive rating, turnover rate, rebound rates and shooting-efficiency targets
have **no historical numeric support whatsoever** in this corpus.

What the corpus can still support is distributional and qualitative: player share
structure (Tier C, 132 maps across 30 fixtures) and documented team identity
(Tier D, 221 statements across 32 fixtures). That is a real but narrow base, and
it is not a substitute for team-efficiency targets.

See `calibration-support-matrix.md` for the per-domain consequence.
