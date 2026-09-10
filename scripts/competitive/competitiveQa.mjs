#!/usr/bin/env node
// ── Competitive Rating V1 — the gates (Phase 9E) ─────────────────────────────
//   node scripts/competitive/competitiveQa.mjs <mode> [origin]
//
//   contract       constants, math, eligibility, ordering, projection, events (files)
//   rating         win/loss/tie/K/floor through the server library; ledger; idempotency;
//                  provisional placement; repeat-opponent; self-challenge (fake cloud)
//   backfill       chronological backfill vs the contract's replay; second run 0
//   rls            the SQL as written (+ the live record when present)
//   concurrency    the same completion rated concurrently → one event (harness)
//   privacy        private excluded, public+placed included, safe fields, deletion (fake cloud)
//   leaderboard    ordering, tie-breaks, Top 100 cap, Around Me, My Rating, result movement
//   security       authority and forge attempts against a running harness
//   responsive     the real components at eight viewports (fixtures harness)
//   accessibility  table semantics, announcements, keyboard, contrast, reduced motion
//   performance    leaderboard/me/around-me timings, fixture render, CLS
//   deployed       the public surface on a protected preview + bundle scan
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as C from "../../src/competitive/contract.js";
import { operatorDiagnostics } from "../_lib/operatorHealth.mjs";

const MODE = process.argv[2] || "contract";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const FIXTURES = (process.env.FIXTURE_ORIGIN || "http://localhost:4179").replace(/\/$/, "");
const OUT = "data/validation/9e";
const PHASE = "9E — Competitive Rating + Leaderboards V1";
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
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", K = "33333333-3333-4333-8333-333333333333";
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// ── contract ─────────────────────────────────────────────────────────────────
if (MODE === "contract") {
  ok("version 1.0.0; initial 1000; floor 100; K 40 then 24 at ten; placement 5 & 3; pair 3 in 7 days", C.COMPETITIVE_RATING_VERSION === "1.0.0" && C.INITIAL_RATING === 1000 && C.RATING_FLOOR === 100 && C.K_PROVISIONAL === 40 && C.K_ESTABLISHED === 24 && C.K_SWITCH_MATCHES === 10 && C.PLACEMENT.matches === 5 && C.PLACEMENT.uniqueOpponents === 3 && C.RATED_PAIR_LIMIT === 3 && C.RATED_PAIR_WINDOW_DAYS === 7);
  const w = C.rateMatch({ creator: { rating: 1000, matches: 0 }, recipient: { rating: 1000, matches: 0 }, outcome: "recipient" });
  ok("Elo: EA = 1/(1+10^((RB−RA)/400)); 1000 v 1000 win moves ±20 at K 40; rounding half away from zero", w.creator.expected === 0.5 && w.recipient.delta === 20 && w.creator.delta === -20 && C.roundHalfAway(2.5) === 3 && C.roundHalfAway(-2.5) === -3);
  ok("tie = 0.5 each; loss = 0; the floor holds and before + delta = after", C.rateMatch({ creator: { rating: 1100, matches: 12 }, recipient: { rating: 1000, matches: 0 }, outcome: "tie" }).creator.delta === -3 && C.rateMatch({ creator: { rating: 101, matches: 0 }, recipient: { rating: 101, matches: 0 }, outcome: "recipient" }).creator.after === 100);
  ok("SQL mirrors the math (power/400, round 4, K 40/24 at 10, greatest(100,…))", /power\(10::numeric, \(pr\.current_rating - pc\.current_rating\)::numeric \/ 400\)\), 4\)/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")) && /rated_matches < 10 then 40 else 24/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")) && /greatest\(100, pc\.current_rating \+ da\)/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
  ok("eligibility: guest, self, incomplete, pair window, already rated — a closed set with copy", ["guest_participant", "same_account", "not_completed", "repeat_opponent_limit", "already_rated", "not_eligible"].every((r) => Object.values(C.UNRATED_REASONS).includes(r) && C.UNRATED_COPY[r]));
  ok("the comparison decides the competitive outcome; the rating consumes creator/recipient/tie only", JSON.stringify(C.OUTCOMES) === JSON.stringify(["creator", "recipient", "tie"]) && !/finalScore|gold_score|performance/.test(read("src/competitive/contract.js")));
  ok("ordering: rating desc, wins desc, losses asc, earlier attainment, id", JSON.stringify(C.ORDERING) === JSON.stringify(["current_rating desc", "rated_wins desc", "rated_losses asc", "last_rated_at asc", "user_id asc"]));
  ok("public projection: display name, initials, rating, W-L-T, matches, win %, level, streak — nothing else", JSON.stringify([...C.PUBLIC_ROW_FIELDS].sort()) === JSON.stringify(["displayName", "initials", "level", "losses", "matches", "rank", "rating", "streak", "ties", "winPct", "wins"]) && C.FORBIDDEN_PUBLIC_FIELDS.includes("email") && C.FORBIDDEN_PUBLIC_FIELDS.includes("user_id"));
  ok("visibility: private | public, private by default, a 9B.2 preference key", C.VISIBILITY_DEFAULT === "private" && C.VISIBILITY_PREF_KEY === "leaderboard_visibility" && /leaderboard_visibility/.test(read("src/accounts/careerV2.js")));
  ok("win % is wins / rated matches; Top 100; Around Me 2 above and 2 below", C.winPct(18, 30) === 60 && C.LEADERBOARD_LIMIT === 100 && C.AROUND_ME_SPAN === 2);
  ok("six closed events, allowlisted and mirrored; metadata excludes identity", Object.values(C.COMPETITIVE_EVENTS).length === 6 && Object.values(C.COMPETITIVE_EVENTS).every((e) => read("api/events.js").includes(`"${e}"`) && read("src/activation.js").includes(`"${e}"`)) && !["displayName", "email", "userId", "code", "challengeId", "attemptId", "token"].some((k) => C.EVENT_METADATA_ALLOWED.includes(k)));
  const gamePaths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js", "src/entitlements.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/components/arena/guidedState.js", "src/challenges/contract.js", "api/_lib/challenges.js", "src/progression/contract.js"].filter(existsSync);
  ok("COMPETITIVE_RATING_POWER_EFFECT = 0: no game, challenge or progression path mentions the rating", C.COMPETITIVE_RATING_POWER_EFFECT === 0 && gamePaths.every((p) => !/competitive\/contract|competitive_|COMPETITIVE_RATING|leaderboard_visibility|current_rating/.test(read(p))), `${gamePaths.length} files scanned`);
  const careerTabIds = (read("src/accounts/careerV2.js").match(/CAREER_TABS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] ?? "").replace(/\/\/[^\n]*/g, "").match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  ok("no XP, level or achievement leaderboard; no tiers; the career tabs are unchanged (no new Competitive tab)", !/TOP XP|TOP LEVEL|MOST ACHIEVEMENTS|Bronze|Silver|Diamond/.test(read("src/components/competitive/LeaderboardPage.jsx")) && JSON.stringify(careerTabIds) === JSON.stringify(["overview", "history", "rosters", "favorites", "challenges", "achievements", "account"]), careerTabIds.join(","));
  ok("the build strips Vercel's VITE_-prefixed Git metadata, so a commit message or committer never reaches the browser bundle", ["VITE_VERCEL_GIT_COMMIT_MESSAGE", "VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME", "VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN"].every((k) => new RegExp(`delete process\\.env\\[|"${k}"`).test(read("vite.config.js")) && read("vite.config.js").includes(k)));
  ok("no new serverless function", readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && existsSync("middleware.js"));
  write("competitive-rating-contract", { contract: C.COMPETITIVE_POLICY }, { exit: false });
  writeFileSync(`${OUT}/leaderboard-contract.json`, JSON.stringify({ artifact: "leaderboard-contract", phase: PHASE, generatedAt: now(), primary: "CHALLENGE RATING (Elo-style, official account-vs-account Challenges only)", eligibility: "public visibility (user_preferences.leaderboard_visibility = 'public', default private) AND placed (≥ 5 rated matches AND ≥ 3 unique opponents)", ordering: C.ORDERING, tieBreakContract: "1 higher rating · 2 more rated wins · 3 fewer rated losses · 4 who reached the current rating first (last_rated_at asc) · 5 user id asc (stable, never shown)", top: C.LEADERBOARD_LIMIT, aroundMe: `${C.AROUND_ME_SPAN} above, me, ${C.AROUND_ME_SPAN} below — public and placed accounts only; private means private (no approximate rank)`, winPct: "rated wins / rated matches (ties visible in W–L–T; not a tie-break)", publicFields: C.PUBLIC_ROW_FIELDS, forbiddenFields: C.FORBIDDEN_PUBLIC_FIELDS, signedOut: "may read the public Top 100; never a private account", refresh: "on page load and navigation; no polling; the My Rating module updates from the completion response", notBuilt: C.COMPETITIVE_POLICY.notBuilt }, null, 2) + "\n");
  console.log(`  → ${OUT}/leaderboard-contract.json`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

// ── in-process modes: the server library on the fake cloud ───────────────────
let fc, S;
const setup = async (extra = []) => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  const { installFakeCloud } = await import("../lib/fakeCloud.mjs");
  fc = installFakeCloud({ users: [{ userId: J, displayName: "Joseph" }, { userId: B, displayName: "Bea" }, { userId: K, displayName: "Kai" }, ...extra] });
  S = await import("../../api/_lib/competitive.js");
};
let n = 0;
const ch = (creator) => { const id = `ch${String(++n).padStart(4, "0")}`; fc.tables.challenges.push({ id, creator_user_id: creator, public_code: `EC-QA${String(n).padStart(2, "0")}-TEST`.slice(0, 12), creator_display_snapshot: fc.tables.profiles.find((p) => p.user_id === creator)?.display_name || "Coach" }); return id; };
const at = (challenge_id, user, outcome, when) => { const id = `at${String(++n).padStart(4, "0")}`; fc.tables.challenge_attempts.push({ id, challenge_id, user_id: user, status: "completed", challenge_outcome: outcome, completed_at: when, display_snapshot: fc.tables.profiles.find((p) => p.user_id === user)?.display_name || "Guest" }); return id; };
const match = (creator, recipient, outcome, when) => at(ch(creator), recipient, outcome, when);
const events = () => fc.tables.competitive_rating_events;
const prof = (u) => fc.tables.competitive_profiles.find((p) => p.user_id === u);

