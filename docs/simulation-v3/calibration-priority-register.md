# Calibration priority register — updated after Phase 6C2A

What Phase 6C2B should tune, what was fixed structurally, and what cannot be
fixed without a decision.

Priorities are assigned by **impact on historical plausibility × breadth of
effect**. Every entry names the measurement that found it and the command that
reproduces it.

Nothing here was tuned in Phase 6C2A. Structural defects were corrected;
coefficients were not.

---

## RESOLVED_STRUCTURALLY

### R1 — Usage concentration on the leading option *(was CRITICAL C1)*
**Was:** leading option took 38.8% of team FGA (p95 56%, max 70%); post-ups
100.0% and isolations 99.9% to one player.
**Cause:** three families selected with `mism ? mism.player : rng.weighted(...)`
— a replacement, not a bias. A mismatch held nearly always, so the same player
was chosen deterministically every possession.
**Fixed:** bounded multiplicative allocation with soft saturation.
**Now:** mean **0.318**, p95 **0.386**, max **0.541**; post-up 68.0%, isolation
50.3%. Entropy 2.09 → 2.21 of a 2.322 maximum.
**Residual:** see H1 below — 0.318 is still above a real primary option's
0.25–0.30.
**Source:** `calibration:freeze-structural`.

### R2 — Shooting vocabulary mismatch *(newly found, would have been CRITICAL)*
**Was:** five call sites keyed on `{ELITE, STRONG, AVERAGE, LIMITED, MINIMAL}`
while the data uses `{ELITE, GOOD, AVERAGE, LIMITED, NONE, UNKNOWN}`. **317 of
381 cards** silently defaulted to AVERAGE, including the **11 documented as
`NONE`** — turning "cannot shoot" into "average shooter". `threeVolume` expected
`MEDIUM`; the data says `MODERATE`, so 38 moderate-volume shooters read as
low-volume.
**Fixed:** one canonical scale that **throws** on an unrecognised value. Values
re-pointed, not tuned.
**Now:** three rate by shooter tier went from flat (0.320 / 0.321 / 0.320) to
differentiated (0.310 UNKNOWN, 0.415 LIMITED, 0.465 GOOD).

### R3 — Three-point era anchor could not reach its target *(was HIGH H3)*
**Was:** 2020s 3PA 18% below the era environment.
**Cause:** arithmetic. The anchor scaled the three weight by `target/natural`
without renormalising, giving a share of `target/(1−natural+target)`. In the
2020s: `0.403/(1−0.1349+0.403) = 0.3178` — exactly the measured value. **The
anchor could not hit its own target by construction.**
**Fixed:** scale the **odds** rather than the share.
**Now:** 2020s −7.0 → **+1.2**; 1980s, 1990s and 2000s all within 0.7.
**Introduced:** see M1 — the 2010s now overshoots.

### R4 — Latent roster-order dependence *(newly found)*
`prepareTeam` paired the canonical usage plan with the caller-ordered roster by
index. Every corpus fixture is already in canonical order so no stored result
was affected, but a reversed roster moved a player's shot share by **9.8
percentage points** against a **0.24pp** control. Keyed by card id: **0.41pp**.

### R5 — Silent first-item fallback in weighted selection *(newly found)*
`rng.weighted` returned `items[0]` when every weight was invalid, making a NaN
bug indistinguishable from a modelling decision. It now throws. A related trap
was removed in the same pass: weights were floored at `1e-6` unconditionally,
which turned a NaN into a valid tiny weight and made the new guard
**unreachable**.

### R6 — Zone side attribution *(was a reporting defect)*
Phase 6C1 read the zone deltas against the wrong side. Every row now names both
sides, and a guard asserts that ZONE_ATTACK possessions belong to the side
**facing** a shell. **0 violations.** The guard caught a flaw in the first
version of the experiment itself.

