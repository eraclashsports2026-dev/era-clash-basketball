// ── Team Intelligence V3 ──────────────────────────────────────────────────────
// Guards the promises: five players in, construction analysis out, with no
// coach, no era, no opponent, no RNG, and no effect on production.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PLAYERS } from "../src/players.js";
import { buildTeamIntelligence, teamIntelligenceFor, allocateTeamUsage, TEAM_INTELLIGENCE_VERSION, SLOTS } from "../src/v3/teamIntelligence.js";
import { buildIntelligence } from "../src/v3/intelligence.js";
import { LINEUPS, runBenchmark } from "../benchmarks/v3/team-intelligence.mjs";

const L = {
  balanced: ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"],
  stack: ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"],
  spacing: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
  interior: ["magic-80s", "jordan-90s", "lebron-10s", "duncan-00s", "shaq-00s"],
  defense: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
  roles: ["mookie-90s", "finley-00s", "prince-00s", "joshsmith-00s", "eaton-80s"],
};
const build = (ids, slots = null) => teamIntelligenceFor(ids, slots);

// walk every number in the output looking for NaN/Infinity
const badNumbers = (obj, path = "", out = []) => {
  if (typeof obj === "number") { if (!Number.isFinite(obj)) out.push(path); return out; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => badNumbers(v, `${path}[${i}]`, out)); return out; }
  if (obj && typeof obj === "object") { for (const [k, v] of Object.entries(obj)) badNumbers(v, path ? `${path}.${k}` : k, out); }
  return out;
};

