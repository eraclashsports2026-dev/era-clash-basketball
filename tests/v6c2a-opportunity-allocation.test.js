import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildOpportunityProfile, normaliseTargets, createOpportunityLedger,
  saturationMultiplier, mismatchMultiplier, formMultiplier, opportunityWeight,
  selectForOpportunity, fitFor, allocationDiagnostics,
  SATURATION, MISMATCH_BIAS, FORM_BAND, OPPORTUNITY_DIMENSIONS,
} from "../src/v3/actions/opportunityAllocation.js";
import { createRng } from "../src/v3/possession/rng.js";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput, buildTeamInput } from "../src/v3/possession/testContext.js";
import { buildTeamIntelligence } from "../src/v3/teamIntelligence.js";
import { buildIntelligence } from "../src/v3/intelligence.js";
import { buildCoachIntelligence } from "../src/v3/coachIntelligence.js";
import { findCard } from "../src/players.js";
import { FIXTURES } from "../data/calibration/fixtures.mjs";
import { versionOf, statusOf, VERSION_STATUS, REGISTRY } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { ACTION_FAMILIES } from "../src/v3/actions/families.js";

const mkPlayer = (id, over = {}) => ({
  index: over.index ?? 0, cardId: id, name: id,
  usageShare: 0.2, creationTier: "SECONDARY",
  postThreat: 5, selfCreation: 5, rimThreat: 5, passing: 5,
  profile: { offense: { offBallMovement: 5 }, shooting: { perimeterSkill: "AVERAGE" }, fit: { roleScalability: 5 } },
  ...over,
});
const FIVE = ["a", "b", "c", "d", "e"].map((id, i) => mkPlayer(id, { index: i }));
const profilesOf = (players) => players.map((player) => buildOpportunityProfile({ player }));

describe("target profiles", () => {
  it("separates the offensive dimensions rather than collapsing them", () => {
    // A passing hub touches the ball more than he shoots; a movement shooter
    // shoots more than he creates. Forcing one distribution onto all of them is
    // how the best interior player came to own every shot.
    const hub = buildOpportunityProfile({ player: mkPlayer("hub", { passing: 9.5, selfCreation: 4, creationTier: "PRIMARY" }) });
    expect(hub.touchShareTarget).toBeGreaterThan(hub.shotAttemptShareTarget);
    expect(hub.passingShareTarget).toBeGreaterThan(hub.shotAttemptShareTarget);
    expect(OPPORTUNITY_DIMENSIONS.length).toBeGreaterThanOrEqual(6);
    expect(new Set([hub.touchShareTarget, hub.creationShareTarget, hub.shotAttemptShareTarget, hub.passingShareTarget]).size).toBeGreaterThan(1);
  });

  it("gives a primary creator more creation than a role player", () => {
    const primary = buildOpportunityProfile({ player: mkPlayer("p", { creationTier: "PRIMARY" }) });
    const role = buildOpportunityProfile({ player: mkPlayer("r", { creationTier: "TERTIARY" }) });
    expect(primary.creationShareTarget).toBeGreaterThan(role.creationShareTarget);
  });

  it("normalises every dimension to exactly 1", () => {
    const profs = profilesOf(FIVE);
    for (const d of ["shotAttempt", "touch", "creation", "passing", "offBall", "finishing"]) {
      const t = normaliseTargets(profs, d);
      const sum = Object.values(t).reduce((a, b) => a + b, 0);
      expect(sum, `${d} sums to ${sum}`).toBeCloseTo(1, 9);
      for (const v of Object.values(t)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("falls back to an even split rather than producing NaN when every target is zero", () => {
    const zeroed = FIVE.map((p) => ({ playerCardId: p.cardId, shotAttemptShareTarget: 0 }));
    const t = normaliseTargets(zeroed, "shotAttempt");
    expect(Object.values(t).every((v) => Number.isFinite(v))).toBe(true);
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("records the allocation version it was built under", () => {
    expect(buildOpportunityProfile({ player: FIVE[0] }).opportunityAllocationVersion).toBe(versionOf("opportunityAllocationVersion"));
  });
});

describe("soft saturation", () => {
  const at = (realized, target = 0.2) => saturationMultiplier({ realized, target, totalSoFar: 50 });

  it("declines smoothly above target and never reaches a cliff", () => {
    const xs = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.8];
    const ys = xs.map((x) => at(x));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i], `not monotone at ${xs[i]}`).toBeLessThanOrEqual(ys[i - 1]);
      // No cliff: no single step may collapse the weight.
      expect(ys[i - 1] - ys[i], `abrupt drop at ${xs[i]}`).toBeLessThan(0.45);
    }
  });

  it("never makes a player ineligible", () => {
    // A hard cap would produce a visible ceiling and kill the outlier games
    // that make a matchup interesting. A saturated player stays selectable.
    expect(at(0.95)).toBeGreaterThanOrEqual(SATURATION.floor);
    expect(at(0.95)).toBeGreaterThan(0);
    expect(at(1.0)).toBeGreaterThan(0);
  });

  it("lifts an under-target teammate, modestly", () => {
    expect(at(0.05)).toBeGreaterThan(1);
    expect(at(0.05), "an over-correction just inverts the problem").toBeLessThanOrEqual(SATURATION.underTargetCeiling);
    expect(at(0.2)).toBeCloseTo(1, 5);
  });

  it("stays inert until the sample means something", () => {
    // Three possessions into a game a "share" is noise, and reacting to it
    // would fight the plan rather than implement it.
    expect(saturationMultiplier({ realized: 1, target: 0.2, totalSoFar: 3 })).toBe(1);
    expect(saturationMultiplier({ realized: 1, target: 0.2, totalSoFar: SATURATION.warmupPossessions + 1 })).toBeLessThan(1);
  });

  it("is a multiplier, not a rule", () => {
    // There is no `if (share > X) reject` anywhere in the module.
    const src = readFileSync("src/v3/actions/opportunityAllocation.js", "utf8");
    expect(src).not.toMatch(/if\s*\([^)]*share[^)]*>\s*[\d.]+\s*\)\s*(return null|continue)/);
    expect(src).toMatch(/never.*ineligible|stays eligible/i);
  });
});

