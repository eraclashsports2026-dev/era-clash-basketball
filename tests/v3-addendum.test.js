// ── V3 Addendum battery: translation, roles, game state/OT, adjustments, ──────
// duplicate persons, uncertainty vs variance, fingerprints, era normalization,
// and meta-resistance spot checks (full sweeps live in benchmarks/v3/).
import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { simulateGameV3, resolveCoach, resolveEra } from "../src/v3/engine.js";
import { playerDNA, teamDNA, findPlayer } from "../src/v3/playerProfile.js";
import { allocateUsage, roleLabel } from "../src/v3/roles.js";
import { assignDefense } from "../src/v3/defense.js";
import { findDuplicatePerson, personKey } from "../src/v3/persons.js";
import { classifyOutcome, edgeBand } from "../src/v3/analysis.js";
import LEAGUE_NORMS from "../src/v3/data/leagueNorms.js";

const t = (ids) => ids.map((id) => { const p = PLAYERS.find((x) => x.id === id); if (!p) throw new Error(`missing ${id}`); return p; });
const NEUTRAL = resolveCoach("neutral");
const SPACING = t(["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"]);
const BALANCED = t(["magic-80s", "moncrief-80s", "bird-80s", "duncan-00s", "hak-90s"]);
const SIXTIES = t(["oscar-60s", "jerry-60s", "elgin-60s", "bob-60s", "wilt-60s"]);

const winPct = (A, B, era, n = 120, coachA = NEUTRAL, coachB = NEUTRAL) => {
  let w = 0;
  for (let s = 0; s < n; s++) if (simulateGameV3(A, B, coachA, coachB, era, 90000 + s).winner === "Gold") w++;
  return w / n;
};

describe("translation doctrine (Addendum 1/33)", () => {
  it("modern shooter in a pre-3PT era keeps the skill, loses only the line", () => {
    const era60 = resolveEra("1960s");
    const g = simulateGameV3(SPACING, BALANCED, NEUTRAL, NEUTRAL, era60, 7);
    expect(g.gold.totals.tpa).toBe(0); // no three-point scoring before the line
    expect(g.blue.totals.tpa).toBe(0);
    // no automatic old-era penalty: the spacing team stays competitive
    expect(winPct(SPACING, BALANCED, era60)).toBeGreaterThan(0.30);
  });

  it("historical interior player in the modern era keeps his game, gains no threes", () => {
    const era20 = resolveEra("2020s");
    const wilt = teamDNA(SIXTIES)[4];
    expect(wilt.threeTendency).toBeLessThan(1.5); // Wilt does not become a 3PT shooter
    let wiltTpa = 0, wiltReb = 0, n = 60;
    for (let s = 0; s < n; s++) {
      const g = simulateGameV3(SIXTIES, BALANCED, NEUTRAL, NEUTRAL, era20, 4000 + s);
      const line = g.gold.lines[4];
      wiltTpa += line.tpa; wiltReb += line.oreb + line.dreb;
    }
    expect(wiltTpa / n).toBeLessThan(1); // no invented ability
    expect(wiltReb / n).toBeGreaterThan(8); // physical tools travel
  });

  it("no universal era penalty in either direction of time travel", () => {
    // the same matchup shouldn't collapse just because the environment moved
    const home = winPct(SIXTIES, BALANCED, resolveEra("1960s"), 100);
    const away = winPct(SIXTIES, BALANCED, resolveEra("2020s"), 100);
    expect(Math.abs(home - away)).toBeLessThan(0.22);
  });
});

describe("relative-to-era normalization (Addendum 2)", () => {
  it("norms table is honest about unrecorded statistics", () => {
    expect(LEAGUE_NORMS.norms["1960s"].spg).toBeNull();
    expect(LEAGUE_NORMS.norms["1960s"].bpg).toBeNull();
    expect(LEAGUE_NORMS.norms["1990s"].spg).toBeGreaterThan(0);
  });
  it("1960s rebounding is discounted for its inflated environment", () => {
    const bellamy = playerDNA(findPlayer("walt-b-60s")); // non-curated 60s big
    const raw = findPlayer("walt-b-60s").reb * 0.55; // pre-normalization formula
    expect(bellamy.defReb).toBeLessThan(Math.min(10, raw)); // normalized below raw
    expect(bellamy.defReb).toBeGreaterThan(5); // but still clearly a strong rebounder
  });
  it("pre-1974 stl/blk capabilities carry LOW confidence, recorded eras do not", () => {
    expect(playerDNA(findPlayer("walt-b-60s")).provenance.confidence.stlBlkCapabilities).toMatch(/^LOW/);
    expect(playerDNA(findPlayer("gary-90s")).provenance.confidence.stlBlkCapabilities).not.toMatch(/^LOW/);
  });
});

