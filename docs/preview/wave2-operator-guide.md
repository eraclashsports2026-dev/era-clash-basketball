# Wave 2 operator guide (owner)

## What Wave 2 is

A private beta of the Phase 9A + 9A.2 experience — Play Lobby, active-run
continuation, multi-position placement, Night Court V1 — on Candidate 4 (1.4.0).
Five pseudonymous testers in two cohorts, one owner key. Wave 1 stays frozen on
its own address with its own keys, sessions, feedback and metrics.

| | Wave 1 | Wave 2 |
|---|---|---|
| Address | `https://era-clash-basketball-git-wave1-era-clash.vercel.app` | the stable `wave2` alias (see `data/validation/9a3/wave2-stable-alias-qa.json`) |
| Wave id | `candidate3-wave1` | `candidate4-night-court-wave2` |
| Keys | `.preview-secrets/wave1-access-keys.json` | `.preview-secrets/wave2-access-keys.json` |
| Feedback | `preview-feedback:*` | `wave2-feedback:*` |
| Metrics | `preview-metrics:*` | `wave2-metrics:*` |

Keys never cross: a Wave 1 key is refused on Wave 2 and a Wave 2 key on Wave 1.

## Before you invite anyone

1. `npm run preview:wave2-readiness` must say `READY_FOR_OWNER_DISTRIBUTION`.
2. Decide who gets which id. `wave2-new-01..03` are for people who have never
   used EraClash; `wave2-returning-01..02` are for Wave 1 testers who have
   finished their Wave 1 sessions. Keep the mapping of ids to people **outside
   the repository** (a private note, not a file here).
3. Copy each person's key from the local key file into their invite
   (`docs/preview/wave2-invite-template.md`). Never paste a key into a chat
   with an assistant, a screenshot, a commit or an issue.

## Running a session

- Send the invite; if the tester agrees, schedule a 20-minute observed session.
- Say nothing beyond the task line for N1. Start a timer at the moment the
  lobby appears. Note the time to their first mode choice and to their first
  roll. Note every hesitation.
- **Do not rescue** unless the tester is stuck for three full minutes; a rescue
  is recorded as a failure of that task.
- Keep an operator log with tester id, task id, timestamps and observations —
  no names.

## Reports

```
npm run preview:wave2-feedback-report      # ratings by cohort, task coverage, failures
npm run preview:wave2-product-metrics      # event totals, timings, per-tester partitions
npm run preview:wave2-access-audit         # who can get in, leak scan, permissions
npm run preview:wave2-readiness            # the go/no-go checklist
```

Each writes JSON and Markdown under `data/validation/9a3/`, runs in explicit
EMPTY-DATA mode without store credentials, deduplicates to the latest revision
per tester/task, keeps the cohorts apart, and refuses to write output that
contains anything shaped like a key.

## Revoking a tester

Set `enabled: false` on their entry in `config/previewAccess.js`, commit, push
`wave2`. Their sessions die on the next request. Rotate by bumping `keyVersion`
with a new hash; the old key and its sessions die the same way.

## What not to do

- Don't reuse a Wave 1 id or key for Wave 2.
- Don't edit `wave1`, `main`, or the Wave 1 alias.
- Don't change `wave2-acceptance-policy.json` or `wave2-test-plan.json` after
  the first human result exists.
- Don't summarise five testers as a percentage of the population.
