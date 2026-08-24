// ── /api/v3meta client with request coalescing ────────────────────────────────
// The build screen mounts several panels that each need V3 context: each team's
// COACH tab (recommendations), each team's ERA STYLE tab (era note), and the
// KEY CLASH preview. The coach and era panels for a given side send a
// byte-identical body, so without coalescing one screen fired ~5 requests for
// ~3 distinct questions — and every tab switch re-fired them.
//
// Identical in-flight requests now share one promise, and answers are cached
// briefly so flipping between tabs is instant instead of a new round trip.
const inflight = new Map();
const cache = new Map();
const TTL = 60_000;

export const v3meta = (body) => {
  const key = JSON.stringify(body);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.value);
  if (inflight.has(key)) return inflight.get(key);

  const p = fetch("/api/v3meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: key,
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((value) => {
      if (value) cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
};
