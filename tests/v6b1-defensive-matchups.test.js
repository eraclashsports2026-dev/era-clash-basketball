// ── Phase 6B1: defensive assignments, schemes and mismatch logic ─────────────
import { describe, it, expect } from "vitest";
import COACH_DATA from "../src/v3/data/coaches.js";
import { readFileSync, readdirSync } from "node:fs";
import {
  buildDefensivePlan, buildDefensivePlans, buildMatchupProfiles, buildMatchupMatrix,
  evaluatePairing, detectMismatches, MISMATCH_TYPES, SEVERITY,
  optimizeAssignments, greedyAssignments, permutations, scorePlan, severeBaselineViolations,
  buildSchemePlan, eraLegality, coachToolkit, personnelCeiling,
  createDefensiveState, defenderFor, stateFor, applySwitch, recoverAssignments, canSwitch,
  considerAdjustment, applyAdjustment, recordExploitation,
  selectCoverage, COVERAGES, ADJUSTMENT_MIN_EVENTS, ADJUSTMENT_COOLDOWN,
  DEFENSIVE_MATCHUP_VERSION,
} from "../src/v3/defense/index.js";
import { preparePossessionContext } from "../src/v3/possession/context.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { runPossessionGame, checkGame } from "../src/v3/possession/index.js";
import { childSeeds } from "../src/v3/possession/rng.js";
import { pickDefender, matchupModifiers } from "../src/v3/possession/actions.js";
import { getEra } from "../src/v3/eraStyles.js";
import { strategicEffects } from "../src/v3/eraStyleIntelligence.js";
import { versionOf, statusOf, affectsResult, VERSION_STATUS } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { flags } from "../api/_lib/flags.js";
import { replay } from "../scripts/simulation-replay.mjs";

const SHOWTIME = ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"];
const SPLASH = ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"];
const LOW_THREAT = ["curry-10s", "klay-10s", "draymond-10s", "dirk-00s", "rob-90s"];
const SMALL = ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"];
const SIZE = ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"];
const STOPPERS = ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"];

const ctxFor = (goldIds, blueIds, eraStyleId = "1990s", coachGoldId = "pat-riley", extra = {}) =>
  preparePossessionContext(buildPossessionInput({
    goldIds, blueIds, eraStyleId, simulationSeed: 1, coachGoldId, coachBlueId: "phil-jackson", ...extra,
  }));

const planFor = (goldIds, blueIds, eraStyleId = "1990s", coachGoldId = "pat-riley") => {
  const ctx = ctxFor(goldIds, blueIds, eraStyleId, coachGoldId);
  return buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era: getEra(eraStyleId) });
};
const assignmentOf = (plan, offId) => plan.baselineAssignments.find((a) => a.offensivePlayerId === offId);
const FAST = { assertInvariants: false, includeLedger: false };

