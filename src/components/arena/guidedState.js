// ── The guided flow: six presentation states over ONE authoritative run ──────
// Phase 9B.3. Chaos Clash is one continuously evolving board that changes FOCUS
// six times: what to roll, what to hold, how the era changes the game, which
// staff to hire, whether to run it, and what happened. Nothing here decides a
// game. Every state is DERIVED from the server's run view and the shell's game
// phase; the one thing this module remembers on its own is that the player has
// seen the era reveal for a given run, so it is shown once and survives a
// refresh or a lobby round-trip.
//
// A display-state resolver, not a second game-state machine. The server phases
// in src/chaos/runState.js remain the truth; these are how they are presented.
// It lives with the arena components and NOT in src/chaos/, because that
// directory is draft logic and is held byte-identical by earlier phases' gates.
export const GUIDED_FLOW_VERSION = "chaos-guided-flow-v3";

export const GUIDED = Object.freeze({
  EMPTY: "EMPTY",               // 1 Foundation: the empty frame and one ROLL
  DRAFTING: "DRAFTING",         // 2 Drafting: cards, HOLD, the next roll — three rolls
  COACH_SELECT: "COACH_SELECT", // 3 Coach Chaos: the five is set, choose staff
  READY: "READY",               // 4 Clash Ready: the era is revealed, the matchup, one action
  RESULT: "RESULT",             // 5 Result: this game, as the hero
});
export const GUIDED_ORDER = Object.freeze([
  GUIDED.EMPTY, GUIDED.DRAFTING, GUIDED.COACH_SELECT, GUIDED.READY, GUIDED.RESULT,
]);

// ── Era acknowledgement (retired) ───────────────────────────────────────────
// Sequence 3 reveals the era with the hire, on the Clash Ready board, so no
// acknowledgement step exists any more. The helpers stay so the key an older
// build wrote can still be cleared; the resolver no longer reads them.
const ERA_ACK_KEY = "ec_chaos_era_ack";
const storageOf = (s) => {
  if (s) return s;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
};
export const eraAcknowledged = (runId, storage) => {
  if (!runId) return false;
  try { return storageOf(storage)?.getItem(ERA_ACK_KEY) === String(runId); } catch { return false; }
};
export const acknowledgeEra = (runId, storage) => {
  if (!runId) return;
  try { storageOf(storage)?.setItem(ERA_ACK_KEY, String(runId)); } catch { /* private mode */ }
};
export const clearEraAck = (storage) => {
  try { storageOf(storage)?.removeItem(ERA_ACK_KEY); } catch { /* private mode */ }
};

const LEGACY_COACH_PHASES = new Set([
  "ROLL_3_REVEALED", "ROSTERS_LOCKED", "COACH_ROLL_1", "COACH_ROLL_2", "COACH_ROLL_3", "COACH_SELECTION",
]);

/**
 * @param run     the authoritative chaos view (publicView), or null
 * @param phase   the shell's game phase: "draft" | "simulating" | "complete"
 * @param result  the shell's current result, when phase is "complete"
 * (An earlier flow carried an era acknowledgement here; sequence 3 has none.)
 */
export const resolveGuidedState = ({ run = null, phase = "draft", result = null } = {}) => {
  // The game, once it is running or has run, is the hero — whatever the run says.
  if (phase === "simulating") return GUIDED.RESULT;
  if (phase === "complete" && result) return GUIDED.RESULT;
  if (!run || run.status === "ABANDONED") return GUIDED.EMPTY;
  const p = run.phase;
  if (p === "READY") return GUIDED.READY;
  if (p === "SIMULATED") return GUIDED.RESULT;
  if (run.coachDraft?.selecting) return GUIDED.COACH_SELECT;
  // Roll 1 and Roll 2 are both drafting: hold, then roll again. The era is not
  // a state of its own any more — it is revealed on the Clash Ready board.
  if (p === "ROLL_1_REVEALED" || p === "ROLL_2_REVEALED") return GUIDED.DRAFTING;
  if (LEGACY_COACH_PHASES.has(p)) return GUIDED.COACH_SELECT;
  return GUIDED.DRAFTING;
};

/** Which roll the next primary action performs, from the run alone. */
export const nextRollLabel = (run) => (run?.roll === 1 ? "ROLL 2" : "FINAL ROLL");

/**
 * The ONE primary action for a state. Labels are the product's words; the
 * `action` names what the shell does. A null return means the state has no
 * primary action of its own (the Result carries its own controls).
 */
