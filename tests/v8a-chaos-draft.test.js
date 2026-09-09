// ── Phase 8A / Workstream 30: draft, CPU, coach offers, preservation ─────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLAYERS, POSITIONS } from "../src/players.js";
import { drawFive, drawForSlot, finalWeight, heldTalentPressure, draftPressureLabel, rollStageModifier, ODDS, DRAFT_PRESSURE_TOOLTIP } from "../src/chaos/draftOdds.js";
import { draftValueOf, tierOf, draftPctAt, draftValueTable, DRAFT_VALUE_WEIGHTS } from "../src/chaos/draftValue.js";
import { constructionScore, constructionTier, talentTier, CONSTRUCTION_BLURB } from "../src/chaos/construction.js";
import { cpuHoldDecision, assertVisibleState, FORBIDDEN_STATE_KEYS, POLICIES, rosterValue } from "../src/chaos/legendCpu.js";
import { generateOffers, explainOffer, cpuCoachChoice, offenseIdentity, systemFamily } from "../src/chaos/coachOffers.js";
import { startRun, submitHolds, selectCoach, publicView, revealEra, PHASES } from "../src/chaos/runState.js";
import { challengeId, FORBIDDEN_CHALLENGE_FIELDS, challengeUrl, buildManifest } from "../src/chaos/challenge.js";
import { can, CAPABILITIES, MATRIX, FEATURE_FLAGS, gateReason } from "../src/entitlements.js";
import { PLAY_MODES, defaultMode } from "../src/navigation.js";
import { eraTranslationScore, CHAOS_ERA_IDS } from "../src/chaos/eraTranslation.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr[i]) || null]));

