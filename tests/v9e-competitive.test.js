// ── Phase 9E: Competitive Rating + Leaderboards V1 ────────────────────────────
// The pure contract (Elo math, K, floor, eligibility, chronological replay,
// placement, ordering, projection), the schema's promises, and the server
// library through the fake cloud — pinned without a live Postgres.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as C from "../src/competitive/contract.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";
import { PREF_SCHEMA, cleanPrefs } from "../src/accounts/careerV2.js";
import { CAREER_TAB_IDS } from "../src/accounts/careerV2.js";

const read = (p) => readFileSync(p, "utf8");
const SQL = read("supabase/migrations/0006_competitive_rating_v1.sql");
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", K = "33333333-3333-4333-8333-333333333333";

describe("rating contract 1.0.0", () => {
  it("pins the constants", () => {
    expect(C.COMPETITIVE_RATING_VERSION).toBe("1.0.0"); expect(C.COMPETITIVE_RATING_POWER_EFFECT).toBe(0);
    expect(C.INITIAL_RATING).toBe(1000); expect(C.RATING_FLOOR).toBe(100); expect(C.K_PROVISIONAL).toBe(40); expect(C.K_ESTABLISHED).toBe(24); expect(C.K_SWITCH_MATCHES).toBe(10);
    expect(C.PLACEMENT).toEqual({ matches: 5, uniqueOpponents: 3 }); expect(C.RATED_PAIR_LIMIT).toBe(3); expect(C.RATED_PAIR_WINDOW_DAYS).toBe(7);
  });
  it("expected score, K by matches, deterministic rounding, floor", () => {
    expect(C.expectedScore(1000, 1000)).toBe(0.5); expect(C.expectedScore(1000, 1200)).toBe(0.2403); expect(C.expectedScore(1200, 1000)).toBe(0.7597);
    expect(C.kFactor(0)).toBe(40); expect(C.kFactor(9)).toBe(40); expect(C.kFactor(10)).toBe(24);
    expect(C.roundHalfAway(2.5)).toBe(3); expect(C.roundHalfAway(-2.5)).toBe(-3); expect(C.roundHalfAway(-0.4)).toBe(0);
    const win = C.rateMatch({ creator: { rating: 1000, matches: 0 }, recipient: { rating: 1000, matches: 0 }, outcome: "recipient" });
    expect(win.creator).toMatchObject({ before: 1000, expected: 0.5, k: 40, delta: -20, after: 980 }); expect(win.recipient).toMatchObject({ delta: 20, after: 1020 });
    const loss = C.rateMatch({ creator: { rating: 1000, matches: 12 }, recipient: { rating: 1000, matches: 0 }, outcome: "creator" });
    expect(loss.creator.delta).toBe(12); expect(loss.recipient.delta).toBe(-20);
    const tie = C.rateMatch({ creator: { rating: 1100, matches: 12 }, recipient: { rating: 1000, matches: 0 }, outcome: "tie" });
    expect(tie.creator).toMatchObject({ expected: 0.6401, k: 24, delta: -3, after: 1097 }); expect(tie.recipient).toMatchObject({ expected: 0.3599, k: 40, delta: 6, after: 1006 });
    const floor = C.rateMatch({ creator: { rating: 105, matches: 0 }, recipient: { rating: 1500, matches: 0 }, outcome: "recipient" });
    expect(floor.creator.after).toBeGreaterThanOrEqual(100); expect(floor.creator.after).toBe(floor.creator.before + floor.creator.delta);
    expect(C.rateMatch({ creator: { rating: 101, matches: 0 }, recipient: { rating: 101, matches: 0 }, outcome: "recipient" }).creator.after).toBe(100);
    expect(C.rateMatch({ creator: {}, recipient: {}, outcome: "nope" })).toBeNull();
  });
  it("the SQL mirror uses the same constants and rounding", () => {
    expect(SQL).toMatch(/round\(1 \/ \(1 \+ power\(10::numeric, \(pr\.current_rating - pc\.current_rating\)::numeric \/ 400\)\), 4\)/);
    expect(SQL).toMatch(/case when pc\.rated_matches < 10 then 40 else 24 end/);
    expect(SQL).toMatch(/greatest\(100, pc\.current_rating \+ da\)/);
    expect(SQL).toMatch(/current_rating\s+integer not null default 1000/);
    expect(SQL).toMatch(/rated_matches \+ 1 >= 5 and c_opp >= 3/);
  });
  it("eligibility: two accounts, completed, not self, not already rated, inside the pair window", () => {
    const base = { creatorUserId: J, recipientUserId: B, status: "completed", challengeOutcome: "creator" };
    expect(C.eligibility(base)).toEqual({ rated: true, reason: null });
    expect(C.eligibility({ ...base, recipientUserId: null }).reason).toBe("guest_participant");
    expect(C.eligibility({ ...base, recipientUserId: J }).reason).toBe("same_account");
    expect(C.eligibility({ ...base, status: "started" }).reason).toBe("not_completed");
    expect(C.eligibility({ ...base, pairRatedInWindow: 3 }).reason).toBe("repeat_opponent_limit");
    expect(C.eligibility({ ...base, pairRatedInWindow: 2 }).rated).toBe(true);
    expect(C.eligibility({ ...base, alreadyRated: true }).reason).toBe("already_rated");
    for (const r of Object.values(C.UNRATED_REASONS)) expect(C.UNRATED_COPY[r]).toBeTruthy();
  });
});

