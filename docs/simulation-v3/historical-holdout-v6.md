# Historical Holdout V6

**Phase 6C4C2.** Stage one of Candidate 2's two-stage formal validation. Sealed,
never read, at access count 0.

## Why V6 exists

Historical V5 is consumed. It was opened once under Candidate 1 and returned
`HISTORICAL_HOLDOUT_V5_FAIL` on two mechanisms: assisted-offense expression
(`assistedRate`) and defensive suppression (`refPppVsTeam`). Phase 6C4C1
diagnosed and repaired both, producing Candidate 2 at calibration 1.2.0.

V5's diagnostics developed Candidate 2, so V5 can no longer test whether
Candidate 2 generalises. It is retained as `FAILED_HOLDOUT_DIAGNOSTIC_SET`.
Candidate 2 needs a set it has never been developed against.

## The set

Eight matchups, one per Era Style, sixteen distinct team-seasons, 80 player
profiles, 15 coaches, 46 scored traits across 8 certified metrics.

| Era | Team A | Team B | Metrics scored |
|---|---|---|---|
| 1950s | Boston Celtics 1951-52 | Minneapolis Lakers 1956-57 | gamePace, transitionShare, assistedRate, postUpShare |
| 1960s | New York Knicks 1967-68 | Philadelphia 76ers 1968-69 | movementShare, assistedRate, gamePace, transitionShare |
| 1970s | Philadelphia 76ers 1977-78 | Portland Trail Blazers 1974-75 | gamePace, transitionShare, postUpShare, orebRate |
| 1980s | Los Angeles Lakers 1981-82 | New York Knicks 1983-84 | gamePace, orebRateAgainst, transitionShare, assistedRate |
| 1990s | Indiana Pacers 1994-95 | Portland Trail Blazers 1991-92 | gamePace, movementShare, transitionShare, orebRate |
| 2000s | Boston Celtics 2007-08 | Houston Rockets 2007-08 | refPppVsTeam, assistedRate, gamePace, movementShare, postUpShare |
| 2010s | Denver Nuggets 2012-13 | Toronto Raptors 2018-19 | gamePace, transitionShare, refPppVsTeam |
| 2020s | Indiana Pacers 2023-24 | San Antonio Spurs 2020-21 | gamePace, transitionShare, assistedRate, movementShare |

`assistedRate` is scored on five traits and `refPppVsTeam` on three — the two
mechanisms 6C4C1 repaired are both under test. That is a hard constraint of the
selection policy, not a coincidence; see below.

## Building the pool

### The Phase 6C4C1 pool could not have worked

It added the calibration and Historical V3 exclusion lists as raw fixture ids
(`h3-1956-57-celtics`) while keying candidate rows as `Boston Celtics|1956-57`,
so neither exclusion could ever match. 24 calibration team-seasons and 8
consumed V3 team-seasons stayed in the pool, and its first "eligible" row was
itself a calibration corpus team.

Every id is now normalised to a canonical team-and-season key
(`tsKey`: lowercased, non-alphanumerics stripped) and every lineup comparison is
made on canonical person ids (`calPerson`, `lineupKey`).

### Correcting it emptied the universe

Applied properly, the exclusion set empties a universe drawn only from the
corpus and the prior holdout manifests, because every team-season in those is
consumed. The corrected policy returned **0 eligible** — the honest answer to
the wrong question.

The universe is now the union of all four calibration player stores, which also
hold team-seasons that were profiled but never bound into any set. That yielded
24 unseen team-seasons.

### The near-overlap rule then removed half of them

12 of those 24 shared four or five of their five with an already-consumed
roster — adjacent dynasty seasons, which is exactly what the rule exists to
catch. Five of the twelve were team-seasons this phase had ingested for era
coverage without pre-screening lineup overlap. They are kept and still ingested
rather than deleted, so the audit shows the rule firing on this phase's own
additions.

### Two constraints bound the expansion hard

**Coach identity.** `src/v3/data/coaches.js` holds 30 coaches, which makes whole
franchises unreachable. The only 1950s coaches are Red Auerbach and John Kundla,
so every 1950s candidate must be a Celtics or Minneapolis Lakers season. The
entire 1960s admits just three team-seasons with a resolvable coach, so that era
sits on the 3-team minimum with two sides at exactly 3/5 shared people — allowed
and recorded by the frozen rule, not waived.

**Lineup distance.** A candidate's five must share at most three people with
every lineup any prior set has seen — including era references, synthetic
development and stress fixtures, and Candidate 2's own control rosters.

Three waves of ingestion followed, all through the certified V4 adapter path:
7 gap fixtures, 22 pre-screened additions, and 2 more after the taint below.
155 player-seasons, 31 fixtures, every one with a complete documented five and
a coach named on that season's own Wikipedia page.

