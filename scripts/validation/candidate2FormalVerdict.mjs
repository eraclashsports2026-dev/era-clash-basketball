#!/usr/bin/env node
// ── Candidate 2 compound formal verdict — stage three of three ──────────────
//   npm run validation:candidate2-formal-verdict -- --help
//   npm run validation:candidate2-formal-verdict -- --preflight
//   npm run validation:candidate2-formal-verdict -- --issue
//
// Reads the Historical Holdout V6 and Synthetic Stress Holdout V2 results and
// issues the verdict the frozen policies produce. Opens no seal and scores no
// game.
//
// Two things carried forward from Phase 6C4B2R, where both were found the hard
// way on the Candidate 1 version of this command:
//   · the vocabulary NAMES THE STAGE THAT DECIDED. Its first version collapsed a
//     decisive stage-one failure into "INCOMPLETE", which reads as "we have not
//     finished" when the truth was "stage one failed and stage two must never be
//     opened".
//   · a read-only mode exists, and writing requires an explicit --issue. The
//     first version accepted unknown flags and fell through to the writing path,
//     so --preflight would have written a compound verdict before either stage
//     had run — an out-of-order write of the very artifact stage three exists to
//     produce.
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

export const DIR = "data/validation/6c4c2";
export const DIR_C1 = "data/validation/6c4c1";

export const KNOWN_FLAGS = Object.freeze(["--help", "--preflight", "--issue"]);

/**
 * The compound verdict vocabulary. Each value names the stage that decided the
 * outcome, so a reader cannot mistake a decisive failure for unfinished work.
 */
export const COMPOUND_VERDICTS = Object.freeze({
  CANDIDATE2_HOLDOUT_VALIDATED: "both formal stages returned PASS on the same locked candidate, with no drift and no post-holdout tuning",
  CANDIDATE2_HISTORICAL_V6_FAILED: "Historical Holdout V6 returned FAIL. Synthetic Stress Holdout V2 is correctly never opened, so the validation is decided by stage one.",
  CANDIDATE2_HISTORICAL_V6_INVALID: "Historical Holdout V6 could not produce a formal result. Synthetic Stress Holdout V2 is correctly never opened.",
  CANDIDATE2_SYNTHETIC_V2_FAILED: "Historical Holdout V6 passed and Synthetic Stress Holdout V2 returned FAIL",
  CANDIDATE2_SYNTHETIC_V2_INVALID: "Historical Holdout V6 passed and Synthetic Stress Holdout V2 could not produce a formal result",
  CANDIDATE2_IDENTITY_SPLIT: "the two stages did not score the same candidate core and parameter set, so their results cannot be combined",
  CANDIDATE2_STAGE_ORDER_VIOLATED: "Synthetic Stress Holdout V2 was opened without a passing Historical Holdout V6. The synthetic result is not usable as evidence and the compound verdict cannot be issued.",
  CANDIDATE2_NOT_YET_DETERMINED: "no stage has produced a formal result yet, so there is nothing to compound",
});

/** The state machine. Pure, so a test can drive every transition. */
export const compoundVerdict = ({ s1, s2, identitySplit }) => {
  if (!s1.ran && !s2.ran) return "CANDIDATE2_NOT_YET_DETERMINED";
  // stage order first: a synthetic result without a passing stage one is not
  // evidence, whatever it says, and saying so is more informative than
  // reporting it as a stage-two outcome.
  if (s2.ran && !(s1.ran && s1.outcome === "PASS")) return "CANDIDATE2_STAGE_ORDER_VIOLATED";
  if (s1.ran && s1.outcome === "FAIL") return "CANDIDATE2_HISTORICAL_V6_FAILED";
  if (s1.ran && s1.outcome === "INVALID_RUN") return "CANDIDATE2_HISTORICAL_V6_INVALID";
  if (!s1.ran || !s2.ran) return "CANDIDATE2_NOT_YET_DETERMINED";
  if (identitySplit) return "CANDIDATE2_IDENTITY_SPLIT";
  if (s2.outcome === "FAIL") return "CANDIDATE2_SYNTHETIC_V2_FAILED";
  if (s2.outcome === "INVALID_RUN") return "CANDIDATE2_SYNTHETIC_V2_INVALID";
  return "CANDIDATE2_HOLDOUT_VALIDATED";
};

