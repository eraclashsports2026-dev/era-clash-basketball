Prepared 10-02-2026 from Basketball commit `b0ef7ae430f818d1d3b98bbf15a8ed3e19b30d44` in `/private/tmp/eraclash-loop-verification-20261002`.

This is source and compiler preparation only. Neither checkout, its `dist`, nor the running app was edited. No browser audit, Run 3, simulation, deployment, database change, or timing claim was performed. No Run 2 report, artifact, or ledger contents were opened. The parent has assigned a fresh agent the independent Run 3 lead because unsolicited messages supplied summaries to this agent.

The recommended candidate is `candidate-final-combined.patch`. It passed `git apply --check` at the source SHA above and compiled successfully through an in-memory Vite 5 production build. Root must apply, test, and measure it before accepting the change.

The initial entry JavaScript fell from **1,317,914 bytes / 319,252 gzip bytes** to **620,634 bytes / 178,356 gzip bytes**, a 52.91% raw and 44.13% gzip reduction. This is the entry's static module graph, not a record of every request a configured production visitor makes. The unchanged account SDK is a separate dynamic 223,592-byte / 58,551-gzip-byte chunk that can also load when accounts are configured. These measurements do not prove a 2.5-second LCP.

| Compiler candidate | Static entry bytes | Gzip bytes |
| --- | ---: | ---: |
| Source baseline | 1,317,914 | 319,252 |
| Lazy LoopModes only | 969,859 | 277,443 |
| Lazy Postgame, MyEraClash, LoopResult | 1,217,598 | 293,849 |
| Those three plus lazy LoopModes | 869,252 | 252,025 |
| Catalog split plus lazy FranchiseMode only | 1,021,922 | 294,946 |
| Four screens plus catalog split | 869,277 | 252,043 |
| Nine screens plus inner mode splits | 799,810 | 232,743 |
| Nine screens plus lazy LoopResult | 791,060 | 230,326 |
| Gated fixture imports; AccountDialog eager | 620,634 | 178,355 |
| Final candidate including clock extraction | 620,634 | 178,356 |

Module `renderedLength` is Rollup's attribution before minification; it is not an exact compressed-byte contribution. Whole emitted chunk bytes and gzip/Brotli lengths are measured from emitted code. Individual gzip sizes are summed when calculating a graph closure. Detailed module lists, import graphs, source hashes, and all variants are in `startup-*.json` and `performance-summary.json`.

The major source contributor is the schedule snapshot, `data/schedule/2026-27.json` (359,714 rendered bytes). `src/App.jsx` contributes 133,767 rendered bytes, React DOM 133,573, coach research 105,438, canonical player cards 102,801, MyEraClash 47,165, and coach phases 44,264. Fixture components contribute only 6,451 rendered bytes themselves, but their static dependencies keep additional UI and coach modules in the entry. Moving only the fixture imports is therefore useful after conditional screens are deferred.

The final candidate makes ten changes to unprotected files, including two new dependency-boundary modules:

- `src/App.jsx` defers TimeArena, MyEraClash, Postgame, ClashBreakdown, LoopModes, LeaderboardPage, PublicProfilePage, PrivateRooms, and LoopResult through module-scope wrappers. Each wrapper supplies its own Suspense status, leaving App state and the arena header outside that boundary. PlayLobby remains eager. AccountDialog remains eager: App renders it even when `open=false`, so merely wrapping it would immediately fetch it and show an unwanted startup loading fallback. An additional first-open lifecycle mechanism offers little saving and is deliberately absent.
- The five reference fixture imports become conditional lazy imports after the existing `DEV_FIXTURES` flag. Their source and existing route gates remain unchanged. Production's false flag eliminates their dependency promotion; development and visual-QA builds still have the fixtures.
- `src/loop/franchiseCatalog.js` contains the original catalog and pairing code verbatim, except the schedule import is absent. `src/loop/franchises.js` preserves all **14** existing public exports through re-exports and its original synchronous schedule functions. The model, TeamModes, and franchiseLabel selection consumers import the catalog directly. No roster, player card, pairing, default coach, or naming data changes.
- `src/loop/daily/clock.js` contains the original Intl formatter, `newYorkDay`, and `nextNewYorkMidnight` block verbatim. `calendar.js` imports/re-exports those functions; its version, seed, seed ID, and server `dailyConfig` suffix remain verbatim. Only LoopModes and DailyMode import the clock directly. The server still consumes the existing synchronous calendar API.
- LoopModes defers TeamModes, SpinMode, GauntletMode, and FranchiseMode behind module-scope lazy wrappers. DailyMode remains eager within the general mode chunk. No path selection, API argument, callback, key, result calculation, or mode eligibility is changed.

