// ── Layer 3 — semantic game colours ──────────────────────────────────────────
// These communicate FUNCTION. They are not decoration and they are not the
// brand palette: Team Gold is gold because it is the user's side, red is red
// because something went wrong. A theme may adjust their luminance to keep
// contrast on its surfaces; it may never reverse a meaning.
export const SEMANTIC_VERSION = "1.0.0";

/** Each semantic colour has exactly one documented purpose. */
export const SEMANTIC_ROLES = Object.freeze({
  teamGold: "Team Gold — the user's side in solo play; scores, edges and holds on that side; winning emphasis",
  teamBlue: "Team Blue — the opposing side (Legend Rival in solo play); scores, edges and holds on that side",
  coachViolet: "Coach Chaos, Era intelligence and time mechanics — a third identity, never a team",
  success: "success and valid states",
  warning: "warnings that are not yet errors",
  danger: "errors, destructive actions and losses",
  disabled: "unavailable controls",
  neutral: "neutral structure and typography",
});

/**
 * The default semantic set (the CONTROL theme's values). Every Basketball
 * theme supplies its own tuned set through the same keys.
 */
export const SEMANTIC_DEFAULTS = Object.freeze({
  teamGold: "#E4AA31",
  teamBlue: "#2B82DE",
  coachViolet: "#8E5BDD",
  success: "#35B875",
  warning: "#E1A72C",
  danger: "#E65353",
  disabled: "#6B7280",
  neutral: "#E7EAF0",
});

/**
 * Decorative-versus-semantic: the auditable rule. A team or state colour is
 * SEMANTIC when it appears on an element that carries that meaning (a Gold
 * score, a Blue card edge, a red error). The same colour on an element that
 * carries no such meaning (a gold crack on a neutral panel, a blue glow behind
 * a neutral card) is DECORATIVE and counts toward the 10% accent budget.
 *
 * The colour-area audit applies this by DOM region: pixels inside these
 * selectors are classified semantic for the named colour; the same colours
 * elsewhere are accent.
 */
export const SEMANTIC_REGIONS = Object.freeze({
  teamGold: ['.ec-ta-team[data-team="gold"]', '.ec-pc[data-team="gold"]', ".ec-ta-team-label:not(.ec-ta-team-label--blue)", ".ec-continue-team--gold", '[data-side="gold"]', ".ec-dock-score-gold"],
  teamBlue: ['.ec-ta-team[data-team="blue"]', '.ec-pc[data-team="blue"]', ".ec-ta-team-label--blue", ".ec-continue-team--blue", '[data-side="blue"]', ".ec-dock-score-blue"],
  coachViolet: [".ec-coach-card", ".ec-ta-coach", ".ec-intel-era", ".ec-cc-offers"],
  success: ['[data-tone="success"]', ".ec-mode-badge--available"],
  danger: ['[role="alert"]', '[data-tone="danger"]'],
});