describe("mismatch bias", () => {
  const p = mkPlayer("star");

  it("biases rather than overrides", () => {
    // The whole defect: `mism ? mism.player : draw()` replaced the draw, so one
    // player took 100.0% of post-ups. A bounded multiplier cannot do that.
    const { mult } = mismatchMultiplier({ player: p, mismatch: { playerCardId: "star", type: "SIZE_MISMATCH", severity: "SEVERE" }, family: "POST_UP" });
    expect(mult).toBe(MISMATCH_BIAS.SEVERE);
    expect(mult, "an unbounded bias is an override with extra steps").toBeLessThan(4);
    expect(Math.max(...Object.values(MISMATCH_BIAS))).toBeLessThan(4);
  });

  it("grades by severity", () => {
    const m = (sev) => mismatchMultiplier({ player: p, mismatch: { playerCardId: "star", type: "SIZE_MISMATCH", severity: sev }, family: "POST_UP" }).mult;
    expect(m("SEVERE")).toBeGreaterThan(m("MAJOR"));
    expect(m("MAJOR")).toBeGreaterThan(m("MODERATE"));
    expect(m("MODERATE")).toBeGreaterThan(m("MINOR"));
    expect(m("MINOR")).toBeGreaterThan(1);
  });

  it("is action-specific", () => {
    // A post mismatch is a reason to post up, not a reason to shoot a spot-up.
    expect(mismatchMultiplier({ player: p, mismatch: { playerCardId: "star", type: "SIZE_MISMATCH", severity: "SEVERE" }, family: "OFF_BALL_SCREEN" }).mult).toBe(1);
    expect(mismatchMultiplier({ player: p, mismatch: { playerCardId: "star", type: "CHASE_MISMATCH", severity: "SEVERE" }, family: "OFF_BALL_SCREEN" }).mult).toBeGreaterThan(1);
  });

  it("only helps the player who actually has the mismatch", () => {
    expect(mismatchMultiplier({ player: mkPlayer("other"), mismatch: { playerCardId: "star", type: "SIZE_MISMATCH", severity: "SEVERE" }, family: "POST_UP" }).mult).toBe(1);
    expect(mismatchMultiplier({ player: p, mismatch: null, family: "POST_UP" }).mult).toBe(1);
  });

  it("carries a reason", () => {
    const { reason } = mismatchMultiplier({ player: p, mismatch: { playerCardId: "star", type: "SIZE_MISMATCH", severity: "MAJOR" }, family: "POST_UP" });
    expect(reason).toMatch(/MAJOR/);
    expect(reason).toMatch(/POST_UP/);
  });

  it("cannot by itself erase teammate involvement", () => {
    const targets = normaliseTargets(profilesOf(FIVE), "shotAttempt");
    const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
    const rng = createRng(4242);
    const mismatch = { playerCardId: "a", type: "SIZE_MISMATCH", severity: "SEVERE" };
    const counts = {};
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const { player } = selectForOpportunity({ players: FIVE, family: "POST_UP", targets, ledger, rng, mismatch });
      counts[player.cardId] = (counts[player.cardId] ?? 0) + 1;
    }
    // These five are deliberately identical apart from the mismatch, so this
    // isolates the bias term. Over a long single-family stream saturation pulls
    // back toward the plan — which is correct: a mismatch justifies more
    // touches, not an unbounded number of them.
    const even = 1 / FIVE.length;
    expect(counts.a / N, "the mismatch player should lead").toBeGreaterThan(even);
    for (const other of ["b", "c", "d", "e"]) {
      expect(counts.a, `should out-draw ${other}`).toBeGreaterThan(counts[other]);
    }
    expect(counts.a / N, "but not monopolise").toBeLessThan(0.75);
    expect(Object.keys(counts).length, "every teammate must still appear").toBe(5);
  });
});

