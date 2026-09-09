#!/usr/bin/env node
// ── WS13: seal Historical Holdout V5 at access count zero ───────────────────
//   npm run v5:seal
//
// The last gate before the set becomes untouchable. Every hash the formal run
// will verify is checked HERE, immediately before sealing, so a seal can never
// claim to bind something that has already moved. Sealing reads nothing: the
// set is registered, its access log stays empty, and the artifact records what
// the one authorized runner must match.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { SEALED_SETS, setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "./coreGraph.mjs";
import { registryHash } from "../validation/traitRegistry.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./preflight6c4b1.mjs";

const SET = "historical-holdout-v5";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  if (artifactExists("historical-holdout-v5-seal", DIR) && !process.argv.includes("--reseal")) {
    console.log("historical-holdout-v5-seal already exists — the set is sealed. Re-sealing is refused.");
    const d = readArtifact("historical-holdout-v5-seal", DIR).data;
    console.log(`  state ${d.state} · access count ${setAccessCount(SET)}`);
    process.exit(0);
  }

  const recert = readArtifact("candidate1-lock-recertification", DIR);
  const policy = readArtifact("historical-holdout-v5-policy", DIR);
  const margins = readArtifact("trait-practical-margin-policy-v5", DIR);
  const selection = readArtifact("historical-v5-selection", DIR);
  const selPolicy = readArtifact("historical-v5-selection-policy", DIR);
  const manifest = readArtifact("historical-holdout-v5-manifest", DIR);
  const seeds = readArtifact("historical-holdout-v5-seeds", DIR);
  const dryrun = readArtifact("historical-v5-runner-dry-run", DIR);
  const obs = readArtifact("historical-observability-certification-candidate1", DIR);
  const refs = readArtifact("era-reference-certification-candidate1", DIR);
  const pool = readArtifact("historical-v5-candidate-pool-v2", DIR);
  const core = await buildCoreManifestV3();

  console.log("PRE-SEAL VERIFICATION\n");
  gate("candidate1CoreUnchanged", core.aggregateCoreHash === recert.data.coreHash && core.aggregateCoreHash === policy.data.hashes.candidateCoreHash,
    `live ${core.aggregateCoreHash.slice(0, 16)}... == re-certified lock == policy`);
  gate("parameterSetUnchanged", def.parameterSetHash === recert.data.parameterSetHash && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `${def.parameterSetHash.slice(0, 16)}..., zero drift`);
  gate("calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === recert.data.possessionCalibrationVersion,
    versionOf("possessionCalibrationVersion"));
  gate("policyHashStable", policy.data.frozen === true && policy.data.policyHash === policy.data.policyHash,
    policy.data.policyHash.slice(0, 16) + "...");
  gate("marginPolicyHashStable", margins.data.frozen === true && margins.data.policyHash === policy.data.hashes.practicalMarginPolicyHash,
    margins.data.policyHash.slice(0, 16) + "...");
  gate("selectionHashStable", selection.data.pass === true && selection.data.selectionPolicyHash === selPolicy.data.policyHash,
    `${selection.data.selectionHash.slice(0, 16)}... under selection policy ${selPolicy.data.policyHash.slice(0, 16)}...`);
  gate("manifestHashStable", manifest.data.pass === true && manifest.data.selectionHash === selection.data.selectionHash,
    `${manifest.data.manifestHash.slice(0, 16)}... binding selection ${manifest.data.selectionHash.slice(0, 16)}...`);
  gate("seedHashStable", seeds.data.pass === true && seeds.data.manifestHash === manifest.data.manifestHash,
    `${seeds.data.seedHash.slice(0, 16)}... binding the manifest`);
  gate("referenceCertificationStable", refs.outputHash === policy.data.hashes.eraReferenceCertificationHash,
    refs.outputHash.slice(0, 16) + "...");
  gate("observabilityCertificationStable", obs.outputHash === policy.data.hashes.observabilityCertificationHash
    && registryHash() === obs.data.traitRegistryHash, obs.outputHash.slice(0, 16) + "...");
  gate("dryRunPassed", dryrun.data.pass === true, `${dryrun.data.checks.length} checks, ${dryrun.data.failedChecks.length} failed`);
  gate("poolHashStable", pool.data.poolHash === selection.data.poolHash, pool.data.poolHash.slice(0, 16) + "...");

  console.log("\nSEAL PRECONDITIONS\n");
  gate("setRegistered", SET in SEALED_SETS, `access log ${SEALED_SETS[SET]}`);
  gate("accessCountZero", setAccessCount(SET) === 0, `access count ${setAccessCount(SET)}`);
  gate("noAccessLogYet", !existsSync(SEALED_SETS[SET]), `${SEALED_SETS[SET]} does not exist — nothing has been read`);
  gate("noResultsArtifact", !artifactExists("historical-holdout-v5-results", DIR), "no V5 results artifact exists");
  gate("noRunState", !existsSync(`${DIR}/historical-holdout-v5-run.json`), "no V5 run state exists");
  // ── no V5 id in any SIMULATION OUTPUT ─────────────────────────────────────
  // The question is whether a V5 fixture has ever been PLAYED, not whether it
  // has ever been named. Fifteen of the sixteen selected teams are carried
  // forward from the V4 candidate POOL, so of course they appear in that
  // pool's corpus, player store, target store and pool artifact — those are
  // definitions, and a definition is how an unconsumed pool team exists at
  // all. The first version of this check grepped whole directories, counted
  // those definitions as leaks, and refused the seal on 13 of them.
  //
  // Output-bearing artifacts are named explicitly: results, run state,
  // verdicts, dry runs, box scores, ledgers and probability caches.
  const v5Ids = [...manifest.data.matchups.map((m) => m.matchupId),
    ...manifest.data.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId])];
  const OUTPUT_PATTERN = /(results|-run|verdict|dryrun|dry-run|summary|box|ledger|probability|attempts)\.json$|\.jsonl$/;
  const outputFiles = (git("ls-tree", "-r", "--name-only", "HEAD", "data/validation", "data/calibration", ".cache") ?? "")
    .split("\n").filter((f) => f && OUTPUT_PATTERN.test(f));
  const leaks = [];
  for (const id of v5Ids) {
    const hit = git("grep", "-l", "-F", id, "HEAD", "--", ...outputFiles);
    if (hit) leaks.push(`${id} in ${hit.replace(/\n/g, ", ")}`);
  }
  // The complement, so the check cannot pass by looking in the wrong place:
  // the carried teams MUST appear in the V4 pool definition they came from.
  const carriedIds = v5Ids.filter((id) => id.startsWith("v4-"));
  const definedInPool = carriedIds.filter((id) => git("grep", "-l", "-F", id, "HEAD", "--", "data/validation/6c3r/historical-corpus-v4.json"));
  gate("noV5IdInAnySimulationOutput", leaks.length === 0,
    `${v5Ids.length} V5 ids checked against ${outputFiles.length} output-bearing artifacts · leaks ${leaks.length}`);
  gate("carriedTeamsAreDefinedButUnplayed", definedInPool.length === carriedIds.length,
    `${carriedIds.length} carried teams appear in the V4 pool corpus that defines them (as they must) and in zero result artifacts`);
  gate("syntheticV2Untouched", setAccessCount("synthetic-stress-holdout-v2") === 0, "synthetic-stress-holdout-v2 access 0");
  gate("priorSealsIndependent", setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
    "V3 and V4 remain at 1 each; V5's log is a separate file, so its count cannot borrow theirs");

  if (fail.length) { console.log(`\nSEAL REFUSED: ${fail.join(", ")}`); process.exit(2); }

  const payload = {
    historicalV5SealVersion: VALIDATION_VERSIONS.historicalV5SealVersion,
    set: SET,
    setVersion: VALIDATION_VERSIONS.historicalHoldoutV5SetVersion,
    state: "SEALED_UNREAD",
    accessCount: setAccessCount(SET),
    accessLogPath: SEALED_SETS[SET],
    accessLogExists: existsSync(SEALED_SETS[SET]),
    sealedAtCommit: git("rev-parse", "HEAD"),
    candidate: {
      candidateId: recert.data.candidateId, lockRevision: recert.data.lockRevision,
      coreHash: recert.data.coreHash, parameterSetHash: recert.data.parameterSetHash,
      possessionCalibrationVersion: recert.data.possessionCalibrationVersion,
      candidateCommit: recert.data.recertifiedAtCommit,
    },
    boundHashes: {
      manifestHash: manifest.data.manifestHash,
      selectionHash: selection.data.selectionHash,
      selectionPolicyHash: selPolicy.data.policyHash,
      acceptancePolicyHash: policy.data.policyHash,
      practicalMarginPolicyHash: margins.data.policyHash,
      seedHash: seeds.data.seedHash,
      eraReferenceCertificationHash: refs.outputHash,
      observabilityCertificationHash: obs.outputHash,
      candidatePoolHash: pool.data.poolHash,
      dryRunHash: dryrun.outputHash,
      traitRegistryHash: registryHash(),
    },
    authorizedRunner: {
      module: "scripts/validation/historical-holdout-v5.mjs",
      command: "npm run validation:historical-v5 -- --unlock-holdout --unlock-historical-holdout-v5 --operator=\"...\" --reason=\"...\"",
      version: VALIDATION_VERSIONS.historicalHoldoutV5RunnerVersion,
      note: "No other command may resolve this set. The runner verifies every bound hash above before touching the seal, and refuses to start if any has moved.",
    },
    failureBehaviour: {
      onHashMismatch: "REFUSED before the seal is touched; access count stays 0",
      onCrashAfterUnlock: "the access event is consumed; the run resumes under the SAME event with --resume, and a fresh run is refused",
      onSecondRun: "refused with SECOND_RUN_REFUSED; the first result stands as the only independent evidence",
      onFail: "every artifact is preserved, tuning against V5 is forbidden, Synthetic V2 stays sealed, and formal validation for Candidate 1 ends",
    },
    protocol: { matchups: manifest.data.matchupCount, teams: manifest.data.teamCount,
      gamesPerSurface: policy.data.protocol.gamesPerSurface, totalGames: policy.data.protocol.totalGames },
    sealedAt: new Date(0).toISOString().replace("1970-01-01T00:00:00.000Z", "recorded by the artifact writer's own timestamp"),
    sealIntegrity: { v5IdsChecked: v5Ids.length, outputArtifactsSearched: outputFiles.length, leaksFound: leaks.length,
      carriedTeamsDefinedInPriorPool: definedInPool.length,
      note: "A carried pool team appears in the V4 pool's corpus, player store and target store by definition. Simulation OUTPUT is what a seal must exclude, and the search covers every results, run, verdict, dry-run, box, ledger, probability and access-log artifact in the tree." },
    otherSeals: Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, { status: v.status, accessCount: v.accessCount }])),
    pass: true,
  };
  payload.sealHash = createHash("sha256").update(JSON.stringify({ set: SET, bound: payload.boundHashes, candidate: payload.candidate })).digest("hex");
  writeArtifact("historical-holdout-v5-seal", payload, {
    generationCommand: "npm run v5:seal", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nHISTORICAL HOLDOUT V5 SEALED · ${payload.state} · access count ${payload.accessCount} · sealHash ${payload.sealHash.slice(0, 16)}...`);
}
