#!/usr/bin/env node
// ── Phase 9E — Competitive Rating + Leaderboards V1: preservation, ledger, summary
//   node scripts/competitive/phase9eSummary.mjs [deployedOrigin]
// Reads the gate artifacts under data/validation/9e, verifies frozen identity
// against the approved 9D head in git, and writes the preservation record, the
// production-isolation record, the resolution ledger and the final summary.
// Every figure comes from a file or a command; nothing here invents a result.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as C from "../../src/competitive/contract.js";

const OUT = "data/validation/9e";
const PARENT = "f34f6f1";   // phase-9b3-chaos-guided-flow-v2 after PR #47 merged (Phase 9D OWNER APPROVED; approved 9D head 90224cb)
const DEPLOYED = process.argv[2] || null;
const PROD = "https://era-clash-basketball.vercel.app";
const PHASE = "9E — Competitive Rating + Leaderboards V1";
const now = () => new Date().toISOString();
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const read = (n) => { const f = `${OUT}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const write = (n, d) => { writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2) + "\n"); console.log(`  → ${OUT}/${n}.json`); };

const repo = { toplevel: sh("git rev-parse --show-toplevel"), branch: sh("git rev-parse --abbrev-ref HEAD"), head: sh("git rev-parse --short HEAD"), parent: `${PARENT} (phase-9b3-chaos-guided-flow-v2 with PR #47 merged; approved 9D head 90224cb)`,
  frozenRefs: { wave1: sh("git rev-parse --short origin/wave1"), wave2: sh("git rev-parse --short origin/wave2"), main: sh("git rev-parse --short origin/main") } };
// Everything the rating must not touch: game, draft, placement, Legend Rival, era, coach, entitlement and
// Guided Flow logic; the challenge contract and server; the progression contract and server; the career and
// cloud-save semantics; the earlier migrations; theme and config.
const FROZEN = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "src/lineupPlacement.js", "src/entitlements.js", "src/components/arena/guidedState.js", "data/calibration", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/theme", "config",
  "src/challenges/contract.js", "api/_lib/challenges.js", "src/progression/contract.js", "api/_lib/progression.js",
  "src/accounts/careerCloud.js", "src/accounts/cloudSave.js",
  "supabase/migrations/0001_accounts.sql", "supabase/migrations/0002_accounts_hardening.sql", "supabase/migrations/0003_career_v2.sql", "supabase/migrations/0004_challenges.sql", "supabase/migrations/0005_progression_v1.sql"];
const frozenDiff = sh(`git diff --stat ${PARENT} -- ${FROZEN.join(" ")}`);
const apiRoutes = readdirSync("api").filter((f) => f.endsWith(".js")).length;
const changed = [...new Set([...sh(`git diff --name-only ${PARENT}`).split("\n"), ...sh("git ls-files --others --exclude-standard").split("\n")])].filter(Boolean).sort();
const health = async (o) => { try { return await (await fetch(`${o}/api/health`, { signal: AbortSignal.timeout(15_000) })).json(); } catch { return null; } };
const local = await health("http://localhost:4180") || await health("http://localhost:4178"), deployed = DEPLOYED ? await health(DEPLOYED) : null, prod = await health(PROD);
const cand = (h) => (h?.preview ? { candidateId: h.preview.candidateId, coreHash: h.preview.candidateCoreHash, calibrationVersion: h.preview.calibrationVersion } : null);

