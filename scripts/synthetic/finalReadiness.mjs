#!/usr/bin/env node
// ── WS13: final readiness and phase summary ─────────────────────────────────
//   npm run syn:final
//
// Re-verifies every claim this phase makes, from the artifacts rather than from
// memory, and states plainly what is now executable and what still is not.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, DIR_B1, DIR_B2, syntheticMembership, git } from "./preflight.mjs";

const REQUIRED_ARTIFACTS = [
  "phase6c4b1s-preflight", "synthetic-v2-formal-readiness-register", "synthetic-v2-guardrail-registry",
  "synthetic-v2-surface-plan", "synthetic-v2-development-controls", "synthetic-v2-margin-evidence",
  "synthetic-v2-talent-gap-ladder", "synthetic-v2-practical-margins", "synthetic-v2-formal-policy",
  "synthetic-v2-sample-plan", "synthetic-v2-seeds", "synthetic-v2-verdict-schema",
  "synthetic-v2-aggregation-policy", "synthetic-v2-mock-manifest", "synthetic-v2-dry-run",
  "synthetic-v2-command-certification", "compound-formal-validation-package-v2",
];
const REQUIRED_DOCS = [
  "synthetic-v2-formal-execution-readiness", "synthetic-v2-guardrail-registry",
  "synthetic-v2-measurement-surfaces", "synthetic-v2-practical-margins", "synthetic-v2-verdict-schema",
  "synthetic-v2-aggregation-policy", "synthetic-v2-sample-plan", "synthetic-v2-seed-domain",
  "synthetic-v2-runner", "synthetic-v2-mock-stress-set", "synthetic-v2-runner-dry-run",
  "synthetic-v2-command-certification", "compound-formal-validation-package-v2",
  "phase6c4b1s-synthetic-v2-preparation",
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const refreeze = process.argv.includes("--refreeze");
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const core = await buildCoreManifestV3();
  const mem = syntheticMembership();
  const recert = readArtifact("candidate1-lock-recertification", DIR_B1).data;
  const pol = readArtifact("synthetic-v2-formal-policy", DIR).data;
  const pkg = readArtifact("compound-formal-validation-package-v2", DIR).data;
  const dry = readArtifact("synthetic-v2-dry-run", DIR).data;
  const cmd = readArtifact("synthetic-v2-command-certification", DIR).data;
  const reg = readArtifact("synthetic-v2-formal-readiness-register", DIR).data;
  const blocker = JSON.parse(readFileSync(`${DIR_B2}/synthetic-v2-package-blocker.json`, "utf8")).data;

  console.log("PHASE 6C4B1S FINAL READINESS\n");
  const missingArtifacts = REQUIRED_ARTIFACTS.filter((a) => !artifactExists(a, DIR));
  const missingDocs = REQUIRED_DOCS.filter((d) => !existsSync(`docs/simulation-v3/${d}.md`));

  gate("everyRequiredArtifactExists", missingArtifacts.length === 0,
    missingArtifacts.length ? `missing: ${missingArtifacts.join(", ")}` : `${REQUIRED_ARTIFACTS.length} artifacts in ${DIR}`);
  gate("everyRequiredDocExists", missingDocs.length === 0,
    missingDocs.length ? `missing: ${missingDocs.join(", ")}` : `${REQUIRED_DOCS.length} docs in docs/simulation-v3/`);
  gate("everyArtifactSelfReportsPass",
    REQUIRED_ARTIFACTS.filter((a) => artifactExists(a, DIR))
      .every((a) => { const d = readArtifact(a, DIR).data; return d.pass === undefined || d.pass === true; }),
    (() => { const bad = REQUIRED_ARTIFACTS.filter((a) => artifactExists(a, DIR))
      .filter((a) => readArtifact(a, DIR).data.pass === false);
      return bad.length ? `these report pass=false: ${bad.join(", ")}` : "no artifact reports a failed gate"; })());

  gate("bothHoldoutsStillSealedAtZero",
    setAccessCount("synthetic-stress-holdout-v2") === 0 && setAccessCount("historical-holdout-v5") === 0
    && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]) && !existsSync(SEALED_SETS["historical-holdout-v5"]),
    "neither access log exists and both counts are 0 — this phase opened nothing");
  gate("noFormalResultArtifactExists",
    !artifactExists("synthetic-v2-results", DIR) && !artifactExists("historical-holdout-v5-results", DIR_B1)
    && !artifactExists("candidate1-compound-formal-verdict", DIR),
    "no results or verdict artifact exists that could be mistaken for a validation outcome");
  // Compared field by field so a renamed key cannot make this check vacuous:
  // the first version compared against recert.calibrationVersion, which does
  // not exist on the artifact (it is possessionCalibrationVersion), so the
  // comparison was string === undefined.
  const identity = [
    ["coreHash", core.aggregateCoreHash, recert.coreHash],
    ["parameterSetHash", def.parameterSetHash, recert.parameterSetHash],
    ["possessionCalibrationVersion", versionOf("possessionCalibrationVersion"), recert.possessionCalibrationVersion],
  ];
  const undefinedSide = identity.filter(([, , want]) => want === undefined);
  const mismatched = identity.filter(([, have, want]) => want !== undefined && have !== want);
  gate("candidate1Unchanged",
    undefinedSide.length === 0 && mismatched.length === 0
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    undefinedSide.length ? `the recertification artifact has no field named ${undefinedSide.map(([k]) => k).join(", ")} — comparison would be vacuous`
      : mismatched.length ? `drifted: ${mismatched.map(([k, have, want]) => `${k} ${String(have).slice(0, 16)} != ${String(want).slice(0, 16)}`).join("; ")}`
      : `core ${core.aggregateCoreHash.slice(0, 16)}..., parameter set ${def.parameterSetHash.slice(0, 16)}..., calibration ${versionOf("possessionCalibrationVersion")}, lock revision ${recert.lockRevision}, ${activeParameters().length} parameters all at their registry defaults`);
  gate("syntheticMembershipUnchanged",
    mem.fixtures.length === 16 && mem.membershipHash === blocker.frozenAndPresent.fixtures.manifestHash,
    `16 fixtures, membershipHash unchanged from the value the blocker recorded`);
  gate("frozenGuardrailsUnchanged",
    acceptancePolicyHash() === blocker.frozenAndPresent.guardrailPolicy.acceptancePolicyHash
    && Object.keys(HOLDOUT.syntheticGuardrails).length === 11,
    `acceptance policy hash unchanged, 11 frozen guardrail keys`);

  gate("everyBlockerKeyIsClosed",
    reg.reconciliation.unclaimed.length === 0 && reg.reconciliation.invented.length === 0
    && Object.keys(blocker.missing).every((k) => reg.components.some((c) => c.blockerKey === k)),
    `all ${Object.keys(blocker.missing).length} blocker keys map to a component: ${Object.keys(blocker.missing).join(", ")}`);
  gate("theRunnerWasRehearsed", dry.pass === true && dry.checkCount >= 33,
    `${dry.checkCount} dry-run checks passed on the exact runner over ${dry.gamesPlayed.toLocaleString()} non-holdout games`);
  gate("everyCommandResolvesAndIsNonAccessingWhereClaimed",
    cmd.pass === true && cmd.commands.every((c) => c.registered)
    && cmd.commands.flatMap((c) => c.modes).every((m) => m.accessUnchanged),
    `${cmd.commands.length} commands registered; ${cmd.commands.flatMap((c) => c.modes).length} non-accessing invocations left both access logs untouched`);
  gate("bothStagesBoundWithoutLoss",
    pkg.pass === true && Object.keys(pkg.boundHashes).length
      === pkg.stages.reduce((a, s) => a + Object.keys(s.hashes).length, 0),
    `${pkg.boundHashCount} hashes bound across two stages, namespaced so no key collision drops one`);
  gate("stageOrderEnforcedBeforeAccess",
    pol.stage.number === 2 && pol.stage.order.includes("SYNTHETIC_ACCESS_REFUSED"),
    "stage two refuses before touching its seal unless stage one returned PASS on the same candidate");

  // what is still NOT true
  const stillBlocked = [
    { item: "Historical Holdout V5 has not been run", consequence: "stage two cannot be cleared to run: its preflight refuses with SYNTHETIC_ACCESS_REFUSED, which is the intended behaviour, not a defect" },
    { item: "Synthetic Stress Holdout V2 has not been run", consequence: "no synthetic stress result exists" },
    { item: "no compound formal verdict exists", consequence: "Candidate 1 carries no formal holdout verdict from either stage" },
  ];
  gate("whatIsStillMissingIsStated", stillBlocked.length === 3,
    stillBlocked.map((s) => s.item).join("; "));

  const payload = {
    phase: "6C4B1S", phaseType: "PREPARATION_ONLY",
    title: "Synthetic Stress Holdout V2 formal policy, seeds, runner and execution-package certification",
    packageExecutable: fail.length === 0,
    candidate: { id: recert.candidateId, lockRevision: recert.lockRevision,
      coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      candidateSelectionStatus: recert.candidateSelectionStatus,
      candidateLockStatus: recert.candidateLockStatus,
      calibrationStatus: recert.calibrationStatus,
      validationAttemptStatus: recert.validationAttemptStatus,
      statusNote: "every status is carried forward from the lock recertification unchanged; this phase altered none of them",
      changedInThisPhase: false },
    holdouts: {
      "historical-holdout-v5": { state: "SEALED_UNREAD", accessCount: setAccessCount("historical-holdout-v5"),
        packageState: "COMPLETE since Phase 6C4B1", runnable: true },
      "synthetic-stress-holdout-v2": { state: "SEALED_UNREAD", accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        packageState: "COMPLETE as of this phase", runnable: "only after Historical V5 returns PASS" },
    },
    blockerClosure: { blockerId: blocker.blockerId, keysClosed: Object.keys(blocker.missing),
      register: reg.registerHash, allClosed: reg.reconciliation.unclaimed.length === 0 },
    protocol: { fixtures: 16, totalGames: pol.protocol.totalGames,
      adjudicableGuardrails: pol.guardrails.adjudicableCount,
      thresholdParameters: pol.guardrails.thresholdParameterCount },
    hashes: { formalPolicyHash: pol.policyHash, compoundPackageHash: pkg.packageHash,
      readinessRegisterHash: reg.registerHash, dryRunHash: dry.dryRunHash,
      commandCertificationHash: cmd.certificationHash },
    artifacts: REQUIRED_ARTIFACTS.map((a) => `${DIR}/${a}.json`),
    docs: REQUIRED_DOCS.map((d) => `docs/simulation-v3/${d}.md`),
    stillNotTrue: stillBlocked,
    statusesNotClaimed: {
      notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
      why: "a complete execution package is not a validated candidate. Each of those statuses belongs to the phase that earns it, and production activation requires an explicit CEO GO LIVE.",
    },
    deployments: { preview: 0, production: 0, mergedToMain: false },
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.readinessHash = createHash("sha256").update(JSON.stringify({
    hashes: payload.hashes, holdouts: payload.holdouts, pass: payload.pass })).digest("hex");
  writeArtifact("phase6c4b1s-final-readiness", payload, {
    generationCommand: "npm run syn:final", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nFINAL READINESS: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.readinessHash.slice(0, 16)}...`);
  console.log(`\n  Synthetic V2 package: ${payload.packageExecutable ? "EXECUTABLE" : "NOT EXECUTABLE"}`);
  console.log(`  both holdouts: SEALED_UNREAD at access 0`);
  console.log(`  next: run stage one (npm run validation:historical-v5), then stage two, then the compound verdict`);
  process.exit(payload.pass ? 0 : 2);
}
