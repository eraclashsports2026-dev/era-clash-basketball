import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  CLASSIFICATIONS, ELIGIBILITY, CORPUS_V1_RECLASSIFICATION, classificationOf,
  eligibilityOf, mayContributeHistoricalError, mayEnterHistoricalHoldout, isSynthetic,
  summary, correctedLabels, CONFIDENCE_BANDS,
} from "../data/calibration/classification.mjs";
import {
  loadCorpusV2, HISTORICAL_HOLDOUT_V2_IDS, SYNTHETIC_STRESS_V1_IDS, SYNTHETIC_STRESS_PURPOSES,
  historicalCalibrationV2Ids, buildManifest, manifestHash, overlaps, holdoutEligibilityErrors, coverage,
} from "../data/calibration/sets-v2.mjs";
import { allSealStatuses, setSealStatus, requireSetUnlock, HoldoutSealError, SEALED_SETS, sealStatus } from "../src/v3/calibration/holdoutSeal.js";
import { FIXTURES } from "../data/calibration/fixtures.mjs";
import { HOLDOUT_FIXTURE_IDS, buildManifest as buildV1Manifest } from "../data/calibration/split.mjs";
import { PLAYERS } from "../src/players.js";
import { versionOf, statusOf, VERSION_STATUS, REGISTRY } from "../src/versions.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";
import { assertSealDiscipline, assertImportChangedNoSeal, sealSnapshot } from "./helpers/sealDiscipline.js";

const corpus = loadCorpusV2();
const CARD = new Map(PLAYERS.map((p) => [p.id, p]));

describe("fixture classification", () => {
  it("classifies every fixture in the original corpus", () => {
    for (const f of FIXTURES) {
      expect(classificationOf(f.fixtureId), `${f.fixtureId} unclassified`).toBeTruthy();
      expect(Object.keys(CLASSIFICATIONS)).toContain(classificationOf(f.fixtureId));
    }
    expect(Object.keys(CORPUS_V1_RECLASSIFICATION)).toHaveLength(FIXTURES.length);
  });

  it("records the evidence behind every correction, not just the verdict", () => {
    // "We relabelled it" is not a correction. What it was, what it is, how many
    // of the five were verified, and why — that is a correction.
    for (const [id, v] of Object.entries(CORPUS_V1_RECLASSIFICATION)) {
      expect(v.was, `${id} has no prior label`).toBeTruthy();
      expect(v.now, `${id} has no new classification`).toBeTruthy();
      expect(v.reason?.length, `${id} gives no reason`).toBeGreaterThan(20);
      expect(v.retainedPurpose, `${id} loses its structural purpose`).toBeTruthy();
    }
  });

  it("corrected the labels that overstated what a fixture was", () => {
    const corrected = correctedLabels();
    expect(corrected.length, "the audit found nothing, which contradicts the measurement").toBeGreaterThan(10);
    // The corpus's most overstated claim: a "documented starting five" of the
    // 2015-16 Warriors containing LeBron James and Nikola Jokic.
    const warriors = corrected.find((c) => c.fixtureId === "2010s-warriors-movement");
    expect(warriors.was).toMatch(/DOCUMENTED/);
    expect(warriors.matchedOfFive).toBe(3);
  });

  it("keeps exactly one fixture whose historical label survived", () => {
    const s = summary();
    expect(s.HISTORICAL_LINEUP, "measurement found one accurate label").toBe(1);
    expect(classificationOf("1980s-lakers-showtime")).toBe("HISTORICAL_LINEUP");
  });

  it("deletes nothing — every reclassified fixture keeps a purpose", () => {
    for (const [id, v] of Object.entries(CORPUS_V1_RECLASSIFICATION)) {
      if (!isSynthetic(v.now)) continue;
      expect(SYNTHETIC_STRESS_V1_IDS, `${id} lost its home`).toContain(id);
      expect(SYNTHETIC_STRESS_PURPOSES[id], `${id} has no stress purpose`).toBeTruthy();
    }
  });
});

