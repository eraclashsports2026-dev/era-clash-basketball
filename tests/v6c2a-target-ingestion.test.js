import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { loadStore, storeHash, TARGET_STORE } from "../scripts/calibration/import-targets.mjs";
import {
  validateTargetRecord, validateProvenance, validateShares, validateValue, coverageOf,
  notRecordedInEra, SOURCE_TYPES, AVAILABILITY, TEAM_TARGET_FIELDS,
} from "../src/v3/calibration/targetSchema.js";
import { parsePlayerTable, parseRecord, USER_AGENT, LICENSE_NOTE } from "../scripts/calibration/adapters/wikipedia.mjs";
import { FIXTURES } from "../data/calibration/fixtures.mjs";
import { CALIBRATION_FIXTURE_IDS, HOLDOUT_FIXTURE_IDS } from "../data/calibration/split.mjs";
import { FIXTURE_SOURCES, unmappedFixtures, byBasis } from "../data/calibration/sourceMap.mjs";
import { cacheKeys, namespaceOf } from "../api/_lib/cacheKeys.js";
import { versionOf, statusOf, VERSION_STATUS, REGISTRY } from "../src/versions.js";
import { PLAYERS } from "../src/players.js";

const store = loadStore();
const ids = FIXTURES.map((f) => f.fixtureId);

