# Synthetic V2 formal execution readiness

Phase 6C4B2 stopped at preflight. Its blocker artifact recorded that the
Synthetic Stress Holdout V2 second-stage package could not be executed: the
fixtures, the guardrail policy and the seal existed and were frozen, but there
was no seed set, no per-fixture volume, no verdict aggregation rule, no runner
and no dry run.

This phase built the missing package. The register reconciles sixteen required
components against the authoritative missing list, which is read out of
`data/validation/6c4b2/synthetic-v2-package-blocker.json` rather than restated
from a prompt. A gate refuses the register if any of the blocker's six keys is
unclaimed, or if it cites a key the blocker does not contain.

## What the register found at the start of the phase

| state | count |
|---|---|
| PRESENT_AND_FROZEN | 4 |
| MISSING | 12 |

Four components were already `PRESENT_AND_FROZEN`: the sealed fixture
membership, the frozen conceptual guardrails, and — once this phase wrote them —
the guardrail formalization and the measurement surfaces. Twelve were `MISSING`,
and each `MISSING` row names the artifact this phase had to author.

## The six blocker keys and where each is closed

| blocker key | closed by |
|---|---|
| `seedSet` | `synthetic-v2-seeds.json` — master `0x6c4b1e`, 37,432 addressed seeds |
| `aggregationRule` | `synthetic-v2-aggregation-policy.json` |
| `runner` | `scripts/validation/synthetic-stress-holdout-v2.mjs` |
| `preparedCommandResolvable` | `npm run validation:synthetic-v2`, certified by execution |
| `dryRun` | `synthetic-v2-dry-run.json` — 52 checks |
| `packageBinding` | `compound-formal-validation-package-v2.json` — 20 bound hashes |

## What this phase did not do

It opened neither holdout. Both remain `SEALED_UNREAD` at access count 0. It
simulated no sealed fixture, changed no Candidate 1 file, changed no frozen
threshold, and altered neither set's membership. It deployed nothing.

A complete package is not a validated candidate. Nothing here says anything
about whether Candidate 1 passes either stage.