describe("functional roles vs nominal position (Addendum 7/34)", () => {
  it("a nominal center can be the primary creator", () => {
    const jokicTeam = teamDNA(t(["smart-20s", "klay-10s", "og-20s", "draymond-10s", "jokic-20s"]));
    const alloc = allocateUsage(jokicTeam);
    const top = alloc.reduce((a, b) => (b.share > a.share ? b : a));
    expect(top.dna.id).toBe("jokic-20s"); // the C leads the offense
    expect(["Primary Creator", "Secondary Creator", "Post Hub"]).toContain(roleLabel(top));
  });
  it("threat-based defense: the best defender takes the biggest threat, not the same position", () => {
    const off = allocateUsage(teamDNA(t(["luka-20s", "klay-10s", "og-20s", "draymond-10s", "gobert-10s"])));
    const def = teamDNA(t(["smart-20s", "booker-20s", "kawhi-10s", "giannis-20s", "jokic-20s"]));
    const assign = assignDefense(off, def, { switching: 7, pressure: 5, helpAggression: 5, drop: 5, rimPriority: 5, defRebPriority: 5, zone: 0 });
    const onLuka = assign[0];
    expect(["kawhi-10s", "smart-20s", "giannis-20s"]).toContain(def[onLuka.defenderIdx].id); // an elite stopper, not "PG guards PG" by default
  });
  it("an unrealistic assignment still carries a real penalty", () => {
    // tiny non-switchable guard forced onto a giant: quality must drop
    const off = allocateUsage(teamDNA(t(["wilt-60s", "bill-60s", "nate-60s", "willis-60s", "wes-60s"])));
    const def = teamDNA(t(["trae-20s", "murray-20s", "kyrie-20s", "cade-20s", "fox-20s"])); // all guards
    const assign = assignDefense(off, def, { switching: 3, pressure: 5, helpAggression: 5, drop: 5, rimPriority: 5, defRebPriority: 5, zone: 0 });
    const avgQ = assign.reduce((s, a) => s + a.quality, 0) / assign.length;
    expect(avgQ).toBeLessThan(5); // five guards guarding five bigs is a bad night
  });
});

describe("game state, overtime, fouls (Addendum 4/5/6/35)", () => {
  it("no game ever ends tied; OT appends real reconciled basketball", () => {
    let otSeen = 0;
    for (let s = 0; s < 400; s++) {
      const g = simulateGameV3(BALANCED, SPACING, NEUTRAL, NEUTRAL, resolveEra("2020s"), 60000 + s);
      expect(g.finalScore.gold).not.toBe(g.finalScore.blue);
      if (g.overtimes > 0) otSeen++;
      for (const side of [g.gold, g.blue]) {
        const T = side.totals;
        expect(T.pts).toBe(2 * (T.fgm - T.tpm) + 3 * T.tpm + T.ftm); // reconciles through OT
      }
    }
    expect(otSeen).toBeGreaterThan(0); // ties happen and are resolved by basketball
  });
  it("free throws come from attributed fouls (PF in the box score)", () => {
    const g = simulateGameV3(BALANCED, SPACING, NEUTRAL, NEUTRAL, resolveEra("1990s"), 11);
    expect(g.gold.totals.pf).toBeGreaterThan(0);
    // every FT trip (2-3 attempts) is one personal foul on the defense
    expect(g.blue.totals.pf).toBeGreaterThanOrEqual(Math.floor(g.gold.totals.fta / 3));
    expect(g.gold.totals.pf).toBeGreaterThanOrEqual(Math.floor(g.blue.totals.fta / 3));
  });
});

describe("coach in-game adjustments (Addendum 13/36)", () => {
  it("adjustments happen, are bounded, and read from real game stats", () => {
    const pop = resolveCoach("gregg-popovich");
    let games = 0, adjusted = 0;
    const known = /raised the help|pulled shooters back|switched coverages|slowed the game/;
    for (let s = 0; s < 120; s++) {
      const g = simulateGameV3(BALANCED, SPACING, pop, NEUTRAL, resolveEra("2010s"), 71000 + s);
      games++;
      const adj = [...g.gold.adjustments, ...g.blue.adjustments];
      if (adj.length) adjusted++;
      for (const a of adj) expect(a).toMatch(known); // only plausible, known adjustments
      expect(adj.length).toBeLessThanOrEqual(8); // two checkpoints, bounded set
    }
    expect(adjusted).toBeGreaterThan(games * 0.1); // coaches don't disappear after tip
    expect(adjusted).toBeLessThan(games); // and don't fire on every game either
  });
});

