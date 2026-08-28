// ── Global header: brand, Play dropdown, primary nav, account ─────────────────
// Canonical layout from the ERAclashUI5 concept: Play carries a dropdown of
// game-mode cards; the other routes are plain nav. Every entry is a real
// route or a real mode — no dead navigation.
import { useEffect, useRef, useState } from "react";
import { T, S, R, Z, FONT } from "../theme.js";
import { getDisplayName } from "../identity.js";

const NAV = [
  ["Daily", "Daily"],
  ["Challenges", "Challenges"],
  ["Board", "Leaderboard"],
  ["Profile", "My EraClash"],
];

// Mode cards (Play dropdown). Copy comes from the product's own GAME_MODES —
// passed in — so the dropdown can never drift from what the app supports.
const MODE_ICONS = { Single: "🏀", Best7: "🏆", Win82: "🗓️", Tournament: "🏟️" };

function HowModesModal({ modes, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="How modes work" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: Z.modal, background: "rgba(4,6,12,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto",
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: S.xl }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: S.md }}>
          <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONT.display }}>How Modes Work</h2>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "none", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: R.sm, padding: "6px 12px", cursor: "pointer", minHeight: 40 }}>✕</button>
        </div>
        {modes.map(([id, label, sub]) => (
          <div key={id} style={{ padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>{MODE_ICONS[id]} {label}</div>
            <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 2 }}>{sub}</div>
            {id === "Single" && <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 4 }}>Build both fives, hire both coaches, pick one shared Era Style, run the sim.</div>}
            {id === "Best7" && <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 4 }}>Same setup as Single Game, played as a full series — first team to four wins.</div>}
            {(id === "Win82" || id === "Tournament") && <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 4 }}>You build Team Gold; the schedule generates every rival. Difficulty changes who you face, never how a game is simulated.</div>}
          </div>
        ))}
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: S.md }}>
          Games run on an era-aware basketball matchup simulation. Enhanced recaps are AI-written from the finished box score and are labeled where they appear.
        </div>
      </div>
    </div>
  );
}

export default function GameHeader({ nav, onNav, dailyStreak, modes = [], gameMode, onMode }) {
  const name = getDisplayName();
  const [open, setOpen] = useState(false);
  const [howModes, setHowModes] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      padding: "12px 20px", borderBottom: `1px solid ${T.border}`,
      background: "rgba(6,8,16,0.78)", backdropFilter: "blur(6px)",
      position: "sticky", top: 0, zIndex: Z.header,
    }}>
      <button onClick={() => onNav("Play")} aria-label="EraClash Basketball home" style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontSize: 19, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, color: T.text,
        fontFamily: FONT.display,
      }}>
        ERA<span style={{ color: T.gold }}>CLASH</span>
        <span style={{ fontFamily: FONT.ui, fontStyle: "normal", fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.textDim, marginLeft: 8 }}>BASKETBALL</span>
      </button>

      <nav aria-label="Main" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 4, alignItems: "center" }}>
        {/* Play — dropdown of game modes (canonical panel B) */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => { if (nav !== "Play") onNav("Play"); setOpen((o) => !o); }}
            aria-haspopup="menu" aria-expanded={open} aria-current={nav === "Play" ? "page" : undefined} style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 800, borderRadius: R.sm, cursor: "pointer", minHeight: 40,
              border: `1px solid ${nav === "Play" ? T.goldBorder : T.border}`,
              background: nav === "Play" ? T.goldSoft : "transparent",
              color: nav === "Play" ? T.gold : T.textDim,
            }}>Play <span aria-hidden="true" style={{ fontSize: 10 }}>▾</span></button>
          {open && (
            <div role="menu" aria-label="Game modes" style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: Z.dropdown,
              width: 300, padding: S.sm, borderRadius: R.lg,
              background: "rgba(10,13,22,0.98)", border: `1px solid ${T.border}`, boxShadow: T.shadowCard }}>
              {modes.map(([id, label, sub]) => (
                <button key={id} role="menuitemradio" aria-checked={gameMode === id}
                  onClick={() => { onMode(id); setOpen(false); }} style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    padding: "12px 14px", marginBottom: 4, borderRadius: R.md, cursor: "pointer", minHeight: 56,
                    border: `1px solid ${gameMode === id ? T.goldBorder : T.border}`,
                    background: gameMode === id ? T.goldSoft : "rgba(0,0,0,0.25)", color: T.text,
                  }}>
                  <span aria-hidden="true" style={{ fontSize: 20 }}>{MODE_ICONS[id]}</span>
                  <span>
                    <span style={{ display: "block", fontWeight: 900, fontSize: 13, letterSpacing: 0.5, color: gameMode === id ? T.gold : T.text }}>{label}</span>
                    <span style={{ display: "block", fontSize: 11, color: T.textDim }}>{sub}</span>
                  </span>
                </button>
              ))}
              <button role="menuitem" onClick={() => { setHowModes(true); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                padding: "10px 14px", borderRadius: R.md, cursor: "pointer", minHeight: 48,
                border: `1px solid ${T.border}`, background: "transparent", color: T.textDim }}>
                <span aria-hidden="true" style={{ fontSize: 16 }}>ℹ️</span>
                <span>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 12.5 }}>How Modes Work</span>
                  <span style={{ display: "block", fontSize: 11 }}>Learn more about each mode.</span>
                </span>
              </button>
            </div>
          )}
        </div>
        {NAV.map(([id, label]) => (
          <button key={id} onClick={() => onNav(id)} aria-current={nav === id ? "page" : undefined} style={{
            padding: "8px 12px", fontSize: 13, fontWeight: 700, borderRadius: R.sm, cursor: "pointer",
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
      {howModes && <HowModesModal modes={modes} onClose={() => setHowModes(false)} />}
    </header>
  );
}
