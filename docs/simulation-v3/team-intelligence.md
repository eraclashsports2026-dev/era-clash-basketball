# Team Intelligence (V3)

**Status:** built, hidden, wired to nothing.
**Files:** `src/v3/teamIntelligence.js`, `tests/v3-team-intelligence.test.js`,
`benchmarks/v3/team-intelligence.mjs`. **Model version:** 1.0.0.

> Player Intelligence answers *what kind of player is this?*
> Team Intelligence answers *do these five form a coherent basketball team?*

It does **not** decide who wins. It does not know there is an opponent.

---

## 1. Purpose

Five profiles in, construction analysis out: who needs the ball, who creates,
who keeps value without touches, whether the floor is spaced, whether guards,
wings and the rim can be defended, whether possessions get finished, and where
roles duplicate or go missing.

## 2. Inputs and outputs

```js
buildTeamIntelligence({
  playerCards,           // five PLAYERS entries or five card ids
  playerIntelligence,    // optional pre-built profiles
  positionAssignments,   // optional explicit slots; defaults to primary position
  ctx,                   // accepted and DELIBERATELY IGNORED
})
```

Output blocks: `lineupFingerprint` · `playerIds` · `positionAssignments` ·
`rolePlan` · `usagePlan` · `creationHierarchy` · `offense` (incl. `spacing`,
`interior`) · `defense` · `physical` · `rebounding` · `construction` ·
`identity` · `confidence` · `provenance` · `modelVersion`.

Validation throws on: not exactly five players, an unknown card id, two versions
of the same person, a wrong-length position array, an unrecognised position, or
a player assigned to a slot they cannot play.

## 3. Finite usage

Basketball has one ball. Shares **sum to exactly 1.0** — checked on the reported
(rounded) values, because rounding five shares to three places and hoping is how
a usage model quietly starts allocating 100.1% of one basketball.

There is **no superstar-stack penalty constant**. A test greps the source to
prove it. The cost emerges from three facts:

1. the budget is finite,
2. each player has a natural diet they are built for
   (`naturalShare` from `usageAppetite`, `creationDependence`, `selfCreation`),
3. `roleScalability` decides who keeps value once compressed.

A compressed player's `valueRetained` falls in proportion to how little of him
survives off the ball. Five ball-dominant stars are not *penalised* — they
simply cannot feed five diets from one ball, and the players whose value lives
on-ball lose more of it.

> **Compression does not un-make a creator.** An earlier version required a
> usage share to qualify as a primary creator, which produced exactly the wrong
> answer on the case this engine exists to explain: five stars compressed each
> other below the threshold, so the lineup reported **zero** primary creators.
> Creation tier is now capability; allocation is reported separately.

## 4. Creation hierarchy

Tiers: `PRIMARY` (selfCreation ≥ 7.5) · `SECONDARY` (≥ 6) · `TERTIARY` (≥ 4.5) ·
`NON_CREATOR`. Plus `hasCredibleCreator`, `tooManyPrimaries`,
`lateClockCreation`, `passingConnectivity`.

**A team with five passers is not a team with five primary creators.** Assists
are distribution; creation is manufacturing a good shot with no advantage handed
to you. The two are read from different attributes on purpose.

## 5. Spacing

**Not the average three-point rating.** Spacing is a property of the floor, not
of the mean player on it. Three things a mean cannot express:

- **Gravity is weighted by off-ball movement.** A low-volume standstill shooter
  does not bend a defence the way a high-volume movement shooter does.
- **Non-shooters do not average away.** The crowding penalty is superlinear
  (`n^1.7`): one is survivable, three collapse the floor.
- **Interior scoring occupies the paint it scores in** — valuable and congesting
  at once. A passing big relieves congestion a scoring big creates, which is why
  `passingBigRelief` exists as its own term.

Reported: `floorSpacing`, `gravityMean`, `weightedGravity`, `shooters`,
`movementShooters`, `nonShooters`, `interiorOccupancy`, `passingBigRelief`,
`conflicts`.

## 6. Interior offense

`rimPressure` · `postPlay` · `offensiveRebounding` · `interiorPassing` · `shape`.

**Two bigs are not automatically a problem — two bigs whose skills duplicate
are.** `shape` distinguishes `COMPLEMENTARY_INSIDE_OUT` from `PAINT_CONGESTION`,
`INTERIOR_DOMINANT`, and `PERIMETER_ORIENTED`.

## 7. Team defense

Coverage, never assignment — which opponent each defender takes belongs to the
Matchup Engine.

`pointOfAttack` · `wingContainment` · `rimProtection` · `helpDefense` ·
`switchability` · `defensiveRebounding` · `defensivePlaymaking` ·
`weakestPerimeter` · `gaps`.

