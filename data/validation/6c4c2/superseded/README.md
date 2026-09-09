# Superseded Phase 6C4C2 artifacts

Preserved, never deleted, because they record what was true when they were
issued. Nothing here was edited in place; each was moved aside and replaced by a
version with an incremented number and a stated reason.

## The V6 eligibility policy, pool, selection and targets, version 1

Two defects, both found **before any Historical V6 game was played**. No V6
result, run or seal existed at any point, so neither correction is result-aware.
That distinction is the whole point of finding them here rather than after.

### 1. No scoreable-trait requirement

`historical-v6-eligibility-policy-v1.json` required five profiled players, five
documented starters, four positions, at most two low-confidence profiles, an era
style and a verified coach — but never required a **scoring-eligible identity
trait**. The V4 corpus builder already refused a fixture with none
(`scripts/validation/buildCorpusV4.mjs`: "no scoring-eligible identity trait").
I omitted the rule.

The consequence was concrete: three of the sixteen sides in
`historical-v6-selection-v1.json` — Minneapolis Lakers 1958-59, New York Knicks
1967-68 and Orlando Magic 2008-09 — had **no scoreable trait at all**. Their
side of a matchup could contribute only structural and numeric evidence, and the
per-fixture rule "no matchup may fail a majority of its scored traits" was
vacuous for them.

The root cause sat one layer down. The trait registry is keyed by the descriptor
**string**, so a style written as free prose resolves to no trait, no metric and
no claim. Wave two of `corpus-v6-spec.mjs` was written in prose: 50 of the 92
descriptors across the selected sides matched nothing in the registry.
`STYLE_TO_REGISTRY` now projects that prose onto the controlled vocabulary,
mechanically and identically for every row, with the original prose retained as
`documentedStyle`. A prose term with no registry equivalent maps to null and is
dropped rather than approximated — and `STRONG_DEFENSE` is deliberately **not**
mapped to `ELITE_DEFENSE`, because promoting "strong" to "elite" would
strengthen a documented claim in order to make it scoreable.

Seattle SuperSonics 1982-83 has no distinctive documented style and now falls
out of the pool on the new rule. That is the rule working, not a loss.

### 2. The selection covered neither repaired mechanism

This is the more serious one. Phase 6C4C1 repaired exactly two mechanisms:
assisted-offense expression (`assistedRate`) and defensive suppression
(`refPppVsTeam`). Those are the two metrics Candidate 1 failed Historical V5 on.

`historical-v6-selection-v1.json` claimed **neither**. Not by design — the
version-1 preference order maximised tactical distance and freshness, and that
ordering happened to pass over every pool team carrying such a claim: Miami Heat
1996-97, Boston Celtics 2007-08 and Toronto Raptors 2018-19 for `refPppVsTeam`,
Los Angeles Lakers 1981-82 for `assistedRate`. All four were eligible and all
four went unselected.

V6 would therefore have been a **weaker test than the V5 it replaces**, on
precisely the two metrics V5 failed. A holdout that cannot observe the repair
cannot validate it.

Version 2 makes whole-selection coverage of both metrics a hard constraint,
adds a `newMetricCoverage` preference term, and defines a deterministic
`coverageRepair` for the case where the preference pass still leaves a metric
uncovered. In the event the repair was not needed: the breadth term alone brought
Boston Celtics 2007-08 and Toronto Raptors 2018-19 in, so zero repairs were
applied. The selected set now claims `assistedRate` on four matchups and
`refPppVsTeam` on two, across eight distinct certified metrics.

### What did not change

The universe, the exclusion sets, the near-overlap rules, the normalisation, the
player profiles and the 145 ingested player-seasons are identical. The pool went
from 34 eligible team-seasons to 33 — Seattle 1982-83 only. Both policy versions
are frozen before their selection, and the version-2 selection is reorder-stable
across the same eight deterministic permutations.
