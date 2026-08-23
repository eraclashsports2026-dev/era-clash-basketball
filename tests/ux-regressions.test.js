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
  it("engine turning point is 2–3 sentences grounded in the real edge and margin", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const core = simulateGame(gold, blue, mulberry32(seed));
      expect(core.turningPoint?.text).toBeTruthy();
      const sents = sentences(core.turningPoint.text);
      expect(sents.length, core.turningPoint.text).toBeGreaterThanOrEqual(2);
      expect(sents.length).toBeLessThanOrEqual(3);
      // grounded: names the winner's biggest edge category and no exact clock times
      expect(core.turningPoint.text.toLowerCase()).toContain(core.keyEdge.category.toLowerCase().slice(0, 8));
      expect(core.turningPoint.text).not.toMatch(/\d+:\d{2}/);
    }
  });
});
