// ── Mode shelf ───────────────────────────────────────────────────────────────
// Secondary discovery, generated from the SAME registry the Play dropdown uses.
import { PLAY_MODES, resolveModeAction, STATUS_LABEL, MODE_STATUS } from "../../navigation.js";

export default function ModeShelf({ tier, activeModeId, onModeAction, previewCandidateActive }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "var(--ec-a-text-muted, #93a0b5)", marginBottom: 8 }}>
        EXPLORE MORE MODES
      </div>
      <div className="ec-mode-shelf">
        {PLAY_MODES.map((m) => {
          const action = resolveModeAction(m, tier, { from: "/play", previewCandidateActive });
          const active = m.id === activeModeId;
          const locked = action.status !== MODE_STATUS.AVAILABLE;
          return (
            <button key={m.id} onClick={() => onModeAction(action)} style={{
              textAlign: "left", minHeight: 76, padding: "11px 13px", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${active ? "var(--ec-a-gold-line)" : "var(--ec-a-border)"}`,
              background: active ? "var(--ec-a-gold-soft)" : "var(--ec-a-panel, #091321)",
              display: "grid", gap: 3,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span aria-hidden="true" style={{ fontSize: 16 }}>{m.icon}</span>
                <span style={{ fontWeight: 900, fontSize: 13, color: active ? "var(--ec-a-gold, #f2b51d)" : "var(--ec-a-text, #f5f7fb)" }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ec-a-text-muted, #93a0b5)", lineHeight: 1.45 }}>{m.tagline}</div>
              {(locked || active) && (
                <div style={{
                  fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, marginTop: 2,
                  color: active ? "var(--ec-a-green, #4ade80)" : "var(--ec-a-text-muted, #93a0b5)",
                }}>{active ? "PLAYING" : String(STATUS_LABEL[action.status] || "").toUpperCase()}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
