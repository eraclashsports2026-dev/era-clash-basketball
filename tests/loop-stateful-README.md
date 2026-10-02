# Local stateful account browser verification

These files are test-only companions. They must never be deployed or imported by production source. Evidence is **PARTIAL EMULATED**: the actual API, accepted Candidate4 game computation and cloud-save handler write real local results and fake-cloud rows. The existing test provider supplies authentication and reads those actual owner-scoped rows through a read-only bridge. This does not prove live OAuth, SMTP, Postgres RLS, hosted durability, retention or physical-device behavior.

For each independent run, stop the previous companion and start it with a new identity namespace. This resets the in-memory server tables and creates new fake UUIDs/handles. No scores, results, Challenge rows or saved-game rows are preloaded.

```sh
LOOP_QA_IDENTITY_SALT=run-2 node tests/loop-stateful-harness.mjs
LOOP_QA_IDENTITY_SALT=run-2 LOOP_STATEFUL_RUN=run-2 node tests/loop-stateful-browser.mjs
```

Use a different salt and output label for an independent third pass, for example `run-3-independent`. The verifier does not read previous reports. `LOOP_QA_PORT` and `LOOP_QA_API_PORT` can isolate ports; `LOOP_STATEFUL_URL` must match the companion client origin. Default source client4321 proxies real local API4322. Keep root production-client harness4320 untouched. Vite file watching and HMR are disabled during verification to avoid restarts when an independent unit suite writes/restores runtime fixture files. Restart the companion explicitly after any source change.

The companion uses existing local-only session/IP simulation budget500 so scripted game batches fit the normal test window. Deployment defaults are untouched. The Loop120action/min guard and public20recap/min guard stay active. The verifier spaces gameplay by3.6seconds to stay within the public recap budget.

The full run drives ten guest modes and tagged boards (Lab refused), ten authenticated mode completions through save→History→full report→Breakdown→fresh casual rematch, exact identity/coach/era preservation, a second browser context under the same account, another account’s owner-only reads, Daily second-device refusal, two-account private rooms and actual governed Challenges created from completed Chaos drafts. It also drives public-card guest rematches and the fake email-code dialog. Actual first-party event payloads and HTTP responses are captured, including accepted sendBeacon calls. Event data is local synthetic traffic and cannot establish real return-rate cohorts.

`LOOP_STATEFUL_ONLY=any-five` selects an individual mode. `LOOP_STATEFUL_SMOKE=1` selects only authenticated History/rematch and transport checks, useful for a targeted repair check; it does not count as the requested full second or third pass. All outputs go to `data/validation/loop-foundation/stateful/<run-label>/report.json`, including failed attempts. Reports export identity/score/candidate assertions and closed event metadata; they do not export private result seeds, draft tokens or test access tokens.

The remaining guest checks and reset checks can target this same fresh companion:

```sh
LOOP_BROWSER_RUN=run-3-independent-modes LOOP_TEST_URL=http://localhost:4321 node tests/loop-modes-browser.mjs
LOOP_BROWSER_RUN=run-3-independent-reset LOOP_TEST_URL=http://localhost:4321 node tests/loop-modes-state-reset.mjs
LOOP_BROWSER_RUN=run-3-independent-survival LOOP_TEST_URL=http://localhost:4321 node tests/loop-gauntlet-survival-browser.mjs
```

Space gameplay batches by a fresh 60-second quota window when needed. The survival runner attempts at most20 fresh guest Gauntlets/140actual games using a strong legal peak-era five, stopping immediately on seven genuine wins. It asserts each server stage and protected candidate identity, the terminal victory count/action, public recap count and points scope, and the completed-run leaderboard entry. It exports exact observed stages/scores/outcomes. A loss is a real gameplay outcome; reaching the bound without seven wins leaves the full survival screen **UNVERIFIED**. No seed, stage, score or victory fixture is injected, and previous successful runs are never used as new-run fixtures.

Run2 was moved to `/private/tmp/eraclash-loop-verification-20261002` because macOS File Provider stalled Desktop source reads. That checkout uses exact committed runtime `b0ef7ae430f818d1d3b98bbf15a8ed3e19b30d44` and fresh locked dependencies/builds. Reports identify that execution path, actual runtime SHA, production build stamp, and helper hashes. The companion serves source modules with a test-only provider transform, so its page itself has no production build stamp; the separately recorded dist stamp does not turn this into production-dist authentication proof. Test-helper copies and final report copies are bound by SHA256 manifests. Preserve earlier failed/interrupted reports and their infrastructure scope.

The focused Daily server invocation selects four clock/identity tests with `-t 'guest identities|forged and other-owner tokens|one completion|next-day streak'`. Its JSON includes20other tests marked skipped. The separate scope manifest lists every unselected name and the selection reason; only the four selected results count toward this invocation's evidence. Full-suite coverage is reported separately.