export const USAGE = `Candidate 2 compound formal verdict — stage three of three

  --help        print this and exit. Touches no seal.
  --preflight   read both stages, report what a verdict would say, and exit
                WITHOUT writing anything. Touches no seal.
  --issue       write the compound verdict artifact. Requires both stages to
                have produced a formal result.

A pass here does NOT make Candidate 2 HOLDOUT_VALIDATED,
PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and authorizes no
deployment. Production activation requires an explicit CEO GO LIVE.

Any unrecognised flag is refused.`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.includes(a.split("=")[0]));
  if (unknown.length) { console.error(`REFUSED: unrecognised flag(s) ${unknown.join(", ")}\n`); console.error(USAGE); process.exit(2); }
  const modes = KNOWN_FLAGS.filter((m) => argv.includes(m));
  if (argv.includes("--help") || modes.length === 0) {
    if (modes.length === 0) console.error("REFUSED: a mode is required. Writing requires --issue.\n");
    console.log(USAGE); process.exit(modes.length === 0 ? 2 : 0);
  }
  if (modes.length > 1) { console.error(`REFUSED: exactly one mode, got ${modes.join(" ")}`); process.exit(2); }
  const issuing = modes[0] === "--issue";

  const v6Path = `${DIR}/historical-v6-results.json`;
  const synPath = `${DIR}/synthetic-v2-candidate2-results.json`;
  const v6 = existsSync(v6Path) ? readArtifact("historical-v6-results", DIR).data : null;
  const syn = existsSync(synPath) ? readArtifact("synthetic-v2-candidate2-results", DIR).data : null;
  const lock = readArtifact("candidate2-lock", DIR_C1).data;
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();

  const stages = [
    { stage: 1, set: "historical-holdout-v6", ran: v6 != null, outcome: v6?.outcome ?? null,
      verdict: v6?.verdict ?? null, accessCount: setAccessCount("historical-holdout-v6"),
      coreHash: v6?.identity?.coreHash ?? null, parameterSetHash: v6?.identity?.parameterSetHash ?? null,
      runHash: v6?.runHash ?? null,
      missingBecause: v6 == null ? `no results artifact at ${v6Path} — stage one has not run` : null },
    { stage: 2, set: "synthetic-stress-holdout-v2", ran: syn != null, outcome: syn?.outcome ?? null,
      verdict: syn?.verdict ?? null, accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      coreHash: syn?.identity?.coreHash ?? null, parameterSetHash: syn?.identity?.parameterSetHash ?? null,
      runHash: syn?.runHash ?? null,
      missingBecause: syn == null ? `no results artifact at ${synPath} — stage two has not run` : null },
  ];
  const [s1, s2] = stages;
  const ran = stages.filter((s) => s.ran);
  const identitySplit = ran.length === 2
    && (s1.coreHash !== s2.coreHash || s1.parameterSetHash !== s2.parameterSetHash);
  const currentMatches = ran.every((s) => s.coreHash === core.aggregateCoreHash
    && s.parameterSetHash === def.parameterSetHash);
  const verdict = compoundVerdict({ s1, s2, identitySplit });

  console.log("CANDIDATE 2 COMPOUND FORMAL VERDICT\n");
  for (const s of stages) {
    console.log(`  stage ${s.stage}  ${s.set.padEnd(30)} ${s.ran ? `${s.outcome} (${s.verdict})` : "NOT RUN"}  access ${s.accessCount}`);
    if (s.missingBecause) console.log(`           ${s.missingBecause}`);
  }
  console.log(`\n  candidate ${lock.candidateId} core ${core.aggregateCoreHash.slice(0, 16)}... calibration ${versionOf("possessionCalibrationVersion")}`);
  console.log(`  identity split ${identitySplit} · stages match the loaded candidate ${currentMatches}`);
  console.log(`\n  VERDICT: ${verdict}`);
  console.log(`           ${COMPOUND_VERDICTS[verdict]}`);

  if (!issuing) {
    console.log(`\nPREFLIGHT ONLY — nothing was written.`);
    process.exit(verdict === "CANDIDATE2_HOLDOUT_VALIDATED" ? 0 : 2);
  }
  if (ran.length < 2) {
    console.error(`\nREFUSED: --issue requires both stages to have produced a formal result. ${ran.length}/2 have.`);
    console.error("  A compound verdict written before its stages ran is the out-of-order write this mode exists to prevent.");
    process.exit(2);
  }

  const payload = {
    candidate2CompoundFormalVerdictVersion: "1.0.0",
    verdict, verdictMeaning: COMPOUND_VERDICTS[verdict],
    vocabulary: COMPOUND_VERDICTS,
    candidate: { candidateId: lock.candidateId, coreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      lockStatus: lock.candidateLockStatus },
    stages, identitySplit, stagesMatchLoadedCandidate: currentMatches,
    decisionRule: [
      "1. No stage has run -> CANDIDATE2_NOT_YET_DETERMINED.",
      "2. Stage two ran without a PASSING stage one -> CANDIDATE2_STAGE_ORDER_VIOLATED. The synthetic result is not evidence, whatever it says.",
      "3. Stage one FAILED or was INVALID -> the verdict names stage one. Stage two is correctly never opened.",
      "4. Either stage has not run -> CANDIDATE2_NOT_YET_DETERMINED.",
      "5. The two stages scored different cores or parameter sets -> CANDIDATE2_IDENTITY_SPLIT.",
      "6. Stage two FAILED or was INVALID -> the verdict names stage two.",
      "7. Otherwise CANDIDATE2_HOLDOUT_VALIDATED.",
    ],
    notClaimed: ["HOLDOUT_VALIDATED as a repository status", "PRIVATE_PREVIEW_VALIDATED",
      "PRODUCTION_READY", "ACTIVE", "any deployment authorization"],
    productionActivation: "requires an explicit CEO GO LIVE. This artifact authorizes nothing.",
  };
  payload.verdictHash = createHash("sha256").update(JSON.stringify({ verdict, stages })).digest("hex");
  const { path } = writeArtifact("candidate2-compound-formal-verdict", payload, {
    generationCommand: "npm run validation:candidate2-formal-verdict -- --issue",
    dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nwrote ${path}`);
  process.exit(verdict === "CANDIDATE2_HOLDOUT_VALIDATED" ? 0 : 1);
}
