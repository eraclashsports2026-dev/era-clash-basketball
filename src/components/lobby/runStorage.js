// The two localStorage keys that remember an unfinished Chaos run. Shared by the
// lobby (which READS them) and the arena (which writes RUN_AT_KEY when the run is
// touched). Defined once so the hero decision and the Continue card agree.
export const RUN_KEY = "ec_chaos_run";
export const RUN_AT_KEY = "ec_chaos_run_at";
