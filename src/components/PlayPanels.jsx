// ── Play-screen side panels, matchup grid and feature strip ──────────────────
// Every figure here is real: the Daily countdown is the actual time to the next
// UTC rollover, the legend count is the actual card count, and the matchup grid
// renders the server's qualitative edges. Copy describes the possession
// simulation truthfully — AI writes recaps, it does not decide games.
import { useEffect, useState } from "react";
import { T, S, R, FONT } from "../theme.js";
import { PLAYERS } from "../players.js";

// ── Daily Clash card ────────────────────────────────────────────────────────
const msToNextUtcMidnight = () => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next - now.getTime());
};
const hhmmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0")).join(":");
};

export function DailyClashCard({ done, onPlay }) {
  const [left, setLeft] = useState(msToNextUtcMidnight);
  useEffect(() => {
    const t = setInterval(() => setLeft(msToNextUtcMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <aside style={{ padding: S.md, borderRadius: R.lg, background: "rgba(13,17,28,0.78)", border: `1px solid ${T.goldBorder}`, minWidth: 210 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: T.gold }}>🏆 DAILY CLASH</div>
      <div style={{ fontSize: 12, color: T.textDim, margin: "4px 0 10px" }}>
        {done ? "Today's attempt is done" : "Today's challenge is live"}
      </div>
      <button onClick={onPlay} style={{
        width: "100%", padding: "10px 14px", fontSize: 12.5, fontWeight: 800, borderRadius: R.sm, cursor: "pointer",
        minHeight: 44, border: "none", background: done ? "transparent" : T.gold, color: done ? T.gold : "#111",
        boxShadow: done ? `inset 0 0 0 1px ${T.goldBorder}` : "none",
      }}>{done ? "See today's board →" : "Play Today's Challenge →"}</button>
      <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 8 }}>
        🕐 Next challenge in <b style={{ color: T.textDim, fontVariantNumeric: "tabular-nums" }}>{hhmmss(left)}</b>
      </div>
    </aside>
  );
}

// ── Ball IQ card ────────────────────────────────────────────────────────────
export function BallIqCard({ on, onChange }) {
  return (
    <aside style={{ padding: S.md, borderRadius: R.lg, background: "rgba(13,17,28,0.78)", border: `1px solid ${T.border}`, minWidth: 210 }}>
      <label style={{ display: "block", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: T.text }}>
          <span aria-hidden="true">🙈</span> BALL IQ MODE
        </span>
        <span style={{ display: "block", fontSize: 12, color: T.textDim, margin: "4px 0 10px" }}>Stats hidden during draft</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
          <span aria-hidden="true" style={{
            width: 42, height: 24, borderRadius: 999, padding: 3, boxSizing: "border-box",
            background: on ? T.gold : "rgba(255,255,255,0.12)", border: `1px solid ${on ? T.gold : T.border}`,
            display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .2s",
          }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: on ? "#111" : T.textDim, display: "block" }} />
          </span>
          <span style={{ fontSize: 11, color: T.textDim }}>Test your basketball IQ</span>
        </span>
      </label>
    </aside>
  );
}

// ── Matchup preview grid (qualitative edges) ─────────────────────────────────
const EDGE_ICON = {
  Talent: "⭐", Construction: "🧩", Creation: "🎯", Spacing: "📐",
  Defense: "🛡️", Rebounding: "🏀", "Coach Fit": "📋", "Era Fit": "🕰️",
};
const CORE = ["Talent", "Construction", "Creation", "Spacing", "Defense", "Rebounding"];

export function MatchupGrid({ edges, keyClash, loading, placeholder }) {
  if (placeholder) {
    return (
      <div style={{ padding: S.lg, borderRadius: R.lg, background: "rgba(0,0,0,0.42)", border: `1px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: T.gold }}>MATCHUP PREVIEW</div>
        <div style={{ fontSize: 12, color: T.textDim, margin: "8px 0 12px", lineHeight: 1.5 }}>
          Complete both teams to see what this matchup comes down to.
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          {CORE.map((c) => (
            <span key={c} style={{ fontSize: 9.5, color: T.textMuted, textAlign: "center", width: 54 }}>
              <span aria-hidden="true" style={{ display: "block", fontSize: 16, opacity: 0.5 }}>{EDGE_ICON[c]}</span>{c}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const rows = (edges ?? []).filter((e) => CORE.includes(e.category));
  return (
    <div className="rise" style={{ padding: S.lg, borderRadius: R.lg, background: "rgba(0,0,0,0.42)", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: T.gold, textAlign: "center", marginBottom: 10 }}>MATCHUP PREVIEW</div>
      {loading && <div style={{ fontSize: 12, color: T.textDim, textAlign: "center" }}>Reading the matchup…</div>}
      {rows.length > 0 && (
        <div className="edge-grid">
          {rows.map((e) => (
            <div key={e.category} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>{EDGE_ICON[e.category] ?? "•"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 10.5, color: T.textDim, whiteSpace: "nowrap" }}>{e.category}</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
                  color: e.lead === "gold" ? T.gold : e.lead === "blue" ? T.blue : T.textMuted }}>
                  {e.lead === "even" ? "Even" : e.lead === "gold" ? "Gold Edge" : "Blue Edge"}{e.strong ? " ★" : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {keyClash && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 2, color: T.textDim }}>KEY CLASH</div>
          <div style={{ fontSize: 12, color: T.text, marginTop: 4, lineHeight: 1.55 }}>{keyClash}</div>
        </div>
      )}
      <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginTop: 8 }}>Run the sim to find out.</div>
    </div>
  );
}

// ── Feature strip ───────────────────────────────────────────────────────────
// Real claims only: the legend count is counted, and the simulation line does
// not pretend AI decides outcomes.
export function FeatureStrip() {
  const items = [
    ["👥", `${PLAYERS.length}+ LEGENDS`, "From every era of NBA history"],
    ["⭐", "SMART RATING SYSTEM", "Position weightings, archetypes and era adjusted"],
    ["🧪", "TEAM CHEMISTRY", "Build synergy. Unlock bonuses. Avoid weaknesses."],
    ["🏀", "POSSESSION SIMULATION", "Era-aware matchups. Box scores. MVPs. Game stories."],
    ["🔗", "SHARE & CHALLENGE", "Challenge friends. Share results. Climb the leaderboard."],
  ];
  return (
    <div className="feature-strip" style={{ marginTop: S.xl, padding: S.lg, borderRadius: R.lg, background: "rgba(0,0,0,0.3)", border: `1px solid ${T.border}` }}>
      {items.map(([icon, title, sub]) => (
        <div key={title} style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 10.5, fontWeight: 900, letterSpacing: 1, color: T.gold }}>{title}</span>
            <span style={{ display: "block", fontSize: 10.5, color: T.textDim, lineHeight: 1.4 }}>{sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
