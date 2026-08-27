#!/usr/bin/env node
// ── Phase 6C4A WS12: Historical Holdout V5 readiness ────────────────────────
//   npm run c1:readiness
//
// States, from artifacts only, exactly what is ready for V5 and what a future
// phase must still do before opening it. Every "ready" is a verified fact; every
// outstanding item is named rather than implied.
import { readArtifact, writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./failureRegister.mjs";

const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const lock = R("candidate1-lock").data;
  const pool = R("historical-v5-candidate-pool").data;
  const margin = R("trait-practical-margin-policy").data;
  const def = defaultRuntimeParameterSet();

  const ready = {
    candidateLocked: lock.candidateLockStatus === "LOCKED" && lock.possessionCalibrationVersion === versionOf("possessionCalibrationVersion"),
    candidateInternallyValidated: R("candidate1-internal-validation").data.pass
      && R("candidate1-side-symmetry").data.pass && R("candidate1-probability-validation").data.pass
      && R("candidate1-competition-validation").data.pass,
    everySubstantiveV4FailureRepaired: R("candidate1-root-cause-analysis").data.unresolved === 0
      && R("candidate1-remaining-repairs").data.unresolvedSubstantiveFailures === 0,
    marginPolicyFrozenProspectively: margin.frozen === true && margin.appliesFrom.includes("V5"),
    instrumentationRepaired: R("target-schema-validation").data.pass && R("profile-resolution-audit").data.pass
      && R("runner-preflight-audit").data.pass,
    poolLargeEnough: pool.eligibleTeamCount >= 24,
    poolHasTwoPairsPerEra: pool.erasWithAtLeastTwoEligiblePairs === 8,
    poolSourceOnlyAndOutputBlind: pool.selectionBasis.startsWith("SOURCE_ONLY_OUTPUT_BLIND"),
    poolExcludesEverySeenFixture: pool.teams.every((t) => t.eligible === false || (!t.ineligibleReasons.length)),
    syntheticStressStillSealed: setAccessCount("synthetic-stress-holdout-v2") === 0,
    failedHoldoutsPreserved: setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
  };

  // What a LATER phase must do. Named explicitly: a readiness artifact that
  // implies "just run it" is how a phase opens a holdout unprepared.
  const outstandingBeforeV5 = [
    { item: "RE_CERTIFY_ERA_REFERENCES", why: "The eight era references were certified under Candidate 0. Candidate 1 changed input construction, and three residual-failure decompositions (v4f-02 offence, v4f-03/04/06/07 defence, v4f-05 rebounding) all trace part of their residual to the references being champions-median fives. V5 scoring against reference self-baselines is invalid until they are re-certified under Candidate 1.", blocking: true },
    { item: "RE_CERTIFY_TRAIT_OBSERVABILITY", why: "Observability controls (12/16 metrics certified) were measured under Candidate 0. Candidate 1 repaired two of the four failing metrics by construction (movement reachability, zone continuity), so the eligible-trait set must be recomputed before traits are scored.", blocking: true },
    { item: "SELECT_V5_MATCHUPS", why: "Deterministic, output-blind selection of the formal V5 matchups from this pool. Explicitly NOT part of Phase 6C4A.", blocking: true },
    { item: "FREEZE_V5_POLICY_AND_SEEDS", why: "A V5 acceptance policy and seed manifest must be frozen BEFORE any V5 fixture is simulated, incorporating the trait practical-margin policy frozen here.", blocking: true },
    { item: "REGISTER_V5_SEAL", why: "V5 needs its own entry in the sealed-set registry with its own access log, so it can be opened exactly once.", blocking: true },
    { item: "RUN_V5_DRY_RUN", why: "The transactional runner must be exercised end-to-end on a mock seal, preflighting profile resolution through buildRunnerProfileMap() over the exact V5 fixture set, before the real unlock.", blocking: true },
  ];

  const payload = {
    historicalV5ReadinessVersion: "1.0.0",
    candidate: { candidateId: lock.candidateId, possessionCalibrationVersion: lock.possessionCalibrationVersion,
      calibrationStatus: lock.calibrationStatus, coreHash: lock.coreHash, parameterSetHash: def.parameterSetHash },
    pool: { teams: pool.teamCount, eligible: pool.eligibleTeamCount, newTeamSeasons: pool.newTeamSeasons,
      carriedFromV4Pool: pool.carriedFromV4Pool, eligiblePairsByEra: pool.eligiblePairsByEra,
      erasWithAtLeastTwoEligiblePairs: pool.erasWithAtLeastTwoEligiblePairs, poolHash: pool.poolHash },
    ready,
    allReady: Object.values(ready).every(Boolean),
    outstandingBeforeV5,
    v5MayOpen: false,
    v5MayOpenReason: "Six blocking items remain, and none of them is in scope for Phase 6C4A. This phase locked a candidate and expanded a pool; it did not select, seal, or simulate a holdout.",
    statusClaimed: "DEVELOPMENT_LOCKED_SCOPED",
    statusNotClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
  };
  writeArtifact("historical-v5-readiness", payload, { generationCommand: "npm run c1:readiness", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log("HISTORICAL HOLDOUT V5 READINESS\n");
  for (const [k, v] of Object.entries(ready)) console.log(`  ${v ? "READY" : "NOT READY"}  ${k}`);
  console.log(`\n  all ready: ${payload.allReady}`);
  console.log(`\noutstanding before V5 (${outstandingBeforeV5.length}, all blocking, none in this phase's scope):`);
  for (const o of outstandingBeforeV5) console.log(`  · ${o.item}`);
  console.log(`\nV5 may open: ${payload.v5MayOpen}`);
  process.exit(payload.allReady ? 0 : 2);
}
