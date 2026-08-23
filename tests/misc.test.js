import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAYERS, POSITIONS } from "../src/players.js";
import { PLAYER_ATTRS, ARCHETYPES, getAttrs, teamAttributeProfile, attributeInsights } from "../src/attributes.js";
import { encodeChallenge, decodeChallenge } from "../src/challengeClient.js";
import { genPlayer, genRoster, todayKey } from "../src/draft.js";
import { mulberry32 } from "../src/engine.js";
import { computeDailyStreak } from "../src/career.js";
import { track, _setTestSink } from "../src/analytics.js";

const byId = (id) => PLAYERS.find((p) => p.id === id);

describe("attribute layer (chemistry v2.5)", () => {
  it("every curated entry maps to a real player id with valid values", () => {
    for (const [id, a] of Object.entries(PLAYER_ATTRS)) {
      expect(byId(id), `unknown id ${id}`).toBeTruthy();
      expect(a.basis).toBe("curated");
      expect(a.arch.length).toBeGreaterThan(0);
      for (const arch of a.arch) expect(ARCHETYPES, `${id}: ${arch}`).toContain(arch);
      for (const k of ["shotCreation", "outsideGravity", "rimPressure", "playmaking", "offBall", "poaDef", "interiorDef", "rimProt", "rebounding", "switchability", "usage", "ballDom", "pace"]) {
        expect(a[k], `${id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(a[k], `${id}.${k}`).toBeLessThanOrEqual(10);
      }
      expect(["rim", "mid", "three", "post", "balanced"]).toContain(a.shotProfile);
    }
  });
  it("separates Curry from Ray Allen and Shaq from Jokic", () => {
    const curry = getAttrs("curry-10s"), allen = getAttrs("ray-00s");
    expect(curry.shotCreation).toBeGreaterThan(allen.shotCreation);
    expect(allen.offBall).toBeGreaterThanOrEqual(curry.offBall);
    expect(curry.ballDom).toBeGreaterThan(allen.ballDom);
    const shaq = getAttrs("shaq-00s"), jokic = getAttrs("jokic-20s");
    expect(jokic.playmaking).toBeGreaterThan(shaq.playmaking + 4);
    expect(shaq.rimPressure).toBeGreaterThan(jokic.rimPressure);
    const rodman = getAttrs("rodman-90s"), draymond = getAttrs("draymond-10s");
    expect(draymond.playmaking).toBeGreaterThan(rodman.playmaking + 4);
  });
  it("stays silent (no insights) without full lineup coverage", () => {
    const partial = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "jack-80s"].map(byId); // Sikma not curated
    const ins = attributeInsights(partial);
    expect(ins.bonuses.length).toBe(0);
    expect(ins.gaps.length).toBe(0);
    expect(ins.profile.full).toBe(false);
  });
  it("reports elite spacing for a full-coverage shooting lineup", () => {
    const spacing = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"].map(byId);
    const ins = attributeInsights(spacing);
    expect(ins.profile.full).toBe(true);
    expect(ins.bonuses.some((b) => b.label === "Elite spacing")).toBe(true);
  });
});

describe("challenge link codec (legacy compatibility)", () => {
  it("round-trips a team + record", () => {
    const team = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"].map(byId);
    const code = encodeChallenge(team, "72-10");
    const dec = decodeChallenge(code);
    expect(dec.team.map((p) => p.id)).toEqual(team.map((p) => p.id));
    expect(dec.record).toBe("72-10");
  });
  it("returns null for tampered or garbage codes", () => {
    expect(decodeChallenge("not-base64!!")).toBeNull();
    expect(decodeChallenge(btoa("fake-1,fake-2|X"))).toBeNull();
    expect(decodeChallenge(btoa("magic-80s|X"))).toBeNull(); // wrong team size
  });
});

describe("draft generation", () => {
  it("respects slot position and era filters", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 20; i++) {
      const p = genPlayer("C", rng, { eliteN: 12 });
      expect(p.positions).toContain("C");
      const q = genPlayer("PG", rng, { era: "1990s", eliteN: 10 });
      expect(q.decade === "1990s" || q.positions.includes("PG")).toBe(true);
    }
  });
  it("generates a full 5-man roster in slot order", () => {
    const roster = genRoster(mulberry32(9));
    expect(roster.length).toBe(5);
    roster.forEach((p, i) => expect(p.positions).toContain(POSITIONS[i]));
  });
  it("daily seed key is a stable yyyymmdd string", () => {
    expect(todayKey()).toMatch(/^\d{8}$/);
  });
  it("seeded rng is deterministic", () => {
    const a = mulberry32(123), b = mulberry32(123);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});

describe("daily streaks (UTC days)", () => {
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d, 12)); // midday UTC avoids boundary ambiguity
  const key = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  it("counts consecutive days back from today", () => {
    const now = utc(2026, 7, 23);
    const daily = {};
    for (let i = 0; i < 4; i++) daily[key(utc(2026, 7, 23 - i))] = { won: true };
    expect(computeDailyStreak(daily, now)).toBe(4);
  });
  it("a gap breaks the streak; an unplayed today falls back to yesterday", () => {
    const now = utc(2026, 7, 23);
    const daily = { [key(utc(2026, 7, 22))]: { won: false }, [key(utc(2026, 7, 21))]: { won: true }, [key(utc(2026, 7, 19))]: { won: true } };
    expect(computeDailyStreak(daily, now)).toBe(2); // 22nd + 21st; 19th cut off by gap
    expect(computeDailyStreak({}, now)).toBe(0);
  });
});

describe("analytics wrapper", () => {
  const events = [];
  beforeEach(() => { events.length = 0; _setTestSink((e) => events.push(e)); });
  it("stamps every event with uid, session, timestamp, and app version", () => {
    track("draft_started", { mode: "single" });
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e.event).toBe("draft_started");
    expect(e.mode).toBe("single");
    expect(typeof e.uid).toBe("string");
    expect(typeof e.session_id).toBe("string");
    expect(typeof e.ts).toBe("number");
    expect(e.app_version).toBeTruthy();
  });
});
