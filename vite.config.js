import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY } from "./src/versions.js";

export const SW_PLACEHOLDER = "__ERACLASH_BUILD_ID__";
export const CACHE_PREFIX = "eraclash-assets:";

/** Build identity: app version + a hash of the emitted asset filenames. Vite
 *  content-hashes every asset name, so any real bundle change moves this. */
export const buildId = (assetNames) => {
  const h = createHash("sha256").update([...assetNames].sort().join("|")).digest("hex").slice(0, 12);
  return `${CACHE_PREFIX}${REGISTRY.appVersion.value}:${h}`;
};

/**
 * Stamps the service worker's cache identity at build time.
 * public/ files are copied verbatim by Vite, so the substitution happens on the
 * emitted dist/sw.js rather than through a transform.
 */
const swVersionPlugin = () => ({
  name: "eraclash-sw-version",
  closeBundle() {
    const swPath = join(process.cwd(), "dist", "sw.js");
    if (!existsSync(swPath)) return;
    const assetsDir = join(process.cwd(), "dist", "assets");
    const names = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
    const id = buildId(names);
    const src = readFileSync(swPath, "utf8");
    if (!src.includes(SW_PLACEHOLDER)) {
      this.warn(`sw.js is missing ${SW_PLACEHOLDER} — the cache identity was NOT stamped`);
      return;
    }
    writeFileSync(swPath, src.replace(SW_PLACEHOLDER, id));
    this.info(`service worker cache identity: ${id}`);

    // The same identity goes into the HTML so the app can name its own build
    // and detect that a newer one is live (see src/buildStamp.js).
    const htmlPath = join(process.cwd(), "dist", "index.html");
    if (existsSync(htmlPath)) {
      const html = readFileSync(htmlPath, "utf8");
      if (!html.includes(SW_PLACEHOLDER)) {
        this.warn(`dist/index.html is missing ${SW_PLACEHOLDER} — the build stamp was NOT applied`);
      } else {
        writeFileSync(htmlPath, html.replaceAll(SW_PLACEHOLDER, id));
      }
    }
  },
});

// Vercel exposes its Git metadata to the build with a VITE_ prefix, and Vite
// inlines every VITE_ variable into import.meta.env — so the full commit
// message and the committer's name and login were being shipped inside the
// browser bundle on every preview deploy. Nothing in src/ reads any of them.
// Drop them before Vite resolves the env: a commit message is internal
// narrative (it can name server functions, tables and defects) and a
// committer is identity; neither belongs in a public asset.
for (const k of ["VITE_VERCEL_GIT_COMMIT_MESSAGE", "VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME", "VITE_VERCEL_GIT_COMMIT_AUTHOR_LOGIN"]) delete process.env[k];

// Release guard (production launch, 2026-09-09). Two configuration mistakes
// must never reach a public bundle, whatever a dashboard holds:
//  1. a secret-shaped value in ANY VITE_ variable (sb_secret_ or a service_role
//     JWT) — dropped, so the bundle cannot carry it;
//  2. a browser provider (VITE_SUPABASE_URL) that names a DIFFERENT project from
//     the server's SUPABASE_URL — the browser would sign people up against one
//     database while the server serves another. Both VITE_SUPABASE_* values are
//     dropped, so the build degrades to guest play until the pair agrees.
// Names are logged, never values.
const jwtRole = (v) => { try { const p = String(v).split("."); if (p.length !== 3) return null; const pad = p[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(Buffer.from(pad + "=".repeat((4 - (pad.length % 4)) % 4), "base64").toString("utf8"))?.role ?? null; } catch { return null; } };
const secretShaped = (v) => /^sb_secret_/.test(String(v ?? "").trim()) || jwtRole(String(v ?? "").trim()) === "service_role";
for (const k of Object.keys(process.env)) if (k.startsWith("VITE_") && secretShaped(process.env[k])) { console.warn(`[release guard] ${k} holds a secret-shaped value and was dropped from the build`); delete process.env[k]; }
const refOf = (u) => (String(u ?? "").trim().match(/^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i) || [])[1] || null;
if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL && refOf(process.env.VITE_SUPABASE_URL) !== refOf(process.env.SUPABASE_URL)) {
  console.warn("[release guard] VITE_SUPABASE_URL names a different project from SUPABASE_URL; VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were dropped from the build (guest play until they agree)");
  delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY;
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), swVersionPlugin()],
  define: {
    // The Basketball theme lab (Phase 9A.1): an owner decision surface at
    // /dev/basketball-theme-lab. Compiled INTO preview builds (VERCEL_ENV is
    // "preview" on every Git-integration branch deploy) and into the dev
    // server; compiled OUT of production, where the constant is false and the
    // lazy import behind it is unreachable.
    __EC_THEME_LAB__: JSON.stringify(process.env.VERCEL_ENV === "preview" || process.env.VITE_EC_THEME_LAB === "1" || mode === "development"),
  },
}));
