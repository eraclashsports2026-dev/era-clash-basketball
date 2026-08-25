# Player data completion (Phase 2B)

Four data layers added, one live correctness bug fixed, one verified accolade
corrected. All additive except the identity fix, which is called out explicitly
below because it changes what production accepts.

---

## 1. Canonical person identity

`src/v3/data/persons.js` · **323 persons ↔ 381 cards**

A **card** is a player-decade (`jordan-90s`). A **person** is the human
(`michael-jordan`). The distinction is load-bearing: `api/game.js:135` refuses a
lineup that fields two versions of the same person.

### The bug

Identity was derived by stripping the era suffix off the card id and treating
the remainder as the person. That is a guess about a string, not a fact about a
human, and auditing it found it **wrong nine times in both directions**:

**SPLIT** — one human read as two people, so the duplicate rule never fired:

| Human | Cards | Old keys |
| --- | --- | --- |
| Bill Russell | `russell-50s`, `bill-60s` | `russell`, `bill` |
| Bob Pettit | `pettit-50s`, `bob-60s` | `pettit`, `bob` |
| Rick Barry | `rick-70s`, `barry-60s` | `rick`, `barry` |
| Charles Barkley | `charles-80s`, `barkley-90s` | `charles`, `barkley` |
| Carmelo Anthony | `carmelo-00s`, `melo-10s` | `carmelo`, `melo` |
| Mark Price | `price-80s`, `mark-p-90s` | `price`, `mark-p` |
| Antawn Jamison | `antawn-90s`, `jamison-00s` | `antawn`, `jamison` |

**COLLIDE** — two humans read as one person, so legal lineups were refused:

| Old key | Actually |
| --- | --- |
| `chet` | Chet Walker (60s, 70s) **and** Chet Holmgren (20s) |
| `dj` | Dennis Johnson (80s) **and** DeAndre Jordan (10s) |

Until this fix a lineup could field 1950s Russell beside 1960s Russell — two
Bill Russells — while Chet Walker and Chet Holmgren, who never shared a century,
were rejected as the same man.

### The fix

Identity comes from the card's `name`, slugified. Cards agree on the person
exactly when they agree on the person. Verified safe: 323 distinct persons, zero
slug collisions, and no same-name pair spanning more than three decades (the
Sr./Jr. hazard).

**Nicknames are not people.** `tiny-70s` and `tiny-80s` both carry the name
"Nate Archibald", so they already resolve to one person. The nickname lives in
`DISPLAY_NAMES` (`Nate "Tiny" Archibald`) and never in identity.

### ⚠ This changes production behaviour

Both directions are corrections toward the product's own documented rule, but
they are real changes to what `api/game.js` accepts:

- now correctly **refuses** `russell-50s` + `bill-60s`
- now correctly **allows** `chet-60s` + `chet-20s`

---

## 2. Verified physical metadata

`src/v3/data/physical.js` · **44 persons (65 cards)**

Keyed by person, because height does not belong to a decade.

### Policy

- **Listed roster measurements**, not biomechanical truth. Historically recorded
  in shoes, rounded, occasionally flattered; the NBA only began verifying
  without shoes in 2019. Never a tiebreaker finer than an inch.
- **Source priority:** (1) official NBA/team, (2) Naismith Hall of Fame,
  (3) established statistical reference, (4) reputable historical source. This
  pass is tier 3 throughout — Wikipedia infoboxes, read 2026-08-24.
- **Every populated value carries source, tier, and date.** Validation rejects a
  measurement without them: an unattributed height is indistinguishable from an
  invented one.
- **Conflicts:** none encountered. If two sources ever disagree, record both,
  take the higher tier as canonical, never silently average.

### Wingspan is null for all 381 cards

No accessible source publishes wingspan for historical players, and wingspan is
**not derivable from height** — the entire reason it matters (Leonard, Durant,
Eaton) is that it diverges from height. Estimating it would fabricate the one
number a consumer would most want to trust. Validation rejects any non-null
wingspan outright, including in curated data.

---

## 3. Shooting evidence

`src/v3/data/shooting.js` · **44 persons, 43 cards with measured splits**

Two deliberately separate layers:

