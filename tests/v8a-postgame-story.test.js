// ── Phase 8A / Workstreams 16, 18, 19: postgame story ────────────────────────
import { describe, it, expect } from "vitest";
import { deriveSalientMoments, deriveQuarterFlow, buildDeterministicSummary, phaseOf, periodBoundsOf } from "../api/_lib/postgameStory.js";

const cards = new Map([["a", { name: "Ann Adams" }], ["b", { name: "Ben Brooks" }]]);

/** Build a ledger: a trivial early lead change, then a huge fourth quarter. */
const ledger = () => {
  const out = [];
  let i = 0;
  const poss = (period, offense, points, primary = "a", outcome = points ? "MADE_FG" : "MISS_DREB") =>
    out.push({ i: i++, period, offense, points, primary, outcome, action: "ISOLATION" });
  // Q1: 8-7, decided by a one-point swing. Trivial.
  for (let k = 0; k < 4; k++) { poss(1, "gold", 2); poss(1, "blue", 2); }
  poss(1, "blue", 0, "b", "MISS_DREB");
  // Q2, Q3: even.
  for (let k = 0; k < 6; k++) { poss(2, "gold", 2); poss(2, "blue", 2); }
  for (let k = 0; k < 6; k++) { poss(3, "gold", 2); poss(3, "blue", 2); }
  // Q4: Gold 32, Blue 16 — the game's actual story.
  for (let k = 0; k < 16; k++) poss(4, "gold", 2);
  for (let k = 0; k < 8; k++) { poss(4, "blue", 2); poss(4, "blue", 0, "b", "MISS_DREB"); }
  return out;
};

describe("key moments are salient, not merely recorded", () => {
  it("does not let a trivial early lead change outrank a decisive fourth quarter", () => {
    const m = deriveSalientMoments(ledger(), cards, 4);
    expect(m.length).toBeGreaterThanOrEqual(1);
    const q4 = m.filter((x) => x.period === "Q4");
    expect(q4.length).toBeGreaterThan(0);
    // Nothing describing the 8-7 first quarter survives selection.
    expect(m.some((x) => /8-7/.test(x.text))).toBe(false);
    const top = [...m].sort((a, b) => b.salience - a.salience)[0];
    expect(top.period).toBe("Q4");
  });

  it("requires category diversity — no two moments describe the same kind of event", () => {
    const m = deriveSalientMoments(ledger(), cards, 4);
    const cats = m.map((x) => x.category);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("returns between three and five moments when the game supports them", () => {
    const m = deriveSalientMoments(ledger(), cards, 4);
    expect(m.length).toBeLessThanOrEqual(5);
  });

  it("emits nothing rather than inventing a moment from an empty ledger", () => {
    expect(deriveSalientMoments([], cards, 4)).toEqual([]);
  });

  it("labels overtime as OT, never Q5", () => {
    const l = ledger().concat([{ i: 999, period: 5, offense: "gold", points: 2, primary: "a", outcome: "MADE_FG" }]);
    const m = deriveSalientMoments(l, cards, 4);
    expect(m.every((x) => x.period !== "Q5")).toBe(true);
  });
});

describe("quarter flow", () => {
  it("reports each period's score, state and leading scorer", () => {
    const f = deriveQuarterFlow(ledger(), cards, 4);
    expect(f).toHaveLength(4);
    expect(f[3].period).toBe("Q4");
    expect(f[3].gold).toBe(32);
    expect(f[3].blue).toBe(16);
    expect(f[3].state).toMatch(/Gold leading/);
    expect(f[3].leadingScorer.name).toBe("Ann Adams");
  });

  it("derives Early/Mid/Late from possession position, never a fabricated clock", () => {
    const l = ledger();
    const bounds = periodBoundsOf(l);
    const q4 = l.filter((e) => e.period === 4);
    expect(phaseOf(q4[0], bounds)).toBe("Early");
    expect(phaseOf(q4[q4.length - 1], bounds)).toBe("Late");
    const f = deriveQuarterFlow(l, cards, 4);
    expect(JSON.stringify(f)).not.toMatch(/\d+:\d\d/);   // no clock anywhere
  });
});

describe("deterministic opening summary", () => {
  const record = {
    core: {
      winner: "Gold", finalScore: { gold: 100, blue: 84 },
      mvpLine: { name: "Ann Adams", pts: 41, reb: 12, ast: 3, stl: 4, blk: 1 },
    },
  };
  it("leads with the player, not the pregame prediction", () => {
    const l = ledger();
    const s = buildDeterministicSummary({
      record, quarterFlow: deriveQuarterFlow(l, cards, 4),
      moments: deriveSalientMoments(l, cards, 4), patterns: [],
    });
    expect(s.headline).toBe("How Gold Won");
    expect(s.body.startsWith("Ann Adams")).toBe(true);
    expect(s.body).toContain("41 points");
    expect(s.body).not.toMatch(/pre-game|pregame|comfortable win|chemistry/i);
  });

  it("is available with no narrative provider involved at all", () => {
    const s = buildDeterministicSummary({ record, quarterFlow: [], moments: [], patterns: [] });
    expect(s.body.length).toBeGreaterThan(10);
  });
});
