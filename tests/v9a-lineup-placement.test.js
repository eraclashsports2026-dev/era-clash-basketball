// ── Phase 9A: multi-position placement, proven on the authoritative cards ────
// Every eligible position comes from the player card's own `positions` array.
// These tests use REAL cards from src/players.js so the rules are exercised on
// the data the builder actually reads, never on a stand-in shape.
import { describe, it, expect } from "vitest";
import { PLAYERS, POSITIONS, findCard } from "../src/players.js";
import {
  eligiblePositions, isEligibleAt, isLegalLineup, placementPlan, place,
  describeSelection, describePlacement, eligibleLabel, SLOT_STATE, PLACEMENT_MODE, PLACEMENT_VERSION,
} from "../src/lineupPlacement.js";

const empty = () => [null, null, null, null, null];
const idx = (pos) => POSITIONS.indexOf(pos);
const byPositions = (want) => {
  const p = PLAYERS.find((x) => JSON.stringify([...x.positions].sort()) === JSON.stringify([...want].sort()));
  if (!p) throw new Error(`no card with exactly ${want.join("/")}`);
  return p;
};
const card = (id) => { const c = findCard(id); if (!c) throw new Error(`no card ${id}`); return c; };

describe("eligible positions come from card data only", () => {
  it("reads every position the card states, primary first", () => {
    const kd = card("durant-10s");
    expect(kd.positions).toEqual(["SF", "PF", "SG"]);
    expect(eligiblePositions(kd)).toEqual(["SF", "PF", "SG"]);
    expect(eligibleLabel(kd)).toBe("SF · PF · SG");
  });
  it("a one-position specialist has exactly one", () => {
    const wilt = card("wilt-60s");
    expect(eligiblePositions(wilt)).toEqual(["C"]);
    expect(isEligibleAt(wilt, idx("C"))).toBe(true);
    expect(isEligibleAt(wilt, idx("PF"))).toBe(false);
  });
  it("never infers a position from anything but the card", () => {
    const fake = { id: "x", name: "Tall Person", decade: "2020s", team: "Nobody", pos: "C", positions: [] , pts: 40, reb: 20 };
    // No positions listed → falls back to the stated primary only, never to height, stats or name.
    expect(eligiblePositions(fake)).toEqual(["C"]);
    expect(eligiblePositions({ name: "No Data" })).toEqual([]);
  });
  it("every real card has at least one legal position and only legal ones", () => {
    for (const p of PLAYERS) {
      const e = eligiblePositions(p);
      expect(e.length, p.id).toBeGreaterThan(0);
      for (const s of e) expect(POSITIONS, `${p.id} ${s}`).toContain(s);
    }
  });
  it(`${PLAYERS.filter((p) => p.positions.length > 1).length} cards are multi-position`, () => {
    expect(PLAYERS.filter((p) => p.positions.length > 1).length).toBeGreaterThan(200);
  });
});

describe("placement plan states", () => {
  it("SF/PF on an empty five: two open, three ineligible, CHOOSE", () => {
    const p = byPositions(["SF", "PF"]);
    const plan = placementPlan(empty(), p);
    expect(plan.mode).toBe(PLACEMENT_MODE.CHOOSE);
    expect(plan.open.map((i) => POSITIONS[i]).sort()).toEqual(["PF", "SF"]);
    expect(plan.ineligible.map((i) => POSITIONS[i]).sort()).toEqual(["C", "PG", "SG"]);
    expect(plan.slots[idx("C")].state).toBe(SLOT_STATE.INELIGIBLE);
    expect(plan.slots[idx("C")].reason).toMatch(/not eligible at center/);
    expect(plan.legalCount).toBe(2);
  });
  it("PG/SG with PG taken: SG open and PG a swap → two legal choices, CHOOSE (never auto)", () => {
    const pg = byPositions(["PG"]);
    const p = byPositions(["PG", "SG"]);
    const five = empty(); five[idx("PG")] = pg;
    const plan = placementPlan(five, p);
    expect(plan.mode).toBe(PLACEMENT_MODE.CHOOSE);
    expect(plan.autoIndex).toBeNull();
    expect(plan.open.map((i) => POSITIONS[i])).toEqual(["SG"]);
    expect(plan.slots[idx("PG")].state).toBe(SLOT_STATE.OCCUPIED);
    expect(plan.legalCount).toBe(2);
  });
  it("a lone occupied eligible slot is a swap to confirm, never an automatic replacement", () => {
    const c = byPositions(["C"]);
    const wilt = card("wilt-60s");
    const five = empty(); five[idx("C")] = c;
    const plan = placementPlan(five, wilt);
    expect(plan.mode).toBe(PLACEMENT_MODE.SWAP_ONLY);
    expect(plan.autoIndex).toBeNull();
    expect(plan.legalCount).toBe(1);
  });
  it("PF/C with both taken: SWAP_ONLY, both offered, nothing open", () => {
    // No card in the database is PF-only, so the PF occupant is an SF/PF card.
    const pf = byPositions(["SF", "PF"]); const c = byPositions(["C"]);
    const p = byPositions(["PF", "C"]);
    const five = empty(); five[idx("PF")] = pf; five[idx("C")] = c;
    const plan = placementPlan(five, p);
    expect(plan.mode).toBe(PLACEMENT_MODE.SWAP_ONLY);
    expect(plan.open).toEqual([]);
    expect(plan.occupied.map((i) => POSITIONS[i]).sort()).toEqual(["C", "PF"]);
  });
  it("a three-position player sees three eligible slots", () => {
    const kd = card("durant-10s");
    const plan = placementPlan(empty(), kd);
    expect(plan.open.map((i) => POSITIONS[i]).sort()).toEqual(["PF", "SF", "SG"]);
    expect(plan.mode).toBe(PLACEMENT_MODE.CHOOSE);
  });
  it("a one-position specialist auto-places", () => {
    const wilt = card("wilt-60s");
    const plan = placementPlan(empty(), wilt);
    expect(plan.mode).toBe(PLACEMENT_MODE.AUTO);
    expect(POSITIONS[plan.autoIndex]).toBe("C");
  });
  it("the same person on another decade card is a duplicate, with zero legal slots", () => {
    const five = empty(); five[idx("C")] = card("russell-50s");
    const plan = placementPlan(five, card("bill-60s")); // Bill Russell, 1960s
    expect(plan.mode).toBe(PLACEMENT_MODE.DUPLICATE_PERSON);
    expect(plan.legalCount).toBe(0);
    expect(plan.duplicateIndex).toBe(idx("C"));
  });
});

