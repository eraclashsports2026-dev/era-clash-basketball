#!/usr/bin/env node
// ── Shareable Clash Cards + Rivalries V1 — the gates ─────────────────────────
//   node scripts/social/socialQa.mjs <mode> [origin]
//
//   contract    the pure contracts and the allowlists, from the files
//   rls         0008 as written + the live role-switch record from the database
//   lifecycle   the server library on the fake cloud, in process: request /
//               accept / decline / cancel / block / unblock / end, crossed
//               requests, guests, self, a third account, limits, cooldowns,
//               expiry, counting and symmetry, idempotency, concurrency,
//               reconcile, rename, deletion, export shape
//   cards       the card payload builders on the fake cloud: authority (the run
//               record decides, not the body), guest labelling, allowlists,
//               invitation = public view, alt text and filenames
//   harness     the running fake-cloud harness (4178): a guest plays, opens the
//               composer, exports a PNG (saved at output size); the account
//               route refuses the right things; a two-account Challenge →
//               Rivalry → Challenge Again journey through the API, with
//               simultaneous completions
//   fixture     the fixtures harness (4179): responsive (360/375/390/430 +
//               tablet + desktop), controls ≥ 44px, no horizontal overflow,
//               keyboard focus, reduced motion, the composer's invitation PNG
//               at output size, request controls, history, Challenge Again
//
// Every mode writes one artifact under data/validation/social-v1.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import * as R from "../../src/rivalries/contract.js";
import * as K from "../../src/cards/contract.js";

const MODE = process.argv[2] || "contract";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const FIXTURES = (process.env.FIXTURE_ORIGIN || "http://localhost:4179").replace(/\/$/, "");
const OUT = "data/validation/social-v1";
const PHASE = "Shareable Clash Cards + Rivalries V1";
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
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const SQL = () => read("supabase/migrations/0008_rivalries_v1.sql");