describe("chronological replay (the backfill's expectation)", () => {
  const at = (i, c, r, o, day, hour = 0) => ({ id: `a${i}`, challenge_id: `c${i}`, creator_user_id: c, recipient_user_id: r, challenge_outcome: o, status: "completed", completed_at: `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z` });
  it("rates A vs B, A vs C, B vs C, C vs A, B vs A in completion order, order-dependently", () => {
    const list = [at(1, "A", "B", "recipient", 1), at(2, "A", "C", "creator", 2), at(3, "B", "C", "tie", 3), at(4, "C", "A", "recipient", 4), at(5, "B", "A", "creator", 5)];
    const rep = C.replayRatings(list);
    expect(rep.events.map((e) => `${e.creator.before}/${e.recipient.before}`)).toEqual(["1000/1000", "980/1000", "1020/979", "981/1001", "1018/1020"]);
    expect(rep.profiles.A).toMatchObject({ rating: 1000, matches: 4, wins: 2, losses: 2, uniqueOpponents: 2, placed: false });
    expect(rep.profiles.B).toMatchObject({ rating: 1038, matches: 3, wins: 2, losses: 0, ties: 1 });
    expect(rep.profiles.C).toMatchObject({ rating: 962, matches: 3, wins: 0, losses: 2, ties: 1 });
    // shuffled input, same answer: the order is the timestamps', not the array's
    const shuffled = C.replayRatings([list[3], list[0], list[4], list[2], list[1]]);
    expect(shuffled.profiles).toEqual(rep.profiles);
    // a different completion order gives different numbers — Elo is order-dependent, so the order is frozen
    const swapped = C.replayRatings([{ ...list[0], completed_at: list[4].completed_at }, { ...list[4], completed_at: list[0].completed_at }, list[1], list[2], list[3]]);
    expect(swapped.events[0].attempt_id).toBe("a5"); expect(swapped.events.map((e) => e.attempt_id)).not.toEqual(rep.events.map((e) => e.attempt_id));
    expect(JSON.stringify(swapped.events.map((e) => [e.creator.before, e.recipient.before]))).not.toBe(JSON.stringify(rep.events.map((e) => [e.creator.before, e.recipient.before])));
  });
  it("placement needs five matches AND three opponents; the pair window leaves the fourth rematch unrated", () => {
    const list = [1, 2, 3, 4].map((i) => at(i, "A", "B", "creator", 1, i));
    const rep = C.replayRatings(list);
    expect(rep.events).toHaveLength(3); expect(rep.skipped).toHaveLength(1); expect(rep.skipped[0].reason).toBe("repeat_opponent_limit");
    const later = C.replayRatings([...list, at(9, "A", "B", "creator", 9)]);   // eight days on, the window has passed
    expect(later.events).toHaveLength(4);
    const many = C.replayRatings([at(1, "A", "B", "creator", 1), at(2, "A", "C", "creator", 2), at(3, "A", "D", "creator", 3), at(4, "A", "E", "creator", 4), at(5, "A", "F", "creator", 5)]);
    expect(many.profiles.A).toMatchObject({ matches: 5, uniqueOpponents: 5, placed: true }); expect(many.profiles.B.placed).toBe(false);
    const sameOpp = C.replayRatings([at(1, "A", "B", "creator", 1), at(2, "A", "B", "creator", 2), at(3, "A", "B", "creator", 3), at(4, "A", "B", "creator", 11), at(5, "A", "B", "creator", 12)]);
    expect(sameOpp.profiles.A).toMatchObject({ matches: 5, uniqueOpponents: 1, placed: false });
    expect(C.isPlaced({ rated_matches: 5, unique_opponents: 3 })).toBe(true); expect(C.isPlaced({ rated_matches: 5, unique_opponents: 2 })).toBe(false); expect(C.isPlaced({ rated_matches: 4, unique_opponents: 3 })).toBe(false);
    expect(C.placementProgress({ rated_matches: 3, unique_opponents: 2 })).toEqual({ matches: 3, matchesTarget: 5, opponents: 2, opponentsTarget: 3, placed: false });
  });
  it("streak and win percentage derive from rated outcomes only", () => {
    const evs = [{ outcome: "creator", creator_user_id: "A", recipient_user_id: "B", completed_at: "2026-09-03" }, { outcome: "creator", creator_user_id: "B", recipient_user_id: "A", completed_at: "2026-09-02" }, { outcome: "recipient", creator_user_id: "A", recipient_user_id: "B", completed_at: "2026-09-01" }];
    expect(C.streakOf(evs, "A")).toBe("W1"); expect(C.streakOf(evs, "B")).toBe("L1"); expect(C.streakOf([], "A")).toBeNull();
    expect(C.winPct(18, 30)).toBe(60); expect(C.winPct(0, 0)).toBeNull(); expect(C.recordLine({ rated_wins: 18, rated_losses: 11, rated_ties: 1 })).toBe("18–11–1");
  });
});