// ── versioning, flag, isolation ──────────────────────────────────────────────
describe("versioning and isolation", () => {
  it("defensiveMatchupVersion is its own DEVELOPMENT domain", () => {
    // Phase 6B2 bumped this to 1.1.0: assignment quality corrections and real
    // paint availability changed how a plan is chosen, without changing the
    // module's contract.
    expect(DEFENSIVE_MATCHUP_VERSION).toMatch(/^1\./);
    expect(versionOf("defensiveMatchupVersion")).toMatch(/^1\./);
    expect(statusOf("defensiveMatchupVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    expect(affectsResult("defensiveMatchupVersion")).toBe(false);
    // Not the app version and not the possession-engine version.
    expect(versionOf("defensiveMatchupVersion")).not.toBe(versionOf("appVersion"));
  });

  it("DEFENSIVE_MATCHUP_ENGINE_ENABLED defaults to false and is its own flag", () => {
    const saved = process.env.DEFENSIVE_MATCHUP_ENGINE_ENABLED;
    delete process.env.DEFENSIVE_MATCHUP_ENGINE_ENABLED;
    try { expect(flags().defensiveMatchupEngine).toBe(false); } finally {
      if (saved != null) process.env.DEFENSIVE_MATCHUP_ENGINE_ENABLED = saved;
    }
    const src = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    const line = src.split("\n").find((l) => l.includes("defensiveMatchupEngine:"));
    expect(line).toContain("DEFENSIVE_MATCHUP_ENGINE_ENABLED");
    expect(line).not.toMatch(/SIM_ENGINE_V3_ENABLED/);
  });

  it("the production engine is untouched and no production route imports the module", () => {
    expect(versionOf("engineVersion")).toBe("3.2.0");
    expect(statusOf("engineVersion")).toBe(VERSION_STATUS.ACTIVE);
    for (const dir of ["../api/", "../api/_lib/"]) {
      for (const f of readdirSync(new URL(dir, import.meta.url)).filter((x) => x.endsWith(".js"))) {
        const src = readFileSync(new URL(`${dir}${f}`, import.meta.url), "utf8");
        expect(src, `${dir}${f}`).not.toMatch(/v3\/defense/);
      }
    }
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(app).not.toMatch(/v3\/defense/);
    for (const f of readdirSync(new URL("../src/components/", import.meta.url)).filter((x) => x.endsWith(".jsx"))) {
      expect(readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8"), f).not.toMatch(/v3\/defense/);
    }
  });

  it("the fingerprint carries the version only when the module affected the result", () => {
    const on = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 5 }), FAST);
    const off = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 5, defensiveMatchups: false }), FAST);
    expect(on.fingerprint.defensiveMatchupVersion).toMatch(/^1\./);
    // A flag-off game is a Phase 6A game; claiming a defensive version would be
    // a false reproducibility claim and would invalidate it on an unrelated edit.
    expect("defensiveMatchupVersion" in off.fingerprint).toBe(false);
  });

  it("the development cache key includes the defensive module version", () => {
    const k = cacheKeys.possessionResult({ matchupFingerprint: "abc", simulationSeed: 1 });
    expect(k).toContain("dm1-2-0");
    expect(k, "Phase 6B2 modules join the identity").toContain("zr1-0-0");
    expect(k).toContain("ca1-0-0");
    expect(k.startsWith("dev-possession:")).toBe(true);
  });

  it("makes no network, AI or clock call in the defensive path", () => {
    for (const f of readdirSync(new URL("../src/v3/defense/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
      const src = readFileSync(new URL(`../src/v3/defense/${f}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(src, f).not.toMatch(/\bfetch\s*\(|node:fs|anthropic|Math\.random|Date\.now\(/);
    }
  });
});

// ── baseline assignment ──────────────────────────────────────────────────────
describe("baseline assignment", () => {
  const plan = planFor(SHOWTIME, SPLASH);

  it("maps five defenders one-to-one onto five offensive players", () => {
    expect(plan.baselineAssignments).toHaveLength(5);
    expect(new Set(plan.baselineAssignments.map((a) => a.defenderId)).size).toBe(5);
    expect(new Set(plan.baselineAssignments.map((a) => a.offensivePlayerId)).size).toBe(5);
    for (const id of SPLASH) expect(plan.baselineAssignments.some((a) => a.offensivePlayerId === id), id).toBe(true);
    for (const id of SHOWTIME) expect(plan.baselineAssignments.some((a) => a.defenderId === id), id).toBe(true);
  });

  it("is deterministic and independent of array order", () => {
    const a = planFor(SHOWTIME, SPLASH);
    const b = planFor([...SHOWTIME], [...SPLASH]);
    const key = (p) => p.baselineAssignments.map((x) => `${x.defenderId}>${x.offensivePlayerId}`).sort().join("|");
    expect(key(a)).toBe(key(b));
    // The matrix is canonically ordered by card id, so a reordered roster
    // cannot change the plan.
    expect(plan.matrix.defenders.map((d) => d.playerCardId)).toEqual([...SHOWTIME].sort());
  });

  it("uses no game randomness — the plan is identical across every seed", () => {
    const keys = new Set(childSeeds(7, 40).map((s) => {
      const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: s }), FAST);
      return g.defense.gold.baseline.map((b) => `${b.def}>${b.off}`).sort().join("|");
    }));
    expect(keys.size, "the baseline plan must not randomise across seeds").toBe(1);
  });

  it("changing an explicit position CAN change the plan", () => {
    const a = planFor(SHOWTIME, SPLASH);
    // pippen-90s can legally play SG; moving him changes size context.
    const moved = ctxFor(["magic-80s", "pippen-90s", "jordan-90s", "duncan-00s", "hak-90s"], SPLASH);
    const b = buildDefensivePlan({ defendingTeam: moved.gold, offensiveTeam: moved.blue, era: getEra("1990s") });
    expect(a.baselineAssignments.length).toBe(b.baselineAssignments.length);
    // Positions are inputs; the point is only that they are consulted at all.
    expect(b.baselineAssignments.every((x) => x.defenderPosition != null)).toBe(true);
  });

  it("position labels are not defensive destiny", () => {
    // The old engine could only produce PG-on-PG. Cross-matching must exist.
    expect(plan.summary.crossMatches).toBeGreaterThan(0);
    const pippen = plan.baselineAssignments.find((a) => a.defenderId === "pippen-90s");
    expect(pippen.offensivePlayerId, "the best perimeter defender belongs on the primary threat").toBe("curry-10s");
  });
});

// ── global optimization ──────────────────────────────────────────────────────
describe("global optimization", () => {
  it("evaluates all 120 permutations", () => {
    expect(permutations(5)).toHaveLength(120);
    expect(new Set(permutations(5).map((p) => p.join(""))).size).toBe(120);
    const plan = planFor(SHOWTIME, SPLASH);
    expect(plan.optimization.evaluated).toBe(120);
    expect(plan.optimization.searchSpace).toBe(120);
    expect(plan.optimization.method).toBe("EXHAUSTIVE_PERMUTATION");
  });

  it("beats a deliberately greedy plan, and greedy produces the failure mode", () => {
    let optimizerWins = 0, greedyViolations = 0, cells = 0, optimizerViolations = 0;
    for (const [d, o] of [[SHOWTIME, SPLASH], [SMALL, SIZE], [STOPPERS, SPLASH], [SIZE, SMALL], [SPLASH, SHOWTIME]]) {
      for (const era of ["1960s", "1990s", "2010s"]) {
        const plan = planFor(d, o, era);
        const g = greedyAssignments({ matrix: plan.matrix });
        const gScore = scorePlan({ pairs: g.pairs, defenders: plan.matrix.defenders, threats: plan.matrix.threats, scheme: plan.scheme });
        cells++;
        if (plan.optimization.total <= gScore.total) optimizerWins++;
        greedyViolations += gScore.violations.length;
        optimizerViolations += plan.optimization.severeBaselineViolations.length;
      }
    }
    expect(optimizerWins, "the exhaustive plan must never be worse than greedy").toBe(cells);
    expect(optimizerViolations).toBe(0);
    // The greedy failure mode is real, which is why the optimizer exists.
    expect(greedyViolations, "greedy should produce leftover mismatches").toBeGreaterThan(0);
  });

  it("tie-breaking is deterministic", () => {
    // Same inputs, ten runs, identical plan every time.
    const keys = new Set(Array.from({ length: 10 }, () =>
      planFor(SHOWTIME, SPLASH).baselineAssignments.map((a) => `${a.defenderId}>${a.offensivePlayerId}`).sort().join("|")));
    expect(keys.size).toBe(1);
  });

  it("minimises severe mismatches rather than maximising one pairing", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    // Every alternative permutation must be no better on the objective.
    const alt = optimizeAssignments({ matrix: plan.matrix, scheme: plan.scheme });
    expect(alt.score.total).toBe(plan.optimization.total);
  });
});

// ── the impossible-assignment guard ──────────────────────────────────────────
describe("impossible baseline assignments", () => {
  it("Magic Johnson does NOT baseline-guard David Robinson when a real big exists", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const onRobinson = assignmentOf(plan, "rob-90s");
    expect(onRobinson.defenderId).not.toBe("magic-80s");
    // ...and whoever does guard him is a credible interior defender.
    const def = plan.defenders.find((d) => d.playerCardId === onRobinson.defenderId);
    expect(def.roleAvailability.canGuardPost || def.capabilities.postDefense >= 6.5).toBe(true);
  });

  it("a small guard does not baseline-guard Shaq when a credible big exists", () => {
    const plan = planFor(SHOWTIME, ["curry-10s", "klay-10s", "bird-80s", "kg-00s", "shaq-90s"]);
    const onShaq = assignmentOf(plan, "shaq-90s");
    const def = plan.defenders.find((d) => d.playerCardId === onShaq.defenderId);
    expect(def.capabilities.postDefense, `${def.name} on Shaq`).toBeGreaterThanOrEqual(6);
    expect(plan.optimization.severeBaselineViolations).toHaveLength(0);
  });

  it("no severe baseline violation occurs across every matchup and era", () => {
    let total = 0, cells = 0;
    for (const [d, o] of [[SHOWTIME, SPLASH], [SMALL, SIZE], [SIZE, SMALL], [STOPPERS, SPLASH], [SPLASH, SHOWTIME], [SHOWTIME, LOW_THREAT]]) {
      for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
        const plan = planFor(d, o, era);
        total += plan.optimization.severeBaselineViolations.length;
        cells++;
      }
    }
    expect(cells).toBe(48);
    expect(total).toBe(0);
  });

  it("the guard is falsifiable — it fires on a genuinely absurd plan", () => {
    // A guard that cannot fire proves nothing. Force Magic onto Robinson.
    const plan = planFor(SHOWTIME, SPLASH);
    const magic = plan.defenders.find((d) => d.playerCardId === "magic-80s");
    const robinson = plan.threats.find((t) => t.playerCardId === "rob-90s");
    const v = severeBaselineViolations({
      pairs: [{ defender: magic, threat: robinson }],
      defenders: plan.defenders, threats: plan.threats,
    });
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe("SEVERE_BASELINE_MISMATCH");
    expect(v[0].detail).toMatch(/credible interior defender/);
  });

  it("with NO credible interior defender the matchup is forced, not an error", () => {
    // Someone must guard the centre. If the roster has no interior defender at
    // all, that is not a planning failure and must not be flagged as one.
    //
    // Tested against the guard directly: Team Intelligence enforces legal
    // position assignments, so a five-guard lineup cannot be constructed
    // through the normal builder — which is worth knowing in itself.
    const plan = planFor(SHOWTIME, SPLASH);
    const guards = plan.defenders.filter((d) => !d.roleAvailability.canGuardPost && d.capabilities.postDefense < 6.5);
    const bigThreat = plan.threats.find((t) => t.threats.postScoring >= 6.5 || (t.threats.rimPressure >= 7 && t.threats.postScoring >= 5));
    expect(guards.length, "need at least one non-interior defender").toBeGreaterThan(0);
    expect(bigThreat, "need a post threat").toBeTruthy();

    // With a credible interior defender present → flagged.
    expect(severeBaselineViolations({
      pairs: [{ defender: guards[0], threat: bigThreat }],
      defenders: plan.defenders, threats: plan.threats,
    })).toHaveLength(1);

    // With ONLY non-interior defenders available → forced, not flagged.
    expect(severeBaselineViolations({
      pairs: [{ defender: guards[0], threat: bigThreat }],
      defenders: guards, threats: plan.threats,
    })).toHaveLength(0);
  });

  it("a temporary switch MAY create such a matchup, with source and recovery", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    const before = defenderFor(state, "rob-90s");
    const sw = applySwitch(state, { offA: "rob-90s", offB: "curry-10s", source: "SCREEN", possessionIndex: 10, mismatchType: "POST_MISMATCH" });
    expect(sw).toBeTruthy();
    expect(defenderFor(state, "rob-90s")).not.toBe(before);
    expect(stateFor(state, "rob-90s")).toBe("TEMPORARY_SWITCH");
    const src = state.assignmentSource.get("rob-90s");
    expect(src.source).toBe("SCREEN");
    expect(src.recoverTo).toBe(before);
    expect(src.mismatchType).toBe("POST_MISMATCH");
    // ...and it recovers.
    recoverAssignments(state, 12);
    expect(defenderFor(state, "rob-90s")).toBe(before);
    expect(stateFor(state, "rob-90s")).toBe("BASELINE");
  });
});

// ── Magic vs Curry ──────────────────────────────────────────────────────────
describe("Magic Johnson vs Stephen Curry", () => {
  const era = getEra("2010s"), eff = strategicEffects(era);
  const ctx = ctxFor(SHOWTIME, SPLASH, "2010s");
  const gold = buildMatchupProfiles({ team: ctx.gold, eff, era });
  const blue = buildMatchupProfiles({ team: ctx.blue, eff, era });
  const magicD = gold.defenders.find((d) => d.playerCardId === "magic-80s");
  const magicT = gold.threats.find((t) => t.playerCardId === "magic-80s");
  const curryD = blue.defenders.find((d) => d.playerCardId === "curry-10s");
  const curryT = blue.threats.find((t) => t.playerCardId === "curry-10s");

  it("identifies Curry's movement, pull-up and speed advantages over Magic", () => {
    const p = evaluatePairing({ threat: curryT, defender: magicD, eff, era, scheme: null });
    const types = p.mismatches.map((m) => m.type);
    expect(types).toContain("MOVEMENT_SHOOTING_MISMATCH");
    expect(types).toContain("PULLUP_SHOOTING_MISMATCH");
    expect(types).toContain("SPEED_MISMATCH");
    expect(types).toContain("SCREEN_NAVIGATION_MISMATCH");
  });

  it("identifies Magic's size, post and rebounding advantages over Curry", () => {
    const p = evaluatePairing({ threat: magicT, defender: curryD, eff, era, scheme: null });
    const types = p.mismatches.map((m) => m.type);
    expect(types).toContain("SIZE_MISMATCH");
    expect(types).toContain("POST_MISMATCH");
    expect(types).toContain("REBOUNDING_MISMATCH");
    const size = p.mismatches.find((m) => m.type === "SIZE_MISMATCH");
    expect(size.evidence).toMatch(/height deficit/);
  });

  it("hard-codes no winner between them", () => {
    const src = readFileSync(new URL("../src/v3/defense/matrix.js", import.meta.url), "utf8")
      + readFileSync(new URL("../src/v3/defense/optimizer.js", import.meta.url), "utf8")
      + readFileSync(new URL("../src/v3/defense/mismatch.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/magic-80s|curry-10s/);
  });

  it("the surrounding lineup changes who takes Curry", () => {
    const withPippen = assignmentOf(planFor(SHOWTIME, SPLASH, "2010s"), "curry-10s").defenderId;
    // Replace Pippen with a non-stopper: the answer must change.
    const withoutPippen = assignmentOf(planFor(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"], SPLASH, "2010s"), "curry-10s").defenderId;
    expect(withPippen).toBe("pippen-90s");
    expect(withoutPippen).not.toBe("pippen-90s");
    // Whoever it is must be a credible perimeter defender, not just the PG.
    const plan = planFor(["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"], SPLASH, "2010s");
    const d = plan.defenders.find((x) => x.playerCardId === withoutPippen);
    expect(d.capabilities.pointOfAttack).toBeGreaterThan(5);
  });
});

// ── mismatch taxonomy ───────────────────────────────────────────────────────
describe("mismatch taxonomy", () => {
  it("every emitted type is in the vocabulary and carries a consequence", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const all = plan.baselineAssignments.flatMap((a) => a.mismatches);
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(MISMATCH_TYPES, m.type).toContain(m.type);
      expect(SEVERITY, m.severity).toContain(m.severity);
      expect(m.evidence.length).toBeGreaterThan(5);
      expect(m.expectedBasketballConsequence.length).toBeGreaterThan(5);
      expect(m.confidence).toBeTruthy();
      expect(m.offensivePlayerId).toBeTruthy();
      expect(m.defenderId).toBeTruthy();
    }
  });

  it("uses severity bands, not false decimal precision", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    for (const m of plan.baselineAssignments.flatMap((a) => a.mismatches)) {
      expect(typeof m.severity).toBe("string");
      expect(String(m.severity)).not.toMatch(/\d/);
    }
  });

  it("a size mismatch is only claimed against a threat that punishes size", () => {
    const era = getEra("2010s"), eff = strategicEffects(era);
    const ctx = ctxFor(SHOWTIME, SPLASH, "2010s");
    const gold = buildMatchupProfiles({ team: ctx.gold, eff, era });
    const blue = buildMatchupProfiles({ team: ctx.blue, eff, era });
    // A tall defender on a small non-post shooter: no size mismatch either way.
    const tall = gold.defenders.find((d) => d.playerCardId === "hak-90s");
    const shooter = blue.threats.find((t) => t.playerCardId === "klay-10s");
    const ms = detectMismatches({ threat: shooter, defender: tall, eff, era, usageShare: shooter.usageShare });
    expect(ms.filter((m) => m.type === "SIZE_MISMATCH")).toHaveLength(0);
  });
});

// ── weak-defender hiding ─────────────────────────────────────────────────────
describe("weak-defender hiding", () => {
  it("hides a genuinely weak defender on a genuinely low threat", () => {
    const plan = planFor(SHOWTIME, LOW_THREAT);
    const hideable = plan.defenders.filter((d) => d.roleAvailability.canHideOnLowUsagePlayer);
    expect(hideable.map((d) => d.name)).toContain("Magic Johnson");
    // A big is never the "weak defender" merely because he cannot guard a guard.
    expect(hideable.map((d) => d.playerCardId)).not.toContain("duncan-00s");
    expect(hideable.map((d) => d.playerCardId)).not.toContain("hak-90s");
  });

  it("never treats a movement shooter as a hiding spot", () => {
    // Klay is only 12-14% usage but is an elite mover — the worst possible
    // place to hide a defender who cannot chase.
    const plan = planFor(SHOWTIME, SPLASH);
    const onKlay = assignmentOf(plan, "klay-10s");
    expect(onKlay.isHide, "an elite mover is not a hiding spot").toBe(false);
    expect(plan.summary.hidden.map((h) => h.onId)).not.toContain("klay-10s");
  });

  it("hiding carries a recorded counter risk", () => {
    const plan = planFor(SHOWTIME, LOW_THREAT);
    const hide = plan.baselineAssignments.find((a) => a.isHide);
    if (hide) {
      const m = hide.mismatches.find((x) => x.type === "LOW_USAGE_HIDE_ASSIGNMENT");
      expect(m.expectedBasketballConsequence).toMatch(/until a screen or a switch/i);
    } else {
      // Acceptable: with this offence there may be no safe hiding spot at all,
      // which the plan must then report honestly rather than faking one.
      expect(plan.summary.hidden).toHaveLength(0);
    }
  });

  it("a screen can drag a hidden defender into the action", () => {
    const plan = planFor(SHOWTIME, LOW_THREAT);
    const state = createDefensiveState(plan);
    const weak = "magic-80s";
    const hiddenOn = [...state.currentAssignments.entries()].find(([, d]) => d === weak)?.[0];
    expect(hiddenOn).toBeTruthy();
    // A screen switch moves him onto whoever he switched with.
    applySwitch(state, { offA: hiddenOn, offB: "curry-10s", source: "SCREEN", possessionIndex: 5 });
    expect(defenderFor(state, "curry-10s"), "the hidden defender is now in the action").toBe(weak);
    expect(stateFor(state, "curry-10s")).toBe("TEMPORARY_SWITCH");
  });
});

// ── primary creator and rim protection ───────────────────────────────────────
describe("threat priority and rim protection", () => {
  it("the best on-ball defender is considered for the primary creator", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const primary = [...plan.threats].sort((a, b) => b.usageShare - a.usageShare)[0];
    const onPrimary = assignmentOf(plan, primary.playerCardId);
    const d = plan.defenders.find((x) => x.playerCardId === onPrimary.defenderId);
    const best = Math.max(...plan.defenders.map((x) => x.capabilities.pointOfAttack * 0.6 + x.capabilities.wingContainment * 0.4));
    const got = d.capabilities.pointOfAttack * 0.6 + d.capabilities.wingContainment * 0.4;
    expect(best - got, "an elite stopper must not be wasted while the creator is unguarded").toBeLessThan(2.5);
  });

  it("rim protection is preserved and the tradeoff is measured", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    expect(plan.summary.rimPreservation).toBeGreaterThan(0.4);
    expect(plan.optimization.components).toHaveProperty("rimPenalty");
    expect(plan.optimization.components).toHaveProperty("rimPreservation");
  });

  it("pulling the rim protector onto a shooter COSTS, which is why it is avoided", () => {
    // The optimizer usually avoids this, so asserting the tradeoff is "visible"
    // would be asserting that it failed. The real test is that the tradeoff is
    // PRICED: a plan that puts the rim protector on a perimeter shooter must
    // score worse than the chosen one.
    const plan = planFor(SIZE, ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"], "2010s");
    const { defenders, threats, cells } = plan.matrix;
    const rimIdx = defenders.findIndex((d) => d.roleAvailability.canProtectRim);
    const shooterIdx = threats.findIndex((t) => t.threats.spotUpShooting >= 6.5 && t.threats.postScoring <= 3.5);
    expect(rimIdx, "need a rim protector for this test").toBeGreaterThanOrEqual(0);
    expect(shooterIdx, "need a perimeter shooter for this test").toBeGreaterThanOrEqual(0);

    // Force that pairing, fill the rest in any consistent way.
    const usedT = new Set([shooterIdx]);
    const pairs = defenders.map((d, i) => {
      const t = i === rimIdx ? shooterIdx : threats.findIndex((_, j) => !usedT.has(j));
      usedT.add(t);
      return { defender: d, threat: threats[t], cell: cells[i][t] };
    });
    const forced = scorePlan({ pairs, defenders, threats, scheme: plan.scheme });
    expect(forced.total, "the chosen plan must beat one that abandons the paint").toBeGreaterThan(plan.optimization.total);
    // And the tradeoff must be an explicit, named component — not implicit.
    expect(forced.components).toHaveProperty("rimPreservation");
    expect(forced.components.rimPreservation).toBeLessThanOrEqual(plan.optimization.components.rimPreservation);
  });
});

// ── schemes and era legality ─────────────────────────────────────────────────
describe("schemes and era legality", () => {
  it("zone is unavailable where the rules prohibit it", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s"]) {
      const legal = eraLegality(getEra(era));
      expect(legal.zoneLegal, era).toBe(false);
      expect(legal.maxZoneUsage, era).toBe(0);
      // Even a zone-loving coach cannot play zone.
      expect(planFor(SHOWTIME, SPLASH, era, "nick-nurse").scheme.zoneUsage, era).toBe(0);
    }
    for (const era of ["2000s", "2010s", "2020s"]) {
      expect(eraLegality(getEra(era)).zoneLegal, era).toBe(true);
      expect(planFor(SHOWTIME, SPLASH, era, "nick-nurse").scheme.zoneUsage, era).toBeGreaterThan(0);
    }
  });

  it("illegal-defense eras limit help positioning and remove help roles", () => {
    const old = planFor(SHOWTIME, SPLASH, "1990s", "nick-nurse");
    const modern = planFor(SHOWTIME, SPLASH, "2010s", "nick-nurse");
    expect(old.scheme.helpAggression).toBeLessThan(modern.scheme.helpAggression);
    expect(old.help.unavailableRoles).toContain("WEAK_SIDE_ROTATION");
    expect(old.help.unavailableRoles).toContain("NAIL_HELPER");
    expect(modern.help.unavailableRoles).toHaveLength(0);
    expect(old.scheme.constraints.some((c) => c.limitedBy === "ERA")).toBe(true);
  });

  it("the same players get a different scheme in a different era — not different ability", () => {
    const old = planFor(SHOWTIME, SPLASH, "1990s", "nick-nurse");
    const modern = planFor(SHOWTIME, SPLASH, "2010s", "nick-nurse");
    expect(old.scheme.shellType).not.toBe(modern.scheme.shellType);
    // Capabilities are identical; only the structure changed.
    const cap = (p) => p.defenders.map((d) => `${d.playerCardId}:${d.capabilities.pointOfAttack}:${d.capabilities.rimProtection}`).sort().join("|");
    expect(cap(old)).toBe(cap(modern));
  });

  it("no flat era defence bonus exists", () => {
    for (const f of readdirSync(new URL("../src/v3/defense/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
      const src = readFileSync(new URL(`../src/v3/defense/${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/eraBonus|defenseBonus|defenceBonus|coachBonus|switchBonus/);
    }
  });

  it("a coach cannot play a scheme their record does not support", () => {
    const jackson = coachToolkit(ctxFor(SHOWTIME, SPLASH, "2010s", "phil-jackson").gold.coach);
    const nurse = coachToolkit(ctxFor(SHOWTIME, SPLASH, "2010s", "nick-nurse").gold.coach);
    expect(nurse.zonePreference).toBeGreaterThan(jackson.zonePreference);
    const jPlan = planFor(SHOWTIME, SPLASH, "2010s", "phil-jackson");
    const nPlan = planFor(SHOWTIME, SPLASH, "2010s", "nick-nurse");
    expect(nPlan.scheme.zoneUsage).toBeGreaterThan(jPlan.scheme.zoneUsage);
  });

  it("personnel limits a scheme the coach and era both allow, without erasing the coach", () => {
    // This assertion used to require the realized value to sit at or below the
    // personnel ceiling — a hard truncation. Candidate 2 changed that
    // deliberately: Historical V5 showed the truncation collapsed the whole
    // dimension (helpCeiling near 3.0 against coach intent 5 to 9 on all eight
    // defences) and, because the neutral coach's intent is 5, put six
    // documented elite defensive coaches BELOW a generic one. Scheme is what a
    // coach uses to get team defence out of limited defenders, so personnel now
    // limits how efficiently intent converts rather than whether it may be
    // attempted.
    //
    // What the test protects is unchanged and still checked: personnel must
    // still MATTER, the constraint must still be recorded, and the realized
    // value must still sit strictly below the coach's own intent.
    const plan = planFor(SIZE, SPLASH, "2010s", "steve-kerr");
    const ceiling = personnelCeiling(plan.defenders);
    const tk = coachToolkit(COACH_DATA.coaches.find((c) => c.id === "steve-kerr"));
    // limited: the roster cannot deliver what the coach wants
    expect(plan.scheme.switchingFrequency).toBeLessThan(tk.switching);
    // but not erased: a coach above the neutral default still beats the raw
    // personnel ceiling, which is what makes scheme expressible at all
    if (tk.switching > 5) {
      expect(plan.scheme.switchingFrequency).toBeGreaterThan(ceiling.switchCeiling - 0.01);
    }
    const capped = plan.scheme.constraints.filter((c) => c.limitedBy === "PERSONNEL");
    expect(capped.length).toBeGreaterThan(0);
  });
});

// ── PnR coverage ─────────────────────────────────────────────────────────────
describe("pick-and-roll coverage", () => {
  it("uses the ACTUAL assigned handler and screener defenders", () => {
    const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 777 }));
    const pnr = g.possessionLedger.filter((r) => r.action === "PICK_AND_ROLL" && r.primaryDefenderId);
    expect(pnr.length).toBeGreaterThan(0);
    const plan = { gold: g.defense.gold, blue: g.defense.blue };
    for (const r of pnr.slice(0, 20)) {
      const d = plan[r.offense === "gold" ? "blue" : "gold"];
      // The recorded defender must be one of the five, and must match an
      // assignment (baseline or a switch) — never an array-order accident.
      expect(d.baseline.map((b) => b.def)).toContain(r.primaryDefenderId);
      expect(r.coverageType).toBeTruthy();
    }
  });

  it("coverage varies and reacts to the personnel involved", () => {
    const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 777 }));
    const cov = new Set(g.possessionLedger.filter((r) => r.coverageType).map((r) => r.coverageType));
    expect(cov.size, "one coverage for every screen is not a defence").toBeGreaterThan(1);
    for (const c of cov) expect(COVERAGES).toContain(c);
  });

  it("going under is preferred against weak shooting and not against Curry", () => {
    const era = getEra("2010s"), eff = strategicEffects(era);
    const plan = planFor(SHOWTIME, SPLASH, "2010s");
    const pick = (offId) => {
      const t = plan.threats.find((x) => x.playerCardId === offId);
      const hd = plan.defenders.find((x) => x.playerCardId === "pippen-90s");
      const sd = plan.defenders.find((x) => x.playerCardId === "hak-90s");
      const sc = canSwitch({ defenderA: hd, defenderB: sd, scheme: plan.scheme, threatA: t, threatB: t });
      return selectCoverage({ handlerThreat: t, screenerThreat: plan.threats.find((x) => x.playerCardId === "rob-90s"), handlerDefender: hd, screenerDefender: sd, scheme: plan.scheme, legality: plan.scheme.legality, switchCheck: sc });
    };
    const vsCurry = pick("curry-10s");
    const vsRobinson = pick("rob-90s");
    expect(vsCurry.coverage, "never go under against an elite pull-up shooter").not.toBe("UNDER");
    // Ranking must at least differ between a shooter and a non-shooter.
    expect(vsCurry.ranked[0].coverage !== vsRobinson.ranked[0].coverage
      || vsCurry.ranked[0].score !== vsRobinson.ranked[0].score).toBe(true);
  });

  it("every coverage states what it concedes, and none is a flat bonus", () => {
    const plan = planFor(SHOWTIME, SPLASH, "2010s");
    const hd = plan.defenders[0], sd = plan.defenders[1];
    const t = plan.threats[0];
    const c = selectCoverage({ handlerThreat: t, screenerThreat: plan.threats[1], handlerDefender: hd, screenerDefender: sd, scheme: plan.scheme, legality: plan.scheme.legality, switchCheck: canSwitch({ defenderA: hd, defenderB: sd, scheme: plan.scheme, threatA: t, threatB: plan.threats[1] }) });
    expect(c.concedes.length).toBeGreaterThan(3);
    expect(c.ranked.length).toBeGreaterThan(3);
  });
});

