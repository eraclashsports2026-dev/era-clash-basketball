// ── v2.3.2 UX regression tests ─────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { genRoster, genOpponent } from "../src/draft.js";
import { validateTeamIds } from "../api/_lib/validate.js";
import { computeResult, mvpSummary, newSeed } from "../api/_lib/game-core.js";
import { simulateGame, mulberry32 } from "../src/engine.js";

const byId = (id) => PLAYERS.find((p) => p.id === id);
const sentences = (s) => String(s || "").split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 10);

describe("random team generation feeds the authoritative flow", () => {
  it("Random Gold and Random Blue produce independent, server-valid fives", () => {
    for (let i = 0; i < 25; i++) {
      const gold = genRoster(Math.random);
      const blue = genOpponent(Math.random);
      // ids must pass the exact server validation (canonical, no dup persons)
      expect(validateTeamIds(gold.map((p) => p.id)), `gold run ${i}`).not.toBeNull();
      expect(validateTeamIds(blue.map((p) => p.id)), `blue run ${i}`).not.toBeNull();
    }
  });
  it("independently generated teams are not coupled", () => {
    const a = genRoster(mulberry32(1)).map((p) => p.id);
    const b = genOpponent(mulberry32(2)).map((p) => p.id);
    expect(a).not.toEqual(b);
  });
});

describe("MVP explanation depth", () => {
  const gold = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"].map(byId);
  const blue = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"].map(byId);

  it("deterministic MVP fallback has 2–3 grounded sentences citing the real line", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const core = simulateGame(gold, blue, mulberry32(seed));
      const text = mvpSummary(core);
      const sents = sentences(text);
      expect(sents.length, text).toBeGreaterThanOrEqual(2);
      expect(sents.length).toBeLessThanOrEqual(3);
      expect(text).toContain(core.mvp);                       // names the actual MVP
      expect(text).toContain(String(core.mvpLine.pts));       // cites the actual points
    }
  });
  it("summary fallback is 4–6 sentences naming duels from BOTH teams", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = computeResult(seed % 2 ? "single" : "best7", gold, blue, seed);
      const sents = sentences(r.fallbackSummary);
      expect(sents.length, r.fallbackSummary).toBeGreaterThanOrEqual(4);
      expect(sents.length).toBeLessThanOrEqual(6);
      const goldNames = gold.map((p) => p.name), blueNames = blue.map((p) => p.name);
      expect(goldNames.some((n) => r.fallbackSummary.includes(n))).toBe(true);
      expect(blueNames.some((n) => r.fallbackSummary.includes(n))).toBe(true);
    }
  });

  it("every computed result payload carries mvpFallback", () => {
    const single = computeResult("single", gold, blue, newSeed());
    expect(sentences(single.mvpFallback).length).toBeGreaterThanOrEqual(2);
    const season = computeResult("82", gold, null, newSeed());
    expect(sentences(season.mvpFallback).length).toBeGreaterThanOrEqual(2);
    const tourney = computeResult("tournament", gold, null, newSeed());
    expect(sentences(tourney.rounds[0].mvpFallback).length).toBeGreaterThanOrEqual(2);
  });
});

describe("turning point depth", () => {
  const gold = ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "hak-90s"].map(byId);
  const blue = ["trae-20s", "ant-20s", "butler-10s", "draymond-10s", "bam-20s"].map(byId);
  it("engine turning point is 4–6 sentences with named positional-duel breakdowns", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const core = simulateGame(gold, blue, mulberry32(seed));
      expect(core.turningPoint?.text).toBeTruthy();
      const text = core.turningPoint.text;
      const sents = sentences(text);
      expect(sents.length, text).toBeGreaterThanOrEqual(4);
      expect(sents.length).toBeLessThanOrEqual(6);
      // grounded: the winner's biggest edge, a named winner-side duel driver,
      // a named loser-side answer, and no exact clock times
      expect(text.toLowerCase()).toContain(core.keyEdge.category.toLowerCase().slice(0, 8));
      const winnerNames = (core.winner === "Gold" ? core.teamAStats : core.teamBStats).map((r) => r.name);
      const loserNames = (core.winner === "Gold" ? core.teamBStats : core.teamAStats).map((r) => r.name);
      expect(winnerNames.some((n) => text.includes(n)), text).toBe(true);
      expect(loserNames.some((n) => text.includes(n)), text).toBe(true);
      expect(text).not.toMatch(/\d+:\d{2}/);
    }
  });
  it("slot duels carry names, real box lines, and rating gaps", () => {
    const core = simulateGame(gold, blue, mulberry32(7));
    expect(core.slotDuels.length).toBe(5);
    for (const d of core.slotDuels) {
      expect(["PG", "SG", "SF", "PF", "C"]).toContain(d.pos);
      expect(typeof d.gold.pts).toBe("number");
      expect(typeof d.blue.pts).toBe("number");
      expect(Number.isFinite(d.ratingEdge)).toBe(true);
    }
  });
});
