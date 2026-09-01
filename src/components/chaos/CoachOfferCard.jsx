// ── One coach offer in the Coach Draft ───────────────────────────────────────
import { useState } from "react";
import { T, R } from "../../theme.js";

export default function CoachOfferCard({ offer, held, onToggle, selected, onSelect, mode, disabled }) {
  const [open, setOpen] = useState(false);
  const accent = T.goldOnDark;
  const active = mode === "select" ? selected : held;
  return (
    <div style={{
      borderRadius: R.md, padding: 12, display: "flex", flexDirection: "column", gap: 7,
      border: `1px solid ${active ? accent : T.arenaBorder}`,
      background: active ? "rgba(233,185,73,0.10)" : "rgba(255,255,255,0.04)",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: accent }}>
        {offer.roleLabel?.toUpperCase()}
      </div>
      <div>
        <div style={{ fontWeight: 900, fontSize: 15, color: T.onArena, lineHeight: 1.2 }}>{offer.name}</div>
        <div style={{ fontSize: 11, color: T.onArenaDim }}>{offer.span}</div>
      </div>
      <div style={{ fontSize: 12, color: T.onArenaDim, lineHeight: 1.5 }}>{offer.roleBlurb}</div>
      <div style={{ fontSize: 12.5, color: T.onArena, lineHeight: 1.5 }}>{offer.offense}</div>
      {open && (
        <div style={{ display: "grid", gap: 5 }}>
          {[offer.central, offer.targets, offer.defense, offer.era].filter(Boolean).map((line) => (
            <div key={line} style={{ fontSize: 12, color: T.onArenaDim, lineHeight: 1.5 }}>{line}</div>
          ))}
          <div style={{ fontSize: 11.5, color: T.onArenaDim, lineHeight: 1.5, fontStyle: "italic" }}>
            Tradeoff: {offer.sacrifice}
          </div>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
        alignSelf: "flex-start", background: "transparent", border: "none", cursor: "pointer",
        color: T.onArenaDim, fontSize: 11.5, fontWeight: 700, textDecoration: "underline", padding: 0,
      }}>{open ? "Less detail" : "More detail"}</button>

      <div style={{ marginTop: "auto" }}>
        {mode === "select" ? (
          <button onClick={onSelect} aria-pressed={!!selected} disabled={disabled} style={{
            width: "100%", minHeight: 44, borderRadius: R.sm, cursor: disabled ? "default" : "pointer",
            fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6,
            border: `1px solid ${selected ? accent : T.arenaBorder}`,
            background: selected ? accent : "transparent",
            color: selected ? T.arena : T.onArenaDim,
          }}>{selected ? "SELECTED" : "SELECT"}</button>
        ) : (
          <button onClick={onToggle} aria-pressed={!!held} disabled={disabled}
            aria-label={`${held ? "Release" : "Hold"} ${offer.name}`} style={{
              width: "100%", minHeight: 44, borderRadius: R.sm, cursor: disabled ? "default" : "pointer",
              fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6,
              border: `1px solid ${held ? accent : T.arenaBorder}`,
              background: held ? accent : "transparent",
              color: held ? T.arena : T.onArenaDim, opacity: disabled ? 0.55 : 1,
            }}>{held ? "HELD" : "HOLD"}</button>
        )}
      </div>
    </div>
  );
}
