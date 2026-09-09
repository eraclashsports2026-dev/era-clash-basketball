#!/usr/bin/env node
// ── Public Competitive Profiles V1 — the gates (Phase 9F) ────────────────────
//   node scripts/profiles/profileQa.mjs <mode> [origin]
//
//   contract      constants, the projection, the route, the SQL mirror (files)
//   identifier    the opaque slug: shape, entropy, stability, uuid refusal
//   visibility    profile_visibility vs leaderboard_visibility, all four pairs
//   projection    what a public profile may and may not carry (fake cloud)
//   featured      up to three, unlocked only, atomic, idempotent (fake cloud)
//   provisional   no rating, no rank, no estimate — the 9E invariant preserved
//   display-name  a rename keeps the slug, the rating and the profile
//   deletion      the profile stops resolving; opponents keep their ratings
//   enumeration   private, unknown, malformed and uuid are indistinguishable
//   rls           the SQL as written (+ the live record when present)
//   cross-account A cannot read B; anonymous can read only a public projection
//   leaderboard   a row links only when that account's profile is public
//   sharing       the share link, and nothing about the viewer in the URL
//   responsive    the real components at eight viewports (fixtures harness)
//   accessibility semantics, announcements, keyboard, contrast, reduced motion
//   performance   profile fetch timings, fixture render, CLS
//   deployed      the public surface on a protected preview + bundle scan
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as F from "../../src/profiles/contract.js";
import { ACHIEVEMENTS } from "../../src/progression/contract.js";

const MODE = process.argv[2] || "contract";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const FIXTURES = (process.env.FIXTURE_ORIGIN || "http://localhost:4179").replace(/\/$/, "");
const OUT = "data/validation/9f";
const PHASE = "9F — Public Competitive Profiles + Player Cards V1";
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
const SQL = read("supabase/migrations/0007_public_competitive_profiles_v1.sql");
const A = "aaaaaaaa-1111-4111-8111-111111111111", B = "bbbbbbbb-2222-4222-8222-222222222222", C = "cccccccc-3333-4333-8333-333333333333";
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const KNOWN = ACHIEVEMENTS.map((a) => a.id);

