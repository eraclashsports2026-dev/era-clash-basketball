// ── "Are you sure you want to reset?" ────────────────────────────────────────
// A reset throws away a board the player built, so it asks first — and it says
// exactly what it will do, which differs depending on whether a game has been
// played yet. The buttons are Yes and No because the title asks a question; the
// accessible names carry the full sentence for anyone who lands on a control
// without having read the title.
import { useEffect, useRef } from "react";

const COPY = {
  draft: {
    title: "Reset this Clash?",
    body: "Your five, your holds and the staff offers on the board are discarded and a fresh Clash is dealt. This cannot be undone.",
  },
  complete: {
    title: "Start a new Clash?",
    body: "A fresh Clash is dealt. This game stays in the Result Dock as your last clash, and its full report still opens.",
  },
  // From the lobby's Continue card: the run is discarded and nothing new is
  // dealt. A guest's run budget is spent when a run STARTS, so abandoning one
  // never buys another opening roll.
  abandon: {
    title: "Abandon this Chaos Clash?",
    body: "Your five, your holds and the staff offers are discarded. Nothing is recorded, and this cannot be undone. Your remaining Chaos runs are unchanged — a run counts when it starts, not when it ends.",
  },
};

export default function ResetDialog({ open, state = "draft", busy = false, onConfirm, onCancel }) {
  const noRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // The safe choice takes focus, so Enter on an unread dialog does nothing.
    noRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const copy = COPY[state] || COPY.draft;

  return (
    <div role="dialog" aria-modal="true" aria-label={copy.title} onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 95, background: "var(--ec-a-scrim, rgba(3,7,13,0.9))",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="ec-panel ec-panel-raised"
        style={{ maxWidth: 420, width: "100%", padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontFamily: "var(--ec-display)", fontSize: 19, color: "var(--ec-a-text)" }}>
          {copy.title}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.55, color: "var(--ec-a-text-secondary)" }}>
          {copy.body}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={onConfirm} disabled={busy}
            aria-label={state === "complete" ? "Yes, start a new Clash" : state === "abandon" ? "Yes, abandon this Chaos Clash" : "Yes, reset this Clash"}
            style={{
              minHeight: 44, borderRadius: 9, cursor: busy ? "default" : "pointer",
              fontFamily: "var(--ec-display)", fontSize: 13, fontWeight: 700, letterSpacing: 1,
              border: "1px solid var(--ec-a-gold-line)",
              background: "linear-gradient(180deg, var(--ec-a-gold), #b07d09)",
              color: "#0a0f18", opacity: busy ? 0.6 : 1,
            }}>{busy ? (state === "abandon" ? "ABANDONING…" : "RESETTING…") : "YES"}</button>
          <button ref={noRef} onClick={onCancel}
            aria-label={state === "complete" ? "No, stay on this result" : state === "abandon" ? "No, keep this Chaos Clash" : "No, keep drafting"}
            style={{
              minHeight: 44, borderRadius: 9, cursor: "pointer",
              fontFamily: "var(--ec-display)", fontSize: 13, fontWeight: 700, letterSpacing: 1,
              border: "1px solid var(--ec-a-border-strong)", background: "transparent",
              color: "var(--ec-a-text-secondary)",
            }}>NO</button>
        </div>
      </div>
    </div>
  );
}
