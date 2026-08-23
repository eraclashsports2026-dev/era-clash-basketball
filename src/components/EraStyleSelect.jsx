// ── STEP 3: ERA STYLE ──────────────────────────────────────────────────────────
// One shared decade selector for the game — the ENVIRONMENT both teams play
// in. No rule checkboxes, no sliders, and deliberately no "Gold +7" numbers:
// the dynamic notes explain how each roster translates, nothing more.
import { useEffect, useState } from "react";
import { T } from "../theme.js";

export default function EraStyleSelect({ eras, selected, onSelect, goldIds, blueIds }) {
  const era = eras?.find((e) => e.id === selected);
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    let alive = true;
    setNotes(null);
    if (!selected || !goldIds || !blueIds) return;
    Promise.all([
      fetch("/api/v3meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goldIds, eraStyleId: selected }) }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v3meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goldIds: blueIds, eraStyleId: selected }) }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([g, b]) => { if (alive) setNotes({ gold: g?.eraNote, blue: b?.eraNote }); }).catch(() => {});
    return () => { alive = false; };
  }, [selected, JSON.stringify(goldIds), JSON.stringify(blueIds)]); // eslint-disable-line

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.gold, marginBottom: 10 }}>CHOOSE YOUR ERA STYLE</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {(eras || []).map((e) => (
          <button key={e.id} onClick={() => onSelect(e.id)} aria-pressed={selected === e.id} style={{
            padding: "10px 16px", fontSize: 14, fontWeight: 900, fontStyle: "italic", borderRadius: 10, cursor: "pointer", minHeight: 44, minWidth: 56,
            border: `1px solid ${selected === e.id ? T.gold : T.border}`,
            background: selected === e.id ? "rgba(253,185,39,0.14)" : "rgba(0,0,0,0.25)",
            color: selected === e.id ? T.gold : T.textDim,
          }}>{e.label}</button>
        ))}
      </div>

      {era && (
        <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(0,0,0,0.3)", border: `1px solid ${T.border}`, textAlign: "left" }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 6 }}>{era.id} <span style={{ color: T.textDim, fontWeight: 400, fontSize: 11 }}>(anchor {era.anchorSeason})</span></div>
          <div style={{ display: "grid", gap: 2 }}>
            {era.styleSummary.map((s, i) => (
              <div key={i} style={{ fontSize: 11.5, color: T.textDim }}>· {s}</div>
            ))}
          </div>
          {(notes?.gold || notes?.blue) && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: T.textDim, marginBottom: 4 }}>HOW THIS AFFECTS THIS MATCHUP</div>
              {notes.gold && <div style={{ fontSize: 11.5, marginBottom: 3 }}><b style={{ color: T.gold }}>Gold:</b> {notes.gold}</div>}
              {notes.blue && <div style={{ fontSize: 11.5 }}><b style={{ color: T.blue }}>Blue:</b> {notes.blue}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
