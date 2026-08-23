import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { simulateGame, simulateSeries, simulateSeason, mulberry32, matchupEdges } from "../src/engine.js";

const byId = (id) => PLAYERS.find((p) => p.id === id);
const A = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"].map(byId);
const B = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"].map(byId);

describe("deterministic engine", () => {
  it("is reproducible for the same seed", () => {
    const g1 = simulateGame(A, B, mulberry32(7));
    const g2 = simulateGame(A, B, mulberry32(7));
    expect(g1).toEqual(g2);
  });
  it("player points reconcile exactly with team totals", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = simulateGame(A, B, mulberry32(seed));
      expect(g.teamAStats.reduce((s, r) => s + r.pts, 0)).toBe(g.finalScore.gold);
      expect(g.teamBStats.reduce((s, r) => s + r.pts, 0)).toBe(g.finalScore.blue);
    }
  });
  it("winner always has the higher score and no negative values", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = simulateGame(A, B, mulberry32(seed));
      const goldWon = g.winner === "Gold";
      expect(goldWon ? g.finalScore.gold : g.finalScore.blue)
        .toBeGreaterThan(goldWon ? g.finalScore.blue : g.finalScore.gold);
      for (const r of [...g.teamAStats, ...g.teamBStats]) {
        for (const k of ["pts", "reb", "ast", "stl", "blk"]) expect(r[k]).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("MVP comes from the winning team", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = simulateGame(A, B, mulberry32(seed));
      const winnerNames = (g.winner === "Gold" ? g.teamAStats : g.teamBStats).map((r) => r.name);
      expect(winnerNames).toContain(g.mvp);
    }
  });
  it("upsets exist but the favorite wins the majority", () => {
    const rng = mulberry32(42);
    let aWins = 0;
    for (let i = 0; i < 400; i++) if (simulateGame(A, B, rng).winner === "Gold") aWins++;
    expect(aWins).toBeGreaterThan(200); // A is clearly stronger
    expect(aWins).toBeLessThan(400);    // ...but never invincible
  });
});

describe("best-of-7", () => {
  it("winner always has exactly 4 wins, loser at most 3", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = simulateSeries(A, B, mulberry32(seed));
      const [w, l] = s.seriesResult.split("-").map(Number);
      expect(w).toBe(4);
      expect(l).toBeLessThanOrEqual(3);
      expect(s.games.length).toBe(w + l);
    }
  });
  it("seriesResult is WINNER-FIRST even when Blue wins (never '2-4')", () => {
    // weak Gold vs elite Blue → Blue wins most series; every result must
    // still read winner-first, and reconcile with the explicit seriesScore
    const weak = ["bowen-2ks", "cooper-80s", "mookie-90s", "rodman-90s", "camby-2ks"].map(byId);
    let blueWins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = simulateSeries(weak, A, mulberry32(seed));
      const [w, l] = s.seriesResult.split("-").map(Number);
      expect(w, s.seriesResult).toBe(4);
      expect(l).toBeLessThanOrEqual(3);
      if (s.winner === "Blue") {
        blueWins++;
        expect(s.seriesScore.blue).toBe(4);
        expect(s.seriesResult).toBe(`${s.seriesScore.blue}-${s.seriesScore.gold}`);
      } else {
        expect(s.seriesResult).toBe(`${s.seriesScore.gold}-${s.seriesScore.blue}`);
      }
    }
    expect(blueWins).toBeGreaterThan(15); // the scenario actually exercised Blue wins
  });
});

describe("engine season", () => {
  it("plays exactly 82 games and reconciles W-L", () => {
    const genOpp = () => B;
    const s = simulateSeason(A, genOpp, mulberry32(3));
    expect(s.wins + s.losses).toBe(82);
    expect(s.games.length).toBe(82);
  });
});

describe("matchup edges", () => {
  it("are bounded, symmetric in sign, and based on real categories", () => {
    const e1 = matchupEdges(A, B);
    const e2 = matchupEdges(B, A);
    for (const e of e1) {
      expect(Math.abs(e.edge)).toBeLessThanOrEqual(20);
      const mirror = e2.find((x) => x.category === e.category);
      expect(Math.sign(mirror.edge)).toBe(-Math.sign(e.edge) || 0);
    }
    // spacing team should own the spacing category
    const spacing = matchupEdges(B, A).find((e) => e.category === "Spacing & Shooting");
    expect(spacing.edge).toBeGreaterThan(0);
  });
});
