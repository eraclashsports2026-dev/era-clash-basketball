#!/usr/bin/env node
// ── Freeze the targeted calibration scope ───────────────────────────────────
// Runs BEFORE the search, and its hash is recorded by the search and by the
// candidate lock. Freezing the scope first is what makes "the search did not
// improve on the defaults" a finding rather than an excuse: the eligible set,
// the bounds, the folds, the objective and the acceptance thresholds are all
// fixed while the outcome is still unknown.
//
//   npm run calibration:c5:scope
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readArtifact, writeArtifact, reconcile } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { SEARCH_POLICY, loadFixtures } from "./c5-search.mjs";
import { versionOf } from "../../src/versions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";

const triage = readArtifact("no-effect-triage");
const params = triage.data.parameters;
const eligible = params.filter((p) => p.eligibleForSearch);
const frozen = params.filter((p) => !p.eligibleForSearch);

const folds = JSON.parse(readFileSync("data/calibration/internal-folds-v3.json", "utf8"));
const fixtures = loadFixtures();
const TUNING_FOLDS = [0, 2];
const VALIDATION_FOLDS = [1, 3];

const tuning = fixtures.filter((f) => TUNING_FOLDS.includes(f.fold)).map((f) => f.fixture.fixtureId);
const validation = fixtures.filter((f) => VALIDATION_FOLDS.includes(f.fold)).map((f) => f.fixture.fixtureId);

// The one thing that must never appear in either list.
const sealed = [...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)];
const contamination = [...tuning, ...validation].filter((id) => sealed.includes(id));
if (contamination.length) {
  console.error(`SCOPE_FAILED: sealed holdout members appear in the calibration scope: ${contamination.join(", ")}`);
  process.exit(2);
}

const rec = reconcile({
  label: "calibration-scope",
  counts: { eligibleForSearch: eligible.length, frozen: frozen.length },
  expectedTotal: activeParameters().length,
  members: { eligibleForSearch: eligible.map((p) => p.id), frozen: frozen.map((p) => p.id) },
  population: activeParameters().map((p) => p.id),
});

const scope = {
  calibrationScopeVersion: versionOf("calibrationScopeVersion"),
  scopedCalibrationPolicyVersion: versionOf("scopedCalibrationPolicyVersion"),
  targetedCalibrationPolicyVersion: versionOf("targetedCalibrationPolicyVersion"),
  internalCalibrationFoldVersion: folds.internalCalibrationFoldVersion,
  doctrine: "Era Style supplies the historical basketball environment. Player capability, team construction, coaching, matchups, and seeded variance determine how a particular roster performs inside that environment.",
  activeParameterCount: activeParameters().length,
  eligibleCount: eligible.length,
  frozenCount: frozen.length,
  reconciliation: rec,

  objective: {
    statistic: SEARCH_POLICY.objective,
    targetClass: "TIER_C_SEASON_SHARE_PROXY",
    targetField: "unitTargets.playerScoringShares",
    availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
    normalisation: "Realised shares are normalised across the selected five, matching how the target was derived. Comparing an unnormalised realised share to a five-normalised target would measure the normalisation, not the engine.",
    matchup: "Each fixture plays a MIRROR of itself, so opponent quality cannot move the internal scoring distribution the target describes.",
    direction: "LOWER_IS_BETTER",
    whyThisObjective: "None of the eligible parameters carries historical numeric support in its own registry entry — 5 are SYNTHETIC_CONTROL_SUPPORT and 6 are STRUCTURAL_VALIDATION_ONLY. The Tier C share proxies are the only authorized numeric historical evidence in this corpus that these parameters could plausibly move, so they are the strongest available adjudicator. They remain a PROXY: derived season shares over a documented five, not observed possession-level allocation.",
    limitations: [
      "A season share proxy cannot distinguish a correct allocation mechanism from a compensating pair of incorrect ones.",
      "Five-player normalisation discards bench scoring entirely.",
      "23 fixtures is a small corpus; a single fixture is ~4% of the objective.",
    ],
  },

  folds: {
    grouping: folds.leakageGrouping,
    leakFree: folds.leakFree,
    tuningFolds: TUNING_FOLDS,
    validationFolds: VALIDATION_FOLDS,
    tuningFixtureCount: tuning.length,
    validationFixtureCount: validation.length,
    tuningFixtures: tuning,
    validationFixtures: validation,
    assignedBeforeResults: true,
  },

  thresholds: {
    minTuningImprovement: SEARCH_POLICY.minTuningImprovement,
    maxValidationDegradation: SEARCH_POLICY.maxValidationDegradation,
    scanPointsPerParameter: SEARCH_POLICY.scanPointsPerParameter,
    seedsPerFixture: SEARCH_POLICY.seedsPerFixture,
    candidateZeroAlwaysCompetes: true,
    frozenBeforeAnyResult: true,
    note: "These thresholds may not be changed after seeing a result. If no changed candidate clears them, Candidate 0 wins and the lock is DEVELOPMENT_LOCKED_BASELINE.",
  },

  eligibleParameters: eligible.map((p) => ({
    id: p.id, module: p.module, defaultValue: p.defaultValue,
    registryMin: p.min, registryMax: p.max,
    searchBounds: p.searchBounds,
    movementCapFractionOfRange: p.movementCapFractionOfRange,
    readiness: p.readinessV3, identifiability: p.identifiabilityV3,
    triage: p.triage, support: p.support,
    activatedPossessions: p.activatedPossessions,
  })),

  sealedSets: {
    historicalHoldoutV3: { count: HISTORICAL_HOLDOUT_V3_IDS.length, accessed: 0, status: "SEALED_NOT_ACCESSED" },
    syntheticStressHoldoutV2: { count: SYNTHETIC_STRESS_HOLDOUT_V2.length, accessed: 0, status: "SEALED_NOT_ACCESSED" },
    contaminationCheck: "PASS",
  },

  defaultParameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
};

const { path, payload } = writeArtifact("calibration-scope", scope, {
  generationCommand: "npm run calibration:c5:scope",
  sourceArtifacts: ["data/calibration/c5/no-effect-triage.json", "data/calibration/internal-folds-v3.json", "data/calibration/historical-targets-v3.json"],
});

const scopeHash = createHash("sha256").update(JSON.stringify(scope)).digest("hex");

console.log("FROZEN TARGETED CALIBRATION SCOPE");
console.log(`  active parameters      ${scope.activeParameterCount}`);
console.log(`  eligible for search    ${scope.eligibleCount}`);
console.log(`  frozen                 ${scope.frozenCount}`);
console.log(`  reconciles             ${rec.reconciles}`);
console.log(`\n  objective              ${scope.objective.targetClass} · ${scope.objective.direction}`);
console.log(`  tuning fixtures        ${tuning.length} (folds ${TUNING_FOLDS.join(",")})`);
console.log(`  validation fixtures    ${validation.length} (folds ${VALIDATION_FOLDS.join(",")})`);
console.log(`  holdout contamination  ${scope.sealedSets.contaminationCheck}`);
console.log(`\n  scopeHash              ${scopeHash}`);
console.log(`  payloadHash            ${payload.outputHash}`);
console.log(`\nwrote ${path}`);
process.exit(rec.reconciles ? 0 : 2);
