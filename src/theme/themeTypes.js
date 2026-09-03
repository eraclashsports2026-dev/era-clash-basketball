// ── Theme types: the four Basketball candidates and the token scopes ─────────
// Every Basketball theme supplies a value for every key in every scope. The
// resolver refuses a theme with a missing key, so a variant can never fall
// through to another theme's colour by accident.
export const THEME_IDS = Object.freeze(["fracture-core", "night-court", "modern-court", "hardwood-luxe"]);
export const CONTROL_THEME_ID = "fracture-core";

/** The three CSS scopes a theme writes into. */
export const SCOPES = Object.freeze({
  // html[data-theme] — the light/reading tokens (T in src/theme.js), the root
  // aliases index.css already reads, and the lobby family.
  root: "root",
  // [data-theme] .ec-arena-shell — the arena family (--ec-a-*), declared on the
  // shell element in index.css and therefore overridden at the same element.
  arena: "arena",
});

/** Arena family keys (--ec-a-*). The first 22 exist in index.css today. */
export const ARENA_KEYS = Object.freeze([
  "bg", "arena", "panel", "panel-raised", "panel-soft",
  "text", "text-secondary", "text-muted",
  "gold", "gold-soft", "gold-line", "blue", "blue-soft", "blue-line",
  "coach", "coach-soft", "coach-line", "coach-deep",
  "border", "border-strong", "green", "red",
  // Phase 9A.1
  "brand-gold", "accent", "accent-soft", "accent-line",
  "header", "scrim",
  "cta-hi", "cta-mid", "cta-lo", "cta-ink", "cta-glow",
  "pc-deep-gold", "pc-deep-blue",
  "court-opacity", "texture", "spot-warm", "spot-cool",
]);

/** Lobby family keys (--ec-l-*). Default to the arena family. */
export const LOBBY_KEYS = Object.freeze([
  "bg", "panel", "panel-raised", "panel-soft", "text", "text-secondary", "text-muted", "border", "border-strong",
  // Text on the lobby PAGE (the product line, the "more ways to play" kicker),
  // which may sit on a dark ground while the cards are ivory (Night Court).
  "page-text", "page-muted", "glyph",
]);

/** Reading/light family keys (--ec-t-*), mirroring T in src/theme.js. */
export const READING_KEYS = Object.freeze([
  "bg", "bg-card", "bg-card-hover", "bg-muted", "bg-panel", "border", "border-strong",
  "text", "text-dim", "text-muted", "cream",
  "arena", "arena-soft", "arena-border", "on-arena", "on-arena-dim",
  "gold", "gold-on-dark", "gold-soft", "gold-border",
  "blue", "blue-on-dark", "blue-soft", "blue-border",
  "green", "red", "orange", "on-gold",
  "inset-hi", "inset-lo",
]);

/** Root aliases index.css reads directly. */
export const ROOT_ALIAS_KEYS = Object.freeze([
  "ec-page", "ec-surface", "ec-surface-muted", "ec-navy", "ec-navy-soft", "ec-ink", "ec-border",
  "gold", "gold-on-dark", "blue", "blue-on-dark",
]);
