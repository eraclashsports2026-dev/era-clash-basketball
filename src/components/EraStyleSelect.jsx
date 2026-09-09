// ── ERA STYLE (per-team tab, shared game era) ──────────────────────────────────
// Rendered inside each team card's ERA STYLE tab. There is ONE era per game —
// the environment both teams play in — so selecting here sets the same era
// everywhere. No rule checkboxes, no sliders, and deliberately no "Gold +7"
// numbers: the dynamic note explains how THIS roster translates, nothing more.
import { useEffect, useState } from "react";
import { T, teamAccent } from "../theme.js";
import { v3meta } from "../v3meta.js";

export default function EraStyleSelect({ eras, selected, onSelect, teamIds, side = "gold" }) {
  const accent = teamAccent(side);
  const era = eras?.find((e) => e.id === selected);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let alive = true;
    setNote(null);
    if (!selected || !teamIds?.length) return;
    v3meta({ goldIds: teamIds, eraStyleId: selected })
      .then((j) => { if (alive) setNote(j?.eraNote || null); });
    return () => { alive = false; };
  }, [selected, JSON.stringify(teamIds)]); // eslint-disable-line

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: accent, marginBottom: 8 }}>CHOOSE YOUR ERA STYLE</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(eras || []).map((e) => (
          <button key={e.id} onClick={() => onSelect(e.id)} aria-pressed={selected === e.id} style={{
            padding: "8px 12px", fontSize: 13, fontWeight: 900, fontStyle: "italic", borderRadius: 9, cursor: "pointer", minHeight: 40, minWidth: 52,
            border: `1px solid ${selected === e.id ? accent : T.border}`,
            background: selected === e.id ? (side === "gold" ? T.goldSoft : T.blueSoft) : T.bgCardHover,
            color: selected === e.id ? accent : T.textDim,
          }}>{e.label}</button>
        ))}
      </div>

      {era && (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: T.bgCardHover, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{era.id} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 11 }}>(anchor {era.anchorSeason})</span></div>
          <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
            {era.styleSummary.map((s, i) => (
              <div key={i} style={{ fontSize: 11.5, color: T.textDim }}>· {s}</div>
            ))}
          </div>
          {note && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: T.textDim, marginBottom: 3 }}>HOW THIS AFFECTS THIS MATCHUP</div>
              <div style={{ fontSize: 11.5 }}><b style={{ color: accent }}>{side === "gold" ? "Gold" : "Blue"}:</b> {note}</div>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 10.5, color: T.textMuted }}>One era per game — both teams play in this environment.</div>
        </div>
      )}
    </div>
  );
}