describe("seeded game form", () => {
  it("is derived from the seed before any outcome", () => {
    // The runaway loop this prevents: making two shots earning more shots.
    const rng = createRng(777);
    const a = formMultiplier({ player: FIVE[0], rng });
    const b = formMultiplier({ player: FIVE[0], rng });
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(FORM_BAND.lo);
    expect(a).toBeLessThanOrEqual(FORM_BAND.hi);
  });

  it("varies by seed and by player, and is bounded", () => {
    expect(formMultiplier({ player: FIVE[0], rng: createRng(1) })).not.toBe(formMultiplier({ player: FIVE[0], rng: createRng(2) }));
    const r = createRng(9);
    expect(formMultiplier({ player: FIVE[0], rng: r })).not.toBe(formMultiplier({ player: FIVE[1], rng: r }));
    expect(FORM_BAND.hi / FORM_BAND.lo, "form must not dominate the plan").toBeLessThan(1.6);
  });

  it("does not consume the possession stream", () => {
    // If it did, adding form would shift every later possession.
    const a = createRng(555);
    const b = createRng(555);
    const first = a();
    b.formFor("anyone");
    expect(b()).toBe(first);
  });

  it("is absent, not fabricated, when the rng cannot supply it", () => {
    expect(formMultiplier({ player: FIVE[0], rng: null })).toBe(1);
  });
});

