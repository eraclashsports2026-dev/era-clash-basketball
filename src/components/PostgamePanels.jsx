// ── Postgame panels: chemistry dial, key moments, period scores ───────────────
// All three render only real result data. Key moments come from the possession
// ledger (see api/_lib/previewKeyMoments.js) and are labeled by PERIOD, not by
// an invented game clock — the engine records possessions, not a wall clock.
import { T, S, R, FONT, teamAccent } from "../theme.js";

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
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.45 }}>
        Discrete events from the simulated possessions. The engine records periods and possessions, not a game clock.
      </div>
    </div>
  );
}

// ── Matchup patterns (game-long behaviour, never mixed with moments) ────────
const PATTERN_ICON = { MISMATCH: "🎛️", MOVEMENT: "🔄", GLASS: "🪟", TARGET: "🎯" };

export function MatchupPatterns({ patterns }) {
  if (!patterns?.length) return null;
  return (
    <div style={{ ...cardish(), padding: S.lg }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: T.textDim, marginBottom: 8 }}>MATCHUP PATTERNS</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {patterns.map((m, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5 }}>
            <span aria-hidden="true" style={{ flexShrink: 0 }}>{PATTERN_ICON[m.kind] ?? "•"}</span>
            <span style={{ color: T.text, minWidth: 0 }}>{m.text}</span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.45 }}>
        Repeated behaviour counted across the whole game — not single plays.
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
