// ── Which build am I looking at, and is a newer one live? ─────────────────────
// A tester on a long-open tab, or a stale bookmark, can be looking at an old
// build with no way to tell. The build identity is stamped into the HTML at
// build time (`<meta name="eraclash-build">`, same value as the service-worker
// cache identity), so the running page can name itself — and can compare
// itself against a fresh, uncached fetch of the shell to notice a new deploy.
const PLACEHOLDER = "__ERACLASH";

const readMeta = (doc) =>
  doc?.querySelector?.('meta[name="eraclash-build"]')?.getAttribute("content") ?? null;

/** The build this page is running, or null in dev (placeholder unreplaced). */
export const currentBuild = () => {
  const v = readMeta(typeof document === "undefined" ? null : document);
  return !v || v.startsWith(PLACEHOLDER) ? null : v;
};

/** "2.7.2:9e84c20d4bf9" → "9e84c2" — enough to compare two builds by eye. */
export const shortBuild = (id = currentBuild()) => {
  if (!id) return "dev";
  const hash = id.split(":").pop() ?? id;
  return hash.slice(0, 6);
};

/** Parse the build id out of a freshly fetched shell. Exported for tests. */
export const buildIdFromHtml = (html) => {
  const m = String(html).match(/<meta\s+name="eraclash-build"\s+content="([^"]*)"/i);
  const v = m?.[1];
  return !v || v.startsWith(PLACEHOLDER) ? null : v;
};

/**
 * Poll the shell for a newer build and call back once when one appears.
 * Cheap (one uncached HTML fetch), only while the tab is visible, and silent
 * on any failure — a version check must never break the app.
 */
export const watchForNewBuild = (onNewBuild, { intervalMs = 5 * 60 * 1000 } = {}) => {
  const mine = currentBuild();
  if (!mine || typeof window === "undefined") return () => {};
  let stopped = false;

  const check = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/?buildcheck=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const live = buildIdFromHtml(await res.text());
      if (live && live !== mine) { stopped = true; onNewBuild(live); }
    } catch { /* offline or gated — try again later */ }
  };

  const timer = setInterval(check, intervalMs);
  const onVisible = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", onVisible);
  check();
  return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
};
