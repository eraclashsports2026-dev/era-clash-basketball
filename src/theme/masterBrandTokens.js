// ── Layer 1 — the master EraClash brand ──────────────────────────────────────
// Shared by every EraClash product and every Basketball theme. These are read
// from EraClash Logo Mk1 (public/brand/eraclash-logo-mk1.png): an obsidian
// foundation, metallic platinum letterforms, and a diagonal Era Fracture where
// Fracture Gold meets Fracture Cobalt. Nothing here is sport-specific and no
// theme may rename, reverse or repurpose it.
//
// This file carries VALUES and ROLES. It emits no CSS by itself — the resolver
// (themeResolver.js) turns the three layers into one scoped stylesheet.
export const MASTER_BRAND_VERSION = "1.0.0";

export const MASTER_BRAND = Object.freeze({
  obsidian: "#03060B",        // the foundation every dark surface descends from
  platinum: "#E7EAF0",        // metallic neutral: primary structure and typography on dark
  platinumDeep: "#C9CFDA",    // the letterform's shaded face — secondary neutral
  graphite: "#141A24",        // the neutral panel between obsidian and platinum
  fractureGold: "#E1A72C",    // the warm side of the Era Fracture
  fractureCobalt: "#267CE8",  // the cool side of the Era Fracture
});

/** Where the master brand is permitted to appear. Roles, not decoration. */
export const MASTER_BRAND_ROLES = Object.freeze({
  obsidian: ["main background", "navigation", "arena foundation", "deep negative space"],
  platinum: ["typography", "neutral structure", "dividers", "metallic detail"],
  graphite: ["neutral cards", "neutral panels"],
  fractureGold: ["brand emphasis", "primary action", "Team Gold", "winning emphasis", "selected states", "warm side of the Era Fracture"],
  fractureCobalt: ["Team Blue", "opposing-side identity", "cool side of the Era Fracture"],
});

/**
 * The Era Fracture: a controlled DIAGONAL meeting of Gold and Cobalt.
 * One geometry, reused. It is not a crack pattern and never a border treatment.
 */
export const ERA_FRACTURE = Object.freeze({
  angleDeg: 112,               // the logo's forward lean
  goldStop: 0.46,              // where gold hands over to cobalt (0–1 along the divide)
  seamWidth: 0.02,             // the bright seam between them, as a fraction
  approvedLocations: Object.freeze([
    "logo-adjacent brand moment", "main arena divide", "roll transition", "era reveal",
    "selected player card", "selected coach card", "simulation transition",
    "result dock state transition", "share graphic", "mode-card selected state",
  ]),
  unapprovedLocations: Object.freeze([
    "every empty card", "every panel corner", "every row", "every paragraph", "decorative noise unrelated to state",
  ]),
});

/**
 * The Era Fracture as CSS: one diagonal gradient, gold to a 2% bright seam to
 * cobalt, reused by every primitive (Phase 9A.2). Angle and stops come from
 * ERA_FRACTURE so the divide is one geometry everywhere it appears.
 */
export const eraFractureGradient = (angleDeg = ERA_FRACTURE.angleDeg) => {
  const g = Math.round(ERA_FRACTURE.goldStop * 100), seam = Math.round(ERA_FRACTURE.seamWidth * 100);
  return `linear-gradient(${angleDeg}deg, ${MASTER_BRAND.fractureGold} 0%, ${MASTER_BRAND.fractureGold} ${g - 2}%, #F7E6B8 ${g}%, #FFFFFF ${g + seam / 2}%, #9CC2F5 ${g + seam}%, ${MASTER_BRAND.fractureCobalt} ${g + seam + 2}%, ${MASTER_BRAND.fractureCobalt} 100%)`;
};
/** The fracture's soft light: two low-alpha halos, never a border. */
export const ERA_FRACTURE_GLOW = "0 0 14px rgba(225, 167, 44, 0.22), 0 0 14px rgba(38, 124, 232, 0.22)";

/** Focus behaviour is brand-wide: visible, 3px, offset, never colour-only. */
export const FOCUS_RING = Object.freeze({ widthPx: 3, offsetPx: 2, colorRole: "fractureGold on dark, fractureCobalt on light" });

/** Core typography roles (families come from the product's system stacks). */
export const TYPE_ROLES = Object.freeze({
  display: "condensed display for names, ratings, roll labels and CTAs",
  ui: "system sans for controls and body",
  editorial: "serif display for long-form headings",
});