describe("eligibility matrix", () => {
  it("covers every classification", () => {
    for (const c of Object.keys(CLASSIFICATIONS)) expect(ELIGIBILITY[c], c).toBeTruthy();
    expect(() => eligibilityOf("NOT_A_CLASSIFICATION")).toThrow(/unknown classification/);
  });

  it("bars synthetic fixtures from contributing historical error", () => {
    // The failure this prevents: a lineup that never played quietly adding to a
    // number labelled "historical error".
    expect(mayContributeHistoricalError("SYNTHETIC_ARCHETYPE")).toBe(false);
    expect(mayContributeHistoricalError("CROSS_ERA_STRESS_TEST")).toBe(false);
    expect(mayContributeHistoricalError("HISTORICAL_LINEUP")).toBe(true);
    expect(mayContributeHistoricalError("HISTORICAL_STARTER_PROXY")).toBe(true);
    expect(mayContributeHistoricalError("HISTORICAL_TEAM_SEASON_PROXY")).toBe(true);
  });

  it("bars a team-season proxy from the historical holdout and from high-confidence player shares", () => {
    // Its five are not claimed to have shared the floor, so an exact lineup
    // usage target would be a claim the evidence does not support.
    expect(mayEnterHistoricalHoldout("HISTORICAL_TEAM_SEASON_PROXY")).toBe(false);
    expect(eligibilityOf("HISTORICAL_TEAM_SEASON_PROXY").playerShareConfidenceCeiling).toBe("LOW");
    expect(eligibilityOf("HISTORICAL_LINEUP").playerShareConfidenceCeiling).toBe("HIGH");
  });

  it("uses a confidence vocabulary that is closed", () => {
    for (const e of Object.values(ELIGIBILITY)) {
      if (e.playerShareConfidenceCeiling == null) continue;
      expect(CONFIDENCE_BANDS).toContain(e.playerShareConfidenceCeiling);
    }
  });
});

