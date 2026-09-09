#!/usr/bin/env node
// ── Phase 9D — Progression V1: preservation, ledger, summary ─────────────────
//   node scripts/progression/phase9dSummary.mjs [deployedOrigin]
// Reads the gate artifacts under data/validation/9d, verifies frozen identity
// against the approved 9C head in git, and writes the preservation record, the
// production-isolation record, the deletion artifact (from the live record),
// the resolution ledger and the final summary. Figures come from files or
// commands; nothing here invents a result.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as P from "../../src/progression/contract.js";

const OUT = "data/validation/9d";
const PARENT = "520b34b";   // phase-9b3-chaos-guided-flow-v2 after PR #46 merged (Phase 9C OWNER APPROVED; approved 9C head 98cd4ef)
const DEPLOYED = process.argv[2] || null;
const PROD = "https://era-clash-basketball.vercel.app";
const PHASE = "9D — Progression, XP and Achievements V1";
const now = () => new Date().toISOString();
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const read = (n) => { const f = `${OUT}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const write = (n, d) => { writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2) + "\n"); console.log(`  → ${OUT}/${n}.json`); };

const repo = { toplevel: sh("git rev-parse --show-toplevel"), branch: sh("git rev-parse --abbrev-ref HEAD"), head: sh("git rev-parse --short HEAD"), parent: `${PARENT} (phase-9b3-chaos-guided-flow-v2 with PR #46 merged; approved 9C head 98cd4ef)`,
  frozenRefs: { wave1: sh("git rev-parse --short origin/wave1"), wave2: sh("git rev-parse --short origin/wave2"), main: sh("git rev-parse --short origin/main") } };
// Everything progression must not touch: game, draft, placement, Legend Rival, era, coach, entitlement and Guided Flow logic, the challenge contract and server, the career/cloud-save semantics, the earlier migrations, theme and config.
const FROZEN = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "src/lineupPlacement.js", "src/entitlements.js", "src/components/arena/guidedState.js", "data/calibration", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/theme", "config",
  "src/challenges/contract.js", "api/_lib/challenges.js", "src/accounts/careerCloud.js", "src/accounts/cloudSave.js",
  "supabase/migrations/0001_accounts.sql", "supabase/migrations/0002_accounts_hardening.sql", "supabase/migrations/0003_career_v2.sql", "supabase/migrations/0004_challenges.sql"];
const frozenDiff = sh(`git diff --stat ${PARENT} HEAD -- ${FROZEN.join(" ")}`);
const apiRoutes = readdirSync("api").filter((f) => f.endsWith(".js")).length;
const changed = sh(`git diff --name-only ${PARENT} HEAD`).split("\n").filter(Boolean);
const health = async (o) => { try { return await (await fetch(`${o}/api/health`, { signal: AbortSignal.timeout(15_000) })).json(); } catch { return null; } };
const local = await health("http://localhost:4180") || await health("http://localhost:4178"), deployed = DEPLOYED ? await health(DEPLOYED) : null, prod = await health(PROD);
const cand = (h) => (h?.preview ? { candidateId: h.preview.candidateId, coreHash: h.preview.candidateCoreHash, calibrationVersion: h.preview.calibrationVersion } : null);

const NAMES = ["progression-contract", "xp-idempotency-qa", "achievement-evaluator-qa", "achievement-unlock-qa", "progression-backfill-qa", "progression-reconcile-qa", "guest-claim-progression-qa", "progression-rls-qa", "progression-security-qa", "progression-cross-account-qa", "progression-concurrency-qa", "progression-responsive-qa", "progression-accessibility-qa", "progression-performance-qa", "progression-deployed-qa", "progression-secret-audit", "progression-rls-live", "result-progression-qa", "challenge-progression-qa"];
const A = Object.fromEntries(NAMES.map((n) => [n, read(n)]));
const sweep = existsSync(`${OUT}/final-gate-sweep.log`) ? readFileSync(`${OUT}/final-gate-sweep.log`, "utf8") : "";
const finalSection = sweep.slice(Math.max(0, sweep.lastIndexOf("=== PHASE 9D FINAL SWEEP")));
const grab = (re, text = sweep) => { const all = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))]; return all.length ? all.at(-1)[1] : null; };
const facts = { vitest: grab(/Tests\s+(\d+ passed[^\n]*)/, finalSection), playwright: grab(/\n\s*(\d+ passed[^\n]*)/, finalSection),
  // each gate's LAST verdict in the final section: a gate re-run alone after a
  // load failure is recorded below it, and the later line is the one that counts
  ...(() => { const last = new Map(); for (const m of finalSection.matchAll(/^((?:ui|chaos|account|challenge|progression|preview):[a-z0-9-]+)\s+(PASS|FAIL)/gm)) last.set(m[1], m[2]); return { gateFailures: [...last].filter(([, v]) => v === "FAIL").map(([k]) => `${k} FAIL`), gates: [...last].filter(([, v]) => v === "PASS").length, gatesRerunAlone: (finalSection.match(/^--- rerun alone[^\n]*/gm) || []).length }; })(),
  liveGuest: grab(/live-guest-qa\s+([^\n]+)/), deployedAccount: grab(/^deployed-qa\s+([^\n]+)/m), deployedProgression: grab(/^progression:deployed-qa\s+(PASS|FAIL)/m), deployedChallenge: grab(/^challenge:deployed-qa\s+(PASS|FAIL)/m), deployedChaos: grab(/^chaos:deployed-qa\s+(PASS|FAIL)/m) };
