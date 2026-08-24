// ── EraClash version registry ─────────────────────────────────────────────────
// Every simulation record carries these so we can always tell which system
// generated a result. Bump deliberately; never silently.
export const VERSIONS = {
  app: "2.4.0",
  rating: "2.0",          // src/rating.js — POS_WEIGHTS + OOP penalty (CEO approval required to change)
  chemistry: "2.5",       // rating.js analyzeBalance (v2, unchanged) + attributes.js insight layer (additive)
  simulation_engine: "2.2",
  player_data: "2026-08-23", // 330 player-decade entries
  prompt: "2.1",          // api/simulate.js buildPrompt (adds turningPoint field)
};

// v2.3: ALL core results (every mode) are decided by the deterministic engine
// on the server (/api/game); the AI layer only narrates stored results. This
// flag is retained for documentation/back-compat — the server is authoritative
// regardless of client flags.
export const USE_ENGINE_SEASON = true;