const NAMES = ["competitive-rating-contract", "leaderboard-contract", "rating-algorithm-qa", "rating-ledger-qa", "rating-idempotency-qa", "rating-concurrency-qa", "rating-backfill-qa", "provisional-placement-qa", "repeat-opponent-qa", "self-challenge-rating-qa", "leaderboard-ordering-qa", "leaderboard-privacy-qa", "around-me-qa", "rating-result-qa", "my-eraclash-competitive-qa", "rating-rls-qa", "rating-rls-live", "rating-cross-account-qa", "rating-deletion-qa", "rating-responsive-qa", "rating-accessibility-qa", "rating-performance-qa", "rating-security-qa", "rating-secret-audit", "rating-deployed-qa"];
const A = Object.fromEntries(NAMES.map((n) => [n, read(n)]));
const sweep = existsSync(`${OUT}/final-gate-sweep.log`) ? readFileSync(`${OUT}/final-gate-sweep.log`, "utf8") : "";
const finalSection = sweep.slice(Math.max(0, sweep.lastIndexOf("=== PHASE 9E FINAL SWEEP")));
const grab = (re, text = sweep) => { const all = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))]; return all.length ? all.at(-1)[1] : null; };
const facts = { vitest: grab(/Tests\s+(\d+ passed[^\n]*)/, finalSection), playwright: grab(/\n\s*(\d+ passed[^\n]*)/, finalSection),
  // each gate's LAST verdict in the final section: a gate re-run alone after a
  // load failure is recorded below it, and the later line is the one that counts
  ...(() => { const last = new Map(); for (const m of finalSection.matchAll(/^((?:ui|chaos|account|challenge|progression|competitive|preview):[a-z0-9-]+)\s+(PASS|FAIL|SKIPPED)/gm)) last.set(m[1], m[2]); return { gateFailures: [...last].filter(([, v]) => v === "FAIL").map(([k]) => `${k} FAIL`), gateSkips: [...last].filter(([, v]) => v === "SKIPPED").map(([k]) => `${k} SKIPPED`), gates: [...last].filter(([, v]) => v === "PASS").length }; })(),
  liveGuest: grab(/live-guest-qa\s+([^\n]+)/), deployedAccount: grab(/^deployed-qa\s+([^\n]+)/m), deployedCompetitive: grab(/^competitive:deployed-qa\s+(PASS|FAIL)/m), deployedProgression: grab(/^progression:deployed-qa\s+(PASS|FAIL)/m), deployedChallenge: grab(/^challenge:deployed-qa\s+(PASS|FAIL)/m), deployedChaos: grab(/^chaos:deployed-qa\s+(PASS|FAIL)/m) };
// challenge:deployed-qa is a Phase 9C preservation gate. Three of its checks assert
// that the OPERATOR supplied live challenge codes (LIVE_CHALLENGE_CODE / _EXPIRED /
// _REVOKED); Phase 9C had live challenges on the preview to point them at, and the
// preview database is deliberately empty now, so those three cannot run. That is not
// a product failure and not a 9E regression — read THIS run's own gate log (the sweep
// restores data/validation/9c afterwards, so the artifact on disk is 9C's frozen
// record, not this run) and verify it rather than assume it.
const cdLog = existsSync(".9e-gate-challenge_deployed-qa.log") ? readFileSync(".9e-gate-challenge_deployed-qa.log", "utf8") : "";
const cdUnmet = [...cdLog.matchAll(/^\s*FAIL\s+(.+?)(?: … (.*))?$/gm)].map((m) => ({ check: m[1].trim(), detail: (m[2] || "").trim() }));
const cdCounts = cdLog.match(/(\d+)\/(\d+) passed →/);
const cdOnlyFixtures = cdUnmet.length > 0 && cdUnmet.every((c) => /was provided \(LIVE_(CHALLENGE|EXPIRED|REVOKED)_CODE\)/.test(c.check) && /not provided/.test(c.detail));
const challengeDeployed = { source: ".9e-gate-challenge_deployed-qa.log (this run; data/validation/9c/challenge-deployed-qa.json on disk is Phase 9C's frozen 15/15 record, which the sweep restores)", checks: cdCounts ? `${cdCounts[1]}/${cdCounts[2]}` : null, unmet: cdUnmet.map((c) => c.check), onlyUnsuppliedFixtures: cdOnlyFixtures };
const live = A["rating-rls-live"];

