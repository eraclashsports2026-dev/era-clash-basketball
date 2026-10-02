NEXT: 1.A.2
# Basketball Loop Foundation — 10-02-2026

Scope: Basketball only. All other sports remain untouched. Local branch phase/loop-foundation; public deployment and database changes are prohibited during this session.

## Delta since 09-26
- Fetched current main: b31d2ada57e977cf1b2ce546bde86aaf1547e6c8, unchanged from the handoff. Main has no commits since 09-26; its latest commit is 09-20.
- PR #69 remains OPEN, DRAFT, unmerged, head16ea9085a9f864c607cad226e6577177004268e1. Absorbed by fast-forward into phase/loop-foundation. Original PR remains open; this branch supersedes its integration work.
- gh auth status: invalid default org token; no repo-local credential helper. Never changed authentication. Push/new draft PR: EXTERNAL_BLOCKER_WITH_SAFE_FALLBACK. Local commits/builds are the fallback.
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
Run1 implementation in progress: A2 sharing authoritatively publishes owned results into actual1200x630PNG; A3 guestAnyFive rematch; A4neutral copy/naming; A8closed events; A6policy pages; A5ownerSMTPaudit; A7Previewbinding; A9optional support; A10links.

## Modes
Pure constraint adapters and UI are being integrated over unchanged current simulation. Root owns server persistence, rooms and App; agents own sharing, modeUI and franchise/schedule respectively. Every claim awaits recorded tests.

## Run2 results
Pending mandatory execution.

## Run3 results
Pending independent execution; do not consume Run2 results before recording Run3 own results.

## Owner decisions & actions
- Restore correct GitHub authorization using browser GitHub/Codex connection; branch/push/PR creation remains blocked in this session by user-mandated auth fallback.
- Basketball Preview credentials are absent from the available harness and connector. No realPreviewaccount, repair, RLS, SMTP or publicPreviewverification claims.
- Preserve existing simulation candidate/calibration/core and both Wave branches. Current modes only supply inputs/presentation; no engine changes.
- Existing entitlement docs conflict with blanket guest-first play; preserve legacy contracts and provide newguest-adapter routes; explicit policy change remains flagged for review.
- Rights review: neutralcopy reducesexposure, notlegalclearance. Full franchise set requires ownerreview.
- Resendofficial currentfreequota3000/month100/day,3domains; Supabasebuilt-in2/hourteam-only, customSMTPinitial30/hour. OTPtemplateuses{{ .Token }}; currentUIisemailcode, notpasswordreset.
- SalaryCap: no defensibledataset, neverinventprices.
- Keepalive conditional: no evidence BasketballPreviewpaused frominactivity; no paidcron/configchange.

## Production release (browser-only steps)
Will be written to docs/release/10-02-2026-production-release.md, SQLcompanionnotexecuted.

## Evidence
Mainb31d2ad; absorbedPR69head16ea908. PreviewreadinessAPIrequest rejected endpoint; no loop-foundationpublicdeploymentexistsbecausepushblocked. Verificationtargetwillbelocalproductionclient+realserverlessharness. Historicalgatecount77andbrowser98remainhistoricalpendingrerun.

## Open questions
- Full public release depends on credentials, actualSMTP/liveproviderconfiguration, rights/operatorpolicies and authenticatedtwo-accountRLSverification.
- Openingnight schedule claims verified by official league release and PDF (sourcesin docs/data), not assumed.
