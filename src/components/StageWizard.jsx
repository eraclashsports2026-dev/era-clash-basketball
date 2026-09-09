// ── Play stage wizard — 1 ROSTERS → 2 COACHES → 3 ERA STYLE ───────────────────
// The canonical three-chip stepper. Completed stages are clickable (back
// navigation preserves every selection); the current stage glows gold; future
// stages wait. Screen readers get the live stage announcement.
import { T, stageChip, FONT } from "../theme.js";

const STAGES = [
  ["ROSTERS", "1", "ROSTERS", "Build both teams"],
  ["COACHES", "2", "COACHES", "Choose your coaches"],
  ["ERA", "3", "ERA STYLE", "Select era environment"],
];

export default function StageWizard({ stage, done, onJump }) {
  // `done` = {ROSTERS: bool, COACHES: bool, ERA: bool}
  return (
    <nav aria-label="Play setup progress" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", padding: "14px 8px 6px" }}>
      <span aria-live="polite" className="sr-only">
        {stage === "READY" ? "All selections complete — ready to run the sim" : `Current step: ${STAGES.find(([id]) => id === stage)?.[2] ?? stage}`}
      </span>
      {STAGES.map(([id, n, label, sub], i) => {
        const isDone = done[id];
        const isActive = stage === id;
        const state = isActive ? "active" : isDone ? "done" : "todo";
        const clickable = isDone || isActive;
        return (
          <span key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={clickable ? () => onJump(id) : undefined} disabled={!clickable}
              aria-current={isActive ? "step" : undefined} style={{ ...stageChip(state), cursor: clickable ? "pointer" : "default", font: "inherit" }}>
              <span aria-hidden="true" style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 900,
                background: isActive ? T.gold : isDone ? "rgba(46,204,113,0.15)" : "rgba(255,255,255,0.06)",
                color: isActive ? "#fffdf8" : "inherit",
              }}>{isDone && !isActive ? "✓" : n}</span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 900, letterSpacing: 1.5, fontFamily: FONT.ui }}>{label}</span>
                <span style={{ display: "block", fontSize: 10, opacity: 0.85 }}>{sub}</span>
              </span>
            </button>
            {i < STAGES.length - 1 && <span aria-hidden="true" style={{ color: T.textMuted }}>→</span>}
          </span>
        );
      })}
    </nav>
  );
}
