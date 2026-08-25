# Calibration priority register — Phase 6C1

What Phase 6C2 should fix, in order, and what it cannot fix without a decision.

Priorities are assigned by **impact on historical plausibility × breadth of
effect**, not by ease of repair. Every entry names the measurement that found
it, so a later fix can be checked against the same number.

Nothing in this register has been fixed. Phase 6C1 measured; it did not tune.

---

## CRITICAL

### C1 — Usage concentration on the leading option
**Measured:** leading option takes **38.8%** of team FGA on average (p95 56%,
max 70%); an even five-way split is 20% and a real primary option runs 25–30%.
Kareem Abdul-Jabbar averages **90.1 points**; Bill Russell averages 65.4.
**Why critical:** it is the widest-reaching defect in the engine and plausibly
the root cause of three separate symptoms — inflated team FG% (§2 of the
baseline report), post-up dominance across coach identities (§6), and
implausible player ceilings (§4). The 1970s is simultaneously the worst FG% era
and the worst concentration case.
**Note:** the statistical invariants are *intact* — player lines sum exactly to
team lines. Conservation was never the problem. The invariants guarantee the
split adds up; they say nothing about whether it is sane.
**Source:** `calibration:diagnostics`.

### C2 — Team FG% above era environment, inconsistently by era
**Measured:** +0.055 (1950s), +0.036 (1960s), **+0.095 (1970s)**, +0.054
(1980s), +0.046 (1990s), +0.058 (2000s), +0.014 (2010s), −0.017 (2020s).
**Why critical:** a positive deviation is correct — these are all-time rosters
above their era's average. The defect is that the deviation varies **sevenfold**
between eras. The same class of roster should sit a similar distance above its
own environment.
**Do not fix by** flattening all-time teams toward league average. That would
violate the locked doctrine. Fix the era-dependence, not the sign.
**Source:** `calibration:era`. Partly downstream of C1 — retest after C1.

---

## HIGH

### H1 — Zone concedes far too many offensive rebounds
**Measured:** enabling a zone shell raises the attacking team's ORB from 11.58
to **16.04 (+38%)**, worth +4.7 ORtg, while eFG% moves only +0.006. Net effect:
the zone-playing side loses 10 points of win rate.
**Why high:** the direction is defensible (zones do rebound worse — defenders
guard areas, so nobody owns a box-out) but real zone-vs-man ORB% differentials
run 2–4 percentage points against the **+7.3** measured here. Rebound
attribution was verified correct across 1,221 rebounds, so this is a rate
problem, not a crediting bug.
**Caveat:** rests on **one** matchup. Add zone-capable fixtures before treating
the magnitude as settled.
**Source:** `calibration:zone`.

### H2 — Zone selected far too frequently when a coach has it
**Measured:** `ZONE_ATTACK` reaches **56.6%** of possessions against a
zone-capable coach. Real 2010s NBA zone usage was a low single-digit percentage.
**Why high:** it erases the opposing team's identity — the Clippers' pick-and-roll
share fell to **zero** in a fixture built around the pick-and-roll.
**Source:** `calibration:coaches`.

### H3 — Three-point volume short at high-volume extremes
**Measured:** 2020s takes 30.9 attempts against a 37.8 environment (**−18%**);
2000s is −3.4. The 1980s, 1990s and 2010s are within 0.3.
**Why high:** it inverts the historical direction of offensive rating (1970s
119.0 → 2020s 107.1, when real league ORtg has risen), and it produced the one
shooting-hierarchy violation: a volume-three ELITE_OFFENSE fixture with the
lowest eFG% in its era.
**Source:** `calibration:era`, `calibration:shooting-hierarchy`.

### H4 — Post-up is the default action family too often
**Measured:** top or near-top family for **8 of 16** coaches, including 2010s
Spoelstra — an era when post-up volume was falling sharply.
**Why high:** it flattens era-appropriate offensive style. Likely coupled to C1
(post-ups feed the leading option); retest after C1 before tuning separately.
**Source:** `calibration:coaches`.