### Names the adapter refused

Five player-seasons would not resolve, and each was corrected against the source
rather than guessed:

| Proposed | Corrected | Why |
|---|---|---|
| Tom Sanders | Satch Sanders | article title; `Tom Sanders (basketball)` does not exist |
| Satch Sanders (1959-60) | Jim Loscutoff | Sanders was drafted in 1960 and is not named on the 1959-60 season page |
| Charlie Scott (1974-75) | Don Chaney | Scott is not named anywhere on the 1974-75 Celtics season page; he joined the following season |
| Lafayette Lever | Fat Lever | article title |

The adapter refusing rather than substituting a near match is what made all five
visible.

### A real blindness in the ingestion

`TEAM_ALIASES_V6` was defined but never handed to the adapter, which read
`TEAM_ALIASES_V4` directly. `DEN` and `ORL` matched no alias, so no career row
could match and all five Denver 1984-85 profiles fell through to the roster path
with null stats — while Alex English's career table holds a complete 1984-85
Denver row. Nulls, not zeros, so nothing was fabricated, but the profiles were
needlessly blind. The alias table is now a parameter defaulting to
`TEAM_ALIASES_V4`, so V4 and V5 resolve byte-identically.

## Eligibility policy 3.0.0

Frozen before selection. Reads only source characteristics: 14 allowed inputs,
9 forbidden output inputs, 0 Candidate 2 simulations.

Requirements: five profiled players, five documented starters, four positions
covered, at most two low-confidence profiles, an era style, a resolvable coach
verified as named on that season's page, and **at least one scoring-eligible
identity trait**.

That last rule was missing from version 1. The V4 corpus builder already had it,
and without it three of the sixteen sides the first selection chose had no
scoreable trait at all — their side of a matchup could contribute only
structural evidence, and the "no matchup may fail a majority of its scored
traits" rule was vacuous for them.

Hard exclusions: historical calibration V3, Historical V3/V4/V5, synthetic
development and stress V2, Candidate 0/1/2 fixtures and controls, probability
validation, side symmetry, era references, and team-seasons simulated during the
version-1 dry run.

Near-overlap: 5/5 and 4/5 excluded outright, 3/5 allowed and recorded. No
exceptions were granted.

Result: 33 eligible team-seasons, 3 to 5 per era, 20 franchises, 23 coaches.

## Selection policy 2.0.0

Frozen before selection, with no selection artifact in existence at freeze time.

Hard constraints: both sides from the frozen pool, both in the matchup's era,
different franchises, different coaches, no team-season twice, one matchup per
era, every side with at least one scoreable trait, and the sixteen sides
together covering both repaired mechanisms.

Preference order, strictly lexicographic — first non-zero difference decides, so
no weights exist to tune:

1. **tacticalDistance** — differing pace, offense and defense descriptors plus
   the tag symmetric difference. A matchup between two teams that play the same
   way cannot separate offensive from defensive attribution: the mirror-fixture
   problem that cost Historical V5 a one-time holdout.
2. **freshness** — furthest from anything any prior set has seen.
3. **coachDistinctnessAcrossSelection**.
4. **newMetricCoverage** — metrics no earlier era already claims.
5. **sourceCompleteness**.

Tie-break: `sha256(era|keyA|keyB)`, lowest wins. A total order on identity alone,
so it is stable under any input permutation and cannot be steered by a result.

### The version-1 selection covered neither repaired mechanism

Not by design. The version-1 preference order — tactical distance then freshness
— passed over every pool team carrying an `assistedRate` or `refPppVsTeam`
claim: Miami Heat 1996-97, Boston Celtics 2007-08 and Toronto Raptors 2018-19
for `refPppVsTeam`, Los Angeles Lakers 1981-82 for `assistedRate`. All four were
eligible and all four went unselected.

V6 would have been a **weaker test than the V5 it replaces**, on precisely the
two metrics V5 failed. A holdout that cannot observe the repair cannot validate
it.

Version 2 makes coverage a hard constraint on the whole selection and defines a
deterministic `coverageRepair` — enumerate every era and every valid pair that
would cover the missing metric, apply the substitution with the smallest rank
loss in its own era's ordering, tie-broken by era order then hash. In the event
the repair was not needed: the `newMetricCoverage` term alone brought Boston
2007-08 and Toronto 2018-19 in, so zero repairs were applied.

Minimum tactical distance across the eight matchups is 5. Reorder stability is
proven over eight deterministic permutations.

## Trait vocabulary

