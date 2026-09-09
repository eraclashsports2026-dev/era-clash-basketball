// ── Accessible dropdown menu primitive ───────────────────────────────────────
// One implementation for both Play and Fantasy: opens on click or Enter,
// closes on Escape or outside click, and returns focus to its trigger.
import { useEffect, useRef, useState, useId } from "react";

export default function NavMenu({ label, active, children, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const id = useId();

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        className="ec-nav-item"
        data-active={active || open ? "true" : "false"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        style={{
          position: "relative", minHeight: 44, padding: "0 14px", borderRadius: 10, cursor: "pointer",
          fontWeight: 800, fontSize: 13.5, letterSpacing: 0.4,
          border: `1px solid ${active || open ? "var(--ec-a-gold-line, rgba(242,181,29,0.45))" : "transparent"}`,
          background: active || open ? "var(--ec-a-gold-soft, rgba(242,181,29,0.14))" : "transparent",
          color: active || open ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text-secondary, #c3cddd)",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        {label}<span aria-hidden="true" style={{ fontSize: 10, opacity: 0.8 }}>▾</span>
      </button>
      {open && (
        <div ref={panelRef} id={id} role="menu" aria-label={label} className="ec-menu-panel">
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
