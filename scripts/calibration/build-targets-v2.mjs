#!/usr/bin/env node
// ── Historical target coverage for corpus v2 ────────────────────────────────
// Populates every target the AUTHORIZED sources can support, and records an
// explicit reason for every one they cannot.
//
//   npm run calibration:build-targets-v2
//   npm run calibration:coverage-v2
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, parsePlayerTable, PUBLISHER, LICENSE_NOTE } from "./adapters/wikipedia.mjs";
import { VERIFIED_SEASONS } from "./build-corpus-v2.mjs";
import { loadCorpusV2, HISTORICAL_HOLDOUT_V2_IDS } from "../../data/calibration/sets-v2.mjs";
import { eligibilityOf } from "../../data/calibration/classification.mjs";
import { notRecordedInEra, TEAM_TARGET_FIELDS, validateTargetRecord } from "../../src/v3/calibration/targetSchema.js";
import { versionOf } from "../../src/versions.js";

export const TARGETS_V2_PATH = "data/calibration/historical-targets-v2.json";

const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

/** Shares that sum to exactly 1, with rounding drift absorbed by the largest. */
const sharesOf = (entries) => {
  const total = entries.reduce((a, [, v]) => a + (v ?? 0), 0);
  if (!(total > 0)) return null;
  const out = {};
  for (const [k, v] of entries) out[k] = r4((v ?? 0) / total);
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum !== 1) {
    const biggest = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
    out[biggest] = r4(out[biggest] + (1 - sum));
  }
  return out;
};

const entry = (value, availability, provenance) => ({ value, availability, provenance: value == null ? null : provenance });

