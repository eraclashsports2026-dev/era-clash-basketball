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
