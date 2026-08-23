import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { validateSim } from "../src/simClient.js";

const byId = (id) => PLAYERS.find((p) => p.id === id);
const my = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"].map(byId);
const opp = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"].map(byId);

const box = (names, pts) => names.map((n, i) => ({ name: n, pts: pts[i], reb: 5, ast: 4, stl: 1, blk: 1 }));
const goodSim = () => ({
  winner: "Gold",
  seriesResult: "112-105",
  teamAStats: box(my.map((p) => p.name), [30, 25, 22, 20, 15]),        // 112
  teamBStats: box(opp.map((p) => p.name), [28, 20, 22, 18, 17]),       // 105
  summary: "Gold controlled the paint.",
  mvp: "Michael Jordan",
  mvpReason: "30 points on efficient shooting",
});

describe("model output validation (never trust the LLM)", () => {
  it("accepts a well-formed single-game sim", () => {
    expect(validateSim(goodSim(), my, opp, "single").ok).toBe(true);
  });
  it("rejects a winner whose box total is lower", () => {
    const s = goodSim();
    s.winner = "Blue"; // Blue totals 105 < Gold 112
    const v = validateSim(s, my, opp, "single");
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/winner\/box mismatch/);
  });
  it("rejects missing or non-participant MVP", () => {
    const s1 = goodSim(); delete s1.mvp;
    expect(validateSim(s1, my, opp, "single").ok).toBe(false);
    const s2 = goodSim(); s2.mvp = "Kobe Bryant"; // not in this game
    expect(validateSim(s2, my, opp, "single").ok).toBe(false);
  });
  it("rejects negative or absurd stat values", () => {
    const s = goodSim();
    s.teamAStats[0].reb = -3;
    expect(validateSim(s, my, opp, "single").ok).toBe(false);
    const s2 = goodSim();
    s2.teamBStats[2].pts = 400;
    expect(validateSim(s2, my, opp, "single").ok).toBe(false);
  });
  it("rejects a best-of-7 where the winner lacks 4 wins", () => {
    const s = goodSim();
    s.seriesResult = "3-2";
    expect(validateSim(s, my, opp, "series7").ok).toBe(false);
    s.seriesResult = "4-2";
    expect(validateSim(s, my, opp, "series7").ok).toBe(true);
    s.seriesResult = "2-4"; // Gold declared winner but has 2 wins
    const v = validateSim(s, my, opp, "series7");
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/contradicts winner/);
  });
  it("rejects garbage shapes without throwing", () => {
    expect(validateSim(null, my, opp, "single").ok).toBe(false);
    expect(validateSim("nope", my, opp, "single").ok).toBe(false);
    expect(validateSim({}, my, opp, "single").ok).toBe(false);
    expect(validateSim({ winner: "Gold", teamAStats: [] }, my, opp, "single").ok).toBe(false);
  });
});