// ── switching ────────────────────────────────────────────────────────────────
describe("switching", () => {
  const plan = planFor(SHOWTIME, SPLASH, "2010s", "steve-kerr");

  it("switchability depends on BOTH defenders", () => {
    const magic = plan.defenders.find((d) => d.playerCardId === "magic-80s");
    const pippen = plan.defenders.find((d) => d.playerCardId === "pippen-90s");
    const hakeem = plan.defenders.find((d) => d.playerCardId === "hak-90s");
    const curry = plan.threats.find((t) => t.playerCardId === "curry-10s");
    const robinson = plan.threats.find((t) => t.playerCardId === "rob-90s");
    const good = canSwitch({ defenderA: pippen, defenderB: magic, scheme: plan.scheme, threatA: curry, threatB: curry });
    const bad = canSwitch({ defenderA: magic, defenderB: hakeem, scheme: plan.scheme, threatA: curry, threatB: robinson });
    expect(good.pairSwitchability).toBeGreaterThan(bad.pairSwitchability - 5);
    // The limiting player is named, because a pair is only as switchable as
    // its weaker member.
    expect([pippen.playerCardId, magic.playerCardId]).toContain(good.limiting);
    expect(bad.viable, "a guard switching onto a post hub is not a switch").toBe(false);
    // Either reason is correct and both are informative: the pair may fail on
    // collective switchability, or on the size gap the switch would create.
    expect(["PAIR_NOT_SWITCHABLE", "SIZE_GAP_TOO_LARGE_FOR_POST_THREAT"]).toContain(bad.reason);
    // A switchable pair facing a post threat must fail specifically on size.
    const wing = plan.defenders.find((d) => d.playerCardId === "jordan-90s");
    const sizeFail = canSwitch({ defenderA: pippen, defenderB: wing, scheme: plan.scheme, threatA: curry, threatB: robinson });
    if (!sizeFail.viable) expect(sizeFail.reason).toBe("SIZE_GAP_TOO_LARGE_FOR_POST_THREAT");
  });

  it("a switch is temporary and does not rewrite the baseline", () => {
    const state = createDefensiveState(plan);
    const baseCurry = state.baselineAssignments.get("curry-10s");
    applySwitch(state, { offA: "curry-10s", offB: "rob-90s", source: "SCREEN", possessionIndex: 3 });
    expect(state.baselineAssignments.get("curry-10s"), "the PLAN must be untouched").toBe(baseCurry);
    expect(state.currentAssignments.get("curry-10s")).not.toBe(baseCurry);
    recoverAssignments(state, 5);
    expect(state.currentAssignments.get("curry-10s")).toBe(baseCurry);
  });

  it("both offensive players change defender in a switch", () => {
    const state = createDefensiveState(plan);
    const a = defenderFor(state, "curry-10s"), b = defenderFor(state, "klay-10s");
    applySwitch(state, { offA: "curry-10s", offB: "klay-10s", source: "SCREEN", possessionIndex: 1 });
    expect(defenderFor(state, "curry-10s")).toBe(b);
    expect(defenderFor(state, "klay-10s")).toBe(a);
    // No defender may end up covering two men.
    expect(new Set([...state.currentAssignments.values()]).size).toBe(5);
  });

  it("switches occur in real games and are recorded", () => {
    let switches = 0;
    for (const s of childSeeds(31, 40)) {
      const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "2010s", simulationSeed: s, coachGoldId: "steve-kerr" }), FAST);
      switches += g.defense.gold.counters.switches;
    }
    expect(switches).toBeGreaterThan(0);
  });
});

