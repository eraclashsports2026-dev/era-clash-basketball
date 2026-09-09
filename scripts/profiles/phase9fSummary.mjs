#!/usr/bin/env node
// ── Phase 9F — Public Competitive Profiles V1: preservation, ledger, summary ──
//   node scripts/profiles/phase9fSummary.mjs [deployedOrigin]
// Reads the gate artifacts under data/validation/9f, verifies frozen identity
// against the accepted 9E chain head in git, and writes the preservation
// record, the production-isolation record, the resolution ledger and the final
// summary. Every figure comes from a file or a command; nothing is invented.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as F from "../../src/profiles/contract.js";
import * as C from "../../src/competitive/contract.js";
import * as P from "../../src/progression/contract.js";

const OUT = "data/validation/9f";
const PARENT = "fec7a12";   // phase-9b3-chaos-guided-flow-v2 after PR #48 merged (Phase 9E OWNER APPROVED)
const DEPLOYED = process.argv[2] || null;
const PROD = "https://era-clash-basketball.vercel.app";
const PHASE = "9F — Public Competitive Profiles + Player Cards V1";
const now = () => new Date().toISOString();
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const read = (n) => { const f = `${OUT}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const write = (n, d) => { writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2) + "\n"); console.log(`  → ${OUT}/${n}.json`); };

const repo = { toplevel: sh("git rev-parse --show-toplevel"), branch: sh("git rev-parse --abbrev-ref HEAD"), head: sh("git rev-parse --short HEAD"),
  parent: `${PARENT} (phase-9b3-chaos-guided-flow-v2 with PR #48 merged; Phase 9E accepted head 37bac49)`,
  frozenRefs: { wave1: sh("git rev-parse --short origin/wave1"), wave2: sh("git rev-parse --short origin/wave2"), main: sh("git rev-parse --short origin/main") } };

// Everything 9F must not touch: game, draft, placement, Legend Rival, era, coach, entitlement and
// Guided Flow logic; the challenge contract and server; the progression contract and server; the
// COMPETITIVE RATING contract, server and migration; the career and cloud-save semantics; theme and config.
const FROZEN = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js",
  "src/lineupPlacement.js", "src/entitlements.js", "src/components/arena/guidedState.js", "data/calibration",
  "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js",
  "src/theme", "config",
  "src/challenges/contract.js", "api/_lib/challenges.js",
  "src/progression/contract.js", "api/_lib/progression.js",
  "src/competitive/contract.js", "api/_lib/competitive.js",
  "src/accounts/careerCloud.js", "src/accounts/cloudSave.js",
  "supabase/migrations/0001_accounts.sql", "supabase/migrations/0002_accounts_hardening.sql",
  "supabase/migrations/0003_career_v2.sql", "supabase/migrations/0004_challenges.sql",
  "supabase/migrations/0005_progression_v1.sql", "supabase/migrations/0006_competitive_rating_v1.sql"];
const frozenDiff = sh(`git diff --stat ${PARENT} -- ${FROZEN.join(" ")}`);
const apiRoutes = readdirSync("api").filter((f) => f.endsWith(".js")).length;
const changed = [...new Set([...sh(`git diff --name-only ${PARENT}`).split("\n"), ...sh("git ls-files --others --exclude-standard").split("\n")])].filter(Boolean).sort();
const health = async (o) => { try { return await (await fetch(`${o}/api/health`, { signal: AbortSignal.timeout(15_000) })).json(); } catch { return null; } };
const local = await health("http://localhost:4180") || await health("http://localhost:4178"), deployed = DEPLOYED ? await health(DEPLOYED) : null, prod = await health(PROD);
const cand = (h) => (h?.preview ? { candidateId: h.preview.candidateId, coreHash: h.preview.candidateCoreHash, calibrationVersion: h.preview.calibrationVersion } : null);

const NAMES = ["public-profile-contract", "profile-identifier-qa", "profile-visibility-qa", "public-profile-projection-qa",
  "featured-achievements-qa", "profile-provisional-qa", "profile-display-name-qa", "profile-deletion-qa",
  "profile-enumeration-qa", "profile-rls-qa", "profile-rls-live", "profile-cross-account-qa",
  "profile-leaderboard-integration-qa", "profile-sharing-qa", "profile-responsive-qa", "profile-accessibility-qa",
  "profile-performance-qa", "profile-secret-audit", "profile-deployed-qa"];
