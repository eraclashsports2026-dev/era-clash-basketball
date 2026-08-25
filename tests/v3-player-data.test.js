// ── Phase 2B: player data completion ──────────────────────────────────────────
// Guards the data-integrity work: canonical person identity, verified physical
// metadata, shooting evidence, and the card statistical-basis registry.
import { describe, it, expect } from "vitest";
import { PLAYERS } from "../src/players.js";
import { personKey, findDuplicatePerson } from "../src/v3/persons.js";
import { personIdForCard, personIdFromName, PERSON_INDEX, ALL_PERSON_IDS, cardsForPerson } from "../src/v3/data/persons.js";
import { PHYSICAL, physicalFor } from "../src/v3/data/physical.js";
import { SHOOTING, shootingFor, threePctIsMeaningful, SHOOTING_IDENTITY } from "../src/v3/data/shooting.js";
import { statBasisFor, STAT_BASIS, BASIS_GROUPS } from "../src/v3/data/cardStatBasis.js";
import { rawRating, displayOVR } from "../src/rating.js";
import { intelligenceFor, allIntelligence, validateIntelligence, ATTRIBUTE_DEFINITIONS } from "../src/v3/intelligence.js";

const card = (id) => PLAYERS.find((p) => p.id === id);

describe("player identity — one human, one personId", () => {
  it("every card resolves to a person, and persons are fewer than cards", () => {
    for (const p of PLAYERS) expect(personIdForCard(p.id), p.id).toBeTruthy();
    expect(ALL_PERSON_IDS.length).toBeLessThan(PLAYERS.length);
    expect(ALL_PERSON_IDS.length).toBe(new Set(ALL_PERSON_IDS).size);
  });

  it("cards sharing a name share one personId — no split humans", () => {
    const byName = new Map();
    for (const p of PLAYERS) {
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name).push(p);
    }
    for (const [name, cards] of byName) {
      const ids = new Set(cards.map((c) => personIdForCard(c.id)));
      expect(ids.size, `${name} is split across ${[...ids].join(", ")}`).toBe(1);
    }
  });

  it("the seven historical SPLITS are repaired", () => {
    // each pair is one human whose two cards used unrelated id stems
    const pairs = [
      ["russell-50s", "bill-60s"], ["pettit-50s", "bob-60s"], ["rick-70s", "barry-60s"],
      ["charles-80s", "barkley-90s"], ["carmelo-00s", "melo-10s"],
      ["price-80s", "mark-p-90s"], ["antawn-90s", "jamison-00s"],
    ];
    for (const [a, b] of pairs) {
      expect(card(a), a).toBeTruthy();
      expect(card(b), b).toBeTruthy();
      expect(card(a).name).toBe(card(b).name);
      expect(personIdForCard(a), `${a} vs ${b}`).toBe(personIdForCard(b));
      // and the live duplicate rule now fires on them
      expect(findDuplicatePerson([a, b, "pippen-90s", "rodman-90s", "kukoc-90s"])).toBe(personIdForCard(a));
    }
  });

  it("the two historical COLLISIONS are repaired — different humans stay different", () => {
    const pairs = [["chet-60s", "chet-20s"], ["dj-80s", "dj-10s"]];
    for (const [a, b] of pairs) {
      expect(card(a).name).not.toBe(card(b).name);
      expect(personIdForCard(a), `${a} vs ${b}`).not.toBe(personIdForCard(b));
      // a lineup containing both is legal and must NOT be refused
      expect(findDuplicatePerson([a, b, "pippen-90s", "rodman-90s", "kukoc-90s"])).toBeNull();
    }
  });

  it("nicknames never create a second person — Nate/Tiny Archibald is one man", () => {
    const cards = PLAYERS.filter((p) => p.name.includes("Archibald"));
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(cards.map((c) => personIdForCard(c.id)));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe("nate-archibald");
    // no card is named after the nickname
    expect(PLAYERS.some((p) => p.name === "Tiny Archibald")).toBe(false);
    // the nickname lives in display only
    expect(PERSON_INDEX.get("nate-archibald").displayName).toMatch(/Tiny/);
    expect(cardsForPerson("nate-archibald").sort()).toEqual(["tiny-70s", "tiny-80s"]);
  });

  it("same-team duplicate validation still works in both directions", () => {
    expect(findDuplicatePerson(["jordan-80s", "jordan-90s"])).toBe("michael-jordan");
    expect(findDuplicatePerson(["jordan-90s", "pippen-90s", "rodman-90s", "kukoc-90s", "luc-90s"])).toBeNull();
    expect(findDuplicatePerson([])).toBeNull();
    expect(findDuplicatePerson(null)).toBeNull();
    // personKey is the same resolver
    expect(personKey("jordan-90s")).toBe(personIdForCard("jordan-90s"));
  });

  it("multi-decade humans are indexed with all their cards", () => {
    const multi = [...PERSON_INDEX.values()].filter((p) => p.cardIds.length > 1);
    expect(multi.length).toBeGreaterThan(40);
    for (const person of multi) {
      expect(new Set(person.decades).size, `${person.personId} repeats a decade`).toBe(person.decades.length);
    }
  });
});

