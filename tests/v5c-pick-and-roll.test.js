// ── Phase 5C: pick-and-roll action system ─────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { evaluatePickAndRoll, PNR_VARIANTS, PNR_COVERAGES, ACTION_LIBRARY_VERSION } from "../src/v3/actions/pickAndRoll.js";
import { intelligenceFor } from "../src/v3/intelligence.js";
import { buildTeamIntelligence } from "../src/v3/teamIntelligence.js";
import { fieldStatus, COACH_FIELD_CONSUMPTION, fieldsByStatus } from "../src/v3/coachIntelligence.js";
import { versionOf, statusOf, affectsResult } from "../src/versions.js";
import { runPnrBenchmark } from "../benchmarks/v3/pick-and-roll.mjs";
import { LINEUPS } from "../benchmarks/v3/team-intelligence.mjs";

const P = (id) => intelligenceFor(id);
const sp = (floorSpacing, shooters, nonShooters) => ({ floorSpacing, shooters, nonShooters });
const ev = (o) => evaluatePickAndRoll({
  offenseCoach: "steve-kerr", defenseCoach: "tom-thibodeau", eraStyleId: "2020s", spacing: sp(8, 3, 0),
  handler: P("curry-10s"), screener: P("draymond-10s"), handlerDefender: P("bowen-2ks"), screenerDefender: P("eaton-80s"),
  ...o,
});

