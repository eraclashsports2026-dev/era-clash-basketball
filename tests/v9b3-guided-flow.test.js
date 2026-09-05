// ── Phase 9B.3: the guided flow's state contract ─────────────────────────────
// Six presentation states derived from the authoritative run. These tests pin
// the DERIVATION — which run reaches which state, what survives a refresh or a
// lobby round-trip, and which single action each state offers — and they pin
// the product's words for those actions, because a gate elsewhere reads them.
import { describe, it, expect } from "vitest";
import {
  GUIDED, GUIDED_ORDER, GUIDED_FLOW_VERSION, resolveGuidedState, primaryAction, nextRollLabel,
  eraAcknowledged, acknowledgeEra, clearEraAck, contextualPanel,
  showsCoachOffers, showsResultHero, rosterCompressed, rosterInteractive, showsPriorResult,
  holdAnnouncement, eraAnnouncement, coachAnnouncement, resultAnnouncement, stateAnnouncement,
  GUIDED_EVENTS, stateViewEvent,
} from "../src/chaos/guidedState.js";

const run = (over = {}) => ({
  chaosRunId: "run-1", phase: "ROLL_1_REVEALED", roll: 1, totalRolls: 3, status: "ACTIVE",
  eraState: { revealed: false, eraStyleId: null },
  coachDraft: { selecting: false, offers: [] },
  ...over,
});
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

describe("the six states are derived from the run, never invented", () => {
  it("names six states in the order a player meets them", () => {
    expect(GUIDED_ORDER).toEqual(["EMPTY", "DRAFTING", "ERA_REVEAL", "COACH_SELECT", "READY", "RESULT"]);
    expect(GUIDED_FLOW_VERSION).toBe("chaos-guided-flow-v2");
  });
  it("no run is the empty frame; an abandoned run is too", () => {
    expect(resolveGuidedState({ run: null })).toBe(GUIDED.EMPTY);
    expect(resolveGuidedState({ run: run({ status: "ABANDONED" }) })).toBe(GUIDED.EMPTY);
  });
  it("roll 1 is drafting", () => {
    expect(resolveGuidedState({ run: run() })).toBe(GUIDED.DRAFTING);
  });
  it("roll 2 with the era revealed is the ERA REVEAL until it has been seen, then drafting again", () => {
    const r2 = run({ phase: "ROLL_2_REVEALED", roll: 2, eraState: { revealed: true, eraStyleId: "1950s" } });
    expect(resolveGuidedState({ run: r2, eraAcknowledged: false })).toBe(GUIDED.ERA_REVEAL);
    expect(resolveGuidedState({ run: r2, eraAcknowledged: true })).toBe(GUIDED.DRAFTING);
  });
  it("the final roll landing opens Coach Chaos — and only then", () => {
    expect(resolveGuidedState({ run: run({ phase: "ROLL_3_REVEALED", roll: 3, coachDraft: { selecting: true, offers: [{}, {}, {}] } }) })).toBe(GUIDED.COACH_SELECT);
    expect(showsCoachOffers(GUIDED.DRAFTING)).toBe(false);
    expect(showsCoachOffers(GUIDED.ERA_REVEAL)).toBe(false);
    expect(showsCoachOffers(GUIDED.COACH_SELECT)).toBe(true);
  });
  it("legacy sequence-1 phases are also Coach Chaos, so an old run is never stranded", () => {
    for (const p of ["ROSTERS_LOCKED", "COACH_ROLL_1", "COACH_ROLL_3", "COACH_SELECTION"]) {
      expect(resolveGuidedState({ run: run({ phase: p }) }), p).toBe(GUIDED.COACH_SELECT);
    }
  });
  it("READY is Clash Ready; a running or finished game is the Result whatever the run says", () => {
    expect(resolveGuidedState({ run: run({ phase: "READY" }) })).toBe(GUIDED.READY);
    expect(resolveGuidedState({ run: run({ phase: "READY" }), phase: "simulating" })).toBe(GUIDED.RESULT);
    expect(resolveGuidedState({ run: run({ phase: "SIMULATED" }), phase: "complete", result: { sim: {} } })).toBe(GUIDED.RESULT);
    expect(resolveGuidedState({ run: null, phase: "complete", result: { sim: {} } })).toBe(GUIDED.RESULT);
  });
});