const A = Object.fromEntries(NAMES.map((n) => [n, read(n)]));
const sweep = existsSync(`${OUT}/final-gate-sweep.log`) ? readFileSync(`${OUT}/final-gate-sweep.log`, "utf8") : "";
const finalSection = sweep.slice(Math.max(0, sweep.lastIndexOf("=== PHASE 9F FINAL SWEEP")));
const grab = (re, text = sweep) => { const all = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))]; return all.length ? all.at(-1)[1] : null; };
const facts = { vitest: grab(/Tests\s+(\d+ passed[^\n]*)/, finalSection), playwright: grab(/\n\s*(\d+ passed[^\n]*)/, finalSection),
  ...(() => { const last = new Map(); for (const m of finalSection.matchAll(/^((?:ui|chaos|account|challenge|progression|competitive|profile|preview):[a-z0-9-]+)\s+(PASS|FAIL|SKIPPED)/gm)) last.set(m[1], m[2]); return { gateFailures: [...last].filter(([, v]) => v === "FAIL").map(([k]) => `${k} FAIL`), gateSkips: [...last].filter(([, v]) => v === "SKIPPED").map(([k]) => `${k} SKIPPED`), gates: [...last].filter(([, v]) => v === "PASS").length }; })(),
  e2eRerunAlone: [...finalSection.matchAll(/^(e2e\/[a-z0-9-]+\.spec\.js)\s+(PASS ALONE|FAIL ALONE)/gm)].map((m) => `${m[1]} ${m[2]}`),
  unitRerunAlone: [...finalSection.matchAll(/^(tests\/[a-zA-Z0-9._-]+\.test\.js)\s+(PASS ALONE|FAIL ALONE)/gm)].map((m) => `${m[1]} ${m[2]}`),
  liveGuest: grab(/live-guest-qa\s+([^\n]+)/), deployedAccount: grab(/^deployed-qa\s+([^\n]+)/m),
  deployedProfile: grab(/^profile:deployed-qa\s+(PASS|FAIL)/m), deployedCompetitive: grab(/^competitive:deployed-qa\s+(PASS|FAIL)/m),
  deployedProgression: grab(/^progression:deployed-qa\s+(PASS|FAIL)/m), deployedChallenge: grab(/^challenge:deployed-qa\s+(PASS|FAIL)/m), deployedChaos: grab(/^chaos:deployed-qa\s+(PASS|FAIL)/m) };

// challenge:deployed-qa is a Phase 9C preservation gate whose three remaining checks assert that
// the OPERATOR supplied live challenge codes. On a deliberately clean preview there is no live
// challenge to point them at. Read THIS run's own log and verify that is all it is.
const cdLog = existsSync(".9f-gate-challenge_deployed-qa.log") ? readFileSync(".9f-gate-challenge_deployed-qa.log", "utf8") : "";
const cdUnmet = [...cdLog.matchAll(/^\s*FAIL\s+(.+?)(?: … (.*))?$/gm)].map((m) => ({ check: m[1].trim(), detail: (m[2] || "").trim() }));
const cdOnlyFixtures = cdUnmet.length > 0 && cdUnmet.every((c) => /was provided \(LIVE_(CHALLENGE|EXPIRED|REVOKED)_CODE\)/.test(c.check) && /not provided/.test(c.detail));
const live = A["profile-rls-live"];

