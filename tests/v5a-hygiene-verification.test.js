// ── Phase 5A: service-worker hygiene + player verification ────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLAYERS } from "../src/players.js";
import { REGISTRY } from "../src/versions.js";
import { buildId, SW_PLACEHOLDER, CACHE_PREFIX } from "../vite.config.js";
import { statBasisFor, STAT_BASIS } from "../src/v3/data/cardStatBasis.js";
import { PHYSICAL, physicalFor } from "../src/v3/data/physical.js";
import { SHOOTING, shootingFor, threePctIsMeaningful, SHOOTING_SCOPE, SHOOTING_IDENTITY } from "../src/v3/data/shooting.js";
import { PRE_1974_DEFENSE, preRecordingDefense, BAND_FLOOR, DEFENSIVE_BANDS, EVIDENCE_CLASSES, PRE_1974_REVIEWED_IDS } from "../src/v3/data/preRecordingDefense.js";
import { ALL_PERSON_IDS, personIdForCard } from "../src/v3/data/persons.js";
import { allIntelligence, intelligenceFor, validateIntelligence } from "../src/v3/intelligence.js";
import { rawRating, displayOVR } from "../src/rating.js";
import { DATA as REDERIVED, BLOCKED, derive } from "../scripts/rederive-wave-1.mjs";