describe("what survives a refresh or a lobby round-trip", () => {
  // Section 23 of the specification: the exact state returns at every stop.
  const s = mem();
  it("an era acknowledgement is remembered per run, so a resumed run does not repeat the reveal", () => {
    expect(eraAcknowledged("run-1", s)).toBe(false);
    acknowledgeEra("run-1", s);
    expect(eraAcknowledged("run-1", s)).toBe(true);
    const r2 = run({ phase: "ROLL_2_REVEALED", roll: 2, eraState: { revealed: true, eraStyleId: "1990s" } });
    expect(resolveGuidedState({ run: r2, eraAcknowledged: eraAcknowledged(r2.chaosRunId, s) })).toBe(GUIDED.DRAFTING);
  });
  it("a NEW run reveals its era again — the acknowledgement does not leak across runs", () => {
    const other = run({ chaosRunId: "run-2", phase: "ROLL_2_REVEALED", roll: 2, eraState: { revealed: true, eraStyleId: "2010s" } });
    expect(eraAcknowledged(other.chaosRunId, s)).toBe(false);
    expect(resolveGuidedState({ run: other, eraAcknowledged: eraAcknowledged(other.chaosRunId, s) })).toBe(GUIDED.ERA_REVEAL);
  });
  it("clearing the acknowledgement is explicit and never throws without storage", () => {
    clearEraAck(s);
    expect(eraAcknowledged("run-1", s)).toBe(false);
    expect(() => acknowledgeEra("x", { setItem: () => { throw new Error("quota"); } })).not.toThrow();
    expect(eraAcknowledged(null, s)).toBe(false);
  });
});

describe("one primary action per state, in the product's words", () => {
  it("the empty frame offers ROLL, and says it is roll 1 of 3", () => {
    expect(primaryAction(GUIDED.EMPTY)).toMatchObject({ action: "deal", label: "ROLL", sub: "ROLL 1 OF 3", enabled: true });
  });
  it("drafting offers the NEXT roll by name", () => {
    expect(nextRollLabel(run({ roll: 1 }))).toBe("ROLL 2");
    expect(nextRollLabel(run({ roll: 2 }))).toBe("FINAL ROLL");
    expect(primaryAction(GUIDED.DRAFTING, { run: run({ roll: 1 }) }).label).toBe("ROLL 2");
    expect(primaryAction(GUIDED.DRAFTING, { run: run({ roll: 2 }) }).label).toBe("FINAL ROLL");
  });
  it("the era reveal offers ADAPT TO ERA, Coach Chaos continues only once a coach is picked, Ready offers RUN CLASH", () => {
    expect(primaryAction(GUIDED.ERA_REVEAL).label).toBe("ADAPT TO ERA");
    expect(primaryAction(GUIDED.COACH_SELECT, { picked: null })).toMatchObject({ label: "CONTINUE WITH COACH", enabled: false });
    expect(primaryAction(GUIDED.COACH_SELECT, { picked: "c1" })).toMatchObject({ enabled: true });
    expect(primaryAction(GUIDED.READY)).toMatchObject({ action: "run", label: "RUN CLASH", enabled: true });
    expect(primaryAction(GUIDED.RESULT)).toBeNull();
  });
  it("a busy action says so and never changes which action it is", () => {
    expect(primaryAction(GUIDED.EMPTY, { spinning: true })).toMatchObject({ action: "deal", label: "DEALING…" });
    expect(primaryAction(GUIDED.READY, { spinning: true })).toMatchObject({ action: "run", label: "RUNNING…" });
  });
  it("nothing here predicts a winner", () => {
    for (const st of GUIDED_ORDER) {
      const a = primaryAction(st, { run: run() });
      if (a) expect(`${a.label} ${a.sub}`).not.toMatch(/win probability|likely winner|expected score|prediction/i);
    }
  });
});

