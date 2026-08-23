// ── EraClash dark-arena theme ──────────────────────────────────────────────────
export const T = {
  bg: "#0b0e17",
  bgCard: "#141a2a",
  bgCardHover: "#1a2136",
  border: "#232c45",
  gold: "#fdb927",
  text: "#e8eaf2",
  textDim: "#8a93ad",
  green: "#2ecc71",
  red: "#e74c3c",
  orange: "#f39c12",
  blue: "#6ea8fe",
};

export const card = { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px" };

export const btnPrimary = {
  width: "100%", padding: 15, fontSize: 14, fontWeight: 800, border: "none",
  borderRadius: 10, background: T.gold, color: "#111", cursor: "pointer",
};
export const btnSecondary = {
  padding: "11px 14px", fontSize: 13, fontWeight: 700, borderRadius: 9,
  border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer",
};
