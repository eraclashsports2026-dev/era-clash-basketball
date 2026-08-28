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

// ── Phase 7A design-system extensions ─────────────────────────────────────────
// Layout, motion and typography tokens for the rebuilt Play flow. Values are
// derived from the canonical UI concept (ERAclashUI5) mapped onto the existing
// palette above — components consume tokens, never magic numbers.
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 };            // spacing
export const R = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 };                 // radii
export const Z = { header: 40, dropdown: 50, modal: 60, toast: 70 };           // layers
export const DUR = { fast: 120, base: 200, slow: 400, reveal: 700 };           // ms
export const BP = { mobile: 640, tablet: 900, desktop: 1200 };                 // px
export const FONT = {
  display: "Georgia, 'Times New Roman', serif",                                // brand / scores / section titles
  ui: `"Segoe UI", system-ui, -apple-system, sans-serif`,                      // controls / body / stats
};
export const focusRing = `0 0 0 2px ${T.bg}, 0 0 0 4px ${T.gold}`;
/** Reference stage chip (numbered wizard step). */
export const stageChip = (state /* done | active | todo */) => ({
  display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: R.md,
  border: `1px solid ${state === "active" ? T.gold : state === "done" ? "rgba(46,204,113,0.5)" : T.border}`,
  background: state === "active" ? T.goldSoft : "rgba(0,0,0,0.3)",
  color: state === "active" ? T.gold : state === "done" ? T.green : T.textMuted,
  cursor: state === "done" ? "pointer" : "default", minHeight: 44,
});
