// ── The six deterministic states the theme lab renders ───────────────────────
// Five are replayed from the REAL Chaos state machine with a frozen seed and
// frozen decisions (scripts/ui/theme-lab-fixture.mjs found and froze them). The
// finished game is the frozen result that script computed from this same run's
// READY rosters, staff and era. Nothing here is a mock-up: change the seed and
// the board changes; change nothing and every theme shows the identical board.
import { startRun, submitRollDecisions, selectCoach, publicView } from "../../chaos/runState.js";
import { PLAYERS, POSITIONS } from "../../players.js";
import fixture from "./fixture-result.json";

export { FIXTURE_IDS, LAB_FIXTURE_IDS, PHASE_9A2_FIXTURE_IDS, FIXTURE_LABELS } from "./fixtureIds.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr?.[i]) || null]));
const view = (run) => publicView(run, { hydrate, includeCpuHolds: true, eraChange: { allowed: false, reason: "NOT_ENTITLED" } });

/** The run at a named stage, from the frozen seed and decisions. */
export const labRun = (stage) => {
  const run = startRun({ runId: fixture.runId, seedId: fixture.seedId, createdAt: fixture.createdAt });
  if (stage === "roll1") return view(run);
  submitRollDecisions(run, { holdSlots: fixture.holds, holdRoles: [fixture.keptRole], hydrate });
  if (stage === "roll2") return view(run);
  submitRollDecisions(run, { holdSlots: fixture.holds, holdRoles: [fixture.keptRole], hydrate });
  if (stage === "coach") return view(run);
  selectCoach(run, { coachId: fixture.hireCoachId });
  return view(run); // READY
};

/** The frozen finished game, shaped exactly as the App's result state. */
export const labResult = () => ({
  type: "single", tag: "chaos", w: fixture.won, resultId: "themelabresult", persisted: true,
  record: { eraId: fixture.eraId, coachIds: fixture.coachIds, id: "themelabresult" },
  sim: fixture.sim,
});
export const labTeams = () => ({
  gold: fixture.teamIds.map((id) => byId.get(id)).filter(Boolean),
  blue: fixture.oppIds.map((id) => byId.get(id)).filter(Boolean),
});
export const labMeta = () => ({ seedId: fixture.seedId, eraId: fixture.eraId, longName: fixture.longName, candidate: fixture.candidate, won: fixture.won });
