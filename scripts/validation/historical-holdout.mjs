#!/usr/bin/env node
// ── Historical holdout v3 — ONE-TIME formal validation ──────────────────────
//   npm run validation:historical-holdout -- --unlock-holdout \
//     --unlock-historical-holdout-v3 --operator="..." --reason="..."
//
// Opens the set once, evaluates all 8 fixtures on the frozen seeds and the
// frozen supported scope, and writes an immutable result. Every threshold was
// frozen and pushed before this command could run.
//
// Unavailable metrics contribute no error, no pass credit and no failure. 216 of
// 240 team-level target cells are unavailable, and zero-filling them would
// produce a near-perfect score that measures nothing.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6, reconcile } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SCOPE_POLICY, scopePolicyHash, classifyTeamField, OPPORTUNITY_BOUNDS } from "../../src/v3/calibration/holdoutScopePolicy.js";
import { evaluateFixture, replayCheck, scoreIdentity, median } from "./holdoutEval.mjs";
import { runSealedSetOnce, realSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS, manifestHash } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifest } from "./preflight.mjs";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const SET = "historical-holdout-v3";
const RUN_PATH = `${ARTIFACT_DIR_6C3}/historical-holdout-run.json`;
// The holdout's own seed block. Frozen here, distinct from every other block.
const holdoutSeed = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 6030000 + i);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("games", 4096));
  const operator = arg("operator");
  const reason = arg("reason");
  const resume = process.argv.includes("--resume");

  if (!operator || !reason) {
    console.error("REFUSED: --operator and --reason are required. An unexplained holdout access is not an audit record.");
    process.exit(2);
  }
  if (seeds < HOLDOUT.minGamesPerHoldoutFixture) {
    console.error(`REFUSED: ${seeds} games per fixture is below the frozen minimum of ${HOLDOUT.minGamesPerHoldoutFixture}.`);
    process.exit(2);
  }

  // ── identity: nothing may have moved since the preflight ─────────────────
  const preflight = readArtifact("phase6c3-preflight", ARTIFACT_DIR_6C3);
  const coreManifest = readArtifact("candidate-core-manifest", ARTIFACT_DIR_6C3);
  const reference = readArtifact("internal-reference-baseline", ARTIFACT_DIR_6C3);
  const dryrun = readArtifact("holdout-pipeline-dryrun", ARTIFACT_DIR_6C3);
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const def = defaultRuntimeParameterSet();

  if (preflight.data.formalValidationMayBegin !== true) {
    console.error("REFUSED: the preflight did not authorise formal validation."); process.exit(2);
  }
  if (dryrun.data.allPass !== true) {
    console.error("REFUSED: the pipeline dry run did not pass."); process.exit(2);
  }
  const liveCore = buildCoreManifest();
  if (liveCore.aggregateCoreHash !== coreManifest.data.aggregateCoreHash) {
    console.error(`REFUSED: the candidate core changed since the preflight.\n  manifest ${coreManifest.data.aggregateCoreHash}\n  live     ${liveCore.aggregateCoreHash}\nThis is an INVALID_RUN precondition, not something to work around.`);
    process.exit(2);
  }
  const holdoutHash = manifestHash(HISTORICAL_HOLDOUT_V3_IDS, SET);
  const identity = {
    candidateCommit: coreManifest.data.candidateCommit,
    coreHash: liveCore.aggregateCoreHash,
    parameterSetHash: def.parameterSetHash,
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    acceptancePolicyHash: acceptancePolicyHash(),
    scopePolicyHash: scopePolicyHash(),
    holdoutManifestHash: holdoutHash,
    referenceHash: reference.data.referenceHash,
    seedBlock: "actual-game @ 6030000+",
    gamesPerFixture: seeds,
  };

  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const tm = new Map(targets.records.map((r) => [r.fixtureId, r]));
  const byId = new Map(loadPlayers().profiles.map((p) => [p.calibrationPlayerId, p]));
  const fm = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));

  console.log("HISTORICAL HOLDOUT v3 — ONE-TIME FORMAL VALIDATION\n");
  console.log(`  operator            ${operator}`);
  console.log(`  reason              ${reason}`);
  console.log(`  candidate commit    ${identity.candidateCommit}`);
  console.log(`  core hash           ${identity.coreHash}`);
  console.log(`  parameterSetHash    ${identity.parameterSetHash}`);
  console.log(`  calibration version ${identity.calibrationVersion}`);
  console.log(`  acceptance policy   ${identity.acceptancePolicyHash.slice(0, 16)}...  (ratio gate ${HOLDOUT.maxHoldoutToInternalCompositeRatio})`);
  console.log(`  scope policy        ${identity.scopePolicyHash.slice(0, 16)}...`);
  console.log(`  holdout manifest    ${identity.holdoutManifestHash}`);
  console.log(`  internal baseline   ${reference.data.baseline.internalCompositeMean} (mean composite MAE)`);
  console.log(`  games per fixture   ${seeds}`);
  console.log(`  fixtures            ${HISTORICAL_HOLDOUT_V3_IDS.length}\n`);

  const seal = await realSeal(SET);
  let state;
  try {
    state = runSealedSetOnce({
      seal, identity, members: HISTORICAL_HOLDOUT_V3_IDS, runPath: RUN_PATH,
      reason, actor: operator, resume,
      evaluate: (id, i) => {
        const fixture = fm.get(id);
        const target = tm.get(id);
        const t0 = performance.now();
        const ev = evaluateFixture({ fixture, target, byId, seeds, seedAt: holdoutSeed });
        const rep = replayCheck({ fixture, byId, seedAt: holdoutSeed });
        const ident = scoreIdentity({ identityTargets: target?.identityTargets, structural: { ...ev.structural, possessions: ev.structural.meanPossessions }, reference: reference.data.referenceMedians });
        const teamFields = Object.entries(target.teamTargets).map(([k, v]) => classifyTeamField(k, v));
        const elapsed = Math.round(performance.now() - t0);
        const line = `  [${i + 1}/8] ${id.padEnd(22)} composite ${String(ev.compositeMae ?? "n/a").padStart(8)}  proxy ${ev.supportedShareMetrics.length}/5  identity ${ident.traitsPassed}/${ident.traitsScored}  inv ${ev.structural.invariantViolations}  ties ${ev.structural.finalTies}  ${elapsed}ms`;
        console.log(line);
        return {
          ...ev,
          confidence: target.confidence, unitConfidence: target.unitTargets?.confidence ?? null,
          replay: rep, identity: ident,
          supportedScope: {
            teamFieldsTotal: teamFields.length,
            byClass: teamFields.reduce((a, f) => { a[f.supportClass] = (a[f.supportClass] ?? 0) + 1; return a; }, {}),
            evaluatedTeamFields: teamFields.filter((f) => f.evaluated).map((f) => f.id),
            unavailable: teamFields.filter((f) => f.supportClass === "UNAVAILABLE").map((f) => ({ id: f.id, availability: f.availability, reason: f.reason })),
            notApplicable: teamFields.filter((f) => f.supportClass === "NOT_APPLICABLE").map((f) => ({ id: f.id, reason: f.reason })),
          },
          elapsedMs: elapsed,
        };
      },
    });
  } catch (e) {
    // Both refusal classes print a refusal, not a stack trace: a sealed set
    // declining to open is the system working, not an internal error.
    if (e instanceof RunRefused || e.code === "HOLDOUT_SEALED") {
      console.error(`\nREFUSED (${e.code}): ${e.message.split("\n")[0]}`);
      console.error(`  access count remains ${seal.accessCount()}`);
      process.exit(2);
    }
    throw e;
  }

  // ── frozen gate evaluation ───────────────────────────────────────────────
  const results = state.results;
  const internalMean = reference.data.baseline.internalCompositeMean;
  const internalMedian = reference.data.baseline.internalCompositeMedian;
  const composites = results.map((r) => r.compositeMae).filter((x) => x != null);
  const holdoutComposite = composites.length ? composites.reduce((a, b) => a + b, 0) / composites.length : null;
  const ratio = holdoutComposite != null ? holdoutComposite / internalMean : null;

  const catastrophicThreshold = 3 * internalMedian;
  const perFixture = results.map((r) => {
    const invariantsClean = r.structural.invariantViolations === 0;
    const noTies = r.structural.finalTies === 0;
    const noImpossible = r.structural.impossibleStatistics === 0;
    const replayExact = r.replay.exact === true;
    const opportunityOk = r.structural.topOptionShareWithinBounds === true;
    const eraOk = r.structural.threePointAttemptsInPreThreeEra === null || r.structural.threePointAttemptsInPreThreeEra === 0;
    const identityOk = r.identity.allScoredPass === true;
    const catastrophic = (r.compositeMae != null && r.compositeMae > catastrophicThreshold) || !invariantsClean;
    const reasons = [];
    if (!invariantsClean) reasons.push(`${r.structural.invariantViolations} invariant violations`);
    if (!noTies) reasons.push(`${r.structural.finalTies} final ties`);
    if (!noImpossible) reasons.push(`${r.structural.impossibleStatistics} impossible statistics`);
    if (!replayExact) reasons.push("replay not exact");
    if (!opportunityOk) reasons.push(`top-option share ${r.structural.meanTopOptionShare} outside [${OPPORTUNITY_BOUNDS.minTopOptionShare}, ${OPPORTUNITY_BOUNDS.maxTopOptionShare}]`);
    if (!eraOk) reasons.push(`${r.structural.threePointAttemptsInPreThreeEra} three-point attempts in a pre-three era`);
    if (!identityOk) reasons.push(`identity ${r.identity.traitsPassed}/${r.identity.traitsScored} traits passed`);
    if (catastrophic) reasons.push(`catastrophic: composite ${r.compositeMae} > ${r5(catastrophicThreshold)}`);
    return {
      fixtureId: r.fixtureId, eraStyleId: r.eraStyleId,
      overallConfidence: r.confidence?.overallFixtureConfidence ?? null,
      compositeMae: r.compositeMae, hasNumericSurface: r.compositeMae != null,
      invariantsClean, noTies, noImpossible, replayExact, opportunityOk, eraOk, identityOk, catastrophic,
      pass: invariantsClean && noTies && noImpossible && replayExact && opportunityOk && eraOk && identityOk && !catastrophic,
      failureReasons: reasons,
    };
  });

  const highConf = perFixture.filter((f) => /HIGH/.test(f.overallConfidence ?? ""));
  const gates = {
    everyFixtureExecuted: results.length === HISTORICAL_HOLDOUT_V3_IDS.length,
    zeroInvariantFailures: results.every((r) => r.structural.invariantViolations === 0),
    zeroFinalTies: results.every((r) => r.structural.finalTies === 0),
    replayExactEverywhere: results.every((r) => r.replay.exact),
    noImpossibleStatistics: results.every((r) => r.structural.impossibleStatistics === 0),
    opportunityWithinBounds: results.every((r) => r.structural.topOptionShareWithinBounds),
    eraRulesAuthoritative: results.every((r) => r.structural.threePointAttemptsInPreThreeEra === null || r.structural.threePointAttemptsInPreThreeEra === 0),
    identityDirectionallyPreserved: results.every((r) => r.identity.allScoredPass),
    zeroCatastrophicFixtures: perFixture.filter((f) => f.catastrophic).length === HOLDOUT.maxCatastrophicFixtures,
    compositeRatioWithinPolicy: ratio != null && ratio <= HOLDOUT.maxHoldoutToInternalCompositeRatio,
    noHighConfidenceFixtureFails: highConf.every((f) => f.pass),
    everyFixturePasses: perFixture.every((f) => f.pass),
  };
  const outcome = Object.values(gates).every(Boolean) ? RUN_OUTCOMES.PASS : RUN_OUTCOMES.FAIL;
  const verdict = outcome === RUN_OUTCOMES.PASS ? "HISTORICAL_HOLDOUT_PASS" : "HISTORICAL_HOLDOUT_FAIL";

  const scopeTotals = results.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.supportedScope.byClass)) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {});
  const rec = reconcile({ label: "team-field-classes", counts: scopeTotals, expectedTotal: Object.values(scopeTotals).reduce((a, b) => a + b, 0) });

  const payload = {
    formalHoldoutRunVersion: versionOf("formalHoldoutRunVersion"),
    set: SET, verdict, outcome,
    identity, accessEvent: state.accessEvent,
    accessCountBefore: state.accessCountBefore, accessCountAfter: seal.accessCount(),
    runStatus: state.status, runHash: state.runHash,
    fixturesEvaluated: results.length, gamesPerFixture: seeds, totalGames: results.length * seeds,
    erasCovered: [...new Set(results.map((r) => r.eraStyleId))],
    internalBaseline: { mean: internalMean, median: internalMedian, source: "historical calibration v3, same evaluation code, disjoint seeds" },
    holdoutComposite: r5(holdoutComposite),
    holdoutToInternalRatio: r5(ratio),
    ratioGate: HOLDOUT.maxHoldoutToInternalCompositeRatio,
    catastrophicThreshold: r5(catastrophicThreshold),
    gates, perFixture,
    highConfidenceFixtures: highConf.map((f) => f.fixtureId),
    supportedScope: {
      teamFieldClassTotals: scopeTotals, reconciliation: rec,
      proxyShareMapsScored: results.reduce((a, r) => a + r.supportedShareMetrics.length, 0),
      proxyShareMapsPossible: results.length * 5,
      fixturesWithoutNumericSurface: perFixture.filter((f) => !f.hasNumericSurface).map((f) => f.fixtureId),
      identityTraitsScored: results.reduce((a, r) => a + r.identity.traitsScored, 0),
      identityTraitsUnscored: results.reduce((a, r) => a + r.identity.traitsUnscored, 0),
      zeroFillUsed: false,
      exclusionRule: SCOPE_POLICY.exclusionRule,
    },
    results,
  };

  const { path } = writeArtifact("historical-holdout-results", payload, {
    generationCommand: "npm run validation:historical-holdout",
    sourceArtifacts: [`${ARTIFACT_DIR_6C3}/phase6c3-preflight.json`, `${ARTIFACT_DIR_6C3}/internal-reference-baseline.json`, `${ARTIFACT_DIR_6C3}/candidate-core-manifest.json`],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });

  console.log("\n  SUPPORTED SCOPE");
  for (const [k, v] of Object.entries(scopeTotals)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`    proxy share maps scored     ${payload.supportedScope.proxyShareMapsScored}/${payload.supportedScope.proxyShareMapsPossible}`);
  console.log(`    identity traits scored      ${payload.supportedScope.identityTraitsScored} (unscored ${payload.supportedScope.identityTraitsUnscored})`);
  console.log(`    fixtures without a numeric surface  ${payload.supportedScope.fixturesWithoutNumericSurface.join(", ") || "none"}`);
  console.log(`    zero-fill used              ${payload.supportedScope.zeroFillUsed}`);
  console.log("\n  QUANTITATIVE GENERALISATION");
  console.log(`    internal composite MAE      ${internalMean}`);
  console.log(`    holdout composite MAE       ${r5(holdoutComposite)}`);
  console.log(`    ratio                       ${r5(ratio)}  (gate <= ${HOLDOUT.maxHoldoutToInternalCompositeRatio})`);
  console.log("\n  GATES");
  for (const [k, v] of Object.entries(gates)) console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
  const failed = perFixture.filter((f) => !f.pass);
  if (failed.length) {
    console.log("\n  FIXTURES FAILING");
    for (const f of failed) console.log(`    ${f.fixtureId}: ${f.failureReasons.join("; ")}`);
  }
  console.log(`\n  VERDICT: ${verdict}`);
  console.log(`  access count: ${state.accessCountBefore} -> ${seal.accessCount()}`);
  console.log(`\nwrote ${path}`);
  process.exit(outcome === RUN_OUTCOMES.PASS ? 0 : 1);
}