describe("leaderboard contract", () => {
  it("orders by rating, wins, fewer losses, earlier attainment, then id — deterministically; ranks are derived", () => {
    const rows = [
      { user_id: "x", current_rating: 1100, rated_wins: 3, rated_losses: 1, last_rated_at: "2026-01-02" },
      { user_id: "y", current_rating: 1100, rated_wins: 3, rated_losses: 1, last_rated_at: "2026-01-01" },
      { user_id: "w", current_rating: 1100, rated_wins: 3, rated_losses: 0, last_rated_at: "2026-01-03" },
      { user_id: "z", current_rating: 1150, rated_wins: 1, rated_losses: 5 },
      { user_id: "v", current_rating: 1100, rated_wins: 4, rated_losses: 4 },
    ];
    expect(C.orderLeaderboard(rows).map((r) => `${r.user_id}#${r.rank}`)).toEqual(["z#1", "v#2", "w#3", "y#4", "x#5"]);
    expect(C.orderLeaderboard([...rows].reverse()).map((r) => r.user_id)).toEqual(["z", "v", "w", "y", "x"]);
    expect(C.ORDERING).toEqual(["current_rating desc", "rated_wins desc", "rated_losses asc", "last_rated_at asc", "user_id asc"]);
    expect(SQL).toMatch(/order by e\.current_rating desc, e\.rated_wins desc, e\.rated_losses asc, e\.last_rated_at asc, e\.user_id asc/);
  });
  it("only public AND placed accounts are eligible; the projection carries no identity beyond the display name", () => {
    expect(C.leaderboardEligible({ rated_matches: 5, unique_opponents: 3 }, "public")).toBe(true);
    expect(C.leaderboardEligible({ rated_matches: 5, unique_opponents: 3 }, "private")).toBe(false);
    expect(C.leaderboardEligible({ rated_matches: 4, unique_opponents: 3 }, "public")).toBe(false);
    const row = C.publicRow({ rank: 1, display_name: "Joseph", current_rating: 1146, rated_wins: 18, rated_losses: 11, rated_ties: 1, rated_matches: 30, career_level: 12, streak: "W3", user_id: "leak", email: "leak" });
    expect(Object.keys(row).sort()).toEqual([...C.PUBLIC_ROW_FIELDS].sort());
    for (const f of C.FORBIDDEN_PUBLIC_FIELDS) expect(JSON.stringify(row)).not.toContain(`"${f}"`);
    expect(row).toMatchObject({ initials: "J", winPct: 60, level: 12 });
    expect(C.announceRow(row)).toBe("Rank 1. Joseph. Competitive Rating 1,146. Record 18 wins, 11 losses, 1 tie.");
    expect(C.announceChange(18, 1146)).toBe("Competitive Rating increased by 18 to 1,146."); expect(C.announceChange(-18, 1128)).toBe("Competitive Rating decreased by 18 to 1,128.");
    expect(C.rankBucket(3)).toBe("top10"); expect(C.rankBucket(38)).toBe("top100"); expect(C.rankBucket(140)).toBe("beyond"); expect(C.rankBucket(null)).toBe("unranked");
    expect(C.LEADERBOARD_LIMIT).toBe(100); expect(C.AROUND_ME_SPAN).toBe(2);
  });
  it("visibility is a closed preference, private by default, in the 9B.2 vocabulary and the SQL check", () => {
    expect(C.VISIBILITY).toEqual(["private", "public"]); expect(C.VISIBILITY_DEFAULT).toBe("private");
    expect(PREF_SCHEMA.leaderboard_visibility).toEqual({ values: ["private", "public"], default: "private" });
    expect(cleanPrefs({ leaderboard_visibility: "public" })).toEqual({ leaderboard_visibility: "public" });
    expect(cleanPrefs({ leaderboard_visibility: "everyone" })).toEqual({});
    expect(SQL).toMatch(/or p ->> 'leaderboard_visibility' in \('private', 'public'\)/);
    expect(SQL).toMatch(/up\.prefs ->> 'leaderboard_visibility' = 'public'/);
  });
  it("no new tab, and no XP or level leaderboard", () => {
    expect(CAREER_TAB_IDS).toEqual(["overview", "history", "rosters", "favorites", "challenges", "achievements", "account"]);
    expect(SQL).not.toMatch(/over \(order by[^)]*(total_xp|career_level|xp_)/);   // level is context beside a name, never the ranking key
    expect(read("src/components/competitive/LeaderboardPage.jsx")).not.toMatch(/TOP XP|TOP LEVEL|MOST ACHIEVEMENTS/);
  });
});

