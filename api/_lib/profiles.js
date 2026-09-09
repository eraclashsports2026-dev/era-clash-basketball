// ── Public Competitive Profiles V1: the server side ──────────────────────────
// Phase 9F. The server owns what a public profile is allowed to say. It reads
// the database's fixed-select-list projection (profile_public_get) and never a
// base account row, so there is nothing for a browser to filter and no field
// can leak by being forgotten in a component.
//
// Identity for owner actions comes only from a verified bearer. A public
// profile lookup takes a SLUG and nothing else: no auth id, no email, no
// account id, and no listing — profile_public_get returns at most one row and
// there is no function anywhere that enumerates profiles.
//
// 9F CONSUMES Phase 9E rating state and Phase 9D level and unlock state. It
// computes no rating, awards no XP, unlocks nothing, and creates no second
// source of truth for either.
import { rest, cloudAccountsReady, serverKeyRejected } from "./cloudAccounts.js";
import {
  PUBLIC_PROFILE_VERSION, MAX_FEATURED_ACHIEVEMENTS, PROFILE_VISIBILITY, PROFILE_VISIBILITY_DEFAULT,
  isSlug, publicProfile, validateFeatured,
} from "../../src/profiles/contract.js";
import { ACHIEVEMENTS } from "../../src/progression/contract.js";

export const PROFILE_SERVER_VERSION = "1.0.0";
const rows = (r) => (Array.isArray(r?.body) ? r.body : []);
const one = (r) => rows(r)[0] || null;
const failure = (r, detail) => (serverKeyRejected(r.status) ? { status: "failed", detail: "provider_rejected_server_key" } : { status: "failed", detail: `${detail}_http_${r.status}` });
/** The catalog's ids, so an unknown achievement is named as unknown rather than merely locked. */
const KNOWN_ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/**
 * A public profile, by slug. The ONLY public read.
 *
 * A private profile, an unknown slug, a malformed slug and an auth uuid passed
 * as a slug are answered identically — `{ status: "ok", found: false }` — so a
 * caller cannot learn from the response whether an account exists. The shape
 * check happens here as well as in SQL so a malformed lookup never even
 * reaches the database.
 */
export const publicProfileBySlug = async ({ slug }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!isSlug(slug)) return { status: "ok", found: false };
  const r = await rest("rpc/profile_public_get", { method: "POST", body: JSON.stringify({ p_slug: slug }) }, fetchImpl);
  if (!r.ok) return failure(r, "profile_public");
  const row = one(r);
  if (!row) return { status: "ok", found: false };
  return { status: "ok", found: true, profile: publicProfile({ ...row, placed: row.state === "placed", featured: row.featured || [] }) };
};

/**
 * The account's own profile state: its slug, BOTH visibility settings, the
 * Phase 9E state it is already allowed to see (including a provisional rating,
 * which is private from the public but never from its owner), its featured
 * showcase and the unlocked achievements it may choose from.
 */
export const profileMe = async ({ userId }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!userId) return { status: "ok", found: false };
  const r = await rest("rpc/profile_owner_get", { method: "POST", body: JSON.stringify({ p_user_id: userId }) }, fetchImpl);
  if (!r.ok) return failure(r, "profile_me");
  const row = one(r);
  if (!row) return { status: "ok", found: false };
  const unlocked = row.unlocked || [];
  return {
    status: "ok", found: true, profileVersion: PUBLIC_PROFILE_VERSION,
    slug: row.slug,
    displayName: row.display_name,
    profileVisibility: PROFILE_VISIBILITY.includes(row.profile_visibility) ? row.profile_visibility : PROFILE_VISIBILITY_DEFAULT,
    leaderboardVisibility: row.leaderboard_visibility === "public" ? "public" : "private",
    state: row.state,
    // the owner's own view — Phase 9E already shows an owner their provisional rating
    rating: row.current_rating,
    rank: row.rank ?? null,
    record: { wins: row.rated_wins, losses: row.rated_losses, ties: row.rated_ties, matches: row.rated_matches },
    placement: { matches: row.rated_matches, matchesTarget: 5, opponents: row.unique_opponents, opponentsTarget: 3 },
    level: row.career_level ?? null,
    featured: row.featured || [],
    // only ids the account has actually unlocked, so the picker cannot offer a locked one
    unlockable: unlocked.filter((id) => KNOWN_ACHIEVEMENT_IDS.includes(id)),
    maxFeatured: MAX_FEATURED_ACHIEVEMENTS,
    // what the OWNER would look like publicly, so the preview cannot drift from the real card
    preview: publicProfile({
      slug: row.slug, display_name: row.display_name, placed: row.state === "placed",
      current_rating: row.current_rating, rank: row.rank, rated_wins: row.rated_wins, rated_losses: row.rated_losses,
      rated_ties: row.rated_ties, rated_matches: row.rated_matches, unique_opponents: row.unique_opponents,
      career_level: row.career_level, featured: row.featured || [],
      leaderboard_visibility: row.leaderboard_visibility,
    }),
  };
};

