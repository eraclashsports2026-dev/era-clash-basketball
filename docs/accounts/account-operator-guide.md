# Account operator guide

## Switching accounts on

See `docs/accounts/eraclash-account-provider-setup.md`. Two flags and four
variables; nothing happens until both the flag is `true` and the provider is
genuinely configured.

Check state at any time, safely:

```bash
npm run account:verify-provider -- --remote
```

It prints booleans, a migration version and whether row level security is
refusing anonymous reads. It never prints a key.

## Switching accounts off

Set `CLOUD_ACCOUNTS_ENABLED` and `VITE_CLOUD_ACCOUNTS_ENABLED` to anything other
than `true`, then redeploy. Guest play is unaffected, the sign-in dialog says
plainly that accounts are not switched on, and no fake session succeeds. Data
already in Postgres is untouched.

## The gates

| Command | What it proves |
| --- | --- |
| `npm run account:preflight` | the layer is coherent and honestly disabled when unconfigured |
| `npm run account:migrations-qa` | the schema contract, including the absence of an email column |
| `npm run account:rls-qa` | every policy is scoped to `auth.uid()`; two synthetic users cannot see each other |
| `npm run account:auth-qa` | PKCE, Google, email code, callback scrubbing, redirect guard, closed failure codes |
| `npm run account:guest-claim-qa` | one owner per result, idempotent claims, refused foreign results |
| `npm run account:cloud-save-qa` | the career row is built from the authoritative record only |
| `npm run account:security-qa` | no service key in any bundle, no token in a URL, preview and product stay separate |
| `npm run account:my-eraclash-qa` | the career page requires an account and invents nothing |
| `npm run account:responsive-qa` | eight widths, 44px controls, no overflow, no email on screen |
| `npm run account:deployed-qa -- <url>` | the same, against a real deployment |

`npm run account:rls-qa` verifies the policy set by analysing the applied DDL
and simulating two users against an adapter that implements the same rules. Once
provider credentials exist, run the deployed driver as well so the policies are
exercised by a live Postgres.

## Removing an account

Delete the row in `auth.users` (Supabase dashboard → Authentication → Users).
The profile, every saved clash and every claim cascade with it. There is no
self-service deletion in this phase, so this is an operator action, and it is
irreversible.

## When a save fails

A failed save never loses a result and never re-runs a simulation. The player
sees SAVE FAILED — TRY AGAIN under a result that is still fully on screen.
Common causes, in the order worth checking:

1. `SUPABASE_SERVICE_ROLE_KEY` missing or rotated without a redeploy — the route
   answers `503 CLOUD_ACCOUNTS_DISABLED`.
2. The account token expired while the tab was open — the provider refreshes it
   automatically; a retry succeeds.
3. The result expired from the store — the route answers `404 not_found`. Result
   records live 180 days; nothing can be claimed after that.
4. Another account already claimed that result — `409 already_claimed`. This is
   the intended refusal, not a fault.

## What the account layer must never do

- treat a preview tester key as an EraClash account
- store a preview tester identity in a career
- create a cloud account automatically from a preview key
- let product sign-in bypass the preview gate
- accept a score, roster, candidate id or user id from a request body
- put a token in a URL, a log, an artifact or a telemetry property
- show a fake successful account when the provider is not configured
