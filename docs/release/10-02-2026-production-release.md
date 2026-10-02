# Basketball Loop Foundation — owner release procedure

Last updated10-02-2026. **Release is blocked.** This is a prepared browser procedure, not evidence that SQL, SMTP, a Preview deployment or production has been changed. Branch `phase/loop-foundation` absorbs PR69; PR69 stays open until the replacement is reviewed. No new draft PR or push was possible with the invalid GitHub account authorization. Never merge PR69 separately after the replacement merges.

Before release, resolve the verification report's substantive failures, restore the exact missing historical calibration evidence, and run the real two-account checks on Basketball Preview. Local fake-cloud checks do not prove Postgres RLS. Confirm the operator identity/contact, privacy retention and rights review. Private rooms currently provide an invite, private casual board and completed-result feed; governed Challenge links and cross-device ownership are coded and locally tested, but real authenticated journeys remain release gaps. Any Five supports position-qualified fives; unrestricted out-of-position teams require a separate protected-engine decision. Salary Cap remains unavailable without a sourced dataset.

## 1. Supabase production SQL, before any merge

Open [Supabase Dashboard](https://supabase.com/dashboard), choose **Basketball production**, and confirm the project ref in the address/settings is **dxdtnhdeaanhfoqngdel**. Preview is **lfybiphmqkiecfrqsfzt**. Never use an unrelated project.

Open **SQL Editor → New query**. Paste `docs/release/10-02-2026-production-release.sql`. Review the ordered prerequisite blocks0001–0008. These are the unchanged inherited migrations, including RLS, grants, trigger guards and server-only functions. The new Loop adapters use the existing persistent KV store, not a new Postgres schema. Select and run the prerequisite portion only. Expected: each of the eight migration versions exists; the verification query lists21 named public tables with `rowsecurity=true`: 20 user-data tables plus `schema_migrations`. Other previously installed versions may also be present. No observed production count is known in this session.

In the **separate saved-row repair section**, review the [v2 source review and intentional bundle divergence](saved-clash-repair-v2-source-review.md), then first select **only the read-only audit SELECT** and run it. Save the actual returned totals as the before evidence. Review non-null mismatches or snapshots that cannot recover their fields before proceeding; do not invent replacements. Then select the private backup and repair transaction, run it, and run the audit SELECT again. Expected: saved row total unchanged; `repairable_saved_rows` and the exact `*_recoverable` counts reach zero unless concurrent new recoverable rows arrive; neutral coaches and production-engine candidate nulls remain valid; existing non-null values are never overwritten. Raw missing, invalid-shape, mismatch and incompletely recoverable candidate metadata may remain and must be reviewed. A second repair should change zero saved rows; the private audit log records the rerun. Record actual affected-row counts from Dashboard. This session did not observe any before/after counts.

Use **Database → Tables** to confirm the v2 backup `ops_backup.saved_clashes_20261002_v2` is in the private `ops_backup` schema, unavailable to anon/authenticated. Its first snapshot is preserved on reruns; the inherited dated backup remains separate. Run the final verification query. Do not merge while any ownership/RLS check fails.

## 2. Vercel environment values

Open [Vercel Dashboard](https://vercel.com/dashboard) → **Basketball project → Settings → Environment Variables**. Preserve existing engine, calibration, Wave1/Wave2 and production provider settings. Enter the following only for their specified environments, then redeploy the appropriate Preview from **Deployments → … → Redeploy**.

| Name | Value | Environment / expected effect |
|---|---|---|
| NEUTRAL_TEAM_NAMING | false initially; true for the explicit city+era review | Preview; production only after owner naming review. This is presentation only. |
| STRIPE_PAYMENT_LINK | Leave unset until a real link exists; then paste its exact `https://buy.stripe.com/…` URL | Preview/Production as intended. Unset renders no payment button. Never changes play. |
| VITE_POSTHOG_KEY | Leave unset initially; optional public project key copied from PostHog project settings | Preview first, Production after delivery is verified. Never a personal API key. |
| VITE_POSTHOG_HOST | https://us.i.posthog.com; use https://eu.i.posthog.com only for an EU project | Same environments as the optional key. |
| LOOP_FOUNDATION_ENABLED | false is the reversible server kill switch; true enables the adapters | Keep production disabled while release gaps remain; verify Preview first. |
| ROOM_EMAIL_NOTIFICATIONS_ENABLED | false | Preview and Production; the sender is not configured. |
| SMTP_VERIFIED | false until an actual provider delivery test passes | Server-only verification flag; setting it does not install a sender. |
| VITE_SUPABASE_URL | https://lfybiphmqkiecfrqsfzt.supabase.co | **Preview only** |
| SUPABASE_URL | https://lfybiphmqkiecfrqsfzt.supabase.co | **Preview only** |
| VITE_SUPABASE_ANON_KEY | sb_publishable_X--8fugunRzXrZ2p1Ewhsg_V9xp9WH8 | **Preview only**, existing public publishable key |
| SUPABASE_ANON_KEY | sb_publishable_X--8fugunRzXrZ2p1Ewhsg_V9xp9WH8 | **Preview only** |
| SUPABASE_SERVICE_ROLE_KEY | Copy the secret from **the Preview project's** API settings; its actual value is intentionally not recorded | **Preview only, server-only**. Never use a `VITE_` prefix. |
| CLOUD_ACCOUNTS_ENABLED | true after Preview schema/provider verification | Preview; do not blindly change production's current setting. |
| PUBLIC_SITE_ORIGIN | The exact existing Basketball domain from **Settings → Domains**, including https:// | Optional; otherwise the build derives the URL from Vercel's project/deployment URL. Never enter localhost for a cloud deployment. |

The Preview URL/publishable-key code workaround remains in place. The service-role key still has to belong to Preview. Expected build log: environment=preview, project=lfybiphmqkiecfrqsfzt, no secret values. Keep existing persistent KV credentials server-only; memory/fake-cloud flags must never be configured on a real deployment. No new paid service is required. A Preview keepalive was not added because inactivity pausing was not established.

## 3. SMTP and redirects

Create a provider through its website. For the verified free-tier option, [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) currently state3,000/month,100/day and three verified domains; each recipient counts. Verify the sending domain using the DNS records supplied by the provider before SMTP configuration.

In the correct Supabase project, open **Authentication → Email / SMTP settings → Enable custom SMTP**. Provider-agnostic fields: sender address on your verified domain, sender name `EraClash`, provider host, TLS port, username, password/API credential. For [Resend SMTP](https://resend.com/docs/send-with-smtp): host `smtp.resend.com`, username `resend`, port465TLS or587STARTTLS, password the provider's SMTP/API credential. Enter that secret only in Dashboard. Never paste it into this repository or a chat.

Open **Authentication → URL Configuration**. Production **Site URL** is the exact HTTPS Basketball domain shown in Vercel Domains; Preview's Site URL is the actual replacement-branch Preview URL once one exists. Add the matching `/auth/callback` URL to each project's Redirect URLs. Preview redirects must not point to production. Broad wildcard redirects require explicit owner review; prefer exact active Preview URLs.

Open **Authentication → Email templates**. The current UI redeems emailed one-time codes, so the sign-in template must display `{{ .Token }}`. Preserve compatible link handling only if tested; do not replace it with an unrelated password-reset flow. The product has no password UI, so user-facing password reset is **not applicable**. For Preview test accounts created by an admin for automated tests, password grants are a test method only. Supabase's built-in sender is team-only and severely limited; [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) is required for public addresses. Review the project's actual Auth rate limits after SMTP setup.

Smoke test: on Preview, use a real owner-controlled address outside the organization, request a code once, inspect its receipt/sender, redeem it, save a completed game, sign out and sign back in. Confirm the callback stays on Preview and errors recover safely. Record delivery latency and failures; an accepted send request alone is not proof of receipt. Do not enable room notifications merely because auth email works.

## 4. GitHub replacement PR and merge

Open [GitHub](https://github.com/eraclashsports2026-dev/era-clash-basketball). Restore the correct authorized account connection through the browser/app account controls. The locally committed branch must be transferred/pushed before GitHub can create the replacement PR; that transfer is blocked in this session, and there is no fabricated PR URL. Once the branch exists remotely, use **Pull requests → New pull request**, base `main`, compare `phase/loop-foundation`, and create **one draft**. Its description must state that it supersedes PR69, include current Run2/Run3 evidence and list unresolved blockers.

Review the complete diff and real Preview evidence. **Merge pull request is the production deployment trigger and must follow successful SQL/RLS checks in step1.** Do not merge with unresolved substantive failures or unavailable Preview account verification. Leave PR69 unmerged, then close it as superseded only after the replacement has actually merged. No merge is authorized or performed by this session.

## 5. Post-release browser checks

Use the confirmed production domain from Vercel **Domains** as the prefix for `/`, `/clash/modes`, `/clash/any-five`, `/clash/daily`, `/clash/spin`, `/clash/filters`, `/clash/gauntlet`, `/clash/lab`, `/clash/franchise`, `/clash/tonight`, `/clash/rooms`, `/privacy`, `/terms`, `/support` and `/sitemap.xml`. Expected: Light Court, meaningful states, working touch targets, no horizontal scroll, no paid play wall in new Loop routes, and435 real pairing URLs. Today may have no scheduled games; that is an honest empty state. Opening-night date10-20-2026 should show the three sourced matchups.

Complete a guest Any Five, open its generated card, send its URL to an owner-controlled device, and play a rematch there without signing in. Inspect the preview in the intended sharing apps: score and lineups are explicitly public. Confirm the OG PNG and matching score. Test iPhone Safari, Android Chrome, clipboard/native sharing, keyboard zoom, screen reader, slow network and interrupted Daily draft; local Chromium emulation is not real-device evidence.

Two-account production journey, performed manually by the owner **only after launch**: create/sign in with two owner-controlled accounts in separate browser profiles; save each account's own game; verify History → Breakdown preserves score/rosters/coaches/engine identity; Run It Back uses the same setup with a fresh seed. AccountB must not see accountA's private saved history, rosters, preferences, private profile or private rooms without an invitation. Create a governed Challenge asA, accept/play asB, compare the original stored metadata, then verify rating/progression once and provisional profile rank suppression. Test private-room invite membership and completed-result board separately; verify its owned governed Challenge links enter the existing comparison flow. Switch visibility and sign out to confirm public projections. Verify export/deletion with disposable owner accounts only. No automated production test account or write was created here.

Confirm each optional analytics event arrives in the configured sink, then calculate the documented loop ratios on **test** data. Do not infer demand or retention from a synthetic smoke test. The support button appears only when a valid link is configured; confirm its external checkout using the provider's own test process before accepting payments.

## 6. Rollback

Open **Vercel → Basketball project → Deployments → the previous known-good production deployment → … → Promote to Production**. Expected: its previous build and routes serve again. A Vercel rollback does not undo SQL, provider settings or stored data. The inherited migrations/repair preserve existing records; never reverse a repair by guessing values. If a data rollback is necessary, review the private backup and actual repair log first with a qualified operator. For an immediate Loop-only containment, set the server kill switch false and redeploy the appropriate environment; retain the failed release evidence.
