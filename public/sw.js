// EraClash Basketball — service worker
// Network-first for everything; caches the app shell as an offline fallback.
// API calls (/api/*) and non-GET requests are never cached — user data and
// simulation responses must never be served stale.
//
// ── CACHE IDENTITY IS BUILD-DERIVED, NOT HAND-MAINTAINED ─────────────────────
// The token below is replaced at build time by the Vite plugin in
// vite.config.js with `eraclash-assets:{appVersion}:{assetManifestHash}`.
//
// It used to be a hand-edited constant, and it drifted: the app shipped 2.7.2
// while the service worker still said `eraclash-v2.3.5`. A stale cache name is
// not a cosmetic problem — it means activation never deletes the old cache,
// because the old cache IS the current one, so returning visitors keep an app
// shell from four releases ago until they clear storage by hand.
//
// Deriving it from the asset manifest hash also makes it change when the
// CONTENT changes, not merely when someone remembers to bump a number. Vite
// content-hashes every asset filename, so any real change to the bundle
// produces a new cache identity automatically.
const BUILD_ID = "__ERACLASH_BUILD_ID__";
const CACHE_PREFIX = "eraclash-assets:";
// Dev fallback: when the placeholder is unreplaced (vite dev, or the file
// served straight from public/), use a marker that can never collide with a
// real build identity.
const CACHE = BUILD_ID.startsWith("__ERACLASH") ? `${CACHE_PREFIX}dev` : BUILD_ID;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Scope the sweep to OUR namespace. Deleting every cache key would
          // also destroy caches this app does not own.
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return; // never cache cross-origin
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // only cache good, basic (same-origin) responses
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("/")))
  );
});
