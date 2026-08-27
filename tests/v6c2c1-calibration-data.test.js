import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  calibrationPlayerId, parseCalibrationPlayerId, isCalibrationId, personSlug,
  validateCalibrationPlayer, notRecordedIn, normalisePct, perGame,
  CONFIDENCE, SLOTS, FIRST_RECORDED,
} from "../src/v3/calibration/calibrationPlayerSchema.js";
import { buildCalibrationPlayerProfile, preRecordingDefensiveBand } from "../src/v3/calibration/calibrationPlayerAdapter.js";
import { loadPlayers, namesMatch, teamMatches } from "../scripts/calibration/build-players-v3.mjs";
import { loadCorpusV3, corpusHash, validateFixture } from "../scripts/calibration/build-corpus-v3.mjs";
import { CORPUS_V3_SPEC, specByEra, specFranchisesByEra, styleTagCoverage } from "../data/calibration/corpus-v3-spec.mjs";
import { SET_STATUS, statusInconsistencies, formalHoldoutCandidates, reconciliation } from "../data/calibration/set-status.mjs";
import { validateTeamIds } from "../api/_lib/validate.js";
import { PLAYERS } from "../src/players.js";
import { personIdForCard } from "../src/v3/data/persons.js";
import COACHES from "../src/v3/data/coaches.js";
import { versionOf, statusOf, VERSION_STATUS, REGISTRY } from "../src/versions.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";

const store = loadPlayers();
const corpus = loadCorpusV3();

describe("set status reconciliation", () => {
  it("assigns a status consistent with the evidence", () => {
    expect(statusInconsistencies()).toEqual([]);
    for (const [key, s] of Object.entries(SET_STATUS)) {
      expect(s.evidence, `${key} asserts a status with no evidence`).toBeTruthy();
      expect(s.why?.length, `${key} has no rationale`).toBeGreaterThan(20);
    }
  });

  it("corrects the synthetic stress set, which was never actually sealed", () => {
    // Its members are the reclassified corpus v1 fixtures, simulated
    // extensively during Phase 6C2A before the seal existed.
    const s = SET_STATUS.syntheticStressV1;
    expect(s.previouslySimulated).toBe(true);
    expect(s.accessPolicy).toBe("PREVIOUSLY_INSPECTED_ARCHIVE");
    expect(s.usableAsFormalHoldout).toBe(false);
    expect(s.correctsPriorReport).toMatch(/SEALED_UNREAD/);
    expect(s.evidence).toMatch(/19 of 25/);
  });

  it("never lets a simulated set claim to be sealed", () => {
    for (const [key, s] of Object.entries(SET_STATUS)) {
      if (s.accessPolicy === "SEALED_UNREAD") {
        expect(s.previouslySimulated, `${key} claims SEALED_UNREAD but was simulated`).toBe(false);
      }
    }
  });

  it("finds no prior set fit to be a formal holdout", () => {
    expect(formalHoldoutCandidates()).toEqual([]);
    expect(reconciliation().note).toMatch(/created fresh/);
  });
});

