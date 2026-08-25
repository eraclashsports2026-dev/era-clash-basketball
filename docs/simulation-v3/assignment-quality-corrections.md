# Assignment-quality corrections (Phase 6B2 Workstream 0A)

Three Phase 6B1 benchmark plans looked wrong. All three were real modelling errors, and all three were
found by building the diagnostic first and reading the costs rather than by guessing.

## The tool

```bash
npm run defense:explain -- --scenario=russell-klay
npm run defense:explain -- --scenario=magic-klay-bird
npm run defense:explain -- --scenario=shaq-jokic
npm run defense:explain -- --all
```

`explainAssignmentPlan(plan, { alternatives })` returns pairwise costs with their top cost drivers,
whole-plan costs, every named alternative scored **component by component**, the next-best
permutations, and the chosen plan's rank among the 120. Internal only — a test asserts no production
route imports it.

## Scenario A — Bill Russell chasing Klay Thompson

**Before:** Russell→Klay (cost 20.4), Payton→Curry, Garnett→Jokić, Moncrief→Bird, Pippen→Dirk.

The tool showed why: every alternative put **Russell→Jokić at 40.7**, which was worse than
Russell→Klay at 20.4. The optimizer was right about its own cost model; the cost model was wrong
twice over.

1. **Klay's chase was underpriced.** Cost weight was `0.35 + usageShare × 3.2`, so an 11%-usage
   player got weight **0.7** — even though he is an elite movement shooter who runs a defender off
   three screens a possession.
2. **Russell-on-Jokić was overpriced.** `creationContainment` and `speedCompatibility` compared
   Jokić's `primaryCreation` (9.0) against Russell's `pointOfAttack` (~3), charging a centre full
   point-of-attack shortfall for guarding another centre.

**After:** Russell→Jokić (33), **Payton→Klay (0.5)**, Moncrief→Curry, Pippen→Bird, Garnett→Dirk. The
centre guards the centre and an elite point-of-attack defender takes the mover.

## Scenario B — Magic chasing Klay while Jordan guards Bird

**After correction the plan is unchanged, and now explained.** Magic→Klay costs 29.6 (up from 17.4 —
properly priced). The alternatives:

| Plan | Total | Why it lost |
|---|---|---|
| Magic on Klay (chosen) | **119.7** | — |
| Jordan on Klay, Magic on Bird | 156.3 | Magic→Bird costs **62.4**; pairCost +24.5, severe +2 |
| Jordan on Curry, Pippen on Klay | 163.3 | same Magic→Bird problem, plus creatorPenalty +3.1 |

Magic is a liability on either assignment; Bird punishes him worse, because Bird combines creation,
post scoring **and** offensive rebounding. That is a defensible basketball answer, and it is now
attributable rather than asserted.

## Scenario C — Shaq on Jokić labelled `PRESERVE_RIM_PROTECTION`

The label was false. The old predicate counted an assignment as preserving the rim if the opponent had
`postScoring >= 4.5` — so a rim protector assigned to a passing-hub big who plays above the break
reported `rimPreservation: 1.0`, for exactly the matchup that empties the paint.

Replaced with **real paint availability** (`paint.js`), derived from the assignment's expected
behaviour: post scoring, rim pressure, offensive rebounding and cutting pull the defender **in**; pop
threat, spot-up shooting, off-ball movement, screening away from the rim and a **passing-hub role
above the break** pull him **out**. Weighted by era perimeter shot value, because a "spacing" big in
1962 does not pull anyone out of the paint.

Four labels: `PRESERVES_PAINT_PRESENCE` · `ASSIGNS_NOMINAL_CENTER` · `FORCED_TO_PERIMETER` ·
`MIXED_INTERIOR_PERIMETER_DUTY`.

Result, same players, era-sensitive:

| Era | Availability | Label |
|---|---|---|
| 1960s | 0.81 | `PRESERVES_PAINT_PRESENCE` |
| 1990s | 0.73 | `PRESERVES_PAINT_PRESENCE` |
| 2010s | 0.61 | `ASSIGNS_NOMINAL_CENTER` |
| 2020s | 0.58 | `ASSIGNS_NOMINAL_CENTER` |

Team `rimPreservation` is now the **mean of actual availabilities**, not a count of "guards someone
who posts". For a hub-heavy offence it reports 0.50–0.53 rather than 1.0.

## General model changes

| Change | Effect |
|---|---|
| `defensiveDemand` on the threat profile | `max(usage × 22, off-ball demand)` — movement, relocation gravity, screening, cutting. Klay: 11% usage, demand **9.6**, equal to Curry's |
| Cost weight | `0.4 + (demand/10) × 0.75 + usage × 1.1` instead of usage alone |
| `creationLocus` | perimeter/interior split of where a player creates. Jokić 0.46/0.54, Klay 0.75/0.25 |
| `creationContainment` | weighted by locus — a centre is charged post/interior containment, not point-of-attack |
| `speedCompatibility` | only counts perimeter creation and rim pressure |
| `paintAvailability` | replaces the post-scoring proxy for rim preservation |

## No player-specific exceptions

Two tests grep the nine generic defence modules (comments stripped) for **card ids** and for
**player names** in code, and require zero matches. Benchmark and fixture files may name players —
a scenario has to name the matchup it reproduces — and a third test asserts that exemption is
deliberate rather than an accident of the grep.
