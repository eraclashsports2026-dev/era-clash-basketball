# EraClash account provider setup (Supabase)

Phase 9B.1 uses **Supabase Auth + Supabase Postgres + Row Level Security**. The
repository had no authentication provider before this phase, so this is the
first one.

Nothing in this document contains a secret value. Do not paste keys into a
ticket, a chat message, a screenshot or a report.

## What the product needs

| Variable | Where it belongs | Visible to the browser |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel env, all environments you want accounts in | yes |
| `VITE_SUPABASE_ANON_KEY` | same | yes (this is by design) |
| `VITE_CLOUD_ACCOUNTS_ENABLED` | same, value `true` | yes |
| `SUPABASE_URL` | Vercel env, server scope | no |
| `SUPABASE_ANON_KEY` | Vercel env, server scope | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env, **server scope only** | **never** |
| `CLOUD_ACCOUNTS_ENABLED` | Vercel env, server scope, value `true` | no |

The service-role key must never appear in a `VITE_*` variable, in git, in a log,
in an artifact or in a screenshot. It is used by one server module
(`api/_lib/cloudAccounts.js`) to write a career record after the server has
verified the account token and proved ownership of the result.

Accounts stay off unless **both** the flag is `true` and the provider is really
configured. A half-configured environment degrades to guest play rather than
showing a sign-in that cannot work.

## Steps

1. **Create or select the project.** In the Supabase dashboard, create a
   project in the region closest to your players. Note its URL, of the form
   `https://<ref>.supabase.co`.

2. **Run the migration.** Apply `supabase/migrations/0001_accounts.sql`, either
   with the CLI:

   ```bash
   supabase link --project-ref <ref> && supabase db push
   ```

   or by pasting the file into the SQL editor and running it once. It is
   idempotent: every object is created `if not exists` or `create or replace`,
   and it records its own version in `public.schema_migrations`.

3. **Set the redirect URLs.** Authentication → URL Configuration. Add the exact
   callback for every origin you will sign in from:

   ```text
   https://<your-branch-preview>.vercel.app/auth/callback
   https://era-clash-basketball.vercel.app/auth/callback
   http://localhost:4177/auth/callback
   ```

   The product only ever sends the visitor back to a same-origin path of its
   own, so a redirect URL you did not add simply fails rather than leaking.

4. **Enable Google.** Authentication → Providers → Google. Create an OAuth
   client in the Google Cloud console, set its authorised redirect URI to
   `https://<ref>.supabase.co/auth/v1/callback`, and paste the client id and
   secret into Supabase. Nothing from Google needs to reach this repository.

5. **Enable email.** Authentication → Providers → Email. Turn on **email OTP**
   (a one-time code) and/or magic links. Leave passwords **off**: the product
   has no password field anywhere, so there is nothing to store or reset.

6. **Add the preview environment variables.** In Vercel, set the table above for
   the Preview environment and redeploy the branch. Production comes later and
   needs its own decision — see below.

7. **Verify, without printing anything secret.**

   ```bash
   npm run account:verify-provider -- --remote
   ```

   It prints only booleans, a migration version and whether row level security
   is refusing anonymous reads. Example output:

   ```text
   configured: true
   provider url valid: true
   anon key present: true
   service role key present (server only): true
   service role key absent from VITE_ variables: true
   cloud accounts flag (server): true
   cloud accounts flag (client): true
   provider reachable: true
   migration version: 0001_accounts
   rls enabled: true
   ```

8. **Test the policies with two accounts.** Sign in as one account, save a
   Clash, then sign in as a second account in a separate browser profile and
   confirm the first account's career is invisible. `npm run account:rls-qa`
   runs the same two-user isolation checks against the policy set.

## Production

Production stays off (`CLOUD_ACCOUNTS_ENABLED` unset or not `true`) until you
decide otherwise in a separate phase. Turning it on in production is a
deliberate act: it starts storing real people's game history.

## Rotating credentials

Rotate in Supabase (Settings → API → the relevant key), update the Vercel
variables, then redeploy. The anon key is public by design and rotating it only
invalidates cached clients. Rotating the service-role key immediately stops all
cloud saves until the new value is deployed — no data is lost, and a failed save
leaves the result on screen with a retry.

## Turning it off safely

Set `CLOUD_ACCOUNTS_ENABLED` and `VITE_CLOUD_ACCOUNTS_ENABLED` to anything other
than `true` and redeploy. Then:

- guest play is unaffected, and Chaos Clash and the Daily stay open;
- the header shows the account call to action the product has always shown;
- the sign-in dialog states plainly that accounts are not switched on;
- no cloud save or claim is attempted, and nothing fake succeeds;
- data already in Postgres is untouched and reappears when it is switched on.

## Known limitation

Self-service account deletion and data export are **not** in this phase.
Deleting a row in `auth.users` cascades to the profile, the saved clashes and
the claim ledger, so an operator can remove an account and everything in it —
but the player cannot do it themselves yet. Do not describe this build as
ready for a public launch until that exists.
