// ── EraClash design tokens ─────────────────────────────────────────────────────
// Two connected environments share these tokens:
//   • gameplay/arena (near-black, gold + blue, broadcast feel) — this file's T
//   • brand/editorial (warm cream) — reserved for marketing/legal surfaces
// Components must use tokens, not scattered hardcoded colors.
export const T = {
  // background.*
  bg: "#0b0e17",              // arena base
  bgCard: "#141a2a",          // card
  bgCardHover: "#1a2136",     // cardElevated
  bgPanel: "rgba(13,17,28,0.82)", // team panel over arena
  border: "#232c45",          // border.subtle
  // text.*
  text: "#e8eaf2",
  textDim: "#8a93ad",
  textMuted: "#5b647d",
  cream: "#f3ead8",
  // gold.* (Team Gold / brand accent)
  gold: "#fdb927",
  goldSoft: "rgba(253,185,39,0.14)",
  goldBorder: "rgba(253,185,39,0.45)",
  glowGold: "0 0 34px rgba(253,185,39,0.12)",
  // blue.* (Team Blue)
  blue: "#6ea8fe",
  blueSoft: "rgba(110,168,254,0.13)",
  blueBorder: "rgba(110,168,254,0.45)",
  glowBlue: "0 0 34px rgba(110,168,254,0.12)",
  // status
  green: "#2ecc71",
  red: "#e74c3c",
  orange: "#f39c12",
  // shadow
  shadowCard: "0 6px 24px rgba(0,0,0,0.35)",
};

export const card = { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px" };

// Team-flavored panel styling (Gold = warm, Blue = cool). Restrained: border +
// faint glow + accent typography, never flooded color.
export const teamPanel = (team) => ({
  background: T.bgPanel,
  border: `1px solid ${team === "blue" ? T.blueBorder : T.goldBorder}`,
  borderRadius: 14,
  boxShadow: team === "blue" ? T.glowBlue : T.glowGold,
  backdropFilter: "blur(2px)",
});
export const teamAccent = (team) => (team === "blue" ? T.blue : T.gold);

export const btnPrimary = {
  width: "100%", padding: 15, fontSize: 14, fontWeight: 800, border: "none",
  borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer",
};
export const btnSecondary = {
  padding: "11px 14px", fontSize: 13, fontWeight: 700, borderRadius: 9,
  border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
};