describe("selection", () => {
  const targets = normaliseTargets(profilesOf(FIVE), "shotAttempt");

  it("is deterministic for the same seed and context", () => {
    const draw = () => {
      const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
      const rng = createRng(31337);
      return Array.from({ length: 60 }, () => selectForOpportunity({ players: FIVE, family: "POST_UP", targets, ledger, rng }).player.cardId);
    };
    expect(draw()).toEqual(draw());
  });

  it("varies with a different seed", () => {
    const draw = (seed) => {
      const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
      const rng = createRng(seed);
      return Array.from({ length: 60 }, () => selectForOpportunity({ players: FIVE, family: "POST_UP", targets, ledger, rng }).player.cardId).join("");
    };
    expect(draw(1)).not.toBe(draw(2));
  });

  it("is independent of array order in the long run", () => {
    const run = (players) => {
      const ledger = createOpportunityLedger(players.map((p) => p.cardId));
      const rng = createRng(2024);
      const counts = {};
      for (let i = 0; i < 4000; i++) {
        const { player } = selectForOpportunity({ players, family: "SPOT_UP", targets, ledger, rng });
        counts[player.cardId] = (counts[player.cardId] ?? 0) + 1 / 4000;
      }
      return counts;
    };
    const fwd = run(FIVE);
    const rev = run([...FIVE].reverse());
    for (const k of Object.keys(fwd)) expect(Math.abs(fwd[k] - rev[k]), `${k} moved with array order`).toBeLessThan(0.03);
  });

  it("throws instead of silently taking the first player when every weight is invalid", () => {
    // Weights come from the TARGETS, so that is where an invalid value enters.
    const nanTargets = Object.fromEntries(FIVE.map((p) => [p.cardId, NaN]));
    expect(() => selectForOpportunity({
      players: FIVE, family: "POST_UP", targets: nanTargets,
      ledger: createOpportunityLedger(FIVE.map((p) => p.cardId)), rng: createRng(1),
    })).toThrow(/every weight invalid|refusing to fall back/);
  });

  it("keeps distinct jobs distinct via exclude", () => {
    const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
    const rng = createRng(88);
    for (let i = 0; i < 200; i++) {
      const shooter = selectForOpportunity({ players: FIVE, family: "SPOT_UP", targets, ledger, rng }).player;
      const passer = selectForOpportunity({ players: FIVE, family: "SPOT_UP", dimension: "passing", targets, ledger, rng, exclude: [shooter.index] }).player;
      expect(passer.cardId, "a player cannot pass to himself").not.toBe(shooter.cardId);
    }
  });

  it("converges toward the plan over a long run", () => {
    const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
    const rng = createRng(4);
    // Deliberately equal-fit players, so the plan is the only signal.
    for (let i = 0; i < 6000; i++) selectForOpportunity({ players: FIVE, family: "GENERIC_HALF_COURT", targets, ledger, rng });
    for (const p of FIVE) {
      expect(Math.abs(ledger.realizedShare(p.cardId, "shotAttempt") - targets[p.cardId]), `${p.cardId} drifted from plan`).toBeLessThan(0.06);
    }
  });

  it("reports the factors behind a selection", () => {
    // An allocation nobody can see inside is one that stays broken for a phase.
    const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
    const { factors } = selectForOpportunity({ players: FIVE, family: "POST_UP", targets, ledger, rng: createRng(5) });
    for (const k of ["plan", "fit", "saturation", "mismatch", "form", "tierBoost"]) expect(factors[k], k).toBeTypeOf("number");
  });

  it("produces diagnostics comparing target with realized", () => {
    const profs = profilesOf(FIVE);
    const ledger = createOpportunityLedger(FIVE.map((p) => p.cardId));
    const rng = createRng(6);
    for (let i = 0; i < 500; i++) selectForOpportunity({ players: FIVE, family: "CUT", targets, ledger, rng });
    const d = allocationDiagnostics({ profiles: profs, targets, ledger });
    expect(d.total).toBe(500);
    expect(d.players).toHaveLength(5);
    for (const row of d.players) expect(Number.isFinite(row.error)).toBe(true);
  });
});