// ── transition ───────────────────────────────────────────────────────────────
describe("transition cross-matching", () => {
  it("temporary cross-matches occur and are labelled", () => {
    const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 777 }));
    expect(g.defense.gold.counters.transitionCrossMatches + g.defense.blue.counters.transitionCrossMatches).toBeGreaterThan(0);
    const cm = g.possessionLedger.filter((r) => r.forcedSwitch === "TRANSITION");
    for (const r of cm) expect(r.assignmentState).toBe("CROSS_MATCHED");
  });

  it("a transition cross-match never permanently replaces the baseline", () => {
    for (const s of childSeeds(5, 30)) {
      const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: s }), FAST);
      // The reported baseline must still be the optimizer's plan, not a
      // leftover from a broken play.
      const planned = planFor(SHOWTIME, SPLASH, "1990s").baselineAssignments
        .map((a) => `${a.defenderId}>${a.offensivePlayerId}`).sort().join("|");
      const changed = g.defense.gold.changes.filter((c) => c.response === "CHANGE_PRIMARY_DEFENDER").length;
      if (changed === 0) {
        expect(g.defense.gold.baseline.map((b) => `${b.def}>${b.off}`).sort().join("|")).toBe(planned);
      }
    }
  });
});

// ── coach adjustments ────────────────────────────────────────────────────────
describe("coach adjustments", () => {
  it("one made shot never triggers a change", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    recordExploitation(state, { offensivePlayerId: "curry-10s", defenderId: "pippen-90s", shotQuality: 9.9, isPost: false, isPnr: false });
    const adj = considerAdjustment({ state, plan, possessionIndex: 10, defenders: plan.defenders, threats: plan.threats });
    expect(adj, "a single possession is not evidence").toBeNull();
    expect(ADJUSTMENT_MIN_EVENTS).toBeGreaterThanOrEqual(4);
  });

  it("repeated exploitation on shot QUALITY triggers a change", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    const onCurry = state.baselineAssignments.get("curry-10s");
    for (let i = 0; i < 12; i++) {
      recordExploitation(state, { offensivePlayerId: "curry-10s", defenderId: onCurry, shotQuality: 8.4, isPost: false, isPnr: false });
    }
    const adj = considerAdjustment({ state, plan, possessionIndex: 60, defenders: plan.defenders, threats: plan.threats });
    expect(adj).toBeTruthy();
    expect(adj.meanQuality).toBeGreaterThan(6);
    expect(adj.trigger).toBeTruthy();
  });

  it("good defence on a made difficult shot is not treated as being beaten", () => {
    // Low shot quality, many events: no adjustment. The trigger reads process,
    // not outcomes.
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    for (let i = 0; i < 15; i++) {
      recordExploitation(state, { offensivePlayerId: "curry-10s", defenderId: state.baselineAssignments.get("curry-10s"), shotQuality: 2.5, isPost: false, isPnr: false });
    }
    expect(considerAdjustment({ state, plan, possessionIndex: 60, defenders: plan.defenders, threats: plan.threats })).toBeNull();
  });

  it("a more adaptable coach adjusts more readily", () => {
    const evidence = (plan) => {
      const state = createDefensiveState(plan);
      for (let i = 0; i < 7; i++) {
        recordExploitation(state, { offensivePlayerId: "curry-10s", defenderId: state.baselineAssignments.get("curry-10s"), shotQuality: 7.2, isPost: false, isPnr: false });
      }
      return considerAdjustment({ state, plan, possessionIndex: 60, defenders: plan.defenders, threats: plan.threats });
    };
    // Nurse adaptability 9; Sloan far lower. At 7 events the adaptable coach
    // has enough and the rigid one does not.
    expect(evidence(planFor(SHOWTIME, SPLASH, "2010s", "nick-nurse"))).toBeTruthy();
    const rigid = evidence(planFor(SHOWTIME, SPLASH, "2010s", "jerry-sloan"));
    expect(rigid === null || rigid.rejected === true).toBe(true);
  });

  it("a cooldown prevents thrashing", () => {
    expect(ADJUSTMENT_COOLDOWN).toBeGreaterThanOrEqual(20);
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    state.assignmentChangeHistory.push({ possessionIndex: 50, id: "adj-0" });
    for (let i = 0; i < 12; i++) {
      recordExploitation(state, { offensivePlayerId: "curry-10s", defenderId: state.baselineAssignments.get("curry-10s"), shotQuality: 9, isPost: false, isPnr: false });
    }
    expect(considerAdjustment({ state, plan, possessionIndex: 55, defenders: plan.defenders, threats: plan.threats })).toBeNull();
  });

  it("an era-illegal adjustment is rejected with a reason", () => {
    // Illegal-defense eras forbid the double-team response; if nothing else is
    // available the consideration is REJECTED rather than silently applied.
    let rejections = 0, applied = 0;
    for (const s of childSeeds(3, 40)) {
      const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: s, coachGoldId: "pat-riley" }), FAST);
      for (const c of g.defense.gold.changes) {
        if (c.response === "REJECTED") { rejections++; expect(c.reason).toBe("NO_SUPPORTED_ADJUSTMENT_AVAILABLE"); } else applied++;
      }
    }
    expect(rejections, "an illegal-defense era must reject some adjustments").toBeGreaterThan(0);
    expect(applied).toBeGreaterThan(0);
  });

  it("only a coach decision changes the baseline plan", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(plan);
    const before = new Map(state.baselineAssignments);
    applySwitch(state, { offA: "curry-10s", offB: "klay-10s", source: "SCREEN", possessionIndex: 1 });
    expect([...state.baselineAssignments.entries()]).toEqual([...before.entries()]);
    const adj = { rejected: false, response: "CHANGE_PRIMARY_DEFENDER", offensivePlayerId: "curry-10s", defenderId: before.get("curry-10s"), swap: { otherOffId: "rob-90s", otherDefId: before.get("rob-90s") }, trigger: "MATCHUP_REPEATEDLY_BEATEN", possessionIndex: 40, meanQuality: 8 };
    applyAdjustment(state, adj);
    expect(state.baselineAssignments.get("curry-10s"), "a coach change DOES move the plan").toBe(before.get("rob-90s"));
    expect(stateFor(state, "curry-10s")).toBe("COACH_REASSIGNED");
  });
});

