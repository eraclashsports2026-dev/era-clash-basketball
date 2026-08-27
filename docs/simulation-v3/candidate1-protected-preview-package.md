# Candidate 1 protected-preview package — not prepared

**No preview package was prepared in Phase 6C4B2R.**

The package is reachable only on `CANDIDATE1_HOLDOUT_VALIDATED`. The compound
verdict is **CANDIDATE1_HISTORICAL_V5_FAILED**, so preview status is
`NOT_ELIGIBLE`.

| | |
|---|---|
| package prepared | no |
| package hash | none |
| preview flags changed | 0 |
| preview namespaces created | 0 |
| environment variables changed | 0 |
| deployment commands executed | 0 |
| production flags changed | 0 |

A preview exists to let real users exercise a validated candidate. Preparing one
for a candidate that failed its first formal holdout would package a known
defect for exposure, so the artifact is absent rather than present-and-disabled:
an absent package cannot be deployed by mistake.
