// ── EraClash design tokens — hybrid warm-ivory / navy ─────────────────────────
// Phase 7B. The product reads as a warm editorial sports page with a cinematic
// navy arena core, replacing the near-black interface that made long reading
// hard. Two surface families:
//
//   LIGHT (default page): warm ivory page, off-white cards, deep-navy ink.
//     Roster panels, coach lists, era details, analysis, box score, feedback.
//   ARENA (deliberate darkness): navy court centre, header, simulation
//     loading, final-score hero, modal scrim.
//
// Every component consumes tokens, never raw colors, so the surface family is
// chosen by token — not by each component inventing its own palette.
export const T = {
  // ── page + surfaces (light) ────────────────────────────────────────────
  bg: "#f2efe8",              // warm ivory page
  bgCard: "#fffdf8",          // primary card (off-white)
  bgCardHover: "#f6f2ea",     // raised/secondary card
  bgMuted: "#e9edf3",         // pale neutral gray-blue
  bgPanel: "#fffdf8",         // team panel over the page
  border: "#d9dee7",
  borderStrong: "#bec7d4",

  // ── ink ────────────────────────────────────────────────────────────────
  text: "#121a2a",            // deep navy
  textDim: "#5a6577",         // medium slate — AA on ivory and on white
  textMuted: "#636c83",   // 5.2:1 on the card, 4.6:1 on the page — was 3.7:1
  cream: "#f8f2e5",

  // ── arena (deliberate dark surfaces) ───────────────────────────────────
  arena: "#0c1627",           // navy
  arenaSoft: "#17233a",
  arenaBorder: "#243350",
  onArena: "#f1f4fa",         // text on navy
  onArenaDim: "#a9b6cc",      // AA on navy

  // ── team identity ──────────────────────────────────────────────────────
  gold: "#8b660b",            // muted premium gold — 5.2:1 on the card, 4.6:1 on the page
  goldOnDark: "#e9b949",      // gold for navy surfaces
  goldSoft: "#fdf3d8",
  goldBorder: "#e0b955",
  glowGold: "0 6px 22px rgba(184,134,15,0.12)",
  blue: "#2d6bc2",            // nudged: 2f6fc8 was 4.3:1 on the ivory page
  blueOnDark: "#7ab0f5",
  blueSoft: "#e8f1ff",
  blueBorder: "#8fb6e8",
  glowBlue: "0 6px 22px rgba(47,111,200,0.12)",

  // ── status ─────────────────────────────────────────────────────────────
  green: "#1c7a4a",
  red: "#b5322b",
  orange: "#a4640a",

  shadowCard: "0 2px 10px rgba(18,26,42,0.07)",
  shadowRaised: "0 8px 26px rgba(18,26,42,0.12)",
};

export const card = { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "12px" };

// Team-flavored panel styling. On the light shell this is a white card with a
// team-colored top edge and a soft shadow — restrained, never flooded color.
export const teamPanel = (team) => ({
  background: T.bgPanel,
  border: `1px solid ${T.border}`,
  borderTop: `3px solid ${team === "blue" ? T.blue : T.gold}`,
  borderRadius: 14,
  boxShadow: T.shadowCard,
});
export const teamAccent = (team) => (team === "blue" ? T.blue : T.gold);
/** Team accent for text sitting on a navy/arena surface. */
export const teamAccentOnArena = (team) => (team === "blue" ? T.blueOnDark : T.goldOnDark);

export const btnPrimary = {
  width: "100%", padding: 15, fontSize: 15, fontWeight: 800, border: "none",
  borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer",
};
export const btnSecondary = {
  padding: "11px 14px", fontSize: 14, fontWeight: 700, borderRadius: 9,
  border: `1px solid ${T.borderStrong}`, background: T.bgCard, color: T.text, cursor: "pointer",
};

// ── Layout / motion / type tokens ────────────────────────────────────────────
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 };
export const R = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 };
export const Z = { header: 40, dropdown: 50, modal: 60, toast: 70 };
export const DUR = { fast: 120, base: 200, slow: 400, reveal: 700 };
export const BP = { mobile: 640, tablet: 900, desktop: 1200 };
export const FONT = {
  display: "Georgia, 'Times New Roman', serif",
  ui: `"Segoe UI", system-ui, -apple-system, sans-serif`,
};
export const focusRing = `0 0 0 2px ${T.bgCard}, 0 0 0 4px ${T.gold}`;

/** Numbered wizard step chip. */
export const stageChip = (state /* done | active | todo */) => ({
  display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: R.md,
  border: `1px solid ${state === "active" ? T.goldBorder : state === "done" ? "rgba(28,122,74,0.35)" : T.border}`,
  background: state === "active" ? T.goldSoft : T.bgCard,
  color: state === "active" ? T.gold : state === "done" ? T.green : T.textMuted,
  cursor: state === "done" ? "pointer" : "default", minHeight: 44,
  boxShadow: state === "active" ? T.shadowCard : "none",
});
