#!/usr/bin/env node
// ── Internal calibration folds v3 ───────────────────────────────────────────
// Deterministic, stratified, leakage-grouped folds over the sets development is
// permitted to inspect: historical calibration v3 and synthetic development v2.
//
//   npm run calibration:folds
//
// No holdout fixture appears here, and the builder refuses to run if one does.
//
// Leakage is the failure this guards. Two fixtures that are the same basketball
// situation under different names — the same franchise a season apart, the same
// five players, the same archetype rebuilt — must land in the SAME fold. Split
// across folds they would let a candidate memorise a team in tuning and be
// rewarded for recognising it in validation, which looks like generalisation and
// is not.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";
import {
  HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_DEVELOPMENT_V2,
  SYNTHETIC_STRESS_HOLDOUT_V2, historicalCalibrationV3Ids,
} from "../../data/calibration/sets-v3.mjs";
import { versionOf } from "../../src/versions.js";

export const FOLDS_PATH = "data/calibration/internal-folds-v3.json";
export const FOLD_COUNT = 4;

/** Refuses a sealed fixture by construction rather than by convention. */
export const assertNoHoldout = (members) => {
  const sealedIds = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id)]);
  const bad = members.filter((m) => sealedIds.has(m.id));
  if (bad.length) throw new Error(`folds contain sealed holdout fixtures: ${bad.map((b) => b.id).join(", ")}`);
  const sealedFives = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => JSON.stringify([...f.five].sort())));
  const reused = members.filter((m) => m.five && sealedFives.has(JSON.stringify([...m.five].sort())));
  if (reused.length) throw new Error(`folds reuse sealed holdout lineups: ${reused.map((b) => b.id).join(", ")}`);
  return true;
};

/**
 * The leakage key. Fixtures sharing a key are inseparable and always share a
 * fold. Franchise identity dominates: the same franchise in adjacent seasons is
 * very nearly the same team, and a three-year window is the grouping.
 */
export const leakageKey = (m) => {
  // Franchise-only, deliberately coarse. A three-season window was tried first
  // and put the 1956-57 and 1962-63 Celtics in different folds, which the
  // franchise leakage check then flagged — the grouping key and the check
  // disagreed, and the check was the stricter of the two. With only 24
  // historical fixtures the conservative reading wins: franchise identity is
  // the strongest leakage channel (same organisation, overlapping personnel,
  // shared style tags), so a franchise never straddles folds. The cost is
  // coarser folds; the alternative is a validation number that partly measures
  // memorisation.
  if (m.kind === "historical") return `hist:${m.teamId}`;
  // Synthetic fixtures group by their exact five, so the same lineup rebuilt
  // under a second id cannot straddle folds.
  return `synth:${JSON.stringify([...(m.five ?? [])].sort())}`;
};

/** Deterministic hash-based assignment. No RNG, so the split is reproducible. */
const bucketOf = (key, folds) => {
  const h = createHash("sha256").update(`eraclash:fold:${key}`).digest();
  return h.readUInt32BE(0) % folds;
};

