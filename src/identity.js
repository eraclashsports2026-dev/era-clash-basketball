// ── Anonymous identity + session ──────────────────────────────────────────────
// Guests get a stable anonymous uid so progress, challenges, feedback, and
// analytics can be associated without forcing registration. No PII here.
const safeRandomId = () => {
  try { return crypto.randomUUID(); } catch {
    return `ec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const getUid = () => {
  let uid = lsGet("ec_uid");
  if (!uid) { uid = safeRandomId(); lsSet("ec_uid", uid); }
  return uid;
};

// Session = one tab lifetime. Also reports whether this device has played before,
// so analytics can distinguish session_started vs returning_session.
let _session = null;
export const getSession = () => {
  if (_session) return _session;
  let sid = null;
  try { sid = sessionStorage.getItem("ec_sid"); } catch { /* ignore */ }
  const isNewSession = !sid;
  if (!sid) {
    sid = safeRandomId();
    try { sessionStorage.setItem("ec_sid", sid); } catch { /* ignore */ }
  }
  const returning = !!lsGet("ec_seen");
  lsSet("ec_seen", "1");
  _session = { sid, isNewSession, returning };
  return _session;
};

// Display name is the only user-entered identity field. Kept short, no email.
export const getDisplayName = () => lsGet("ec_name") || "";
export const setDisplayName = (name) => lsSet("ec_name", String(name).slice(0, 24));
