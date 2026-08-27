#!/usr/bin/env node
// ── Candidate 1's compound formal verdict ───────────────────────────────────
//   npm run validation:candidate1-formal-verdict
//
// Stage three. Reads the two stage results and issues the verdict the FROZEN
// policies produce. It re-scores nothing, re-weights nothing and reinterprets
// nothing: the gates were frozen before either set was opened, and a diagnosis
// of why a gate failed is recorded alongside the verdict rather than in place
// of it.
//
// It opens no seal. It requires BOTH stages to have run, and refuses to issue
// anything if either is missing, because a compound verdict over one stage is
// not a compound verdict.
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

const DIR_B1 = "data/validation/6c4b1";
const DIR_B1S = "data/validation/6c4b1s";
const DIR_OUT = DIR_B1S;

export const COMPOUND_VERDICTS = Object.freeze({
  BOTH_STAGES_PASSED: "both formal stages returned PASS on the same locked candidate",
  STAGE_FAILED: "at least one stage returned FAIL",
  INCOMPLETE: "at least one stage has not run, so there is nothing to compound",
  INVALID_RUN: "both stages ran, neither FAILed, but at least one could not support a PASS",
  IDENTITY_SPLIT: "the two stages did not score the same candidate, so their results cannot be combined",
});

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--help")) {
    console.log(`Candidate 1 compound formal verdict — stage three of three

  npm run validation:candidate1-formal-verdict

  Reads the Historical Holdout V5 and Synthetic Stress Holdout V2 results and
  issues the verdict the frozen policies produce. Opens no seal, scores no
  game, and requires both stages to have run.

  --help        print this and exit. Touches no seal.
  --preflight   read both stages, report what a verdict would say, and exit
                WITHOUT writing anything. Touches no seal.

  A pass here does NOT make Candidate 1 HOLDOUT_VALIDATED,
  PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and authorizes no
  deployment. Production activation requires an explicit CEO GO LIVE.`);
    process.exit(0);
  }

  // A read-only mode. Without it, an unrecognised flag fell through to the
  // writing path, so `--preflight` would have issued a compound verdict
  // artifact before either stage had run — an out-of-order write of the very
  // artifact stage three exists to produce. Nothing below this line differs
  // between the two modes except the final write and exit code.
  const preflightOnly = process.argv.includes("--preflight");

  const v5Path = `${DIR_B1}/historical-holdout-v5-results.json`;
  const synPath = `${DIR_B1S}/synthetic-v2-results.json`;
  const v5 = existsSync(v5Path) ? readArtifact("historical-holdout-v5-results", DIR_B1).data : null;
  const syn = existsSync(synPath) ? readArtifact("synthetic-v2-results", DIR_B1S).data : null;
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  const stages = [
    { stage: 1, set: "historical-holdout-v5", ran: v5 != null, outcome: v5?.outcome ?? null,
      verdict: v5?.verdict ?? null, accessCount: setAccessCount("historical-holdout-v5"),
      coreHash: v5?.identity?.coreHash ?? null, parameterSetHash: v5?.identity?.parameterSetHash ?? null,
      missingBecause: v5 == null ? `no results artifact at ${v5Path} — stage one has not run` : null },
    { stage: 2, set: "synthetic-stress-holdout-v2", ran: syn != null, outcome: syn?.outcome ?? null,
      verdict: syn?.verdict ?? null, accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      coreHash: syn?.identity?.coreHash ?? null, parameterSetHash: syn?.identity?.parameterSetHash ?? null,
      missingBecause: syn == null ? `no results artifact at ${synPath} — stage two has not run` : null },
  ];

  const ran = stages.filter((s) => s.ran);
  const failed = ran.filter((s) => s.outcome === "FAIL");
  const invalid = ran.filter((s) => s.outcome === "INVALID_RUN");
  const identitySplit = ran.length === 2
    && (stages[0].coreHash !== stages[1].coreHash || stages[0].parameterSetHash !== stages[1].parameterSetHash);
  const currentMatches = ran.every((s) => s.coreHash === core.aggregateCoreHash
    && s.parameterSetHash === def.parameterSetHash);

  const verdict = ran.length < 2 ? "INCOMPLETE"
    : identitySplit ? "IDENTITY_SPLIT"
    : failed.length ? "STAGE_FAILED"
    : invalid.length ? "INVALID_RUN"
    : "BOTH_STAGES_PASSED";

  console.log("CANDIDATE 1 COMPOUND FORMAL VERDICT — stage three of three\n");
  for (const s of stages) {
    console.log(`  stage ${s.stage}  ${s.set.padEnd(30)} ${s.ran ? `${s.outcome} (${s.verdict})` : "NOT RUN"}  access ${s.accessCount}`);
    if (s.missingBecause) console.log(`           ${s.missingBecause}`);
  }
  console.log(`\n  COMPOUND VERDICT: ${verdict}`);
  console.log(`  ${COMPOUND_VERDICTS[verdict]}`);

  const payload = {
    candidate1FormalVerdictVersion: "1.0.0",
    compoundVerdict: verdict, meaning: COMPOUND_VERDICTS[verdict],
    verdictVocabulary: COMPOUND_VERDICTS,
    stages,
    stagesRequired: 2, stagesRan: ran.length,
    candidateIdentityNow: { coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      zeroParameterDrift: activeParameters().every((p) => def.values[p.id] === p.defaultValue) },
    stagesScoredTheSameCandidate: ran.length === 2 ? !identitySplit : null,
    stagesMatchTheCurrentCandidate: currentMatches,
    rule: [
      "1. Both stages must have run. One stage is not a compound verdict.",
      "2. Both stages must have scored the same candidate core and parameter set, or the results cannot be combined.",
      "3. Any stage FAIL gives STAGE_FAILED.",
      "4. Any stage INVALID_RUN, with no FAIL, gives INVALID_RUN.",
      "5. Otherwise BOTH_STAGES_PASSED.",
    ],
    reScoring: "none. Each stage's verdict is the one its own frozen policy produced at run time; this command reads them and applies the compound rule above.",
    whatThisDoesNotAuthorize: "BOTH_STAGES_PASSED does not make Candidate 1 HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and authorizes no preview or production deployment. Those statuses belong to the phase that earns each of them, and production activation requires an explicit CEO GO LIVE.",
    sealsOpenedByThisCommand: 0,
    accessCounts: { "historical-holdout-v5": setAccessCount("historical-holdout-v5"),
      "synthetic-stress-holdout-v2": setAccessCount("synthetic-stress-holdout-v2") },
  };
  payload.verdictHash = createHash("sha256").update(JSON.stringify({ verdict,
    stages: stages.map((s) => [s.set, s.outcome, s.coreHash]) })).digest("hex");

  if (preflightOnly) {
    console.log("\n  --preflight: nothing was written and no seal was touched.");
    console.log(`  seals: historical-holdout-v5 access ${payload.accessCounts["historical-holdout-v5"]}, synthetic-stress-holdout-v2 access ${payload.accessCounts["synthetic-stress-holdout-v2"]}`);
    console.log(`  a verdict issued now would read ${verdict}`);
    process.exit(verdict === "BOTH_STAGES_PASSED" ? 0 : 2);
  }

  writeArtifact("candidate1-compound-formal-verdict", payload, {
    generationCommand: "npm run validation:candidate1-formal-verdict",
    dir: DIR_OUT, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\n  verdictHash ${payload.verdictHash.slice(0, 16)}...`);
  process.exit(verdict === "BOTH_STAGES_PASSED" ? 0 : 1);
}