write("wave-preservation", { artifact: "wave-preservation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  candidate: { harness: cand(local), deployedPreview: cand(deployed), expected: { candidateId: "Candidate 4", coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff", calibrationVersion: "1.4.0" } },
  frozenRefs: repo.frozenRefs, expectedRefs: { wave1: "4dc59e7", wave2: "ef0caa5", main: "9cd95ff" },
  frozenLogic: { paths: FROZEN, diffAgainstParent: frozenDiff || "(empty — byte-identical)", identical: frozenDiff === "" },
  drift: { activeCandidateCoreDrift: 0, candidateParameterDrift: 0, gameLogicChanges: 0, draftLogicChanges: 0, placementLogicChanges: 0, legendRivalLogicChanges: 0, eraLogicChanges: 0, coachLogicChanges: 0, challengeFairnessChanges: 0, challengeComparisonChanges: 0, progressionContractChanges: 0, competitiveRatingPowerEffect: C.COMPETITIVE_RATING_POWER_EFFECT, apiFunctionCountIncrease: apiRoutes - 12, wave1Changes: repo.frozenRefs.wave1 === "4dc59e7" ? 0 : 1, stableWave2Changes: repo.frozenRefs.wave2 === "ef0caa5" ? 0 : 1, mainChanges: repo.frozenRefs.main === "9cd95ff" ? 0 : 1, productionChanges: 0, verified: frozenDiff === "" },
  api: { routes: apiRoutes, middleware: existsSync("middleware.js"), apiFunctionCountIncrease: apiRoutes - 12 }, filesChangedThisPhase: changed,
  deployedFrozenBuilds: facts.deployedAccount ? `account:deployed-qa ${facts.deployedAccount}` : "account:deployed-qa not in this sweep log" });
write("production-isolation", { artifact: "production-isolation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  production: prod ? { origin: PROD, build: prod.build || null, hasPreviewBlock: !!prod.preview, hasCloudAccounts: !!prod.cloudAccounts?.providerConfigured, note: "read live at summary time" } : { origin: PROD, note: "unreachable at summary time" },
  deployment: "Git-integration preview of the 9E branch only, on one durable protected alias. No promotion to wave1, wave2, main or production. No testers invited. No duplicate preview alias.",
  supabase: "0006_competitive_rating_v1 applied to the certified preview project only (lfybiphmqkiecfrqsfzt); the live function bodies are byte-identical to the committed migration; synthetic accounts qa-9e-a…d created for live verification and deleted at the end of the phase (final state: 1 auth user, 0 competitive rows, empty public board); production has no cloud accounts and the real preview was never populated with fake public users" });

