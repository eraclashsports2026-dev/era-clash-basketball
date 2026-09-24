// ── Phase 9F — Public Competitive Profiles + Player Cards V1 ─────────────────
// The contract, and the SQL pinned against it. Privacy is asserted as an
// invariant (what a projection MUST NOT carry), not as a snapshot of today's
// field list, so a later phase adding a field cannot quietly widen it.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as F from "../src/profiles/contract.js";
import { PREF_KEYS, PREF_SCHEMA, PREF_DEFAULTS } from "../src/accounts/careerV2.js";
import { ACHIEVEMENTS, ACHIEVEMENT_CATALOG_VERSION } from "../src/progression/contract.js";

const SQL = readFileSync("supabase/migrations/0007_public_competitive_profiles_v1.sql", "utf8");
const CONTRACT = readFileSync("src/profiles/contract.js", "utf8");
const SERVER = readFileSync("api/_lib/profiles.js", "utf8");

describe("the contract", () => {
  it("is version 1.0.0 and creates no basketball power", () => {
    expect(F.PUBLIC_PROFILE_VERSION).toBe("1.0.0");
    expect(F.PUBLIC_PROFILE_POWER_EFFECT).toBe(0);
    expect(F.PUBLIC_PROFILE_POLICY.computes).toMatch(/nothing competitive/);
  });

  it("is private by default, with only two allowed values", () => {
    expect(F.PROFILE_VISIBILITY).toEqual(["private", "public"]);
    expect(F.PROFILE_VISIBILITY_DEFAULT).toBe("private");
    expect(F.profileVisibilityFrom({})).toBe("private");
    expect(F.profileVisibilityFrom(null)).toBe("private");
    expect(F.profileVisibilityFrom({ profile_visibility: "public" })).toBe("public");
    // anything unrecognised reads as private — never as public
    for (const bad of ["PUBLIC", "friends", "", true, 1, [], {}]) {
      expect(F.profileVisibilityFrom({ profile_visibility: bad })).toBe("private");
    }
  });

  it("keeps profile_visibility and leaderboard_visibility independent, in all four combinations", () => {
    expect(F.PROFILE_VISIBILITY_PREF_KEY).toBe("profile_visibility");
    expect(F.LEADERBOARD_VISIBILITY_PREF_KEY).toBe("leaderboard_visibility");
    expect(F.VISIBILITY_INDEPENDENCE.combined).toBe(false);
    expect(F.VISIBILITY_INDEPENDENCE.combinations).toHaveLength(4);
    // a profile is reachable exactly when profile_visibility is public, whatever the leaderboard says
    for (const c of F.VISIBILITY_INDEPENDENCE.combinations) {
      expect(c.profileReachable).toBe(c.profile === "public");
      expect(c.onLeaderboard).toBe(c.leaderboard === "public");
      // a row links only when BOTH are public
      expect(c.rowLinksToProfile).toBe(c.profile === "public" && c.leaderboard === "public");
    }
  });

  it("joins the closed preference vocabulary without weakening it", () => {
    expect(PREF_KEYS).toContain("profile_visibility");
    expect(PREF_SCHEMA.profile_visibility.values).toEqual(["private", "public"]);
    expect(PREF_DEFAULTS.profile_visibility).toBe("private");
    // every previously approved key survives
    for (const k of ["reduced_motion", "default_result_tab", "career_density", "lobby_landing", "leaderboard_visibility"]) {
      expect(PREF_KEYS).toContain(k);
    }
    expect(PREF_KEYS).toHaveLength(6);
  });
});

