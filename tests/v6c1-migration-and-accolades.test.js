// ── Phase 6C1 Workstream 1: card-id migration and accolade corrections ───────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLAYERS, findCard, cardExists } from "../src/players.js";
import { CARD_ID_ALIASES, RESERVED_CARD_IDS, resolveCardId, aliasesFor, isAlias } from "../src/v3/data/cardAliases.js";
import { personIdForCard, cardsForPerson, PERSON_INDEX, ALL_PERSON_IDS } from "../src/v3/data/persons.js";
import { findDuplicatePerson } from "../src/v3/persons.js";
import { matchupFingerprint, canonicalMatchup } from "../src/v3/fingerprint.js";
import { rawRating, displayOVR } from "../src/rating.js";
import { buildIntelligence } from "../src/v3/intelligence.js";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { diffBaseline, captureBaseline, loadBaseline } from "../scripts/calibration/freeze-baseline.mjs";
import { validateTeamIds } from "../api/_lib/validate.js";

const OLD = "luol-70s";
const NEW = "curtis-perry-70s";

// ── card-id migration ───────────────────────────────────────────────────────
describe("card-id migration", () => {
  it("the canonical id exists and the old id no longer does as a card", () => {
    expect(PLAYERS.some((p) => p.id === NEW)).toBe(true);
    expect(PLAYERS.some((p) => p.id === OLD), "the retired id must not remain a card").toBe(false);
  });

  it("both ids resolve to the same card", () => {
    expect(findCard(NEW)).toBeTruthy();
    expect(findCard(OLD), "a retired id must still resolve").toBeTruthy();
    expect(findCard(OLD)).toBe(findCard(NEW));
    expect(findCard(OLD).name).toBe("Curtis Perry");
    expect(cardExists(OLD)).toBe(true);
  });

  it("the alias table is one-way and the old id is reserved", () => {
    expect(resolveCardId(OLD)).toBe(NEW);
    expect(resolveCardId(NEW), "canonical must not resolve backwards").toBe(NEW);
    expect(isAlias(OLD)).toBe(true);
    expect(isAlias(NEW)).toBe(false);
    expect(aliasesFor(NEW)).toEqual([OLD]);
    expect(RESERVED_CARD_IDS[OLD], "the id must be reserved against reassignment").toBeTruthy();
  });

  it("unknown ids pass through unchanged rather than throwing", () => {
    expect(resolveCardId("nope-99s")).toBe("nope-99s");
    expect(findCard("nope-99s")).toBeNull();
    expect(cardExists("nope-99s")).toBe(false);
  });

  it("no duplicate Curtis Perry identity was created", () => {
    expect(personIdForCard(NEW)).toBe("curtis-perry");
    expect(cardsForPerson("curtis-perry")).toEqual([NEW]);
    expect(PERSON_INDEX.get("curtis-perry").cardIds).toEqual([NEW]);
    expect(ALL_PERSON_IDS.filter((x) => x === "curtis-perry")).toHaveLength(1);
    // Person count is unchanged by a rename.
    expect(ALL_PERSON_IDS).toHaveLength(323);
  });

  it("Luol Deng remains a separate future identity", () => {
    expect(PLAYERS.some((p) => /luol|deng/i.test(p.name)), "no Luol Deng card exists yet").toBe(false);
    expect(ALL_PERSON_IDS).not.toContain("luol-deng");
    // And if one is added later it must NOT take the retired id.
    expect(RESERVED_CARD_IDS[OLD]).toMatch(/never reassign/i);
  });

  it("server-side validation accepts a stored lineup containing the retired id", () => {
    const withOld = ["magic-80s", "jordan-90s", "bird-80s", OLD, "hak-90s"];
    const withNew = ["magic-80s", "jordan-90s", "bird-80s", NEW, "hak-90s"];
    const oldResult = validateTeamIds(withOld);
    const newResult = validateTeamIds(withNew);
    // Both must resolve to five real cards. An old challenge link or stored
    // result containing the retired id must not be rejected server-side.
    expect(oldResult, `old ids rejected: ${JSON.stringify(oldResult)}`).toBeTruthy();
    expect(newResult).toBeTruthy();
    const names = (r) => (Array.isArray(r) ? r : r.players ?? r.team ?? []).map((p) => p?.name);
    expect(names(oldResult)).toEqual(names(newResult));
  });

  it("duplicate-person protection still works across the alias", () => {
    // The same person twice on one team must still be rejected, whichever id
    // form is used — otherwise the alias would be a hole in the rule.
    expect(findDuplicatePerson(["magic-80s", "jordan-90s", "bird-80s", OLD, "hak-90s"])).toBeFalsy();
    const twoOscars = ["oscar-60s", "oscar-70s", "bird-80s", NEW, "hak-90s"];
    expect(findDuplicatePerson(twoOscars), "two era-versions of one person must still be caught").toBeTruthy();
  });

  it("the fingerprint is identical for either id form", () => {
    const base = { blueIds: ["curry-10s", "klay-10s", "pippen-90s", "dirk-00s", "rob-90s"], eraId: "1970s", mode: "single" };
    const a = matchupFingerprint({ ...base, goldIds: ["magic-80s", "jordan-90s", "bird-80s", OLD, "hak-90s"] });
    const b = matchupFingerprint({ ...base, goldIds: ["magic-80s", "jordan-90s", "bird-80s", NEW, "hak-90s"] });
    expect(a).toBe(b);
    // ...because ids are canonicalised before hashing.
    expect(canonicalMatchup({ ...base, goldIds: ["magic-80s", "jordan-90s", "bird-80s", OLD, "hak-90s"] })).toContain(NEW);
  });

  it("an old lineup replays byte-identically and new results write the canonical id", () => {
    const mk = (id) => buildPossessionInput({
      goldIds: ["magic-80s", "jordan-90s", "bird-80s", id, "hak-90s"],
      blueIds: ["curry-10s", "klay-10s", "pippen-90s", "dirk-00s", "rob-90s"],
      eraStyleId: "1970s", simulationSeed: 4242, coachGoldId: "pat-riley", coachBlueId: "phil-jackson",
    });
    const withOld = runPossessionGame(mk(OLD), { assertInvariants: false });
    const withNew = runPossessionGame(mk(NEW), { assertInvariants: false });
    expect(JSON.stringify(withOld.gold)).toBe(JSON.stringify(withNew.gold));
    expect(JSON.stringify(withOld.possessionLedger)).toBe(JSON.stringify(withNew.possessionLedger));
    expect(withOld.fingerprint.matchupFingerprint).toBe(withNew.fingerprint.matchupFingerprint);
    // The stored box score carries the CANONICAL id, never the alias.
    expect(withOld.gold.players.map((p) => p.cardId)).toContain(NEW);
    expect(withOld.gold.players.map((p) => p.cardId)).not.toContain(OLD);
  });

  it("every alias target is a real card", () => {
    for (const [oldId, canonicalId] of Object.entries(CARD_ID_ALIASES)) {
      expect(PLAYERS.some((p) => p.id === canonicalId), `${oldId} -> ${canonicalId}`).toBe(true);
    }
  });

  it("the migration is documented", () => {
    const doc = readFileSync(new URL("../docs/simulation-v3/card-id-migrations.md", import.meta.url), "utf8");
    expect(doc).toContain(OLD);
    expect(doc).toContain(NEW);
    expect(doc).toMatch(/never reassign/i);
    expect(doc).toMatch(/one-way/i);
  });
});

