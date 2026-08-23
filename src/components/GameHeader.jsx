// ── Compact persistent game header ─────────────────────────────────────────────
// Wordmark + primary nav + streak + career identity. Replaces the tall hero
// banner; the game owns the viewport now.
import { T } from "../theme.js";
import { getDisplayName } from "../identity.js";

const NAV = [
  ["Play", "Play"],
  ["Daily", "Daily"],
  ["Challenges", "Challenges"],
  ["Board", "Leaderboard"],
  ["Profile", "My EraClash"],
];

export default function GameHeader({ nav, onNav, dailyStreak }) {
  const name = getDisplayName();
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      padding: "12px 20px", borderBottom: `1px solid ${T.border}`,
      background: "rgba(6,8,16,0.75)", backdropFilter: "blur(6px)",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <button onClick={() => onNav("Play")} aria-label="EraClash Basketball home" style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontSize: 19, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, color: T.text,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}>
        ERA<span style={{ color: T.gold }}>CLASH</span>
        <span style={{ fontFamily: "inherit", fontStyle: "normal", fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.textDim, marginLeft: 8 }}>BASKETBALL</span>
      </button>

      <nav aria-label="Main" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 6 }}>
        {NAV.map(([id, label]) => (
          <button key={id} onClick={() => onNav(id)} aria-current={nav === id ? "page" : undefined} style={{
            padding: "8px 12px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer",
            border: "none", background: "transparent",
            color: nav === id ? T.gold : T.textDim,
            boxShadow: nav === id ? `inset 0 -2px 0 ${T.gold}` : "none",
            minHeight: 40,
          }}>{label}</button>
        ))}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {dailyStreak > 0 && (
          <span style={{ fontSize: 12, fontWeight: 800, color: T.gold, letterSpacing: 1 }}>
            🔥 {dailyStreak} DAY STREAK
          </span>
        )}
        <button onClick={() => onNav("Profile")} style={{
          padding: "8px 16px", fontSize: 12.5, fontWeight: 800, borderRadius: 9, cursor: "pointer",
          border: `1px solid ${name ? T.border : T.gold}`,
          background: name ? "transparent" : T.gold,
          color: name ? T.text : "#111", minHeight: 40,
        }}>
          {name ? `👤 ${name}` : "💾 Save Career"}
        </button>
      </div>
    </header>
  );
}
