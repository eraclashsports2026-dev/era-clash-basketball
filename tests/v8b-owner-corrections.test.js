// ── Phase 8B: owner-reported corrections ─────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { POSITIONS, PLAYERS } from "../src/players.js";
import { startRun, submitHolds, submitCoachHolds, submitRollDecisions, selectCoach, abandonRun, publicView, PHASES, TOTAL_COACH_ROLLS } from "../src/chaos/runState.js";
import { generateOffers, explainOffer } from "../src/chaos/coachOffers.js";
import { drawFive } from "../src/chaos/draftOdds.js";
import { computeResultPreview } from "../api/_lib/previewEngine.js";
import { buildEvidencePacket, validateNarrativeClaims } from "../api/_lib/narrativeEvidence.js";
import { buildExpandedAnalysis, deriveQuarterFlow, eraImpactLine } from "../api/_lib/postgameStory.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr[i]) || null]));
const five = (seed, side, opp = []) => {
  const r = drawFive({ seedId: seed, side, roll: 3, opponentNames: opp });
  return POSITIONS.map((s) => r[s]);
};
const game = (seed = "t1", eraStyleId = "1990s") => {
  const gold = five(seed, "gold");
  const blue = five(seed, "blue", gold.map((p) => p.name));
  return computeResultPreview("single", gold, blue, { coachGoldId: "phil-jackson", coachBlueId: "pat-riley", eraStyleId }, 4242);
};

// These are Phase 8B's approved corrections, so they are asserted against the
// flow people actually play: the synchronized sequence. `hold` submits the
// player half of a roll decision and keeps no coaches, which is the same
// player-side behaviour 8B specified.
const hold = (run, holdSlots) => submitRollDecisions(run, { holdSlots, holdRoles: [], hydrate });

describe("player draft state", () => {
  it("keeps a card that was held, and replaces one that was released", () => {
    const r = startRun({ runId: "a".repeat(10), seedId: "hold-1", createdAt: 0 });
    const before = [...r.goldRoster];
    hold(r, ["PG", "C"]);
    expect(r.goldRoster[0]).toBe(before[0]);
    expect(r.goldRoster[4]).toBe(before[4]);
    expect(r.goldRoster[1]).not.toBe(before[1]);
  });

  it("reports kept cards as still held so the next round starts selected", () => {
    const r = startRun({ runId: "b".repeat(10), seedId: "hold-2", createdAt: 0 });
    hold(r, ["SG", "SF"]);
    const v = publicView(r, { hydrate });
    expect(v.gold.heldSlots).toEqual(expect.arrayContaining(["SG", "SF"]));
  });

  it("accepts every hold cardinality from none to all five", () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const r = startRun({ runId: "c".repeat(10), seedId: `n${n}`, createdAt: 0 });
      expect(hold(r, POSITIONS.slice(0, n)).ok).toBe(true);
      expect(r.currentRoll).toBe(2);
    }
  });

  it("refuses a malformed hold list without mutating the run", () => {
    const r = startRun({ runId: "d".repeat(10), seedId: "bad", createdAt: 0 });
    expect(hold(r, ["PG", "PG"]).code).toBe("DUPLICATE_SLOT");
    expect(hold(r, ["QQ"]).code).toBe("UNKNOWN_SLOT");
    expect(hold(r, null).code).toBe("VALIDATION_FAILURE");
    expect(r.currentRoll).toBe(1);
  });

  it("locks after exactly three rolls and reveals the era with Roll 2", () => {
    const r = startRun({ runId: "e".repeat(10), seedId: "rolls", createdAt: 0 });
    expect(r.revealedEraStyleId).toBeNull();
    hold(r, []);
    expect(r.currentRoll).toBe(2);
    expect(r.revealedEraStyleId).toBeTruthy();
    hold(r, []);
    expect(r.currentRoll).toBe(3);
    expect(publicView(r, { hydrate }).rostersLocked).toBe(true);
    expect(hold(r, []).ok).toBe(false);
  });

  it("can be abandoned, and an abandoned run never advances again", () => {
    const r = startRun({ runId: "f".repeat(10), seedId: "abandon", createdAt: 0 });
    expect(abandonRun(r).ok).toBe(true);
    expect(r.status).toBe("ABANDONED");
    expect(r.currentPhase).toBe("ABANDONED");
  });
});