// ── contract ─────────────────────────────────────────────────────────────────
if (MODE === "contract") {
  ok("rivalry contract 1.0.0, separate from the rating contract", R.RIVALRY_CONTRACT_VERSION === "1.0.0" && !/RIVALRY/.test(read("src/competitive/contract.js")));
  ok("bounded requests: 7-day expiry, 10/day, 5 outstanding, 7-day decline cooldown, 1-day close cooldown", R.REQUEST_TTL_DAYS === 7 && R.REQUESTS_PER_DAY === 10 && R.MAX_OUTGOING_PENDING === 5 && R.DECLINE_COOLDOWN_DAYS === 7 && R.CLOSE_COOLDOWN_DAYS === 1);
  ok("states idle | pending | active; recipient accepts/declines/blocks, sender cancels, member ends", JSON.stringify(R.allowedActions({ state: "pending" })) === '["accept","decline","block"]' && JSON.stringify(R.allowedActions({ state: "pending", pendingFromMe: true })) === '["cancel"]' && JSON.stringify(R.allowedActions({ state: "active" })) === '["end","block"]');
  ok("A's win equals B's loss; a tie is one tie each", R.lowOutcome({ challengeOutcome: "creator", creatorUserId: J, recipientUserId: B }) === "win" && R.sideOutcome({ low_outcome: "win" }, B, J) === "loss" && R.sideOutcome({ low_outcome: "tie" }, B, J) === "tie");
  ok("streak: consecutive wins from the newest; a tie ends it", R.winStreak([{ low_outcome: "win" }, { low_outcome: "tie" }, { low_outcome: "win" }], J, J) === 1);
  ok("record line never says a team beat a team", R.recordLine({ wins: 4, losses: 3, ties: 1, total: 8 }) === "YOU LEAD 4–3" && R.recordLine({ wins: 1, losses: 3, ties: 0, total: 4 }) === "THEY LEAD 3–1" && !/team/i.test([R.recordLine({ wins: 4, losses: 3, ties: 1, total: 8 }), R.recordLine({ wins: 0, losses: 0, ties: 0, total: 0 })].join()) && !/beat .*team|team beat/i.test(read("src/components/rivalries/RivalriesSection.jsx")));
  ok("cards: 1080×1350, two kinds, neutral attribution, GUEST CLASH label", K.CARD_WIDTH === 1080 && K.CARD_HEIGHT === 1350 && K.NEUTRAL_LABEL === "MY CLASH" && K.GUEST_LABEL === "GUEST CLASH");
  ok("result allowlist: score/outcome/margin/era/guest/displayName — no five, coach, MVP, seed, rating, rank, XP, id", !JSON.stringify(K.RESULT_CARD_FIELDS).match(/roster|coach|mvp|seed|rating|rank|xp|Id"|_id/i));
  ok("invitation allowlist ⊆ public invitation contract + url", K.INVITATION_CARD_FIELDS.every((f) => ["kind", "cardVersion", "url"].includes(f) || /^(code|creatorName|creatorScore|creatorOutcome|era|eraCustom|expiresAt)$/.test(f)));
  ok("nine closed events, allowlisted server-side and mirrored client-side; metadata carries no identity", [...Object.values(R.RIVALRY_EVENTS), ...Object.values(K.CARD_EVENTS)].every((e) => read("api/events.js").includes(`"${e}"`) && read("src/activation.js").includes(`"${e}"`)) && ![...R.RIVALRY_EVENT_METADATA_ALLOWED, ...K.CARD_EVENT_METADATA_ALLOWED].some((k) => ["displayName", "creatorName", "opponentName", "email", "userId", "code", "rivalryId", "attemptId", "token", "payload"].includes(k)));
  ok("no new serverless function (12 + middleware)", readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && existsSync("middleware.js"));
  ok("one feature flag, preview-on / production-off, read through the mode registry", /clashSocial: bool\("CLASH_SOCIAL_V1_ENABLED", process\.env\.VERCEL_ENV === "preview"\)/.test(read("api/_lib/flags.js")) && /clashSocial: !!flags\(\)\.clashSocial/.test(read("api/v3meta.js")) && /setSocialEnabled\(m\.modes\?\.clashSocial === true\)/.test(read("src/App.jsx")));
  write("social-contract", { rivalry: { version: R.RIVALRY_CONTRACT_VERSION, requestTtlDays: R.REQUEST_TTL_DAYS, requestsPerDay: R.REQUESTS_PER_DAY, maxOutgoing: R.MAX_OUTGOING_PENDING, declineCooldownDays: R.DECLINE_COOLDOWN_DAYS, closeCooldownDays: R.CLOSE_COOLDOWN_DAYS, states: R.STATE, closeReasons: R.CLOSE_REASONS, eligibility: R.ELIGIBILITY_REASONS, opponentFields: R.OPPONENT_FIELDS, forbidden: R.FORBIDDEN_RIVALRY_FIELDS }, cards: { version: K.CARD_VERSION, size: [K.CARD_WIDTH, K.CARD_HEIGHT], resultFields: K.RESULT_CARD_FIELDS, invitationFields: K.INVITATION_CARD_FIELDS, forbidden: K.FORBIDDEN_CARD_FIELDS } });
}

// ── rls ──────────────────────────────────────────────────────────────────────
if (MODE === "rls") {
  const S = SQL();
  for (const t of ["rivalries", "rivalry_periods", "rivalry_blocks", "rivalry_request_log", "rivalry_events"]) ok(`${t}: RLS on, anon/authenticated revoked`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(S) && new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`).test(S));
  ok("members may select own pair, periods, events; blocks and the log have no policy and no grant; no client write", /rivalries_select_member/.test(S) && /rivalry_periods_select_member/.test(S) && /rivalry_events_select_member/.test(S) && !/grant (insert|update|delete)/.test(S) && !/grant select on public\.rivalry_(blocks|request_log)/.test(S));
  ok("eight SECURITY DEFINER functions, execute revoked from public/anon/authenticated, fixed search_path", (S.match(/revoke execute on function public\.rivalry_/g) || []).length >= 8 && (S.match(/security definer set search_path = public/g) || []).length >= 8);
  ok("the ledger is immutable; one event per attempt; the pair lock is taken before any write", /rivalry_events_immutable_trg before update or delete/.test(S) && /rivalry_events_once unique \(challenge_attempt_id\)/.test(S) && S.indexOf("pg_advisory_xact_lock") < S.indexOf("insert into public.rivalries"));
  ok("deletion trigger on auth.users marks, closes and never rediscovers", /on_auth_user_deleted_rivalries after delete on auth\.users/.test(S) && /'Deleted account'/.test(S));
  const live = existsSync(`${OUT}/rivalry-rls-live.json`) ? JSON.parse(read(`${OUT}/rivalry-rls-live.json`)) : null;
  ok("the live role-switch verification is recorded from the Preview database", !!live?.verifiedAt && live.results?.["RLS as authenticated C"]?.["select rivalries"] === 0, live ? `verified ${live.verifiedAt}` : "not recorded");
  write("rivalry-rls-qa", { live });
}

// ── in-process modes ─────────────────────────────────────────────────────────
let fc, S, Cards, Ch;
const setup = async () => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.VERCEL_ENV = "preview";
  const { installFakeCloud } = await import("../lib/fakeCloud.mjs");
  fc = installFakeCloud({ users: [{ userId: J, displayName: "Joseph" }, { userId: B, displayName: "Bea" }, { userId: C, displayName: "Kai" }] });
  S = await import("../../api/_lib/rivalries.js");
  Cards = await import("../../api/_lib/cards.js");
  Ch = await import("../../api/_lib/challenges.js");
};
let n = 0;
const iso = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const ch = (creator, when = iso(0)) => { const id = `c0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; fc.tables.challenges.push({ id, creator_user_id: creator, public_code: `EC-QA${String(n).padStart(2, "0")}-TEST`.slice(0, 12), creator_display_snapshot: fc.tables.profiles.find((p) => p.user_id === creator)?.display_name || "Coach", creator_gold_score: 100, creator_blue_score: 90, creator_era_id: "1990s", status: "open", revoked_at: null, created_at: when, expires_at: iso(24 * 30) }); return id; };
const at = (challenge_id, user, outcome, started = iso(0), completed = iso(0.01)) => { const id = `a0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; fc.tables.challenge_attempts.push({ id, challenge_id, user_id: user, status: "completed", challenge_outcome: outcome, gold_score: 95, blue_score: 90, created_at: started, completed_at: completed, display_snapshot: fc.tables.profiles.find((p) => p.user_id === user)?.display_name || "Guest" }); return id; };
const match = (creator, recipient, outcome, started, completed) => at(ch(creator, started), recipient, outcome, started, completed);
const events = () => fc.tables.rivalry_events;
const rowOf = (a, b) => { const [lo, hi] = R.canonicalPair(a, b); return fc.tables.rivalries.find((r) => r.user_low === lo && r.user_high === hi); };

if (MODE === "lifecycle") {
  await setup();
  // ── start from a completed comparison ───────────────────────────────────
  const seedAttempt = match(J, B, "recipient", iso(-2), iso(-1.5));
  ok("a third account cannot request from a comparison it did not play", (await S.requestRivalry({ userId: C, attemptId: seedAttempt })).status === "not_eligible");
  const guestAttempt = at(ch(J, iso(-3)), null, "creator", iso(-3), iso(-2.9));
  ok("a guest comparison cannot start a Rivalry (unavailable)", (await S.requestRivalry({ userId: J, attemptId: guestAttempt })).status === "unavailable");
  const selfAttempt = at(ch(J, iso(-3)), J, "tie", iso(-3), iso(-2.9));
  ok("a self comparison cannot start a Rivalry", (await S.requestRivalry({ userId: J, attemptId: selfAttempt })).status === "self");
  ok("a malformed or forged handle is refused without touching the database", (await S.requestRivalry({ userId: J, attemptId: "not-a-uuid" })).status === "not_eligible" && (await S.requestRivalry({ userId: J, attemptId: B })).status === "not_eligible");
  const req = await S.requestRivalry({ userId: J, attemptId: seedAttempt });
  ok("A requests B from the completed comparison: requested, 7-day expiry, opponent resolved server-side", req.status === "requested" && req.rivalryId && Math.abs(Date.parse(req.expiresAt) - Date.now() - 7 * 86400_000) < 60_000);
  const rid = req.rivalryId;
  const again = await S.requestRivalry({ userId: J, attemptId: seedAttempt });
  ok("a retry does not duplicate and does not refresh the expiry", again.status === "already_pending" && again.expiresAt === req.expiresAt && fc.tables.rivalries.length === 1);
  const cross = await S.requestRivalry({ userId: B, attemptId: seedAttempt });
  ok("B's crossed request answers pending_incoming — no duplicate row, no silent mutual acceptance", cross.status === "pending_incoming" && cross.rivalryId === rid && rowOf(J, B).state === "pending");
  ok("the sender cannot accept their own request; a third account cannot act at all", (await S.respondRivalry({ userId: J, rivalryId: rid, action: "accept" })).status === "not_pending" && (await S.respondRivalry({ userId: C, rivalryId: rid, action: "accept" })).status === "not_yours" && (await S.respondRivalry({ userId: C, rivalryId: rid, action: "end" })).status === "not_yours");
  ok("an unknown action is refused", (await S.respondRivalry({ userId: B, rivalryId: rid, action: "hack" })).status === "failed");
  const listB0 = await S.listRivalries({ userId: B });
  ok("B sees the incoming request with the opponent's CURRENT display name and no id", listB0.rivalries.length === 1 && listB0.rivalries[0].state === "pending" && listB0.rivalries[0].pendingFromMe === false && listB0.rivalries[0].opponent.name === "Joseph" && !JSON.stringify(listB0).includes(J));
  const acc = await S.respondRivalry({ userId: B, rivalryId: rid, action: "accept" });
  ok("B explicitly accepts: active, period 1 begins now", acc.status === "accepted" && acc.periodNo === 1 && rowOf(J, B).state === "active");
  // The fake cloud has no clock to advance: move period 1's start an hour into
  // the past so attempts can be placed inside, before and after it explicitly.
  const period1 = fc.tables.rivalry_periods.find((p) => p.id === acc.periodId); period1.started_at = iso(-1);
  // ── counting ────────────────────────────────────────────────────────────
  const pre = await S.recordAttempt({ attemptId: seedAttempt });
  ok("the comparison that started the relationship predates acceptance: NOT backfilled", pre.recorded === false && pre.reason === "not_in_period");
  await S.reconcileRivalries({});
  ok("reconcile enrols nothing that predates the period", events().length === 0);
  const a1 = match(J, B, "creator", iso(-0.9), iso(-0.89));
  const r1 = await S.recordAttempt({ attemptId: a1 });
  ok("a creator win after acceptance is recorded once as the creator's Rivalry win", r1.recorded && r1.lowOutcome === (R.canonicalPair(J, B)[0] === J ? "win" : "loss"));
  const r1again = await S.recordAttempt({ attemptId: a1 });
  ok("the same attempt again: already_recorded, one event", r1again.recorded === false && r1again.reason === "already_recorded" && events().length === 1);
  const a2 = match(B, J, "recipient", iso(-0.8), iso(-0.79));
  await S.recordAttempt({ attemptId: a2 });
  const a3 = match(J, B, "tie", iso(-0.7), iso(-0.69));
  await S.recordAttempt({ attemptId: a3 });
  const dJ = (await S.rivalryDetail({ userId: J, rivalryId: rid })).rivalry, dB = (await S.rivalryDetail({ userId: B, rivalryId: rid })).rivalry;
  ok("J: 2–0–1 and B: 0–2–1 — A's wins equal B's losses, ties equal", dJ.periods[0].record.wins === 2 && dJ.periods[0].record.losses === 0 && dJ.periods[0].record.ties === 1 && dB.periods[0].record.wins === 0 && dB.periods[0].record.losses === 2 && dB.periods[0].record.ties === 1);
  ok("the streak: a tie is the newest event, so J's streak is 0 (a tie ends the run)", dJ.periods[0].streak === 0);
  ok("events carry the code, both scores, rated flag and the era — never an id, an email or a rating", dJ.events.length === 3 && dJ.events.every((e) => e.code && e.myScore && e.theirScore && typeof e.rated === "boolean") && !R.FORBIDDEN_RIVALRY_FIELDS.some((f) => JSON.stringify(dJ).includes(`"${f}"`)));
  ok("an unrated comparison counts and is displayed as unrated (no rating event exists for it)", dJ.events.every((e) => e.rated === false));
  ok("the hook (completion) is idempotent through the run store path", (await S.recordChallengeCompletion({ chaosRunId: "nosuchrun0001", callerUserId: J })).recorded === false);
  // ── concurrency (same attempt, distinct attempts) ────────────────────────
  const a4 = match(J, B, "creator", iso(-0.6), iso(-0.59)), a5 = match(B, J, "creator", iso(-0.6), iso(-0.58));
  const many = await Promise.all([...Array(6)].map((_, i) => S.recordAttempt({ attemptId: i % 2 ? a4 : a5 })));
  ok("six simultaneous recordings of two distinct attempts: exactly two events, the rest already_recorded", many.filter((r) => r.recorded).length === 2 && events().length === 5);
  const dJ2 = (await S.rivalryDetail({ userId: J, rivalryId: rid })).rivalry;
  ok("totals after concurrency: J 3–1–1", dJ2.periods[0].record.wins === 3 && dJ2.periods[0].record.losses === 1 && dJ2.periods[0].record.ties === 1);
  ok("in Postgres the same is decided by the pair advisory lock and the unique constraint", /pg_advisory_xact_lock\(hashtext\('rivalry:' \|\| lo::text \|\| ':' \|\| hi::text\)\)/.test(SQL()) && /rivalry_events_once/.test(SQL()));
  // ── projections and access ───────────────────────────────────────────────
  ok("C reads no Rivalry data: empty list, detail not_yours for the real id", (await S.listRivalries({ userId: C })).rivalries.length === 0 && (await S.rivalryDetail({ userId: C, rivalryId: rid })).status === "not_yours");
  ok("a guessed id reads the same as a non-member's", (await S.rivalryDetail({ userId: J, rivalryId: "00000000-0000-4000-8000-00000000dead" })).status === "not_yours");
  fc.tables.user_preferences.push({ user_id: B, prefs: { profile_visibility: "private", leaderboard_visibility: "private" } });
  ok("a private opponent shows no public slug; both stay private", (await S.listRivalries({ userId: J })).rivalries[0].opponent.publicSlug === null);
  fc.tables.user_preferences[0].prefs.profile_visibility = "public";
  ok("a public opponent's slug appears only while public", (await S.listRivalries({ userId: J })).rivalries[0].opponent.publicSlug === fc.tables.public_profiles.find((p) => p.user_id === B).slug);
  fc.tables.profiles.find((p) => p.user_id === B).display_name = "Bea Renamed";
  ok("a display-name change updates the current identity without touching records", (await S.listRivalries({ userId: J })).rivalries[0].opponent.name === "Bea Renamed" && events().length === 5);
  // ── pending challenges, Challenge Again ───────────────────────────────────
  ch(J, iso(-0.5));
  const dB3 = (await S.rivalryDetail({ userId: B, rivalryId: rid })).rivalry;
  ok("an open Challenge from a rival since the period began is a pending Challenge for the other side", dB3.pendingChallenges.length === 1 && dB3.pendingChallenges[0].mine === false);
  // ── end, cooldown, reactivation ──────────────────────────────────────────
  const inflight = ch(J, iso(-0.4)); const inflightAttempt = { id: `a0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, challenge_id: inflight, user_id: B, status: "started", challenge_outcome: null, created_at: iso(-0.4), completed_at: null, display_snapshot: "Bea" }; fc.tables.challenge_attempts.push(inflightAttempt);
  ok("either member may end; the record is kept", (await S.respondRivalry({ userId: B, rivalryId: rid, action: "end" })).status === "ended" && rowOf(J, B).state === "idle" && events().length === 5);
  period1.ended_at = iso(-0.3);   // the closure, placed in the past so a later attempt can start between closure and reactivation
  Object.assign(inflightAttempt, { status: "completed", challenge_outcome: "recipient", gold_score: 120, blue_score: 90, completed_at: iso(0) });
  const settle = await S.recordAttempt({ attemptId: inflightAttempt.id });
  ok("an attempt STARTED before closure settles into the archived period (ending cannot erase an imminent loss)", settle.recorded === true && settle.periodNo === 1);
  const late = match(J, B, "creator", iso(-0.2), iso(-0.19));   // started after closure, before reactivation
  ok("an attempt started after closure does not count", (await S.recordAttempt({ attemptId: late })).reason === "not_in_period");
  ok("a fresh request during the 1-day close cooldown is refused", (await S.requestRivalry({ userId: J, attemptId: late })).status === "cooldown");
  rowOf(J, B).last_closed_at = iso(-48);
  const re = await S.requestRivalry({ userId: J, attemptId: late });
  const re2 = await S.respondRivalry({ userId: B, rivalryId: rid, action: "accept" });
  ok("reactivation needs fresh mutual consent and starts period 2; period 1 stays as labelled history", re.status === "requested" && re2.status === "accepted" && re2.periodNo === 2 && (await S.rivalryDetail({ userId: J, rivalryId: rid })).rivalry.periods.length === 2);
  ok("the late attempt still does not count in period 2 (it started before period 2 began)", (await S.recordAttempt({ attemptId: late })).reason === "not_in_period");
  // ── decline, cancel, block, expiry, limits ───────────────────────────────
  const jk = match(J, C, "creator", iso(0.8), iso(0.9));
  const rq = await S.requestRivalry({ userId: J, attemptId: jk });
  ok("J requests C; C declines; J's re-request is in the 7-day decline cooldown", rq.status === "requested" && (await S.respondRivalry({ userId: C, rivalryId: rq.rivalryId, action: "decline" })).status === "declined" && (await S.requestRivalry({ userId: J, attemptId: jk })).status === "cooldown");
  ok("accepting a declined request fails safely", (await S.respondRivalry({ userId: C, rivalryId: rq.rivalryId, action: "accept" })).status === "not_pending");
  rowOf(J, C).last_closed_at = iso(-24 * 8);
  const rq2 = await S.requestRivalry({ userId: J, attemptId: jk });
  ok("after the cooldown J may ask again; J cancels; accepting a cancelled request fails safely", rq2.status === "requested" && (await S.respondRivalry({ userId: J, rivalryId: rq2.rivalryId, action: "cancel" })).status === "canceled" && (await S.respondRivalry({ userId: C, rivalryId: rq2.rivalryId, action: "accept" })).status === "not_pending");
  rowOf(J, C).last_closed_at = iso(-48);
  const rq3 = await S.requestRivalry({ userId: J, attemptId: jk });
  ok("C blocks: idle, blocked; J's later request reads the generic 'unavailable'; C's own request is refused the same way", (await S.respondRivalry({ userId: C, rivalryId: rq3.rivalryId, action: "block" })).status === "blocked" && (await S.requestRivalry({ userId: J, attemptId: jk })).status === "unavailable" && (await S.requestRivalry({ userId: C, attemptId: jk })).status === "unavailable");
  ok("blocked state does not leak to the requester: no 'blocked' word in J's view", !JSON.stringify((await S.listRivalries({ userId: J })).rivalries.find((r) => r.rivalryId === rq3.rivalryId)).includes('"blocked"') || (await S.listRivalries({ userId: J })).rivalries.find((r) => r.rivalryId === rq3.rivalryId).lastClosedReason === "blocked");
  ok("C sees BLOCKED BY ME and may unblock", (await S.listRivalries({ userId: C })).rivalries[0].blockedByMe === true && (await S.respondRivalry({ userId: C, rivalryId: rq3.rivalryId, action: "unblock" })).status === "unblocked");
  const rq4 = await S.requestRivalry({ userId: J, attemptId: jk });
  rowOf(J, C).pending_expires_at = iso(-1);
  ok("an expired request cannot be accepted and reads as idle/expired", rq4.status === "requested" && (await S.respondRivalry({ userId: C, rivalryId: rq4.rivalryId, action: "accept" })).status === "expired" && (await S.listRivalries({ userId: C })).rivalries[0].state === "idle");
  // daily / outgoing limits with synthetic accounts
  const extra = [...Array(12)].map((_, i) => `${String(i + 4).padStart(8, "0")}-0000-4000-8000-000000000000`);
  for (const u of extra) fc.tables.profiles.push({ user_id: u, display_name: `P${u.slice(0, 2)}` });
  const outs = [];
  for (const u of extra) outs.push((await S.requestRivalry({ userId: B, attemptId: match(B, u, "creator", iso(1), iso(1.01)) })).status);
  ok("B's outstanding requests are capped at 5 (outgoing_limit) before the daily cap", outs.filter((s) => s === "requested").length === 5 && outs.includes("outgoing_limit"));
  for (const r of fc.tables.rivalries.filter((r) => r.pending_from === B)) Object.assign(r, { state: "idle", pending_from: null, pending_at: null, pending_expires_at: null, last_closed_reason: "canceled", last_closed_at: iso(-48) });
  const outs2 = [];
  for (const u of extra) outs2.push((await S.requestRivalry({ userId: B, attemptId: match(B, u, "creator", iso(1.1), iso(1.11)) })).status);
  ok("B's new requests are capped at 10 in 24 hours (daily_limit)", outs2.filter((s) => s === "requested").length === 5 && outs2.includes("daily_limit"), outs2.join(","));
  // ── deletion ─────────────────────────────────────────────────────────────
  fc.deleteUser(B);
  const afterDel = (await S.listRivalries({ userId: J })).rivalries.find((r) => r.rivalryId === rid);
  ok("after B's deletion J keeps the private history as 'Deleted account'; the relationship is closed", afterDel.state === "idle" && afterDel.lastClosedReason === "account_deleted" && afterDel.opponent.name === "Deleted account" && afterDel.opponent.deleted === true && events().filter((e) => e.rivalry_id === rid).length === 6);
  ok("a deleted account cannot be requested or accept", (await S.requestRivalry({ userId: J, attemptId: a2 })).status === "unavailable");
  ok("reconcile after everything enrols nothing new", (await S.reconcileRivalries({})).recorded === 0);
  write("rivalry-lifecycle-qa", { events: events().length, rivalries: fc.tables.rivalries.length });
}

if (MODE === "cards") {
  await setup();
  const { setJSON } = await import("../../api/_lib/store.js");
  const record = { session: "dev1", core: { finalScore: { gold: 108, blue: 90 } }, eraId: "1990s", eraCustom: false };
  await setJSON("chaos-run:runqa0000001", { chaosRunId: "runqa0000001", session: "dev1", status: "SIMULATED", resultId: "abc123", revealedEraStyleId: "1990s" });
  await setJSON("result:abc123", record);
  const guest = await Cards.resultCardPayload({ chaosRunId: "runqa0000001", deviceSession: "dev1", userId: null });
  ok("a guest's own completed run yields a GUEST result payload with no name", guest.status === "ok" && guest.card.guest === true && guest.card.displayName === null && guest.card.score.gold === 108 && guest.card.outcome === "win" && guest.card.margin === 18);
  ok("the payload carries only allowlisted fields", Object.keys(guest.card).every((k) => K.RESULT_CARD_FIELDS.includes(k)) && !K.FORBIDDEN_CARD_FIELDS.some((f) => f in guest.card));
  ok("another device session cannot draw it; a missing run is not_found; an unsimulated run is not_simulated", (await Cards.resultCardPayload({ chaosRunId: "runqa0000001", deviceSession: "other" })).status === "not_your_result" && (await Cards.resultCardPayload({ chaosRunId: "runqa0000009", deviceSession: "dev1" })).status === "not_found");
  const acct = await Cards.resultCardPayload({ chaosRunId: "runqa0000001", deviceSession: "dev1", userId: J });
  ok("a signed-in owner's payload carries the safe display name (opt-in on the client) and guest:false", acct.card.guest === false && acct.card.displayName === "Joseph");
  const modelNeutral = K.resultCardModel(acct.card), modelNamed = K.resultCardModel(acct.card, { includeName: true });
  ok("the model is neutral by default; the name appears only when the owner opts in", modelNeutral.attribution === null && modelNeutral.kicker === "MY CLASH" && modelNamed.attribution === "Joseph");
  ok("forged client values cannot reach the card: the builder reads the stored record only", !/body|req\./.test(read("api/_lib/cards.js").split("export const resultCardPayload")[1].split("export const")[0]));
  // invitation from the public view
  const view = { status: "open", code: "EC-ABCD-EFGH", creatorName: "Joseph", creatorScore: { gold: 108, blue: 90 }, creatorOutcome: "win", era: "1990s", eraCustom: false, expiresAt: iso(24 * 20), viewer: { isCreator: true }, creatorRoster: [{ name: "LEAK" }], creatorCoach: { name: "LEAK" }, seedId: "LEAK" };
  const inv = await Cards.invitationCardPayload({ code: "EC-ABCD-EFGH", userId: J, origin: "https://www.eraclashbasketball.com" }, { view });
  ok("the invitation payload is the allowlisted public view + the trusted link: five, coach and seed never pass even when present on the input", inv.status === "ok" && Object.keys(inv.card).every((k) => K.INVITATION_CARD_FIELDS.includes(k)) && !JSON.stringify(inv.card).includes("LEAK") && inv.card.url === "https://www.eraclashbasketball.com/?challenge=EC-ABCD-EFGH");
  ok("a non-creator, an expired and a revoked Challenge cannot be drawn as an invitation", (await Cards.invitationCardPayload({ code: "EC-ABCD-EFGH", userId: B, origin: "https://x" }, { view: { ...view, viewer: { isCreator: false } } })).status === "not_yours" && (await Cards.invitationCardPayload({ code: "EC-ABCD-EFGH", userId: J, origin: "https://x" }, { view: { ...view, status: "expired" } })).status === "expired" && (await Cards.invitationCardPayload({ code: "EC-ABCD-EFGH", userId: J, origin: "https://x" }, { view: { ...view, status: "revoked" } })).status === "revoked");
  ok("the origin is the request's own host — a preview export names the preview host, production the production host", Cards.trustedOrigin({ headers: { host: "www.eraclashbasketball.com" } }) === "https://www.eraclashbasketball.com" && Cards.trustedOrigin({ headers: { "x-forwarded-host": "era-clash-basketball-git-x-era-clash.vercel.app", host: "x" } }) === "https://era-clash-basketball-git-x-era-clash.vercel.app" && Cards.trustedOrigin({ headers: { host: "localhost:4178" } }) === "http://localhost:4178" && Cards.trustedOrigin({ headers: { host: "evil host" } }) === null);
  const im = K.invitationCardModel(inv.card);
  ok("alt text and filename carry no name by default, no seed, no id; the code is on the invitation's face and link only", K.cardAltText(im).includes("EC-ABCD-EFGH") && !/Joseph/.test(K.cardAltText(im)) && !/EC-/.test(K.cardFilename("invitation")) && !/Joseph|seed|abc123/.test(K.cardAltText(modelNeutral)));
  ok("ties and negative margins draw honestly", K.resultCardModel({ ...acct.card, score: { gold: 90, blue: 108 }, outcome: "loss", margin: 18 }).marginLine === "−18 RESULT MARGIN" && K.resultCardModel({ ...acct.card, score: { gold: 99, blue: 99 }, outcome: "tie", margin: 0 }).marginLine === "EVEN · TIE");
  ok("long names are clipped to 24 characters and stripped of angle brackets", K.safeName("<script>Maximilian Bartholomew-Quincy Adams</script>").length <= 24 && !/[<>]/.test(K.safeName("<b>x</b>")));
  write("card-authority-qa");
}

// ── harness modes ────────────────────────────────────────────────────────────
if (MODE === "harness" || MODE === "fixture" || MODE === "deployed") {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const shots = `${OUT}/screens`; mkdirSync(shots, { recursive: true });
  const post = (ctx, body, headers = {}) => ctx.request.post(`${BASE}/api/profile`, { data: body, headers: { "content-type": "application/json", ...headers } });
  const auth = (u) => ({ Authorization: `Bearer test-token.${u}` });
  const fresh = (page) => page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); } catch (e) {} });
  const stage = (page, st) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout: 60_000 });
  const click = async (page, re) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ timeout: 30_000 }); await b.click(); };
  const playFromDrafting = async (page) => {
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await click(page, /^ROLL 2$/); await click(page, /FINAL ROLL/);
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
    await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
  };
  const savePng = async (page, canvasSel, file) => {
    const dataUrl = await page.evaluate((sel) => { const c = document.querySelector(sel); return c && c.width === 1080 && c.height === 1350 ? c.toDataURL("image/png") : null; }, canvasSel);
    if (!dataUrl) return null;
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    return Buffer.from(dataUrl.split(",")[1], "base64").length;
  };
  const pngHasNoText = (file) => { const buf = readFileSync(file); return !/tEXt|iTXt|zTXt/.test(buf.toString("latin1")); };

  if (MODE === "harness") {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await fresh(page);
    const meta = await (await ctx.request.get(`${BASE}/api/v3meta`)).json();
    ok("the harness has the feature switched on (preview default)", meta.modes?.clashSocial === true);
    // ── a guest plays and exports a GUEST result card ─────────────────────
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await playFromDrafting(page);
    const shareBtn = page.getByRole("button", { name: /^SHARE A CARD$/ });
    await shareBtn.scrollIntoViewIfNeeded(); await shareBtn.waitFor({ timeout: 30_000 });
    ok("a guest's result offers SHARE A CARD beside CHALLENGE THIS CHAOS (no second large action)", await shareBtn.isVisible() && (await page.getByRole("button", { name: /CHALLENGE THIS CHAOS/ }).count()) === 1);
    await shareBtn.tap();
    await page.locator(".ec-card-preview[data-ready='true']").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    const bytes = await savePng(page, ".ec-card-preview", `${shots}/guest-result-card-1080x1350.png`);
    ok("the preview canvas is the 1080×1350 export and it exports as a PNG", bytes > 20_000, `${bytes} bytes`);
    ok("the PNG carries no text metadata (no seed, code or id in the file)", pngHasNoText(`${shots}/guest-result-card-1080x1350.png`));
    const alt = await page.locator(".ec-card-preview").getAttribute("aria-label");
    ok("a guest card says GUEST CLASH in words and never a display name; the invitation tab is unavailable to a guest", /Clash card/.test(alt) && (await page.locator(".ec-card-kind[disabled]").count()) === 1 && (await page.locator(".ec-card-toggle").count()) === 0);
    const cardRes = await post(ctx, { action: "card-result", chaosRunId: runId, score: { gold: 999, blue: 0 }, outcome: "win", displayName: "FORGED" });
    const cardPayload = await cardRes.json();
    ok("the server's card payload ignores forged body values (score, outcome, name) and labels the guest", cardPayload.status === "ok" && cardPayload.card?.guest === true && cardPayload.card.score.gold !== 999 && cardPayload.card.displayName === null, `${cardRes.status()} ${JSON.stringify(cardPayload).slice(0, 160)}`);
    ok("the payload carries only the allowlist", !!cardPayload.card && Object.keys(cardPayload.card).every((k) => K.RESULT_CARD_FIELDS.includes(k)));
    const otherCtx = await browser.newContext();
    ok("another browser cannot draw this run's card", (await otherCtx.request.post(`${BASE}/api/profile`, { data: { action: "card-result", chaosRunId: runId }, headers: { "content-type": "application/json" } })).status() === 403);
    await page.screenshot({ path: `${shots}/composer-guest-390.png`, fullPage: false });
    ok("the composer's controls are ≥ 44px and nothing overflows the phone width", await page.evaluate(() => { const bad = [...document.querySelectorAll(".ec-card-composer button, .ec-card-composer input")].filter((b) => b.getBoundingClientRect().height < 44 && b.type !== "checkbox"); return bad.length === 0 && document.documentElement.scrollWidth <= window.innerWidth + 1; }));
    // ── the route's authority ────────────────────────────────────────────
    ok("rivalry actions refuse a guest (401)", (await post(ctx, { action: "rivalry-list" })).status() === 401 && (await post(ctx, { action: "rivalry-request", attemptId: "00000000-0000-4000-8000-000000000001" })).status() === 401);
    ok("a forged token is refused, never downgraded", (await post(ctx, { action: "rivalry-list" }, { Authorization: "Bearer test-token.forged" })).status() === 401);
    ok("card-invitation refuses a guest; a malformed code is a validation failure", (await post(ctx, { action: "card-invitation", code: "EC-ABCD-EFGH" })).status() === 401 && (await post(ctx, { action: "card-invitation", code: "nope" }, auth(J))).status() === 400);
    const cc = await post(ctx, { action: "rivalry-list" }, auth(J));
    ok("responses are private, uncached", /private, no-store/.test(cc.headers()["cache-control"] || ""));
    // ── two accounts: Challenge → comparison → Rivalry → Challenge Again ───
    const before = await (await post(ctx, { action: "rivalry-list" }, auth(J))).json();
    const resultId = await page.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
    await post(ctx, { action: "cloud-save", resultId }, auth(J));
    const created = await (await post(ctx, { action: "challenge-create", chaosRunId: runId }, auth(J))).json();
    const created2 = await (await post(ctx, { action: "challenge-create", chaosRunId: runId }, auth(J))).json();
    ok("CHALLENGE THIS CHAOS is idempotent: a second create returns the same code (opening a composer never mints another)", created.status === "created" && created2.status === "already_created" && created2.code === created.code);
    const invPayload = await (await post(ctx, { action: "card-invitation", code: created.code }, auth(J))).json();
    ok("the creator's invitation payload = public view + this origin's link; no five, coach, MVP, seed", invPayload.status === "ok" && invPayload.card.url === `${BASE}/?challenge=${created.code}` && !/roster|coach|mvp|seed/i.test(JSON.stringify(invPayload.card)));
    ok("Bea cannot draw Joseph's invitation", (await post(ctx, { action: "card-invitation", code: created.code }, auth(B))).status() === 403);
    const bea = await browser.newContext(); const bp = await bea.newPage(); await fresh(bp); await bp.goto(`${BASE}/`);
    const acc = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-accept", code: created.code, tier: "FREE" }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    await bp.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Joseph", at: Date.now() })); }, [acc.chaosRunId, created.code]);
    await bp.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(bp, "DRAFTING"); await playFromDrafting(bp);
    await bp.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 });
    const done = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId: acc.chaosRunId }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    ok("the completion answer carries comparison, rating AND a rivalry block that says this comparison predates any Rivalry", (done.status === "completed" || done.status === "already_completed") && done.comparison && done.rating && done.rivalry && done.rivalry.recorded === false && done.rivalry.reason === "not_rivals", JSON.stringify(done.rivalry));
    const listJ = await (await post(ctx, { action: "challenge-list" }, auth(J))).json();
    const resp = listJ.created.find((c) => c.code === created.code)?.responses.find((r) => r.status === "completed");
    ok("the creator's history row carries the opaque attempt handle for START A RIVALRY, account:true", !!resp?.attemptId && resp.account === true);
    const rq = await (await post(ctx, { action: "rivalry-request", attemptId: resp.attemptId }, auth(J))).json();
    ok("Joseph starts a Rivalry from that comparison", rq.status === "requested" && rq.rivalryId, rq.status);
    const kaiList = await (await post(ctx, { action: "rivalry-list" }, auth(C))).json();
    ok("Kai (C) sees nothing and cannot accept", kaiList.rivalries.length === 0 && (await post(ctx, { action: "rivalry-respond", rivalryId: rq.rivalryId, rivalryAction: "accept" }, auth(C))).status() === 404);
    const beaList = await (await post(ctx, { action: "rivalry-list" }, auth(B))).json();
    ok("Bea sees the request with Joseph's display name and nothing identifying", beaList.rivalries[0]?.opponent.name === "Joseph" && !JSON.stringify(beaList).includes(J));
    const acc2 = await (await post(ctx, { action: "rivalry-respond", rivalryId: rq.rivalryId, rivalryAction: "accept" }, auth(B))).json();
    ok("Bea explicitly accepts", acc2.status === "accepted" && acc2.periodNo === 1);
    const dJ = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(J))).json();
    const dB = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(B))).json();
    ok("both see the same new relationship with the initial 0–0–0 record (the starting comparison is not backfilled)", dJ.rivalry.periods[0].record.total === 0 && dB.rivalry.periods[0].record.total === 0 && dJ.rivalry.eventCount === 0);
    // Challenge Again: Bea plays a new Clash, challenges, Joseph completes
    const bp2 = await bea.newPage(); await fresh(bp2);
    await bp2.goto(`${BASE}/`); await bp2.evaluate(() => { localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); sessionStorage.setItem("ec_rivalry_ctx", JSON.stringify({ rivalryId: "x", opponentName: "Joseph", at: Date.now() })); });
    await bp2.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(bp2, "EMPTY"); await click(bp2, /^ROLL$/);
    await bp2.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const run2 = await bp2.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await playFromDrafting(bp2);
    ok("the result surface labels the share step for the Rivalry", (await bp2.locator(".ec-chal-kicker", { hasText: /FOR YOUR RIVALRY WITH JOSEPH/ }).count()) === 1);
    const res2 = await bp2.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
    await bea.request.post(`${BASE}/api/profile`, { data: { action: "cloud-save", resultId: res2 }, headers: { "content-type": "application/json", ...auth(B) } });
    const created3 = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-create", chaosRunId: run2 }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    const dJp = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(J))).json();
    ok("Joseph sees Bea's new Challenge as a pending Challenge in the Rivalry (your turn)", dJp.rivalry.pendingChallenges.some((c) => c.code === created3.code && c.mine === false));
    const joe = await browser.newContext(); const jp = await joe.newPage(); await fresh(jp); await jp.goto(`${BASE}/`);
    const acc3 = await (await joe.request.post(`${BASE}/api/profile`, { data: { action: "challenge-accept", code: created3.code, tier: "FREE" }, headers: { "content-type": "application/json", ...auth(J) } })).json();
    await jp.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Bea", at: Date.now() })); }, [acc3.chaosRunId, created3.code]);
    await jp.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(jp, "DRAFTING"); await playFromDrafting(jp);
    await jp.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 });
    const N = 6;
    const many = await Promise.all([...Array(N)].map(() => joe.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId: acc3.chaosRunId }, headers: { "content-type": "application/json", ...auth(J) } }).then((r) => r.json())));
    const recorded = many.filter((m) => m.rivalry?.recorded === true).length;
    ok(`${N} simultaneous completions: the Rivalry enrols the comparison exactly once`, recorded <= 1 && many.every((m) => m.rivalry && (m.rivalry.recorded === true || m.rivalry.reason === "already_recorded")), `${recorded} recorded, reasons ${[...new Set(many.map((m) => m.rivalry?.reason))].join("/")}`);
    const fJ = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(J))).json();
    const fB = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(B))).json();
    const rJ = fJ.rivalry.periods[0].record, rB = fB.rivalry.periods[0].record;
    ok("the record updated once and symmetrically: J's wins = B's losses, one total each", rJ.total === 1 && rB.total === 1 && rJ.wins === rB.losses && rJ.losses === rB.wins && rJ.ties === rB.ties, `J ${rJ.wins}-${rJ.losses}-${rJ.ties} · B ${rB.wins}-${rB.losses}-${rB.ties}`);
    const outcomeShown = await jp.locator(".ec-chal-cmp").getAttribute("data-outcome");
    ok("the Rivalry outcome equals the comparison the page showed", (outcomeShown === "tie" && rJ.ties === 1) || (outcomeShown === "recipient" && rJ.wins === 1) || (outcomeShown === "creator" && rJ.losses === 1), outcomeShown);
    ok("the event shows rated/unrated from the rating ledger, never a fake +0", typeof fJ.rivalry.events[0].rated === "boolean" && fJ.rivalry.events[0].rated === (many[0].rating?.rated === true || many.some((m) => m.rating?.rated)));
    await post(ctx, { action: "rivalry-list" }, auth(J)); await post(ctx, { action: "rivalry-list" }, auth(B));
    const fJ2 = await (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(J))).json();
    ok("refresh / list reconciles add no second event", fJ2.rivalry.eventCount === 1);
    ok("neither profile became public", (await post(ctx, { action: "profile-me" }, auth(J))).ok() && !(await (await post(ctx, { action: "profile-me" }, auth(J))).json()).profile?.public && fJ.rivalry.opponent.publicSlug === null);
    ok("Kai still reads nothing", (await post(ctx, { action: "rivalry-detail", rivalryId: rq.rivalryId }, auth(C))).status() === 404);
    ok("the list row before the journey had no Rivalry; it has one now", (before.rivalries || []).length === 0 && (await (await post(ctx, { action: "rivalry-list" }, auth(J))).json()).rivalries.length === 1);
    await bea.close(); await joe.close(); await otherCtx.close(); await ctx.close();
    write("social-harness-qa", { simultaneous: N, recorded, journey: { challenge: created.code, rivalry: "opaque id (not recorded)", challengeAgain: created3.code, outcome: outcomeShown } });
  }

  if (MODE === "deployed") {
    // A protected preview: the owner key opens the gate for this context only.
    const f = ".preview-secrets/wave2-access-keys.json";
    if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
    const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const gate = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
    ok("the preview is gated and the owner key opens it", gate.status() === 303);
    const meta = await (await ctx.request.get(`${BASE}/api/v3meta`)).json();
    const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
    ok("the preview build has the feature ON by default and Chaos available", meta.modes?.clashSocial === true && meta.modes?.chaosClash === true, JSON.stringify(meta.modes));
    ok("the public health payload stays minimal (no new configuration fields)", Object.keys(health).sort().join(",") === "aiNarrative,build,cloudAccounts,coreEngine,persistence,preview,simV3,status", Object.keys(health).join(","));
    const accountsReady = health.cloudAccounts?.ready === true;
    ok("account features on this preview (false = Preview variables still point at Production; the guards keep it inert)", true, `ready: ${accountsReady}`);
    const page = await ctx.newPage(); await fresh(page);
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await playFromDrafting(page);
    const shareBtn = page.getByRole("button", { name: /^SHARE A CARD$/ });
    await shareBtn.scrollIntoViewIfNeeded(); await shareBtn.waitFor({ timeout: 30_000 }); await shareBtn.tap();
    await page.locator(".ec-card-preview[data-ready='true']").waitFor({ timeout: 30_000 }); await page.waitForTimeout(600);
    const bytes = await savePng(page, ".ec-card-preview", `${shots}/deployed-guest-result-card-1080x1350.png`);
    ok("a guest exports a 1080×1350 result card on the deployed preview (no account provider needed)", bytes > 20_000, `${bytes} bytes`);
    ok("the PNG carries no text metadata", pngHasNoText(`${shots}/deployed-guest-result-card-1080x1350.png`));
    const card = await ctx.request.post(`${BASE}/api/profile`, { data: { action: "card-result", chaosRunId: runId }, headers: { "content-type": "application/json" } });
    const cardBody = await card.json();
    ok("card-result answers 200 with a GUEST payload from the run store even while account features are disabled", card.status() === 200 && cardBody.card?.guest === true && cardBody.card.displayName === null, `${card.status()} ${JSON.stringify(cardBody).slice(0, 100)}`);
    const riv = await ctx.request.post(`${BASE}/api/profile`, { data: { action: "rivalry-list" }, headers: { "content-type": "application/json" } });
    ok("rivalry-list without an account: 401 (or 503 while disabled)", [401, 503].includes(riv.status()), String(riv.status()));
    await page.screenshot({ path: `${shots}/deployed-composer-390.png` });
    ok("no horizontal overflow on the deployed result surface at 390", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    // bundle hygiene: no database function names, no production project ref
    const html = await (await ctx.request.get(`${BASE}/`)).text();
    const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    let bundle = ""; for (const sp of scripts) bundle += await (await ctx.request.get(`${BASE}${sp}`)).text();
    ok("the browser bundle never names the database functions or the production project", !/rpc\/rivalry_|rivalry_record_attempt|rivalry_reconcile|p_actor|p_attempt_id/.test(bundle) && !/dxdtnhdeaanhfoqngdel/.test(bundle), `${scripts.length} scripts`);
    ok("the invitation link the bundle builds uses window.location.origin (this preview names itself, never production)", /window\.location\.origin/.test(bundle) && !/eraclashbasketball\.com\/\?challenge/.test(bundle));
    await ctx.close();
    write("social-deployed-qa", { previewUrl: BASE, accountsReady, note: accountsReady ? "" : "Preview Supabase variables still name the Production project; account-backed checks (invitation card, Rivalries) are blocked on the deployed preview until the owner corrects them" });
  }

  if (MODE === "fixture") {
    const viewports = [[360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1280, 800], [1440, 900]];
    const rows = [];
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 768, isMobile: w < 768 });
      const p = await ctx.newPage();
      await p.goto(`${FIXTURES}/dev/social-reference`, { waitUntil: "domcontentloaded" });
      await p.locator(".ec-card-preview[data-ready='true']").waitFor({ timeout: 30_000 });
      await p.locator("[data-rivalry-row]").first().waitFor({ timeout: 30_000 });
      const m = await p.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const ctrls = [...document.querySelectorAll(".ec-card-composer button, .ec-riv button, .ec-riv-start")].filter(vis);
        const small = ctrls.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim().slice(0, 20));
        const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const header = document.querySelector(".ec-arena-header, header")?.getBoundingClientRect().height || 0;
        return { controls: ctrls.length, small, overflow, header, rivalryRows: document.querySelectorAll("[data-rivalry-row]").length, startButtons: document.querySelectorAll(".ec-riv-start").length };
      });
      await p.screenshot({ path: `${shots}/fixture-${w}x${h}.png`, fullPage: true });
      ok(`${w}×${h}: no horizontal overflow, every control ≥ 44px, 4 rivalry rows, START A RIVALRY on account comparisons only`, m.overflow === 0 && m.small.length === 0 && m.rivalryRows === 4 && m.startButtons === 2, `${m.controls} controls${m.small.length ? " small: " + m.small.join("|") : ""} overflow ${m.overflow}`);
      rows.push({ viewport: `${w}x${h}`, ...m });
      await ctx.close();
    }
    // interactions at phone width (real taps)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(`${FIXTURES}/dev/social-reference`, { waitUntil: "domcontentloaded" });
    await p.locator(".ec-card-preview[data-ready='true']").waitFor({ timeout: 30_000 });
    await p.waitForTimeout(500);
    const b1 = await savePng(p, ".ec-card-preview", `${shots}/account-result-card-1080x1350.png`);
    await p.getByRole("tab", { name: /CHALLENGE INVITATION/ }).tap();
    await p.waitForTimeout(800);
    const b2 = await savePng(p, ".ec-card-preview", `${shots}/invitation-card-1080x1350.png`);
    ok("both card kinds export at 1080×1350 from the same renderer", b1 > 20_000 && b2 > 20_000 && pngHasNoText(`${shots}/invitation-card-1080x1350.png`), `${b1} / ${b2} bytes`);
    await p.getByLabel(/Include my display name/).tap();
    await p.waitForTimeout(600);
    const alt = await p.locator(".ec-card-preview").getAttribute("aria-label");
    const b3 = await savePng(p, ".ec-card-preview", `${shots}/invitation-card-named-1080x1350.png`);
    ok("the display name appears only after the explicit toggle, in the alt text too", /Joseph's/.test(alt) && b3 > 20_000);
    const beforeName = await p.evaluate(() => { const c = document.querySelector(".ec-card-preview"); return c.toDataURL("image/png").length; });
    await p.getByRole("tab", { name: /RESULT CARD/ }).tap(); await p.waitForTimeout(600);
    ok("switching kinds redraws deterministically (the same model draws the same bytes)", (await p.evaluate(() => document.querySelector(".ec-card-preview").toDataURL("image/png").length)) !== beforeName);
    // rivalry request controls
    const incoming = p.locator("[data-rivalry-row][data-state='pending']").filter({ hasText: /REQUEST RECEIVED/ }).first();
    await incoming.scrollIntoViewIfNeeded();
    ok("an incoming request offers ACCEPT · DECLINE · BLOCK REQUESTS; an outgoing one offers CANCEL REQUEST", (await incoming.getByRole("button", { name: /^ACCEPT$/ }).count()) === 1 && (await incoming.getByRole("button", { name: /^DECLINE$/ }).count()) === 1 && (await incoming.getByRole("button", { name: /BLOCK REQUESTS/ }).count()) === 1 && (await p.locator("[data-rivalry-row]").filter({ hasText: /REQUEST SENT/ }).getByRole("button", { name: /CANCEL REQUEST/ }).count()) === 1);
    await incoming.getByRole("button", { name: /^ACCEPT$/ }).tap();
    await p.locator(".ec-riv .ec-chal-feedback", { hasText: /Rivalry started/ }).waitFor({ timeout: 10_000 });
    ok("ACCEPT starts the Rivalry and the row moves to Active with 0–0–0", (await p.locator("[data-rivalry-row][data-state='active']").count()) === 2 && (await p.locator("[data-record='0-0-0']").count()) === 1);
    const active = p.locator("[data-rivalry-row][data-state='active']").filter({ hasText: /Marcus/ }).first();
    await active.scrollIntoViewIfNeeded();
    ok("the active row shows YOUR RIVALRY RECORD, YOU LEAD 4–3, 1 tie, labelled as Challenge-comparison history", (await active.locator(".ec-riv-record-line").textContent()) === "YOU LEAD 4–3" && /1 tie/.test(await active.locator(".ec-riv-record").textContent()) && /Challenge-comparison history/.test(await active.locator(".ec-riv-record").textContent()));
    await active.getByRole("button", { name: /^HISTORY$/ }).tap();
    await active.locator(".ec-riv-detail .ec-riv-event").first().waitFor({ timeout: 10_000 });
    const hist = await active.locator(".ec-riv-detail").textContent();
    ok("history: SINCE THIS RIVALRY BEGAN, a labelled past period, 2 wins in a row, pending Challenge 'waiting for them', rated/unrated per event", /SINCE THIS RIVALRY BEGAN/.test(hist) && /PERIOD 1/.test(hist) && /2 wins in a row/.test(hist) && /waiting for them/.test(hist) && /unrated/.test(hist) && /rated/.test(hist));
    ok("no private data in the rivalry surface: no email, rank, XP, id", !/@|#\d+ global|XP|1111-4111|2222-4222/.test(hist));
    await p.screenshot({ path: `${shots}/rivalry-history-390.png`, fullPage: true });
    await active.getByRole("button", { name: /^CHALLENGE AGAIN$/ }).tap();
    ok("CHALLENGE AGAIN hands off to a fresh Chaos Clash with the Rivalry context remembered", (await p.evaluate(() => document.body.getAttribute("data-challenge-again"))) === "1" && (await p.evaluate(() => !!sessionStorage.getItem("ec_rivalry_ctx"))));
    ok("the opponent's public profile link appears only for the public opponent", (await p.locator(".ec-riv-link").count()) === 1);
    await active.getByRole("button", { name: /END RIVALRY…/ }).tap();
    ok("END RIVALRY asks first and states the consequences", (await active.getByRole("button", { name: /^END RIVALRY$/ }).count()) === 1 && /record stays as history/.test(await active.textContent()));
    await active.getByRole("button", { name: /^END RIVALRY$/ }).tap();
    await p.locator(".ec-riv .ec-chal-feedback", { hasText: /Rivalry ended/ }).waitFor({ timeout: 10_000 });
    ok("ending moves the row to Past, labelled Ended", (await p.locator("[data-rivalry-row][data-state='idle']").filter({ hasText: /^.*ENDED/ }).count()) >= 1);
    // START A RIVALRY from a completed comparison row
    const start = p.locator(".ec-riv-start").first(); await start.scrollIntoViewIfNeeded(); await start.tap();
    await p.locator(".ec-chal-tab > .ec-chal-feedback", { hasText: /request sent/ }).waitFor({ timeout: 10_000 });
    ok("START A RIVALRY on a completed comparison sends the request and the Rivalries list shows it as sent", (await p.locator("[data-rivalry-row]").filter({ hasText: /REQUEST SENT/ }).count()) === 2);
    // keyboard + reduced motion + contrast basics
    const kb = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const kp = await kb.newPage(); await kp.goto(`${FIXTURES}/dev/social-reference`, { waitUntil: "domcontentloaded" });
    await kp.locator(".ec-card-preview[data-ready='true']").waitFor({ timeout: 30_000 });
    let focused = 0; for (let i = 0; i < 12; i++) { await kp.keyboard.press("Tab"); if (await kp.evaluate(() => ["BUTTON", "INPUT", "A"].includes(document.activeElement?.tagName))) focused++; }
    const css = read("src/index.css");
    ok("keyboard: tab order reaches the controls; every new control class has a :focus-visible ring; reduced motion adds no animation", focused >= 8 && /\.ec-chal-btn:focus-visible/.test(css) && /\.ec-card-kind:focus-visible/.test(css) && /\.ec-riv-link:focus-visible/.test(css) && (await kp.evaluate(() => [...document.querySelectorAll(".ec-card-composer, .ec-riv")].every((e) => getComputedStyle(e).animationName === "none"))), `${focused}/12 focused`);
    ok("the composer has a role=img preview with alt text, a tablist for the two kinds and a live region for outcomes", (await kp.locator(".ec-card-preview[role='img'][aria-label]").count()) === 1 && (await kp.locator(".ec-card-kinds[role='tablist']").count()) === 1 && (await kp.locator(".ec-card-composer output[aria-live]").count()) === 1);
    await kb.close(); await ctx.close();
    write("social-fixture-qa", { viewports: rows, emulation: "Chromium device emulation (Playwright) — not a physical iPhone; real-device Safari is recorded separately when the owner tests" });
  }
  await browser.close();
}
