// ── Player Intelligence V3 ────────────────────────────────────────────────────
// Guards the four promises this layer makes:
//   1. every profile is well-formed and honest about what it does not know
//   2. it invents nothing — no measurements, no roles outside the vocabulary
//   3. it is ERA-INDEPENDENT: a player describes the same no matter when the
//      game is played. This is the promise most likely to be broken later by a
//      well-meaning "shooters were better in the 2010s" patch.
//   4. it does not touch the live simulation
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PLAYERS } from "../src/players.js";
import { playerDNA } from "../src/v3/playerProfile.js";
import {
  ROLES, ROLE_DEFINITIONS, ROLE_CALIBRATION, ATTRIBUTE_DEFINITIONS,
  buildIntelligence, validateIntelligence, intelligenceFor, allIntelligence,
} from "../src/v3/intelligence.js";
import CURATED, { CURATED_IDS } from "../src/v3/data/intelligence.js";

const ALL = allIntelligence();
const byId = (id) => {
  const p = intelligenceFor(id);
  if (!p) throw new Error(`no player card for ${id}`);
  return p;
};

// The eleven profile anchors the vocabulary was calibrated against.
const NAMED = [
  "walt-b-60s", "tiny-70s", "eaton-80s", "nance-80s", "mullin-90s", "glen-90s",
  "petrovic-90s", "prince-00s", "finley-00s", "joshsmith-00s", "gwallace-00s",
];

describe("player intelligence — coverage & validity", () => {
  it("builds one profile per card and every one validates", () => {
    expect(ALL.length).toBe(PLAYERS.length);
    expect(ALL.length).toBe(381);
    const failures = ALL
      .map((p) => ({ id: p.id, ...validateIntelligence(p) }))
      .filter((r) => !r.valid);
    expect(failures, JSON.stringify(failures.slice(0, 5), null, 2)).toEqual([]);
  });

  it("profile ids match the player pool exactly", () => {
    expect(ALL.map((p) => p.id).sort()).toEqual(PLAYERS.map((p) => p.id).sort());
  });

  it("rejects a malformed profile rather than waving it through", () => {
    const good = byId("eaton-80s");
    expect(validateIntelligence(good).valid).toBe(true);
    // An UNSOURCED height is the exact failure this layer must never allow: it
    // is indistinguishable from an invented one. A sourced height is fine.
    const unsourced = { ...good, physical: { ...good.physical, heightIn: 88, source: null, sourceTier: null, verifiedOn: null } };
    const r = validateIntelligence(unsourced);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/carries no source/);
    // wingspan may never be populated at all, sourced or not
    const winged = { ...good, physical: { ...good.physical, wingspanIn: 90 } };
    expect(validateIntelligence(winged).valid).toBe(false);
    expect(validateIntelligence(winged).errors.join(" ")).toMatch(/wingspanIn must be null/);
    // implausible measurements are rejected even with a source attached
    expect(validateIntelligence({ ...good, physical: { ...good.physical, heightIn: 200 } }).valid).toBe(false);
    // a pre-three-point player may not carry a three-point percentage
    const cousy = byId("cousy-50s");
    expect(validateIntelligence({ ...cousy, shooting: { ...cousy.shooting, threePct: 0.0 } }).valid).toBe(false);
    // percentages must be fractions, not percents
    expect(validateIntelligence({ ...good, shooting: { ...good.shooting, ftPct: 64.9 } }).valid).toBe(false);
    // out-of-range and unknown-role must also fail
    expect(validateIntelligence({ ...good, offense: { ...good.offense, selfCreation: 47 } }).valid).toBe(false);
    expect(validateIntelligence({ ...good, roles: { ...good.roles, primary: "Sixth Man" } }).valid).toBe(false);
    expect(validateIntelligence(null).valid).toBe(false);
  });
});

describe("player intelligence — invents nothing", () => {
  it("never carries an unsourced measurement, and never a wingspan at all", () => {
    let verified = 0;
    for (const p of ALL) {
      // wingspan is null for everyone, always: unpublished for historical
      // players and never derivable from height
      expect(p.physical.wingspanIn, p.id).toBeNull();
      if (p.physical.heightIn === null) {
        expect(p.physical.weightLb, p.id).toBeNull();
        expect(p.physical.basis, p.id).toBe("UNVERIFIED");
        expect(p.confidence.physical, p.id).toMatch(/NONE/);
      } else {
        verified++;
        // every populated measurement carries full provenance
        expect(p.physical.source, p.id).toBeTruthy();
        expect(p.physical.sourceTier, p.id).toBeGreaterThan(0);
        expect(p.physical.verifiedOn, p.id).toBeTruthy();
        expect(p.physical.basis, p.id).toBe("LISTED_ROSTER");
        expect(p.physical.heightIn, p.id).toBeGreaterThanOrEqual(60);
        expect(p.physical.heightIn, p.id).toBeLessThanOrEqual(96);
      }
    }
    expect(verified, "the verified physical tranche must be non-empty").toBeGreaterThan(40);
  });

  it("height is per-person, so every card of one human agrees", () => {
    const byPerson = new Map();
    for (const p of ALL) {
      if (p.physical.heightIn === null) continue;
      if (!byPerson.has(p.personId)) byPerson.set(p.personId, []);
      byPerson.get(p.personId).push(p);
    }
    for (const [personId, cards] of byPerson) {
      const heights = new Set(cards.map((c) => c.physical.heightIn));
      expect(heights.size, `${personId} has conflicting heights across cards`).toBe(1);
    }
    // and the multi-card case is actually exercised
    expect([...byPerson.values()].some((c) => c.length > 1)).toBe(true);
  });

  it("the curated file does not set physical measurements", () => {
    for (const [id, entry] of Object.entries(CURATED)) {
      expect(entry.physical, `${id} must not curate measurements`).toBeUndefined();
    }
  });

  it("every claimed role comes from the closed vocabulary", () => {
    expect(new Set(ROLES).size).toBe(ROLES.length);
    expect(ROLE_DEFINITIONS.map((r) => r.role).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ROLE_CALIBRATION).sort()).toEqual([...ROLES].sort());
    for (const p of ALL) {
      expect(ROLES, p.id).toContain(p.roles.primary);
      for (const r of p.roles.all) expect(ROLES, p.id).toContain(r);
      for (const r of p.roles.secondary) expect(p.roles.all, p.id).toContain(r);
      expect(p.roles.all, p.id).toContain(p.roles.primary);
      expect(p.roles.secondary, p.id).not.toContain(p.roles.primary);
    }
  });

  it("every numeric attribute is defined, finite, and inside 0–10", () => {
    for (const p of ALL) {
      for (const block of ["offense", "defense", "fit"]) {
        for (const [k, v] of Object.entries(p[block])) {
          expect(ATTRIBUTE_DEFINITIONS[k], `${p.id}.${block}.${k} undocumented`).toBeTruthy();
          expect(ATTRIBUTE_DEFINITIONS[k].block).toBe(block);
          expect(Number.isFinite(v), `${p.id}.${block}.${k}`).toBe(true);
          expect(v, `${p.id}.${block}.${k}`).toBeGreaterThanOrEqual(0);
          expect(v, `${p.id}.${block}.${k}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });
});

describe("player intelligence — provenance & confidence", () => {
  it("every profile records where it came from and how sure it is", () => {
    for (const p of ALL) {
      const pv = p.provenance;
      expect(pv.derivedFrom, p.id).toBeTruthy();
      expect(pv.dnaProvenance, p.id).toBeTruthy();
      expect(pv.dnaProvenance.confidence, p.id).toBeTruthy();
      expect(typeof pv.humanReviewed, p.id).toBe("boolean");
      expect(Array.isArray(pv.curatedFields), p.id).toBe(true);
      expect(pv.physical, p.id).toMatch(/ABSENT|VERIFIED/);
      expect(pv.shooting, p.id).toBeTruthy();
      expect(pv.statBasis?.basis, p.id).toBeTruthy();
      expect(pv.eraIndependence, p.id).toBeTruthy();
      expect(pv.engineUse, p.id).toMatch(/NONE/);
      for (const k of ["offense", "defense", "roles", "physical", "overall"]) {
        expect(p.confidence[k], `${p.id}.confidence.${k}`).toBeTruthy();
      }
    }
  });

  it("pre-1974 players are marked LOW confidence on defense, never presented as measured", () => {
    // steals and blocks were not officially recorded before 1973-74
    for (const p of ALL.filter((x) => ["1950s", "1960s"].includes(x.decade))) {
      if (p.provenance.humanReviewed) continue; // curation supersedes with reviewed judgement
      expect(p.confidence.defense, p.id).toMatch(/LOW/);
    }
  });

  it("uncurated profiles admit the shooting data gap; curated ones are marked reviewed", () => {
    const wilt = byId("wilt-70s");
    expect(wilt.provenance.humanReviewed).toBe(false);
    expect(wilt.provenance.curatedFields).toEqual([]);
    const eaton = byId("eaton-80s");
    expect(eaton.provenance.humanReviewed).toBe(true);
    expect(eaton.provenance.curatedFields.length).toBeGreaterThan(0);
    expect(eaton.provenance.curatorNote).toBeTruthy();
    expect(eaton.confidence.overall).toBe("HIGH");
  });
});

describe("player intelligence — the eleven curated anchors", () => {
  it("all eleven named players carry HUMAN_REVIEWED profiles", () => {
    // the eleven original anchors must all still be curated; the set is
    // expected to GROW as the risk-based review expands, so this is a subset
    // check rather than an equality one
    for (const id of NAMED) expect(CURATED_IDS, `${id} lost its curated profile`).toContain(id);
    expect(CURATED_IDS.length).toBeGreaterThanOrEqual(NAMED.length);
    expect(new Set(CURATED_IDS).size).toBe(CURATED_IDS.length);
    for (const id of NAMED) {
      const p = byId(id);
      expect(p.provenance.humanReviewed, id).toBe(true);
      expect(p.provenance.curatorNote, id).toBeTruthy();
      expect(p.provenance.curatedFields.length, id).toBeGreaterThan(0);
    }
  });

  it("every curated id refers to a real card, and curated fields are real attributes", () => {
    for (const id of CURATED_IDS) {
      expect(PLAYERS.some((p) => p.id === id), `${id} has no card`).toBe(true);
      const p = byId(id);
      for (const path of p.provenance.curatedFields) {
        const [block, key] = path.split(".");
        if (block === "roles") continue;
        expect(["offense", "defense", "fit"], path).toContain(block);
        expect(ATTRIBUTE_DEFINITIONS[key], `${path} is not a defined attribute`).toBeTruthy();
      }
    }
  });

  it("curation actually overrides the derivation where it disagrees", () => {
    // Eaton is the correction case: two DPOYs and five All-Defensive teams push
    // the accolade-driven derivation to 7.4 wing containment and 5.6 scheme
    // versatility for a 7'4" drop anchor who could not switch at all.
    const raw = playerDNA(PLAYERS.find((p) => p.id === "eaton-80s"));
    expect(raw.wingDef).toBeGreaterThan(7);
    expect(raw.switchability).toBeGreaterThan(5);
    const eaton = byId("eaton-80s");
    expect(eaton.defense.wingContainment).toBeLessThanOrEqual(2);
    expect(eaton.defense.schemeVersatility).toBeLessThanOrEqual(2);
    // magnitude kept, location fixed
    expect(eaton.defense.rimDeterrence).toBe(10);
    expect(eaton.defense.interiorDeterrence).toBe(10);
  });
});

describe("player intelligence — roles classify logically", () => {
  it("Eaton is a rim protector and defensive anchor, and is NOT a creator", () => {
    const e = byId("eaton-80s");
    expect(e.roles.primary).toBe("Rim Protector");
    expect(e.roles.all).toContain("Defensive Anchor");
    expect(e.roles.all).not.toContain("Primary Creator");
    expect(e.roles.all).not.toContain("Secondary Creator");
    expect(e.roles.all).not.toContain("Floor General");
  });

  it("defensive specialists lead with defensive roles", () => {
    const DEF = { "bowen-2ks": "Point-of-Attack Stopper", "prince-00s": "Wing Stopper", "bill-60s": "Rim Protector" };
    for (const [id, role] of Object.entries(DEF)) {
      expect(byId(id).roles.primary, id).toBe(role);
      expect(byId(id).roles.all, id).not.toContain("Primary Creator");
    }
    for (const id of ["joshsmith-00s", "gwallace-00s"]) {
      expect(byId(id).roles.primary, id).toBe("Help Defender");
    }
  });

  it("ball-dominant stars lead with creation roles", () => {
    for (const id of ["harden-10s", "russ-10s", "ai-00s", "tiny-70s"]) {
      expect(byId(id).roles.primary, id).toBe("Primary Creator");
    }
  });

  it("shooters lead with shooting roles", () => {
    for (const id of ["klay-10s", "curry-10s", "glen-90s", "mullin-90s", "petrovic-90s", "finley-00s"]) {
      const p = byId(id);
      expect(["Movement Shooter", "Spot-Up Spacer"], `${id} => ${p.roles.primary}`).toContain(p.roles.primary);
    }
  });

  it("no role is claimed without clearing its calibrated bar, unless a human asserted it", () => {
    for (const p of ALL) {
      const qualifying = p.roles.scored.filter((s) => s.qualifies).map((s) => s.role);
      if (p.provenance.humanReviewed) {
        // curated profiles may add roles the derivation cannot see, but every
        // role that DID qualify must still be listed
        for (const r of qualifying) expect(p.roles.all, `${p.id} dropped qualifying role ${r}`).toContain(r);
        const asserted = p.roles.all.filter((r) => !qualifying.includes(r));
        const curatedRoles = [CURATED[p.id].roles?.primary, ...(CURATED[p.id].roles?.secondary || [])];
        for (const r of asserted) expect(curatedRoles, `${p.id}: ${r} was neither earned nor asserted`).toContain(r);
      } else if (p.roles.defining) {
        expect(p.roles.all.sort(), p.id).toEqual(qualifying.sort());
      } else {
        expect(p.roles.all, p.id).toEqual([p.roles.primary]);
        expect(qualifying, p.id).toEqual([]);
      }
    }
    // the vocabulary must actually be used, not collapse onto one label
    const primaries = new Set(ALL.map((p) => p.roles.primary));
    expect(primaries.size).toBeGreaterThanOrEqual(12);
    const counts = {};
    for (const p of ALL) counts[p.roles.primary] = (counts[p.roles.primary] || 0) + 1;
    const biggest = Math.max(...Object.values(counts));
    expect(biggest / ALL.length, "one role must not swallow the pool").toBeLessThan(0.35);
  });
});

describe("player intelligence — role acceptance measures portability, not fame", () => {
  // High acceptance = still worth a starting spot on minimum touches.
  // Low acceptance = needs the ball to be themselves. Neither is a compliment.
  const HIGH = ["klay-10s", "prince-00s", "bowen-2ks", "eaton-80s"];
  const LOW = ["harden-10s", "russ-10s", "ai-00s", "tiny-70s"];

  it("low-usage contributors score high", () => {
    for (const id of HIGH) expect(byId(id).fit.roleScalability, id).toBeGreaterThanOrEqual(6.5);
  });

  it("ball-dominant stars score low", () => {
    for (const id of LOW) expect(byId(id).fit.roleScalability, id).toBeLessThanOrEqual(4);
  });

  it("every high-acceptance player outranks every ball-dominant one", () => {
    const lowest = Math.min(...HIGH.map((id) => byId(id).fit.roleScalability));
    const highest = Math.max(...LOW.map((id) => byId(id).fit.roleScalability));
    expect(lowest).toBeGreaterThan(highest);
  });

  it("acceptance and creation-dependence pull in opposite directions", () => {
    for (const id of [...HIGH, ...LOW]) {
      const p = byId(id);
      expect(p.fit.roleScalability + p.fit.creationDependence, id).toBeLessThan(16);
    }
  });
});

describe("player intelligence — ERA INDEPENDENCE", () => {
  const CONTEXTS = [
    undefined, {}, { era: "1950s" }, { era: "2020s" },
    { era: "1960s", eraStyle: { pace: 120, spacing: 0 } },
    { era: "2010s", eraStyle: { pace: 92, spacing: 10 }, coach: { starEmpowerment: 10 } },
  ];

  it("a profile is byte-identical under every era context", () => {
    for (const p of PLAYERS) {
      const base = JSON.stringify(buildIntelligence(p));
      for (const ctx of CONTEXTS) {
        expect(JSON.stringify(buildIntelligence(p, ctx)), `${p.id} changed under ${JSON.stringify(ctx)}`).toBe(base);
      }
    }
  });

  it("the whole pool is identical under conflicting era contexts", () => {
    expect(JSON.stringify(allIntelligence({ era: "1950s" })))
      .toBe(JSON.stringify(allIntelligence({ era: "2020s" })));
  });

  it("no era bonus can hide in the source: the module never branches on era", () => {
    const src = readFileSync(new URL("../src/v3/intelligence.js", import.meta.url), "utf8");
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
      .join("\n");
    // reading the era out of the context object is the regression to prevent
    expect(code).not.toMatch(/ctx\s*\.\s*era/);
    expect(code).not.toMatch(/ctx\s*\[\s*["']era/);
    expect(code).not.toMatch(/ERA_(BONUS|MULTIPLIER|BOOST)/);
    // the curated data file must not price eras either
    const data = readFileSync(new URL("../src/v3/data/intelligence.js", import.meta.url), "utf8");
    const dataCode = data.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(dataCode).not.toMatch(/eraBonus|eraMultiplier/);
  });

  it("eraTranslation names environment-sensitive strengths without pricing them", () => {
    const glen = byId("glen-90s"); // elite shooter — the clearest era-sensitive case
    const sensitive = glen.eraTranslation.eraSensitive.map((s) => s.skill);
    expect(sensitive).toContain("spacingGravity");
    for (const p of ALL) {
      for (const entry of [...p.eraTranslation.portable, ...p.eraTranslation.eraSensitive]) {
        expect(typeof entry.skill).toBe("string");
        expect(typeof entry.why).toBe("string");
        // naming only: no numeric value may be attached to an era note
        expect(Object.keys(entry).sort()).toEqual(["skill", "why"]);
      }
      expect(p.eraTranslation.note).toMatch(/attach no value|apply no bonus/i);
    }
  });
});

describe("player intelligence — the live simulation is untouched", () => {
  it("no simulation module imports the intelligence layer", () => {
    const dir = new URL("../src/v3/", import.meta.url);
    // teamIntelligence.js is EXEMPT and must be: it is the next description
    // layer up, built deliberately on top of Player Intelligence, and is itself
    // unwired from the engine (guarded by tests/v3-team-intelligence.test.js).
    // Every remaining file here is a simulation module, and none may import it.
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".js") && f !== "intelligence.js" && f !== "teamIntelligence.js");
    expect(files).toContain("possession.js");
    expect(files).toContain("engine.js");
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), "utf8");
      expect(src, `${f} must not import the intelligence layer`).not.toMatch(/from\s+["'].*intelligence\.js["']/);
    }
  });

  it("building profiles does not mutate player cards or DNA", () => {
    const card = PLAYERS.find((p) => p.id === "eaton-80s");
    const cardBefore = JSON.stringify(card);
    const dnaBefore = JSON.stringify(playerDNA(card));
    buildIntelligence(card, { era: "2020s" });
    expect(JSON.stringify(card)).toBe(cardBefore);
    expect(JSON.stringify(playerDNA(card))).toBe(dnaBefore);
  });

  it("the curated overlay never writes back into the shared DNA object", () => {
    const card = PLAYERS.find((p) => p.id === "prince-00s");
    const dna = playerDNA(card);
    const p = byId("prince-00s");
    // curation raised wing containment well above the derived DNA value
    expect(p.defense.wingContainment).toBeGreaterThan(dna.wingDef);
    expect(playerDNA(card).wingDef).toBe(dna.wingDef);
  });

  it("intelligenceFor returns null for an unknown id instead of inventing a player", () => {
    expect(intelligenceFor("not-a-real-player")).toBeNull();
  });
});
