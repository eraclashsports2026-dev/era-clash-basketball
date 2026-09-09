# Era Style Intelligence (V3)

**Status:** built, hidden, wired to nothing. **Version:** `eraStyleVersion` 1.0.0 (DEVELOPMENT).
**Files:** `src/v3/eraStyleIntelligence.js`, `tests/v5b-era-style.test.js`,
`benchmarks/v3/era-style-intelligence.mjs`, data in `src/v3/data/eras.js`.

> An Era Style is a basketball **environment**. It is not a power ranking.
> There is no best decade.

## 1. What an era changes

What is **legal** · what is **valuable** · what is **difficult** · what is
**common** · what is **efficient**. One shared era applies to both teams. It
never decides who wins.

```
player capability × team construction × coach philosophy × era environment
```

## 2. The eight eras

| Era | Anchor | 3PT | Zone | Illegal defence | Hand-check | Pace |
| --- | --- | --- | --- | --- | --- | ---: |
| 1950s | 1957-58 | ✗ | ✗ | yes | permitted | 119.7 |
| 1960s | 1966-67 | ✗ | ✗ | yes | permitted | 121.5 |
| 1970s | 1976-77 | ✗ | ✗ | yes | permitted | 106.5 |
| 1980s | 1986-87 | ✓ 23'9" | ✗ | yes | permitted | 100.8 |
| 1990s | 1992-93 | ✓ 23'9" | ✗ | yes | permitted | 96.8 |
| 2000s | 2005-06 | ✓ | **✓** | **no** | **restricted** | 90.5 |
| 2010s | 2015-16 | ✓ | ✓ | no | restricted | 95.8 |
| 2020s | 2025-26 | ✓ | ✓ | no | restricted | 100.5 |

> **Era Styles represent a typical basketball environment for the selected
> decade. Individual seasons within a decade may have used different rules and
> league conditions.** Carried on every profile as `provenance.anchorCaveat`.

## 3. Rule facts vs league environment — kept apart

| | Answers | Nature |
| --- | --- | --- |
| **`rules`** | what was **legal** | discrete, checkable, stable |
| **`leagueEnvironment`** | what was **typical** | continuous averages; estimates for the earliest eras |

A test asserts no league statistic appears among the rules and no rule appears
among the environment figures. **A statistical trend is not a rule, and a
stereotype is neither.**

Turnovers were not tracked until 1977-78 and offensive/defensive rebound splits
begin in 1973-74, so 1950s–60s pace and turnover figures are league estimates —
recorded as such in `provenance.estimateNote`.

## 4. Strategic effects

Derived from rules **and** environment:

| Era | spacing | 3PT value | interior density | help freedom | physical | transition | OREB value |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1950s | 0 | **0** | 5.6 | 2.0 | 7.5 | 9.3 | 9.6 |
| 1960s | 0 | **0** | 5.6 | 2.0 | 7.5 | 9.9 | 6.1 |
| 1970s | 0 | **0** | 5.6 | 2.0 | 7.5 | 5.4 | 4.0 |
| 1980s | 0.8 | 1.0 | 5.2 | 2.0 | 7.5 | 3.8 | 3.4 |
| 1990s | 2.1 | 2.8 | 4.3 | 2.0 | 7.5 | 2.6 | 3.7 |
| 2000s | 6.1 | 4.8 | 7.0 | **8.5** | **3.0** | 0.7 | 3.5 |
| 2010s | 7.2 | 6.2 | 6.4 | 8.5 | 3.0 | 2.3 | 2.9 |
| 2020s | **9.4** | **9.2** | 5.0 | 8.5 | 3.0 | 3.7 | 1.8 |

Two things worth reading carefully:

- **Perimeter shot value is `0` before 1979-80, not "low".** And
  `leagueEnvironment.threePointPct` is `null`, not `0` — there was no line to
  shoot at.
- **Illegal-defense eras have a LESS crowded paint, not a more crowded one.**
  Pre-2001 rules *forbade* pre-rotated help, so a post scorer got genuine
  one-on-one looks. `helpDefenseFreedom` jumps 2.0 → 8.5 when zones are
  legalised, and post value is multiplied by 1.15 in the restricted eras. This
  is the opposite of the usual "old-school paint was packed" assumption, and it
  follows from the rulebook.

## 5. The translation doctrine

> Transport the basketball player, not the historical circumstances that created
> the player.

**Stephen Curry in the 1960s** keeps shooting skill, movement, gravity, handle
and off-ball value. `skillRetained` is *identical* to his 2020s value. What
changes: a deep shot is worth two, and three-point volume is unavailable. His
value expressed drops; his skill does not.

**Wilt Chamberlain in the 2020s** keeps size, athleticism, interior scoring,
rebounding and rim protection — and acquires **no** modern three-point range.

No old-player penalty. No modern-player bonus. Tests assert both.

## 6. Coach–Era fit

Mechanical, never identity-based. **A coach receives nothing for their career
overlapping the selected decade** (`provenance.noNativeEraBonus`).

What the layer actually computes:

- **`legalityConstraints`** — system elements that are `UNAVAILABLE`, `ILLEGAL`,
  or `RESTRICTED` in this era, each with how much survives via **demonstrated
  adaptability** (gated by the career toolkit, never by what the model thinks
  optimal). D'Antoni's three-point emphasis in the 1960s is `UNAVAILABLE`; part
  of him survives because his adaptability is documented.
- **`portableElements`** — concepts that travel: motion, ball movement, tempo
  philosophy, adaptability, and **pick-and-roll**, which long predates modern
  spacing and is explicitly not treated as a modern-only action.
- **`environmentFit`** — six dimensions comparing coach demand against era
  environment, reported as a **band**, never as a percentage.

Benchmark result: **11 of 30** coaches have their best-fit era inside their own
decade — no systematic native-era bias.

## 7. Dominance benchmark

`node benchmarks/v3/era-style-intelligence.mjs`

Dimension leaders across all eight lineups:

| Dimension | Leading era |
| --- | --- |
| shooting | 2020s |
| spacing | 2020s |
| interior | 1950s |
| perimeter defence | 1950s |
| interior defence | 2000s |
| pace | 1960s |

**4 distinct leading eras across 6 dimensions.** No era leads all of them. The
spacing roster's spacing peaks in the 2020s while the interior roster's post
play peaks in the 1950s — the environment is doing real work.

### The aggregate that had to be deleted

The first version of this benchmark summed four dimensions into an
`expressedTotal` and reported the **1990s as best for 5 of 8 lineups**. That was
not a finding about the 1990s: the sum was stacking three unrelated positives
(some three-point value, illegal-defense post freedom, and legal hand-checking)
that no single possession collects at once.

The dimensions were correct. The sum was the bug. **The fix was to delete the
aggregate, not to penalise a decade** — which is also exactly the rule this
project applies to team and coach scores.

## 8. Isolation

Opponent-independent · seed-independent · deterministic · **imported by no
simulation module** (test-enforced). `eraStyleVersion` is DEVELOPMENT and
`affectsResult` is false, so it cannot enter a result fingerprint.
`eraDataVersion` remains ACTIVE — the live engine already uses era *data*; this
is the intelligence layer over it, and the two are separate domains.

Cache identity: `era:v{eraStyleVersion}:{eraId}` — which correctly **threw**
until this phase gave the version a value.

## 9. Research

`npm run research:eras` · `npm run research:refresh-era -- --era=1990s`

Eight eras, 16 sources (a rules source and an environment source each), all
source-verified and content-hashed. Raw bodies stay under git-ignored `.cache/`.