---

## MEDIUM

### M1 — Generic half-court fallback absorbs too much for some coaches
**Measured:** Bill Sharman at **37.4%** GENERIC_HALF_COURT, so his documented
identity is largely unexpressed. Range across coaches is 0.074–0.374.
**Source:** `calibration:coaches`.

### M2 — Weak-shooting lineups shoot near league average
**Measured:** the 2010s "weak" group (Wall, Westbrook, DeRozan, Draymond,
Drummond) posts eFG% **.5036**. The elite-to-weak spread is 7.8 eFG points,
which is compressed — five poor shooters should land clearly *below* average.
**Note:** the ordering itself is correct and clean (.5813 / .5398 / .5036). This
is about the width of the range, not its direction.
**Source:** `calibration:shooting-hierarchy`.

### M3 — Player point ceilings implausible
**Measured:** single-game maxima of 118 (Kareem), 107 (McHale), 95 (Russell).
**Why medium not critical:** almost entirely a symptom of C1 rather than an
independent defect. Retest after C1; expect it to resolve.
**Source:** `calibration:diagnostics`.

### M4 — Pace responds weakly to team and coach identity
**Measured:** pace tracks the era environment well (mean absolute deviation
≈ 2.2 possessions across a 40-possession era range — the best result in the
report), but a transition team sits only **+1.2** possessions above a
half-court team in the same era.
**Why medium:** the environment reproduction is genuinely good. The concern is
that roster and coach construction barely move pace, which is thin under the
doctrine's second half.
**Source:** `calibration:era`, `calibration:run`.

---

## LOW

### L1 — Shooting-tier coverage limits the hierarchy test to two eras
Six of eight eras cannot field three legal lineups from curated shooting tiers.
Fixed by curating more cards, not by inferring tiers. See the player cohort.

### L2 — Zone-capable coach coverage limits the zone experiment to one matchup
Fixed by adding zone-capable fixtures to the corpus.

### L3 — Probability calibration unmeasured
Framework built and unit tested; the possession engine does not yet emit a
pregame win probability on this path.

---

## DATA_BLOCKED

### D1 — Team-season efficiency calibration
**Blocked because:** team advanced metrics (pace, ORtg, DRtg, eFG%, TS%, TOV%,
ORB%, FTr, 3PAr) live almost exclusively on basketball-reference, which returns
**HTTP 403** to automated fetches. Wikipedia season articles carry standings and
individual leaders but no team advanced tables; aggregator pages carry player
rows, not team rows.
**Effect:** **209 of 209** target comparisons in the calibration set are
unavailable. There is no numeric error surface against real team-seasons, and
no weighted MAE can be computed.
**Not worked around.** Targets stay `null` with `SOURCE_BLOCKED`. A fabricated
target would have produced a complete-looking error table that was pure fiction
and undetectable downstream.
**Needs a CEO decision** — see below.

### D2 — Pre-1974 steals and blocks
Not recorded before 1973-74. Remains `RESEARCH_ONLY`; no exact values will be
created for those seasons.

### D3 — Wingspan and physical measurements
`wingspanIn` is `null` by policy and stays null. Not inferred from height.

---

## CEO decisions required

1. **Licensed data source for team-season advanced metrics (D1).** Without one,
   efficiency calibration cannot proceed against real team-seasons and Phase 6C2
   would be tuning against era environment baselines alone. Options: license a
   statistics provider, obtain permission for basketball-reference access, or
   accept era-environment-only calibration and say so publicly in the engine's
   status.
2. **Corpus expansion budget.** L1 and L2 both stem from thin curated coverage.
   Widening the shooting-tier set and adding zone-capable fixtures would make
   two currently-directional findings load-bearing.
3. **Whether C1 is fixed before or alongside C2/H4/M3.** They are plausibly one
   root cause with several symptoms. Fixing them independently risks
   double-correcting, which would look like progress on each metric while making
   the model worse.