describe("place()", () => {
  it("places into an open eligible slot", () => {
    const p = byPositions(["SF", "PF"]);
    const r = place(empty(), p, idx("PF"));
    expect(r.ok).toBe(true);
    expect(r.five[idx("PF")]).toBe(p);
    expect(isLegalLineup(r.five)).toBe(true);
    expect(describePlacement(r)).toMatch(/placed at power forward\. Undo is available\./);
  });
  it("refuses an ineligible slot and leaves the five untouched", () => {
    const p = byPositions(["SF", "PF"]);
    const five = empty();
    const r = place(five, p, idx("C"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INELIGIBLE");
    expect(r.five).toEqual(five);
  });
  it("refuses a duplicate canonical person", () => {
    const five = empty(); five[idx("C")] = card("russell-50s");
    const r = place(five, card("bill-60s"), idx("PF"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("DUPLICATE_PERSON");
    expect(r.message).toMatch(/already on this lineup/);
  });
  it("a swap into an occupied slot relocates the occupant when exactly one other eligible slot is open", () => {
    const occupant = byPositions(["PF", "C"]);
    const incoming = byPositions(["SF", "PF"]);
    const five = empty(); five[idx("PF")] = occupant;
    const r = place(five, incoming, idx("PF"));
    expect(r.ok).toBe(true);
    expect(r.five[idx("PF")]).toBe(incoming);
    expect(r.five[idx("C")]).toBe(occupant);
    expect(r.relocatedTo).toBe(idx("C"));
    expect(describePlacement(r)).toMatch(/moved to center/);
    expect(isLegalLineup(r.five)).toBe(true);
  });
  it("a swap whose occupant has no other open slot removes them, and says so", () => {
    const occupant = byPositions(["C"]);
    const incoming = byPositions(["PF", "C"]);
    const five = empty(); five[idx("C")] = occupant; five[idx("PF")] = byPositions(["SF", "PF"]);
    const r = place(five, incoming, idx("C"));
    expect(r.ok).toBe(true);
    expect(r.displaced).toBe(occupant);
    expect(r.relocatedTo).toBeNull();
    expect(r.five.filter(Boolean)).toHaveLength(2);
    expect(describePlacement(r)).toMatch(/left the lineup/);
  });
  it("never produces an illegal lineup", () => {
    // Exhaustive: every multi-position card into every slot of a random legal five.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 200; t++) {
      const five = empty();
      for (let i = 0; i < 5; i++) {
        if (rnd() < 0.5) continue;
        const pool = PLAYERS.filter((p) => isEligibleAt(p, i) && !five.some((x) => x && x.name === p.name));
        five[i] = pool[Math.floor(rnd() * pool.length)];
      }
      expect(isLegalLineup(five)).toBe(true);
      const p = PLAYERS[Math.floor(rnd() * PLAYERS.length)];
      for (let i = 0; i < 5; i++) {
        const r = place(five, p, i);
        if (r.ok) expect(isLegalLineup(r.five), `${p.id}@${POSITIONS[i]}`).toBe(true);
        else expect(r.five, "a refusal never mutates").toEqual(five);
      }
    }
  });
  it("undo is the caller's previous five, which place() never mutates", () => {
    const before = empty(); before[idx("PG")] = byPositions(["PG"]);
    const snapshot = before.slice();
    const r = place(before, byPositions(["SF", "PF"]), idx("SF"));
    expect(r.ok).toBe(true);
    expect(before).toEqual(snapshot);
  });
});

describe("what the screen reader hears", () => {
  it("names the player, every eligible position and the count", () => {
    const kd = card("durant-10s");
    const s = describeSelection(placementPlan(empty(), kd));
    expect(s).toBe("Kevin Durant selected. Eligible positions: small forward, power forward and shooting guard. Three legal positions available.");
  });
  it("matches the specification's two-position sentence", () => {
    const p = { id: "t", name: "Kevin Durant", pos: "SF", positions: ["SF", "PF"] };
    expect(describeSelection(placementPlan(empty(), p)))
      .toBe("Kevin Durant selected. Eligible positions: small forward and power forward. Two legal positions available.");
  });
  it("says one legal position for a specialist and none for a duplicate", () => {
    expect(describeSelection(placementPlan(empty(), card("wilt-60s")))).toMatch(/One legal position available\.$/);
    const five = empty(); five[idx("C")] = card("russell-50s");
    expect(describeSelection(placementPlan(five, card("bill-60s")))).toMatch(/already on this lineup\.$/);
  });
  it("has a version", () => { expect(PLACEMENT_VERSION).toBe("1.0.0"); });
});