describe("physical metadata — verified or null, never inferred", () => {
  it("every populated measurement carries full provenance", () => {
    for (const [personId, rec] of Object.entries(PHYSICAL)) {
      expect(ALL_PERSON_IDS, `${personId} is not a real person`).toContain(personId);
      expect(rec.heightIn).toBeGreaterThan(60);
      expect(rec.heightIn).toBeLessThan(96);
      expect(rec.weightLb).toBeGreaterThan(120);
      expect(rec.weightLb).toBeLessThan(400);
      expect(rec.source, personId).toBeTruthy();
      expect(rec.sourceTier, personId).toBeGreaterThanOrEqual(1);
      expect(rec.sourceTier, personId).toBeLessThanOrEqual(4);
      expect(rec.verifiedOn, personId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.basis).toBe("LISTED_ROSTER");
    }
  });

  it("wingspan is null for every person — never inferred from height", () => {
    for (const rec of Object.values(PHYSICAL)) expect(rec.wingspanIn).toBeNull();
    expect(physicalFor("mark-eaton").wingspanIn).toBeNull();
    // and specifically not derived: Eaton and Kareem differ in height, both null
    expect(physicalFor("kareem-abdul-jabbar").wingspanIn).toBeNull();
  });

  it("an unknown person returns explicit nulls, not a guess", () => {
    const r = physicalFor("no-such-person");
    expect(r.heightIn).toBeNull();
    expect(r.weightLb).toBeNull();
    expect(r.wingspanIn).toBeNull();
    expect(r.basis).toBe("UNVERIFIED");
    expect(r.confidence).toMatch(/NONE/);
  });

  it("heights are basketball-plausible and ordered as expected", () => {
    expect(physicalFor("mark-eaton").heightIn).toBe(88);       // 7'4"
    expect(physicalFor("allen-iverson").heightIn).toBe(72);    // 6'0"
    expect(physicalFor("mark-eaton").heightIn).toBeGreaterThan(physicalFor("stephen-curry").heightIn);
    expect(physicalFor("shaquille-o-neal").weightLb).toBeGreaterThan(physicalFor("michael-cooper").weightLb);
  });
});

