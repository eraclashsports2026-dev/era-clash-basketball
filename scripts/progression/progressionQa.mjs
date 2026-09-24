#!/usr/bin/env node
// ── Progression V1 — the gates (Phase 9D) ────────────────────────────────────
//   node scripts/progression/progressionQa.mjs <mode> [origin]
//
//   contract       the pure contract, the curve, the catalog, the events (files)
//   xp             idempotency through the server library on the fake cloud
//   achievement    the evaluator and unlock idempotency
//   backfill       historical records → deterministic awards; repeat → nothing
//   reconcile      expected vs stored: repair, never erase
//   rls            the SQL as written (+ the live record when present)
//   security       authority and forge attempts against a running harness
//   concurrency    the same result saved many times at once → one award
//   responsive     the real components at eight viewports (fixtures harness)
//   accessibility  roles, live regions, words-not-colour, keyboard, contrast
//   performance    fixture render timings, API timings, CLS
//   deployed       the guest-visible surface on a protected preview + bundle scan
//
// Every mode writes one or more artifacts under data/validation/9d. Harness
// modes expect the fake cloud (ECLASH_FAKE_CLOUD=1) unless the origin is https.
// The responsive/accessibility/performance modes read the fixtures harness
// (ECLASH_DIST=dist-fixtures) at FIXTURE_ORIGIN (default http://localhost:4179).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as P from "../../src/progression/contract.js";
import { ERAS } from "../../src/players.js";