The trait registry is keyed by the descriptor **string**, so a style written as
free prose resolves to no trait, no metric and no claim. Wave two of the spec
was written in prose: 50 of 92 descriptors across the selected sides matched
nothing.

`STYLE_TO_REGISTRY` projects prose onto the controlled vocabulary, mechanically
and identically for every row, with the prose retained as `documentedStyle`. A
term with no registry equivalent maps to null and is dropped rather than
approximated — `GUARD_HEAVY`, `PHYSICAL` and `WING_HEAVY` describe rosters the
registry has no metric for.

`STRONG_DEFENSE` is deliberately **not** mapped to `ELITE_DEFENSE`. The
registry's only claim-bearing defensive-quality trait is ELITE, and promoting
"strong" to "elite" would strengthen a documented claim in order to make it
scoreable.

## Observability under Candidate 2

Re-measured, not inherited. 16 metrics × 3 control cells × 2,000 games, the same
protocol the Candidate 1 pass used.

**11 of 16 metrics certify under Candidate 2, against Candidate 1's 12.**
`interiorShotShare` lost certification: its strong control no longer separates
from neutral (0.52992 against 0.52917), with a control range of 0.02016 against
0.02357 under Candidate 1. Recorded as a scope reduction attributable to the
assisted-offence repair, and excluded from V6 scoring. Raising the sample size
until it certified would be choosing the protocol after seeing the result.
Eligible traits fall from 55 to 53.

Era references are also re-certified under Candidate 2, because every V6 trait
claim reads above or below a reference baseline. Scoring Candidate 2 against
Candidate 1's baselines would measure the repair rather than the trait. All
eight certify; baselines moved by -0.003 to +0.003 ppp. A gate fails if none
moved — an inert repair and a silently re-read Candidate 1 baseline are
indistinguishable in the artifact otherwise. The "outscored by every population
team" criterion withdrawn during the Candidate 1 pass stays withdrawn.

## Targets

48 usable team cells — games, wins and losses on all sixteen sides, parsed from
each season's own page. 432 null cells, each naming why:
`NOT_RECORDED_IN_ERA` or `SOURCE_BLOCKED_LICENSING`.

A null target contributes no error, no pass credit and no failure. It is never
zero-filled, never imputed and never treated as a measurement of zero. A gate
checks the `usable` flag agrees with the value on every cell, so a null cannot
enter scoring through a mislabelled flag.

`SOURCE_BLOCKED_LICENSING` exists because basketball-reference.com is
`PROHIBITED_FOR_MODEL_CALIBRATION`. Wikipedia (CC BY-SA 4.0) is the authorized
source and only extracted numeric facts are committed.

## Verdict policy: clusters, not labels

V5 aggregated on trait **labels** and reported 3 hard fails. Phase 6C4C1 showed
two of those labels were one observation — identical fixture, side, metric,
surface, direction, observed value and reference value. The real independent
evidence was 2 clusters.

A label count double-counts whenever two trait names claim the same
measurement, which inflates the apparent weight of evidence and would let a
naming decision change a verdict.

V6 aggregates on `INDEPENDENT_MEASUREMENT_CLUSTER`, keyed on
`matchupId | side | metricId | surface | direction | observed | reference`. The
key excludes the trait label. Every label is preserved in the register and the
result; only the evidence count collapses.

Gate: `maxIndependentHardFailClusters: 0`. Label counts are reported and never
aggregated.

Per-trait rule is the dual gate: a hard fail needs the wrong direction **and** a
95% interval excluding zero **and** a difference beyond the metric's frozen
practical margin. A significant difference inside the margin is
`STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT` — never a failure at any tier.

## Sample plan

| Tier | Games per surface | Role | May decide |
|---|---|---|---|
| 0 | 512 | dry run only | no |
| 1 | 1024 | smoke | no |
| 2 | 2048 | precheck | no |
| 3 | 4096 | **decision** | yes |
| 4 | 8192 | escalation | yes |

The decision tier is 4,096 — the frozen V5 protocol size, so a V6 number is
directly comparable to a V5 number. 98,304 games at the decision tier.

Progressive equivalence: a cluster is declared only where the precheck and
decision tiers agree. A cluster that is indeterminate at the decision tier, or
on which the two tiers disagree, escalates to 8,192 and the escalated state
governs.

Escalation triggers on indeterminacy or tier disagreement **alone**. It is never
conditioned on the sign of the difference, so it cannot preferentially rescue a
failing measurement or a passing one. The decision tier always runs in full;
escalation adds samples and never truncates a tier early on a favourable interim
reading. A cluster still indeterminate at the cap is reported INDETERMINATE and
contributes neither pass credit nor failure.

## Seeds

