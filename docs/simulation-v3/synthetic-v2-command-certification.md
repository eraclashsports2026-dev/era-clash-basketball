# Formal validation command certification

Phase 6C4B2 prepared a command that did not exist: `package.json` had no
`validation:synthetic-v2` script, so the prepared command could not execute.

## Method

each non-accessing mode was executed in a child process and the per-set access logs were read immediately before and after. Nothing here is certified by inspecting source.

## The three commands

| stage | npm script | module |
|---|---|---|
| 1 | `validation:historical-v5` | `scripts/validation/historical-holdout-v5.mjs` |
| 2 | `validation:synthetic-v2` | `scripts/validation/synthetic-stress-holdout-v2.mjs` |
| 3 | `validation:candidate1-formal-verdict` | `scripts/validation/candidate1FormalVerdict.mjs` |

## Non-accessing modes, executed

| command | mode | exit | access counts |
|---|---|---|---|
| `validation:synthetic-v2` | `--help` | 0 | unchanged |
| `validation:synthetic-v2` | `--dry-run` | 0 | unchanged |
| `validation:synthetic-v2` | `--preflight` | 2 | unchanged |
| `validation:candidate1-formal-verdict` | `--help` | 0 | unchanged |

`--preflight` exits 2, which is a refusal rather than a crash, and the correct
state today: it reports its verifications and refuses because Historical V5 has
not run. Both access logs were untouched by every invocation.

## Access counts across the whole certification

- `historical-holdout-v5`: 0 before, 0 after
- `synthetic-stress-holdout-v2`: 0 before, 0 after

## The prepared commands

- stage 1: `npm run validation:historical-v5 -- --unlock-holdout --unlock-historical-holdout-v5 --operator="<name>" --reason="<why>"`
- stage 2: `npm run validation:synthetic-v2 -- --unlock-holdout --unlock-synthetic-stress-holdout-v2 --operator="<name>" --reason="<why>"`
- stage 3: `npm run validation:candidate1-formal-verdict`

