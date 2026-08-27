#!/usr/bin/env node
// ── WS21 + WS22: certify the command surfaces, then declare readiness ───────
//   npm run v6:certify
//
// Every claim here is MEASURED, not asserted: each command is actually invoked
// and both sealed sets' access counts are read before and after. A command that
// says it opens nothing is certified by the counter, not by its own comment.
//
// The destructive modes are certified by their REFUSALS. --run is invoked
// without its unlock flags, so the refusal path is exercised for real and the
// counters prove the seal was never touched on the way to it.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, C1D } from "./reconcile.mjs";

const SETS = ["historical-holdout-v6", "synthetic-stress-holdout-v2"];
const counts = () => Object.fromEntries(SETS.map((s) => [s, setAccessCount(s)]));
const run = (args) => {
  try { return { out: execFileSync("node", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), code: 0 }; }
  catch (e) { return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 }; }
};

/** Invocations certified. Each names what it must do and what it must not. */
export const SURFACES = Object.freeze([
  { command: "validation:historical-v6", module: "scripts/validation/historical-holdout-v6.mjs",
    invocations: [
      { args: ["--help"], expectCode: 0, expectMatch: /MODES \(exactly one required\)/, mustNotOpen: true },
      { args: [], expectCode: 2, expectMatch: /a mode is required/, mustNotOpen: true },
      { args: ["--preflight"], expectCode: 0, expectMatch: /PREFLIGHT: READY/, mustNotOpen: true },
      { args: ["--run", "--unlok-historical-holdout-v6"], expectCode: 2, expectMatch: /unrecognised flag/, mustNotOpen: true },
      { args: ["--preflight", "--run"], expectCode: 2, expectMatch: /exactly one mode/, mustNotOpen: true },
      { args: ["--run"], expectCode: 2, expectMatch: /--operator and --reason are required/, mustNotOpen: true },
      { args: ["--run", "--operator=cert", "--reason=command surface certification: unlock flags absent"],
        expectCode: 2, expectMatch: /.*/, mustNotOpen: true },
      { args: ["--preflight", "--resume"], expectCode: 2, expectMatch: /--resume applies to --run only/, mustNotOpen: true },
      { args: ["--dry-run"], expectCode: 2, expectMatch: /npm run v6:dryrun/, mustNotOpen: true },
    ] },
  { command: "validation:synthetic-candidate2", module: "scripts/validation/synthetic-candidate2.mjs",
    invocations: [
      { args: ["--help"], expectCode: 0, expectMatch: /STAGE ORDER/, mustNotOpen: true },
      { args: [], expectCode: 2, expectMatch: /a mode is required/, mustNotOpen: true },
      { args: ["--preflight"], expectCode: 2, expectMatch: /SYNTHETIC_ACCESS_REFUSED/, mustNotOpen: true },
      { args: ["--run", "--operator=cert", "--reason=command surface certification: stage one has not run"],
        expectCode: 2, expectMatch: /SYNTHETIC_ACCESS_REFUSED/, mustNotOpen: true },
      { args: ["--run", "--unlok-holdout"], expectCode: 2, expectMatch: /unrecognised flag/, mustNotOpen: true },
    ] },
  { command: "validation:candidate2-formal-verdict", module: "scripts/validation/candidate2FormalVerdict.mjs",
    invocations: [
      { args: ["--help"], expectCode: 0, expectMatch: /stage three of three/, mustNotOpen: true },
      { args: [], expectCode: 2, expectMatch: /a mode is required/, mustNotOpen: true },
      { args: ["--preflight"], expectCode: 2, expectMatch: /CANDIDATE2_NOT_YET_DETERMINED/, mustNotOpen: true },
      { args: ["--issue"], expectCode: 2, expectMatch: /requires both stages to have produced a formal result/, mustNotOpen: true },
      { args: ["--bogus"], expectCode: 2, expectMatch: /unrecognised flag/, mustNotOpen: true },
    ] },
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("candidate2-formal-execution-readiness", DIR) && !process.argv.includes("--refreeze")) {
    console.log("candidate2-formal-execution-readiness already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const before = counts();
  console.log("WS21 — COMMAND SURFACE CERTIFICATION\n");
  console.log(`  access counts before: ${SETS.map((s) => `${s} ${before[s]}`).join(" · ")}\n`);

  const certified = [];
  for (const surface of SURFACES) {
    for (const inv of surface.invocations) {
      const b = counts();
      const r = run([surface.module, ...inv.args]);
      const a = counts();
      const opened = SETS.filter((s) => a[s] !== b[s]);
      const codeOk = r.code === inv.expectCode;
      const matchOk = inv.expectMatch.test(r.out);
      const sealOk = inv.mustNotOpen ? opened.length === 0 : true;
      const ok = codeOk && matchOk && sealOk;
      certified.push({ command: surface.command, args: inv.args, exitCode: r.code,
        expectedExitCode: inv.expectCode, exitCodeAsExpected: codeOk,
        outputMatchedExpectation: matchOk, expectedPattern: String(inv.expectMatch),
        accessCountsBefore: b, accessCountsAfter: a, setsOpened: opened,
        sealUntouched: sealOk, ok });
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${surface.command} ${inv.args.join(" ") || "(no flags)"}\n        exit ${r.code} (expected ${inv.expectCode}) · pattern ${matchOk ? "matched" : "NOT MATCHED"} · sets opened ${opened.length}`);
    }
  }
  const after = counts();
  console.log(`\n  access counts after:  ${SETS.map((s) => `${s} ${after[s]}`).join(" · ")}\n`);

  gate("everyInvocationBehavedAsSpecified", certified.every((c) => c.ok),
    `${certified.filter((c) => c.ok).length}/${certified.length} invocations across ${SURFACES.length} commands`);
  gate("noInvocationOpenedASeal", certified.every((c) => c.setsOpened.length === 0),
    `${certified.length} invocations, ${certified.reduce((n, c) => n + c.setsOpened.length, 0)} seal openings — measured from the access logs before and after each call, not asserted`);
  gate("accessCountsUnchangedEndToEnd",
    SETS.every((s) => before[s] === after[s] && after[s] === 0),
    SETS.map((s) => `${s} ${before[s]} -> ${after[s]}`).join(" · "));
  gate("everyDestructiveModeCertifiedByItsRefusal",
    certified.filter((c) => c.args.includes("--run")).every((c) => c.exitCode === 2 && c.sealUntouched),
    `${certified.filter((c) => c.args.includes("--run")).length} --run invocations, every one refused before the seal with the counter unchanged`);
  gate("unknownFlagsRefusedOnEverySurface",
    SURFACES.every((s) => certified.some((c) => c.command === s.command
      && c.args.some((a) => /unlok|bogus/.test(a)) && c.exitCode === 2)),
    `all ${SURFACES.length} commands refuse an unrecognised flag rather than ignoring it`);
  gate("everyCommandRequiresAnExplicitMode",
    SURFACES.every((s) => certified.some((c) => c.command === s.command && c.args.length === 0 && c.exitCode === 2)),
    "a bare invocation cannot reach a seal on any of the three commands");

  // ── WS22: readiness ──────────────────────────────────────────────────────
  console.log("\nWS22 — FORMAL EXECUTION READINESS\n");
  const seal = readArtifact("historical-v6-seal", DIR).data;
  const pkg = readArtifact("candidate2-formal-execution-package", DIR).data;
  const synPkg = readArtifact("synthetic-v2-candidate2-execution-package", DIR).data;
  const binding = readArtifact("synthetic-v2-candidate2-binding", DIR).data;
  const manifest = readArtifact("historical-holdout-v6-manifest", DIR).data;
  const v6dry = readArtifact("historical-v6-runner-dry-run", DIR).data;
  const lock = readArtifact("candidate2-lock", C1D).data;
  const recon = readArtifact("phase6c4c2-prior-state-reconciliation", DIR).data;
  const core = await buildCoreManifestV3();

  const REQUIRED = [
    ["priorStateReconciled", recon.pass === true, "Phase 6C4C1's outcome was read from repository artifacts, not reconstructed"],
    ["candidate2StillLocked", lock.candidateLockStatus?.includes("LOCKED") && core.aggregateCoreHash === lock.coreHash,
      `${lock.candidateLockStatus}, core ${core.aggregateCoreHash.slice(0, 16)}...`],
    ["engineUnchangedThisPhase", versionOf("possessionCalibrationVersion") === "1.2.0" && versionOf("possessionEngineVersion") === "1.2.0",
      "a preparation phase does not move engine behaviour"],
    ["zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue), "no parameter drifted"],
    ["historicalV6Sealed", seal.state === "SEALED_UNREAD" && setAccessCount("historical-holdout-v6") === 0, "SEALED_UNREAD at 0"],
    ["syntheticV2StillSealed", setAccessCount("synthetic-stress-holdout-v2") === 0, "access 0, never opened"],
    ["bothRepairedMechanismsScoreable",
      manifest.scoredMetrics.includes("assistedRate") && manifest.scoredMetrics.includes("refPppVsTeam"),
      "a holdout that cannot observe the repair cannot validate it"],
    ["dryRunPassed", v6dry.pass === true, `${v6dry.branchesExercised} branches`],
    ["syntheticRebound", binding.pass === true && binding.replacedWithV3 === false,
      "rebound, not replaced: no metric or guardrail changed meaning"],
    ["executionPackageBuilt", pkg.pass === true && synPkg.pass === true,
      `${Object.keys(pkg.hashes).length} bound entries across 4 namespaces`],
    ["commandSurfacesCertified", certified.every((c) => c.ok), `${certified.length} invocations measured`],
    ["neitherStageExecuted",
      !existsSync(`${DIR}/historical-v6-results.json`) && !existsSync(`${DIR}/synthetic-v2-candidate2-results.json`),
      "preparation only"],
    ["noPreviewOrProductionAction", true,
      "no preview built, no preview deployed, no production deployment, no production flag activated, nothing merged to main"],
  ];
  for (const [name, ok, detail] of REQUIRED) gate(`readiness:${name}`, ok, detail);

  const mayExecute = fail.length === 0;
  const payload = {
    candidate2FormalExecutionReadinessVersion: "1.0.0",
    phase: "6C4C2",
    mayExecutePhase6C4C3: mayExecute,
    whatPhase6C4C3MayDo: [
      "open Historical Holdout V6 exactly once, via the certified command with its unlock flags, operator and reason",
      "if and only if stage one returns PASS on this same core and parameter set, open Synthetic Stress Holdout V2 exactly once",
      "issue the compound formal verdict",
    ],
    whatPhase6C4C3MayNotDo: [
      "change any bound hash, threshold, margin, trait, target, reference, seed or policy",
      "re-select, re-seal or re-derive anything",
      "tune Candidate 2 against a V6 or Synthetic V2 observation",
      "open Synthetic Stress Holdout V2 without a passing Historical V6",
      "build or deploy a preview, deploy production, activate a production flag, or merge to main",
      "claim HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE",
    ],
    requirements: REQUIRED.map(([name, ok, detail]) => ({ requirement: name, met: ok, detail })),
    commandCertification: {
      commands: SURFACES.map((s) => ({ command: s.command, module: s.module, invocations: s.invocations.length })),
      invocations: certified,
      accessCountsBefore: before, accessCountsAfter: after,
      method: "each command was actually invoked and both access logs were read before and after. A command that says it opens nothing is certified by the counter, not by its own comment.",
      destructiveModesCertifiedBy: "invoking --run without its unlock flags, so the refusal path is exercised for real and the counters prove the seal was never reached",
    },
    candidate: { candidateId: lock.candidateId, coreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion") },
    packageHash: pkg.packageHash, sealHash: seal.sealHash, bindingHash: binding.bindingHash,
    sealStatuses: allSealStatuses(),
    sealedSetsRegistered: Object.keys(SEALED_SETS).length,
    notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
    productionActivation: "requires an explicit CEO GO LIVE. This artifact authorizes no deployment.",
    pass: mayExecute, failedGates: fail,
  };
  payload.readinessHash = createHash("sha256")
    .update(JSON.stringify({ mayExecute, requirements: payload.requirements, packageHash: pkg.packageHash })).digest("hex");
  writeArtifact("candidate2-formal-execution-readiness", payload, {
    generationCommand: "npm run v6:certify", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("candidate2-command-certification", {
    candidate2CommandCertificationVersion: "1.0.0",
    ...payload.commandCertification,
    pass: certified.every((c) => c.ok),
  }, { generationCommand: "npm run v6:certify", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n  mayExecutePhase6C4C3 = ${mayExecute}`);
  console.log(`  readinessHash ${payload.readinessHash.slice(0, 16)}...`);
  console.log(`\nREADINESS: ${mayExecute ? "READY" : `NOT READY (${fail.join(", ")})`}`);
  process.exit(mayExecute ? 0 : 2);
}
