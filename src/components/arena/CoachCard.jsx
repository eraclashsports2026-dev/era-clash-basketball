// ── One coach offer in Coach Chaos ───────────────────────────────────────────
// Purple, because a coaching staff is a third identity — and deliberately NOT a
// third team: this colour never appears on a player card or on a score.
//
// The card is fixed geometry (248 × 232) with a real portrait zone, so approved
// coach art is the same straight swap the player cards get. Until then the zone
// holds a masked coach figure with a monogram, not a text-only panel.
//
// The face stays short. Everything deeper — who it feeds, what it targets, how
// it translates to the era, what it gives up — is one tap away.
import { useState } from "react";
import { initialsOf } from "../../ui/time-arena/portraits.js";

export default function CoachCard({
  offer, mode = "hold", held = false, selected = false, onToggle, onSelect, disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const on = mode === "select" ? selected : held;
  const detail = [offer.central, offer.targets, offer.defense, offer.era].filter(Boolean);

  return (
    <div className="ec-coach-card" data-on={on ? "true" : "false"} data-role={offer.role}
      data-open={open ? "true" : "false"}
      aria-label={`${offer.roleLabel || offer.role} offer: ${offer.name}${on ? (mode === "select" ? ", selected" : ", held") : ""}`}>
      <div className="ec-coach-role">{(offer.roleLabel || offer.role).toUpperCase()}</div>

      <div className="ec-coach-portrait">
        {/* A masked figure, not a face. No coach likeness is created or fetched
            in this phase; approved art replaces this in the same zone. */}
        <div className="ec-coach-figure" aria-hidden="true" />
        <div className="ec-coach-figure-initials" aria-hidden="true">{initialsOf(offer.name)}</div>
      </div>

      <div className="ec-coach-body">
        <div className="ec-coach-name">{offer.name}</div>
        <div className="ec-coach-span" title={offer.span}>{offer.span}</div>
        <div className="ec-coach-blurb">{open ? offer.roleBlurb : offer.offense}</div>
        {open && detail.length > 0 && (
          <div style={{ display: "grid", gap: 3, marginTop: 2 }}>
            {detail.slice(0, 3).map((line) => (
              <div key={line} style={{ fontSize: 11, color: "var(--ec-a-text-muted)", lineHeight: 1.35 }}>{line}</div>
            ))}
            {offer.sacrifice && (
              <div style={{ fontSize: 11, color: "var(--ec-a-text-muted)", lineHeight: 1.35, fontStyle: "italic" }}>
                Gives up: {offer.sacrifice}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ec-coach-foot">
        {(detail.length > 0 || offer.sacrifice) && (
          <button className="ec-coach-detail-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Less detail" : "Scouting detail"}
          </button>
        )}
        {mode === "select" ? (
          <button className="ec-coach-action" data-on={selected ? "true" : "false"}
            onClick={onSelect} disabled={disabled} aria-pressed={selected}
            aria-label={`${selected ? "Selected" : "Select"} ${offer.name}`}>
            {selected ? "✓ SELECTED" : "SELECT COACH"}
          </button>
        ) : mode === "final" ? (
          <div className="ec-coach-static">{selected ? "YOUR STAFF" : "NOT HIRED"}</div>
        ) : (
          <button className="ec-coach-action" data-on={held ? "true" : "false"}
            onClick={onToggle} disabled={disabled} aria-pressed={held}
            aria-label={`${held ? "Release" : "Hold"} ${offer.name}`}>
            <span aria-hidden="true">{held ? "🔒" : ""}</span>{held ? "LOCKED" : "HOLD"}
          </button>
        )}
      </div>
    </div>
  );
}