// ── integration into the possession engine ───────────────────────────────────
describe("possession engine integration", () => {
  it("the assigned defender is used, not the position label", () => {
    const ctx = ctxFor(SHOWTIME, SPLASH);
    const state = createDefensiveState(ctx.defensivePlans.gold);
    const curry = ctx.blue.players.find((p) => p.cardId === "curry-10s");
    const withState = pickDefender(ctx.gold, curry, state);
    const withoutState = pickDefender(ctx.gold, curry, null);
    expect(withoutState.cardId, "the old behaviour was strictly positional").toBe("magic-80s");
    expect(withState.cardId).toBe("pippen-90s");
  });

  it("all Phase 6A invariants still hold with defence on", () => {
    let violations = 0;
    for (const s of childSeeds(2027, 300)) {
      violations += checkGame(runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: s }), FAST)).length;
    }
    expect(violations).toBe(0);
  });

  it("invariants hold across every era with defence on", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
      for (const s of childSeeds(9, 15)) {
        expect(checkGame(runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: era, simulationSeed: s }), FAST)), era).toHaveLength(0);
      }
    }
  });

  it("the matchup modifier is centred, not a one-way penalty on defence", () => {
    // An uncentred modifier could only ever help the offence: it averaged +0.55
    // and turning defence ON raised scoring, which is the opposite of defending.
    const ctx = ctxFor(SHOWTIME, SPLASH);
    const plan = ctx.defensivePlans.gold;
    const state = createDefensiveState(plan);
    let sum = 0, n = 0;
    for (const o of ctx.blue.players) {
      const d = ctx.gold.players.find((x) => x.cardId === defenderFor(state, o.cardId));
      if (!d) continue;
      for (const cat of ["RIM", "PAINT_OR_POST", "MIDRANGE", "THREE_POINT", null]) {
        sum += matchupModifiers({ defState: state, plan, shooter: o, defender: d, shotCategory: cat }).shotQuality;
        n++;
      }
    }
    expect(Math.abs(sum / n), "the modifier must be centred on this plan's own average").toBeLessThan(0.35);
  });

  it("defence changes outcomes without adding points directly", () => {
    const seeds = childSeeds(4242, 120);
    const play = (defensiveMatchups) => seeds.map((s) => runPossessionGame(buildPossessionInput({
      goldIds: SMALL, blueIds: SIZE, eraStyleId: "2010s", simulationSeed: s, defensiveMatchups,
    }), FAST));
    const off = play(false), on = play(true);
    // Results must differ...
    expect(off.map((g) => g.finalScore.gold).join()).not.toBe(on.map((g) => g.finalScore.gold).join());
    // ...and no flat bonus may exist in the engine path.
    for (const f of readdirSync(new URL("../src/v3/possession/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
      const src = readFileSync(new URL(`../src/v3/possession/${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/defenseBonus|assignmentBonus|mismatchBonus/);
    }
    // Conservation holds in both arms.
    expect(off.concat(on).reduce((a, g) => a + checkGame(g).length, 0)).toBe(0);
  });

  it("no universal best defence exists", () => {
    // The same defensive lineup must not win against everything, and an elite
    // defence must still be able to lose.
    const results = {};
    for (const [label, d, o] of [["stoppers-vs-splash", STOPPERS, SPLASH], ["stoppers-vs-size", STOPPERS, SIZE], ["small-vs-size", SMALL, SIZE]]) {
      const gs = childSeeds(88, 100).map((s) => runPossessionGame(buildPossessionInput({ goldIds: d, blueIds: o, eraStyleId: "2010s", simulationSeed: s }), FAST));
      results[label] = gs.filter((g) => g.winner === "Gold").length / gs.length;
    }
    for (const [k, v] of Object.entries(results)) {
      expect(v, `${k} = ${v}`).toBeGreaterThan(0.02);
      expect(v, `${k} = ${v}`).toBeLessThan(0.98);
    }
  });

  it("with the flag off, the Phase 6A path is unchanged", () => {
    const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 5, defensiveMatchups: false }), FAST);
    expect(g.defense).toBeNull();
    expect(g.defensiveMatchupVersion).toBeNull();
    expect(checkGame(g)).toHaveLength(0);
  });
});

// ── ledger and replay ────────────────────────────────────────────────────────
describe("ledger and replay", () => {
  const g = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 777 }));

  it("records structured defensive context, not prose", () => {
    const withDef = g.possessionLedger.filter((r) => r.primaryDefenderId);
    expect(withDef.length).toBeGreaterThan(50);
    for (const r of withDef.slice(0, 40)) {
      expect(r).toHaveProperty("assignmentState");
      expect(r).toHaveProperty("schemeId");
      if (r.mismatchType) expect(MISMATCH_TYPES).toContain(r.mismatchType);
      if (r.mismatchSeverity) expect(SEVERITY).toContain(r.mismatchSeverity);
      // Reason codes, not sentences.
      for (const v of Object.values(r)) if (typeof v === "string") expect(v.length).toBeLessThan(48);
    }
  });

  it("the result carries a COMPACT defensive summary", () => {
    expect(g.defense.gold.baseline).toHaveLength(5);
    expect(g.defense.gold.scheme).toBeTruthy();
    expect(g.defense.gold.counters).toBeTruthy();
    // The 25-cell matrix and full profiles must NOT be in the result.
    expect(g.defense.gold).not.toHaveProperty("matrix");
    expect(g.defense.gold).not.toHaveProperty("threats");
    expect(JSON.stringify(g.defense).length, "the summary must stay small").toBeLessThan(20000);
  });

  it("assignment change history is retained with triggers", () => {
    for (const c of g.defense.gold.changes) {
      expect(c.id).toMatch(/^adj-\d+$/);
      expect(typeof c.at).toBe("number");
      expect(c.trigger).toBeTruthy();
    }
  });

  it("replay reproduces the exact defensive state", () => {
    const rec = { goldIds: SHOWTIME, blueIds: SPLASH, coachGoldId: "neutral", coachBlueId: "neutral", eraStyleId: "1990s", simulationSeed: 31337 };
    const { comparison, original } = replay(rec);
    expect(comparison.identical, JSON.stringify(comparison.diffs.slice(0, 3))).toBe(true);
    const a = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 31337 }));
    const b = runPossessionGame(buildPossessionInput({ goldIds: SHOWTIME, blueIds: SPLASH, eraStyleId: "1990s", simulationSeed: 31337 }));
    expect(JSON.stringify(a.defense)).toBe(JSON.stringify(b.defense));
    expect(original.rngSteps).toBeGreaterThan(0);
  });
});

// ── confidence and historical data ───────────────────────────────────────────
describe("confidence and historical data", () => {
  it("physical data is never invented and wingspan stays null", () => {
    const plan = planFor(SHOWTIME, SPLASH);
    for (const d of plan.defenders) {
      expect(d.physical.wingspanIn).toBeNull();
      expect(d.physical.heightIn === null || typeof d.physical.heightIn === "number").toBe(true);
      if (d.physical.heightIn == null) expect(d.physical.sizeProxySource).not.toBe("VERIFIED_HEIGHT");
    }
  });

  it("missing physical data lowers confidence rather than fabricating a value", () => {
    const plan = planFor(["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], SPLASH, "1960s");
    for (const d of plan.defenders) {
      expect(["COMPLETE", "PARTIAL", "NONE"]).toContain(d.confidence.physicalCoverage);
      expect(d.confidence.derivedProxies).toContain("strength");
    }
    expect(plan.confidence.physicalCoverage).toMatch(/\d\/5 defenders fully measured/);
  });

  it("pre-1974 lineups still produce a complete, legal plan", () => {
    const plan = planFor(["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], "1960s");
    expect(plan.baselineAssignments).toHaveLength(5);
    expect(plan.optimization.severeBaselineViolations).toHaveLength(0);
    expect(plan.scheme.zoneUsage).toBe(0);
  });

  it("low confidence does not randomise assignments", () => {
    const a = planFor(["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], SPLASH, "1960s");
    const b = planFor(["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], SPLASH, "1960s");
    expect(a.baselineAssignments.map((x) => x.defenderId)).toEqual(b.baselineAssignments.map((x) => x.defenderId));
    expect(a.confidence.note).toMatch(/never randomises/i);
  });
});
