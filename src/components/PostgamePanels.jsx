// ── Postgame panels: chemistry dial, key moments, period scores ───────────────
// All three render only real result data. Key moments come from the possession
// ledger (see api/_lib/previewKeyMoments.js) and are labeled by PERIOD, not by
// an invented game clock — the engine records possessions, not a wall clock.
import { T, S, R, FONT, teamAccent } from "../theme.js";
import { chemistryScore, chemistryLabel } from "../chemistryView.js";

// ── Circular chemistry dial (concept: CHEMISTRY SCORE) ──────────────────────
export function ChemistryDial({ team, label = "CHEMISTRY SCORE", side = "gold", size = 104 }) {
  const score = chemistryScore(team);
  if (score == null) return null;
  const accent = teamAccent(side);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>{label}</div>
      <svg width={size} height={size} role="img" aria-label={`${label} ${score} of 100, ${chemistryLabel(score)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.border} strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: FONT.display, fontSize: size * 0.28, fontWeight: 900, fontStyle: "italic", fill: accent }}>{score}</text>
        <text x="50%" y="68%" textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, fill: score >= 75 ? T.green : score >= 60 ? T.orange : T.red }}>
          {chemistryLabel(score)}
        </text>
      </svg>
    </div>
  );
}

// ── Key moments (real, ledger-derived) ──────────────────────────────────────
const KIND_ICON = { RUN: "🔥", LEAD_CHANGE: "🔀", SHOT: "🎯", MISMATCH: "🎛️" };

export function KeyMoments({ moments }) {
  if (!moments?.length) return null;
  return (
    <div style={{ ...cardish(), padding: S.lg }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>KEY MOMENTS</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {moments.map((m, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5 }}>
            <span aria-hidden="true" style={{ flexShrink: 0 }}>{KIND_ICON[m.kind] ?? "•"}</span>
            <span style={{
              flexShrink: 0, minWidth: 38, fontSize: 10, fontWeight: 900, letterSpacing: 1,
              color: m.side === "blue" ? T.blue : T.gold, paddingTop: 1,
            }}>{m.period}</span>
            <span style={{ color: T.text, minWidth: 0 }}>{m.text}</span>
          </li>
        ))}
      </ol>
      <div style={{ fontSize: 9.5, color: T.textMuted, marginTop: 8 }}>
        Drawn from the simulated possessions. The engine records periods and possessions, not a game clock.
      </div>
    </div>
  );
}

// ── Period scores ───────────────────────────────────────────────────────────
export function PeriodScores({ periods }) {
  if (!periods?.length) return null;
  const label = (p, i) => (i < 4 ? `Q${p}` : periods.length === 5 ? "OT" : `OT${i - 3}`);
  return (
    <div style={{ ...cardish(), padding: S.lg, overflowX: "auto" }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>BY PERIOD</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 280 }}>
        <thead>
          <tr style={{ color: T.textDim }}>
            <th style={{ textAlign: "left", padding: "3px 6px", fontSize: 10 }}>TEAM</th>
            {periods.map((p, i) => <th key={i} style={{ padding: "3px 6px", fontSize: 10 }}>{label(p.period, i)}</th>)}
            <th style={{ padding: "3px 6px", fontSize: 10 }}>T</th>
          </tr>
        </thead>
        <tbody>
          {[["GOLD", "gold", T.gold], ["BLUE", "blue", T.blue]].map(([name, key, color]) => (
            <tr key={key} style={{ borderTop: `1px solid ${T.border}` }}>
              <td style={{ textAlign: "left", padding: "5px 6px", fontWeight: 900, fontSize: 10.5, letterSpacing: 1, color }}>{name}</td>
              {periods.map((p, i) => <td key={i} style={{ padding: "5px 6px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{p[key]}</td>)}
              <td style={{ padding: "5px 6px", textAlign: "center", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
                {periods.reduce((s, p) => s + p[key], 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cardish() {
  return { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.lg };
}
