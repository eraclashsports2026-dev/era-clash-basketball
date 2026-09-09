# Historical source registry

`data/calibration/source-registry.json`, built by
`npm run calibration:build-source-registry`, inspected by
`npm run research:calibration -- sources | provenance | policy`.

## Policy

> Do not use any source whose terms prohibit its data from being used to train,
> fine-tune, prompt, instruct, calibrate, evaluate or otherwise develop AI or
> model technologies.

Permitted classes: `OFFICIAL_PUBLIC_SOURCE`, `AUTHORIZED_PUBLIC_API`,
`OPEN_LICENSE_SOURCE`, `LICENSED_EXPORT`,
`MANUAL_VERIFIED_IMPORT_FROM_AUTHORIZED_SOURCE`,
`DERIVED_FROM_AUTHORIZED_TOTALS`.

## Prohibited and unused

**Sports Reference LLC (basketball-reference.com)** —
`PROHIBITED_FOR_MODEL_CALIBRATION`. Its terms forbid exactly this use.

The exclusion is recorded as data, not prose, and enumerates the routes by which
the prohibition could be evaded while appearing compliant: direct retrieval,
mirrors and re-hosts, third-party re-publications of its tables, manual re-entry
of its values, laundering through a derived or intermediate file, and use of its
identifiers as a lookup key. All are excluded. Technical accessibility is not
authorization.

This source is unused in every artefact of this phase. The cost of that decision
is quantified in `historical-target-coverage-v3.md`: 784 of 960 team-level
target fields are `SOURCE_BLOCKED_LICENSING`.

## What is committed

Structured facts only. For each of the 160 profiles:

| Field | Purpose |
|---|---|
| `sourceType` | Which permitted class |
| `publisher`, `sourceUrl`, `revisionId` | Exact revision, not just the article |
| `contentHash` | Detects the page changing under us |
| `retrievedAt` | When |
| `licenseNote`, `attribution` | CC BY-SA 4.0 compliance |
| `verificationStatus`, `extractionRoute` | How the value was obtained |
| `derivation` | The formula, where a value was computed |
| `confidence` | Weakest-link, carried up into fixtures |

No third-party page content is committed to this repository — no article text,
no cached HTML, no table dumps. Only extracted numeric facts and the metadata
needed to verify them.

## Current state

| | |
|---|---|
| Entries | 160 |
| Source class | 160 × `AUTHORIZED_PUBLIC_API` |
| Publisher | 160 × Wikipedia (Wikimedia Foundation) |
| Licence | 160 × CC BY-SA 4.0 |
| Route | 153 player career table · 4 team-season statistics · 3 roster-only |
| Policy violations | 0 |
| Unprovenanced entries | 0 |
| Registry hash | `dc5ae608117301c3` |

**Attribution.** Player-season statistics are extracted from Wikipedia articles,
© Wikipedia contributors, released under CC BY-SA 4.0. Each entry records the
exact revision used.

## Single-publisher concentration

Every entry currently comes from one publisher. This is a real risk, not a
convenience: an error in Wikipedia's tables, or a change in its terms, would
affect the entire corpus at once, and no second source is present to contradict
it. Adding an independent authorized source is the highest-value data work
remaining, and it is recorded in `phase-6c2c1-limitations.md` rather than left
implicit in a clean-looking table.
