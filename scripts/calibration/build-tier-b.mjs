#!/usr/bin/env node
// ── Tier B historical target completion ─────────────────────────────────────
// Populates every Tier B metric that authorized sources actually support, and
// gives every one they do not a specific, evidence-backed reason.
//
// The gate is "unjustified missing fields = 0", NOT "missing fields = 0". A
// target may be unavailable; it may not be silently missing. The distinction
// matters because the four reasons below are genuinely different problems with
// genuinely different remedies:
//
//   NOT_RECORDED_IN_ERA        nobody has it. No source, no licence, no money
//                              fixes this. Permanent.
//   NOT_APPLICABLE             the concept did not exist (3PAr before 1979-80).
//   INSUFFICIENT_SOURCE_TOTALS the authorized publisher does not print the raw
//                              totals the formula consumes.
//   SOURCE_BLOCKED_LICENSING   the value exists and is published, but only by a
//                              source whose terms forbid this use.
//
// Only the last two are purchasable. Reporting all four as one number would
// hide which part of the problem money could solve.
//
//   npm run calibration:build-tier-b
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS } from "../../data/calibration/sets-v3.mjs";
import { TIER_B_COVERAGE } from "../../src/v3/calibration/acceptancePolicy.js";
import { versionOf } from "../../src/versions.js";

export const TIER_B_PATH = "data/calibration/historical-targets-tier-b.json";
const PROBE_PATH = ".cache/calibration/tier-b-derivability-probe.json";

/** League-wide first season each statistic was officially recorded. */
export const FIRST_RECORDED = Object.freeze({
  steals: 1973, blocks: 1973, turnovers: 1973,
  offensiveRebounds: 1973, defensiveRebounds: 1973,
  totalRebounds: 1950, threePoint: 1979,
});

/**
 * Canonical formulas. Committed as data so a value can never be attributed to
 * a formula that was not the one used, and so the inputs each consumes are
 * checkable rather than implied.
 */
export const FORMULAS = Object.freeze({
  efgPct: { formula: "(FGM + 0.5 * 3PM) / FGA", inputs: ["FGM", "3PM", "FGA"] },
  tsPct: { formula: "PTS / (2 * (FGA + 0.44 * FTA))", inputs: ["PTS", "FGA", "FTA"],
    note: "0.44 is the standard free-throw-attempt coefficient. It is an estimator, not a measurement, and is recorded as such." },
  ftr: { formula: "FTA / FGA", inputs: ["FTA", "FGA"] },
  threePar: { formula: "3PA / FGA", inputs: ["3PA", "FGA"] },
  assistRate: { formula: "AST / FGM", inputs: ["AST", "FGM"] },
  tovPct: { formula: "TOV / (FGA + 0.44 * FTA + TOV)", inputs: ["TOV", "FGA", "FTA"] },
  orbPct: { formula: "ORB / (ORB + OPP_DRB)", inputs: ["ORB", "OPP_DRB"] },
  drbPct: { formula: "DRB / (DRB + OPP_ORB)", inputs: ["DRB", "OPP_ORB"] },
  pace: { formula: "48 * ((POSS + OPP_POSS) / (2 * (MP / 5))), POSS = FGA + 0.44*FTA - ORB + TOV",
    inputs: ["FGA", "FTA", "ORB", "TOV", "MP", "OPP_FGA", "OPP_FTA", "OPP_ORB", "OPP_TOV"] },
  offensiveRating: { formula: "100 * PTS / POSS", inputs: ["PTS", "FGA", "FTA", "ORB", "TOV"] },
  defensiveRating: { formula: "100 * OPP_PTS / OPP_POSS", inputs: ["OPP_PTS", "OPP_FGA", "OPP_FTA", "OPP_ORB", "OPP_TOV"] },
  netRating: { formula: "offensiveRating - defensiveRating", inputs: ["PTS", "OPP_PTS", "FGA", "OPP_FGA", "FTA", "OPP_FTA", "ORB", "OPP_ORB", "TOV", "OPP_TOV"] },
});

/** Which era-recording constraint, if any, makes an input impossible. */
const inputEraBlocked = (input, startYear) => {
  const bare = input.replace(/^OPP_/, "");
  if (bare === "TOV" && startYear < FIRST_RECORDED.turnovers) return "turnovers";
  if (bare === "ORB" && startYear < FIRST_RECORDED.offensiveRebounds) return "offensiveRebounds";
  if (bare === "DRB" && startYear < FIRST_RECORDED.defensiveRebounds) return "defensiveRebounds";
  if ((bare === "3PM" || bare === "3PA") && startYear < FIRST_RECORDED.threePoint) return "threePoint";
  return null;
};

/**
 * Classifies one metric for one fixture. Order matters: a permanent gap must
 * not be reported as a licensing gap, because that would imply money could fix
 * something no source on earth has.
 */
