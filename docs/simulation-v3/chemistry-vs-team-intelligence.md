# Chemistry vs Team Intelligence

A comparison document, not a migration. **Nothing about the live Chemistry
system was changed**, and retiring it requires a separate CEO-approved phase.

---

## 1. What Chemistry currently measures

`src/chemistryView.js` rescales existing values from `rating.js`'s
`analyzeBalance` into a 0–100 display score, a label, tags, and a per-player
Team Fit:

```js
raw = 62 + (bal.multiplier - 1) * 320
        + bal.bonuses.length * 2.5 + style.bonuses.length * 1.5
        - bal.gaps.length * 3     - style.gaps.length * 2
```

The underlying signals are real: `analyzeBalance` produces a multiplier plus
named bonuses (`Elite playmaking`, `Rim protected`, `Owns the glass`,
`Perimeter menace`, `Balanced attack`, `Championship DNA on defense`) and gaps
(`Hero-ball risk`, `No playmaking engine`, `No rim protection`,
`Weak on the boards`, `No perimeter pressure`). Team Fit counts how many of
those outcomes each player materially drives.

The file's own header is candid: *"This file computes nothing new about
basketball."*

## 2. Does Chemistry affect the live engine?

**No.** Traced at Phase 2B:

| Consumer of `analyzeBalance` / `teamRating` | Reaches a live engine? |
| --- | --- |
| `src/chemistryView.js` → `ChemistryMeter.jsx`, `TeamSlots.jsx`, `Postgame.jsx` | **No** — UI only |
| `src/simClient.js` | **No** — dead code, referenced only by its own test |
| `src/v3/*` | **No** — V3 does not import `rating.js` at all |

So the Chemistry meter has had **zero effect on any simulated result since
v2.5.0**. It is displayed while a user builds a team, and again in Postgame,
where it reasonably reads as an input to the outcome.

This is the largest gap in the product between what the interface appears to
model and what it models.

## 3. What Team Intelligence measures

Twenty-plus basketball dimensions across `offense`, `defense`, `physical`,
`rebounding`, and `construction`, plus a finite usage allocation, a creation
hierarchy, role coverage, and explicit confidence — and **no overall score**.

## 4. Where the two overlap

| Chemistry concept | Team Intelligence equivalent | How it improves |
| --- | --- | --- |
| `Elite playmaking` bonus | `creationHierarchy`, `offense.passing`, `fit.connectivity` | Distinguishes *creation* from *distribution*. Five passers are not five creators |
| `Rim protected` bonus | `defense.rimProtection` | Weights the best deterrent with a real second body, rather than a flat flag |
| `Owns the glass` bonus | `rebounding` block | Offensive and defensive assessed separately; one elite rebounder among four non-contributors is flagged, not celebrated |
| `Perimeter menace` bonus | `defense.defensivePlaymaking` **and** `pointOfAttack` | Separates takeaways from containment — different skills that frequently trade off |
| `Hero-ball risk` gap | `usagePlan` compression + `roleScalability` | Emerges from a finite budget instead of a named penalty, and identifies *who* loses value and *why* |
| `Balanced attack` bonus | `construction.roleCoverage` | Names which roles are covered, missing, and redundant, rather than asserting balance |
| Per-player `teamFit` | `rolePlan` + `usagePlan.valueRetained` | Gives a mechanism (touches and off-ball value) instead of a label |
| — | `offense.spacing` | Chemistry has no spacing model at all |
| — | `physical` | Chemistry has no size model at all |
| — | `confidence` | Chemistry has no notion of how much is known |

## 5. What Team Intelligence deliberately does NOT do

- **No 0–100 score.** Chemistry's headline number is exactly the thing this
  layer refuses to produce. Player OVR already shows what happens when one
  number becomes the thing everyone reads and the engine ignores.
- **No label.** No `EXCELLENT`/`GOOD`/`AVERAGE`/`POOR`.
- **No user-facing surface.** Hidden by design in this phase.

That is not an oversight — it is the reason a straight swap is not possible.
The Chemistry meter's product job is to give a user one glanceable number while
building a team. Team Intelligence's job is to give the *simulation* many
dimensions. **They are not the same job**, and pretending otherwise would just
recreate the problem one layer up.

## 6. Migration path (recommendation only)

1. **Keep Chemistry displayed. Change nothing yet.** Removing a prominent meter
   before its replacement exists degrades the build experience.
2. **Wire Team Intelligence into the simulation first** (post-Phase 4), so the
   dimensions demonstrably affect results.
3. **Then decide what the meter becomes.** Three real options:
   - *Replace the number with consequences* — surface
     `construction.lineupStrengths` and `lineupConcerns`, which are already
     written in basketball English and are backed by the engine.
   - *Keep a single number but derive it from real economics* — e.g.
     `usageCompression.totalValueRetained`, which is genuinely meaningful and
     genuinely affects the game once wired.
   - *Remove it* and let Matchup Preview and Postgame carry the explanation.
4. **Whichever is chosen, stop displaying a number that changes nothing.**

Option 1 (consequences over a score) is the recommendation: it is honest,
requires no new metric, and is already generated.

## 7. What must not happen

- Do **not** retire Chemistry without CEO approval.
- Do **not** wire Team Intelligence into the Chemistry meter in this phase.
- Do **not** expose a Team Identity Score, Spacing Score, or Team IQ. Shipping a
  hidden engine's internals as a new headline number would reproduce the exact
  failure this document describes.