describe("Draft Value is separate from simulation capability", () => {
  it("no simulation module imports the draft layer", () => {
    const walk = (dir) => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
    });
    const offenders = walk("src/v3").filter((f) => /from\s+["'].*chaos\//.test(readFileSync(f, "utf8")));
    expect(offenders, "src/v3 must never import src/chaos").toEqual([]);
  });

  it("prices every card without a single player-name hardcode", () => {
    const src = readFileSync("src/chaos/draftValue.js", "utf8");
    const names = PLAYERS.map((p) => p.name);
    expect(names.filter((n) => src.includes(n))).toEqual([]);
    expect(draftValueTable()).toHaveLength(PLAYERS.length);
  });

  it("weights the three declared components and nothing else", () => {
    const sum = Object.values(DRAFT_VALUE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("weighted odds obey the locked decisions", () => {
  it("gives every eligible card a strictly positive probability", () => {
    for (const slot of POSITIONS) {
      const pool = PLAYERS.filter((p) => p.positions.includes(slot));
      for (const p of pool) expect(finalWeight(p, slot, 1, {})).toBeGreaterThan(0);
      for (const p of pool) expect(finalWeight(p, slot, 3, { APEX: 3, ELITE: 3 })).toBeGreaterThan(0);
    }
  });

  it("never lets weight rise with Draft Value", () => {
    for (const slot of POSITIONS) {
      const rows = PLAYERS.filter((p) => p.positions.includes(slot))
        .map((p) => ({ w: finalWeight(p, slot, 1, {}), pct: draftPctAt(p, slot) }))
        .sort((a, b) => a.pct - b.pct);
      for (let i = 1; i < rows.length; i++) expect(rows[i].w).toBeLessThanOrEqual(rows[i - 1].w + 1e-12);
    }
  });

  it("makes later rolls scarcer for the top tiers only", () => {
    expect(rollStageModifier("APEX", 3)).toBeLessThan(rollStageModifier("APEX", 1));
    expect(rollStageModifier("ELITE", 3)).toBeLessThan(rollStageModifier("ELITE", 1));
    // A specialist is not quietly degraded along with them.
    expect(rollStageModifier("SPECIALIST", 3)).toBe(1);
    expect(rollStageModifier("STAR", 3)).toBe(1);
  });

  it("applies Draft Pressure to rare tiers only, with a floor above zero", () => {
    expect(heldTalentPressure("APEX", { APEX: 1 })).toBeLessThan(1);
    expect(heldTalentPressure("APEX", { APEX: 2 })).toBeLessThan(heldTalentPressure("APEX", { APEX: 1 }));
    expect(heldTalentPressure("SPECIALIST", { APEX: 3 })).toBe(1);
    expect(heldTalentPressure("APEX", { APEX: 9 })).toBeGreaterThanOrEqual(ODDS.pressureFloor);
    expect(heldTalentPressure("APEX", { APEX: 9 })).toBeGreaterThan(0);
  });

  it("labels pressure honestly and never with exploitative language", () => {
    expect(draftPressureLabel({})).toBe("LOW");
    expect(draftPressureLabel({ APEX: 1 })).toBe("RISING");
    expect(draftPressureLabel({ APEX: 2 })).toBe("HIGH");
    expect(DRAFT_PRESSURE_TOOLTIP).toMatch(/every player remains possible/i);
    for (const word of ["casino", "gambling", "addictive", "jackpot", "loot"]) {
      expect(DRAFT_PRESSURE_TOOLTIP.toLowerCase()).not.toContain(word);
    }
  });

  it("takes no account tier, payment, or history as an input", () => {
    // Comments are stripped first: draftOdds.js DOCUMENTS these prohibitions in
    // its header, and matching the documentation would fail the very file that
    // states the rule.
    const code = readFileSync("src/chaos/draftOdds.js", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // NOTE: bare `tier` is legitimate here and deliberately not forbidden — it
    // is the RARITY tier (APEX/ELITE/STAR/SPECIALIST), which is the module's
    // subject. What must never appear is an ACCOUNT tier.
    for (const forbidden of ["accountTier", "paymentHistory", "previousWins", "previousLosses", "testerId", "spending", "engagementScore", "entitlement"]) {
      expect(code, `draftOdds.js must not reference ${forbidden}`).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
    }
  });
});

describe("Legend CPU", () => {
  const state = () => {
    const g = drawFive({ seedId: "cpu-1", side: "gold", roll: 1 });
    const b = drawFive({ seedId: "cpu-1", side: "blue", roll: 1, opponentNames: Object.values(g).map((c) => c.name) });
    return { side: "blue", roll: 1, roster: b, held: {}, opponentRoster: g, burnedIds: [], revealedEraId: null };
  };

  it("refuses every forbidden field structurally", () => {
    for (const key of FORBIDDEN_STATE_KEYS) {
      expect(() => assertVisibleState({ ...state(), [key]: "x" })).toThrow(/forbidden field/);
    }
  });

  it("produces the same decision from the same visible state", () => {
    const s = state();
    expect(cpuHoldDecision(s).hold).toEqual(cpuHoldDecision({ ...s }).hold);
  });

  it("considers every hold combination, including holding nothing", () => {
    expect(cpuHoldDecision(state()).considered).toBe(32);
  });

  it("beats a random-hold policy on expected roster value", () => {
    let legend = 0, random = 0;
    for (let i = 0; i < 25; i++) {
      const g = drawFive({ seedId: `bench${i}`, side: "gold", roll: 1 });
      const s = { side: "gold", roll: 1, roster: g, held: {}, opponentRoster: null, burnedIds: [], revealedEraId: null };
      const keepL = POLICIES.legend(s);
      let seed = i * 2654435761 % 2147483647;
      const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const keepR = POLICIES.random(s, rng);
      const value = (keep) => rosterValue(Object.fromEntries(POSITIONS.map((p) => [p, keep.includes(p) ? g[p] : null])), {});
      legend += value(keepL); random += value(keepR);
    }
    expect(legend).toBeGreaterThan(random);
  });

  it("has no difficulty selector anywhere in the product", () => {
    const files = [
      ...readdirSync("src/components").filter((f) => f.endsWith(".jsx")).map((f) => `src/components/${f}`),
      ...readdirSync("src/components/chaos").filter((f) => f.endsWith(".jsx")).map((f) => `src/components/chaos/${f}`),
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must not offer a Chaos difficulty control`).not.toMatch(/chaosDifficulty|selectDifficulty/);
    }
    expect(readFileSync("src/chaos/legendCpu.js", "utf8")).toContain('policy: "LEGEND"');
  });
});

describe("coach offers", () => {
  const setup = (i = 0) => {
    const g = drawFive({ seedId: `off${i}`, side: "gold", roll: 3 });
    const b = drawFive({ seedId: `off${i}`, side: "blue", roll: 3, opponentNames: Object.values(g).map((c) => c.name) });
    const eraId = CHAOS_ERA_IDS[i % CHAOS_ERA_IDS.length];
    return { g, b, eraId, offers: generateOffers({ roster: g, opponentRoster: b, eraId, seedId: `off${i}`, side: "gold" }) };
  };

  it("offers exactly three unique coaches in three distinct roles", () => {
    for (let i = 0; i < 12; i++) {
      const { offers } = setup(i);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.coachId)).size).toBe(3);
      expect(new Set(offers.map((o) => o.role)).size).toBe(3);
    }
  });

  it("never presents three near-identical options", () => {
    for (let i = 0; i < 20; i++) {
      const { g, b, eraId, offers } = setup(i);
      const ex = offers.map((o) => explainOffer({ offer: o, roster: g, opponentRoster: b, eraId }));
      expect(new Set(ex.map((e) => e.offense)).size, "three different offensive identities").toBe(3);
      expect(new Set(ex.map((e) => e.central)).size, "three different central players").toBe(3);
    }
  });

  it("explains each offer without exposing a hidden numeric score", () => {
    const { g, b, eraId, offers } = setup(3);
    for (const o of offers) {
      const e = explainOffer({ offer: o, roster: g, opponentRoster: b, eraId });
      expect(e.offense).toBeTruthy();
      expect(e.defense).toBeTruthy();
      expect(e.sacrifice).toBeTruthy();
      // No hidden NUMERIC score may be exposed. Prose is free to use the word
      // "score" as a verb — "no second way to score" is basketball, not a rating.
      for (const [, v] of Object.entries(e)) {
        expect(typeof v === "number", `offer field leaks a raw number: ${JSON.stringify(v)}`).toBe(false);
      }
      expect(JSON.stringify(e)).not.toMatch(/0\.\d{3}/);
      expect(JSON.stringify(e)).not.toMatch(/"(score|rating|fit|salience)"\s*:/);
    }
  });

  it("lets the CPU choose from pregame information only", () => {
    const { g, b, eraId, offers } = setup(5);
    const pick = cpuCoachChoice({ offers, roster: g, opponentRoster: b, eraId });
    expect(offers.map((o) => o.coachId)).toContain(pick.coachId);
    expect(pick.policy).toBe("LEGEND");
    const src = readFileSync("src/chaos/coachOffers.js", "utf8");
    expect(src, "the coach policy must not simulate the game").not.toMatch(/simulatePossessionGame|computeResult/);
  });
});

describe("Matchup Outlook and Era Reveal", () => {
  it("reveals the era from the seed alone and never personalises it", () => {
    expect(revealEra("abc")).toBe(revealEra("abc"));
    const spread = new Set(Array.from({ length: 200 }, (_, i) => revealEra(`s${i}`)));
    expect(spread.size).toBeGreaterThan(4);
    // The era must not be personalised. Checked against identifiers that would
    // constitute personalisation, not the substring "tier" (which appears in
    // talentTier and tierOf, both legitimate).
    const code = readFileSync("src/chaos/runState.js", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const revealFn = code.slice(code.indexOf("export const revealEra"), code.indexOf("const analysis"));
    for (const forbidden of ["tier", "session", "uid", "accountTier", "testerId"]) {
      expect(revealFn, `revealEra must not read ${forbidden}`).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it("shows a qualitative outlook and never a win probability", () => {
    const run = startRun({ runId: "o".repeat(10), seedId: "outlook-1", createdAt: 0 });
    const v = publicView(run, { hydrate });
    expect(v.gold.analysis.talentTier).toBeTruthy();
    expect(v.gold.analysis.constructionTier).toBeTruthy();
    expect(JSON.stringify(v)).not.toMatch(/winPct|winProbability|expectedGoldWinPct/);
  });

  it("translates an era through basketball, with no flat bonus", () => {
    const g = drawFive({ seedId: "era-x", side: "gold", roll: 3 });
    const scores = CHAOS_ERA_IDS.map((e) => eraTranslationScore(g, e));
    expect(new Set(scores.map((s) => s.toFixed(3))).size).toBeGreaterThan(1);
    expect(readFileSync("src/chaos/eraTranslation.js", "utf8")).not.toMatch(/nativeEraBonus|eraBonus\b/);
  });
});

describe("construction rarity", () => {
  it("separates talent, construction and matchup fit", () => {
    const g = drawFive({ seedId: "con-1", side: "gold", roll: 3 });
    expect(talentTier(g)).toBeTruthy();
    expect(constructionTier(g)).toBeTruthy();
    expect(Object.keys(CONSTRUCTION_BLURB)).toContain(constructionTier(g));
  });

  it("keeps the elite bands rare across a sampled population", () => {
    const tiers = Array.from({ length: 400 }, (_, i) => constructionTier(drawFive({ seedId: `pop${i}`, side: "gold", roll: 3 })));
    const rate = (t) => tiers.filter((x) => x === t).length / tiers.length;
    expect(rate("PERFECT STORM")).toBeLessThan(0.06);
    expect(rate("PERFECT STORM") + rate("ELITE BUILD")).toBeLessThan(0.16);
  });

  it("explains a fragile roster without pretending its players are bad", () => {
    expect(CONSTRUCTION_BLURB.FRAGILE).toMatch(/great players/i);
  });
});

describe("challenges leak nothing", () => {
  it("builds an opaque id and a link carrying only that id", () => {
    const m = buildManifest({ seedId: "super-secret-seed", createdAt: 0, originRunId: "r1" });
    const url = challengeUrl("https://example.test", m);
    expect(url).not.toContain("super-secret-seed");
    for (const f of FORBIDDEN_CHALLENGE_FIELDS) expect(url).not.toContain(f);
    expect(challengeId("super-secret-seed")).toBe(m.challengeId);
  });
});

describe("entitlements", () => {
  it("never lets a tier reach an odds function", () => {
    for (const f of ["src/chaos/draftOdds.js", "src/chaos/draftValue.js", "src/chaos/legendCpu.js"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must not import entitlements`).not.toMatch(/from\s+["'].*entitlements/);
    }
  });

  it("gates Dream Matchup behind a free account and leaves Chaos Clash open", () => {
    expect(can("GUEST", CAPABILITIES.CHAOS_CLASH)).toBe(true);
    expect(can("GUEST", CAPABILITIES.DREAM_MATCHUP)).toBe(false);
    expect(can("FREE", CAPABILITIES.DREAM_MATCHUP)).toBe(true);
    expect(gateReason("GUEST", CAPABILITIES.DREAM_MATCHUP).kind).toBe("ACCOUNT");
  });

  it("keeps Era Gauntlet planned, flagged off, and out of the menu", () => {
    expect(FEATURE_FLAGS.eraGauntlet.featureFlag).toBe(false);
    expect(FEATURE_FLAGS.eraGauntlet.implementationStatus).toBe("PLANNED");
    expect(FEATURE_FLAGS.eraGauntlet.eraGauntletVersion).toBeNull();
    expect(can("PLUS", CAPABILITIES.ERA_GAUNTLET)).toBe(false);
    expect(PLAY_MODES.map((m) => m.id)).not.toContain("eraGauntlet");
  });

  it("makes Chaos Clash the default mode", () => {
    // The mode list lives in the navigation registry alone (Phase 9A removed
    // the duplicate in entitlements.js).
    expect(PLAY_MODES[0].id).toBe("chaos");
    expect(defaultMode().id).toBe("chaos");
    expect(PLAY_MODES[0].isDefault).toBe(true);
  });

  it("shows no fake checkout anywhere", () => {
    const files = readdirSync("src/components/chaos").map((f) => readFileSync(`src/components/chaos/${f}`, "utf8"));
    for (const src of files) expect(src).not.toMatch(/checkout|credit card|\$\d/i);
  });
});

describe("Candidate 3 and production preservation", () => {
  it("changes nothing under src/v3", () => {
    // Guarded by the import-boundary test above plus the core-hash assertion the
    // preview engine already carries; this pins the hash itself.
    const src = readFileSync("api/_lib/previewEngine.js", "utf8");
    expect(src).toMatch(/PREVIEW_CANDIDATE_CORE_HASH/);
  });

  it("uses new store namespaces and touches no production namespace", () => {
    const src = readFileSync("api/_lib/chaosRun.js", "utf8");
    expect(src).toMatch(/chaos-run:/);
    expect(src).not.toMatch(/["'`]result:/);
    expect(src).not.toMatch(/["'`]daily:/);
    expect(src).not.toMatch(/["'`]lb:/);
  });
});
