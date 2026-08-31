// ── One coach offer in Coach Chaos ───────────────────────────────────────────
// Purple, because a coaching staff is a third identity — and deliberately NOT a
// third team: this colour never appears on a player card or on a score.
//
// The card face stays short. Everything deeper (who it feeds, what it targets,
// how it translates to the era, what it gives up) is one tap away rather than
// an essay on the front.
import { useState } from "react";

const MONOGRAM = (name) => String(name || "").split(" ").map((w) => w[0]).slice(0, 2).join("");

export default function CoachCard({
  offer, mode = "hold", held = false, selected = false, onToggle, onSelect, disabled = false, era = null,
}) {
  const [open, setOpen] = useState(false);
  const on = mode === "select" ? selected : held;
  const detail = [offer.central, offer.targets, offer.defense, offer.era].filter(Boolean);

  return (
    <div className="ec-coach-card" data-on={on ? "true" : "false"} data-role={offer.role}
      aria-label={`${offer.roleLabel || offer.role} offer: ${offer.name}${on ? (mode === "select" ? ", selected" : ", held") : ""}`}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: "var(--ec-a-coach)" }}>
        {(offer.roleLabel || offer.role).toUpperCase()}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        {/* A monogram, not a face. No coach likeness is created or fetched in
            this phase; approved art can replace this tile without moving
            anything else on the card. */}
        <div className="ec-coach-monogram" role="img" aria-label={`${offer.name} monogram`}>
          {MONOGRAM(offer.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14.5, color: "var(--ec-a-text)", lineHeight: 1.2 }}>{offer.name}</div>
          <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)" }}>{offer.span}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--ec-a-text-secondary)", lineHeight: 1.5 }}>{offer.roleBlurb}</div>

      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
        <div style={{ fontSize: 12.5, color: "var(--ec-a-text)", lineHeight: 1.5 }}>{offer.offense}</div>
        {open && (
          <div style={{ display: "grid", gap: 5 }}>
            {detail.map((line) => (
              <div key={line} style={{ fontSize: 12, color: "var(--ec-a-text-secondary)", lineHeight: 1.5 }}>{line}</div>
            ))}
            {offer.sacrifice && (
              <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted)", lineHeight: 1.5, fontStyle: "italic" }}>
                Gives up: {offer.sacrifice}
              </div>
            )}
          </div>
        )}
        {(detail.length > 0 || offer.sacrifice) && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
            justifySelf: "start", minHeight: 44, padding: "0 2px",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--ec-a-text-muted)", fontSize: 11.5, fontWeight: 700, textDecoration: "underline",
          }}>{open ? "Less detail" : "Scouting detail"}</button>
        )}
      </div>

      {mode === "select" ? (
        <button onClick={onSelect} disabled={disabled} aria-pressed={selected} style={{
          minHeight: 46, width: "100%", borderRadius: 9, cursor: disabled ? "default" : "pointer",
          fontWeight: 900, fontSize: 12, letterSpacing: 0.8,
          border: `1px solid ${selected ? "var(--ec-a-coach)" : "var(--ec-a-border)"}`,
          background: selected ? "var(--ec-a-coach)" : "transparent",
          color: selected ? "#0a0f18" : "var(--ec-a-text-secondary)",
        }}>{selected ? "✓ SELECTED" : "SELECT COACH"}</button>
      ) : mode === "final" ? (
        <div style={{
          minHeight: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8,
          border: "1px dashed var(--ec-a-border)", color: "var(--ec-a-text-muted)",
        }}>{selected ? "YOUR STAFF" : "NOT HIRED"}</div>
      ) : (
        <button onClick={onToggle} disabled={disabled} aria-pressed={held} style={{
          minHeight: 46, width: "100%", borderRadius: 9, cursor: disabled ? "default" : "pointer",
          fontWeight: 900, fontSize: 11.5, letterSpacing: 0.8,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          border: `1px solid ${held ? "var(--ec-a-coach)" : "var(--ec-a-border)"}`,
          background: held ? "var(--ec-a-coach-soft)" : "transparent",
          color: held ? "var(--ec-a-coach)" : "var(--ec-a-text-secondary)",
        }} aria-label={`${held ? "Release" : "Hold"} ${offer.name}`}>
          <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "LOCKED" : "HOLD"}
        </button>
      )}
    </div>
  );
}
