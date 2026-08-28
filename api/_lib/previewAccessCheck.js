// ── Preview access verification ───────────────────────────────────────────────
// Shared by the edge middleware (Web Crypto) and the node access endpoint.
// Pure and side-effect free so it is directly unit-testable.
import { PREVIEW_ACCESS } from "../../config/previewAccess.js";

export const COOKIE_NAME = "pv_access";
const KEY_SHAPE = /^[a-f0-9]{32}$/;

export const sha256Hex = async (s) => {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** → {ok, label} — label identifies the allowlist entry, never the person. */
export const verifyPreviewKey = async (key) => {
  if (typeof key !== "string" || !KEY_SHAPE.test(key)) return { ok: false, label: null };
  const h = await sha256Hex(key);
  const hit = PREVIEW_ACCESS.keys.find((k) => k.sha256 === h);
  return hit ? { ok: true, label: hit.label } : { ok: false, label: null };
};

export const readCookie = (cookieHeader, name) => {
  for (const part of String(cookieHeader || "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
};

/** Extract the presented key from a request-ish {headers} object. */
export const presentedKey = (headers) =>
  headers["x-preview-key"] || readCookie(headers.cookie, COOKIE_NAME) || null;
