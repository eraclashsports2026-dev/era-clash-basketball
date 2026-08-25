# Player Intelligence (V3)

**Status:** shipped, not wired. **Files:** `src/v3/intelligence.js`, `src/v3/data/intelligence.js`,
`tests/v3-intelligence.test.js`. **Coverage:** 379 / 379 player-decades, 11 human-reviewed.

> Build a smarter player database, not a bigger one.

---

## 1. What this layer is for

Player DNA (`src/v3/playerProfile.js`) answers *"how good is this player at X?"* in 27 numbers.
That is the right input for a possession loop and the wrong input for a team builder, who is
actually asking four different questions:

| Question | Answered by |
| --- | --- |
| What **kind** of player is this? | `roles` |
| What do they **need** in order to function? | `fit.creationDependence`, `offense.usageAppetite` |
| What do they still give you when they get **nothing**? | `fit.roleAcceptance`, `fit.connectivity` |
| How much of the above is actually **known**? | `provenance`, `confidence` |

Player Intelligence is a read-only interpretive layer that answers those. It exists so the Team
Intelligence and Coach layers can be built against a stable vocabulary instead of each re-deriving
one, and so that the honest answer to question four travels with the data instead of living in a
doc nobody opens.

### What it is not

It is **not wired into game outcomes.** No simulation module imports it — `possession.js`,
`gameplan.js`, `defense.js`, and `engine.js` consume DNA exactly as they did before this layer
existed. Adding it changed no simulated result, and a test enforces that no `src/v3/*.js` file
imports it. Wiring it in is a later phase and a separate decision.

---

## 2. Schema

```js
{
  id, name, decade, pos, positions,

  physical: { heightIn: null, weightLb: null, wingspanIn: null },   // always null — see §6

  roles: {
    primary:   "Rim Protector",           // the headline label
    secondary: ["Defensive Anchor", …],   // up to two more
    all:       [...],                     // every role claimed
    defining:  true,                      // false = no role cleared the bar
    scored:    [{ role, raw, strength, qualifies }, …]   // all 17, for inspection
  },

  offense:  { …9 attributes },
  defense:  { …7 attributes },
  fit:      { …5 attributes },

  eraTranslation: { portable: [{skill, why}], eraSensitive: [{skill, why}], note },

  provenance: { derivedFrom, dnaProvenance, humanReviewed, curatedFields,
                curatorNote, physical, eraIndependence, engineUse },
  confidence: { offense, defense, roles, physical, overall },
}
```

Build one with `buildIntelligence(playerCard)`, one by id with `intelligenceFor(id)`, or the whole
pool with `allIntelligence()`. Check one with `validateIntelligence(profile) → { valid, errors }`.

The layer is **deliberately not cached.** Caching by id would let a future era-dependent regression
slip past the era-independence test by returning a stale first result, and this layer is not on the
possession hot path.

---

## 3. Attribute definitions

All attributes are 0–10. `ATTRIBUTE_DEFINITIONS` in `intelligence.js` is the single source of truth
and is exported so docs and any future UI describe attributes identically.

### Offense

| Attribute | Means | Does **not** mean |
| --- | --- | --- |
| `usageAppetite` | How much of the offense this player *wants* to consume. | What they get. The finite-usage allocator in `roles.js` decides that. |
| `selfCreation` | Making a good shot with no advantage handed to them. | Scoring volume. |
| `spacingGravity` | How far from the basket the defense must honour them. | Three-point *attempt* volume — this is shot-making skill, and the era decides the shot's value. |
| `rimThreat` | Getting to the basket and finishing there. | Dunking. |
| `postThreat` | Scoring value with their back to the basket. | Being tall. |
| `passingVision` | Seeing and delivering the advantage pass on time. | Assist totals. |
| `offBallMovement` | Value produced while not holding the ball. | Effort. This is the attribute that decides who survives being squeezed. |
| `shotSelection` | How well the shots taken match the shots they can make. | Efficiency. Low means volume the skill does not support. |
| `ballSecurity` | Keeping possession under pressure. | Low turnover totals (low-usage players get those for free). |