React requires lazy components to be declared outside rendering components; the candidate does this. Its narrow Suspense boundaries preserve the surrounding screen while an imported view loads. See [React lazy](https://react.dev/reference/react/lazy) and [React Suspense](https://react.dev/reference/react/Suspense). The measurement uses the installed Vite 5/Rollup output API, documented in the [Vite 5 plugin guide](https://v5.vite.dev/guide/api-plugin.html).

The final graph has these additional compiler-only boundaries:

| Intended screen graph | Raw JS bytes | Gzip bytes | Coach research | Schedule |
| --- | ---: | ---: | --- | --- |
| Home entry | 620,634 | 178,356 | Absent | Absent |
| Loop hub / Daily | 657,093 | 191,952 | Absent | Absent |
| AnyFive builder | 802,503 | 235,524 | Present | Absent |
| Franchise | 1,092,065 | 257,463 | Present | Present |

These graph names describe the module boundary only. No screen was navigated to or played during this preparation.

Source safety is recorded in `performance-source-safety.json`. The candidate touches no protected path. All 77 tracked v3, canonical player/attribute, runState, and schedule paths inspected match their HEAD Git blobs. Catalog code, schedule function code, and clock/server-Daily text conservation have separate JSON records. The builds compare HEAD, Git-status listing, and selected source hashes before and after; none changed during each measurement. Other agents' pre-existing test helpers and audit outputs remain outside this candidate.

`measure-startup.mjs` reproduces the compiler measurement. It removes only `eraclash-sw-version` and sets `build.write=false`, `copyPublicDir=false`, and `emptyOutDir=false`. The normal SW plugin hardcodes `process.cwd()/dist`, so even an alternate outDir would otherwise risk stamping existing output. It emits no build files: only this preparation directory receives JSON reports. Candidate edits exist as transform strings in memory; new modules use a Vite virtual loader. The normal homepage metadata/sitemap plugin remains present.

Example reproduction, still preparation only:

```sh
node /private/tmp/eraclash-run3-preparation-20261002/measure-startup.mjs \
  /private/tmp/eraclash-loop-verification-20261002 final-combined \
  /private/tmp/eraclash-run3-preparation-20261002/memory-transform-final-combined.json
```

The optional `candidate-logo-delivery.patch` is separate from the recommended compiler patch. The existing PNG is 234,623 bytes at 760×304; its bytes and reserved dimensions stay unchanged. The patch offers an HTML image preload and `loading="eager" fetchpriority="high"` on the lobby image. Lowercase `fetchpriority` avoids the existing React 18.3.1 development build's unknown-camel-case-host-prop warning. A global HTML preload also downloads this image on deep SPA routes where the lobby is absent; measure Home and Daily before choosing that tradeoff. There is no image compression or format change in this preparation.

Acceptance still required after root applies the candidate:

1. Run existing mode/draft, franchise/schedule, sharing, account, breakdown, build-stamp/SW, protected-boundary suites, then the mandatory full unit, 98-browser, and 88-gate checks. Source compilation and textual conservation are insufficient runtime acceptance.
2. Compare old/new calendar export identity and outputs through the existing facade and new clock. Include New York midnight, the 23-hour spring reset, 25-hour fall reset, leap-day/month boundaries, invalid dates, dailyConfig seed/seedId/version/coach/opponent/era/reset contracts, and the browser's active Daily reset/focus refresh.
3. Compare all 14 facade exports, 30 franchise rosters and canonical player identities, 435 pairings, unknown-input rejection, neutral display names, and every sourced schedule day. Verify facade/model/catalog consumers resolve to the same objects. No clock function becomes asynchronous.
4. Cold-load Home, Daily, AnyFive, Franchise, Chaos, MyEraClash, leaderboard, public profile, private rooms, and a saved full report in fresh contexts. Check status/focus behavior and actual requests. Verify Home/Daily do not fetch coach research or schedule chunks; verify only Franchise fetches its schedule when needed. AccountDialog must retain its current closed/open behavior.
5. Play fresh authoritative modes and exercise rematch, save, History/report, Breakdown, retained draft choices, guest card landing, and public sharing. Navigation while a lazy chunk is delayed must keep the header and existing App state usable and must not duplicate API operations or telemetry. Network rejection should reach the existing safe ErrorBoundary and its recovery action.
6. Build once with default production flags and once with the existing visual-QA fixture flag. Check all five actual fixture routes and the independently gated ThemeLab. Do not infer fixture behavior from production tree shaking.
7. Verify service-worker/client build stamps, new chunks after a build update, cache behavior, hard reloads, and stale open-tab recovery. In a real deployed build, inspect immutable chunk availability before interpreting any chunk failure.
8. Measure cold and warm Home/Daily LCP and full-request transfer at the required viewports/network/CPU settings, including configured-account SDK loading. Use actual LCP observer/performance tooling. Compare logo-priority/preload candidates separately and reject a change that improves Home while materially delaying Daily or adding duplicate logo requests.

No simulated readiness percentage or production loading-time acceptance follows from this preparation. Root can choose the simplest candidate consistent with fresh measurements.