export const buildTargets = async () => {
  const corpus = loadCorpusV2();
  if (!corpus) throw new Error("historical corpus v2 not built");
  const bySeason = new Map(VERIFIED_SEASONS.map((v) => [v.fixtureId, v]));
  const records = [];

  for (const f of corpus.fixtures) {
    const spec = bySeason.get(f.fixtureId);
    const a = await fetchArticle(spec.article);
    const table = parsePlayerTable(a.html);

    const prov = {
      sourceType: "AUTHORIZED_PUBLIC_API",
      publisher: PUBLISHER,
      sourceUrl: a.sourceUrl,
      revisionId: a.revisionId,
      contentHash: a.contentHash,
      retrievedAt: new Date().toISOString().slice(0, 10),
      licenseNote: LICENSE_NOTE,
      verificationStatus: "PARSED_FROM_SOURCE",
      attribution: "Wikipedia contributors, CC BY-SA 4.0",
    };

    // ── Tier A ──
    const teamTargets = {};
    if (f.record) {
      teamTargets.games = entry(f.record.games, "RECORDED_STATISTIC", prov);
      teamTargets.wins = entry(f.record.wins, "RECORDED_STATISTIC", prov);
      teamTargets.losses = entry(f.record.losses, "RECORDED_STATISTIC", prov);
    }
    for (const m of TEAM_TARGET_FIELDS) {
      if (teamTargets[m]) continue;
      teamTargets[m] = entry(
        null,
        notRecordedInEra(m, f.eraStyleId) ? "NOT_RECORDED_IN_ERA" : "SOURCE_BLOCKED_LICENSING",
        null,
      );
    }

    // ── Tier C ──
    // Only where the article carries per-player statistics AND the fixture's
    // classification permits a share target at all.
    const ceiling = eligibilityOf(f.classification).playerShareConfidenceCeiling;
    let unitTargets = null;
    if (table && ceiling) {
      const rows = f.roster.map((r) => {
        const card = f.verifiedCards.find((v) => v.cardId === r.playerCardId);
        return { cardId: r.playerCardId, ppg: card?.ppg ?? null, rpg: card?.rpg ?? null, apg: card?.apg ?? null };
      });
      const complete = (k) => rows.every((x) => x[k] != null);
      unitTargets = {
        unitType: "SELECTED_FIVE",
        selectedFiveOnly: true,
        // These five verifiably played for the team, but their season averages
        // include minutes alongside the whole roster — so this is still a
        // PROXY for what the unit would produce alone, not a measurement of it.
        availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
        confidence: ceiling === "HIGH" ? "MEDIUM" : "LOW",
        confidenceCeiling: ceiling,
        playerScoringShares: complete("ppg") ? sharesOf(rows.map((x) => [x.cardId, x.ppg])) : null,
        playerReboundShares: complete("rpg") ? sharesOf(rows.map((x) => [x.cardId, x.rpg])) : null,
        playerAssistShares: complete("apg") ? sharesOf(rows.map((x) => [x.cardId, x.apg])) : null,
        // Not derivable from published per-game scoring: points cannot be split
        // into field goals and free throws without attempt counts.
        playerOpportunityShares: null,
        playerUsageShares: null,
        opportunityShareNote: "Field-goal-attempt share is not derivable from published per-game scoring. Scoring share is the validation surface and is a related but distinct quantity.",
        provenance: prov,
      };
    }

    // ── Tier D ──
    const identityTargets = Object.entries(f.qualitativeIdentity ?? {}).map(([trait, value]) => ({
      trait, value, kind: "DOCUMENTED_STYLE_COMPARISON", confidence: f.confidence.styleIdentityConfidence,
    }));

    records.push({
      fixtureId: f.fixtureId,
      classification: f.classification,
      teamSeason: f.teamSeason,
      season: f.season,
      eraStyleId: f.eraStyleId,
      set: HISTORICAL_HOLDOUT_V2_IDS.includes(f.fixtureId) ? "historical-holdout" : "historical-calibration",
      targetDataVersion: versionOf("historicalTargetDataVersion"),
      targetSchemaVersion: versionOf("historicalTargetSchemaVersion"),
      teamTargets,
      unitTargets,
      identityTargets,
      confidence: f.confidence.overallFixtureConfidence,
      evidence: f.provenance.evidence,
      notes: [],
    });
  }

  return {
    targetDataVersion: versionOf("historicalTargetDataVersion"),
    targetSchemaVersion: versionOf("historicalTargetSchemaVersion"),
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    authorizedSources: [
      { name: PUBLISHER, type: "AUTHORIZED_PUBLIC_API", license: "CC BY-SA 4.0", note: LICENSE_NOTE },
    ],
    prohibitedSources: [
      {
        name: "basketball-reference.com / Sports Reference LLC",
        status: "PROHIBITED_FOR_MODEL_CALIBRATION",
        reason: "Terms forbid using the statistics for training, fine-tuning, prompting or instructing AI models in any manner. Technical accessibility is not authorization.",
        used: false,
      },
      { name: "stats.nba.com", status: "NO_AUTHORIZED_PATH", reason: "No response from this environment; nba.com denies robots.txt.", used: false },
    ],
    records,
  };
};

export const loadTargets = () => (existsSync(TARGETS_V2_PATH) ? JSON.parse(readFileSync(TARGETS_V2_PATH, "utf8")) : null);

export const coverageReport = (store) => {
  const TIER_A = ["games", "wins", "losses", "pointsPerGame", "pointsAllowedPerGame", "fieldGoalAttempts", "fieldGoalPct", "freeThrowAttempts", "freeThrowPct", "rebounds", "assists"];
  const out = {};
  for (const set of ["historical-calibration", "historical-holdout"]) {
    const rows = store.records.filter((r) => r.set === set);
    let a = 0;
    let b = 0;
    let blockedFields = 0;
    let notRecorded = 0;
    const blockedFixtures = new Set();
    for (const r of rows) {
      for (const [m, e] of Object.entries(r.teamTargets)) {
        if (e.value != null) { if (TIER_A.includes(m)) a++; else b++; continue; }
        if (e.availability === "NOT_RECORDED_IN_ERA") notRecorded++;
        else { blockedFields++; blockedFixtures.add(r.fixtureId); }
      }
    }
    const cShares = rows.reduce((n, r) => n + ["playerScoringShares", "playerReboundShares", "playerAssistShares"].filter((k) => r.unitTargets?.[k]).length, 0);
    out[set] = {
      fixtures: rows.length,
      tierA: a, tierB: b, tierC: cShares,
      tierD: rows.reduce((n, r) => n + r.identityTargets.length, 0),
      fixturesWithTierC: rows.filter((r) => r.unitTargets?.playerScoringShares).length,
      sourceBlockedFields: blockedFields,
      sourceBlockedFixtures: blockedFixtures.size,
      notRecordedInEra: notRecorded,
      confidence: rows.reduce((acc, r) => ({ ...acc, [r.confidence]: (acc[r.confidence] ?? 0) + 1 }), {}),
      evidence: rows.reduce((acc, r) => ({ ...acc, [r.evidence]: (acc[r.evidence] ?? 0) + 1 }), {}),
    };
  }
  return out;
};

