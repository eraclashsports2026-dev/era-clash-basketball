// ── Theme types: the four Basketball candidates and the token scopes ─────────
// Every Basketball theme supplies a value for every key in every scope. The
// resolver refuses a theme with a missing key, so a variant can never fall
// through to another theme's colour by accident.
// The four Phase 9A.1 candidates — historical, unchanged, still compared in the lab.
export const CANDIDATE_THEME_IDS = Object.freeze(["fracture-core", "night-court", "modern-court", "hardwood-luxe"]);
// Phase 9A.2: the owner-selected hybrid (Night Court Editorial base + Fracture
// Core master-brand signature) is the fifth lab entry and the product DEFAULT.
export const PRODUCTION_THEME_ID = "night-court-production-hybrid";
export const PRODUCTION_THEME_NAME = "basketball-night-court-v1";
export const THEME_IDS = Object.freeze([...CANDIDATE_THEME_IDS, PRODUCTION_THEME_ID]);
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
  // Phase 9A.2 — the Era Fracture (background-image for the divide and active
  // edges; a box-shadow for its soft light) and the portrait stage.
  "fracture", "fracture-glow", "fracture-on", "portrait-field", "portrait-well-hi", "portrait-well-lo",
]);

/** Lobby family keys (--ec-l-*). Default to the arena family. */
export const LOBBY_KEYS = Object.freeze([
  "bg", "panel", "panel-raised", "panel-soft", "text", "text-secondary", "text-muted", "border", "border-strong",
  // Text on the lobby PAGE (the product line, the "more ways to play" kicker),
  // which may sit on a dark ground while the cards are ivory (Night Court).
  "page-text", "page-muted", "glyph",
  // Phase 9A.2 — the lobby's brand band (the logo sits on it) may differ from
  // the canvas: obsidian band over an ivory canvas in the production theme.
  "hero-bg", "hero-text",
  // Restrained glyph colours by mode family (competitive → cobalt, era → violet)
  // and the flagship card's shadow, which is heavy on dark and light on ivory.
  "glyph-cool", "glyph-era", "card-shadow",
  // The centre-court arc behind the lobby: atmosphere on a dark canvas, a stray
  // circle on an ivory one.
  "arc-opacity",
]);

/**
 * Editorial family keys (--ec-a-* REMAPPED under .ec-editorial-shell). Phase
 * 9A.2: membership, fantasy and mode-information pages are reading surfaces.
 * They are built from arena tokens, so the editorial shell re-declares those
 * same names with reading values — no component changes, one DOM.
 */
export const EDITORIAL_KEYS = Object.freeze([
  "bg", "arena", "panel", "panel-raised", "panel-soft", "text", "text-secondary", "text-muted",
  "gold", "gold-soft", "gold-line", "blue", "blue-soft", "blue-line", "coach", "coach-soft", "coach-line",
  "border", "border-strong", "green", "red", "scrim",
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
  // Phase 9A.2 — the one fracture a reading surface may carry (the result hero).
  "fracture",
]);

/** Root aliases index.css reads directly. */
export const ROOT_ALIAS_KEYS = Object.freeze([
  "ec-page", "ec-surface", "ec-surface-muted", "ec-navy", "ec-navy-soft", "ec-ink", "ec-border",
  "gold", "gold-on-dark", "blue", "blue-on-dark",
]);
