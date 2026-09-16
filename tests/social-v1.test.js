// ── Shareable Clash Cards + Rivalries V1 ─────────────────────────────────────
// The pure contracts (card allowlists and models; rivalry states, eligibility,
// outcome mapping, record, streak), the schema's promises (0008), the server
// route's authority rules and the function budget — pinned without a live
// Postgres. The behavioural two-account flows run in scripts/social/socialQa.mjs
// on the fake cloud, and the SQL itself was exercised on the Preview database.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import * as R from "../src/rivalries/contract.js";
import * as K from "../src/cards/contract.js";
import { PUBLIC_INVITATION_FIELDS } from "../src/challenges/contract.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";
import { buildAccountExport, CAREER_TAB_IDS } from "../src/accounts/careerV2.js";

const read = (p) => readFileSync(p, "utf8");
const SQL = read("supabase/migrations/0008_rivalries_v1.sql");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("rivalry contract 1.0.0", () => {
  it("pins the version and the bounded request constants", () => {
    expect(R.RIVALRY_CONTRACT_VERSION).toBe("1.0.0");
    expect(R.REQUEST_TTL_DAYS).toBe(7); expect(R.REQUESTS_PER_DAY).toBe(10); expect(R.MAX_OUTGOING_PENDING).toBe(5);
    expect(R.DECLINE_COOLDOWN_DAYS).toBe(7); expect(R.CLOSE_COOLDOWN_DAYS).toBe(1);
    expect(SQL).toContain("p_ttl_days"); expect(SQL).toContain("make_interval(days => greatest(1, p_ttl_days))");
  });
  it("three states; the recipient may accept/decline/block, the sender may cancel, a member may end; a block can be lifted", () => {
    expect(Object.values(R.STATE).sort()).toEqual(["active", "idle", "pending"]);
    expect(R.allowedActions({ state: "pending", pendingFromMe: false })).toEqual(["accept", "decline", "block"]);
    expect(R.allowedActions({ state: "pending", pendingFromMe: true })).toEqual(["cancel"]);
    expect(R.allowedActions({ state: "active" })).toEqual(["end", "block"]);
    expect(R.allowedActions({ state: "idle", blockedByMe: true })).toEqual(["unblock"]);
    expect(R.allowedActions({ state: "idle" })).toEqual([]);
  });
  it("an expired request reads as idle and cannot be accepted", () => {
    const row = { state: "pending", pending_expires_at: "2000-01-01T00:00:00Z" };
    expect(R.requestExpired(row)).toBe(true); expect(R.effectiveState(row)).toBe("idle");
    expect(SQL).toMatch(/if r\.pending_expires_at <= now\(\) then[\s\S]*?return jsonb_build_object\('status', 'expired'\)/);
  });
  it("the pair is canonical (lower uuid first) in JS and in the schema", () => {
    expect(R.canonicalPair(B, A)).toEqual([A, B]); expect(R.canonicalPair(A, B)).toEqual([A, B]);
    expect(SQL).toMatch(/constraint rivalries_pair_order\s+check \(user_low < user_high\)/);
    expect(SQL).toMatch(/constraint rivalries_pair_unique\s+unique \(user_low, user_high\)/);
    expect(SQL).toContain("pg_advisory_xact_lock(hashtext('rivalry:' || lo::text || ':' || hi::text))");
  });
});

