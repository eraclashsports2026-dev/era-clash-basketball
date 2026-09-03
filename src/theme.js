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
//
// Phase 9A.1: every value is a CSS variable reference whose fallback is the
// value it always had. Without a data-theme on the document the product renders
// exactly as before; under one (the Basketball theme lab), the same inline
// styles pick up that theme's reading-surface tokens. See src/theme/.
export const T = {
  // ── page + surfaces (light) ────────────────────────────────────────────
  bg: "var(--ec-t-bg, #f2efe8)",              // warm ivory page
  bgCard: "var(--ec-t-bg-card, #fffdf8)",          // primary card (off-white)
  bgCardHover: "var(--ec-t-bg-card-hover, #f6f2ea)",     // raised/secondary card
  bgMuted: "var(--ec-t-bg-muted, #e9edf3)",         // pale neutral gray-blue
  bgPanel: "var(--ec-t-bg-panel, #fffdf8)",         // team panel over the page
  border: "var(--ec-t-border, #d9dee7)",
  borderStrong: "var(--ec-t-border-strong, #bec7d4)",

  // ── ink ────────────────────────────────────────────────────────────────
  text: "var(--ec-t-text, #121a2a)",            // deep navy
  textDim: "var(--ec-t-text-dim, #5a6577)",         // medium slate — AA on ivory and on white
  textMuted: "var(--ec-t-text-muted, #636c83)",   // 5.2:1 on the card, 4.6:1 on the page — was 3.7:1
  cream: "var(--ec-t-cream, #f8f2e5)",

  // ── arena (deliberate dark surfaces) ───────────────────────────────────
  arena: "var(--ec-t-arena, #0c1627)",           // navy
  arenaSoft: "var(--ec-t-arena-soft, #17233a)",
  arenaBorder: "var(--ec-t-arena-border, #243350)",
  onArena: "var(--ec-t-on-arena, #f1f4fa)",         // text on navy
  onArenaDim: "var(--ec-t-on-arena-dim, #a9b6cc)",      // AA on navy

  // ── team identity ──────────────────────────────────────────────────────
  gold: "var(--ec-t-gold, #8b660b)",            // muted premium gold — 5.2:1 on the card, 4.6:1 on the page
  goldOnDark: "var(--ec-t-gold-on-dark, #e9b949)",      // gold for navy surfaces
  goldSoft: "var(--ec-t-gold-soft, #fdf3d8)",
  goldBorder: "var(--ec-t-gold-border, #e0b955)",
  glowGold: "0 6px 22px rgba(184,134,15,0.12)",
  blue: "var(--ec-t-blue, #2d6bc2)",            // nudged: 2f6fc8 was 4.3:1 on the ivory page
  blueOnDark: "var(--ec-t-blue-on-dark, #7ab0f5)",
  blueSoft: "var(--ec-t-blue-soft, #e8f1ff)",
  blueBorder: "var(--ec-t-blue-border, #8fb6e8)",
  glowBlue: "0 6px 22px rgba(47,111,200,0.12)",

  // ── status ─────────────────────────────────────────────────────────────
  green: "var(--ec-t-green, #1c7a4a)",
  red: "var(--ec-t-red, #b5322b)",
  orange: "var(--ec-t-orange, #a4640a)",
  // Ink on a gold button. Off-white on the muted light-theme gold; a dark theme
  // brightens its gold and sets this to near-black, so a button never goes
  // white-on-yellow.
  onGold: "var(--ec-t-on-gold, #fffdf8)",

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