describe("the safe public identifier", () => {
  it("is opaque, high-entropy and not an id anyone could guess or derive", () => {
    expect(F.SLUG_LENGTH).toBe(20);
    expect(F.SLUG_ALPHABET).toHaveLength(32);
    expect(F.SLUG_ENTROPY_BITS).toBe(100);
    // the alphabet is unambiguous: no i, l, o or u
    for (const c of "ilou") expect(F.SLUG_ALPHABET).not.toContain(c);
    expect(F.SLUG_RULES).toMatchObject({ derivedFromEmail: false, isAuthId: false, isDatabaseId: false, sequentiallyEnumerable: false, serverGenerated: true, stableAcrossDisplayNameChanges: true, invalidatedOnAccountDeletion: true });
  });

  it("accepts only a real slug — never a uuid, and never a near miss", () => {
    expect(F.isSlug("a".repeat(20))).toBe(true);
    expect(F.isSlug("e6dj0mdh6qfaks3n3mw1")).toBe(true);
    for (const bad of ["a".repeat(19), "a".repeat(21), "A".repeat(20), "a".repeat(19) + "!", "", null, undefined, 42,
      "iiiiiiiiiiiiiiiiiiii", "llllllllllllllllllll", "oooooooooooooooooooo", "uuuuuuuuuuuuuuuuuuuu",
      "9f000001-0000-4000-8000-000000000001"]) {
      expect(F.isSlug(bad)).toBe(false);
    }
    expect(F.looksLikeUuid("9f000001-0000-4000-8000-000000000001")).toBe(true);
    expect(F.looksLikeUuid("a".repeat(20))).toBe(false);
  });

  it("builds and reads the route without ever accepting a non-slug", () => {
    const s = "e6dj0mdh6qfaks3n3mw1";
    expect(F.profilePath(s)).toBe(`/player/${s}`);
    expect(F.profileUrl("https://x.test", s)).toBe(`https://x.test/player/${s}`);
    expect(F.profileUrl("https://x.test/", s)).toBe(`https://x.test/player/${s}`);
    expect(F.slugFromPath(`/player/${s}`)).toBe(s);
    expect(F.slugFromPath(`/player/${s}?x=1`)).toBe(s);
    expect(F.profilePath("nope")).toBeNull();
    expect(F.slugFromPath("/player/9f000001-0000-4000-8000-000000000001")).toBeNull();
    expect(F.slugFromPath("/player/")).toBeNull();
    expect(F.slugFromPath("/leaderboard")).toBeNull();
  });
});

describe("the public projection", () => {
  const placedRow = {
    slug: "a".repeat(20), display_name: "Joseph", placed: true, current_rating: 1146, rank: 38,
    rated_wins: 18, rated_losses: 11, rated_ties: 1, rated_matches: 30, unique_opponents: 7,
    career_level: 24, featured: ["first_clash", "first_win"], leaderboard_visibility: "public",
  };

  it("carries the rating, record and rank for a placed public account", () => {
    const p = F.publicProfile(placedRow);
    expect(p).toMatchObject({ rating: 1146, rank: 38, wins: 18, losses: 11, ties: 1, matches: 30, winPct: 60, level: 24, state: "placed" });
    expect(p.initials).toBe("J");
  });

  it("withholds the rating, rank and W-L-T from a PROVISIONAL account — the Phase 9E invariant", () => {
    const p = F.publicProfile({ ...placedRow, placed: false, rated_matches: 3, unique_opponents: 2 });
    expect(p.state).toBe("provisional");
    expect(p.rating).toBeUndefined();
    expect(p.rank).toBeUndefined();
    expect(p.wins).toBeUndefined();
    expect(p.losses).toBeUndefined();
    expect(p.ties).toBeUndefined();
    expect(p.winPct).toBeUndefined();
    // but the placement progress IS public — that is the whole provisional card
    expect(p.placement).toEqual({ matches: 3, matchesTarget: 5, opponents: 2, opponentsTarget: 3 });
    expect(F.showsPublicRating({ state: "provisional" })).toBe(false);
    expect(F.showsPublicRating({ state: "none" })).toBe(false);
  });

  it("shows a rank ONLY when the account is placed and on the leaderboard — never an estimate", () => {
    // publicProfile carries the rank the AUTHORITY granted and never re-derives it:
    // leaderboard_visibility is private and must not travel in a public payload.
    expect(F.publicProfile({ ...placedRow, rank: null }).rank).toBeNull();
    expect(F.publicProfile(placedRow).rank).toBe(38);
    // a provisional row is never given one at all
    expect(F.publicProfile({ ...placedRow, placed: false, rated_matches: 2 }).rank).toBeUndefined();
    // and the rule itself is the documented predicate the SQL mirrors
    expect(F.showsPublicRank({ state: "placed", leaderboardVisibility: "public" })).toBe(true);
    expect(F.showsPublicRank({ state: "placed", leaderboardVisibility: "private" })).toBe(false);
    expect(F.showsPublicRank({ state: "provisional", leaderboardVisibility: "public" })).toBe(false);
    // nothing in the contract computes a hypothetical rank
    expect(CONTRACT).not.toMatch(/wouldBe|approximateRank|estimatedRank|hypotheticalRank/i);
  });

  it("never carries a forbidden field, in any state", () => {
    for (const row of [placedRow, { ...placedRow, placed: false, rated_matches: 2 }, { ...placedRow, placed: false, rated_matches: 0 }]) {
      const p = F.publicProfile(row);
      const json = JSON.stringify(p);
      for (const f of F.FORBIDDEN_PROFILE_FIELDS) expect(Object.keys(p)).not.toContain(f);
      expect(json).not.toMatch(/@|user_id|auth|password|token|seed/i);
      // every key present is one the contract allows
      for (const k of Object.keys(p)) expect(F.PUBLIC_PROFILE_FIELDS).toContain(k);
    }
  });

  it("caps the featured list at three however many arrive", () => {
    const p = F.publicProfile({ ...placedRow, featured: ["a", "b", "c", "d", "e"] });
    expect(p.featured).toHaveLength(3);
  });
});