export const primaryAction = (state, { run = null, spinning = false, picked = null } = {}) => {
  switch (state) {
    case GUIDED.EMPTY:
      return { action: "deal", label: spinning ? "DEALING…" : "ROLL", sub: "ROLL 1 OF 3", enabled: true };
    case GUIDED.DRAFTING:
      return {
        action: "roll", label: spinning ? "ROLLING…" : nextRollLabel(run),
        sub: `ROLL ${run?.roll ?? 1} OF ${run?.totalRolls ?? 3}`, enabled: true,
      };
    case GUIDED.COACH_SELECT:
      return {
        action: "hire", label: spinning ? "HIRING…" : "CONTINUE WITH COACH",
        sub: picked ? "One staff, for the whole game." : "Select a coach to continue.", enabled: !!picked,
      };
    case GUIDED.READY:
      return { action: "run", label: spinning ? "RUNNING…" : "RUN CLASH", sub: run?.eraState?.eraStyleId ? `ERA: ${run.eraState.eraStyleId} · LET HISTORY DECIDE` : "LET HISTORY DECIDE", enabled: true };
    default:
      return null;
  }
};

/** What the contextual information area shows. One thing per state, never five panels. */
export const contextualPanel = (state) => ({
  [GUIDED.EMPTY]: "guide",            // how Chaos works, briefly
  [GUIDED.DRAFTING]: "intel-compact", // identity · risk · Blue's strength · draft pressure
  [GUIDED.COACH_SELECT]: "roster",    // the finished five, read strategically
  [GUIDED.READY]: "era",              // the era in full — revealed here, with its rules (and the member control)
  [GUIDED.RESULT]: null,              // the result IS the content
}[state] ?? null);

/** Structural switches the components read instead of re-deriving. */
export const showsCoachOffers = (state) => state === GUIDED.COACH_SELECT;
export const showsResultHero = (state) => state === GUIDED.RESULT;
export const rosterCompressed = (state) => state === GUIDED.COACH_SELECT || state === GUIDED.READY || state === GUIDED.RESULT;
export const rosterInteractive = (state) => state === GUIDED.DRAFTING;
export const showsPriorResult = (state) => state !== GUIDED.RESULT;

const remainingWord = (n) => ["No", "One", "Two", "Three", "Four", "Five"][n] ?? String(n);

/** Screen-reader text, from real values only. */
export const holdAnnouncement = (card, held, heldCount, team = "Gold") => {
  if (!card) return "";
  const remain = Math.max(0, 5 - heldCount);
  return `${card.name} ${held ? "held" : "released"}. ${remainingWord(remain)} ${team} roster position${remain === 1 ? "" : "s"} remain.`;
};
export const eraAnnouncement = (run) => {
  const id = run?.eraState?.eraStyleId;
  if (!id) return "";
  const facts = (run?.era?.ruleFacts || run?.eraContext?.ruleFacts || []).slice(0, 3).map((f) => String(f).replace(/\.$/, ""));
  return `Era revealed: ${id}.${facts.length ? ` ${facts.join(". ")}.` : ""}`;
};
export const coachAnnouncement = (offer) => (offer ? `${offer.name} selected as ${offer.roleLabel || offer.role}.` : "");
export const resultAnnouncement = (result) => {
  const s = result?.sim?.finalScore;
  if (!s) return "Clash complete.";
  const winner = s.gold > s.blue ? "Gold" : "Blue";
  const [hi, lo] = s.gold > s.blue ? [s.gold, s.blue] : [s.blue, s.gold];
  return `Clash complete. Team ${winner} wins ${hi} to ${lo}.`;
};
export const stateAnnouncement = (state, { run = null, result = null } = {}) => {
  switch (state) {
    case GUIDED.EMPTY: return "Chaos Clash. Roll 1 of 3. Roll to draft your first five.";
    case GUIDED.DRAFTING: return `Roll ${run?.roll ?? 1} of ${run?.totalRolls ?? 3}. Hold the players you want, then roll.`;
    case GUIDED.COACH_SELECT: return "Your roster is set. Choose your coach.";
    case GUIDED.READY: return `${eraAnnouncement(run) || "Clash ready."} Run Clash to play it out.`;
    case GUIDED.RESULT: return resultAnnouncement(result);
    default: return "";
  }
};

/** The closed telemetry vocabulary for the guided flow (see api/events.js). */
export const GUIDED_EVENTS = Object.freeze({
  STATE_VIEWED: "chaos_state_viewed",
  PRIMARY_ACTION: "chaos_primary_action",
  ERA_REVEAL_VIEWED: "era_reveal_viewed",
  ERA_REVEAL_CONTINUED: "era_reveal_continued",
  COACH_CHAOS_VIEWED: "coach_chaos_viewed",
  COACH_OFFER_SELECTED: "coach_offer_selected",
  CLASH_READY_VIEWED: "clash_ready_viewed",
  RUN_CLASH_STARTED: "run_clash_started",
  RESULT_STATE_VIEWED: "result_state_viewed",
  LIVE_INTEL_EXPANDED: "live_intel_expanded",
  ERA_RULES_EXPANDED: "era_rules_expanded",
});
/** The entry event a state fires exactly once on being reached. */
export const stateViewEvent = (state) => ({
  [GUIDED.COACH_SELECT]: GUIDED_EVENTS.COACH_CHAOS_VIEWED,
  [GUIDED.READY]: GUIDED_EVENTS.CLASH_READY_VIEWED,
  [GUIDED.RESULT]: GUIDED_EVENTS.RESULT_STATE_VIEWED,
}[state] ?? null);