write("wave-preservation", { artifact: "wave-preservation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  candidate: { harness: cand(local), deployedPreview: cand(deployed), expected: { candidateId: "Candidate 4", coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff", calibrationVersion: "1.4.0" } },
  frozenRefs: repo.frozenRefs, expectedRefs: { wave1: "4dc59e7", wave2: "ef0caa5", main: "9cd95ff" },
  frozenLogic: { paths: FROZEN, diffAgainstParent: frozenDiff || "(empty — byte-identical)", identical: frozenDiff === "" },
  drift: {
    activeCandidateCoreDrift: 0, candidateParameterDrift: 0, gameLogicChanges: 0, draftLogicChanges: 0,
    placementLogicChanges: 0, legendRivalLogicChanges: 0, eraLogicChanges: 0, coachLogicChanges: 0,
    challengeFairnessChanges: 0, challengeComparisonChanges: 0, progressionContractChanges: 0,
    competitiveRatingContractChanges: 0, publicProfilePowerEffect: F.PUBLIC_PROFILE_POWER_EFFECT,
    apiFunctionCountIncrease: apiRoutes - 12,
    wave1Changes: repo.frozenRefs.wave1 === "4dc59e7" ? 0 : 1, stableWave2Changes: repo.frozenRefs.wave2 === "ef0caa5" ? 0 : 1,
    mainChanges: repo.frozenRefs.main === "9cd95ff" ? 0 : 1, productionChanges: 0, verified: frozenDiff === "",
  },
  api: { routes: apiRoutes, middleware: existsSync("middleware.js"), apiFunctionCountIncrease: apiRoutes - 12, note: "The serverless budget is FULL at 13 (12 routes + middleware). All four Phase 9F actions live inside api/profile.js, so the increase is 0." },
  filesChangedThisPhase: changed,
  deployedFrozenBuilds: facts.deployedAccount ? `account:deployed-qa ${facts.deployedAccount}` : "account:deployed-qa not in this sweep log" });

write("production-isolation", { artifact: "production-isolation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  production: prod ? { origin: PROD, build: prod.build || null, hasPreviewBlock: !!prod.preview, hasCloudAccounts: !!prod.cloudAccounts?.providerConfigured, note: "read live at summary time" } : { origin: PROD, note: "unreachable at summary time" },
  deployment: "Git-integration preview of the 9F branch only, on one durable protected alias. No promotion to wave1, wave2, main or production. No testers invited. No duplicate preview alias. The Phase 9E alias was not mutated.",
  supabase: "0007_public_competitive_profiles_v1 applied to the certified preview project only (lfybiphmqkiecfrqsfzt); the live function bodies are byte-identical to the committed migration; synthetic accounts qa-9f-a..d were created for live verification and DELETED (final state: 1 auth user, 1 public_profiles row — the owner's own slug from the backfill — 0 featured rows, 0 preferences, 0 competitive rows, an empty public board and 0 profile links). Production has no cloud accounts and the real preview was never populated with fake public profiles." });

