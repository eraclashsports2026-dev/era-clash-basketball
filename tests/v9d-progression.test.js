// ── Phase 9D: Progression, XP and Achievements V1 ─────────────────────────────
// The pure contract, the schema's promises, and the server library driven
// through the fake cloud — so the XP amounts, the level curve, the catalog,
// idempotency, backfill, the authority model and PROGRESSION_POWER_EFFECT = 0
// are pinned without a live Postgres.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as P from "../src/progression/contract.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";
import { CAREER_TAB_IDS } from "../src/accounts/careerV2.js";
import { ERAS } from "../src/players.js";

const read = (p) => readFileSync(p, "utf8");
const SQL = read("supabase/migrations/0005_progression_v1.sql");
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

describe("XP contract 1.0.0", () => {
  it("pins every amount in one place", () => {
    expect(P.PROGRESSION_VERSION).toBe("1.0.0");
    expect(P.XP).toMatchObject({ CLASH_COMPLETION: 100, CLASH_WIN: 25, ERA_FIRST_COMPLETION: 50, CHALLENGE_COMPLETION: 50, CHALLENGE_VICTORY: 25, CHALLENGE_CREATOR_RESPONSE: 25 });
    expect(P.XP.ACHIEVEMENT).toEqual({ small: 50, medium: 100, major: 250 });
    expect(P.PROGRESSION_POWER_EFFECT).toBe(0);
  });
  it("derives awards only from authoritative records, once per source, with the Era bonus once per Era", () => {
    const clashes = [
      { result_id: "aaa111", outcome: "win", era_id: "1990s", played_at: "2026-01-01" },
      { result_id: "aaa112", outcome: "loss", era_id: "1990s", played_at: "2026-01-02" },
      { result_id: "aaa113", outcome: "tie", era_id: "2000s", played_at: "2026-01-03" },
      { result_id: "junk", outcome: "pending", era_id: "2000s" },   // not an outcome → not a record
    ];
    const awards = P.expectedAwards({ clashes, attempts: [{ id: "at1", status: "completed", challenge_outcome: "recipient" }, { id: "at2", status: "started" }], responses: [{ id: "r1", status: "completed" }] });
    const keys = awards.map(P.sourceKey);
    expect(keys).toEqual(["clash:aaa111:completion", "clash:aaa111:win", "era:1990s:first_completion", "clash:aaa112:completion", "clash:aaa113:completion", "era:2000s:first_completion", "challenge_attempt:at1:completion", "challenge_attempt:at1:victory", "challenge_attempt:r1:creator_response"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(P.totalOf(awards)).toBe(100 + 25 + 50 + 100 + 100 + 50 + 50 + 25 + 25);
    // a tie and a loss earn completion, never the win bonus
    expect(keys.filter((k) => k.endsWith(":win"))).toEqual(["clash:aaa111:win"]);
  });
  it("names what earns nothing, and no source type exists for any of it", () => {
    for (const x of ["rolling", "holding a player", "revealing an Era", "choosing a coach", "opening a result", "copying a challenge link", "creating a challenge", "signing in", "refreshing", "daily login"]) expect(P.NO_XP_FOR).toContain(x);
    expect(P.SOURCE_TYPES).toEqual(["clash", "era", "challenge_attempt", "achievement"]);
    expect(P.REASONS).not.toContain("login");
  });
});

describe("level curve 1.0.0", () => {
  it("reaches the ten enumerated levels and follows the formula after", () => {
    expect(P.LEVEL_THRESHOLDS).toEqual([0, 250, 550, 900, 1300, 1750, 2250, 2800, 3400, 4050]);
    expect(P.cumulativeXpForLevel(10)).toBe(4050);
    expect(P.cumulativeXpForLevel(11)).toBe(4050 + 650);
    expect(P.cumulativeXpForLevel(12)).toBe(4050 + 650 + 725);
    expect(P.stepCost(20)).toBe(650 + 10 * 75);
    expect(P.LEVEL_CAP).toBe(100);
  });
  it("is monotonic, exact at thresholds and capped with MAX LEVEL", () => {
    let last = -1;
    for (let xp = 0; xp <= 6000; xp += 7) { const l = P.levelForXp(xp).level; expect(l).toBeGreaterThanOrEqual(last); last = l; }
    expect(P.levelForXp(249).level).toBe(1); expect(P.levelForXp(250).level).toBe(2); expect(P.levelForXp(4049).level).toBe(9); expect(P.levelForXp(4050).level).toBe(10);
    const top = P.levelForXp(P.cumulativeXpForLevel(100) + 5000);
    expect(top.level).toBe(100); expect(top.maxLevel).toBe(true); expect(top.xpToNext).toBe(0);
    const mid = P.levelForXp(2465);
    expect(mid).toMatchObject({ level: 7, xpIntoLevel: 215, xpForLevel: 550, xpToNext: 335, nextLevelAt: 2800 });
    expect(P.levelForXp(-5).level).toBe(1); expect(P.levelForXp("x").level).toBe(1);
  });
  it("the SQL mirror uses the same thresholds, formula and cap", () => {
    expect(SQL).toMatch(/array\[0, 250, 550, 900, 1300, 1750, 2250, 2800, 3400, 4050\]/);
    expect(SQL).toMatch(/cum := cum \+ 650 \+ \(lvl - 10\) \* 75/);
    expect(SQL).toMatch(/while lvl < 100 loop/);
  });
  it("early levels arrive regularly and Level 50 is sustained play, from the contract's own numbers", () => {
    const v = P.velocityModel();
    expect(v.gamesToLevel[5]).toBeLessThanOrEqual(15);
    expect(v.gamesToLevel[10]).toBeLessThan(100);
    expect(v.gamesToLevel[50]).toBeGreaterThan(200);   // not two days of normal play
  });
});

describe("achievement catalog 1.0.0", () => {
  it("is a controlled, versioned set with unique ids, five categories and at most three hidden", () => {
    expect(P.ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20); expect(P.ACHIEVEMENTS.length).toBeLessThanOrEqual(30);
    expect(new Set(P.ACHIEVEMENTS.map((a) => a.id)).size).toBe(P.ACHIEVEMENTS.length);
    for (const a of P.ACHIEVEMENTS) {
      expect(a.version).toBe("1.0.0"); expect(P.ACHIEVEMENT_CATEGORIES).toContain(a.category);
      expect(a.xp).toBe(P.XP.ACHIEVEMENT[a.tier]); expect(a.target).toBeGreaterThanOrEqual(1); expect(a.id).toMatch(/^[a-z0-9_]{1,40}$/);
    }
    expect(P.ACHIEVEMENTS.filter((a) => a.hidden).length).toBeLessThanOrEqual(P.MAX_HIDDEN_ACHIEVEMENTS);
    for (const id of ["first_clash", "first_win", "first_chaos", "first_challenge", "time_traveler", "era_scholar", "across_the_ages", "challenger", "answer_the_call", "prove_it", "ten_clashes", "fifty_clashes", "century_club", "ten_wins", "fifty_wins", "era_adapter", "coachs_trust", "positionless"]) expect(P.ACHIEVEMENT_BY_ID.has(id)).toBe(true);
    expect(P.ACHIEVEMENT_BY_ID.get("across_the_ages").target).toBe(ERAS.length);
    expect(P.ACHIEVEMENT_BY_ID.has("rivalry")).toBe(false);   // relationship tracking deliberately not built
  });
  it("derives truthful progress and unlocks from records, and hides secrets until unlocked", () => {
    const clashes = Array.from({ length: 12 }, (_, i) => ({ result_id: `r${i}`, mode: i % 3 ? "chaos" : "single", outcome: i % 4 === 1 ? "loss" : "win", era_id: ERAS[i % 5], gold_score: i === 2 ? 102 : 120, blue_score: i === 2 ? 100 : 95, gold_coach: { id: `c${i % 3}` }, gold_roster: [{ id: "pettit-50s" }, { id: "schayes-50s" }], played_at: `2026-01-${String(i + 1).padStart(2, "0")}` }));
    const facts = P.factsFromRecords({ clashes, attempts: [{ id: "a", status: "completed", challenge_outcome: "recipient" }], responses: [] });
    expect(facts).toMatchObject({ clashes: 12, wins: 9, losses: 3, erasCompleted: ERAS.slice(0, 5), challengesCompleted: 1, challengeWins: 1, challengeResponsesReceived: 0 });
    expect(facts.winningCoaches.length).toBe(3); expect(facts.closeWins).toBe(1); expect(facts.routWins).toBe(9 - 1); expect(facts.longestWinStreak).toBe(3);
    const ev = P.evaluateAchievements(facts, []);
    const by = Object.fromEntries(ev.map((a) => [a.id, a]));
    expect(by.ten_clashes.unlocked).toBe(true); expect(by.fifty_clashes).toMatchObject({ unlocked: false, current: 12, target: 50 });
    expect(by.era_scholar.unlocked).toBe(true); expect(by.across_the_ages).toMatchObject({ current: 5, target: ERAS.length, unlocked: false });
    expect(by.first_challenge.unlocked).toBe(true); expect(by.challenger.unlocked).toBe(false); expect(by.coachs_trust.unlocked).toBe(true);
    expect(by.heat_check.unlocked).toBe(true); expect(by.on_fire.unlocked).toBe(false);
    expect(by.nail_biter.unlocked).toBe(true); expect(by.nail_biter.display.secret).toBe(false);
    // a hidden achievement not yet met shows nothing about itself
    const none = P.evaluateAchievements(P.factsFromRecords({}), []);
    const secret = none.find((a) => a.id === "statement_win");
    expect(secret.display).toEqual({ name: P.HIDDEN_ACHIEVEMENT_LABEL, description: "Keep playing to reveal it.", secret: true });
    expect(none.every((a) => !a.unlocked && a.current === 0)).toBe(true);
  });
  it("unlock awards are once per achievement id: what the database holds is never re-awarded", () => {
    const facts = P.factsFromRecords({ clashes: [{ result_id: "x1", outcome: "win", mode: "chaos", played_at: "2026-01-01" }] });
    const fresh = P.achievementAwards(P.evaluateAchievements(facts, []));
    expect(fresh.map((a) => a.sourceId).sort()).toEqual(["first_chaos", "first_clash", "first_win"]);
    expect(fresh.every((a) => a.sourceType === "achievement" && a.reason === "unlock" && a.xpDelta === 50)).toBe(true);
    const again = P.achievementAwards(P.evaluateAchievements(facts, fresh.map((a) => ({ achievement_id: a.sourceId, achievement_version: "1.0.0" }))));
    expect(again).toEqual([]);
  });
  it("summarises a delta with the level before and after, and announces it politely", () => {
    const d = P.progressionDelta({ awarded: [{ xpDelta: 100 }, { xpDelta: 25 }], unlocked: [], totalXp: 260 });
    expect(d).toMatchObject({ xpDelta: 125, levelUp: true, levelsGained: 1 });
    expect(d.before.level).toBe(1); expect(d.after.level).toBe(2);
    expect(P.announceProgress(d)).toBe("125 career XP earned. Level 2. 290 XP until Level 3.");
    expect(P.progressionDelta({ awarded: [], unlocked: [], totalXp: 260 }).levelUp).toBe(false);
  });
});

describe("telemetry and navigation", () => {
  it("seven closed events, allowlisted server-side and mirrored client-side, metadata without identity", () => {
    expect(Object.values(P.PROGRESSION_EVENTS)).toHaveLength(7);
    for (const e of Object.values(P.PROGRESSION_EVENTS)) { expect(EVENTS_ALLOWLIST.has(e), e).toBe(true); expect(ACTIVATION_EVENTS).toContain(e); }
    for (const k of ["email", "displayName", "resultId", "challengeId", "userId", "accountId", "token", "sessionId", "code"]) expect(P.EVENT_METADATA_ALLOWED).not.toContain(k);
  });
  it("adds Achievements as one tab before Account", () => {
    expect(CAREER_TAB_IDS).toEqual(["overview", "history", "rosters", "favorites", "challenges", "achievements", "account"]);
  });
});

describe("PROGRESSION_POWER_EFFECT = 0", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it("no game, draft, era, coach, placement or simulation path imports progression, and progression imports none of their odds", () => {
    const gamePaths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js", "src/entitlements.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/components/arena/guidedState.js"].filter(existsSync);
    for (const p of gamePaths) expect(read(p), p).not.toMatch(/progression/i);
    const prog = read("src/progression/contract.js") + read("api/_lib/progression.js");
    expect(prog).not.toMatch(/from ["'][^"']*(chaos\/runState|engine\.js|draft\.js|game-core|previewEngine|entitlements)["']/);
    expect(prog).not.toMatch(/\b(odds|probability|rarity|rating|Draft Pressure)\b.*=/i);
  });
  it("the server library reads no score, outcome, XP or level from any request", () => {
    const route = read("api/profile.js");
    expect(route).not.toMatch(/req\.body\?\.(xp|xpDelta|level|totalXp|achievement|achievementId|userId|user_id|score|outcome)/);
    const block = route.split("Phase 9D progression actions")[1].split("Phase 9B.1 cloud-career actions")[0];
    expect(block).toMatch(/const who = await verifyAccountToken\(bearer\(req\)\)/);
    expect(block).toMatch(/if \(!who\) return res\.status\(401\)/);
    expect(block).toMatch(/reconcileProgression\(\{ userId: who\.userId/);
  });
});

describe("the schema keeps its promises", () => {
  it("three tables, RLS on all, select-only grants, own-row policies, cascades", () => {
    for (const t of ["progression_profiles", "xp_ledger", "achievement_unlocks"]) {
      expect(SQL).toMatch(new RegExp(`create table if not exists public\\.${t}`));
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`));
      expect(SQL).toMatch(new RegExp(`grant select on public\\.${t}\\s+to authenticated`));
      expect(SQL).toMatch(new RegExp(`${t}_select_own[\\s\\S]*using \\(user_id = auth\\.uid\\(\\)\\)`));
    }
    expect(SQL).not.toMatch(/grant (insert|update|delete)/);
    expect(SQL).not.toMatch(/create policy \w+ on public\.\w+\s+for (insert|update|delete)/);
    expect((SQL.match(/references auth\.users \(id\) on delete cascade/g) || []).length).toBe(3);
  });
  it("one award per source is a unique constraint; the ledger is immutable; a profile cannot disagree with the ledger", () => {
    expect(SQL).toMatch(/constraint xp_ledger_one_award\s+unique \(user_id, source_type, source_id, reason\)/);
    expect(SQL).toMatch(/xp_delta between 1 and 1000/);
    expect(SQL).toMatch(/create trigger xp_ledger_immutable_trg before update on public\.xp_ledger/);
    expect(SQL).toMatch(/PROGRESSION_TOTAL_FORGED/); expect(SQL).toMatch(/PROGRESSION_LEVEL_FORGED/);
    expect(SQL).toMatch(/create trigger progression_profile_guard_trg before insert or update on public\.progression_profiles/);
  });
  it("the one write path is a SECURITY DEFINER function the client roles cannot execute, serialised per account", () => {
    expect(SQL).toMatch(/create or replace function public\.progression_apply\([\s\S]*security definer/);
    expect(SQL).toMatch(/revoke execute on function public\.progression_apply\(uuid, jsonb, jsonb, text, text\) from public, anon, authenticated/);
    expect(SQL).toMatch(/pg_advisory_xact_lock\(hashtext\('progression:' \|\| p_user_id::text\)\)/);
    expect(SQL).toMatch(/on conflict on constraint xp_ledger_one_award do nothing/);
    expect(SQL).toMatch(/PROGRESSION_USER_REQUIRED/);
    expect(SQL).toMatch(/insert into public\.schema_migrations \(version\) values \('0005_progression_v1'\)/);
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12);
  });
  it("the check constraints mirror the contract's closed vocabularies", () => {
    for (const t of P.SOURCE_TYPES) expect(SQL).toMatch(new RegExp(`source_type in \\([^)]*'${t}'`));
    for (const r of P.REASONS) expect(SQL).toMatch(new RegExp(`reason in \\([^)]*'${r}'`));
    expect(SQL).toMatch(new RegExp(`xp_delta between 1 and ${P.MAX_XP_DELTA}`));
  });
});

// ── the server library, through the fake cloud ───────────────────────────────
describe("the server library", () => {
  let fc, S;
  const clash = (userId, result_id, o = {}) => ({ id: `sc-${result_id}`, user_id: userId, result_id, mode: o.mode || "chaos", outcome: o.outcome || "win", era_id: o.era || "1990s", gold_score: o.gold ?? 110, blue_score: o.blue ?? 100, gold_coach: { id: o.coach || "c1" }, gold_roster: [], played_at: o.at || "2026-01-01T00:00:00Z" });
  beforeEach(async () => {
    process.env.ECLASH_TEST_MEMORY_STORE = "1";
    const { installFakeCloud } = await import("../scripts/lib/fakeCloud.mjs");
    fc = installFakeCloud({ users: [{ userId: J, displayName: "Joseph" }, { userId: B, displayName: "Bea" }] });
    S = await import("../api/_lib/progression.js");
  });
  it("awards once: a second reconcile of the same records is a no-op, with a zero delta", async () => {
    fc.tables.saved_clashes.push(clash(J, "aaa111"), clash(J, "aaa112", { outcome: "loss", era: "1980s", at: "2026-01-02T00:00:00Z" }));
    const r1 = await S.reconcileProgression({ userId: J, trigger: "clash_saved" });
    expect(r1.status).toBe("ok");
    expect(r1.delta.xpDelta).toBe(100 + 25 + 50 + 100 + 50 + 50 * 3);   // two Clashes, one win, two Eras, three small unlocks
    expect(r1.profile.totalXp).toBe(475); expect(r1.repaired).toEqual({ awards: 8, unlocks: 3 });   // 5 record awards + 3 unlock awards in the ledger
    expect(r1.achievements.filter((a) => a.newlyUnlocked).map((a) => a.id).sort()).toEqual(["first_chaos", "first_clash", "first_win"]);
    const r2 = await S.reconcileProgression({ userId: J, trigger: "refresh" });
    expect(r2.delta.xpDelta).toBe(0); expect(r2.repaired).toEqual({ awards: 0, unlocks: 0 }); expect(r2.profile.totalXp).toBe(475);
    expect(fc.tables.xp_ledger.filter((r) => r.user_id === J).length).toBe(8);
    expect(fc.tables.progression_profiles.find((p) => p.user_id === J)).toMatchObject({ total_xp: 475, career_level: 2 });
  });
  it("backfills historical records deterministically, and a repeat awards nothing", async () => {
    fc.tables.saved_clashes.push(clash(J, "old001"), clash(J, "old002", { outcome: "loss", era: "1980s", at: "2026-01-02T00:00:00Z" }), clash(J, "old003", { era: "1980s", at: "2026-01-03T00:00:00Z" }));
    fc.tables.challenge_attempts.push({ id: "old-attempt", challenge_id: "chx", user_id: J, status: "completed", challenge_outcome: "creator" });
    const r = await S.reconcileProgression({ userId: J, trigger: "career_opened" });
    expect(r.delta.xpDelta).toBe(3 * 100 + 2 * 25 + 2 * 50 + 50 + 4 * 50);   // completions, wins, Eras, challenge, four small unlocks
    const again = await S.reconcileProgression({ userId: J });
    expect(again.repaired).toEqual({ awards: 0, unlocks: 0 }); expect(again.profile.totalXp).toBe(r.profile.totalXp);
  });
  it("repairs exactly what is missing and never erases on a failed read", async () => {
    fc.tables.saved_clashes.push(clash(J, "rep001"));
    await S.reconcileProgression({ userId: J });
    const before = fc.tables.xp_ledger.length;
    fc.tables.xp_ledger.splice(fc.tables.xp_ledger.findIndex((r) => r.source_id === "rep001" && r.reason === "win"), 1);   // a lost callback
    const fixed = await S.reconcileProgression({ userId: J });
    expect(fixed.repaired.awards).toBe(1); expect(fixed.delta.awarded[0]).toMatchObject({ sourceId: "rep001", reason: "win" }); expect(fc.tables.xp_ledger.length).toBe(before);
    const broken = await S.reconcileProgression({ userId: J }, { fetch: async () => { throw new Error("network"); } }).catch((e) => ({ status: "threw", e }));
    expect(fc.tables.xp_ledger.length).toBe(before);   // nothing erased
    expect(["threw", "apply_failed"]).toContain(broken.status);
  });
  it("creator response XP comes from another ACCOUNT's completed attempt, never from a guest or the creator", async () => {
    fc.tables.challenges.push({ id: "ch1", creator_user_id: J, public_code: "EC-AAAA-BBBB" });
    fc.tables.challenge_attempts.push({ id: "resp-acct", challenge_id: "ch1", user_id: B, status: "completed", challenge_outcome: "creator" }, { id: "resp-guest", challenge_id: "ch1", user_id: null, status: "completed", challenge_outcome: "recipient" }, { id: "resp-open", challenge_id: "ch1", user_id: B, status: "started" });
    const r = await S.reconcileProgression({ userId: J });
    const keys = r.delta.awarded.map((a) => `${a.sourceType}:${a.sourceId}:${a.reason}`);
    expect(keys).toContain("challenge_attempt:resp-acct:creator_response");
    expect(keys).not.toContain("challenge_attempt:resp-guest:creator_response"); expect(keys).not.toContain("challenge_attempt:resp-open:creator_response");
    expect(r.achievements.find((a) => a.id === "challenger").unlocked).toBe(true);
  });
  it("refuses an invalid or unknown user, and the compact block carries no ids", async () => {
    expect((await S.reconcileProgression({ userId: "nope" })).status).toBe("invalid_user");
    expect((await S.reconcileProgression({ userId: "33333333-3333-4333-8333-333333333333" })).status).toBe("apply_failed");
    fc.tables.saved_clashes.push(clash(J, "cmp001"));
    const c = S.compactProgression(await S.reconcileProgression({ userId: J }));
    expect(c.status).toBe("ok"); expect(c.xpDelta).toBe(100 + 25 + 50 + 150);
    expect(JSON.stringify(c)).not.toMatch(/user_id|userId|result_id|1111-4111/);
    expect(c.unlocked.map((u) => u.id).sort()).toEqual(["first_chaos", "first_clash", "first_win"]);
  });
  it("two accounts never share a ledger", async () => {
    fc.tables.saved_clashes.push(clash(J, "iso001"), clash(B, "iso002"));
    const a = await S.reconcileProgression({ userId: J }), b = await S.reconcileProgression({ userId: B });
    expect(a.profile.totalXp).toBe(b.profile.totalXp);
    expect(fc.tables.xp_ledger.filter((r) => r.user_id === J).every((r) => r.source_id !== "iso002")).toBe(true);
    expect(a.facts.clashes).toBe(1); expect(b.facts.clashes).toBe(1);
  });
});
