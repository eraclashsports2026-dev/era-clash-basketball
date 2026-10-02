# Loop Foundation environment contract1.0.0

10-02-2026. Preview=`lfybiphmqkiecfrqsfzt`; production=`dxdtnhdeaanhfoqngdel`. Before any provider write, compare the connected ref with Preview. The available connector lists unrelated Dear Future projects, so no provider write was attempted. No Preview service-role credential or owner diagnostic access key is available here. Local memory/fake-cloud evidence is never RLS or SMTP evidence.

The existing Vercel Preview workaround remains in `config/projectRefs.js`, `vite.config.js` and `api/_lib/cloudAccounts.js`. On `VERCEL=1, VERCEL_ENV=preview`, the browser URL, browser publishable key, server URL and server anon key are pinned to Preview. The service-role key is never replaced; the owner must provide the Preview project's secret. Isolation refuses mismatched browser/server refs and prevents Preview from using production. The build prints only environment and public project ref, never a credential.

Correct Preview-only dashboard values:

| Name | Value |
|---|---|
| VITE_SUPABASE_URL; SUPABASE_URL | https://lfybiphmqkiecfrqsfzt.supabase.co |
| VITE_SUPABASE_ANON_KEY; SUPABASE_ANON_KEY | sb_publishable_X--8fugunRzXrZ2p1Ewhsg_V9xp9WH8 |
| SUPABASE_SERVICE_ROLE_KEY | Copy the Preview project's server secret from its own API settings; never production's key. Actual secret is intentionally absent here. |
| CLOUD_ACCOUNTS_ENABLED | true only after the provider and migrations are verified on Preview |

No evidence establishes that this Preview database is paused from inactivity; no keepalive or paid cron was added. If Dashboard shows it paused, resume it there first and confirm the reason before adding a bounded Preview-only scheduled read. Scheduled production writes are prohibited. Production engine and protected Wave promotion flags were not changed.