describe("shooting evidence — categorical where exact data does not exist", () => {
  it("no impossible percentages anywhere", () => {
    for (const [personId, rec] of Object.entries(SHOOTING)) {
      expect(ALL_PERSON_IDS, `${personId} is not a real person`).toContain(personId);
      for (const k of ["fgPct", "threePct", "ftPct"]) {
        const v = rec[k];
        if (v === null) continue;
        expect(v, `${personId}.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${personId}.${k}`).toBeLessThanOrEqual(1);
      }
      if (rec.identity != null) expect(SHOOTING_IDENTITY).toContain(rec.identity);
    }
  });

  it("PRE-THREE-POINT players are never assigned zero three-point ability", () => {
    const preLine = Object.entries(SHOOTING).filter(([, r]) => r.threePointEra === "NONE");
    expect(preLine.length).toBeGreaterThan(4);
    for (const [personId, rec] of preLine) {
      // undefined, not zero
      expect(rec.threePct, personId).toBeNull();
      expect(rec.threeVolume, personId).toBe("NOT_APPLICABLE");
      expect(threePctIsMeaningful(rec), personId).toBe(false);
      // but perimeter skill is still carried, era-neutrally
      expect(["ELITE", "GOOD", "AVERAGE", "LIMITED", "NONE"], personId).toContain(rec.perimeterSkill);
    }
    // Jerry West is the load-bearing example: no arc existed, skill was elite
    const west = shootingFor("jerry-west");
    expect(west.threePct).toBeNull();
    expect(west.perimeterSkill).toBe("ELITE");
    // and that elite skill reaches the profile rather than being lost
    expect(intelligenceFor("jerry-60s").offense.spacingGravity).toBeGreaterThanOrEqual(7);
  });

  it("a true-but-meaningless percentage is flagged by volume, not trusted", () => {
    const eaton = shootingFor("mark-eaton");
    expect(eaton.threePct).toBe(0);          // genuinely .000
    expect(eaton.threeVolume).toBe("NONE");
    expect(threePctIsMeaningful(eaton)).toBe(false);   // ...and therefore unreadable as ability
    const wallace = shootingFor("ben-wallace");
    expect(threePctIsMeaningful(wallace)).toBe(false);
    // a real high-volume shooter passes the same guard
    expect(threePctIsMeaningful(shootingFor("klay-thompson"))).toBe(true);
  });

  it("movement shooters and non-shooters land far apart in the profile", () => {
    const shooters = ["klay-10s", "reggie-90s", "ray-00s", "petrovic-90s"].map((id) => intelligenceFor(id).offense.spacingGravity);
    const nonShooters = ["eaton-80s", "ben-00s", "rodman-90s"].map((id) => intelligenceFor(id).offense.spacingGravity);
    expect(Math.min(...shooters)).toBeGreaterThan(Math.max(...nonShooters) + 5);
    for (const id of ["klay-10s", "reggie-90s", "ray-00s"]) {
      expect(intelligenceFor(id).shooting.identity).toBe("MOVEMENT_SHOOTER");
    }
    for (const id of ["eaton-80s", "ben-00s", "rodman-90s"]) {
      expect(intelligenceFor(id).shooting.identity).toBe("NON_SHOOTER");
    }
  });

  it("confidence tracks how much was actually measured", () => {
    expect(shootingFor("klay-thompson").confidence).toMatch(/HIGH/);      // three exact splits
    expect(shootingFor("stephen-curry").confidence).toMatch(/MEDIUM/);    // partial
    expect(shootingFor("tim-duncan").confidence).toMatch(/LOW/);          // categorical only
    expect(shootingFor("nobody-at-all").confidence).toMatch(/NONE/);      // nothing on file
  });

  it("an unknown person gets no shooting claims at all", () => {
    const r = shootingFor("no-such-person");
    expect(r.fgPct).toBeNull();
    expect(r.identity).toBeNull();
    expect(r.perimeterSkill).toBe("UNKNOWN");
  });
});

describe("card statistical basis — the pool is not uniform and says so", () => {
  it("every card receives a recognised classification", () => {
    const known = Object.values(STAT_BASIS);
    for (const p of PLAYERS) {
      const b = statBasisFor(p.id);
      expect(known, p.id).toContain(b.basis);
      expect(b.confidence, p.id).toBeTruthy();
      expect(b.note, p.id).toBeTruthy();
      expect(b.group, `${p.id} is unclassified`).toBeTruthy();
    }
  });

  it("an unregistered card is marked UNKNOWN rather than assumed rigorous", () => {
    const b = statBasisFor("not-a-card-99s");
    expect(b.basis).toBe(STAT_BASIS.LEGACY_UNVERIFIED);
    expect(b.confidence).toBe("UNKNOWN");
    expect(b.reproducible).toBe(false);
  });

  it("mixed conventions are explicit, not silent", () => {
    const counts = {};
    for (const p of PLAYERS) counts[statBasisFor(p.id).basis] = (counts[statBasisFor(p.id).basis] || 0) + 1;
    // more than one basis genuinely exists in the pool
    expect(Object.keys(counts).length).toBeGreaterThan(2);
    expect(counts[STAT_BASIS.DECADE_SEASON_AVERAGE]).toBeGreaterThan(0);
    expect(counts[STAT_BASIS.REPRESENTATIVE_PRIME]).toBeGreaterThan(0);
    expect(counts[STAT_BASIS.LEGACY_UNVERIFIED]).toBeGreaterThan(0);
    // and only the reproducible bases are marked reproducible
    for (const p of PLAYERS) {
      const b = statBasisFor(p.id);
      const shouldBe = b.basis === STAT_BASIS.DECADE_SEASON_AVERAGE || b.basis === STAT_BASIS.SINGLE_SEASON;
      expect(b.reproducible, p.id).toBe(shouldBe);
    }
  });

  it("the newly verified cards follow the rigorous convention", () => {
    for (const id of ["eaton-80s", "mullin-90s", "petrovic-90s", "prince-00s", "finley-00s",
                      "joshsmith-00s", "gwallace-00s", "walt-b-70s", "nance-90s", "russell-50s"]) {
      expect(statBasisFor(id).basis, id).toBe(STAT_BASIS.DECADE_SEASON_AVERAGE);
      expect(statBasisFor(id).reproducible, id).toBe(true);
    }
  });

  it("every basis group is documented", () => {
    for (const [group, g] of Object.entries(BASIS_GROUPS)) {
      expect(g.basis, group).toBeTruthy();
      expect(g.confidence, group).toBeTruthy();
      expect(g.note, group).toBeTruthy();
    }
  });
});

