# Calibration baseline report — Phase 6C1

**Status: DEVELOPMENT — CALIBRATION REQUIRED.**

This report measures the **untuned** possession engine against the historical
fixture corpus. Nothing here was tuned, and no coefficient was changed to
improve any number below. The engine is not historically authoritative, not
validated, and not accurate. The point of this document is to record where it
stands before tuning, so Phase 6C2 can tell a genuine fix from a coincidence.

Every finding below is reported as measured, including the ones that are bad.

- Engine: `possessionEngineVersion` **1.1.0** (DEVELOPMENT, flag-gated, default off)
- Corpus: `historicalFixtureDataVersion` **1.0.0** — 26 fixtures, 8 eras
- Calibration set: 19 fixtures · manifest `fd1a2c9fc4d8ece1`
- Holdout: 7 fixtures · manifest `cb863d5de2734f74` · **SEALED, never read**
- Seeds: `benchmarkSeedSetVersion` **1.0.0**, derived reproducibly from named roots
- Sample: 1,000 simulations per fixture for the main run; 200–300 for controlled experiments

---

## 1. The headline result: no numeric error surface exists yet

**209 of 209 target comparisons in the calibration set are unavailable.**

| | |
| --- | --- |
| Comparisons attempted | 209 (19 fixtures × 11 metrics) |
| Comparisons with a sourced target | **0** |
| Weighted MAE | **not computable** |

This is not a harness failure. It is the data situation, reported honestly.
Team-season advanced metrics (pace, ORtg, DRtg, eFG%, TS%, TOV%, ORB%, FTr,
3PAr) live almost exclusively on basketball-reference, which returns **HTTP
403** to automated fetches. Wikipedia season articles carry standings and
individual leaders but no team advanced tables. Aggregator pages carry player
rows, not team rows.

The corpus therefore holds `null` with `targetAvailability: SOURCE_BLOCKED`
rather than plausible-looking numbers. The one sourced numeric target in the
whole corpus — the 1980s Lakers at **117.8** points per game,
`RECORDED_STATISTIC` — sits in the holdout and has not been used to tune
anything.

**A fabricated target would have produced a complete-looking error table that
was pure fiction, and nothing downstream could have detected it.** That
trade — an empty column instead of a false one — is deliberate.

**Consequence:** efficiency calibration against real team-seasons is
`DATA_BLOCKED`. It needs a licensed data source. See the CEO decision in the
priority register.

## 2. What *is* measurable: the era environment

The in-repo era environment baselines are sourced and confidence-graded, so
they give a real error surface. Under the locked doctrine, the Era Style
supplies the historical **environment** and roster quality decides how far above
it a team plays — so a deviation of zero would be *wrong*, and the question is
whether the deviations are plausible and consistent.

| Era | Pace env → sim (Δ) | FG% env → sim (Δ) | 3PA env → sim (Δ) | Sim ORtg |
| --- | --- | --- | --- | --- |
| 1950s | 119.7 → 120.4 (**+0.7**) | .383 → .438 (**+.055**) | 0 → 0 (0) | 105.0 |
| 1960s | 121.5 → 126.1 (**+4.6**) | .441 → .477 (**+.036**) | 0 → 0 (0) | 111.5 |
| 1970s | 106.5 → 109.8 (**+3.3**) | .465 → .560 (**+.095**) | 0 → 0 (0) | 119.0 |
| 1980s | 100.8 → 103.4 (**+2.6**) | .480 → .534 (**+.054**) | 4.7 → 4.6 (−0.1) | 116.0 |
| 1990s | 96.8 → 95.2 (**−1.6**) | .473 → .519 (**+.046**) | 9.0 → 9.3 (+0.3) | 116.1 |
| 2000s | 90.5 → 89.0 (**−1.5**) | .454 → .512 (**+.058**) | 16.0 → 12.6 (**−3.4**) | 115.5 |
| 2010s | 95.8 → 94.0 (**−1.8**) | .452 → .466 (**+.014**) | 24.1 → 24.0 (−0.1) | 111.9 |
| 2020s | 100.5 → 101.7 (**+1.2**) | .474 → .457 (**−.017**) | 37.8 → 30.9 (**−6.9**) | 107.1 |

**Pace reproduces the era environment well.** Mean absolute deviation ≈ 2.2
possessions across 40+ possessions of era-to-era range. This is the strongest
result in the report.