describe("roles are respected", () => {
  const targets = (players) => normaliseTargets(profilesOf(players), "shotAttempt");
  const shareOf = (players, family, id, n = 4000, dimension = "shotAttempt") => {
    const t = normaliseTargets(profilesOf(players), dimension);
    const ledger = createOpportunityLedger(players.map((p) => p.cardId));
    const rng = createRng(1234);
    let hits = 0;
    for (let i = 0; i < n; i++) if (selectForOpportunity({ players, family, dimension, targets: t, ledger, rng }).player.cardId === id) hits++;
    return hits / n;
  };

  it("sends post-ups toward the post scorer and spot-ups toward the shooter", () => {
    const squad = [
      mkPlayer("post", { index: 0, postThreat: 9.5, profile: { offense: { offBallMovement: 3 }, shooting: { perimeterSkill: "MINIMAL" }, fit: {} } }),
      mkPlayer("shooter", { index: 1, postThreat: 2, profile: { offense: { offBallMovement: 8 }, shooting: { perimeterSkill: "ELITE" }, fit: {} } }),
      mkPlayer("c", { index: 2 }), mkPlayer("d", { index: 3 }), mkPlayer("e", { index: 4 }),
    ];
    expect(shareOf(squad, "POST_UP", "post")).toBeGreaterThan(shareOf(squad, "POST_UP", "shooter"));
    expect(shareOf(squad, "SPOT_UP", "shooter")).toBeGreaterThan(shareOf(squad, "SPOT_UP", "post"));
  });

  it("does not turn a non-shooter into a volume perimeter shooter", () => {
    const squad = [
      mkPlayer("nonshooter", { index: 0, profile: { offense: { offBallMovement: 3 }, shooting: { perimeterSkill: "MINIMAL" }, fit: {} } }),
      mkPlayer("elite", { index: 1, profile: { offense: { offBallMovement: 8 }, shooting: { perimeterSkill: "ELITE" }, fit: {} } }),
      mkPlayer("c", { index: 2 }), mkPlayer("d", { index: 3 }), mkPlayer("e", { index: 4 }),
    ];
    expect(shareOf(squad, "SPOT_UP", "nonshooter")).toBeLessThan(0.12);
  });

  it("lets a passing hub pass more than he shoots", () => {
    const squad = [
      mkPlayer("hub", { index: 0, passing: 9.8, selfCreation: 4, postThreat: 4 }),
      mkPlayer("b", { index: 1 }), mkPlayer("c", { index: 2 }), mkPlayer("d", { index: 3 }), mkPlayer("e", { index: 4 }),
    ];
    expect(shareOf(squad, "SPOT_UP", "hub", 4000, "passing")).toBeGreaterThan(shareOf(squad, "SPOT_UP", "hub", 4000, "shotAttempt"));
  });

  it("does not let a low-usage defender become the primary scorer", () => {
    const squad = [
      mkPlayer("star", { index: 0, usageShare: 0.32, creationTier: "PRIMARY", selfCreation: 9 }),
      mkPlayer("stopper", { index: 1, usageShare: 0.09, creationTier: "TERTIARY", selfCreation: 3, postThreat: 3 }),
      mkPlayer("c", { index: 2 }), mkPlayer("d", { index: 3 }), mkPlayer("e", { index: 4 }),
    ];
    expect(shareOf(squad, "GENERIC_HALF_COURT", "star")).toBeGreaterThan(shareOf(squad, "GENERIC_HALF_COURT", "stopper"));
    expect(shareOf(squad, "GENERIC_HALF_COURT", "stopper")).toBeLessThan(0.15);
  });

  it("gives every family a defined fit rather than defaulting silently", () => {
    for (const fam of ACTION_FAMILIES) expect(fitFor(fam, FIVE[0]), fam).toBeGreaterThan(0);
  });
});