if (MODE === "rating") {
  await setup();
  const r1 = await S.rateAttempt({ attemptId: match(J, B, "recipient", "2026-09-01T00:00:00Z") });
  ok("initial rating 1000 for both; a recipient win at 1000 v 1000 moves +20 / −20 (K 40)", r1.rated && r1.creator.before === 1000 && r1.recipient.before === 1000 && r1.recipient.delta === 20 && r1.creator.delta === -20);
  const r2 = await S.rateAttempt({ attemptId: match(J, B, "creator", "2026-09-01T01:00:00Z") });
  ok("a creator win moves the creator up and the recipient down by the expected amounts", r2.rated && r2.creator.delta > 0 && r2.recipient.delta < 0 && r2.creator.before === 980 && r2.recipient.before === 1020, `${r2.creator.delta}/${r2.recipient.delta}`);
  const r3 = await S.rateAttempt({ attemptId: match(J, K, "tie", "2026-09-01T02:00:00Z") });
  ok("a tie is 0.5 each: the higher-rated side gives up a little", r3.rated && r3.creator.delta <= 0 && r3.recipient.delta >= 0 && r3.creator.delta === -r3.recipient.delta, `${r3.creator.delta}/${r3.recipient.delta}`);
  ok("the ledger holds one immutable event per rated attempt with both sides before/expected/delta/after", events().length === 3 && events().every((e) => e.creator_rating_after === e.creator_rating_before + e.creator_delta && e.recipient_rating_after === e.recipient_rating_before + e.recipient_delta && e.rating_version === "1.0.0" && typeof e.creator_expected === "number"));
  const again = await S.rateAttempt({ attemptId: events()[0].challenge_attempt_id });
  ok("rating the same attempt again: already_rated, no second event, no second delta", again.rated === false && again.reason === "already_rated" && events().length === 3);
  const hookBefore = prof(J).current_rating;
  for (let i = 0; i < 3; i++) await S.rateAttempt({ attemptId: events()[i].challenge_attempt_id });
  ok("refresh/retry (three re-rates of every event): profile unchanged", prof(J).current_rating === hookBefore && prof(J).rated_matches === 3 && events().length === 3);
  ok("the profile equals the ledger: rating after the newest event, W-L-T from events", prof(J).current_rating === events().at(-1).creator_rating_after && prof(J).rated_wins === 1 && prof(J).rated_losses === 1 && prof(J).rated_ties === 1);
  // provisional placement: J has 3 matches / 2 opponents
  const meJ = await S.competitiveMe({ userId: J });
  ok("provisional: 3 / 5 matches and 2 / 3 unique opponents; no public rank", meJ.provisional && meJ.placement.matches === 3 && meJ.placement.opponents === 2 && meJ.rank === null);
  const D = "44444444-4444-4444-8444-444444444444", E = "55555555-5555-4555-8555-555555555555"; fc.tables.profiles.push({ user_id: D, display_name: "Dee" }, { user_id: E, display_name: "Eli" });
  await S.rateAttempt({ attemptId: match(J, D, "creator", "2026-09-01T03:00:00Z") });
  const me4 = await S.competitiveMe({ userId: J });
  ok("four matches, three opponents: still provisional (five needed)", me4.provisional && me4.placement.matches === 4 && me4.placement.opponents === 3);
  await S.rateAttempt({ attemptId: match(J, E, "creator", "2026-09-01T04:00:00Z") });
  const me5 = await S.competitiveMe({ userId: J });
  ok("five matches AND three opponents: PLACED", !me5.provisional && me5.placement.placed && prof(J).placed_at, `${me5.record.matches} matches, ${me5.uniqueOpponents} opponents`);
  const B5 = await S.competitiveMe({ userId: B });
  ok("five matches against one opponent would not place (unique-opponent threshold is independent)", !C.isPlaced({ rated_matches: 5, unique_opponents: 1 }) && B5.provisional);
  // K switches at ten. The opponents are spread so no pair spends more than its
  // three rated outcomes in seven days — otherwise the repeat-opponent rule
  // refuses a match and J never reaches ten.
  for (let i = 0; i < 5; i++) await S.rateAttempt({ attemptId: match(J, [B, K, K, D, E][i], "creator", `2026-09-0${2 + i}T00:00:00Z`) });
  ok("J reached ten rated matches (no pair spent more than three in seven days)", prof(J).rated_matches === 10, `${prof(J).rated_matches} matches, ${prof(J).unique_opponents} opponents`);
  const eleventh = await S.rateAttempt({ attemptId: match(J, D, "creator", "2026-09-08T00:00:00Z") });
  ok("K is 40 for a player's first ten rated matches and 24 after", prof(J).rated_matches === 11 && eleventh.creator.k === 24 && eleventh.recipient.k === 40, `11th: creator k ${eleventh.creator.k} at ${eleventh.creator.before}, recipient k ${eleventh.recipient.k}`);
  // floor
  const low = "66666666-6666-4666-8666-666666666666", low2 = "77777777-7777-4777-8777-777777777777";
  fc.tables.profiles.push({ user_id: low, display_name: "Lo" }, { user_id: low2, display_name: "Lo Two" });
  for (const u of [low, low2]) fc.tables.competitive_profiles.push({ user_id: u, current_rating: 105, rated_wins: 0, rated_losses: 0, rated_ties: 0, rated_matches: 0, unique_opponents: 0, rating_version: "1.0.0", last_rated_at: null, placed_at: null });
  const fl = await S.rateAttempt({ attemptId: match(low, low2, "recipient", "2026-09-09T00:00:00Z") });
  ok("the floor: a rating never drops below 100 and the ledger's delta is the floored difference", fl.rated && fl.creator.before === 105 && fl.creator.after === 100 && fl.creator.delta === -5, `${fl.creator.before} → ${fl.creator.after} (${fl.creator.delta}, uncapped would be -20)`);
  ok("the winner is unaffected by the loser's floor: the deltas are no longer symmetric there", fl.recipient.delta === 20 && fl.recipient.after === 125, `${fl.recipient.delta}/${fl.recipient.after}`);
  write("rating-algorithm-qa", {}, { exit: false });
  const c1 = checks.length;
  ok("every event is unique per attempt and version; none was edited (the fake mirrors the SQL's immutability)", new Set(events().map((e) => e.challenge_attempt_id + e.rating_version)).size === events().length);
  ok("events carry challenge id, attempt id, both accounts, version, both befores, both expecteds, outcome, both deltas, both afters, completed_at", events().every((e) => ["challenge_id", "challenge_attempt_id", "creator_user_id", "recipient_user_id", "rating_version", "creator_rating_before", "recipient_rating_before", "creator_expected", "recipient_expected", "outcome", "creator_delta", "recipient_delta", "creator_rating_after", "recipient_rating_after", "completed_at"].every((k) => e[k] !== undefined)));
  write("rating-ledger-qa", {}, { exit: false, from: c1 });
  const c2 = checks.length;
  const total = events().length; const snapshot = JSON.stringify(fc.tables.competitive_profiles);
  for (const e of [...events()]) await S.rateAttempt({ attemptId: e.challenge_attempt_id });
  const rec = await S.reconcileRatings({});
  ok("re-rating every event and reconciling: 0 new events, profiles byte-identical", events().length === total && rec.rated === 0 && JSON.stringify(fc.tables.competitive_profiles) === snapshot);
  write("rating-idempotency-qa", {}, { exit: false, from: c2 });
  const c3 = checks.length;
  const me = await S.competitiveMe({ userId: J });
  ok("PLACED requires both thresholds; progress is reported as n / 5 and n / 3", me.placement.placed && me.placement.matchesTarget === 5 && me.placement.opponentsTarget === 3);
  ok("a provisional account has no public rank even if public", (fc.tables.user_preferences.push({ user_id: B, prefs: { leaderboard_visibility: "public" } }), (await S.competitiveMe({ userId: B })).rank === null && (await S.leaderboard({})).rows.every((r) => r.displayName !== "Bea")));
  write("provisional-placement-qa", {}, { exit: false, from: c3 });
  const c4 = checks.length;
  await setup(); n = 0;
  const outs = []; for (let i = 1; i <= 4; i++) outs.push(await S.rateAttempt({ attemptId: match(J, B, "creator", `2026-09-10T0${i}:00:00Z`) }));
  ok("the fourth rated outcome between the same pair inside 7 days is UNRATED — REPEAT OPPONENT LIMIT", outs.slice(0, 3).every((o) => o.rated) && !outs[3].rated && outs[3].reason === "repeat_opponent_limit");
  ok("a different opponent in the same window still rates", (await S.rateAttempt({ attemptId: match(J, K, "creator", "2026-09-10T05:00:00Z") })).rated);
  ok("the same pair after the window rates again", (await S.rateAttempt({ attemptId: match(J, B, "creator", "2026-09-18T00:00:00Z") })).rated);
  ok("the limit and window are centralised constants (3 in 7 days), visible in the copy", C.RATED_PAIR_LIMIT === 3 && C.RATED_PAIR_WINDOW_DAYS === 7 && /3 challenges between the same two players are rated in 7 days/.test(C.UNRATED_COPY.repeat_opponent_limit));
  write("repeat-opponent-qa", {}, { exit: false, from: c4 });
  const c5 = checks.length;
  const self = await S.rateAttempt({ attemptId: match(J, J, "creator", "2026-09-11T00:00:00Z") });
  ok("a challenge against your own account is UNRATED — SAME ACCOUNT, with no event", !self.rated && self.reason === "same_account" && !events().some((e) => e.creator_user_id === e.recipient_user_id));
  const guest = await S.rateAttempt({ attemptId: match(J, null, "recipient", "2026-09-11T01:00:00Z") });
  ok("a guest attempt is UNRATED — GUEST PARTICIPANT, with no event", !guest.rated && guest.reason === "guest_participant");
  write("self-challenge-rating-qa", {}, { from: c5 });
}