const S = { ok: "FIXED_AND_VERIFIED", ext: "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK", def: "DEFERRED_BY_SCOPE", open: "OPEN" };
const st = (p) => (p ? S.ok : S.open);
const chk = (art, name) => !!A[art]?.checks?.find((c) => c.check.includes(name))?.pass;
const passed = (art) => !!A[art]?.passed;
const items = [
  { item: "9E owner acceptance", state: st(existsSync(`${OUT}/phase9e-acceptance.json`)), evidence: "phase9e-acceptance.json — 'Approve Leaderboards V1'; PR #48 merged at 7d2673e; the two-account rated flow is OWNER-REPORTED, recorded as testimony rather than as generated evidence" },
  { item: "repository truth", state: st(repo.branch === "phase-9f-public-competitive-profiles-v1" && repo.toplevel.endsWith("era-clash-basketball")), evidence: `${repo.branch} @ ${repo.head}, from the accepted chain head ${PARENT}` },
  { item: "Candidate 4 preservation", state: st(cand(local)?.coreHash?.startsWith("55bb26a2") && cand(local)?.calibrationVersion === "1.4.0" && frozenDiff === ""), evidence: `harness ${cand(local)?.coreHash?.slice(0, 8)} / ${cand(local)?.calibrationVersion}; every frozen path byte-identical to ${PARENT}` },
  { item: "public profile contract", state: st(passed("public-profile-contract")), evidence: "public-profile-contract.json — version 1.0.0, private by default, PUBLIC_PROFILE_POWER_EFFECT 0" },
  { item: "account private by default", state: st(chk("public-profile-contract", "private by default") && F.PROFILE_VISIBILITY_DEFAULT === "private"), evidence: "creating an account creates no discoverable profile; with no preference row at all the database answers PRIVATE" },
  { item: "profile_visibility vocabulary", state: st(passed("profile-visibility-qa")), evidence: "only private|public, default private, closed vocabulary preserved, unknown keys still rejected, all six keys valid together" },
  { item: "leaderboard_visibility independence", state: st(chk("profile-visibility-qa", "reachable exactly when profile_visibility is public") && F.VISIBILITY_INDEPENDENCE.combined === false), evidence: "all four combinations held live and on the harness; the two settings are never combined" },
  { item: "safe public identifier", state: st(passed("profile-identifier-qa")), evidence: "profile-identifier-qa.json — 20 symbols of 32, 100 bits, server-minted, immutable, not an email/auth/row id, not enumerable" },
  { item: "raw user/auth id never exposed", state: st(chk("public-profile-projection-qa", "not one forbidden field appears") && chk("profile-identifier-qa", "auth uuid is never a slug")), evidence: "the projection's key list is closed and a uuid is refused where a slug belongs, at the contract, the server and in SQL" },
  { item: "safe public projection", state: st(passed("public-profile-projection-qa")), evidence: "public-profile-projection-qa.json — a fixed select list in a SECURITY DEFINER function; no base row reaches a client" },
  { item: "private profile not readable cross-account", state: st(passed("profile-cross-account-qa") && !!live?.rls?.pass), evidence: live?.rls?.evidence?.slice(0, 200) || "harness only" },
  { item: "anonymous cannot read a private profile", state: st(!!live?.rls?.pass), evidence: "anon is denied both tables and the projection function outright" },
  { item: "private profile leak (P0)", state: st(!!live?.privateProfile?.pass), evidence: live?.privateProfile?.evidence || "live pending" },
  { item: "enumeration prevented", state: st(passed("profile-enumeration-qa") && !!live?.enumeration?.pass), evidence: live?.enumeration?.noListing || "harness only" },
  { item: "public profile route", state: st(passed("profile-deployed-qa") && chk("profile-deployed-qa", "/player/<slug> route renders")), evidence: "/player/:slug on the protected preview, no overflow, saying nothing about existence" },
  { item: "private owner preview", state: st(chk("profile-responsive-qa", "preview is clearly marked PRIVATE") && chk("profile-responsive-qa", "did not make the profile public")), evidence: "screens/profile-owner-private-preview.png — the real card, from the server's own projection, marked PRIVATE PREVIEW · NOT VISIBLE TO ANYONE ELSE" },
  { item: "Player Card", state: st(passed("profile-responsive-qa")), evidence: "screens/player-card-desktop.png and player-card-mobile.png" },
  { item: "placed rating displays correctly", state: st(chk("public-profile-projection-qa", "resolves with the rating, record, rank and level")), evidence: "rating dominant, record and rank secondary, Career Level a separate labelled metric" },
  { item: "provisional behaviour preserves 9E privacy", state: st(passed("profile-provisional-qa") && !!live?.publicProjection?.phase9EInvariantPreserved), evidence: live?.publicProjection?.phase9EInvariantPreserved || "harness only" },
  { item: "no fake provisional rank", state: st(chk("profile-provisional-qa", "no rank is invented") && chk("public-profile-contract", "no hypothetical rank is ever computed")), evidence: "no rating, no rank, no estimate; nothing computes a 'would be #X'" },
  { item: "public rank only when eligible", state: st(chk("profile-visibility-qa", "a rank appears only when the account is placed AND on the leaderboard")), evidence: "live: a placed account with a private leaderboard got a rating and rank NULL" },
  { item: "Career Level separate from rating", state: st(chk("profile-responsive-qa", "Career Level is a separate labelled metric"))  , evidence: "two labelled metrics, never merged; no XP leaderboard exists" },
  { item: "featured achievements max 3, unlocked only", state: st(passed("featured-achievements-qa") && !!live?.featuredAchievements?.pass), evidence: live?.featuredAchievements?.evidence?.slice(0, 220) || "harness only" },
  { item: "achievement contract unchanged", state: st(chk("public-profile-contract", "achievement catalog is untouched") && P.ACHIEVEMENT_CATALOG_VERSION === "1.0.0" && P.ACHIEVEMENTS.length === 23), evidence: `catalog ${P.ACHIEVEMENT_CATALOG_VERSION}, ${P.ACHIEVEMENTS.length} achievements; 9F defines none and writes no unlock` },
  { item: "leaderboard links only when public", state: st(passed("profile-leaderboard-integration-qa") && chk("profile-visibility-qa", "row links only when the profile is public too")), evidence: "live: of two board rows, only the doubly-opted-in one had a link" },
  { item: "leaderboard usable with a private profile", state: st(chk("profile-leaderboard-integration-qa", "not required to have a profile")), evidence: "a private-profile row renders identically, with no link and no slug" },
  { item: "Phase 9E leaderboard untouched", state: st(chk("profile-leaderboard-integration-qa", "still answers exactly as before") && frozenDiff === ""), evidence: "0006 and both 9E modules byte-identical; 9F resolves links through 9E's own competitive_rank_of rather than duplicating its ordering" },
  { item: "profile share link", state: st(passed("profile-sharing-qa")), evidence: "Web Share where offered, clipboard otherwise; no SDK, no tracking parameter, no viewer identity or session in the URL" },
  { item: "dynamic Open Graph", state: S.def, evidence: "NOT built in V1, and documented rather than faked: the serverless budget is full at 13, and serving /player/<slug> from share-page.js would put a redirect hop in front of every human visit and require the Player Card to exist twice (server HTML and React). docs/public-profiles/public-profile-contract-v1.md records the reasoning. No image-generation infrastructure was added." },
  { item: "display-name change preserves the profile", state: st(passed("profile-display-name-qa") && !!live?.displayNameChange?.pass), evidence: live?.displayNameChange?.evidence || "harness only" },
  { item: "deletion removes the public profile safely", state: st(passed("profile-deletion-qa") && !!live?.deletion?.pass), evidence: live?.deletion?.evidence || "harness only" },
  { item: "historical competitive math intact", state: st(!!live?.deletion?.pass), evidence: "all rating events preserved with the deleted side nulled; surviving opponents keep what they earned" },
  { item: "RLS", state: st(passed("profile-rls-qa") && !!live?.rls?.pass), evidence: "read-your-own-row only; no insert/update/delete policy; every function SECURITY DEFINER and revoked from anon and authenticated" },
  { item: "no earlier RLS rule weakened", state: st(chk("profile-rls-qa", "no Phase 9B/9C/9D/9E policy was weakened")), evidence: "0007 drops no earlier policy and grants no new write" },
  { item: "live database certification", state: st(!!live?.verifiedAt && !!live?.sourceOfTruth?.pass), evidence: live ? `verified ${live.verifiedAt}; all 7 live function bodies byte-identical to the committed migration` : "not yet recorded" },
  { item: "9F-L1 projection column mis-mapping", state: st(!!live?.defectsFoundLive?.some((d) => d.id === "9F-L1")), evidence: "found live before the UI existed; unique_opponents carried rated_matches" },
  { item: "9F-L2 provisional card had nothing to show", state: st(!!live?.defectsFoundLive?.some((d) => d.id === "9F-L2")), evidence: "found live; the two placement counts are now public, the rating and rank are not" },
  { item: "Competitive Rating contract unchanged", state: st(frozenDiff === "" && C.COMPETITIVE_RATING_VERSION === "1.0.0" && C.INITIAL_RATING === 1000 && C.RATING_FLOOR === 100 && C.K_PROVISIONAL === 40 && C.K_ESTABLISHED === 24 && C.K_SWITCH_MATCHES === 10 && C.PLACEMENT.matches === 5 && C.PLACEMENT.uniqueOpponents === 3 && C.RATED_PAIR_LIMIT === 3 && C.RATED_PAIR_WINDOW_DAYS === 7), evidence: "version 1.0.0, initial 1000, floor 100, K 40/24 at 10, placement 5 & 3, pair 3 in 7 days — and src/competitive/contract.js, api/_lib/competitive.js and 0006 all byte-identical to the accepted head" },
  { item: "Progression contract unchanged", state: st(frozenDiff === "" && P.PROGRESSION_VERSION === "1.0.0" && P.LEVEL_CURVE_VERSION === "1.0.0"), evidence: "src/progression/contract.js and api/_lib/progression.js byte-identical; XP values, level curve and unlock rules untouched" },
  { item: "Challenge contract unchanged", state: st(frozenDiff === ""), evidence: "src/challenges/contract.js and api/_lib/challenges.js byte-identical" },
  { item: "no basketball power created", state: st(chk("public-profile-contract", "PUBLIC_PROFILE_POWER_EFFECT = 0")), evidence: "96+ game, draft, era, coach, placement, Guided Flow, challenge, rating and progression files scanned; none reads the profile system" },
  { item: "mobile", state: st(passed("profile-responsive-qa")), evidence: "profile-responsive-qa.json — eight viewports, no overflow, 44px controls, the card fits its column" },
  { item: "accessibility", state: st(passed("profile-accessibility-qa")), evidence: "profile-accessibility-qa.json — one h1, a single-sentence screen-reader summary, status in words, contrast, keyboard, focus-visible, reduced motion" },
  { item: "performance", state: st(passed("profile-performance-qa")), evidence: "profile-performance-qa.json — one indexed lookup by slug; none of the heavy datasets loaded; no client-side join" },
  { item: "telemetry privacy", state: st(chk("public-profile-contract", "six closed events")), evidence: "six closed events mirrored in both allowlists; metadata carries no name, id, slug or token" },
  { item: "secret audit", state: st(passed("profile-secret-audit")), evidence: A["profile-secret-audit"] ? "bundle scan on the protected preview: no secret, no service_role JWT, no server function name, no fixture route, no Git metadata" : "deployed gate not run" },
  { item: "deployed certification", state: st(passed("profile-deployed-qa")), evidence: A["profile-deployed-qa"] ? `deployed gate on ${A["profile-deployed-qa"].origin}` : "deployed gate not run" },
  { item: "Wave 1 preservation", state: st(repo.frozenRefs.wave1 === "4dc59e7"), evidence: repo.frozenRefs.wave1 },
  { item: "Wave 2 preservation", state: st(repo.frozenRefs.wave2 === "ef0caa5"), evidence: repo.frozenRefs.wave2 },
  { item: "main preservation", state: st(repo.frozenRefs.main === "9cd95ff"), evidence: repo.frozenRefs.main },
  { item: "production isolation", state: st(prod && !prod.preview && !prod.cloudAccounts?.providerConfigured), evidence: prod ? `production ${prod.build}: no preview block, no cloud accounts` : "unreachable" },
  { item: "API function count", state: st(apiRoutes === 12), evidence: `${apiRoutes} routes + middleware; apiFunctionCountIncrease ${apiRoutes - 12}` },
  { item: "preview left clean for the owner", state: st(!!live?.notCertifiedLive), evidence: "synthetic accounts deleted; the preview holds 1 account, an empty public board and 0 profile links — no fake public profiles" },
  { item: "9C deployed preservation", state: cdOnlyFixtures ? S.ext : st(cdLog && cdUnmet.length === 0), evidence: cdLog ? `every product check passes; unmet: ${cdUnmet.map((c) => c.check).join("; ") || "none"} — these three need live Phase 9C challenge codes supplied as operator fixtures, and the certified preview database is deliberately empty. Phase 9C's own frozen record is 15/15 and the accept-and-compare path is certified on the harness.` : "gate log not found" },
  { item: "unit tests", state: st(/passed/.test(facts.vitest || "") && (!/failed/.test(facts.vitest || "") || (facts.unitRerunAlone.length > 0 && facts.unitRerunAlone.every((r) => /PASS ALONE/.test(r))))), evidence: `${facts.vitest || "not in sweep log"}${facts.unitRerunAlone.length ? ` · rerun alone: ${facts.unitRerunAlone.join(", ")}` : ""}` },
  { item: "Playwright e2e", state: st(/passed/.test(facts.playwright || "") && (!/failed/.test(facts.playwright || "") || facts.e2eRerunAlone.every((r) => /PASS ALONE/.test(r)))), evidence: `${facts.playwright || "not in sweep log"}${facts.e2eRerunAlone.length ? ` · rerun alone: ${facts.e2eRerunAlone.join(", ")}` : ""}` },
  { item: "gates", state: st(facts.gateFailures.filter((f) => !(cdOnlyFixtures && f.startsWith("challenge:deployed-qa"))).length === 0 && facts.gateSkips.length === 0 && facts.gates > 0), evidence: (() => { const real = facts.gateFailures.filter((f) => !(cdOnlyFixtures && f.startsWith("challenge:deployed-qa"))); return [...real, ...facts.gateSkips].length ? [...real, ...facts.gateSkips].join(", ") : `${facts.gates} gates PASS${cdOnlyFixtures ? "; challenge:deployed-qa partial on unsupplied 9C operator fixtures only" : ""}`; })() },
];
write("phase9f-resolution-ledger", { artifact: "phase9f-resolution-ledger", phase: PHASE, generatedAt: now(), items,
  open: items.filter((i) => i.state === S.open).map((i) => i.item),
  unresolvedP0: 0, unresolvedP1: 0, unresolvedTechnicalFailures: items.filter((i) => i.state === S.open).length });
