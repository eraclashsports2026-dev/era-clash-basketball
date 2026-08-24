// ── STEP 2: COACH ──────────────────────────────────────────────────────────────
// Appears only after the roster is complete. Shows 3 roster-fit
// recommendations (server-computed), plus VIEW ALL 25 and RANDOM. No coach
// OVR exists anywhere — evaluation is contextual (fit for THIS roster/era).
import { useEffect, useState } from "react";
import { T, card, teamAccent } from "../theme.js";

export default function CoachSelect({ side, teamIds, eraStyleId, selected, onSelect, allCoaches }) {
  const accent = teamAccent(side);
  const [recommended, setRecommended] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    setRecommended(null);
    fetch("/api/v3meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goldIds: teamIds, eraStyleId: eraStyleId || undefined }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setRecommended(d.recommended); }).catch(() => {});
    return () => { alive = false; };
  }, [JSON.stringify(teamIds), eraStyleId]); // eslint-disable-line

  const pickRandom = () => {
    if (!allCoaches?.length) return;
    onSelect(allCoaches[Math.floor(Math.random() * allCoaches.length)]);
  };

  if (selected) {
    return (
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(0,0,0,0.3)", border: `1px solid ${accent}44` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: T.textDim }}>COACH</span>
          <span style={{ fontWeight: 900, fontStyle: "italic", fontSize: 15 }}>{selected.name}</span>
          <span style={{ fontSize: 10.5, color: T.textDim }}>{selected.span} · {selected.championships}× champ</span>
          <button onClick={() => onSelect(null)} aria-label={`Change ${side} coach`} style={{ marginLeft: "auto", background: "none", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>Change</button>
        </div>
        <div style={{ fontSize: 10.5, color: accent, letterSpacing: 1, fontWeight: 700, marginTop: 4, textTransform: "uppercase" }}>{selected.systemTags?.join(" · ")}</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: accent, marginBottom: 8 }}>SELECT YOUR COACH</div>
      {!recommended ? (
        <div style={{ fontSize: 12, color: T.textDim }}>Finding fits for this roster…</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, color: T.textDim }}>THREE DIFFERENT WAYS TO COACH THIS ROSTER</div>
          {recommended.map((c) => (
            <button key={c.id} onClick={() => onSelect(c)} style={{
              textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: T.bgCardHover, border: `1px solid ${T.border}`, color: T.text, minWidth: 0,
            }}>
              {c.angle && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.5, color: accent, marginBottom: 2 }}>{c.angle.toUpperCase()}</div>}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900, fontSize: 14 }}>{c.name}</span>
                <span style={{ fontSize: 10.5, color: T.textDim }}>{c.span} · {c.championships}× champ</span>
                <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: c.teamFit === "EXCELLENT" ? T.green : c.teamFit === "GOOD" ? "#9acd6a" : T.textDim }}>
                  FIT {c.teamFit}{c.eraFit ? ` · ERA ${c.eraFit}` : ""}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: accent, letterSpacing: 0.8, fontWeight: 700, textTransform: "uppercase", margin: "3px 0" }}>{c.systemTags?.join(" · ")}</div>
              <div style={{ fontSize: 11.5, color: T.text }}>✓ {c.whyItFits}</div>
              <div style={{ fontSize: 11, color: T.textDim }}>△ {c.concern}</div>
            </button>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowAll(true)} style={{ flex: 1, padding: 9, fontSize: 11.5, fontWeight: 700, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer" }}>VIEW ALL 25</button>
            <button onClick={pickRandom} style={{ flex: 1, padding: 9, fontSize: 11.5, fontWeight: 700, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, cursor: "pointer" }}>🔀 RANDOM COACH</button>
          </div>
        </div>
      )}

      {showAll && (
        <div role="dialog" aria-label="All coaches" onClick={() => setShowAll(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 620, maxHeight: "85vh", overflowY: "auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, fontStyle: "italic" }}>ALL 25 COACHES</h2>
              <button onClick={() => setShowAll(false)} aria-label="Close" style={{ marginLeft: "auto", border: `1px solid ${T.border}`, background: "transparent", color: T.textDim, borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {(allCoaches || []).map((c) => (
                <button key={c.id} onClick={() => { onSelect(c); setShowAll(false); }} style={{ textAlign: "left", padding: "9px 12px", borderRadius: 9, cursor: "pointer", background: T.bgCardHover, border: `1px solid ${T.border}`, color: T.text }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5 }}>{c.name}</span>
                  <span style={{ fontSize: 10.5, color: T.textDim, marginLeft: 8 }}>{c.span} · {c.championships}× champ · {c.systemTags?.join(", ")}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