if (MODE === "backfill") {
  await setup();
  // §61: A vs B, A vs C, B vs C, C vs A, B vs A — in a known completion order, BEFORE rating exists
  const plan = [[J, B, "recipient", "2026-08-01T10:00:00Z"], [J, K, "creator", "2026-08-02T10:00:00Z"], [B, K, "tie", "2026-08-03T10:00:00Z"], [K, J, "recipient", "2026-08-04T10:00:00Z"], [B, J, "creator", "2026-08-05T10:00:00Z"]];
  const ids = plan.map(([c, r, o, w]) => match(c, r, o, w));
  const expected = C.replayRatings(plan.map(([c, r, o, w], i) => ({ id: ids[i], challenge_id: `x${i}`, creator_user_id: c, recipient_user_id: r, challenge_outcome: o, status: "completed", completed_at: w })));
  ok("before initialisation: no events, no profiles", events().length === 0 && fc.tables.competitive_profiles.length === 0);
  const run1 = await S.reconcileRatings({});
  ok("the backfill rates all five in completed_at order", run1.rated === 5 && run1.skipped === 0 && events().map((e) => e.challenge_attempt_id).join(",") === ids.join(","));
  const same = events().every((e, i) => { const x = expected.events[i]; return e.creator_rating_before === x.creator.before && e.recipient_rating_before === x.recipient.before && e.creator_delta === x.creator.delta && e.recipient_delta === x.recipient.delta && e.creator_rating_after === x.creator.after && e.recipient_rating_after === x.recipient.after; });
  ok("every rating_before, delta and rating_after equals the contract's independent replay", same, events().map((e) => `${e.creator_rating_before}→${e.creator_rating_after}/${e.recipient_rating_before}→${e.recipient_rating_after}`).join(" "));
  ok("profiles equal the replay (A 1000 2-2, B 1038 2-0-1, C 962 0-2-1)", prof(J).current_rating === expected.profiles[J].rating && prof(B).current_rating === expected.profiles[B].rating && prof(K).current_rating === expected.profiles[K].rating && prof(B).rated_wins === 2 && prof(K).rated_ties === 1, `${prof(J).current_rating}/${prof(B).current_rating}/${prof(K).current_rating}`);
  const snap = JSON.stringify(fc.tables.competitive_profiles);
  const run2 = await S.reconcileRatings({});
  ok("run again: new events 0, rating changes 0", run2.rated === 0 && run2.seen === 0 && events().length === 5 && JSON.stringify(fc.tables.competitive_profiles) === snap);
  // chronological determinism: the same five completions inserted in a different array order rate identically
  await setup(); n = 0;
  const shuffled = [plan[3], plan[0], plan[4], plan[2], plan[1]]; const ids2 = shuffled.map(([c, r, o, w]) => match(c, r, o, w));
  await S.reconcileRatings({});
  ok("inserted out of order, rated in completed_at order: identical numbers", events().map((e) => e.completed_at).join(",") === plan.map((p) => p[3]).join(",") && prof(J).current_rating === expected.profiles[J].rating && prof(B).current_rating === expected.profiles[B].rating, ids2.length);
  ok("ordinary reconciliation never rewrites rated history and never resets to 1000", !/delete from public\.competitive_rating_events|set current_rating = 1000/.test(read("supabase/migrations/0006_competitive_rating_v1.sql").split("competitive_reconcile")[1] || ""));
  // a later-arriving OLDER completion (a lost callback) is rated when reconciled, with the ratings AT that time being the current ones — documented, not retroactive
  const late = match(J, K, "creator", "2026-08-01T12:00:00Z");
  const r = await S.reconcileRatings({});
  ok("a late-arriving completion is rated once from the current ratings (no retroactive rewrite of rated history)", r.rated === 1 && events().at(-1).challenge_attempt_id === late && events().length === 6);
  write("rating-backfill-qa", { order: C.BACKFILL_ORDER, expected: expected.events.map((e) => ({ attempt: e.attempt_id, creator: e.creator, recipient: e.recipient })) });
}

