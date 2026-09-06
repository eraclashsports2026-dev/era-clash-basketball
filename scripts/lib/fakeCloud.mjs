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

export const FAKE_URL = "https://abcdefghijklmnopqrst.supabase.co";

export const installFakeCloud = ({ users = [] } = {}) => {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32);
  process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32);
  process.env.CLOUD_ACCOUNTS_ENABLED = "true";
  const tables = {
    challenges: [], challenge_secrets: [], challenge_attempts: [], saved_clashes: [], result_claims: [],
    profiles: users.map((u) => ({ user_id: u.userId, display_name: u.displayName || "Coach" })),
    progression_profiles: [], xp_ledger: [], achievement_unlocks: [],
  };
  const userExists = (id) => tables.profiles.some((p) => p.user_id === id);
  const parse = (path) => {
    const [table, qs = ""] = path.split("?"); const p = new URLSearchParams(qs); const filters = [];
    for (const [k, v] of p) { if (["select", "order", "limit", "on_conflict"].includes(k)) continue; const m = v.match(/^(eq|in|is|neq)\.(.*)$/); if (m) filters.push({ k, op: m[1], v: m[2] }); }
    return { table, filters, onConflict: p.get("on_conflict"), order: p.get("order"), limit: p.get("limit") };
  };
  const match = (row, f) => f.every(({ k, op, v }) => op === "eq" ? String(row[k]) === v : op === "neq" ? String(row[k]) !== v : op === "is" ? (v === "null" ? row[k] == null : row[k] === (v === "true")) : v.slice(1, -1).split(",").includes(String(row[k])));
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
    if (rel.startsWith("rpc/")) return reply(404, { message: "no such function" });
    const { table, filters, onConflict, order, limit } = parse(rel);
    const rows = tables[table]; if (!rows) return reply(404, { message: `no table ${table}` });
    const method = init.method || "GET";
    if (method === "GET") return reply(200, shape(rows.filter((r) => match(r, filters)), { order, limit }));
    if (method === "POST") {
      // the progression tables are written by the function alone
      if (["progression_profiles", "xp_ledger", "achievement_unlocks"].includes(table)) return reply(403, { code: "42501", message: "permission denied (write through rpc/progression_apply)" });
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
  return { tables, tokenFor: (userId) => `test-token.${userId}`, deleteUser, progressionApply };
};