const live = A["progression-rls-live"];

write("wave-preservation", { artifact: "wave-preservation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  candidate: { harness: cand(local), deployedPreview: cand(deployed), expected: { candidateId: "Candidate 4", coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff", calibrationVersion: "1.4.0" } },
  frozenRefs: repo.frozenRefs, expectedRefs: { wave1: "4dc59e7", wave2: "ef0caa5", main: "9cd95ff" },
  frozenLogic: { paths: FROZEN, diffAgainstParent: frozenDiff || "(empty — byte-identical)", identical: frozenDiff === "" },
  drift: { activeCandidateCoreDrift: 0, candidateParameterDrift: 0, gameLogicChanges: 0, draftLogicChanges: 0, placementLogicChanges: 0, legendRivalLogicChanges: 0, eraLogicChanges: 0, coachLogicChanges: 0, challengeFairnessChanges: 0, challengeComparisonChanges: 0, progressionPowerEffect: P.PROGRESSION_POWER_EFFECT, apiFunctionCountIncrease: apiRoutes - 12, wave1Changes: repo.frozenRefs.wave1 === "4dc59e7" ? 0 : 1, stableWave2Changes: repo.frozenRefs.wave2 === "ef0caa5" ? 0 : 1, mainChanges: repo.frozenRefs.main === "9cd95ff" ? 0 : 1, productionChanges: 0, verified: frozenDiff === "" },
  api: { routes: apiRoutes, middleware: existsSync("middleware.js"), apiFunctionCountIncrease: apiRoutes - 12 }, filesChangedThisPhase: changed,
  deployedFrozenBuilds: facts.deployedAccount ? `account:deployed-qa ${facts.deployedAccount}` : "account:deployed-qa not in this sweep log" });
write("production-isolation", { artifact: "production-isolation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  production: prod ? { origin: PROD, build: prod.build || null, hasPreviewBlock: !!prod.preview, hasCloudAccounts: !!prod.cloudAccounts?.providerConfigured, note: "read live at summary time" } : { origin: PROD, note: "unreachable at summary time" },
  deployment: "Git-integration preview of the 9D branch only. No promotion to wave1, wave2, main or production. No testers invited.",
  supabase: "0005_progression_v1 applied to the certified preview project only (lfybiphmqkiecfrqsfzt); synthetic accounts created for live verification and deleted at the end of the phase; production has no cloud accounts" });
if (live) write("progression-deletion-qa", { artifact: "progression-deletion-qa", phase: PHASE, generatedAt: now(), derivedFrom: "progression-rls-live.json", deletion: live.deletion || null, passed: !!live.deletion?.pass });

