// ── Career V2 cloud operations that are not a plain table read ───────────────
// Almost everything Career V2 does — rosters, favorites, preferences — the
// browser does directly against Postgres under RLS through the provider. Two
// things do not fit that shape and live here:
//
//   · the account export, which is an ASSEMBLY of several owned reads into one
//     file, built by the pure buildAccountExport()
//   · account deletion, which needs the service role and so is the one
//     career action that must go through the server (/api/profile)
import { withProvider, provider } from "./provider.js";
import { buildAccountExport, historyCsv, exportFilename } from "./careerV2.js";

/** Gather everything this account owns and shape it into the export document. */
export const assembleAccountExport = async () => {
  const [profile, prefs, clashes, rosters] = await Promise.all([
    withProvider((p) => p.getProfile(), null),
    withProvider((p) => p.getPreferences(), {}),
    withProvider((p) => p.listSavedClashes({ limit: 1000 }), []),
    withProvider((p) => p.listRosters(), []),
  ]);
  const doc = buildAccountExport({ profile, prefs, clashes, rosters });
  return { doc, csv: historyCsv(clashes), filename: exportFilename() };
};

/**
 * Delete the account and everything it owns. Server-only: the browser cannot
 * remove its own auth user under RLS. The token is sent so the server can
 * verify WHO is deleting, and it only ever deletes the token's own user.
 */
export const deleteAccountRequest = async ({ accessToken }) => {
  if (!provider()) return { status: "not_configured" };
  const r = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ action: "delete-account" }),
  });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { httpStatus: r.status, ...(json || {}) };
};
