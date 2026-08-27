#!/usr/bin/env node
// ── Re-measure the V6 diagnostics with inputs the teams actually have ───────
//   npm run c3:remeasure [-- --pairs=1024]
//
// V6 is consumed and usable only as FAILED_HOLDOUT_DIAGNOSTIC_SET. This does not
// rescore it: the formal verdict stands. It answers one question — how much of
// the observed trait failure was the harness handing every historical team a
// degraded season record, and how much is a real mechanic failure?
//
// Candidate 2's core is untouched. profileMap.mjs, evalV4.mjs and the V6 runner
// are validation-only files, absent from the 53-file core, so nothing here
// changes a candidate.
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { playSurface, scoreTrait } from "../validation/evalV4.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { v6SurfaceSeed } from "../v6/seeds.mjs";
import { DIR, C2D, C3D, sha, r2, avg, allSeasonRecords, ADAPTER_INPUTS } from "./paths.mjs";

/** The corrected map: every calibration store, not only v3 and v4. */
export const correctedProfileMap = async () => {
  const base = await buildRunnerProfileMap();
  const all = allSeasonRecords();
  const merged = new Map(base);
  let added = 0;
  for (const [id, rec] of all) if (!merged.has(id)) { merged.set(id, rec); added += 1; }
  return { map: merged, added, baseSize: base.size };
};