describe("featured achievements", () => {
  const known = ACHIEVEMENTS.map((a) => a.id);
  const unlocked = ["first_clash", "first_win", "first_chaos", "ten_wins"];

  it("accepts up to three unlocked achievements, in the caller's order", () => {
    const r = F.validateFeatured(["ten_wins", "first_clash"], { unlocked, known });
    expect(r.ok).toBe(true);
    expect(r.featured).toEqual(["ten_wins", "first_clash"]);
  });

  it("refuses a locked achievement, an unknown one, a duplicate, a fourth and a malformed list", () => {
    expect(F.validateFeatured(["century_club"], { unlocked, known })).toMatchObject({ ok: false, reason: "not_unlocked" });
    expect(F.validateFeatured(["no_such_thing"], { unlocked, known })).toMatchObject({ ok: false, reason: "unknown_achievement" });
    expect(F.validateFeatured(["first_win", "first_win"], { unlocked, known })).toMatchObject({ ok: false, reason: "duplicate" });
    expect(F.validateFeatured(["first_clash", "first_win", "first_chaos", "ten_wins"], { unlocked, known })).toMatchObject({ ok: false, reason: "too_many" });
    for (const bad of [null, "first_win", [1], [null], [""], [{}]]) {
      expect(F.validateFeatured(bad, { unlocked, known }).ok).toBe(false);
    }
  });

  it("treats an empty list as valid — clearing the showcase is allowed and idempotent", () => {
    expect(F.validateFeatured([], { unlocked, known })).toMatchObject({ ok: true, featured: [] });
  });

  it("cannot be widened by the caller: unlocked and known both come from outside", () => {
    // with no unlocks supplied, nothing can be featured
    expect(F.validateFeatured(["first_clash"], { unlocked: [], known }).ok).toBe(false);
    expect(F.MAX_FEATURED_ACHIEVEMENTS).toBe(3);
  });

  it("does not alter the Phase 9D achievement catalog", () => {
    expect(ACHIEVEMENT_CATALOG_VERSION).toBe("1.0.0");
    expect(ACHIEVEMENTS).toHaveLength(23);
    // 9F must not have invented an achievement for itself
    // 9F must not define a catalog of its own — it only references 9D's
    expect(CONTRACT).not.toMatch(/export const ACHIEVEMENTS/);
    // it may READ achievement_unlocks and it may map featured ones; it must not
    // write an unlock, and it must not stand up a catalog table of its own
    expect(SQL).not.toMatch(/insert into public\.achievement_unlocks/);
    expect(SQL).not.toMatch(/update public\.achievement_unlocks/);
    expect(SQL).not.toMatch(/delete from public\.achievement_unlocks/);
    expect(SQL).not.toMatch(/create table (if not exists )?public\.achievements\b/);
    expect(SQL).toMatch(/from public\.achievement_unlocks/);
  });
});