describe("historical corpus v2", () => {
  it("exists and is versioned", () => {
    expect(corpus, "corpus v2 not built").toBeTruthy();
    // Corpus v2 is now a FROZEN ARCHIVE. Its recorded version must stay at
    // 2.0.0 while the live registry moves on to v3 — an archive that tracked
    // the current version would not be an archive.
    expect(corpus.historicalCorpusVersion).toBe("2.0.0");
    expect(corpus.corpusHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contains only source-valid historical classifications", () => {
    for (const f of corpus.fixtures) {
      expect(["HISTORICAL_LINEUP", "HISTORICAL_STARTER_PROXY", "HISTORICAL_TEAM_SEASON_PROXY"], f.fixtureId)
        .toContain(f.classification);
      expect(isSynthetic(f.classification), `${f.fixtureId} is synthetic`).toBe(false);
    }
  });

  it("verifies every card against the named team-season", () => {
    // The single claim this corpus exists to guarantee. A fixture whose five
    // were not on that roster is not a historical fixture.
    for (const f of corpus.fixtures) {
      const verified = new Set(f.verifiedCards.map((v) => v.cardId));
      for (const r of f.roster) {
        expect(verified.has(r.playerCardId), `${f.fixtureId}: ${r.name} is not verified on the roster`).toBe(true);
      }
      expect(f.verifiedCards).toHaveLength(5);
    }
  });

  it("assigns only legal positions, from cards of the right decade", () => {
    for (const f of corpus.fixtures) {
      const seasonDecade = `${Math.floor(Number(f.season.slice(0, 4)) / 10) * 10}s`;
      for (const r of f.roster) {
        const card = CARD.get(r.playerCardId);
        expect(card, `${f.fixtureId}: unknown card ${r.playerCardId}`).toBeTruthy();
        expect((card.positions ?? [card.pos]), `${f.fixtureId}: ${card.name} at ${r.assignedPosition}`)
          .toContain(r.assignedPosition);
        // A 1970s card must not represent a 1980s season: it carries 1970s
        // production.
        expect(card.decade, `${f.fixtureId}: ${card.name}'s card is ${card.decade}, season is ${seasonDecade}`)
          .toBe(seasonDecade);
      }
      expect(new Set(f.roster.map((r) => r.playerCardId)).size).toBe(5);
      expect(f.roster.map((r) => r.assignedPosition)).toEqual(["PG", "SG", "SF", "PF", "C"]);
    }
  });

  it("carries provenance and an evidence grade on every fixture", () => {
    for (const f of corpus.fixtures) {
      const p = f.provenance;
      expect(p.sourceType).toBe("AUTHORIZED_PUBLIC_API");
      expect(p.sourceUrl).toMatch(/^https:\/\/en\.wikipedia\.org/);
      expect(p.licenseNote).toMatch(/CC BY-SA/);
      expect(p.contentHash).toMatch(/^[0-9a-f]{16,}$/);
      expect(p.revisionId).toBeGreaterThan(0);
      expect(["PLAYER_STATISTICS", "ROSTER_ONLY"]).toContain(p.evidence);
      expect(f.coachId, `${f.fixtureId} has no coach`).toBeTruthy();
    }
  });

  it("grades confidence by the evidence rather than by ambition", () => {
    for (const f of corpus.fixtures) {
      for (const band of Object.values(f.confidence)) expect(CONFIDENCE_BANDS).toContain(band);
      // A roster table proves membership and says nothing about production, so
      // it cannot support a player-share target.
      if (f.provenance.evidence === "ROSTER_ONLY") {
        expect(f.confidence.playerShareConfidence, `${f.fixtureId}`).toBe("SOURCE_BLOCKED");
      }
    }
  });

  it("records its own coverage limitation honestly", () => {
    // The phase brief targets 24+ fixtures across 8 eras. The card pool cannot
    // supply that, and the corpus must say so rather than imply completeness.
    expect(corpus.coverage.erasTotal).toBe(8);
    expect(corpus.coverage.erasCovered).toBeLessThan(8);
    expect(corpus.coverage.fixtures).toBe(corpus.fixtures.length);
    expect(Object.keys(corpus.coverage.byFranchise).length).toBeGreaterThan(1);
  });
});

describe("set membership and freezing", () => {
  it("keeps all three sets disjoint", () => {
    const o = overlaps();
    expect(o.calibrationHoldout).toEqual([]);
    expect(o.calibrationSynthetic).toEqual([]);
    expect(o.holdoutSynthetic).toEqual([]);
  });

  it("admits only eligible types to the historical holdout", () => {
    expect(holdoutEligibilityErrors()).toEqual([]);
    for (const id of HISTORICAL_HOLDOUT_V2_IDS) {
      const f = corpus.fixtures.find((x) => x.fixtureId === id);
      expect(mayEnterHistoricalHoldout(f.classification), `${id}`).toBe(true);
    }
  });

  it("stratifies the holdout across eras, franchises and coaches", () => {
    const c = coverage(HISTORICAL_HOLDOUT_V2_IDS);
    expect(c.eras.length, "a single-era holdout validates one era").toBeGreaterThanOrEqual(3);
    expect(c.franchises.length).toBeGreaterThanOrEqual(3);
    expect(c.coaches.length).toBeGreaterThanOrEqual(3);
  });

  it("never puts both seasons of an identical five in the holdout", () => {
    const byId = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));
    const fives = HISTORICAL_HOLDOUT_V2_IDS.map((id) => byId.get(id).roster.map((r) => r.playerCardId).sort().join(","));
    expect(new Set(fives).size, "the holdout contains a duplicated lineup").toBe(fives.length);
  });

  it("produces stable, content-sensitive manifest hashes", () => {
    for (const kind of ["historical-calibration", "historical-holdout", "synthetic-stress"]) {
      const m = buildManifest(kind);
      expect(m.manifestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(buildManifest(kind).manifestHash, "regeneration changed the hash").toBe(m.manifestHash);
      // Reordering must not matter; membership must.
      expect(manifestHash([...m.fixtureIds].reverse(), { kind })).toBe(m.manifestHash);
      expect(manifestHash([...m.fixtureIds, "extra"], { kind })).not.toBe(m.manifestHash);
      // No timestamp: a hash that moves on every regeneration proves nothing.
      expect(JSON.stringify(m)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("preserves the committed v2 manifests as frozen archives", () => {
    // These manifests record what the v2 sets WERE. `buildManifest` now reads
    // the live registry, which has moved to v3, so the two legitimately differ.
    // What must hold is that the archived files still describe the same
    // membership — the fixtures, not the version stamps.
    for (const kind of ["historical-calibration", "historical-holdout", "synthetic-stress"]) {
      const onDisk = JSON.parse(readFileSync(`data/calibration/${kind}-manifest.json`, "utf8"));
      expect(onDisk.fixtureIds, `${kind} membership changed`).toEqual(buildManifest(kind).fixtureIds);
      expect(onDisk.manifestHash, `${kind} hash changed`).toBe(buildManifest(kind).manifestHash);
    }
  });

  it("states the holdout's size limitation rather than disguising it", () => {
    const m = buildManifest("historical-holdout");
    expect(m.limitation).toMatch(/below/);
    expect(m.rationale).toMatch(/declared before tuning|stratified/i);
    // Padding a historical holdout with synthetic teams would make it useless.
    for (const id of m.fixtureIds) expect(SYNTHETIC_STRESS_V1_IDS).not.toContain(id);
  });

  it("marks the synthetic set as contributing no historical error", () => {
    const m = buildManifest("synthetic-stress");
    expect(m.contributesHistoricalError).toBe(false);
    for (const id of m.fixtureIds) expect(SYNTHETIC_STRESS_PURPOSES[id], `${id} has no purpose`).toBeTruthy();
    expect(new Set(Object.values(SYNTHETIC_STRESS_PURPOSES)).size, "the stress set tests one thing repeatedly").toBeGreaterThan(8);
  });
});

describe("holdout seals", () => {
  it("seals both new sets, unread", () => {
    for (const set of ["historical-holdout-v2", "synthetic-stress-v1"]) {
      const s = setSealStatus(set);
      expect(s.status, `${set} has been read`).toBe("SEALED_UNREAD");
      expect(s.accessCount).toBe(0);
    }
  });

  it("refuses access without an explicit per-set unlock", () => {
    // A normal calibration command must not be able to reach either set.
    for (const set of Object.keys(SEALED_SETS)) {
      expect(() => requireSetUnlock(set, { argv: ["node", "run.mjs"], reason: "x" })).toThrow(HoldoutSealError);
      // The other set's flag must not unlock this one.
      const other = Object.keys(SEALED_SETS).find((s) => s !== set);
      expect(() => requireSetUnlock(set, { argv: ["node", "run.mjs", `--unlock-${other}`], reason: "x" })).toThrow(/sealed/);
    }
  });

  it("requires a reason, and records the parameter version and commit", () => {
    expect(() => requireSetUnlock("historical-holdout-v2", { argv: ["node", "x", "--unlock-historical-holdout-v2"] }))
      .toThrow(/requires a reason/);
    const rec = requireSetUnlock("historical-holdout-v2", {
      argv: ["node", "x", "--unlock-historical-holdout-v2"], reason: "test", actor: "vitest",
      parameterVersion: "1.0.0", commit: "abc1234", log: false,
    });
    expect(rec.reason).toBe("test");
    expect(rec.parameterVersion).toBe("1.0.0");
    expect(rec.commit).toBe("abc1234");
  });

  it("never records anything secret-shaped", () => {
    const rec = requireSetUnlock("synthetic-stress-v1", {
      argv: ["node", "x", "--unlock-synthetic-stress-v1", "--token=abc123", "SECRET=xyz"], reason: "r", log: false,
    });
    expect(JSON.stringify(rec)).not.toMatch(/abc123|xyz/);
  });

  it("leaves the legacy holdout v1 untouched and unread", () => {
    // It is preserved as a historical artefact, not reused: it mixes historical
    // and synthetic fixtures under labels that overstated them.
    const v1 = sealStatus();
    expect(v1.status).toBe("SEALED_UNREAD");
    expect(v1.accessCount).toBe(0);
    expect(versionOf("holdoutSetVersion"), "the legacy holdout version must not move").toBe("1.0.0");
    expect(HOLDOUT_FIXTURE_IDS).toHaveLength(7);
    expect(buildV1Manifest("holdout").manifestHash.slice(0, 16)).toBe("cb863d5de2734f74");
    const all = allSealStatuses();
    expect(all["legacy-holdout-v1"].note).toMatch(/LEGACY_MIXED_HOLDOUT/);
  });

  it("reports every seal state together, including sets added after this phase", () => {
    const all = allSealStatuses();
    // Phase 6C2C1 added historical-holdout-v3 and synthetic-stress-holdout-v2.
    // This asserts the v2 seals are still reported rather than a fixed count,
    // so a later phase adding a holdout does not break the check that matters.
    for (const id of ["legacy-holdout-v1", "historical-holdout-v2", "synthetic-stress-v1"]) {
      expect(Object.keys(all)).toContain(id);
    }
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(3);
    // Phase 6C3 legitimately opened historical-holdout-v3 once. The bare
    // "every count is 0" check is replaced by the seal invariant, which also
    // verifies the opening is attributable and happened only once.
    assertSealDiscipline();
  });
});

describe("corpus v1 preservation", () => {
  it("leaves the original corpus unchanged", () => {
    // v1 is a frozen artefact. Prior calibration reports were computed against
    // it, and rewriting it would silently invalidate them.
    expect(FIXTURES).toHaveLength(26);
    const frozen = JSON.parse(readFileSync("tests/fixtures/calibration-framework/phase-6c2a-frozen/artefact-hashes.json", "utf8"));
    expect(frozen.artefacts["data/calibration/fixtures.mjs"]).toBeTruthy();
  });

  it("preserves every Phase 6C2A artefact by hash", () => {
    const frozen = JSON.parse(readFileSync("tests/fixtures/calibration-framework/phase-6c2a-frozen/artefact-hashes.json", "utf8"));
    const { createHash } = require("node:crypto");
    const changed = [];
    for (const [path, hash] of Object.entries(frozen.artefacts)) {
      if (!existsSync(path)) { changed.push(`${path} (deleted)`); continue; }
      const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
      if (actual !== hash) changed.push(path);
    }
    expect(changed, `Phase 6C2A artefacts were modified: ${changed.join(", ")}`).toEqual([]);
  });

  it("keeps fixture IDs resolvable across both corpora", () => {
    const v2Ids = new Set(corpus.fixtures.map((f) => f.fixtureId));
    const v1Ids = new Set(FIXTURES.map((f) => f.fixtureId));
    // v2 uses its own prefix, so no id collides and both remain addressable.
    for (const id of v2Ids) expect(v1Ids.has(id), `${id} collides with a v1 fixture`).toBe(false);
    for (const id of v2Ids) expect(id.startsWith("h2-")).toBe(true);
  });
});

describe("set versioning", () => {
  it("registers every new domain as DEVELOPMENT and result-neutral", () => {
    for (const d of ["fixtureClassificationVersion", "historicalCorpusVersion", "historicalHoldoutSetVersion",
      "syntheticStressSetVersion", "calibrationParameterRegistryVersion", "calibrationObjectiveVersion",
      "probabilityValidationVersion"]) {
      expect(statusOf(d), d).toBe(VERSION_STATUS.DEVELOPMENT);
      expect(versionOf(d), d).toBeTruthy();
      expect(REGISTRY[d].affectsResult, `${d} must not shape a game result`).toBe(false);
    }
  });

  // Was "unlocked until the gates pass". The gates passed in Phase 6C2C6, so
  // this now asserts the thing that sentence actually meant.
  it("locks the possession calibration only once the gates pass", () => {
    const r = assertCalibrationLockInvariant();
    if (!r.locked) expect(statusOf("possessionCalibrationVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    // Locked: the status must be an active DEVELOPMENT lock — BASELINE for
    // Candidate 0, SCOPED for a successor candidate. Anything production-facing
    // still fails, which is what this guard exists for.
    else expect([VERSION_STATUS.DEVELOPMENT_LOCKED_BASELINE, VERSION_STATUS.DEVELOPMENT_LOCKED_SCOPED])
      .toContain(statusOf("possessionCalibrationVersion"))
  });

  it("separates every holdout generation by version", () => {
    // Three generations, three domains. The legacy one never moves; v2 is
    // archived at its own recorded version; the live domain advances to v3.
    expect(versionOf("holdoutSetVersion"), "the legacy holdout stays at 1.0.0 forever").toBe("1.0.0");
    expect(versionOf("historicalHoldoutSetVersion")).toBe("3.0.0");
    expect(loadCorpusV2().historicalCorpusVersion, "corpus v2 is frozen at its own version").toBe("2.0.0");
  });
});
