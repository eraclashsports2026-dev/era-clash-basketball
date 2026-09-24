// ── A fake cloud for the local harness (Phase 9C, extended in 9D) ────────────
// Plays the provider surfaces the server talks to, in memory, so the challenge
// and progression flows can be driven end to end on the harness without a
// live Postgres: PostgREST (eq / in / is / neq filters, order, limit, insert
// with the unique indexes the migrations declare, patch, delete), the auth
// "who am I" endpoint (a bearer `test-token.<uuid>` is that user), and the ONE
// database function progression writes through, rpc/progression_apply, with
// the same semantics as supabase/migrations/0005_progression_v1.sql: insert
// what is missing, recompute the total from the ledger, derive the level from
// the shared curve. Installed only by scripts/harness.mjs when
// ECLASH_FAKE_CLOUD=1; nothing under src/ or api/ imports it.
import { levelForXp } from "../../src/progression/contract.js";
import { rateMatch, eligibility, isPlaced, compareRows, RATED_PAIR_WINDOW_DAYS, INITIAL_RATING } from "../../src/competitive/contract.js";

export const FAKE_URL = "https://abcdefghijklmnopqrst.supabase.co";

export const installFakeCloud = ({ users = [] } = {}) => {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32);
  process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32);
  process.env.CLOUD_ACCOUNTS_ENABLED = "true";
  // The harness needs stable slugs so a gate can navigate to one; the SHAPE is the
  // real contract's (20 symbols of the 32-symbol alphabet), the randomness is not.
  const fakeSlug = (i) => (String(i + 1).repeat(20) + "0".repeat(20)).slice(0, 20).replace(/[^0-9abcdefghjkmnpqrstvwxyz]/g, "0");
  const tables = {
    challenges: [], challenge_secrets: [], challenge_attempts: [], saved_clashes: [], result_claims: [],
    profiles: users.map((u) => ({ user_id: u.userId, display_name: u.displayName || "Coach" })),
    progression_profiles: [], xp_ledger: [], achievement_unlocks: [],
    user_preferences: [], competitive_profiles: [], competitive_rating_events: [],
    // Phase 9F: one opaque slug per account, minted with the profile, and the featured showcase
    public_profiles: users.map((u, i) => ({ user_id: u.userId, slug: fakeSlug(i) })), profile_featured_achievements: [],
  };
  const userExists = (id) => tables.profiles.some((p) => p.user_id === id);
  const parse = (path) => {
    const [table, qs = ""] = path.split("?"); const p = new URLSearchParams(qs); const filters = [];
    for (const [k, v] of p) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      if (k === "or") { const alts = v.slice(1, -1).split(",").map((t) => { const m = t.match(/^([a-z_]+)\.(eq|is|neq)\.(.*)$/); return m ? { k: m[1], op: m[2], v: m[3] } : null; }).filter(Boolean); filters.push({ or: alts }); continue; }
      const m = v.match(/^(eq|in|is|neq)\.(.*)$/); if (m) filters.push({ k, op: m[1], v: m[2] });
    }
    return { table, filters, onConflict: p.get("on_conflict"), order: p.get("order"), limit: p.get("limit") };
  };
  const one = (row, { k, op, v }) => op === "eq" ? String(row[k]) === v : op === "neq" ? String(row[k]) !== v : op === "is" ? (v === "null" ? row[k] == null : row[k] === (v === "true")) : v.slice(1, -1).split(",").includes(String(row[k]));
  const match = (row, f) => f.every((c) => (c.or ? c.or.some((alt) => one(row, alt)) : one(row, c)));
  const shape = (list, { order, limit }) => {
    let out = [...list];
    if (order) { const [col, dir = "asc"] = order.split("."); out.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1)); }
    if (limit) out = out.slice(0, Number(limit) || out.length);
    return out;
  };
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const nowIso = () => new Date().toISOString();

  // ── rpc/progression_apply, as the SQL function behaves ─────────────────────
  const ledgerTotal = (uid) => tables.xp_ledger.filter((r) => r.user_id === uid).reduce((s, r) => s + r.xp_delta, 0);
  const progressionApply = ({ p_user_id, p_awards = [], p_unlocks = [], p_version, p_curve_version }) => {
    if (!p_user_id || !userExists(p_user_id)) return { error: { code: "P0001", message: "PROGRESSION_USER_REQUIRED" } };
    if (!tables.progression_profiles.some((p) => p.user_id === p_user_id)) {
      const t = ledgerTotal(p_user_id);
      tables.progression_profiles.push({ user_id: p_user_id, total_xp: t, career_level: levelForXp(t).level, progression_version: p_version, level_curve_version: p_curve_version, created_at: nowIso(), updated_at: nowIso(), reconciled_at: null });
    }
    const inserted = [], unlocked = [];
    const insertLedger = (a) => {
      const dup = tables.xp_ledger.some((r) => r.user_id === p_user_id && r.source_type === a.source_type && r.source_id === a.source_id && r.reason === a.reason);
      if (dup) return false;
      if (!["clash", "era", "challenge_attempt", "achievement"].includes(a.source_type) || !["completion", "win", "first_completion", "victory", "creator_response", "unlock"].includes(a.reason) || !(a.xp_delta >= 1 && a.xp_delta <= 1000) || !/^[A-Za-z0-9_.:-]{1,64}$/.test(String(a.source_id))) throw new Error("check constraint");
      tables.xp_ledger.push({ id: uuid(), user_id: p_user_id, source_type: a.source_type, source_id: a.source_id, reason: a.reason, xp_delta: a.xp_delta, progression_version: p_version, created_at: nowIso() });
      return true;
    };
    for (const a of p_awards || []) if (insertLedger(a)) inserted.push({ sourceType: a.source_type, sourceId: a.source_id, reason: a.reason, xpDelta: a.xp_delta });
    for (const u of p_unlocks || []) {
      const fresh = insertLedger({ source_type: "achievement", source_id: u.achievement_id, reason: "unlock", xp_delta: u.xp_delta });
      if (!tables.achievement_unlocks.some((r) => r.user_id === p_user_id && r.achievement_id === u.achievement_id && r.achievement_version === u.achievement_version)) {
        tables.achievement_unlocks.push({ user_id: p_user_id, achievement_id: u.achievement_id, achievement_version: u.achievement_version, xp_awarded: fresh ? u.xp_delta : 0, unlocked_at: nowIso() });
      }
      if (fresh) { inserted.push({ sourceType: "achievement", sourceId: u.achievement_id, reason: "unlock", xpDelta: u.xp_delta }); unlocked.push({ achievementId: u.achievement_id, achievementVersion: u.achievement_version, xpAwarded: u.xp_delta }); }
    }
    const total = ledgerTotal(p_user_id), level = levelForXp(total).level;
    const prof = tables.progression_profiles.find((p) => p.user_id === p_user_id);
    Object.assign(prof, { total_xp: total, career_level: level, progression_version: p_version, level_curve_version: p_curve_version, updated_at: nowIso(), reconciled_at: nowIso() });
    return { totalXp: total, level, awarded: inserted, unlocked };
  };


  // ── the competitive functions, as the SQL behaves ─────────────────────────
  const compProfile = (uid) => { let p = tables.competitive_profiles.find((x) => x.user_id === uid); if (!p) { p = { user_id: uid, current_rating: INITIAL_RATING, rated_wins: 0, rated_losses: 0, rated_ties: 0, rated_matches: 0, unique_opponents: 0, rating_version: "1.0.0", last_rated_at: null, placed_at: null, created_at: nowIso(), updated_at: nowIso() }; tables.competitive_profiles.push(p); } return p; };
  const uniqueOpp = (uid) => new Set(tables.competitive_rating_events.filter((e) => e.creator_user_id === uid || e.recipient_user_id === uid).map((e) => (e.creator_user_id === uid ? e.recipient_user_id : e.creator_user_id))).size;
  const rateAttemptFn = ({ p_attempt_id, p_version, p_pair_limit, p_window_days }) => {
    const at = tables.challenge_attempts.find((x) => x.id === p_attempt_id); if (!at) return { rated: false, reason: "not_eligible" };
    const ch = tables.challenges.find((x) => x.id === at.challenge_id); if (!ch) return { rated: false, reason: "not_eligible" };
    if (tables.competitive_rating_events.some((e) => e.challenge_attempt_id === at.id && e.rating_version === p_version)) return { rated: false, reason: "already_rated" };
    const completedAt = at.completed_at || nowIso();
    const pair = tables.competitive_rating_events.filter((e) => ((e.creator_user_id === ch.creator_user_id && e.recipient_user_id === at.user_id) || (e.creator_user_id === at.user_id && e.recipient_user_id === ch.creator_user_id)) && Date.parse(e.completed_at) <= Date.parse(completedAt) && Date.parse(e.completed_at) > Date.parse(completedAt) - p_window_days * 86_400_000).length;
    const el = eligibility({ creatorUserId: ch.creator_user_id, recipientUserId: at.user_id, status: at.status, challengeOutcome: at.challenge_outcome, pairRatedInWindow: pair });
    if (!el.rated) return { rated: false, reason: el.reason };
    const pc = compProfile(ch.creator_user_id), pr = compProfile(at.user_id);
    const m = rateMatch({ creator: { rating: pc.current_rating, matches: pc.rated_matches }, recipient: { rating: pr.current_rating, matches: pr.rated_matches }, outcome: at.challenge_outcome });
    const ev = { id: uuid(), challenge_id: ch.id, challenge_attempt_id: at.id, creator_user_id: ch.creator_user_id, recipient_user_id: at.user_id, rating_version: p_version, creator_rating_before: m.creator.before, recipient_rating_before: m.recipient.before, creator_expected: m.creator.expected, recipient_expected: m.recipient.expected, outcome: at.challenge_outcome, creator_delta: m.creator.delta, recipient_delta: m.recipient.delta, creator_rating_after: m.creator.after, recipient_rating_after: m.recipient.after, completed_at: completedAt, created_at: nowIso() };
    tables.competitive_rating_events.push(ev);
    const apply = (p, side, won, lost, tied) => { p.current_rating = side.after; p.rated_matches++; p.rated_wins += won; p.rated_losses += lost; p.rated_ties += tied; p.unique_opponents = uniqueOpp(p.user_id); p.last_rated_at = completedAt; if (!p.placed_at && isPlaced(p)) p.placed_at = completedAt; p.updated_at = nowIso(); };
    apply(pc, m.creator, at.challenge_outcome === "creator" ? 1 : 0, at.challenge_outcome === "recipient" ? 1 : 0, at.challenge_outcome === "tie" ? 1 : 0);
    apply(pr, m.recipient, at.challenge_outcome === "recipient" ? 1 : 0, at.challenge_outcome === "creator" ? 1 : 0, at.challenge_outcome === "tie" ? 1 : 0);
    return { rated: true, eventId: ev.id, attemptId: at.id, challengeId: ch.id, outcome: at.challenge_outcome, completedAt, creator: { userId: ch.creator_user_id, ...m.creator }, recipient: { userId: at.user_id, ...m.recipient } };
  };
  const reconcileFn = ({ p_version, p_pair_limit, p_window_days, p_limit }) => {
    const pending = tables.challenge_attempts.filter((at) => at.status === "completed" && at.user_id && at.completed_at && tables.challenges.find((c) => c.id === at.challenge_id)?.creator_user_id && !tables.competitive_rating_events.some((e) => e.challenge_attempt_id === at.id && e.rating_version === p_version))
      .sort((a, b) => (Date.parse(a.completed_at) - Date.parse(b.completed_at)) || String(a.id).localeCompare(String(b.id))).slice(0, Math.max(1, p_limit || 500));
    let rated = 0, skipped = 0; for (const at of pending) { const r = rateAttemptFn({ p_attempt_id: at.id, p_version, p_pair_limit, p_window_days }); if (r.rated) rated++; else skipped++; }
    return { seen: pending.length, rated, skipped };
  };
  const streakFor = (uid) => { const evs = tables.competitive_rating_events.filter((e) => e.creator_user_id === uid || e.recipient_user_id === uid).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at)); if (!evs.length) return null; const side = (e) => (e.outcome === "tie" ? "T" : (e.outcome === "creator") === (e.creator_user_id === uid) ? "W" : "L"); const first = side(evs[0]); let n = 0; for (const e of evs) { if (side(e) === first) n++; else break; } return `${first}${n}`; };
  const rankedPublic = () => tables.competitive_profiles.filter((p) => isPlaced(p) && (tables.user_preferences.find((u) => u.user_id === p.user_id)?.prefs?.leaderboard_visibility === "public")).sort(compareRows).map((p, i) => ({ rank: i + 1, user_id: p.user_id, display_name: tables.profiles.find((x) => x.user_id === p.user_id)?.display_name || "Coach", current_rating: p.current_rating, rated_wins: p.rated_wins, rated_losses: p.rated_losses, rated_ties: p.rated_ties, rated_matches: p.rated_matches, career_level: tables.progression_profiles.find((x) => x.user_id === p.user_id)?.career_level ?? null, streak: streakFor(p.user_id) }));
  const leaderboardFn = ({ p_limit, p_offset }) => rankedPublic().slice(Math.max(0, p_offset || 0), Math.max(0, p_offset || 0) + Math.min(100, Math.max(1, p_limit || 100))).map(({ user_id, ...r }) => r);
  const rankOfFn = ({ p_user_id, p_span }) => { const all = rankedPublic(); const me = all.find((r) => r.user_id === p_user_id); if (!me) return []; return all.filter((r) => Math.abs(r.rank - me.rank) <= Math.max(0, p_span || 0)).map(({ user_id, ...r }) => ({ ...r, is_me: user_id === p_user_id })); };

  // ── Phase 9F profile functions, as the SQL behaves ─────────────────────────
  const prefsOf = (uid) => tables.user_preferences.find((u) => u.user_id === uid)?.prefs || {};
  const featuredOf = (uid) => tables.profile_featured_achievements.filter((f) => f.user_id === uid).sort((a, b) => a.slot - b.slot).map((f) => f.achievement_id);
  const unlockedOf = (uid) => tables.achievement_unlocks.filter((u) => u.user_id === uid).map((u) => u.achievement_id);
  const stateOf = (cp) => (cp && isPlaced(cp) ? "placed" : cp && cp.rated_matches > 0 ? "provisional" : "none");
  const profilePublicGetFn = ({ p_slug }) => {
    if (!/^[0-9abcdefghjkmnpqrstvwxyz]{20}$/.test(String(p_slug || ""))) return [];
    const pp = tables.public_profiles.find((x) => x.slug === p_slug);
    if (!pp) return [];
    if (prefsOf(pp.user_id).profile_visibility !== "public") return [];
    const cp = tables.competitive_profiles.find((x) => x.user_id === pp.user_id) || null;
    const placed = !!cp && isPlaced(cp);
    const lb = prefsOf(pp.user_id).leaderboard_visibility === "public";
    const rank = placed && lb ? (rankedPublic().find((r) => r.user_id === pp.user_id)?.rank ?? null) : null;
    return [{
      slug: pp.slug,
      display_name: tables.profiles.find((x) => x.user_id === pp.user_id)?.display_name || "Coach",
      state: stateOf(cp),
      current_rating: placed ? cp.current_rating : null,
      rank,
      rated_wins: placed ? cp.rated_wins : null, rated_losses: placed ? cp.rated_losses : null, rated_ties: placed ? cp.rated_ties : null,
      rated_matches: cp?.rated_matches ?? 0, unique_opponents: cp?.unique_opponents ?? 0,
      career_level: tables.progression_profiles.find((x) => x.user_id === pp.user_id)?.career_level ?? null,
      featured: featuredOf(pp.user_id),
    }];
  };
  const profileOwnerGetFn = ({ p_user_id }) => {
    const pp = tables.public_profiles.find((x) => x.user_id === p_user_id);
    if (!pp) return [];
    const cp = tables.competitive_profiles.find((x) => x.user_id === p_user_id) || null;
    const placed = !!cp && isPlaced(cp);
    const pf = prefsOf(p_user_id);
    const lb = pf.leaderboard_visibility === "public";
    return [{
      slug: pp.slug,
      display_name: tables.profiles.find((x) => x.user_id === p_user_id)?.display_name || "Coach",
      profile_visibility: pf.profile_visibility === "public" ? "public" : "private",
      leaderboard_visibility: lb ? "public" : "private",
      state: stateOf(cp),
      current_rating: cp?.current_rating ?? INITIAL_RATING,
      rank: placed && lb ? (rankedPublic().find((r) => r.user_id === p_user_id)?.rank ?? null) : null,
      rated_wins: cp?.rated_wins ?? 0, rated_losses: cp?.rated_losses ?? 0, rated_ties: cp?.rated_ties ?? 0,
      rated_matches: cp?.rated_matches ?? 0, unique_opponents: cp?.unique_opponents ?? 0,
      career_level: tables.progression_profiles.find((x) => x.user_id === p_user_id)?.career_level ?? null,
      featured: featuredOf(p_user_id), unlocked: unlockedOf(p_user_id),
    }];
  };
  const profileSetFeaturedFn = ({ p_user_id, p_ids }) => {
    if (!p_user_id) return { ok: false, reason: "user_required" };
    const ids = Array.isArray(p_ids) ? p_ids : [];
    if (ids.length > 3) return { ok: false, reason: "too_many" };
    if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate" };
    if (ids.some((x) => !/^[a-z0-9_]{1,40}$/.test(String(x)))) return { ok: false, reason: "malformed" };
    const mine = new Set(unlockedOf(p_user_id));
    const bad = ids.find((x) => !mine.has(x));
    if (bad) return { ok: false, reason: "not_unlocked", achievementId: bad };
    tables.profile_featured_achievements = tables.profile_featured_achievements.filter((f) => f.user_id !== p_user_id);
    ids.forEach((id, i) => tables.profile_featured_achievements.push({ user_id: p_user_id, achievement_id: id, slot: i + 1 }));
    return { ok: true, featured: ids };
  };
  const profileBoardLinksFn = ({ p_limit }) => rankedPublic()
    .filter((r) => prefsOf(r.user_id).profile_visibility === "public")
    .filter((r) => r.rank <= Math.min(100, Math.max(1, p_limit || 100)))
    .map((r) => ({ rank: r.rank, slug: tables.public_profiles.find((x) => x.user_id === r.user_id)?.slug }))
    .filter((x) => !!x.slug);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input instanceof Request ? input.url : input);
    if (!u.startsWith(FAKE_URL)) return realFetch(input, init);
    const reply = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.startsWith(`${FAKE_URL}/auth/v1/user`)) {
      const auth = String((init.headers || {}).authorization || (init.headers || {}).Authorization || "");
      const m = auth.match(/^Bearer test-token\.([0-9a-f-]{36})$/i);
      return m ? reply(200, { id: m[1] }) : reply(401, { message: "invalid token" });
    }
    if (!u.startsWith(`${FAKE_URL}/rest/v1/`)) return reply(404, {});
    const rel = u.slice(`${FAKE_URL}/rest/v1/`.length);
    if (rel.startsWith("rpc/progression_apply")) {
      try { const out = progressionApply(JSON.parse(init.body || "{}")); return out.error ? reply(400, out.error) : reply(200, out); }
      catch (e) { return reply(400, { code: "23514", message: String(e.message) }); }
    }
    if (rel.startsWith("rpc/competitive_rate_attempt")) return reply(200, rateAttemptFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/competitive_reconcile")) return reply(200, reconcileFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/competitive_leaderboard")) return reply(200, leaderboardFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/competitive_rank_of")) return reply(200, rankOfFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/profile_public_get")) return reply(200, profilePublicGetFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/profile_owner_get")) return reply(200, profileOwnerGetFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/profile_set_featured")) return reply(200, profileSetFeaturedFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/profile_board_links")) return reply(200, profileBoardLinksFn(JSON.parse(init.body || "{}")));
    if (rel.startsWith("rpc/")) return reply(404, { message: "no such function" });
    const { table, filters, onConflict, order, limit } = parse(rel);
    const rows = tables[table]; if (!rows) return reply(404, { message: `no table ${table}` });
    const method = init.method || "GET";
    if (method === "GET") return reply(200, shape(rows.filter((r) => match(r, filters)), { order, limit }));
    if (method === "POST") {
      // the progression tables are written by the function alone
      if (["progression_profiles", "xp_ledger", "achievement_unlocks", "competitive_profiles", "competitive_rating_events"].includes(table)) return reply(403, { code: "42501", message: "permission denied (write through the database functions)" });
      if (table === "user_preferences") { const body = JSON.parse(init.body); const hit = rows.find((r) => r.user_id === body.user_id); if (hit) { Object.assign(hit, body, { updated_at: nowIso() }); return reply(201, [hit]); } const row = { updated_at: nowIso(), ...body }; rows.push(row); return reply(201, [row]); }
      const row = { id: uuid(), created_at: nowIso(), ...JSON.parse(init.body) };
      const dup = (table === "challenges" && rows.some((r) => r.public_code === row.public_code || (r.creator_user_id === row.creator_user_id && r.creator_result_id === row.creator_result_id)))
        || (table === "challenge_attempts" && row.user_id && rows.some((r) => r.challenge_id === row.challenge_id && r.user_id === row.user_id))
        || (table === "result_claims" && rows.some((r) => r.result_id === row.result_id))
        || (table === "saved_clashes" && rows.some((r) => r.user_id === row.user_id && r.result_id === row.result_id));
      if (dup) { const prefer = String((init.headers || {}).prefer || ""); return prefer.includes("ignore-duplicates") || onConflict ? reply(201, []) : reply(409, { code: "23505" }); }
      rows.push(row); return reply(201, [row]);
    }
    if (method === "PATCH") { const patch = JSON.parse(init.body); const hit = rows.filter((r) => match(r, filters)); for (const r of hit) Object.assign(r, patch); return reply(200, hit); }
    if (method === "DELETE") { const hit = rows.filter((r) => match(r, filters)); for (const r of hit) rows.splice(rows.indexOf(r), 1); return reply(200, hit); }
    return reply(405, {});
  };
  /** Account deletion, as the cascades would do it (for in-process gates). */
  const deleteUser = (userId) => { for (const t of Object.keys(tables)) tables[t] = tables[t].filter((r) => r.user_id !== userId); for (const c of tables.challenges) if (c.creator_user_id === userId) c.creator_user_id = null; };
  return { tables, tokenFor: (userId) => `test-token.${userId}`, deleteUser, progressionApply, rateAttempt: rateAttemptFn, reconcileRatings: reconcileFn, leaderboard: leaderboardFn, rankOf: rankOfFn };
};