1. **Measured splits** — career FG%/3P%/FT% from a published table. `precision`
   distinguishes `EXACT` (read from a table) from `ROUNDED` (a prose "51%
   shooting" is not a table value). Null where not obtained.
2. **Categorical identity** — one of ten evidence-backed categories. Coarse on
   purpose: where shot-location data does not exist, an evidence-backed category
   beats a fabricated decimal.

Coverage: 23 HIGH confidence (three exact splits), 9 MEDIUM (partial), 12 LOW
(categorical only).

### The pre-three-point rule

The NBA had no three-point line until 1979-80. For a player who retired before
it, **3P% is not zero — it is undefined**, and collapsing the two is a bug, not
a datum.

| `threePointEra` | Cards | Rule |
| --- | ---: | --- |
| `NONE` | 7 | `threePct` **must** be null; `threeVolume` is `NOT_APPLICABLE`; validation enforces both |
| `PARTIAL` | 2 | career straddles 1979-80 |
| `FULL` | 35 | percentage is readable, subject to volume |

`perimeterSkill` carries the **era-neutral** judgement of outside shot-making for
every player regardless of era. Jerry West has a null 3P% and an `ELITE`
perimeter skill — he would obviously have shot threes; the league did not offer
him any. A future Era Style layer must read `perimeterSkill`, never raw 3P%.

### The low-volume trap

The same danger exists *inside* the three-point era. Mark Eaton's career 3P% is
a literal `.000` and Ben Wallace's is `.137` — both true, both meaningless,
because the denominators are trivial. `threeVolume` is what makes a percentage
safe to read, and `threePctIsMeaningful()` is the guard consumers should call.

### How it reaches the model

`spacingGravity` now **anchors on evidence** where it exists, keyed on
`perimeterSkill × threeVolume`, with a meaningful measured percentage nudging
around the anchor. Position/era/volume inference remains the fallback. Result:
Klay Thompson 10.0, Jerry West 8.0, Dennis Rodman 1.0, Mark Eaton 0.0.

---

## 4. Card statistical basis

`src/v3/data/cardStatBasis.js` — see `player-card-stat-basis.md`. All 381 cards
classified; 0 unclassified.

---

## 5. Larry Nance correction

`nance-80s.ad1` corrected **0 → 1**. Larry Nance was named to the All-Defensive
First Team for 1988-89, a season inside his 1980s window under the season-start-
year rule, verified against that season's award page. His team field widened to
`Suns/Cavaliers` (traded February 1988).

**Rating consequence:** `rawRating` 79.49 → 88.49; `displayOVR` 70 → 75; pool
percentile 26.2% → 37.5%. No test was loosened — the assertion was updated to
the corrected specification and new tests were added.

A `nance-90s` card was also added: his 1992 and 1993 All-Defensive Second Teams
and 1993 All-Star berth belong to the 1990s and cannot sit on the 1980s card.

---

## 6. Human review expansion

**11 → 33 curated profiles**, chosen where the formulas are most likely to be
wrong rather than where the players are most famous. See
`player-intelligence.md` for the override rules.

The largest systematic error found: **pre-1974 `eventCreation` of 0.0**. Steals
and blocks were not recorded until 1973-74, so Bill Russell — the defining
shot-blocker in the sport's history — derived an event-creation rating of zero.
That is a missing-data artefact wearing a rating's clothes, and it affected
every player who retired before 1974.

Second largest: **big men mislabelled**. Post play is the pool's least-varying
dimension, so a dominant interior scorer outscored Post Hub on Slasher (rim
threat + usage) or Glass Cleaner (rebounds). O'Neal and Abdul-Jabbar derived as
"Slasher"; Jokić derived as "Glass Cleaner". The magnitudes were right; the
label — which the later Coach and Matchup layers will switch on — was wrong.

---

## Remaining gaps

| Gap | Scale |
| --- | --- |
| Physical coverage | 44 / 323 persons (14%) |
| Measured shooting splits | 43 / 381 cards (11%) |
| Cards on the rigorous convention | 16 / 381 (4%) |
| Curated intelligence | 33 / 381 (9%) |
| Pre-1974 defensive artefact | corrected for the review set only |
| Decade-scoped shooting splits | none — all splits are career-scope |
| Wingspan | 0, by policy, until a real source exists |

None of these is filled by guessing. Each is a research task with a documented
method.
