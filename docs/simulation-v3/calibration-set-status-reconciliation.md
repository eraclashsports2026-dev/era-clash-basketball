# Calibration set status reconciliation

`data/calibration/set-status.mjs` · `fixtureSourceRegistryVersion` **1.0.0**

What every set created before this phase actually **is**, from evidence rather
than from what the last report asserted.

## The correction

**Phase 6C2B reported `synthetic-stress-v1` as `SEALED_UNREAD`. That was wrong.**

**19 of its 25 fixtures have their simulated output sitting in committed
Phase 6C2A artefacts** — the zone matrix, the coach matrix, the field-goal
decomposition, the player tails, and both structural baselines.

Its access counter read `0` because the counter was created *after* those
simulations ran. The set's members are the reclassified corpus v1 fixtures,
which were simulated extensively under their original identities before the set
existed. The seal never guarded them.

A set whose outputs engineering has already read cannot validate anything
independently, whatever its counter says. Had a later phase treated it as a
holdout, it would have claimed independence it never had.

## Final statuses

| Set | Classification | Access policy | Previously simulated | Formal holdout? |
| --- | --- | --- | --- | --- |
| `legacy-holdout-v1` | LEGACY_MIXED_HOLDOUT | **SEALED_UNREAD** | no | no — mixes historical and synthetic |
| `historical-corpus-v2` | LIMITED_HISTORICAL_SANITY_SET | AVAILABLE_FOR_DIAGNOSTICS | yes | no |
| `historical-calibration-v2` | INSUFFICIENT_FOR_TUNING | AVAILABLE_FOR_DIAGNOSTICS | yes | no |
| `historical-holdout-v2` | INSUFFICIENT_SAMPLE_ARCHIVE | **SEALED_UNREAD** | no | no — 3 fixtures |
| `synthetic-stress-v1` | **PREVIOUSLY_INSPECTED_ARCHIVE** | PREVIOUSLY_INSPECTED_ARCHIVE | **yes** | **no** |

**No prior set qualifies as a formal holdout.** Historical holdout v3 and
synthetic stress holdout v2 are therefore created fresh, with fixture
combinations that have never been simulated.

## Evidence

Membership in a simulated artefact was checked directly: every fixture ID was
searched for across the committed and cached Phase 6C2A/6C2B outputs.

- `legacy-holdout-v1`: **0 of 7** members appear. Genuinely unread.
- `historical-holdout-v2`: **0 of 3** members appear. Genuinely unread.
- `synthetic-stress-v1`: **19 of 25** members appear.

## What is preserved

Nothing is deleted or overwritten. Corpus v1, corpus v2, all v1/v2 manifests,
the seed manifests, the probability reports, the parameter registry and the
Phase 6C2B reports remain exactly as committed, and their version stamps stay at
the values they were built under. An archive that tracked the current version
would not be an archive.

A test asserts that a set claiming `SEALED_UNREAD` has not been simulated —
which is the specific inconsistency this reconciliation exists to prevent from
recurring.
