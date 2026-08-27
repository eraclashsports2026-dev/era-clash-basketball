#!/usr/bin/env node
// ── The Synthetic V2 second-stage blocker, in full ──────────────────────────
//   npm run v6:blocker
//
// A standalone record of why no holdout was opened, precise enough that a
// preparation phase can act on it without re-deriving anything.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SEALED_SETS, setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { DIR, DIR_B1 } from "./preflight6c4b2.mjs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const pre = readArtifact("phase6c4b2-preflight", DIR);
  const blocker = pre.data.blockers[0];
  const dryrun = readArtifact("historical-v5-runner-dry-run", DIR_B1).data;
  const synManifest = JSON.parse(readFileSync("data/calibration/synthetic-stress-holdout-v2-manifest.json", "utf8"));
  const pkg = readArtifact("phase6c4b2-validation-package", DIR_B1).data;

  const payload = {
    blockerId: blocker.blockerId,
    detectedInPhase: "6C4B2",
    detectedBeforeAnyHoldoutAccess: true,
    severity: blocker.severity,
    summary: blocker.summary,

    // ── what the second stage HAS ─────────────────────────────────────────
    frozenAndPresent: {
      fixtures: { count: SYNTHETIC_STRESS_HOLDOUT_V2.length,
        manifestPath: "data/calibration/synthetic-stress-holdout-v2-manifest.json",
        manifestHash: synManifest.manifestHash, setVersion: synManifest.setVersion, frozenAt: synManifest.frozenAt,
        purposes: synManifest.purposes,
        note: "Sixteen public-card fives with coaches and eras — structurally exactly what the engine consumes. Compatibility with Candidate 1 is not the problem." },
      guardrailPolicy: { location: "HOLDOUT.syntheticGuardrails in src/v3/calibration/acceptancePolicy.js",
        acceptancePolicyHash: acceptancePolicyHash(),
        guardrails: HOLDOUT.syntheticGuardrails,
        minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
        note: "Ten named per-fixture guardrails, frozen since Phase 6C2C2 and covered by the pre-calibration artifact freeze." },
      seal: { registered: "synthetic-stress-holdout-v2" in SEALED_SETS,
        accessLogPath: SEALED_SETS["synthetic-stress-holdout-v2"],
        accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        accessLogExists: existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
        state: "SEALED_UNREAD" },
    },

    // ── what the second stage LACKS ───────────────────────────────────────
    missing: blocker.missing,

    // ── why this stops stage one ──────────────────────────────────────────
    whyHistoricalV5WasNotOpened: blocker.whyThisStopsHistoricalV5,
    whyNotBuiltInThisPhase: blocker.whyNotFixedInThisPhase,
    irreversibility: "A sealed set can be opened once. Opening Historical V5 would have consumed it permanently and produced, at best, a stage-one result inside a validation defined by both stages passing. That trade is the owner's to make, not this phase's, and the brief already made it: do not consume V5 while the second stage is known unusable.",

    // ── what a preparation phase must produce ─────────────────────────────
    requiredToUnblock: blocker.requiredToUnblock,
    referenceImplementation: {
      note: "Historical V5's own preparation is the worked example, and every piece has a direct counterpart.",
      map: [
        { need: "seed set in its own domain, disjointness proven at full volume", precedent: "scripts/v5/seeds.mjs — 49,152 seeds per stream, 35 comparisons against 17 prior populations, zero overlap" },
        { need: "frozen sample volume", precedent: "historical-holdout-v5-policy.json protocol block — 2,048 pairs, 4,096 games per surface, fixed before selection" },
        { need: "verdict aggregation rule", precedent: "historical-holdout-v5-policy.json traitGates.aggregate — minimum pass rate, maximum hard fails, per-fixture and per-era rules" },
        { need: "transactional runner", precedent: "scripts/validation/historical-holdout-v5.mjs on runSealedSetOnce" },
        { need: "dry run on non-holdout fixtures", precedent: `scripts/v5/dryRun.mjs — ${dryrun.checks.length} checks including crash, resume, duplicate refusal and four identity-mismatch refusals` },
        { need: "second-stage package binding", precedent: "phase6c4b2-validation-package.json holdout block, which binds V5's hashes and names its runner" },
      ],
    },

    // ── what this blocker does NOT affect ─────────────────────────────────
    unaffected: {
      historicalV5Package: blocker.doesNotInvalidate,
      candidate1: "Candidate 1 remains SELECTED / LOCKED / DEVELOPMENT_LOCKED_SCOPED at calibration 1.1.0, lock revision 2, with its core and parameter hashes verified equal to the sealed package in this phase's preflight.",
      priorVerdicts: "Historical V3 and V4 remain CONSUMED / FAIL at access 1 each, untouched.",
      production: "engine 3.2.0, app 2.7.2, main at 9cd95ff, every production flag false, no deployment.",
    },
    holdoutsOpenedInThisPhase: { historicalV5: 0, syntheticV2: 0 },
    preparedCommandsExecuted: { historicalV5: 0, syntheticV2: 0, formalVerdict: 0 },
    preflightArtifactHash: pre.outputHash,
    recordedAtCommit: git("rev-parse", "HEAD"),
    recommendedNextPhase: "A Synthetic Stress Holdout V2 preparation phase (the counterpart of 6C4B1 for the second stage), after which a re-run of this execution phase can open both sets in order.",
  };
  const { path } = writeArtifact("synthetic-v2-package-blocker", payload, {
    generationCommand: "npm run v6:blocker", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`${payload.blockerId}`);
  console.log(`  present: ${Object.keys(payload.frozenAndPresent).join(", ")}`);
  console.log(`  missing: ${Object.keys(payload.missing).join(", ")}`);
  console.log(`  holdouts opened: V5 ${payload.holdoutsOpenedInThisPhase.historicalV5} · synthetic ${payload.holdoutsOpenedInThisPhase.syntheticV2}`);
  console.log(`wrote ${path}`);
}