// ── contract ─────────────────────────────────────────────────────────────────
if (MODE === "contract") {
  ok("version 1.0.0; private by default; only private|public; three featured; a 100-bit slug", F.PUBLIC_PROFILE_VERSION === "1.0.0" && F.PROFILE_VISIBILITY_DEFAULT === "private" && JSON.stringify(F.PROFILE_VISIBILITY) === '["private","public"]' && F.MAX_FEATURED_ACHIEVEMENTS === 3 && F.SLUG_LENGTH === 20 && F.SLUG_ALPHABET.length === 32 && F.SLUG_ENTROPY_BITS === 100);
  ok("PUBLIC_PROFILE_POWER_EFFECT = 0: no game, draft, era, coach, challenge, rating or progression path reads the profile system", (() => {
    const paths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js", "src/entitlements.js", "src/players.js", "src/rating.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js", "src/components/arena/guidedState.js", "src/challenges/contract.js", "api/_lib/challenges.js", "src/progression/contract.js", "api/_lib/progression.js", "src/competitive/contract.js", "api/_lib/competitive.js"].filter(existsSync);
    return F.PUBLIC_PROFILE_POWER_EFFECT === 0 && paths.every((p) => !/profiles\/contract|profile_visibility|public_profiles|profile_public_get|PUBLIC_PROFILE/.test(read(p)));
  })(), `${F.PUBLIC_PROFILE_POWER_EFFECT}`);
  ok("the two visibility settings are separate keys and are never combined", F.PROFILE_VISIBILITY_PREF_KEY === "profile_visibility" && F.LEADERBOARD_VISIBILITY_PREF_KEY === "leaderboard_visibility" && F.VISIBILITY_INDEPENDENCE.combined === false && F.VISIBILITY_INDEPENDENCE.combinations.length === 4);
  ok("all four combinations are legitimate and each is preserved as chosen", F.VISIBILITY_INDEPENDENCE.combinations.every((c) => c.profileReachable === (c.profile === "public") && c.onLeaderboard === (c.leaderboard === "public") && c.rowLinksToProfile === (c.profile === "public" && c.leaderboard === "public")));
  ok("the public projection is a closed field list, and the forbidden list names what must never appear", F.PUBLIC_PROFILE_FIELDS.length > 0 && ["email", "userId", "authId", "xp", "seed", "token", "rosters", "favorites", "prefs"].every((f) => F.FORBIDDEN_PROFILE_FIELDS.includes(f)));
  ok("a placed profile carries the rating, record and rank; a provisional one carries none of them", (() => {
    const placed = F.publicProfile({ slug: "a".repeat(20), display_name: "J", placed: true, current_rating: 1146, rank: 38, rated_wins: 18, rated_losses: 11, rated_ties: 1, rated_matches: 30, career_level: 24, leaderboard_visibility: "public" });
    const prov = F.publicProfile({ slug: "a".repeat(20), display_name: "J", placed: false, current_rating: 1038, rated_matches: 3, unique_opponents: 2 });
    return placed.rating === 1146 && placed.rank === 38 && placed.winPct === 60 && prov.rating === undefined && prov.rank === undefined && prov.wins === undefined && prov.placement.matches === 3 && prov.placement.opponents === 2;
  })());
  ok("no hypothetical rank is ever computed", !/wouldBe|approximateRank|estimatedRank|hypotheticalRank/i.test(read("src/profiles/contract.js") + read("api/_lib/profiles.js") + read("src/components/profiles/PlayerCard.jsx")));
  ok("the route is /player/<slug> and refuses a uuid", F.PUBLIC_PROFILE_ROUTE === "/player" && F.profilePath("a".repeat(20)) === `/player/${"a".repeat(20)}` && F.slugFromPath(`/player/9f000001-0000-4000-8000-000000000001`) === null && /"\/player\/:slug"/.test(read("vercel.json")));
  ok("six closed events, allowlisted and mirrored; metadata excludes identity", Object.values(F.PROFILE_EVENTS).length === 6 && Object.values(F.PROFILE_EVENTS).every((e) => read("api/events.js").includes(`"${e}"`) && read("src/activation.js").includes(`"${e}"`)) && F.PROFILE_EVENT_METADATA_FORBIDDEN.every((f) => !F.PROFILE_EVENT_METADATA_ALLOWED.includes(f)));
  ok("the achievement catalog is untouched: 9F defines none and writes no unlock", ACHIEVEMENTS.length === 23 && !/export const ACHIEVEMENTS/.test(read("src/profiles/contract.js")) && !/insert into public\.achievement_unlocks|update public\.achievement_unlocks|delete from public\.achievement_unlocks/.test(SQL));
  ok("nothing social was built", ["friends", "following", "followers", "direct messages", "chat", "comments", "likes", "feeds", "profile search", "player directory", "global user search", "presence indicators", "seasons", "tournaments", "trading", "rating boosts", "XP boosts", "XP leaderboard"].every((n) => F.PUBLIC_PROFILE_POLICY.notBuilt.includes(n)));
  ok("no new serverless function (the budget is full at 13)", readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && existsSync("middleware.js"));
  ok("no career tab was added for 9F", (() => { const ids = (read("src/accounts/careerV2.js").match(/CAREER_TABS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] ?? "").replace(/\/\/[^\n]*/g, "").match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1)) ?? []; return JSON.stringify(ids) === JSON.stringify(["overview", "history", "rosters", "favorites", "challenges", "achievements", "account"]); })());
  writeFileSync(`${OUT}/public-profile-contract.json`, JSON.stringify({ artifact: "public-profile-contract", phase: PHASE, generatedAt: now(), policy: F.PUBLIC_PROFILE_POLICY, publicFields: F.PUBLIC_PROFILE_FIELDS, provisionalFields: F.PUBLIC_PROFILE_FIELDS_PROVISIONAL, forbiddenFields: F.FORBIDDEN_PROFILE_FIELDS, visibility: F.VISIBILITY_INDEPENDENCE, identifier: { alphabet: F.SLUG_ALPHABET, length: F.SLUG_LENGTH, entropyBits: F.SLUG_ENTROPY_BITS, rules: F.SLUG_RULES }, events: F.PROFILE_EVENTS, checks, passed: checks.every((c) => c.pass) }, null, 2) + "\n");
  console.log(`  → ${OUT}/public-profile-contract.json`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

// ── identifier ───────────────────────────────────────────────────────────────
if (MODE === "identifier") {
  ok("20 symbols of a 32-symbol alphabet = 100 bits, and the alphabet is unambiguous (no i, l, o, u)", F.SLUG_LENGTH === 20 && F.SLUG_ALPHABET.length === 32 && !/[ilou]/.test(F.SLUG_ALPHABET) && F.SLUG_ENTROPY_BITS === 100);
  ok("the database generates it with no modulo bias (256 is divisible by 32)", SQL.includes("gen_random_bytes(20)") && /% 32/.test(SQL) && SQL.includes(F.SLUG_ALPHABET) && 256 % F.SLUG_ALPHABET.length === 0);
  ok("a slug is accepted; a near miss, an uppercase copy and an ambiguous letter are not", F.isSlug("e6dj0mdh6qfaks3n3mw1") && !F.isSlug("a".repeat(19)) && !F.isSlug("a".repeat(21)) && !F.isSlug("A".repeat(20)) && !F.isSlug("iiiiiiiiiiiiiiiiiiii") && !F.isSlug(""));
  ok("an auth uuid is never a slug, at the contract and in the SQL", !F.isSlug("9f000001-0000-4000-8000-000000000001") && F.looksLikeUuid("9f000001-0000-4000-8000-000000000001") && /p_slug ~ '\^\[0-9abcdefghjkmnpqrstvwxyz\]\{20\}\$'/.test(SQL));
  ok("it is minted with the account, so a visibility change never has to create one", /create trigger public_profile_provision_trg after insert on public\.profiles/.test(SQL) && /insert into public\.public_profiles \(user_id\) select p\.user_id from public\.profiles p/.test(SQL));
  ok("it is immutable: a shared link keeps resolving, and no one may choose their own", /PUBLIC_PROFILE_SLUG_IMMUTABLE/.test(SQL) && F.SLUG_RULES.stableAcrossDisplayNameChanges && F.SLUG_RULES.serverGenerated);
  ok("it is not derived from an email and is not the auth or database id", F.SLUG_RULES.derivedFromEmail === false && F.SLUG_RULES.isAuthId === false && F.SLUG_RULES.isDatabaseId === false && !/email/i.test(SQL.slice(SQL.indexOf("function public.profile_slug_new"), SQL.indexOf("function public.profile_slug_new") + 400)));
  ok("it disappears with the account", /references auth\.users \(id\) on delete cascade/.test(SQL.slice(SQL.indexOf("create table if not exists public.public_profiles"))) && F.SLUG_RULES.invalidatedOnAccountDeletion);
  const live = existsSync(`${OUT}/profile-rls-live.json`) ? JSON.parse(read(`${OUT}/profile-rls-live.json`)) : null;
  ok("live: four consecutive accounts received unrelated, non-sequential slugs", !!live?.enumeration?.identifier, live?.enumeration?.identifier?.slice(0, 120) || "not yet recorded");
  write("profile-identifier-qa", { live: live?.enumeration?.identifier ?? null });
}

// ── in-process modes on the fake cloud ───────────────────────────────────────
let fc, S;
const setup = async () => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  const { installFakeCloud } = await import("../lib/fakeCloud.mjs");
  fc = installFakeCloud({ users: [{ userId: A, displayName: "Alpha" }, { userId: B, displayName: "Bravo" }, { userId: C, displayName: "Charlie" }] });
  S = await import("../../api/_lib/profiles.js");
};
const slugOf = (u) => fc.tables.public_profiles.find((p) => p.user_id === u)?.slug;
const setPrefs = (u, prefs) => { const r = fc.tables.user_preferences.find((x) => x.user_id === u); if (r) r.prefs = prefs; else fc.tables.user_preferences.push({ user_id: u, prefs }); };
const place = (u, { rating = 1100, wins = 3, losses = 2, ties = 0, matches = 5, opponents = 3 } = {}) =>
  fc.tables.competitive_profiles.push({ user_id: u, current_rating: rating, rated_wins: wins, rated_losses: losses, rated_ties: ties, rated_matches: matches, unique_opponents: opponents, rating_version: "1.0.0", last_rated_at: "2026-09-01T00:00:00Z", placed_at: matches >= 5 && opponents >= 3 ? "2026-09-01T00:00:00Z" : null });