describe("target store integrity", () => {
  it("exists and covers every fixture exactly once", () => {
    expect(existsSync(TARGET_STORE)).toBe(true);
    expect(store.targets).toHaveLength(FIXTURES.length);
    expect(new Set(store.targets.map((r) => r.fixtureId)).size).toBe(FIXTURES.length);
    for (const id of ids) expect(store.targets.find((r) => r.fixtureId === id), `${id} has no target record`).toBeTruthy();
  });

  it("validates against the schema with zero errors", () => {
    const errs = store.targets.flatMap((r) => validateTargetRecord(r, { fixtureIds: ids }));
    expect(errs, errs.slice(0, 10).join("\n")).toEqual([]);
  });

  it("gives every populated value provenance", () => {
    // A number with no provenance is indistinguishable from a number someone
    // remembered. That is the single rule the store exists to enforce.
    for (const r of store.targets) {
      for (const [m, e] of Object.entries(r.teamTargets)) {
        if (e.value == null) continue;
        expect(validateProvenance(e.provenance, `${r.fixtureId}.${m}`)).toEqual([]);
        expect(e.provenance.sourceUrl ?? e.provenance.sourceFile, `${r.fixtureId}.${m} has no traceable source`).toBeTruthy();
        expect(e.provenance.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      if (r.unitTargets) expect(validateProvenance(r.unitTargets.provenance, `${r.fixtureId}.unitTargets`)).toEqual([]);
    }
  });

  it("never turns a missing metric into zero", () => {
    // The failure this prevents: a blocked metric silently reading as 0 and
    // being scored as a real value the engine missed by its whole magnitude.
    for (const r of store.targets) {
      for (const [m, e] of Object.entries(r.teamTargets)) {
        if (e.value != null) continue;
        expect(e.value, `${r.fixtureId}.${m} must be null, not ${e.value}`).toBeNull();
        expect(e.availability, `${r.fixtureId}.${m} has no reason for being missing`).toBeTruthy();
        expect(Object.keys(AVAILABILITY)).toContain(e.availability);
      }
    }
  });

  it("distinguishes WHY a metric is missing rather than collapsing the reasons", () => {
    // "Licence forbids it", "no access path", "did not exist then" and "this
    // lineup never played" are four different facts. Collapsing them would make
    // a licensing problem look like history.
    const reasons = new Set(store.targets.flatMap((r) => Object.values(r.teamTargets).filter((e) => e.value == null).map((e) => e.availability)));
    expect(reasons.size, "every absence has the same reason — the distinction was lost").toBeGreaterThan(1);
    expect(reasons).toContain("NOT_APPLICABLE_SYNTHETIC_LINEUP");
    expect(reasons).toContain("SOURCE_BLOCKED_LICENSING");
  });

  it("marks pre-recording metrics NOT_RECORDED_IN_ERA, not blocked", () => {
    // Steals and blocks were not recorded before 1973-74 and threes did not
    // exist before 1979-80. Those are facts about history, not access.
    expect(notRecordedInEra("steals", "1960s")).toBe(true);
    expect(notRecordedInEra("threePointAttempts", "1960s")).toBe(true);
    expect(notRecordedInEra("steals", "1980s")).toBe(false);
    expect(notRecordedInEra("pace", "1950s"), "pace is derivable in any era").toBe(false);
    for (const r of store.targets.filter((x) => ["1950s", "1960s"].includes(FIXTURES.find((f) => f.fixtureId === x.fixtureId).eraStyleId))) {
      expect(r.teamTargets.steals.availability).toBe("NOT_RECORDED_IN_ERA");
      expect(r.teamTargets.threePointAttempts.availability).toBe("NOT_RECORDED_IN_ERA");
    }
  });

  it("keeps shares a real distribution", () => {
    for (const r of store.targets) {
      if (!r.unitTargets) continue;
      for (const f of ["playerScoringShares", "playerReboundShares", "playerAssistShares"]) {
        const s = r.unitTargets[f];
        if (!s) continue;
        expect(validateShares(s, `${r.fixtureId}.${f}`)).toEqual([]);
        expect(Object.keys(s), `${r.fixtureId}.${f} must cover all five`).toHaveLength(5);
      }
    }
  });

  it("labels a proxy as a proxy and never as a measurement", () => {
    for (const r of store.targets) {
      if (!r.unitTargets) continue;
      expect(r.unitTargets.selectedFiveOnly).toBe(true);
      expect(r.unitTargets.availability).toBe("SELECTED_FIVE_SEASON_SHARE_PROXY");
      expect(r.unitTargets.availability).not.toBe("ACTUAL_LINEUP_MEASUREMENT");
      // Shot-attempt share is not derivable from published per-game scoring,
      // and claiming it would be inventing the quantity this phase is about.
      expect(r.unitTargets.playerOpportunityShares).toBeNull();
      expect(r.unitTargets.opportunityShareNote).toMatch(/not derivable/);
    }
  });

  it("records measured lineup fidelity rather than trusting the fixture's own label", () => {
    // Measuring it showed only one fixture in the corpus is genuinely the
    // documented starting five of its named season.
    const checked = store.targets.filter((r) => r.seasonCrossCheck);
    expect(checked.length).toBeGreaterThan(10);
    for (const r of checked) {
      expect(r.seasonCrossCheck.lineupFidelity).toBeGreaterThanOrEqual(0);
      expect(r.seasonCrossCheck.lineupFidelity).toBeLessThanOrEqual(1);
      expect(r.seasonCrossCheck.matchedCount + r.seasonCrossCheck.unmatchedPlayers.length).toBe(r.seasonCrossCheck.rosterSize);
      // A partial unit must NOT produce season shares — normalising two matched
      // players to 100% would invent a two-man team.
      if (r.seasonCrossCheck.matchedCount < r.seasonCrossCheck.rosterSize) {
        expect(r.seasonCrossCheck.fullUnitShares, `${r.fixtureId}: partial unit produced shares`).toBeNull();
      }
    }
  });
});

describe("source authorization", () => {
  it("uses only authorized sources and says why each is allowed", () => {
    const types = new Set(store.targets.flatMap((r) =>
      [...Object.values(r.teamTargets).map((e) => e.provenance?.sourceType), r.unitTargets?.provenance?.sourceType]).filter(Boolean));
    for (const t of types) expect(Object.keys(SOURCE_TYPES)).toContain(t);
    expect([...types].every((t) => ["AUTHORIZED_PUBLIC_API", "IN_REPO_VERIFIED", "OFFICIAL_PUBLIC_SOURCE", "LICENSED_EXPORT", "MANUAL_VERIFIED_IMPORT", "DERIVED_FROM_SOURCED_TOTALS"].includes(t))).toBe(true);
    expect(store.authorizedSources.length).toBeGreaterThan(0);
    for (const s of store.authorizedSources) expect(s.license).toBeTruthy();
  });

  it("records the excluded sources and the real reason for each", () => {
    // The Phase 6C1 report blamed HTTP 403. That was a fetch-tool artifact; the
    // actual barrier is a licence term, which is a different problem with a
    // different remedy. Recording the wrong reason would send the next phase
    // hunting for a technical workaround that must not be built.
    const br = store.excludedSources.find((s) => /basketball-reference|Sports Reference/i.test(s.name));
    expect(br, "the excluded source must be recorded, not silently omitted").toBeTruthy();
    expect(br.excluded).toBe(true);
    expect(br.reachable, "honest: it IS reachable — the block is licensing, not access").toBe(true);
    expect(br.reason).toMatch(/artificial intelligence|training|licen/i);
    expect(br.remedy).toMatch(/LICEN|permission/i);
  });

  it("identifies itself honestly and never as a browser", () => {
    expect(USER_AGENT).toMatch(/EraClash/);
    expect(USER_AGENT).toMatch(/contact:/);
    expect(USER_AGENT, "spoofing a browser misrepresents affiliation").not.toMatch(/Mozilla|Chrome|Safari|Gecko/);
    expect(LICENSE_NOTE).toMatch(/CC BY-SA/);
  });

  it("commits no third-party page content", () => {
    // Only structured facts belong in the repository. Raw pages live under
    // .cache/, which is git-ignored.
    const raw = readFileSync(TARGET_STORE, "utf8");
    expect(raw).not.toMatch(/<table|<\/tr>|<!DOCTYPE|<div /i);
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.cache\/$/m);
  });

  it("maps every fixture to a season basis, including the ones with none", () => {
    expect(unmappedFixtures()).toEqual([]);
    const b = byBasis();
    expect(b.REAL_TEAM_SEASON.length + b.APPROX_TEAM_SEASON.length + b.SYNTHETIC_LINEUP.length).toBe(FIXTURES.length);
    // A synthetic lineup must say WHY no season applies.
    for (const id of b.SYNTHETIC_LINEUP) expect(FIXTURE_SOURCES[id].why, `${id} gives no reason`).toBeTruthy();
  });
});

describe("wikipedia adapter parsing", () => {
  const html = (rows) => `<table class="wikitable">${rows}</table>`;
  const tr = (cells, tag = "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;

  it("normalises season totals to per game", () => {
    // Larry Bird's 1985-86 line is published as totals (PTS 2115). Read as a
    // scoring average it would have corrupted every share it fed.
    const t = html(
      tr(["Player", "GP", "REB", "AST", "STL", "BLK", "PTS", "AVG"], "th") +
      ["Larry Bird|82|805|557|166|51|2115|25.8", "Kevin McHale|68|551|181|29|134|1359|21.3",
       "Robert Parish|81|770|145|79|116|1235|16.1", "Dennis Johnson|78|168|456|110|35|1213|15.6",
       "Danny Ainge|80|186|405|105|9|818|10.7", "Bill Walton|80|544|165|38|106|606|7.6"]
        .map((r) => tr(r.split("|"))).join(""));
    const p = parsePlayerTable(t);
    expect(p).toBeTruthy();
    expect(p.players[0].ppg).toBeCloseTo(25.8, 1);
    expect(p.players[0].rpg, "805 rebounds over 82 games").toBeCloseTo(9.8, 1);
    expect(p.players[0].apg).toBeCloseTo(6.8, 1);
  });

  it("detects totals PER COLUMN, so a mixed table is not misread", () => {
    // The 1986-87 Lakers article publishes scoring per game and rebounds as a
    // season total in the SAME table. A whole-table verdict reported Magic
    // Johnson with 504 rebounds per game.
    const t = html(
      tr(["Player", "GP", "MPG", "REB", "APG", "PPG"], "th") +
      ["Magic Johnson|80|36.3|504|12.2|23.9", "James Worthy|82|34.0|466|2.8|19.4",
       "Byron Scott|82|34.4|286|3.4|17.0", "Kareem Abdul-Jabbar|78|31.3|523|2.6|17.5",
       "A.C. Green|79|27.1|615|1.1|10.8", "Michael Cooper|82|28.1|322|4.5|10.5"]
        .map((r) => tr(r.split("|"))).join(""));
    const p = parsePlayerTable(t);
    expect(p.scope).toBe("MIXED_TOTALS_AND_PER_GAME");
    const magic = p.players.find((x) => x.name === "Magic Johnson");
    expect(magic.ppg).toBeCloseTo(23.9, 1);
    expect(magic.rpg, "504 rebounds over 80 games, not 504 per game").toBeCloseTo(6.3, 1);
    expect(magic.apg).toBeCloseTo(12.2, 1);
  });

  it("normalises percentages written either way", () => {
    // Older articles write ".433"; newer ones write "50.4". Both must land in
    // the same units or a shooting comparison is meaningless.
    const mk = (fg) => html(
      tr(["Player", "GP", "FG%", "RPG", "APG", "PPG"], "th") +
      Array.from({ length: 6 }, (_, i) => tr([`P${i}`, "82", fg, "5.0", "5.0", "20.0"])).join(""));
    expect(parsePlayerTable(mk("50.4")).players[0].fgPct).toBeCloseTo(0.504, 3);
    expect(parsePlayerTable(mk(".433")).players[0].fgPct).toBeCloseTo(0.433, 3);
  });

  it("rejects a roster or draft table that merely has a Player column", () => {
    const roster = html(
      tr(["Pos.", "No.", "Player", "Height", "Weight", "DOB", "From"], "th") +
      Array.from({ length: 6 }, (_, i) => tr(["SG", "44", `P${i}`, "6 ft 5 in", "175 lb", "1959-03-17", "BYU"])).join(""));
    expect(parsePlayerTable(roster), "a roster table is not a statistics table").toBeNull();
  });

  it("returns null rather than guessing when no statistics table exists", () => {
    // The 1982-83 76ers article genuinely has none. Absence is reported.
    expect(parsePlayerTable("<p>no tables here</p>")).toBeNull();
    expect(parseRecord("<p>nothing</p>")).toBeNull();
  });
});

describe("target versioning and cache identity", () => {
  it("registers the target domains as DEVELOPMENT and result-neutral", () => {
    for (const d of ["historicalTargetSchemaVersion", "historicalTargetDataVersion"]) {
      expect(statusOf(d), d).toBe(VERSION_STATUS.DEVELOPMENT);
      expect(versionOf(d), d).toBeTruthy();
      // A target is what the engine is measured AGAINST, never an input to it.
      expect(REGISTRY[d].affectsResult, `${d} must not affect a game result`).toBe(false);
    }
  });

  it("keys calibration output by target data version, so a target edit invalidates a report", () => {
    const base = { set: "calibration", manifestHash: "a".repeat(64), scenario: "baseline", seedCount: 100 };
    const k = cacheKeys.calibrationRun({ ...base, targetDataVersion: versionOf("historicalTargetDataVersion") });
    expect(namespaceOf(k)).toBe("dev-calibration");
  });

  it("does not let a target version reach a game-result fingerprint", () => {
    // If it did, adding a historical target would change stored game identities
    // — measuring something must never alter it.
    const key = cacheKeys.possessionResult({ matchupFingerprint: "abc123", simulationSeed: 7 });
    expect(key).not.toMatch(/ht\d|targetData/);
  });

  it("has a stable content hash", () => {
    expect(storeHash(store)).toMatch(/^[0-9a-f]{64}$/);
    expect(storeHash(store)).toBe(storeHash(loadStore()));
  });
});

describe("calibration and holdout stay disjoint", () => {
  it("assigns every target record to exactly one set", () => {
    for (const r of store.targets) {
      expect(["calibration", "holdout"]).toContain(r.set);
      const inHoldout = HOLDOUT_FIXTURE_IDS.includes(r.fixtureId);
      expect(r.set).toBe(inHoldout ? "holdout" : "calibration");
    }
    expect(store.targets.filter((r) => r.set === "calibration")).toHaveLength(CALIBRATION_FIXTURE_IDS.length);
    expect(store.targets.filter((r) => r.set === "holdout")).toHaveLength(HOLDOUT_FIXTURE_IDS.length);
  });

  it("carries no simulated value or engine comparison anywhere in the store", () => {
    // Target enrichment must never have run the engine. If it had, a holdout
    // comparison could have leaked into a file that looks like source data.
    const raw = readFileSync(TARGET_STORE, "utf8");
    for (const forbidden of ["simulated", "simulatedMean", "absoluteError", "winRate", "possessionEngineVersion"]) {
      expect(raw, `the target store must not contain "${forbidden}"`).not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("enriched holdout targets without changing holdout membership", () => {
    const holdout = store.targets.filter((r) => r.set === "holdout").map((r) => r.fixtureId).sort();
    expect(holdout).toEqual([...HOLDOUT_FIXTURE_IDS].sort());
  });
});

describe("value sanity checks reject bad imports", () => {
  it("rejects impossible percentages and out-of-range values", () => {
    expect(validateValue("fieldGoalPct", 1.4, "x")).not.toEqual([]);
    expect(validateValue("pace", 400, "x")).not.toEqual([]);
    expect(validateValue("wins", -1, "x")).not.toEqual([]);
    expect(validateValue("fieldGoalPct", 0.485, "x")).toEqual([]);
    expect(validateValue("pace", null, "x"), "null is always acceptable").toEqual([]);
  });

  it("rejects shares that do not sum to one", () => {
    expect(validateShares({ a: 0.5, b: 0.2 }, "x")).not.toEqual([]);
    expect(validateShares({ a: -0.1, b: 1.1 }, "x")).not.toEqual([]);
    expect(validateShares({ a: 0.5, b: 0.5 }, "x")).toEqual([]);
  });

  it("rejects a record whose fixtureId does not resolve", () => {
    expect(validateTargetRecord({ fixtureId: "not-a-fixture", targetDataVersion: "1.0.0" }, { fixtureIds: ids })).not.toEqual([]);
  });

  it("rejects a value that arrives without provenance", () => {
    const bad = {
      fixtureId: ids[0], targetDataVersion: "1.0.0",
      teamTargets: { wins: { value: 60, availability: "RECORDED_STATISTIC", provenance: null } },
    };
    expect(validateTargetRecord(bad, { fixtureIds: ids }).some((e) => /provenance/.test(e))).toBe(true);
  });

  it("rejects a derived value with no formula", () => {
    const bad = {
      fixtureId: ids[0], targetDataVersion: "1.0.0",
      teamTargets: { pace: { value: 100, availability: "DERIVED_STATISTIC", provenance: {
        sourceType: "DERIVED_FROM_SOURCED_TOTALS", publisher: "x", sourceUrl: "https://x", retrievedAt: "2026-08-25",
        licenseNote: "x", verificationStatus: "x" } } },
    };
    expect(validateTargetRecord(bad, { fixtureIds: ids }).some((e) => /formula/.test(e))).toBe(true);
  });

  it("rejects an unknown metric rather than storing it", () => {
    const bad = { fixtureId: ids[0], targetDataVersion: "1.0.0", teamTargets: { madeUpMetric: { value: 1, availability: "RECORDED_STATISTIC" } } };
    expect(validateTargetRecord(bad, { fixtureIds: ids }).some((e) => /unknown team metric/.test(e))).toBe(true);
  });

  it("rejects a blocked metric that arrived as zero", () => {
    const bad = { fixtureId: ids[0], targetDataVersion: "1.0.0", teamTargets: { pace: { value: 0, availability: "SOURCE_BLOCKED_LICENSING" } } };
    expect(validateTargetRecord(bad, { fixtureIds: ids }).some((e) => /became 0/.test(e))).toBe(true);
  });
});

describe("coverage reporting", () => {
  it("counts what is known and what is not", () => {
    const cov = coverageOf(store.targets);
    expect(cov.A, "team win-loss records were imported").toBeGreaterThan(0);
    expect(cov.C, "selected-five share maps exist for every fixture").toBeGreaterThanOrEqual(FIXTURES.length * 3);
    expect(cov.D, "documented identity notes").toBeGreaterThan(0);
    expect(cov.blockedFields + cov.notApplicable + cov.notRecorded, "absences are counted, not hidden").toBeGreaterThan(0);
  });

  it("gives every fixture a selected-five target, since that is this phase's validation surface", () => {
    for (const r of store.targets) {
      expect(r.unitTargets, `${r.fixtureId} has no unit target`).toBeTruthy();
      expect(Object.keys(r.unitTargets.playerScoringShares)).toHaveLength(5);
    }
  });

  it("resolves every share key to a real card in that fixture's roster", () => {
    const byId = new Map(PLAYERS.map((p) => [p.id, p]));
    for (const r of store.targets) {
      const roster = FIXTURES.find((f) => f.fixtureId === r.fixtureId).roster.map((x) => x.playerCardId);
      for (const cardId of Object.keys(r.unitTargets.playerScoringShares)) {
        expect(byId.has(cardId), `${r.fixtureId}: ${cardId} is not a card`).toBe(true);
        expect(roster).toContain(cardId);
      }
    }
  });
});