**FG% is systematically high, and inconsistently so.** Positive deviation is
expected — these are all-time rosters. The defect is that the size of the
deviation swings from **+1.4** points (2010s) to **+9.5** points (1970s). The
same class of all-time roster should sit a roughly similar amount above its
era's average, not seven times further in one era than another. The sign is
defensible; the era-dependence is not.

**Three-point volume is short at the extremes.** The 2020s takes 30.9 attempts
against an environment of 37.8 — an **18% shortfall** — and the 2000s is 3.4
short. The 1980s, 1990s and 2010s are close. The engine under-shoots threes
precisely where volume matters most.

**Offensive rating drifts the wrong way across history.** 1970s 119.0 → 2020s
107.1. Real league offensive rating has *risen* over time. In this engine,
all-time 1970s teams are more efficient than all-time 2020s teams, which
inverts the historical direction. This is downstream of the FG% and 3PA
findings above rather than a separate defect.

## 3. The most serious defect: usage concentration

| | Measured | Plausible |
| --- | --- | --- |
| Leading option's share of team FGA, mean | **0.388** | ~0.25–0.30 |
| Same, p95 | **0.562** | — |
| Same, max | **0.702** | — |
| Leading option's share of team PTS, mean | **0.409** | — |
| Even split across five | 0.200 | — |

A five-man lineup has no bench, so the leading option legitimately carries more
than in a twelve-man rotation. That does not cover this. The engine's **mean**
is above the highest FGA share any real primary option has sustained.

A single game makes it concrete — 1970s Bucks, seed 12345:

| Player | PTS | FGA | FGM |
| --- | --- | --- | --- |
| **Kareem Abdul-Jabbar** | **95** | **63** | **44** |
| Marques Johnson | 22 | 14 | 9 |
| Lou Hudson | 14 | 14 | 6 |
| **Oscar Robertson** | **10** | **11** | 4 |
| Curtis Perry | 4 | 7 | 2 |
| Team | 145 | 109 | — |

Kareem takes **58% of the team's shots** and scores **66% of its points**.
Oscar Robertson — an all-time lead guard — takes eleven shots.

The statistical invariants are intact: player lines sum to team lines exactly
(145 = 145). Conservation was never the problem. **The invariants guarantee the
split adds up; they say nothing about whether the split is sane.** That is the
gap this diagnostic exists to cover.

Even the fixture chosen specifically for egalitarian team basketball —
`1950s-celtics-team-basketball` — puts Bill Russell at **41.2%** of team shots,
and Russell was a famously low-usage defensive anchor.

Most concentrated fixtures (mean leading-option FGA share):

| Fixture | Share | Leading option |
| --- | --- | --- |
| 1970s-bucks-balanced | 0.472 | Kareem Abdul-Jabbar |
| 1970s-spurs-pace | 0.471 | George Gervin |
| 1980s-celtics-halfcourt | 0.427 | Kevin McHale |
| 1980s-bucks-defense | 0.426 | Sidney Moncrief |
| 1950s-pace-extreme | 0.413 | George Mikan |
| 1950s-celtics-team-basketball | 0.412 | Bill Russell |
| 2000s-lakers-interior | 0.409 | Shaquille O'Neal |

**This one defect plausibly explains three findings at once.** Post-up is the
top action family for eight of sixteen coaches (§6); post-ups feed the best
interior player; that player then shoots at a volume and efficiency that drags
team FG% above its era (§2). The 1970s is the worst FG% era **and** holds the
worst concentration case. One root cause, three symptoms — which is why this is
the highest-priority item for Phase 6C2.

## 4. Player statistical ceilings and floors

Direct consequence of §3. Per-game means across 400–600 appearances:

| Card | Mean PTS | Max | Reality |
| --- | --- | --- | --- |
| Kareem Abdul-Jabbar | **90.1** | 118 | career high 24.6/season |
| Kevin McHale | **75.1** | 107 | career high 26.1 |
| Bill Russell (60s) | **65.4** | 95 | career high 18.9 |
| Rick Barry | 62.2 | 92 | career high 35.6 |
| Shaquille O'Neal | 60.0 | 84 | career high 29.7 |
| Michael Jordan | 45.1 | 85 | career high 37.1 |

These are not credible. Reported plainly because the alternative — omitting the
table — would hide the clearest evidence of the usage defect.

