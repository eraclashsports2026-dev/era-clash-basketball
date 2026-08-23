// ── Frontend error monitoring ─────────────────────────────────────────────────
// Reports uncaught errors and unhandled rejections through the analytics pipe
// as "frontend_error" events (message + source only — no stack PII concerns,
// but we still truncate aggressively). If a dedicated error monitoring service
// (e.g. Sentry) is added later, swap the sink here — call sites don't change.
import { track } from "./analytics.js";

const clip = (s, n = 300) => String(s || "").slice(0, n);

let installed = false;
const seen = new Set(); // avoid flooding on render loops

const report = (kind, message, source) => {
  const key = `${kind}:${clip(message, 80)}`;
  if (seen.has(key) || seen.size > 20) return;
  seen.add(key);
  track("frontend_error", { kind, message: clip(message), source: clip(source, 120) });
};

export const installErrorMonitoring = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) =>
    report("error", e.message, `${e.filename || ""}:${e.lineno || 0}`));
  window.addEventListener("unhandledrejection", (e) =>
    report("unhandledrejection", e.reason?.message || String(e.reason), ""));
};

// Explicit reporting for caught-but-important failures (e.g. simulation errors).
export const reportError = (context, err) =>
  report("handled", `${context}: ${err?.message || err}`, context);
