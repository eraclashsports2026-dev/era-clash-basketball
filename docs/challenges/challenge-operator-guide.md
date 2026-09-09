# Challenges — operator guide (Phase 9C)

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Contract (pure) | `src/challenges/contract.js` | versions, codes, status, comparison, invitation fields, events |
| Server | `api/_lib/challenges.js`, dispatched by `api/profile.js` | no new serverless function; the account route hosts `challenge-*` actions |
| Schema | `supabase/migrations/0004_challenges.sql` | `challenges`, `challenge_attempts`, `challenge_secrets`; RLS + grants; deletion trigger |
| Browser | `src/challenges/client.js`, `src/components/challenges/*` | share sheet, invitation, comparison, My EraClash tab |
| Run store | `api/_lib/chaosRun.js` (unchanged) | the recipient's run is an ordinary same-seed Chaos run |

## Actions on `/api/profile`

| Action | Auth | Purpose |
| --- | --- | --- |
| `GET ?challenge=CODE` | optional bearer | the public invitation (also `POST action: challenge-view`) |
| `challenge-create` `{chaosRunId}` | bearer required | create from the caller's own finished Chaos run |
| `challenge-accept` `{code, tier}` | optional bearer | start (or resume) the caller's one attempt; guests spend a guest run |
| `challenge-complete` `{chaosRunId}` | optional bearer | bind the server-stored result to the attempt and compare |
| `challenge-revoke` `{code}` | bearer required (creator) | withdraw; completed attempts stay |
| `challenge-list` | bearer required | CREATED with responses, ACCEPTED, COMPLETED |

Statuses are closed sets (see `docs/challenges/challenge-contract-v1.md`).
A presented but invalid token is refused (401), never downgraded to a guest.
Rate limits: 30/min/IP on actions (`RL_CHALLENGE_ACTIONS_PER_MIN_IP`), 60/min/IP on invitation lookups (`RL_CHALLENGE_VIEW_PER_MIN_IP`), under the route's 20/min/IP (`RL_PROFILE_PER_MIN_IP`); test harnesses raise all three.

## Policy knobs

- `CHALLENGE_TTL_DAYS` (30) — `src/challenges/contract.js`. Status is derived
  from `expires_at`; nothing to schedule.
- One official attempt per account — a unique index; a guest gets one per
  device (server-enforced).
- Creator must be signed in — `CHALLENGE_POLICY.creatorMustBeSignedIn`.

## Applying the migration

`0004_challenges` was applied to the certified preview project
(`lfybiphmqkiecfrqsfzt`) on 2026-09-05 through the Supabase management API;
`public.schema_migrations` records it. It is idempotent (`if not exists`,
`drop policy if exists`). Production has no cloud accounts and is untouched.

## Verifying

```bash
npm run challenge:contract-qa
npm run challenge:seed-qa
npm run challenge:rls-qa
# with a fake-cloud harness: ECLASH_FAKE_CLOUD=1 PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview RL_PROFILE_PER_MIN_IP=500 RL_CHALLENGE_ACTIONS_PER_MIN_IP=500 RL_CHALLENGE_VIEW_PER_MIN_IP=500 node scripts/harness.mjs 4178
npm run challenge:security-qa -- http://localhost:4178
npm run challenge:history-qa -- http://localhost:4178
npm run challenge:responsive-qa -- http://localhost:4178
npm run challenge:accessibility-qa -- http://localhost:4178
npx playwright test e2e/phase9c-challenges.spec.js
# on the protected preview (owner key in .preview-secrets/); a seeded live code exercises accept + compare
LIVE_CHALLENGE_CODE=EC-XXXX-XXXX npm run challenge:deployed-qa -- https://<durable alias>
```

The fake cloud (`scripts/lib/fakeCloud.mjs`) plays PostgREST and the auth
"who am I" endpoint in memory; a bearer `test-token.<uuid>` is that user.
Nothing under `src/` or `api/` imports it.

## Operating

- **A user reports a link that "does not work"** — the invitation answers
  `unavailable` for unknown, malformed and deleted-creator codes, `expired`
  after 30 days, `revoked` after the creator withdrew it. All three are
  expected states, not errors.
- **A recipient says their attempt vanished** — a refresh resumes the same
  run; a second browser resumes the same attempt too (one per account). A
  guest's attempt lives with the device session cookie.
- **Comparison missing after a game** — the game is recorded regardless; the
  result offers RETRY COMPARISON, which re-runs `challenge-complete` (idempotent).
- **Deleting an account** — foreign keys set the user to null and the trigger
  clears the display snapshot and roster; the other participant keeps history
  against "Deleted account".
- **Never** copy `challenge_secrets` anywhere. It is the only place a seed lives.
