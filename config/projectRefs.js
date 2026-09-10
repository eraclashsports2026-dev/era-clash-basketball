// ── Public project identifiers (not secrets) ──────────────────────────────────
// The Supabase project refs are part of every browser bundle's provider URL, so
// naming them here reveals nothing. They exist so that a build or a server can
// REFUSE to point a Preview deployment at the production project: the two
// environments must never share users, careers or Challenges.
export const PRODUCTION_SUPABASE_REF = "dxdtnhdeaanhfoqngdel";
export const PREVIEW_SUPABASE_REF = "lfybiphmqkiecfrqsfzt";
export const supabaseRefOf = (url) => (String(url || "").trim().match(/^https:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\/?$/i) || [])[1] || null;