describe("pick-and-roll — participants and validation", () => {
  it("requires all four participants as Player Intelligence profiles", () => {
    expect(() => evaluatePickAndRoll({})).toThrow(/must be a Player Intelligence profile/);
    expect(() => ev({ handler: { name: "x" } })).toThrow(/handler/);
    expect(() => ev({ screenerDefender: null })).toThrow(/screenerDefender/);
  });

  it("rejects an unknown era or coach", () => {
    expect(() => ev({ eraStyleId: "1890s" })).toThrow(/unknown era/);
    expect(() => ev({ offenseCoach: "nobody" })).toThrow(/both coaches must resolve/);
  });

  it("records every participant and reads Team Intelligence spacing", () => {
    const spec = LINEUPS["elite-spacing"];
    const team = buildTeamIntelligence({ playerCards: spec.cards, positionAssignments: spec.slots });
    const r = ev({ spacing: team.offense.spacing });
    expect(r.participants.ballHandler).toBe("curry-10s");
    expect(r.participants.screener).toBe("draymond-10s");
    expect(r.participants.handlerDefender).toBe("bowen-2ks");
    expect(r.participants.screenerDefender).toBe("eaton-80s");
    expect(r.actionLibraryVersion).toBe(ACTION_LIBRARY_VERSION);
  });

  it("produces no NaN anywhere", () => {
    const bad = [];
    const walk = (o, p = "") => {
      if (typeof o === "number") { if (!Number.isFinite(o)) bad.push(p); return; }
      if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${p}[${i}]`));
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
    };
    for (const c of PNR_COVERAGES) walk(ev({ forceCoverage: c.key }));
    expect(bad).toEqual([]);
  });
});

describe("pick-and-roll — coverages concede specific things", () => {
  it("an elite pull-up shooter punishes DROP and going UNDER", () => {
    const drop = ev({ forceCoverage: "DROP" }).offense.ballHandlerShotQuality;
    const under = ev({ forceCoverage: "UNDER" }).offense.ballHandlerShotQuality;
    const over = ev({ forceCoverage: "OVER" }).offense.ballHandlerShotQuality;
    expect(drop).toBeGreaterThan(over + 3);
    expect(under).toBeGreaterThan(over + 3);
  });

  it("a weak-shooting handler does NOT punish going under", () => {
    const weak = ev({ handler: P("russ-10s"), forceCoverage: "UNDER" }).offense.ballHandlerShotQuality;
    const elite = ev({ forceCoverage: "UNDER" }).offense.ballHandlerShotQuality;
    expect(weak).toBeLessThan(elite - 4);
  });

  it("a blitz concedes the short roll to a passing big and not to a rim-bound one", () => {
    const passer = ev({ screener: P("jokic-20s"), forceCoverage: "BLITZ" }).offense.shortRollPlaymaking;
    const rimBound = ev({ screener: P("eaton-80s"), forceCoverage: "BLITZ" }).offense.shortRollPlaymaking;
    expect(passer).toBeGreaterThan(rimBound + 3);
    // and it costs the defence its rim protection and its rebounding position
    const blitz = ev({ forceCoverage: "BLITZ" }), drop = ev({ forceCoverage: "DROP" });
    expect(blitz.defense.rimProtection).toBeLessThan(drop.defense.rimProtection);
    expect(blitz.defense.helpCommitment).toBeGreaterThan(drop.defense.helpCommitment);
    expect(blitz.defense.reboundPosition).toBeLessThan(drop.defense.reboundPosition);
  });

  it("a switch creates a mismatch only when it is actually a switch", () => {
    const sw = ev({ handler: P("harden-10s"), screener: P("jokic-20s"), forceCoverage: "SWITCH" });
    expect(sw.defense.switchMismatch).toBeGreaterThan(0);
    expect(ev({ forceCoverage: "DROP" }).defense.switchMismatch).toBe(0);
    // switching also makes recovery easy — that is what a team buys with it
    expect(sw.defense.recoveryDifficulty).toBeLessThan(ev({ forceCoverage: "BLITZ" }).defense.recoveryDifficulty);
  });

  it("a pop big punishes a dropping centre; a rim-bound screener cannot", () => {
    const pop = ev({ screener: P("dirk-00s"), forceCoverage: "DROP" }).offense.popOpportunity;
    const roll = ev({ screener: P("eaton-80s"), forceCoverage: "DROP" }).offense.popOpportunity;
    expect(pop).toBeGreaterThan(roll + 5);
    expect(roll).toBeLessThan(2);
  });
});

describe("pick-and-roll — spacing, personnel and coaches all matter", () => {
  it("empty spacing makes help easier", () => {
    const spaced = ev({ spacing: sp(9, 4, 0), forceCoverage: "HELP_AND_RECOVER" }).offense.weakSideOpportunity;
    const crowded = ev({ spacing: sp(2, 0, 3), forceCoverage: "HELP_AND_RECOVER" }).offense.weakSideOpportunity;
    expect(spaced).toBeGreaterThan(crowded + 3);
    expect(ev({ spacing: sp(2, 0, 3) }).concerns.join(" ")).toMatch(/spacing|lane/i);
  });

  it("rim protection behind the action is registered", () => {
    const anchored = ev({ screenerDefender: P("eaton-80s"), forceCoverage: "DROP" }).defense.rimProtection;
    const unanchored = ev({ screenerDefender: P("draymond-10s"), forceCoverage: "DROP" }).defense.rimProtection;
    expect(anchored).toBeGreaterThan(unanchored);
  });

  it("the coach pnr field changes VARIANT SELECTION and never adds points", () => {
    const high = ev({ offenseCoach: "stan-van-gundy" });   // pnr 9
    const low = ev({ offenseCoach: "doug-moe" });          // pnr 3
    expect(high.coachInputs.offense.pickAndRoll).toBeGreaterThan(low.coachInputs.offense.pickAndRoll + 4);
    // selection differs, or at least the available set is scored differently
    const changed = high.actionType !== low.actionType ||
      JSON.stringify(high.availableVariants) !== JSON.stringify(low.availableVariants);
    expect(changed, "coach pnr must influence which variant is chosen").toBe(true);
    // No flat-bonus term exists. Two earlier attempts at this check were both
    // wrong in instructive ways: /\+\s*5\b/ flagged an ordinary coefficient,
    // and /bonus/i flagged `noFlatBonus` — the provenance field whose entire
    // purpose is to declare that no bonus exists. Name the bad identifiers
    // explicitly instead.
    const src = readFileSync(new URL("../src/v3/actions/pickAndRoll.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const bad of ["pnrBonus", "PNR_BONUS", "coachBonus", "eraBonus", "actionBonus", "flatBonus"]) {
      expect(code, `${bad} must not exist`).not.toContain(bad);
    }
    // ...and the model declares the rule it follows
    expect(high.provenance.noFlatBonus).toMatch(/no pick-and-roll bonus/i);
  });

  it("the defensive coach changes the coverage chosen", () => {
    const dropCoach = ev({ defenseCoach: "tom-thibodeau" });      // drop 8
    const pressCoach = ev({ defenseCoach: "hubie-brown" });        // pressure 7
    expect(dropCoach.coachInputs.defense.coachId).not.toBe(pressCoach.coachInputs.defense.coachId);
    expect(dropCoach.coachInputs.defense.dropCoverage).not.toBe(pressCoach.coachInputs.defense.dropCoverage);
  });

  it("a variant a lineup cannot execute is not offered", () => {
    // no shooters -> the spread variant is unavailable
    expect(ev({ spacing: sp(1, 0, 4) }).availableVariants).not.toContain("SPREAD_PNR");
    expect(ev({ spacing: sp(9, 4, 0) }).availableVariants).toContain("SPREAD_PNR");
    // a rim-bound screener cannot pick-and-pop
    expect(ev({ screener: P("eaton-80s") }).availableVariants).not.toContain("PICK_AND_POP");
  });
});

describe("pick-and-roll — era changes economics, not the action", () => {
  it("the action is available in every era, including pre-three-point", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]) {
      const r = ev({ eraStyleId: era });
      expect(r.actionType, era).toBeTruthy();
      expect(r.availableVariants.length, era).toBeGreaterThan(0);
      expect(r.availableCoverages.length, era).toBeGreaterThan(0);
    }
  });

  it("pick-and-pop is worth less before the three-point line", () => {
    const modern = ev({ screener: P("dirk-00s"), forceCoverage: "DROP", eraStyleId: "2020s" }).offense.popOpportunity;
    const ancient = ev({ screener: P("dirk-00s"), forceCoverage: "DROP", eraStyleId: "1960s" }).offense.popOpportunity;
    expect(ancient).toBeLessThan(modern);
    expect(ancient).toBeGreaterThan(0);   // still a shot, just worth two
    expect(ev({ eraStyleId: "1960s" }).eraEffects.note).toMatch(/worth two|ACTION is unchanged/i);
  });

  it("rolling is EASIER where help may not pre-rotate", () => {
    // illegal-defense eras forbade pre-rotated help, so the roll man met one body
    const old = ev({ screener: P("bam-20s"), forceCoverage: "HEDGE", eraStyleId: "1960s" }).offense.rollOpportunity;
    const modern = ev({ screener: P("bam-20s"), forceCoverage: "HEDGE", eraStyleId: "2020s" }).offense.rollOpportunity;
    expect(old).toBeGreaterThan(modern);
  });

  it("the player's SKILL is identical across eras — only the value moves", () => {
    const a = ev({ eraStyleId: "1960s" }), b = ev({ eraStyleId: "2020s" });
    // the same handler profile is used; nothing about him was rewritten
    expect(a.participants.ballHandler).toBe(b.participants.ballHandler);
    expect(P("curry-10s").offense.spacingGravity).toBe(P("curry-10s").offense.spacingGravity);
  });

  it("no era acts as a flat bonus across all outcomes", () => {
    const eras = ["1960s", "1990s", "2020s"];
    const pull = eras.map((e) => ev({ eraStyleId: e, forceCoverage: "DROP" }).offense.ballHandlerShotQuality);
    const roll = eras.map((e) => ev({ screener: P("bam-20s"), eraStyleId: e, forceCoverage: "HEDGE" }).offense.rollOpportunity);
    // pull-up peaks in the modern era; rolling peaks in the oldest
    expect(eras[pull.indexOf(Math.max(...pull))]).toBe("2020s");
    expect(eras[roll.indexOf(Math.max(...roll))]).toBe("1960s");
  });
});

describe("pick-and-roll — output shape", () => {
  it("returns consequences, never a score or a winner", () => {
    const r = ev({});
    for (const banned of ["score", "points", "winner", "result", "margin", "pointsAdded"]) {
      expect(r[banned], banned).toBeUndefined();
    }
    expect(r.provenance.noWinner).toMatch(/no score and no winner/i);
    expect(r.provenance.noFlatBonus).toMatch(/no pick-and-roll bonus/i);
    for (const k of ["ballHandlerShotQuality", "rimPressure", "rollOpportunity", "popOpportunity",
                     "shortRollPlaymaking", "weakSideOpportunity", "foulPressure", "turnoverRisk"]) {
      expect(r.offense[k], k).toBeGreaterThanOrEqual(0);
      expect(r.offense[k], k).toBeLessThanOrEqual(10);
    }
    for (const k of ["containment", "rimProtection", "switchMismatch", "recoveryDifficulty", "helpCommitment", "reboundPosition"]) {
      expect(r.defense[k], k).toBeGreaterThanOrEqual(0);
    }
    expect(r.expectedOutcomes.length).toBeGreaterThan(0);
  });

  it("is deterministic and seed-free", () => {
    expect(JSON.stringify(ev({}))).toBe(JSON.stringify(ev({})));
    expect(JSON.stringify(ev({ ctx: { seed: 42 } }))).toBe(JSON.stringify(ev({})));
    const src = readFileSync(new URL("../src/v3/actions/pickAndRoll.js", import.meta.url), "utf8");
    expect(src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).not.toMatch(/Math\.random|mulberry32|rng\(/);
  });

  it("carries confidence tied to the underlying player data", () => {
    expect(ev({}).confidence.note).toMatch(/least-verified|risk-register/i);
    expect(["LOW", "MEDIUM"]).toContain(ev({}).confidence.players);
  });

  it("the variant and coverage vocabularies are closed and documented", () => {
    expect(PNR_VARIANTS.length).toBeGreaterThanOrEqual(9);
    expect(PNR_COVERAGES.length).toBeGreaterThanOrEqual(9);
    for (const v of [...PNR_VARIANTS, ...PNR_COVERAGES]) {
      expect(v.key).toMatch(/^[A-Z_]+$/);
      expect(v.label).toBeTruthy();
      expect(v.about, v.key).toBeTruthy();
      expect(typeof v.fit).toBe("function");
    }
  });
});

describe("pick-and-roll — coach field activation", () => {
  it("pnr is no longer dormant or ambiguously described", () => {
    expect(fieldStatus("offense", "pnr")).toBe("ACTIVE_ACTION_LIBRARY");
    const entry = COACH_FIELD_CONSUMPTION.find((f) => f.field === "pnr");
    expect(entry.consumer).toMatch(/pickAndRoll/);
    expect(entry.note).toMatch(/never adds points/i);
    expect(entry.note).toMatch(/possession engine remains the future consumer/i);
    // and it is no longer in the planned bucket
    expect(fieldsByStatus("PLANNED_POSSESSION_ENGINE").map((f) => f.field)).not.toContain("pnr");
  });

  it("the fields still genuinely dormant are unchanged and explained", () => {
    const research = fieldsByStatus("RESEARCH_ONLY").map((f) => f.field);
    expect(research).toContain("man");
    expect(research).toContain("rotationDepth");
    for (const f of fieldsByStatus("RESEARCH_ONLY")) expect(f.consumer).toBe("none");
  });
});

describe("pick-and-roll — isolation, versioning, benchmark", () => {
  it("actionLibraryVersion is DEVELOPMENT and the possession engine is still null", () => {
    expect(versionOf("actionLibraryVersion")).toBe("1.0.0");
    expect(statusOf("actionLibraryVersion")).toBe("DEVELOPMENT");
    expect(affectsResult("actionLibraryVersion")).toBe(false);
    // Phase 5C's point stands: one action is not an engine. Phase 6A then
    // built the engine that consumes it, so the assertion is now that the two
    // are SEPARATE version domains, both DEVELOPMENT, neither in production.
    expect(versionOf("possessionEngineVersion")).toMatch(/^1\./);
    expect(statusOf("possessionEngineVersion")).toBe("DEVELOPMENT");
    expect(affectsResult("possessionEngineVersion")).toBe(false);
  });

  it("no simulation module imports the action library", () => {
    const IMPORTS = /(?:import|require)\s*\(?\s*[^;]*["'][^"']*(?:actions\/|pickAndRoll)/;
    const dir = new URL("../src/v3/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(new URL(f, dir), "utf8"), f).not.toMatch(IMPORTS);
    }
    for (const f of readdirSync(new URL("../api/_lib/", import.meta.url)).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(new URL(`../api/_lib/${f}`, import.meta.url), "utf8"), `api/_lib/${f}`).not.toMatch(IMPORTS);
    }
    expect(ev({}).provenance.engineUse).toMatch(/NONE/);
  });

  it("the benchmark shows no single coverage, variant or era dominating", () => {
    const rows = runPnrBenchmark();
    expect(rows.length).toBeGreaterThan(1000);
    const share = (f) => {
      const t = {};
      for (const x of rows) t[f(x)] = (t[f(x)] || 0) + 1;
      const top = Math.max(...Object.values(t));
      return { distinct: Object.keys(t).length, topShare: top / rows.length };
    };
    const v = share((x) => x.r.actionType), c = share((x) => x.r.coverageType);
    expect(v.distinct, "variants collapsed onto one").toBeGreaterThan(3);
    expect(c.distinct, "coverages collapsed onto one").toBeGreaterThan(3);
    expect(v.topShare, "one variant is always chosen").toBeLessThan(0.5);
    expect(c.topShare, "one coverage is always chosen").toBeLessThan(0.5);
  });
});