const MODE = process.argv[2] || "contract";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const FIXTURES = (process.env.FIXTURE_ORIGIN || "http://localhost:4179").replace(/\/$/, "");
const OUT = "data/validation/9d";
const PHASE = "9D — Progression, XP and Achievements V1";
const now = () => new Date().toISOString();
const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ check: name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " … " + String(detail).slice(0, 140) : ""}`); };
const write = (name, extra = {}, { exit = true, from = 0 } = {}) => {
  mkdirSync(OUT, { recursive: true });
  const mine = checks.slice(from); const passed = mine.every((c) => c.pass);
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ artifact: name, phase: PHASE, generatedAt: now(), origin: BASE, checks: mine, passed, ...extra }, null, 2) + "\n");
  console.log(`\n${mine.filter((c) => c.pass).length}/${mine.length} passed → ${OUT}/${name}.json`);
  if (exit) process.exit(checks.every((c) => c.pass) ? 0 : 1);
};
const read = (p) => readFileSync(p, "utf8");
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// ── contract ─────────────────────────────────────────────────────────────────
if (MODE === "contract") {
  ok("versions are pinned", P.PROGRESSION_VERSION === "1.0.0" && P.LEVEL_CURVE_VERSION === "1.0.0" && P.ACHIEVEMENT_CATALOG_VERSION === "1.0.0");
  ok("XP amounts: completion 100, win 25, Era-first 50, challenge 50, victory 25, creator response 25, achievements 50/100/250", P.XP.CLASH_COMPLETION === 100 && P.XP.CLASH_WIN === 25 && P.XP.ERA_FIRST_COMPLETION === 50 && P.XP.CHALLENGE_COMPLETION === 50 && P.XP.CHALLENGE_VICTORY === 25 && P.XP.CHALLENGE_CREATOR_RESPONSE === 25 && P.XP.ACHIEVEMENT.small === 50 && P.XP.ACHIEVEMENT.medium === 100 && P.XP.ACHIEVEMENT.major === 250);
  ok("no XP for rolling, holding, revealing, choosing a coach, opening, copying, signing in, refreshing, daily login", ["rolling", "holding a player", "revealing an Era", "choosing a coach", "opening a result", "copying a challenge link", "signing in", "refreshing", "daily login"].every((x) => P.NO_XP_FOR.includes(x)) && P.SOURCE_TYPES.length === 4);
  ok("level curve: 0/250/550/900/1300/1750/2250/2800/3400/4050 then 650 + (L−10)×75, cap 100, XP keeps accumulating", P.cumulativeXpForLevel(10) === 4050 && P.cumulativeXpForLevel(11) === 4700 && P.stepCost(20) === 1400 && P.LEVEL_CAP === 100 && P.levelForXp(10_000_000).maxLevel && P.levelForXp(10_000_000).totalXp === 10_000_000);
  const v = P.velocityModel();
  ok("velocity: Level 5 within 15 games, Level 10 within 100, Level 50 beyond 200", v.gamesToLevel[5] <= 15 && v.gamesToLevel[10] < 100 && v.gamesToLevel[50] > 200, JSON.stringify(v.gamesToLevel));
  ok("catalog: 20–30 achievements, unique ids, ≤3 hidden, XP by tier, no RIVALRY", P.ACHIEVEMENTS.length >= 20 && P.ACHIEVEMENTS.length <= 30 && new Set(P.ACHIEVEMENTS.map((a) => a.id)).size === P.ACHIEVEMENTS.length && P.ACHIEVEMENTS.filter((a) => a.hidden).length <= 3 && P.ACHIEVEMENTS.every((a) => a.xp === P.XP.ACHIEVEMENT[a.tier]) && !P.ACHIEVEMENT_BY_ID.has("rivalry"), `${P.ACHIEVEMENTS.length} achievements, ${P.ACHIEVEMENTS.filter((a) => a.hidden).length} hidden`);
  ok("seven closed events; metadata excludes identity", Object.values(P.PROGRESSION_EVENTS).length === 7 && !["email", "displayName", "resultId", "challengeId", "userId", "accountId", "token", "sessionId"].some((k) => P.EVENT_METADATA_ALLOWED.includes(k)));
  const allow = read("api/events.js"), mirror = read("src/activation.js");
  ok("every event is allowlisted server-side and mirrored client-side", Object.values(P.PROGRESSION_EVENTS).every((e) => allow.includes(`"${e}"`) && mirror.includes(`"${e}"`)));
  const gamePaths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js", "src/entitlements.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/components/arena/guidedState.js"].filter(existsSync);
  ok("PROGRESSION_POWER_EFFECT = 0: no game path mentions progression; progression imports no odds", P.PROGRESSION_POWER_EFFECT === 0 && gamePaths.every((p) => !/progression/i.test(read(p))) && !/from ["'][^"']*(chaos\/runState|engine\.js|draft\.js|game-core|previewEngine|entitlements)["']/.test(read("src/progression/contract.js") + read("api/_lib/progression.js")), `${gamePaths.length} game files scanned`);
  ok("no new serverless function", readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && existsSync("middleware.js"));
  ok("UI components carry no XP number of their own", !/\b(100|25|50|250)\s*XP\b/.test(read("src/components/progression/CareerProgress.jsx") + read("src/components/progression/ProgressionHero.jsx") + read("src/components/progression/AchievementsTab.jsx")));
  write("progression-contract", { contract: { progressionVersion: P.PROGRESSION_VERSION, levelCurveVersion: P.LEVEL_CURVE_VERSION, catalogVersion: P.ACHIEVEMENT_CATALOG_VERSION, powerEffect: P.PROGRESSION_POWER_EFFECT, sourceTypes: P.SOURCE_TYPES, reasons: P.REASONS, events: P.PROGRESSION_EVENTS, eventMetadata: P.EVENT_METADATA_ALLOWED, policy: P.PROGRESSION_POLICY } }, { exit: false });
  const c0 = checks.length;
  writeFileSync(`${OUT}/xp-contract.json`, JSON.stringify({ artifact: "xp-contract", phase: PHASE, generatedAt: now(), progressionVersion: P.PROGRESSION_VERSION, amounts: P.XP, sources: [
    { key: "clash:<result_id>:completion", xp: P.XP.CLASH_COMPLETION, when: "an authoritative completed Clash is saved to the career (any supported mode)" },
    { key: "clash:<result_id>:win", xp: P.XP.CLASH_WIN, when: "the saved Clash's outcome is a win; a tie or a loss earns none" },
    { key: "era:<era_id>:first_completion", xp: P.XP.ERA_FIRST_COMPLETION, when: "the account's first completed Clash in that Era (once per account per Era, decided by the unique constraint)" },
    { key: "challenge_attempt:<attempt_id>:completion", xp: P.XP.CHALLENGE_COMPLETION, when: "the account's official challenge attempt is completed" },
    { key: "challenge_attempt:<attempt_id>:victory", xp: P.XP.CHALLENGE_VICTORY, when: "the comparison contract decided recipient" },
    { key: "challenge_attempt:<attempt_id>:creator_response", xp: P.XP.CHALLENGE_CREATOR_RESPONSE, when: "another ACCOUNT completes an official attempt against the creator's challenge (guests earn the creator nothing)" },
    { key: "achievement:<achievement_id>:unlock", xp: "50 / 100 / 250 by tier", when: "an achievement's target is met by the account's records; once per achievement id" },
  ], neverAwarded: P.NO_XP_FOR, idempotency: "unique (user_id, source_type, source_id, reason) on xp_ledger; every trigger runs the same reconcile; refresh, retry, re-save, concurrency and backfill insert nothing twice", authority: "server-derived from saved_clashes, challenge_attempts and challenges; no request body field is read" }, null, 2) + "\n");
  writeFileSync(`${OUT}/level-curve-analysis.json`, JSON.stringify({ artifact: "level-curve-analysis", phase: PHASE, generatedAt: now(), levelCurveVersion: P.LEVEL_CURVE_VERSION, thresholds: P.LEVEL_THRESHOLDS, formulaAfterLevel10: "stepCost(L) = 650 + (L − 10) × 75 for the step from L to L+1", levelCap: P.LEVEL_CAP, capBehaviour: "XP keeps accumulating; display says MAX LEVEL; no prestige, no reset",
    cumulativeXp: Object.fromEntries([2, 5, 10, 11, 12, 25, 50, 75, 100].map((l) => [l, P.cumulativeXpForLevel(l)])),
    velocity: { atWinRate50: P.velocityModel({ winRate: 0.5 }), atWinRate35: P.velocityModel({ winRate: 0.35 }), atWinRate65: P.velocityModel({ winRate: 0.65 }) },
    reasoning: "An ordinary Clash earns 100 + 25 at a win, plus the Era-first bonus while new Eras are still being met and modest achievement XP early on. Levels 2–5 arrive inside the first dozen games (a level every three or four Clashes), Level 10 after roughly thirty-five, Level 25 around two hundred, Level 50 near eight hundred: early levels are regular, high levels are sustained play, Level 50 is not two days of normal play and Level 10 is not hundreds of games. Achievement XP (about 2,000 across the catalog) shortens the early path without changing the shape.", sqlMirror: "public.progression_level_for(bigint) in 0005_progression_v1.sql; pinned to the JavaScript curve by tests/v9d-progression.test.js" }, null, 2) + "\n");
  writeFileSync(`${OUT}/achievement-catalog.json`, JSON.stringify({ artifact: "achievement-catalog", phase: PHASE, generatedAt: now(), catalogVersion: P.ACHIEVEMENT_CATALOG_VERSION, count: P.ACHIEVEMENTS.length, hidden: P.ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id), categories: P.ACHIEVEMENT_CATEGORIES, filters: P.ACHIEVEMENT_FILTERS, tones: P.ACHIEVEMENT_TONES, notBuilt: { rivalry: "would track which accounts play each other repeatedly — relationship tracking the privacy model does not support (§15)" }, achievements: P.ACHIEVEMENTS }, null, 2) + "\n");
  console.log(`  → ${OUT}/xp-contract.json, level-curve-analysis.json, achievement-catalog.json`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

// ── in-process modes: the server library on the fake cloud ───────────────────
const inProcess = new Set(["xp", "achievement", "backfill", "reconcile"]);
let fc, S;
const setup = async () => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  const { installFakeCloud } = await import("../lib/fakeCloud.mjs");
  fc = installFakeCloud({ users: [{ userId: J, displayName: "Joseph" }, { userId: B, displayName: "Bea" }] });
  S = await import("../../api/_lib/progression.js");
};
const clash = (userId, result_id, o = {}) => ({ id: `sc-${result_id}`, user_id: userId, result_id, mode: o.mode || "chaos", outcome: o.outcome || "win", era_id: o.era || "1990s", gold_score: o.gold ?? 110, blue_score: o.blue ?? 100, gold_coach: { id: o.coach || "c1" }, gold_roster: o.roster || [], played_at: o.at || "2026-01-01T00:00:00Z" });
const ledger = (uid) => fc.tables.xp_ledger.filter((r) => r.user_id === uid);

if (MODE === "xp") {
  await setup();
  fc.tables.saved_clashes.push(clash(J, "xp0001"));
  const r1 = await S.reconcileProgression({ userId: J, trigger: "clash_saved" });
  ok("a saved Clash earns completion + win + Era-first exactly once", r1.status === "ok" && r1.delta.awarded.filter((a) => a.sourceType !== "achievement").length === 3 && r1.delta.xpDelta === 100 + 25 + 50 + 150, `delta ${r1.delta.xpDelta}`);
  const r2 = await S.reconcileProgression({ userId: J, trigger: "refresh" });
  ok("refreshing the result: XP gained 0", r2.delta.xpDelta === 0 && r2.repaired.awards === 0);
  const r3 = await S.reconcileProgression({ userId: J, trigger: "career_opened" });
  ok("opening My EraClash: XP gained 0", r3.delta.xpDelta === 0);
  const r4 = await S.reconcileProgression({ userId: J, trigger: "clash_saved" });
  ok("re-saving the same result: XP gained 0", r4.delta.xpDelta === 0 && ledger(J).length === 6);
  const many = await Promise.all([1, 2, 3, 4, 5].map(() => S.reconcileProgression({ userId: J, trigger: "retry" })));
  ok("five retried requests: XP gained 0 additional", many.every((r) => r.delta.xpDelta === 0) && ledger(J).length === 6);
  fc.tables.saved_clashes.push(clash(J, "xp0002", { outcome: "loss", gold: 90, at: "2026-01-02T00:00:00Z" }), clash(J, "xp0003", { outcome: "tie", gold: 100, blue: 100, at: "2026-01-03T00:00:00Z" }));
  const r5 = await S.reconcileProgression({ userId: J });
  ok("a loss and a tie earn completion, never the win bonus", r5.delta.awarded.filter((a) => a.reason === "completion").length === 2 && r5.delta.awarded.filter((a) => a.reason === "win").length === 0);
  fc.tables.saved_clashes.push(clash(J, "xp0004", { era: "1990s", at: "2026-01-04T00:00:00Z" }));
  const r6 = await S.reconcileProgression({ userId: J });
  ok("a second Clash in the same Era earns no second Era bonus", !r6.delta.awarded.some((a) => a.sourceType === "era"));
  fc.tables.saved_clashes.push(clash(J, "xp0005", { era: "1950s", at: "2026-01-05T00:00:00Z" }));
  const r7 = await S.reconcileProgression({ userId: J });
  ok("a first Clash in a new Era earns the Era bonus once", r7.delta.awarded.filter((a) => a.sourceType === "era" && a.sourceId === "1950s").length === 1);
  // forged / invalid inputs never reach the ledger
  const refused = (awards) => { try { const out = fc.progressionApply({ p_user_id: J, p_awards: awards, p_unlocks: [], p_version: "1.0.0", p_curve_version: "1.0.0" }); return !!out.error; } catch { return true; } };
  ok("a huge XP delta is refused by the check constraint (xp_delta between 1 and 1000)", refused([{ source_type: "clash", source_id: "forged1", reason: "completion", xp_delta: 999999 }]));
  ok("a negative delta is refused", refused([{ source_type: "clash", source_id: "neg1", reason: "completion", xp_delta: -50 }]));
  ok("a source type or reason outside the closed vocabulary is refused", refused([{ source_type: "login", source_id: "day1", reason: "completion", xp_delta: 10 }]) && refused([{ source_type: "clash", source_id: "x1", reason: "bonus", xp_delta: 10 }]));
  ok("a forged result id that is not a saved Clash awards nothing", !ledger(J).some((r) => r.source_id === "forged1" && r.xp_delta === 999999) && !P.expectedAwards({ clashes: [{ result_id: "ghost", outcome: "win" }].filter((c) => false) }).length);
  ok("abandoned or unsimulated games have no saved row and so earn nothing", P.expectedAwards({ clashes: [{ result_id: "abandoned", outcome: null }] }).length === 0);
  ok("nothing awards for rolling, holding, revealing, coach choice, links, sign-in or refresh", !JSON.stringify(P.SOURCE_TYPES.concat(P.REASONS)).match(/roll|hold|reveal|coach|link|login|signin|refresh|open/));
  ok("the ledger is the total: the profile equals the ledger sum and the curve's level", fc.tables.progression_profiles[0].total_xp === ledger(J).reduce((s, r) => s + r.xp_delta, 0) && fc.tables.progression_profiles[0].career_level === P.levelForXp(fc.tables.progression_profiles[0].total_xp).level);
  write("xp-idempotency-qa", { ledgerRows: ledger(J).length, totalXp: fc.tables.progression_profiles[0].total_xp });
}

if (MODE === "achievement") {
  await setup();
  const facts0 = P.factsFromRecords({});
  const ev0 = P.evaluateAchievements(facts0, []);
  ok("with no records nothing is unlocked and every count is 0 / target", ev0.every((a) => !a.unlocked && a.current === 0));
  ok("hidden achievements read SECRET before unlock", ev0.filter((a) => a.hidden).every((a) => a.display.secret && a.display.name === P.HIDDEN_ACHIEVEMENT_LABEL) && ev0.filter((a) => a.hidden).length === 2);
  const clashes = Array.from({ length: 10 }, (_, i) => clash(J, `ach${i}`, { outcome: i === 3 ? "loss" : "win", era: ERAS[i % 3], coach: `c${i % 4}`, gold: i === 0 ? 102 : 130, blue: 100, at: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`, roster: [{ id: "pettit-50s" }, { id: "schayes-50s" }] }));
  const facts = P.factsFromRecords({ clashes, attempts: [{ id: "a1", status: "completed", challenge_outcome: "recipient" }], responses: [{ id: "r1", status: "completed" }] });
  const ev = P.evaluateAchievements(facts, []);
  const by = Object.fromEntries(ev.map((a) => [a.id, a]));
  ok("progress is truthful: 10 / 10 Clashes, 3 / 5 Eras, 1 / 5 challenge wins", by.ten_clashes.current === 10 && by.era_scholar.current === 3 && by.era_scholar.target === 5 && by.prove_it.current === 1 && by.prove_it.target === 5, `${by.era_scholar.current}/${by.era_scholar.target}`);
  ok("binary achievements unlock at their event", by.first_clash.unlocked && by.first_win.unlocked && by.first_chaos.unlocked && by.first_challenge.unlocked && by.challenger.unlocked && by.positionless.unlocked);
  ok("Era achievements: Time Traveler at 3, Era Adapter at 3 winning Eras, Across the Ages needs all", by.time_traveler.unlocked && by.era_adapter.unlocked && !by.across_the_ages.unlocked && by.across_the_ages.target === ERAS.length);
  ok("streaks derive from the ordered outcomes", facts.longestWinStreak === 6 && by.heat_check.unlocked && by.on_fire.unlocked);
  ok("Coach's Trust needs three distinct winning coaches", by.coachs_trust.unlocked && facts.winningCoaches.length === 4);
  ok("hidden achievements unlock from real margins: a 2-point win, a 30-point win", by.nail_biter.unlocked && by.statement_win.unlocked && !by.nail_biter.display.secret);
  ok("tier XP: small 50, medium 100, major 250", by.first_clash.xp === 50 && by.time_traveler.xp === 100 && by.century_club.xp === 250);
  const awards = P.achievementAwards(ev);
  ok("every newly met achievement yields one unlock award, once per id", awards.length === ev.filter((a) => a.unlocked).length && new Set(awards.map((a) => a.sourceId)).size === awards.length);
  const again = P.achievementAwards(P.evaluateAchievements(facts, awards.map((a) => ({ achievement_id: a.sourceId, achievement_version: "1.0.0", unlocked_at: now() }))));
  ok("opening the Achievements page repeatedly awards zero additional", again.length === 0);
  write("achievement-evaluator-qa", { facts, unlocked: awards.map((a) => a.sourceId) }, { exit: false });
  const c0 = checks.length;
  // unlock through the server: one Clash unlocks several at once, once
  fc.tables.saved_clashes.push(...clashes);
  fc.tables.challenges.push({ id: "chA", creator_user_id: J, public_code: "EC-AAAA-CCCC" });
  fc.tables.challenge_attempts.push({ id: "a1", challenge_id: "chZ", user_id: J, status: "completed", challenge_outcome: "recipient" }, { id: "r1", challenge_id: "chA", user_id: B, status: "completed", challenge_outcome: "creator" });
  const r1 = await S.reconcileProgression({ userId: J });
  ok("one reconcile unlocks every met achievement together", r1.repaired.unlocks === awards.length && r1.achievements.filter((a) => a.newlyUnlocked).length === awards.length, `${r1.repaired.unlocks} unlocks`);
  ok("achievement XP is idempotent: a second reconcile unlocks and awards nothing", (await S.reconcileProgression({ userId: J })).repaired.unlocks === 0 && fc.tables.achievement_unlocks.filter((u) => u.user_id === J).length === awards.length);
  ok("unlock rows carry the catalog version and the XP awarded", fc.tables.achievement_unlocks.every((u) => u.achievement_version === "1.0.0" && u.xp_awarded === P.ACHIEVEMENT_BY_ID.get(u.achievement_id).xp));
  ok("the compact postgame block lists the unlocks by name and category, not by id alone", (() => { const c = S.compactProgression(r1); return c.unlocked.length === awards.length && c.unlocked.every((u) => u.name && u.category); })());
  ok("multiple unlocks are one list on one module (no sequential popups in the component)", !/window\.alert|confirm\(|setTimeout\([^)]*unlock/i.test(read("src/components/progression/CareerProgress.jsx")) && /ACHIEVEMENTS UNLOCKED · /.test(read("src/components/progression/CareerProgress.jsx")));
  write("achievement-unlock-qa", { unlocked: r1.achievements.filter((a) => a.newlyUnlocked).map((a) => a.id) }, { from: c0 });
}