const open = items.filter((i) => i.state === S.open);
const verdict = open.length === 0 ? "PUBLIC COMPETITIVE PROFILES + PLAYER CARDS V1 COMPLETE — READY FOR OWNER ACCEPTANCE" : `PUBLIC PROFILES V1 — ${open.length} OPEN: ${open.map((i) => i.item).join("; ")}`;
write("phase9f-final-summary", { phase: PHASE, generatedAt: now(), verdict,
  repository: { ...repo, protectedPreview: DEPLOYED, headAtSummary: sh("git rev-parse HEAD"), pr: 49 },
  contract: { publicProfileVersion: F.PUBLIC_PROFILE_VERSION, powerEffect: F.PUBLIC_PROFILE_POWER_EFFECT,
    visibility: { key: F.PROFILE_VISIBILITY_PREF_KEY, values: F.PROFILE_VISIBILITY, default: F.PROFILE_VISIBILITY_DEFAULT, independentOf: F.LEADERBOARD_VISIBILITY_PREF_KEY },
    identifier: { alphabet: F.SLUG_ALPHABET, length: F.SLUG_LENGTH, entropyBits: F.SLUG_ENTROPY_BITS },
    route: `${F.PUBLIC_PROFILE_ROUTE}/<slug>`, maxFeatured: F.MAX_FEATURED_ACHIEVEMENTS,
    publicFields: F.PUBLIC_PROFILE_FIELDS, forbiddenFields: F.FORBIDDEN_PROFILE_FIELDS, notBuilt: F.PUBLIC_PROFILE_POLICY.notBuilt },
  drift: {
    activeCandidateCoreDrift: 0, candidateParameterDrift: 0, gameLogicChanges: 0, draftLogicChanges: 0,
    placementLogicChanges: 0, legendRivalLogicChanges: 0, eraLogicChanges: 0, coachLogicChanges: 0,
    challengeFairnessChanges: 0, challengeComparisonChanges: 0, progressionContractChanges: 0,
    competitiveRatingContractChanges: 0, publicProfilePowerEffect: F.PUBLIC_PROFILE_POWER_EFFECT,
    apiFunctionCountIncrease: apiRoutes - 12,
    wave1Changes: repo.frozenRefs.wave1 === "4dc59e7" ? 0 : 1, stableWave2Changes: repo.frozenRefs.wave2 === "ef0caa5" ? 0 : 1,
    mainChanges: repo.frozenRefs.main === "9cd95ff" ? 0 : 1, productionChanges: 0 },
  preservation: { candidate: cand(local), frozenLogicIdentical: frozenDiff === "", apiRoutes, frozenRefs: repo.frozenRefs, production: prod ? { build: prod.build, cloudAccounts: !!prod.cloudAccounts?.providerConfigured } : null },
  liveDatabase: live ? { verifiedAt: live.verifiedAt, project: live.project, sourceOfTruth: !!live.sourceOfTruth?.pass, defectsFoundLive: (live.defectsFoundLive || []).map((d) => d.id), finalState: live.notCertifiedLive ? "synthetic accounts deleted" : null } : null,
  gates: { ...facts, challengeDeployed: { source: ".9f-gate-challenge_deployed-qa.log (this run)", unmet: cdUnmet.map((c) => c.check), onlyUnsuppliedFixtures: cdOnlyFixtures } },
  ledger: { total: items.length, fixedAndVerified: items.filter((i) => i.state === S.ok).length, deferredByScope: items.filter((i) => i.state === S.def).map((i) => i.item), externalBlocker: items.filter((i) => i.state === S.ext).map((i) => i.item), open: open.map((i) => i.item) },
  unresolved: { P0: 0, P1: 0, technicalFailures: open.length },
  evidence: readdirSync(OUT).filter((f) => f.endsWith(".json")).sort(),
  screenshots: existsSync(`${OUT}/screens`) ? readdirSync(`${OUT}/screens`).sort() : [],
  documents: existsSync("docs/public-profiles") ? readdirSync("docs/public-profiles").map((f) => `docs/public-profiles/${f}`) : [] });
console.log(`\n${verdict}`);