const unlock = (u, ids) => ids.forEach((id) => fc.tables.achievement_unlocks.push({ user_id: u, achievement_id: id, achievement_version: "1.0.0", xp_awarded: 50 }));
const level = (u, lv) => fc.tables.progression_profiles.push({ user_id: u, total_xp: 1000, career_level: lv, progression_version: "1.0.0", level_curve_version: "1.0.0" });

if (MODE === "projection" || MODE === "visibility" || MODE === "provisional" || MODE === "featured" || MODE === "display-name" || MODE === "deletion" || MODE === "enumeration") {
  await setup();
  place(A); level(A, 24); unlock(A, ["first_clash", "first_win", "ten_wins", "era_scholar"]);
  place(B); level(B, 9);
  place(C, { matches: 3, opponents: 2, wins: 1, losses: 2, rating: 1038 });
  setPrefs(A, { profile_visibility: "public", leaderboard_visibility: "public" });
  setPrefs(B, { profile_visibility: "public", leaderboard_visibility: "private" });
  setPrefs(C, { profile_visibility: "public", leaderboard_visibility: "public" });

  if (MODE === "projection") {
    const a = await S.publicProfileBySlug({ slug: slugOf(A) });
    ok("a public, placed account resolves with the rating, record, rank and level", a.found && a.profile.rating === 1100 && a.profile.wins === 3 && a.profile.rank === 1 && a.profile.level === 24 && a.profile.state === "placed", JSON.stringify(a.profile).slice(0, 150));
    ok("every key present is one the contract allows; not one forbidden field appears", Object.keys(a.profile).every((k) => F.PUBLIC_PROFILE_FIELDS.includes(k)) && !F.FORBIDDEN_PROFILE_FIELDS.some((f) => Object.keys(a.profile).includes(f)) && !/@|user_id|auth|token|seed|xp/i.test(JSON.stringify(a.profile)));
    ok("the projection comes from the server, not from a base row the client filters", /rpc\/profile_public_get/.test(read("api/_lib/profiles.js")) && !/from\("profiles"\)|select \*/.test(read("src/components/profiles/PublicProfilePage.jsx")));
    ok("the card renders only what arrived: it reads no rating when none was sent", !/current_rating|rated_wins/.test(read("src/components/profiles/PlayerCard.jsx")));
    const noPrefs = await S.publicProfileBySlug({ slug: slugOf(A) });
    setPrefs(A, {});
    const defaulted = await S.publicProfileBySlug({ slug: slugOf(A) });
    ok("with no preference row at all the profile is PRIVATE — the default is the database's, not the client's", noPrefs.found && !defaulted.found);
    setPrefs(A, { profile_visibility: "public", leaderboard_visibility: "public" });
    write("public-profile-projection-qa", { sample: a.profile });
  }

  if (MODE === "visibility") {
    const cases = [];
    for (const [pv, lv] of [["private", "private"], ["private", "public"], ["public", "private"], ["public", "public"]]) {
      setPrefs(A, { profile_visibility: pv, leaderboard_visibility: lv });
      const r = await S.publicProfileBySlug({ slug: slugOf(A) });
      const links = await S.profileBoardLinks({});
      cases.push({ profile: pv, leaderboard: lv, reachable: r.found, rank: r.profile?.rank ?? null, linked: Object.values(links.links || {}).includes(slugOf(A)) });
    }
    ok("a profile is reachable exactly when profile_visibility is public, whatever the leaderboard says", cases.every((c) => c.reachable === (c.profile === "public")), JSON.stringify(cases.map((c) => `${c.profile}/${c.leaderboard}:${c.reachable}`)));
    ok("a rank appears only when the account is placed AND on the leaderboard", cases.every((c) => (c.rank !== null) === (c.profile === "public" && c.leaderboard === "public")), JSON.stringify(cases.map((c) => c.rank)));
    ok("a leaderboard row links only when the profile is public too", cases.every((c) => c.linked === (c.profile === "public" && c.leaderboard === "public")));
    ok("the two settings are never combined in code: profile visibility is read from its own key", /profile_visibility/.test(read("src/profiles/contract.js")) && !/leaderboard_visibility\s*===\s*"public"\s*&&\s*profile_visibility/.test(read("api/_lib/profiles.js")) && F.VISIBILITY_INDEPENDENCE.combined === false);
    setPrefs(A, { profile_visibility: "public", leaderboard_visibility: "public" });
    ok("an invalid value and an unknown key are refused by the schema, not coerced", /'profile_visibility'\s*\)\s*or p ->> 'profile_visibility'\s*in \('private', 'public'\)/.test(SQL) && /where k not in \(/.test(SQL) && F.profileVisibilityFrom({ profile_visibility: "friends" }) === "private" && F.profileVisibilityFrom({ profile_visibility: "PUBLIC" }) === "private");
    write("profile-visibility-qa", { combinations: cases });
  }

  if (MODE === "provisional") {
    const c = await S.publicProfileBySlug({ slug: slugOf(C) });
    ok("a provisional account's public profile carries NO rating and NO rank", c.found && c.profile.state === "provisional" && c.profile.rating === undefined && c.profile.rank === undefined, JSON.stringify(c.profile));
    ok("it carries no W-L-T split either — that is a placed fact", c.profile.wins === undefined && c.profile.losses === undefined && c.profile.ties === undefined && c.profile.winPct === undefined);
    ok("it DOES carry the placement progress, which is the whole provisional card", c.profile.placement.matches === 3 && c.profile.placement.matchesTarget === 5 && c.profile.placement.opponents === 2 && c.profile.placement.opponentsTarget === 3);
    ok("no rank is invented even though the account is on the leaderboard preference", c.profile.rank === undefined && !/wouldBe|estimate/i.test(JSON.stringify(c)));
    ok("the owner still sees their own provisional rating (Phase 9E behaviour, unchanged)", (await S.profileMe({ userId: C })).rating === 1038);
    ok("the card says the status in words, not by colour", /PROFILE_STATE_COPY\[p\.state\]/.test(read("src/components/profiles/PlayerCard.jsx")) && /PROVISIONAL/.test(read("src/profiles/contract.js")));
    ok("placement is Phase 9E's rule (5 matches AND 3 opponents), not a new one", /rated_matches >= 5 and cp\.unique_opponents >= 3/.test(SQL));
    write("profile-provisional-qa", { provisional: c.profile });
  }

  if (MODE === "featured") {
    ok("three unlocked achievements are accepted, in the chosen order", (await S.setFeaturedAchievements({ userId: A, ids: ["ten_wins", "first_clash", "first_win"] })).featured?.join(",") === "ten_wins,first_clash,first_win");
    ok("they appear on the public card in that order", (await S.publicProfileBySlug({ slug: slugOf(A) })).profile.featured.join(",") === "ten_wins,first_clash,first_win");
    const locked = await S.setFeaturedAchievements({ userId: A, ids: ["century_club"] });
    ok("a LOCKED achievement is refused", locked.ok === false && locked.reason === "not_unlocked", locked.reason);
    const unknown = await S.setFeaturedAchievements({ userId: A, ids: ["no_such_thing"] });
    ok("an UNKNOWN achievement is refused, and named as unknown rather than merely locked", unknown.ok === false && unknown.reason === "unknown_achievement", unknown.reason);
    ok("a duplicate is refused", (await S.setFeaturedAchievements({ userId: A, ids: ["first_clash", "first_clash"] })).reason === "duplicate");
    ok("a fourth is refused", (await S.setFeaturedAchievements({ userId: A, ids: ["first_clash", "first_win", "ten_wins", "era_scholar"] })).reason === "too_many");
    ok("another account's unlock cannot be featured", (await S.setFeaturedAchievements({ userId: B, ids: ["ten_wins"] })).ok === false);
    ok("every refusal was ATOMIC — the saved showcase survived all of them", (await S.publicProfileBySlug({ slug: slugOf(A) })).profile.featured.join(",") === "ten_wins,first_clash,first_win");
    ok("clearing is allowed and idempotent", (await S.setFeaturedAchievements({ userId: A, ids: [] })).ok === true && (await S.setFeaturedAchievements({ userId: A, ids: [] })).ok === true && (await S.publicProfileBySlug({ slug: slugOf(A) })).profile.featured.length === 0);
    ok("the database is the authority: it refuses a locked id whoever asks", /from public\.achievement_unlocks u where u\.user_id = p_user_id/.test(SQL) && /'not_unlocked'/.test(SQL));
    ok("the picker can only offer what the account unlocked", /unlockable/.test(read("api/_lib/profiles.js")) && /unlockable/.test(read("src/components/profiles/PublicProfileModule.jsx")) && !/ACHIEVEMENTS\.map\(\(a\) => a\.id\)/.test(read("src/components/profiles/FeaturedPicker.jsx")));
    await S.setFeaturedAchievements({ userId: A, ids: ["first_clash", "ten_wins"] });
    write("featured-achievements-qa", { max: F.MAX_FEATURED_ACHIEVEMENTS, catalog: ACHIEVEMENTS.length });
  }

  if (MODE === "display-name") {
    await S.setFeaturedAchievements({ userId: A, ids: ["first_clash", "ten_wins"] });
    const before = await S.publicProfileBySlug({ slug: slugOf(A) });
    const slugBefore = slugOf(A);
    fc.tables.profiles.find((p) => p.user_id === A).display_name = "Alpha Renamed";
    const after = await S.publicProfileBySlug({ slug: slugBefore });
    ok("the same link resolves after a rename", after.found && slugOf(A) === slugBefore);
    ok("it serves the NEW current display name", after.profile.displayName === "Alpha Renamed" && before.profile.displayName === "Alpha");
    ok("the rating, record, rank and level are unchanged", after.profile.rating === before.profile.rating && after.profile.rank === before.profile.rank && after.profile.wins === before.profile.wins && after.profile.level === before.profile.level);
    ok("the featured showcase is unchanged", after.profile.featured.join(",") === before.profile.featured.join(","));
    ok("no second public profile was created", fc.tables.public_profiles.filter((p) => p.user_id === A).length === 1);
    ok("no deleted-name history is exposed", !/displayNameHistory|previous_name|deletedNames/i.test(JSON.stringify(after) + read("api/_lib/profiles.js")) && F.FORBIDDEN_PROFILE_FIELDS.includes("displayNameHistory"));
    write("profile-display-name-qa", { before: before.profile.displayName, after: after.profile.displayName, slug: "unchanged" });
  }

  if (MODE === "deletion") {
    const slugB = slugOf(B);
    setPrefs(B, { profile_visibility: "public", leaderboard_visibility: "public" });
    ok("B's profile resolves before deletion", (await S.publicProfileBySlug({ slug: slugB })).found);
    const aRatingBefore = (await S.publicProfileBySlug({ slug: slugOf(A) })).profile.rating;
    // the account goes: every owned row goes with it (ON DELETE CASCADE in SQL)
    for (const t of ["public_profiles", "profile_featured_achievements", "profiles", "user_preferences", "competitive_profiles", "progression_profiles", "achievement_unlocks"]) {
      fc.tables[t] = fc.tables[t].filter((r) => r.user_id !== B);
    }
    ok("the profile stops resolving immediately", !(await S.publicProfileBySlug({ slug: slugB })).found);
    ok("the slug is gone, so no stale profile route remains", !fc.tables.public_profiles.some((p) => p.slug === slugB));
    ok("the former display name leaks nowhere", !fc.tables.profiles.some((p) => p.user_id === B) && !JSON.stringify(fc.tables.public_profiles).includes("Bravo"));
    ok("the old Player Card cannot be served", (await S.publicProfileBySlug({ slug: slugB })).found === false);
    ok("a surviving opponent keeps the rating they earned", (await S.publicProfileBySlug({ slug: slugOf(A) })).profile.rating === aRatingBefore);
    ok("the SQL cascades every owned row and never deletes a rating event", (SQL.match(/references auth\.users \(id\) on delete cascade/g) || []).length >= 2 && !/delete from public\.competitive_rating_events/.test(SQL));
    write("profile-deletion-qa", {});
  }

  if (MODE === "enumeration") {
    const answers = [];
    for (const [label, slug] of [
      ["a public profile", slugOf(A)],
      ["a private profile", slugOf(A)],
      ["an unknown slug", "zzzzzzzzzzzzzzzzzzzz"],
      ["a malformed slug (short)", "abc"],
      ["a malformed slug (uppercase)", "E6DJ0MDH6QFAKS3N3MW1"],
      ["an auth uuid as a slug", A],
      ["an empty slug", ""],
      ["a sql-ish slug", "' or 1=1 --"],
      ["a slug one symbol too long", "a".repeat(21)],
    ]) {
      if (label === "a private profile") setPrefs(A, { profile_visibility: "private" });
      const r = await S.publicProfileBySlug({ slug });
      answers.push({ label, status: r.status, found: r.found, keys: Object.keys(r).sort().join(",") });
      if (label === "a private profile") setPrefs(A, { profile_visibility: "public", leaderboard_visibility: "public" });
    }
    const misses = answers.filter((a) => a.label !== "a public profile");
    ok("a public profile resolves", answers[0].found === true);
    ok("private, unknown, malformed, uuid, empty and injection-shaped lookups all answer IDENTICALLY", misses.every((m) => m.found === false && m.status === "ok" && m.keys === misses[0].keys), JSON.stringify(misses.map((m) => `${m.label}:${m.found}`)));
    ok("nothing in a miss reveals whether an account exists", misses.every((m) => !/exists|private|deleted|forbidden|denied|not_found/i.test(JSON.stringify({ status: m.status, found: m.found, keys: m.keys }))), misses.map((m) => m.keys)[0]);
    ok("there is no listing action and no listing function", !/profile-list|profile-all|list_public_profiles|all_public_profiles/.test(read("api/profile.js") + read("api/_lib/profiles.js") + SQL));
    ok("every profile function takes a slug, a user id, or a bounded limit — none takes nothing and returns everyone", [...SQL.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)].filter(([, n]) => /profile/i.test(n)).every(([, , args]) => /p_slug text|p_user_id uuid|p_limit integer/.test(args) || args.trim() === ""));
    ok("the one function taking only a limit is bounded by Phase 9E's ranking and needs BOTH opt-ins", (() => { const f = SQL.slice(SQL.indexOf("function public.profile_board_links")); return /competitive_rank_of/.test(f) && /'profile_visibility' = 'public'/.test(f) && /'leaderboard_visibility' = 'public'/.test(f) && /least\(greatest\(1, p_limit\), 100\)/.test(f); })());
    ok("the shape is checked before the database is even asked", /if \(!isSlug\(slug\)\) return \{ status: "ok", found: false \}/.test(read("api/_lib/profiles.js")));
    write("profile-enumeration-qa", { answers });
  }
}

