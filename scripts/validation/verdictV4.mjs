#!/usr/bin/env node
// ── Replacement formal-validation verdict ───────────────────────────────────
//   npm run validation:6c3r:verdict
// Reads the V4 results and issues the verdict the FROZEN policy produced.
// Diagnosis sits beside the verdict, never instead of it.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "./preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const v4 = readArtifact("historical-holdout-v4-results", DIR);
  const policy = readArtifact("historical-holdout-v4-policy", DIR).data;
  const pres = readArtifact("historical-v3-preservation-manifest", DIR).data;
  const def = defaultRuntimeParameterSet();
  const live = buildCoreManifest();

  const coreUnchanged = live.aggregateCoreHash === v4.data.identity.coreHash;
  const paramUnchanged = def.parameterSetHash === v4.data.identity.parameterSetHash;
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  const syntheticAccess = setAccessCount("synthetic-stress-holdout-v2");

  let combined;
  if (!coreUnchanged || !paramUnchanged) combined = "HISTORICAL_V4_INVALID";
  else if (v4.data.verdict === "HISTORICAL_HOLDOUT_V4_FAIL") combined = "HISTORICAL_V4_FAILED";
  else if (v4.data.verdict === "HISTORICAL_HOLDOUT_V4_PASS" && syntheticAccess === 0) combined = "HISTORICAL_V4_PASSED_SYNTHETIC_PENDING";
  else combined = "HISTORICAL_V4_INVALID";

  const hardFails = v4.data.results.flatMap((r) => [
    ...r.teamA.traits.filter((t) => t.hardFail).map((t) => ({ matchupId: r.matchupId, team: `${r.teamA.teamName} ${r.teamA.season}`, ...t })),
    ...r.teamB.traits.filter((t) => t.hardFail).map((t) => ({ matchupId: r.matchupId, team: `${r.teamB.teamName} ${r.teamB.season}`, ...t }))]);
  const PRACTICAL = { pppVsReference: 0.02, refPppVsTeam: 0.02, gamePace: 1.0, threeShare: 0.02, orebRate: 0.02, orebRateAgainst: 0.02, assistedRate: 0.02, movementShare: 0.03, transitionShare: 0.03, pnrShare: 0.03, postUpShare: 0.03, isolationShare: 0.03, interiorShotShare: 0.03 };
  const substantive = hardFails.filter((t) => Math.abs(t.diff) >= (PRACTICAL[t.metric] ?? 0.02));
  const marginal = hardFails.filter((t) => Math.abs(t.diff) < (PRACTICAL[t.metric] ?? 0.02));

  const payload = {
    formalHoldoutVerdictVersion: VALIDATION_VERSIONS.formalHoldoutVerdictVersion,
    combinedVerdict: combined,
    calibrationStatusAfterVerdict: combined.startsWith("HISTORICAL_V4_FAILED") ? "HOLDOUT_FAILED" : combined === "HISTORICAL_V4_INVALID" ? "HOLDOUT_VALIDATION_INVALID" : "PENDING_SYNTHETIC",
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    historicalV3: { verdict: "HISTORICAL_HOLDOUT_FAIL", failureClass: pres.failureClass,
      accessCount: setAccessCount("historical-holdout-v3"), preserved: true,
      supersededAsValidAttemptBy: "attempt-2-historical-v4",
      note: "V4 supersedes V3 as the valid formal attempt because V3's surface could not identify what it scored. The V3 FAIL record itself is permanent." },
    historicalV4: {
      verdict: v4.data.verdict, accessCountBefore: v4.data.accessCountBefore, accessCountAfter: setAccessCount("historical-holdout-v4"),
      matchups: v4.data.matchupsEvaluated, totalGames: v4.data.totalGames, erasCovered: v4.data.erasCovered.length,
      runHash: v4.data.runHash,
      invalidRunRecovery: "The first invocation crashed after unlock on a runner-only defect (the profile map omitted the v3 store the era references live in). Under the frozen transactional policy the access event was consumed and the run RESUMED under the same event with identical identity hashes; no second attempt was created, and no hashed input changed.",
      gates: v4.data.gates,
      numeric: v4.data.numeric,
      traits: { scored: v4.data.traits.scored, passed: v4.data.traits.passed, passRate: v4.data.traits.passRate,
        hardFails: hardFails.length, notScoredUnobservable: v4.data.traits.notScoredUnobservable },
    },
    syntheticHoldoutV2: { verdict: "NOT_OPENED", accessCount: syntheticAccess, state: "SEALED_UNREAD",
      notOpenedBecause: "The frozen failure policy forbids opening the synthetic holdout after a historical failure. It remains available to a future candidate or validation cycle." },
    candidateImmutability: {
      coreHashAtV4: v4.data.identity.coreHash, coreHashNow: live.aggregateCoreHash, coreUnchanged,
      parameterSetHash: def.parameterSetHash, parameterUnchanged: paramUnchanged, parameterDrift: drift.map((p) => p.id),
      parameterChangesAfterHoldout: 0, policyChangesAfterHoldout: 0, seedChangesAfterHoldout: 0,
      targetChangesAfterHoldout: 0, referenceChangesAfterHoldout: 0, traitRegistryChangesAfterHoldout: 0,
      postHoldoutTuning: "NONE",
    },
    whatV4Established: {
      surfaceValidity: "Unlike V3, every scored trait was certified observable on an identifiable surface before the run, so this verdict is about the CANDIDATE, not the ruler.",
      quantitative: `Composite five-share error ${v4.data.numeric.holdoutComposite} against an internal baseline of ${v4.data.numeric.internalBaselineMean} on the same surface — ratio ${v4.data.numeric.ratio}, the second consecutive decisive pass of the generalisation gate. The share proxy generalises to sixteen never-seen team-seasons.`,
      structural: `${v4.data.totalGames} games: zero invariant failures, zero final ties, replay exact on all twenty-four surfaces, zero impossible scores, zero three-point attempts in pre-three eras.`,
      qualitative: `${v4.data.traits.passed} of ${v4.data.traits.scored} scored traits pass (${v4.data.traits.passRate}); ${hardFails.length} are significantly opposite their documented direction, and the frozen policy allows zero.`,
    },
    diagnosis: {
      verdictClass: "CANDIDATE_TRAIT_FIDELITY_FAILURE_ON_A_VALID_SURFACE",
      substantiveHardFails: substantive.map((t) => ({ matchupId: t.matchupId, team: t.team, traitId: t.traitId, metric: t.metric, diff: t.diff, z: t.z })),
      marginalHardFails: marginal.map((t) => ({ matchupId: t.matchupId, team: t.team, traitId: t.traitId, metric: t.metric, diff: t.diff, z: t.z })),
      substantiveCount: substantive.length, marginalCount: marginal.length,
      substantiveReading: "Real candidate findings: documented elite defences (1978-79 SuperSonics +0.086, 1989-90 Pistons +0.058 points per possession conceded above the reference baseline) and elite offences (1991-92 Bulls -0.065, 1977-78 Spurs -0.048 below it) render directionally opposite their documented identity by practically meaningful margins, and the 1991-92 Bulls produce EXACTLY ZERO movement-family actions in 4,096 games under their documented motion identity — a degenerate coach-action rendering.",
      marginalReading: "Hard fails whose magnitudes are trivial (three-point share 0.003 low at z 3.6) exist because the frozen policy carries no practical-equivalence margin on the hard-fail rule. Phase 6C2C6 established exactly that discipline for side bias, and this policy failed to inherit it. Recorded as a policy-design defect for the next cycle; NOT used to re-score this run, because the substantive failures alone also breach the zero-hard-fail gate and the 1970s matchup fails a majority of its traits either way.",
      wouldTheVerdictChangeWithPracticalMargins: false,
    },
    consequences: [
      "Candidate 0 is NOT holdout validated. calibrationStatus = HOLDOUT_FAILED.",
      "Synthetic Stress Holdout V2 is NOT opened and remains sealed and unread, available to a future cycle.",
      "No preview package is prepared. Preview preparation requires both holdouts passing.",
      "Candidate 0 is NOT changed. Core, parameters, policies, seeds, targets, references and registry are untouched since the freeze.",
      "historical holdout v4 is CONSUMED at access count 1. A future attempt requires a Historical Holdout V5 built from further unseen team-seasons.",
      "Historical Holdout V3's formal FAIL remains preserved and unrescored.",
    ],
    nextEngineering: [
      "The trait-fidelity failures are now specific and mechanical: era-reference-relative defensive quality for three documented elite defences, offensive quality for two documented elite offences, and a coach action-mix rendering that produces zero movement actions for one system. These are engine-behaviour findings a future candidate can address — which requires a NEW candidate version, a new parameter-set hash if parameters move, a Historical Holdout V5, and a fresh validation cycle.",
      "Carry the 6C2C6 practical-equivalence discipline into the next trait policy: a hard fail should require BOTH statistical significance and a practical margin.",
      "The unused eligible pool teams (13 remain) plus further source expansion can seed Historical Holdout V5 without re-using any consumed fixture.",
    ],
  };
  payload.verdictHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const { path } = writeArtifact("replacement-formal-verdict", payload, {
    generationCommand: "npm run validation:6c3r:verdict",
    sourceArtifacts: [`${DIR}/historical-holdout-v4-results.json`, `${DIR}/historical-v3-preservation-manifest.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });

  console.log("REPLACEMENT FORMAL VERDICT\n");
  console.log(`  combined verdict        ${payload.combinedVerdict}`);
  console.log(`  calibration status      ${payload.calibrationStatusAfterVerdict}`);
  console.log(`  V3 (preserved)          ${payload.historicalV3.verdict} / ${payload.historicalV3.failureClass} / access ${payload.historicalV3.accessCount}`);
  console.log(`  V4                      ${payload.historicalV4.verdict} / access ${payload.historicalV4.accessCountAfter}`);
  console.log(`  synthetic V2            ${payload.syntheticHoldoutV2.verdict} / access ${payload.syntheticHoldoutV2.accessCount}`);
  console.log(`  core unchanged          ${coreUnchanged} · parameters unchanged ${paramUnchanged} · drift ${drift.length}`);
  console.log(`  hard fails              ${hardFails.length} (${substantive.length} substantive, ${marginal.length} marginal)`);
  console.log(`  verdict would change with practical margins: ${payload.diagnosis.wouldTheVerdictChangeWithPracticalMargins}`);
  console.log(`  verdictHash             ${payload.verdictHash}`);
  console.log(`\nwrote ${path}`);
  process.exit(combined === "HISTORICAL_V4_FAILED" ? 1 : 0);
}