describe("no action family bypasses the allocator", () => {
  it("routes every family through it in source", () => {
    // A family that selects its own shooter is a family with no saturation and
    // no plan — which is exactly how post-up reached 100%.
    const fam = readFileSync("src/v3/actions/families.js", "utf8");
    const act = readFileSync("src/v3/possession/actions.js", "utf8");
    expect(fam).toMatch(/import \{ selectForOpportunity \}/);
    expect(act).toMatch(/import \{ selectForOpportunity \}/);
    // Every registry family's prepare must accept `alloc`.
    for (const key of ["POST_UP", "ISOLATION", "SPOT_UP", "CUT", "OFF_BALL_SCREEN", "HANDOFF"]) {
      const at = fam.indexOf(`export const ${key} = {`);
      expect(at, `${key} not found`).toBeGreaterThan(-1);
      const body = fam.slice(at, at + 2200);
      expect(body, `${key}.prepare does not receive alloc`).toMatch(/prepare:\s*\(\{[^}]*alloc/);
    }
    // And the four families that live in the possession layer.
    for (const fn of ["resolveGenericHalfCourt", "resolveTransition", "resolvePickAndRoll", "resolveZoneAttack"]) {
      const at = act.indexOf(`const ${fn} = (`);
      expect(at, `${fn} not found`).toBeGreaterThan(-1);
      expect(act.slice(at, at + 400), `${fn} does not receive alloc`).toMatch(/alloc/);
    }
  });

  it("has no silent first-element fallback left in the selection path", () => {
    const rngSrc = readFileSync("src/v3/possession/rng.js", "utf8");
    expect(rngSrc).not.toMatch(/if \(total <= 0\) return items\[0\]/);
    expect(rngSrc).toMatch(/refusing to fall back/);
  });
});

describe("integration: the engine distributes plausibly", () => {
  const bucks = FIXTURES.find((f) => f.fixtureId === "1970s-bucks-balanced");
  const spurs = FIXTURES.find((f) => f.fixtureId === "1970s-spurs-pace");
  const ids = (f) => f.roster.map((r) => r.playerCardId);
  const play = (seed, on) => runPossessionGame(buildPossessionInput({
    goldIds: ids(bucks), blueIds: ids(spurs), coachGoldId: bucks.coachId, coachBlueId: spurs.coachId,
    eraStyleId: "1970s", simulationSeed: seed, opportunityAllocation: on,
  }));

  const shares = (on, n = 60) => {
    const acc = {};
    for (let s = 1; s <= n; s++) {
      const g = play(s * 104729, on);
      const t = g.gold.totals.fga;
      for (const p of g.gold.players) acc[p.cardId] = (acc[p.cardId] ?? 0) + p.fga / t / n;
    }
    return acc;
  };

  it("materially reduces the Kareem/Oscar distortion", () => {
    // Before: Kareem 57.2% of shots, Oscar 11.9%, from a mismatch override that
    // gave him 100.0% of post-ups.
    const before = shares(false);
    const after = shares(true);
    expect(before["kareem-70s"]).toBeGreaterThan(0.5);
    expect(after["kareem-70s"], "still the leading option").toBeGreaterThan(0.3);
    expect(after["kareem-70s"], "but no longer a monopoly").toBeLessThan(0.5);
    expect(after["kareem-70s"]).toBeLessThan(before["kareem-70s"] - 0.1);
    expect(after["oscar-70s"], "an all-time lead guard must get the ball").toBeGreaterThan(before["oscar-70s"]);
    for (const id of Object.keys(after)) expect(after[id], `${id} vanished`).toBeGreaterThan(0.05);
  });

  it("no longer sends a whole family to one player", () => {
    const counts = {};
    for (let s = 1; s <= 40; s++) {
      for (const r of play(s * 7919, true).possessionLedger) {
        if (r.offense !== "gold" || !r.shot) continue;
        (counts[r.action] = counts[r.action] ?? {})[r.primary] = (counts[r.action][r.primary] ?? 0) + 1;
      }
    }
    for (const [family, m] of Object.entries(counts)) {
      const total = Object.values(m).reduce((a, b) => a + b, 0);
      if (total < 100) continue;
      const top = Math.max(...Object.values(m)) / total;
      expect(top, `${family} still routes ${(top * 100).toFixed(1)}% to one player`).toBeLessThan(0.8);
    }
  });

  it("keeps an extraordinary game possible", () => {
    // A severe mismatch should still produce a huge night on SOME seeds. A hard
    // cap would have made every game look the same.
    let best = 0;
    for (let s = 1; s <= 200; s++) {
      const g = play(s * 31337, true);
      const top = Math.max(...g.gold.players.map((p) => p.fga)) / g.gold.totals.fga;
      best = Math.max(best, top);
    }
    expect(best, "no outlier games survive — that is a cap, not a bias").toBeGreaterThan(0.45);
  });

  it("preserves conservation and produces no ties", () => {
    let viol = 0;
    let ties = 0;
    for (let s = 1; s <= 120; s++) {
      const g = play(s * 31, true);
      viol += g.invariantViolations.length;
      if (g.finalScore.gold === g.finalScore.blue) ties++;
    }
    expect(viol, "allocation must not break conservation").toBe(0);
    expect(ties).toBe(0);
  });

  it("replays a game exactly on the same seed", () => {
    const a = play(20260825, true);
    const b = play(20260825, true);
    expect(JSON.stringify(a.gold.players)).toBe(JSON.stringify(b.gold.players));
    expect(a.rngSteps).toBe(b.rngSteps);
  });

  it("survives a roster reordering without moving the distribution", () => {
    // Positions travel with the players, so only the array order changes. This
    // caught a latent defect: usage shares were paired POSITIONALLY between the
    // canonical usage plan and the caller-ordered roster, which moved a
    // player's shot share by nearly ten percentage points.
    const pairs = bucks.roster.map((r) => [r.playerCardId, r.assignedPosition]);
    const teamFrom = (prs) => {
      const pc = prs.map(([id]) => findCard(id));
      const pi = pc.map((c) => buildIntelligence(c, {}));
      const pa = prs.map(([, p]) => p);
      return {
        playerCards: pc, playerIntelligence: pi,
        teamIntelligence: buildTeamIntelligence({ playerCards: pc, playerIntelligence: pi, positionAssignments: pa, ctx: {} }),
        coachId: bucks.coachId, coachIntelligence: buildCoachIntelligence(bucks.coachId), positionAssignments: pa,
      };
    };
    const blue = buildTeamInput(ids(spurs), spurs.coachId);
    const run = (prs) => {
      const acc = {};
      for (let s = 1; s <= 120; s++) {
        const g = runPossessionGame({
          simulationId: "t", simulationSeed: s * 7919, mode: "single", eraStyleId: "1970s",
          defensiveMatchups: true, zoneResolution: true, expandedActions: true,
          offensiveAdjustments: true, opportunityAllocation: true,
          gold: teamFrom(prs), blue,
        });
        const t = g.gold.totals.fga;
        for (const p of g.gold.players) acc[p.cardId] = (acc[p.cardId] ?? 0) + p.fga / t / 120;
      }
      return acc;
    };
    const fwd = run(pairs);
    const rev = run([...pairs].reverse());
    for (const k of Object.keys(fwd)) {
      expect(Math.abs(fwd[k] - rev[k]), `${k} share moved with array order`).toBeLessThan(0.035);
    }
  });
});

describe("allocation versioning", () => {
  it("is DEVELOPMENT and declares that it affects results", () => {
    expect(statusOf("opportunityAllocationVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    // It decides which player shoots, so it is result-affecting — unlike the
    // target-data versions, which describe what the engine is measured against.
    expect(REGISTRY.opportunityAllocationVersion.affectsResult).toBe(true);
    expect(REGISTRY.historicalTargetDataVersion.affectsResult).toBe(false);
  });

  it("enters the development possession cache key", () => {
    expect(cacheKeys.possessionResult({ matchupFingerprint: "abc", simulationSeed: 1 }))
      .toMatch(new RegExp(`oa${versionOf("opportunityAllocationVersion").replace(/\./g, "-")}`));
  });

  it("enters the fingerprint only when it actually shaped the result", () => {
    const g = (on) => runPossessionGame(buildPossessionInput({
      goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
      blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
      eraStyleId: "1990s", simulationSeed: 777, opportunityAllocation: on,
    }));
    expect("opportunityAllocationVersion" in g(true).fingerprint).toBe(true);
    expect("opportunityAllocationVersion" in g(false).fingerprint, "claiming it when unused is a false reproducibility claim").toBe(false);
  });

  it("is switchable so the before/after can be measured at all", () => {
    const flags = readFileSync("api/_lib/flags.js", "utf8");
    expect(flags).toMatch(/OPPORTUNITY_ALLOCATION_ENABLED", false/);
  });
});
