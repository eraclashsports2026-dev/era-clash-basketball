// ── Clash Cards V1: the browser side ─────────────────────────────────────────
// Two payload requests (the server builds the allowlisted card model from the
// authoritative record) and the export/share helpers. Export is a canvas PNG,
// same-origin assets only; sharing feature-detects file sharing and keeps the
// user gesture; saving is the fallback; nothing here reports "sent".
import { cardFilename } from "./contract.js";

const post = async (body, accessToken = null) => {
  const r = await fetch("/api/profile", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", Accept: "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!data) throw new Error(`HTTP ${r.status}`);
  return { httpStatus: r.status, ...data };
};
export const resultCardRequest = ({ chaosRunId, accessToken = null }) => post({ action: "card-result", chaosRunId }, accessToken);
export const invitationCardRequest = ({ code, accessToken }) => post({ action: "card-invitation", code }, accessToken);

/** Can this browser share a PNG file through the native sheet? (Files, not just text.) */
export const canShareFile = (file) => {
  try { return typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); }
  catch { return false; }
};

/** A PNG File from a canvas. Rejects when the canvas is tainted or export fails. */
export const canvasToPngFile = (canvas, kind) => new Promise((resolve, reject) => {
  try {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], cardFilename(kind), { type: "image/png" })) : reject(new Error("export_failed"))), "image/png");
  } catch (e) { reject(new Error("export_failed")); }
});

/** Save through a download link; returns true when the click was issued. */
export const saveFile = (file) => {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = file.name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch { return false; }
};

/**
 * Native share of the image (plus, for an invitation, the link once). Returns
 * "shared" when the sheet resolved, "cancelled" when the user dismissed it,
 * "unsupported" when the browser cannot share files. A resolved sheet is NOT
 * proof the friend received anything, and the copy never says so.
 */
export const shareFile = async (file, { text, url } = {}) => {
  if (!canShareFile(file)) return "unsupported";
  try { await navigator.share({ files: [file], ...(text ? { text } : {}), ...(url ? { url } : {}) }); return "shared"; }
  catch (e) { return e?.name === "AbortError" ? "cancelled" : "failed"; }
};
