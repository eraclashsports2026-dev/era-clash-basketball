// ── What this browser remembers having played ────────────────────────────────
// A small local ledger of authoritative result ids, written when a game
// finishes. It exists for ONE purpose: to propose candidates for the
// device-history import.
//
// It is not evidence of ownership and is never treated as such. The server
// authorises every id on its own by comparing the authoritative record's
// server-minted device session to the caller's HttpOnly cookie, so a ledger
// copied from another browser imports nothing.
const KEY = "ec_result_ids";
const MAX = 25;

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.id === "string") : [];
  } catch { return []; }
};
const write = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX))); } catch { /* private mode */ } };

export const SHAPE = /^(pv_)?[a-z0-9]{6,16}$/;

/** Remember one finished result. Newest first, capped, no duplicates. */
export const rememberResult = ({ resultId, mode = "single", ts = Date.now() } = {}) => {
  const id = String(resultId || "");
  if (!SHAPE.test(id)) return read();
  const rows = read().filter((r) => r.id !== id);
  rows.unshift({ id, mode: String(mode).slice(0, 20), ts: Number(ts) || Date.now() });
  write(rows);
  return rows;
};

export const deviceResultIds = () => read().map((r) => r.id);
export const deviceResultCount = () => read().length;

/** Results this browser remembers that are not already in the cloud career. */
export const unsavedDeviceResultIds = (savedResultIds = []) => {
  const saved = new Set(savedResultIds.map(String));
  return deviceResultIds().filter((id) => !saved.has(id));
};

/** Sign-out clears nothing here: the ledger belongs to the browser, not the account. */
export const _clearForTests = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

const DISMISS_KEY = "ec_import_offered";
export const importOfferDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
export const dismissImportOffer = () => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } };
