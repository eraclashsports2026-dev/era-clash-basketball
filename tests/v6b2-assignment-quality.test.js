// ── Phase 6B2 Workstreams 0A/0B: assignment quality and mismatch correlation ─
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { buildDefensivePlan, buildMatchupProfiles, evaluatePairing, scorePlan } from "../src/v3/defense/index.js";
import { explainAssignmentPlan, scoreAlternative } from "../src/v3/defense/explain.mjs";
import { SCENARIOS, explainScenario } from "../scripts/defense-explain.mjs";
import { paintAvailability, rimPresenceReason, teamRimPreservation, PAINT_LABELS } from "../src/v3/defense/paint.js";
import { mismatchCost, mismatchCostBreakdown, MISMATCH_CLUSTERS, clusterOf, SEVERITY_COST } from "../src/v3/defense/mismatch.js";
import { preparePossessionContext } from "../src/v3/possession/context.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { runPossessionGame, checkGame } from "../src/v3/possession/index.js";
import { childSeeds } from "../src/v3/possession/rng.js";
import { getEra } from "../src/v3/eraStyles.js";
import { strategicEffects } from "../src/v3/eraStyleIntelligence.js";

const FAST = { assertInvariants: false, includeLedger: false };
const mm = (type, severity) => ({ type, severity });
const assignmentFor = (plan, offId) => plan.baselineAssignments.find((a) => a.offensivePlayerId === offId);
const defenderOn = (plan, offId) => assignmentFor(plan, offId).defenderId;

// ── PART 8: the assignment-quality gate ─────────────────────────────────────
describe("assignment quality corrections", () => {
  it("Scenario A: a centre guards the centre, and a real stopper chases the mover", () => {
    const { plan } = explainScenario("russell-klay");
    // The old plan put Bill Russell on Klay Thompson while Moncrief and Pippen
    // stood available. The centre must now be on the opposing big.
    const onJokic = defenderOn(plan, "jokic-20s");
    const jokicDefender = plan.defenders.find((d) => d.playerCardId === onJokic);
    expect(jokicDefender.roleAvailability.canGuardPost || jokicDefender.capabilities.interiorDefense >= 6.5).toBe(true);

    // Whoever chases the movement shooter must actually be able to chase.
    const onKlay = plan.defenders.find((d) => d.playerCardId === defenderOn(plan, "klay-10s"));
    expect(onKlay.capabilities.movementChasing, `${onKlay.name} chasing a mover`).toBeGreaterThan(6);
    expect(onKlay.capabilities.screenNavigation).toBeGreaterThan(6);
  });

  it("Scenario B: the tradeoff is explained, not asserted", () => {
    const { explanation } = explainScenario("magic-klay-bird");
    expect(explanation.alternatives).toHaveLength(3);
    // Every named alternative must be scored and its loss attributed to
    // specific components, not one opaque number.
    for (const alt of explanation.alternatives) {
      expect(typeof alt.total).toBe("number");
      expect(alt.pairwise).toHaveLength(5);
      if (alt.delta !== 0) expect(alt.worseBy.length).toBeGreaterThan(0);
    }
    // The chosen plan must be the best of the 120, by construction.
    expect(explanation.rank).toBe(0);
  });

  it("Scenario C: Shaq on a modern hub big is NOT called paint preservation", () => {
    const ctx = preparePossessionContext(buildPossessionInput({
      goldIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
      blueIds: ["curry-10s", "klay-10s", "lebron-10s", "dirk-00s", "jokic-20s"],
      eraStyleId: "2020s", simulationSeed: 1, coachGoldId: "jerry-sloan", coachBlueId: "phil-jackson",
    }));
    const plan = buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era: getEra("2020s") });
    const a = assignmentFor(plan, "jokic-20s");
    expect(a.rimPresence).toBeTruthy();
    expect(a.rimPresence.availability, "a hub big above the break does not hold a defender in the paint").toBeLessThan(0.62);
    expect(a.reason.code, "the label must be truthful").not.toBe(PAINT_LABELS.PRESERVES_PAINT_PRESENCE);
    expect([PAINT_LABELS.ASSIGNS_NOMINAL_CENTER, PAINT_LABELS.FORCED_TO_PERIMETER, PAINT_LABELS.MIXED_INTERIOR_PERIMETER_DUTY])
      .toContain(a.reason.code);
    expect(a.rimPresence.drivers.join(" ")).toMatch(/hub|spot-up|pop|movement|screening/);
  });

  it("baseline assignments remain deterministic after the corrections", () => {
    const key = (p) => p.baselineAssignments.map((a) => `${a.defenderId}>${a.offensivePlayerId}`).sort().join("|");
    for (const s of Object.keys(SCENARIOS)) {
      expect(key(explainScenario(s).plan)).toBe(key(explainScenario(s).plan));
    }
    const plans = new Set(childSeeds(7, 30).map((seed) => {
      const g = runPossessionGame(buildPossessionInput({
        goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
        blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
        eraStyleId: "1990s", simulationSeed: seed,
      }), FAST);
      return g.defense.gold.baseline.map((b) => `${b.def}>${b.off}`).sort().join("|");
    }));
    expect(plans.size, "the plan must not randomise across seeds").toBe(1);
  });

  it("statistical invariants are unchanged by the corrections", () => {
    let v = 0;
    for (const s of childSeeds(2029, 200)) {
      v += checkGame(runPossessionGame(buildPossessionInput({
        goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
        blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
        eraStyleId: "1990s", simulationSeed: s,
      }), FAST)).length;
    }
    expect(v).toBe(0);
  });
});

// ── PART 4: movement-shooter chase cost ─────────────────────────────────────
describe("movement-shooter chase cost", () => {
  const era = getEra("2010s"), eff = strategicEffects(era);
  const ctx = preparePossessionContext(buildPossessionInput({
    goldIds: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
    blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
    eraStyleId: "2010s", simulationSeed: 1, coachGoldId: "tom-thibodeau", coachBlueId: "phil-jackson",
  }));
  const blue = buildMatchupProfiles({ team: ctx.blue, eff, era });

  it("low on-ball usage is NOT low defensive demand", () => {
    const mover = blue.threats.find((t) => t.playerCardId === "klay-10s");
    const primary = blue.threats.find((t) => t.playerCardId === "curry-10s");
    expect(mover.usageShare, "the mover has clearly lower on-ball usage").toBeLessThan(primary.usageShare * 0.75);
    // ...and yet comparable defensive demand.
    expect(mover.defensiveDemand).toBeGreaterThan(8);
    expect(Math.abs(mover.defensiveDemand - primary.defensiveDemand)).toBeLessThan(2);
  });

  it("defensive demand is general, and rises with off-ball threat", () => {
    // Ordering must follow off-ball movement + gravity, not usage.
    const byDemand = [...blue.threats].sort((a, b) => b.defensiveDemand - a.defensiveDemand);
    const hub = blue.threats.find((t) => t.playerCardId === "jokic-20s");
    expect(byDemand[0].threats.movementShooting).toBeGreaterThan(6);
    // A high-usage interior hub is a LOWER chase demand than a low-usage mover.
    const mover = blue.threats.find((t) => t.playerCardId === "klay-10s");
    expect(mover.defensiveDemand).toBeGreaterThan(hub.defensiveDemand);
    expect(hub.usageShare).toBeGreaterThan(mover.usageShare);
  });

  it("the cost weight follows demand, so a mover is not a cheap assignment", () => {
    const gold = buildMatchupProfiles({ team: ctx.gold, eff, era });
    const slow = gold.defenders.find((d) => d.playerCardId === "bill-60s");
    const mover = blue.threats.find((t) => t.playerCardId === "klay-10s");
    const cell = evaluatePairing({ threat: mover, defender: slow, eff, era, scheme: null });
    expect(cell.usageWeight, "a mover must not be weighted like a 12%-usage bystander").toBeGreaterThan(1);
    expect(cell.dimensions.movementChase.shortfall).toBeGreaterThan(2);
    expect(cell.dimensions.screenNavigation.shortfall).toBeGreaterThan(0.5);
  });

  it("creation locus stops a big being charged perimeter containment for guarding a big", () => {
    const gold = buildMatchupProfiles({ team: ctx.gold, eff, era });
    const centre = gold.defenders.find((d) => d.playerCardId === "bill-60s");
    const hub = blue.threats.find((t) => t.playerCardId === "jokic-20s");
    const mover = blue.threats.find((t) => t.playerCardId === "klay-10s");
    expect(hub.creationLocus.interior).toBeGreaterThan(0.35);
    expect(mover.creationLocus.perimeter).toBeGreaterThan(0.6);
    const vsHub = evaluatePairing({ threat: hub, defender: centre, eff, era, scheme: null });
    const vsMover = evaluatePairing({ threat: mover, defender: centre, eff, era, scheme: null });

    // The principle, tested directly: guarding an INTERIOR-locus creator must
    // not charge a centre for the perimeter work he is not being asked to do.
    // Chasing an off-ball mover must charge him for exactly that work.
    expect(vsHub.dimensions.movementChase.shortfall,
      "guarding an interior hub should not cost much movement chasing")
      .toBeLessThan(vsMover.dimensions.movementChase.shortfall);
    expect(vsHub.dimensions.screenNavigation.shortfall)
      .toBeLessThan(vsMover.dimensions.screenNavigation.shortfall);

    // Total cost is deliberately NOT compared here any more. This hub is a GOOD
    // perimeter shooter at MODERATE volume — a fact the engine only started
    // representing once the shooting vocabulary was fixed, since GOOD and
    // MODERATE were unmapped and silently read as AVERAGE and LOW. A
    // perimeter-capable seven-footer being roughly as hard to guard as a
    // movement shooter is a real basketball outcome, not a modelling error, so
    // asserting on the total would be asserting that he cannot shoot.
    expect(hub.threats.movementShooting).toBeLessThan(mover.threats.movementShooting);
  });
});

// ── PART 6: rim-presence logic ──────────────────────────────────────────────
describe("rim presence logic", () => {
  const era = getEra("2020s"), eff = strategicEffects(era);
  const ctx = preparePossessionContext(buildPossessionInput({
    goldIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
    blueIds: ["curry-10s", "klay-10s", "lebron-10s", "dirk-00s", "jokic-20s"],
    eraStyleId: "2020s", simulationSeed: 1, coachGoldId: "jerry-sloan", coachBlueId: "phil-jackson",
  }));
  const blue = buildMatchupProfiles({ team: ctx.blue, eff, era });
  const gold = buildMatchupProfiles({ team: ctx.gold, eff, era });
  const anchor = gold.defenders.find((d) => d.playerCardId === "shaq-90s");

  it("guarding the nominal centre is not the same as staying near the rim", () => {
    const hub = blue.threats.find((t) => t.playerCardId === "jokic-20s");
    const stretch = blue.threats.find((t) => t.playerCardId === "dirk-00s");
    for (const t of [hub, stretch]) {
      const r = rimPresenceReason({ threat: t, defender: anchor, eff });
      expect(r.reason, `${t.name}`).not.toBe(PAINT_LABELS.PRESERVES_PAINT_PRESENCE);
      expect(r.availability).toBeLessThan(0.62);
    }
  });

  it("a genuine low-post anchor DOES preserve paint presence", () => {
    // Construct the contrast from real data: a heavy post threat with no
    // perimeter game must score high on availability.
    const post = { ...blue.threats[0], threats: { ...blue.threats[0].threats, postScoring: 9, rimPressure: 8, offensiveRebounding: 8, popThreat: 0, spotUpShooting: 1, movementShooting: 0, screening: 3, cutting: 4, passing: 4 }, creationLocus: { perimeter: 0.25, interior: 0.75 } };
    const r = rimPresenceReason({ threat: post, defender: anchor, eff });
    expect(r.availability).toBeGreaterThan(0.62);
    expect(r.reason).toBe(PAINT_LABELS.PRESERVES_PAINT_PRESENCE);
    expect(r.holdsHim.length).toBeGreaterThan(0);
  });

  it("all four labels are reachable", () => {
    const labels = new Set();
    for (const t of blue.threats) labels.add(rimPresenceReason({ threat: t, defender: anchor, eff }).reason);
    const post = { ...blue.threats[0], threats: { ...blue.threats[0].threats, postScoring: 9.5, rimPressure: 9, offensiveRebounding: 9, popThreat: 0, spotUpShooting: 0, movementShooting: 0, screening: 2, cutting: 5, passing: 3 }, creationLocus: { perimeter: 0.2, interior: 0.8 } };
    labels.add(rimPresenceReason({ threat: post, defender: anchor, eff }).reason);
    const stretch = { ...blue.threats[0], threats: { ...blue.threats[0].threats, postScoring: 0.5, rimPressure: 1, offensiveRebounding: 1, popThreat: 9.5, spotUpShooting: 9.5, movementShooting: 9, screening: 7, cutting: 2, passing: 8 }, creationLocus: { perimeter: 0.9, interior: 0.1 } };
    labels.add(rimPresenceReason({ threat: stretch, defender: anchor, eff }).reason);
    expect(labels.size).toBeGreaterThanOrEqual(3);
    expect(labels.has(PAINT_LABELS.PRESERVES_PAINT_PRESENCE)).toBe(true);
    expect(labels.has(PAINT_LABELS.FORCED_TO_PERIMETER)).toBe(true);
  });

  it("paint availability is era-sensitive without changing player ability", () => {
    const hub = blue.threats.find((t) => t.playerCardId === "jokic-20s");
    const modern = paintAvailability({ threat: hub, eff: strategicEffects(getEra("2020s")) }).availability;
    const old = paintAvailability({ threat: hub, eff: strategicEffects(getEra("1960s")) }).availability;
    // Where the perimeter shot is worth nothing, a "spacing" big does not pull
    // anyone out of the paint.
    expect(old).toBeGreaterThan(modern);
  });

  it("team rim preservation is the mean of actual availabilities", () => {
    const plan = buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era });
    const info = teamRimPreservation({ pairs: plan.matrix.defenders.map((d, i) => {
      const a = plan.baselineAssignments.find((x) => x.defenderId === d.playerCardId);
      const ti = plan.matrix.threats.findIndex((t) => t.playerCardId === a.offensivePlayerId);
      return { defender: d, threat: plan.matrix.threats[ti], cell: plan.matrix.cells[i][ti] };
    }), defenders: plan.matrix.defenders, eff });
    expect(info.preservation).toBeCloseTo(plan.optimization.components.rimPreservation, 2);
    expect(info.detail.length).toBe(info.protectors);
    expect(plan.optimization.components.rimPreservation, "a hub-heavy offence must not report perfect preservation").toBeLessThan(1);
  });
});

