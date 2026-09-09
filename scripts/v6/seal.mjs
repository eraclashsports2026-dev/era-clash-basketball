#!/usr/bin/env node
// ── WS15: seal Historical Holdout V6 at access count zero ───────────────────
//   npm run v6:seal
//
// The last gate before the set becomes untouchable. Every hash the formal run
// will verify is checked HERE, immediately before sealing, so a seal can never
// claim to bind something that has already moved. Sealing reads nothing: the
// set is registered, its access log stays empty, and the artifact records what
// the one authorized runner must match.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { SEALED_SETS, setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { registryHash } from "../validation/traitRegistry.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, C1D } from "./reconcile.mjs";

const SET = "historical-holdout-v6";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  if (artifactExists("historical-v6-seal", DIR) && !process.argv.includes("--reseal")) {
    const d = readArtifact("historical-v6-seal", DIR).data;
    console.log("historical-v6-seal already exists — the set is sealed. Re-sealing is refused.");
    console.log(`  state ${d.state} · access count ${setAccessCount(SET)}`);
    process.exit(0);
  }

  const lock = readArtifact("candidate2-lock", C1D);
  const verdict = readArtifact("historical-v6-verdict-policy", DIR);
  const margins = readArtifact("historical-v6-practical-margins", DIR);
  const plan = readArtifact("historical-v6-sample-plan", DIR);
  const selPolicy = readArtifact("historical-v6-selection-policy", DIR);
  const selection = readArtifact("historical-v6-selection", DIR);
  const eligPolicy = readArtifact("historical-v6-eligibility-policy", DIR);
  const pool = readArtifact("historical-v6-expanded-pool", DIR);
  const manifest = readArtifact("historical-holdout-v6-manifest", DIR);
  const targets = readArtifact("historical-v6-targets", DIR);
  const coverage = readArtifact("historical-v6-target-coverage", DIR);
  const traitPolicy = readArtifact("historical-v6-trait-policy", DIR);
  const obs = readArtifact("historical-v6-observability-certification", DIR);
  const refs = readArtifact("era-reference-certification-candidate2", DIR);
  const seeds = readArtifact("historical-v6-seeds", DIR);
  const disjoint = readArtifact("historical-v6-seed-disjointness", DIR);
  const dryrun = readArtifact("historical-v6-runner-dry-run", DIR);
  const core = await buildCoreManifestV3();

  console.log(`SEALING ${SET} AT ACCESS COUNT ZERO\n`);

  gate("candidate2CoreUnchanged",
    core.aggregateCoreHash === lock.data.coreHash && core.aggregateCoreHash === verdict.data.hashes.candidate2CoreHash,
    `core ${core.aggregateCoreHash.slice(0, 16)}... equals both the Candidate 2 lock and the verdict policy`);
  gate("parameterSetUnchanged",
    def.parameterSetHash === lock.data.parameterSetHash && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `${activeParameters().length} active parameters, none drifted from its registry default`);
  gate("calibrationVersionUnchanged",
    versionOf("possessionCalibrationVersion") === lock.data.possessionCalibrationVersion,
    `possessionCalibrationVersion ${versionOf("possessionCalibrationVersion")}`);
  gate("engineNotBumpedDuringPreparation",
    versionOf("possessionCalibrationVersion") === "1.2.0" && versionOf("possessionEngineVersion") === "1.2.0",
    "Candidate 2's engine versions are exactly what 6C4C1 locked — a preparation phase does not move engine behaviour");
  gate("eligibilityPolicyFrozenBeforeSelection",
    eligPolicy.data.frozenBeforeSelection === true && pool.data.eligibilityPolicyHash === eligPolicy.data.policyHash,
    `eligibility policy ${eligPolicy.data.historicalV6EligibilityPolicyVersion} bound to the pool`);
  gate("selectionPolicyFrozenBeforeSelection",
    selection.data.selectionPolicyHash === selPolicy.data.selectionPolicyHash
    && selPolicy.data.noSelectionArtifactAtFreezeTime === true,
    `selection policy ${selPolicy.data.historicalV6SelectionPolicyVersion}, frozen while no selection existed`);
  gate("selectionPassedAndStable",
    selection.data.pass === true && selection.data.reorderStability.allIdentical === true,
    `${selection.data.matchups.length} matchups, ${selection.data.reorderStability.permutationsTested} permutations identical`);
  gate("poolHashStable", pool.data.poolHash === selection.data.poolHash, `${pool.data.poolHash.slice(0, 16)}...`);
  gate("manifestBoundToSelection",
    manifest.data.pass === true && manifest.data.selectionHash === selection.data.selectionHash,
    `manifest ${manifest.data.manifestHash.slice(0, 16)}... binds selection ${selection.data.selectionHash.slice(0, 16)}...`);
  gate("targetsBoundToSelection",
    targets.data.pass === true && targets.data.selectionHash === selection.data.selectionHash
    && coverage.data.targetsHash === targets.data.targetsHash,
    `${coverage.data.totals.usableTeamCells} usable team cells, ${coverage.data.totals.nullTeamCells} null`);
  gate("nullTargetsNeverZeroFilled", coverage.data.neverZeroFilled === true
    && manifest.data.targetFreeze.nullTargets === coverage.data.totals.nullTeamCells,
    `${manifest.data.targetFreeze.nullTargets} null cells agree between the manifest and the coverage artifact`);
  gate("marginPolicyBound",
    margins.data.frozen === true && margins.data.policyHash === verdict.data.hashes.practicalMarginPolicyHash,
    `${Object.keys(margins.data.metrics).length} metrics, policy ${margins.data.policyHash.slice(0, 16)}...`);
  gate("samplePlanBound", plan.data.samplePlanHash === verdict.data.hashes.samplePlanHash,
    `decision tier ${plan.data.decisionGamesPerSurface} games per surface, escalating to ${plan.data.tiers.find((t) => t.role === "ESCALATION").gamesPerSurface}`);
  gate("verdictPolicyFrozenBeforeSeal",
    verdict.data.frozenBeforeSeal === true && verdict.data.pass === true
    && verdict.data.aggregation.unit === "INDEPENDENT_MEASUREMENT_CLUSTER",
    `verdict policy ${verdict.data.policyHash.slice(0, 16)}... aggregating on ${verdict.data.aggregation.unit}`);
  gate("observabilityCertificationBound",
    obs.data.pass === true && obs.data.certificationHash === verdict.data.hashes.observabilityCertificationHash
    && obs.data.traitRegistryHash === registryHash(),
    `${obs.data.metricsCertified}/${obs.data.metricsTotal} metrics certified under Candidate 2, registry unchanged`);
  gate("referenceCertificationBound",
    refs.data.pass === true && refs.data.certificationHash === verdict.data.hashes.eraReferenceCertificationHash,
    `8 references certified under Candidate 2, hash ${refs.data.certificationHash.slice(0, 16)}...`);
  gate("traitPolicyBound", traitPolicy.data.pass === true && Boolean(traitPolicy.data.traitPolicyHash),
    `${manifest.data.scoredTraitCount} scored traits, ${manifest.data.excludedTraitCount} excluded, each with a reason`);
  gate("seedsBoundAndDisjoint",
    seeds.data.pass === true && seeds.data.verdictPolicyHash === verdict.data.policyHash
    && disjoint.data.totalOverlap === 0 && disjoint.data.tierDisjointness.totalOverlap === 0,
    `domain ${seeds.data.domain}, ${disjoint.data.priorPopulationsChecked} prior populations, 0 overlap, 0 cross-tier overlap`);
  gate("dryRunPassed", dryrun.data.pass === true,
    `${dryrun.data.branchesExercised} branches, ${dryrun.data.failedBranches.length} failed · refusal codes ${dryrun.data.refusalCodesExercised.join(", ")}`);
  gate("bothRepairedMechanismsScoreable",
    manifest.data.scoredMetrics.includes("assistedRate") && manifest.data.scoredMetrics.includes("refPppVsTeam"),
    `a holdout that cannot observe the repair cannot validate it · scored metrics ${manifest.data.scoredMetrics.join(", ")}`);

  // ── the seal state itself ────────────────────────────────────────────────
  gate("setRegistered", SET in SEALED_SETS, `access log ${SEALED_SETS[SET]}`);
  gate("accessCountZero", setAccessCount(SET) === 0, `access count ${setAccessCount(SET)}`);
  gate("noAccessLogYet", !existsSync(SEALED_SETS[SET]), `${SEALED_SETS[SET]} does not exist — nothing has been read`);
  gate("noResultsArtifact", !artifactExists("historical-v6-results", DIR), "no V6 results artifact exists");
  gate("noRunState", !existsSync(`${DIR}/historical-holdout-v6-run.json`), "no V6 run state exists");

  // ── no V6 identity may appear in any OUTPUT-bearing artifact ─────────────
  // Definitions are how an unconsumed set exists at all: the selected teams
  // necessarily appear in the pool, the player store, the targets and the
  // manifest. The V5 seal's first version grepped whole directories, counted
  // those definitions as leaks and refused on thirteen of them. Only
  // output-bearing artifacts are searched here, and the complement is checked
  // too so the test cannot pass by looking in the wrong place.
  const v6Ids = [...manifest.data.matchups.map((m) => m.matchupId),
    ...manifest.data.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId, m.teamA.key, m.teamB.key].filter(Boolean))];
  // Inverted, because the first version of this gate was weaker than it looked.
  // It searched files matching an OUTPUT_PATTERN and exempted four by name — but
  // none of the four matched the pattern in the first place, so the "explicit
  // exemption" was doing nothing and the real protection was a regex quietly
  // failing to match. Here EVERY json and jsonl file under the data trees is
  // searched, and every file that names a V6 identity must be on an allowlist of
  // files permitted to name one. That cannot pass because a filename fell
  // outside a pattern.
  const walk = (dir) => { const out = [];
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir)) { const f = `${dir}/${e}`;
      if (statSync(f).isDirectory()) out.push(...walk(f)); else if (/\.jsonl?$/.test(f)) out.push(f); }
    return out; };
  const allFiles = [...walk("data/validation"), ...walk("data/calibration"), ...walk(".cache")];
  const ALLOWED = [
    { match: (f) => f === `${DIR}/historical-holdout-v6-manifest.json`,
      why: "the manifest DEFINES the set. A definition is how an unconsumed holdout exists at all." },
    { match: (f) => f === `${DIR}/calibration-players-v6.json`,
      why: "the player store defines the profiles the fixtures are built from." },
    { match: (f) => /historical-v6-(eligibility-policy|expanded-pool|pool-audit|selection-policy|selection|targets|target-coverage|trait-policy|verdict-policy|practical-margins|sample-plan|seeds|seed-disjointness|seal)\.json$/.test(f),
      why: "frozen policy and definition artifacts. They state what will be measured and against what; none contains a measurement." },
    { match: (f) => f === `${DIR}/v6-dry-run-taint.json`,
      why: "the taint record must name the affected team-seasons to be useful. Both are excluded from the pool and appear in no selected matchup." },
    { match: (f) => f.includes("/superseded/"),
      why: "preserved evidence of what was true when issued, including the TAINTED dry run that recorded the leak this gate caught. Deleting it to make the gate pass would destroy the record." },
    { match: (f) => /^data\/validation\/(6c3r|6c4a|6c4b1)\/(calibration-players-v\d|historical-v\d-candidate-pool(-v2)?|historical-v\d-selection)\.json$/.test(f),
      // Not taken on trust: the predicate below reads each file and fails the
      // gate if it declares any candidate output or carries a measurement.
      verify: (f) => { const d = JSON.parse(readFileSync(f, "utf8")).data ?? {};
        const noOutputs = (d.candidate1OutputsConsulted ?? 0) === 0
          && (d.candidate2SimulationsUsedForSelection ?? 0) === 0
          && (d.candidate2OutputUsed ?? false) === false;
        const rows = d.teams ?? d.profiles ?? [];
        const noMeasurement = !rows.some((r) => Object.keys(r ?? {})
          .some((k) => /^(ppp|winRate|compositeMae|gamesPlayed|traitResults)$/.test(k)));
        return noOutputs && noMeasurement; },
      why: "prior-set pool, player-store and selection artifacts. Five V6 sides were defined in the V5 candidate pool and never selected into V5, so the artifacts that define them name them — the carried-but-unplayed case. Verified to declare zero candidate outputs consulted and to carry no per-fixture measurement." },
  ];
  const naming = [];
  for (const f of allFiles) {
    const text = readFileSync(f, "utf8");
    const hits = v6Ids.filter((id) => text.includes(id));
    if (hits.length) naming.push({ file: f, ids: hits.length });
  }
  const allowed = []; const leaks = []; const verificationFailures = [];
  for (const n of naming) {
    const a = ALLOWED.find((x) => x.match(n.file));
    if (!a) { leaks.push(`${n.ids} id(s) in ${n.file}`); continue; }
    if (a.verify && !a.verify(n.file)) {
      verificationFailures.push(n.file);
      leaks.push(`${n.ids} id(s) in ${n.file} — allowlisted but failed its own verification`);
      continue;
    }
    allowed.push({ ...n, why: a.why, verified: Boolean(a.verify) });
  }
  const manifestText = readFileSync(`${DIR}/historical-holdout-v6-manifest.json`, "utf8");
  const definedInManifest = v6Ids.filter((id) => manifestText.includes(id));
  const taintPath = `${DIR}/v6-dry-run-taint.json`;
  const taintedKeys = existsSync(taintPath)
    ? JSON.parse(readFileSync(taintPath, "utf8")).taintedTeamSeasons.map((t) => t.key) : [];
  const selectedKeys = new Set(manifest.data.matchups.flatMap((m) => [m.teamA.key, m.teamB.key]));

  gate("everyFileNamingAV6IdIsAllowed", leaks.length === 0,
    `${allFiles.length} json/jsonl files scanned for ${v6Ids.length} V6 identities · ${naming.length} name one · ${allowed.length} allowed by a stated reason · ${leaks.length} unaccounted${leaks.length ? `: ${leaks.join("; ")}` : ""}`);
  gate("theAllowlistIsNotPadding", ALLOWED.every((a) => allowed.some((x) => a.match(x.file))),
    `all ${ALLOWED.length} allowlist entries matched at least one real file, so none is dead text asserting a protection that never applies`);
  gate("everyVerifiedAllowlistEntryPassedItsCheck", verificationFailures.length === 0,
    `${allowed.filter((a) => a.verified).length} allowlisted file(s) carry a machine check that they hold no candidate output; ${verificationFailures.length} failed it`);
  gate("dryRunArtifactNamesNoV6Id",
    !naming.some((n) => n.file === `${DIR}/historical-v6-runner-dry-run.json`),
    "the current dry run names no V6 identity — this is the exact gate that caught version 1 simulating the real 1950s matchup");
  gate("noResultsOrRunStateNamesAV6Id",
    !naming.some((n) => /historical-v6-results\.json$|historical-holdout-v6-run\.json$/.test(n.file)),
    "no results artifact and no run state exists, so neither can name one");
  gate("selectedTeamsAreDefinedButUnplayed", definedInManifest.length === v6Ids.length,
    `all ${v6Ids.length} ids appear in the manifest that defines them, as they must, and in zero result artifacts`);
  gate("noPreviouslySimulatedTeamSeasonIsSelected",
    taintedKeys.every((k) => !selectedKeys.has(k)),
    taintedKeys.length
      ? `${taintedKeys.length} team-season(s) simulated during the version-1 dry run (${taintedKeys.join(", ")}) appear in no selected matchup`
      : "no team-season has ever been simulated outside a formal run");
  gate("syntheticV2Untouched", setAccessCount("synthetic-stress-holdout-v2") === 0,
    "synthetic-stress-holdout-v2 access 0 — a historical preparation phase never opens it");
  gate("priorSealsIndependent",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1
    && setAccessCount("historical-holdout-v5") === 1,
    "V3, V4 and V5 remain at 1 each; V6's log is a separate file, so its count cannot borrow theirs");

  if (fail.length) { console.log(`\nSEAL REFUSED: ${fail.join(", ")}`); process.exit(2); }

  const payload = {
    historicalV6SealVersion: "1.0.0",
    set: SET, state: "SEALED_UNREAD", accessCount: setAccessCount(SET),
    accessLog: SEALED_SETS[SET], accessLogExists: existsSync(SEALED_SETS[SET]),
    sealedAtCommit: git("rev-parse", "HEAD"),
    registrationIsTheSeal: "the set is sealed by being registered in SEALED_SETS with an empty access log. There is no separate lock to forget to apply.",
    candidate: { candidateId: lock.data.candidateId, coreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      lockStatus: lock.data.candidateLockStatus },
    boundHashes: {
      eligibilityPolicyHash: eligPolicy.data.policyHash,
      poolHash: pool.data.poolHash,
      selectionPolicyHash: selPolicy.data.selectionPolicyHash,
      selectionHash: selection.data.selectionHash,
      manifestHash: manifest.data.manifestHash,
      targetsHash: targets.data.targetsHash,
      traitPolicyHash: traitPolicy.data.traitPolicyHash,
      practicalMarginPolicyHash: margins.data.policyHash,
      samplePlanHash: plan.data.samplePlanHash,
      verdictPolicyHash: verdict.data.policyHash,
      observabilityCertificationHash: obs.data.certificationHash,
      eraReferenceCertificationHash: refs.data.certificationHash,
      seedHash: seeds.data.seedHash,
      traitRegistryHash: registryHash(),
      dryRunHash: dryrun.data.dryRunHash,
    },
    authorizedRunner: {
      command: "npm run validation:historical-v6 -- --run",
      requiredFlags: ["--unlock-holdout", `--unlock-${SET}`, "--operator=<email>", "--reason=<why>"],
      modesThatDoNotOpenTheSeal: ["--help", "--preflight", "--dry-run"],
      unknownFlagsRefused: true,
      onePassOnly: "the runner refuses a second independent run and resumes only under the same access event",
    },
    scope: {
      matchups: manifest.data.matchupCount, teams: manifest.data.teamCount,
      players: manifest.data.playerProfileCount, coaches: manifest.data.coachCount,
      scoredTraits: manifest.data.scoredTraitCount, excludedTraits: manifest.data.excludedTraitCount,
      scoredMetrics: manifest.data.scoredMetrics,
      decisionTierGames: verdict.data.protocol.totalGamesAtDecisionTier,
    },
    repairedMechanismCoverage: selection.data.requiredMetricCoverage,
    leakScan: { idsChecked: v6Ids.length, filesScanned: allFiles.length,
      filesNamingAV6Id: naming.length, allowed, leaks, verificationFailures, scannedTree: "WORKING_TREE",
      method: "every json and jsonl file under data/validation, data/calibration and .cache is searched, and every file naming a V6 identity must be on an allowlist with a stated reason. The first version searched only files matching an output-name pattern and exempted four by name — none of which matched the pattern, so the exemption was dead and the protection was a regex quietly failing to match.",
      whyWorkingTree: "the seal binds what is on disk and about to be committed. Scanning HEAD made the gate depend on commit ordering and it failed on an artifact already fixed on disk." },
    previouslySimulatedTeamSeasonsExcluded: taintedKeys,
    integrity: {
      neverRead: true,
      whatThisProves: "Candidate 2 has never been simulated against any of these sixteen team-seasons, and the pool they were drawn from excluded every team-season and every 4-of-5 lineup any prior set has seen. A V6 result is therefore evidence about generalisation, not about fit.",
      whatWouldDestroyIt: "any simulation against a V6 team-season before the formal run, any change to a bound hash, or a second access event.",
    },
    allSealStatuses: allSealStatuses(),
    pass: true,
  };
  payload.sealHash = createHash("sha256")
    .update(JSON.stringify({ set: SET, bound: payload.boundHashes, candidate: payload.candidate })).digest("hex");
  writeArtifact("historical-v6-seal", payload, {
    generationCommand: "npm run v6:seal", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n  ${SET}: ${payload.state} at access ${payload.accessCount}`);
  console.log(`  sealHash ${payload.sealHash.slice(0, 16)}...`);
  console.log("\nSEAL: APPLIED");
  process.exit(0);
}
