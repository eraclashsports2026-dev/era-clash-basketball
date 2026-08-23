// EraClash Basketball — service worker
// Network-first for everything; caches the app shell as an offline fallback.
// API calls (/api/*) and non-GET requests are never cached — user data and
// simulation responses must never be served stale.
//
// CACHE VERSIONING: bump CACHE whenever a release changes the player database,
// rating formula, chemistry engine, or API contract — activation deletes every
// old cache so no client stays stuck on stale data. Keep in sync with
// src/versions.js (app version).
const CACHE = "eraclash-v2.3.5";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