describe("calibration player schema", () => {
  it("builds a stable identity that is not array order or a public card id", () => {
    const id = calibrationPlayerId({ teamId: "BOS", seasonStartYear: 1962, personSlug: "bill-russell" });
    expect(id).toBe("cal:BOS:1962:bill-russell");
    expect(parseCalibrationPlayerId(id)).toEqual({ teamId: "BOS", seasonStartYear: 1962, personSlug: "bill-russell" });
    // The same person in two seasons is two profiles, so a season line can
    // never stand in for a different year's.
    expect(id).not.toBe(calibrationPlayerId({ teamId: "BOS", seasonStartYear: 1964, personSlug: "bill-russell" }));
    expect(() => calibrationPlayerId({ teamId: "BOS", seasonStartYear: 1962 })).toThrow(/required/);
  });

  it("recognises its own namespace", () => {
    expect(isCalibrationId("cal:BOS:1962:bill-russell")).toBe(true);
    expect(isCalibrationId("bird-80s")).toBe(false);
    expect(personSlug("Manu Ginóbili")).toBe("manu-ginobili");
  });

  it("knows what was not recorded, per season", () => {
    expect(notRecordedIn("steals", 1962)).toBe(true);
    expect(notRecordedIn("steals", 1980)).toBe(false);
    expect(notRecordedIn("threePointAttempts", 1975)).toBe(true);
    expect(notRecordedIn("threePointAttempts", 1985)).toBe(false);
    expect(FIRST_RECORDED.steals).toBe(1973);
  });

  it("rejects an unrecorded statistic that arrived as zero", () => {
    // The substitution the schema exists to prevent: a 0 steal count in 1962
    // claims he never got one, which is false. Null means "not recorded".
    const base = store.profiles.find((p) => p.seasonStartYear < 1973);
    const bad = { ...base, basicStats: { ...base.basicStats, steals: 0 } };
    expect(validateCalibrationPlayer(bad).some((e) => /not kept/.test(e))).toBe(true);
    expect(validateCalibrationPlayer(base)).toEqual([]);
  });

  it("rejects a profile carrying any public-product concept", () => {
    const base = store.profiles[0];
    for (const field of ["ovr", "rating", "popularity", "archetypeBadge", "draftRank"]) {
      expect(validateCalibrationPlayer({ ...base, [field]: 5 }).some((e) => new RegExp(field).test(e)), field).toBe(true);
    }
    expect(validateCalibrationPlayer({ ...base, publicEligibility: true }).some((e) => /publicEligibility/.test(e))).toBe(true);
  });

  it("normalises a percentage written either way", () => {
    expect(normalisePct(0.504)).toBeCloseTo(0.504, 4);
    expect(normalisePct(50.4)).toBeCloseTo(0.504, 4);
    expect(normalisePct(null)).toBeNull();
  });

  it("refuses to derive a per-game value without a sourced game count", () => {
    // A total divided by the wrong denominator looks exactly as plausible as
    // one divided by the right denominator.
    expect(perGame(2115, 82)).toBeCloseTo(25.79, 2);
    expect(perGame(2115, null)).toBeNull();
    expect(perGame(2115, 0)).toBeNull();
  });
});

describe("exact name matching", () => {
  it("refuses the false match that a fuzzy matcher produced", () => {
    // A last-name-plus-first-initial rule matched Draymond Green to the
    // 2019-20 Lakers' Danny Green. In a historical corpus that is a
    // fabrication, not a convenience.
    expect(namesMatch("Draymond Green", "Danny Green")).toBe(false);
    expect(namesMatch("Danny Green", "Danny Green")).toBe(true);
  });

  it("refuses other near-misses", () => {
    expect(namesMatch("Charles Smith", "Charles Barkley")).toBe(false);
    expect(namesMatch("Bill Russell", "Bill Sharman")).toBe(false);
    expect(namesMatch("Gary Payton", "Gary Payton II")).toBe(false);
    expect(namesMatch("Jaylen Brown", "Jaylen Nowell")).toBe(false);
    expect(namesMatch("Tom Sanders", "Tom Heinsohn")).toBe(false);
  });

  it("accepts documented aliases and diacritics only", () => {
    expect(namesMatch("Kareem Abdul-Jabbar", "Lew Alcindor")).toBe(true);
    expect(namesMatch("Manu Ginóbili", "Manu Ginobili")).toBe(true);
    expect(namesMatch("Nate Archibald", "Tiny Archibald")).toBe(true);
    // Not an alias, so not a match.
    expect(namesMatch("Michael Jordan", "MJ")).toBe(false);
  });

  it("strips a league qualifier from a team label but not the franchise", () => {
    // Julius Erving's 1982-83 row reads "Philadelphia (NBA)" because he also
    // played in the ABA. The qualifier describes the league, not the team.
    expect(teamMatches("PHI", "Philadelphia (NBA)")).toBe(true);
    expect(teamMatches("PHI", "Philadelphia")).toBe(true);
    expect(teamMatches("PHI", "Boston")).toBe(false);
    expect(teamMatches("BOS", null)).toBe(false);
  });
});

