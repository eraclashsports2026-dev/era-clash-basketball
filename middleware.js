// ── Edge middleware: preview access gate ──────────────────────────────────────
// Runs ONLY on Vercel Preview deployments (VERCEL_ENV === "preview") of
// branches that carry this file — production builds from main, which does not.
// Unauthorized requests get a minimal access page (HTML) or a JSON 401 (API)
// that reveals nothing about the application.
import { verifyPreviewKey, verifySession, signSession, readCookie, COOKIE_NAME, SESSION_TTL_SECONDS } from "./api/_lib/previewAccessCheck.js";
import { PREVIEW_ENV } from "./config/previewEnv.js";

// Best-effort wave metrics (sessions, failed attempts) straight to the KV REST
// API — the middleware cannot host the full store client, and a metrics miss
// must never block a request.
const metric = (field, by = 1) => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  fetch(`${url}/hincrby/preview-metrics:counters/${field}/${by}`, {
    method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
};

const GATE_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private preview</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0b0d12;color:#e8e8ea;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#141824;border:1px solid #232a3d;border-radius:12px;padding:32px;max-width:360px;width:90%}
h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#9aa3b5;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2b3350;background:#0b0d12;color:#e8e8ea;font-size:14px;margin-bottom:12px}
button{width:100%;padding:10px;border-radius:8px;border:0;background:#c9a227;color:#141824;font-weight:700;font-size:14px;cursor:pointer}</style></head>
<body><form class="card" method="POST" action="/api/preview-access">
<h1>Private preview</h1><!--DENIED--><p>This is an invite-only test environment. Enter your access key to continue.</p>
<input name="key" type="password" autocomplete="off" placeholder="access key" required>
<button type="submit">Enter</button></form></body></html>`;

// Vercel routing middleware continues to the route ONLY via the
// x-middleware-next header — a bare `return` would answer with an empty 200.
const NEXT = () => new Response(null, { headers: { "x-middleware-next": "1" } });

export default async function middleware(req) {
  if (process.env.VERCEL_ENV !== "preview" || !PREVIEW_ENV.requireAccess) return NEXT();
  const url = new URL(req.url);

  // Key exchange lives IN the middleware (the deployment's function budget is
  // full at 13): POST verifies the submitted key and issues a SIGNED SESSION
  // cookie — the raw key is never stored in the browser. DELETE clears it.
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
    const who = await verifyPreviewKey(key);
    if (!who.ok) {
      metric("access_denied_key");
      return new Response(JSON.stringify({ error: "preview_access_denied" }), {
        status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    metric("sessions_started");
    metric(`sessions_${who.testerId}`);
    const session = await signSession(who);
    if (!session) {
      return new Response(JSON.stringify({ error: "preview_session_unavailable" }), {
        status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    return new Response(null, { status: 303, headers: {
      location: "/",
      "set-cookie": `${COOKIE_NAME}=${encodeURIComponent(session)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
      "cache-control": "no-store" } });
  }

  // ── One-tap access link: /?pv=<key> ────────────────────────────────────────
  // A tester (or the owner) opens their personal link, the key is exchanged for
  // a signed session, and we redirect IMMEDIATELY to the same URL with `pv`
  // stripped — so the key leaves the address bar and never reaches the app,
  // while any other params (notably ?scenario=w1-sN) survive. The key is still
  // visible in the link itself: send links privately, and treat a screenshot
  // of one as an exposed key.
  const linkKey = url.searchParams.get("pv");
  if (linkKey) {
    const via = await verifyPreviewKey(linkKey);
    const clean = new URL(url);
    clean.searchParams.delete("pv");
    if (!via.ok) {
      metric("access_denied_key");
      clean.searchParams.set("pv_denied", "1");   // the gate page explains itself
      return new Response(null, { status: 303, headers: { location: clean.pathname + clean.search, "cache-control": "no-store" } });
    }
    const linkSession = await signSession(via);
    if (linkSession) {
      metric("sessions_started");
      metric(`sessions_${via.testerId}`);
      return new Response(null, { status: 303, headers: {
        location: clean.pathname + clean.search || "/",
        "set-cookie": `${COOKIE_NAME}=${encodeURIComponent(linkSession)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
        "cache-control": "no-store" } });
    }
  }

  // Signed session first; the raw-key header stays for operator tooling
  // (presented per request, never stored).
  const session = await verifySession(readCookie(req.headers.get("cookie"), COOKIE_NAME));
  // Owner-only surfaces: /dev/* is the Basketball theme lab (Phase 9A.1), an
  // owner decision surface. A tester with a valid session sees the same 404 an
  // unknown path gets, so the lab is never discoverable from the product.
  const ownerOnly = url.pathname.startsWith("/dev/");
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  if (session.ok) return ownerOnly && session.role !== "owner" ? notFound() : NEXT();
  const headerKey = req.headers.get("x-preview-key");
  if (headerKey) {
    const who = await verifyPreviewKey(headerKey);
    if (who.ok) return ownerOnly && who.role !== "owner" ? notFound() : NEXT();
  }
  if (session.reason === "expired" || session.reason === "revoked") metric(`access_denied_${session.reason}`);
  else if (headerKey || session.reason !== "missing") metric("access_denied_key");
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "preview_access_required" }), {
      status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  const denied = url.searchParams.get("pv_denied")
    ? `<p style="color:#e0a0a8">That access link is not valid — it may have been revoked. Ask for a new one, or enter your key below.</p>`
    : "";
  return new Response(GATE_PAGE.replace("<!--DENIED-->", denied), { status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export const config = {
  // Node runtime (the edge runtime is deprecated for middleware).
  runtime: "nodejs",
  // Gate the app shell, API and share pages. Static assets are inert without
  // the gated HTML and stay cache-friendly.
  // Phase 8C adds client-rendered destinations. They MUST be gated too — a
  // path served by the SPA fallback but missing from this matcher would hand
  // the whole app shell to an unauthenticated visitor.
  matcher: [
    "/", "/index.html", "/api/:path*", "/result/:path*", "/challenge/:path*",
    "/membership", "/fantasy/:path*", "/modes/:path*",
    // Phase 9A: the Play Lobby and every mode route. Same rule as above — a
    // client-rendered path missing here hands the app shell to anyone.
    "/play", "/play/:path*",
    // Phase 9A.1: the owner-only theme lab.
    "/dev/:path*",
  ],
};