### R7 — Doc Rivers "zone offence" *(was HIGH H2, misdiagnosed)*
The 56.6% `ZONE_ATTACK` share is the **opponent's** shell, not his philosophy:
all twelve coaches show 0.536–0.574 against the same opponent. The coach who
plays the zone is Erik Spoelstra. Metrics are now separated into
`defensiveZoneUsage`, `zoneAttackShareAgainstOpponentZone` and
`offensiveActionMix`.

### R8 — Bill Sharman generic fallback *(was MEDIUM M1)*
37.4% generic became **0.065–0.071** with no coach mapping change. It was a
symptom of the shot distribution, so no Sharman-specific correction was
warranted.

### R9 — Post-up as the default family *(was HIGH H4)*
Post-up was top or near-top for eight of sixteen coaches. It is now
roster-driven: 0.000–0.008 for a perimeter 1990s roster, 0.238 for an
interior-heavy one — a roster spread of **0.149**.

---

## CRITICAL

*(none — C1 and C2 were resolved structurally or downgraded)*

---

## HIGH

### H1 — Leading-option share still above a real primary option
**Measured:** mean **0.318**, p95 0.386, max 0.541, against ~0.25–0.30 for a
real primary option. Three cards still average over 45 points (Kareem 61.7,
Rick Barry 54.2, Bob Cousy 48.1).
**Why it is no longer critical:** the pathological tail is gone (max 0.70 →
0.54) and no card exceeds a 0.40 mean share.
**Note:** part of the residual is structural — five-man lineups with no bench
concentrate more than a twelve-man rotation, where an even split is 20%.
**Proposed 6C2B parameter:** `SATURATION.strength`, currently 1.35.
**Overfitting risk:** MEDIUM — tuning it against a small corpus could flatten
genuinely heliocentric teams.

### H2 — Shot location is too interior
**Measured:** RIM **0.355** of all shots and rim-or-paint **0.586**, against
roughly 0.30 and 0.45 in the modern NBA.
**Why high:** this, not the conversion curve, is why FG% sits above its era —
expected and realised make percentages agree to within **0.003** everywhere.
**Proposed 6C2B parameter:** the `rimBias` multipliers in `chooseShotCategory`
and the `RIM` term in `shotProfileFor`.
**Overfitting risk:** LOW — the target is an era-level shot mix, which is well
documented.
**Source:** `calibration:fg-decomposition`.

### H3 — Team FG% above the era environment
**Measured:** +0.046 (1950s), +0.026, **+0.084 (1970s)**, +0.047, +0.034,
+0.043, +0.003, −0.023 (2020s). Every era improved on Phase 6C1 but the shape is
unchanged: positive, and inconsistent across eras.
**Do not fix by** flattening all-time teams to league average — that violates
the doctrine. Fix the era-dependence, and expect H2 to resolve much of it.
**Overfitting risk:** MEDIUM.

### H4 — Zone selected far too frequently
**Measured:** a zone-capable coach plays a shell on **~55%** of possessions.
Real NBA zone usage is a low single-digit percentage.
**Why high:** it erases the opposing coach's identity — every family's spread
collapses to under 0.01 against a zone opponent, against 0.139 for
pick-and-roll otherwise.
**Not fixed here** because lowering coach weights would treat the symptom; the
defect is in shell-selection frequency.
**Overfitting risk:** LOW — the target is well documented.

---

## MEDIUM

### M1 — 2010s three-point rate now overshoots
**Measured:** +4.9 attempts (29.0 vs 24.1), where it was previously accurate at
−0.1. Introduced by the R3 anchor correction, which fixed a systematic formula
error and left a smaller era-specific one.
**Proposed 6C2B parameter:** per-era `tpaPerGame` consumption.

### M2 — Zone concedes too many offensive rebounds
**Measured:** facing a 2-3 raises the attacking team's ORB% by ~7 points and
ORtg by ~5, confirmed in both directions of the same matchup. Real zone-vs-man
differentials run 2–4 points.
**Caveat:** one zone-capable coach in the corpus.

### M3 — Weak-shooting lineups still shoot near league average
**Measured:** the controlled elite-to-weak eFG% spread is 0.013–0.027 in
pre-three-point eras and 0.053–0.060 in the modern ones. The ordering is correct
everywhere; the range is compressed at the bottom.

