// ── Simulation loading — the arena holds its breath ───────────────────────────
// Continues the dark arena (never the old cream page). Stages are REAL: they
// come from simClient's onStage callback tied to actual request lifecycle, or
// from genuine progress (Win 82 game counts). No fake timed stages.
import { T } from "../theme.js";

export default function SimulationLoading({ stage, progress, goldLabel = "TEAM GOLD", blueLabel = "TEAM BLUE" }) {
  return (
    <div className="rise" role="status" aria-live="polite" style={{
      marginTop: 14, padding: "28px 20px", borderRadius: 14, textAlign: "center",
      background: "linear-gradient(180deg, rgba(6,8,16,0.9), rgba(13,17,28,0.85))",
      border: `1px solid ${T.border}`, boxShadow: T.shadowCard,
    }}>
      <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, fontWeight: 800 }}>
        ERA<span style={{ color: T.gold }}>CLASH</span> · SIMULATION IN PROGRESS
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, margin: "16px 0 14px" }}>
        <span style={{ fontSize: 15, fontWeight: 900, fontStyle: "italic", color: T.gold, letterSpacing: 1 }}>{goldLabel}</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: T.textDim }}>vs</span>
        <span style={{ fontSize: 15, fontWeight: 900, fontStyle: "italic", color: T.blue, letterSpacing: 1 }}>{blueLabel}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div className="sim-spinner" aria-hidden="true" />
      </div>
      <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
        {progress?.label ? `${progress.label} — ` : ""}
        {stage || "Analyzing the matchup…"}
        {progress ? ` (${progress.unit || "game"} ${progress.done}/${progress.total})` : ""}
      </div>
      {progress && (
        <div style={{ maxWidth: 420, margin: "12px auto 0" }}>
          <div style={{ height: 7, background: T.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: `linear-gradient(90deg, ${T.gold}, #ffd76a)`, transition: "width .3s" }} />
          </div>
          <div style={{ fontSize: 12, color: T.gold, marginTop: 8, fontWeight: 800 }}>{progress.wins} wins so far</div>
        </div>
      )}
    </div>
  );
}