/** A team built from full season records, with no degraded fallback permitted. */
export const teamFromSide = (side, profiles, { requireFullRecord = true } = {}) => {
  const profs = side.players.map((p) => {
    const rec = profiles.get(p.calibrationPlayerId);
    if (!rec) throw new Error(`no season record for ${p.calibrationPlayerId}`);
    if (requireFullRecord) {
      const missing = ADAPTER_INPUTS.filter((f) => !(f in rec));
      // `accolades` is absent from every store record by design; the adapter
      // treats it as an optional list. Anything else missing means a degraded
      // record reached the engine, which is the defect being measured.
      const material = missing.filter((f) => f !== "accolades");
      if (material.length) throw new Error(`${p.calibrationPlayerId} is missing ${material.join(", ")}`);
    }
    return buildCalibrationPlayerProfile(rec);
  });
  const playerCards = profs.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos,
    positions: p.positions, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0,
    an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
  const positionAssignments = side.players.map((p) => p.assignedPosition);
  return { playerCards, playerIntelligence: profs,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profs, positionAssignments, ctx: {} }),
    coachId: side.coachId, coachIntelligence: buildCoachIntelligence(side.coachId), positionAssignments };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1024);
  const def = defaultRuntimeParameterSet();
  const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
  const refs = readArtifact("era-reference-certification-candidate2", C2D).data.references;
  const margins = readArtifact("historical-v6-practical-margins", C2D).data;
  const register = readArtifact("historical-v6-diagnostic-register", DIR).data;
  const { map, added, baseSize } = await correctedProfileMap();

  console.log(`V6 DIAGNOSTIC RE-MEASUREMENT — corrected inputs, ${pairs * 2} games per surface\n`);
  console.log(`  profile map: ${baseSize} records from v3+v4, ${added} added from v5+v6 -> ${map.size}\n`);

  // the formal run's own numbers, for comparison
  const formalBySide = new Map();
  for (const u of readArtifact("historical-v6-fixture-results", C3D).data.units) {
    for (const t of u.observableTraitResults) {
      formalBySide.set(`${u.matchupId}|${u.side}|${t.traitId}`, t);
    }
  }

  const rows = [];
  for (const [mi, x] of manifest.matchups.entries()) {
    const refDef = refs.find((r) => r.era === x.eraStyleId);
    const ref = referenceTeam({ era: refDef.era, five: refDef.five }, map);
    for (const [si, side] of ["teamA", "teamB"].entries()) {
      const s = x[side];
      const team = teamFromSide(s, map);
      const run = playSurface({ subject: team, opponent: ref, eraStyleId: x.eraStyleId,
        seedAt: (i) => v6SurfaceSeed({ tier: 0, matchupIndex: mi, surfaceIndex: si + 1, pairIndex: i }), pairs });
      for (const t of s.scoredTraits) {
        const scored = scoreTrait({ traitId: t.traitId, vsRefSamples: run.samples,
          refBaselines: refDef.candidate2SelfBaselines, eraStyleId: x.eraStyleId });
        const margin = margins.metrics[t.metric]?.margin ?? null;
        const formal = formalBySide.get(`${x.matchupId}|${side}|${t.traitId}`) ?? null;
        const beyond = margin != null && scored.diff != null && Math.abs(scored.diff) > margin;
        rows.push({ matchupId: x.matchupId, eraStyleId: x.eraStyleId, side,
          teamName: s.teamName, teamSeason: s.season, traitId: t.traitId, metricId: t.metric,
          expectedDirection: t.direction, practicalMargin: margin,
          formal: formal ? { subjectMean: formal.subjectMean, referenceMean: formal.referenceMean,
            diff: formal.diff, result: formal.result, hardFail: formal.hardFail === true,
            reportedState: formal.reportedState } : null,
          remeasured: { subjectMean: r2(scored.subjectMean), referenceMean: r2(scored.referenceMean),
            diff: scored.diff, result: scored.result,
            hardFail: scored.hardFail === true && beyond, beyondPracticalMargin: beyond },
          changed: formal ? (formal.hardFail === true) !== (scored.hardFail === true && beyond) : null });
      }
      console.log(`  ${x.eraStyleId} ${side.padEnd(6)} ${(s.teamName + " " + s.season).padEnd(31)} traits ${s.scoredTraits.length}`);
    }
  }

  const formalHard = rows.filter((r) => r.formal?.hardFail);
  const nowHard = rows.filter((r) => r.remeasured.hardFail);
  const resolved = formalHard.filter((r) => !r.remeasured.hardFail);
  const persist = formalHard.filter((r) => r.remeasured.hardFail);
  const newHard = nowHard.filter((r) => !r.formal?.hardFail);
  const passNow = rows.filter((r) => r.remeasured.result === "PASS").length;

  console.log(`\n  formal hard-fail labels        ${formalHard.length}`);
  console.log(`  re-measured hard-fail labels   ${nowHard.length}`);
  console.log(`  resolved by corrected inputs   ${resolved.length}`);
  console.log(`  persisting after correction    ${persist.length}`);
  console.log(`  newly hard-failing             ${newHard.length}`);
  console.log(`  trait pass rate  formal ${readArtifact("historical-v6-formal-results", C3D).data.traits.passRate} -> re-measured ${r2(passNow / rows.length)}`);

  if (persist.length) {
    console.log("\n  PERSISTING after corrected inputs — these are candidate mechanic failures:");
    for (const r of persist) console.log(`    ${r.eraStyleId} ${(r.teamName + " " + r.teamSeason).padEnd(30)} ${r.metricId.padEnd(16)} formal diff ${String(r.formal.diff).padStart(9)} -> re-measured ${String(r.remeasured.diff).padStart(9)} (margin ${r.practicalMargin})`);
  }
  if (resolved.length) {
    console.log("\n  RESOLVED by corrected inputs — these were instrumentation, not mechanics:");
    for (const r of resolved) console.log(`    ${r.eraStyleId} ${(r.teamName + " " + r.teamSeason).padEnd(30)} ${r.metricId.padEnd(16)} formal diff ${String(r.formal.diff).padStart(9)} -> re-measured ${String(r.remeasured.diff).padStart(9)} (margin ${r.practicalMargin})`);
  }

  const payload = {
    historicalV6RemeasurementVersion: "1.0.0",
    purpose: "separate instrumentation loss from mechanic failure on the consumed V6 set",
    notARescore: "Historical V6's formal verdict, gates and access artifacts are untouched. This is a diagnostic re-measurement on a consumed set used as FAILED_HOLDOUT_DIAGNOSTIC_SET.",
    candidateUnchanged: { note: "profileMap.mjs, evalV4.mjs and the V6 runner are validation-only and absent from the 53-file Candidate 2 core. No candidate code changed.",
      possessionCalibrationVersion: "1.2.0" },
    gamesPerSurface: pairs * 2,
    profileMap: { baseSize, addedFromV5AndV6: added, correctedSize: map.size },
    formalHardFailLabels: formalHard.length, remeasuredHardFailLabels: nowHard.length,
    resolvedByCorrectedInputs: resolved.length, persistingAfterCorrection: persist.length,
    newlyHardFailing: newHard.length,
    formalTraitPassRate: readArtifact("historical-v6-formal-results", C3D).data.traits.passRate,
    remeasuredTraitPassRate: r2(passNow / rows.length),
    rows, resolved, persisting: persist, newlyHardFailingRows: newHard,
    registerFailureCount: register.failingInstanceCount,
  };
  payload.remeasurementHash = sha(rows.map((r) => [r.matchupId, r.side, r.traitId, r.remeasured.diff]));
  writeArtifact("historical-v6-remeasurement", payload,
    { generationCommand: "npm run c3:remeasure", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  process.exit(0);
}
