# Structural calibration delta report — Phase 6C2A

**Status: DEVELOPMENT — CALIBRATION REQUIRED.**

Before and after the Phase 6C2A structural corrections, on the **same 19
calibration fixtures with the same fixed seeds**. No coefficient was tuned. The
holdout was not run.

- Before: `tests/fixtures/calibration-framework/pre-6c2a/structural-baseline.json`
- After: `tests/fixtures/calibration-framework/post-6c2a/structural-baseline.json`

The "before" file is hash-pinned in test and never regenerated: a before/after
comparison whose *before* moves is not a comparison.

## 1. Player distribution — the target of this phase

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| Leading FGA share, mean | 0.3871 | **0.3178** | −0.069 |
| Leading FGA share, p95 | 0.5019 | **0.3856** | −0.116 |
| Leading FGA share, max | 0.7019 | **0.5408** | −0.161 |
| Top-two combined | 0.6204 | **0.5568** | −0.064 |
| Usage entropy (max 2.322) | 2.0937 | **2.2058** | +0.112 |
| Players with ≥8% of shots | 4.502 | **4.829** | +0.327 |
| Invariant violations | 0 | **0** | 0 |

Per action family, on the 1970s Bucks fixture:

| Family | Before | After |
| --- | --- | --- |
| POST_UP | **100.0%** | 68.0% |
| ISOLATION | **99.9%** | 50.3% |
| Mismatch-flagged possessions | **100.0%** | 62.5% |

### The Kareem / Oscar example

Same fixture, same seeds.

| Player | Before | After |
| --- | --- | --- |
| Kareem Abdul-Jabbar | **57.2%** of team FGA | **41.1%** |
| Marques Johnson | 13.2% | 18.7% |
| Oscar Robertson | **11.9%** | **16.0%** |
| Lou Hudson | 10.5% | 14.7% |
| Curtis Perry | 7.3% | 9.5% |

In the single game quoted in the Phase 6C1 report (seed 12345), Kareem went from
**63 of 109** team shots to **41 of 103**, and Oscar Robertson from **11**
attempts to **21**.

## 2. Team output — deliberately almost unchanged

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| Pace | 104.17 | 104.09 | −0.08 |
| Offensive rating | 113.54 | 112.46 | −1.08 |
| Defensive rating | 112.08 | 111.46 | −0.62 |
| eFG% | 0.5189 | 0.5102 | −0.009 |
| TS% | 0.5421 | 0.5354 | −0.007 |
| FG% | 0.4991 | 0.4872 | −0.012 |
| TOV% | 0.1125 | 0.1130 | +0.001 |
| ORB% | 0.3452 | 0.3427 | −0.003 |
| FTr | 0.2618 | 0.2612 | −0.001 |
| **3PAr** | 0.1194 | **0.1378** | **+0.018** |
| AST rate | 0.4645 | 0.4661 | +0.002 |
| Points | 118.88 | 117.83 | −1.06 |

**This is the intended shape of the result.** Opportunity allocation changes
*who* shoots, not *how well*, so team efficiency should barely move — and it
barely moved. The one substantial change, 3PAr **+0.018**, comes from the
separate three-point anchor correction.

**FG% remains above its era.** It fell only 0.012, which is the honest outcome:
this phase deliberately did not tune conversion.

## 3. Action mix — unchanged

| Family | Before | After | Δ |
| --- | --- | --- | --- |
| POST_UP | 0.1671 | 0.1667 | −0.000 |
| TRANSITION | 0.1455 | 0.1482 | +0.003 |
| GENERIC_HALF_COURT | 0.1315 | 0.1319 | +0.000 |
| PICK_AND_ROLL | 0.1237 | 0.1234 | −0.000 |
| ISOLATION | 0.1124 | 0.1129 | +0.001 |
| OFF_BALL_SCREEN | 0.1097 | 0.1088 | −0.001 |
| CUT | 0.1006 | 0.1006 | 0.000 |
| SPOT_UP | 0.0537 | 0.0523 | −0.001 |
| ZONE_ATTACK | 0.0303 | 0.0302 | −0.000 |
| HANDOFF | 0.0256 | 0.0251 | −0.001 |

Every delta is under 0.003. The fix changed **who takes the shot inside an
action**, not which actions are run — which is what it was supposed to do.

