# The Synthetic V2 transactional runner

`scripts/validation/synthetic-stress-holdout-v2.mjs`, registered as
`npm run validation:synthetic-v2`.

The 6C4B2 blocker recorded: "NO synthetic-V2 runner module exists, and no npm
script matches /synthetic/."

## It is a transaction, not a script

The runner uses `runSealedSetOnce` — the same function Historical V4 and V5 use.
A holdout can be opened once, and a crash after the unlock has already consumed
the access event, because the set has been seen whether or not the process
finished. So the runner writes after **every** fixture, resumes under the **same**
access event, and refuses to start a second one.

| refusal | when |
|---|---|
| `MOCK_SEALED` | no unlock flag was passed |
| `NO_REASON` | an unlock with no stated reason |
| `NOTHING_TO_RESUME` | `--resume` with no prior run state |
| `IDENTITY_MISMATCH` | a resume under a different candidate, core, policy or holdout |
| `ALREADY_COMPLETE` | resuming a finished run |
| `SECOND_RUN_REFUSED` | a fresh run against an already-opened set |

## Stage order is enforced, not conventional

this set may not be opened unless Historical Holdout V5 has been opened and returned PASS. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening this set would consume a one-shot resource for no evidence. The runner enforces it as SYNTHETIC_ACCESS_REFUSED before the seal is touched.

The check runs before the seal is touched, alongside a check that stage one
scored the **same** candidate core and parameter set.

## Everything verified before the seal is touched

The runner's `preflightChecks()` verifies eighteen conditions: the dry run
passed; the candidate core, parameter set, calibration version and lock revision
are unchanged; no parameter has drifted from its registry default; the acceptance
policy, guardrail registry, margin policy, surface plan, sample plan, seed
manifest, aggregation policy and verdict schema all still hash to what the
formal policy recorded; the membership is unchanged and in order; the seed domain
is still disjoint; every fixture meets the frozen minimum volume; and the set is
still sealed.

Any failure exits `SYNTHETIC_ACCESS_REFUSED` with the access count printed and
unchanged.

## Non-accessing modes

`--help`, `--preflight` and `--dry-run` touch no seal. This is certified by
execution, not by inspection — see `synthetic-v2-command-certification.md`.

## Scoring is shared with the rehearsal

`scripts/synthetic/evalSynthetic.mjs` is imported by both the runner and the dry
run, so the rehearsal scores with the code that will score the sealed set.
Historical V4's runner crashed *after* consuming its unlock because its dry run
had rehearsed a simplified path.