### Defense

| Attribute | Means |
| --- | --- |
| `perimeterContainment` | Staying in front of a ball-handler at the point of attack. |
| `wingContainment` | Guarding a primary perimeter scorer with length and positioning. |
| `interiorDeterrence` | Making the paint expensive to operate in. |
| `rimDeterrence` | Deterring and erasing shots at the basket specifically. |
| `eventCreation` | Generating steals and blocks — takeaways, not merely stops. |
| `defensiveRebounding` | Ending the possession by securing the ball. |
| `schemeVersatility` | How many coverages this player can legally be asked to play. Low means scheme-*locked*, not bad. |

> **`eventCreation` and `perimeterContainment` are different skills and frequently trade off.**
> Gerald Wallace led the league in steals with a gambling style; Tayshaun Prince made four
> All-Defensive teams at 0.6 steals a game because length and position *suppress* events rather
> than generate them. Collapsing the two is the single most common way to misread a defender.

### Fit

| Attribute | Means |
| --- | --- |
| `roleAcceptance` | Value retained at **minimum touches**. |
| `spacingContribution` | How much easier this player makes the floor for the other four. |
| `defensiveVersatility` | How many opposing player types they can be assigned to. |
| `creationDependence` | How much value evaporates when someone else runs the offense. |
| `connectivity` | Keeping the ball and the possession moving. |

> **`roleAcceptance` is not a character judgement.** It is a skill-portability measurement. James
> Harden scores 1.6 not because he is selfish but because his value is manufactured with the ball
> in his hands, and a lineup that cannot give him the ball does not get that value. This is the
> attribute that makes finite usage bite: it is *why* five 30%-usage stars do not add up.

---

## 4. Role definitions

A closed vocabulary of 17. Anything a profile claims must appear in `ROLES`, so downstream layers
can switch on roles without string-matching guesswork.

`Primary Creator` · `Secondary Creator` · `Floor General` · `Movement Shooter` · `Spot-Up Spacer` ·
`Slasher` · `Post Hub` · `Roll Threat` · `Stretch Big` · `Rim Protector` · `Defensive Anchor` ·
`Point-of-Attack Stopper` · `Wing Stopper` · `Help Defender` · `Glass Cleaner` · `Connector` ·
`Low-Usage Finisher`

Each carries an `about` string in `ROLE_DEFINITIONS`. Classification has three deliberate pieces,
each of which was arrived at by watching an earlier version get it wrong.

### 4.1 Limiting-factor scoring

Most roles score with `min()` across the traits the role **requires together**, because basketball
roles are conjunctive. A Primary Creator needs both the skill to make a shot from nothing *and* the
usage to be handed that job; a high-usage scorer who cannot create is not one, and neither is a
gifted creator who never touches the ball.

> A plain weighted average lets one high attribute carry a role the player cannot fill. When this
> file used averages, **149 of 379 profiles came back "Primary Creator."**

### 4.2 Calibrated qualification, absolute ordering

Raw fits are not comparable across roles. This is a database of legends: the median card sits near
6.0 for self-creation and usage but near 1.5 for rim deterrence. An uncalibrated `argmax` hands
"Primary Creator" to anyone merely ordinary and reserves "Rim Protector" for the extraordinary.

