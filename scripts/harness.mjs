#!/usr/bin/env node
// ── Local integration harness ──────────────────────────────────────────────────
// Serves the built app (dist/) plus the REAL api/ handlers over the in-memory
// store — a production-shaped environment with no external dependencies.
// Used by Playwright E2E and the load-test scenarios. NEVER deployed.
//
//   ECLASH_TEST_MEMORY_STORE=1 ENABLE_CHAOS_TESTS=true node scripts/harness.mjs [port]
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

process.env.ECLASH_TEST_MEMORY_STORE ||= "1";
process.env.ENABLE_CHAOS_TESTS ||= "true";
process.env.ANTHROPIC_API_KEY ||= "harness-fake-key"; // narrative degrades gracefully
process.env.MAX_AI_REQUESTS_PER_DAY ||= "0"; // budget-blocked: no real network calls
process.env.SIM_ENGINE_V3_ENABLED ||= "true"; // V3 engine on in the test harness

const PORT = Number(process.argv[2]) || 4173;
const DIST = new URL("../dist", import.meta.url).pathname;

// Fail fast on a missing build. The readiness probe Playwright waits on is
// /api/health — a live handler import — so it answers even when dist/ is absent,
// and every navigation would then fall through to a 404-turned-index and grade
// nothing at all. A silent pass on an empty build is worse than no run.
if (!existsSync(join(DIST, "index.html"))) {
  console.error(`harness: ${DIST}/index.html is missing — run \`npm run build\` first.`);
  process.exit(1);
}

const routes = {
  "/api/game": (await import("../api/game.js")).default,
  "/api/narrative": (await import("../api/narrative.js")).default,
  "/api/challenge": (await import("../api/challenge.js")).default,
  "/api/daily": (await import("../api/daily.js")).default,
  "/api/profile": (await import("../api/profile.js")).default,
  "/api/health": (await import("../api/health.js")).default,
  "/api/events": (await import("../api/events.js")).default,
  "/api/feedback": (await import("../api/feedback.js")).default,
  "/api/result": (await import("../api/result.js")).default,
  "/api/share-page": (await import("../api/share-page.js")).default,
  "/api/simulate": (await import("../api/simulate.js")).default,
  "/api/v3meta": (await import("../api/v3meta.js")).default,
};

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => { size += c.length; if (size < 1_000_000) chunks.push(c); });
  req.on("end", () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
    catch { resolve({}); }
  });
});

// Vercel-style res shim
const shim = (res) => ({
  setHeader: (k, v) => res.setHeader(k, v),
  status(c) { res.statusCode = c; return this; },
  json(b) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(b)); return this; },
  send(b) { res.end(b); return this; },
  end() { res.end(); return this; },
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = url.pathname;

  // vercel.json rewrites
  let m;
  if ((m = path.match(/^\/result\/([a-z0-9]+)$/))) { path = "/api/share-page"; url.searchParams.set("kind", "result"); url.searchParams.set("id", m[1]); }
  if ((m = path.match(/^\/challenge\/([a-z0-9]+)$/))) { path = "/api/share-page"; url.searchParams.set("kind", "challenge"); url.searchParams.set("id", m[1]); }

  const handler = routes[path];
  if (handler) {
    const vreq = {
      method: req.method,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams),
      body: ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : undefined,
    };
    try { await handler(vreq, shim(res)); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: "harness handler crash", msg: String(e.message) })); }
    return;
  }

  // static: dist/ with SPA fallback
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, safe === "/" ? "index.html" : safe);
  if (!existsSync(file)) file = join(DIST, "index.html");
  try {
    res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404; res.end("not found");
  }
}).listen(PORT, () => console.log(`EraClash harness on http://localhost:${PORT} (memory store, chaos enabled)`));
