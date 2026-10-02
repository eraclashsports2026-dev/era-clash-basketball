// Initial HTML already contains the recap. This progressive enhancement records
// human opens and CTA clicks only; crawlers need neither JavaScript nor cookies.
// Same anonymous keys and closed event vocabulary as src/loop/events.js.
(() => {
  const root = document.querySelector("[data-public-recap]");
  if (!root) return;
  const anonymous = (storage, key) => {
    try { const store = window[storage]; let v = store.getItem(key); if (!v) { v = crypto.randomUUID(); store.setItem(key, v); } return v; }
    catch { return ""; }
  };
  const emit = (event) => {
    const body = JSON.stringify({ events: [{ event, source: "card", ts: Date.now(), uid: anonymous("localStorage", "ec_uid"), session_id: anonymous("sessionStorage", "ec_sid") }] });
    try {
      if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
      void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch { /* telemetry never blocks the CTA */ }
  };
  emit("card_opened");
  root.querySelector("a.button")?.addEventListener("click", () => emit("rematch_started_from_card"), { once: true });
})();