Domain `HISTORICAL_V6_FORMAL`, master `0x6c4c20`, in validation-only code —
`seedDomains.js` is one of the 53 frozen Candidate 2 core files, and registering
V6 there would change the core hash the verdict pins.

Address: `tier * 5,000,000 + matchup * 300,000 + surface * 100,000 + pair`.

The tier is part of the address. The sample plan claims an escalation cannot
reuse a decision-tier seed and inflate agreement between tiers; that claim is
only true if the addressing makes it true, so it is proven over the exact
addresses each tier would draw: **zero collisions across all five tiers**, and
zero against all 19 prior seed populations including both consumed V5 streams.

## Runner

`npm run validation:historical-v6`

Four modes, exactly one required. `--help`, `--preflight` and `--dry-run` cannot
reach the seal; only `--run` can, and only with `--unlock-holdout`,
`--unlock-historical-holdout-v6`, `--operator` and `--reason`.

V5's runner ran the real thing when given no mode, so a mistyped flag was one
keystroke from a one-time access. Here a bare invocation is refused and an
unknown flag is a hard refusal before anything else happens — Phase 6C4B2R found
the compound-verdict command accepting unknown flags and writing an artifact out
of order.

Transactional: one access event, incremental writes after every matchup, resume
under the same access event only, and a refusal for a second independent run.
Refusal codes: `SECOND_RUN_REFUSED`, `IDENTITY_MISMATCH`, `ALREADY_COMPLETE`,
`NOTHING_TO_RESUME`, `MOCK_SEALED`, `NO_REASON`, `ACCESS_COUNT_UNEXPECTED`.

## The dry run, and the leak it caused

`npm run v6:dryrun` — 44 branches: seven command-surface refusals, all six
RunRefused codes, the crash-and-resume transaction, identity mismatch on every
pinned hash, the scoring path end to end on a calibration fixture, cluster
collapse in both directions, and the escalation path.

It imports the real runner module rather than reimplementing it, because the V5
dry run earned its keep by catching self-baselines keyed by sample field instead
of metric id — every trait would have scored `NOT_APPLICABLE` on the one-time
access.

**Version 1 of the dry run leaked.** Its progressive-equivalence section built
its evaluator from `pkg.m.matchups[0]` — the real first V6 matchup — and played
384 games against it. Boston Celtics 1950-51 and Minneapolis Lakers 1955-56 had
therefore been simulated by Candidate 2 outside the formal run, with per-trait
reported states recorded in the artifact.

The seal's leak-scan gate caught it and refused. The seal artifact claims
Candidate 2 has never been simulated against any of the sixteen selected
team-seasons; that claim would have been false for two of them. Weakening the
claim to fit what happened would make the seal worthless.

Both team-seasons are excluded with reason `SIMULATED_DURING_V6_DRY_RUN`, read
from `v6-dry-run-taint.json` rather than hand-listed, and the tainted dry run is
preserved under `superseded/` as the evidence. The dry run now assembles a mock
matchup from two calibration corpus fixtures: same evaluator, same code path, no
V6 team-season in it.

Excluding those two left the 1950s with two eligible teams and one possible
pair, below the frozen minimum, which is why wave three exists.

## The seal

`npm run v6:seal`. Registration in `SEALED_SETS` **is** the seal — there is no
separate lock to forget to apply. `holdoutSeal.js` sits outside the 53-file
Candidate 2 core, so registering V6 does not move the core hash.

29 gates, every bound hash checked immediately before sealing so a seal can
never claim to bind something that has already moved.

The leak scan is inverted relative to V5's. Its first version searched files
matching an output-name pattern and exempted four by name — but none of the four
matched the pattern in the first place, so the "explicit exemption" was dead text
and the real protection was a regex quietly failing to match. It also read HEAD
rather than the working tree, so it depended on commit ordering.

Now every one of ~826 json and jsonl files under the data trees is searched, and
every file naming a V6 identity must be on an allowlist with a stated reason.
Two further gates keep the allowlist honest: one fails if any entry matches no
real file, one fails if a verified entry's machine check does not hold. Four
prior-set pool and store artifacts name five V6 sides that the V5 pool defined
and V5 never selected; each is verified to declare zero candidate outputs and
carry no per-fixture measurement.

## What a V6 result would and would not mean

A PASS is the first of two formal stages. It does not by itself make Candidate 2
`HOLDOUT_VALIDATED`, `PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_READY` or
`ACTIVE`, and it authorizes no deployment. Production activation requires an
explicit CEO GO LIVE.

A FAIL preserves every artifact, forbids tuning against V6, keeps Synthetic
Stress Holdout V2 sealed at access 0, and ends formal validation for
Candidate 2.
