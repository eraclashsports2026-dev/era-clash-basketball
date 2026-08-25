// ── Coach Intelligence V3 ─────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { COACHES, getCoach, NEUTRAL_COACH } from "../src/v3/coaches.js";
import {
  buildCoachIntelligence, allCoachIntelligence, buildCoachFit, recommendCoaches,
  RECOMMENDATION_CATEGORIES, COACH_FIELD_CONSUMPTION, fieldStatus, fieldsByStatus,
  COACH_INTELLIGENCE_VERSION, FIT_BANDS, bandOf,
} from "../src/v3/coachIntelligence.js";
import { buildTeamIntelligence } from "../src/v3/teamIntelligence.js";
import { versionOf, statusOf, affectsResult } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { LINEUPS } from "../benchmarks/v3/team-intelligence.mjs";
import { runCoachBenchmark } from "../benchmarks/v3/coach-intelligence.mjs";

const team = (name) => {
  const s = LINEUPS[name];
  return buildTeamIntelligence({ playerCards: s.cards, positionAssignments: s.slots });
};
const fit = (coachId, lineup) => buildCoachFit({ coach: coachId, teamIntelligence: team(lineup) });

describe("coach intelligence — schema & provenance", () => {
  it("every coach produces a valid profile", () => {
    const all = allCoachIntelligence();
    expect(all.length).toBe(COACHES.length);
    expect(all.length).toBeGreaterThanOrEqual(28);
    expect(all.length).toBeLessThanOrEqual(32);
    for (const c of all) {
      expect(c.coachId, "coachId").toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.careerSpan).toBeTruthy();
      expect(Number.isFinite(c.record.wins)).toBe(true);
      for (const group of ["offense", "defense", "management", "rosterPreferences"]) {
        for (const [k, v] of Object.entries(c[group])) {
          expect(Number.isFinite(v), `${c.coachId}.${group}.${k}`).toBe(true);
          expect(v, `${c.coachId}.${group}.${k}`).toBeGreaterThanOrEqual(0);
          expect(v, `${c.coachId}.${group}.${k}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("every coach carries provenance, sources, and confidence", () => {
    for (const c of allCoachIntelligence()) {
      expect(c.provenance.sources.length, `${c.coachId} has no sources`).toBeGreaterThan(0);
      expect(c.provenance.documented.length, `${c.coachId} has no documented facts`).toBeGreaterThan(0);
      expect(c.confidence, c.coachId).toBeTruthy();
    }
  });

  it("documented facts and analyst inference are kept separate", () => {
    // the newly researched coaches must state plainly that their 0-10 ratings
    // are inference, not documented figures
    for (const id of ["doug-moe", "mike-fratello", "hubie-brown", "tom-thibodeau", "stan-van-gundy"]) {
      const c = buildCoachIntelligence(id);
      expect(c, id).toBeTruthy();
      expect(c.provenance.inferred.length, `${id} claims no inference`).toBeGreaterThan(0);
      expect(c.provenance.inferred.join(" ")).toMatch(/inference|inferred/i);
    }
  });

  it("carries version fields, and Coach Intelligence is NOT reported as affecting results", () => {
    const c = buildCoachIntelligence("phil-jackson");
    expect(c.dataVersion).toBe(versionOf("coachDataVersion"));
    expect(c.intelligenceVersion).toBe(COACH_INTELLIGENCE_VERSION);
    expect(statusOf("coachIntelligenceVersion")).toBe("DEVELOPMENT");
    expect(affectsResult("coachIntelligenceVersion"), "unwired layers must not enter a result fingerprint").toBe(false);
    // coach DATA is active — coaches already shape the live game plan
    expect(affectsResult("coachDataVersion")).toBe(true);
  });

  it("career phases are available where researched", () => {
    const withPhases = allCoachIntelligence().filter((c) => c.careerPhases.length > 0);
    expect(withPhases.length).toBeGreaterThan(5);
    for (const c of withPhases) for (const p of c.careerPhases) expect(p.period || p.years, c.coachId).toBeTruthy();
    // a multi-phase coach exists and carries a toolkit
    const multi = allCoachIntelligence().filter((c) => c.multiPhase);
    expect(multi.length).toBeGreaterThan(0);
  });

  it("THERE IS NO UNIVERSAL COACH OVR", () => {
    for (const c of allCoachIntelligence()) {
      for (const banned of ["ovr", "overall", "rating", "score", "grade"]) {
        expect(c[banned], `${c.coachId}.${banned} must not exist`).toBeUndefined();
      }
    }
    const f = fit("phil-jackson", "balanced-elite");
    expect(f.overall).toBeUndefined();
    expect(f.coachOvr).toBeUndefined();
    expect(f.provenance.noCoachOvr).toMatch(/Deliberately absent/);
    // fit is reported as BANDS, never false precision
    for (const b of Object.values(f.offenseFit)) expect(FIT_BANDS).toContain(b.band);
    expect(bandOf(9)).toBe("EXCELLENT");
    expect(bandOf(1)).toBe("POOR");
  });

  it("an unknown coach returns null rather than inventing one", () => {
    expect(buildCoachIntelligence("not-a-coach")).toBeNull();
    expect(() => buildCoachFit({ coach: "not-a-coach", teamIntelligence: team("balanced-elite") })).toThrow(/unknown coach/);
    expect(() => buildCoachFit({ coach: "phil-jackson" })).toThrow(/Team Intelligence/);
  });
});

describe("coach intelligence — dormant field resolution", () => {
  it("every coach attribute has an explicit consumption status", () => {
    const c = getCoach("phil-jackson");
    for (const group of ["offense", "defense", "management"]) {
      for (const field of Object.keys(c[group])) {
        expect(fieldStatus(group, field), `${group}.${field} is unclassified`).not.toBe("UNKNOWN");
      }
    }
  });

  it("the previously dormant fields are now resolved, not ambiguous", () => {
    // verified by grep against the engine, not assumed
    const resolved = {
      insideOut: "ACTIVE_COACH_INTELLIGENCE",
      starEmpowerment: "ACTIVE_COACH_INTELLIGENCE",
      tacticalAdjustment: "ACTIVE_COACH_INTELLIGENCE",
      pnr: "PLANNED_POSSESSION_ENGINE",
      man: "RESEARCH_ONLY",
      rotationDepth: "RESEARCH_ONLY",
    };
    for (const [field, status] of Object.entries(resolved)) {
      const entry = COACH_FIELD_CONSUMPTION.find((f) => f.field === field);
      expect(entry, field).toBeTruthy();
      expect(entry.status, field).toBe(status);
    }
    // anything not active must carry a note explaining WHY
    for (const f of [...fieldsByStatus("RESEARCH_ONLY"), ...fieldsByStatus("PLANNED_POSSESSION_ENGINE")]) {
      expect(f.note, `${f.field} has no explanation`).toBeTruthy();
      expect(f.note.length).toBeGreaterThan(40);
    }
  });

  it("the fields Coach Intelligence activated are genuinely consumed by it", () => {
    const src = readFileSync(new URL("../src/v3/coachIntelligence.js", import.meta.url), "utf8");
    expect(src).toMatch(/insideOut/);
    expect(src).toMatch(/starEmpowerment/);
    expect(src).toMatch(/tacticalAdjustment/);
    // and they move real fit numbers
    const t = team("interior-heavy");
    const base = buildCoachFit({ coach: getCoach("stan-van-gundy"), teamIntelligence: t });
    const noInsideOut = buildCoachFit({ coach: { ...getCoach("stan-van-gundy"), offense: { ...getCoach("stan-van-gundy").offense, insideOut: 0 } }, teamIntelligence: t });
    expect(noInsideOut.offenseFit.interiorGeometry.score).not.toBe(base.offenseFit.interiorGeometry.score);
  });

  it("research-only fields are never described as changing a game", () => {
    for (const f of fieldsByStatus("RESEARCH_ONLY")) {
      expect(f.consumer).toBe("none");
      expect(f.note).toMatch(/never|nothing to act on|redundant/i);
    }
  });
});

describe("coach fit — determinism & independence", () => {
  it("same coach + same team produces identical output", () => {
    const a = fit("phil-jackson", "balanced-elite");
    const b = fit("phil-jackson", "balanced-elite");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is era-, opponent- and seed-independent", () => {
    const t = team("balanced-elite");
    const base = JSON.stringify(buildCoachFit({ coach: "phil-jackson", teamIntelligence: t }));
    for (const ctx of [{}, { era: "1960s" }, { era: "2020s" }, { opponent: LINEUPS["defense-first"].cards }, { seed: 12345 }]) {
      expect(JSON.stringify(buildCoachFit({ coach: "phil-jackson", teamIntelligence: t, ctx })), JSON.stringify(ctx)).toBe(base);
    }
  });

  it("contains no RNG and imports no era or opponent logic", () => {
    const src = readFileSync(new URL("../src/v3/coachIntelligence.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/Math\.random|mulberry32|rng\(/);
    const imports = src.split("\n").filter((l) => /^\s*import /.test(l)).join("\n");
    for (const forbidden of ["eraStyles", "eras.js", "possession", "gameplan", "defense.js", "seed.js", "difficulty"]) {
      expect(imports, `must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("a different lineup or alignment produces a different fit", () => {
    expect(fit("phil-jackson", "balanced-elite").teamFingerprint).not.toBe(fit("phil-jackson", "elite-spacing").teamFingerprint);
    const s = LINEUPS["balanced-elite"];
    const alt = buildTeamIntelligence({ playerCards: s.cards, positionAssignments: ["PG", "SG", "PF", "PF", "C"] });
    const altFit = buildCoachFit({ coach: "phil-jackson", teamIntelligence: alt });
    expect(altFit.teamFingerprint).not.toBe(fit("phil-jackson", "balanced-elite").teamFingerprint);
  });

  it("produces no NaN anywhere", () => {
    const bad = [];
    const walk = (o, path = "") => {
      if (typeof o === "number") { if (!Number.isFinite(o)) bad.push(path); return; }
      if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
    };
    for (const name of Object.keys(LINEUPS)) for (const c of COACHES.slice(0, 8)) walk(buildCoachFit({ coach: c, teamIntelligence: team(name) }));
    expect(bad).toEqual([]);
  });

  it("the neutral staff is usable as a baseline", () => {
    const f = buildCoachFit({ coach: NEUTRAL_COACH, teamIntelligence: team("balanced-elite") });
    expect(f.coachId).toBe("neutral");
    expect(f.summary.offense.band).toBeTruthy();
  });
});

describe("coach fit — responds to roster construction", () => {
  it("a high-usage stack produces real management concerns", () => {
    const f = fit("kc-jones", "superstar-stack");
    const hierarchy = f.managementFit.usageHierarchy;
    expect(hierarchy.why).toMatch(/primary creators|hierarchy/i);
    // a star-empowering system cannot feed five primaries from one ball
    const empowering = COACHES.filter((c) => c.management.starEmpowerment >= 8);
    expect(empowering.length).toBeGreaterThan(0);
    const worst = empowering.map((c) => buildCoachFit({ coach: c, teamIntelligence: team("superstar-stack") }));
    expect(worst.some((x) => x.managementFit.usageHierarchy.band === "POOR" || x.managementFit.usageHierarchy.band === "LIMITED")).toBe(true);
  });

  it("a movement system fits a spacing roster better than an interior one", () => {
    const kerr = getCoach("steve-kerr");
    const spacing = buildCoachFit({ coach: kerr, teamIntelligence: team("elite-spacing") });
    const interior = buildCoachFit({ coach: kerr, teamIntelligence: team("interior-heavy") });
    expect(spacing.offenseFit.spacing.score).toBeGreaterThan(interior.offenseFit.spacing.score);
  });

  it("a post system fits the interior roster better than the spacing one", () => {
    const postCoach = COACHES.filter((c) => c.offense.post >= 7).sort((a, b) => b.offense.post - a.offense.post)[0];
    expect(postCoach).toBeTruthy();
    const interior = buildCoachFit({ coach: postCoach, teamIntelligence: team("interior-heavy") });
    const spacing = buildCoachFit({ coach: postCoach, teamIntelligence: team("elite-spacing") });
    expect(interior.offenseFit.postPlay.score).toBeGreaterThanOrEqual(spacing.offenseFit.postPlay.score);
  });

  it("defensive systems separate on a defense-first roster", () => {
    const t = team("defense-first");
    const scores = COACHES.map((c) => buildCoachFit({ coach: c, teamIntelligence: t }).summary.defense.score);
    expect(Math.max(...scores) - Math.min(...scores), "every coach defends this roster identically").toBeGreaterThan(1.5);
  });

  it("tempo fit responds to the roster's ability to run — in BOTH directions", () => {
    // Moe (tempo 10) and Fratello (tempo 1) bracket the axis deliberately.
    const moe = getCoach("doug-moe"), fratello = getCoach("mike-fratello");
    expect(moe.offense.tempo).toBeGreaterThan(fratello.offense.tempo + 6);

    // Pick the rosters empirically rather than by assumption. "Interior-heavy"
    // reads as slow but is Magic/Jordan/LeBron — the FASTEST lineup in the set.
    const ranked = Object.keys(LINEUPS)
      .map((n) => ({ n, t: team(n) }))
      .sort((a, b) => a.t.offense.transition - b.t.offense.transition);
    const slowest = ranked[0].t, fastest = ranked[ranked.length - 1].t;
    expect(fastest.offense.transition).toBeGreaterThan(slowest.offense.transition + 1);

    // the tempo-suppressing system suits the roster that cannot run
    expect(buildCoachFit({ coach: fratello, teamIntelligence: slowest }).offenseFit.tempo.score)
      .toBeGreaterThan(buildCoachFit({ coach: moe, teamIntelligence: slowest }).offenseFit.tempo.score);
    // and the running system suits the roster that can
    expect(buildCoachFit({ coach: moe, teamIntelligence: fastest }).offenseFit.tempo.score)
      .toBeGreaterThan(buildCoachFit({ coach: moe, teamIntelligence: slowest }).offenseFit.tempo.score);
  });

  it("confidence inherits the WEAKER of coach and team inputs", () => {
    const f = fit("phil-jackson", "complementary-roles");
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(f.confidence.overall);
    expect(f.confidence.sensitiveDimensions).toContain("spacing");
    expect(f.confidence.note).toMatch(/least-verified|risk-register/i);
  });

  it("NO coach is best for every benchmark lineup", () => {
    const winners = new Set();
    for (const name of Object.keys(LINEUPS)) {
      const t = team(name);
      const best = COACHES
        .map((c) => ({ id: c.id, s: buildCoachFit({ coach: c, teamIntelligence: t }).summary.offense.score }))
        .sort((a, b) => b.s - a.s)[0];
      winners.add(best.id);
    }
    expect(winners.size, "one coach won every lineup — the fit model is structurally biased").toBeGreaterThan(2);
  });
});

describe("coach recommendations — strategically distinct", () => {
  it("three recommendations are three different coaches and three different angles", () => {
    for (const name of Object.keys(LINEUPS)) {
      const recs = recommendCoaches(team(name));
      expect(recs.length, name).toBe(3);
      expect(new Set(recs.map((r) => r.coachId)).size, `${name} recommended the same coach twice`).toBe(3);
      expect(new Set(recs.map((r) => r.category)).size, `${name} used the same angle twice`).toBe(3);
    }
  });

  it("every recommendation names a supported category and traces its reasoning", () => {
    const keys = RECOMMENDATION_CATEGORIES.map((c) => c.key);
    for (const r of recommendCoaches(team("elite-spacing"))) {
      expect(keys).toContain(r.category);
      expect(r.categoryLabel).toBeTruthy();
      expect(FIT_BANDS).toContain(r.band);
      // the explanation must cite real numbers, not a slogan
      expect(r.why, r.category).toMatch(/\d/);
      expect(r.confidence).toBeTruthy();
    }
  });

  it("a category cannot be won by INDIFFERENCE — the coach must demand it", () => {
    // the failure this guards: the slowest-tempo coach in the pool once won
    // "best movement fit" because his system asked for nothing
    for (const name of Object.keys(LINEUPS)) {
      for (const r of recommendCoaches(team(name))) {
        const cat = RECOMMENDATION_CATEGORIES.find((c) => c.key === r.category);
        if (!cat.minDemand) continue;
        const f = buildCoachFit({ coach: r.coachId, teamIntelligence: team(name) });
        expect(cat.demands(f), `${r.coachName} won ${r.category} without demanding it`).toBeGreaterThanOrEqual(cat.minDemand);
      }
    }
  });

  it("different rosters get different coaches", () => {
    const sets = Object.keys(LINEUPS).map((n) => recommendCoaches(team(n)).map((r) => r.coachId).sort().join(","));
    expect(new Set(sets).size, "every lineup got the same recommendations").toBeGreaterThan(5);
  });

  it("recommendations are deterministic", () => {
    expect(JSON.stringify(recommendCoaches(team("small-ball")))).toBe(JSON.stringify(recommendCoaches(team("small-ball"))));
  });
});

describe("coach intelligence — isolation & caching", () => {
  it("no simulation module or API imports Coach Intelligence", () => {
    const IMPORTS_CI = /(?:import|require)\s*\(?\s*[^;]*["'][^"']*coachIntelligence(?:\.js)?["']/;
    const dir = new URL("../src/v3/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "coachIntelligence.js")) {
      expect(readFileSync(new URL(f, dir), "utf8"), `${f}`).not.toMatch(IMPORTS_CI);
    }
    for (const f of readdirSync(new URL("../api/_lib/", import.meta.url)).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(new URL(`../api/_lib/${f}`, import.meta.url), "utf8"), `api/_lib/${f}`).not.toMatch(IMPORTS_CI);
    }
    expect('import { buildCoachFit } from "./coachIntelligence.js";').toMatch(IMPORTS_CI);
  });

  it("declares its own non-use", () => {
    const f = fit("phil-jackson", "balanced-elite");
    expect(f.provenance.engineUse).toMatch(/NONE/);
    expect(f.provenance.independence).toMatch(/Era-, opponent- and seed-independent/);
  });

  it("the coach-fit cache identity binds every version that could change it", () => {
    const key = cacheKeys.coachFit({ coachId: "phil-jackson", teamFingerprint: "abc123" });
    for (const v of [versionOf("coachIntelligenceVersion"), versionOf("coachDataVersion"),
                     versionOf("teamIntelligenceVersion"), versionOf("playerIntelligenceVersion")]) {
      expect(key).toContain(String(v).replace(/\./g, "-"));
    }
    // ...and NOT seed, opponent, or era — none is an input to base fit
    expect(key).not.toMatch(/seed|opponent|era/);
    expect(cacheKeys.coachFit({ coachId: "steve-kerr", teamFingerprint: "abc123" })).not.toBe(key);
    expect(cacheKeys.coachFit({ coachId: "phil-jackson", teamFingerprint: "different" })).not.toBe(key);
  });
});

describe("coach benchmark", () => {
  const results = runCoachBenchmark();

  it("runs every canonical lineup against the full pool", () => {
    expect(Object.keys(results).length).toBe(Object.keys(LINEUPS).length);
    for (const [name, r] of Object.entries(results)) {
      expect(r.fits.length, name).toBe(COACHES.length);
      expect(r.recommendations.length, name).toBe(3);
    }
  });

  it("no coach dominates the category leaderboard", () => {
    const wins = {};
    for (const r of Object.values(results)) for (const best of Object.values(r.categoryLeaders)) wins[best.id] = (wins[best.id] || 0) + 1;
    const total = Object.values(wins).reduce((a, b) => a + b, 0);
    const top = Math.max(...Object.values(wins));
    expect(Object.keys(wins).length, "too few distinct category leaders").toBeGreaterThan(8);
    expect(top / total, "one coach leads most categories — investigate structural bias").toBeLessThan(0.4);
  });
});
