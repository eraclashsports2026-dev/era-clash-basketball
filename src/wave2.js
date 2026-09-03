// ── Wave 2 study constants (Phase 9A.3) ──────────────────────────────────────
// ONE frozen description of the Wave 2 private beta, imported by the client
// (the feedback panel, telemetry), the server (feedback validation, metric
// partitions) and the reports. Nothing here is a secret: ids are pseudonymous,
// keys live only as hashes in config/previewAccess.js and raw in
// .preview-secrets/ (gitignored).
export const WAVE2 = Object.freeze({
  waveId: "candidate4-night-court-wave2",
  studyVersion: "wave2-activation-v1",
  themeVersion: "basketball-night-court-v1",
  entryExperience: "phase9a-play-lobby",
  simulationCandidate: "candidate4",
  candidateCalibration: "1.4.0",
  feedbackSchemaVersion: 3,
  telemetryContractVersion: "wave2-telemetry-v1",
});

/** Pseudonymous cohorts. Real names and emails never enter the repository. */
export const WAVE2_COHORTS = Object.freeze({
  "first-time": Object.freeze({ label: "First-time activation cohort", testerIds: ["wave2-new-01", "wave2-new-02", "wave2-new-03"], tasks: ["N1", "N2", "N3", "N4", "N5"] }),
  returning: Object.freeze({ label: "Returning comparison cohort", testerIds: ["wave2-returning-01", "wave2-returning-02"], tasks: ["R1", "R2", "R3"] }),
});
export const cohortOf = (testerId) => Object.entries(WAVE2_COHORTS).find(([, c]) => c.testerIds.includes(testerId))?.[0] ?? null;

/** The eleven 1–5 ratings, and which tasks show which. */
export const WAVE2_RATINGS = Object.freeze({
  startingClarity: "It was clear how to start",
  modeChoiceClarity: "It was clear which mode to choose",
  draftClarity: "The draft (rolls and holds) was clear",
  eraClarity: "The era reveal made sense",
  coachChoiceClarity: "Choosing a coach made sense",
  visualComfort: "The screens were comfortable to look at",
  visualPremiumQuality: "It looked premium",
  brandDistinctiveness: "It felt distinctly like EraClash",
  resultClarity: "The result was clear",
  desireToPlayAgain: "I wanted to play again",
  placementClarity: "Placing a player in a position was clear",
});
export const WAVE2_TASKS = Object.freeze({
  N1: Object.freeze({ cohort: "first-time", label: "Choose what to play", ratings: ["startingClarity", "modeChoiceClarity", "visualComfort", "visualPremiumQuality", "brandDistinctiveness"], needsResult: false }),
  N2: Object.freeze({ cohort: "first-time", label: "Complete one Chaos Clash", ratings: ["draftClarity", "eraClarity", "coachChoiceClarity", "resultClarity", "visualComfort"], needsResult: true }),
  N3: Object.freeze({ cohort: "first-time", label: "Explore the postgame", ratings: ["resultClarity", "visualComfort", "visualPremiumQuality"], needsResult: true }),
  N4: Object.freeze({ cohort: "first-time", label: "After the game", ratings: ["desireToPlayAgain", "brandDistinctiveness"], needsResult: false }),
  N5: Object.freeze({ cohort: "first-time", label: "On a phone", ratings: ["startingClarity", "draftClarity", "resultClarity", "visualComfort"], needsResult: false }),
  R1: Object.freeze({ cohort: "returning", label: "Compare the entry", ratings: ["startingClarity", "modeChoiceClarity", "desireToPlayAgain"], needsResult: false }),
  R2: Object.freeze({ cohort: "returning", label: "Dream Matchup placement", ratings: ["placementClarity"], needsResult: false }),
  R3: Object.freeze({ cohort: "returning", label: "Night Court comparison", ratings: ["visualComfort", "visualPremiumQuality", "brandDistinctiveness", "resultClarity"], needsResult: false }),
  FREE: Object.freeze({ cohort: null, label: "Anything else", ratings: ["visualComfort", "desireToPlayAgain"], needsResult: false }),
});
export const WAVE2_TASK_IDS = Object.freeze(Object.keys(WAVE2_TASKS));

export const WAVE2_ISSUE_CATEGORIES = Object.freeze(["NONE", "ACCESS", "LOBBY_CONFUSION", "MODE_CONFUSION", "ROLL_CONFUSION", "HOLD_CONFUSION", "ERA_CONFUSION", "COACH_CONFUSION", "PLACEMENT_CONFUSION", "RESULT_CONFUSION", "VISUAL_READABILITY", "MOBILE_LAYOUT", "PERFORMANCE", "UNBELIEVABLE_RESULT", "OTHER"]);
export const WAVE2_ISSUE_LABELS = Object.freeze({ NONE: "No issue", ACCESS: "Getting in", LOBBY_CONFUSION: "The lobby confused me", MODE_CONFUSION: "Unsure which mode", ROLL_CONFUSION: "Rolling confused me", HOLD_CONFUSION: "Holding confused me", ERA_CONFUSION: "The era confused me", COACH_CONFUSION: "Coaches confused me", PLACEMENT_CONFUSION: "Placing a player confused me", RESULT_CONFUSION: "The result confused me", VISUAL_READABILITY: "Hard to read", MOBILE_LAYOUT: "Phone layout problem", PERFORMANCE: "Slow", UNBELIEVABLE_RESULT: "Result didn't feel real", OTHER: "Other" });
export const WAVE2_COMMENT_MAX = 500;

/**
 * Activation telemetry for the study: the Phase 9A events plus the Chaos and
 * result events Wave 2 needs. Mirrored by api/events.js ALLOWED (a test pins
 * both lists) and partitioned server-side by wave, cohort, tester and build.
 */
export const WAVE2_TELEMETRY_EVENTS = Object.freeze([
  "play_lobby_viewed", "play_mode_selected",
  "active_run_continue_clicked", "active_run_abandon_started", "active_run_abandoned",
  "time_to_mode_selection_recorded", "time_to_first_roll_recorded",
  "chaos_roll_completed", "chaos_era_revealed", "chaos_coach_selected", "chaos_game_completed",
  "result_tab_opened", "new_clash_started", "rematch_started",
  "dream_player_selected", "eligible_position_choice_shown", "dream_player_placed", "dream_player_auto_placed", "dream_player_swap_completed",
  "feedback_submitted", "preview_fallback_invoked",
]);