describe("Larry Nance — verified accolade correction", () => {
  it("the 1988-89 All-Defensive First Team is recorded on the 1980s card", () => {
    const n = card("nance-80s");
    expect(n.ad1).toBe(1);
    expect(n.decade).toBe("1980s");
  });

  it("his 1990s All-Defensive Second Teams sit on the 1990s card, not the 1980s one", () => {
    // 1992 and 1993 awards = the 1991-92 and 1992-93 seasons = 1990s by start year
    expect(card("nance-80s").ad2).toBe(0);
    expect(card("nance-90s").ad2).toBe(2);
    expect(card("nance-90s").ad1).toBe(0);
  });

  it("the correction moves his rating and the rating system stays coherent", () => {
    const n = card("nance-80s");
    const uncorrected = { ...n, ad1: 0 };
    expect(rawRating(n)).toBeGreaterThan(rawRating(uncorrected));
    const ovr = displayOVR(n, "PF");
    expect(ovr).toBeGreaterThan(0);
    expect(ovr).toBeLessThanOrEqual(99);
    expect(Number.isFinite(ovr)).toBe(true);
  });

  it("both Nance cards are one person and cannot share a lineup", () => {
    expect(personIdForCard("nance-80s")).toBe("larry-nance");
    expect(personIdForCard("nance-90s")).toBe("larry-nance");
    expect(findDuplicatePerson(["nance-80s", "nance-90s", "pippen-90s", "rodman-90s", "kukoc-90s"])).toBe("larry-nance");
  });
});

describe("Phase 2B did not break the intelligence layer", () => {
  it("every card still produces a valid profile", () => {
    const all = allIntelligence();
    expect(all.length).toBe(PLAYERS.length);
    expect(all.filter((p) => !validateIntelligence(p).valid)).toEqual([]);
  });

  it("the human-review set grew and every override is attributed", () => {
    const all = allIntelligence();
    const reviewed = all.filter((p) => p.provenance.humanReviewed);
    expect(reviewed.length).toBeGreaterThanOrEqual(30);
    for (const p of reviewed) {
      expect(p.provenance.curatorNote, p.id).toBeTruthy();
      expect(p.provenance.curatedFields.length, p.id).toBeGreaterThan(0);
    }
  });

  it("the pre-1974 event-creation artefact is corrected where it mattered", () => {
    // blocks were unrecorded before 1973-74, so the derivation returned 0.0 for
    // the greatest shot-blocker in the sport's history
    expect(intelligenceFor("bill-60s").defense.eventCreation).toBeGreaterThanOrEqual(9);
    expect(intelligenceFor("wilt-60s").defense.eventCreation).toBeGreaterThanOrEqual(8);
    // and the confidence for those profiles still reflects human review
    expect(intelligenceFor("bill-60s").provenance.humanReviewed).toBe(true);
  });

  it("roleScalability is a mechanical measure, defined without personality language", () => {
    const def = ATTRIBUTE_DEFINITIONS.roleScalability.means;
    expect(def).toMatch(/touches/i);
    expect(def).toMatch(/value/i);
    for (const word of ["ego", "selfish", "refuses", "attitude", "willing", "accept"]) {
      expect(def.toLowerCase(), `definition must not use "${word}"`).not.toContain(word);
    }
  });
});
