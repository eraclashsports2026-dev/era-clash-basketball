// ── Phase 9C: Challenges + Persistent Competitive Identity V1 ─────────────────
// The pure contract, the schema's promises, and the server library driven
// through an injected fetch that plays the database — so the closed statuses,
// the one-attempt rule, the generic unavailable state and the authority model
// are pinned without a live Postgres.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as C from "../src/challenges/contract.js";
import {
  createChallenge, viewChallenge, acceptChallenge, completeChallengeAttempt, revokeChallenge, listChallenges, newPublicCode, challengeFingerprint,
} from "../api/_lib/challenges.js";
import { publicView, startRun } from "../src/chaos/runState.js";
import { COACHES } from "../src/v3/coaches.js";
const COACH_ID = COACHES[0].id;
import { hydrate } from "../api/_lib/chaosRun.js";

const read = (p) => readFileSync(p, "utf8");
const SQL = read("supabase/migrations/0004_challenges.sql");

describe("public codes", () => {
  it("are EC-XXXX-XXXX from a 32-symbol alphabet with no 0/O/1/I", () => {
    expect(C.CODE_ALPHABET).toHaveLength(32);
    for (const ch of "0O1I") expect(C.CODE_ALPHABET).not.toContain(ch);
    expect(C.codeFromIndices([0, 1, 2, 3, 4, 5, 6, 7])).toBe("EC-ABCD-EFGH");
    expect(newPublicCode()).toMatch(/^EC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it("normalise case-insensitively, with or without the prefix or dashes, and refuse anything else", () => {
    expect(C.normalizeCode("ec-abcd-efgh")).toBe("EC-ABCD-EFGH");
    expect(C.normalizeCode("ABCDEFGH")).toBe("EC-ABCD-EFGH");
    expect(C.normalizeCode(" ec abcd efgh ")).toBe("EC-ABCD-EFGH");
    for (const bad of ["EC-ABCD-EFG0", "EC-ABCD-EFG", "", null, "EC-ABCD-EFGHI", "../x", "EC-ABCD-EF<H"]) expect(C.normalizeCode(bad)).toBeNull();
  });
  it("the link carries the code and nothing else", () => {
    const url = C.invitationUrl("https://example.test/", "ec-abcd-efgh");
    expect(url).toBe("https://example.test/?challenge=EC-ABCD-EFGH");
    for (const f of C.FORBIDDEN_LINK_FIELDS) expect(url.toLowerCase()).not.toContain(`${f.toLowerCase()}=`);
    expect(C.codeFromSearch("?challenge=ec-abcd-efgh&x=1")).toBe("EC-ABCD-EFGH");
    expect(C.codeFromSearch("?chaos=abc")).toBeNull();
  });
  it("random codes do not collide in a reasonable sample", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newPublicCode()));
    expect(seen.size).toBe(5000);
  });
});

describe("lifetime and status", () => {
  const t0 = Date.parse("2026-09-05T00:00:00Z");
  it("lives 30 days from one policy constant, derived from timestamps", () => {
    expect(C.CHALLENGE_TTL_DAYS).toBe(30);
    expect(C.expiresAt("2026-09-05T00:00:00Z")).toBe("2026-10-05T00:00:00.000Z");
    const row = { created_at: "2026-09-05T00:00:00Z", expires_at: C.expiresAt("2026-09-05T00:00:00Z"), status: "open" };
    expect(C.challengeStatus(row, t0 + 86_400_000)).toBe("open");
    expect(C.challengeStatus(row, t0 + 31 * 86_400_000)).toBe("expired");
    expect(C.challengeStatus({ ...row, revoked_at: "2026-09-06T00:00:00Z" }, t0)).toBe("revoked");
    expect(C.challengeStatus(null)).toBe("unavailable");
    expect(C.canStartAttempt(row, t0)).toBe(true);
    expect(C.canStartAttempt(row, t0 + 40 * 86_400_000)).toBe(false);
  });
});