// ── accolade corrections ────────────────────────────────────────────────────
describe("accolade corrections", () => {
  const card = (id) => PLAYERS.find((p) => p.id === id);

  it("Oscar Robertson has nine All-NBA First Teams, all in the 1960s", () => {
    // Verified against two independent award lists. All nine seasons
    // (1960-61 .. 1968-69) fall in the 1960s under the start-year convention.
    expect(card("oscar-60s").an1).toBe(9);
    expect(card("oscar-70s").an1).toBe(0);
  });

  it("Oscar Robertson has exactly two All-NBA Second Teams across both cards", () => {
    // 1969-70 is a 1960s season; 1970-71 is a 1970s season. The cards
    // previously carried FOUR between them.
    expect(card("oscar-60s").an2).toBe(1);
    expect(card("oscar-70s").an2).toBe(1);
    expect(card("oscar-60s").an2 + card("oscar-70s").an2).toBe(2);
  });

  it("Oscar Robertson has no All-Defensive selections", () => {
    expect(card("oscar-60s").ad1 + card("oscar-60s").ad2).toBe(0);
    expect(card("oscar-70s").ad1 + card("oscar-70s").ad2).toBe(0);
  });

  it("Wilt Chamberlain has two All-Defensive First Teams in the 1970s", () => {
    expect(card("wilt-70s").ad1).toBe(2);
  });

  it("ratings recalculate deterministically from the corrected values", () => {
    const o60 = card("oscar-60s");
    expect(rawRating(o60)).toBe(rawRating(o60));
    expect(displayOVR(o60, "PG")).toBe(displayOVR(o60, "PG"));
    // The correction raised the raw rating; the DISPLAY saturates near the top,
    // which is itself a calibration finding.
    expect(rawRating({ ...o60, an1: 9, an2: 1 })).toBeGreaterThan(rawRating({ ...o60, an1: 6, an2: 2 }));
    expect(displayOVR({ ...o60, an1: 9, an2: 1 }, "PG")).toBe(displayOVR({ ...o60, an1: 6, an2: 2 }, "PG"));
  });

  it("Player Intelligence still validates for the corrected cards", () => {
    for (const id of ["oscar-60s", "oscar-70s", "wilt-70s", NEW]) {
      const p = buildIntelligence(card(id), {});
      expect(p.roles.primary, id).toBeTruthy();
      expect(p.personId, id).toBeTruthy();
      expect(Number.isFinite(p.offense.selfCreation), id).toBe(true);
    }
  });

  it("Maurice Lucas stays blocked rather than being quietly verified", () => {
    const doc = readFileSync(new URL("../docs/simulation-v3/pre-recording-defense-research.md", import.meta.url), "utf8");
    expect(doc).toMatch(/lucas-m-70s/);
    expect(doc).toMatch(/[Bb]locked/);
    expect(PLAYERS.some((p) => p.id === "lucas-m-70s"), "the card must not be deleted").toBe(true);
  });

  it("the audit records sources and before/after values", () => {
    const doc = readFileSync(new URL("../docs/simulation-v3/calibration-player-accolade-audit.md", import.meta.url), "utf8");
    expect(doc).toMatch(/an1/);
    expect(doc).toMatch(/229\.5/);   // before
    expect(doc).toMatch(/252\.5/);   // after
    expect(doc).toMatch(/https?:\/\//);
  });
});

// ── baseline freeze ─────────────────────────────────────────────────────────
describe("baseline engine freeze", () => {
  it("the stored baseline exists and covers the required surface", () => {
    const b = loadBaseline();
    expect(b).toBeTruthy();
    expect(b.cases.length).toBeGreaterThanOrEqual(6);
    const ids = b.cases.map((c) => c.id);
    // man, zone, pre-three-point, an overtime case, and the flag-off path
    expect(ids.some((i) => /man/.test(i))).toBe(true);
    expect(ids.some((i) => /zone/.test(i))).toBe(true);
    expect(ids.some((i) => /pre-three/.test(i))).toBe(true);
    expect(ids.some((i) => /flag-off/.test(i))).toBe(true);
    expect(b.cases.some((c) => c.overtimes > 0), "an overtime case must be frozen").toBe(true);
    for (const c of b.cases) {
      expect(c.replayStable, `${c.id} replay`).toBe(true);
      expect(Object.keys(c.actionDistribution).length).toBeGreaterThan(0);
    }
    // It must state what it is NOT.
    expect(b.purpose).toMatch(/NOT a claim of historical correctness/i);
  });

  it("engine behaviour has not drifted during framework work", () => {
    // A deliberate, approved data correction MAY change a case — and each such
    // change must be reviewed and explained in the accolade audit. As of this
    // commit the corrections changed nothing, because displayOVR saturated.
    const d = diffBaseline(captureBaseline(), loadBaseline());
    expect(d.missing).toBe(false);
    expect(d.changed, `changed: ${JSON.stringify(d.changed)}`).toHaveLength(0);
  });
});
