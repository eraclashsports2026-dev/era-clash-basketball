// ── Roster Balance — a construction guide, not an engine explanation ──────────
// Phase 7B replaces the "Team Chemistry 99" display. That number was a
// rescaled draft-guide multiplier from the legacy rating model; showing it as
// a headline implied it drives Candidate 3, which it does not. What IS real
// and useful is the qualitative construction read: what this five does well
// and what it trades away. Both come from analyzeBalance's named bonuses and
// gaps — the same source the old meter used, minus the misleading number.
import { T, S, R, teamAccent } from "../theme.js";
import { chemistryTags, chemistryScore } from "../chemistryView.js";

const BAND = (score) => (score == null ? null : score >= 80 ? "STRONG" : score >= 62 ? "BALANCED" : score >= 45 ? "UNEVEN" : "CONFLICTED");
const BAND_COLOR = { STRONG: T.green, BALANCED: T.green, UNEVEN: T.orange, CONFLICTED: T.red };

export default function RosterBalance({ team, side = "gold", compact }) {
  const filled = (team ?? []).filter(Boolean);
  const accent = teamAccent(side);
  const { strengths, concerns } = chemistryTags(team);
  const band = BAND(chemistryScore(team));

  if (filled.length < 5) {
    return (
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: R.md, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: T.textDim }}>ROSTER BALANCE</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
          Complete the five to see this roster's strengths and tradeoffs.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: R.md, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: T.textDim }}>ROSTER BALANCE</span>
        {band && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, letterSpacing: 1, color: BAND_COLOR[band] }}>{band}</span>}
      </div>
      {strengths?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.green }}>STRENGTHS</div>
          {strengths.slice(0, compact ? 3 : 5).map((s, i) => (
            <div key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
              • {s.label}{s.detail ? <span style={{ color: T.textDim }}> — {s.detail}</span> : null}
            </div>
          ))}
        </div>
      )}
      {concerns?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: T.orange }}>TRADEOFFS</div>
          {concerns.slice(0, compact ? 2 : 4).map((s, i) => (
            <div key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
              • {s.label}{s.detail ? <span style={{ color: T.textDim }}> — {s.detail}</span> : null}
            </div>
          ))}
        </div>
      )}
      {!strengths?.length && !concerns?.length && (
        <div style={{ fontSize: 13, color: T.textDim, marginTop: 6 }}>No standout strengths or gaps in this construction.</div>
      )}
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, lineHeight: 1.45 }}>
        A drafting guide — it describes the roster, it does not decide the game.
      </div>
    </div>
  );
}