describe("comparison contract 1.0.0", () => {
  it("scores +margin on a win, −margin on a loss, 0 on a tie", () => {
    expect(C.performanceScore({ gold: 118, blue: 104 })).toBe(14);
    expect(C.performanceScore({ gold: 100, blue: 110 })).toBe(-10);
    expect(C.performanceScore({ gold: 99, blue: 99 })).toBe(0);
    expect(C.performanceScore({ gold: NaN, blue: 1 })).toBeNull();
  });
  it("decides the documented examples", () => {
    expect(C.compareResults({ gold: 118, blue: 104 }, { gold: 121, blue: 100 }).outcome).toBe("recipient");
    expect(C.compareResults({ gold: 118, blue: 104 }, { gold: 105, blue: 102 }).outcome).toBe("creator");
    expect(C.compareResults({ gold: 100, blue: 110 }, { gold: 102, blue: 106 }).outcome).toBe("recipient");
    const tie = C.compareResults({ gold: 110, blue: 100 }, { gold: 120, blue: 110 });
    expect(tie.outcome).toBe("tie"); expect(tie.comparisonVersion).toBe("1.0.0");
  });
  it("never claims a beat the contract did not decide", () => {
    const cmp = C.compareResults({ gold: 118, blue: 104 }, { gold: 105, blue: 102 });
    expect(C.comparisonLine(cmp, "Joseph")).not.toMatch(/You beat/);
    expect(C.comparisonLine(C.compareResults({ gold: 118, blue: 104 }, { gold: 121, blue: 100 }), "Joseph")).toMatch(/^You beat Joseph/);
    expect(C.comparisonLine(C.compareResults({ gold: 1, blue: 0 }, { gold: 1, blue: 0 }), "Joseph")).toMatch(/^Tied/);
  });
});

describe("invitation and identity", () => {
  const row = { id: "x", public_code: "EC-ABCD-EFGH", creator_display_snapshot: "Joe <b>", challenge_version: "1.0.0", comparison_version: "1.0.0",
    creator_gold_score: 118, creator_blue_score: 104, creator_outcome: "win", creator_era_id: "1950s", era_custom: false,
    created_at: "2026-09-05T00:00:00Z", expires_at: "2026-10-05T00:00:00Z", response_count: 2, creator_user_id: "u1", creator_result_id: "abc123def4", seed: "no" };
  it("shows the headline and never the five, the coach, the MVP, the result id or the user id before play", () => {
    const v = C.invitationView(row, { now: Date.parse("2026-09-06T00:00:00Z") });
    expect(Object.keys(v).sort()).toEqual([...C.PUBLIC_INVITATION_FIELDS].sort());
    expect(v.creatorName).toBe("Joe b"); expect(v.creatorInitials).toBe("JB"); expect(v.status).toBe("open"); expect(v.responses).toBe(2);
    const json = JSON.stringify(v);
    for (const k of ["roster", "coach", "mvp", "result_id", "creator_user_id", "seed", "manifest"]) expect(json).not.toContain(k);
  });
  it("a display snapshot is cleaned, bounded and never empty", () => {
    expect(C.displaySnapshot("  <script>alert(1)</script>  ")).toBe("scriptalert(1)/script");
    expect(C.displaySnapshot("")).toBe("Coach");
    expect(C.displaySnapshot("x".repeat(60))).toHaveLength(24);
  });
  it("the fingerprint binds the ordered contract fields", () => {
    expect(C.FINGERPRINT_FIELDS).toEqual(["challengeVersion", "draftModelVersion", "playerPoolVersion", "candidateId", "parameterHash", "eraContractVersion", "cpuPolicyVersion", "creatorChallengeSeedDomain", "chaosSequenceVersion"]);
    const a = challengeFingerprint({ challengeVersion: "1.0.0", candidateId: "Candidate 4" });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(challengeFingerprint({ challengeVersion: "1.0.0", candidateId: "Candidate 5" })).not.toBe(a);
  });
  it("the telemetry vocabulary is closed and its metadata excludes identity", () => {
    expect(Object.values(C.CHALLENGE_EVENTS)).toHaveLength(10);
    for (const k of ["displayName", "email", "code", "challengeId", "seed", "token", "cookie", "result"]) expect(C.EVENT_METADATA_ALLOWED).not.toContain(k);
    const allow = read("api/events.js"), mirror = read("src/activation.js");
    for (const e of Object.values(C.CHALLENGE_EVENTS)) { expect(allow).toContain(`"${e}"`); expect(mirror).toContain(`"${e}"`); }
  });
});

