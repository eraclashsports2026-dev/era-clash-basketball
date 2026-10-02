# Reusable browser audit runner

`scripts/loop/fullBrowserAudit.mjs` collects evidence for a separately authorized verification pass. The preparation label does not constitute Run 2. Root owns pass closure and the combined product report. The runner never starts/restarts a server or deploys.

The current inventory contains 473 routes: 435 programmatic franchise pairings and 38 application, navigation, mode-information, policy and account surfaces. Fresh real public result URLs extend that inventory. Registry-derived routes, the modes hub, App branches and the 435 generated sitemap paths are reconciled. The emitted `/sitemap.xml` must also contain all 435 exact URLs for the inspected origin.

Preparation, with no network/browser run:

```sh
node scripts/loop/fullBrowserAudit.mjs --inventory-only --label unique-preparation-label
```

After the previous pass has closed, and after building/restarting the chosen local production harness or verifying the exact Preview deployment:

```sh
node scripts/loop/fullBrowserAudit.mjs \
  --origin http://localhost:4320 \
  --environment local-production-harness \
  --label unique-run2-label \
  --sha EXACT_REVIEWED_COMMIT \
  --results-file path/to/fresh-sharing-report.json \
  --tools /private/tmp/eraclash-browser-audit-tools
```

Supply a JSON array of real `/card/<id>` or `/result/<id>` URLs, or an object with `resultUrls` or sharing `samples` containing `path`/`url`. Ten real results created after the previous pass closes are required for the sharing matrix; do not reuse a previous pass's fixture. Missing fixtures are UNVERIFIED; the runner never fabricates an identifier, score, sign-in or player identity. Use a new label each time: output directories cannot be overwritten. The fixture is read without alteration and its checksum is recorded. Source/build hashes, fixture checksum and checkout SHA are checked again at the end; a changed identity makes the pass UNVERIFIED. Evidence goes to `data/validation/loop-foundation/browser-audit/<label>/`.

The default matrix covers every inventoried route in desktop Chrome plus Chromium touch/viewport emulations of iPhone SE, iPhone 14, iPhone 14 Pro Max and Pixel 7. It records status, redirects, page/console/network errors, horizontal overflow, control dimensions, Light Court token binding, visible controls and axe results. Every programmatic page also checks its actual canonical/social fields, ten curated player names and the exact 56 related-pairing links. All fresh result pages receive canonical/social-field checks. It runs local axe rules on every route and after changed disclosure states, retaining critical, serious, other and incomplete findings. All contexts load normally with CSP bypass disabled; after the UI loads, the local axe source is supplied through Playwright debugger evaluation. The actual response CSP header and instrumentation mode are recorded. Debugger instrumentation is not a security certification. Per-route files include environment, requested/checkout SHA, dirty state, file-content fingerprint and public engine identity. A supplied deployment SHA still requires independent hosting/Git verification.

Internal link destinations and every unique external HTTP link receive bounded HEAD requests (three at once, default limit 500 external URLs). Protected, rate-limited, unsupported-HEAD and timed-out responses remain UNVERIFIED rather than automatically broken. Excess links remain explicitly unverified. Non-HTTP handlers also remain outside HTTP coverage. The route matrix renders each inventoried destination; generic local control probes record observed navigation, disclosure, selection/search value and accessible-state changes. A no-change control is a candidate dead control requiring its exact intended behavior to be checked.

Control probes use fresh contexts and block writes except existing telemetry and read-only mode configuration. Stateful games, progression, account/cloud data, email, rooms and payments need their dedicated journey evidence; this collector does not promote their visible buttons to verified behavior. A public account gate may render correctly while private account access and live SMTP delivery remain UNVERIFIED. This distinction makes a combined report necessary.

Mobile Lighthouse runs exactly five surfaces: home, Daily Clash, one supplied real result, one programmatic pairing and the modes hub. Reports retain performance/accessibility/best-practices/SEO scores, simulated throttling settings, LCP, run warnings and full HTML/JSON. LCP above 2.5 seconds is flagged for investigation; a missing real result or unavailable tooling is UNVERIFIED. Physical iOS Safari/Android Chrome, screen readers, soft keyboards, rotation/safe areas, clipboard and native sharing still need the listed real-device checks.

Temporary tools prepared for this workspace are `axe-core@4.13.0`, `lighthouse@13.5.0` and `chrome-launcher@1.2.2`, installed under `/private/tmp/eraclash-browser-audit-tools` without changing the app dependencies. Chrome is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, overridden by `ECLASH_BROWSER_EXECUTABLE`. Node 24 and project Playwright are used. Set `VERCEL_AUTOMATION_BYPASS_SECRET` or `ECLASH_AUDIT_HEADERS_JSON` only through the execution environment when needed; HTTP and browser requests receive these headers only on the exact inspected origin, and they are never recorded. Lighthouse's CDP header setting is global, so protected runs with configured audit headers mark Lighthouse UNVERIFIED rather than risk forwarding a credential to external resources. The local full pass has no protection headers and runs all five Lighthouse reports.

`--smoke`, `--profiles`, `--programmatic-limit`, `--no-controls` or `--no-lighthouse` intentionally produce limited coverage. A smoke run checks home, modes, privacy and the first selected programmatic/result sample. It is not the full pass. Browser startup/tool/environment failures are UNVERIFIED; critical or serious axe, overflow, undersized mobile targets, route/network failures, invalid social metadata and wrong shipped sitemap URLs are recorded as failures. No aggregate percentage claims launch approval.

Primary tool documentation: [axe API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md), [Lighthouse Node usage](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md), [Playwright emulation](https://playwright.dev/docs/emulation).
