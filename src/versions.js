// ── EraClash version registry ─────────────────────────────────────────────────
// Every simulation record carries these so we can always tell which system
// generated a result. Bump deliberately; never silently.
export const VERSIONS = {
  app: "2.1.0",
  rating: "2.0",          // src/rating.js — POS_WEIGHTS + OOP penalty (CEO approval required to change)
  chemistry: "2.5",       // rating.js analyzeBalance (v2, unchanged) + attributes.js insight layer (additive)
  simulation_engine: "2.1",
  player_data: "2026-08-23", // 330 player-decade entries
  prompt: "2.1",          // api/simulate.js buildPrompt (adds turningPoint field)
};

// Engine-simulated Win 82 season: games 1–82 are resolved by the deterministic
// local engine (seeded, reproducible) instead of 82 separate LLM calls; the LLM
// narrates the season finale only. ~82x cost reduction per season run.
// ⚠ CEO APPROVAL ITEM: this changes how Win 82 outcomes are decided. It ships in
// the release candidate defaulted ON for cost/reliability, but flip this to
// false before deploy if Joe wants the old behavior.
export const USE_ENGINE_SEASON = true;
