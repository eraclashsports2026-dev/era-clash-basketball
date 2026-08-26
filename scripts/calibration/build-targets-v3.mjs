#!/usr/bin/env node
// ── Historical target coverage v3 ───────────────────────────────────────────
// Tier A from the team-season record, Tier C from the verified calibration
// player-season profiles, Tier D from documented identity.
//
//   npm run calibration:targets-v3
//   npm run calibration:coverage-v3
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, parseRecord, PUBLISHER, LICENSE_NOTE } from "./adapters/wikipedia.mjs";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";
import { loadPlayers } from "./build-players-v3.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS } from "../../data/calibration/sets-v3.mjs";
import { notRecordedInEra, TEAM_TARGET_FIELDS } from "../../src/v3/calibration/targetSchema.js";
import { versionOf } from "../../src/versions.js";

export const TARGETS_V3_PATH = "data/calibration/historical-targets-v3.json";
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

/** Shares that sum to exactly 1. Null when any member's value is missing. */
const sharesOf = (entries) => {
  if (entries.some(([, v]) => v == null)) return null;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!(total > 0)) return null;
  const out = Object.fromEntries(entries.map(([k, v]) => [k, r4(v / total)]));
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum !== 1) {
    const biggest = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
    out[biggest] = r4(out[biggest] + (1 - sum));
  }
  return out;
};

const entry = (value, availability, provenance, formula = null) =>
  ({ value, availability, provenance: value == null ? null : provenance, formula });

export const buildTargets = async () => {
  const corpus = loadCorpusV3();
  const players = loadPlayers();
  const byId = new Map(players.profiles.map((p) => [p.calibrationPlayerId, p]));
  const records = [];

  for (const f of corpus.fixtures) {
    const art = await fetchArticle(f.teamArticle);
    const record = parseRecord(art.html);
    const prov = {
      sourceType: "AUTHORIZED_PUBLIC_API", publisher: PUBLISHER, sourceUrl: art.sourceUrl,
      revisionId: art.revisionId, contentHash: art.contentHash, retrievedAt: art.retrievedAt,
      licenseNote: LICENSE_NOTE, attribution: "Wikipedia contributors, CC BY-SA 4.0",
      verificationStatus: "PARSED_FROM_SOURCE",
    };

    // ── Tier A ──
    const teamTargets = {};
    if (record) {
      teamTargets.games = entry(record.games, "RECORDED_STATISTIC", prov);
      teamTargets.wins = entry(record.wins, "RECORDED_STATISTIC", prov);
      teamTargets.losses = entry(record.losses, "RECORDED_STATISTIC", prov);
    }
    for (const m of TEAM_TARGET_FIELDS) {
      if (teamTargets[m]) continue;
      teamTargets[m] = entry(null,
        notRecordedInEra(m, f.eraStyleId) ? "NOT_RECORDED_IN_ERA" : "SOURCE_BLOCKED_LICENSING", null);
    }

    // ── Tier C ── from verified season profiles, never from a decade card.
    const five = f.players.map((p) => ({ id: p.calibrationPlayerId, prof: byId.get(p.calibrationPlayerId) }));
    const stat = (k) => five.map((x) => [x.id, x.prof.basicStats[k]]);
    const unitTargets = {
      unitType: "SELECTED_FIVE",
      selectedFiveOnly: true,
      // Season averages include minutes played alongside the whole roster, so
      // this remains a PROXY for what these five would produce alone.
      availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
      confidence: f.confidence.playerDataConfidence === "LOW" ? "LOW" : "MEDIUM",
      playerScoringShares: sharesOf(stat("pointsPerGame")),
      playerReboundShares: sharesOf(stat("rebounds")),
      playerAssistShares: sharesOf(stat("assists")),
      playerStealShares: sharesOf(stat("steals")),
      playerBlockShares: sharesOf(stat("blocks")),
      // Not derivable: the source carries no attempt counts, so points cannot
      // be split into field goals and free throws.
      playerOpportunityShares: null,
      playerUsageShares: null,
      playerTurnoverShares: null,
      opportunityShareNote: "Field-goal-attempt share is not derivable from published per-game scoring. Scoring share is the validation surface and is a related but distinct quantity.",
      formula: "share_i = stat_i / sum(stat over the five verified season profiles)",
      provenance: { ...prov, verificationStatus: "DERIVED_FROM_AUTHORIZED_TOTALS" },
    };

    // ── Tier D ── interpretation, labelled as such.
    const identityTargets = Object.entries(f.qualitativeIdentity).flatMap(([trait, value]) =>
      Array.isArray(value)
        ? value.map((v) => ({ trait, value: v, kind: "DOCUMENTED_STYLE", confidence: f.confidence.styleIdentityConfidence }))
        : [{ trait, value, kind: "DOCUMENTED_STYLE", confidence: f.confidence.styleIdentityConfidence }]);

    records.push({
      fixtureId: f.fixtureId, teamName: f.teamName, season: f.season, eraStyleId: f.eraStyleId,
      fixtureType: f.fixtureType,
      set: HISTORICAL_HOLDOUT_V3_IDS.includes(f.fixtureId) ? "historical-holdout-v3" : "historical-calibration-v3",
      targetDataVersion: versionOf("historicalTargetDataVersion"),
      teamTargets, unitTargets, identityTargets,
      confidence: f.confidence.overallFixtureConfidence,
    });
  }

  return {
    targetDataVersion: versionOf("historicalTargetDataVersion"),
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
    authorizedSources: [{ name: PUBLISHER, type: "AUTHORIZED_PUBLIC_API", license: "CC BY-SA 4.0", note: LICENSE_NOTE }],
    prohibitedSources: [{
      name: "basketball-reference.com / Sports Reference LLC",
      status: "PROHIBITED_FOR_MODEL_CALIBRATION", used: false,
      reason: "Terms forbid using the statistics to train, fine-tune, prompt, instruct, calibrate or evaluate AI models. Technical accessibility is not authorization.",
    }],
    records,
  };
};