Floors behave better. Among cards averaging 15+, the low end runs 0–2 points
with p05 of 4–9, which is a plausible bad night rather than a broken floor.
Rebound ceilings (Russell 50, Thurmond 45) and assist ceilings (Cousy 21, Bird
21, Robertson 20) are high but within the range of real extreme games.

## 5. Controlled zone comparison — replaces the selection-biased 67.5%

The earlier "zone wins 67.5%" figure was **selection bias**: zone-capable teams
in the corpus also happened to be better teams. This experiment holds teams,
coaches, era and **seeds** identical and moves only the zone flag.

| Era | Status | Δ win rate | Δ ORtg |
| --- | --- | --- | --- |
| 1950s–1990s (5) | era forbids zone | **0.000** | 0.0 |
| 2000s, 2020s (2) | era allows, coach declines | 0.000 | 0.0 |
| 2010s (1) | shell selected (2-3) | +0.100 | +5.2 |

**Era gating is exactly correct.** Zone was illegal until 2001-02, and the
delta in those five eras is precisely zero — not approximately zero.

The 2000s and 2020s rows are a **coach** decision, not a rules decision. An
earlier version of this experiment inferred legality from "did a shell appear"
and labelled those eras zone-illegal, which is false. Legality is now read from
the era rules directly.

**The one measurable case reverses the earlier conclusion.** The delta describes
the team *attacking* the zone, and it is positive — so enabling zone made the
zone-**playing** side lose 10 points more often. Zone is a net negative in this
engine.

The mechanism is offensive rebounding, not shooting:

| | Zone on | Zone off | Δ |
| --- | --- | --- | --- |
| Attacking team ORB | **16.04** | **11.58** | **+4.46 (+38%)** |
| Attacking team eFG% | .5192 | .5136 | +0.006 |
| Attacking team PTS | 107.2 | 104.8 | +2.4 |
| Zone team DRB | 35.13 | 36.48 | −1.35 |
| Zone team PTS | 101.6 | 102.2 | −0.6 |

Attribution was checked directly: across 1,221 offensive rebounds in zone-legal
games, **zero** were credited to a defender. The crediting is correct; the
*rate* is the problem. An offensive rebound extends a possession without
incrementing it, so a conceded-rebound bias feeds straight into points per
possession.

**Direction is defensible, magnitude is not.** Zones genuinely rebound worse
than man — defenders guard areas, so nobody owns a box-out. But real zone-vs-man
offensive rebound differentials run 2–4 percentage points, not the **+7.3
points** of ORB% measured here.

**Corpus limitation, stated plainly:** zone-capable coaches are scarce, so the
entire measured zone effect rests on **one** matchup. This conclusion is
directional and needs more zone-capable fixtures before it is load-bearing.

## 6. Coach action identity

Coach identity is **real and differentiated** — the earlier concern about
post-up flatness at 21–25% does not survive contact with the data. Post-up now
ranges from 0 to 0.263 across coaches.

Correct signatures the engine produces unprompted:

| Coach | Signature | Reads as |
| --- | --- | --- |
| Phil Jackson | **lowest** PICK_AND_ROLL (0.080), OFF_BALL_SCREEN 0.146, HANDOFF 0.119 | the triangle, which famously avoids the pick-and-roll |
| Mike D'Antoni | **highest** PICK_AND_ROLL (0.211) **and** TRANSITION (0.203) | seven seconds or less |
| Steve Kerr | **highest** OFF_BALL_SCREEN (0.213), CUT 0.140 | movement offence |
| Doug Moe | OFF_BALL_SCREEN 0.169 top, CUT 0.150 | passing motion |
| Chuck Daly | POST_UP 0.263, PICK_AND_ROLL 0.195 | physical half-court |

Family spread across coaches: ZONE_ATTACK 0.566, GENERIC_HALF_COURT 0.300,
POST_UP 0.263, OFF_BALL_SCREEN 0.213, PICK_AND_ROLL 0.211, ISOLATION 0.193,
HANDOFF 0.119, TRANSITION 0.100, CUT 0.100, SPOT_UP 0.096.

Three problems:

1. **Zone frequency is far too high.** Doc Rivers' team shows `ZONE_ATTACK` at
   **0.566** of possessions — meaning its opponent played zone on 57% of
   possessions. Real 2010s NBA zone usage was a low single-digit percentage.
   Worse, it *erased* the fixture's own identity: the Clippers' PICK_AND_ROLL
   share fell to zero, and that team was built around it.