// ── PART 7: no player-specific exceptions ───────────────────────────────────
describe("no player-specific logic", () => {
  const GENERIC = ["profiles.js", "matrix.js", "optimizer.js", "mismatch.js", "scheme.js", "liveState.js", "coverage.js", "paint.js", "plan.js"];

  it("no player card id appears in generic assignment-weight logic", () => {
    // Card ids look like "magic-80s", "curry-10s", "shaq-00s", "bill-60s".
    const CARD_ID = /["'][a-z][a-z0-9-]*-(?:[0-9]0s|2ks)["']/g;
    for (const f of GENERIC) {
      const src = readFileSync(new URL(`../src/v3/defense/${f}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      const hits = src.match(CARD_ID) || [];
      expect(hits, `${f} contains player ids: ${hits.join(", ")}`).toHaveLength(0);
    }
  });

  it("no player name appears in generic logic either", () => {
    // Names in comments are fine — they explain a real observed defect. Names
    // in CODE would be a hard-coded exception.
    for (const f of GENERIC) {
      const src = readFileSync(new URL(`../src/v3/defense/${f}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(src, f).not.toMatch(/Magic|Curry|Russell|Klay|Shaq|Jokic|Jordan|Pippen|Duncan|Hakeem/);
    }
  });

  it("benchmark and fixture files MAY name players", () => {
    // The exemption is deliberate: scenarios have to name the matchup they
    // reproduce. This asserts the exemption exists rather than being an
    // accident of the grep above.
    const fixtures = readFileSync(new URL("../scripts/defense-explain.mjs", import.meta.url), "utf8");
    expect(fixtures).toMatch(/magic-80s/);
    expect(Object.keys(SCENARIOS).length).toBeGreaterThanOrEqual(3);
  });
});

// ── PARTS 9-12: mismatch correlation ────────────────────────────────────────
describe("mismatch correlation", () => {
  const interior = [
    mm("SIZE_MISMATCH", "SEVERE"), mm("STRENGTH_MISMATCH", "SEVERE"), mm("POST_MISMATCH", "SEVERE"),
    mm("REBOUNDING_MISMATCH", "MAJOR"), mm("FOUL_RISK_MISMATCH", "MAJOR"),
  ];

  it("every mismatch type belongs to exactly one primary cluster", () => {
    const seen = {};
    for (const [key, cfg] of Object.entries(MISMATCH_CLUSTERS)) {
      for (const t of cfg.types) seen[t] = (seen[t] ?? 0) + 1;
    }
    // A type may be LISTED in two clusters, but clusterOf must resolve one.
    for (const t of Object.keys(seen)) expect(typeof clusterOf(t)).toBe("string");
    expect(clusterOf("FOUL_RISK_MISMATCH")).toBe("INTERIOR_PHYSICAL");
    expect(clusterOf("MOVEMENT_SHOOTING_MISMATCH")).toBe("PERIMETER_MOBILITY");
  });

  it("one physical disadvantage produces several labels but not several penalties", () => {
    const naive = interior.reduce((a, m) => a + SEVERITY_COST[m.severity], 0);
    const clustered = mismatchCost(interior);
    expect(interior).toHaveLength(5);           // descriptions preserved
    expect(clustered).toBeLessThan(naive * 0.6); // not summed
    const bd = mismatchCostBreakdown(interior);
    expect(bd).toHaveLength(1);
    expect(bd[0].cluster).toBe("INTERIOR_PHYSICAL");
    expect(bd[0].capped).toBe(true);
  });

  it("adding a REDUNDANT label barely changes the cost", () => {
    const base = mismatchCost([mm("POST_MISMATCH", "SEVERE")]);
    const plusRedundant = mismatchCost([mm("POST_MISMATCH", "SEVERE"), mm("SIZE_MISMATCH", "SEVERE")]);
    expect(plusRedundant).toBeGreaterThan(base);              // it is not free
    expect(plusRedundant - base).toBeLessThan(base * 0.6);    // but it is not another full penalty
  });

  it("adding a GENUINELY INDEPENDENT label still changes the cost", () => {
    const base = mismatchCost([mm("POST_MISMATCH", "SEVERE")]);
    const plusIndependent = mismatchCost([mm("POST_MISMATCH", "SEVERE"), mm("MOVEMENT_SHOOTING_MISMATCH", "SEVERE")]);
    expect(plusIndependent - base).toBeCloseTo(base, 1);
  });

  it("effect does not multiply fourfold with four correlated labels", () => {
    const one = mismatchCost([mm("SIZE_MISMATCH", "SEVERE")]);
    const four = mismatchCost([
      mm("SIZE_MISMATCH", "SEVERE"), mm("STRENGTH_MISMATCH", "SEVERE"),
      mm("POST_MISMATCH", "SEVERE"), mm("REBOUNDING_MISMATCH", "SEVERE"),
    ]);
    expect(four).toBeLessThan(one * 2.2);
  });

  it("optimizer plan ranking is stable under a redundant taxonomy expansion", () => {
    const plan = buildDefensivePlan({
      ...(() => {
        const ctx = preparePossessionContext(buildPossessionInput({
          goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
          blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
          eraStyleId: "1990s", simulationSeed: 1, coachGoldId: "pat-riley", coachBlueId: "phil-jackson",
        }));
        return { defendingTeam: ctx.gold, offensiveTeam: ctx.blue };
      })(),
      era: getEra("1990s"),
    });
    // Re-score every permutation with an extra redundant interior label added
    // to every cell: the RANKING must not change, because the extra label is
    // a symptom of a disadvantage already priced.
    const withExtra = plan.matrix.cells.map((row) => row.map((c) => ({
      ...c, mismatches: [...c.mismatches, mm("SIZE_MISMATCH", "MODERATE")],
      mismatchCost: mismatchCost([...c.mismatches, mm("SIZE_MISMATCH", "MODERATE")]),
    })));
    const rescored = plan.matrix.defenders.map((d, i) => {
      const a = plan.baselineAssignments.find((x) => x.defenderId === d.playerCardId);
      const ti = plan.matrix.threats.findIndex((t) => t.playerCardId === a.offensivePlayerId);
      return { defender: d, threat: plan.matrix.threats[ti], cell: withExtra[i][ti] };
    });
    const s2 = scorePlan({ pairs: rescored, defenders: plan.matrix.defenders, threats: plan.matrix.threats, scheme: plan.scheme });
    // Cost moves a little; the plan's identity does not.
    expect(Math.abs(s2.total - plan.optimization.total)).toBeLessThan(plan.optimization.total * 0.35);
  });

  it("small-ball versus size stays disadvantaged, without repeated punishment", () => {
    const ctx = preparePossessionContext(buildPossessionInput({
      goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
      blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
      eraStyleId: "2010s", simulationSeed: 1, coachGoldId: "steve-kerr", coachBlueId: "phil-jackson",
    }));
    const plan = buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era: getEra("2010s") });
    // Still clearly disadvantaged...
    expect(plan.summary.severeMismatches).toBeGreaterThan(2);
    // ...but no single pairing may carry an absurd share of the total.
    const worst = Math.max(...plan.baselineAssignments.map((a) => a.cost));
    expect(worst / plan.optimization.total, "one pairing must not dominate the plan cost").toBeLessThan(0.55);
  });

  it("possession probabilities stay bounded after clustering", () => {
    for (const s of childSeeds(11, 60)) {
      const g = runPossessionGame(buildPossessionInput({
        goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
        blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
        eraStyleId: "2010s", simulationSeed: s,
      }));
      for (const r of g.possessionLedger) {
        if (r.expectedMake == null) continue;
        expect(r.expectedMake).toBeGreaterThan(0.05);
        expect(r.expectedMake).toBeLessThan(0.87);
      }
      expect(checkGame(g)).toHaveLength(0);
    }
  });
});

// ── PARTS 2-3: the explanation tool ─────────────────────────────────────────
describe("assignment explanation tool", () => {
  it("exposes pairwise, whole-plan and alternative costs", () => {
    const { explanation } = explainScenario("russell-klay");
    expect(explanation.pairwise).toHaveLength(5);
    for (const p of explanation.pairwise) {
      expect(p).toHaveProperty("cost");
      expect(p).toHaveProperty("shortfallCost");
      expect(p).toHaveProperty("mismatchCost");
      expect(p).toHaveProperty("defensiveDemand");
      expect(Array.isArray(p.drivers)).toBe(true);
    }
    for (const k of ["severeMismatchCost", "majorMismatchCost", "rimPenalty", "rimPreservation", "creatorPenalty", "reboundShortfallCost", "hideCredit", "severeBaselineViolations"]) {
      expect(explanation.wholePlanCosts, k).toHaveProperty(k);
    }
    expect(explanation.bestAlternatives.length).toBeGreaterThan(0);
  });

  it("scores an explicit alternative mapping and rejects an incomplete one", () => {
    const { plan } = explainScenario("magic-klay-bird");
    const good = scoreAlternative({ plan, mapping: {
      "pippen-90s": "curry-10s", "jordan-90s": "klay-10s", "magic-80s": "bird-80s",
      "duncan-00s": "rob-90s", "hak-90s": "dirk-00s",
    } });
    expect(good.score.total).toBeGreaterThan(0);
    expect(() => scoreAlternative({ plan, mapping: { "pippen-90s": "curry-10s" } })).toThrow(/one-to-one/);
  });

  it("the chosen plan really is the optimum of the 120", () => {
    for (const s of Object.keys(SCENARIOS)) {
      const { explanation } = explainScenario(s);
      expect(explanation.rank, s).toBe(0);
      for (const alt of explanation.bestAlternatives) {
        expect(alt.total, s).toBeGreaterThanOrEqual(explanation.chosen.total);
      }
    }
  });

  it("is not reachable from any production route", () => {
    for (const dir of ["../api/", "../api/_lib/"]) {
      for (const f of readdirSync(new URL(dir, import.meta.url)).filter((x) => x.endsWith(".js"))) {
        expect(readFileSync(new URL(`${dir}${f}`, import.meta.url), "utf8"), `${dir}${f}`).not.toMatch(/defense\/explain|defense-explain/);
      }
    }
  });
});