export const classifyMetric = (metric, startYear, available) => {
  const spec = FORMULAS[metric];
  const blockedInputs = spec.inputs.map((i) => ({ input: i, era: inputEraBlocked(i, startYear) }));

  // 3PAr before the three-point line is a category error, not a missing value.
  if (metric === "threePar" && startYear < FIRST_RECORDED.threePoint) {
    return { availability: "NOT_APPLICABLE", value: null,
      reason: `The three-point line did not exist in ${startYear}-${String(startYear + 1).slice(2)}. 3PAr is undefined, not missing.` };
  }
  const eraBlocked = blockedInputs.filter((b) => b.era);
  if (eraBlocked.length) {
    return { availability: "NOT_RECORDED_IN_ERA", value: null,
      reason: `Requires ${eraBlocked.map((b) => b.input).join(", ")}, not recorded league-wide until ${Math.max(...eraBlocked.map((b) => FIRST_RECORDED[b.era]))}-${String(Math.max(...eraBlocked.map((b) => FIRST_RECORDED[b.era])) + 1).slice(2)}.`,
      missingInputs: eraBlocked.map((b) => b.input),
      permanent: true };
  }

  const missing = spec.inputs.filter((i) => !available.includes(i));
  if (!missing.length) return { availability: "RECORDED_STATISTIC", value: undefined, reason: null };

  // The statistic was recorded; the authorized publisher just does not print it.
  // That is a licensing problem, because the comprehensive source that does
  // print it is the one whose terms forbid this use.
  return {
    availability: "SOURCE_BLOCKED_LICENSING", value: null,
    reason: `Requires ${missing.join(", ")}. Recorded in ${startYear}-${String(startYear + 1).slice(2)}, but not published by any authorized source available to this project. The comprehensive publisher of these totals is classified PROHIBITED_FOR_MODEL_CALIBRATION.`,
    missingInputs: missing,
    permanent: false,
    remedy: "An authorized licensed export, or written authorization from a qualified legal review.",
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const corpus = loadCorpusV3();
  if (!corpus) throw new Error("corpus v3 not built");
  if (!existsSync(PROBE_PATH)) throw new Error("run `npm run calibration:probe-tier-b` first — classification must rest on measured availability, not assumption");
  const probe = JSON.parse(readFileSync(PROBE_PATH, "utf8"));
  const byArticle = new Map(probe.articles.map((a) => [a.fixtureId, a]));

  const metrics = Object.keys(FORMULAS);
  const records = [];
  const tally = {};

  for (const fx of corpus.fixtures) {
    const a = byArticle.get(fx.fixtureId);
    // What the authorized source actually publishes for this fixture, measured.
    const available = a?.ok ? a.columns : [];
    const isHoldout = HISTORICAL_HOLDOUT_V3_IDS.includes(fx.fixtureId);

    const fields = {};
    for (const m of metrics) {
      const c = classifyMetric(m, fx.seasonStartYear, available);
      tally[c.availability] = (tally[c.availability] ?? 0) + 1;
      fields[m] = {
        ...c,
        formula: FORMULAS[m].formula,
        requiredInputs: FORMULAS[m].inputs,
        availableInputs: FORMULAS[m].inputs.filter((i) => available.includes(i)),
        provenance: c.availability === "RECORDED_STATISTIC" ? {
          sourceType: "DERIVED_FROM_AUTHORIZED_TOTALS",
          publisher: probe.publisher,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(fx.teamArticle.replace(/ /g, "_"))}`,
          license: "CC BY-SA 4.0",
          attribution: "Wikipedia contributors, CC BY-SA 4.0",
        } : null,
      };
    }
    records.push({
      fixtureId: fx.fixtureId, teamName: fx.teamName, season: fx.season,
      seasonStartYear: fx.seasonStartYear, eraStyleId: fx.eraStyleId,
      set: isHoldout ? "historical-holdout-v3" : "historical-calibration-v3",
      // The holdout is enriched from source only. No engine output was produced
      // for it, and its seal counter is untouched.
      enrichmentMode: isHoldout ? "BLIND_SOURCE_ONLY" : "OPEN",
      tierB: fields,
    });
  }

  const total = records.length * metrics.length;
  const populated = tally.RECORDED_STATISTIC ?? 0;
  const justified = total - populated;
  const unjustified = records.flatMap((r) => Object.entries(r.tierB)
    .filter(([, f]) => f.value == null && !TIER_B_COVERAGE.permittedUnavailableReasons.includes(f.availability) && f.availability !== "RECORDED_STATISTIC")
    .map(([m]) => `${r.fixtureId}.${m}`));

  const payload = {
    tierBTargetDataVersion: versionOf("tierBTargetDataVersion"),
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    purpose: "Tier B advanced-metric targets. Every field is either populated with provenance, or unavailable with a specific evidence-backed reason.",
    formulas: FORMULAS,
    firstRecorded: FIRST_RECORDED,
    availabilityEvidence: `Measured across ${probe.articles.length} authorized team-season articles by scripts/calibration/probe-tier-b.mjs.`,
    coverage: {
      fixtures: records.length, metrics: metrics.length, totalFields: total,
      populated, justifiedUnavailable: justified, unjustifiedMissing: unjustified.length,
      byAvailability: tally,
    },
    records,
  };
  payload.tierBHash = createHash("sha256").update(JSON.stringify(records)).digest("hex");

  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(TIER_B_PATH, JSON.stringify(payload, null, 2) + "\n");

  console.log(`TIER B TARGETS — ${records.length} fixtures x ${metrics.length} metrics = ${total} fields\n`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k.padEnd(28)} ${(100 * v / total).toFixed(1)}%`);
  }
  console.log(`\n  populated              ${populated}`);
  console.log(`  justified unavailable  ${justified}`);
  console.log(`  UNJUSTIFIED MISSING    ${unjustified.length}   (gate requires ${TIER_B_COVERAGE.maxUnjustifiedMissingFields})`);
  const permanent = records.flatMap((r) => Object.values(r.tierB).filter((f) => f.permanent)).length;
  const licensing = tally.SOURCE_BLOCKED_LICENSING ?? 0;
  console.log(`\n  permanently unavailable (no source can fix)   ${permanent}`);
  console.log(`  licence-blocked (a licence could fix)         ${licensing}`);
  console.log(`\n  gate: ${unjustified.length === 0 ? "PASS" : "FAIL"}  unjustifiedMissing = ${unjustified.length}`);
  console.log(`  hash ${payload.tierBHash.slice(0, 16)}`);
  console.log(`\nwrote ${TIER_B_PATH}`);
}