export const loadTargetsV3 = () => (existsSync(TARGETS_V3_PATH) ? JSON.parse(readFileSync(TARGETS_V3_PATH, "utf8")) : null);

export const coverageV3 = (store) => {
  const TIER_A = ["games", "wins", "losses"];
  const SHARES = ["playerScoringShares", "playerReboundShares", "playerAssistShares", "playerStealShares", "playerBlockShares"];
  const out = {};
  for (const set of ["historical-calibration-v3", "historical-holdout-v3"]) {
    const rows = store.records.filter((r) => r.set === set);
    let a = 0, b = 0, blocked = 0, notRec = 0;
    for (const r of rows) {
      for (const [m, e] of Object.entries(r.teamTargets)) {
        if (e.value != null) { TIER_A.includes(m) ? a++ : b++; continue; }
        e.availability === "NOT_RECORDED_IN_ERA" ? notRec++ : blocked++;
      }
    }
    out[set] = {
      fixtures: rows.length, tierA: a, tierB: b,
      tierC: rows.reduce((n, r) => n + SHARES.filter((k) => r.unitTargets[k]).length, 0),
      tierCFixtures: rows.filter((r) => r.unitTargets.playerScoringShares).length,
      tierD: rows.reduce((n, r) => n + r.identityTargets.length, 0),
      tierDFixtures: rows.filter((r) => r.identityTargets.length).length,
      sourceBlockedFields: blocked, notRecordedInEra: notRec,
      confidence: rows.reduce((acc, r) => ({ ...acc, [r.confidence]: (acc[r.confidence] ?? 0) + 1 }), {}),
      unprovenancedValues: rows.reduce((n, r) => n + Object.values(r.teamTargets).filter((e) => e.value != null && !e.provenance).length, 0),
    };
  }
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "build";
  if (cmd === "build") {
    const store = await buildTargets();
    mkdirSync("data/calibration", { recursive: true });
    writeFileSync(TARGETS_V3_PATH, JSON.stringify(store, null, 2) + "\n");
    console.log(`wrote ${TARGETS_V3_PATH} — ${store.records.length} records, hash ${createHash("sha256").update(JSON.stringify(store.records)).digest("hex").slice(0, 16)}`);
  } else {
    const store = loadTargetsV3();
    const cov = coverageV3(store);
    for (const [set, c] of Object.entries(cov)) {
      console.log(`\n${set.toUpperCase()} — ${c.fixtures} fixtures`);
      console.log(`  Tier A (recorded team basics)   ${c.tierA} fields`);
      console.log(`  Tier B (derived advanced)       ${c.tierB} fields`);
      console.log(`  Tier C (selected-five shares)   ${c.tierC} share maps across ${c.tierCFixtures}/${c.fixtures} fixtures`);
      console.log(`  Tier D (documented identity)    ${c.tierD} statements across ${c.tierDFixtures}/${c.fixtures} fixtures`);
      console.log(`  source-blocked fields           ${c.sourceBlockedFields}   (licensing, not access)`);
      console.log(`  not recorded in era             ${c.notRecordedInEra}`);
      console.log(`  unprovenanced values            ${c.unprovenancedValues}`);
      console.log(`  confidence                      ${JSON.stringify(c.confidence)}`);
    }
    console.log(`\nunauthorized sources used: 0`);
    console.log(`holdout engine comparisons run: 0 — this command reads targets only`);
  }
}