/**
 * Replace the featured showcase. The request supplies ids and order only:
 * ownership and unlock state are read from the account's own unlocks, first
 * here (so the reason returned is precise) and then again inside
 * profile_set_featured, which is the authority and refuses anything locked
 * whoever asks. A rejected list is never partially applied.
 */
export const setFeaturedAchievements = async ({ userId, ids }, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!userId) return { status: "ok", ok: false, reason: "user_required" };
  const me = await profileMe({ userId }, fetchImpl);
  if (me.status !== "ok") return me;
  if (!me.found) return { status: "ok", ok: false, reason: "user_required" };
  const check = validateFeatured(ids, { unlocked: me.unlockable, known: KNOWN_ACHIEVEMENT_IDS });
  if (!check.ok) return { status: "ok", ok: false, reason: check.reason, rejected: check.rejected };
  const r = await rest("rpc/profile_set_featured", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_ids: check.featured }) }, fetchImpl);
  if (!r.ok) return failure(r, "profile_featured");
  const out = r.body && typeof r.body === "object" ? r.body : {};
  if (!out.ok) return { status: "ok", ok: false, reason: out.reason || "refused", achievementId: out.achievementId ?? null };
  return { status: "ok", ok: true, featured: check.featured };
};

/**
 * The links for rows the public leaderboard already shows, as { rank: slug }.
 *
 * NOT a profile listing: it takes no identifier, it cannot return a profile the
 * public Top 100 does not already display, and an account appears only if it
 * opted in TWICE (leaderboard public AND profile public). A public profile whose
 * owner kept their leaderboard private is absent, and a leaderboard row whose
 * owner kept their profile private simply has no link.
 */
export const profileBoardLinks = async ({ limit = 100 } = {}, fetchImpl = fetch) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  const r = await rest("rpc/profile_board_links", { method: "POST", body: JSON.stringify({ p_limit: limit }) }, fetchImpl);
  if (!r.ok) return failure(r, "profile_board_links");
  const links = {};
  for (const row of rows(r)) if (row?.rank != null && isSlug(row.slug)) links[row.rank] = row.slug;
  return { status: "ok", links };
};

/** For the record, and for the gates. */
export const PROFILE_SERVER_CONTRACT = Object.freeze({
  boardLinks: "rpc/profile_board_links — ranks already on the public Top 100, for accounts that opted into BOTH settings. Takes no identifier and lists no profiles.",
  publicRead: "rpc/profile_public_get — one slug, at most one row, a fixed select list. No listing endpoint exists.",
  ownerRead: "rpc/profile_owner_get — the verified bearer's own account only",
  featuredWrite: "rpc/profile_set_featured — the verified bearer's own account; unlock state is the database's to judge",
  visibilityWrite: "user_preferences.profile_visibility, through the existing Phase 9B.2 preference path under owner-only RLS — never through a profile endpoint",
  indistinguishable: ["private profile", "unknown slug", "malformed slug", "auth uuid as slug", "deleted account"],
});