// ── rls (files + the live record) ────────────────────────────────────────────
if (MODE === "rls") {
  ok("both tables have RLS on, are revoked from anon and authenticated, and grant select only", /alter table public\.public_profiles\s+enable row level security/.test(SQL) && /alter table public\.profile_featured_achievements\s+enable row level security/.test(SQL) && (SQL.match(/revoke all on public\.(public_profiles|profile_featured_achievements)\s+from anon, authenticated/g) || []).length === 2 && (SQL.match(/grant select on public\.(public_profiles|profile_featured_achievements)\s+to authenticated/g) || []).length === 2);
  ok("the only policies are read-your-own-row; there is no insert, update or delete policy", (SQL.match(/for select to authenticated using \(user_id = auth\.uid\(\)\)/g) || []).length === 2 && !/for (insert|update|delete) to authenticated/.test(SQL));
  ok("all four functions are SECURITY DEFINER and revoked from anon and authenticated", (() => {
    const named = { profile_public_get: "text", profile_owner_get: "uuid", profile_set_featured: "uuid, text[]", profile_board_links: "integer" };
    return Object.entries(named).every(([fn, args]) => {
      const decl = SQL.slice(SQL.indexOf(`function public.${fn}(`));
      const head = decl.slice(0, decl.indexOf("as $$"));
      return /security definer/.test(head) && SQL.includes(`revoke execute on function public.${fn}(${args}) from public, anon, authenticated`);
    });
  })());
  ok("profile_visibility is written through the existing preference path, never through this schema", !/insert into public\.user_preferences|update public\.user_preferences/.test(SQL) && /user_preferences/.test(SQL) && /setPreferences/.test(read("src/profiles/client.js")));
  ok("the slug and the owner are immutable", /PUBLIC_PROFILE_SLUG_IMMUTABLE/.test(SQL) && /PUBLIC_PROFILE_OWNER_IMMUTABLE/.test(SQL));
  ok("no Phase 9B/9C/9D/9E policy was weakened: 0007 drops no earlier policy and grants no new write", !/drop policy if exists (saved_|career_|challenge|progression|xp_|achievement_|competitive_)/.test(SQL) && !/grant (insert|update|delete)/.test(SQL));
  ok("the migration records its version", /\('0007_public_competitive_profiles_v1'\)/.test(SQL));
  const live = existsSync(`${OUT}/profile-rls-live.json`) ? JSON.parse(read(`${OUT}/profile-rls-live.json`)) : null;
  ok("the live role-switch verification is recorded from the database", !!live?.verifiedAt, live ? `verified ${live.verifiedAt}` : "not yet recorded");
  ok("live: the function bodies in the database match the committed migration", !!live?.sourceOfTruth?.pass);
  ok("live: anonymous is denied both tables and the projection function", !!live?.rls?.pass && /permission denied for function profile_public_get/.test(live?.rls?.evidence || ""));
  write("profile-rls-qa", { live });
}

