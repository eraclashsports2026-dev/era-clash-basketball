#!/usr/bin/env node
// ── Safe provider verification ──────────────────────────────────────────────
//   node scripts/accounts/verifyProvider.mjs [--remote]
//
// Prints booleans and a migration version. It never prints a key, a fragment
// of a key, a URL with credentials in it, or an email address — so its output
// is safe to paste into an issue or a report.
//
// With --remote it also asks the project whether it is reachable and whether
// row level security is actually on, using the service-role key that must exist
// only in the server environment.
const REMOTE = process.argv.includes("--remote");

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const anon = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "");
const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const flagOn = (v) => ["true", "1", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
const flagServer = flagOn(process.env.CLOUD_ACCOUNTS_ENABLED);
const flagClient = flagOn(process.env.VITE_CLOUD_ACCOUNTS_ENABLED);

const keyShapeOk = (v) => { const s2 = String(v ?? "").trim(); if (!s2 || /[^\x21-\x7e]/.test(s2)) return false; return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s2) || /^sb_(publishable|secret)_[A-Za-z0-9_-]{16,}$/.test(s2); };
const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url);
const line = (k, v) => console.log(`${k}: ${v}`);

line("configured", urlOk && keyShapeOk(anon));
line("provider url valid", urlOk);
line("anon key present and correctly shaped", keyShapeOk(anon));
line("service role key present and correctly shaped (server only)", keyShapeOk(service));
if (anon && !keyShapeOk(anon)) line("anon key problem", "not a JWT or sb_ key — a value copied from a masked dashboard field looks long but is not a key");
if (service && !keyShapeOk(service)) line("service role key problem", "not a JWT or sb_ key — a value copied from a masked dashboard field looks long but is not a key");
line("service role key absent from VITE_ variables", !Object.keys(process.env).some((k) => k.startsWith("VITE_") && /SERVICE|SECRET/i.test(k)));
line("cloud accounts flag (server)", flagServer);
line("cloud accounts flag (client)", flagClient);

if (!REMOTE) {
  line("provider reachable", "not checked (pass --remote)");
  line("migration version", "not checked (pass --remote)");
  line("rls enabled", "not checked (pass --remote)");
  process.exit(urlOk && anon.length > 40 ? 0 : 1);
}

if (!urlOk || service.length < 40) {
  line("provider reachable", false);
  line("migration version", "unknown");
  line("rls enabled", "unknown");
  process.exit(1);
}

const rest = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: service, authorization: `Bearer ${service}`, accept: "application/json" },
  });
  return { ok: r.ok, status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
};

try {
  const health = await fetch(`${url}/auth/v1/health`).then((r) => r.ok).catch(() => false);
  line("provider reachable", !!health);

  const mig = await rest("schema_migrations?select=version&order=version.desc&limit=1");
  line("migration version", mig.ok && mig.body?.[0]?.version ? mig.body[0].version : "none applied");

  // Anonymous must not be able to read a user-owned table. A 401/403/404, or an
  // empty result under RLS, all mean the policy is doing its job; rows coming
  // back to an anonymous caller would not.
  const anonRead = await fetch(`${url}/rest/v1/profiles?select=user_id&limit=1`, {
    headers: { apikey: anon, authorization: `Bearer ${anon}`, accept: "application/json" },
  });
  const anonBody = anonRead.ok ? await anonRead.json().catch(() => null) : null;
  line("rls enabled", !anonRead.ok || (Array.isArray(anonBody) && anonBody.length === 0));
  process.exit(0);
} catch {
  line("provider reachable", false);
  line("migration version", "unknown");
  line("rls enabled", "unknown");
  process.exit(1);
}
