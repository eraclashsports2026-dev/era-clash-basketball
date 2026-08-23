// ── EraClash analytics ─────────────────────────────────────────────────────────
// Centralized event wrapper. Gameplay code calls track(name, props) and knows
// nothing about the transport or vendor. Events are batched to /api/events;
// if the server has no store configured (or the request fails) they are
// dropped silently — instrumentation must never break gameplay.
//
// Privacy rules: no PII, no prompts, no free-text in auto events. uid is an
// anonymous random id, name is the user-chosen display name only where needed.
import { getUid, getSession } from "./identity.js";
import { VERSIONS } from "./versions.js";

const FLUSH_MS = 4000;
const MAX_QUEUE = 40;

let queue = [];
let timer = null;
let testSink = null; // tests can intercept events

const endpoint = "/api/events";

const send = (events) => {
  if (!events.length) return;
  const body = JSON.stringify({ events });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return;
  } catch { /* fall through to fetch */ }
  fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
};

export const flush = () => {
  if (timer) { clearTimeout(timer); timer = null; }
  const batch = queue; queue = [];
  send(batch);
};

export const track = (event, props = {}) => {
  const { sid } = getSession();
  const e = {
    event,
    ts: Date.now(),
    uid: getUid(),
    session_id: sid,
    app_version: VERSIONS.app,
    ...props,
  };
  if (testSink) { testSink(e); return; }
  queue.push(e);
  if (queue.length >= MAX_QUEUE) { flush(); return; }
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
};

// One-time session events. Call once at app boot.
export const trackSessionStart = () => {
  const s = getSession();
  if (!s.isNewSession) return; // page reload within same tab session
  track(s.returning ? "returning_session" : "session_started", {
    viewport_w: typeof window !== "undefined" ? window.innerWidth : 0,
    standalone: typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches || false),
  });
};

// Flush on page hide so tail events aren't lost.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

// test hook
export const _setTestSink = (fn) => { testSink = fn; };
