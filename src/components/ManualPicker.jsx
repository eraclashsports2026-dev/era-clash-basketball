// ── Manual draft picker ────────────────────────────────────────────────────────
// Slot-scoped player browser for Manual Draft: search by name, filtered to
// players eligible for the slot position, sorted by slot OVR. Uses the same
// database and rating logic as everything else.
import { useMemo, useState } from "react";
import { PLAYERS, DECADE_COLORS, ERAS } from "../players.js";
import { displayOVR, slotRating } from "../rating.js";
import { playerArchetypes } from "../attributes.js";
import { T, card } from "../theme.js";
import PlayerImage from "./PlayerImage.jsx";

export default function ManualPicker({ slotPos, excludeIds = [], onPick, onClose }) {
  const [q, setQ] = useState("");
  const [era, setEra] = useState("");

  const list = useMemo(() => {
    let pool = PLAYERS.filter((p) => p.positions.includes(slotPos) && !excludeIds.includes(p.id));
    if (era) pool = pool.filter((p) => p.decade === era);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      pool = pool.filter((p) => p.name.toLowerCase().includes(needle));
    }
    return pool.sort((a, b) => slotRating(b, slotPos) - slotRating(a, slotPos)).slice(0, 60);
  }, [q, era, slotPos, excludeIds]);

  return (
    <div role="dialog" aria-label={`Choose ${slotPos}`} onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, fontStyle: "italic" }}>
            CHOOSE YOUR <span style={{ color: T.gold }}>{slotPos}</span>
          </h2>
          <button onClick={onClose} aria-label="Close picker" style={{ marginLeft: "auto", border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search legends…" aria-label="Search players"
              style={{ flex: 1, padding: "9px 12px", fontSize: 13, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, minWidth: 0 }} />
            <select value={era} onChange={(e) => setEra(e.target.value)} aria-label="Filter by era"
              style={{ padding: "9px 10px", fontSize: 12.5, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <option value="">All eras</option>
              {ERAS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 10, display: "grid", gap: 6 }}>
          {list.map((p) => (
            <button key={p.id} onClick={() => onPick(p)} style={{
              display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 10px",
              background: T.bgCardHover, border: `1px solid ${T.border}`, borderRadius: 9, cursor: "pointer", color: T.text,
            }}>
              <PlayerImage player={p} variant="thumbnail" team="gold" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {p.name} <span style={{ color: DECADE_COLORS[p.decade], fontSize: 11, fontWeight: 700 }}>{p.decade}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.team} · {p.pts} PTS {p.reb} REB {p.ast} AST
                  {playerArchetypes(p.id).length > 0 && <span style={{ color: T.gold }}> · {playerArchetypes(p.id)[0]}</span>}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: T.gold }}>{displayOVR(p, slotPos)}</div>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 13 }}>No players match.</div>}
        </div>
      </div>
    </div>
  );
}
