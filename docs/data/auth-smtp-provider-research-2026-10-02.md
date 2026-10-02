# Public auth email — verified owner setup

Verified 2026-10-02 against current official documentation. This is an owner setup note; no provider account, SMTP setting, production redirect, or credential was changed.

## Existing flow and exact limits

Basketball currently signs in with an email one-time code. Preserve the existing `{{ .Token }}` email template described in `docs/accounts/email-sign-in-owner-setup.md`; a scanner opening a confirmation URL should not consume the user's code. The UI has no password login, so password-reset delivery is not currently a product promise.

Supabase's built-in mail service restricts delivery to the organization's team addresses, has a current two-email-per-hour cap and no production delivery SLA. It is unsuitable for public sign-up. A custom SMTP configuration initially receives a 30-message-per-hour auth cap; adjust the project's Authentication rate limits only within the sending provider's limits. The ordinary resend cooldown is 60 seconds per user. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp), [auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

Resend's current free transactional tier permits 3,000 messages per month and 100 per day, with daily reset at midnight UTC. Each To/CC/BCC recipient counts separately, and sent/received email count toward usage. Its current account documentation permits three verified sending domains. Do not use the old launch-blog one-domain limit as today's source. These quotas cannot support unrestricted public sign-up volume, and another provider can be used if its current free limits fit the required volume. [Current quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [pricing](https://resend.com/pricing).

Resend SMTP uses `smtp.resend.com`, username `resend`, password equal to a scoped provider API key, and port 465 with implicit TLS or 587 with STARTTLS. A verified sending domain is required. [Official SMTP setup](https://resend.com/docs/send-with-smtp).

## Provider-agnostic owner steps

1. Select a free SMTP provider and check its current monthly, daily, hourly, recipient, and domain limits. Leave paid upgrades disabled.
2. In the provider dashboard, add the sending domain and copy its prescribed DNS records into the domain owner's DNS dashboard. Wait until the provider reports the domain verified. Use a sender address on that verified domain.
3. Create a sending-only credential scoped to the domain if the provider supports it. Keep it in the provider and Supabase dashboards or an approved secret manager; never paste it into a repository file, browser client environment, screenshot, or test report.
4. Open the **Preview Supabase project**, Dashboard → Authentication → SMTP, enable custom SMTP, and enter sender address/name, host, port, username, and password using the provider's instructions. For Resend, use the host and username above and port 465; the password is the sending key.
5. Review Authentication → URL Configuration for the Preview Site URL and the exact Preview redirect paths used by the client. Keep production and Preview project/host settings separate; never point a Preview test at production.
6. Preserve the existing email-code template with `{{ .Token }}`. Confirm subject, sender, expiration copy and resend copy match the UI. Check Authentication rate limits; the provider's daily/monthly quota remains an independent cap.
7. Run the Preview smoke test below. A saved dashboard configuration is not proof that a message arrived. Production configuration is a separate owner action with its own redirect review and delivery smoke test.

## Delivery smoke test once SMTP is live

Use an owner-controlled deliverable email address and the Preview host/project only. Reserved `.invalid` fixture addresses are suitable for isolated admin-created account tests but cannot establish real SMTP delivery.

- Request a code through the visible sign-in UI. Verify receipt, verified-domain sender, rendered subject and code template, and expected spam-folder behavior.
- Enter the received code in the same Preview browser; verify the authenticated account state and a saved game result. Record the Preview project ref and method without the code, token, email body, or private address.
- Request a resend after the visible cooldown; verify delivery and UI behavior. Test a wrong/expired code and confirm a useful recovery message without a redirect loop.
- Confirm sign-out, refresh, and sign-in again work. If the product accepts a pasted link, verify its Preview redirect without assuming that link scanners are equivalent to successful sign-in.
- Record delivery timing, pass/fail, and any SMTP/auth quota error. Do not declare public auth ready solely from an admin-generated session or a password-grant test.

The current repository does not prove provider verification, a live SMTP connection, deliverability, or production readiness. Those remain owner actions until this smoke test supplies evidence.
