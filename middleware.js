// ── Edge middleware: preview access gate ──────────────────────────────────────
// Runs ONLY on Vercel Preview deployments (VERCEL_ENV === "preview") of
// branches that carry this file — production builds from main, which does not.
// Unauthorized requests get a minimal access page (HTML) or a JSON 401 (API)
// that reveals nothing about the application.
import { verifyPreviewKey, readCookie, COOKIE_NAME } from "./api/_lib/previewAccessCheck.js";
import { PREVIEW_ENV } from "./config/previewEnv.js";

const GATE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private preview</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0b0d12;color:#e8e8ea;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#141824;border:1px solid #232a3d;border-radius:12px;padding:32px;max-width:360px;width:90%}
h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#9aa3b5;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b3350;background:#0b0d12;color:#e8e8ea;font-size:14px;margin-bottom:12px}
button{width:100%;padding:10px;border-radius:8px;border:0;background:#c9a227;color:#141824;font-weight:700;font-size:14px;cursor:pointer}</style></head>
<body><form class="card" method="POST" action="/api/preview-access">
<h1>Private preview</h1><p>This is an invite-only test environment. Enter your access key to continue.</p>
<input name="key" type="password" autocomplete="off" placeholder="access key" required>
<button type="submit">Enter</button></form></body></html>`;

export default async function middleware(req) {
  if (process.env.VERCEL_ENV !== "preview" || !PREVIEW_ENV.requireAccess) return;
  const url = new URL(req.url);

  // Key exchange lives IN the middleware (the deployment's function budget is
  // full at 13): POST verifies the submitted key and sets the gate cookie,
  // DELETE clears it. No serverless function involved.
  if (url.pathname === "/api/preview-access") {
    if (req.method === "DELETE") {
      return new Response(null, { status: 204, headers: {
        "set-cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
    }
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "content-type": "application/json" } });
    let key = "";
    try {
      const text = await req.text();
      key = (req.headers.get("content-type") || "").includes("json")
        ? String(JSON.parse(text || "{}").key ?? "")
        : String(new URLSearchParams(text).get("key") ?? "");
    } catch { key = ""; }
    if (!(await verifyPreviewKey(key)).ok) {
      return new Response(JSON.stringify({ error: "preview_access_denied" }), {
        status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    return new Response(null, { status: 303, headers: {
      location: "/",
      "set-cookie": `${COOKIE_NAME}=${encodeURIComponent(key)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
      "cache-control": "no-store" } });
  }

  const key = req.headers.get("x-preview-key") || readCookie(req.headers.get("cookie"), COOKIE_NAME);
  if (key && (await verifyPreviewKey(key)).ok) return;
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "preview_access_required" }), {
      status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  return new Response(GATE_PAGE, { status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export const config = {
  // Node runtime (the edge runtime is deprecated for middleware).
  runtime: "nodejs",
  // Gate the app shell, API and share pages. Static assets are inert without
  // the gated HTML and stay cache-friendly.
  matcher: ["/", "/index.html", "/api/:path*", "/result/:path*", "/challenge/:path*"],
};