describe("calibration player store", () => {
  it("resolved every fixture player", () => {
    expect(store.profiles).toHaveLength(160);
    expect(store.unresolvedCount, "an unresolved player is refused, never guessed at").toBe(0);
    expect(store.playersHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates every profile", () => {
    const errs = store.profiles.flatMap((p) => validateCalibrationPlayer(p));
    expect(errs, errs.slice(0, 8).join("\n")).toEqual([]);
  });

  it("carries provenance and a membership route on every profile", () => {
    for (const p of store.profiles) {
      expect(p.provenance.sourceUrl).toMatch(/^https:\/\/en\.wikipedia\.org/);
      expect(p.provenance.licenseNote).toMatch(/CC BY-SA/);
      expect(p.provenance.attribution).toMatch(/Wikipedia/);
      expect(p.provenance.contentHash).toMatch(/^[0-9a-f]{16,}$/);
      expect(["PLAYER_CAREER_TABLE", "TEAM_SEASON_STATISTICS", "TEAM_SEASON_ROSTER_ONLY"])
        .toContain(p.provenance.membershipRoute);
      expect(CONFIDENCE).toContain(p.confidence);
    }
  });

  it("drops confidence when the route proves membership but not production", () => {
    // A roster table says he was on the team. It says nothing about what he
    // did, so every statistic stays null and confidence falls.
    for (const p of store.profiles.filter((x) => x.provenance.membershipRoute === "TEAM_SEASON_ROSTER_ONLY")) {
      expect(p.confidence).toBe("LOW");
      expect(p.basicStats.pointsPerGame, `${p.name} has stats from a roster-only route`).toBeNull();
    }
  });

  it("preserves nulls for statistics that did not exist in the season", () => {
    for (const p of store.profiles) {
      for (const metric of ["steals", "blocks"]) {
        if (notRecordedIn(metric, p.seasonStartYear)) {
          expect(p.basicStats[metric], `${p.name} ${p.season}: ${metric} must be null`).toBeNull();
        }
      }
      if (notRecordedIn("threePointPct", p.seasonStartYear)) expect(p.basicStats.threePointPct).toBeNull();
    }
  });

  it("covers every era and position evenly, as the corpus requires", () => {
    const byEra = {};
    const byPos = {};
    for (const p of store.profiles) {
      byEra[p.eraStyleId] = (byEra[p.eraStyleId] ?? 0) + 1;
      byPos[p.primaryPosition] = (byPos[p.primaryPosition] ?? 0) + 1;
    }
    expect(Object.keys(byEra)).toHaveLength(8);
    for (const n of Object.values(byEra)) expect(n).toBe(20);
    for (const s of SLOTS) expect(byPos[s]).toBe(32);
  });

  it("links to public people where they exist and stands alone where they do not", () => {
    const linked = store.profiles.filter((p) => p.publicPersonId);
    const internal = store.profiles.filter((p) => !p.publicPersonId);
    expect(linked.length).toBeGreaterThan(80);
    // The whole point: role players who unblock a real lineup and should never
    // appear in the public selector.
    expect(internal.length, "no internal-only players means the corpus gained nothing").toBeGreaterThan(30);
    const publicPeople = new Set(PLAYERS.map((c) => personIdForCard(c.id)));
    for (const p of linked) expect(publicPeople.has(p.publicPersonId), `${p.name}`).toBe(true);
  });
});

describe("public isolation", () => {
  it("leaves the public pool exactly as it was", () => {
    expect(PLAYERS).toHaveLength(381);
    expect(new Set(PLAYERS.map((p) => personIdForCard(p.id)).filter(Boolean)).size).toBe(323);
    expect((COACHES.coaches ?? COACHES)).toHaveLength(30);
  });

  it("keeps no calibration profile in the public card list", () => {
    const publicIds = new Set(PLAYERS.map((p) => p.id));
    for (const p of store.profiles) {
      expect(publicIds.has(p.calibrationPlayerId), `${p.calibrationPlayerId} leaked into PLAYERS`).toBe(false);
    }
    expect(PLAYERS.some((p) => isCalibrationId(p.id))).toBe(false);
  });

  it("rejects a calibration id at the public server boundary", () => {
    // Random Team, the Daily, challenges, saved squads and the roster builder
    // all resolve through this. A `cal:` id must never pass.
    const real = PLAYERS.slice(0, 5).map((p) => p.id);
    expect(validateTeamIds(real)).not.toBeNull();
    const withCal = [...real.slice(0, 4), "cal:BOS:1962:bill-russell"];
    expect(validateTeamIds(withCal), "a calibration id passed public validation").toBeNull();
    expect(validateTeamIds(store.profiles.slice(0, 5).map((p) => p.calibrationPlayerId))).toBeNull();
  });

  it("gives no calibration profile an OVR, rating or card asset", () => {
    for (const p of store.profiles) {
      expect(p.publicEligibility).toBe(false);
      for (const field of ["ovr", "rating", "pop", "popularity", "archetypeBadge", "draftRank"]) {
        expect(p[field], `${p.name} carries ${field}`).toBeUndefined();
      }
    }
    // The store itself declares the isolation, so a reader cannot miss it.
    expect(store.purpose).toMatch(/NEVER eligible for the public product/);
  });

  it("keeps the public and calibration registries in separate files", () => {
    const publicSrc = readFileSync("src/players.js", "utf8");
    expect(publicSrc).not.toMatch(/calibration-players-v3|calibrationPlayerId/);
    const validateSrc = readFileSync("api/_lib/validate.js", "utf8");
    expect(validateSrc).toMatch(/cal:/);
  });
});

describe("calibration profile adapter", () => {
  const season = store.profiles.find((p) => p.basicStats.pointsPerGame != null && p.seasonStartYear >= 1980);

  it("produces the engine's Player Intelligence contract", () => {
    const prof = buildCalibrationPlayerProfile(season);
    for (const k of ["id", "name", "positions", "physical", "shooting", "offense", "defense", "fit", "provenance", "confidence"]) {
      expect(prof[k], `missing ${k}`).toBeTruthy();
    }
    for (const k of ["usageAppetite", "selfCreation", "spacingGravity", "rimThreat", "postThreat", "passingVision", "offBallMovement", "shotSelection", "ballSecurity"]) {
      expect(prof.offense[k], `offense.${k}`).toBeTypeOf("number");
      expect(prof.offense[k]).toBeGreaterThanOrEqual(0);
      expect(prof.offense[k]).toBeLessThanOrEqual(10);
    }
    for (const v of Object.values(prof.defense)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildCalibrationPlayerProfile(season)))
      .toBe(JSON.stringify(buildCalibrationPlayerProfile(season)));
  });

  it("assigns no public rating of any kind", () => {
    const prof = buildCalibrationPlayerProfile(season);
    for (const field of ["ovr", "rating", "pop", "popularity", "archetypeBadge", "draftRank"]) {
      expect(prof[field], field).toBeUndefined();
    }
    expect(prof.calibrationOnly).toBe(true);
    expect(prof.publicEligibility).toBe(false);
  });

  it("uses a categorical band, never a rate, before steals and blocks were recorded", () => {
    const band = preRecordingDefensiveBand({
      seasonStartYear: 1962, lineupRole: "STARTER",
      accolades: ["All-Defensive First Team"], reboundsPerGame: 23, documentedRole: "rim-anchored interior defender",
    });
    expect(band.band).toBe("ELITE");
    expect(band.note).toMatch(/not a rate/);
    // After recording began there is no band: the real numbers are used.
    expect(preRecordingDefensiveBand({ seasonStartYear: 1985, lineupRole: "STARTER" })).toBeNull();
  });

  it("marks a season profile as native to its era, needing no translation", () => {
    const prof = buildCalibrationPlayerProfile(season);
    expect(prof.eraTranslation.basis).toBe("SEASON_NATIVE");
  });
});

