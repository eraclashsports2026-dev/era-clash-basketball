// ── Era context banner ───────────────────────────────────────────────────────
// The Era Style is one of the product's defining systems, so once it is
// revealed it never leaves the screen. This is the ONE component that renders
// it, used by the draft, the coach draft, the ready state, the loading screen
// and the postgame, so the era can never be shown one way here and another way
// there.
import { useState } from "react";
import { T, R } from "../../theme.js";

export default function EraContextBanner({ era, tone = "arena", compact = false }) {
  const [open, setOpen] = useState(false);
  const onArena = tone === "arena";
  const fg = onArena ? T.onArena : T.text;
  const dim = onArena ? T.onArenaDim : T.textDim;
  const accent = onArena ? T.goldOnDark : T.gold;
  const bg = onArena ? "rgba(233,185,73,0.08)" : T.goldSoft;
  const border = onArena ? "rgba(233,185,73,0.45)" : T.goldBorder;

  if (!era) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: R.sm,
        border: `1px dashed ${onArena ? T.arenaBorder : T.border}`, color: dim, fontSize: 12,
      }}>
        <span style={{ fontWeight: 900, letterSpacing: 1.4 }}>ERA HIDDEN</span>
        <span>Revealed with Roll 2, before your final holds.</span>
      </div>
    );
  }

  return (
    <div role="region" aria-label={`${era.eraId} era style`} style={{
      padding: compact ? "8px 12px" : "10px 14px", borderRadius: R.sm,
      border: `1px solid ${border}`, background: bg,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 900, fontSize: compact ? 13 : 15, letterSpacing: 1, color: accent }}>
          {era.headline}
        </span>
        <span style={{ fontSize: 12, color: fg, lineHeight: 1.5 }}>
          {(era.highlights || []).filter(Boolean).join(" · ")}
        </span>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
          marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
          color: dim, fontSize: 11.5, fontWeight: 700, textDecoration: "underline", padding: "2px 0",
        }}>{open ? "Less" : "Era rules"}</button>
      </div>
      {open && (
        <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {[era.pace, era.rebounding, ...(era.ruleFacts || [])].filter(Boolean).map((f) => (
            <li key={f} style={{ fontSize: 12, color: dim, lineHeight: 1.5 }}>· {f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
