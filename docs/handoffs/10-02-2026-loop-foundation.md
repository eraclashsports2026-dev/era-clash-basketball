NEXT: 3.1
# Basketball Loop Foundation — 10-02-2026

Scope: Basketball only. All other sports remain untouched. Local branch phase/loop-foundation; public deployment and database changes are prohibited during this session.

## Delta since 09-26
- Fetched current main: b31d2ada57e977cf1b2ce546bde86aaf1547e6c8, unchanged from the handoff. Main has no commits since 09-26; its latest commit is 09-20.
- PR #69 remains OPEN, DRAFT, unmerged, head16ea9085a9f864c607cad226e6577177004268e1. Absorbed by fast-forward into phase/loop-foundation. Original PR remains open; this branch supersedes its integration work.
- Initial sandbox gh check could not use authorization; the later elevated current check verified eraclashsports2026-dev with repo/workflow scopes. Authentication was never changed. Pushed phase/loop-foundation at b0ef7ae and created/attached ONE draft PR #70: https://github.com/eraclashsports2026-dev/era-clash-basketball/pull/70. GitHub push/PR blocker is resolved. PR69 remains unmerged and is superseded by this branch.
- Connected Supabase lists only Dear Future projects. Basketball Preview lfybiphmqkiecfrqsfzt and production dxdtnhdeaanhfoqngdel are confirmed in config/projectRefs.js. No DB writes/migrations or test accounts created. Preview repair/auth/RLS remain EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK.
- Repository has no CLAUDE.md or AGENTS.md at HEAD or examined ancestors. Read governing docs and validation records. Sparse recovery omitted public/image-pipeline/calibration-cache paths; restoring unchanged tracked baseline assets for tests.
- First unit attempt: 90 files, 2700 passed, 41 failed plus3 collection failures; incomplete recovered assets/cache and I/O-timeout failures. Do NOT report the historical2802count as current. Re-run after recovery with bounded workers.
- Branch operation stalled while stat/hashing historical files. Verified all18 affected original files against Git blob hashes before merge. Temporarily marked untouched baseline assume-unchanged; clear flags for edited paths and independently hash protected files at close. Main ref unchanged.