describe("telemetry", () => {
  it("six closed events, allowlisted and mirrored, metadata without identity", () => {
    expect(Object.values(C.COMPETITIVE_EVENTS)).toHaveLength(6);
    for (const e of Object.values(C.COMPETITIVE_EVENTS)) { expect(EVENTS_ALLOWLIST.has(e), e).toBe(true); expect(ACTIVATION_EVENTS).toContain(e); }
    for (const k of ["displayName", "email", "userId", "accountId", "code", "challengeId", "attemptId", "token", "sessionId", "history"]) expect(C.EVENT_METADATA_ALLOWED).not.toContain(k);
  });
});

describe("COMPETITIVE_RATING_POWER_EFFECT = 0", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it("no game, draft, era, coach, placement, challenge-seed or progression-contract path reads the rating; the rating reads none of them", () => {
    const paths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js", "src/entitlements.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/components/arena/guidedState.js", "src/challenges/contract.js", "api/_lib/challenges.js", "src/progression/contract.js"].filter(existsSync);
    for (const p of paths) expect(read(p), p).not.toMatch(/competitive\/contract|competitive_|COMPETITIVE_RATING|leaderboard_visibility|current_rating/);   // identifiers, not the English word
    const mine = read("src/competitive/contract.js") + read("api/_lib/competitive.js");
    expect(mine).not.toMatch(/from ["'][^"']*(chaos\/runState|engine\.js|draft\.js|game-core|previewEngine|entitlements|progression\/contract)["']/);
    expect(mine).not.toMatch(/total_xp|career_level = |xpDelta/);
  });
  it("the route reads no rating, delta, K, outcome or user id from any request", () => {
    const route = read("api/profile.js");
    expect(route).not.toMatch(/req\.body\?\.(rating|ratingBefore|ratingAfter|delta|expected|k|kFactor|outcome|userId|user_id|attemptId|attempt_id)/);
    const block = route.split("Phase 9E competitive actions")[1].split("Phase 9B.1 cloud-career actions")[0];
    expect(block).toMatch(/if \(token && !verified\) return res\.status\(401\)/);
    expect(block).toMatch(/competitiveMe\(\{ userId: who\.userId \}\)/);
    expect(read("api/profile.js")).toMatch(/rateChallengeCompletion\(\{ chaosRunId, callerUserId: who\.userId \}\)/);
  });
});

