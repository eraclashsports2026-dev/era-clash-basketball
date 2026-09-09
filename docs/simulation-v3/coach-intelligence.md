# Coach Intelligence (V3)

**Status:** built, hidden, wired to nothing.
**Files:** `src/v3/coachIntelligence.js`, `tests/v3-coach-intelligence.test.js`,
`benchmarks/v3/coach-intelligence.mjs`.
**Versions:** `coachIntelligenceVersion` 1.0.0 (DEVELOPMENT) · `coachDataVersion` 1.1.0 (ACTIVE).

> Player Intelligence: *what kind of player is this?*
> Team Intelligence: *do these five form a team?*
> **Coach Intelligence: how does this coach try to use this roster?**

It deliberately does **not** answer "how good is this coach?".

## 1. No universal Coach OVR

There is no coach rating, and a test asserts the field does not exist on any
profile or fit.

Coach effectiveness is **contextual**. Mike Fratello's tempo suppression is a
gift to a lineup that cannot run and an act of vandalism against one built to.
Doug Moe's passing game is brilliant with five willing passers and unplayable
with one ball-dominant isolation scorer. Collapsing that into "Fratello = 88"
throws away the only thing that matters. Player OVR already demonstrates the
failure mode.

Fit is reported as **bands** — `POOR` · `LIMITED` · `WORKABLE` · `GOOD` ·
`EXCELLENT` — never as "93.74% fit".

## 2. Data model

Per coach: `careerSpan` · `record` · `teams` · `systemTags` · `careerPhases` ·
`toolkit`, then

- **offense (11):** tempo, transitionEmphasis, motion, pickAndRoll, postUsage, isolation, threePointEmphasis, insideOut, offBallMovement, ballMovement, starCreatorFreedom
- **defense (8):** manPreference, zonePreference, switching, dropCoverage, pressure, helpAggression, rimProtectionPriority, defensiveReboundingPriority
- **management (5):** adaptability, tacticalAdjustment, roleDiscipline, starEmpowerment, rotationDepth
- **rosterPreferences (9):** primaryCreator, multipleCreators, movementShooting, passingBig, shootingBig, traditionalCenter, switchableWings, defenders, transitionAthletes

plus `provenance` (documented / inferred / sources, kept separate), `confidence`,
`dataVersion`, `intelligenceVersion`.

**Documented facts and analyst inference are listed apart** because a 0–10
rating is inference even when the system behind it is documented.

## 3. Career phases

A coach may adapt in-game **only with tactics their career actually
demonstrated** — the `toolkit` gates adaptation. A model must not hand Red
Auerbach a five-out offence because the maths likes it. Multi-phase coaches
(Riley Showtime → Knicks grind; Nelson's several systems) earned wider toolkits
by genuinely running different systems.

## 4. The fit model

Each dimension is a match between what the coach **demands** and what the roster
**supplies**, with two differently-weighted failures:

- **Unmet demand** — the system needs something the roster lacks. The serious
  one, scaled by how central the demand is: a coach needing 9 spacing on a
  2-spacing team has no system left.
- **Unused supply** — the roster has a strength the system ignores. Less
  damaging but real, and **scaled by how good the wasted strength is**.

> With a flat waste penalty, all 30 coaches landed within 1.2 points against a
> roster that defends everything well — not a recommendation, a shrug. Scaling
> the penalty by supply restored the distinction between a system that exploits
> a great defence and one that merely survives it.

**Dimensions:** offense (tempo, creation, spacing, movement, postPlay,
pickAndRoll, transition, roleDistribution, interiorGeometry) · defense
(pointOfAttack, switching, help, rimProtection, dropCoverage,
defensiveRebounding, transitionDefense) · management (usageHierarchy,
roleDiscipline, adaptabilityNeed, starManagement, lineupFlexibility).

Management fit reads the roster's **situation**, not just an attribute:
`usageHierarchy` asks whether a star-empowering system can be fed at all when
five primary creators share one ball.

## 5. Recommendation diversity

Nine strategic categories. **A coach may headline only one**, so three
recommendations are three different ideas rather than one ranking three times.

Each category carries a **demand floor**:

> A category must be won by *suitability*, never by *indifference*. Before the
> floor existed, Mike Fratello — the slowest-tempo coach in the pool — won
> "Best movement fit" on a low-spacing roster, because his system asks for
> nothing and so nothing was missing.

Every recommendation explains itself with **real numbers from this category**
("wants 7/10 transition against a roster supplying 7.1/10"), traceable to Team
Intelligence and Coach Intelligence.

## 6. Benchmark result

Full pool × 8 canonical lineups:

- **25 distinct category leaders**
- most dominant coach leads **10 / 72 categories (14%)**
- **18 different coaches** appear across 24 recommendation slots
- every lineup gets 3 distinct coaches and 3 distinct angles

A test fails if one coach wins every lineup or leads >40% of categories — that
would be evidence of a structurally biased fit model, not of a great coach.

## 7. Independence

| Independence | Enforced by |
| --- | --- |
| **Era** | no era import; identical output under conflicting era contexts |
| **Opponent** | no opponent parameter; base fit only |
| **Seed** | source grep for RNG |
| **Production** | no `src/v3/*` or `api/_lib/*` module imports it |

`ctx` is accepted and deliberately ignored — the extension point where era and
opponent attach in later phases.

## 8. Confidence

Fit confidence inherits the **weaker** of the coach profile and the team inputs.
A confident coach profile applied to a lineup of low-confidence player data does
**not** produce a confident conclusion.

`sensitiveDimensions` names spacing, postPlay, and interiorGeometry — the
dimensions resting on the least-verified player data. See
`player-data-risk-register.md`.

## 9. Caching

```
coachfit:v{CI}:cd{coachData}:ti{teamIntel}:pi{playerIntel}:{coachId}:{teamFingerprint}
```

Deliberately **excludes** seed, opponent, and era — none is an input to base
fit. Contextual fit will need its own identity including them, not a quiet
widening of this one.

**Layer: process memory.** One fit is **0.0052 ms**; a KV round trip is 10–50 ms.
Persisting it would make it ~2,000× slower and cost money to do so.

## 10. Performance

| Operation | Time |
| --- | --- |
| Coach profile build | **0.0005 ms** |
| One coach fit | **0.0052 ms** |
| Full pool (30) + recommendations | 6.55 ms |
| Full benchmark (8 lineups × 30) | 5.66 ms |

## 11. Future integration

- **Era Style (Phase 5)** — constrains which systems are viable in an era.
- **Opponent matchup** — contextual fit against a specific opponent.
- **Possession engine** — consumes `expectedStyleChanges` to modify usage
  distribution, action selection, pace, shot profile, and defensive scheme.

Coach influence must remain **mechanical**. There is no `coachBonus = +8` and
there never should be: a coach changes *what the team does*, not *how much it
scores*.