describe("which comparisons count", () => {
  const period = { started_at: "2026-09-10T00:00:00Z", ended_at: null };
  const base = { status: "completed", challengeOutcome: "creator", creatorUserId: A, recipientUserId: B, attemptStartedAt: "2026-09-11T00:00:00Z", period };
  it("counts a completed account-vs-account attempt STARTED inside the period, once", () => {
    expect(R.eligibility(base)).toEqual({ eligible: true, reason: "ok" });
    expect(R.eligibility({ ...base, alreadyRecorded: true }).reason).toBe("already_recorded");
  });
  it("does not count guests, self, incomplete attempts, non-rivals, or attempts that predate acceptance", () => {
    expect(R.eligibility({ ...base, recipientUserId: null }).reason).toBe("guest_participant");
    expect(R.eligibility({ ...base, recipientUserId: A }).reason).toBe("same_account");
    expect(R.eligibility({ ...base, status: "started", challengeOutcome: null }).reason).toBe("not_completed");
    expect(R.eligibility({ ...base, period: null }).reason).toBe("not_rivals");
    expect(R.eligibility({ ...base, attemptStartedAt: "2026-09-09T23:59:59Z" }).reason).toBe("not_in_period");
  });
  it("an attempt started before the period ended still settles into it; one started after does not", () => {
    const ended = { started_at: "2026-09-10T00:00:00Z", ended_at: "2026-09-12T00:00:00Z" };
    expect(R.eligibility({ ...base, period: ended, attemptStartedAt: "2026-09-11T23:00:00Z" }).eligible).toBe(true);
    expect(R.eligibility({ ...base, period: ended, attemptStartedAt: "2026-09-12T00:00:00Z" }).reason).toBe("not_in_period");
    expect(SQL).toContain("a.started_at >= p.started_at and (p.ended_at is null or a.started_at < p.ended_at)");
  });
  it("maps creator/recipient/tie to the low side so A's win is B's loss and a tie is a tie for both", () => {
    expect(R.lowOutcome({ challengeOutcome: "creator", creatorUserId: A, recipientUserId: B })).toBe("win");
    expect(R.lowOutcome({ challengeOutcome: "recipient", creatorUserId: A, recipientUserId: B })).toBe("loss");
    expect(R.lowOutcome({ challengeOutcome: "creator", creatorUserId: B, recipientUserId: A })).toBe("loss");
    expect(R.lowOutcome({ challengeOutcome: "tie", creatorUserId: A, recipientUserId: B })).toBe("tie");
    const events = [{ id: "1", low_outcome: "win", completed_at: "2026-09-11T00:00:00Z" }, { id: "2", low_outcome: "loss", completed_at: "2026-09-12T00:00:00Z" }, { id: "3", low_outcome: "tie", completed_at: "2026-09-13T00:00:00Z" }];
    const a = R.recordFor(events, A, A), b = R.recordFor(events, B, A);
    expect(a).toEqual({ wins: 1, losses: 1, ties: 1, total: 3 }); expect(b).toEqual({ wins: 1, losses: 1, ties: 1, total: 3 });
    expect(a.wins).toBe(b.losses); expect(a.losses).toBe(b.wins); expect(a.ties).toBe(b.ties);
  });
  it("the streak is consecutive wins from the newest event; a tie or loss ends it; null with no events", () => {
    const newestFirst = [{ id: "3", low_outcome: "win", completed_at: "2026-09-13T00:00:00Z" }, { id: "2", low_outcome: "win", completed_at: "2026-09-12T00:00:00Z" }, { id: "1", low_outcome: "tie", completed_at: "2026-09-11T00:00:00Z" }, { id: "0", low_outcome: "win", completed_at: "2026-09-10T00:00:00Z" }];
    expect(R.winStreak(newestFirst, A, A)).toBe(2); expect(R.winStreak(newestFirst, B, A)).toBe(0); expect(R.winStreak([], A, A)).toBeNull();
    expect(R.recordLine({ wins: 4, losses: 3, ties: 1, total: 8 })).toBe("YOU LEAD 4–3");
    expect(R.recordLine({ wins: 2, losses: 2, ties: 0, total: 4 })).toBe("TIED 2–2");
    expect(R.recordLine({ wins: 0, losses: 0, ties: 0, total: 0 })).toBe("NO COMPARISONS YET");
  });
  it("orders newest first by completed_at then id — the documented stable key, mirrored in SQL", () => {
    const list = [{ id: "a", completed_at: "2026-09-10T00:00:00Z" }, { id: "b", completed_at: "2026-09-10T00:00:00Z" }, { id: "c", completed_at: "2026-09-11T00:00:00Z" }].sort(R.compareEventsNewestFirst);
    expect(list.map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(SQL).toContain("order by e.completed_at desc, e.id desc");
    expect(SQL).toContain("order by at.completed_at asc, at.id asc");
  });
  it("awards nothing: no XP, Elo, bonus or achievement path in the rivalry code", () => {
    const src = SQL + read("api/_lib/rivalries.js") + read("src/rivalries/contract.js");
    expect(src).not.toMatch(/xp_ledger|progression_apply|competitive_rate_attempt|rating_delta|bonus|achievement_unlocks/);
    expect(SQL).toContain("is_rated := exists (select 1 from public.competitive_rating_events e where e.challenge_attempt_id = a.id)");
  });
});

describe("the schema (0008) as written", () => {
  it("follows the actual sequence and records its version", () => {
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    expect(files.at(-1)).toBe("0008_rivalries_v1.sql"); expect(files.at(-2)).toBe("0007_public_competitive_profiles_v1.sql");
    expect(SQL).toContain("insert into public.schema_migrations (version) values ('0008_rivalries_v1')");
  });
  it("is additive: no alter/drop of an existing table, function or policy", () => {
    expect(SQL).not.toMatch(/alter table public\.(challenges|challenge_attempts|competitive_\w+|profiles|saved_clashes|user_preferences|public_profiles)\b/);
    expect(SQL).not.toMatch(/drop (table|function) /);
  });
  it("one immutable event per attempt; the ledger refuses update and delete", () => {
    expect(SQL).toContain("constraint rivalry_events_once unique (challenge_attempt_id)");
    expect(SQL).toMatch(/create trigger rivalry_events_immutable_trg before update or delete on public\.rivalry_events/);
    expect(SQL).toContain("on conflict (challenge_attempt_id) do nothing");
  });
  it("RLS on every table; client roles revoked; members may select own pair/periods/events; blocks and the log are server-only; no client write", () => {
    for (const t of ["rivalries", "rivalry_periods", "rivalry_blocks", "rivalry_request_log", "rivalry_events"]) {
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`));
    }
    expect(SQL).not.toMatch(/grant (insert|update|delete)/);
    expect(SQL).not.toMatch(/grant select on public\.rivalry_(blocks|request_log)/);
    expect(SQL).toMatch(/create policy rivalries_select_member[\s\S]*?using \(user_low = auth\.uid\(\) or user_high = auth\.uid\(\)\)/);
  });
  it("every function is SECURITY DEFINER with a fixed search_path and execute revoked from every client role", () => {
    const fns = ["rivalry_request(uuid, uuid, integer, integer, integer, integer, integer)", "rivalry_respond(uuid, uuid, text)", "rivalry_record_attempt(uuid, text)", "rivalry_reconcile(text, integer)", "rivalry_list(uuid)", "rivalry_detail(uuid, uuid, integer, integer)", "rivalry_opponent_view(uuid, boolean)", "rivalry_record(uuid, uuid, uuid)"];
    for (const f of fns) expect(SQL).toContain(`revoke execute on function public.${f} from public, anon, authenticated`);
    expect((SQL.match(/security definer set search_path = public/g) || []).length).toBeGreaterThanOrEqual(8);
  });
  it("the opponent is resolved from the comparison, never from a client-named account; blocks and deleted opponents read as one generic word", () => {
    expect(SQL).toContain("opp := case when p_actor = a.creator_user_id then a.recipient_user_id else a.creator_user_id end;");
    expect(SQL).toMatch(/rivalry_blocks b where \(b\.blocker_user_id = opp and b\.blocked_user_id = p_actor\) or \(b\.blocker_user_id = p_actor and b\.blocked_user_id = opp\)\) then\s*return jsonb_build_object\('status', 'unavailable'\)/);
    expect(SQL).toContain("if not exists (select 1 from public.profiles where user_id = opp) then return jsonb_build_object('status', 'unavailable'); end if;");
  });
  it("crossed requests never auto-accept; a retry never refreshes the expiry", () => {
    expect(SQL).toContain("return jsonb_build_object('status', 'pending_incoming', 'rivalryId', r.id, 'expiresAt', r.pending_expires_at);");
    expect(SQL).toContain("if r.pending_from = p_actor then return jsonb_build_object('status', 'already_pending'");
  });
  it("deletion marks the member, closes open periods and keeps the pair for the survivor; the opponent then reads 'Deleted account'", () => {
    expect(SQL).toMatch(/create trigger on_auth_user_deleted_rivalries after delete on auth\.users/);
    expect(SQL).toContain("last_closed_reason = 'account_deleted'");
    expect(SQL).toContain("jsonb_build_object('name', 'Deleted account', 'deleted', true, 'publicSlug', null)");
  });
  it("the opponent's public slug leaves only while their profile is public right now", () => {
    expect(SQL).toContain("up.prefs ->> 'profile_visibility' = 'public'");
  });
});

describe("the account route", () => {
  const route = read("api/profile.js");
  it("adds no serverless function: 12 routes plus middleware", () => {
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12); expect(existsSync("middleware.js")).toBe(true);
  });
  it("gates every new action behind the single server flag and rate-limits it; production default off", () => {
    expect(route).toContain('if (!flags().clashSocial) return sendError(res, "FEATURE_DISABLED", requestId);');
    expect(route).toMatch(/rateLimit\(`social:\$\{clientIp\(req\)\}`, limits\(\)\.socialPerMinIp/);
    expect(read("api/_lib/flags.js")).toContain('clashSocial: bool("CLASH_SOCIAL_V1_ENABLED", process.env.VERCEL_ENV === "preview")');
    expect(read("api/v3meta.js")).toContain("clashSocial: !!flags().clashSocial");
  });
  it("account-only for everything but a guest's own result card; an invalid token is refused, never downgraded", () => {
    expect(route).toContain('const ACCOUNT_ONLY_SOCIAL_ACTIONS = new Set(["card-invitation", "rivalry-request", "rivalry-respond", "rivalry-list", "rivalry-detail"]);');
    expect(route).toMatch(/if \(token && !verified\) return res\.status\(401\)/);
  });
  it("reads no score, outcome, opponent, rating or user id from the body — opaque handles only", () => {
    const src = route + read("api/_lib/rivalries.js") + read("api/_lib/cards.js");
    expect(src).not.toMatch(/req\.body\?\.(score|gold|blue|outcome|opponent|opponentId|userId|user_id|email|rating|delta|xp|record|wins|losses|displayName|creatorName)\b/);
    expect(route).toContain('uuidField("attemptId")'); expect(route).toContain('uuidField("rivalryId")');
  });
  it("enrols the comparison AFTER the rating and XP hooks, isolated, only when the flag is on and the caller is an account", () => {
    expect(route).toMatch(/rateChallengeCompletion[\s\S]*?const rivalry = flags\(\)\.clashSocial && \(out\.status === "completed" \|\| out\.status === "already_completed"\) && who\.userId/);
    expect(read("api/_lib/rivalries.js")).toMatch(/export const recordChallengeCompletion[\s\S]*?try \{[\s\S]*?catch \(e\) \{\s*return \{ status: "failed", detail: "record_threw" \};/);
  });
  it("never puts an operator token, a code or a seed in a card filename; the cache is private", () => {
    expect(K.cardFilename("invitation")).toBe("eraclash-challenge-invitation.png"); expect(K.cardFilename("result")).toBe("eraclash-clash-card.png");
    expect(route).toMatch(/SOCIAL_ACTIONS\.has\(actionSocial\)\) \{[\s\S]*?res\.setHeader\("Cache-Control", "private, no-store"\)/);
  });
});

describe("clash card contract 1.0.0", () => {
  it("one export size, two kinds, neutral attribution by default", () => {
    expect(K.CARD_WIDTH).toBe(1080); expect(K.CARD_HEIGHT).toBe(1350); expect(Object.values(K.CARD_KINDS).sort()).toEqual(["invitation", "result"]);
    expect(K.NEUTRAL_LABEL).toBe("MY CLASH"); expect(K.GUEST_LABEL).toBe("GUEST CLASH");
  });
  it("the result payload allowlist names no five, coach, MVP, seed, rating, rank, XP or id", () => {
    for (const f of K.RESULT_CARD_FIELDS) expect(K.FORBIDDEN_CARD_FIELDS).not.toContain(f);
    expect(JSON.stringify(K.RESULT_CARD_FIELDS)).not.toMatch(/roster|coach|mvp|seed|rating|rank|xp|Id"|_id/i);
  });
  it("the invitation payload is a subset of the public invitation contract plus the trusted link — nothing a recipient cannot already see", () => {
    const allowed = new Set([...PUBLIC_INVITATION_FIELDS, "kind", "cardVersion", "url"]);
    for (const f of K.INVITATION_CARD_FIELDS) expect(allowed.has(f)).toBe(true);
    expect(K.INVITATION_CARD_FIELDS).not.toContain("viewer"); expect(K.INVITATION_CARD_FIELDS).not.toContain("responses");
  });
  it("draws a result model with the score, outcome, margin line and era only; the display name is opt-in and never a guest's", () => {
    const p = { kind: "result", cardVersion: "1.0.0", score: { gold: 108, blue: 90 }, outcome: "win", margin: 18, era: "1990s", eraCustom: false, guest: false, displayName: "Joseph <b>x</b>" };
    const m = K.resultCardModel(p);
    expect(m.kicker).toBe("MY CLASH"); expect(m.attribution).toBeNull(); expect(m.marginLine).toBe("+18 RESULT MARGIN"); expect(m.era).toBe("1990s ERA"); expect(m.outcomeWord).toBe("WIN");
    expect(K.resultCardModel(p, { includeName: true }).attribution).toBe("Joseph bx/b");
    expect(K.resultCardModel({ ...p, guest: true, displayName: null }, { includeName: true })).toMatchObject({ kicker: "GUEST CLASH", attribution: null });
    expect(K.resultCardModel({ ...p, score: { gold: 90, blue: 108 }, outcome: "loss", margin: 18 }).marginLine).toBe("−18 RESULT MARGIN");
    expect(K.resultCardModel({ ...p, score: { gold: 100, blue: 100 }, outcome: "tie", margin: 0 }).marginLine).toBe("EVEN · TIE");
    expect(JSON.stringify(m)).not.toMatch(/points/i);
  });
  it("draws an invitation with YOUR TURN and the same-opportunity line, never a roster-versus-roster claim", () => {
    const m = K.invitationCardModel({ kind: "invitation", cardVersion: "1.0.0", code: "EC-ABCD-EFGH", creatorName: "Joseph", creatorScore: { gold: 108, blue: 90 }, creatorOutcome: "win", era: "1990s", eraCustom: false, url: "https://www.eraclashbasketball.com/?challenge=EC-ABCD-EFGH" });
    expect(m.kicker).toBe("YOUR TURN."); expect(m.headline).toBe("SAME OPPORTUNITY. BEAT MY RESULT."); expect(m.attribution).toBeNull(); expect(m.code).toBe("EC-ABCD-EFGH");
    expect(JSON.stringify(m)).not.toMatch(/your team|beat .* team|plays your roster/i);
    expect(K.cardAltText(m)).toContain("EC-ABCD-EFGH"); expect(K.cardAltText(m)).not.toMatch(/Joseph/);
  });
  it("renders text with fillText only — no HTML, no DOM capture, no remote images", () => {
    const r = read("src/cards/render.js");
    expect(r).not.toMatch(/innerHTML|foreignObject|html2canvas|toDataURL\(.*svg|new URL\(|https?:\/\//);
    expect(r).toContain('export const LOGO_SRC = "/brand/eraclash-logo-mk1.png"'); expect(r).toContain("fillText");
    expect(read("src/components/cards/CardComposer.jsx")).not.toMatch(/dangerouslySetInnerHTML/);
  });
  it("never claims a sent or tamper-proof image", () => {
    const ui = read("src/components/cards/CardComposer.jsx");
    expect(ui).not.toMatch(/sent to your friend|tamper-?proof|cannot be edited/i);
    expect(ui).toContain("A saved image cannot be recalled once shared outside EraClash.");
  });
});

describe("events, tabs and export", () => {
  it("allowlists and mirrors every new event; metadata carries no identity", () => {
    for (const e of [...Object.values(R.RIVALRY_EVENTS), ...Object.values(K.CARD_EVENTS)]) { expect(EVENTS_ALLOWLIST.has ? EVENTS_ALLOWLIST.has(e) : EVENTS_ALLOWLIST.includes(e)).toBe(true); expect(ACTIVATION_EVENTS.has ? ACTIVATION_EVENTS.has(e) : ACTIVATION_EVENTS.includes(e)).toBe(true); }
    for (const k of ["displayName", "email", "userId", "code", "rivalryId", "attemptId", "token", "payload"]) { expect(R.RIVALRY_EVENT_METADATA_ALLOWED).not.toContain(k); expect(K.CARD_EVENT_METADATA_ALLOWED).not.toContain(k); }
  });
  it("no new My EraClash tab and no new global navigation item", () => {
    expect([...CAREER_TAB_IDS]).toEqual(["overview", "history", "rosters", "favorites", "challenges", "achievements", "account"]);
    expect(read("src/components/challenges/ChallengesTab.jsx")).toContain("<RivalriesSection");
  });
  it("the export carries the member's own Rivalry records with the opponent's name only", () => {
    const doc = buildAccountExport({ rivalries: [{ rivalryId: "r1", state: "active", pendingFromMe: false, blockedByMe: false, opponent: { name: "Marcus", deleted: false, publicSlug: "abc" }, period: { periodNo: 1, startedAt: "2026-09-10T00:00:00Z", record: { wins: 1, losses: 0, ties: 0, total: 1 } }, periods: 1, secret: "x" }] });
    expect(doc.rivalries[0].opponent).toEqual({ name: "Marcus", deleted: false }); expect(JSON.stringify(doc.rivalries)).not.toMatch(/publicSlug|secret|user_id/);
    expect(buildAccountExport({}).rivalries).toBeNull();
  });
  it("preserves protected contracts: challenge, comparison and rating contracts unchanged; no game path names a rivalry", () => {
    const C = read("src/challenges/contract.js"), E = read("src/competitive/contract.js");
    expect(C).toContain('export const CHALLENGE_VERSION = "1.0.0"'); expect(C).toContain('export const COMPARISON_VERSION = "1.0.0"'); expect(E).toContain('export const COMPETITIVE_RATING_VERSION = "1.0.0"');
    for (const p of ["src/chaos/runState.js", "src/chaos/challenge.js", "api/game.js", "api/_lib/chaosRun.js", "api/_lib/competitive.js", "api/_lib/progression.js"]) expect(read(p)).not.toMatch(/rivalr/i);
  });
});