describe("team intelligence — input validation", () => {
  it("requires exactly five players", () => {
    expect(() => build(L.balanced.slice(0, 4))).toThrow(/exactly 5|received 4/);
    expect(() => build([...L.balanced, "bowen-2ks"])).toThrow(/exactly 5|received 6/);
    expect(() => buildTeamIntelligence({ playerCards: [] })).toThrow();
    expect(() => buildTeamIntelligence({})).toThrow(/must be an array/);
  });

  it("rejects unknown card ids rather than inventing a player", () => {
    expect(() => build(["not-a-player", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"])).toThrow(/unknown player/);
  });

  it("refuses two versions of the same person on one team", () => {
    // both Nance cards are one human
    expect(() => build(["magic-80s", "klay-10s", "pippen-90s", "nance-80s", "nance-90s"])).toThrow(/appears twice/);
    // and the split-identity case Phase 2B repaired
    expect(() => build(["magic-80s", "klay-10s", "pippen-90s", "russell-50s", "bill-60s"])).toThrow(/appears twice/);
  });

  it("validates position assignments against each player's eligibility", () => {
    expect(() => build(L.balanced, ["PG", "SG", "SF", "PF", "PG"])).toThrow(/cannot play/);
    expect(() => build(L.balanced, ["PG", "SG", "SF", "PF"])).toThrow(/5 entries/);
    expect(() => build(L.balanced, ["PG", "SG", "SF", "PF", "XX"])).toThrow(/not a position/);
    // a legal alternate alignment is accepted
    expect(() => build(["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"], ["PG", "SG", "PF", "PF", "C"])).not.toThrow();
  });

  it("accepts pre-built intelligence and agrees with building it itself", () => {
    const cards = L.balanced.map((id) => PLAYERS.find((p) => p.id === id));
    const pre = cards.map((c) => buildIntelligence(c));
    const a = buildTeamIntelligence({ playerCards: cards, playerIntelligence: pre });
    const b = buildTeamIntelligence({ playerCards: cards });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces no NaN or Infinity anywhere in the output", () => {
    for (const ids of Object.values(L)) {
      expect(badNumbers(build(ids)), ids.join(",")).toEqual([]);
    }
  });
});

describe("team intelligence — finite usage", () => {
  it("allocated usage sums to exactly 1 for every lineup", () => {
    for (const [name, ids] of Object.entries(L)) {
      const t = build(ids);
      const sum = t.usagePlan.reduce((a, u) => a + u.share, 0);
      expect(Math.abs(sum - 1), `${name} allocates ${sum}`).toBeLessThan(1e-9);
    }
  });

  it("no share is negative, and all sit inside the hard basketball bounds", () => {
    for (const ids of Object.values(L)) {
      for (const u of build(ids).usagePlan) {
        expect(u.share).toBeGreaterThanOrEqual(0.08 - 1e-9);
        expect(u.share).toBeLessThanOrEqual(0.34 + 1e-9);
        expect(u.compression).toBeGreaterThanOrEqual(0);
        expect(u.valueRetained).toBeGreaterThan(0);
      }
    }
  });

  it("high-usage players compress one another — and it is not a penalty constant", () => {
    const stack = build(L.stack);
    const balanced = build(L.balanced);
    // every star in the stack is squeezed below his natural diet
    expect(stack.usagePlan.every((u) => u.compression > 0)).toBe(true);
    expect(stack.construction.usageCompression.compressedPlayers.length).toBe(5);
    // and the lineup as a whole retains less of its talent than a balanced one
    expect(stack.construction.usageCompression.totalValueRetained)
      .toBeLessThan(balanced.construction.usageCompression.totalValueRetained);
    // the effect emerges from the budget, not from a named penalty
    const src = readFileSync(new URL("../src/v3/teamIntelligence.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/SUPERSTAR_STACK_PENALTY|STACK_PENALTY|STAR_PENALTY/);
  });

  it("compression does not un-make a creator", () => {
    // the bug this test exists for: requiring a usage share to qualify as a
    // primary creator made a five-star lineup report ZERO primary creators
    const stack = build(L.stack);
    expect(stack.creationHierarchy.primaryCount).toBeGreaterThanOrEqual(4);
    expect(stack.creationHierarchy.tooManyPrimaries).toBe(true);
    expect(stack.identity).toContain("CREATOR_HEAVY");
  });

  it("off-ball specialists keep their value when squeezed; on-ball creators do not", () => {
    const t = build(L.balanced);
    const byId = Object.fromEntries(t.usagePlan.map((u) => [u.cardId, u]));
    const klay = byId["klay-10s"];   // roleScalability ~8.4
    const magic = byId["magic-80s"]; // roleScalability ~3.3
    expect(klay.roleScalability).toBeGreaterThan(magic.roleScalability);
    // compressed by a similar amount, the scalable player retains more
    expect(klay.valueRetained).toBeGreaterThan(magic.valueRetained);
  });

  it("a one-creator lineup has a coherent hierarchy", () => {
    const t = build(L.roles);
    expect(t.creationHierarchy.order.length).toBe(5);
    // hierarchy is ordered by tier
    const tiers = t.creationHierarchy.order.map((o) => o.tier);
    const rank = { PRIMARY: 0, SECONDARY: 1, TERTIARY: 2, NON_CREATOR: 3 };
    for (let i = 1; i < tiers.length; i++) expect(rank[tiers[i]]).toBeGreaterThanOrEqual(rank[tiers[i - 1]]);
    expect(t.creationHierarchy.tooManyPrimaries).toBe(false);
  });

  it("allocateTeamUsage is exported and reconciles standalone", () => {
    const profiles = L.spacing.map((id) => buildIntelligence(PLAYERS.find((p) => p.id === id)));
    const plan = allocateTeamUsage(profiles);
    expect(plan.length).toBe(5);
    expect(Math.abs(plan.reduce((a, u) => a + u.share, 0) - 1)).toBeLessThan(1e-9);
  });
});

describe("team intelligence — spacing is a property of the floor", () => {
  it("movement shooting outranks low-volume spot-up shooting", () => {
    const spaced = build(L.spacing);
    const interior = build(L.interior);
    expect(spaced.offense.spacing.floorSpacing).toBeGreaterThan(interior.offense.spacing.floorSpacing + 4);
    expect(spaced.offense.spacing.movementShooters).toBeGreaterThan(0);
  });

  it("it is NOT the average three-point rating", () => {
    const t = build(L.spacing);
    // weighted gravity accounts for off-ball movement, so it diverges from the mean
    expect(t.offense.spacing.weightedGravity).not.toBe(t.offense.spacing.gravityMean);
  });

  it("multiple non-shooters raise a concern, and the damage is superlinear", () => {
    const interior = build(L.interior);
    expect(interior.offense.spacing.nonShooters).toBeGreaterThanOrEqual(2);
    expect(interior.construction.spacingConflicts.length).toBeGreaterThan(0);
    expect(interior.construction.lineupConcerns.join(" ")).toMatch(/paint|stretch|non-shooter/i);
  });

  it("interior value is not treated as inherently bad", () => {
    const interior = build(L.interior);
    // poor spacing, but genuinely strong interior and defensive output
    expect(interior.offense.spacing.floorSpacing).toBeLessThan(4);
    expect(interior.defense.rimProtection).toBeGreaterThan(7);
    expect(interior.construction.lineupStrengths.length).toBeGreaterThan(0);
    expect(interior.offense.interior.postPlay).toBeGreaterThan(7);
  });

  it("a passing big and a stretch big relieve congestion differently", () => {
    // Jokic (passing) vs Dirk (stretch) — the interior shape distinguishes them
    const withJokic = build(["curry-10s", "klay-10s", "bird-80s", "duncan-00s", "jokic-20s"]);
    const withDirk = build(["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "hak-90s"]);
    expect(withJokic.offense.interior.interiorPassing).not.toBe(withDirk.offense.interior.interiorPassing);
    expect(withJokic.offense.spacing.passingBigRelief).toBeGreaterThan(0);
  });
});

describe("team intelligence — defensive tools and gaps", () => {
  it("detects rim protection and its absence", () => {
    expect(build(L.defense).defense.rimProtection).toBeGreaterThan(8);
    expect(build(L.spacing).defense.rimProtection).toBeLessThan(6);
    expect(build(L.spacing).construction.defensiveGaps.join(" ")).toMatch(/rim/i);
  });

  it("detects a point-of-attack gap", () => {
    const strong = build(L.defense);
    const weak = build(L.spacing);
    expect(strong.defense.pointOfAttack).toBeGreaterThan(weak.defense.pointOfAttack + 3);
  });

  it("evaluates wing containment and switchability separately", () => {
    const t = build(L.defense);
    expect(t.defense.wingContainment).toBeGreaterThan(7);
    expect(t.defense.switchability).toBeGreaterThan(6);
    // they are distinct measurements, not the same number twice
    expect(t.defense.wingContainment).not.toBe(t.defense.switchability);
  });

  it("reports the weakest link separately from the best defenders", () => {
    for (const ids of Object.values(L)) {
      const t = build(ids);
      expect(t.defense.weakestPerimeter).toBeLessThanOrEqual(t.defense.pointOfAttack);
    }
  });

  it("rebounding is assessed separately from defence, and not by summing", () => {
    const t = build(L.defense);
    expect(t.rebounding).toBeTruthy();
    expect(t.rebounding.strongRebounders).toBeGreaterThanOrEqual(0);
    // offensive and defensive glass are computed differently. They may coincide
    // on any one lineup, so the invariant is checked across the whole set.
    const diverges = Object.values(L).some((ids) => {
      const x = build(ids);
      return x.rebounding.defensiveGlass !== x.rebounding.offensiveGlass;
    });
    expect(diverges, "offensive and defensive glass are the same formula").toBe(true);
    // one elite rebounder among four non-contributors is flagged, not celebrated
    const lone = build(["curry-10s", "klay-10s", "bowen-2ks", "prince-00s", "rodman-90s"]);
    expect(lone.rebounding.bestRebounder).toBeGreaterThan(lone.rebounding.supportingCast);
  });

  it("defensive playmaking is part of defence, never the whole of it", () => {
    const t = build(L.defense);
    expect(t.defense.defensivePlaymaking).toBeGreaterThanOrEqual(0);
    // a lineup can have low event creation and still defend well
    expect(t.defense.rimProtection).toBeGreaterThan(t.defense.defensivePlaymaking);
  });
});

describe("team intelligence — role coverage and redundancy", () => {
  it("identifies covered, missing, and redundant roles", () => {
    const t = build(L.roles);
    const c = t.construction.roleCoverage;
    expect(c.covered.length).toBeGreaterThan(0);
    expect(Array.isArray(c.missing)).toBe(true);
    expect(Array.isArray(c.redundant)).toBe(true);
    expect(c.covered.length + c.missing.length).toBeGreaterThan(10);
    // covered and missing never overlap
    expect(c.covered.filter((r) => c.missing.includes(r))).toEqual([]);
  });

  it("flags redundancy in a lineup that duplicates a scarce role", () => {
    const stack = build(L.stack);
    const dup = stack.construction.roleRedundancy.map((r) => r.role);
    expect(dup).toContain("Primary Creator");
  });

  it("different valid team identities are all allowed", () => {
    const identities = Object.values(L).map((ids) => build(ids).identity);
    // no two canonical lineups collapse onto the same identity
    const joined = identities.map((i) => i.sort().join("+"));
    expect(new Set(joined).size).toBeGreaterThan(3);
    // and every lineup gets at least one descriptor
    for (const i of identities) expect(i.length).toBeGreaterThan(0);
  });

  it("identity is descriptive, never a power rating", () => {
    const t = build(L.roles);
    // no overall score exists anywhere in the output
    expect(t.teamScore).toBeUndefined();
    expect(t.teamIntelligenceScore).toBeUndefined();
    expect(t.overall).toBeUndefined();
    expect(t.rating).toBeUndefined();
    expect(t.provenance.noOverallScore).toMatch(/Deliberately absent/);
  });
});

describe("team intelligence — physical balance", () => {
  it("verified size affects the analysis", () => {
    const big = build(["magic-80s", "jordan-90s", "durant-10s", "duncan-00s", "shaq-00s"]);
    const small = build(["ai-00s", "curry-10s", "bowen-2ks", "draymond-10s", "rodman-90s"]);
    expect(big.physical.averageHeightIn).toBeGreaterThan(small.physical.averageHeightIn);
    expect(small.identity).toContain("SMALL_BALL");
    expect(big.identity).toContain("OVERSIZED");
  });

  it("missing size reduces confidence and never fabricates a value", () => {
    const t = build(L.roles); // mostly unmeasured players
    expect(t.physical.measuredPlayers).toBeLessThan(5);
    expect(t.confidence.physical).toMatch(/LOW|MEDIUM/);
    expect(t.physical.note).toMatch(/verified measurements/);
    // and a size identity is NOT claimed from a partial sample
    expect(t.identity).not.toContain("OVERSIZED");
    expect(t.identity).not.toContain("SMALL_BALL");
  });

  it("speed is never inferred, and strength is labelled a proxy", () => {
    const t = build(L.balanced);
    expect(t.physical.speed).toBeNull();
    expect("strengthProxy" in t.physical).toBe(true);
  });

  it("an entirely unmeasured lineup reports null height rather than zero", () => {
    const src = readFileSync(new URL("../src/v3/teamIntelligence.js", import.meta.url), "utf8");
    expect(src).toMatch(/averageHeightIn: known \?/);
    const t = build(L.roles);
    if (t.physical.measuredPlayers === 0) expect(t.physical.averageHeightIn).toBeNull();
  });
});

describe("team intelligence — isolation from production", () => {
  it("imports no coach, era, opponent, or simulation logic", () => {
    const src = readFileSync(new URL("../src/v3/teamIntelligence.js", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import /.test(l)).join("\n");
    for (const forbidden of ["coaches", "eraStyles", "gameplan", "possession", "engine.js", "defense.js", "seed.js", "difficulty"]) {
      expect(imports, `must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("contains no RNG at all", () => {
    const src = readFileSync(new URL("../src/v3/teamIntelligence.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/Math\.random|mulberry32|nightlyForm|rng\(/);
    expect(code).not.toMatch(/\bseed\b\s*[:=]/);
  });

  it("no simulation module imports the team intelligence layer", () => {
    const dir = new URL("../src/v3/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "teamIntelligence.js")) {
      const src = readFileSync(new URL(f, dir), "utf8");
      expect(src, `${f} must not import teamIntelligence`).not.toMatch(/teamIntelligence/);
    }
    for (const f of readdirSync(new URL("../api/_lib/", import.meta.url))) {
      if (!f.endsWith(".js")) continue;
      const src = readFileSync(new URL(`../api/_lib/${f}`, import.meta.url), "utf8");
      expect(src, `api/_lib/${f} must not import teamIntelligence`).not.toMatch(/teamIntelligence/);
    }
  });

  it("declares its own non-use", () => {
    const t = build(L.balanced);
    expect(t.provenance.engineUse).toMatch(/NONE/);
    expect(t.provenance.hidden).toMatch(/Internal only/);
    expect(t.provenance.independence).toMatch(/Coach-, era-, opponent- and seed-independent/);
  });
});

describe("team intelligence — determinism", () => {
  it("identical inputs produce byte-identical output", () => {
    for (const ids of Object.values(L)) {
      expect(JSON.stringify(build(ids))).toBe(JSON.stringify(build(ids)));
    }
  });

  it("reordering the input array does not change the result when positions are explicit", () => {
    const ids = L.balanced;
    const slots = ["PG", "SG", "SF", "PF", "C"];
    const pairs = ids.map((id, i) => [id, slots[i]]);
    const a = buildTeamIntelligence({ playerCards: pairs.map((p) => p[0]), positionAssignments: pairs.map((p) => p[1]) });
    const shuffled = [...pairs].reverse();
    const b = buildTeamIntelligence({ playerCards: shuffled.map((p) => p[0]), positionAssignments: shuffled.map((p) => p[1]) });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b.lineupFingerprint).toBe(a.lineupFingerprint);
  });

  it("changing position assignments MAY change the result", () => {
    const a = build(["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"], ["PG", "SG", "SF", "PF", "C"]);
    const b = build(["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"], ["PG", "SG", "PF", "PF", "C"]);
    expect(b.lineupFingerprint).not.toBe(a.lineupFingerprint);
  });

  it("is coach- and era-independent under conflicting contexts", () => {
    const cards = L.balanced.map((id) => PLAYERS.find((p) => p.id === id));
    const base = JSON.stringify(buildTeamIntelligence({ playerCards: cards }));
    for (const ctx of [{}, { era: "1960s" }, { era: "2020s" }, { coach: { starEmpowerment: 10 } },
                       { era: "1950s", coach: { name: "x" }, opponent: L.stack }]) {
      expect(JSON.stringify(buildTeamIntelligence({ playerCards: cards, ctx })), JSON.stringify(ctx)).toBe(base);
    }
  });

  it("the fingerprint is stable and version-bound", () => {
    expect(TEAM_INTELLIGENCE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(build(L.balanced).lineupFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(build(L.balanced).lineupFingerprint).not.toBe(build(L.stack).lineupFingerprint);
    expect(SLOTS).toEqual(["PG", "SG", "SF", "PF", "C"]);
  });
});

describe("team intelligence — benchmark exposes tradeoffs rather than a winner", () => {
  const results = runBenchmark();

  it("every canonical lineup builds", () => {
    expect(Object.keys(results).length).toBe(Object.keys(LINEUPS).length);
    for (const [name, t] of Object.entries(results)) {
      expect(badNumbers(t), name).toEqual([]);
      expect(Math.abs(t.usagePlan.reduce((a, u) => a + u.share, 0) - 1)).toBeLessThan(1e-9);
    }
  });

  it("the spacing team spaces best and protects the rim worst", () => {
    const spacing = results["elite-spacing"], interiorH = results["interior-heavy"];
    const all = Object.values(results).map((t) => t.offense.spacing.floorSpacing);
    expect(spacing.offense.spacing.floorSpacing).toBe(Math.max(...all));
    expect(spacing.defense.rimProtection).toBeLessThan(interiorH.defense.rimProtection);
  });

  it("the interior team is poorly spaced but is NOT called bad", () => {
    const t = results["interior-heavy"];
    const all = Object.values(results).map((x) => x.offense.spacing.floorSpacing);
    expect(t.offense.spacing.floorSpacing).toBe(Math.min(...all));
    expect(t.construction.lineupStrengths.length).toBeGreaterThan(1);
  });

  it("the superstar stack retains the least of its talent", () => {
    const all = Object.entries(results).map(([n, t]) => [n, t.construction.usageCompression.totalValueRetained]);
    const worst = all.sort((a, b) => a[1] - b[1])[0][0];
    expect(worst).toBe("superstar-stack");
    // but it is still recognised as enormous talent, not written off
    expect(results["superstar-stack"].creationHierarchy.primaryCount).toBeGreaterThanOrEqual(4);
    expect(results["superstar-stack"].construction.lineupStrengths.length).toBeGreaterThan(0);
  });

  it("the defence team defends best and shows honest offensive limits", () => {
    const t = results["defense-first"];
    const all = Object.values(results).map((x) => x.defense.pointOfAttack);
    expect(t.defense.pointOfAttack).toBe(Math.max(...all));
    expect(t.construction.lineupConcerns.join(" ")).toMatch(/stretch|creation|without the ball/i);
  });

  it("the complementary role-player team wins on construction, not star power", () => {
    const t = results["complementary-roles"];
    const all = Object.values(results).map((x) => x.offense.offBallValue);
    expect(t.offense.offBallValue).toBe(Math.max(...all));
    const retained = Object.values(results).map((x) => x.construction.usageCompression.totalValueRetained);
    expect(t.construction.usageCompression.totalValueRetained).toBe(Math.max(...retained));
  });

  it("no single lineup wins every dimension — the point of the benchmark", () => {
    const dims = {
      spacing: (t) => t.offense.spacing.floorSpacing,
      rim: (t) => t.defense.rimProtection,
      poa: (t) => t.defense.pointOfAttack,
      offBall: (t) => t.offense.offBallValue,
      retained: (t) => t.construction.usageCompression.totalValueRetained,
    };
    const winners = new Set(
      Object.values(dims).map((f) => {
        const ranked = Object.entries(results).sort((a, b) => f(b[1]) - f(a[1]));
        return ranked[0][0];
      })
    );
    expect(winners.size, "one lineup swept every dimension — the model has a preference, not a measurement").toBeGreaterThan(2);
  });
});
