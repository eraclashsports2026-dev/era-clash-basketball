// ── Regression battery for the QA sweep of 2026-08-24 ─────────────────────────
// Every test here corresponds to a defect found by playing the live build as a
// user. They exist so these specific failures cannot come back silently.
import { describe, it, expect, beforeAll } from "vitest";
import { PLAYERS } from "../src/players.js";
import { computeResultV3 } from "../api/_lib/game-core-v3.js";
import { simulateSeasonV3, resolveCoach, resolveEra } from "../src/v3/engine.js";
import { opponentGenerator, DIFFICULTIES, validDifficulty } from "../src/v3/difficulty.js";
import { dailyOpponent, utcDateKey, dailySeed, replayDaily } from "../src/dailyChallenge.js";

const t = (ids) => ids.map((id) => { const p = PLAYERS.find((x) => x.id === id); if (!p) throw new Error(`missing ${id}`); return p; });
const GOLD = t(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"]);
const BLUE = t(["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"]);
const OPTS = { coachGoldId: "phil-jackson", coachBlueId: "steve-kerr", eraStyleId: "1990s" };

describe("tournament mode (was: ENGINE_FAILURE on every run)", () => {
  it("produces a real bracket instead of crashing", () => {
    const r = computeResultV3("tournament", GOLD, null, { ...OPTS, difficulty: "pro" }, 7);
    expect(Array.isArray(r.rounds)).toBe(true);
    expect(r.rounds.length).toBeGreaterThanOrEqual(1);
    expect(r.rounds.length).toBeLessThanOrEqual(4);
    for (const round of r.rounds) {
      expect(round.name).toBeTruthy();
      expect(round.oppIds).toHaveLength(5);
      expect(round.core.seriesResult).toMatch(/^\d-\d$/);
      expect(typeof round.advanced).toBe("boolean");
      expect(round.fallbackSummary.length).toBeGreaterThan(40);
    }
    // a bracket stops at the first loss; a champion won all four
    const losses = r.rounds.filter((x) => !x.advanced).length;
    expect(losses).toBeLessThanOrEqual(1);
    expect(r.won).toBe(r.rounds.length === 4 && r.rounds[3].advanced);
  });

  it("is reproducible from its seed", () => {
    const a = computeResultV3("tournament", GOLD, null, { ...OPTS, difficulty: "pro" }, 4242);
    const b = computeResultV3("tournament", GOLD, null, { ...OPTS, difficulty: "pro" }, 4242);
    expect(b.rounds.map((x) => x.core.seriesResult)).toEqual(a.rounds.map((x) => x.core.seriesResult));
  });
});

describe("Win 82 difficulty (was: superteams stuck near .500)", () => {
  const era = resolveEra("2020s"), N = resolveCoach("neutral");
  const wins = (team, diff, seed) => simulateSeasonV3(team, opponentGenerator(diff), N, N, era, seed).wins;

  it("an all-time five posts an all-time record on the default setting", () => {
    const avg = [0, 1, 2].reduce((s, i) => s + wins(GOLD, "pro", 3000 + i), 0) / 3;
    expect(avg).toBeGreaterThan(55); // was ~43 with the old fixed elite pool
  });

  it("difficulty monotonically raises the bar", () => {
    const seed = 3100;
    const rookie = wins(GOLD, "rookie", seed);
    const allstar = wins(GOLD, "allstar", seed);
    const legend = wins(GOLD, "legend", seed);
    expect(rookie).toBeGreaterThan(allstar);
    expect(allstar).toBeGreaterThan(legend);
    expect(legend).toBeGreaterThan(20); // brutal, never hopeless for a great team
  });

  it("every difficulty is a real spread of opponents, not 82 clones", () => {
    const gen = opponentGenerator("pro");
    const rng = (() => { let s = 99; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(gen(rng).map((p) => p.id).join(","));
    expect(seen.size).toBeGreaterThan(20);
  });

  it("an unknown difficulty falls back to the default rather than throwing", () => {
    expect(validDifficulty("nonsense")).toBe("pro");
    expect(validDifficulty(undefined)).toBe("pro");
    expect(Object.keys(DIFFICULTIES)).toHaveLength(4);
  });
});

describe("Daily opponent (was: player-chosen, exploitable)", () => {
  it("is derived from the date — same for everyone, stable all day", () => {
    const day = utcDateKey();
    const a = dailyOpponent(day).map((p) => p.id);
    const b = dailyOpponent(day).map((p) => p.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it("changes from day to day", () => {
    expect(dailyOpponent("20260824").map((p) => p.id)).not.toEqual(dailyOpponent("20260825").map((p) => p.id));
  });

  it("fields one person per lineup", () => {
    const names = dailyOpponent(utcDateKey()).map((p) => p.name);
    expect(new Set(names).size).toBe(5);
  });

  it("is a credible opponent, not the bottom of the pool", () => {
    // the exploit was hand-picking the weakest five; the seeded five must be real
    const opp = dailyOpponent("20260824");
    const avgPts = opp.reduce((s, p) => s + p.pts, 0) / 5;
    expect(avgPts).toBeGreaterThan(14);
  });
});

describe("series summaries (was: the last game described as the whole series)", () => {
  let r;
  beforeAll(() => { r = computeResultV3("best7", GOLD, BLUE, OPTS, 11); });

  it("names the series, not a single night", () => {
    expect(r.fallbackSummary).toMatch(/series|swept/i);
    expect(r.fallbackSummary).not.toMatch(/\btonight\b/);
  });

  it("credits the same MVP the header shows", () => {
    expect(r.core.mvp).toBeTruthy();
    expect(r.fallbackSummary).toContain(r.core.mvp);
    expect(r.mvpFallback).toContain(r.core.mvp);
  });

  it("reports the real series score", () => {
    const { gold, blue } = r.core.seriesScore;
    expect(Math.max(gold, blue)).toBe(4);
    expect(r.fallbackSummary).toContain(r.core.seriesResult);
    expect(r.core.games).toHaveLength(gold + blue);
  });
});

describe("AI grounding (was: recap invented defensive matchups)", () => {
  it("single-game results carry duels with the engine's real assignments", () => {
    const r = computeResultV3("single", GOLD, BLUE, OPTS, 5);
    expect(r.core.slotDuels).toHaveLength(5);
    const names = new Set(PLAYERS.map((p) => p.name));
    for (const d of r.core.slotDuels) {
      expect(d.gold.guardedBy).toBeTruthy();
      expect(d.blue.guardedBy).toBeTruthy();
      // the defender must be a real player from the OPPOSING five
      expect(names.has(d.gold.guardedBy)).toBe(true);
      expect(r.v3.assignments.onGold.map((a) => a.defender)).toContain(d.gold.guardedBy);
      expect(r.v3.assignments.onBlue.map((a) => a.defender)).toContain(d.blue.guardedBy);
    }
  });

  it("series results carry duels too (tournament rounds narrate from them)", () => {
    const r = computeResultV3("best7", GOLD, BLUE, OPTS, 12);
    expect(r.core.slotDuels).toHaveLength(5);
    expect(r.core.slotDuels[0].gold.guardedBy).toBeTruthy();
  });
});
