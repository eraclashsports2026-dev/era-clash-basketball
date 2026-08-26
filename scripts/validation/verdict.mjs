#!/usr/bin/env node
// ── Formal holdout verdict ──────────────────────────────────────────────────
//   npm run validation:verdict
//
// Reads the holdout results and issues the verdict the FROZEN policy produces.
// It does not re-score, re-weight or reinterpret anything: a gate that was
// frozen before the run is the gate that decides, and a diagnosis of why a gate
// failed is recorded alongside the verdict rather than substituted for it.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT } from "../../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest } from "./preflight.mjs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const hist = readArtifact("historical-holdout-results", ARTIFACT_DIR_6C3);
  const core = readArtifact("candidate-core-manifest", ARTIFACT_DIR_6C3);
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const def = defaultRuntimeParameterSet();
  const synthPath = `${ARTIFACT_DIR_6C3}/synthetic-holdout-results.json`;
  const synth = existsSync(synthPath) ? JSON.parse(readFileSync(synthPath, "utf8")) : null;

  const live = buildCoreManifest();
  const coreUnchanged = live.aggregateCoreHash === core.data.aggregateCoreHash;
  const parameterUnchanged = def.parameterSetHash === lock.data.parameterSetHash;
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);

  const historicalVerdict = hist.data.verdict;
  const syntheticVerdict = synth ? synth.data.verdict : "NOT_OPENED";

  // The combined state. Only one path reaches HOLDOUT_VALIDATED.
  let combined;
  if (!coreUnchanged || !parameterUnchanged) combined = "HOLDOUT_VALIDATION_INVALID";
  else if (historicalVerdict === "HISTORICAL_HOLDOUT_FAIL" && syntheticVerdict === "SYNTHETIC_HOLDOUT_FAIL") combined = "BOTH_HOLDOUTS_FAILED";
  else if (historicalVerdict === "HISTORICAL_HOLDOUT_FAIL") combined = "HISTORICAL_HOLDOUT_FAILED";
  else if (syntheticVerdict === "SYNTHETIC_HOLDOUT_FAIL") combined = "SYNTHETIC_HOLDOUT_FAILED";
  else if (historicalVerdict === "HISTORICAL_HOLDOUT_PASS" && syntheticVerdict === "SYNTHETIC_HOLDOUT_PASS") combined = "HOLDOUT_VALIDATED";
  else combined = "HOLDOUT_VALIDATION_INVALID";

  const failedGates = Object.entries(hist.data.gates).filter(([, v]) => !v).map(([k]) => k);
  const failingFixtures = hist.data.perFixture.filter((f) => !f.pass);

  // ── the diagnosis, recorded beside the verdict and never instead of it ────
  const scored = hist.data.results.flatMap((r) => r.identity.traits.filter((t) => t.scored).map((t) => ({ fixtureId: r.fixtureId, ...t,
    pppGap: r5(Math.abs(r.structural.pointsPerPossession - r.structural.opponentPointsPerPossession)) })));
  const mirrorMetrics = new Set(["pointsPerPossession", "opponentPointsPerPossession"]);
  const structurallyUndecidable = scored.filter((t) => !t.pass && mirrorMetrics.has(t.metric));
  const genuineMisses = scored.filter((t) => !t.pass && !mirrorMetrics.has(t.metric));
  const maxPppGap = Math.max(...hist.data.results.map((r) => Math.abs(r.structural.pointsPerPossession - r.structural.opponentPointsPerPossession)));

  const diagnosis = {
    failedGates,
    failingFixtures: failingFixtures.map((f) => ({ fixtureId: f.fixtureId, reasons: f.failureReasons })),
    rootCause: "MY_VALIDATION_SURFACE_DEFECT_NOT_A_CANDIDATE_DEFECT",
    explanation: "Every fixture plays a MIRROR of itself, which is correct for the Tier C share proxy — that target describes a season's internal distribution and no opponent target exists. But it makes pointsPerPossession and opponentPointsPerPossession the SAME quantity up to seeded noise, because both sides are the same roster. Across all 8 fixtures the two differ by at most " + r5(maxPppGap) + ". An ELITE_DEFENSE trait requires opponentPointsPerPossession below the corpus median while ELITE_OFFENSE requires pointsPerPossession above it, so on a mirror surface the two are near-contradictory. h3-2012-13-heat carries both tags and passed one while failing the other.",
    maxPointsPerPossessionGapAcrossFixtures: r5(maxPppGap),
    scoredTraits: scored.length,
    traitsFailedOnMirrorAmbiguousMetrics: structurallyUndecidable.length,
    traitsFailedOnValidMetrics: genuineMisses.length,
    mirrorAmbiguousFailures: structurallyUndecidable.map((t) => ({ fixtureId: t.fixtureId, trait: t.trait, metric: t.metric, observed: t.observed, referenceMedian: t.referenceMedian })),
    validMetricFailures: genuineMisses.map((t) => ({ fixtureId: t.fixtureId, trait: t.trait, metric: t.metric, observed: t.observed, referenceMedian: t.referenceMedian,
      note: "A real measurement on a metric the mirror surface CAN evaluate. Recorded as a genuine near-miss, not explained away." })),
    whatWasNotReScored: "Nothing. The frozen identity rubric produced these results and the verdict stands on them. Re-scoring opened holdout data under a corrected rubric would be exactly the post-hoc gate movement this phase forbids.",
    whyTheVerdictIsNotDowngradedToInvalidRun: "INVALID_RUN in the frozen policy means the process failed before a valid result existed — a hash mismatch, a crash, a corrupted artifact. Here every other gate produced a valid result, including the central quantitative one. Reclassifying a FAIL as INVALID_RUN because the gate that failed was badly designed is the self-serving direction, and I am not taking it unilaterally. The verdict is FAIL; the defect is recorded for the owner to weigh.",
  };

  const quantitative = {
    gatePassed: hist.data.gates.compositeRatioWithinPolicy,
    internalCompositeMae: hist.data.internalBaseline.mean,
    holdoutCompositeMae: hist.data.holdoutComposite,
    ratio: hist.data.holdoutToInternalRatio,
    ratioGate: hist.data.ratioGate,
    interpretation: "This is the gate the phase was built around, and it passed decisively: holdout error is indistinguishable from internal error at a ratio of " + hist.data.holdoutToInternalRatio + " against a 1.5 threshold. It is a valid result and independent of the identity-rubric defect. It says the calibration did not overfit its own folds; it does not say the engine is historically accurate, because 216 of 240 team-level target cells were unavailable.",
    structuralGatesPassed: ["zeroInvariantFailures", "zeroFinalTies", "replayExactEverywhere", "noImpossibleStatistics",
      "opportunityWithinBounds", "eraRulesAuthoritative", "zeroCatastrophicFixtures", "noHighConfidenceFixtureFails", "everyFixtureExecuted"]
      .filter((g) => hist.data.gates[g] === true),
  };

  const payload = {
    formalHoldoutVerdictVersion: versionOf("formalHoldoutVerdictVersion"),
    combinedVerdict: combined,
    historicalHoldout: {
      verdict: historicalVerdict,
      accessCountAfter: setAccessCount("historical-holdout-v3"),
      fixtures: hist.data.fixturesEvaluated, gamesPerFixture: hist.data.gamesPerFixture, totalGames: hist.data.totalGames,
      erasCovered: hist.data.erasCovered, runHash: hist.data.runHash,
      gates: hist.data.gates,
    },
    syntheticHoldout: {
      verdict: syntheticVerdict,
      accessCountAfter: setAccessCount("synthetic-stress-holdout-v2"),
      notOpenedBecause: syntheticVerdict === "NOT_OPENED"
        ? "The historical holdout did not pass. The frozen failure policy forbids opening the synthetic holdout after a historical failure, so it remains SEALED_UNREAD and is still available to a future candidate."
        : null,
    },
    candidateImmutability: {
      coreHashAtHoldout: core.data.aggregateCoreHash,
      coreHashNow: live.aggregateCoreHash,
      coreUnchanged,
      parameterSetHash: def.parameterSetHash,
      parameterUnchanged,
      parameterDrift: drift.map((p) => p.id),
      parameterChangesAfterHoldout: 0,
      policyChangesAfterHoldout: 0,
      postHoldoutTuning: "NONE",
    },
    quantitative,
    diagnosis,
    calibrationStatusAfterVerdict: combined === "HOLDOUT_VALIDATED" ? "HOLDOUT_VALIDATED" : "HOLDOUT_FAILED",
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    consequences: combined === "HOLDOUT_VALIDATED" ? [] : [
      "Candidate 0 is NOT holdout validated.",
      "The synthetic stress holdout is NOT opened and remains sealed and unread.",
      "No preview integration and no preview deployment. Both are gated on a passing holdout.",
      "Candidate 0 is NOT changed. Its parameter values, core and lock manifest are untouched.",
      "historical holdout v3 is CONSUMED. Access count 1. It cannot validate this or any candidate again.",
      "Any future attempt needs a replacement historical holdout drawn from fixtures this candidate has never been evaluated against.",
    ],
    replacementHoldoutRecommendation: combined === "HOLDOUT_VALIDATED" ? null : {
      required: true,
      why: "historical holdout v3 is consumed regardless of which label the failure carries.",
      beforeReRunning: [
        "Fix the identity rubric so no trait is scored on a metric the evaluation surface cannot distinguish. On a mirror surface that rules out opponent-relative metrics entirely.",
        "Decide whether an opponent-relative identity claim can be tested at all without opponent targets. If it cannot, it should not be a gate.",
        "Expand the rubric vocabulary: 51 of 58 identity traits had no rubric entry, so the qualitative gate rested on 7 traits across 8 fixtures.",
        "Freeze the corrected rubric, and its reference medians, before the replacement holdout is opened.",
      ],
      candidateDecision: "OWNER. The quantitative generalisation evidence is strong and valid. Whether Candidate 0 is re-validated unchanged against a replacement holdout, or a new candidate is built first, is not an engineering call.",
    },
  };
  payload.verdictHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const { path } = writeArtifact("formal-holdout-verdict", payload, {
    generationCommand: "npm run validation:verdict",
    sourceArtifacts: [`${ARTIFACT_DIR_6C3}/historical-holdout-results.json`, `${ARTIFACT_DIR_6C3}/candidate-core-manifest.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });

  console.log("FORMAL HOLDOUT VERDICT\n");
  console.log(`  combined verdict          ${payload.combinedVerdict}`);
  console.log(`  historical holdout        ${historicalVerdict}  (access count ${payload.historicalHoldout.accessCountAfter})`);
  console.log(`  synthetic holdout         ${syntheticVerdict}  (access count ${payload.syntheticHoldout.accessCountAfter})`);
  console.log(`  calibration status        ${payload.calibrationStatusAfterVerdict}`);
  console.log(`\n  candidate core unchanged  ${coreUnchanged}`);
  console.log(`  parameters unchanged      ${parameterUnchanged} (${drift.length} drifted)`);
  console.log(`  post-holdout tuning       ${payload.candidateImmutability.postHoldoutTuning}`);
  console.log(`\n  QUANTITATIVE GATE: ${quantitative.gatePassed ? "PASSED" : "FAILED"}`);
  console.log(`    internal ${quantitative.internalCompositeMae} -> holdout ${quantitative.holdoutCompositeMae}, ratio ${quantitative.ratio} (gate <= ${quantitative.ratioGate})`);
  console.log(`    structural gates passed: ${quantitative.structuralGatesPassed.length}`);
  console.log(`\n  FAILED GATES: ${failedGates.join(", ")}`);
  console.log(`\n  DIAGNOSIS: ${diagnosis.rootCause}`);
  console.log(`    scored traits ${diagnosis.scoredTraits} · failed on mirror-ambiguous metrics ${diagnosis.traitsFailedOnMirrorAmbiguousMetrics} · failed on valid metrics ${diagnosis.traitsFailedOnValidMetrics}`);
  console.log(`    max |PPP - oppPPP| across fixtures: ${diagnosis.maxPointsPerPossessionGapAcrossFixtures}`);
  console.log(`\n  CONSEQUENCES`);
  for (const c of payload.consequences) console.log(`    - ${c}`);
  console.log(`\n  verdictHash ${payload.verdictHash}`);
  console.log(`\nwrote ${path}`);
  process.exit(combined === "HOLDOUT_VALIDATED" ? 0 : 1);
}