## Mode inventory
| Surface | Route | Code | Observed state / governing contract |
|---|---|---|---|
| Chaos Clash | /play/chaos | src/chaos; api/game.js | Existing server draft; three guest runs; account restriction governed by entitlements |
| Dream Matchup | /play/dream | src/App.jsx, ManualPicker | Existing manual five; account-gated legacy policy |
| Legacy Daily | /play/daily | src/dailyChallenge.js, api/daily.js | Existing UTC daily; preserved as separately versioned historical mode |
| Best of7 | /play/best-of-7 | api/game.js | Existing production-engine series; legacy trial policy |
| Win82 | /play/win-82 | api/game.js | Existing season/trial |
| Tournament | /play/tournament | api/game.js | Existing bracket/trial |
| EraGauntlet proposal | /modes/era-gauntlet | navigation/entitlements registry | Planned flagOFF; new seven-era adapter under /clash/gauntlet |
| Fantasy / Live | /fantasy/* | InfoPages | Planned, explicitly unavailable, no paid gate |
| Challenges | /?challenge=code | src/challenges, api/_lib/challenges | Governed same-opportunity invite; account saves |
| Career / Run It Back | /my-eraclash | src/accounts, api/_lib/cloudAccounts | Saved-row ownership; freshseed same setup |
| Leaderboard | /leaderboard | src/competitive | Challenge rating and provisional privacy |
| Profiles | /player/:slug | src/profiles | Visibility-controlled public projection |
| Clash Cards / Rivalries | result composer / career | src/cards, src/rivalries | CardsV1 spoiler-safe invites, explicit recap publication separate |
| Breakdown | completed result / saved history | src/breakdown | PR69 single stored-record contract |
| AnyFive / Spin / filters / Lab | /clash/* | src/loop | New selection/presentation adapters; no engine edits |
| NY Daily | /clash/daily | src/loop/daily + existing Chaos state machine | New NY calendar wrapper; legacyUTC retained |
| Franchise / Tonight / pairings | /clash/franchise, /clash/tonight, /clash/all-time/:slug | src/loop/franchises | 30 curated fives,435pairings, official1200released schedulegames;30CupgamesTBD |
| Private rooms | /clash/rooms | src/loop/PrivateRooms, loopFoundation server | Invite capability, verified membership, notificationsdisabled |
| SalaryCap | disabled/unlisted | No dataset | EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK; defensible salary data required |

## Fixes
Run1 closed. This table records the historical Run1 implementation scope, not final release acceptance. Fresh final Run2/Run3 and real provider/deployment evidence are separate; unresolved full DoD remains PARTIAL.

| Item | Build status | Evidence / limit |
|---|---|---|
| 0.1 branch / absorb PR69 | FIXED_AND_VERIFIED | Mainb31d2ad, PR69 absorbed16ea908, local phase/loop-foundation; push/PR/Preview repair external below |
| 0.2 inventory / 0.3 baseline / 0.4 ledger | FIXED_AND_VERIFIED | Live/dormant/removed inventory and governing contracts; current counts below replace historical2802/98/77 claims |
| A.2 OG / A.3 guest rematch | FIXED_AND_VERIFIED | sharing/run1-final-a826333-local-access/report.json102/102; run1-final-guest-a826333/report.json21/21; real HTTP, PNG, typed guest play |
| A.10 dead controls / links | FIXED_AND_VERIFIED | New routes72/72 and complete legacy98browser/88gates; exhaustive route/CTA coverage still must pass Runs2/3 |
| A.4 exposure / neutral naming | FIXED_AND_VERIFIED | loop-rights unit/inventory, protected data unchanged, B3 neutral ON/OFF80checks; full rendered crawl still required |
| A.8 events / metrics | FIXED_AND_VERIFIED | All10 events ingested by actual handler in server tests; optional vendor not configured; live retention not established |
| A.6 policies | FIXED_AND_VERIFIED | Privacy/Terms linked from footer/signup/card; policy tests; operator/contact/retention/legal claims need owner confirmation |
| A.5 SMTP | EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK | Current official provider audit and browser smoke procedure written; live SMTP/dashboard/receipt unavailable |
| A.7 Preview truth | EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK | Pin/workaround and safe build log verified; exact dashboard values documented; Preview credentials absent; keepalive not applicable without pause evidence |
| A.9 support | FIXED_AND_VERIFIED | Optional validated Stripe link, hidden unset; no paid play gating, no provider payment tested |
| B.1 AnyFive | FIXED_AND_VERIFIED |20 actual scripted legal fives including fuzzy matching; sourceengine refuses out-of-position teams, guarded before compute |
| B.2 NY Daily | FIXED_AND_VERIFIED | Two contexts/same constraints, server token+attempt guard, account streak/unit/DST checks, existing3roll Chaos adapter; real account provider acceptance external |
| B.3 franchises / Tonight / pairings | FIXED_AND_VERIFIED |30 sourced franchise fives,435 artifacts,1200 released schedule games+30CupTBD,three10-20cards+12PNGframes; full roster set owner review |
| C.1 Spin | FIXED_AND_VERIFIED | Canonical franchise+era per position, one skip each, hidden stats, signed receipt; tests and actual UI/gate |
| C.2 three filters | FIXED_AND_VERIFIED | OneFranchise/OnePerEra/NoMVP identity constraints, own casual tags, actual UI/gates; SalaryCap external |
| C.3 Gauntlet | FIXED_AND_VERIFIED | Seven-era completed/resumed run, immutable stage receipts, account-owned resume, actual Nof7 recap; real provider external |
| C.4 Lab | FIXED_AND_VERIFIED | Existing eight era/rules environments only; scenario label/exploration card; no board, actual UI/gate |
| C.5 rooms | FIXED_AND_VERIFIED | Guest invite/member board; two-account emulated ownership/unit tests, actual governed owned Challenge feed; email hook disabled, live provider external |
| C.6 dormant | FIXED_AND_VERIFIED | Gauntlet proposal revived; FantasyLive planned flagOFF retained information-only; old ModeShelf history replacement recorded, no dormant code deleted |
| C.7 hub | FIXED_AND_VERIFIED | Versioned contract, all new and legacy surfaces linked; new modes≤2taps using homepage Allmodes→hub; mobile route tests |
| Push / replacement draft PR | FIXED_AND_VERIFIED | Branch pushed b0ef7ae; one draft PR70 created/attached; GitHub and Vercel deployment success recorded in preparation/preview-discovery-b0ef7ae.json |
| Live Preview repair / RLS | EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK | No Basketball Preview admin credentials. Reviewed SQL/release procedure prepared; no live repair or DB write occurred |
| SalaryCap | EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK | Unlisted, no invented salaries; sourced defensible dataset required |

## Modes
New modes adapt inputs/presentation over the unchanged Candidate4/current production engine. Each new play route has a versioned contract, pure/HTTP tests, a gate, an actual guest journey, a public recap, named events, mobile evidence and a hub link. Full DoD remains PARTIAL until real authenticated Preview journeys and Runs2/3 pass. Existing governed Challenge creation remains Chaos-only by its inherited contract: it is not available for arbitrary new Loop results. New saved games support an explicitly casual AnyFive rematch; private rooms can share owned existing governed Challenges without inventing a new comparison contract.

| New surface | Route | Contract directory | Local implementation commit / source |
|---|---|---|---|
| AnyFive | /clash/any-five | docs/clash-any-five |883faa9; src/loop/modes/TeamModes.jsx |
| NY Daily | /clash/daily | docs/daily-loop |883faa9/3b8ec01; src/loop/daily/DailyMode.jsx |
| Franchise | /clash/franchise | docs/franchise-clash |8a4a567/883faa9; src/loop/modes/FranchiseMode.jsx |
| Tonight | /clash/tonight | docs/tonights-clash |27630a1 direct route/hub correction; fresh direct9/9 source276 PASS; Run3 fresh repeat required |
|435 pairing pages | /clash/all-time/:slug | docs/franchise-clash |8a4a567/9f109dc; api/share-page.js + source catalog |
| Spin | /clash/spin | docs/chaos-spin |883faa9; src/loop/modes/SpinMode.jsx |
| OneFranchise | /clash/one-franchise | docs/constraint-filters |883faa9; canonical30 franchise pools |
| OnePerEra | /clash/one-per-era | docs/constraint-filters |883faa9; unique person and era |
| NoMVP | /clash/no-mvps | docs/constraint-filters |883faa9; person-level historical winners |
| Gauntlet | /clash/gauntlet | docs/era-gauntlet |883faa9/a826333; src/loop/modes/GauntletMode.jsx |
| Lab | /clash/lab | docs/what-if-lab |883faa9; existing rules environments |
| Private rooms | /clash/rooms | docs/private-rooms |883faa9/43a63c0; src/loop/PrivateRooms.jsx |
| Hub / filters picker | /clash/modes, /clash/filters | docs/modes-hub |883faa9/d9d28f9; LoopModes.jsx |
| Public recap / OG | /card/:id, /result/:id | docs/sharing/public-recap-v2.md |9f109dc/a826333; public projection only |
| Privacy / Terms / support | /privacy, /terms, /support | src/loop/PolicyPages.jsx |98a87c1; owner statements review pending |

Inherited surface last commits (absorbedPR69 history): Chaos1f6b5d1(09-10), legacyDaily23d9ab3(08-24), ManualPicker7e45454(09-02), navigation/Best7/Win82/Tournament1f6b5d1(09-10), accounts9c45851(09-24), Challenges009030a(09-05), Cards/Rivalriesa6a6f0d(09-16), competitive97998d6(09-06), profiles886968b(09-09), Breakdown49b9bb4(09-24). Removed history-only ModeShelf:0482e2d(08-31), replaced by canonical TimeArena/navigation. The historical daily is UTC; the new Daily is a NewYork calendar adapter over the existing Chaos state machine. No historical standalone implemented Lab/Franchise/Gauntlet was found in the examined source tree history.

## Run2 results

CLOSED, with substantive FAIL/PARTIAL items. Final tested implementation `6545f8caf281d484d242826fa640823b2a15687c`, local `http://localhost:4320`, normal `eraclash-assets:2.7.2:2550ae9eb17f`, fixtures `41957b5894a1`; builds and435pairingsPASS. Full report: [Run2](../../data/validation/10-02-2026-verification-run-2.md). Its exact-source identities, twelve checks, full DoD limits, fixes, failures, raw reports and Owner actions replace earlier in-progress claims.

- Fullunit100files:97PASS/3FAIL,2961PASS/2FAIL of2963 plus one collectionblocked; absent exact frozen identifiability/probability artifacts. No declared skipped/pending/todo tests; targetedDaily4PASS/20explicitunselected names recorded, fullsuite covers file. No calibration regeneration/stub. A prior default5-second symmetry timeout passed unchanged under isolated/full15-second rechecks; rawfailurepreserved.
- Fullbrowser initially95PASS/3FAIL with root's incorrect2-worker override of repo serialized shared-store configuration; mobile actualrate-limitalert/guest429/expiredtimeout retained. Complete unchanged98-test rerun workers1/unchangedquotas:98PASS. Fullgates85/88: all11LoopgatesPASS, all3priorCLS regressionsPASS;3unavailableownerdiagnostics rawFAIL.
- Full historicalb271 crawl2425checks/48rawFAIL/6PARTIAL;435pairings×5 and10recaps×5 allPASS;1404linksallPASS. Latest276affected255checks235PASS/15rawFAIL/5ownerPARTIAL: tenviewport-target warning cases/fiveunconfiguredleaderboard503, not missing-h1 rawclassifications; initial0critical/serious/contrast,after0critical/11serious viewport/15moderatelegacyh1.61links/served435sitemap/three404PASS. Allraw/gzip/hashproof/classificationsretained; no final full486-route claim until Run3.
- Actualnative155legacy stage checks across15journeysPASS on126 (exactoneh1, heldsimulationtransition), then actualfour-roundTournament revealed missing terminalh1.6545 adds only its sr-onlyheading; freshactualTournamentreplayPASS with0axe/JS/overflow and1×1absoluteheading. ActualWin82terminalPASS; no synthetic result or unobservedfallback claim. Credits/localProfileheading seven contextsPASS;12nativeinputclick/Tabchecks andfourth-search2checks, fiveidempotentcontrolsPASS.
- Fresh6545sharing102/102 andguest21/21PASS using tennewactualresult IDs. Neutral276OFF82/82+ON82/82 with ownONbuild/results; newLoopcontrollers/source unchanged afterward. DefaultOFF/rights reviewstillpending.
- Fresh276mode/data/accountscope124namedbrowserPASS,89actualLoopgames+1governedChaos,0JS: stateful28/guest72/reset3/affected7/privacy5/directTonight9; separate7actualwinGauntletterminal/publiccounts/boardPASS. Lateronly3legacy sr-onlyh1nodesandPNGverificationfixtureorigin changed; no retroactive276replayclaim. Account actors EMULATED, realPreviewRLS/auth/SMTPunverified. EverynewownedLooprow/snapshot/rematchCandidate4/calibration1.4.0/core55bb26a2; legacyAPIpreviewpathsingle-only, otherlegacyformatsretainproductionV3 byunchangedcontract.
- Actualmetrics36completed/36cards/36publicationHTTP200;46nativebatch/46HTTP204/all10names. Shares/game2/36=.0555556,opens/share1/2=.5,rematch/tap1;day2/day7null/censored. Syntheticactual-handlerqueryproof9/9;durablevendor/retention/demandunverified.
- FinalquietmobileLH:Home3336.248ms(perf90),Daily3349.641ms(90),hub3220.232ms(91) FAIL2500ms;freshrecap1056.361ms/pairing1062.418ms both100/PASS. Allfiveaccessibility/BP100/no warnings/runtimeerrors/source/tool/fixture/stampstable. Loading/theme/exactPNGoptimizationsmeasured; no threshold/CDNwaiver. Read-only SSR review found initialization/hydration compatibility gaps; larger initial-render work remains a launchblocker.
- Finalboundary8/8,124protectedblobsequal,requiredheaders/clientsecretchecksPASS. ExactnativePNGdelivery20/20,canonicalimageunchanged; failedWebP/nativeandtwoPNGfixture-originfailurespreserved. Main/WaverefremotecheckandtipPreviewreadiness repeated betweenruns. No production/DB/dashboard writes.

Run3 starts immediately after this close commit/push and exact-tip Preview discovery. Prepared independent reviewer has no Run2 outcomes; fresh checkout/browser contexts/stores/actors/results required. Ready to merge remains NO pending substantive/performance/historical/provider/rights/device gaps.

## Run3 results
Prepared source-only independent reviewer; execution starts after exact Run2-close tip Preview readiness. No Run2 outcomes consumed before own findings are recorded.

## Owner decisions & actions
- GitHub authorization/push/draft creation are verified now. Review draft PR70; do not merge until final substantive failures and real Preview account/RLS acceptance are resolved. No auth switch/login/setup was run.
- Basketball Preview credentials are absent from the available harness and connector. No realPreviewaccount, repair, RLS, SMTP or publicPreviewverification claims.
- Preserve existing simulation candidate/calibration/core and both Wave branches. Current modes only supply inputs/presentation; no engine changes.
- Existing entitlement docs conflict with blanket guest-first play; preserve legacy contracts and provide newguest-adapter routes; explicit policy change remains flagged for review.
- Rights review: neutralcopy reducesexposure, notlegalclearance. Full franchise set requires ownerreview.
- Resendofficial currentfreequota3000/month100/day,3domains; Supabasebuilt-in2/hourteam-only, customSMTPinitial30/hour. OTPtemplateuses{{ .Token }}; currentUIisemailcode, notpasswordreset.
- SalaryCap: no defensibledataset, neverinventprices.
- Keepalive conditional: no evidence BasketballPreviewpaused frominactivity; no paidcron/configchange.

## Production release (browser-only steps)
Prepared in docs/release/10-02-2026-production-release.md, ordered SQL→env→SMTP→replacementPRmerge→post-releasechecks→rollback. SQL bundle contains eight unchanged inherited migrations and a separately reviewed guarded repair revision; source-only parser/review evidence in data/validation/loop-foundation/release-sql-source-review-2026-10-02.json. No SQL executed, no observed row counts, no dashboard changes. Merge remains blocked pending final reports and real Preview validation.

## Evidence
Run1 frozen implementation a826333eb68ff2b995933541bb4be44ca9acda7b, local http://localhost:4320, production client stamp eraclash-assets:2.7.2:c3234f7053ad, real Candidate4 handlers + memory store (server NODE_ENVdevelopment for test memory; client production build). Explicit local simulation quota overrides500 for bounded scripted fixtures; defaults remain10session/20IP/global600. Full unit2954PASS/2FAIL plus1collection-blocked suite (99files,96pass/3fail); browser98/98; gate85/88. All three failed gates are unavailable owner diagnostics, not waived acceptance. New mode72/72 plus focused reset3/3; sharing102/102; guest rematch21/21. Protected122 file bytes unchanged versus PR69 and both Wave refs unchanged. No declared skipped tests found.

Artifacts: data/validation/foundation/loop-run-1-final.json; data/validation/loop-modes-run-1-freeze-a826333-corrected-browser.json; data/validation/loop-modes-run-1-freeze-a826333-state-reset.json; final sharing reports above. Full logs under /private/tmp/loop-{unit,playwright,gates}-run-1-final.log. Historical failed iterations remain separate. Local result URLs are temporary test fixtures; reports preserve HTML/PNG/IDs and measurements after fresh-harness resets.

Missing historical measurements: tests/v6c2c4-scoped-calibration.test.js cannot collect because measured identifiability cache is absent; tests/v6c2c6-orientation-and-sidebias.test.js and tests/v6c2c6-side-bias-policy.test.js each fail the frozen probability-validation-v3 artifact read. No protected calibration regeneration/stub. Gate security failures: Challenges,competitive,progression require an unavailable X-Preview-Key owner diagnostic. Before/after: first70/77→final85/88; fixed API duplicate deployment copies/CSP bounded host assertion/Challenge CLS. All11 new gates pass.

Preview readiness was repeated after push. Vercel READY dpl_44HmV4ve1npeNRhpQCTEG6tk5t8v and GitHub deployment6805286186 SUCCESS at exact b0ef7ae. Branch URL https://era-clash-basketball-git-phase-loop-foundation-era-clash.vercel.app; immutable https://era-clash-basketball-3mhnd6jq5-era-clash.vercel.app. One anonymous request returned401 Private preview from the app invite-key gate. Available bypass/admin credential presence checks were allfalse; no public app200 or deployed runtime fingerprint was observed. Run2 uses the local production-build fallback; no oldPR69Preview is claimed.

## Open questions
- Mobile Lighthouse LCP remains above2.5s on home,Daily andhub after measured load-path corrections; release acceptance FAIL. No97%claim supported.
- Protected APIpreview is single-only; inheritedseries/season/Tournament/UTC Daily retain productionV3 identity, preserved per repo-first rule. ExpandingCandidate4 scope is a separate protected-engine decision.
- Full public release depends on credentials, actualSMTP/liveproviderconfiguration, rights/operatorpolicies and authenticatedtwo-accountRLSverification.
- Openingnight schedule claims verified by official league release and PDF (sourcesin docs/data), not assumed.

## Historical Run1 checkpoints (superseded by the closed Run1 counts above)
- Frozen implementation a826333eb68ff2b995933541bb4be44ca9acda7b; client build eraclash-assets:2.7.2:c3234f7053ad; local target http://localhost:4320. Explicit local-only simulation session/IP quotas500 permit bounded scripted fixtures; production defaults remain10/20 and the inherited global ceiling600 applies to Loop compute. Full99-file unit run:2954 passed,2 failed,1 collection-blocked suite (three files total), all remaining failures are missing frozen historical calibration artifacts. No skipped tests declared.
- Frozen browser run:98/98 passed; full88-gate sweep still running. New mode reverify72/72,41 actual games,zero page errors; prior71/72 test-only same-day refresh assumption failure is preserved and corrected by a real day-change focus test. Sharing102/102 and typed guest rematch21/21; sourceSHA/build stamp and actual server identity recorded in final sharing reports.
- Career projection retains all ten new mode identities under schema-compatible loop_* keys. Fresh casual rematch preserves saved fives/coaches/era with a new authoritative AnyFive game and seed, without reusing a Daily attempt/Spin receipt/Gauntlet claim. Targeted155 tests plus final56-test boundary batch passed. Daily visible dates useMM-DD-YYYY; machine day keys stayISO. Reopening a result no longer duplicates completion events.
- Full-history tree audit on absorbedPR69 found removed legacy src/components/arena/ModeShelf.jsx (0482e2d,08-31) replaced by canonical navigation; no historical standalone Gauntlet/Lab/Franchise implementation found in the examined src history. Proposed Gauntlet revived as newadapter; FantasyLive planned flagOFF remains information-only. This session deletes no dormant code.
- Legacy browser suite:98/98 passed, actual complete invocation, /private/tmp/loop-playwright-run-1.log.
- First complete legacy gate sweep:70/77; seven failures recorded in data/validation/foundation/loop-run-1.json. Two were identical untracked filesystem copies of PR69 result/share-page sources, preserved in .local-recovery outside deployable API; one strict CSP assertion required the bounded PostHog hosts; one Challenge CLS0.1284 is being rechecked after reserving loading height; three require an unavailable owner diagnostics key. No credentials fabricated and no authorization guard weakened.
- Recovered full unit attempt:2890 passed,3 failed plus1 collection failure; one retry test compared in-process negative zero against JSON wire values and was corrected; remaining three historical cache-dependent assertions/suite remain blocked. Exact frozen identifiability/probability artifacts are absent; protected calibration is not regenerated or stubbed.
- Current server contract suite23/23 passes: Candidate4/calibration1.4.0/core55bb26a2, immutable retries, daily day2/streak/account claim, signed receipt ownership, serialized skips and room joins, two-account room ownership across devices, owned live governed Challenge feed and all ten event counters. Fake cloud is explicitly local emulation.
- A2 scope:101 actual HTTP/browser checks over ten new mode recaps; all three crawler UAs,1200×630PNG<1MB,warm<1s, five widths fit. Guest shared-card→ownfive→owncard21/21. Final build recheck pending.
- B3 scope:435/435 pairing artifacts;30/30 runtime crawler requests;80/80 neutral ON/OFF layout checks; three opening-night Candidate4 cards and12PNG reveal frames. Full roster set remains owner review.
- Protected engine boundary: src/v3/teamIntelligence.js:453 refuses out-of-position players. AnyFive/Lab/Gauntlet now require an eligible five; center-only input resolves names but cannot simulate. Unrestricted-five support would require a separate engine decision and is not silently approximated.
- Canonical franchise filters and Spin now use the30 source-backed pools, avoiding Charlotte/NewOrleans Hornets ambiguity.
- SMTP, actual Preview saved-row repair, real RLS and public Preview URL remain unverified; no production writes or deployment occurred.
