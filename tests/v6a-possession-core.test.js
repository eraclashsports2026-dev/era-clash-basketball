// ── Phase 6A: Possession Engine 1.0 core ─────────────────────────────────────
// The core product rule under test: the engine does NOT pick a winner and then
// manufacture a box score. Points come from shots, shots come from actions,
// actions come from possessions, and the winner is whoever scored more.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  runPossessionGame, runPossessionSeries, preparePossessionContext, validatePossessionInput,
  PossessionInputError, checkGame, childSeeds, deriveSeed,
  POSSESSION_ENGINE_VERSION, POSSESSION_ENGINE_STATUS, resultVersions,
} from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { createRng } from "../src/v3/possession/rng.js";
import { FATIGUE_BOUNDS, REGULATION_PERIODS, MAX_OVERTIMES } from "../src/v3/possession/game.js";
import { actionMix, PNR_FREQUENCY_CAP } from "../src/v3/possession/actions.js";
import { versionOf, statusOf, VERSION_STATUS } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { flags } from "../api/_lib/flags.js";
import { compareGames, replay } from "../scripts/simulation-replay.mjs";

// Strip comments before grepping source. A guard that matches its own
// explanatory comment ("Math.random() is never used here") reports a violation
// for the very sentence documenting the rule.
const codeOf = (url) => readFileSync(url, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const engineFiles = () => {
  const dir = new URL("../src/v3/possession/", import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => ({ f, src: codeOf(new URL(f, dir)) }));
};

const GOLD = ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"];
const BLUE = ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"];
const SPACING = ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"];
const DEFENSE = ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"];

const mk = (over = {}) => buildPossessionInput({
  goldIds: GOLD, blueIds: BLUE, coachGoldId: "phil-jackson", coachBlueId: "pat-riley",
  eraStyleId: "2010s", simulationSeed: 4242, ...over,
});
const FAST = { assertInvariants: false, includeLedger: false };
const play = (over = {}, opts) => runPossessionGame(mk(over), opts);

// ── version, flag, status ────────────────────────────────────────────────────
describe("possession engine status", () => {
  it("is version 1.x with DEVELOPMENT status", () => {
    // Phase 6B2 bumped this to 1.1.0 (zone resolution and the expanded action
    // families changed what a possession can be, without changing the engine's
    // contract). What must hold is the family and the status.
    expect(POSSESSION_ENGINE_VERSION).toMatch(/^1\./);
    expect(versionOf("possessionEngineVersion")).toMatch(/^1\./);
    expect(statusOf("possessionEngineVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    expect(POSSESSION_ENGINE_STATUS).toBe("DEVELOPMENT");
  });

  it("the production engine is untouched at 3.2.0 and stays ACTIVE", () => {
    expect(versionOf("engineVersion")).toBe("3.2.0");
    expect(statusOf("engineVersion")).toBe(VERSION_STATUS.ACTIVE);
  });

  it("POSSESSION_ENGINE_ENABLED defaults to false", () => {
    const saved = process.env.POSSESSION_ENGINE_ENABLED;
    delete process.env.POSSESSION_ENGINE_ENABLED;
    try { expect(flags().possessionEngine).toBe(false); } finally {
      if (saved != null) process.env.POSSESSION_ENGINE_ENABLED = saved;
    }
  });

  it("it does not reuse an existing production flag", () => {
    const src = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    expect(src).toContain("POSSESSION_ENGINE_ENABLED");
    // The point of a separate flag is that SIM_ENGINE_V3_ENABLED already means
    // too many things; the possession engine must not hide behind it.
    const line = src.split("\n").find((l) => l.includes("possessionEngine:"));
    expect(line).not.toMatch(/SIM_ENGINE_V3_ENABLED/);
  });

  it("claims no historical authority", () => {
    const g = play({}, FAST);
    expect(g.status).toMatch(/DEVELOPMENT/);
    expect(g.status).toMatch(/CALIBRATION REQUIRED/);
    expect(g.historicalAuthority).toMatch(/NONE/);
    // The module must not ASSERT authority. It may say it has none.
    const src = readFileSync(new URL("../src/v3/possession/index.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/is historically authoritative|fully accurate\.|scientifically proven\./i);
  });
});

// ── input contract ───────────────────────────────────────────────────────────
describe("engine input contract", () => {
  it("accepts a valid prepared context", () => {
    expect(validatePossessionInput(mk())).toBe(true);
  });

  it("rejects anything that would author the outcome", () => {
    // The core trusts nothing. An authored probability is REFUSED, not
    // clamped — silently ignoring it would let a caller think it worked.
    for (const banned of ["winProbability", "forcedWinner", "forcedScore", "shotProbabilities", "makeProbability"]) {
      const bad = mk(); bad.gold[banned] = 0.99;
      expect(() => validatePossessionInput(bad), banned).toThrow(PossessionInputError);
    }
  });

  it("rejects malformed lineups, seeds and eras", () => {
    expect(() => validatePossessionInput({ ...mk(), simulationSeed: "x" })).toThrow(/simulationSeed/);
    expect(() => validatePossessionInput({ ...mk(), eraStyleId: "1930s" })).toThrow(/unknown eraStyleId/);
    const short = mk(); short.gold.playerCards = short.gold.playerCards.slice(0, 4);
    expect(() => validatePossessionInput(short)).toThrow(/exactly 5/);
    const noTi = mk(); delete noTi.blue.teamIntelligence;
    expect(() => validatePossessionInput(noTi)).toThrow(/teamIntelligence/);
  });

  it("makes no network, filesystem or AI call in the engine path", () => {
    for (const { f, src } of engineFiles()) {
      expect(src, `${f} must not fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${f} must not use node:fs`).not.toMatch(/node:fs|require\(["']fs/);
      expect(src, `${f} must not call a model`).not.toMatch(/anthropic|generateNarrative|openai/i);
      expect(src, `${f} must not read the clock`).not.toMatch(/Date\.now\(\)|new Date\(/);
    }
  });

  it("never calls Math.random anywhere in the engine", () => {
    for (const { f, src } of engineFiles()) expect(src, f).not.toMatch(/Math\.random/);
  });

  it("the prepared context does not recompute the intelligence layers", () => {
    // It must CONSUME their versioned outputs. Rebuilding a usage plan or a
    // team profile here would be a second derivation, and two derivations of
    // one quantity always drift.
    const src = readFileSync(new URL("../src/v3/possession/context.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/buildTeamIntelligence|buildIntelligence\b/);
  });
});

// ── determinism ──────────────────────────────────────────────────────────────
describe("seeded determinism", () => {
  it("same seed and context produce a byte-identical game", () => {
    const a = play({ simulationSeed: 999 });
    const b = play({ simulationSeed: 999 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rngSteps).toBe(b.rngSteps);
  });

  it("a different seed produces a different game", () => {
    const a = play({ simulationSeed: 999 }, FAST);
    const b = play({ simulationSeed: 1000 }, FAST);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("the rng is deterministic and counts its draws", () => {
    const a = createRng(7), b = createRng(7);
    const xs = [a(), a.int(10), a.bell(), a.chance(0.5)];
    const ys = [b(), b.int(10), b.bell(), b.chance(0.5)];
    expect(xs).toEqual(ys);
    expect(a.steps()).toBe(b.steps());
    expect(a.steps()).toBeGreaterThan(0);
  });

  it("a weighted pick with all-zero weights throws instead of silently taking the first item", () => {
    // This used to return items[0] so a possession always produced something.
    // That is the wrong trade: it makes an invalid-weight bug indistinguishable
    // from a modelling decision, and it hid a NaN that gave one player 3,749
    // attempts in an 80-game sample. A development engine should fail loudly.
    expect(() => createRng(1).weighted(["a", "b"], () => 0)).toThrow(/refusing to fall back/);
    expect(() => createRng(1).weighted(["a", "b"], () => NaN)).toThrow(/zero or invalid/);
    // A single valid weight is still a valid draw.
    expect(createRng(1).weighted(["a", "b"], (x) => (x === "b" ? 1 : 0))).toBe("b");
  });

  it("the replay tool reproduces a stored game exactly", () => {
    const rec = { goldIds: GOLD, blueIds: BLUE, coachGoldId: "phil-jackson", coachBlueId: "pat-riley", eraStyleId: "2010s", simulationSeed: 31337 };
    const { comparison } = replay(rec);
    expect(comparison.identical, JSON.stringify(comparison.diffs.slice(0, 4))).toBe(true);
    expect(comparison.firstDivergence).toBe(-1);
  });

  it("the replay comparison actually detects a divergence", () => {
    // A comparator that cannot fail proves nothing.
    const a = play({ simulationSeed: 5 }, FAST);
    const b = play({ simulationSeed: 6 }, FAST);
    expect(compareGames(a, b).identical).toBe(false);
  });
});

// ── series and season child seeds ────────────────────────────────────────────
describe("series and season seeds", () => {
  it("child seeds are deterministic and distinct", () => {
    expect(childSeeds(42, 7)).toEqual(childSeeds(42, 7));
    expect(new Set(childSeeds(42, 7)).size).toBe(7);
    expect(new Set(childSeeds(42, 82)).size).toBe(82);
  });

  it("a best-of-7 produces seven different games from one parent seed", () => {
    const games = runPossessionSeries(mk({ simulationSeed: 2026 }), { games: 7, opts: FAST });
    expect(games).toHaveLength(7);
    expect(new Set(games.map((g) => g.simulationSeed)).size).toBe(7);
    // One bad draw must not repeat itself across the series — which is what
    // happens when a single game-form modifier is reused for the whole thing.
    expect(new Set(games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size).toBeGreaterThan(4);
  });

  it("an 82-game season derives 82 independent games", () => {
    const seeds = childSeeds(7777, 82);
    const scores = seeds.slice(0, 30).map((s) => {
      const g = runPossessionGame(mk({ simulationSeed: s }), FAST);
      return `${g.finalScore.gold}-${g.finalScore.blue}`;
    });
    expect(new Set(scores).size).toBeGreaterThan(20);
  });

  it("the same parent seed reproduces the same series", () => {
    const a = runPossessionSeries(mk({ simulationSeed: 5150 }), { games: 7, opts: FAST });
    const b = runPossessionSeries(mk({ simulationSeed: 5150 }), { games: 7, opts: FAST });
    expect(a.map((g) => g.finalScore)).toEqual(b.map((g) => g.finalScore));
  });
});

// ── game structure and overtime ──────────────────────────────────────────────
describe("game structure and overtime", () => {
  it("regulation is four periods", () => {
    expect(REGULATION_PERIODS).toBe(4);
    const g = play({}, FAST);
    expect(g.periods).toBeGreaterThanOrEqual(4);
    if (g.overtimes === 0) expect(g.periods).toBe(4);
    expect(g.periodScores.length).toBe(g.periods);
  });

  it("no game ever ends level, across many seeds", () => {
    const seeds = childSeeds(31, 400);
    const ties = seeds.filter((s) => {
      const g = runPossessionGame(mk({ simulationSeed: s }), FAST);
      return g.finalScore.gold === g.finalScore.blue;
    });
    expect(ties).toHaveLength(0);
  });

  it("a tie at the end of regulation goes to overtime", () => {
    const seeds = childSeeds(31, 600);
    const ots = seeds.map((s) => runPossessionGame(mk({ simulationSeed: s }), FAST)).filter((g) => g.overtimes > 0);
    expect(ots.length, "no overtime games in 600 — suspicious").toBeGreaterThan(0);
    for (const g of ots) {
      expect(g.periods).toBe(4 + g.overtimes);
      // Regulation must have been level for overtime to exist at all.
      const reg = g.periodScores.slice(0, 4).reduce((a, p) => ({ gold: a.gold + p.gold, blue: a.blue + p.blue }), { gold: 0, blue: 0 });
      expect(reg.gold).toBe(reg.blue);
      expect(g.finalScore.gold).not.toBe(g.finalScore.blue);
    }
  });

  it("multiple overtimes are supported and still reconcile", () => {
    const multi = childSeeds(31, 1200).map((s) => runPossessionGame(mk({ simulationSeed: s }), FAST)).filter((g) => g.overtimes > 1);
    // Not guaranteed in any given sample, but when they occur they must be sound.
    for (const g of multi) {
      expect(g.periods).toBe(4 + g.overtimes);
      expect(checkGame(g)).toHaveLength(0);
    }
    expect(MAX_OVERTIMES).toBeGreaterThanOrEqual(4);
    // 1200 full games is a deliberate brute-force search for a rare state, and
    // it lands within a few hundred ms of the 5s default under full-suite load.
    // An explicit budget keeps it honest instead of trimming the sample.
  }, 30_000);

  it("the overtime guard resolves through basketball, never a coin flip", () => {
    const src = readFileSync(new URL("../src/v3/possession/game.js", import.meta.url), "utf8");
    expect(src).toMatch(/MAX_OVERTIME_GUARD/);
    expect(src).toMatch(/never a coin flip|no random tie-breaker/i);
    // The guard path must still run possessions.
    const guardBlock = src.slice(src.indexOf("if (guardHit)"), src.indexOf("const gold = finaliseBox"));
    expect(guardBlock).toMatch(/runPeriod\(/);
  });
});

// ── possession conservation ──────────────────────────────────────────────────
describe("possession conservation", () => {
  const g = play({ simulationSeed: 8080 });

  it("an offensive rebound continues the SAME possession", () => {
    // If every offensive rebound started a new team possession, possessions
    // would exceed the ledger's possession count. They must not.
    const orebs = g.possessionLedger.filter((r) => r.offensiveRebound);
    expect(orebs.length).toBeGreaterThan(0);
    const totalPoss = g.gold.totals.possessions + g.blue.totals.possessions;
    expect(g.possessionLedger.length, "ledger entries include OREB continuations").toBeGreaterThan(totalPoss);
  });

  it("every possession ends in a recognised way", () => {
    const ENDINGS = new Set(["MADE_FG", "MISS_DREB", "MISS_OREB", "TURNOVER_STOLEN", "TURNOVER_UNFORCED", "SHOOTING_FOUL"]);
    for (const r of g.possessionLedger) expect(ENDINGS.has(r.outcome), r.outcome).toBe(true);
  });

  it("a made basket, a defensive rebound and a turnover all end the possession", () => {
    // Consecutive ledger entries for the SAME offense mean a continuation. A
    // terminal outcome must never be followed by one.
    for (let i = 1; i < g.possessionLedger.length; i++) {
      const prev = g.possessionLedger[i - 1], cur = g.possessionLedger[i];
      if (cur.i === prev.i && cur.offense === prev.offense) {
        expect(["MISS_OREB", "SHOOTING_FOUL"], `possession ${cur.i} continued after ${prev.outcome}`).toContain(prev.outcome);
      }
    }
  });

  it("the ledger records enough to debug a possession without narrative text", () => {
    const r = g.possessionLedger[0];
    for (const k of ["i", "period", "offense", "action", "primary", "outcome", "step"]) {
      expect(r, k).toHaveProperty(k);
    }
    // No oversized prose in the ledger.
    for (const rec of g.possessionLedger) {
      for (const v of Object.values(rec)) {
        if (typeof v === "string") expect(v.length, `ledger string too long: ${v}`).toBeLessThan(48);
      }
    }
  });

  it("possession counts are plausible for the era's documented pace", () => {
    const ctx = preparePossessionContext(mk());
    const perTeam = g.gold.totals.possessions;
    expect(perTeam).toBeGreaterThan(ctx.environment.pace * 0.75);
    expect(perTeam).toBeLessThan(ctx.environment.pace * 1.3);
  });
});

// ── statistical invariants ───────────────────────────────────────────────────
describe("statistical invariants", () => {
  it("hold across a large sweep with zero violations", () => {
    let violations = 0;
    for (const s of childSeeds(2027, 500)) {
      violations += checkGame(runPossessionGame(mk({ simulationSeed: s }), FAST)).length;
    }
    expect(violations).toBe(0);
  });

  it("hold across every era", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
      for (const s of childSeeds(9, 25)) {
        expect(checkGame(runPossessionGame(mk({ eraStyleId: era, simulationSeed: s }), FAST)), era).toHaveLength(0);
      }
    }
  });

  it("player lines sum to the team line", () => {
    const g2 = play({ simulationSeed: 606 }, FAST);
    for (const side of ["gold", "blue"]) {
      for (const stat of ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "reb", "ast", "stl", "blk", "to"]) {
        const sum = g2[side].players.reduce((a, p) => a + p[stat], 0);
        expect(sum, `${side}.${stat}`).toBe(g2[side].totals[stat]);
      }
    }
  });

  it("points are derived from shots, never tallied independently", () => {
    const g2 = play({ simulationSeed: 707 }, FAST);
    for (const side of ["gold", "blue"]) {
      for (const p of g2[side].players) {
        expect((p.fgm - p.tpm) * 2 + p.tpm * 3 + p.ftm, p.cardId).toBe(p.pts);
      }
      expect(g2[side].players.reduce((a, p) => a + p.pts, 0)).toBe(g2[side].totals.pts);
    }
    expect(g2.finalScore.gold).toBe(g2.gold.totals.pts);
  });

  it("the invariant checker actually catches a violation", () => {
    // A checker that cannot fail proves nothing. Corrupt a line and confirm.
    const g2 = play({ simulationSeed: 808 }, FAST);
    const broken = JSON.parse(JSON.stringify(g2));
    broken.gold.players[0].pts += 3;
    expect(checkGame(broken).length).toBeGreaterThan(0);
    const broken2 = JSON.parse(JSON.stringify(g2));
    broken2.gold.totals.ast = broken2.gold.totals.fgm + 5;
    expect(checkGame(broken2).some((v) => v.code === "AST_GT_FGM")).toBe(true);
  });
});

// ── event linkage ────────────────────────────────────────────────────────────
describe("event linkage", () => {
  const games = childSeeds(1234, 60).map((s) => runPossessionGame(mk({ simulationSeed: s })));

  it("assists only ever accompany a teammate's made field goal", () => {
    for (const g of games) {
      for (const r of g.possessionLedger) {
        if (!r.assist) continue;
        expect(r.outcome, "an assist requires a made field goal").toBe("MADE_FG");
        expect(r.assist, "no self-assist").not.toBe(r.primary);
      }
      // No assist may be credited on a free throw.
      const ftOnly = g.possessionLedger.filter((r) => r.outcome === "SHOOTING_FOUL");
      for (const r of ftOnly) expect(r.assist).toBeUndefined();
      for (const side of ["gold", "blue"]) expect(g[side].totals.ast).toBeLessThanOrEqual(g[side].totals.fgm);
    }
  });

  it("steals never exceed opponent turnovers, and unforced turnovers exist", () => {
    let unforced = 0, stolen = 0;
    for (const g of games) {
      expect(g.gold.totals.stl).toBeLessThanOrEqual(g.blue.totals.to);
      expect(g.blue.totals.stl).toBeLessThanOrEqual(g.gold.totals.to);
      unforced += g.possessionLedger.filter((r) => r.outcome === "TURNOVER_UNFORCED").length;
      stolen += g.possessionLedger.filter((r) => r.outcome === "TURNOVER_STOLEN").length;
    }
    expect(unforced, "not every turnover should have a steal").toBeGreaterThan(0);
    expect(stolen).toBeGreaterThan(0);
  });

  it("blocks only occur on a field-goal attempt and never exceed opponent FGA", () => {
    for (const g of games) {
      expect(g.gold.totals.blk).toBeLessThanOrEqual(g.blue.totals.fga);
      expect(g.blue.totals.blk).toBeLessThanOrEqual(g.gold.totals.fga);
      for (const r of g.possessionLedger) {
        if (r.block) expect(r.shot, "a block requires a shot").toBeTruthy();
      }
    }
  });

  it("rebounds arise from misses and reconcile", () => {
    for (const g of games) {
      for (const side of ["gold", "blue"]) {
        expect(g[side].totals.oreb + g[side].totals.dreb).toBe(g[side].totals.reb);
        for (const p of g[side].players) expect(p.oreb + p.dreb).toBe(p.reb);
      }
      for (const r of g.possessionLedger) {
        if (r.outcome === "MISS_DREB") expect(r.defensiveRebound).toBeTruthy();
        if (r.outcome === "MISS_OREB") expect(r.offensiveRebound).toBeTruthy();
      }
    }
  });

  it("free throws come from a foul and reconcile into points", () => {
    for (const g of games) {
      for (const side of ["gold", "blue"]) expect(g[side].totals.ftm).toBeLessThanOrEqual(g[side].totals.fta);
      for (const r of g.possessionLedger) {
        if (r.freeThrows) {
          expect(r.outcome).toBe("SHOOTING_FOUL");
          expect(r.freeThrows.made).toBeLessThanOrEqual(r.freeThrows.attempted);
          expect(r.points).toBe(r.freeThrows.made);
        }
      }
    }
  });

  it("personal fouls are not exposed in the consumer box score", () => {
    // With no bench and no foul-outs, a displayed PF total would imply a
    // disqualification rule that does not exist.
    const g = games[0];
    for (const side of ["gold", "blue"]) {
      for (const p of g[side].players) expect(p).not.toHaveProperty("pf");
      expect(g[side].totals).not.toHaveProperty("pf");
      expect(g[side].internal.personalFoulNote).toMatch(/no disqualification/i);
    }
  });
});

// ── shooting ─────────────────────────────────────────────────────────────────
describe("shooting", () => {
  it("a legal three-point era produces threes", () => {
    const g = play({ eraStyleId: "2020s", simulationSeed: 55 }, FAST);
    expect(g.threePointLegal).toBe(true);
    expect(g.gold.totals.tpa).toBeGreaterThan(10);
    expect(g.gold.totals.tpm).toBeGreaterThan(0);
  });

  it("a pre-three-point era produces ZERO threes, in every game", () => {
    for (const era of ["1950s", "1960s", "1970s"]) {
      for (const s of childSeeds(3, 40)) {
        const g = runPossessionGame(mk({ eraStyleId: era, simulationSeed: s }), FAST);
        expect(g.threePointLegal, era).toBe(false);
        expect(g.gold.totals.tpa, era).toBe(0);
        expect(g.gold.totals.tpm, era).toBe(0);
        expect(g.blue.totals.tpa, era).toBe(0);
      }
    }
  });

  it("outside skill is retained structurally when the three is unavailable", () => {
    // The SHOT goes away; the SKILL does not. A great shooting lineup must
    // still express itself, as long twos and as spacing.
    const shooters = (era, seed) => runPossessionGame(
      buildPossessionInput({ goldIds: SPACING, blueIds: DEFENSE, eraStyleId: era, simulationSeed: seed, coachGoldId: "phil-jackson", coachBlueId: "pat-riley" }), FAST);
    const modern = childSeeds(21, 40).map((s) => shooters("2010s", s));
    const old = childSeeds(21, 40).map((s) => shooters("1960s", s));
    const avg = (gs, f) => gs.reduce((a, g) => a + f(g), 0) / gs.length;
    expect(avg(old, (g) => g.gold.totals.tpa)).toBe(0);
    // The attempts did not vanish — they became two-point attempts.
    expect(avg(old, (g) => g.gold.totals.fga)).toBeGreaterThan(avg(modern, (g) => g.gold.totals.fga) * 0.85);
    expect(avg(old, (g) => g.gold.totals.pts)).toBeGreaterThan(70);
  });

  it("every attempt belongs to a player, a category, an action and a period", () => {
    const g = play({ simulationSeed: 606 });
    const CATS = new Set(["RIM", "PAINT_OR_POST", "MIDRANGE", "THREE_POINT"]);
    const shots = g.possessionLedger.filter((r) => r.shot);
    expect(shots.length).toBeGreaterThan(50);
    for (const r of shots) {
      expect(CATS.has(r.shot), r.shot).toBe(true);
      expect(r.primary).toBeTruthy();
      expect(["PICK_AND_ROLL", "GENERIC_HALF_COURT", "TRANSITION", "POST_UP", "ISOLATION",
        "SPOT_UP", "CUT", "OFF_BALL_SCREEN", "HANDOFF", "ZONE_ATTACK"]).toContain(r.action);
      expect(r.period).toBeGreaterThanOrEqual(1);
      expect(["gold", "blue"]).toContain(r.offense);
    }
  });

  it("good shots miss and poor shots go in", () => {
    // Expected quality and realised make are separate. If the best look always
    // dropped and the worst never did, the engine would be scripted.
    const g = play({ simulationSeed: 909 });
    const shots = g.possessionLedger.filter((r) => r.shot && r.expectedMake != null);
    const good = shots.filter((r) => r.expectedMake >= 0.6);
    const poor = shots.filter((r) => r.expectedMake <= 0.35);
    expect(good.some((r) => r.outcome !== "MADE_FG"), "a good look must be able to miss").toBe(true);
    expect(poor.some((r) => r.outcome === "MADE_FG"), "a poor look must be able to drop").toBe(true);
    for (const r of shots) {
      expect(r.expectedMake).toBeGreaterThan(0.05);
      expect(r.expectedMake).toBeLessThan(0.87);
    }
  });

  it("realised shooting tracks expectation without bias", () => {
    let expSum = 0, n = 0, made = 0;
    for (const s of childSeeds(44, 120)) {
      for (const r of runPossessionGame(mk({ simulationSeed: s })).possessionLedger) {
        if (r.expectedMake == null) continue;
        expSum += r.expectedMake; n++; if (r.outcome === "MADE_FG") made++;
      }
    }
    expect(Math.abs(made / n - expSum / n), "realisation must be unbiased").toBeLessThan(0.02);
  });

  it("the same player varies from game to game, within bounds", () => {
    const lines = childSeeds(66, 60).map((s) => {
      const g = runPossessionGame(mk({ simulationSeed: s }), FAST);
      return g.gold.players.find((p) => p.cardId === "jordan-90s").pts;
    });
    expect(new Set(lines).size, "a player who scores the same every night is scripted").toBeGreaterThan(8);
    expect(Math.min(...lines)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...lines)).toBeLessThan(70);
  });
});

// ── usage ────────────────────────────────────────────────────────────────────
describe("finite usage", () => {
  it("allocated usage sums to exactly 1.0", () => {
    for (const ids of [GOLD, BLUE, SPACING, DEFENSE]) {
      const ctx = preparePossessionContext(buildPossessionInput({ goldIds: ids, blueIds: BLUE, eraStyleId: "2010s", simulationSeed: 1 }));
      const total = ctx.gold.players.reduce((a, p) => a + p.usageShare, 0);
      expect(Math.abs(total - 1), `${ids[0]}: ${total}`).toBeLessThan(1e-9);
      for (const p of ctx.gold.players) expect(p.usageShare).toBeGreaterThan(0);
    }
  });

  it("a superstar stack compresses and an off-ball player keeps value", () => {
    const stack = preparePossessionContext(buildPossessionInput({ goldIds: GOLD, blueIds: BLUE, eraStyleId: "2010s", simulationSeed: 1 })).gold;
    // Five ball-dominant creators cannot all keep a historical share.
    expect(Math.max(...stack.players.map((p) => p.usageShare))).toBeLessThan(0.45);
    // Off-ball value is not erased by compression.
    expect(stack.players.some((p) => p.offBallValue >= 5)).toBe(true);
  });

  it("no arbitrary superstar-stacking penalty exists in the engine", () => {
    for (const { f, src } of engineFiles()) expect(src, f).not.toMatch(/SUPERSTAR_STACK_PENALTY|stackPenalty|superstarPenalty/);
  });

  it("shot volume follows the usage hierarchy", () => {
    const totals = {};
    for (const s of childSeeds(88, 80)) {
      for (const p of runPossessionGame(mk({ simulationSeed: s }), FAST).gold.players) {
        totals[p.cardId] = (totals[p.cardId] || 0) + p.fga;
      }
    }
    const ctx = preparePossessionContext(mk());
    const topUsage = [...ctx.gold.players].sort((a, b) => b.usageShare - a.usageShare)[0];
    const bottomUsage = [...ctx.gold.players].sort((a, b) => a.usageShare - b.usageShare)[0];
    expect(totals[topUsage.cardId]).toBeGreaterThan(totals[bottomUsage.cardId]);
  });
});

// ── actions ──────────────────────────────────────────────────────────────────
describe("action interface", () => {
  it("only implemented action families occur", () => {
    // Phase 6A had three. Phase 6B2 implemented the families it names, and the
    // rule is unchanged: nothing appears that is not actually modelled.
    const IMPLEMENTED = ["PICK_AND_ROLL", "GENERIC_HALF_COURT", "TRANSITION", "POST_UP",
      "ISOLATION", "SPOT_UP", "CUT", "OFF_BALL_SCREEN", "HANDOFF", "ZONE_ATTACK"];
    const g = play({ simulationSeed: 4242 });
    const kinds = new Set(g.possessionLedger.map((r) => r.action));
    for (const k of kinds) expect(IMPLEMENTED).toContain(k);
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("no unimplemented action family is claimed as modelled", () => {
    const src = readFileSync(new URL("../src/v3/possession/actions.js", import.meta.url), "utf8");
    // Post-up, isolation, handoff, off-ball screen, spot-up and cut ARE now
    // implemented, so they may appear. Motion, Princeton and the triangle are
    // not, and must not.
    expect(src).not.toMatch(/actionType:\s*"(MOTION|PRINCETON|TRIANGLE_OFFENSE|FLEX)/);
    expect(src).toMatch(/GENERIC_HALF_COURT/);
  });

  it("the generic action admits it is generic", () => {
    const g = play({ simulationSeed: 12 });
    const src = readFileSync(new URL("../src/v3/possession/actions.js", import.meta.url), "utf8");
    expect(src).toMatch(/tacticalSpecificity: "NONE/);
    expect(g.possessionLedger.some((r) => r.action === "GENERIC_HALF_COURT")).toBe(true);
  });

  it("transition exists but produces no automatic points", () => {
    const games = childSeeds(13, 40).map((s) => runPossessionGame(mk({ simulationSeed: s })));
    const trans = games.flatMap((g) => g.possessionLedger.filter((r) => r.action === "TRANSITION"));
    expect(trans.length).toBeGreaterThan(0);
    expect(trans.some((r) => r.outcome !== "MADE_FG"), "transition must be able to fail").toBe(true);
    // Transition follows a live-ball event or pace, never nothing.
    expect(trans.some((r) => r.outcome === "MADE_FG")).toBe(true);
  });
});

// ── pick-and-roll integration ────────────────────────────────────────────────
describe("pick-and-roll integration", () => {
  it("the versioned action library is consumed, with variant and coverage", () => {
    const g = play({ simulationSeed: 4242 });
    const pnr = g.possessionLedger.filter((r) => r.action === "PICK_AND_ROLL");
    expect(pnr.length).toBeGreaterThan(0);
    for (const r of pnr) {
      expect(r.variant, "the PnR variant must be recorded").toBeTruthy();
      expect(r.coverage, "the defensive coverage must be recorded").toBeTruthy();
      expect(r.route).toBeTruthy();
    }
    expect(resultVersions().actionLibraryVersion).toBe(versionOf("actionLibraryVersion"));
  });

  it("coverage changes which consequence dominates", () => {
    const g = play({ simulationSeed: 4242 });
    const byCoverage = {};
    for (const r of g.possessionLedger.filter((x) => x.action === "PICK_AND_ROLL")) {
      (byCoverage[r.coverage] = byCoverage[r.coverage] || []).push(r.route);
    }
    expect(Object.keys(byCoverage).length, "one coverage for every PnR is not a defence").toBeGreaterThan(1);
    const routes = new Set(Object.values(byCoverage).flat());
    expect(routes.size, "the same action must be able to resolve different ways").toBeGreaterThan(1);
  });

  it("coach pick-and-roll tendency changes how often it is run", () => {
    const share = (coach) => {
      let pnr = 0, total = 0;
      for (const s of childSeeds(17, 30)) {
        const g = runPossessionGame(mk({ simulationSeed: s, coachGoldId: coach }));
        for (const r of g.possessionLedger.filter((x) => x.offense === "gold")) { total++; if (r.action === "PICK_AND_ROLL") pnr++; }
      }
      return pnr / total;
    };
    // D'Antoni's pnr tendency is 10; Jack Ramsay's is far lower.
    const heavy = share("mike-dantoni");
    const light = share("jack-ramsay");
    expect(heavy, `${heavy} vs ${light}`).toBeGreaterThan(light);
  });

  it("no flat pick-and-roll bonus exists anywhere", () => {
    for (const { f, src } of engineFiles()) expect(src, f).not.toMatch(/pnrBonus|coachBonus|eraBonus|nativeEraBonus/);
  });

  it("pick-and-roll cannot become the universally dominant action", () => {
    // A single detailed action must not crowd out everything else merely by
    // being the only one modelled.
    for (const coach of ["mike-dantoni", "phil-jackson", "jack-ramsay"]) {
      const ctx = preparePossessionContext(mk({ coachGoldId: coach }));
      const mix = actionMix(ctx.gold, ctx.blue, ctx.eff, {});
      expect(mix.PICK_AND_ROLL, coach).toBeLessThanOrEqual(PNR_FREQUENCY_CAP);
      expect(mix.GENERIC_HALF_COURT, coach).toBeGreaterThan(0.5);
    }
  });

  it("era changes how the same action is expressed", () => {
    const rimShare = (era) => {
      let rim = 0, shots = 0;
      for (const s of childSeeds(19, 30)) {
        for (const r of runPossessionGame(mk({ eraStyleId: era, simulationSeed: s })).possessionLedger) {
          if (!r.shot) continue; shots++; if (r.shot === "RIM") rim++;
        }
      }
      return rim / shots;
    };
    // A 1960s game funnels far more of its shots to the interior than a 2020s
    // one, from the same rosters — the era changed the expression.
    expect(rimShare("1960s")).toBeGreaterThan(rimShare("2020s"));
  });
});

// ── fatigue ──────────────────────────────────────────────────────────────────
describe("bounded fatigue", () => {
  it("every effect is bounded and documented", () => {
    expect(FATIGUE_BOUNDS.shootingPenaltyMax).toBeLessThanOrEqual(0.06);
    expect(FATIGUE_BOUNDS.turnoverPenaltyMax).toBeLessThanOrEqual(0.1);
    expect(FATIGUE_BOUNDS.defencePenaltyMax).toBeLessThanOrEqual(0.08);
    expect(FATIGUE_BOUNDS.reboundPenaltyMax).toBeLessThanOrEqual(0.07);
    expect(FATIGUE_BOUNDS.quarterRecovery).toBeGreaterThan(0);
    expect(FATIGUE_BOUNDS.quarterRecovery).toBeLessThan(0.5);
  });

  it("fatigue never overwhelms skill", () => {
    // The worst-case fatigue effect must be smaller than the difference skill
    // makes, or a great shooter becomes a poor one by playing.
    expect(FATIGUE_BOUNDS.shootingPenaltyMax).toBeLessThan(0.026 * 5);
  });

  it("a faster, higher-usage game accumulates more fatigue", () => {
    const load = (coach) => {
      const g = runPossessionGame(mk({ coachGoldId: coach, coachBlueId: coach, simulationSeed: 321 }), FAST);
      return g.gold.totals.possessions;
    };
    expect(load("mike-dantoni")).toBeGreaterThan(load("tom-thibodeau"));
  });

  it("no stamina meter is exposed", () => {
    const g = play({ simulationSeed: 1 }, FAST);
    for (const p of g.gold.players) {
      expect(p).not.toHaveProperty("stamina");
      expect(p).not.toHaveProperty("fatigue");
    }
  });

  it("no bench, substitution or foul-out system exists", () => {
    for (const { f, src } of engineFiles()) {
      expect(src, f).not.toMatch(/substitut|benchPlayer|foulOut|foulLimit/i);
    }
    // "disqualification" DOES appear — in the note explaining that none is
    // modelled. That is the documentation of the limitation, not the thing.
    const g0 = play({ simulationSeed: 1 }, FAST);
    expect(g0.gold.internal.personalFoulNote).toMatch(/no disqualification is modelled/i);
    const g = play({ simulationSeed: 2 }, FAST);
    expect(g.gold.players).toHaveLength(5);
  });
});

// ── expectation vs realisation, and confidence ───────────────────────────────
describe("expectation and confidence", () => {
  it("the pregame expectation is stored and never rewritten after the result", () => {
    const g = play({ simulationSeed: 4242 }, FAST);
    for (const k of ["expectedPace", "expectedOffensiveEfficiencyGold", "expectedOffensiveEfficiencyBlue"]) {
      expect(g.expectation, k).toHaveProperty(k);
      expect(Number.isFinite(g.expectation[k])).toBe(true);
    }
    for (const k of ["realizedEfficiencyGold", "realizedEfficiencyBlue", "realizedPace"]) {
      expect(g.realized, k).toHaveProperty(k);
    }
    // The expectation depends only on the context, not on the seed or outcome.
    const other = play({ simulationSeed: 999999 }, FAST);
    expect(other.expectation).toEqual(g.expectation);
    expect(other.finalScore).not.toEqual(g.finalScore);
  });

  it("the better-expected team wins more often across matchups", () => {
    // POOLED across matchups. The Phase 6A expectation is deliberately coarse
    // — it compares expected offensive efficiency and knows nothing about
    // pace, variance or matchup specifics — so any single cell is noisy. What
    // must hold is that it beats a coin flip overall; a baseline that did not
    // would be actively misleading rather than merely approximate.
    const rosters = [GOLD, BLUE, SPACING, DEFENSE];
    let hits = 0, total = 0;
    for (let i = 0; i < rosters.length; i++) {
      for (let j = i + 1; j < rosters.length; j++) {
        const games = childSeeds(2028, 120).map((s) => runPossessionGame(
          buildPossessionInput({ goldIds: rosters[i], blueIds: rosters[j], eraStyleId: "2010s", simulationSeed: s, coachGoldId: "phil-jackson", coachBlueId: "phil-jackson" }), FAST));
        const e = games[0].expectation;
        const favoured = e.expectedOffensiveEfficiencyGold >= e.expectedOffensiveEfficiencyBlue ? "Gold" : "Blue";
        hits += games.filter((g) => g.winner === favoured).length;
        total += games.length;
        // No matchup may be a certainty. A sport where the better team always
        // wins is not a sport.
        const rate = games.filter((g) => g.winner === favoured).length / games.length;
        expect(rate).toBeLessThan(0.95);
        expect(rate).toBeGreaterThan(0.05);
      }
    }
    expect(hits / total, `favoured team won ${((hits / total) * 100).toFixed(1)}%`).toBeGreaterThan(0.5);
  });

  it("confidence travels with the result and is not variance", () => {
    const g = play({ simulationSeed: 3 }, FAST);
    expect(g.confidence).toBeTruthy();
    expect(g.confidence.note).toMatch(/never widens|never/i);
    // Two lineups with very different data confidence must not differ in the
    // WIDTH of their score distributions because of confidence.
    const spread = (ids) => {
      const scores = childSeeds(5, 120).map((s) => runPossessionGame(
        buildPossessionInput({ goldIds: ids, blueIds: BLUE, eraStyleId: "1960s", simulationSeed: s }), FAST).finalScore.gold);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      return Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
    };
    const lowConfidence = spread(["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"]);
    const highConfidence = spread(GOLD);
    // Similar spread: within a factor of two. Confidence is not randomness.
    expect(lowConfidence / highConfidence).toBeGreaterThan(0.5);
    expect(lowConfidence / highConfidence).toBeLessThan(2);
  });
});

// ── result fingerprint and cache identity ────────────────────────────────────
describe("fingerprint and cache identity", () => {
  it("lists exactly the modules that shaped the result", () => {
    const g = play({ simulationSeed: 4242 }, FAST);
    for (const k of [
      "engineVersion", "possessionEngineVersion", "actionLibraryVersion", "playerDataVersion",
      "playerIntelligenceVersion", "teamIntelligenceVersion", "coachDataVersion",
      "coachIntelligenceVersion", "eraDataVersion", "eraStyleVersion", "calibrationVersion",
      "matchupFingerprint", "simulationSeed",
    ]) expect(g.fingerprint, k).toHaveProperty(k);
    // Chemistry is display-only and must not appear.
    expect(g.fingerprint).not.toHaveProperty("chemistryVersion");
    // Phase 6B2 modules appear only when they actually shaped the result: this
    // matchup plays man defence, so the zone version must be ABSENT rather
    // than claimed. Listing a module the result did not depend on would
    // invalidate stored games on an unrelated edit.
    expect(g.fingerprint).toHaveProperty("coachAdjustmentVersion");
    if (!g.zoneResolutionUsed) expect(g.fingerprint).not.toHaveProperty("zoneResolutionVersion");
    expect(g.fingerprint.possessionEngineVersion).toMatch(/^1\./);
  });

  it("same matchup and seed reuse one cache entry; a new seed does not collide", () => {
    const a = play({ simulationSeed: 100 }, FAST);
    const b = play({ simulationSeed: 100 }, FAST);
    const c = play({ simulationSeed: 101 }, FAST);
    const key = (g) => cacheKeys.possessionResult({ matchupFingerprint: g.fingerprint.matchupFingerprint, simulationSeed: g.simulationSeed });
    expect(key(a)).toBe(key(b));
    expect(key(a), "a rematch must not collide with the game it rematches").not.toBe(key(c));
    expect(a.fingerprint.matchupFingerprint).toBe(c.fingerprint.matchupFingerprint);
  });

  it("the cache key is not keyed by matchup alone", () => {
    const g = play({ simulationSeed: 100 }, FAST);
    const k = cacheKeys.possessionResult({ matchupFingerprint: g.fingerprint.matchupFingerprint, simulationSeed: g.simulationSeed });
    expect(k).toContain(String(g.simulationSeed >>> 0));
    expect(k).toContain("pe1-2-0");
    expect(k).toContain("al2-1-0");
  });

  it("development runs use a development namespace", () => {
    const k = cacheKeys.possessionResult({ matchupFingerprint: "abc", simulationSeed: 1 });
    expect(k.startsWith("dev-possession:"), k).toBe(true);
    expect(k.startsWith("result:"), "must not share the production result namespace").toBe(false);
  });
});

// ── production isolation ─────────────────────────────────────────────────────
describe("production isolation", () => {
  const files = (dir) => readdirSync(new URL(dir, import.meta.url)).filter((f) => f.endsWith(".js") || f.endsWith(".jsx"));

  it("no production route imports the possession engine", () => {
    // Phase 6C4D0R: exactly one module — the protected-preview adapter — may
    // import the possession engine. Its access is asserted separately below:
    // default-off flag, per-request production fallback, preview-only
    // namespaces. Everything else in api/ keeps the original invariant.
    const PREVIEW_ADAPTER = "previewEngine.js";
    for (const f of files("../api/")) {
      const src = readFileSync(new URL(`../api/${f}`, import.meta.url), "utf8");
      expect(src, `api/${f} must not import the possession engine`).not.toMatch(/v3\/possession/);
    }
    for (const f of files("../api/_lib/")) {
      if (f === PREVIEW_ADAPTER) continue;
      const src = readFileSync(new URL(`../api/_lib/${f}`, import.meta.url), "utf8");
      expect(src, `api/_lib/${f} must not import the possession engine`).not.toMatch(/v3\/possession/);
    }
  });

  it("the preview adapter is the only possession gateway and is flag-guarded", () => {
    const game = readFileSync(new URL("../api/game.js", import.meta.url), "utf8");
    // game.js reaches possession only through the adapter, behind the
    // default-off flag, inside a try/catch whose catch restores production.
    expect(game).not.toMatch(/v3\/possession/);
    expect(game).toMatch(/f\.previewSimEngine\s*&&/);
    expect(game).toMatch(/computeResultPreview/);
    expect(game).toMatch(/fallback_invoked/);
    const flagsSrc = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    expect(flagsSrc).toMatch(/bool\("PREVIEW_SIM_ENGINE_ENABLED", false\)/);
  });

  it("no UI file imports or exposes possession results", () => {
    const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/v3\/possession/);
    for (const f of readdirSync(new URL("../src/components/", import.meta.url))) {
      if (!f.endsWith(".jsx")) continue;
      expect(readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8"), f).not.toMatch(/v3\/possession/);
    }
  });

  it("the production game route still computes with engine 3.2.0", () => {
    const src = readFileSync(new URL("../api/game.js", import.meta.url), "utf8");
    expect(src).toMatch(/computeResultV3|computeResult/);
    expect(src).not.toMatch(/runPossessionGame/);
    expect(versionOf("engineVersion")).toBe("3.2.0");
  });

  it("the engine is not reachable through any existing flag", () => {
    const src = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    const simV3Line = src.split("\n").find((l) => l.includes("simV3:"));
    expect(simV3Line).not.toMatch(/POSSESSION/);
  });
});