### M4 — Pace responds weakly to team and coach identity
Unchanged from Phase 6C1: pace tracks the era environment well (the best result
in the report) but a transition team sits only ~1.2 possessions above a
half-court team in the same era.

### M5 — Fixture lineup labels overstate lineup fidelity
**Measured:** only **1 of 26** fixtures is genuinely the documented starting five
of its named season, and it is in the holdout. `2010s-warriors-movement` is
labelled `DOCUMENTED_STARTING_FIVE` for 2015-16 but contains LeBron James and
Nikola Jokić; `2020s-nuggets-hub` matches 1 of 5. Mean fidelity 56%.
**Not changed here:** corpus membership and labels were left alone deliberately.
Rewriting a fixture is a decision of its own and must never be made to improve a
result. Evidence is recorded in the target store as `seasonCrossCheck`.

---

## LOW

### L1 — Shooting-tier coverage
273 of 381 cards have `UNKNOWN` perimeter skill, so the real-roster shooting
hierarchy is testable in only 1 of 8 eras. The controlled arm covers all 8.

### L2 — Zone shell coverage
Only one zone-capable coach, so **3-2, MATCHUP, BOX-AND-ONE and
TRIANGLE-AND-TWO have never been selected** and remain untested.

### L3 — Probability calibration unmeasured
The engine emits no pregame win probability on this path.

### L4 — 1970s shooting-hierarchy tie
Controlled AVERAGE vs LIMITED differ by −0.0007 in the 1970s: a tie, not an
inversion, in the engine's highest-efficiency era.

---

## DATA_BLOCKED

### D1 — Team-season advanced metrics *(reason corrected)*
**Phase 6C1 recorded this as HTTP 403. That was wrong.** The 403 was an artifact
of one fetch tool's user agent; with an honest self-identifying agent on a
robots-permitted path the site returns 200 with the full advanced table.

The real barrier is the **terms of use**, which forbid using the statistics
"for purposes of training, fine-tuning, prompting, or instructing artificial
intelligence models or technologies in any manner". Calibrating a model against
that data is inside that prohibition.

**This correction matters.** A technical block invites a technical workaround; a
licence term does not. **Remedy: a licence or express written permission** — not
engineering.

### D2 — Most fixtures have no real team-season
Independent of D1: **22 of 26 fixtures span multiple franchises**, and only 1 is
the true documented five of its named season. Even with a licence, a team-season
efficiency target would be a comparison against a team that never played. Team
targets are labelled `NOT_APPLICABLE_SYNTHETIC_LINEUP`, which is a different
fact from `SOURCE_BLOCKED_LICENSING`.

### D3 — Pre-1974 steals and blocks
Not recorded before 1973-74. `RESEARCH_ONLY`; no exact values will be created.

### D4 — Wingspan and physical measurements
`wingspanIn` stays null. Not inferred from height.

---

## DEFERRED_TO_PARAMETER_CALIBRATION

All of H1–H4 and M1–M4 are parameter work for Phase 6C2B, in this order:

1. **H2 shot location** — likely resolves much of H3 as a side effect.
2. **H4 zone frequency** — unlocks a clean coach-identity measurement.
3. **H3 FG% era-dependence** — measure again only after 1 and 2.
4. **H1 saturation strength** — smallest remaining effect, highest overfitting
   risk, so tune it last.
5. **M1 per-era three-point consumption.**

Each must be validated against the calibration set only. The holdout stays
sealed until 6C2B tuning is complete.

---

## CEO decisions required

1. **A licensed data source for team-season advanced metrics (D1).** The barrier
   is a licence term, not a technical block, so it cannot be engineered around.
2. **Whether to correct the fixture lineup labels (M5).** Evidence is recorded;
   the change is deliberately not made, because editing the corpus is a decision
   of its own.
3. **Corpus expansion for zone-capable coaches and curated shooting tiers**
   (L1, L2), which currently limit two findings to a single matchup and a single
   era.
