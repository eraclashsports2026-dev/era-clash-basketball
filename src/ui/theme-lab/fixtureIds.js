// ── The theme-lab fixtures, by id — no JSON import, so node scripts can read it ─
// The six Phase 9A.1 comparison fixtures are historical and unchanged. Phase 9A.2
// adds three: the portrait-stage uniform tests, the account gate and the
// membership page (both editorial surfaces).
export const FIXTURE_IDS = Object.freeze(["lobby", "empty", "roll2", "coach", "result", "postgame"]);
export const PHASE_9A2_FIXTURE_IDS = Object.freeze(["portraits", "gate", "membership", "simulating"]);
export const LAB_FIXTURE_IDS = Object.freeze([...FIXTURE_IDS, ...PHASE_9A2_FIXTURE_IDS]);
export const FIXTURE_LABELS = Object.freeze({
  lobby: "Play Lobby", empty: "Empty Chaos Arena", roll2: "Populated Roll 2",
  coach: "Final Coach State", result: "Result Dock", postgame: "Full Postgame",
  portraits: "Portrait Stage (uniform tests)", gate: "Account Gate", membership: "Membership", simulating: "Simulating",
});