describe("the SQL mirrors the contract", () => {
  it("extends prefs_ok with profile_visibility and keeps every other key", () => {
    expect(SQL).toMatch(/'profile_visibility'\s*\)\s*or p ->> 'profile_visibility'\s*in \('private', 'public'\)/);
    for (const k of PREF_KEYS) expect(SQL).toContain(k);
    // the vocabulary is still closed
    expect(SQL).toMatch(/where k not in \(/);
  });

  it("generates the slug the contract describes", () => {
    expect(SQL).toContain(F.SLUG_ALPHABET);
    expect(SQL).toMatch(/generate_series\(0, 19\)/);
    expect(SQL).toMatch(/% 32/);
    expect(SQL).toMatch(/gen_random_bytes\(20\)/);
    expect(SQL).toMatch(/\^\[0-9abcdefghjkmnpqrstvwxyz\]\{20\}\$/);
  });

  it("serves a public profile only when profile_visibility is public, and only by slug", () => {
    const fn = SQL.slice(SQL.indexOf("function public.profile_public_get"));
    expect(fn).toMatch(/up\.prefs ->> 'profile_visibility' = 'public'/);
    expect(fn).toMatch(/pp\.slug = p_slug/);
    // rating and W-L-T are gated on placement; the two placement counts are not
    expect(fn).toMatch(/case when c\.placed then c\.current_rating end/);
    expect(fn).toMatch(/case when c\.placed and c\.lb = 'public' then/);
    expect(fn).toMatch(/coalesce\(c\.rated_matches, 0\)/);
    expect(fn).toMatch(/coalesce\(c\.unique_opponents, 0\)/);
    // placement is Phase 9E's rule, not a new one
    expect(fn).toMatch(/rated_matches >= 5 and cp\.unique_opponents >= 3/);
  });

  it("caps featured at three, refuses a locked one, and is the only writer", () => {
    const fn = SQL.slice(SQL.indexOf("function public.profile_set_featured"));
    expect(fn).toMatch(/if n > 3 then/);
    expect(fn).toMatch(/'duplicate'/);
    expect(fn).toMatch(/'not_unlocked'/);
    expect(fn).toMatch(/from public\.achievement_unlocks u where u\.user_id = p_user_id/);
    expect(SQL).toMatch(/constraint profile_featured_slot_range check \(slot between 1 and 3\)/);
    expect(SQL).toMatch(/constraint profile_featured_pk\s+primary key \(user_id, achievement_id\)/);
  });

  it("revokes every function from anon and authenticated, and grants no write", () => {
    for (const f of ["profile_public_get(text)", "profile_owner_get(uuid)", "profile_set_featured(uuid, text[])", "profile_board_links(integer)"]) {
      expect(SQL).toContain(`revoke execute on function public.${f} from public, anon, authenticated`);
    }
    expect(SQL).toMatch(/revoke all on public\.public_profiles\s+from anon, authenticated/);
    expect(SQL).toMatch(/revoke all on public\.profile_featured_achievements from anon, authenticated/);
    // read-your-own-row only; no insert, update or delete policy anywhere
    expect(SQL).toMatch(/for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(SQL).not.toMatch(/for (insert|update|delete) to authenticated/);
  });

  it("keeps the slug immutable and records its version", () => {
    expect(SQL).toMatch(/PUBLIC_PROFILE_SLUG_IMMUTABLE/);
    expect(SQL).toMatch(/\('0007_public_competitive_profiles_v1'\)/);
  });

  it("has no listing function — a profile is reachable only by its slug", () => {
    // every profile function either takes a slug, takes a user id, or is a guard
    const signatures = [...SQL.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)].map((m) => [m[1], m[2]]);
    for (const [name, args] of signatures) {
      if (!/profile/i.test(name)) continue;
      const ok = /p_slug text/.test(args) || /p_user_id uuid/.test(args) || args.trim() === "" || /p_limit integer/.test(args);
      expect(ok, `${name}(${args})`).toBe(true);
    }
    // and the one that takes only a limit is bounded by Phase 9E's own ranking
    const links = SQL.slice(SQL.indexOf("function public.profile_board_links"));
    expect(links).toMatch(/competitive_rank_of/);
    expect(links).toMatch(/'profile_visibility' = 'public'/);
    expect(links).toMatch(/'leaderboard_visibility' = 'public'/);
    expect(links).toMatch(/least\(greatest\(1, p_limit\), 100\)/);
  });
});