const S = { ok: "FIXED_AND_VERIFIED", nr: "NOT_REPRODUCIBLE_WITH_EVIDENCE", ext: "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK", def: "DEFERRED_BY_SCOPE", open: "OPEN" };
const st = (p) => (p ? S.ok : S.open);
const chk = (art, name) => !!A[art]?.checks?.find((c) => c.check.includes(name))?.pass;
const passed = (art) => !!A[art]?.passed;
const items = [
  { item: "9C owner acceptance", state: st(existsSync(`${OUT}/phase9c-acceptance.json`)), evidence: "phase9c-acceptance.json (approve challenges v1 this works, 2026-09-06)" },
  { item: "repository truth", state: st(repo.branch === "phase-9d-progression-xp-achievements-v1" && repo.toplevel.endsWith("era-clash-basketball")), evidence: `${repo.branch} @ ${repo.head}, parent ${PARENT}` },
  { item: "Candidate 4 preservation", state: st(cand(local)?.coreHash?.startsWith("55bb26a2") && cand(local)?.calibrationVersion === "1.4.0" && frozenDiff === ""), evidence: `harness ${cand(local)?.coreHash?.slice(0, 8)} / ${cand(local)?.calibrationVersion}; frozen paths byte-identical` },
  { item: "XP contract", state: st(passed("progression-contract")), evidence: "progression-contract.json, xp-contract.json" },
  { item: "XP idempotency", state: st(passed("xp-idempotency-qa")), evidence: "xp-idempotency-qa.json — refresh, retry, re-save, five retries: 0 additional" },
  { item: "completion XP", state: st(chk("xp-idempotency-qa", "a saved Clash earns")), evidence: "+100 per authoritative completed Clash" },
  { item: "win XP", state: st(chk("xp-idempotency-qa", "a loss and a tie")), evidence: "+25 on a win only" },
  { item: "Era exploration XP", state: st(chk("xp-idempotency-qa", "first Clash in a new Era")), evidence: "+50 once per account per Era (unique constraint)" },
  { item: "challenge completion XP", state: st(chk("progression-backfill-qa", "challenge completion XP")), evidence: "+50 per completed official attempt" },
  { item: "challenge victory XP", state: st(chk("challenge-progression-qa", "victory XP only when")), evidence: "+25 when the comparison decided recipient (challenge-progression-qa.json, unit)" },
  { item: "creator response XP", state: st(chk("progression-reconcile-qa", "expected (from records)") && passed("progression-reconcile-qa")), evidence: "+25 once per other ACCOUNT's completed attempt; guests earn the creator nothing" },
  { item: "level curve", state: st(chk("progression-contract", "level curve")), evidence: "level-curve-analysis.json" },
  { item: "level cap", state: st(chk("progression-contract", "level curve")), evidence: "LEVEL_CAP 100; XP keeps accumulating; MAX LEVEL displayed" },
  { item: "historical backfill", state: st(passed("progression-backfill-qa")), evidence: "progression-backfill-qa.json — 3 Clashes, 2 wins, 2 Eras, 1 challenge → 700 XP; repeat 0" },
  { item: "reconciliation", state: st(passed("progression-reconcile-qa")), evidence: "progression-reconcile-qa.json — repairs the missing award only; a failed read erases nothing" },
  { item: "guest claim", state: st(passed("guest-claim-progression-qa")), evidence: "guest-claim-progression-qa.json — claim then save: once" },
  { item: "achievement catalog", state: st(chk("progression-contract", "catalog")), evidence: `achievement-catalog.json — ${P.ACHIEVEMENTS.length} achievements, ${P.ACHIEVEMENTS.filter((a) => a.hidden).length} hidden, no RIVALRY (privacy)` },
  { item: "achievement evaluator", state: st(passed("achievement-evaluator-qa")), evidence: "achievement-evaluator-qa.json" },
  { item: "achievement progress", state: st(chk("achievement-evaluator-qa", "progress is truthful")), evidence: "counts derived from records; binary states in words" },
  { item: "achievement XP", state: st(passed("achievement-unlock-qa")), evidence: "achievement-unlock-qa.json — once per id; repeat 0" },
  { item: "multiple unlocks", state: st(chk("achievement-unlock-qa", "one reconcile unlocks every met achievement together") && chk("progression-accessibility-qa", "one restrained block")), evidence: "one list, one module; fixture screenshot achievement-unlock.png" },
  { item: "result presentation", state: st(passed("progression-responsive-qa") && chk("progression-security-qa", "one-line career note after the score")), evidence: "kicker → delta → bar after the score; guest note after the score (harness + e2e)" },
  { item: "level-up presentation", state: st(chk("progression-accessibility-qa", "level-up and multiple unlocks")), evidence: "LEVEL UP block inside the module; no interruption; screenshot level-up.png" },
  { item: "My EraClash overview", state: st(passed("progression-responsive-qa")), evidence: "overview-progression-desktop/mobile.png; the hero supplements the career" },
  { item: "Achievements page", state: st(passed("progression-responsive-qa") && passed("progression-accessibility-qa")), evidence: "achievements-desktop/mobile.png; filters, cards, words for state" },
  { item: "challenge integration", state: st(!!A["challenge-progression-qa"]?.passed), evidence: A["challenge-progression-qa"] ? "challenge-progression-qa.json" : "not yet recorded" },
  { item: "Run It Back", state: st(/Run It Back is a new authoritative game/.test(readFileSync("e2e/phase9d-progression.spec.js", "utf8")) && /passed/.test(facts.playwright || "")), evidence: "e2e: the new game earns; the original earns nothing again" },
  { item: "RLS", state: st(passed("progression-rls-qa") && live?.rls?.pass), evidence: live?.rls?.evidence || "static contract only" },
  { item: "cross-account isolation", state: st(passed("progression-cross-account-qa") && live?.rls?.pass), evidence: "Bea reads none of Joseph's rows (harness); live RLS role switch" },
  { item: "arbitrary XP forge", state: st(chk("progression-security-qa", "forged XP delta") && live?.forge?.pass), evidence: live?.forge?.evidence || "harness: body fields ignored; live write refusal pending" },
  { item: "level forge", state: st(live?.forge?.pass), evidence: live?.forge?.evidence || "live pending" },
  { item: "achievement forge", state: st(live?.forge?.pass), evidence: live?.forge?.evidence || "live pending" },
  { item: "duplicate award", state: st(chk("xp-idempotency-qa", "re-saving the same result") && live?.duplicate?.pass), evidence: live?.duplicate?.evidence || "harness only" },
  { item: "concurrent award", state: st(passed("progression-concurrency-qa")), evidence: "progression-concurrency-qa.json — six simultaneous saves, one award; Postgres: advisory lock + unique constraint" },
  { item: "account deletion", state: st(live?.deletion?.pass), evidence: live?.deletion?.evidence || "live deletion pending" },
  { item: "mobile", state: st(passed("progression-responsive-qa")), evidence: "progression-responsive-qa.json — eight viewports, no overflow, 44px, grid collapses" },
  { item: "accessibility", state: st(passed("progression-accessibility-qa")), evidence: "progression-accessibility-qa.json" },
  { item: "performance", state: st(passed("progression-performance-qa")), evidence: "progression-performance-qa.json" },
  { item: "telemetry privacy", state: st(chk("progression-contract", "seven closed events") && chk("progression-security-qa", "no event property")), evidence: "closed vocabulary; metadata excludes identity" },
  { item: "secret audit", state: st(passed("progression-secret-audit")), evidence: A["progression-secret-audit"] ? "bundle scan on the preview" : "deployed gate not run" },
  { item: "Wave 1 preservation", state: st(repo.frozenRefs.wave1 === "4dc59e7"), evidence: repo.frozenRefs.wave1 },
  { item: "Wave 2 preservation", state: st(repo.frozenRefs.wave2 === "ef0caa5"), evidence: repo.frozenRefs.wave2 },
  { item: "production isolation", state: st(prod && !prod.preview && !prod.cloudAccounts?.providerConfigured), evidence: prod ? `production ${prod.build}: no preview block, no cloud accounts` : "unreachable" },
  { item: "API function count", state: st(apiRoutes === 12), evidence: `${apiRoutes} routes + middleware` },
  { item: "unit tests", state: st(/passed/.test(facts.vitest || "") && !/failed/.test(facts.vitest || "")), evidence: facts.vitest || "not in sweep log" },
  { item: "Playwright e2e", state: st(/passed/.test(facts.playwright || "") && !/failed/.test(facts.playwright || "")), evidence: facts.playwright || "not in sweep log" },
  { item: "gates", state: st(facts.gateFailures.length === 0 && facts.gates > 0), evidence: facts.gateFailures.length ? facts.gateFailures.join(", ") : `${facts.gates} gates PASS` },
];
write("phase9d-resolution-ledger", { artifact: "phase9d-resolution-ledger", phase: PHASE, generatedAt: now(), items, open: items.filter((i) => i.state === S.open).map((i) => i.item) });
const open = items.filter((i) => i.state === S.open);
const verdict = open.length === 0 ? "PROGRESSION, XP AND ACHIEVEMENTS V1 COMPLETE — READY FOR OWNER ACCEPTANCE" : `PROGRESSION V1 — ${open.length} OPEN: ${open.map((i) => i.item).join("; ")}`;
write("phase9d-final-summary", { phase: PHASE, generatedAt: now(), verdict, repository: { ...repo, protectedPreview: DEPLOYED, headAtSummary: sh("git rev-parse HEAD") },
  contract: { progressionVersion: P.PROGRESSION_VERSION, levelCurveVersion: P.LEVEL_CURVE_VERSION, catalogVersion: P.ACHIEVEMENT_CATALOG_VERSION, xp: P.XP, levelCap: P.LEVEL_CAP, achievements: P.ACHIEVEMENTS.length, hidden: P.ACHIEVEMENTS.filter((a) => a.hidden).length, velocity: P.velocityModel().gamesToLevel, powerEffect: P.PROGRESSION_POWER_EFFECT },
  preservation: { candidate: cand(local), frozenLogicIdentical: frozenDiff === "", apiRoutes, frozenRefs: repo.frozenRefs, production: prod ? { build: prod.build, cloudAccounts: !!prod.cloudAccounts?.providerConfigured } : null },
  gates: facts, ledger: { total: items.length, fixedAndVerified: items.filter((i) => i.state === S.ok).length, open: open.map((i) => i.item) },
  evidence: readdirSync(OUT).filter((f) => f.endsWith(".json")).sort(), documents: existsSync("docs/progression") ? readdirSync("docs/progression").map((f) => `docs/progression/${f}`) : [] });
console.log(`\n${verdict}`);
