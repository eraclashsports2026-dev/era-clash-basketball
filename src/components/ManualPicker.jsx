// ── Manual draft picker ────────────────────────────────────────────────────────
// Player browser for Manual Draft, in two shapes:
//   • slot-first (slotPos given): players eligible for that slot, by slot OVR —
//     the original flow, still the fastest way to fill a named hole;
//   • player-first (slotPos null, Phase 9A): every player, by primary-slot OVR,
//     each row showing ALL eligible positions; picking one hands the player to
//     the placement flow, which highlights the legal slots on the grid.
// Uses the same database and rating logic as everything else.
import { useMemo, useState } from "react";
import { PLAYERS, DECADE_COLORS, ERAS, findCard } from "../players.js";
import { displayOVR, slotRating } from "../rating.js";
import { playerArchetypes } from "../attributes.js";
import { T, card } from "../theme.js";
import { eligibleLabel } from "../lineupPlacement.js";
import PlayerImage from "./PlayerImage.jsx";

export default function ManualPicker({ slotPos = null, excludeIds = [], onPick, onClose, title }) {
  const [q, setQ] = useState("");
  const [era, setEra] = useState("");
  const [posFilter, setPosFilter] = useState("");

  const list = useMemo(() => {
    // one PERSON per lineup: exclude every decade-entry of already-picked players
    const excludeNames = new Set(excludeIds.map((id) => findCard(id)?.name).filter(Boolean));
    let pool = PLAYERS.filter((p) => !excludeIds.includes(p.id) && !excludeNames.has(p.name));
    if (slotPos) pool = pool.filter((p) => p.positions.includes(slotPos));
    else if (posFilter) pool = pool.filter((p) => p.positions.includes(posFilter));
    if (era) pool = pool.filter((p) => p.decade === era);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      pool = pool.filter((p) => p.name.toLowerCase().includes(needle));
    }
    const rate = (p) => slotRating(p, slotPos || p.pos);
    return pool.sort((a, b) => rate(b) - rate(a)).slice(0, 60);
  }, [q, era, slotPos, posFilter, excludeIds]);

  return (
    <div role="dialog" aria-label={slotPos ? `Choose ${slotPos}` : (title || "Choose a player")} onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(12,22,39,0.55)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, fontStyle: "italic" }}>
            {slotPos ? <>CHOOSE YOUR <span style={{ color: T.gold }}>{slotPos}</span></> : <>CHOOSE A <span style={{ color: T.gold }}>PLAYER</span></>}
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
            {!slotPos && (
              <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} aria-label="Filter by eligible position"
                style={{ padding: "9px 10px", fontSize: 12.5, background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <option value="">Any position</option>
                {["PG", "SG", "SF", "PF", "C"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
          {!slotPos && (
            <div style={{ width: "100%", fontSize: 11.5, color: T.textDim }}>
              Pick a player, then choose one of the positions they are eligible for. A player with one legal position is placed for you.
            </div>
          )}
        </div>
        <div style={{ overflowY: "auto", padding: 10, display: "grid", gap: 6 }}>
          {list.map((p) => (
            <button key={p.id} onClick={() => onPick(p)} data-player={p.id}
              aria-label={`${p.name}, ${p.decade}, ${p.team}. Eligible: ${eligibleLabel(p)}. ${displayOVR(p, slotPos || p.pos)} overall`}
              style={{
              display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 10px", minHeight: 56,
              background: T.bgCardHover, border: `1px solid ${T.border}`, borderRadius: 9, cursor: "pointer", color: T.text,
            }}>
              <PlayerImage player={p} variant="thumbnail" team="gold" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span>{p.name} <span style={{ color: DECADE_COLORS[p.decade], fontSize: 11, fontWeight: 700 }}>{p.decade}</span></span>
                  <span className="ec-elig" style={{ color: T.gold, marginTop: 0 }} aria-hidden="true">{eligibleLabel(p)}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.team} · {p.pts} PTS {p.reb} REB {p.ast} AST
                  {playerArchetypes(p.id).length > 0 && <span style={{ color: T.gold }}> · {playerArchetypes(p.id)[0]}</span>}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: T.gold }}>{displayOVR(p, slotPos || p.pos)}</div>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 13 }}>No players match.</div>}
        </div>
      </div>
    </div>
  );
}
