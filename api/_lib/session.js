// ── Secure guest sessions + origin protection ─────────────────────────────────
// Identity authority is an HttpOnly cookie the server mints — never the
// client-supplied uid (that remains a display/analytics label only). The
// browser cannot choose another guest's identity because it cannot read or
// forge the cookie value across origins, and mutations are origin-checked.
//
// Limitations (documented, honest): guest identity is per-browser; clearing
// cookies loses it; no cross-device recovery until a real auth provider is
// added (see docs/RELEASE-v2.3.md — auth readiness).
const COOKIE = "ec_session";
const MAX_AGE = 60 * 60 * 24 * 365;

const randomToken = () => {
  const buf = new Uint8Array(24);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const parseCookies = (header) => {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
};

// Returns the session id, minting + setting the cookie when absent.
export const getOrCreateSession = (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies[COOKIE];
  if (!sid || !/^[a-f0-9]{48}$/.test(sid)) {
    sid = randomToken();
    const secure = process.env.NODE_ENV === "development" ? "" : " Secure;";
    res.setHeader("Set-Cookie",
      `${COOKIE}=${sid}; Path=/; Max-Age=${MAX_AGE}; HttpOnly;${secure} SameSite=Lax`);
  }
  return sid;
};

// Read-only variant: returns the session id or null without minting.
export const getSession = (req) => {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  return sid && /^[a-f0-9]{48}$/.test(sid) ? sid : null;
};

// CSRF/origin guard for mutating endpoints. Cookies are SameSite=Lax, and we
// additionally require the Origin (or Referer) host to match the request host
// when present. Requests with neither header (curl, server-to-server) carry no
// ambient cookie credentials from a victim browser, so they pass — the cookie
// is the credential being protected here.
export const sameOrigin = (req) => {
  const host = String(req.headers.host || "").toLowerCase();
  const src = req.headers.origin || req.headers.referer;
  if (!src) return true;
  try {
    return new URL(src).host.toLowerCase() === host;
  } catch {
    return false;
  }
};
