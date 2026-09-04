// ── Saving a result to the cloud career ─────────────────────────────────────
// The client asks; the server decides. Every call carries the account's bearer
// token in the Authorization header and the result ID — and nothing else that
// could influence what gets stored. The score, roster, era, coaches, MVP and
// candidate identity are read server-side from the authoritative record.
//
// One route, no new serverless function: /api/profile owns career persistence.
import { currentBuild } from "../buildStamp.js";
import { PRODUCTION_THEME_NAME } from "../theme/themeTypes.js";
import { deviceResultIds } from "./deviceResults.js";

const post = async (body, accessToken) => {
  const r = await fetch("/api/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ...body, buildStamp: currentBuild() || undefined, themeVersion: PRODUCTION_THEME_NAME }),
  });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { httpStatus: r.status, ...(json || {}) };
};

/** Statuses the UI knows how to explain. Anything else is a generic failure. */
export const SAVE_STATUS = Object.freeze(["saved", "already_saved", "not_found", "not_your_result", "already_claimed", "not_configured", "save_failed"]);

/** Save a result the signed-in user just played. */
export const saveResultToCareer = ({ resultId, accessToken }) =>
  post({ action: "cloud-save", resultId }, accessToken);

/** Claim the result a guest played immediately before signing in. */
export const claimGuestResult = ({ resultId, accessToken }) =>
  post({ action: "claim-result", resultId }, accessToken);

/** How many remembered results are genuinely this device's. Writes nothing. */
export const previewDeviceImport = ({ accessToken, resultIds = deviceResultIds() }) =>
  post({ action: "import-preview", resultIds }, accessToken);

/** Import them. Idempotent per result, so a retry after a partial failure is safe. */
export const importDeviceHistory = ({ accessToken, resultIds = deviceResultIds() }) =>
  post({ action: "import-device-history", resultIds }, accessToken);

/** Server-side configuration state, booleans only. */
export const cloudAccountsServerStatus = async () => {
  try {
    const r = await fetch("/api/profile?cloud=status", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json())?.cloudAccounts ?? null;
  } catch { return null; }
};