describe("the information architecture follows the decision", () => {
  it("one contextual panel per state, none for the result", () => {
    expect(GUIDED_ORDER.map(contextualPanel)).toEqual(["guide", "intel-compact", "era", "roster", "matchup", null]);
  });
  it("the roster is interactive only while drafting, compressed from Coach Chaos onward, and the result is the only hero", () => {
    expect(GUIDED_ORDER.filter(rosterInteractive)).toEqual([GUIDED.DRAFTING]);
    expect(GUIDED_ORDER.filter(rosterCompressed)).toEqual([GUIDED.COACH_SELECT, GUIDED.READY, GUIDED.RESULT]);
    expect(GUIDED_ORDER.filter(showsResultHero)).toEqual([GUIDED.RESULT]);
  });
  it("a previous result may be reachable in every state except the result itself", () => {
    expect(GUIDED_ORDER.filter(showsPriorResult)).toEqual(GUIDED_ORDER.slice(0, 5));
  });
});

describe("announcements are built from real values", () => {
  it("holding and releasing name the player and count what remains", () => {
    expect(holdAnnouncement({ name: "Chris Paul" }, true, 1)).toBe("Chris Paul held. Four Gold roster positions remain.");
    expect(holdAnnouncement({ name: "Chris Paul" }, false, 0)).toBe("Chris Paul released. Five Gold roster positions remain.");
    expect(holdAnnouncement({ name: "X" }, true, 5)).toBe("X held. No Gold roster positions remain.");
  });
  it("the era reveal names the era and its real rules, and says nothing when there is none", () => {
    const r = run({ eraState: { revealed: true, eraStyleId: "1950s" }, era: { ruleFacts: ["No three-point line.", "Zone defenses illegal", "Hand-checking allowed"] } });
    expect(eraAnnouncement(r)).toBe("Era revealed: 1950s. No three-point line. Zone defenses illegal. Hand-checking allowed.");
    expect(eraAnnouncement(run())).toBe("");
  });
  it("coach and result announcements use the offer and the score", () => {
    expect(coachAnnouncement({ name: "Jerry Sloan", roleLabel: "Roster Maximizer" })).toBe("Jerry Sloan selected as Roster Maximizer.");
    expect(resultAnnouncement({ sim: { finalScore: { gold: 118, blue: 104 } } })).toBe("Clash complete. Team Gold wins 118 to 104.");
    expect(resultAnnouncement({ sim: { finalScore: { gold: 99, blue: 101 } } })).toBe("Clash complete. Team Blue wins 101 to 99.");
    expect(resultAnnouncement(null)).toBe("Clash complete.");
  });
  it("every state has an announcement", () => {
    for (const st of GUIDED_ORDER) expect(stateAnnouncement(st, { run: run({ eraState: { revealed: true, eraStyleId: "1970s" } }), result: { sim: { finalScore: { gold: 1, blue: 0 } } } }).length, st).toBeGreaterThan(0);
  });
});

describe("telemetry is a closed vocabulary", () => {
  it("eleven guided-flow events, each fired from one place", () => {
    expect(Object.values(GUIDED_EVENTS)).toEqual([
      "chaos_state_viewed", "chaos_primary_action", "era_reveal_viewed", "era_reveal_continued",
      "coach_chaos_viewed", "coach_offer_selected", "clash_ready_viewed", "run_clash_started",
      "result_state_viewed", "live_intel_expanded", "era_rules_expanded",
    ]);
  });
  it("entry events exist for the four states worth timing, and for no other", () => {
    expect(GUIDED_ORDER.map(stateViewEvent)).toEqual([null, null, "era_reveal_viewed", "coach_chaos_viewed", "clash_ready_viewed", "result_state_viewed"]);
  });
});
