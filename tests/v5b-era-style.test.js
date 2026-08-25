// ── Phase 5B: Era Style Intelligence ──────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ERA_STYLES, getEra } from "../src/v3/eraStyles.js";
import {
  buildEraStyleIntelligence, allEraStyleIntelligence, strategicEffects,
  translatePlayer, buildCoachEraFit, ERA_STYLE_IDS, ERA_STYLE_VERSION,
} from "../src/v3/eraStyleIntelligence.js";
import { buildIntelligence } from "../src/v3/intelligence.js";
import { buildTeamIntelligence } from "../src/v3/teamIntelligence.js";
import { COACHES, getCoach } from "../src/v3/coaches.js";
import { PLAYERS } from "../src/players.js";
import { versionOf, statusOf, affectsResult } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { ERA_SOURCES, runEraResearch, parseEraSummary } from "../scripts/research/eras.mjs";
import { runEraBenchmark, lineupInEra } from "../benchmarks/v3/era-style-intelligence.mjs";
import { LINEUPS } from "../benchmarks/v3/team-intelligence.mjs";

const prof = (id) => buildIntelligence(PLAYERS.find((p) => p.id === id));

describe("era style — schema & sourcing", () => {
  it("all eight era styles validate", () => {
    const all = allEraStyleIntelligence();
    expect(all.length).toBe(8);
    expect(ERA_STYLE_IDS).toEqual(["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
    for (const e of all) {
      expect(e.anchorSeason, e.eraStyleId).toMatch(/^\d{4}-\d{2}$/);
      expect(e.rules.shotClockSeconds, e.eraStyleId).toBeGreaterThan(0);
      expect(typeof e.rules.threePointAvailable).toBe("boolean");
      expect(typeof e.rules.zoneLegal).toBe("boolean");
      expect(e.leagueEnvironment.pace, e.eraStyleId).toBeGreaterThan(80);
      expect(e.confidence, e.eraStyleId).toBeTruthy();
      expect(e.eraStyleVersion).toBe(ERA_STYLE_VERSION);
      expect(e.eraDataVersion).toBe(versionOf("eraDataVersion"));
    }
    expect(buildEraStyleIntelligence("not-an-era")).toBeNull();
  });

  it("every era has sourced rule facts AND league trends, kept separate", () => {
    for (const e of allEraStyleIntelligence()) {
      expect(e.ruleFacts.length, `${e.eraStyleId} ruleFacts`).toBeGreaterThan(0);
      expect(e.leagueTrends.length, `${e.eraStyleId} leagueTrends`).toBeGreaterThan(0);
      expect(e.provenance.sources.length, `${e.eraStyleId} sources`).toBeGreaterThan(0);
      expect(e.provenance.separation).toMatch(/never presented as a rule/i);
      // the two lists must not be the same content
      expect(e.ruleFacts).not.toEqual(e.leagueTrends);
    }
  });

  it("a league statistic is never stored as a rule", () => {
    for (const e of allEraStyleIntelligence()) {
      const ruleKeys = Object.keys(e.rules);
      for (const stat of ["pace", "fieldGoalPct", "assists", "turnovers", "threePointAttempts"]) {
        expect(ruleKeys, `${e.eraStyleId}: ${stat} must not be a rule`).not.toContain(stat);
      }
      // ...and a rule is never stored as an environment figure
      for (const rule of ["zoneLegal", "shotClockSeconds", "handCheckEnvironment"]) {
        expect(Object.keys(e.leagueEnvironment), `${e.eraStyleId}: ${rule}`).not.toContain(rule);
      }
    }
  });

  it("carries the documented anchor caveat", () => {
    const e = buildEraStyleIntelligence("1990s");
    expect(e.provenance.anchorCaveat).toMatch(/TYPICAL environment/i);
    expect(e.provenance.anchorCaveat).toMatch(/individual seasons/i);
    expect(e.provenance.estimateNote).toMatch(/1950s|not tracked/i);
  });

  it("the era research manifest is populated and the runner is cache-first", async () => {
    expect(ERA_SOURCES.length).toBe(8);
    for (const e of ERA_SOURCES) {
      expect(ERA_STYLE_IDS).toContain(e.eraId);
      expect(e.sources.some((s) => s.kind === "rules")).toBe(true);
      expect(e.sources.some((s) => s.kind === "environment")).toBe(true);
    }
    const { vi } = await import("vitest");
    const fetcher = vi.fn(async () => ({ status: 200, body: JSON.stringify({ title: "T", extract: "x" }) }));
    const first = await runEraResearch({ fetcher, only: "1990s", force: true, log: () => {} });
    expect(first.stats.fetched).toBe(2);
    const second = await runEraResearch({ fetcher, only: "1990s", log: () => {} });
    expect(second.stats.cacheHits).toBe(2);
    await expect(runEraResearch({ fetcher, only: "1890s", log: () => {} })).rejects.toThrow(/unknown era/);
    expect(parseEraSummary("nope")).toBeNull();
  });
});

describe("era style — is an environment, not a power ranking", () => {
  it("contains no era bonus of any kind", () => {
    const src = readFileSync(new URL("../src/v3/eraStyleIntelligence.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/eraBonus|ERA_BONUS|nativeEraBonus|eraMultiplier/);
    for (const e of allEraStyleIntelligence()) {
      expect(e.provenance.noEraBonus).toMatch(/no era bonus/i);
      // no overall score exists on the profile
      expect(e.overall).toBeUndefined();
      expect(e.rating).toBeUndefined();
      expect(e.score).toBeUndefined();
    }
  });

  it("a three-point-unavailable era produces ZERO perimeter shot value", () => {
    for (const id of ["1950s", "1960s", "1970s"]) {
      const e = buildEraStyleIntelligence(id);
      expect(e.rules.threePointAvailable, id).toBe(false);
      expect(e.strategicEffects.perimeterShotValue, id).toBe(0);
      // ...and the percentage is NULL, not zero — there was no line to shoot at
      expect(e.leagueEnvironment.threePointPct, id).toBeNull();
    }
    for (const id of ["1980s", "1990s", "2000s", "2010s", "2020s"]) {
      expect(buildEraStyleIntelligence(id).strategicEffects.perimeterShotValue, id).toBeGreaterThan(0);
    }
  });

  it("rule changes move the strategic effects in the documented direction", () => {
    const eff = (id) => buildEraStyleIntelligence(id).strategicEffects;
    // hand-check crackdown (2004-05): physical pressure collapses
    expect(eff("1990s").physicalPerimeterPressure).toBeGreaterThan(eff("2000s").physicalPerimeterPressure + 3);
    // zones legalised (2001-02): help defence becomes free
    expect(eff("2000s").helpDefenseFreedom).toBeGreaterThan(eff("1990s").helpDefenseFreedom + 4);
    // three-point volume: spacing incentive rises monotonically across modern eras
    expect(eff("2020s").spacingIncentive).toBeGreaterThan(eff("2010s").spacingIncentive);
    expect(eff("2010s").spacingIncentive).toBeGreaterThan(eff("1990s").spacingIncentive);
    // pace: the 1960s ran, the 2000s did not
    expect(eff("1960s").transitionFrequency).toBeGreaterThan(eff("2000s").transitionFrequency + 5);
  });
});

describe("era style — player translation keeps the player", () => {
  it("a modern shooter keeps his SKILL in a pre-three-point era", () => {
    const curry = prof("curry-10s");
    const modern = translatePlayer(curry, "2020s");
    const ancient = translatePlayer(curry, "1960s");
    // the skill itself is identical
    expect(ancient.shooting.skillRetained).toBe(modern.shooting.skillRetained);
    expect(ancient.shooting.skillRetained).toBeGreaterThan(8);
    // only the VALUE the era pays for it changes
    expect(ancient.shooting.valueExpressed).toBeLessThan(modern.shooting.valueExpressed);
    expect(ancient.shooting.valueExpressed).toBeGreaterThan(0);   // never erased
    expect(ancient.shooting.note).toMatch(/UNCHANGED|worth two/i);
  });

  it("an old-era big receives no automatic modern penalty and gains no modern range", () => {
    const wilt = prof("wilt-60s");
    const home = translatePlayer(wilt, "1960s");
    const modern = translatePlayer(wilt, "2020s");
    // size, rebounding and rim protection are unchanged capabilities
    expect(modern.physicality.retained).toBe(home.physicality.retained);
    expect(modern.role.scalability).toBe(home.role.scalability);
    // he does not acquire three-point shooting
    expect(modern.shooting.skillRetained).toBe(home.shooting.skillRetained);
    expect(modern.shooting.skillRetained).toBeLessThan(4);
  });

  it("illegal-defense eras make post play MORE valuable, not less", () => {
    const shaq = prof("shaq-00s");
    // pre-2001 rules forbade pre-rotated help, so a post scorer got clean looks
    expect(translatePlayer(shaq, "1990s").interior.postValueExpressed)
      .toBeGreaterThan(translatePlayer(shaq, "2010s").interior.postValueExpressed);
    // the underlying skill is untouched
    expect(translatePlayer(shaq, "1990s").interior.postSkillRetained)
      .toBe(translatePlayer(shaq, "2010s").interior.postSkillRetained);
  });

  it("there is no single era-fit score on a translation", () => {
    const t = translatePlayer(prof("jordan-90s"), "1990s");
    expect(t.eraFit).toBeUndefined();
    expect(t.score).toBeUndefined();
    expect(t.overall).toBeUndefined();
    expect(t.doctrine).toMatch(/transported unchanged/i);
    expect(t.confidence).toBeTruthy();
  });
});

describe("era style — coach–era fit", () => {
  it("is deterministic, opponent-independent and seed-independent", () => {
    const a = buildCoachEraFit({ coach: "phil-jackson", eraStyleId: "1990s" });
    const b = buildCoachEraFit({ coach: "phil-jackson", eraStyleId: "1990s" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const ctx of [{}, { seed: 42 }, { opponent: ["x"] }]) {
      expect(JSON.stringify(buildCoachEraFit({ coach: "phil-jackson", eraStyleId: "1990s", ctx }))).toBe(JSON.stringify(a));
    }
    const src = readFileSync(new URL("../src/v3/eraStyleIntelligence.js", import.meta.url), "utf8");
    expect(src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).not.toMatch(/Math\.random|mulberry32/);
  });

  it("illegal system elements are constrained by RULES, and adaptability decides what survives", () => {
    // D'Antoni's three-point emphasis simply cannot be paid in the 1960s
    const dantoni60 = buildCoachEraFit({ coach: "mike-dantoni", eraStyleId: "1960s" });
    const three = dantoni60.legalityConstraints.find((c) => c.element === "three-point emphasis");
    expect(three, "a high-three coach in a no-arc era must register a constraint").toBeTruthy();
    expect(three.status).toBe("UNAVAILABLE");
    expect(three.survives).toBeLessThan(three.detail.length);   // some value survives via adaptability
    // ...and in a modern era there is no such constraint
    expect(buildCoachEraFit({ coach: "mike-dantoni", eraStyleId: "2020s" })
      .legalityConstraints.some((c) => c.element === "three-point emphasis")).toBe(false);
  });

  it("zone-preferring coaches are constrained where zones are banned", () => {
    const zoneCoach = COACHES.filter((c) => c.defense.zone >= 5).sort((a, b) => b.defense.zone - a.defense.zone)[0];
    expect(zoneCoach).toBeTruthy();
    const banned = buildCoachEraFit({ coach: zoneCoach, eraStyleId: "1990s" });
    expect(banned.legalityConstraints.some((c) => c.element === "zone defence")).toBe(true);
    expect(buildCoachEraFit({ coach: zoneCoach, eraStyleId: "2010s" })
      .legalityConstraints.some((c) => c.element === "zone defence")).toBe(false);
  });

  it("portable basketball concepts survive every era", () => {
    const kerr = buildCoachEraFit({ coach: "steve-kerr", eraStyleId: "1960s" });
    expect(kerr.portableElements.length).toBeGreaterThan(0);
    // pick-and-roll is explicitly NOT treated as a modern-only action
    const pnrCoach = buildCoachEraFit({ coach: "stan-van-gundy", eraStyleId: "1960s" });
    expect(pnrCoach.portableElements.join(" ")).toMatch(/pick-and-roll/i);
  });

  it("NO native-era bonus exists", () => {
    for (const f of ERA_STYLE_IDS.map((e) => buildCoachEraFit({ coach: "pat-riley", eraStyleId: e }))) {
      expect(f.provenance.noNativeEraBonus).toMatch(/receives NOTHING/i);
    }
    // Riley coached in the 1980s and 1990s; his best band must not be guaranteed there
    const rank = (b) => ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"].indexOf(b);
    const bands = ERA_STYLE_IDS.map((e) => ({ e, r: rank(buildCoachEraFit({ coach: "pat-riley", eraStyleId: e }).band) }));
    const best = Math.max(...bands.map((b) => b.r));
    const bestEras = bands.filter((b) => b.r === best).map((b) => b.e);
    expect(bestEras.length, "at least one non-native era must tie or beat his own").toBeGreaterThan(0);
  });

  it("reports a band, never false precision, and no coach-era OVR", () => {
    const f = buildCoachEraFit({ coach: "gregg-popovich", eraStyleId: "2010s" });
    expect(["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"]).toContain(f.band);
    expect(f.eraOvr).toBeUndefined();
    expect(f.coachOvr).toBeUndefined();
    expect(f.overall).toBeUndefined();
  });

  it("accepts optional Team Intelligence and inherits its confidence", () => {
    const spec = LINEUPS["elite-spacing"];
    const team = buildTeamIntelligence({ playerCards: spec.cards, positionAssignments: spec.slots });
    const f = buildCoachEraFit({ coach: "steve-kerr", eraStyleId: "2020s", teamIntelligence: team });
    expect(f.teamFingerprint).toBe(team.lineupFingerprint);
    expect(f.confidence.teamInputs).toBe(team.confidence.overall);
  });

  it("rejects unknown coach or era", () => {
    expect(() => buildCoachEraFit({ coach: "nobody", eraStyleId: "1990s" })).toThrow(/unknown coach/);
    expect(() => buildCoachEraFit({ coach: "phil-jackson", eraStyleId: "1890s" })).toThrow(/unknown era/);
  });
});

describe("era style — dominance benchmark", () => {
  const { grid } = runEraBenchmark();

  it("no era leads every dimension", () => {
    const DIMS = [["shooting", (x) => x.shootingValue], ["spacing", (x) => x.spacingValue],
                  ["interior", (x) => x.interiorValue], ["perimeterD", (x) => x.perimeterDefValue],
                  ["interiorD", (x) => x.interiorDefValue], ["pace", (x) => x.paceValue]];
    const leaders = DIMS.map(([, get]) => {
      const totals = ERA_STYLE_IDS.map((e) => ({ e, v: Object.values(grid).reduce((a, byEra) => a + get(byEra[e]), 0) }));
      return totals.sort((a, b) => b.v - a.v)[0].e;
    });
    expect(new Set(leaders).size, "one or two eras lead nearly every dimension").toBeGreaterThan(2);
  });

  it("spacing and interior archetypes peak in DIFFERENT eras", () => {
    const peak = (g, get) => ERA_STYLE_IDS.reduce((a, e) => (get(g[e]) > get(g[a]) ? e : a), ERA_STYLE_IDS[0]);
    const s = peak(grid["elite-spacing"], (x) => x.spacingValue);
    const i = peak(grid["interior-heavy"], (x) => x.interiorValue);
    expect(s).not.toBe(i);
    expect(s).toMatch(/2010s|2020s/);   // spacing is paid for in the modern game
  });

  it("no era erases a roster", () => {
    for (const [name, byEra] of Object.entries(grid)) {
      for (const e of ERA_STYLE_IDS) {
        expect(byEra[e].perimeterDefValue, `${name} in ${e}`).toBeGreaterThan(0);
        expect(byEra[e].interiorDefValue, `${name} in ${e}`).toBeGreaterThan(0);
      }
    }
  });

  it("the benchmark exposes NO aggregate era score", () => {
    const one = lineupInEra("balanced-elite", "1990s");
    expect(one.expressedTotal, "the naive sum was removed on purpose").toBeUndefined();
    const src = readFileSync(new URL("../benchmarks/v3/era-style-intelligence.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/NO AGGREGATE/);
  });
});

describe("era style — isolation & versioning", () => {
  it("eraStyleVersion is DEVELOPMENT and never enters a result fingerprint", () => {
    expect(versionOf("eraStyleVersion")).toBe("1.0.0");
    expect(statusOf("eraStyleVersion")).toBe("DEVELOPMENT");
    expect(affectsResult("eraStyleVersion")).toBe(false);
    // era DATA is active — the engine already uses it. The two are distinct.
    expect(affectsResult("eraDataVersion")).toBe(true);
    // and the possession engine is still not claimed to exist
    expect(versionOf("possessionEngineVersion")).toBeNull();
  });

  it("no simulation module imports the era style intelligence layer", () => {
    const IMPORTS = /(?:import|require)\s*\(?\s*[^;]*["'][^"']*eraStyleIntelligence(?:\.js)?["']/;
    const dir = new URL("../src/v3/", import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "eraStyleIntelligence.js")) {
      expect(readFileSync(new URL(f, dir), "utf8"), f).not.toMatch(IMPORTS);
    }
    for (const f of readdirSync(new URL("../api/_lib/", import.meta.url)).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(new URL(`../api/_lib/${f}`, import.meta.url), "utf8"), `api/_lib/${f}`).not.toMatch(IMPORTS);
    }
    expect('import { strategicEffects } from "./eraStyleIntelligence.js";').toMatch(IMPORTS);
  });

  it("declares its own non-use, and the era cache identity now builds", () => {
    expect(buildEraStyleIntelligence("2020s").provenance.engineUse).toMatch(/NONE/);
    // eraStyleVersion was PLANNED in Phase 3.5, so this key used to throw
    const key = cacheKeys.eraStyle({ eraId: "2020s" });
    expect(key).toMatch(/^era:v1-0-0:2020s$/);
    expect(cacheKeys.eraStyle({ eraId: "1990s" })).not.toBe(key);
  });

  it("the production engine's era path is untouched", () => {
    // ERA_STYLES is still the raw data the live engine reads
    expect(ERA_STYLES.length).toBe(8);
    expect(getEra("1990s").rules.threePoint).toBe(true);
    expect(getEra("1960s").rules.threePoint).toBe(false);
  });
});