describe("the schema keeps its promises", () => {
  it("three tables, RLS on all, grants only where a policy exists, secrets unreadable", () => {
    for (const t of ["challenges", "challenge_secrets", "challenge_attempts"]) {
      expect(SQL).toMatch(new RegExp(`create table if not exists public\\.${t}`));
      expect(SQL).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`));
    }
    expect(SQL).toMatch(/grant select on public\.challenges\s+to authenticated/);
    expect(SQL).toMatch(/grant select on public\.challenge_attempts to authenticated/);
    expect(SQL).not.toMatch(/grant .* on public\.challenge_secrets/);
    expect(SQL).not.toMatch(/create policy \w+ on public\.challenge_secrets/);
    expect(SQL).not.toMatch(/grant (insert|update|delete)/);
  });
  it("one official attempt per account is decided by a unique index", () => {
    expect(SQL).toMatch(/create unique index if not exists challenge_attempts_one_per_account on public\.challenge_attempts \(challenge_id, user_id\) where user_id is not null/);
  });
  it("policies read own rows and own responses only", () => {
    expect(SQL).toMatch(/challenges_select_own[\s\S]*using \(creator_user_id = auth\.uid\(\)\)/);
    expect(SQL).toMatch(/challenge_attempts_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/);
    expect(SQL).toMatch(/challenge_attempts_select_responses[\s\S]*c\.creator_user_id = auth\.uid\(\)/);
  });
  it("deleted accounts leave anonymised history, never a dangling name", () => {
    expect(SQL).toMatch(/creator_user_id\s+uuid references auth\.users \(id\) on delete set null/);
    expect(SQL).toMatch(/user_id\s+uuid references auth\.users \(id\) on delete set null/);
    expect(SQL).toMatch(/create trigger on_auth_user_deleted_challenges after delete on auth\.users/);
    expect(SQL).toMatch(/revoke execute on function public\.anonymize_deleted_account\(\) from public, anon, authenticated/);
    expect(SQL).toMatch(/set creator_display_snapshot = 'Deleted account'/);
  });
  it("records its version and adds no serverless function", () => {
    expect(SQL).toMatch(/insert into public\.schema_migrations \(version\) values \('0004_challenges'\)/);
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12);
  });
});

// ── The server library against a fetch that plays Postgres ───────────────────
const env = () => {
  process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32);
  process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32);
  process.env.CLOUD_ACCOUNTS_ENABLED = "true";
};
/** A tiny PostgREST: tables in memory, eq/in/is filters, insert with unique (challenge_id,user_id), patch. */
const fakeDb = () => {
  const tables = { challenges: [], challenge_secrets: [], challenge_attempts: [], saved_clashes: [], profiles: [] };
  const parse = (path) => { const [table, qs = ""] = path.split("?"); const p = new URLSearchParams(qs); const filters = []; for (const [k, v] of p) { if (["select", "order", "limit"].includes(k)) continue; const m = v.match(/^(eq|in|is)\.(.*)$/); if (m) filters.push({ k, op: m[1], v: m[2] }); } return { table, filters }; };
  const match = (row, f) => f.every(({ k, op, v }) => op === "eq" ? String(row[k]) === v : op === "is" ? (v === "null" ? row[k] == null : row[k] === (v === "true")) : v.slice(1, -1).split(",").includes(String(row[k])));
  let seq = 0;
  const fetchImpl = async (url, init = {}) => {
    const { table, filters } = parse(url.replace(/^.*\/rest\/v1\//, ""));
    const rows = tables[table]; const method = init.method || "GET";
    const reply = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
    if (method === "GET") return reply(200, rows.filter((r) => match(r, filters)));
    if (method === "POST") {
      const row = { id: `id-${++seq}`, ...JSON.parse(init.body) };
      if (table === "challenges" && rows.some((r) => r.public_code === row.public_code)) return reply(409, { code: "23505" });
      if (table === "challenges" && rows.some((r) => r.creator_user_id === row.creator_user_id && r.creator_result_id === row.creator_result_id)) return reply(409, { code: "23505" });
      if (table === "challenge_attempts" && row.user_id && rows.some((r) => r.challenge_id === row.challenge_id && r.user_id === row.user_id)) return reply(409, { code: "23505" });
      rows.push(row); return reply(201, [row]);
    }
    if (method === "PATCH") { const patch = JSON.parse(init.body); const hit = rows.filter((r) => match(r, filters)); for (const r of hit) Object.assign(r, patch); return reply(200, hit); }
    return reply(405);
  };
  return { tables, fetch: fetchImpl };
};
const creatorRun = (session = "sess-A") => ({ ...startRun({ runId: "runaaaaaaaa1", seedId: "seedXYZ1234567", createdAt: 1000 }), session, status: "SIMULATED", resultId: "res000001a", chaosDraftVersion: "3.0.0", eraCustom: false });
const creatorRecord = (session = "sess-A") => ({ id: "res000001a", session, finalScore: { gold: 118, blue: 104 }, chaosDraft: { rolls: [] }, eraId: "1950s", goldIds: ["a", "b", "c", "d", "e"], pregame: { cards: [{ id: "a", name: "A", pos: "PG" }], coachGold: { id: "sloan", name: "Jerry Sloan" } }, mvp: { name: "A", pts: 30 }, previewCandidate: { candidateId: "Candidate 4", calibrationVersion: "1.4.0", candidateCoreHash: "55bb26a2" } });
const manifest = { challengeId: "abc1234", chaosSequenceVersion: "2.0.0", eraStyleId: null };

describe("the server library: authority, statuses, one attempt", () => {
  it("creates once from the creator's own simulated run, binds the contract, keeps the seed only in secrets", async () => {
    env(); const db = fakeDb();
    const out = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    expect(out.status).toBe("created"); expect(out.code).toMatch(/^EC-/);
    const row = db.tables.challenges[0];
    expect(row.creator_performance).toBe(14); expect(row.creator_outcome).toBe("win"); expect(row.chaos_manifest_id).toBe("abc1234");
    expect(row.challenge_fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(row.expires_at).toBe(C.expiresAt(row.created_at));
    expect(JSON.stringify(row)).not.toContain("seedXYZ1234567");
    expect(db.tables.challenge_secrets[0].seed_id).toBe("seedXYZ1234567");
    const again = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    expect(again.status).toBe("already_created"); expect(again.code).toBe(out.code); expect(db.tables.challenges).toHaveLength(1);
  });
  it("reads a real engine record: the score under core, the MVP as a name, the coach by id", async () => {
    env(); const db = fakeDb();
    const real = { id: "res000001a", session: "sess-A", mode: "single", goldIds: ["a", "b", "c", "d", "e"], blueIds: ["f", "g", "h", "i", "j"], chaosDraft: { rolls: [] }, eraId: "2000s",
      coachIds: { gold: COACH_ID, blue: "neutral" }, core: { winner: "Blue", finalScore: { gold: 101, blue: 109 }, mvp: "Real Mvp", mvpLine: { pts: 33 } }, previewCandidate: { candidateId: "Candidate 4", calibrationVersion: "1.4.0", candidateCoreHash: "55bb26a2" } };
    const out = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: real, manifest });
    expect(out.status).toBe("created");
    const row = db.tables.challenges[0];
    expect(row.creator_outcome).toBe("loss"); expect(row.creator_gold_score).toBe(101); expect(row.creator_blue_score).toBe(109); expect(row.creator_performance).toBe(-8);
    expect(row.creator_mvp).toEqual({ name: "Real Mvp", pts: 33 }); expect(row.creator_coach?.id).toBe(COACH_ID); expect(row.creator_coach?.name).toBeTruthy();
    expect(row.creator_era_id).toBe("2000s"); expect(row.creator_roster).toHaveLength(5);
  });
  it("refuses another device's run, an unsimulated run and a non-Chaos result", async () => {
    env(); const db = fakeDb();
    expect((await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-B", deviceSession: "sess-B", displayName: "X" }, { fetch: db.fetch, run: creatorRun("sess-A"), record: creatorRecord(), manifest })).status).toBe("not_your_result");
    expect((await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "X" }, { fetch: db.fetch, run: { ...creatorRun(), status: "READY", resultId: null }, record: creatorRecord(), manifest })).status).toBe("not_simulated");
    expect((await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "X" }, { fetch: db.fetch, run: creatorRun(), record: { ...creatorRecord(), chaosDraft: null }, manifest })).status).toBe("not_eligible");
    expect(db.tables.challenges).toHaveLength(0);
  });
  it("the invitation is generic for unknown codes and honest for live ones; accept enforces one attempt per account and never for the creator", async () => {
    env(); const db = fakeDb();
    const { code } = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    expect(await viewChallenge({ code: "EC-ZZZZ-ZZZZ" }, { fetch: db.fetch })).toEqual({ status: "unavailable" });
    expect(await viewChallenge({ code: "nonsense" }, { fetch: db.fetch })).toEqual({ status: "unavailable" });
    const v = await viewChallenge({ code, userId: null, deviceSession: "sess-B" }, { fetch: db.fetch });
    expect(v.status).toBe("open"); expect(v.creatorName).toBe("Joseph"); expect(v.creatorScore).toEqual({ gold: 118, blue: 104 }); expect(v.era).toBe("1950s");
    expect(JSON.stringify(v)).not.toMatch(/roster|coach|mvp|seed|result_id|user_id/);
    // the creator may not accept their own challenge
    expect((await acceptChallenge({ code, userId: "u-A", deviceSession: "sess-A", tier: "FREE" }, { fetch: db.fetch, createRun: async () => ({ ok: true, run: { chaosRunId: "runbbbbbbbb1" } }) })).status).toBe("own_challenge");
    // recipient B: first accept starts, second resumes (no new run), a second browser is refused by the index
    const mk = () => ({ ok: true, run: { chaosRunId: "runbbbbbbbb1", session: "sess-B" } });
    const a1 = await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE", displayName: "Bea" }, { fetch: db.fetch, createRun: mk });
    expect(a1.status).toBe("started"); expect(a1.chaosRunId).toBe("runbbbbbbbb1");
    const a2 = await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE", displayName: "Bea" }, { fetch: db.fetch, createRun: mk });
    expect(a2.status).toBe("resumed"); expect(a2.chaosRunId).toBe("runbbbbbbbb1");
    db.tables.challenge_attempts.push({ id: "ghost", challenge_id: db.tables.challenges[0].id, user_id: "u-C", device_session_hash: "0".repeat(64), status: "started", chaos_run_id: "runcccccccc1" });
    const a3 = await acceptChallenge({ code, userId: "u-C", deviceSession: "sess-C2", tier: "FREE" }, { fetch: db.fetch, createRun: mk });
    expect(a3.status).toBe("resumed");   // the existing attempt on another device is the official one; no second run
    expect(db.tables.challenge_attempts.filter((a) => a.user_id === "u-B")).toHaveLength(1);
  });
  it("a guest may accept within the run budget; at the limit the answer is the account gate", async () => {
    env(); const db = fakeDb();
    const { code } = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    const g1 = await acceptChallenge({ code, userId: null, deviceSession: "sess-G", tier: "GUEST" }, { fetch: db.fetch, guestRunsUsed: 3, createRun: async () => ({ ok: true, run: { chaosRunId: "rungggggggg1" } }) });
    expect(g1.status).toBe("guest_limit"); expect(g1.guestRunsAllowed).toBe(3);
    const g2 = await acceptChallenge({ code, userId: null, deviceSession: "sess-G", tier: "GUEST" }, { fetch: db.fetch, guestRunsUsed: 1, createRun: async () => ({ ok: true, run: { chaosRunId: "rungggggggg1" } }) });
    expect(g2.status).toBe("started"); expect(db.tables.challenge_attempts[0].user_id).toBeNull(); expect(db.tables.challenge_attempts[0].display_snapshot).toBe("Guest");
  });
  it("completion reads the server's own result, compares under the contract, and is idempotent", async () => {
    env(); const db = fakeDb();
    const { code } = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE", displayName: "Bea" }, { fetch: db.fetch, createRun: async () => ({ ok: true, run: { chaosRunId: "runbbbbbbbb1", session: "sess-B" } }) });
    const attemptId = db.tables.challenge_attempts[0].id;
    const run = { chaosRunId: "runbbbbbbbb1", session: "sess-B", status: "SIMULATED", resultId: "res000002b", challengeAttemptId: attemptId };
    const record = { id: "res000002b", session: "sess-B", finalScore: { gold: 121, blue: 100 } };
    // the wrong device, then an unfinished run, then the real thing
    expect((await completeChallengeAttempt({ chaosRunId: "runbbbbbbbb1", userId: "u-B", deviceSession: "sess-X" }, { fetch: db.fetch, run, record })).status).toBe("not_your_run");
    expect((await completeChallengeAttempt({ chaosRunId: "runbbbbbbbb1", userId: "u-B", deviceSession: "sess-B" }, { fetch: db.fetch, run: { ...run, status: "READY", resultId: null }, record })).status).toBe("not_simulated");
    const done = await completeChallengeAttempt({ chaosRunId: "runbbbbbbbb1", userId: "u-B", deviceSession: "sess-B", displayName: "Bea" }, { fetch: db.fetch, run, record });
    expect(done.status).toBe("completed"); expect(done.comparison.outcome).toBe("recipient"); expect(done.comparison.recipient.performance).toBe(21);
    expect(done.challenge.creatorRoster).toHaveLength(5);   // the original opens once the recipient has played
    const row = db.tables.challenge_attempts[0];
    expect(row.status).toBe("completed"); expect(row.gold_score).toBe(121); expect(row.challenge_outcome).toBe("recipient"); expect(row.comparison_version).toBe("1.0.0");
    const again = await completeChallengeAttempt({ chaosRunId: "runbbbbbbbb1", userId: "u-B", deviceSession: "sess-B" }, { fetch: db.fetch, run, record: { ...record, finalScore: { gold: 1, blue: 99 } } });
    expect(again.status).toBe("already_completed"); expect(again.comparison.recipient.performance).toBe(21);   // a later "result" changes nothing
    // the creator's list sees the response; the recipient's list sees the completed challenge with the original
    const mine = await listChallenges({ userId: "u-A" }, { fetch: db.fetch });
    expect(mine.created[0].responses[0]).toMatchObject({ name: "Bea", challengeOutcome: "recipient", performance: 21 });
    const theirs = await listChallenges({ userId: "u-B" }, { fetch: db.fetch });
    expect(theirs.accepted[0]).toMatchObject({ creatorName: "Joseph", yourPerformance: 21, challengeOutcome: "recipient" });
    expect(theirs.accepted[0].original.creatorRoster).toHaveLength(5);
  });
  it("revocation is the creator's alone, reads as unavailable to anyone else, and closes new attempts while history stays", async () => {
    env(); const db = fakeDb();
    const { code } = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    expect((await revokeChallenge({ code, userId: "u-B" }, { fetch: db.fetch })).status).toBe("unavailable");
    expect((await revokeChallenge({ code, userId: "u-A" }, { fetch: db.fetch })).status).toBe("revoked");
    expect((await revokeChallenge({ code, userId: "u-A" }, { fetch: db.fetch })).status).toBe("already_revoked");
    expect((await viewChallenge({ code }, { fetch: db.fetch })).status).toBe("revoked");
    expect((await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE" }, { fetch: db.fetch, createRun: async () => ({ ok: true, run: {} }) })).status).toBe("revoked");
    expect(db.tables.challenges[0].challenge_fingerprint).toBeTruthy();   // the contract row survives
  });
  it("an expired challenge and a creator-less challenge cannot start attempts", async () => {
    env(); const db = fakeDb();
    const { code } = await createChallenge({ chaosRunId: "runaaaaaaaa1", userId: "u-A", deviceSession: "sess-A", displayName: "Joseph" }, { fetch: db.fetch, run: creatorRun(), record: creatorRecord(), manifest });
    const later = Date.now() + 31 * 86_400_000;
    expect((await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE", now: later }, { fetch: db.fetch, createRun: async () => ({ ok: true, run: {} }) })).status).toBe("expired");
    db.tables.challenges[0].creator_user_id = null;
    expect((await viewChallenge({ code }, { fetch: db.fetch })).status).toBe("unavailable");
    expect((await acceptChallenge({ code, userId: "u-B", deviceSession: "sess-B", tier: "FREE" }, { fetch: db.fetch, createRun: async () => ({ ok: true, run: {} }) })).status).toBe("unavailable");
  });
});

describe("a challenge outlives the run store's manifest", () => {
  it("accept re-mints the same-seed manifest from challenge_secrets when the store has aged it out", async () => {
    env(); process.env.ECLASH_TEST_MEMORY_STORE = "1";
    const { getJSON } = await import("../api/_lib/store.js");
    const { challengeId: manifestIdOf } = await import("../src/chaos/challenge.js");
    const db = fakeDb();
    const seed = "seedREMINT00001";
    const row = { id: "ch-remint", public_code: "EC-REMN-TABC", creator_user_id: "u-A", creator_display_snapshot: "Joseph", challenge_version: "1.0.0", comparison_version: "1.0.0",
      chaos_manifest_id: manifestIdOf(seed), chaos_sequence_version: "2.0.0", creator_outcome: "win", creator_gold_score: 110, creator_blue_score: 100, creator_performance: 10, creator_era_id: "1990s", era_custom: false,
      status: "open", created_at: new Date().toISOString(), expires_at: C.expiresAt(new Date().toISOString()), revoked_at: null };
    db.tables.challenges.push(row);
    db.tables.challenge_secrets.push({ challenge_id: "ch-remint", seed_id: seed, pinned_era_style_id: null });
    expect(await getJSON(`chaos-chal:${row.chaos_manifest_id}`)).toBeNull();          // nothing in the store yet
    const out = await acceptChallenge({ code: row.public_code, userId: "u-B", deviceSession: "sess-B", tier: "FREE", displayName: "Bea" }, { fetch: db.fetch });
    expect(out.status).toBe("started");
    const minted = await getJSON(`chaos-chal:${row.chaos_manifest_id}`);
    expect(minted?.seedId).toBe(seed); expect(minted?.chaosSequenceVersion).toBe("2.0.0");
    expect(JSON.stringify(out)).not.toContain(seed);                                   // the seed still never leaves the server
    const run = await getJSON(`chaos-run:${out.chaosRunId}`);
    expect(run.seedId).toBe(seed); expect(run.challengeAttemptId).toBeTruthy(); expect(run.competitiveEraLock).toBe(true);
  });
});

describe("nothing leaks through the run or the route", () => {
  it("the public run view never carries the attempt binding", () => {
    const run = { ...startRun({ runId: "runaaaaaaaa1", seedId: "seedXYZ", createdAt: 1 }), challengeAttemptId: "attempt-1", challengeCode: "EC-ABCD-EFGH", session: "s" };
    const json = JSON.stringify(publicView(run, { hydrate }));
    for (const k of ["challengeAttemptId", "attempt-1", "EC-ABCD-EFGH", "seedXYZ", "_commitSecret", "session"]) expect(json).not.toContain(k);
  });
  it("the route verifies any presented token, requires an account to create, revoke and list, and never reads a score from the body", () => {
    const src = read("api/profile.js");
    expect(src).toMatch(/if \(token && !verified\) return res\.status\(401\)/);
    expect(src).toMatch(/const who = verified \|\| GUEST_IDENTITY/);
    expect(src).toMatch(/ACCOUNT_ONLY_CHALLENGE_ACTIONS = new Set\(\["challenge-create", "challenge-revoke", "challenge-list"\]\)/);
    expect(src).not.toMatch(/req\.body\?\.(score|gold|blue|performance|outcome)/);
    expect(src).toMatch(/chaosRunId = validRunId\(req\.body\?\.chaosRunId\)/);
    expect(read("api/_lib/challenges.js")).toMatch(/record\.session !== deviceSession/);
  });
});
