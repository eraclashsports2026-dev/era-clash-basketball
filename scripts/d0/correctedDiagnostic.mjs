#!/usr/bin/env node
// ── WS10-policy + WS12: corrected V6 diagnostic under the certified data plane ─
//   npm run d0:corrected-v6 [-- --pairs=1024]
//
// CORRECTED_INPUT_DIAGNOSTIC · NOT_FORMAL · NOT_UNSEEN. Candidate 2 unchanged.
// Reference self-baselines are re-derived first, because enrichment reaches the
// reference fives through the same registry the subjects use — measuring
// enriched subjects against stale baselines would repeat the asymmetry defect
// in the opposite direction.
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildRunnerProfileMap, runnerProfileMapProvenance } from "../validation/profileMap.mjs";
import { playSurface, scoreTrait } from "../validation/evalV4.mjs";
import { referenceTeam, loadReferences } from "../validation/eraReferences.mjs";
import { summarise, METRICS as METRIC_CATALOGUE } from "../validation/surface.mjs";
import { validateHardFailCluster } from "../candidate3/clusterSchema.mjs";
import { v6SurfaceSeed } from "../v6/seeds.mjs";
import { versionOf } from "../../src/versions.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { DIR, D1, C2D, C1D, sha, r5, r2 } from "./paths.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1024);
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const c2lock = readArtifact("candidate2-lock", C1D).data;
  if (core.aggregateCoreHash !== c2lock.coreHash) { console.error("REFUSED: core drifted"); process.exit(2); }

  // ── freeze the recertification/diagnostic policy BEFORE running ──────────
  if (!artifactExists("candidate2-corrected-profile-recertification-policy", DIR)) {
    writeArtifact("candidate2-corrected-profile-recertification-policy", {
      candidate2RecertificationVersion: "1.0.0",
      frozenBeforeAnyCorrectedRun: true,
      engine: { candidateId: "Candidate 2", coreHash: core.aggregateCoreHash,
        parameterSetHash: def.parameterSetHash, calibrationVersion: versionOf("possessionCalibrationVersion"),
        engineChangesPermitted: false },
      uses: ["historical calibration corpus", "consumed V6 diagnostics (CORRECTED_INPUT_DIAGNOSTIC)",
        "era references (re-derived baselines)", "synthetic development results (unchanged by calibration data — public cards only)",
        "existing replay/invariant/symmetry/probability/competition certifications, which consume no calibration profile"],
      doesNotUse: ["Synthetic V2", "any V7 pool", "any unseen formal set"],
      metrics: "the frozen V6 metric set and practical margins (historical-v6-practical-margins), applied per trait with the dual gate",
      sampleVolumes: { correctedDiagnosticPairsPerSurface: pairs, referenceSelfBaselinePairs: pairs },
      seeds: "tier-0 diagnostic block of the HISTORICAL_V6_FORMAL domain (v6SurfaceSeed tier 0) — never the formal decision tiers",
      classificationRules: {
        DATA_PIPELINE_RESOLVED: "hard fail under formal inputs; passes or drops inside margin with complete records, before enrichment mattered",
        ROLE_BACKFILL_RESOLVED: "resolves only once role enrichment is present",
        DEFENSIVE_EVIDENCE_RESOLVED: "resolves only once defensive-evidence enrichment is present",
        DATA_LIMITATION: "input the sources cannot provide (e.g. unrecorded splits); no engine change can honestly compensate",
        REFERENCE_LIMITATION: "the reference instrument cannot carry the claim",
        TRAIT_MAPPING_LIMITATION: "the claim/metric mapping is the defect",
        REAL_ENGINE_FAILURE: "persists with complete inputs AND reproduces on non-V6 development controls",
        INCONCLUSIVE: "insufficient evidence to classify",
      },
      passFailRules: "a diagnostic classification never changes the formal V6 verdict; REAL_ENGINE_FAILURE routes to the persistent-failure workstream",
    }, { generationCommand: "npm run d0:corrected-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  }

  const before = { v6: setAccessCount("historical-holdout-v6"), syn: setAccessCount("synthetic-stress-holdout-v2") };
  const map = await buildRunnerProfileMap();
  const prov = await runnerProfileMapProvenance();
  const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
  const refs = loadReferences().data.references;
  const margins = readArtifact("historical-v6-practical-margins", C2D).data;
  const METRIC_IDS = Object.keys(METRIC_CATALOGUE);

  console.log(`CORRECTED V6 DIAGNOSTIC — enriched data plane, ${pairs * 2} games per surface\n`);
  console.log("  re-deriving reference self-baselines (enrichment reaches references too)…");
  const baselines = {};
  for (const [i, era] of ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"].entries()) {
    const refDef = refs.find((r) => r.era === era);
    const run = playSurface({ subject: referenceTeam({ era, five: refDef.five }, map),
      opponent: referenceTeam({ era, five: refDef.five }, map), eraStyleId: era,
      seedAt: (k) => v6SurfaceSeed({ tier: 0, matchupIndex: i, surfaceIndex: 0, pairIndex: k }), pairs });
    baselines[era] = Object.fromEntries(METRIC_IDS.map((id) => [id, summarise(run.samples, METRIC_CATALOGUE[id].field)]));
  }

  const { teamFromSide } = await import("../candidate3/remeasure.mjs");
  const formalBySide = new Map();
  for (const u of readArtifact("historical-v6-fixture-results", "data/validation/6c4c3").data.units) {
    for (const t of u.observableTraitResults) formalBySide.set(`${u.matchupId}|${u.side}|${t.traitId}`, t);
  }
  const priorRemeasure = readArtifact("historical-v6-remeasurement", D1).data;
  const priorBySide = new Map(priorRemeasure.rows.map((r) => [`${r.matchupId}|${r.side}|${r.traitId}`, r]));

  const rows = [];
  for (const [mi, x] of manifest.matchups.entries()) {
    const refDef = refs.find((r) => r.era === x.eraStyleId);
    const ref = referenceTeam({ era: x.eraStyleId, five: refDef.five }, map);
    for (const [si, side] of ["teamA", "teamB"].entries()) {
      const s = x[side];
      const team = teamFromSide(s, map);
      const run = playSurface({ subject: team, opponent: ref, eraStyleId: x.eraStyleId,
        seedAt: (k) => v6SurfaceSeed({ tier: 0, matchupIndex: mi, surfaceIndex: si + 1, pairIndex: k }), pairs });
      for (const t of s.scoredTraits) {
        const scored = scoreTrait({ traitId: t.traitId, vsRefSamples: run.samples,
          refBaselines: baselines[x.eraStyleId], eraStyleId: x.eraStyleId });
        const margin = margins.metrics[t.metric]?.margin ?? null;
        const beyond = margin != null && scored.diff != null && Math.abs(scored.diff) > margin;
        const hardFail = scored.hardFail === true && beyond;
        const formal = formalBySide.get(`${x.matchupId}|${side}|${t.traitId}`) ?? null;
        const prior = priorBySide.get(`${x.matchupId}|${side}|${t.traitId}`) ?? null;
        rows.push({ matchupId: x.matchupId, eraStyleId: x.eraStyleId, side, teamName: s.teamName,
          teamSeason: s.season, traitId: t.traitId, metricId: t.metric, expectedDirection: t.direction,
          practicalMargin: margin,
          originalFormalResult: formal ? { diff: formal.diff, hardFail: formal.hardFail === true, state: formal.reportedState } : null,
          completeInputsPreEnrichment: prior ? { diff: prior.remeasured.diff, hardFail: prior.remeasured.hardFail } : null,
          correctedDiagnostic: { subjectMean: r5(scored.subjectMean), referenceMean: r5(scored.referenceMean),
            diff: scored.diff, result: scored.result, hardFail, beyondPracticalMargin: beyond },
        });
      }
      console.log(`  ${x.eraStyleId} ${side.padEnd(6)} ${(s.teamName + " " + s.season).padEnd(31)} done`);
    }
  }

  // ── classify every original formal failure ───────────────────────────────
  const failures = rows.filter((r) => r.originalFormalResult && r.originalFormalResult.state !== "PASS"
    && (r.originalFormalResult.hardFail || r.originalFormalResult.state !== "PASS"));
  const classify = (r) => {
    if (!r.originalFormalResult.hardFail) return r.correctedDiagnostic.hardFail ? "INCONCLUSIVE" : "DATA_PIPELINE_RESOLVED";
    if (!r.correctedDiagnostic.hardFail) {
      const preEnrichHard = r.completeInputsPreEnrichment?.hardFail;
      return preEnrichHard === false ? "DATA_PIPELINE_RESOLVED"
        : r.metricId === "refPppVsTeam" ? "DEFENSIVE_EVIDENCE_RESOLVED" : "ROLE_BACKFILL_RESOLVED";
    }
    return "PERSISTENT_PENDING_ENGINE_PROOF";
  };
  const classified = failures.map((r) => ({ ...r, classification: classify(r) }));
  const persistent = classified.filter((r) => r.classification === "PERSISTENT_PENDING_ENGINE_PROOF");
  // clusters with schema enforcement
  const ckey = (r) => [r.matchupId, r.side, r.metricId, r.expectedDirection,
    r.correctedDiagnostic.subjectMean, r.correctedDiagnostic.referenceMean].join("|");
  const cmap = new Map();
  for (const r of rows.filter((x) => x.correctedDiagnostic.hardFail)) {
    if (!cmap.has(ckey(r))) cmap.set(ckey(r), []);
    cmap.get(ckey(r)).push(r);
  }
  const clusters = [...cmap.values()].map((mem, i) => {
    const c = { clusterId: `cv6-${String(i + 1).padStart(2, "0")}`, matchupId: mem[0].matchupId,
      side: mem[0].side, eraStyleId: mem[0].eraStyleId, teamName: mem[0].teamName, teamSeason: mem[0].teamSeason,
      metricId: mem[0].metricId, measurementSurface: "VS_ERA_REFERENCE",
      expectedDirection: mem[0].expectedDirection,
      subjectMean: mem[0].correctedDiagnostic.subjectMean, referenceMean: mem[0].correctedDiagnostic.referenceMean,
      difference: mem[0].correctedDiagnostic.diff, practicalMargin: mem[0].practicalMargin,
      zScore: 0, formalTraitLabels: mem.map((m) => m.traitId), formalLabelCount: mem.length };
    validateHardFailCluster(c);   // the schema enforcement, live
    return c;
  });

  const counts = classified.reduce((a, r) => { a[r.classification] = (a[r.classification] ?? 0) + 1; return a; }, {});
  const passNow = rows.filter((r) => r.correctedDiagnostic.result === "PASS").length;
  console.log(`\n  original failing instances ${failures.length} · corrected hard-fail labels ${rows.filter((r) => r.correctedDiagnostic.hardFail).length} · clusters ${clusters.length}`);
  console.log(`  classifications: ${JSON.stringify(counts)}`);
  console.log(`  corrected trait pass rate ${r2(passNow / rows.length)}`);
  if (persistent.length) {
    console.log("\n  PERSISTENT (pending engine proof on non-V6 controls):");
    for (const p of persistent) console.log(`    ${p.eraStyleId} ${(p.teamName + " " + p.teamSeason).padEnd(30)} ${p.metricId.padEnd(15)} diff ${p.correctedDiagnostic.diff} (margin ${p.practicalMargin})`);
  }
  const after = { v6: setAccessCount("historical-holdout-v6"), syn: setAccessCount("synthetic-stress-holdout-v2") };

  writeArtifact("corrected-v6-diagnostic-results", {
    correctedV6DiagnosticVersion: "1.0.0",
    labels: ["CORRECTED_INPUT_DIAGNOSTIC", "NOT_FORMAL", "NOT_UNSEEN"],
    candidate: { candidateId: "Candidate 2", coreHash: core.aggregateCoreHash, engineUnchanged: true },
    dataPlane: { registryHash: prov.registryHash, enrichmentApplied: prov.enrichmentApplied },
    gamesPerSurface: pairs * 2, referenceBaselines: "re-derived under the enriched data plane",
    rows, originalFailures: classified, classificationCounts: counts,
    correctedTraitPassRate: r2(passNow / rows.length),
    formalVerdictUnchanged: "HISTORICAL_HOLDOUT_V6_FAIL stands; adjudicated INVALID; this artifact issues no formal verdict",
    accessDeltas: { v6: after.v6 - before.v6, synthetic: after.syn - before.syn },
  }, { generationCommand: "npm run d0:corrected-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("corrected-v6-persistent-clusters", {
    correctedV6DiagnosticVersion: "1.0.0", clusterCount: clusters.length, clusters,
    schemaEnforced: "every cluster passed validateHardFailCluster — non-null means, schema-known fields only",
    pendingEngineProof: persistent.map((p) => ({ metricId: p.metricId, teamName: p.teamName,
      teamSeason: p.teamSeason, diff: p.correctedDiagnostic.diff, margin: p.practicalMargin })),
  }, { generationCommand: "npm run d0:corrected-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  process.exit(0);
}
