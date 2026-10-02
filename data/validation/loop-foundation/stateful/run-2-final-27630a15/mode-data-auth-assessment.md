# Run 2 — modes, saved data, accounts and events

**Assigned journeys PASS locally; authenticated/provider acceptance remains PARTIAL EMULATED.** These fresh results executed against runtime `27630a151c1c9e89c4a85a271f2b88a3173714fe`, normal build stamp `eraclash-assets:2.7.2:f94eb9fb10ab`, fixture stamp `809e87cb7f99`. Execution checkout: `/private/tmp/eraclash-loop-verification-20261002`; source-client companion `http://localhost:4321`, actual-handler API `http://localhost:4322`. Fresh identity namespace: `run-2-final-27630a15-ae07efee-5c1e-49fd-bbf4-5674f01aa41c`. No prior game/result fixture was reused.

[Final source-bound summary](final-summary.json), [file/hash manifest](artifact-hashes.json), [pre-execution source hashes](prepared-source-hashes.json), [fresh execution method and limits](execution-start.json).

## Actual execution

| Journey | Result | Recorded proof |
|---|---|---|
| Stateful guest/account modes, boards, saves, rooms and governed Challenge feed | 28 PASS / 0 FAIL; 36 actual Loop games + 1 governed Chaos game | [Report](report.json) |
| Full guest modes, 20 typed/fuzzy fives, Spin skips/hidden stats, all filters, Daily two contexts/refusal, franchise pairs, Gauntlet resume and mobile | 72 PASS / 0 FAIL; 41 actual Loop games | [Report](../../../loop-modes-run-2-final-27630a15-modes-browser.json) |
| Calendar refresh/reset | 3 PASS / 0 FAIL; 2 actual Loop games | [Report](../../../loop-modes-run-2-final-27630a15-reset.json) |
| Fresh bounded seven-win Gauntlet | 1 attempt, 7 actual games, 7 wins; terminal 7-of-7, recap authoritative counts and completed-run board PASS | [Report](../run-2-final-27630a15-survival/gauntlet-survival.json) |
| Affected search, contrast, locked badges, native builder actions and touch geometry | 7 PASS / 0 FAIL | [Report](../run-2-final-27630a15-affected/affected-state-replay.json) |
| Lab public GET/private owned-save boundary | 5 PASS / 0 FAIL; 1 actual Lab game | [Report](../run-2-final-27630a15-privacy/public-get-privacy.json) |
| Distinct direct Tonight route → sourced schedule → card → fresh guest rematch | 9 PASS / 0 FAIL / 0 SKIPPED; 2 actual Loop games | [Report](../run-2-final-27630a15-tonight-direct/tonight-direct.json) |
| Clock-controlled handler unit subset | 4 PASS / 0 FAIL; 20 explicitly unselected out of 24 by targeted `-t` filter | [Output](daily-clock-unit.json), [all selected/unselected names and reasons](daily-clock-scope.json) |

Total: **124 named browser checks PASS, 0 FAIL, 0 browser errors; 89 unique actual Loop games plus 1 governed Chaos game.** The bounded survival proof and four unit checks are separate from the 124 browser checks. Counts are not combined with the parent's full suites, sharing crawler, axe, performance or route-crawl counts.

The 72-check guest run observed seven stages/seven wins. The separate survival report establishes the actual terminal screen, fixed five, public card and board, rather than treating an intermediate outcome as terminal proof. Stateful account Gauntlets ended after four and two stages respectively; [six actual public stage-count readbacks](stateful-gauntlet-public-counts.json) match both loss-terminated runs. Their terminal UI was not asserted in the stateful script.

The earlier Tonight journeys used the Tonight section inside `/clash/franchise`; they did **not** prove `/clash/tonight` or its hub link. Parent corrected this genuine missing-route gap before 276. The fresh nine-check direct journey proves hub navigation/direct reload, current NY date and honest empty schedule, refusal before actual scheduled selection, sourced 10-20 pairing, selection invalidation after date/manual changes, exact result/card, and guest-owned new five against the shared Gold opponent.

## Saved identity and account boundary

For every new mode's original save and fresh casual rematch, the actual handler-created saved row and snapshot match teams, coaches, era and authoritative score. Candidate identity is **Candidate 4 / calibration 1.4.0 / core `55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff`**, asserted both on the row and its snapshot and on the fresh rematch. History → full report → Breakdown preserves the source mode. Run It Back is explicitly a **fresh casual AnyFive rematch**, preserving setup with a new result/seed; it does not reuse a Daily attempt, Spin receipt or Gauntlet claim. Lab remains excluded from boards. Arbitrary Loop results do not create governed Challenges; the room feed links an actual owned Challenge created under the existing Chaos comparison contract.

