// ── POST /api/preview-access — exchange an access key for the gate cookie ─────
// Preview deployments only (middleware exempts this path so it stays
// reachable). DELETE clears the cookie (sign-out / revocation verification).
import { verifyPreviewKey, COOKIE_NAME } from "./_lib/previewAccessCheck.js";
import { previewEvent } from "./_lib/previewTelemetry.js";

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "Not found" });
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = typeof req.body === "string"
    ? new URLSearchParams(req.body).get("key")
    : (req.body?.key ?? null);
  const v = await verifyPreviewKey(String(key ?? ""));
  if (!v.ok) {
    return res.status(401).json({ error: "preview_access_denied" });
  }
  previewEvent("preview_session_started", { accessLabel: v.label });
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(String(key))}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`);
  res.setHeader("Location", "/");
  return res.status(303).end();
}