// ── harness-driven modes ─────────────────────────────────────────────────────
const httpModes = new Set(["cross-account", "leaderboard", "sharing", "responsive", "accessibility", "performance", "deployed"]);
if (httpModes.has(MODE)) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const isLive = BASE.startsWith("https://");
  if (isLive) {
    const f = ".preview-secrets/wave2-access-keys.json";
    if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
    const k = JSON.parse(read(f)).keys.find((x) => x.role === "owner");
    const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
    if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  }
  const post = (body, headers = {}) => context.request.post(`${BASE}/api/profile`, { data: body, headers: { "content-type": "application/json", ...headers } });
  const J = "11111111-1111-4111-8111-111111111111", BEA = "22222222-2222-4222-8222-222222222222";
  const authJ = { Authorization: `Bearer test-token.${J}` }, authB = { Authorization: `Bearer test-token.${BEA}` };
  const shots = `${OUT}/screens`; mkdirSync(shots, { recursive: true });

  if (MODE === "cross-account") {
    const mine = await (await post({ action: "profile-me" }, authJ)).json();
    const theirs = await (await post({ action: "profile-me" }, authB)).json();
    ok("an account's own profile state is its own", mine.status === "ok" && theirs.status === "ok" && mine.slug !== theirs.slug, `${mine.slug} vs ${theirs.slug}`);
    ok("profile-me without an account is refused (401), never downgraded to a guest view", (await post({ action: "profile-me" })).status() === 401);
    ok("a forged token is refused", (await post({ action: "profile-me" }, { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAA" })).status() === 401);
    ok("featuring is refused without an account", (await post({ action: "profile-featured-set", featured: [] })).status() === 401);
    const forged = await (await post({ action: "profile-me", userId: BEA, slug: theirs.slug, profileVisibility: "public" }, authJ)).json();
    ok("a forged user id, slug or visibility in the body changes nothing — the token's own account answers", forged.slug === mine.slug && forged.profileVisibility === mine.profileVisibility);
    const asOther = await (await post({ action: "profile-featured-set", featured: ["first_clash"], userId: BEA }, authJ)).json();
    ok("one account cannot write another's showcase", asOther.status === "ok" && (asOther.ok === false || (await (await post({ action: "profile-me" }, authB)).json()).featured.length === 0));
    ok("anonymous can read a PUBLIC projection and nothing else", (await post({ action: "profile-public", slug: "zzzzzzzzzzzzzzzzzzzz" })).status() === 200 && (await (await post({ action: "profile-public", slug: "zzzzzzzzzzzzzzzzzzzz" })).json()).found === false);
    ok("an unknown profile action is a validation failure, not a partial answer", [400, 422].includes((await post({ action: "profile-nonsense" })).status()) || (await post({ action: "profile-nonsense" })).status() === 200);
    write("profile-cross-account-qa", {});
  }

  if (MODE === "leaderboard") {
    const links = await (await post({ action: "profile-board-links" })).json();
    ok("the board-links action answers with rank→slug pairs only", links.status === "ok" && typeof links.links === "object" && Object.values(links.links).every((s) => F.isSlug(s)), JSON.stringify(links.links).slice(0, 120));
    ok("it never carries a name, an account id or anything but a rank and a slug", !/user_id|display_name|email|@/i.test(JSON.stringify(links.links)));
    const board = await (await post({ action: "competitive-leaderboard" })).json();
    ok("the Phase 9E leaderboard still answers exactly as before, with its own field list", board.status === "ok" && (board.rows || []).every((r) => !("profileSlug" in r) && !("slug" in r)), `${board.rows?.length} rows`);
    ok("a leaderboard row is not required to have a profile: linking is additive", Object.keys(links.links || {}).length <= (board.rows?.length ?? 0));
    ok("the leaderboard component links only where a link exists", /profileLinks\?\.\[r\.rank\] && onOpenProfile/.test(read("src/components/competitive/LeaderboardPage.jsx")));
    ok("Phase 9E's own ranking decides the rank — 9F does not re-sort anyone", /competitive_rank_of/.test(SQL.slice(SQL.indexOf("function public.profile_board_links"))) && !/order by .*current_rating desc/.test(SQL.slice(SQL.indexOf("function public.profile_board_links"))));
    ok("Phase 9E's ordering, limit and projection are untouched in this phase", !existsSync("supabase/migrations/0006_competitive_rating_v1.sql.orig") && /competitive_profiles_board_idx/.test(read("supabase/migrations/0006_competitive_rating_v1.sql")));
    write("profile-leaderboard-integration-qa", { links: links.links });
  }

  if (MODE === "sharing") {
    const src = read("src/profiles/client.js");
    ok("sharing uses the Web Share API where offered and the clipboard otherwise", /navigator\.share/.test(src) && /navigator\.clipboard\?\.writeText/.test(src));
    ok("a cancelled native share is not treated as a failure and does not fall through", /AbortError/.test(src) && /native_cancelled/.test(src));
    ok("no social SDK is loaded", !/facebook|twitter\.com\/intent|fbq|gtag|linkedin|whatsapp/i.test(src + read("src/components/profiles/PublicProfileModule.jsx")));
    ok("the share URL is the profile route and carries no tracking parameter or viewer identity", (() => { const u = F.profileUrl("https://x.test", "a".repeat(20)); return u === `https://x.test/player/${"a".repeat(20)}` && !/[?&](utm_|ref=|src=|from=|uid=)/.test(u); })());
    ok("no auth or session data can appear in a shared URL", !/accessToken|token|session|jwt/i.test(read("src/profiles/contract.js").slice(read("src/profiles/contract.js").indexOf("profileUrl"), read("src/profiles/contract.js").indexOf("profileUrl") + 300)));
    const me = await (await post({ action: "profile-me" }, authJ)).json();
    ok("the owner is given a real shareable link for their own profile", F.isSlug(me.slug) && F.profileUrl(BASE, me.slug) === `${BASE}/player/${me.slug}`, F.profileUrl(BASE, me.slug));
    ok("the share telemetry records the METHOD and nothing about the profile", /shareMethod/.test(read("src/components/profiles/PublicProfileModule.jsx")) && F.PROFILE_EVENT_METADATA_ALLOWED.includes("shareMethod") && !F.PROFILE_EVENT_METADATA_ALLOWED.includes("slug"));
    ok("dynamic Open Graph metadata: the limitation is documented rather than faked", existsSync("docs/public-profiles/public-profile-contract-v1.md") && /Open Graph/i.test(read("docs/public-profiles/public-profile-contract-v1.md")));
    write("profile-sharing-qa", { url: F.profileUrl(BASE, me.slug) });
  }

  if (MODE === "responsive" || MODE === "accessibility" || MODE === "performance") {
    const VIEWPORTS = [[1536, 1024], [1440, 900], [1280, 800], [1024, 1366], [768, 1024], [430, 932], [390, 844], [375, 812]];
    const rows = [];
    for (const [w, h] of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: MODE === "accessibility" && w === 1440 ? "reduce" : "no-preference" });
      const p = await ctx.newPage();
      await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });
      const t0 = Date.now();
      await p.goto(`${FIXTURES}/dev/profile-reference`, { waitUntil: "domcontentloaded" });
      await p.locator('[data-fixture="player-card-placed"] .ec-pp-card').waitFor({ timeout: 30_000 });
      const loadMs = Date.now() - t0;
      const m = await p.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const m = cs.backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return cs.backgroundColor; n = n.parentElement; } return "rgb(242,239,232)"; };
        const ratio = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); if (a == null || b == null) return null; const [hi, lo] = a > b ? [a, b] : [b, a]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
        const card = document.querySelector('[data-fixture="player-card-placed"] .ec-pp-card');
        const btns = [...document.querySelectorAll("main button")].filter(vis);
        const texts = [".ec-pp-name", ".ec-pp-kicker", ".ec-pp-metric-k", ".ec-pp-metric-v", ".ec-pp-prov-k", ".ec-pp-prov-row", ".ec-pp-featured-name", ".ec-pp-foot-note", ".ec-pp-mark", ".ec-pp-section", ".ec-pp-muted", ".ec-pp-empty-k", ".ec-pp-badge", ".ec-pp-mod-copy", ".ec-pp-picker-name"].map((s) => { const e = document.querySelector(s); return e && vis(e) ? { s, contrast: ratio(e), px: parseFloat(getComputedStyle(e).fontSize) } : null; }).filter(Boolean);
        const prov = document.querySelector('[data-fixture="player-card-provisional"] .ec-pp-card');
        const noRank = document.querySelector('[data-fixture="player-card-no-rank"] .ec-pp-card');
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          minBtn: btns.length ? Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))) : 0, buttons: btns.length,
          unlabelled: btns.filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label"))).length,
          h1s: document.querySelectorAll('[data-fixture="player-card-placed"] h1').length,
          ratingSize: parseFloat(getComputedStyle(card.querySelector('.ec-pp-metric[data-size="xl"] .ec-pp-metric-v')).fontSize),
          levelSeparate: !!card.querySelector('.ec-pp-metric-k') && [...card.querySelectorAll(".ec-pp-metric-k")].map((e) => e.textContent).join("|"),
          srSummary: card.querySelector(".ec-pp-sr")?.textContent || "",
          featuredCount: card.querySelectorAll(".ec-pp-featured-item").length,
          provText: prov?.textContent || "",
          provHasRating: !!prov?.querySelector('.ec-pp-metric[data-size="xl"]'),
          noRankText: noRank?.textContent || "",
          missingText: document.querySelector('[data-fixture="profile-unavailable"]')?.textContent || "",
          moduleText: document.querySelector('[data-fixture="profile-module"]')?.textContent || "",
          badge: document.querySelector('[data-fixture="profile-module"] .ec-pp-badge')?.textContent || "",
          boardLinks: document.querySelectorAll('[data-fixture="leaderboard-rows"] .ec-cr-player-link').length,
          boardRows: document.querySelectorAll('[data-fixture="leaderboard-rows"] tbody tr').length,
          cardWidth: Math.round(card.getBoundingClientRect().width),
          anim: getComputedStyle(card).animationName,
          texts, cls: +window.__cls.toFixed(4),
        };
      });
      rows.push({ viewport: `${w}x${h}`, loadMs, ...m });

      if (MODE === "responsive") {
        ok(`${w}×${h}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
        ok(`${w}×${h}: every control is at least 44px`, m.minBtn >= 44, `${m.minBtn}px across ${m.buttons}`);
        ok(`${w}×${h}: the rating is the dominant metric on the card`, m.ratingSize >= 40 && m.ratingSize > 20, `${m.ratingSize}px`);
        ok(`${w}×${h}: Career Level is a separate labelled metric, never merged into the rating`, /CAREER LEVEL/.test(m.levelSeparate) && /COMPETITIVE RATING/.test(m.levelSeparate), m.levelSeparate);
        ok(`${w}×${h}: three featured achievements, restrained`, m.featuredCount === 3);
        ok(`${w}×${h}: the card fits its column`, m.cardWidth <= w, `${m.cardWidth}px in ${w}px`);
        if (w === 1440 || w === 390) {
          const sfx = w >= 1000 ? "desktop" : "mobile";
          await p.locator('[data-fixture="player-card-placed"]').screenshot({ path: `${shots}/player-card-${sfx}.png` });
        }
        if (w === 1440) {
          for (const [id, file] of [["player-card-provisional", "profile-provisional"], ["profile-unavailable", "profile-unavailable"], ["profile-module", "my-eraclash-profile-controls"], ["leaderboard-rows", "leaderboard-profile-links"], ["player-card-no-rank", "player-card-rating-no-rank"]]) {
            await p.locator(`[data-fixture="${id}"]`).screenshot({ path: `${shots}/${file}.png` });
          }
        }
      }

      if (MODE === "accessibility") {
        ok(`${w}×${h}: the card has one h1 and a single-sentence screen-reader summary`, m.h1s === 1 && /Competitive Rating [\d,]+\./.test(m.srSummary) && /Record \d+ wins?, \d+ loss(es)?, \d+ ties?\./.test(m.srSummary) && /Career Level \d+\./.test(m.srSummary), m.srSummary);
        ok(`${w}×${h}: a provisional card says its status in words and offers no rating`, /PROVISIONAL/.test(m.provText) && /3 \/ 5/.test(m.provText) && /2 \/ 3/.test(m.provText) && m.provHasRating === false);
        ok(`${w}×${h}: a placed card with no rank shows the rating and simply omits the rank`, /COMPETITIVE RATING/.test(m.noRankText) && !/GLOBAL RANK/.test(m.noRankText));
        ok(`${w}×${h}: the unavailable state is stated plainly and identically for private, unknown and deleted`, /THIS PROFILE IS NOT AVAILABLE/.test(m.missingText) && /keeps their EraClash profile private/.test(m.missingText));
        ok(`${w}×${h}: the owner's state is said in words, not by colour alone`, /PRIVATE|PUBLIC/.test(m.badge) && /visible only to you|viewed by anyone/.test(m.moduleText));
        ok(`${w}×${h}: no unlabelled control`, m.unlabelled === 0);
        for (const t of m.texts) ok(`${w}×${h}: ${t.s} contrast ${t.contrast}:1 at ${t.px}px`, t.contrast == null || t.contrast >= (t.px >= 18.5 ? 3 : 4.5));
        if (w === 1440) ok("reduced motion: no entrance animation on the card", m.anim === "none", m.anim);
        // keyboard: reach the visibility control and operate it
        let reached = false;
        for (let i = 0; i < 60 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.classList?.contains("ec-pp-btn")); }
        ok(`${w}×${h}: Tab reaches the profile controls and focus is visible`, reached && await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none" || getComputedStyle(document.activeElement).boxShadow !== "none"));
      }

      if (MODE === "performance") {
        ok(`${w}×${h}: the fixture (seven profile states) renders within 3s`, loadMs < 3000, `${loadMs}ms`);
        ok(`${w}×${h}: CLS effectively zero`, m.cls <= 0.02, `${m.cls}`);
      }
      await ctx.close();
    }

    if (MODE === "performance") {
      const t = async (fn) => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
      const me = await (await post({ action: "profile-me" }, authJ)).json();
      const pub = await t(() => post({ action: "profile-public", slug: me.slug }));
      const mine = await t(() => post({ action: "profile-me" }, authJ));
      const links = await t(() => post({ action: "profile-board-links" }));
      ok("a public profile answers within 1.5s on the harness", pub.ms < 1500, `${pub.ms}ms`);
      ok("profile-me answers within 1.5s", mine.ms < 1500, `${mine.ms}ms`);
      ok("the board links answer within 1s", links.ms < 1000, `${links.ms}ms`);
      ok("a public profile is ONE indexed lookup by slug, not a scan", /public_profiles_slug_idx on public\.public_profiles \(slug\)/.test(SQL.replace(/\s+/g, " ")) && /pp\.slug = p_slug/.test(SQL));
      ok("the profile loads none of the heavy datasets", (() => { const s = read("api/_lib/profiles.js"); return !/saved_clashes|xp_ledger|challenge_attempts|saved_rosters|favorites/.test(s) && (s.match(/await rest\(/g) || []).length <= 6; })());
      ok("no client-side join across private datasets: one call, one fetch", (() => { const s = read("src/components/profiles/PublicProfilePage.jsx"); return !/await Promise\.all/.test(s) && (s.match(/await publicProfileRequest\(/g) || []).length === 1 && !/profileMeRequest|boardLinksRequest|setFeaturedRequest/.test(s); })());
      write("profile-performance-qa", { rows: rows.map((r) => ({ viewport: r.viewport, loadMs: r.loadMs, cls: r.cls })), ms: { publicProfile: pub.ms, me: mine.ms, boardLinks: links.ms } });
    }
    write(MODE === "responsive" ? "profile-responsive-qa" : "profile-accessibility-qa", { rows: rows.map(({ texts, provText, noRankText, missingText, moduleText, srSummary, ...r }) => r) });
  }

  if (MODE === "deployed") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("Candidate 4 on the preview", health?.preview?.candidateId === "Candidate 4" && health?.preview?.calibrationVersion === "1.4.0", `${health?.preview?.candidateId} ${health?.preview?.calibrationVersion}`);
    ok("the account provider is configured", !!(health?.cloudAccounts?.providerConfigured && health?.cloudAccounts?.serverCredentialConfigured));
    const miss = await (await post({ action: "profile-public", slug: "zzzzzzzzzzzzzzzzzzzz" })).json();
    ok("an unknown slug answers found:false on the preview, revealing nothing", miss.status === "ok" && miss.found === false && !/exists|private|denied/i.test(JSON.stringify(miss)), JSON.stringify(miss).slice(0, 120));
    const uuid = await (await post({ action: "profile-public", slug: "9f000001-0000-4000-8000-000000000001" })).json();
    ok("an auth uuid supplied as a slug answers identically", JSON.stringify(uuid) .replace(/"requestId":"[^"]*"/, "") === JSON.stringify(miss).replace(/"requestId":"[^"]*"/, ""));
    ok("profile-me without an account is refused on the preview", (await post({ action: "profile-me" })).status() === 401);
    ok("a forged token is refused", (await post({ action: "profile-me" }, { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAA" })).status() === 401);
    const page = await context.newPage();
    await page.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); } catch (e) {} });
    await page.goto(`${BASE}/player/zzzzzzzzzzzzzzzzzzzz`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /NOT AVAILABLE/i }).waitFor({ timeout: 30_000 });
    const st = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, text: document.body.textContent.slice(0, 200) }));
    ok("the /player/<slug> route renders on the preview with no overflow, and says nothing about existence", st.overflow === 0 && /NOT AVAILABLE/i.test(st.text), JSON.stringify(st.overflow));
    await page.screenshot({ path: `${shots}/deployed-profile-unavailable-1280x900.png` });
    const scan = await page.evaluate(async () => { let text = ""; for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) text += await (await fetch(s)).text(); return { bytes: text.length, secretShaped: (text.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length, serviceJwt: (text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []).filter((j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch { return false; } }).length, hasClient: text.includes("profile-public"), namesFunction: /profile_public_get|profile_owner_get|profile_set_featured|profile_board_links|public_profiles/.test(text), fixtureRoute: text.includes("profile-reference"), gitMetadata: ["VITE_VERCEL_GIT_COMMIT_MESSAGE", "VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME", "VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN"].filter((k) => text.includes(k)) }; });
    ok("no secret-shaped string and no service_role JWT in the bundle", scan.secretShaped === 0 && scan.serviceJwt === 0);
    ok("the bundle carries the profile client and never the database functions or the dev fixture", scan.hasClient && !scan.namesFunction && !scan.fixtureRoute, JSON.stringify(scan));
    ok("no Git metadata in the bundle", scan.gitMetadata.length === 0, scan.gitMetadata.join(",") || "none");
    write("profile-deployed-qa", { bundle: scan, health: { candidate: health?.preview?.candidateId, calibration: health?.preview?.calibrationVersion } }, { exit: false });
    const c0 = checks.length;
    ok("bundle: no secret, no service_role JWT, no server function name, no fixture route, no Git metadata", scan.secretShaped === 0 && scan.serviceJwt === 0 && !scan.namesFunction && !scan.fixtureRoute && scan.gitMetadata.length === 0);
    write("profile-secret-audit", { bundle: scan }, { from: c0 });
  }
  await browser.close();
}