/** Does the corpus meet the Part 18 gate for beginning coefficient tuning? */
export const gateResult = (store) => {
  const cov = coverageReport(store);
  const cal = cov["historical-calibration"];
  const corpus = loadCorpusV2();
  const failures = [];
  if (corpus.fixtures.length < 24) failures.push(`corpus has ${corpus.fixtures.length} historical fixtures, target is 24`);
  if (corpus.coverage.erasCovered < 8) failures.push(`corpus covers ${corpus.coverage.erasCovered} of 8 Era Styles`);
  if (cal.tierB === 0) failures.push("Tier B (derived advanced targets) coverage is zero — no source supplies the totals they derive from");
  const franchises = Object.keys(corpus.coverage.byFranchise);
  if (franchises.length < 5) failures.push(`corpus spans ${franchises.length} franchises (${franchises.join(", ")}), which cannot support tuning that generalises`);
  return { passed: failures.length === 0, failures };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "build";
  if (cmd === "build") {
    const store = await buildTargets();
    const ids = store.records.map((r) => r.fixtureId);
    const errs = store.records.flatMap((r) => validateTargetRecord(r, { fixtureIds: ids }));
    if (errs.length) {
      console.error(`REJECTED — ${errs.length} validation error(s):`);
      for (const e of errs.slice(0, 20)) console.error(`  ${e}`);
      process.exit(1);
    }
    mkdirSync("data/calibration", { recursive: true });
    writeFileSync(TARGETS_V2_PATH, JSON.stringify(store, null, 2) + "\n");
    console.log(`wrote ${TARGETS_V2_PATH} — ${store.records.length} records, hash ${createHash("sha256").update(JSON.stringify(store.records)).digest("hex").slice(0, 16)}`);
  } else if (cmd === "coverage") {
    const store = loadTargets();
    if (!store) { console.error("no target store — run calibration:build-targets-v2"); process.exit(1); }
    const cov = coverageReport(store);
    for (const [set, c] of Object.entries(cov)) {
      console.log(`\n${set.toUpperCase()} — ${c.fixtures} fixtures`);
      console.log(`  Tier A (recorded team basics)      ${c.tierA} fields`);
      console.log(`  Tier B (derived advanced)          ${c.tierB} fields`);
      console.log(`  Tier C (selected-five shares)      ${c.tierC} share maps across ${c.fixturesWithTierC} fixtures`);
      console.log(`  Tier D (documented identity)       ${c.tierD} notes`);
      console.log(`  source-blocked fields              ${c.sourceBlockedFields}  (licensing, not access)`);
      console.log(`  source-blocked fixtures            ${c.sourceBlockedFixtures}`);
      console.log(`  not recorded in era                ${c.notRecordedInEra}`);
      console.log(`  confidence                         ${JSON.stringify(c.confidence)}`);
      console.log(`  evidence                           ${JSON.stringify(c.evidence)}`);
    }
    console.log(`\nauthorized source types used: ${store.authorizedSources.map((s) => s.type).join(", ")}`);
    console.log(`unauthorized sources used: 0`);
    console.log(`holdout engine comparisons run: 0 — this command reads targets only`);
    const gate = gateResult(store);
    console.log(`\n── PART 18 TUNING GATE: ${gate.passed ? "PASSED" : "FAILED"} ──`);
    for (const f of gate.failures) console.log(`  ✗ ${f}`);
    if (!gate.passed) console.log(`\n  Broad coefficient tuning does NOT proceed. Only structurally validated\n  domains whose targets are sufficient may be calibrated.`);
  }
}