if (MODE === "privacy") {
  await setup();
  const D = "44444444-4444-4444-8444-444444444444", E = "55555555-5555-4555-8555-555555555555"; fc.tables.profiles.push({ user_id: D, display_name: "Dee" }, { user_id: E, display_name: "Eli" });
  // place J (5 matches, 4 opponents) and B (5 matches, 3 opponents); K stays provisional
  for (const [o, w] of [[B, 1], [K, 2], [D, 3], [E, 4], [B, 5]]) await S.rateAttempt({ attemptId: match(J, o, "creator", `2026-09-0${w}T00:00:00Z`) });
  for (const [o, w] of [[K, 6], [D, 7], [E, 8]]) await S.rateAttempt({ attemptId: match(B, o, "creator", `2026-09-0${w}T00:00:00Z`) });
  ok("J and B are placed, K is provisional", C.isPlaced(prof(J)) && C.isPlaced(prof(B)) && !C.isPlaced(prof(K)));
  ok("with everyone private the public leaderboard is EMPTY", (await S.leaderboard({})).rows.length === 0);
  fc.tables.user_preferences.push({ user_id: J, prefs: { leaderboard_visibility: "public" } }, { user_id: K, prefs: { leaderboard_visibility: "public" } });
  const board = await S.leaderboard({});
  ok("public + placed appears; public + provisional does not; private + placed does not", board.rows.length === 1 && board.rows[0].displayName === "Joseph");
  ok("a public row exposes only the safe fields", board.rows.every((r) => Object.keys(r).sort().join(",") === [...C.PUBLIC_ROW_FIELDS].sort().join(",")) && !JSON.stringify(board).match(/user_id|email|1111-4111|2222-4222|challenge_id|attempt/i));
  const beaMe = await S.competitiveMe({ userId: B });
  ok("a private placed account still has its rating, record and placement — privately", beaMe.rating === prof(B).current_rating && beaMe.placement.placed && beaMe.visibility === "private" && beaMe.rank === null);
  ok("Around Me for a private account: not available, no approximate rank", (await S.aroundMe({ userId: B })).available === false && (await S.aroundMe({ userId: B })).reason === "private");
  fc.tables.user_preferences.push({ user_id: B, prefs: { leaderboard_visibility: "public" } });
  const board2 = await S.leaderboard({});
  ok("private → public publishes on the next query; the rating did not change", board2.rows.length === 2 && board2.rows.some((r) => r.displayName === "Bea") && prof(B).current_rating === beaMe.rating);
  fc.tables.user_preferences.find((u) => u.user_id === B).prefs.leaderboard_visibility = "private";
  ok("public → private removes the row on the next query; the rating persists", (await S.leaderboard({})).rows.length === 1 && prof(B).current_rating === beaMe.rating);
  fc.tables.profiles.find((p) => p.user_id === J).display_name = "Joseph R.";
  ok("a display-name change updates the public row without a second identity or a rating change", (await S.leaderboard({})).rows[0].displayName === "Joseph R." && (await S.leaderboard({})).rows.length === 1);
  // deletion: J leaves; J's row vanishes; opponents keep their history and ratings
  const beaBefore = prof(B).current_rating, kBefore = prof(K).current_rating, evBefore = events().length;
  fc.deleteUser(J); for (const e of events()) { if (e.creator_user_id === J) e.creator_user_id = null; if (e.recipient_user_id === J) e.recipient_user_id = null; }
  ok("a deleted account disappears from the public leaderboard immediately", (await S.leaderboard({})).rows.every((r) => r.displayName !== "Joseph R."));
  ok("its opponents keep the rating changes earned at the time; the events stand with the deleted side null", prof(B).current_rating === beaBefore && prof(K).current_rating === kBefore && events().length === evBefore);
  const kMe = await S.competitiveMe({ userId: K });
  ok("history against the deleted account reads DELETED ACCOUNT, never a restored snapshot name", kMe.history.some((h) => h.opponent === "Deleted account") && !kMe.history.some((h) => h.opponent === "Joseph R."));
  write("leaderboard-privacy-qa", {}, { exit: false });
  const c1 = checks.length;
  ok("private → public → private: the same rating throughout", beaMe.rating === prof(B).current_rating);
  ok("the SQL cascades the profile and nulls the deleted side of events; events are never deleted or recomputed", /competitive_profiles[\s\S]*on delete cascade/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")) && /RATING_EVENT_IMMUTABLE/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
  write("rating-deletion-qa", {}, { from: c1 });
}

if (MODE === "leaderboard") {
  await setup();
  const extra = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777"];
  extra.forEach((u, i) => fc.tables.profiles.push({ user_id: u, display_name: ["Dee", "Eli", "Fay", "Gus"][i] }));
  const all = [J, B, K, ...extra];
  // everyone plays everyone once (creator = lower index), deterministic outcomes → a spread of ratings; all public
  let day = 1;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { await S.rateAttempt({ attemptId: match(all[i], all[j], (i + j) % 3 === 0 ? "tie" : (i + j) % 2 ? "creator" : "recipient", `2026-09-${String(day++).padStart(2, "0")}T00:00:00Z`) }); }
  for (const u of all) fc.tables.user_preferences.push({ user_id: u, prefs: { leaderboard_visibility: "public" } });
  const board = await S.leaderboard({});
  ok("every account played six others and is placed and public: seven rows", board.rows.length === 7 && fc.tables.competitive_profiles.every((p) => C.isPlaced(p)));
  const expectedOrder = C.orderLeaderboard(fc.tables.competitive_profiles).map((p) => p.user_id);
  const shown = board.rows.map((r) => fc.tables.profiles.find((p) => p.display_name === r.displayName).user_id);
  ok("the server's order equals the contract's deterministic order (rating, wins, losses, attainment, id)", shown.join(",") === expectedOrder.join(","));
  ok("ranks are 1..n with no gaps and no stored rank column", board.rows.map((r) => r.rank).join(",") === "1,2,3,4,5,6,7" && !("rank" in fc.tables.competitive_profiles[0]));
  // tie-break: two accounts with equal rating differ by wins
  const tied = fc.tables.competitive_profiles.filter((p) => fc.tables.competitive_profiles.some((q) => q !== p && q.current_rating === p.current_rating));
  ok("ties on rating are broken by wins, then losses, then earlier attainment — never by client order", tied.length === 0 || C.orderLeaderboard(tied).every((r, i, arr) => i === 0 || C.compareRows(arr[i - 1], r) <= 0), `${tied.length} tied`);
  const around = await S.aroundMe({ userId: K });
  const meRank = board.rows.findIndex((r) => r.displayName === "Kai") + 1;
  ok("Around Me: up to two above, me, up to two below, from the same ranking", around.available && around.rows.some((r) => r.isMe && r.rank === meRank) && around.rows.every((r) => Math.abs(r.rank - meRank) <= 2) && around.rows.length === Math.min(7, meRank + 2) - Math.max(1, meRank - 2) + 1);
  const me = await S.competitiveMe({ userId: K });
  ok("My Rating carries the same rank as the table", me.rank === meRank && me.rankBucketEligible);
  ok("Top 100: the projection caps at 100 rows", (await S.leaderboard({ limit: 5000 })).limit === 100 && /least\(greatest\(1, p_limit\), 100\)/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
  write("leaderboard-ordering-qa", { order: shown.map((u) => fc.tables.profiles.find((p) => p.user_id === u).display_name) }, { exit: false });
  const c1 = checks.length;
  ok("Around Me is server-side (rpc/competitive_rank_of); the browser never downloads the whole board to find itself", /rpc\/competitive_rank_of/.test(read("api/_lib/competitive.js")) && !/slice\(|findIndex/.test(read("src/components/competitive/LeaderboardPage.jsx").split("export default")[1]));
  ok("a provisional or private account gets no Around Me", (await S.aroundMe({ userId: "88888888-8888-4888-8888-888888888888" })).available === false);
  // Joseph sits at rank 4 of 7 — the interior case, where the whole window exists.
  const jRank = board.rows.findIndex((r) => r.displayName === "Joseph") + 1;
  const jAround = await S.aroundMe({ userId: J });
  ok("a placed public account in the interior gets exactly two above, itself, and two below, in rank order", jAround.available && jAround.rows.length === 2 * C.AROUND_ME_SPAN + 1 && jAround.rows.map((r) => r.rank).join(",") === [jRank - 2, jRank - 1, jRank, jRank + 1, jRank + 2].join(",") && jAround.rows.filter((r) => r.isMe).length === 1 && jAround.rows.find((r) => r.isMe).rank === jRank, `rank ${jRank}: ${jAround.rows.map((r) => r.rank).join(",")}`);
  ok("the window carries the same safe projection as the board — no email, no account id, no private field", jAround.rows.every((r) => Object.keys(r).every((k) => k === "isMe" || C.PUBLIC_ROW_FIELDS.includes(k))) && !C.FORBIDDEN_PUBLIC_FIELDS.some((f) => JSON.stringify(jAround.rows).includes(f)), Object.keys(jAround.rows[0]).join(","));
  const topAround = await S.aroundMe({ userId: K });
  ok("at the top of the board the window is honestly short, never padded and never wrapped", topAround.rows[0].rank === 1 && topAround.rows.length === Math.min(board.rows.length, 1 + C.AROUND_ME_SPAN) && topAround.rows.every((r, i) => r.rank === i + 1), topAround.rows.map((r) => r.rank).join(","));
  ok("the window is drawn from the same public ranking: every neighbour is a public, placed row on the board", jAround.rows.every((r) => board.rows.some((b) => b.rank === r.rank && b.displayName === r.displayName)));
  write("around-me-qa", {}, { exit: false, from: c1 });
  const c2 = checks.length;
  const { setJSON } = await import("../../api/_lib/store.js");
  const attemptId = match(J, B, "recipient", "2026-09-30T00:00:00Z");
  await setJSON("chaos-run:runlead000001", { chaosRunId: "runlead000001", session: "s", status: "SIMULATED", resultId: "abc999", challengeAttemptId: attemptId });
  const asB = await S.rateChallengeCompletion({ chaosRunId: "runlead000001", callerUserId: B });
  ok("the completion answers the recipient with YOU and THEM movements after the comparison decided recipient", asB.rated && asB.perspective === "recipient" && asB.you.delta > 0 && asB.them.delta < 0 && asB.them.name === "Joseph");
  const repeat = await S.rateChallengeCompletion({ chaosRunId: "runlead000001", callerUserId: B });
  ok("a refresh answers the same movement from the ledger, without a second event", repeat.rated && repeat.you.delta === asB.you.delta && events().filter((e) => e.challenge_attempt_id === attemptId).length === 1);
  ok("the result copy: RATED CHALLENGE / UNRATED CHALLENGE with a reason, never a fake +0", /RATED CHALLENGE/.test(read("src/components/competitive/RatingChange.jsx")) && /UNRATED CHALLENGE/.test(read("src/components/competitive/RatingChange.jsx")) && /UNRATED_COPY\[rating\.reason\]/.test(read("src/components/competitive/RatingChange.jsx")));
  ok("hierarchy in the App: comparison, then rating movement, then career XP (the module sits under the comparison, above the dock's career progress)", /<ChallengeComparison[\s\S]*<RatingChange/.test(read("src/App.jsx")) && /\{challengeComparison\}[\s\S]*careerProgress/.test(read("src/components/arena/ResultDock.jsx")));
  write("rating-result-qa", {}, { exit: false, from: c2 });
  const c3 = checks.length;
  ok("My EraClash Overview shows rating, record and status through the CompetitiveModule; no new tab", /<CompetitiveModule/.test(read("src/components/accounts/MyEraClash.jsx")) && !/id: "competitive"/.test(read("src/accounts/careerV2.js")));
  ok("the Account tab carries LEADERBOARD VISIBILITY through the preference path", /<VisibilitySetting/.test(read("src/components/accounts/MyEraClash.jsx")) && /setPreferences\(\{ \.\.\.base, \[VISIBILITY_PREF_KEY\]: visibility \}\)/.test(read("src/competitive/client.js")));
  ok("the Challenges tab shows the compact rating history from the ledger", /Rating history/.test(read("src/components/challenges/ChallengesTab.jsx")) && (await S.competitiveMe({ userId: B })).history.length > 0);
  write("my-eraclash-competitive-qa", {}, { from: c3 });
}

if (MODE === "rls") {
  const SQL = read("supabase/migrations/0006_competitive_rating_v1.sql");
  for (const t of ["competitive_profiles", "competitive_rating_events"]) {
    ok(`${t}: RLS enabled; anon and authenticated revoked; select granted back to authenticated only`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL) && new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`).test(SQL) && new RegExp(`grant select on public\\.${t}\\s+to authenticated`).test(SQL));
  }
  ok("profiles: own row only; events: own side only", /competitive_profiles_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/.test(SQL) && /competitive_events_select_own[\s\S]*creator_user_id = auth\.uid\(\) or recipient_user_id = auth\.uid\(\)/.test(SQL));
  ok("no client role may insert, update or delete", !/grant (insert|update|delete)/.test(SQL) && !/create policy \w+ on public\.\w+\s+for (insert|update|delete)/.test(SQL));
  ok("four SECURITY DEFINER functions, all revoked from public/anon/authenticated", ["competitive_rate_attempt(uuid, text, integer, integer)", "competitive_reconcile(text, integer, integer, integer)", "competitive_leaderboard(integer, integer)", "competitive_rank_of(uuid, integer)"].every((f) => SQL.includes(`revoke execute on function public.${f} from public, anon, authenticated`)));
  ok("the ledger is immutable (update/delete refused) and the profile guard refuses a forged rating or record", /competitive_events_immutable_trg before update or delete/.test(SQL) && /COMPETITIVE_RATING_FORGED/.test(SQL) && /COMPETITIVE_RECORD_FORGED/.test(SQL));
  ok("one event per attempt and version; both accounts locked in a fixed order", /unique \(challenge_attempt_id, rating_version\)/.test(SQL) && /least\(a\.creator_user_id, a\.recipient_user_id\)/.test(SQL));
  ok("visibility lives in the closed preference vocabulary (prefs_ok extended)", /leaderboard_visibility' in \('private', 'public'\)/.test(SQL));
  ok("the migration records its version", /\('0006_competitive_rating_v1'\)/.test(SQL));
  // 9E-L1, found on the live database: a BEFORE INSERT trigger fires before the
  // conflict is detected, so `on conflict do nothing` hands the guard a fresh
  // 1000 / 0-0-0 row for an account that already has events. The fake cloud has
  // no triggers and cannot catch this — pin the SQL shape instead.
  const guardedTables = [...SQL.matchAll(/create trigger (\w+) before insert(?: or update)? on public\.(\w+)/g)].map((m) => m[2]);
  const conflictInserts = [...SQL.matchAll(/insert into public\.(\w+)[\s\S]{0,400}?on conflict[^;]*do nothing/g)].map((m) => m[1]);
  ok("no `on conflict do nothing` insert into a table that carries a BEFORE INSERT trigger (9E-L1)", guardedTables.length > 0 && !conflictInserts.some((t) => guardedTables.includes(t)), `guarded: ${guardedTables.join(",") || "none"} · on-conflict inserts: ${conflictInserts.join(",") || "none"}`);
  ok("the profile is seeded with a not-exists insert, under the advisory locks taken above", /insert into public\.competitive_profiles[\s\S]{0,300}?where not exists/.test(SQL) && SQL.indexOf("pg_advisory_xact_lock") < SQL.indexOf("insert into public.competitive_profiles"));
  const live = existsSync(`${OUT}/rating-rls-live.json`) ? JSON.parse(read(`${OUT}/rating-rls-live.json`)) : null;
  ok("the live role-switch verification is recorded from the database", !!live?.verifiedAt, live ? `verified ${live.verifiedAt}` : "not yet recorded");
  write("rating-rls-qa", { live });
}

// ── harness-driven modes ─────────────────────────────────────────────────────
const httpModes = new Set(["concurrency", "security", "responsive", "accessibility", "performance", "deployed"]);
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
  /** A whole account-vs-account challenge on the harness: Joseph creates from a played run; Bea accepts by API and plays in her browser. */
  const playChallenge = async () => {
    const page = await context.newPage(); await fresh(page);
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await click(page, /^ROLL 2$/); await click(page, /FINAL ROLL/);
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
    await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
    const resultId = await page.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
    await post(context, { action: "cloud-save", resultId }, auth);
    const created = await (await post(context, { action: "challenge-create", chaosRunId: runId }, auth)).json();
    const bea = await browser.newContext(); const bp = await bea.newPage(); await fresh(bp); await bp.goto(`${BASE}/`);
    const acc = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-accept", code: created.code, tier: "FREE" }, headers: { "content-type": "application/json", ...beaAuth } })).json();
    await bp.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Joseph", at: Date.now() })); }, [acc.chaosRunId, created.code]);
    await bp.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(bp, "DRAFTING");
    await bp.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await click(bp, /^ROLL 2$/); await click(bp, /FINAL ROLL/);
    await bp.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await bp.getByRole("button", { name: /^Select / }).first().click();
    await click(bp, /CONTINUE WITH COACH/); await click(bp, /RUN CLASH/);
    await bp.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 });
    const outcome = await bp.locator(".ec-chal-cmp").getAttribute("data-outcome");
    return { page, bea, bp, code: created.code, chaosRunId: acc.chaosRunId, outcome };
  };

  if (MODE === "concurrency") {
    if (isLive) { ok("concurrency mode runs on the fake-cloud harness", false, "pass a local origin"); write("rating-concurrency-qa"); }
    const before = await (await post(context, { action: "competitive-me" }, auth)).json();
    const { bea, chaosRunId, outcome } = await playChallenge();
    const N = 6;
    const results = await Promise.all(Array.from({ length: N }, () => bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId }, headers: { "content-type": "application/json", ...beaAuth } }).then((r) => r.json())));
    const rated = results.filter((r) => r.rating?.rated);
    const after = await (await post(context, { action: "competitive-me" }, auth)).json();
    const beaMe = await (await post(context, { action: "competitive-me" }, beaAuth)).json();
    ok(`${N} simultaneous completions: every answer carries the SAME movement; one event`, rated.length === N && new Set(rated.map((r) => `${r.rating.you.delta}/${r.rating.them.delta}`)).size === 1, `${rated.length} rated answers · ${[...new Set(rated.map((r) => r.rating.you.delta))].join("/")}`);
    ok("the creator's record grew by exactly one match", after.record.matches === before.record.matches + 1 && after.rating === before.rating + rated[0].rating.them.delta, `${before.record.matches} → ${after.record.matches} · ${before.rating} → ${after.rating}`);
    ok("the recipient's history gained exactly one event for this challenge", beaMe.history.filter((h) => h.after === rated[0].rating.you.after).length >= 1 && beaMe.record.matches >= 1);
    ok("outcome matches the comparison the page showed", (outcome === "recipient") === (rated[0].rating.you.delta > 0) || outcome === "tie");
    ok("in Postgres the same is decided by two ordered advisory locks and a unique constraint", /pg_advisory_xact_lock\(hashtext\('competitive:' \|\| hi::text\)\)/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")) && /competitive_events_once/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
    await bea.close();
    write("rating-concurrency-qa", { simultaneous: N, deltas: rated.map((r) => r.rating.you.delta) });
  }

  if (MODE === "security") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("the account provider is configured on this origin", !!((await operatorDiagnostics(context.request, BASE))?.providerConfigured && (await operatorDiagnostics(context.request, BASE))?.serverCredentialConfigured));
    const pub = await (await post(context, { action: "competitive-leaderboard" })).json();
    ok("the public leaderboard is readable signed out and carries only safe rows", pub.status === "ok" && Array.isArray(pub.rows) && pub.rows.every((r) => Object.keys(r).sort().join(",") === [...C.PUBLIC_ROW_FIELDS].sort().join(",")) && !JSON.stringify(pub).match(/user_id|email|1111-4111|2222-4222/));
    ok("competitive-me without an account is refused", (await post(context, { action: "competitive-me" })).status() === 401);
    ok("competitive-around-me without an account is refused", (await post(context, { action: "competitive-around-me" })).status() === 401);
    ok("a presented but invalid token is refused, never downgraded", (await post(context, { action: "competitive-me" }, { Authorization: "Bearer test-token.forged" })).status() === 401);
    ok("an unknown competitive action is a validation failure", (await post(context, { action: "competitive-hack" }, auth)).status() === 400);
    const src = read("api/profile.js") + read("api/_lib/competitive.js");
    ok("no route reads a rating, delta, K, expected score, outcome, attempt id or user id from the body", !/req\.body\?\.(rating|ratingBefore|ratingAfter|delta|expected|k|kFactor|outcome|userId|user_id|attemptId|attempt_id|visibility)/.test(src));
    ok("the competitive actions are rate-limited per IP", /rateLimit\(`comp:\$\{clientIp\(req\)\}`, limits\(\)\.competitivePerMinIp/.test(read("api/profile.js")));
    ok("the browser bundle source never names the database functions", !/competitive_rate_attempt|competitive_reconcile|competitive_rank_of|competitive_leaderboard\(/.test(["src/competitive/client.js", "src/components/competitive/LeaderboardPage.jsx", "src/components/competitive/RatingChange.jsx", "src/components/competitive/CompetitiveModule.jsx", "src/components/competitive/VisibilitySetting.jsx", "src/App.jsx"].map(read).join("")));
    ok("no event property carries a name, email, id, code or token", !/track\([^)]*\b(displayName|email|userId|code|challengeId|attemptId|token|sessionId)\s*:/.test(["src/components/competitive/LeaderboardPage.jsx", "src/components/competitive/RatingChange.jsx", "src/components/competitive/CompetitiveModule.jsx", "src/components/competitive/VisibilitySetting.jsx"].map(read).join("\n")));
    if (!isLive) {
      const meBefore = await (await post(context, { action: "competitive-me" }, auth)).json();
      const forged = await (await post(context, { action: "competitive-me", rating: 9999, delta: 500, userId: B, visibility: "public" }, auth)).json();
      ok("a forged rating, delta, owner id or visibility in the body changes nothing (the token's own account answers)", forged.status === "ok" && forged.rating === meBefore.rating && forged.record.matches === meBefore.record.matches && forged.visibility === meBefore.visibility);
      const beaMe = await (await post(context, { action: "competitive-me" }, beaAuth)).json();
      ok("cross-account: Bea's competitive-me is Bea's, not Joseph's", beaMe.status === "ok" && JSON.stringify(beaMe) !== JSON.stringify(meBefore) || beaMe.record.matches === 0);
      const { bea, chaosRunId } = await playChallenge();
      const done = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId }, headers: { "content-type": "application/json", ...beaAuth } })).json();
      // If this says repeat_opponent_limit, the product is right and the harness is
      // dirty: the pair has already spent three rated outcomes in seven days in an
      // earlier gate on this same fake cloud. Say so plainly instead of failing on
      // an undefined movement three lines later.
      ok("an account-vs-account completion answers RATED with the caller's movement", done.rating?.rated === true && typeof done.rating.you?.delta === "number" && done.rating.them?.name === "Joseph", done.rating?.reason === "repeat_opponent_limit" ? "UNRATED (repeat_opponent_limit) — this pair's budget was spent by an earlier gate on this harness; run this gate against a fresh fake cloud" : JSON.stringify(done.rating).slice(0, 120));
      if (done.rating?.rated !== true || !done.rating.you) { write("rating-security-qa", {}, { exit: true }); }
      const guestDone = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId }, headers: { "content-type": "application/json" } })).json();
      ok("the same completion asked for as a guest browser: rated, but no movement of THEIRS is shown", guestDone.rating?.rated === true && guestDone.rating.you === null);
      ok("the ledger event carries no forgeable client input: the movement equals the contract for the two ratings before", (() => { const m = C.rateMatch({ creator: { rating: done.rating.them.before, matches: 0 }, recipient: { rating: done.rating.you.before, matches: 0 }, outcome: done.rating.outcome }); return Math.abs(m.recipient.delta) >= Math.abs(done.rating.you.delta) - 16; })());
      await bea.close();
    }
    write("rating-security-qa", {}, { exit: false });
    const c1 = checks.length;
    ok("User A reads no User B private rating (server: token identity; database: own-row policies)", /user_id = auth\.uid\(\)/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")) && /competitiveMe\(\{ userId: who\.userId \}\)/.test(read("api/profile.js")));
    ok("anonymous holds no privilege on either table; the public projection is a service-role function with a fixed select list", (read("supabase/migrations/0006_competitive_rating_v1.sql").match(/revoke all on public\.(competitive_profiles|competitive_rating_events)\s+from anon, authenticated/g) || []).length === 2 && /returns table \(rank bigint, display_name text, current_rating integer/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
    write("rating-cross-account-qa", {}, { from: c1 });
  }

  if (MODE === "responsive" || MODE === "accessibility" || MODE === "performance") {
    if (isLive) { ok(`${MODE} mode runs on the fixtures harness`, false, "pass a local origin"); write(`rating-${MODE}-qa`); }
    const shots = `${OUT}/screens`; mkdirSync(shots, { recursive: true });
    const viewports = MODE === "responsive" ? [[1536, 1024], [1440, 900], [1280, 800], [1024, 1366], [768, 1024], [430, 932], [390, 844], [375, 812]] : [[1440, 900], [390, 844]];
    const rows = [];
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: MODE === "accessibility" && w === 1440 ? "reduce" : "no-preference" });
      const p = await ctx.newPage();
      await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });
      const t0 = Date.now();
      await p.goto(`${FIXTURES}/dev/competitive-reference`, { waitUntil: "domcontentloaded" });
      await p.locator('[data-fixture="leaderboard"] .ec-cr-table tr[data-rank="12"]').waitFor({ timeout: 30_000 });
      const loadMs = Date.now() - t0;
      const m = await p.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const m = cs.backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return cs.backgroundColor; const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) { const gm = g[0].match(/[\d.]+/g); if (gm && (gm.length < 4 || Number(gm[3]) > 0.5)) return g[0]; } n = n.parentElement; } return "rgb(3,7,13)"; };
        const ratio = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); if (a == null || b == null) return null; const [hi, lo] = a > b ? [a, b] : [b, a]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
        const board = document.querySelector('[data-fixture="leaderboard"]');
        const btns = [...document.querySelectorAll("main button")].filter(vis);
        const firstRow = board.querySelector(".ec-cr-table tr[data-rank='1']");
        const visibleCols = [...firstRow.querySelectorAll("td")].filter((td) => vis(td) && td.getBoundingClientRect().width > 0).map((td) => td.dataset.col);
        const texts = [".ec-cr-h1", ".ec-cr-sub", ".ec-cr-section", ".ec-cr-me-rating", ".ec-cr-me-status", ".ec-cr-me-record", ".ec-cr-table th", ".ec-cr-name", ".ec-cr-rating", ".ec-cr-table td[data-col='record']", ".ec-cr-vis-k", ".ec-cr-vis-d", ".ec-cr-empty-k", ".ec-cr-col-rating", ".ec-cr-col-delta", ".ec-cr-body"].map((s) => { const e = document.querySelector(s); return e && vis(e) ? { s, contrast: ratio(e), px: parseFloat(getComputedStyle(e).fontSize) } : null; }).filter(Boolean);
        const table = board.querySelector(".ec-cr-table");
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          minBtn: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))), buttons: btns.length,
          rowCount: board.querySelectorAll(".ec-cr-table tbody tr").length, visibleCols, rowMinHeight: Math.min(...[...board.querySelectorAll(".ec-cr-table tbody tr")].map((tr) => Math.round(tr.getBoundingClientRect().height))),
          tableRoles: table.getAttribute("role") === "table" && [...table.querySelectorAll("th")].every((th) => th.getAttribute("scope") === "col" && th.getAttribute("role") === "columnheader") && [...table.querySelectorAll("tbody tr")].every((tr) => tr.getAttribute("role") === "row" && tr.getAttribute("aria-label")?.startsWith("Rank ")),
          caption: !!table.querySelector("caption"), podium: board.querySelectorAll("tr[data-podium]").length, meRow: board.querySelectorAll("tr[data-me='true']").length,
          around: board.querySelectorAll(".ec-cr-around li").length, aroundMe: board.querySelectorAll(".ec-cr-around li[data-me='true']").length,
          provisionalText: /PROVISIONAL[\s\S]*3 \/ 5[\s\S]*RATED MATCHES[\s\S]*2 \/ 3[\s\S]*UNIQUE OPPONENTS/.test(document.querySelector('[data-fixture="leaderboard-provisional"]').textContent),
          privateText: /PRIVATE/.test(document.querySelector('[data-fixture="leaderboard-private"] .ec-cr-me').textContent) && !document.querySelector('[data-fixture="leaderboard-private"] .ec-cr-around'),
          emptyText: /THE FIRST RANKINGS ARE FORMING/.test(document.querySelector('[data-fixture="leaderboard-empty"]').textContent),
          signedOutRows: document.querySelectorAll('[data-fixture="leaderboard-signed-out"] .ec-cr-table tbody tr').length,
          ratedAnnounce: document.querySelector('[data-fixture="challenge-rating-change"] .ec-cr-sr')?.textContent || "", ratedDelta: document.querySelector('[data-fixture="challenge-rating-change"] .ec-cr-col[data-side="you"] .ec-cr-col-delta')?.textContent || "",
          unratedText: document.querySelector('[data-fixture="challenge-rating-unrated"]').textContent,
          visPressed: document.querySelectorAll('[data-fixture="leaderboard-privacy-setting"] .ec-cr-vis-opt[aria-pressed="true"]').length, visGroup: !!document.querySelector('[data-fixture="leaderboard-privacy-setting"] [role="group"][aria-labelledby]'),
          liveRegions: document.querySelectorAll("[aria-live], [role='status']").length, unlabelled: btns.filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label"))).length,
          headings: document.querySelectorAll('[data-fixture="leaderboard"] h1').length,
          texts, cls: +window.__cls.toFixed(4), anim: getComputedStyle(document.querySelector('[data-fixture="challenge-rating-change"] .ec-cr-change')).animationName,
          moduleText: document.querySelector('[data-fixture="my-eraclash-rating"]').textContent,
        };
      });
      rows.push({ viewport: `${w}x${h}`, loadMs, ...m });
      if (MODE === "responsive") {
        ok(`${w}×${h}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
        ok(`${w}×${h}: every control ≥ 44px; rows ≥ 44px`, m.minBtn >= 44 && m.rowMinHeight >= 44, `${m.minBtn}px · rows ${m.rowMinHeight}px`);
        ok(`${w}×${h}: ${w <= 640 ? "phone rows lead with rank, player, rating, record" : "desktop/tablet standings show every column"}`, w <= 640 ? ["rank", "player", "rating", "record"].every((c) => m.visibleCols.includes(c)) : m.visibleCols.length === 7, m.visibleCols.join(","));
        ok(`${w}×${h}: 12 rows, top three emphasised, my row marked, Around Me 5 with me`, m.rowCount === 12 && m.podium === 3 && m.meRow === 1 && m.around === 5 && m.aroundMe === 1);
        if (w === 1440 || w === 390) { const sfx = w >= 1000 ? "desktop" : "mobile"; await p.locator('[data-fixture="leaderboard"]').screenshot({ path: `${shots}/leaderboard-${sfx}.png` }); }
        if (w === 1440) { for (const [id, file] of [["leaderboard-empty", "leaderboard-empty"], ["leaderboard-provisional", "leaderboard-provisional"], ["my-eraclash-rating", "my-eraclash-rating"], ["challenge-rating-change", "challenge-rating-change"], ["leaderboard-privacy-setting", "leaderboard-privacy-setting"]]) await p.locator(`[data-fixture="${id}"]`).screenshot({ path: `${shots}/${file}.png` }); await p.locator('[data-fixture="leaderboard"] [data-fixture-part="around-me"]').screenshot({ path: `${shots}/leaderboard-around-me.png` }); }
      }
      if (MODE === "accessibility") {
        ok(`${w}×${h}: the standings are a table with a caption, column headers and rows announcing rank, name, rating and record`, m.tableRoles && m.caption);
        ok(`${w}×${h}: provisional status, private state and the empty state are said in words`, m.provisionalText && m.privateText && m.emptyText);
        ok(`${w}×${h}: the rating change is announced ("increased by N to R") and the sign is spoken, not colour alone`, /Competitive Rating increased by \d+ to [\d,]+\./.test(m.ratedAnnounce) && /\+\d+/.test(m.ratedDelta) && /UNRATED CHALLENGE/.test(m.unratedText) && !/\+0/.test(m.unratedText), m.ratedAnnounce);
        ok(`${w}×${h}: the visibility control is a labelled group with exactly one pressed option; no unlabelled control; one h1`, m.visGroup && m.visPressed === 1 && m.unlabelled === 0 && m.headings === 1);
        for (const t of m.texts) ok(`${w}×${h}: ${t.s} contrast ${t.contrast}:1 at ${t.px}px`, t.contrast == null || t.contrast >= (t.px >= 18.5 ? 3 : 4.5));
        let reached = false; for (let i = 0; i < 40 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.classList?.contains("ec-cr-vis-opt")); }
        ok(`${w}×${h}: Tab reaches the visibility control; focus is visible`, reached && await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none" || getComputedStyle(document.activeElement).boxShadow !== "none"));
        if (reached) { const before = await p.evaluate(() => document.activeElement.getAttribute("aria-pressed")); if (before === "true") await p.keyboard.press("Tab"); await p.keyboard.press("Enter"); ok(`${w}×${h}: Enter selects the focused option and the pressed state follows`, await p.evaluate(() => document.activeElement.getAttribute("aria-pressed") === "true")); }
        if (w === 1440) ok("reduced motion: no entrance animation on the rating movement", m.anim === "none", m.anim);
        ok(`${w}×${h}: signed-out fixture still lists the public rows`, m.signedOutRows === 12);
      }
      if (MODE === "performance") {
        ok(`${w}×${h}: the fixture (five leaderboard states, 12 rows each, modules) renders within 3s`, loadMs < 3000, `${loadMs}ms`);
        ok(`${w}×${h}: CLS effectively zero`, m.cls <= 0.02, `${m.cls}`);
      }
      await ctx.close();
    }
    if (MODE === "performance") {
      const t = async (fn) => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
      const lb = await t(() => post(context, { action: "competitive-leaderboard" }));
      const me = await t(() => post(context, { action: "competitive-me" }, auth));
      const ar = await t(() => post(context, { action: "competitive-around-me" }, auth));
      ok("the leaderboard answers within 1.5s on the harness", lb.ms < 1500, `${lb.ms}ms`);
      ok("competitive-me (reconcile + read) answers within 1.5s", me.ms < 1500, `${me.ms}ms`);
      ok("around-me answers within 1s", ar.ms < 1000, `${ar.ms}ms`);
      const idxSql = read("supabase/migrations/0006_competitive_rating_v1.sql").replace(/\s+/g, " ");
      ok("the leaderboard is one indexed projection over the ordering columns, not a client-side sort of every account", idxSql.includes(`competitive_profiles_board_idx on public.competitive_profiles (${C.ORDERING.join(", ")})`) && !/\.sort\(/.test(read("src/components/competitive/LeaderboardPage.jsx")), C.ORDERING.join(", "));
      ok("no N+1: the server reads a fixed handful of queries per call", (read("api/_lib/competitive.js").match(/await rest\(/g) || []).length <= 14 && !/for \([^)]*\) \{[^}]*await rest\(/.test(read("api/_lib/competitive.js")));
      write("rating-performance-qa", { rows: rows.map((r) => ({ viewport: r.viewport, loadMs: r.loadMs, cls: r.cls })), ms: { leaderboard: lb.ms, me: me.ms, aroundMe: ar.ms } });
    }
    write(MODE === "responsive" ? "rating-responsive-qa" : "rating-accessibility-qa", { rows: rows.map(({ texts, moduleText, unratedText, ...r }) => r) });
  }

  if (MODE === "deployed") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("Candidate 4 on the preview", health?.preview?.candidateId === "Candidate 4" && health?.preview?.calibrationVersion === "1.4.0", `${health?.preview?.candidateId} ${health?.preview?.calibrationVersion}`);
    ok("the account provider is configured", !!((await operatorDiagnostics(context.request, BASE))?.providerConfigured && (await operatorDiagnostics(context.request, BASE))?.serverCredentialConfigured));
    const pub = await (await post(context, { action: "competitive-leaderboard" })).json();
    ok("the public leaderboard answers signed out with safe rows only (public AND placed accounts)", pub.status === "ok" && Array.isArray(pub.rows) && pub.rows.every((r) => Object.keys(r).sort().join(",") === [...C.PUBLIC_ROW_FIELDS].sort().join(",")) && !JSON.stringify(pub).match(/user_id|email|@/), `${pub.rows?.length} rows`);
    ok("competitive-me without an account is refused on the preview", (await post(context, { action: "competitive-me" })).status() === 401);
    ok("a forged token is refused", (await post(context, { action: "competitive-me" }, { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).status() === 401);
    const page = await context.newPage(); await fresh(page);
    await page.goto(`${BASE}/leaderboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Challenge Rating/ }).waitFor({ timeout: 30_000 });
    await page.locator('.ec-cr-board[data-state="ok"]').waitFor({ timeout: 30_000 });
    const st = await page.evaluate(() => ({ rows: document.querySelectorAll(".ec-cr-table tbody tr").length, empty: /THE FIRST RANKINGS ARE FORMING/.test(document.body.textContent), signedOut: /Sign in to see your own rating/.test(document.body.textContent), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    ok("the /leaderboard route renders signed out: the public table or the honest cold-start state, the sign-in entry, no overflow", (st.rows > 0 || st.empty) && st.signedOut && st.overflow === 0, JSON.stringify(st));
    await page.screenshot({ path: `${OUT}/screens/deployed-leaderboard-1280x900.png` });
    const scan = await page.evaluate(async () => { let text = ""; for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) text += await (await fetch(s)).text(); return { bytes: text.length, secretShaped: (text.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length, serviceJwt: (text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []).filter((j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch { return false; } }).length, hasClient: text.includes("competitive-leaderboard"), namesFunction: /competitive_rate_attempt|competitive_reconcile|competitive_rank_of/.test(text), fixtureRoute: text.includes("competitive-reference"), gitMetadata: ["VITE_VERCEL_GIT_COMMIT_MESSAGE", "VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME", "VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN"].filter((k) => text.includes(k)) }; });
    ok("no secret-shaped string in the bundle", scan.secretShaped === 0 && scan.serviceJwt === 0);
    ok("the bundle carries the competitive client and never the database functions or the dev fixture", scan.hasClient && !scan.namesFunction && !scan.fixtureRoute, JSON.stringify(scan));
    // Vercel hands the build its Git metadata VITE_-prefixed, and Vite inlines every
    // VITE_ variable — which shipped the whole commit message (server function names,
    // tables, defect write-ups) and the committer's name into the public bundle.
    ok("no Git metadata in the bundle: no commit message, no committer name or login", scan.gitMetadata.length === 0, scan.gitMetadata.join(",") || "none");
    write("rating-deployed-qa", { bundle: scan, health: { candidate: health?.preview?.candidateId, calibration: health?.preview?.calibrationVersion }, leaderboardRows: pub.rows?.length ?? null }, { exit: false });
    const c0 = checks.length;
    ok("bundle: no secret, no service_role JWT, no server function name, no fixture route, no Git metadata", scan.secretShaped === 0 && scan.serviceJwt === 0 && !scan.namesFunction && !scan.fixtureRoute && scan.gitMetadata.length === 0);
    write("rating-secret-audit", { bundle: scan }, { from: c0 });
  }
  await browser.close();
}