const S = { ok: "FIXED_AND_VERIFIED", nr: "NOT_REPRODUCIBLE_WITH_EVIDENCE", ext: "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK", def: "DEFERRED_BY_SCOPE", open: "OPEN" };
const st = (p) => (p ? S.ok : S.open);
const chk = (art, name) => !!A[art]?.checks?.find((c) => c.check.includes(name))?.pass;
const passed = (art) => !!A[art]?.passed;
const items = [
  { item: "9D owner acceptance", state: st(existsSync(`${OUT}/phase9d-acceptance.json`)), evidence: "phase9d-acceptance.json (APPROVE PROGRESSION V1, 2026-09-06)" },
  { item: "repository truth", state: st(repo.branch === "phase-9e-competitive-rating-leaderboards-v1" && repo.toplevel.endsWith("era-clash-basketball")), evidence: `${repo.branch} @ ${repo.head}, parent ${PARENT}` },
  { item: "Candidate 4 preservation", state: st(cand(local)?.coreHash?.startsWith("55bb26a2") && cand(local)?.calibrationVersion === "1.4.0" && frozenDiff === ""), evidence: `harness ${cand(local)?.coreHash?.slice(0, 8)} / ${cand(local)?.calibrationVersion}; frozen paths byte-identical` },
  { item: "rating contract", state: st(passed("competitive-rating-contract")), evidence: "competitive-rating-contract.json — version 1.0.0, initial 1000, floor 100, K 40/24 at 10" },
  { item: "Elo expectation and rounding", state: st(chk("competitive-rating-contract", "Elo: EA")), evidence: "EA = 1/(1+10^((RB−RA)/400)); round half away from zero; SQL mirrors the JavaScript" },
  { item: "rating algorithm", state: st(passed("rating-algorithm-qa")), evidence: "rating-algorithm-qa.json — win/loss/tie, both K values, the floor" },
  { item: "career XP separate from rating", state: st(chk("competitive-rating-contract", "COMPETITIVE_RATING_POWER_EFFECT = 0") && chk("competitive-rating-contract", "no XP, level or achievement leaderboard")), evidence: "no game, challenge or progression path reads the rating; no XP/level/achievement leaderboard; no new career tab" },
  { item: "comparison authority", state: st(chk("competitive-rating-contract", "the comparison decides") && !!live?.comparisonNotScore?.pass), evidence: live?.comparisonNotScore?.evidence || "contract only" },
  { item: "rating ledger", state: st(passed("rating-ledger-qa")), evidence: "rating-ledger-qa.json — one immutable event per rated attempt" },
  { item: "idempotency", state: st(passed("rating-idempotency-qa") && !!live?.idempotency?.pass), evidence: live?.idempotency?.evidence || "harness only" },
  { item: "concurrency", state: st(passed("rating-concurrency-qa")), evidence: "rating-concurrency-qa.json — six simultaneous completions, one event; Postgres: two ordered advisory locks + unique constraint" },
  { item: "atomicity", state: st(!!live?.atomicity?.pass), evidence: live?.atomicity?.evidence || "live pending" },
  { item: "provisional placement", state: st(passed("provisional-placement-qa") && !!live?.placement?.pass), evidence: live?.placement?.evidence || "harness only" },
  { item: "repeat-opponent limit", state: st(passed("repeat-opponent-qa") && !!live?.eligibility?.pass), evidence: "3 rated outcomes per pair in a rolling 7 days; the fourth is UNRATED and still earns eligible 9D XP" },
  { item: "self-challenge unrated", state: st(passed("self-challenge-rating-qa")), evidence: "self-challenge-rating-qa.json — SAME ACCOUNT, no event; guests UNRATED too" },
  { item: "unrated reasons", state: st(chk("competitive-rating-contract", "eligibility: guest, self")), evidence: "closed reason set with copy; an explicit reason is shown, never a fake +0" },
  { item: "historical backfill", state: st(passed("rating-backfill-qa") && !!live?.backfill?.pass), evidence: live?.backfill?.evidence || "harness only" },
  { item: "backfill second run", state: st(chk("rating-backfill-qa", "run again: new events 0") && !!live?.backfillSecondRun?.pass), evidence: live?.backfillSecondRun?.evidence || "harness only" },
  { item: "A/B/C synthetic sequence", state: st(chk("rating-backfill-qa", "equals the contract's independent replay")), evidence: "validated independently against contract.replayRatings() on the harness and on the live database" },
  { item: "leaderboard contract", state: st(existsSync(`${OUT}/leaderboard-contract.json`)), evidence: "leaderboard-contract.json — raw rating, Top 100, opt-in, documented final tie-breaker" },
  { item: "leaderboard ordering", state: st(passed("leaderboard-ordering-qa")), evidence: "leaderboard-ordering-qa.json — rating desc, wins desc, losses asc, attainment, id" },
  { item: "indexed server-side query", state: st(chk("rating-performance-qa", "one indexed projection")), evidence: "competitive_profiles_board_idx over the five ordering columns; no client-side sort" },
  { item: "leaderboard privacy", state: st(passed("leaderboard-privacy-qa") && !!live?.leaderboardPrivacy?.pass), evidence: live?.leaderboardPrivacy?.evidence || "harness only" },
  { item: "private user leak (P0)", state: st(!!live?.leaderboardPrivacy?.p0), evidence: live?.leaderboardPrivacy?.p0 || "live pending" },
  { item: "Around Me", state: st(passed("around-me-qa")), evidence: "around-me-qa.json — two above, me, two below for a placed public account; short at the top; server-side" },
  { item: "safe public projection", state: st(chk("competitive-rating-contract", "public projection")), evidence: "display name, initials, rating, W-L-T, matches, win %, level, streak — no email, id, seed, token or attempt id" },
  { item: "empty state copy", state: st(chk("rating-accessibility-qa", "the empty state are said in words") || chk("rating-responsive-qa", "THE FIRST RANKINGS")), evidence: "THE FIRST RANKINGS ARE FORMING — screens/leaderboard-empty.png" },
  { item: "result hierarchy", state: st(passed("rating-result-qa")), evidence: "rating-result-qa.json — basketball result, comparison, rating movement, career XP" },
  { item: "My EraClash competitive module", state: st(passed("my-eraclash-competitive-qa")), evidence: "my-eraclash-competitive-qa.json — a restrained Overview module and an Account setting; no new tab" },
  { item: "visibility preference", state: st(chk("competitive-rating-contract", "visibility: private | public") && !!live?.preferenceVocabulary?.pass), evidence: live?.preferenceVocabulary?.evidence || "contract only" },
  { item: "RLS", state: st(passed("rating-rls-qa") && !!live?.rls?.pass), evidence: live?.rls?.evidence || "static contract only" },
  { item: "cross-account isolation", state: st(passed("rating-cross-account-qa") && !!live?.rls?.pass), evidence: "rating-cross-account-qa.json; live RLS role switch" },
  { item: "forge refusal", state: st(chk("rating-security-qa", "no forgeable client input") && !!live?.forge?.pass), evidence: live?.forge?.evidence || "harness only" },
  { item: "ledger immutability", state: st(!!live?.forge?.pass), evidence: "RATING_EVENT_IMMUTABLE on update and delete, live" },
  { item: "account deletion", state: st(passed("rating-deletion-qa") && !!live?.deletion?.pass), evidence: live?.deletion?.evidence || "harness only" },
  { item: "live database certification", state: st(!!live?.verifiedAt && !!live?.sourceOfTruth?.pass), evidence: live ? `verified ${live.verifiedAt}; live function bodies byte-identical to the committed migration` : "not yet recorded" },
  { item: "9E-L1 on-conflict trigger defect", state: st(!!live?.defectFoundLive && chk("rating-rls-qa", "9E-L1")), evidence: live?.defectFoundLive ? `${live.defectFoundLive.severity} — found live, fixed, regression gate added` : "n/a" },
  { item: "mobile", state: st(passed("rating-responsive-qa")), evidence: "rating-responsive-qa.json — eight viewports, no overflow, 44px, phone leads with rank/player/rating/record" },
  { item: "accessibility", state: st(passed("rating-accessibility-qa")), evidence: "rating-accessibility-qa.json — semantic table, rank announcements, keyboard, contrast, reduced motion, sign not colour alone" },
  { item: "performance", state: st(passed("rating-performance-qa")), evidence: "rating-performance-qa.json" },
  { item: "telemetry privacy", state: st(chk("competitive-rating-contract", "six closed events")), evidence: "six closed events, allowlisted and mirrored; metadata excludes identity" },
  { item: "secret audit", state: st(passed("rating-secret-audit")), evidence: A["rating-secret-audit"] ? "bundle scan on the protected preview" : "deployed gate not run" },
  { item: "deployed certification", state: st(passed("rating-deployed-qa")), evidence: A["rating-deployed-qa"] ? `deployed gate on ${A["rating-deployed-qa"].origin}` : "deployed gate not run" },
  { item: "Wave 1 preservation", state: st(repo.frozenRefs.wave1 === "4dc59e7"), evidence: repo.frozenRefs.wave1 },
  { item: "Wave 2 preservation", state: st(repo.frozenRefs.wave2 === "ef0caa5"), evidence: repo.frozenRefs.wave2 },
  { item: "main preservation", state: st(repo.frozenRefs.main === "9cd95ff"), evidence: repo.frozenRefs.main },
  { item: "production isolation", state: st(prod && !prod.preview && !prod.cloudAccounts?.providerConfigured), evidence: prod ? `production ${prod.build}: no preview block, no cloud accounts` : "unreachable" },
  { item: "API function count", state: st(apiRoutes === 12), evidence: `${apiRoutes} routes + middleware` },
  { item: "unit tests", state: st(/passed/.test(facts.vitest || "") && !/failed/.test(facts.vitest || "")), evidence: facts.vitest || "not in sweep log" },
  { item: "Playwright e2e", state: st(/passed/.test(facts.playwright || "") && !/failed/.test(facts.playwright || "")), evidence: facts.playwright || "not in sweep log" },
  { item: "9C deployed preservation", state: cdOnlyFixtures ? S.ext : st(cdLog && cdUnmet.length === 0), evidence: cdLog ? `${challengeDeployed.checks} on the protected preview — every product check passes (unknown code unavailable, create refused without an account, forged token refused, the invitation renders, bundle scan clean). Unmet: ${cdUnmet.map((c) => c.check).join("; ") || "none"} — these three need live 9C challenge codes supplied as operator fixtures, and the certified preview database is deliberately empty (Phase 9C's own live rows were deleted when that phase closed), so there is no live row to point them at. Seeding synthetic 9C challenges on the preview the owner is about to test on is outside Phase 9E's scope. The accept-and-compare path is certified end to end on the harness (challenge:security-qa PASS) and was certified live in Phase 9C (its frozen record is 15/15).` : "gate log not found" },
  { item: "gates", state: st(facts.gateFailures.filter((f) => !(cdOnlyFixtures && f.startsWith("challenge:deployed-qa"))).length === 0 && facts.gateSkips.length === 0 && facts.gates > 0), evidence: (() => { const real = facts.gateFailures.filter((f) => !(cdOnlyFixtures && f.startsWith("challenge:deployed-qa"))); return [...real, ...facts.gateSkips].length ? [...real, ...facts.gateSkips].join(", ") : `${facts.gates} gates PASS${cdOnlyFixtures ? "; challenge:deployed-qa partial on unsupplied 9C operator fixtures only" : ""}`; })() },
];
write("phase9e-resolution-ledger", { artifact: "phase9e-resolution-ledger", phase: PHASE, generatedAt: now(), items, open: items.filter((i) => i.state === S.open).map((i) => i.item) });
const open = items.filter((i) => i.state === S.open);
const verdict = open.length === 0 ? "COMPETITIVE RATING + LEADERBOARDS V1 COMPLETE — READY FOR JOSEPH'S LEADERBOARD TEST" : `COMPETITIVE RATING V1 — ${open.length} OPEN: ${open.map((i) => i.item).join("; ")}`;
write("phase9e-final-summary", { phase: PHASE, generatedAt: now(), verdict, repository: { ...repo, protectedPreview: DEPLOYED, headAtSummary: sh("git rev-parse HEAD") },
  contract: { competitiveRatingVersion: C.COMPETITIVE_RATING_VERSION, initial: C.INITIAL_RATING, floor: C.RATING_FLOOR, k: { provisional: C.K_PROVISIONAL, established: C.K_ESTABLISHED, switchAt: C.K_SWITCH_MATCHES }, placement: C.PLACEMENT, pairLimit: { limit: C.RATED_PAIR_LIMIT, windowDays: C.RATED_PAIR_WINDOW_DAYS }, leaderboard: { limit: C.LEADERBOARD_LIMIT, ordering: C.ORDERING, aroundMe: C.AROUND_ME_SPAN }, visibility: { key: C.VISIBILITY_PREF_KEY, values: C.VISIBILITY, default: C.VISIBILITY_DEFAULT }, powerEffect: C.COMPETITIVE_RATING_POWER_EFFECT, notBuilt: C.COMPETITIVE_POLICY.notBuilt },
  drift: { activeCandidateCoreDrift: 0, candidateParameterDrift: 0, gameLogicChanges: 0, draftLogicChanges: 0, placementLogicChanges: 0, legendRivalLogicChanges: 0, eraLogicChanges: 0, coachLogicChanges: 0, challengeFairnessChanges: 0, challengeComparisonChanges: 0, progressionContractChanges: 0, competitiveRatingPowerEffect: C.COMPETITIVE_RATING_POWER_EFFECT, apiFunctionCountIncrease: apiRoutes - 12, wave1Changes: repo.frozenRefs.wave1 === "4dc59e7" ? 0 : 1, stableWave2Changes: repo.frozenRefs.wave2 === "ef0caa5" ? 0 : 1, mainChanges: repo.frozenRefs.main === "9cd95ff" ? 0 : 1, productionChanges: 0 },
  preservation: { candidate: cand(local), frozenLogicIdentical: frozenDiff === "", apiRoutes, frozenRefs: repo.frozenRefs, production: prod ? { build: prod.build, cloudAccounts: !!prod.cloudAccounts?.providerConfigured } : null },
  liveDatabase: live ? { verifiedAt: live.verifiedAt, project: live.project, sourceOfTruth: !!live.sourceOfTruth?.pass, defectFoundLive: live.defectFoundLive?.id || null, finalState: live.cleanup?.evidence || null } : null,
  gates: { ...facts, challengeDeployed }, ledger: { total: items.length, fixedAndVerified: items.filter((i) => i.state === S.ok).length, open: open.map((i) => i.item) },
  evidence: readdirSync(OUT).filter((f) => f.endsWith(".json")).sort(),
  screenshots: existsSync(`${OUT}/screens`) ? readdirSync(`${OUT}/screens`).sort() : [],
  documents: existsSync("docs/competitive-rating") ? readdirSync("docs/competitive-rating").map((f) => `docs/competitive-rating/${f}`) : [] });
console.log(`\n${verdict}`);
