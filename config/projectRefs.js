// ── Public project identifiers (not secrets) ──────────────────────────────────
// The Supabase project refs are part of every browser bundle's provider URL, so
// naming them here reveals nothing. They exist so that a build or a server can
// REFUSE to point a Preview deployment at the production project: the two
// environments must never share users, careers or Challenges.
export const PRODUCTION_SUPABASE_REF = "dxdtnhdeaanhfoqngdel";
export const PREVIEW_SUPABASE_REF = "lfybiphmqkiecfrqsfzt";
export const supabaseRefOf = (url) => (String(url || "").trim().match(/^https:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\/?$/i) || [])[1] || null;

// ── Vercel Preview is pinned to the Preview project (2026-09-26) ───────────────
// The Preview-scoped Vercel variables named the PRODUCTION project for weeks
// (the containment guards kept that inert: accounts off, a 503 instead of
// production traffic). A Vercel Preview deployment now resolves its provider
// address and PUBLISHABLE key from these constants whatever the dashboard
// holds, so a Preview can only ever talk to the Preview project. Both values are
// public — they ship in every preview browser bundle. The SERVER secret still
// comes only from the environment and is never named here. Local harnesses
// (no VERCEL=1) and Production are unaffected.
export const PREVIEW_SUPABASE_URL = `https://${PREVIEW_SUPABASE_REF}.supabase.co`;
export const PREVIEW_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X--8fugunRzXrZ2p1Ewhsg_V9xp9WH8";
export const onVercelPreview = (env = process.env) => env.VERCEL === "1" && env.VERCEL_ENV === "preview";