## 4. Three-point attempts vs the era environment

| Era | Env 3PA | Before | After | Gap before | Gap after |
| --- | --- | --- | --- | --- | --- |
| 1950s–1970s | 0 | 0 | 0 | 0 | 0 |
| 1980s | 4.7 | 4.6 | 4.54 | −0.1 | −0.2 |
| 1990s | 9.0 | 9.3 | 8.96 | +0.3 | **−0.0** |
| 2000s | 16.0 | 12.6 | 15.3 | **−3.4** | **−0.7** |
| 2010s | 24.1 | 24.0 | 29.0 | −0.1 | **+4.9** |
| 2020s | 37.8 | 30.9 | 39.0 | **−6.9** | **+1.2** |

The 18% 2020s shortfall is resolved and the 2000s gap shrank fourfold. **The
2010s now overshoots by 4.9**, which is a new error introduced by the anchor
correction and is recorded as such rather than tuned away.

## 5. Field-goal decomposition

Expected and realised make percentages agree to within **0.003** in every action
family and every shot category. The conversion model is faithful to the
shot-quality model — **high FG% is not a conversion defect.**

The cause is shot **location**:

| Category | Share of shots | Make% |
| --- | --- | --- |
| RIM | **0.355** | 0.590 |
| MIDRANGE | 0.286 | 0.432 |
| PAINT_OR_POST | 0.231 | 0.474 |
| THREE_POINT | 0.128 | 0.335 |

**58.6% of all shots are rim or paint.** That interior-heavy mix, not a generous
conversion curve, is why team FG% sits above its era.

Per-era FG% gap against the environment (after corrections): 1950s +0.046,
1960s +0.026, 1970s +0.084, 1980s +0.047, 1990s +0.034, 2000s +0.043,
2010s +0.003, 2020s −0.023. Every era improved on Phase 6C1, and the 1970s
remains the worst.

## 6. Player tails

| Card | Mean PTS before | Mean PTS after | Mean shot share after |
| --- | --- | --- | --- |
| Kareem Abdul-Jabbar | 90.1 | **61.7** | 0.392 |
| Kevin McHale | 75.1 | **43.5** | 0.304 |
| Bill Russell | 65.4 | **31.7** | 0.227 |
| Rick Barry | 62.2 | 54.2 | 0.359 |
| Shaquille O'Neal | 60.0 | **36.9** | 0.283 |
| Michael Jordan | 45.1 | 40.0 | 0.358 |

**No card now exceeds a 0.40 mean shot share** (several did before). Bill
Russell — a famously low-usage defensive anchor whom the engine had scoring 65 a
game — fell to 31.7.

Three cards still average over 45 points (Kareem 61.7, Rick Barry 54.2, Bob
Cousy 48.1). These remain implausible. Part is structural — five-man lineups
with no bench concentrate everything — and part is the team-scoring level, which
is an efficiency question deferred to Phase 6C2B.

Rebound and assist ceilings are unchanged and plausible: Russell 31.8 rebounds
per game with a 52 maximum, Cousy 10.4 assists with a 26 maximum.

## 7. What this delta does **not** claim

A structural correction is not successful merely because scoring fell.

**Preserved, and checked:**

- Team identity — action mix moved by under 0.003 everywhere.
- Player role hierarchy — the top-usage player still out-shoots the
  bottom-usage player, and the elite creator still leads.
- Matchup exploitation — a severe mismatch still yields 68% of post-ups and a
  maximum single-game share above 0.45.
- Coach identity — Phil Jackson still has the lowest pick-and-roll share of any
  coach and D'Antoni the highest.
- Era expression — pace unchanged; 3PAr now tracks the era environment more
  closely.
- Statistical conservation — **0 invariant violations**, 0 ties.
- Game variance — outlier games survive; the maximum leading share is 0.541.

**Tradeoffs, stated plainly:**

- The 2010s three-point rate now overshoots by 4.9 attempts where it was
  previously accurate. The anchor correction fixed a systematic formula error
  and introduced a smaller era-specific one.
- FG% is still above its era in seven of eight eras.
- Three cards still average over 45 points per game.
- The zone-frequency problem is untouched and still erases coach identity
  against a zone-playing opponent.
