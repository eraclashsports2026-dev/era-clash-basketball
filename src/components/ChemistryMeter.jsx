// ── Team Chemistry meter ───────────────────────────────────────────────────────
// Live chemistry readout inside each team panel: 0–100 score (a rescaling of
// the real analyzeBalance multiplier — see chemistryView.js), meter bar, and
// named strengths/concerns. Pulses when the score changes so every pick
// visibly moves the team.
import { useEffect, useRef, useState } from "react";
import { T, teamAccent } from "../theme.js";
import { chemistryScore, chemistryLabel, chemistryTags } from "../chemistryView.js";

export default function ChemistryMeter({ team, side = "gold", compact }) {
  const score = chemistryScore(team);
  const { strengths, concerns } = chemistryTags(team);
  const accent = teamAccent(side);
  const prev = useRef(score);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (score !== prev.current && score != null && prev.current != null) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 550);
      return () => clearTimeout(t);
    }
    prev.current = score;
  }, [score]);
  useEffect(() => { prev.current = score; }, [score]);

  const filled = score == null ? 0 : Math.round((score / 100) * 10);
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>TEAM CHEMISTRY</span>
        <span className={pulse ? "chem-pulse" : undefined} style={{ marginLeft: "auto", fontSize: 20, fontWeight: 900, fontStyle: "italic", color: score == null ? T.textDim : accent, display: "inline-block" }}>
          {score == null ? "––" : score}
        </span>
        {score != null && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: score >= 75 ? T.green : score >= 60 ? T.orange : T.red }}>{chemistryLabel(score)}</span>}
      </div>
      <div aria-hidden="true" style={{ display: "flex", gap: 3, marginTop: 8 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < filled ? accent : T.border, opacity: i < filled ? 0.95 : 0.6, transition: "background .3s" }} />
        ))}
      </div>
      {score == null ? (
        <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 8 }}>Add players to build chemistry</div>
      ) : compact ? null : (
        <div style={{ marginTop: 8 }}>
          {strengths.map((b, i) => (
            <div key={`s${i}`} className="rise" style={{ fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ color: T.green, fontWeight: 700 }}>+ {b.label}</span>
              <span style={{ color: T.textMuted }}> — {b.detail}</span>
            </div>
          ))}
          {concerns.map((g, i) => (
            <div key={`c${i}`} className="rise" style={{ fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ color: T.red, fontWeight: 700 }}>− {g.label}</span>
              <span style={{ color: T.textMuted }}> — {g.detail}</span>
            </div>
          ))}
          {strengths.length === 0 && concerns.length === 0 && (
            <div style={{ fontSize: 11.5, color: T.textDim }}>Solid squad — no standout strengths or weaknesses.</div>
          )}
        </div>
      )}
    </div>
  );
}