So each role maps onto a 0–10 **role strength** against two authored constants — `floor` (the pool
median) and `ceiling` (the pool's 95th percentile, or `floor + 2.5`, whichever is larger):

- **Qualification is pool-relative.** A role must clear strength 5.0 to be claimed at all. This is
  the only fair way to compare a rebounding role against a creation role.
- **Ordering is absolute.** Among roles that qualify, the leader is the one with the highest *raw*
  fit — how strong the role is in basketball terms, not how rare it is.

Ordering by strength instead produced saturation: roles the pool barely varies on turn a tenth of a
point into a 10, elite players tie at 10 across half the vocabulary, and the winner is decided by
array order. **That is how Bill Russell first came back as a "Roll Threat."** The `floor + 2.5`
minimum band width exists for the same reason — without it Mark Eaton qualified as a Roll Threat
and Tayshaun Prince as a Stretch Big.

### 4.3 Frozen constants

`ROLE_CALIBRATION` was computed once, from the 379-card pool on 2026-08-24, and written down. It is
**not** recomputed from the live pool at runtime.

> A percentile that moves would make role labels drift every time a card is added — the same
> instability that already forces the OVR tests to be tolerance-based. Adding a card must never
> silently restate what an existing player *is*. Re-derive these constants deliberately, in a commit
> that says so, if the pool ever changes character.

**Tie-breaks follow `ROLES` order**, which runs from most-defining to most-generic. Rim protection
sits ahead of rebounding on purpose: both describe Russell accurately, but rim protection is the
more portable skill while rebounding totals are the most era-inflated number in the dataset.

### 4.4 When nothing fits

114 of 379 profiles clear no role. That is a real result, not a failure — a card with no defining
skill. They still get a `primary` label so downstream code always has one, with `defining: false`
recording plainly that it does not define them.

---

## 5. Era-translation philosophy

**This is the centre of the feature.** A profile describes a **player**, never a matchup.
`buildIntelligence()` takes no era, never reads one, and returns a byte-identical profile no matter
when the game is played.

```
players determine capability → era style determines environment →
matchups determine which strengths matter
```

A spot-up shooter *is* worth more in a spaced 2020s game than in a packed 1960s one. That
difference belongs to the **Era Style engine deciding what a skill is worth tonight** — never to
this layer quietly handing the shooter a bonus for having been born later. There are no era
bonuses, era multipliers, or era branches in this file.

The `eraTranslation` block therefore **names** which strengths are environment-sensitive without
pricing them:

- **`portable`** — rim deterrence, defensive rebounding, passing vision, self-creation, event
  creation, off-ball movement. These travel intact.
- **`eraSensitive`** — spacing gravity, post threat, usage appetite, perimeter containment. These
  are priced by the environment: spacing gravity by the line and the floor, post threat by the
  era's legal-defense rules, usage appetite by pace, perimeter containment by hand-check rules.

Entries carry only `{ skill, why }`. A test asserts no numeric value is ever attached to one.

Era **normalization** still happens — one layer down, in `playerProfile.js`, where raw production is
translated into a shared reference environment per statistic before capability is derived. That is
translation of the *record*. This layer performs no further era arithmetic of any kind.

### How this is enforced

`tests/v3-intelligence.test.js` builds every one of the 379 profiles under six conflicting era
contexts — including `{ era: "1960s", eraStyle: { pace: 120, spacing: 0 } }` and a 2010s
star-empowerment context — and asserts byte-identical JSON. It additionally greps the module source
for `ctx.era`, `ERA_BONUS`-style identifiers, and `eraBonus` in the curated data file. The
`ctx` parameter is accepted and deliberately ignored precisely so this test has something real to
vary; if you ever find yourself reading `ctx.era` in that file, the feature has gone wrong.

---

## 6. Provenance & confidence

Every profile says where it came from and how sure it is. Confidence describes **how sure EraClash
is** — it never feeds game variance. Low-confidence players are not made random.

| Field | Meaning |
| --- | --- |
| `derivedFrom` | Always the DNA chain: VERIFIED production + CALCULATED era normalization + INFERRED priors. |
| `dnaProvenance` | The full provenance block from `playerProfile.js`, carried through unflattened. |
| `humanReviewed` | Whether a curated entry exists. |
| `curatedFields` | Exact dot-paths a human set (`defense.wingContainment`, …). |
| `curatorNote` | Why the derivation was wrong, or what it could not have known. |
| `physical` | Always `ABSENT`. |
| `eraIndependence` | The §5 guarantee, restated on every profile. |
| `engineUse` | Always `NONE`. |

### Measurements are never invented

`physical.heightIn`, `weightLb`, and `wingspanIn` are `null` on all 379 profiles, and
`validateIntelligence` **rejects** a profile that sets one. The trusted dataset holds no
measurements. A plausible height is still a fabricated one, and it would read like a record.
Curated entries are forbidden from setting them too — a separate test asserts that.

### Two known data gaps, stated rather than hidden

1. **No shooting splits.** The dataset has no FG%/3P%/FT%. Every shooting attribute for an
   uncurated player is inferred from position, era, and volume. `shotSelection` is the weakest
   derived attribute in the file, and the one curation most often has to correct.
2. **Steals and blocks did not exist before 1973-74.** Every pre-1974 defensive attribute is an
   estimate. Those profiles are marked `LOW` confidence on defense, and a test enforces it.

---

## 7. The curated overlay

`src/v3/data/intelligence.js` holds 11 human-reviewed entries, deep-merged leaf-by-leaf over the
derived profile. Roles are classified **after** attribute curation, so a corrected attribute
propagates into classification; an explicitly curated role then wins over that.

Curated profiles may claim a role the derivation cannot see — Prince's Wing Stopper is invisible to
a formula reading a 0.6 steal rate. The claimed set becomes the union of what qualified and what was
asserted, and a test verifies every asserted role was actually asserted by a human rather than
appearing from nowhere.

### The correction case

Mark Eaton is why this overlay exists. Two Defensive Player of the Year awards, five All-Defensive
teams, and the single-season blocks record give him enormous defensive pedigree — and the derivation
spreads that pedigree across the *whole* defensive profile, landing on **7.4 wing containment** and
**5.6 scheme versatility** for a 7'4" drop anchor who could not stay in front of a guard.

The formula is not wrong about magnitude. It is wrong about **location**, because accolade pedigree
is positionally naive: it cannot tell *where* the defense happened. Curation keeps the magnitude
(rim deterrence 10, interior deterrence 10) and fixes the location (wing containment 2, scheme
versatility 1). A test asserts both the raw DNA inflation and the corrected result, so the case
cannot silently regress.

### Rules for adding an entry

1. Only set a field you can defend from the documented record. **Absence is preferred over a
   guess** — an unset field keeps the derived value and its lower confidence.
2. Never set a physical measurement.
3. No era bonuses. Nothing here may reference the era a game is played in.
4. `note` is required, and should say what the derivation got wrong or could not have known.

---

## 8. Migration approach

Nothing was migrated, because nothing was replaced.

- **Additive only.** Two new files and one new test file. No existing module changed behaviour.
- **DNA untouched.** `playerProfile.js` was not modified. The curated overlay writes into a fresh
  profile object; a test asserts building a profile does not mutate the player card or the shared
  DNA object.
- **V2 untouched.** The V2 elo engine, `attributes.js`, and the rating/OVR path are all unchanged.
- **No engine consumers, by design.** Enforced by test, not by convention.
- **Coverage grows without breaking.** An uncurated player gets a complete, valid, honestly-labelled
  profile. Adding a curated entry only ever *raises* confidence. There is no partial state.

### Relationship to the existing curated attribute file

`src/attributes.js` (93 players) is a **v2.5 chemistry-layer** file that `playerProfile.js` already
consumes as a DNA input. `src/v3/data/intelligence.js` (11 players) is a **V3 profile overlay** that
corrects the *interpretation*. They are different layers with different jobs and they do not
conflict: a player may appear in both, either, or neither. Merging them is a future decision, not a
prerequisite.

### Extending coverage

Curated coverage is 11 / 379 (2.9%) — the profile anchors the vocabulary was calibrated against.
Extending it is a data task requiring source verification per player, and explicitly **not**
something to auto-generate. The 93 entries in `attributes.js` are the natural next tranche.