2. **Generic fallback catches too much for some coaches.** Bill Sharman sits at
   **0.374** GENERIC_HALF_COURT, so his identity is largely unexpressed.
3. **Post-up is the default too often.** It is the top or near-top family for
   eight of sixteen coaches, including 2010s Spoelstra — an era when post-up
   volume was falling sharply.

## 7. Shooting hierarchy

Measured directly from curated shooting tiers (ELITE / GOOD+AVERAGE /
LIMITED+NONE), all three groups facing the same opponent so only shooting
quality varies. Cards with an `UNKNOWN` tier are **excluded, not guessed**.

**2010s — full ordering holds:**

| Group | eFG% | TS% | 3PAr | Lineup |
| --- | --- | --- | --- | --- |
| elite | **.5813** | .6062 | .281 | Lowry, Curry, Klay, Durant, Dirk |
| average | **.5398** | .5545 | .252 | Luka, Kobe, LeBron, Jokić, KG |
| weak | **.5036** | .5353 | .215 | Wall, Westbrook, DeRozan, Draymond, Drummond |

Clean separation of ~4 eFG points per step, and three-point attempt rate orders
correctly too. **The shooting model responds correctly to shooting quality.**

**2020s:** only two of three groups could be fielded legally; average > weak
holds (.5770 vs .5549).

**Six of eight eras are not testable** — curated shooting tiers cover too few
cards to field three legal lineups. Reported as untestable rather than filled
with inferred tiers.

One caveat: the weak 2010s group still shoots **.5036**, roughly league
average. The floor is too high — a lineup of five poor shooters should be worse
than average, so the elite-to-weak spread of 7.8 eFG points is compressed.

The secondary view by fixture type is weaker (only the 1980s has both an
ELITE_OFFENSE and an ELITE_DEFENSE fixture) but flagged one violation:
`2020s-celtics-volume-threes`, an ELITE_OFFENSE built on three-point volume, has
the **lowest** eFG% in its era. Consistent with the 3PA shortfall in §2.

## 8. Adjustment baseline

Adjustments fire on a real ladder with distinct triggers — the Phase 6B2 fix
holds, and no single response dominates:

| Trigger → response | Count |
| --- | --- |
| EXCESSIVE_RIM_PRESSURE → CHANGE_PRIMARY_DEFENDER | 208 |
| POST_REPEATEDLY_EXPLOITED → CHANGE_PRIMARY_DEFENDER | 179 |
| MATCHUP_REPEATEDLY_BEATEN → CHANGE_PRIMARY_DEFENDER | 147 |
| PNR_REPEATEDLY_SUCCESSFUL → CHANGE_BALL_SCREEN_COVERAGE | 88 |
| MATCHUP_REPEATEDLY_BEATEN → CHANGE_BALL_SCREEN_COVERAGE | 9 |

Offensive adjustments are trigger-driven (`PNR_FAILURE → REDUCE_PNR`,
`POST_MISMATCH_AVAILABLE → INCREASE_POST_TARGETING`) with bounded magnitudes of
0.05. This is a baseline for comparison, not a pass/fail gate.

## 9. Probability calibration

The framework exists — reliability bins, Brier score, log loss, sharpness,
upset rate, and an explicit expected-vs-realized separation — and is unit
tested. **No probability calibration has been measured**, because the
possession engine does not yet emit a pregame win probability on this path.
Sharpness is reported next to Brier deliberately: a model that always predicts
50% is perfectly calibrated and completely useless.

## 10. What this report does not claim

- It does **not** claim the engine is accurate, validated, or historically authoritative.
- It does **not** contain a calibration. `possessionCalibrationVersion` is `null`/PLANNED, and the cache-key builder for calibrated results throws by design.
- It does **not** report a single opaque accuracy score. Component errors are retained so one easily-matched metric cannot mask a real failure.
- It does **not** use MAPE. Several targets can legitimately be zero, where a percentage error is undefined or explodes.
- It does **not** draw on the holdout. Seal status: **SEALED_UNREAD**, access count 0.
- It does **not** treat low source confidence as licence for a bad result. Low confidence lowers a fixture's weight; it never widens a tolerance, and it never increases simulation randomness.