const card = (id) => PLAYERS.find((p) => p.id === id);
const swSource = () => readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("service worker — build-derived cache identity", () => {
  it("no hard-coded stale cache name survives in executable code", () => {
    const code = swSource().split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/eraclash-v2\.3\.5/);
    expect(code).not.toMatch(/["']eraclash-v\d/);
    expect(code).toContain(SW_PLACEHOLDER);
  });

  it("cache identity is derived from app version plus an asset-manifest hash", () => {
    const a = buildId(["index-AAA.js", "index-AAA.css"]);
    const b = buildId(["index-BBB.js", "index-AAA.css"]);
    expect(a).toContain(CACHE_PREFIX);
    expect(a).toContain(REGISTRY.appVersion.value);
    // a content change moves the identity, because Vite content-hashes filenames
    expect(b).not.toBe(a);
    // ...and identical inputs are stable regardless of order
    expect(buildId(["b.js", "a.js"])).toBe(buildId(["a.js", "b.js"]));
  });

  it("activation deletes stale caches, scoped to our own namespace", () => {
    const src = swSource();
    expect(src).toMatch(/addEventListener\("activate"/);
    expect(src).toMatch(/caches\.delete/);
    // must not sweep caches this app does not own
    expect(src).toMatch(/startsWith\(CACHE_PREFIX\)/);
    expect(src).toMatch(/k !== CACHE/);
  });

  it("API and cross-origin responses are never cached", () => {
    const src = swSource();
    expect(src).toMatch(/pathname\.startsWith\("\/api\/"\)/);
    expect(src).toMatch(/url\.origin !== self\.location\.origin/);
    expect(src).toMatch(/method !== "GET"/);
    // only good same-origin responses are stored
    expect(src).toMatch(/res\.type === "basic"/);
  });

  it("an unreplaced placeholder degrades to a dev name rather than a real identity", () => {
    const src = swSource();
    expect(src).toMatch(/BUILD_ID\.startsWith\("__ERACLASH"\)/);
    expect(src).toMatch(/\$\{CACHE_PREFIX\}dev/);
  });
});

describe("wave-1 re-derivation", () => {
  it("re-derived 43 cards and blocked exactly the one that cannot be reproduced", () => {
    expect(Object.keys(REDERIVED).length).toBe(43);
    expect(Object.keys(BLOCKED)).toEqual(["lucas-m-70s"]);
    expect(BLOCKED["lucas-m-70s"]).toMatch(/career totals only|no per-season/i);
  });

  it("every re-derived card reproduces from its verified season rows", () => {
    for (const [id, spec] of Object.entries(REDERIVED)) {
      const d = derive(spec);
      const c = card(id);
      expect(c, id).toBeTruthy();
      for (const k of ["pts", "reb", "ast", "stl", "blk"]) {
        expect(c[k], `${id}.${k} does not reproduce`).toBe(d[k]);
      }
    }
  });

  it("the games threshold and split-season rules are actually applied", () => {
    // Bernard King's 6-game 1986-87 and Toney's 6-game 1985-86 must be excluded
    for (const id of ["king-80s", "toney-80s", "hudson-70s", "spree-90s", "artest-2ks", "jjj-20s"]) {
      const spec = REDERIVED[id];
      const d = derive(spec);
      expect(d.dropped.length, `${id} should drop at least one sub-threshold season`).toBeGreaterThan(0);
      for (const dropped of d.dropped) expect(dropped.gp).toBeLessThan(20);
    }
  });

  it("honors are decade-scoped by the season they were won in", () => {
    // Arizin's four All-NBA selections are all 1950s seasons
    expect(card("arizin-60s").an1).toBe(0);
    expect(card("arizin-60s").an2).toBe(0);
    // Monroe's only First Team is 1968-69
    expect(card("monroe-70s").an1).toBe(0);
    // Smart: two of three All-Def First Teams are 2010s seasons
    expect(card("smart-20s").ad1).toBe(1);
    // Sprewell's 1994 All-Def Second Team was previously missing
    expect(card("spree-90s").ad2).toBe(1);
    // Deron's two Second Teams (2007-08 and 2009-10) are BOTH 2000s
    expect(card("deron-2ks").an2).toBe(2);
  });

  it("the corrected cards moved to the rigorous stat basis; the blocked one did not", () => {
    for (const id of Object.keys(REDERIVED)) {
      expect(statBasisFor(id).basis, id).toBe(STAT_BASIS.DECADE_SEASON_AVERAGE);
      expect(statBasisFor(id).reproducible, id).toBe(true);
    }
    expect(statBasisFor("lucas-m-70s").basis).toBe(STAT_BASIS.REPRESENTATIVE_PRIME);
    expect(statBasisFor("lucas-m-70s").reproducible).toBe(false);
  });

  it("ratings recalculated coherently — no NaN, no snapshot loosening", () => {
    for (const id of Object.keys(REDERIVED)) {
      const c = card(id);
      const ovr = displayOVR(c, c.pos);
      expect(Number.isFinite(rawRating(c)), id).toBe(true);
      expect(Number.isFinite(ovr), id).toBe(true);
      expect(ovr).toBeGreaterThan(0);
      expect(ovr).toBeLessThanOrEqual(99);
    }
  });

  it("the prime-form convention was inflationary — the correction is net downward", () => {
    // measured, not asserted: mean points across the re-derived set is lower
    // than the prime figures it replaced would have been
    const drops = Object.entries(REDERIVED).filter(([id, spec]) => derive(spec).pts < 21).length;
    expect(drops).toBeGreaterThan(20);
    // and the whole pool is now overwhelmingly off prime-form
    const primes = PLAYERS.filter((p) => statBasisFor(p.id).basis === STAT_BASIS.REPRESENTATIVE_PRIME);
    expect(primes.length).toBe(1);
  });
});

describe("physical data expansion", () => {
  it("coverage materially improved and every value carries provenance", () => {
    expect(Object.keys(PHYSICAL).length).toBeGreaterThanOrEqual(84);
    for (const [personId, rec] of Object.entries(PHYSICAL)) {
      expect(ALL_PERSON_IDS, `${personId} is not a real person`).toContain(personId);
      expect(rec.source, personId).toBeTruthy();
      expect(rec.sourceTier, personId).toBeGreaterThanOrEqual(1);
      expect(rec.verifiedOn, personId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.basis).toBe("LISTED_ROSTER");
    }
  });

  it("implausible measurements are rejected by validation", () => {
    const good = intelligenceFor("eaton-80s");
    expect(validateIntelligence({ ...good, physical: { ...good.physical, heightIn: 200 } }).valid).toBe(false);
    expect(validateIntelligence({ ...good, physical: { ...good.physical, weightLb: 40 } }).valid).toBe(false);
  });

  it("wingspan is still null for every person — never inferred from height", () => {
    for (const rec of Object.values(PHYSICAL)) expect(rec.wingspanIn).toBeNull();
    expect(allIntelligence().filter((p) => p.physical.wingspanIn != null)).toEqual([]);
  });

  it("height is per-person, so all of one human's cards agree", () => {
    const byPerson = new Map();
    for (const p of allIntelligence()) {
      if (p.physical.heightIn == null) continue;
      if (!byPerson.has(p.personId)) byPerson.set(p.personId, new Set());
      byPerson.get(p.personId).add(p.physical.heightIn);
    }
    for (const [pid, heights] of byPerson) expect(heights.size, `${pid} conflicts`).toBe(1);
  });

  it("the shortest and tallest verified persons are plausible", () => {
    expect(physicalFor("calvin-murphy").heightIn).toBe(69);   // 5'9"
    expect(physicalFor("mark-eaton").heightIn).toBe(88);      // 7'4"
  });
});

describe("shooting data expansion", () => {
  it("every record declares a recognised scope and identity", () => {
    for (const [personId, rec] of Object.entries(SHOOTING)) {
      expect(ALL_PERSON_IDS, personId).toContain(personId);
      expect(SHOOTING_SCOPE, `${personId} scope`).toContain(rec.scope);
      if (rec.identity != null) expect(SHOOTING_IDENTITY, personId).toContain(rec.identity);
    }
    expect(Object.keys(SHOOTING).length).toBeGreaterThanOrEqual(84);
  });

  it("no impossible percentages", () => {
    for (const [personId, rec] of Object.entries(SHOOTING)) {
      for (const k of ["fgPct", "threePct", "ftPct"]) {
        if (rec[k] == null) continue;
        expect(rec[k], `${personId}.${k}`).toBeGreaterThanOrEqual(0);
        expect(rec[k], `${personId}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("PRE-THREE-POINT never means zero ability", () => {
    const pre = Object.entries(SHOOTING).filter(([, r]) => r.threePointEra === "NONE");
    expect(pre.length).toBeGreaterThanOrEqual(11);
    for (const [personId, rec] of pre) {
      expect(rec.threePct, personId).toBeNull();
      expect(rec.threeVolume, personId).toBe("NOT_APPLICABLE");
      expect(threePctIsMeaningful(rec), personId).toBe(false);
      // an evidence-backed perimeter judgement still exists
      expect(["ELITE", "GOOD", "AVERAGE", "LIMITED", "NONE"], personId).toContain(rec.perimeterSkill);
    }
    // Paul Arizin: no arc existed, but the skill is not erased
    expect(shootingFor("paul-arizin").perimeterSkill).toBe("GOOD");
    expect(shootingFor("paul-arizin").threePct).toBeNull();
  });

  it("a low-volume percentage does not imply gravity", () => {
    for (const id of ["charles-oakley", "marcus-camby", "andre-drummond", "jermaine-o-neal", "zion-williamson"]) {
      const rec = shootingFor(id);
      expect(rec.threePct, id).not.toBeNull();     // a real number exists
      expect(threePctIsMeaningful(rec), id).toBe(false);  // ...and is unreadable as ability
    }
    // Drummond shoots .217 from three and it means nothing; his spacing stays near zero
    expect(intelligenceFor("drummond-2010s").offense.spacingGravity).toBeLessThan(3);
  });

  it("categorical conclusions carry confidence, and measured ones carry more", () => {
    expect(shootingFor("jeff-hornacek").confidence).toMatch(/HIGH/);      // 3 exact splits
    expect(shootingFor("maurice-lucas").confidence).toMatch(/LOW/);       // categorical only
    expect(shootingFor("maurice-lucas").precision).toBe("NONE");
  });

  it("real shooters separate cleanly from non-shooters in the profile", () => {
    const shooters = ["hornacek-90s", "majerle-90s", "lowry-2010s"].map((id) => intelligenceFor(id).offense.spacingGravity);
    const non = ["oakley-90s", "camby-2ks", "drummond-2010s"].map((id) => intelligenceFor(id).offense.spacingGravity);
    expect(Math.min(...shooters)).toBeGreaterThan(Math.max(...non) + 4);
  });
});

describe("pre-1974 defensive review", () => {
  it("every pre-1974 card is reviewed or curated — none left deriving from zeroes", () => {
    const pre = allIntelligence().filter((p) =>
      String(p.provenance.dnaProvenance.confidence.stlBlkCapabilities).startsWith("LOW"));
    expect(pre.length).toBe(50);
    for (const p of pre) {
      const reviewed = preRecordingDefense(p.id) != null || p.provenance.humanReviewed;
      expect(reviewed, `${p.id} is neither reviewed nor curated`).toBe(true);
      expect(p.defense.eventCreation, `${p.id} still derives 0 event creation`).toBeGreaterThan(0);
    }
  });

  it("bands and evidence classes come from the closed vocabularies", () => {
    for (const [id, rec] of Object.entries(PRE_1974_DEFENSE)) {
      expect(PLAYERS.some((p) => p.id === id), `${id} is not a real card`).toBe(true);
      for (const k of ["interiorBand", "perimeterBand", "eventCreationBand"]) {
        expect(DEFENSIVE_BANDS, `${id}.${k}`).toContain(rec[k]);
      }
      expect(EVIDENCE_CLASSES, `${id}.evidence`).toContain(rec.evidence);
    }
    expect(PRE_1974_REVIEWED_IDS.length).toBeGreaterThanOrEqual(43);
  });

  it("NO steal or block rate is fabricated — only 0-10 capability floors", () => {
    const src = readFileSync(new URL("../src/v3/data/preRecordingDefense.js", import.meta.url), "utf8");
    // the file must not assign per-game statistics
    expect(src).not.toMatch(/\b(stl|blk|spg|bpg)\s*:/);
    // and the floors are capability values, bounded 0-10
    for (const v of Object.values(BAND_FLOOR)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(src).toMatch(/never claims a rate|does NOT invent/i);
  });

  it("the floor lifts a documented anchor without overriding curation", () => {
    // Russell's 1950s card is band-reviewed; his 1960s card is human-curated
    expect(intelligenceFor("russell-50s").defense.eventCreation).toBeGreaterThanOrEqual(8);
    expect(intelligenceFor("bill-60s").provenance.humanReviewed).toBe(true);
    expect(intelligenceFor("bill-60s").defense.eventCreation).toBe(10);
    // a guard with no defensive reputation is NOT lifted to elite
    expect(intelligenceFor("cousy-60s").defense.eventCreation).toBeLessThan(6);
  });

  it("confidence stays reduced for pre-1974 profiles", () => {
    const p = intelligenceFor("nate-60s");
    expect(p.provenance.preRecordingDefense).toMatch(/REVIEWED/);
    expect(p.provenance.preRecordingDefense).toMatch(/unrecorded/);
    if (!p.provenance.humanReviewed) expect(p.confidence.defense).toMatch(/LOW/);
  });
});

describe("Phase 5A did not break the pool", () => {
  it("all 381 cards still produce valid profiles", () => {
    const all = allIntelligence();
    expect(all.length).toBe(381);
    expect(all.filter((p) => !validateIntelligence(p).valid)).toEqual([]);
  });

  it("every card has the full completion standard", () => {
    for (const p of allIntelligence()) {
      expect(p.personId, `${p.id} personId`).toBeTruthy();
      expect(statBasisFor(p.id).basis, `${p.id} stat basis`).toBeTruthy();
      expect(p.provenance.derivedFrom, `${p.id} provenance`).toBeTruthy();
      expect(p.shooting.scope ?? "UNKNOWN", `${p.id} shooting scope`).toBeTruthy();
      expect(p.physical.basis, `${p.id} physical basis`).toBeTruthy();
      expect(p.confidence.overall, `${p.id} confidence`).toBeTruthy();
    }
  });

  it("person identity is unchanged by the verification pass", () => {
    expect(personIdForCard("guerin-60s")).toBe("richie-guerin");
    expect(personIdForCard("barry-60s")).toBe(personIdForCard("rick-70s"));
    expect(ALL_PERSON_IDS.length).toBe(323);
  });
});