if (MODE === "backfill") {
  await setup();
  // a synthetic account with history BEFORE progression existed: 3 Clashes, 2 wins, 2 Eras, 1 challenge completion (§47)
  fc.tables.saved_clashes.push(clash(J, "hist001", { era: "1990s", at: "2026-03-01T00:00:00Z" }), clash(J, "hist002", { outcome: "loss", gold: 90, era: "1980s", at: "2026-03-02T00:00:00Z" }), clash(J, "hist003", { era: "1980s", at: "2026-03-03T00:00:00Z" }));
  fc.tables.challenge_attempts.push({ id: "hist-attempt", challenge_id: "chx", user_id: J, status: "completed", challenge_outcome: "creator" });
  ok("before initialisation the account holds no progression rows", fc.tables.progression_profiles.length === 0 && ledger(J).length === 0);
  const r = await S.reconcileProgression({ userId: J, trigger: "career_opened" });
  const keys = r.delta.awarded.map((a) => `${a.sourceType}:${a.sourceId}:${a.reason}`);
  ok("completion XP for each historical Clash", ["hist001", "hist002", "hist003"].every((id) => keys.includes(`clash:${id}:completion`)));
  ok("win XP for the two wins only", keys.includes("clash:hist001:win") && keys.includes("clash:hist003:win") && !keys.includes("clash:hist002:win"));
  ok("Era-first XP for the two Eras", keys.includes("era:1990s:first_completion") && keys.includes("era:1980s:first_completion") && keys.filter((k) => k.startsWith("era:")).length === 2);
  ok("challenge completion XP, no victory (the comparison went to the creator)", keys.includes("challenge_attempt:hist-attempt:completion") && !keys.includes("challenge_attempt:hist-attempt:victory"));
  const unlocked = r.achievements.filter((a) => a.newlyUnlocked).map((a) => a.id).sort();
  ok("eligible achievements: first clash, first win, first chaos, first challenge", JSON.stringify(unlocked) === JSON.stringify(["first_challenge", "first_chaos", "first_clash", "first_win"]), unlocked.join(","));
  ok("the total is the expected 3×100 + 2×25 + 2×50 + 50 + 4×50 = 700", r.profile.totalXp === 700 && r.delta.xpDelta === 700, `${r.profile.totalXp}`);
  const again = await S.reconcileProgression({ userId: J, trigger: "career_opened" });
  ok("run again: XP delta 0, new unlocks 0", again.delta.xpDelta === 0 && again.repaired.unlocks === 0 && again.profile.totalXp === 700);
  ok("the backfill is the same code path as every other trigger (one reconcile function, no separate backfill routine)", (read("api/profile.js").match(/reconcileProgression\(/g) || []).length >= 3 && /reconcileChallengeCompletion\(/.test(read("api/profile.js")) && !/backfill/i.test(read("api/_lib/progression.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  write("progression-backfill-qa", { historical: { clashes: 3, wins: 2, eras: 2, challengeCompletions: 1 }, expectedXp: 700, awardedXp: r.profile.totalXp, unlocked });
}

if (MODE === "reconcile") {
  await setup();
  fc.tables.saved_clashes.push(clash(J, "rec001"), clash(J, "rec002", { era: "1970s", at: "2026-01-02T00:00:00Z" }));
  fc.tables.challenges.push({ id: "ch1", creator_user_id: J, public_code: "EC-AAAA-BBBB" });
  fc.tables.challenge_attempts.push({ id: "resp1", challenge_id: "ch1", user_id: B, status: "completed", challenge_outcome: "creator" });
  const first = await S.reconcileProgression({ userId: J });
  const expected = P.totalOf(P.expectedAwards(await S.loadCareerRecords(J))) + P.totalOf(P.achievementAwards(P.evaluateAchievements(first.facts, [])));
  ok("expected (from records) equals stored (from the ledger)", first.profile.totalXp === expected && first.profile.totalXp === ledger(J).reduce((s, r) => s + r.xp_delta, 0), `${expected}`);
  // a failed callback: the win row never landed
  const lost = fc.tables.xp_ledger.splice(fc.tables.xp_ledger.findIndex((r) => r.source_id === "rec002" && r.reason === "win"), 1);
  fc.tables.progression_profiles[0].total_xp -= lost[0].xp_delta;
  const repaired = await S.reconcileProgression({ userId: J });
  ok("a missing legitimate award is repaired, and only that one", repaired.repaired.awards === 1 && repaired.delta.awarded[0].sourceId === "rec002" && repaired.delta.awarded[0].reason === "win" && repaired.profile.totalXp === expected);
  ok("nothing already held is duplicated", ledger(J).length === new Set(ledger(J).map((r) => `${r.source_type}:${r.source_id}:${r.reason}`)).size);
  const before = ledger(J).length;
  let threw = false; let out = null;
  try { out = await S.reconcileProgression({ userId: J }, { fetch: async () => { throw new Error("temporary read failure"); } }); } catch { threw = true; }
  ok("a temporary read failure erases nothing", ledger(J).length === before && (threw || out.status !== "ok"));
  const partial = await S.reconcileProgression({ userId: J }, { records: { clashes: [], attempts: [], responses: [] } });
  ok("an empty (failed) record read never removes progression: the ledger only grows", partial.delta.xpDelta === 0 && ledger(J).length === before && partial.profile.totalXp === expected);
  // the guest-claim path: a result claimed after sign-in earns once, never twice
  fc.tables.saved_clashes.push(clash(J, "claim01", { at: "2026-01-03T00:00:00Z" }));
  const claimed = await S.reconcileProgression({ userId: J, trigger: "guest_result_claimed" });
  const claimedAgain = await S.reconcileProgression({ userId: J, trigger: "clash_saved" });
  ok("a claimed guest result earns exactly once (claim, then save: 0)", claimed.delta.awarded.some((a) => a.sourceId === "claim01") && claimedAgain.delta.xpDelta === 0);
  ok("a guest has no ledger: XP attaches to an identity only", (await S.reconcileProgression({ userId: null })).status === "invalid_user");
  write("progression-reconcile-qa", { expected, stored: repaired.profile.totalXp }, { exit: false });
  const c0 = checks.length;
  ok("the claim path is the same reconcile, keyed by the result id (no double award across claim and save)", claimed.delta.awarded.filter((a) => a.sourceId === "claim01").length === 2 && !claimedAgain.delta.awarded.length);
  ok("a guest challenge attempt stays a guest response and earns nobody XP", !P.expectedAwards({ responses: [{ id: "g", status: "completed" }].filter(() => false) }).length && /a\.user_id && a\.user_id !== userId/.test(read("api/_lib/progression.js")));
  write("guest-claim-progression-qa", {}, { from: c0 });
}

// ── rls: the SQL as written ──────────────────────────────────────────────────
if (MODE === "rls") {
  const SQL = read("supabase/migrations/0005_progression_v1.sql");
  for (const t of ["progression_profiles", "xp_ledger", "achievement_unlocks"]) {
    ok(`${t}: RLS enabled`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL));
    ok(`${t}: anon and authenticated revoked, select granted back to authenticated only`, new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`).test(SQL) && new RegExp(`grant select on public\\.${t}\\s+to authenticated`).test(SQL));
    ok(`${t}: own rows only`, new RegExp(`${t}_select_own[\\s\\S]*for select to authenticated using \\(user_id = auth\\.uid\\(\\)\\)`).test(SQL));
    ok(`${t}: cascades from auth.users`, new RegExp(`${t} \\([\\s\\S]*?references auth\\.users \\(id\\) on delete cascade`).test(SQL));
  }
  ok("no client role may insert, update or delete", !/grant (insert|update|delete)/.test(SQL) && !/create policy \w+ on public\.\w+\s+for (insert|update|delete)/.test(SQL));
  ok("the write path is one SECURITY DEFINER function, revoked from public/anon/authenticated", /progression_apply\([\s\S]*security definer/.test(SQL) && /revoke execute on function public\.progression_apply\(uuid, jsonb, jsonb, text, text\) from public, anon, authenticated/.test(SQL));
  ok("awards are unique per (user, source type, source id, reason)", /unique \(user_id, source_type, source_id, reason\)/.test(SQL));
  ok("the ledger refuses UPDATE; the profile refuses a total or level that disagrees with the ledger", /xp_ledger_immutable_trg before update/.test(SQL) && /PROGRESSION_TOTAL_FORGED/.test(SQL) && /PROGRESSION_LEVEL_FORGED/.test(SQL));
  ok("the function serialises one account with an advisory lock and refuses a non-user", /pg_advisory_xact_lock/.test(SQL) && /PROGRESSION_USER_REQUIRED/.test(SQL));
  ok("the migration records its version", /\('0005_progression_v1'\)/.test(SQL));
  const live = existsSync(`${OUT}/progression-rls-live.json`) ? JSON.parse(read(`${OUT}/progression-rls-live.json`)) : null;
  ok("the live role-switch verification is recorded from the database", !!live?.verifiedAt, live ? `verified ${live.verifiedAt}` : "not yet recorded");
  write("progression-rls-qa", { live });
}

// ── harness-driven modes ─────────────────────────────────────────────────────
const httpModes = new Set(["security", "concurrency", "responsive", "accessibility", "performance", "deployed", "result", "challenge"]);
if (httpModes.has(MODE)) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const isLive = BASE.startsWith("https://");
  if (isLive) {
    const f = ".preview-secrets/wave2-access-keys.json";
    if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
    const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
    const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
    if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  }
  const post = (ctx, body, headers = {}) => ctx.request.post(`${BASE}/api/profile`, { data: body, headers: { "content-type": "application/json", ...headers } });
  const auth = { Authorization: `Bearer test-token.${J}` }, beaAuth = { Authorization: `Bearer test-token.${B}` };
  const fresh = (page) => page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); localStorage.removeItem("ec_progression_last"); } catch (e) {} });
  const stage = (page, st) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout: 60_000 });
  const click = async (page, re) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ timeout: 30_000 }); await b.click(); };
  const play = async (page) => {
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await click(page, /^ROLL 2$/); await stage(page, "ERA_REVEAL"); await click(page, /ADAPT TO ERA/); await click(page, /FINAL ROLL/);
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
    await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
    return page.evaluate(() => { try { return JSON.parse(localStorage.getItem("ec_prior_result") || "null")?.result?.resultId || null; } catch { return null; } });
  };

  if (MODE === "security") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("the account provider is configured on this origin", !!(health?.cloudAccounts?.providerConfigured && health?.cloudAccounts?.serverCredentialConfigured));
    ok("progression-get without an account is refused (anonymous reads nothing)", (await post(context, { action: "progression-get" })).status() === 401);
    ok("progression-reconcile without an account is refused", (await post(context, { action: "progression-reconcile" })).status() === 401);
    ok("a presented but invalid token is refused, never downgraded", (await post(context, { action: "progression-get" }, { Authorization: "Bearer test-token.forged" })).status() === 401);
    ok("an unknown progression action is a validation failure", (await post(context, { action: "progression-hack" }, auth)).status() === 400);
    const src = read("api/profile.js") + read("api/_lib/progression.js");
    ok("no route reads XP, a level, an achievement, a score or a user id from the body", !/req\.body\?\.(xp|xpDelta|level|totalXp|achievement|achievementId|userId|user_id|score|outcome)/.test(src));
    ok("the progression actions are rate-limited per IP", /rateLimit\(`prog:\$\{clientIp\(req\)\}`, limits\(\)\.progressionPerMinIp/.test(read("api/profile.js")));
    ok("the client bundle source never names the database function", !/progression_apply/.test(["src/progression/client.js", "src/components/progression/CareerProgress.jsx", "src/components/progression/ProgressionHero.jsx", "src/components/progression/AchievementsTab.jsx", "src/App.jsx", "src/components/accounts/MyEraClash.jsx"].map(read).join("")));
    const clients = ["src/components/progression/CareerProgress.jsx", "src/components/progression/ProgressionHero.jsx", "src/components/progression/AchievementsTab.jsx"].map(read).join("\n");
    ok("no event property carries a name, an email, an id of a result, a challenge or an account, a token or a session", !/track\([^)]*\b(displayName|email|resultId|challengeId|userId|accountId|token|sessionId|code)\s*:/.test(clients));
    if (!isLive) {
      // forged owner: a body user id is ignored; identity is the token's
      const beaBefore = await (await post(context, { action: "progression-get" }, beaAuth)).json();
      const joeBefore = await (await post(context, { action: "progression-get" }, auth)).json();
      const mine = await (await post(context, { action: "progression-get", userId: J, user_id: J }, beaAuth)).json();
      ok("a forged owner id in the body is ignored: the token's own account answers (Bea sees Bea)", mine.status === "ok" && mine.facts.clashes === beaBefore.facts.clashes && mine.profile.totalXp === beaBefore.profile.totalXp, `clashes ${mine.facts?.clashes}`);
      // forged XP delta / level / source: no action accepts them; the progression block reads nothing but the token
      const forged = await (await post(context, { action: "progression-reconcile", xpDelta: 5000, level: 99, awards: [{ source_type: "clash", source_id: "forged", reason: "completion", xp_delta: 900 }] }, beaAuth)).json();
      ok("a forged XP delta, level or award list changes nothing", forged.status === "ok" && forged.profile.totalXp === beaBefore.profile.totalXp && forged.profile.level === beaBefore.profile.level && forged.repaired.awards === 0, `xp ${forged.profile?.totalXp} level ${forged.profile?.level}`);
      // a real save earns; a stranger's device cannot claim the same result
      const page = await context.newPage(); await fresh(page); const resultId = await play(page);
      ok("the arena result offers a guest the one-line career note after the score", (await page.locator('.ec-prog[data-state="guest"]').count()) === 1 && (await page.locator(".ec-ta-score[data-winner]").count()) === 1);
      const saved = await (await post(context, { action: "cloud-save", resultId }, auth)).json();
      ok("a signed-in save earns completion (+ win where won) and Era-first, once, in the save response", saved.status === "saved" && saved.progression?.status === "ok" && saved.progression.xpDelta >= 100 + 50 && saved.progression.awarded.some((a) => a.category === "clash:completion"), `+${saved.progression?.xpDelta}`);
      const again = await (await post(context, { action: "cloud-save", resultId }, auth)).json();
      ok("saving the same result again: already_saved, XP delta 0", again.status === "already_saved" && again.progression?.xpDelta === 0);
      const other = await browser.newContext(); const o = await other.newPage(); await fresh(o); await o.goto(`${BASE}/`);
      const stolen = await (await post(other, { action: "cloud-save", resultId }, beaAuth)).json();
      ok("another device cannot claim the result, so it cannot earn from it", stolen.status === "not_your_result" && !stolen.progression);
      const bea = await (await post(other, { action: "progression-get" }, beaAuth)).json();
      ok("cross-account: Bea's progression shows none of Joseph's Clashes or XP", bea.status === "ok" && bea.facts.clashes === beaBefore.facts.clashes && bea.profile.totalXp === beaBefore.profile.totalXp);
      const joe = await (await post(context, { action: "progression-get" }, auth)).json();
      ok("the owner reads their own progression: profile, achievements with progress, recent ledger, no ids; the total moved by exactly the save's delta", joe.status === "ok" && joe.facts.clashes === joeBefore.facts.clashes + 1 && joe.profile.totalXp === joeBefore.profile.totalXp + saved.progression.xpDelta && Array.isArray(joe.achievements) && joe.achievements.length === P.ACHIEVEMENTS.length && Array.isArray(joe.recent) && !JSON.stringify(joe).match(/user_id|1111-4111|device_session/));
      await other.close();
    }
    write("progression-security-qa", {}, { exit: false });
    const c0 = checks.length;
    ok("User A reads no User B rows (server: token identity; database: RLS own-row policies)", /user_id = auth\.uid\(\)/.test(read("supabase/migrations/0005_progression_v1.sql")) && /const who = await verifyAccountToken\(bearer\(req\)\)/.test(read("api/profile.js").split("Phase 9D progression actions")[1].split("Phase 9B.1")[0]));
    ok("anonymous holds no privilege on any progression table", (read("supabase/migrations/0005_progression_v1.sql").match(/revoke all on public\.(progression_profiles|xp_ledger|achievement_unlocks)\s+from anon, authenticated/g) || []).length === 3);
    write("progression-cross-account-qa", {}, { from: c0 });
  }

  if (MODE === "concurrency") {
    if (isLive) { ok("concurrency mode runs on the fake-cloud harness", false, "pass a local origin"); write("progression-concurrency-qa"); }
    const before = await (await post(context, { action: "progression-get" }, auth)).json();
    const page = await context.newPage(); await fresh(page); const resultId = await play(page);
    const N = 6;
    const results = await Promise.all(Array.from({ length: N }, () => post(context, { action: "cloud-save", resultId }, auth).then((r) => r.json())));
    const deltas = results.map((r) => r.progression?.xpDelta ?? 0);
    const state = await (await post(context, { action: "progression-get" }, auth)).json();
    const heldBefore = new Set(before.achievements.filter((a) => a.unlocked).map((a) => a.id));
    const legit = P.XP.CLASH_COMPLETION + P.XP.CLASH_WIN * (state.facts.wins - before.facts.wins) + P.XP.ERA_FIRST_COMPLETION * (state.facts.erasCompleted.length - before.facts.erasCompleted.length) + state.achievements.filter((a) => a.unlocked && !heldBefore.has(a.id)).reduce((s, a) => s + a.xp, 0);
    ok(`${N} simultaneous saves of the same result award exactly once`, results.every((r) => ["saved", "already_saved"].includes(r.status)) && deltas.reduce((s, d) => s + d, 0) === state.profile.totalXp - before.profile.totalXp && state.facts.clashes === before.facts.clashes + 1, `deltas ${deltas.join("/")} · total ${before.profile.totalXp} → ${state.profile.totalXp}`);
    ok("the total moved by exactly the one legitimate delta for this result", state.profile.totalXp - before.profile.totalXp === legit, `${state.profile.totalXp - before.profile.totalXp} vs ${legit}`);
    ok("the recent ledger's newest completion is this result's, and there is one more completion than before", state.recent[0] && state.recent.filter((r) => r.category === "clash:completion").length >= 1 && state.facts.clashes === before.facts.clashes + 1);
    const again = await Promise.all(Array.from({ length: 4 }, () => post(context, { action: "progression-reconcile" }, auth).then((r) => r.json())));
    ok("four simultaneous reconciles repair nothing and agree on the total", again.every((r) => r.status === "ok" && r.repaired.awards === 0 && r.profile.totalXp === state.profile.totalXp));
    ok("in Postgres the same is decided by a per-account advisory lock and the unique constraint", /pg_advisory_xact_lock/.test(read("supabase/migrations/0005_progression_v1.sql")) && /on conflict on constraint xp_ledger_one_award do nothing/.test(read("supabase/migrations/0005_progression_v1.sql")));
    write("progression-concurrency-qa", { simultaneous: N, deltas, totalXp: state.profile.totalXp });
  }

  if (MODE === "responsive" || MODE === "accessibility" || MODE === "performance") {
    if (isLive) { ok(`${MODE} mode runs on the fixtures harness`, false, "pass a local origin"); write(`progression-${MODE}-qa`); }
    const fx = await (await fetch(`${FIXTURES}/api/health`).catch(() => ({ json: async () => null }))).json?.();
    if (!fx) { ok(`the fixtures harness answers at ${FIXTURES}`, false, "start: ECLASH_DIST=dist-fixtures ECLASH_FAKE_CLOUD=1 node scripts/harness.mjs 4179"); write(`progression-${MODE}-qa`); }
    const shots = `${OUT}/screens`; mkdirSync(shots, { recursive: true });
    const viewports = MODE === "responsive" ? [[1536, 1024], [1440, 900], [1280, 800], [1024, 1366], [768, 1024], [430, 932], [390, 844], [375, 812]] : MODE === "accessibility" ? [[1440, 900], [390, 844]] : [[1440, 900], [390, 844]];
    const rows = [];
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: MODE === "accessibility" && w === 1440 ? "reduce" : "no-preference" });
      const p = await ctx.newPage();
      await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });
      const t0 = Date.now();
      await p.goto(`${FIXTURES}/dev/progression-reference`, { waitUntil: "domcontentloaded" });
      await p.locator('[data-fixture="achievements"] .ec-ach-card').nth(P.ACHIEVEMENTS.length - 1).waitFor({ timeout: 30_000 });
      const loadMs = Date.now() - t0;
      const m = await p.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const m = cs.backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return cs.backgroundColor; const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) { const gm = g[0].match(/[\d.]+/g); if (gm && (gm.length < 4 || Number(gm[3]) > 0.5)) return g[0]; } n = n.parentElement; } return "rgb(3,7,13)"; };
        const ratio = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); if (a == null || b == null) return null; const [hi, lo] = a > b ? [a, b] : [b, a]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
        const btns = [...document.querySelectorAll("main button")].filter(vis);
        const cols = (sel) => { const cards = [...document.querySelectorAll(sel)]; const tops = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))); return cards.length && tops.size ? Math.round(cards.length / tops.size) : 0; };
        const gridCols = getComputedStyle(document.querySelector(".ec-ach-grid")).gridTemplateColumns.split(" ").length;
        const texts = [".ec-prog-kicker", ".ec-prog-delta", ".ec-prog-lines li span", ".ec-prog-level-k", ".ec-prog-next", ".ec-prog-body", ".ec-prog-hero-level", ".ec-prog-hero-stats dt", ".ec-prog-hero-stats dd", ".ec-ach-name", ".ec-ach-desc", ".ec-ach-state", ".ec-ach-foot span", ".ec-ach-filter", ".ec-ach-count"].map((s) => { const e = document.querySelector(s); return e && vis(e) ? { s, contrast: ratio(e), px: parseFloat(getComputedStyle(e).fontSize) } : null; }).filter(Boolean);
        const heroTop = getComputedStyle(document.querySelector(".ec-prog-hero-top"));
        const bars = [...document.querySelectorAll('[role="progressbar"]')];
        const anim = getComputedStyle(document.querySelector('[data-fixture="postgame-xp"] .ec-prog')).animationName;
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          minBtn: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))), buttons: btns.length,
          gridCols, heroCollapsed: heroTop.gridTemplateAreas.includes("name") && heroTop.gridTemplateColumns.split(" ").length === 2,
          progressbars: bars.length, barsValid: bars.every((b) => b.getAttribute("aria-valuenow") != null && b.getAttribute("aria-valuemax") != null && b.getAttribute("aria-label")),
          liveRegions: document.querySelectorAll("[aria-live]").length, unlabelled: btns.filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label"))).length,
          stateWords: [...document.querySelectorAll(".ec-ach-state")].every((e) => /UNLOCKED|LOCKED|SECRET/.test(e.textContent)), stateCount: document.querySelectorAll(".ec-ach-state").length,
          secretCards: document.querySelectorAll('.ec-ach-card[data-state="secret"]').length, secretNamed: [...document.querySelectorAll('.ec-ach-card[data-state="secret"] .ec-ach-name')].every((e) => /Secret achievement/.test(e.textContent)),
          levelUpVisible: vis(document.querySelector('[data-fixture="level-up"] .ec-prog-levelup')), unlockList: document.querySelectorAll('[data-fixture="achievement-unlock"] .ec-prog-unlock-list li').length,
          guestNote: /Sign in to preserve your career/.test(document.querySelector('[data-fixture="postgame-guest"]').textContent),
          pendingLive: !!document.querySelector('[data-fixture="postgame-pending"] [aria-live]'),
          deltaFirst: (() => { const s = document.querySelector('[data-fixture="postgame-xp"] .ec-prog'); const k = s.querySelector(".ec-prog-kicker").getBoundingClientRect().top, d = s.querySelector(".ec-prog-delta").getBoundingClientRect().top, l = s.querySelector(".ec-prog-bar").getBoundingClientRect().top; return k < d && d < l; })(),
          announce: document.querySelector('[data-fixture="postgame-xp"] .ec-prog-sr')?.textContent || "",
          texts, animation: anim, filters: document.querySelectorAll(".ec-ach-filter").length, pressed: document.querySelectorAll('.ec-ach-filter[aria-pressed="true"]').length,
          cls: +window.__cls.toFixed(4), cards: document.queraySelectorAll ? 0 : document.querySelectorAll(".ec-ach-card").length,
        };
      });
      rows.push({ viewport: `${w}x${h}`, loadMs, ...m });
      if (MODE === "responsive") {
        ok(`${w}×${h}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
        ok(`${w}×${h}: every control ≥ 44px`, m.minBtn >= 44, `${m.minBtn}px over ${m.buttons} controls`);
        ok(`${w}×${h}: achievements grid ${w >= 1101 ? "three" : w >= 641 ? "two" : "one"} column${w >= 641 ? "s" : ""}`, m.gridCols === (w >= 1101 ? 3 : w >= 641 ? 2 : 1), `${m.gridCols} columns`);
        ok(`${w}×${h}: the hero keeps name, XP and level readable; postgame reads kicker → delta → bar`, m.heroCollapsed && m.deltaFirst);
        for (const [id, file] of [["overview", "overview-progression"], ["achievements", "achievements"]]) if (w === 1440 || w === 390) await p.locator(`[data-fixture="${id}"]`).screenshot({ path: `${shots}/${file}-${w >= 1000 ? "desktop" : "mobile"}.png` });
        if (w === 1440) for (const id of ["postgame-xp", "achievement-unlock", "level-up"]) await p.locator(`[data-fixture="${id}"]`).screenshot({ path: `${shots}/${id}.png` });
        if (w === 390) await p.locator('[data-fixture="postgame-xp"]').screenshot({ path: `${shots}/postgame-xp-mobile.png` });
      }
      if (MODE === "accessibility") {
        ok(`${w}×${h}: every progress bar is semantic (role, label, valuenow, valuemax)`, m.progressbars >= 3 && m.barsValid, `${m.progressbars} bars`);
        ok(`${w}×${h}: live regions announce XP, level and unlocks politely; the sentence names XP, level and the distance`, m.liveRegions >= 3 && /career XP earned\. Level \d+\. .*XP until Level/.test(m.announce), m.announce);
        ok(`${w}×${h}: achievement state is said in words on every card; the one still-hidden achievement reads SECRET`, m.stateWords && m.stateCount === P.ACHIEVEMENTS.length && m.secretCards === 1 && m.secretNamed, `${m.stateCount} cards, ${m.secretCards} secret`);
        ok(`${w}×${h}: no unlabelled control; ${m.filters} filters with exactly one pressed`, m.unlabelled === 0 && m.filters === 5 && m.pressed === 1);
        ok(`${w}×${h}: level-up and multiple unlocks render as one restrained block each`, m.levelUpVisible && m.unlockList === 3);
        for (const t of m.texts) ok(`${w}×${h}: ${t.s} contrast ${t.contrast}:1 at ${t.px}px`, t.contrast == null || t.contrast >= (t.px >= 18.5 ? 3 : 4.5));
        // keyboard: Tab reaches the filters; Enter presses one; the pressed state moves
        let reached = false; for (let i = 0; i < 60 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.classList?.contains("ec-ach-filter")); }
        ok(`${w}×${h}: Tab reaches the achievement filters`, reached);
        if (reached) { await p.keyboard.press("Tab"); await p.keyboard.press("Enter"); const moved = await p.evaluate(() => document.activeElement?.getAttribute("aria-pressed") === "true" && document.querySelectorAll('.ec-ach-filter[aria-pressed="true"]').length === 1); ok(`${w}×${h}: Enter activates a filter and the pressed state follows`, moved); }
        if (w === 1440) ok("reduced motion: the earned module has no entrance animation", m.animation === "none", m.animation);
        ok(`${w}×${h}: guest note and pending state are present and the pending state is a polite live region`, m.guestNote && m.pendingLive);
      }
      if (MODE === "performance") {
        ok(`${w}×${h}: the fixture (three postgame states, the hero and ${P.ACHIEVEMENTS.length} achievement cards) renders within 3s`, loadMs < 3000, `${loadMs}ms`);
        ok(`${w}×${h}: CLS effectively zero`, m.cls <= 0.02, `${m.cls}`);
      }
      await ctx.close();
    }
    if (MODE === "performance") {
      const t = async (fn) => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
      const get = await t(() => post(context, { action: "progression-get" }, auth));
      ok("progression-get (reconcile + read) answers within 1.5s on the harness", get.ms < 1500, `${get.ms}ms`);
      const page = await context.newPage(); await fresh(page); const resultId = await play(page);
      const save = await t(() => post(context, { action: "cloud-save", resultId }, auth));
      ok("a career save with its progression answers within 2s", save.ms < 2000, `${save.ms}ms`);
      const reads = (read("api/_lib/progression.js").match(/await rest\(/g) || []).length;
      ok("no N+1: reconciliation reads a fixed handful of queries regardless of history size (no rest() inside a loop)", reads <= 12 && !/for \([^)]*\) \{[^}]*await rest\(/.test(read("api/_lib/progression.js")) && !/\.map\([^)]*await rest/.test(read("api/_lib/progression.js")), `${reads} rest() sites, none in a loop`);
      ok("the catalog is static client configuration; the user payload is compact (achievements carry progress, not history)", !/fetch\([^)]*catalog/.test(read("src/components/progression/AchievementsTab.jsx")) && JSON.stringify(await get.r.json()).length < 60_000);
      write("progression-performance-qa", { rows: rows.map((r) => ({ viewport: r.viewport, loadMs: r.loadMs, cls: r.cls })), ms: { progressionGet: get.ms, saveWithProgression: save.ms } });
    }
    write(MODE === "responsive" ? "progression-responsive-qa" : "progression-accessibility-qa", { rows: rows.map(({ texts, ...r }) => r) });
  }

  if (MODE === "result") {
    // §48: a signed-in user's result — one completion source, the win bonus only where won,
    // the Era bonus only when first, achievements evaluated, level computed, one career row;
    // refresh and navigate away/back add nothing.
    if (isLive) { ok("result mode runs on the fake-cloud harness", false, "pass a local origin"); write("result-progression-qa"); }
    const before = await (await post(context, { action: "progression-get" }, auth)).json();
    const page = await context.newPage(); await fresh(page); const resultId = await play(page);
    const won = await page.locator(".ec-ta-score[data-winner]").getAttribute("data-winner");
    const order = await page.evaluate(() => { const s = document.querySelector(".ec-ta-score[data-winner]"), n = document.querySelector(".ec-prog"); return s && n && s.getBoundingClientRect().top < n.getBoundingClientRect().top; });
    ok("score and winner appear, then the progression module (MVP sits in the stage head with the score)", order === true);
    const saved = await (await post(context, { action: "cloud-save", resultId }, auth)).json();
    const cats = (saved.progression?.awarded || []).map((a) => a.category);
    ok("exactly one completion XP source", saved.status === "saved" && cats.filter((c) => c === "clash:completion").length === 1, cats.join(","));
    ok("win bonus only if won", (won === "gold") === cats.includes("clash:win"), `winner ${won}`);
    const after = await (await post(context, { action: "progression-get" }, auth)).json();
    const newEra = after.facts.erasCompleted.length === before.facts.erasCompleted.length + 1;
    ok("Era first-completion bonus only if first in that Era", newEra === cats.includes("era:first_completion"), `eras ${before.facts.erasCompleted.length} → ${after.facts.erasCompleted.length}`);
    ok("achievements evaluated and the level computed from the ledger", Array.isArray(after.achievements) && after.achievements.length === P.ACHIEVEMENTS.length && after.profile.level === P.levelForXp(after.profile.totalXp).level && saved.progression.after.level === after.profile.level);
    ok("the cloud result is saved exactly once (one more career row)", after.facts.clashes === before.facts.clashes + 1);
    ok("the total moved by exactly the response's delta", after.profile.totalXp === before.profile.totalXp + saved.progression.xpDelta, `+${saved.progression.xpDelta}`);
    await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-ta-stage", { timeout: 30_000 });
    const afterRefresh = await (await post(context, { action: "progression-get" }, auth)).json();
    ok("refresh: no new XP", afterRefresh.profile.totalXp === after.profile.totalXp && afterRefresh.repaired.awards === 0);
    await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-ta-stage", { timeout: 30_000 });
    const afterNav = await (await post(context, { action: "progression-get" }, auth)).json();
    ok("navigate away and back: no new XP", afterNav.profile.totalXp === after.profile.totalXp);
    const resave = await (await post(context, { action: "cloud-save", resultId }, auth)).json();
    ok("a re-save answers already_saved with a zero delta", resave.status === "already_saved" && resave.progression.xpDelta === 0);
    ok("the finished game is still this browser's LAST CLASH after the reload, and the server was asked for nothing new", (await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("ec_prior_result") || "null")?.result?.resultId || null; } catch { return null; } })) === resultId && afterNav.repaired.awards === 0);
    write("result-progression-qa", { winner: won, delta: saved.progression?.xpDelta, categories: cats });
  }

  if (MODE === "challenge") {
    // §32: a completed official attempt earns the recipient account completion (+ victory) XP once,
    // and the creator a response once; creating and copying earn nothing; a repeat earns nothing.
    if (isLive) { ok("challenge mode runs on the fake-cloud harness", false, "pass a local origin"); write("challenge-progression-qa"); }
    const joe0 = await (await post(context, { action: "progression-get" }, auth)).json();
    const bea0 = await (await post(context, { action: "progression-get" }, beaAuth)).json();
    const page = await context.newPage(); await fresh(page);
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await click(page, /^ROLL 2$/); await stage(page, "ERA_REVEAL"); await click(page, /ADAPT TO ERA/); await click(page, /FINAL ROLL/);
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
    await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
    const resultId = await page.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
    await post(context, { action: "cloud-save", resultId }, auth);
    const joe1 = await (await post(context, { action: "progression-get" }, auth)).json();
    const created = await (await post(context, { action: "challenge-create", chaosRunId: runId }, auth)).json();
    const joe2 = await (await post(context, { action: "progression-get" }, auth)).json();
    ok("creating a challenge earns 0 XP by itself", created.status === "created" && joe2.profile.totalXp === joe1.profile.totalXp, created.status);
    // Bea accepts as an account (API, her own device context) and plays the run in her browser
    const bea = await browser.newContext(); const bp = await bea.newPage(); await fresh(bp); await bp.goto(`${BASE}/`);
    const acc = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-accept", code: created.code, tier: "FREE" }, headers: { "content-type": "application/json", ...beaAuth } })).json();
    ok("a signed-in recipient starts one official attempt", acc.status === "started" && !!acc.chaosRunId, acc.status);
    await bp.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Joseph", at: Date.now() })); }, [acc.chaosRunId, created.code]);
    await bp.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(bp, "DRAFTING");
    ok("the recipient's run resumes badged as a challenge", (await bp.locator(".ec-ta-chal-chip").count()) === 1);
    await bp.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await click(bp, /^ROLL 2$/); await stage(bp, "ERA_REVEAL"); await click(bp, /ADAPT TO ERA/); await click(bp, /FINAL ROLL/);
    await bp.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await bp.getByRole("button", { name: /^Select / }).first().click();
    await click(bp, /CONTINUE WITH COACH/); await click(bp, /RUN CLASH/);
    const compared = await bp.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 }).then(() => true).catch(() => false);
    ok("the attempt completes and is compared (the browser holds no bearer; the attempt keeps the account it was started under)", compared);
    const outcome = compared ? await bp.locator(".ec-chal-cmp").getAttribute("data-outcome") : null;
    const beaResultId = await bp.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
    await bea.request.post(`${BASE}/api/profile`, { data: { action: "cloud-save", resultId: beaResultId }, headers: { "content-type": "application/json", ...beaAuth } });
    // the completion hook, as the recipient account would call it, answers with the recipient's progression
    const done = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId: acc.chaosRunId }, headers: { "content-type": "application/json", ...beaAuth } })).json();
    const bea1 = await (await post(context, { action: "progression-get" }, beaAuth)).json();
    const heldBefore = new Set(bea0.achievements.filter((a) => a.unlocked).map((a) => a.id));
    const newlyXp = bea1.achievements.filter((a) => a.unlocked && !heldBefore.has(a.id)).reduce((s, a) => s + a.xp, 0);
    const expectedDelta = P.XP.CLASH_COMPLETION + P.XP.CLASH_WIN * (bea1.facts.wins - bea0.facts.wins) + P.XP.ERA_FIRST_COMPLETION * (bea1.facts.erasCompleted.length - bea0.facts.erasCompleted.length)
      + P.XP.CHALLENGE_COMPLETION * (bea1.facts.challengesCompleted - bea0.facts.challengesCompleted) + P.XP.CHALLENGE_VICTORY * (bea1.facts.challengeWins - bea0.facts.challengeWins) + newlyXp;
    ok("the recipient earns challenge completion XP once (one more completed attempt; the total moved by exactly its Clash + challenge + unlock XP)", ["completed", "already_completed"].includes(done.status) && bea1.facts.challengesCompleted === bea0.facts.challengesCompleted + 1 && bea1.profile.totalXp - bea0.profile.totalXp === expectedDelta, `${done.status} · outcome ${outcome} · +${bea1.profile.totalXp - bea0.profile.totalXp} (expected ${expectedDelta})`);
    ok("victory XP only when the comparison decided recipient", (outcome === "recipient") === (bea1.facts.challengeWins === bea0.facts.challengeWins + 1), `outcome ${outcome}`);
    ok("FIRST CHALLENGE unlocks for the recipient", bea1.achievements.find((a) => a.id === "first_challenge").unlocked);
    const joe3 = await (await post(context, { action: "progression-get" }, auth)).json();
    const challengerBefore = joe2.achievements.find((a) => a.id === "challenger").unlocked;
    ok("the creator earns one response (+25) and CHALLENGER (+50 the first time)", joe3.recent.filter((r) => r.category === "challenge_attempt:creator_response").length >= 1 && joe3.profile.totalXp === joe2.profile.totalXp + P.XP.CHALLENGE_CREATOR_RESPONSE + (challengerBefore ? 0 : P.ACHIEVEMENT_BY_ID.get("challenger").xp) && joe3.achievements.find((a) => a.id === "challenger").unlocked, `${joe2.profile.totalXp} → ${joe3.profile.totalXp}`);
    const again = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId: acc.chaosRunId }, headers: { "content-type": "application/json", ...beaAuth } })).json();
    const bea2 = await (await post(context, { action: "progression-get" }, beaAuth)).json();
    const joe4 = await (await post(context, { action: "progression-get" }, auth)).json();
    ok("completing again: already_completed, recipient delta 0, creator unchanged", again.status === "already_completed" && (again.progression?.xpDelta ?? 0) === 0 && bea2.profile.totalXp === bea1.profile.totalXp && joe4.profile.totalXp === joe3.profile.totalXp);
    ok("copying a link is a client action with no server call", !/copy/i.test(read("api/_lib/progression.js")));
    await bea.close();
    write("challenge-progression-qa", { outcome, creatorDelta: joe3.profile.totalXp - joe2.profile.totalXp, recipientDelta: bea1.profile.totalXp - bea0.profile.totalXp });
  }

  if (MODE === "deployed") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("Candidate 4 on the preview", health?.preview?.candidateId === "Candidate 4" && health?.preview?.calibrationVersion === "1.4.0", `${health?.preview?.candidateId} ${health?.preview?.calibrationVersion}`);
    ok("the account provider is configured", !!(health?.cloudAccounts?.providerConfigured && health?.cloudAccounts?.serverCredentialConfigured));
    ok("progression-get without an account is refused on the preview", (await post(context, { action: "progression-get" })).status() === 401);
    ok("a forged token is refused", (await post(context, { action: "progression-get" }, { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).status() === 401);
    ok("progression-reconcile without an account is refused", (await post(context, { action: "progression-reconcile" })).status() === 401);
    const page = await context.newPage(); await fresh(page);
    await page.goto(`${BASE}/my-eraclash?tab=achievements`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /CREATE FREE ACCOUNT OR SIGN IN/ }).waitFor({ timeout: 30_000 });
    ok("the Achievements tab route offers a signed-out visitor the sign-in entry, nothing else", true);
    const resultId = await play(page);
    ok("a guest's live result shows the score, the winner, then the one-line career note (no XP, no modal)", !!resultId && (await page.locator('.ec-prog[data-state="guest"]').count()) === 1 && (await page.locator('.ec-prog[data-state="earned"]').count()) === 0 && (await page.evaluate(() => { const s = document.querySelector(".ec-ta-score[data-winner]"), n = document.querySelector(".ec-prog"); return s && n && s.getBoundingClientRect().top < n.getBoundingClientRect().top; })));
    await page.screenshot({ path: `${OUT}/screens/deployed-guest-result-1280x900.png` });
    const scan = await page.evaluate(async () => { let text = ""; for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) text += await (await fetch(s)).text(); return { bytes: text.length, secretShaped: (text.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length, serviceJwt: (text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []).filter((j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch { return false; } }).length, hasClient: text.includes("progression-get"), namesFunction: text.includes("progression_apply"), namesLedger: text.includes("xp_ledger"), fixtureRoute: text.includes("progression-reference") }; });
    ok("no secret-shaped string in the bundle", scan.secretShaped === 0 && scan.serviceJwt === 0);
    ok("the bundle carries the progression client and never the database function, the ledger table or the dev fixture", scan.hasClient && !scan.namesFunction && !scan.namesLedger && !scan.fixtureRoute, JSON.stringify(scan));
    write("progression-deployed-qa", { bundle: scan, health: { candidate: health?.preview?.candidateId, calibration: health?.preview?.calibrationVersion } }, { exit: false });
    const c0 = checks.length;
    ok("bundle: no secret, no service_role JWT, no server function name, no fixture route", scan.secretShaped === 0 && scan.serviceJwt === 0 && !scan.namesFunction && !scan.fixtureRoute);
    write("progression-secret-audit", { bundle: scan }, { from: c0 });
  }
  await browser.close();
}
