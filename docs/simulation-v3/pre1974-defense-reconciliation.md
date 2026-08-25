# Pre-recording defensive data — canonical reconciliation

Canonical source: **`scripts/audit-pre1974-defense.mjs`** (`npm run audit:pre1974-defense`).
Every number in this document is derived by that script at run time. Nothing here is transcribed,
and a test asserts the documented figures match the script's output.

## The boundary

The NBA did not record steals or blocks as official statistics until **1973-74**. Under the project
convention — *a season belongs to the decade of its starting year* — the boundary is start year
**1973**.

## Why three different numbers existed

Three earlier reports gave 50, 45 and 297. All three were about different things, and two of them
were defensible:

| Figure | What it actually counted | Verdict |
|---|---|---|
| **50** | Cards whose every represented season predates 1973-74 (the 1950s and 1960s decades) — and all 50 *are* covered | **True**, but only by silently counting two different coverage mechanisms |
| **45** | Entries in `preRecordingDefense.js` — one mechanism's coverage, spread across a *wider* population than 50 | **True**, but a coverage count presented as a population count |
| **297** | 381 cards minus 84 persons with verified shooting/physical data | **Wrong** — a shooting/physical coverage gap mislabelled as a pre-1974 population. Unrelated to defense |

The root cause of the confusion: **defensive evidence lives in two places.**

- `src/v3/data/preRecordingDefense.js` — evidence-graded bands (`RECORDED_STAT`, `DOCUMENTED_ROLE`, `CALCULATED`, `INFERRED`)
- `src/v3/data/intelligence.js` — human-curated attribute patches, some of which supply defensive values

A card covered only by the second was invisible to any count that looked at the first. That is how
"all 50 reviewed" and "45 entries" were both true at once. The audit now accounts for both, with an
explicit precedence, so each affected card resolves to exactly one status.

## Canonical classification

Recording window, derived per card from the best season evidence available:

| Window | Cards | How decided |
|---|---|---|
| `FULLY_PRE_RECORDING` | **50** | Every represented season starts before 1973 |
| `MIXED_RECORDING_WINDOW` | **5** | Explicit per-season rows straddle 1973 |
| `INDETERMINATE_WINDOW` | **43** | Only a decade label, and the decade straddles 1973 |
| `FULLY_POST_RECORDING` | **283** | Every represented season starts in 1973 or later |
| **Total** | **381** | reconciles exactly |

Where the Wave-1 re-derivation supplies explicit per-season rows, those decide the window outright.
Otherwise only the decade label is known: a decade lying wholly on one side of 1973-74 is still
decidable, but a **1970s** label is not — that card might represent 1970-73, 1976-79, or both. Those
43 cards are reported as `INDETERMINATE_WINDOW` rather than assigned to a side, because
classifying them by decade label alone would be a guess presented as a fact.

## Review status of affected cards

"Affected" = any card that is not fully post-recording, i.e. any card whose steal/block values
cannot be trusted as recorded: **98 cards**.

| Status | Cards |
|---|---|
| `RECORDED_STAT` | 2 |
| `DOCUMENTED_ROLE` | 12 |
| `CALCULATED` | 27 |
| `INFERRED` | 4 |
| `CURATED_ATTRIBUTE` | 7 |
| **Reviewed subtotal** | **52** |
| `UNREVIEWED` | 45 |
| `BLOCKED` | 1 |
| **Total** | **98** |

Precedence: an evidence-graded band outranks a curated attribute, because a band carries a
provenance grade while curation is a human vouching for a value without one. A curated entry counts
as defensive review **only if it actually supplies a defensive field** — several curated cards patch
offence alone, and counting those would inflate coverage without anyone having reviewed anything.

## The remaining gap

All **50** fully pre-recording cards are covered (44 bands + 6 curated). The **45 unreviewed** are:

- **40** `INDETERMINATE_WINDOW` — 1970s cards with no per-season rows
- **5** `MIXED_RECORDING_WINDOW` — `monroe-70s`, `murphy-70s`, `westphal-70s`, `hudson-70s`, `wicks-70s`

`BLOCKED`: **1** — `lucas-m-70s`, where no per-season NBA table is available, so the decade mean
cannot be reproduced. Blocked is not reviewed and is not counted as such.

These 45 are the population the possession engine will read defensive-event inputs for, so they are
recorded in the risk register as a **Phase 6C calibration blocker**, not as a Phase 6A blocker: the
engine must consume whatever confidence the data carries, and 6A's job is to propagate that
confidence honestly rather than to pretend it away.

## Data rules (unchanged, and enforced)

- Never create exact steals or blocks for seasons where they were not recorded.
- Never treat a missing statistic as zero ability. The card stores `stl: 0` / `blk: 0` for
  pre-recording seasons because the *statistic* is absent; the defensive **band** is what the
  intelligence layer reads.
- Never convert a historical description into an exact modern event rate.
- Permitted inputs: documented role, accolades, historical evidence, rebounding, position, team
  role, conservative inferred bands, and an explicit confidence grade.

The audit asserts that **no fully pre-recording card declares a recorded steal or block**, and that
every entry in `preRecordingDefense.js` belongs to a card that actually needs uncertainty handling
(no over-coverage).
