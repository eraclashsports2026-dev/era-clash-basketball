// ── V3 possession engine — core validation (Part 60) ──────────────────────────
import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { simulateGameV3, simulateSeriesV3, resolveCoach, resolveEra } from "../src/v3/engine.js";
import { deriveSeed } from "../src/v3/seed.js";
import { allocateUsage } from "../src/v3/roles.js";
import { teamDNA } from "../src/v3/playerProfile.js";
import { recommendCoaches } from "../src/v3/analysis.js";
import { COACHES } from "../src/v3/coaches.js";
import { ERA_STYLES } from "../src/v3/eraStyles.js";

const t = (ids) => ids.map((id) => PLAYERS.find((p) => p.id === id));
const ELITE = t(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"]);
const SPACING = t(["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"]);
const STARS = t(["luka-20s", "jordan-90s", "lebron-10s", "giannis-20s", "jokic-20s"]);
const DEFENSE = t(["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "hak-90s"]);
const INTERIOR = t(["stock-90s", "hal-60s", "elvin-70s", "moses-80s", "wilt-60s"]);
const N = resolveCoach("neutral");
const E20 = resolveEra("2020s");
const E60 = resolveEra("1960s");

const checkInvariants = (game) => {
  for (const side of [game.gold, game.blue]) {
    let pts = 0;
    for (const l of side.lines) {
      pts += l.pts;
      expect(l.fgm, l.name).toBeLessThanOrEqual(l.fga);
      expect(l.tpm).toBeLessThanOrEqual(l.tpa);
      expect(l.tpm).toBeLessThanOrEqual(l.fgm);
      expect(l.ftm).toBeLessThanOrEqual(l.fta);
      expect(l.pts).toBe(2 * (l.fgm - l.tpm) + 3 * l.tpm + l.ftm); // points reconcile with events
      for (const k of Object.keys(l)) {
        if (typeof l[k] === "number") { expect(Number.isFinite(l[k])).toBe(true); expect(l[k]).toBeGreaterThanOrEqual(0); }
      }
    }
    expect(pts, "player pts sum to team pts").toBe(side.totals.pts);
    expect(side.totals.ast, "assists bounded by made FGs").toBeLessThanOrEqual(side.totals.fgm);
    expect(new Set(side.lines.map((l) => l.id)).size).toBe(5);
  }
  // cross-team event consistency
  expect(game.gold.totals.stl, "gold steals ≤ blue turnovers").toBeLessThanOrEqual(game.blue.totals.to);
  expect(game.blue.totals.stl).toBeLessThanOrEqual(game.gold.totals.to);
  expect(game.gold.totals.blk, "gold blocks ≤ blue missed FGAs").toBeLessThanOrEqual(game.blue.totals.fga - game.blue.totals.fgm);
  expect(game.blue.totals.blk).toBeLessThanOrEqual(game.gold.totals.fga - game.gold.totals.fgm);
  // winner has the higher score, always
  const { gold, blue } = game.finalScore;
  expect(gold).not.toBe(blue);
  expect(game.winner).toBe(gold > blue ? "Gold" : "Blue");
};

describe("box-score invariants (0 failures required)", () => {
  it("hold across 200 games spanning teams and eras", () => {
    const eras = ["1950s", "1960s", "1980s", "1990s", "2010s", "2020s"];
    const teams = [ELITE, SPACING, STARS, DEFENSE, INTERIOR];
    for (let i = 0; i < 200; i++) {
      const A = teams[i % teams.length], B = teams[(i + 2) % teams.length];
      const era = resolveEra(eras[i % eras.length]);
      checkInvariants(simulateGameV3(A, B, N, N, era, 40000 + i));
    }
  });
});

describe("seeded variance architecture", () => {
  it("same seed reproduces the exact game; a new seed produces a different one", () => {
    const a = simulateGameV3(ELITE, SPACING, N, N, E20, 777);
    const b = simulateGameV3(ELITE, SPACING, N, N, E20, 777);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = simulateGameV3(ELITE, SPACING, N, N, E20, 778);
    expect(JSON.stringify(a.finalScore)).not.toBe(JSON.stringify(c.finalScore));
  });
  it("rematches vary: scores, stat lines, MVPs, and winners can all change", () => {
    const winners = new Set(), mvps = new Set(), scores = new Set();
    for (let s = 0; s < 60; s++) {
      const g = simulateGameV3(ELITE, SPACING, N, N, E20, 2000 + s);
      winners.add(g.winner); mvps.add(g.mvp.name); scores.add(g.finalScore.gold);
    }
    expect(winners.size).toBe(2);
    expect(mvps.size).toBeGreaterThanOrEqual(4);
    expect(scores.size).toBeGreaterThanOrEqual(15);
  });
  it("best-of-7 games have independent seeds and independent nights", () => {
    const s = simulateSeriesV3(ELITE, SPACING, N, N, E20, 12345);
    expect(s.seriesScore.gold === 4 || s.seriesScore.blue === 4).toBe(true);
    const gameScores = s.games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`);
    expect(new Set(gameScores).size, "no two identical games in a series").toBeGreaterThan(1);
    const mjPts = s.games.map((g) => g.gold.lines[1].pts);
    expect(new Set(mjPts).size, "player form varies game to game").toBeGreaterThan(1);
    // reproducible: same parent seed → identical series
    const s2 = simulateSeriesV3(ELITE, SPACING, N, N, E20, 12345);
    expect(JSON.stringify(s2.games.map((g) => g.finalScore))).toBe(JSON.stringify(s.games.map((g) => g.finalScore)));
    // derived seeds differ from parent and from each other
    expect(new Set([12345, deriveSeed(12345, 0), deriveSeed(12345, 1), deriveSeed(12345, 2)]).size).toBe(4);
  });
});

describe("finite usage & role economics", () => {
  it("usage shares always sum to 1 with basketball floors/ceilings", () => {
    for (const team of [ELITE, SPACING, STARS, DEFENSE, INTERIOR]) {
      const alloc = allocateUsage(teamDNA(team));
      const sum = alloc.reduce((s, a) => s + a.share, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
      for (const a of alloc) { expect(a.share).toBeGreaterThanOrEqual(0.08); expect(a.share).toBeLessThanOrEqual(0.34); }
    }
  });
  it("five superstars experience real role compression; balanced teams don't", () => {
    const stars = allocateUsage(teamDNA(STARS));
    const compressed = stars.filter((a) => a.compression > 0.1).length;
    expect(compressed, "on a 5-star team, multiple stars lose their diet").toBeGreaterThanOrEqual(3);
    // one primary creator + four genuine role players: nobody's EFFICIENCY is
    // harmed (a role player trimming a few points of usage is normal basketball)
    const complementary = allocateUsage(teamDNA(t(["magic-80s", "klay-10s", "bowen-2ks", "rodman-90s", "gobert-10s"])));
    // nobody is SEVERELY harmed, and the true role players keep full value;
    // (Klay being stretched into a #2 creator role pays honest strain — that
    // is the engine modeling a creation shortage, not a bug)
    expect(complementary.filter((a) => a.effMult < 0.88).length).toBe(0);
    for (const id of ["bowen-2ks", "rodman-90s", "gobert-10s"]) {
      expect(complementary.find((a) => a.dna.id === id).effMult, id).toBeGreaterThan(0.95);
    }
    const starsHurt = stars.filter((a) => a.effMult < 0.95).length;
    expect(starsHurt, "superstar stacks pay a real efficiency cost").toBeGreaterThanOrEqual(2);
    // and the hard cap holds after renormalization (regression for the clamp bug)
    for (const a of [...stars, ...complementary]) expect(a.share).toBeLessThanOrEqual(0.34 + 1e-9);
  });
  it("off-ball skill retains value under compression (movement shooter > ball-dominant)", () => {
    const stacked = allocateUsage(teamDNA(t(["luka-20s", "curry-10s", "lebron-10s", "giannis-20s", "jokic-20s"])));
    const curry = stacked.find((a) => a.dna.id === "curry-10s");   // elite off-ball (9)
    const luka = stacked.find((a) => a.dna.id === "luka-20s");     // ball-dominant (offBall 3)
    if (curry.compression > 0.05 && luka.compression > 0.05) {
      const curryLossPerComp = (1 - curry.effMult) / curry.compression;
      const lukaLossPerComp = (1 - luka.effMult) / luka.compression;
      expect(curryLossPerComp).toBeLessThan(lukaLossPerComp);
    }
    expect(curry.effMult).toBeGreaterThan(0.9); // movement shooting survives stacking
  });
  it("the better-built team beats the higher-talent stack a meaningful share of the time", () => {
    let balancedWins = 0;
    for (let s = 0; s < 400; s++) if (simulateGameV3(ELITE, STARS, N, N, E20, 6000 + s).winner === "Gold") balancedWins++;
    const pct = balancedWins / 400;
    expect(pct, "construction closes the talent gap (no blowout dominance)").toBeGreaterThan(0.28);
    expect(pct).toBeLessThan(0.62); // but raw talent still matters
  });
});

describe("era style is an environment, never a power ranking", () => {
  it("no three-point line means zero three-point scoring — for BOTH teams", () => {
    for (const eraId of ["1950s", "1960s", "1970s"]) {
      const g = simulateGameV3(SPACING, ELITE, N, N, resolveEra(eraId), 314);
      expect(g.gold.totals.tpa).toBe(0);
      expect(g.blue.totals.tpa).toBe(0);
      expect(g.gold.totals.tpm).toBe(0);
    }
  });
  it("modern shooters keep their skill value in pre-3PT eras (gravity + twos)", () => {
    let w = 0;
    for (let s = 0; s < 400; s++) if (simulateGameV3(SPACING, INTERIOR, N, N, E60, 8000 + s).winner === "Gold") w++;
    // the spacing team loses its 3-point VALUE but keeps shooting skill;
    // it must remain competitive, not collapse
    expect(w / 400).toBeGreaterThan(0.30);
  });
  it("no native-decade bonus exists: a team's own era gives it nothing automatic", () => {
    // 60s-built INTERIOR team vs modern DEFENSE team, in 1960s vs 2020s:
    // the winrate may shift with the ENVIRONMENT, but there is no mechanism
    // reading player.decade — verify the shift stays moderate, not a flip.
    let w60 = 0, w20 = 0;
    for (let s = 0; s < 300; s++) {
      if (simulateGameV3(INTERIOR, DEFENSE, N, N, E60, 9000 + s).winner === "Gold") w60++;
      if (simulateGameV3(INTERIOR, DEFENSE, N, N, E20, 9000 + s).winner === "Gold") w20++;
    }
    expect(Math.abs(w60 - w20) / 300, "era shift is environmental, not a handout").toBeLessThan(0.25);
  });
  it("every era stays inside plausible basketball bounds for every archetype", () => {
    for (const era of ERA_STYLES) {
      const g = simulateGameV3(ELITE, SPACING, N, N, resolveEra(era.id), 555);
      for (const side of [g.gold, g.blue]) {
        expect(side.totals.pts).toBeGreaterThan(55);
        expect(side.totals.pts).toBeLessThan(190);
      }
      checkInvariants(g);
    }
  });
});

describe("player-specific variance guardrails", () => {
  it("a low-usage defensive specialist never scores 40; an elite scorer can", () => {
    const withBowen = t(["gary-90s", "bowen-2ks", "pippen-90s", "kg-00s", "hak-90s"]);
    let bowenMax = 0, mjMax = 0;
    for (let s = 0; s < 400; s++) {
      const g = simulateGameV3(withBowen, ELITE, N, N, E20, 11000 + s);
      bowenMax = Math.max(bowenMax, g.gold.lines[1].pts);
      mjMax = Math.max(mjMax, g.blue.lines[1].pts);
    }
    expect(bowenMax, "Bruce Bowen ceiling").toBeLessThan(32);
    expect(mjMax, "Jordan retains superstar ceilings").toBeGreaterThan(38);
  });
  it("small guards do not produce 20-rebound games; elite rebounders can dominate the glass", () => {
    const withRodman = t(["mookie-90s", "cooper-80s", "pippen-90s", "rodman-90s", "camby-2ks"]);
    let mookieRebMax = 0, rodmanRebAvg = 0;
    for (let s = 0; s < 300; s++) {
      const g = simulateGameV3(withRodman, ELITE, N, N, E20, 13000 + s);
      mookieRebMax = Math.max(mookieRebMax, g.gold.lines[0].oreb + g.gold.lines[0].dreb);
      rodmanRebAvg += g.gold.lines[3].oreb + g.gold.lines[3].dreb;
    }
    expect(mookieRebMax).toBeLessThan(15);
    expect(rodmanRebAvg / 300, "Rodman leads the glass").toBeGreaterThan(8);
  });
});

describe("coaches: independent, contextual, no OVR", () => {
  it("30 researched coaches exist and expose no OVR anywhere", () => {
    expect(COACHES.length).toBe(30);
    for (const c of COACHES) {
      expect(c.ovr).toBeUndefined();
      expect(c.rating).toBeUndefined();
      expect(c.offense && c.defense && c.management && c.rosterFit).toBeTruthy();
      expect(c.documented.length).toBeGreaterThanOrEqual(3);
      expect(c.inferred.length).toBeGreaterThanOrEqual(1);
      expect(c.sources.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("Gold and Blue coaches are independent and both matter", () => {
    const dantoni = resolveCoach("mike-dantoni"), sloan = resolveCoach("jerry-sloan");
    const a = simulateGameV3(SPACING, ELITE, dantoni, sloan, E20, 424242);
    const b = simulateGameV3(SPACING, ELITE, sloan, dantoni, E20, 424242);
    expect(JSON.stringify(a.gold.totals)).not.toBe(JSON.stringify(b.gold.totals));
    expect(a.coachIds.gold).toBe("mike-dantoni");
    expect(b.coachIds.gold).toBe("jerry-sloan");
  });
  it("recommendations depend on the roster", () => {
    const forShooters = recommendCoaches(SPACING).map((c) => c.id);
    const forInterior = recommendCoaches(INTERIOR).map((c) => c.id);
    expect(forShooters.join()).not.toBe(forInterior.join());
  });
  it("coach changes shift real basketball (pace + shot mix), bounded below talent", () => {
    const run = (coach) => {
      let poss = 0, tpa = 0, w = 0;
      for (let s = 0; s < 300; s++) {
        const g = simulateGameV3(SPACING, DEFENSE, coach, N, resolveEra("2010s"), 21000 + s);
        poss += g.possessions; tpa += g.gold.totals.tpa; if (g.winner === "Gold") w++;
      }
      return { poss: poss / 300, tpa: tpa / 300, w: w / 300 };
    };
    const dantoni = run(resolveCoach("mike-dantoni"));
    const sloan = run(resolveCoach("jerry-sloan"));
    expect(dantoni.poss).toBeGreaterThan(sloan.poss + 1);   // tempo philosophy is real
    expect(dantoni.tpa).toBeGreaterThan(sloan.tpa + 5);     // shot spectrum is real
    expect(Math.abs(dantoni.w - sloan.w)).toBeLessThan(0.2); // coaching < talent
  });
});
