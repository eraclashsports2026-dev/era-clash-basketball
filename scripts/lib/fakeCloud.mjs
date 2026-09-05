// ── A fake cloud for the local harness (Phase 9C) ────────────────────────────
// Plays the two provider surfaces the server talks to, in memory, so the
// challenge flow can be driven end to end on the harness without a live
// Postgres: PostgREST (eq / in / is filters, insert with the unique indexes the
// migration declares, patch) and the auth "who am I" endpoint, where a bearer
// `test-token.<uuid>` is that user. Installed only by scripts/harness.mjs when
// ECLASH_FAKE_CLOUD=1; nothing under src/ or api/ imports it.
export const FAKE_URL = "https://abcdefghijklmnopqrst.supabase.co";

export const installFakeCloud = ({ users = [] } = {}) => {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32);
  process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32);
  process.env.CLOUD_ACCOUNTS_ENABLED = "true";
  const tables = { challenges: [], challenge_secrets: [], challenge_attempts: [], saved_clashes: [], result_claims: [], profiles: users.map((u) => ({ user_id: u.userId, display_name: u.displayName || "Coach" })) };
  const parse = (path) => {
    const [table, qs = ""] = path.split("?"); const p = new URLSearchParams(qs); const filters = [];
    for (const [k, v] of p) { if (["select", "order", "limit", "on_conflict"].includes(k)) continue; const m = v.match(/^(eq|in|is)\.(.*)$/); if (m) filters.push({ k, op: m[1], v: m[2] }); }
    return { table, filters, onConflict: p.get("on_conflict") };
  };
  const match = (row, f) => f.every(({ k, op, v }) => op === "eq" ? String(row[k]) === v : op === "is" ? (v === "null" ? row[k] == null : row[k] === (v === "true")) : v.slice(1, -1).split(",").includes(String(row[k])));
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
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
    const { table, filters, onConflict } = parse(u.slice(`${FAKE_URL}/rest/v1/`.length));
    const rows = tables[table]; if (!rows) return reply(404, { message: `no table ${table}` });
    const method = init.method || "GET";
    if (method === "GET") return reply(200, rows.filter((r) => match(r, filters)));
    if (method === "POST") {
      const row = { id: uuid(), created_at: new Date().toISOString(), ...JSON.parse(init.body) };
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
  return { tables, tokenFor: (userId) => `test-token.${userId}` };
};