Fresh namespace-derived UUID actors use the existing **test-only provider injection and owner-scoped bridge**. Cross-context own-account saved-history access, other-account refusal, Daily cross-device claim, two-account room membership, owned-versus-foreign result/Challenge entry and governed Challenge feed passed. These are actual application-handler boundary checks, **not real Supabase RLS, OAuth, email delivery or hosted persistence proof**. Emulated signup exercises UI/event flow; it does not prove SMTP receipt. No real Preview accounts were created and no production or Preview database write/migration was performed.

Lab's owned POST and save retain its private scenario. The actual cookie-free/authorization-free full-result GET and public recap exclude arbitrary private scenario, seed and session while preserving score, teams and engine identity. The report exports presence checks rather than the generated private label.

## Eleven definition-of-done cells

This is a scoped assessment of these executions, not a replacement for the parent's complete per-mode release matrix.

| Cell | Status in this evidence | Scope / remaining proof |
|---|---|---|
| 1. Route | PASS locally | All ten playable Loop modes and rooms reached; direct Tonight separately proven. |
| 2. Versioned contract | PASS source presence | Ten contract directories source-inspected: AnyFive, Daily, Franchise, Tonight, Spin, filters, Gauntlet, Lab, rooms, hub. Tonight is `tonight-content-1.0.1`, hub 1.0.1; other mode contracts 1.0.0. This is not a new unit invocation. |
| 3. Unit tests | PARTIAL within this subset | Actual Daily four-check clock subset passes; all 20 unselected names exported. Draft/client/career/server unit files exist. Parent owns full-unit results and the missing historical calibration-artifact failures. |
| 4. Guest plus authenticated journeys | PASS guest / PARTIAL authenticated | All assigned guest flows pass; account journeys pass using fresh emulated actors. Real two-account Preview provider acceptance remains UNVERIFIED. |
| 5. Existing gate sweep entry | PASS source entry / parent-owned execution | `scripts/loop/loopQa.mjs` and eleven mode gate entries exist. Parent's exact-source gate report establishes execution; no owner diagnostics failure is waived here. |
| 6. OG card / crawler | PARTIAL within this subset | Actual recaps/public cards, exact scores/lineups and guest rematches pass. Dedicated three-UA/PNG dimension-size/timing crawler acceptance belongs to delegated sharing reports. |
| 7. A.8 events | PASS local receipt / PARTIAL durable sink | All ten names emitted and HTTP accepted; durable/vendor readback and real signup/retention remain unverified. |
| 8. Mobile viewports | PASS emulated / PARTIAL physical | 320/390/412px mode journeys and 390px focused cards/targets pass. Browser emulation is not iOS/WebKit, Android hardware or physical-device acceptance. |
| 9. Axe zero critical | UNVERIFIED by these scripts | These journeys test targeted native semantics/contrast/geometry, not a full axe sweep. Parent's independently executed route/axe matrix supplies this cell. |
| 10. Mode inventory line | PASS source presence | Current ledger lists each Loop route, rooms, hub and pairing surfaces; direct Tonight is explicitly corrected. Historical inventory completeness remains the parent's separate history audit. |
| 11. Hub reachability | PASS locally | Guest hub journeys reach all modes; Tonight's distinct hub card/direct route separately asserted. |

## Actual event pipeline numbers

[Actual journey input and computed numbers](actual-journey-loop-numbers.json): **46 accepted native beacon batches, 46 HTTP 204 receipts, 166 closed events**. Event counts: `game_completed`36, `card_created`36, `card_shared`2, `card_opened`1, `rematch_started_from_card`1, `guest_play_started`14, `signup_completed`1, `daily_attempted`2, `daily_shared`1, `mode_started`72. All ten names present. Six equal emitted records were retained; no invented event IDs or transport deduplication.

Actual ratios: shares/completed game **2/36 = 0.0555556**; card opens/share **1/2 = 0.5**; rematch plays/card tap **1**. Day-2 and day-7 return are **null/censored**: zero complete follow-up windows across three observed browser analytics identities. No future timestamps or commercial retention claim. Each stateful publication waited for its actual completed POST and rendered card link: **36 receipts, all HTTP200, zero publication request failures**. HTTP acceptance does not prove configured durable/vendor ingestion.

## Later source and preserved limitations

After all these journeys completed, parent advanced to `12620d7ac0bece111dc9ce43fdc5a5415a98ae56`. Relative to tested276, application changes are **only two mutually exclusive visually hidden h1 nodes** in legacy selected-team builder and simulation transition branches. The PNG verification helper's fallback-fixture origin handling and the ledger also changed; the latter is documentation only. All Loop controllers, handlers, roster/data, candidate/calibration and mode helpers are unchanged. These reports **do not claim a replay against126**; bounded legacy heading acceptance and fresh Run3 must bind their own current source identities.