describe("the server", () => {
  it("answers a private, unknown, malformed or uuid-shaped slug identically", () => {
    expect(SERVER).toMatch(/if \(!isSlug\(slug\)\) return \{ status: "ok", found: false \}/);
    expect(SERVER).toMatch(/if \(!row\) return \{ status: "ok", found: false \}/);
    expect(SERVER.match(/found: false/g).length).toBeGreaterThanOrEqual(3);
  });

  it("never trusts the body for identity, and reads unlock state itself", () => {
    expect(SERVER).not.toMatch(/req\.body/);
    expect(SERVER).toMatch(/unlocked: me\.unlockable/);
  });

  it("takes no serverless function of its own", () => {
    expect(readdirSync("api").filter((f) => f.endsWith(".js"))).toHaveLength(12);
  });
});

describe("telemetry", () => {
  it("is a closed vocabulary, mirrored in both allowlists", () => {
    const api = readFileSync("api/events.js", "utf8");
    const activation = readFileSync("src/activation.js", "utf8");
    const events = Object.values(F.PROFILE_EVENTS);
    expect(events).toHaveLength(6);
    for (const e of events) {
      expect(api).toContain(`"${e}"`);
      expect(activation).toContain(`"${e}"`);
    }
  });

  it("allows no identifying metadata", () => {
    for (const f of F.PROFILE_EVENT_METADATA_FORBIDDEN) {
      expect(F.PROFILE_EVENT_METADATA_ALLOWED).not.toContain(f);
    }
    // the components must not hand an identifier to track()
    for (const file of ["src/components/profiles/PublicProfilePage.jsx", "src/components/profiles/PublicProfileModule.jsx", "src/components/profiles/FeaturedPicker.jsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/track\([^)]*\b(slug|displayName|email|userId|accountId|token)\s*:/);
    }
  });
});

describe("nothing here creates basketball power", () => {
  it("no game, draft, era, coach, challenge, rating or progression path reads the profile system", () => {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    const paths = [...walk("src/chaos"), ...walk("src/v3"), "src/engine.js", "src/draft.js", "src/lineupPlacement.js",
      "src/entitlements.js", "src/players.js", "src/rating.js", "api/game.js", "api/_lib/game-core.js",
      "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js",
      "src/components/arena/guidedState.js", "src/challenges/contract.js", "api/_lib/challenges.js",
      "src/progression/contract.js", "api/_lib/progression.js", "src/competitive/contract.js", "api/_lib/competitive.js"];
    for (const p of paths) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/profiles\/contract|profile_visibility|public_profiles|profile_public_get|PUBLIC_PROFILE/);
    }
  });

  it("declares the zero and lists what it will not become", () => {
    expect(F.PUBLIC_PROFILE_POLICY.powerEffect).toBe(0);
    for (const nope of ["friends", "following", "followers", "direct messages", "chat", "comments", "likes",
      "feeds", "profile search", "player directory", "global user search", "presence indicators",
      "seasons", "tournaments", "trading", "rating boosts", "XP boosts", "XP leaderboard"]) {
      expect(F.PUBLIC_PROFILE_POLICY.notBuilt).toContain(nope);
    }
  });
});