describe("the schema keeps its promises", () => {
  it("two tables, RLS on both, select-only grants, own-row policies, immutable events, guarded profile", () => {
    for (const t of ["competitive_profiles", "competitive_rating_events"]) {
      expect(SQL).toMatch(new RegExp(`create table if not exists public\\.${t}`));
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`));
      expect(SQL).toMatch(new RegExp(`grant select on public\\.${t}\\s+to authenticated`));
    }
    expect(SQL).not.toMatch(/grant (insert|update|delete)/); expect(SQL).not.toMatch(/create policy \w+ on public\.\w+\s+for (insert|update|delete)/);
    expect(SQL).toMatch(/competitive_profiles_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/);
    expect(SQL).toMatch(/competitive_events_select_own[\s\S]*using \(creator_user_id = auth\.uid\(\) or recipient_user_id = auth\.uid\(\)\)/);
    expect(SQL).toMatch(/constraint competitive_events_once\s+unique \(challenge_attempt_id, rating_version\)/);
    expect(SQL).toMatch(/create trigger competitive_events_immutable_trg before update or delete on public\.competitive_rating_events/);
    expect(SQL).toMatch(/COMPETITIVE_RATING_FORGED/); expect(SQL).toMatch(/COMPETITIVE_RECORD_FORGED/);
    expect(SQL).toMatch(/competitive_profiles[\s\S]*references auth\.users \(id\) on delete cascade/);
    expect(SQL).toMatch(/creator_user_id\s+uuid references auth\.users \(id\) on delete set null/);
  });
  it("four SECURITY DEFINER functions, none executable by a client role, serialised per pair", () => {
    for (const f of ["competitive_rate_attempt(uuid, text, integer, integer)", "competitive_reconcile(text, integer, integer, integer)", "competitive_leaderboard(integer, integer)", "competitive_rank_of(uuid, integer)"]) {
      expect(SQL).toContain(`revoke execute on function public.${f} from public, anon, authenticated`);
    }
    expect(SQL).toMatch(/pg_advisory_xact_lock\(hashtext\('competitive:' \|\| lo::text\)\)/);
    expect(SQL).toMatch(/order by at\.completed_at asc, at\.id asc/);
    expect(SQL).toMatch(/cp\.rated_matches >= 5 and cp\.unique_opponents >= 3/);
    expect(SQL).toMatch(/insert into public\.schema_migrations \(version\) values \('0006_competitive_rating_v1'\)/);
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12);
  });
});

// ── the server library, through the fake cloud ───────────────────────────────
describe("the server library", () => {
  let fc, S;
  const ch = (id, creator) => ({ id, creator_user_id: creator, public_code: `EC-AAAA-${id.slice(-4).toUpperCase().replace(/[^A-Z2-9]/g, "B").padEnd(4, "B")}`, creator_display_snapshot: fc.tables.profiles.find((p) => p.user_id === creator)?.display_name || "Coach" });
  const at = (id, challenge_id, user, outcome, when) => ({ id, challenge_id, user_id: user, status: "completed", challenge_outcome: outcome, completed_at: when, display_snapshot: fc.tables.profiles.find((p) => p.user_id === user)?.display_name || "Guest" });
  beforeEach(async () => {
    process.env.ECLASH_TEST_MEMORY_STORE = "1";
    const { installFakeCloud } = await import("../scripts/lib/fakeCloud.mjs");
    fc = installFakeCloud({ users: [{ userId: J, displayName: "Joseph" }, { userId: B, displayName: "Bea" }, { userId: K, displayName: "Kai" }] });
    S = await import("../api/_lib/competitive.js");
  });
  it("rates an account-vs-account completion once; a repeat answers already_rated with the same event", async () => {
    fc.tables.challenges.push(ch("ch01", J)); fc.tables.challenge_attempts.push(at("at01", "ch01", B, "recipient", "2026-09-01T00:00:00Z"));
    const r1 = await S.rateAttempt({ attemptId: "at01" });
    expect(r1).toMatchObject({ status: "ok", rated: true, outcome: "recipient" }); expect(r1.creator).toMatchObject({ before: 1000, delta: -20, after: 980 }); expect(r1.recipient).toMatchObject({ before: 1000, delta: 20, after: 1020 });
    expect((await S.rateAttempt({ attemptId: "at01" }))).toMatchObject({ rated: false, reason: "already_rated" });
    expect(fc.tables.competitive_rating_events).toHaveLength(1);
    expect(fc.tables.competitive_profiles.find((p) => p.user_id === B)).toMatchObject({ current_rating: 1020, rated_wins: 1, rated_matches: 1, unique_opponents: 1 });
  });
  it("guest, self and repeat-opponent attempts are unrated with their reasons; unrelated attempts still rate", async () => {
    fc.tables.challenges.push(ch("ch02", J), ch("ch03", J), ch("ch04", J));
    fc.tables.challenge_attempts.push(at("g1", "ch02", null, "recipient", "2026-09-01T00:00:00Z"), at("s1", "ch03", J, "creator", "2026-09-01T00:00:00Z"));
    expect((await S.rateAttempt({ attemptId: "g1" })).reason).toBe("guest_participant");
    expect((await S.rateAttempt({ attemptId: "s1" })).reason).toBe("same_account");
    for (let i = 1; i <= 4; i++) { fc.tables.challenges.push(ch(`chp${i}`, J)); fc.tables.challenge_attempts.push(at(`p${i}`, `chp${i}`, B, "creator", `2026-09-02T0${i}:00:00Z`)); }
    const outs = []; for (let i = 1; i <= 4; i++) outs.push(await S.rateAttempt({ attemptId: `p${i}` }));
    expect(outs.map((o) => o.rated)).toEqual([true, true, true, false]); expect(outs[3].reason).toBe("repeat_opponent_limit");
    fc.tables.challenges.push(ch("chk", K)); fc.tables.challenge_attempts.push(at("k1", "chk", B, "recipient", "2026-09-02T05:00:00Z"));
    expect((await S.rateAttempt({ attemptId: "k1" })).rated).toBe(true);
    expect(fc.tables.competitive_rating_events).toHaveLength(4);
  });
  it("reconcile rates pending attempts oldest first and matches the contract's replay; a second run rates nothing", async () => {
    const list = [["a1", J, B, "recipient", "2026-09-01"], ["a2", J, K, "creator", "2026-09-02"], ["a3", B, K, "tie", "2026-09-03"], ["a4", K, J, "recipient", "2026-09-04"], ["a5", B, J, "creator", "2026-09-05"]];
    for (const [id, c, r, o, d] of list) { fc.tables.challenges.push(ch(`c${id}`, c)); fc.tables.challenge_attempts.push(at(id, `c${id}`, r, o, `${d}T00:00:00Z`)); }
    const rep = C.replayRatings(list.map(([id, c, r, o, d]) => ({ id, challenge_id: `c${id}`, creator_user_id: c, recipient_user_id: r, challenge_outcome: o, status: "completed", completed_at: `${d}T00:00:00Z` })));
    const out = await S.reconcileRatings({});
    expect(out).toMatchObject({ status: "ok", seen: 5, rated: 5, skipped: 0 });
    const events = fc.tables.competitive_rating_events;
    expect(events.map((e) => `${e.creator_rating_before}/${e.recipient_rating_before}→${e.creator_rating_after}/${e.recipient_rating_after}`)).toEqual(rep.events.map((e) => `${e.creator.before}/${e.recipient.before}→${e.creator.after}/${e.recipient.after}`));
    for (const [u, p] of Object.entries(rep.profiles)) expect(fc.tables.competitive_profiles.find((x) => x.user_id === u)).toMatchObject({ current_rating: p.rating, rated_matches: p.matches, rated_wins: p.wins, rated_losses: p.losses, rated_ties: p.ties, unique_opponents: p.uniqueOpponents });
    expect(await S.reconcileRatings({})).toMatchObject({ seen: 0, rated: 0, skipped: 0 }); expect(fc.tables.competitive_rating_events).toHaveLength(5);
  });
  it("competitive-me is the account's own state; the leaderboard shows public AND placed accounts only; around-me needs both", async () => {
    const opps = [B, K, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
    for (const o of opps.slice(2)) fc.tables.profiles.push({ user_id: o, display_name: `Opp ${o[0]}` });
    opps.forEach((o, i) => { fc.tables.challenges.push(ch(`cm${i}`, J)); fc.tables.challenge_attempts.push(at(`m${i}`, `cm${i}`, o, i === 0 ? "recipient" : "creator", `2026-09-0${i + 1}T00:00:00Z`)); });
    const me = await S.competitiveMe({ userId: J });
    expect(me).toMatchObject({ status: "ok", provisional: false, visibility: "private", rank: null }); expect(me.record).toMatchObject({ wins: 4, losses: 1, matches: 5 }); expect(me.placement.placed).toBe(true); expect(me.history).toHaveLength(5); expect(me.streak).toBe("W4");
    expect(JSON.stringify(me)).not.toMatch(/user_id|1111-4111|2222-4222|email/);
    expect((await S.leaderboard({})).rows).toEqual([]);                    // placed but private
    fc.tables.user_preferences.push({ user_id: J, prefs: { leaderboard_visibility: "public" } });
    const board = await S.leaderboard({});
    expect(board.rows).toHaveLength(1); expect(board.rows[0]).toMatchObject({ rank: 1, displayName: "Joseph", wins: 4, losses: 1 }); expect(Object.keys(board.rows[0]).sort()).toEqual([...C.PUBLIC_ROW_FIELDS].sort());
    fc.tables.user_preferences.push({ user_id: B, prefs: { leaderboard_visibility: "public" } });   // public but provisional: excluded
    expect((await S.leaderboard({})).rows).toHaveLength(1);
    expect((await S.aroundMe({ userId: B })).available).toBe(false); expect((await S.aroundMe({ userId: J })).rows[0]).toMatchObject({ isMe: true, rank: 1 });
    expect((await S.competitiveMe({ userId: J })).rank).toBe(1);
    const bea = await S.competitiveMe({ userId: B }); expect(bea.rank).toBeNull(); expect(bea.provisional).toBe(true); expect(bea.placement).toMatchObject({ matches: 1, opponents: 1 });
  });
  it("the completion hook answers from the caller's side and never for an observer", async () => {
    fc.tables.challenges.push(ch("chh", J)); fc.tables.challenge_attempts.push(at("ath", "chh", B, "creator", "2026-09-01T00:00:00Z"));
    const { setJSON } = await import("../api/_lib/store.js");
    await setJSON("chaos-run:runhook00001", { chaosRunId: "runhook00001", session: "s", status: "SIMULATED", resultId: "abc123", challengeAttemptId: "ath" });
    const asBea = await S.rateChallengeCompletion({ chaosRunId: "runhook00001", callerUserId: B });
    expect(asBea).toMatchObject({ status: "ok", rated: true, perspective: "recipient" }); expect(asBea.you).toMatchObject({ delta: -20, after: 980 }); expect(asBea.them).toMatchObject({ name: "Joseph", delta: 20 });
    const asGuest = await S.rateChallengeCompletion({ chaosRunId: "runhook00001", callerUserId: null });
    expect(asGuest.rated).toBe(true); expect(asGuest.you).toBeNull();
    const asJoseph = await S.rateChallengeCompletion({ chaosRunId: "runhook00001", callerUserId: J });
    expect(asJoseph.perspective).toBe("creator"); expect(asJoseph.you.delta).toBe(20);
    expect(fc.tables.competitive_rating_events).toHaveLength(1);
    fc.tables.challenges.push(ch("chg", J)); fc.tables.challenge_attempts.push(at("atg", "chg", null, "recipient", "2026-09-01T00:00:00Z"));
    await setJSON("chaos-run:runhook00002", { chaosRunId: "runhook00002", session: "s", status: "SIMULATED", resultId: "abc124", challengeAttemptId: "atg" });
    expect(await S.rateChallengeCompletion({ chaosRunId: "runhook00002", callerUserId: J })).toMatchObject({ rated: false, reason: "guest_participant" });
  });
});
