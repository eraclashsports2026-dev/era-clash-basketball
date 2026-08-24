import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { POS_WEIGHTS, slotRating, displayOVR, analyzeBalance, teamRating } from "../src/rating.js";

const byId = (id) => PLAYERS.find((p) => p.id === id);

describe("player database", () => {
  it("the 1950s block is exactly the NBA 75th Anniversary Team members", () => {
    const fifties = PLAYERS.filter((p) => p.decade === "1950s").map((p) => p.name).sort();
    expect(fifties).toEqual([
      "Bill Russell", "Bill Sharman", "Bob Cousy", "Bob Pettit",
      "Dolph Schayes", "George Mikan", "Paul Arizin",
    ]);
  });

  it("the 1950s can still field a legal five at every position", () => {
    const fifties = PLAYERS.filter((p) => p.decade === "1950s");
    for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
      expect(fifties.filter((p) => p.positions.includes(pos)).length).toBeGreaterThan(0);
    }
  });

  it("covers all 8 era styles, including the 1950s", () => {
    const decades = new Set(PLAYERS.map((p) => p.decade));
    for (const d of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
      expect(decades.has(d)).toBe(true);
    }
  });

  it("never claims steals or blocks before the NBA recorded them (1973-74)", () => {
    for (const p of PLAYERS.filter((x) => x.decade === "1950s" || x.decade === "1960s")) {
      expect(p.stl).toBe(0);
      expect(p.blk).toBe(0);
    }
  });

  it("has exactly 337 entries with unique ids", () => {
    expect(PLAYERS.length).toBe(337); // 8 decades; the 1950s block is NBA-75 members only
    expect(new Set(PLAYERS.map((p) => p.id)).size).toBe(337);
  });
  it("every entry has the full stat + accolade schema", () => {
    for (const p of PLAYERS) {
      expect(typeof p.name).toBe("string");
      expect(p.positions).toContain(p.pos);
      for (const k of ["pts", "reb", "ast", "stl", "blk", "mvp", "fmvp", "dpoy", "an1", "an2", "an3", "ad1", "ad2", "win", "pop"]) {
        expect(typeof p[k], `${p.id}.${k}`).toBe("number");
        expect(p[k]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("rating v2 (locked coefficients — changes need CEO approval)", () => {
  it("keeps the documented positional weights", () => {
    expect(POS_WEIGHTS.PG.ast).toBe(1.9);
    expect(POS_WEIGHTS.PG.stl).toBe(2.3);
    expect(POS_WEIGHTS.C.blk).toBe(2.3);
    expect(POS_WEIGHTS.C.reb).toBe(1.6);
  });
  it("applies exactly a 12% out-of-position penalty", () => {
    const wilt = byId("wilt-60s"); // positions: ["C"] only
    const inPos = slotRating(wilt, "C");
    // compare against the same weights with fit forced (PG slot uses PG weights,
    // so recompute expected manually)
    const w = POS_WEIGHTS.PG;
    const production = wilt.pts * w.pts + wilt.reb * w.reb + wilt.ast * w.ast + wilt.stl * w.stl + wilt.blk * w.blk;
    const accolades = inPos - (wilt.pts * POS_WEIGHTS.C.pts + wilt.reb * POS_WEIGHTS.C.reb + wilt.ast * POS_WEIGHTS.C.ast + wilt.stl * POS_WEIGHTS.C.stl + wilt.blk * POS_WEIGHTS.C.blk);
    expect(slotRating(wilt, "PG")).toBeCloseTo((production + accolades) * 0.88, 6);
  });
  it("matches the shipped OVR examples", () => {
    const cases = { "jordan-90s": 99, "jokic-20s": 98, "moncrief-80s": 94, "bowen-2ks": 87, "booker-10s": 73 };
    for (const [id, ovr] of Object.entries(cases)) {
      const p = byId(id);
      expect(displayOVR(p, p.pos), id).toBe(ovr);
    }
  });
  it("keeps OVR in the 60–99 band for the whole pool", () => {
    for (const p of PLAYERS) {
      const o = displayOVR(p, p.pos);
      expect(o).toBeGreaterThanOrEqual(60);
      expect(o).toBeLessThanOrEqual(99);
    }
  });
});

describe("chemistry v2 (analyzeBalance)", () => {
  const team = (...ids) => ids.map(byId);
  it("rewards elite playmaking and flags missing playmaking", () => {
    const playmakers = team("magic-80s", "stock-90s", "lebron-10s", "jokic-20s", "kidd-00s");
    expect(analyzeBalance(playmakers).bonuses.some((b) => b.label === "Elite playmaking")).toBe(true);
    const noPass = team("ben-00s", "reggie-90s", "dantley-80s", "mcHale-80s", "ewing-90s");
    expect(analyzeBalance(noPass).gaps.some((g) => g.label === "No playmaking engine")).toBe(true);
  });
  it("flags hero-ball risk when one player dominates scoring", () => {
    const hero = team("wilt-60s", "cooper-80s", "bowen-2ks", "ben-00s", "smart-20s");
    expect(analyzeBalance(hero).gaps.some((g) => g.label === "Hero-ball risk")).toBe(true);
  });
  it("caps the multiplier at +8% / −12%", () => {
    for (let i = 0; i < 50; i++) {
      const t = [PLAYERS[i], PLAYERS[i + 40], PLAYERS[i + 90], PLAYERS[i + 140], PLAYERS[i + 200]];
      const m = analyzeBalance(t).multiplier;
      expect(m).toBeGreaterThanOrEqual(0.88);
      expect(m).toBeLessThanOrEqual(1.08);
    }
  });
  it("teamRating = sum of slot ratings × multiplier (rounded)", () => {
    const t = team("magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s");
    const slots = ["PG", "SG", "SF", "PF", "C"];
    const base = t.reduce((s, p, i) => s + slotRating(p, slots[i]), 0);
    expect(teamRating(t)).toBe(Math.round(base * analyzeBalance(t).multiplier));
  });
});