describe("historical corpus v3", () => {
  it("holds exactly 32 fixtures, four per Era Style", () => {
    expect(corpus.fixtures).toHaveLength(32);
    expect(Object.keys(corpus.coverage.byEra)).toHaveLength(8);
    for (const [era, n] of Object.entries(corpus.coverage.byEra)) expect(n, era).toBe(4);
    expect(corpus.corpusHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contains only source-valid historical fixture types", () => {
    for (const f of corpus.fixtures) {
      expect(["HISTORICAL_LINEUP", "HISTORICAL_STARTER_PROXY", "HISTORICAL_PRINCIPAL_FIVE_PROXY"], f.fixtureId)
        .toContain(f.fixtureType);
    }
  });

  it("verifies every player against that team-season", () => {
    const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
    for (const f of corpus.fixtures) {
      expect(f.players).toHaveLength(5);
      expect(f.players.map((p) => p.assignedPosition)).toEqual(SLOTS);
      const people = new Set();
      for (const p of f.players) {
        const prof = byId.get(p.calibrationPlayerId);
        expect(prof, `${f.fixtureId}: ${p.name} has no profile`).toBeTruthy();
        expect(prof.teamId).toBe(f.teamId);
        expect(prof.seasonStartYear).toBe(f.seasonStartYear);
        expect(prof.primaryPosition).toBe(p.assignedPosition);
        expect(people.has(prof.calibrationPersonId), `${f.fixtureId}: duplicate person`).toBe(false);
        people.add(prof.calibrationPersonId);
      }
    }
  });

  it("verifies every coach against the pool", () => {
    const ids = new Set((COACHES.coaches ?? COACHES).map((c) => c.id));
    for (const f of corpus.fixtures) expect(ids.has(f.coachId), `${f.fixtureId}: ${f.coachId}`).toBe(true);
  });

  it("takes its confidence from its weakest member", () => {
    // A five is only as verified as its least-verified player.
    const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
    const RANK = { HIGH: 4, MEDIUM_HIGH: 3, MEDIUM: 2, LOW: 1 };
    for (const f of corpus.fixtures) {
      const weakest = Math.min(...f.players.map((p) => RANK[byId.get(p.calibrationPlayerId).confidence]));
      expect(RANK[f.confidence.playerDataConfidence]).toBe(weakest);
    }
  });

  it("does not use one franchise for every fixture in an era", () => {
    for (const [era, franchises] of Object.entries(corpus.coverage.franchisesByEra)) {
      expect(franchises.length, `${era} uses a single franchise`).toBeGreaterThan(1);
    }
  });

  it("covers a wide spread of documented styles", () => {
    const tags = corpus.coverage.styleTags;
    expect(Object.keys(tags).length).toBeGreaterThanOrEqual(15);
    for (const required of ["ELITE_DEFENSE", "PACE_EXTREME", "SLOW_HALF_COURT", "POST_HEAVY", "MOTION",
      "THREE_POINT_HEAVY", "PASSING_HUB", "SMALL_BALL", "SIZE_HEAVY", "NON_CHAMPION", "ZONE_CAPABLE"]) {
      expect(tags[required], `no fixture tagged ${required}`).toBeGreaterThan(0);
    }
  });

  it("rejects a fixture whose player is not verified for that season", () => {
    const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
    const spec = CORPUS_V3_SPEC[0];
    const bad = { ...spec, five: [...spec.five.slice(0, 4), { slot: "C", name: "Not A Real Player", article: "x", role: "STARTER" }] };
    expect(validateFixture(bad, byId).length).toBeGreaterThan(0);
  });

  it("rejects a fixture with an unknown coach", () => {
    const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
    expect(validateFixture({ ...CORPUS_V3_SPEC[0], coachId: "not-a-coach" }, byId).some((e) => /not in the pool/.test(e))).toBe(true);
  });

  it("hashes by membership, not by order", () => {
    const h = corpusHash(corpus.fixtures);
    expect(corpusHash([...corpus.fixtures].reverse())).toBe(h);
    expect(corpusHash(corpus.fixtures.slice(1))).not.toBe(h);
  });
});

describe("corpus v3 versioning", () => {
  it("registers the new domains as DEVELOPMENT and result-neutral", () => {
    for (const d of ["calibrationPlayerSchemaVersion", "calibrationPlayerDataVersion", "fixtureSourceRegistryVersion",
      "historicalCalibrationSetVersion", "syntheticDevelopmentSetVersion", "syntheticStressHoldoutVersion",
      "monteCarloProbabilityVersion", "predictionSeedSetVersion", "probabilityValidationSeedSetVersion",
      "probabilityCacheSchemaVersion"]) {
      expect(statusOf(d), d).toBe(VERSION_STATUS.DEVELOPMENT);
      expect(versionOf(d), d).toBeTruthy();
      expect(REGISTRY[d].affectsResult, `${d} must not shape a public game result`).toBe(false);
    }
  });

  it("locks the possession calibration only with a passing manifest", () => {
    const r = assertCalibrationLockInvariant();
    // A locked calibration carries an active DEVELOPMENT lock status —
    // BASELINE for Candidate 0, SCOPED for a successor candidate.
    expect(r.locked
      ? [VERSION_STATUS.DEVELOPMENT_LOCKED_BASELINE, VERSION_STATUS.DEVELOPMENT_LOCKED_SCOPED]
      : [VERSION_STATUS.DEVELOPMENT])
      .toContain(statusOf("possessionCalibrationVersion"));
  });

  it("advances the corpus and target domains to their third generation", () => {
    expect(versionOf("historicalCorpusVersion")).toBe("3.0.0");
    expect(versionOf("historicalHoldoutSetVersion")).toBe("3.0.0");
    expect(versionOf("historicalTargetDataVersion")).toBe("3.0.0");
    expect(versionOf("holdoutSetVersion"), "the legacy holdout never moves").toBe("1.0.0");
  });
});
