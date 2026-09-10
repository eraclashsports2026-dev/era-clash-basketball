// ── Operator diagnostics for QA scripts ──────────────────────────────────────
// /api/health?deep=1 and /api/profile?cloud=status answer configuration and
// credential-probe details only to an OWNER preview-access key presented in the
// X-Preview-Key header (2026-09-10). The raw key lives in the gitignored
// .preview-secrets/wave2-access-keys.json; scripts read it from disk and send it
// as a header — never in a URL, never printed. Without the file, scripts fall
// back to the public payload and the callers treat diagnostics as unavailable.
import { existsSync, readFileSync } from "node:fs";
const KEY_FILE = ".preview-secrets/wave2-access-keys.json";
export const operatorKey = () => {
  try { return existsSync(KEY_FILE) ? (JSON.parse(readFileSync(KEY_FILE, "utf8")).keys.find((k) => k.role === "owner")?.key || null) : null; } catch { return null; }
};
export const operatorHeaders = () => { const k = operatorKey(); return k ? { "x-preview-key": k } : {}; };
/** The deep health payload as an operator, or null when no operator key is on disk / the request is refused. */
export const operatorHealth = async (request, base) => {
  const headers = operatorHeaders(); if (!headers["x-preview-key"]) return null;
  const r = await request.get(`${base}/api/health?deep=1`, { headers, failOnStatusCode: false });
  if (r.status() !== 200) return null;
  return r.json();
};
/** Flattened diagnostics — the field names scripts always used (providerConfigured, serverCredentialAccepted, serverCredentialIntegrity, …). */
export const operatorDiagnostics = async (request, base) => {
  const h = await operatorHealth(request, base);
  return h ? { ...(h.cloudAccounts || {}), ...(h.diagnostics || {}) } : null;
};