export const buildFolds = ({ folds = FOLD_COUNT } = {}) => {
  const corpus = loadCorpusV3();
  if (!corpus) throw new Error("historical corpus v3 not built");
  const calIds = new Set(historicalCalibrationV3Ids());

  const members = [
    ...corpus.fixtures.filter((f) => calIds.has(f.fixtureId)).map((f) => ({
      kind: "historical", id: f.fixtureId, teamId: f.teamId, season: f.season,
      seasonStartYear: f.seasonStartYear, era: f.eraStyleId, coachId: f.coachId,
      confidence: f.confidence.overallFixtureConfidence,
      five: f.players.map((p) => p.calibrationPlayerId),
      tags: f.qualitativeIdentity?.tags ?? [],
    })),
    ...SYNTHETIC_DEVELOPMENT_V2.map((f) => ({
      kind: "synthetic", id: f.id, teamId: null, season: null, seasonStartYear: null,
      era: f.era, coachId: f.coach, confidence: "SYNTHETIC", five: f.five, tags: [],
    })),
  ];
  assertNoHoldout(members);

  // Group by leakage key, then assign whole groups.
  const groups = new Map();
  for (const m of members) {
    const k = leakageKey(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }

  // Stratify by assigning groups in a deterministic order that interleaves era
  // and kind, so no fold ends up era-starved.
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const assignment = new Map();
  // Round-robin within each (kind, era) stratum, seeded by the hash bucket so
  // the result is stable but not ordered by franchise name.
  const strata = new Map();
  for (const [key, ms] of ordered) {
    const s = `${ms[0].kind}:${ms[0].era}`;
    if (!strata.has(s)) strata.set(s, []);
    strata.get(s).push([key, ms]);
  }
  for (const [, entries] of [...strata.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const start = bucketOf(entries[0][0], folds);
    entries.forEach(([key], i) => assignment.set(key, (start + i) % folds));
  }

  const foldOf = new Map();
  for (const [key, ms] of groups) for (const m of ms) foldOf.set(m.id, assignment.get(key));

  const byFold = Array.from({ length: folds }, (_, i) => ({
    fold: i,
    members: members.filter((m) => foldOf.get(m.id) === i).map((m) => m.id),
    historical: members.filter((m) => foldOf.get(m.id) === i && m.kind === "historical").length,
    synthetic: members.filter((m) => foldOf.get(m.id) === i && m.kind === "synthetic").length,
    eras: [...new Set(members.filter((m) => foldOf.get(m.id) === i).map((m) => m.era))].sort(),
    franchises: [...new Set(members.filter((m) => foldOf.get(m.id) === i && m.teamId).map((m) => m.teamId))].sort(),
    coaches: [...new Set(members.filter((m) => foldOf.get(m.id) === i).map((m) => m.coachId))].sort(),
  }));

  // ── Leakage checks ────────────────────────────────────────────────────────
  const leaks = [];
  // 1. No leakage group straddles folds.
  for (const [key, ms] of groups) {
    const fs = new Set(ms.map((m) => foldOf.get(m.id)));
    if (fs.size > 1) leaks.push({ kind: "GROUP_STRADDLES_FOLDS", key, folds: [...fs] });
  }
  // 2. No franchise appears in more than one fold.
  const franchiseFolds = new Map();
  for (const m of members.filter((x) => x.teamId)) {
    if (!franchiseFolds.has(m.teamId)) franchiseFolds.set(m.teamId, new Set());
    franchiseFolds.get(m.teamId).add(foldOf.get(m.id));
  }
  for (const [team, fs] of franchiseFolds) {
    if (fs.size > 1) leaks.push({ kind: "FRANCHISE_IN_MULTIPLE_FOLDS", key: team, folds: [...fs] });
  }
  // 3. No identical five appears in more than one fold.
  const fiveFolds = new Map();
  for (const m of members) {
    const k = JSON.stringify([...(m.five ?? [])].sort());
    if (!fiveFolds.has(k)) fiveFolds.set(k, new Set());
    fiveFolds.get(k).add(foldOf.get(m.id));
  }
  for (const [k, fs] of fiveFolds) {
    if (fs.size > 1) leaks.push({ kind: "LINEUP_IN_MULTIPLE_FOLDS", key: k.slice(0, 60), folds: [...fs] });
  }

  const payload = {
    internalCalibrationFoldVersion: versionOf("internalCalibrationFoldVersion"),
    purpose: "Deterministic leakage-grouped folds over historical calibration v3 and synthetic development v2. No holdout fixture. Frozen before search.",
    foldCount: folds,
    memberCount: members.length,
    historicalCount: members.filter((m) => m.kind === "historical").length,
    syntheticCount: members.filter((m) => m.kind === "synthetic").length,
    leakageGrouping: {
      groups: groups.size,
      rule: "Historical fixtures group by franchise within a three-season window; synthetic fixtures group by their exact five. Fixtures sharing a key always share a fold.",
    },
    leaks,
    leakFree: leaks.length === 0,
    folds: byFold,
    assignments: Object.fromEntries([...foldOf.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  payload.foldHash = createHash("sha256").update(JSON.stringify(payload.assignments)).digest("hex");
  return payload;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = buildFolds();
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(FOLDS_PATH, JSON.stringify(f, null, 2) + "\n");

  console.log(`INTERNAL FOLDS V3 — ${f.memberCount} members in ${f.foldCount} folds`);
  console.log(`  ${f.historicalCount} historical calibration + ${f.syntheticCount} synthetic development`);
  console.log(`  ${f.leakageGrouping.groups} leakage groups\n`);
  for (const fold of f.folds) {
    console.log(`  fold ${fold.fold}: ${String(fold.members.length).padStart(2)} members (${fold.historical} hist, ${fold.synthetic} synth) · ${fold.eras.length} eras · ${fold.franchises.length} franchises · ${fold.coaches.length} coaches`);
  }
  console.log(`\n  leakage checks: ${f.leakFree ? "CLEAN" : `${f.leaks.length} LEAKS`}`);
  for (const l of f.leaks.slice(0, 8)) console.log(`    ${l.kind}: ${l.key} in folds ${l.folds.join(",")}`);
  console.log(`\n  fold hash ${f.foldHash.slice(0, 16)}`);
  console.log(`\nwrote ${FOLDS_PATH}`);
  process.exit(f.leakFree ? 0 : 2);
}