describe("roster summaries use one schema", () => {
  it("gives both teams every field, with truthful neutral values", () => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const r = startRun({ runId: "g".repeat(10), seedId: seed, createdAt: 0 });
      const v = publicView(r, { hydrate });
      const want = ["talentTier", "constructionTier", "constructionBlurb", "bestStrength", "biggestRisk", "opponentMatchup"];
      for (const side of ["gold", "blue"]) {
        for (const k of want) expect(v[side].analysis[k], `${side}.${k} on seed ${seed}`).toBeTruthy();
      }
      expect(Object.keys(v.gold.analysis)).toEqual(Object.keys(v.blue.analysis));
    }
  });
});

// The Phase 8B coach draft — three coach rolls of their own, after the rosters
// lock. It is the LEGACY flow now: only a run minted under sequence 1 walks it,
// which is exactly what a challenge link shared before the synchronized draft
// existed does. The same corrections under the current flow (multi-hold on both
// boards, burns, no fourth roll, coach identity preserved) are held by
// tests/chaos-synchronized-draft.test.js.
describe("coach draft (sequence 1, as shared links still play it)", () => {
  const toDraft = (seed) => {
    const r = startRun({ runId: "h".repeat(10), seedId: seed, createdAt: 0, sequence: 1 });
    submitHolds(r, { holdSlots: [], hydrate });
    submitHolds(r, { holdSlots: [], hydrate });
    return r;
  };

  it("runs three coach rolls with holds and burns", () => {
    const r = toDraft("cd-1");
    const v1 = publicView(r, { hydrate });
    expect(v1.coachDraft.roll).toBe(1);
    expect(v1.coachDraft.totalRolls).toBe(TOTAL_COACH_ROLLS);
    const kept = v1.coachDraft.offers[0];
    const dropped = v1.coachDraft.offers.slice(1).map((o) => o.coachId);
    submitCoachHolds(r, { holdRoles: [kept.role], hydrate });
    const v2 = publicView(r, { hydrate });
    expect(v2.coachDraft.offers.find((o) => o.role === kept.role).coachId).toBe(kept.coachId);
    for (const o of v2.coachDraft.offers) expect(dropped).not.toContain(o.coachId);
    submitCoachHolds(r, { holdRoles: [], hydrate });
    expect(publicView(r, { hydrate }).coachDraft.selecting).toBe(true);
    expect(submitCoachHolds(r, { holdRoles: [], hydrate }).ok).toBe(false);
  });

  it("refuses a malformed coach hold list", () => {
    const r = toDraft("cd-2");
    expect(submitCoachHolds(r, { holdRoles: ["NOPE"], hydrate }).code).toBe("UNKNOWN_ROLE");
    expect(submitCoachHolds(r, { holdRoles: ["ROSTER_MAXIMIZER", "ROSTER_MAXIMIZER"], hydrate }).code).toBe("DUPLICATE_ROLE");
  });

  it("offers three strategically distinct staffs on every roll", () => {
    for (let i = 0; i < 15; i++) {
      const g = drawFive({ seedId: `d${i}`, side: "gold", roll: 3 });
      const b = drawFive({ seedId: `d${i}`, side: "blue", roll: 3, opponentNames: Object.values(g).map((p) => p.name) });
      for (const roll of [1, 2, 3]) {
        const offers = generateOffers({ roster: g, opponentRoster: b, eraId: "1990s", seedId: `d${i}`, side: "gold", roll });
        const ex = offers.map((o) => explainOffer({ offer: o, roster: g, opponentRoster: b, eraId: "1990s" }));
        expect(new Set(offers.map((o) => o.coachId)).size).toBe(3);
        expect(new Set(ex.map((e) => e.offense)).size).toBe(3);
      }
    }
  });

  it("does not always return the same three best-fitting coaches", () => {
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      const g = drawFive({ seedId: `v${i}`, side: "gold", roll: 3 });
      const b = drawFive({ seedId: `v${i}`, side: "blue", roll: 3, opponentNames: Object.values(g).map((p) => p.name) });
      generateOffers({ roster: g, opponentRoster: b, eraId: "2000s", seedId: `v${i}`, side: "gold", roll: 1 })
        .forEach((o) => seen.add(o.coachId));
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe("era stays visible", () => {
  it("hides the era before Roll 2 and carries it on every view after", () => {
    const r = startRun({ runId: "i".repeat(10), seedId: "era-1", createdAt: 0 });
    expect(publicView(r, { hydrate }).eraContext).toBeNull();
    hold(r, []);
    const v = publicView(r, { hydrate });
    expect(v.eraContext.headline).toMatch(/ERA$/);
    expect(v.eraContext.highlights.filter(Boolean).length).toBeGreaterThan(0);
    hold(r, []);
    // Rolls are done: the era is still on screen through hiring and READY.
    expect(publicView(r, { hydrate }).eraContext).toBeTruthy();
    const offered = r.coachOffers.gold[0].coachId;
    expect(selectCoach(r, { coachId: offered }).ok).toBe(true);
    expect(publicView(r, { hydrate }).eraContext).toBeTruthy();
  });

  it("states a factual era impact for every era", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
      expect(eraImpactLine(era)).toContain(era);
    }
  });
});

describe("narrative validation accepts the record's own facts", () => {
  const res = game("nv-1");
  const packet = buildEvidencePacket(res);

  it("accepts a real quarter score", () => {
    const p = res.v3.periodScores[1];
    expect(validateNarrativeClaims({ summary: `A ${p.gold}-${p.blue} second quarter.` }, packet).ok).toBe(true);
  });

  it("accepts a real shooting line", () => {
    const l = res.v3.fullBox.gold[0];
    expect(validateNarrativeClaims({ summary: `${l.name} shot ${l.fgm}-${l.fga}.` }, packet).ok).toBe(true);
  });

  it("still rejects an invented score and an invented total", () => {
    expect(validateNarrativeClaims({ summary: "Gold led 77-12 after one." }, packet).ok).toBe(false);
    const l = res.v3.fullBox.gold[0];
    expect(validateNarrativeClaims({ summary: `${l.name} scored 999 points.` }, packet).ok).toBe(false);
  });
});

describe("expanded analysis is always available", () => {
  it("builds a multi-section analysis with an honest source label", () => {
    const res = game("ea-1", "1970s");
    const ea = buildExpandedAnalysis({
      record: res, quarterFlow: res.v3.quarterFlow, moments: res.v3.keyMoments,
      patterns: res.v3.matchupPatterns, coaching: res.v3.coaching, eraId: "1970s",
    });
    expect(ea.analysisSource).toBe("DETERMINISTIC_EXPANDED");
    expect(ea.sections.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(ea)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });
});

describe("quarter stories", () => {
  it("carries two or three events per quarter with no fabricated clock", () => {
    const res = game("qs-1");
    const qf = res.v3.quarterFlow;
    expect(qf.length).toBeGreaterThanOrEqual(4);
    for (const q of qf) {
      expect(q.events.length).toBeLessThanOrEqual(3);
      for (const e of q.events) {
        expect(e.when).toBeTruthy();
        expect(e.text).toBeTruthy();
        expect(`${e.when} ${e.text}`).not.toMatch(/\b\d{1,2}:\d{2}\b/);
      }
    }
  });
});

describe("coaching report", () => {
  it("groups a repeated adjustment into one line", () => {
    const res = game("cg-1", "2000s");
    for (const side of ["gold", "blue"]) {
      const adj = res.v3.coaching[side].adjustments;
      const keys = adj.map((a) => `${a.trigger}|${a.response}`);
      expect(new Set(keys).size, "no trigger+response pair appears twice").toBe(keys.length);
      for (const a of adj) {
        expect(a.when).toBeTruthy();
        expect(a.scoreState).toBeTruthy();
      }
    }
  });

  it("prints no raw enum and never says 'the staff'", () => {
    const res = game("cg-2");
    const blob = JSON.stringify(res.v3.coaching);
    expect(blob).not.toMatch(/switch_heavy|drop_heavy|MAN_ILLEGAL_DEFENSE|AGGRESSIVE_SHOW/);
    expect(blob).not.toMatch(/so the staff/);
  });
});

describe("the draft-shaped postgame section is gone", () => {
  it("is not rendered anywhere in the postgame", () => {
    const src = readFileSync("src/components/Postgame.jsx", "utf8");
    for (const gone of ["HOW YOUR DRAFT SHAPED THE GAME", "BEST HOLD", "BIGGEST GAMBLE", "ERA ADAPTATION", "CPU DECISION"]) {
      expect(src, `${gone} must not be rendered`).not.toContain(gone);
    }
  });

  it("still stores the draft history on the record for replay and challenges", () => {
    const src = readFileSync("api/game.js", "utf8");
    expect(src).toContain("chaosDraft: req._chaosRun ? draftHistory(req._chaosRun) : null");
  });
});

describe("Before Tipoff survives the postgame edits", () => {
  it("is still rendered on the coaching tab", () => {
    // A Phase 8B block edit removed this alongside the draft-shaped section.
    // The stored pregame read is a separate contract and must stay.
    const src = readFileSync("src/components/Postgame.jsx", "utf8");
    expect(src).toContain("BEFORE TIPOFF");
    expect(src, "StoredPregameRead must actually be rendered, not merely defined")
      .toMatch(/<StoredPregameRead\s+pregame=/);
  });
});