describe("duplicate-person rules (Addendum 16)", () => {
  it("personKey resolves a card to the HUMAN it depicts, not to its id stem", () => {
    // Identity now comes from the canonical person registry. The returned value
    // is a real personId, used only for equality and error labelling.
    expect(personKey("jordan-90s")).toBe("michael-jordan");
    expect(personKey("bowen-2ks")).toBe("bruce-bowen");
    expect(personKey("lowry-2010s")).toBe("kyle-lowry");
  });
  it("falls back to the era-suffix strip for ids outside the player pool", () => {
    // synthetic ids in tests and future cards must never throw
    expect(personKey("notarealplayer-90s")).toBe("notarealplayer");
    expect(personKey("madeup-2ks")).toBe("madeup");
  });
  it("flags two versions of one person on the same team", () => {
    expect(findDuplicatePerson(["jordan-80s", "jordan-90s", "pippen-90s", "rodman-90s", "kukoc-90s"])).toBe("michael-jordan");
    expect(findDuplicatePerson(["jordan-90s", "pippen-90s", "rodman-90s", "kukoc-90s", "luc-90s"])).toBeNull();
  });
  it("the same person on OPPOSITE teams is a supported matchup", () => {
    const bulls80s = t(["jordan-80s", "moncrief-80s", "bird-80s", "mcHale-80s", "parish-80s"]);
    const bulls90s = t(["jordan-90s", "pippen-90s", "rodman-90s", "kukoc-90s", "luc-90s"]);
    const g = simulateGameV3(bulls80s, bulls90s, NEUTRAL, NEUTRAL, resolveEra("1990s"), 5);
    const goldNames = g.gold.lines.map((l) => l.id);
    const blueNames = g.blue.lines.map((l) => l.id);
    expect(goldNames).toContain("jordan-80s");
    expect(blueNames).toContain("jordan-90s"); // distinct ids, coherent box score
    expect(g.finalScore.gold).not.toBe(g.finalScore.blue);
  });
});

describe("uncertainty is not randomness (Addendum 22)", () => {
  it("provenance/confidence never feeds game variance", () => {
    const era = resolveEra("2020s");
    const a = simulateGameV3(SIXTIES, BALANCED, NEUTRAL, NEUTRAL, era, 777);
    // mutate the confidence blocks — if variance read them, results would move
    for (const p of SIXTIES) { playerDNA(p).provenance.confidence = { overall: "MUTATED" }; }
    const b = simulateGameV3(SIXTIES, BALANCED, NEUTRAL, NEUTRAL, era, 777);
    expect(b.finalScore).toEqual(a.finalScore);
    expect(b.gold.totals).toEqual(a.gold.totals);
  });
});

describe("expected vs realized + fingerprint (Addendum 12/23/29)", () => {
  it("outcome classification and bands are sane", () => {
    expect(classifyOutcome(0.8)).toBe("EXPECTED_RESULT");
    expect(classifyOutcome(0.5)).toBe("TOSS_UP_RESULT");
    expect(classifyOutcome(0.38)).toBe("MILD_UPSET");
    expect(classifyOutcome(0.2)).toBe("SIGNIFICANT_UPSET");
    expect(classifyOutcome(0.05)).toBe("MAJOR_UPSET");
    expect(edgeBand(0.5)).toBe("TOSS-UP");
    expect(edgeBand(0.83)).toBe("STRONG EDGE");
    expect(edgeBand(0.17)).toBe("STRONG EDGE"); // band of the favorite, whoever it is
  });
  it("every result carries a complete reproduction fingerprint", () => {
    const g = simulateGameV3(BALANCED, SPACING, NEUTRAL, NEUTRAL, resolveEra("2020s"), 99);
    for (const k of ["seed", "engine", "possessionModel", "gameStateModel", "fatigueModel", "playerData", "coachData", "eraData", "calibration"]) {
      expect(g.fingerprint[k]).toBeDefined();
    }
    const replay = simulateGameV3(BALANCED, SPACING, NEUTRAL, NEUTRAL, resolveEra("2020s"), g.fingerprint.seed);
    expect(replay.finalScore).toEqual(g.finalScore); // the fingerprint reproduces the game
  });
});

describe("meta resistance spot checks (Addendum 38/42)", () => {
  it("a well-constructed lower-talent team legitimately beats a poorly built stack", () => {
    const stacked = t(["russ-10s", "harden-10s", "carmelo-00s", "zion-20s", "embiid-20s"]); // high OVR, poor fit
    const built = t(["gary-90s", "bowen-2ks", "pippen-90s", "kg-00s", "gobert-10s"]);      // constructed, defensive
    const p = winPct(built, stacked, resolveEra("2000s"), 150, resolveCoach("gregg-popovich"), NEUTRAL);
    expect(p).toBeGreaterThan(0.45); // basketball construction is a real weapon…
  });
  it("…but raw superstars still beat pure role players (no chemistry-bonus physics)", () => {
    const stars = t(["luka-20s", "jordan-90s", "lebron-10s", "giannis-20s", "jokic-20s"]);
    const roleGuys = t(["smart-20s", "klay-10s", "bowen-2ks", "horace-90s", "camby-2ks"]);
    expect(winPct(stars, roleGuys, resolveEra("2020s"), 100)).toBeGreaterThan(0.85);
  });
});
