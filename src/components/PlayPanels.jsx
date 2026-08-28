// ── Play-screen side panels, matchup grid and feature strip ──────────────────
// Every figure here is real: the Daily countdown is the actual time to the next
// UTC rollover, the legend count is the actual card count, and the matchup grid
// renders the server's qualitative edges. Copy describes the possession
// simulation truthfully — AI writes recaps, it does not decide games.
import { useEffect, useState } from "react";
import { T, S, R, FONT } from "../theme.js";

// ── Ball IQ toggle (a draft setting, not a hero card) ───────────────────────
export function BallIqToggle({ on, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: T.textDim }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
      <span aria-hidden="true" style={{
        width: 34, height: 20, borderRadius: 999, padding: 2, boxSizing: "border-box",
        background: on ? T.gold : T.bgMuted, border: `1px solid ${on ? T.goldBorder : T.border}`,
        display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .2s",
      }}>
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: on ? "#fffdf8" : T.textMuted, display: "block" }} />
      </span>
      <span>Ball IQ<span className="sr-only"> mode — hide stats while drafting</span></span>
    </label>
  );
}

// ── The arena centre: the navy court between the two team panels ────────────
export function ArenaCentre({ children, compact }) {
  return (
    <div className="ec-arena-inset" style={{ padding: compact ? "18px 14px" : "26px 18px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginBottom: children ? 14 : 0 }}>
        <span style={{
          width: 62, height: 62, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${T.goldOnDark}55`, fontFamily: FONT.display, fontWeight: 900, fontStyle: "italic", fontSize: 22,
        }}>
          <span style={{ color: T.goldOnDark }}>E</span><span style={{ color: T.blueOnDark }}>C</span>
        </span>
        <span style={{ fontSize: 8.5, letterSpacing: 3, color: T.onArenaDim, fontWeight: 700 }}>ERACLASH</span>
        <span style={{
          fontSize: 34, fontWeight: 900, fontStyle: "italic", fontFamily: FONT.display, letterSpacing: -1, marginTop: 4,
          background: `linear-gradient(120deg, ${T.goldOnDark} 28%, #ffffff 50%, ${T.blueOnDark} 72%)`,
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>VS</span>
      </div>
      {children}
    </div>
  );
}

// ── Matchup preview grid (qualitative edges) ─────────────────────────────────
const EDGE_ICON = {
  Talent: "⭐", Construction: "🧩", Creation: "🎯", Spacing: "📐",
  Defense: "🛡️", Rebounding: "🏀", "Coach Fit": "📋", "Era Fit": "🕰️",
};
const CORE = ["Talent", "Construction", "Creation", "Spacing", "Defense", "Rebounding"];

export function MatchupGrid({ edges, keyClash, loading, placeholder, onArena }) {
  // On the navy court the same content uses arena ink and brighter team accents.
  const ink = onArena ? T.onArena : T.text;
  const inkDim = onArena ? T.onArenaDim : T.textDim;
  const goldC = onArena ? T.goldOnDark : T.gold;
  const blueC = onArena ? T.blueOnDark : T.blue;
  const surface = onArena ? "rgba(255,255,255,0.04)" : T.bgMuted;
  const line = onArena ? T.arenaBorder : T.border;
  if (placeholder) {
    return (
      <div style={{ padding: S.lg, borderRadius: R.lg, background: surface, border: `1px solid ${line}`, textAlign: "center" }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: goldC }}>MATCHUP PREVIEW</div>
        <div style={{ fontSize: 13, color: inkDim, margin: "8px 0 12px", lineHeight: 1.5 }}>
          Complete both teams to see what this matchup comes down to.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          {CORE.map((c) => (
            <span key={c} style={{ fontSize: 10, color: inkDim, textAlign: "center", width: 54 }}>
              <span aria-hidden="true" style={{ display: "block", fontSize: 16, opacity: 0.5 }}>{EDGE_ICON[c]}</span>{c}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const rows = (edges ?? []).filter((e) => CORE.includes(e.category));
  return (
    <div className="rise" style={{ padding: S.lg, borderRadius: R.lg, background: surface, border: `1px solid ${line}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: goldC, textAlign: "center", marginBottom: 10 }}>MATCHUP PREVIEW</div>
      {loading && <div style={{ fontSize: 13, color: inkDim, textAlign: "center" }}>Reading the matchup…</div>}
      {rows.length > 0 && (
        <div className="edge-grid">
          {rows.map((e) => (
            <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>{EDGE_ICON[e.category] ?? "•"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 11, color: inkDim, whiteSpace: "nowrap" }}>{e.category}</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
                  color: e.lead === "gold" ? goldC : e.lead === "blue" ? blueC : inkDim }}>
                  {e.lead === "even" ? "Even" : e.lead === "gold" ? "Gold Edge" : "Blue Edge"}{e.strong ? " ★" : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {keyClash && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${line}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 2, color: inkDim }}>KEY CLASH</div>
          <div style={{ fontSize: 13, color: ink, marginTop: 4, lineHeight: 1.55 }}>{keyClash}</div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: inkDim, textAlign: "center", marginTop: 8 }}>Run the sim to find out.</div>
    </div>
  );
}