All twelve execution limits are preserved in [the prepared plan](prepared-plan.json): emulated provider, absent real OAuth/SMTP/Preview/RLS/durability, no physical devices, source-client companion distinct from the recorded production build, fresh memory/contexts, protected exact identity, no seed/result/stage/victory injection, local-only simulation500 overrides with shared120action/20publication limits unchanged, accepted receipts versus durable sink, censored cohorts, named targeted-unit exclusions, and open performance/rights/provider/release blockers. Salary Cap remains unavailable without a defensible dataset. Unrestricted out-of-position teams remain outside the protected engine contract and are not silently approximated.

[Initial readback exporter error](stateful-gauntlet-readback-initial-error.json) and [initial sandbox listener infrastructure failure](execution-start.json) remain preserved. The readback tool correction used the boolean `response.ok`; it did not alter source/server or replay a simulation. These errors are not converted into product passes or silently removed from numeric reports. Earlier failed iterations and reports remain separate; no prior results are substituted as fresh acceptance. This subsection makes **no launch, ready-to-merge, legal-clearance, real-user retention or hosted Preview claim**.


## Inherited legacy engine identity boundary — source review after the 126 terminal probe

The protected identity assertions above apply to **new Loop single-game records and their saved/rematch snapshots**, not every inherited legacy format. The actual126 Tournament response had no top-level `core` and no captured Candidate4 field; that is consistent with the inherited bracket contract, not evidence of fabricated or incomplete rounds. Its four actual rounds each supplied their own series core, and the native page displayed their real4-0/4-0/4-1/4-0 outcomes.

At source6545 (these engine/handler bytes unchanged from126/276), `api/game.js:374` attempts protected preview only when the effective mode is `single`, a Blue five exists and there is no legacy Daily config. Other formats use the existing `computeResultV3` path at `api/game.js:411`; `api/_lib/previewEngine.js:96` explicitly restricts preview compute to a single game. `api/_lib/game-core-v3.js:104` supplies production `versions`/era/coaches. Its Tournament branch (`:139` through `:172`) returns `rounds[]`, with **each round's `core` and `v3` fingerprint**, rather than a tournament-wide top-level score/core. Its Win82 branch (`:106` through `:121`) returns season wins/losses and the actual finale `core`/`v3`; `src/App.jsx:1270` passes that stored finale through `viewSim(record)` into the completed UI.

The authoritative result reader intentionally returns **null candidate/calibration/core-hash identity for a production-engine record** unless `preview === true` and a candidate stamp exists (`api/_lib/resultContract.js:42`–`:48`). That null boundary must be preserved in a fresh Run3 legacy data audit; production engine versions/fingerprints and per-round/finale identity are the relevant checks. No engine or preview guard was changed to make legacy formats report Candidate4. New Loop compute intentionally calls `computeResultPreview('single',...)` with the flag ON (`api/_lib/loopFoundation.js:62`), including each Gauntlet stage, which explains the different engine path of the89new Loop games. Exact candidate/calibration/core fields were asserted on every stateful saved-row/rematch identity and the seven survival stages and direct Tonight results. The guest72 report records its actual results and preview-path flags for the20typed fives; it does not independently export every engine field for every41guest game.

Native126 terminal acceptance remains **Tournament heading FAIL / Win82 completed-finale heading PASS**. A source-only no-`lastSim` Win82 fallback and legacy shared-result fallback were not injected or claimed as native tested outcomes. The final6545 Tournament heading replay and all fresh Run3 identities require their own subsequent evidence.


## Bounded final-source Tournament heading replay

Fresh source `6545f8caf281d484d242826fa640823b2a15687c`, production stamp `eraclash-assets:2.7.2:2550ae9eb17f`, actual root harness `http://localhost:4320`: [native Tournament replay](../run-2-final-6545f8c-tournament-heading-reverify/terminal-headings.json) **1 PASS / 0 FAIL / 0 UNVERIFIED / 0 browser errors**, one actual handler-created Tournament result. Native controls completed four real winning rounds; exactly one `Tournament result` h1, axe violations empty, 390px document width390. The new h1 is absolute/clipped1×1px with margin−1px; it consumes no layout slot. Fresh teams/score/round narratives differ, so no full-page pixel equivalence is claimed.

Observed legacy metadata is production engine3.2.0 / calibration `backtest-1`, `previewFlag:false`, no candidate field, no top-level Tournament core, and all four rounds have actual core/fingerprints. This matches the unchanged inherited guard/record contract above. The original126 Tournament moderate heading failure, initial mobile-menu collector failure, and actual126 Win82 completed-finale PASS remain preserved separately. The final6545 source correction adds only this Tournament sr-only heading plus documentation; it does not alter inputs, engine or Loop behavior. This bounded replay is additional to the124checks on276, not a retroactive claim that those124ran on6545. Fresh Run3 still requires its own complete source-bound contexts, namespace, data and event reports.