**Defence is not additive.** One elite stopper does not make a lineup able to
guard five positions, so perimeter coverage weights the best *two* defenders —
and `weakestPerimeter` is reported separately, because an offence attacks the
weakest link by choice rather than at random.

Takeaways are **part** of defence, never the whole of it: `defensivePlaymaking`
is its own field and never substitutes for containment.

## 8. Physical balance

**Size is not universally good.** More size buys rebounding and interior
defence and costs pace and switchability; less size buys the reverse.

- `averageHeightIn` is **null**, not zero, when nothing is measured — an
  unmeasured lineup is not a short one.
- `speed` is always null: no accessible source publishes it, and it is never
  inferred from weight.
- `strengthProxy` is explicitly labelled a proxy.
- Size identity tags (`SMALL_BALL`, `OVERSIZED`) require **≥ 4 of 5 measured**.
  With two measured, an average of the two that happen to be tall is a statement
  about the sample, not the lineup.

Missing data reduces confidence. It never produces a value.

## 9. Rebounding

Offensive and defensive assessed separately, **never by summing RPG**. One elite
rebounder among four non-contributors is flagged as a vulnerability, not
celebrated as strength: `bestRebounder` and `supportingCast` are reported apart
so the difference is visible.

## 10. Role coverage and redundancy

Eight offensive and seven defensive roles, each with an explicit predicate.
Reported as `covered`, `missing`, and `redundant`.

**Deliberately not one ideal template.** Different legitimate basketball
identities must remain possible, so the layer reports what is covered and lets
the reader judge. Redundancy is only flagged where a team cannot use three (or,
for scarce roles like Primary Creator and Rim Protector, two).

## 11. Internal team identity

Descriptive tags — `MOTION_SPACING`, `INTERIOR_DOMINANT`, `DEFENSE_FIRST`,
`CREATOR_HEAVY`, `SWITCHABLE`, `POST_CENTRIC`, `HIGH_USAGE_REDUNDANT`,
`SMALL_BALL`, `OVERSIZED`, `BALANCED_TWO_WAY`, `ONE_CREATOR_SPACED`.

**Hidden in this phase.** Not exposed to users. A tag is vocabulary, never a
power rating, and no tag determines quality.

## 12. Why there is no single team score

There is no `teamIntelligenceScore`, and a test asserts the field does not
exist. Player OVR already demonstrates the failure mode: one number the UI
treats as truth and the engine ignores.

A lineup can be elite at creation and unable to guard a point guard. Collapsing
that into `94` destroys exactly the information the simulation needs. Downstream
layers are therefore **forced to consume dimensions**.

## 13. Confidence

Reflects input quality: how many profiles are human-reviewed, how many carry
measured shooting splits, how many have verified measurements, and how many
**predate official steal/block recording in 1973-74**.

That last one reads the *raw DNA signal*, not the profile-level confidence.
Human review legitimately raises confidence in a judgement, but it cannot
conjure a statistic the NBA never recorded — a curated Bill Russell is still a
player whose blocks were never counted.

**Confidence is not variance.** A low-confidence lineup is not a random one; it
is one we know less about.

## 14. The four independences

| Independence | Meaning | Enforced by |
| --- | --- | --- |
| **Coach** | no coach import, no concentration parameter | import grep + identical output under coach contexts |
| **Era** | no era import, no era branch | identical output under conflicting era contexts |
| **Opponent** | describes tools and gaps, never assignments | no opponent parameter |
| **Seed** | no RNG whatsoever | source grep for `Math.random`/`mulberry32`/`rng(` |

`teamIntelligence.js` deliberately does **not** import `seed.js`, which would
pull `mulberry32` into a description layer; it carries a local FNV-1a hash for
the lineup fingerprint instead.

Coach-independence is the load-bearing one. Folding deployment into construction
would destroy the product's central distinction between how a team is **built**
and how it is **coached**.

## 15. Determinism

Same cards + same positions → byte-identical output. Reordering the input array
with explicit positions changes nothing (players are sorted by slot, then id).
Changing position assignments *may* change the result, and does change the
fingerprint.

## 16. Performance

| Operation | Time |
| --- | --- |
| One lineup (warm) | **0.037 ms** |
| One lineup (cold profiles) | 5.4 ms |
| Full 8-lineup benchmark | 1.38 ms |
| All 381 player profiles | 2.84 ms |

## 17. Future integration

Extension points exist; nothing is wired.

- **Coach Intelligence (Phase 4)** consumes `usagePlan` and `rolePlan` and
  applies concentration, tempo, and scheme on top.
- **Era Style** prices the dimensions this layer names.
- **Matchup Engine** consumes `defense` tools/gaps to assign defenders against a
  specific opponent.
- **Possession Engine** ultimately consumes the priced, matched result — and
  remains the only thing that decides a winner.
