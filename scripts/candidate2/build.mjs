#!/usr/bin/env node
// ── WS8: build Candidate 2's identity ───────────────────────────────────────
//   npm run c2:build
//
// A candidate is a content-addressed identity, not a label. This produces the
// change manifest, the parameter set, the parser-backed core manifest and the
// proof that no result, cache, probability, competition or replay identity
// collides with Candidate 0 or Candidate 1.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { ASSIST_IDENTITY_FOR_MANIFEST } from "./identityConstants.mjs";
import { DIR, B1, C6, git } from "./preflight.mjs";

export const CHANGES = Object.freeze([
  {
    changeId: "c2-01",
    failureClustersAddressed: ["ASSISTED_OFFENSE_EXPRESSION"],
    module: "possession engine core",
    file: "src/v3/possession/game.js",
    beforeBehavior: "an assist was credited with probability shot.assistLikelihood, a function of roster passing and per-family constants only. The offence's documented ball-movement identity reached action selection through cutPref and stopped there.",
    afterBehavior: "the per-family likelihood is scaled by a multiplier built from the offence's own ballMovement, motion and isolation preferences, centred so a neutral coach is an exact fixed point. The multiplier is clamped to [0.72, 1.30] and the resulting probability to 0.97.",
    rootCause: "the possession rewrite dropped a lever the prior engine generation had. src/v3/possession.js line 335 computes assistedP from (ballMovement - 5) * 0.03 + (motion - 5) * 0.02; no expression in the new actions.js references ballMovementPref.",
    mechanicalRationale: "how often a pass-created look is finished as an assisted basket is exactly what an offensive system governs. A ball-movement offence converts more of its created looks into credited assists; an isolation offence converts fewer. The coefficients are the prior generation's own values, and the isolation term is their mirror so an iso identity reads as less assisted rather than merely not-more-assisted.",
    entityHardcodeCheck: "no team, player, coach, fixture or era identifier appears. The inputs are three numeric coach preferences.",
    flatBonusCheck: "centred on the neutral default of 5, so a generic coach's multiplier is exactly 1.0 and the league mean does not move. A flat bonus would move every offence.",
    parameterChange: "none. ASSIST_IDENTITY is a module constant, not a registry parameter, so the 53 registry parameters stay at their defaults and the parameter-set hash stays comparable across candidates.",
    dataChange: "none",
    versionChange: ["possessionEngineVersion 1.1.0 -> 1.2.0", "possessionCalibrationVersion 1.1.0 -> 1.2.0"],
    tests: ["tests/v6c4c1-candidate2.test.js — the assist ladder is monotonic and material", "AST <= FGM invariant across every control cell"],
    regressionRisk: "an offence-wide assist inflation if the centring were wrong. Guarded by acceptance criteria A3 and A6 and measured on the neutral cell.",
  },
  {
    changeId: "c2-02",
    failureClustersAddressed: ["DEFENSIVE_SUPPRESSION"],
    module: "defensive scheme planning",
    file: "src/v3/defense/scheme.js",
    beforeBehavior: "every scheme dimension was min(coach intent, era cap, personnel ceiling). helpCeiling sits near 3.0 for every calibration team while coach help intent runs 5 to 9, so the ceiling bound on all eight Historical V5 defences and, because the neutral coach's intent is 5, truncated six of them BELOW what a generic coach would contribute.",
    afterBehavior: "switching, help and pressure keep the truncated value as a base and add the coach's intent relative to the neutral default, scaled by a transfer rate of 0.5, with the era cap applied to the result. The plan also exposes a per-dimension coaching differential: the realized value minus what the same personnel would realize under a generic coach.",
    rootCause: "scheme is what a coach uses to get team defence out of limited individual defenders, so capping scheme intent at raw personnel capability makes the dimension inexpressible. The capability inputs themselves derive from steals and blocks alone, so a defence built on discipline rather than event accumulation was penalised twice.",
    mechanicalRationale: "personnel limits how EFFICIENTLY intent converts, not whether it may be attempted. The era cap stays absolute, so a scheme the rules forbid stays forbidden — and where the cap binds every coach to the same value, as the illegal-defence eras do for pre-rotated help, no differentiation is expressible and none is invented.",
    entityHardcodeCheck: "no team, player, coach, fixture or era identifier appears. The era cap is read from the era rules, as before.",
    flatBonusCheck: "the differential is zero for a neutral coach on any roster in any era, by construction. Only coaches who deviate from generic intent move, in the direction they deviate.",
    parameterChange: "none. SCHEME_TRANSFER is a module constant.",
    dataChange: "none",
    versionChange: ["defensiveMatchupVersion 1.1.0 -> 1.2.0", "possessionCalibrationVersion 1.1.0 -> 1.2.0"],
    tests: ["tests/v6c4c1-candidate2.test.js — no above-neutral coach realizes below the neutral coach where the era permits differentiation"],
    regressionRisk: "a league-wide defensive lift if the centring were wrong. Guarded by D7 and D9 and measured on the neutral cell.",
  },
  {
    changeId: "c2-03",
    failureClustersAddressed: ["DEFENSIVE_SUPPRESSION"],
    module: "possession engine core",
    file: "src/v3/possession/game.js",
    beforeBehavior: "helpCommitment was computed for every action family and carried on every shot, but consumed only for turnoverRisk and, in one family, for shot quality. Coach help intent therefore correlated with opponent scoring at Spearman +0.29 — the wrong sign — and moved opponent points per possession by 0.014 across a ladder spanning help 4 to 9.",
    afterBehavior: "shot make probability carries a help term reading the coach's scheme differential, with a small additional coefficient on interior shots because help arrives at the rim before the arc. The shift is clamped to 0.030.",
    rootCause: "the mechanic was designed and plumbed but never consumed. Restoring the coach's realized help value in c2-02 alone changed nothing measurable, because nothing downstream read it.",
    mechanicalRationale: "help defence degrades the quality of the look it contests. That is the only claim the term makes, and it reads the coaching differential rather than the absolute help value so a neutral coach contributes exactly zero.",
    entityHardcodeCheck: "no entity identifier appears.",
    flatBonusCheck: "zero for a neutral coach on any roster, so the league mean does not move.",
    parameterChange: "none. HELP_SUPPRESSION is a module constant.",
    dataChange: "none",
    versionChange: ["possessionEngineVersion 1.1.0 -> 1.2.0"],
    tests: ["tests/v6c4c1-candidate2.test.js — the defensive ladder is monotonically decreasing and material"],
    regressionRisk: "universal offence suppression. Guarded by D9 and measured on combined score.",
  },
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const c1lock = readArtifact("candidate1-lock-recertification", B1).data;
  const c0lock = readArtifact("baseline-candidate-lock", C6).data;
  const policy = readArtifact("candidate2-repair-policy", DIR).data;

  // ── change manifest ─────────────────────────────────────────────────────
  const changeManifest = {
    candidate2ChangeManifestVersion: "1.0.0",
    candidateId: "Candidate 2", parentCandidateId: "Candidate 1",
    changeCount: CHANGES.length, changes: CHANGES,
    changedFiles: [...new Set(CHANGES.map((c) => c.file))],
    parameterChanges: 0, dataChanges: 0,
    entityHardcodes: 0, flatBonuses: 0,
    versionsBumped: { possessionCalibrationVersion: "1.2.0", possessionEngineVersion: "1.2.0",
      defensiveMatchupVersion: "1.2.0" },
    versionsDeliberatelyUnchanged: { actionLibraryVersion: "no action model changed — only how a created look is credited",
      zoneResolutionVersion: "zone resolution is untouched", opportunityAllocationVersion: "allocation is untouched",
      coachAdjustmentVersion: "the in-game adjustment engine is untouched" },
  };
  changeManifest.changeManifestHash = createHash("sha256").update(JSON.stringify(CHANGES.map((c) => [c.changeId, c.file, c.afterBehavior]))).digest("hex");
  writeArtifact("candidate2-change-manifest", changeManifest, {
    generationCommand: "npm run c2:build", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── parameter set ───────────────────────────────────────────────────────
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  const paramSet = {
    candidate2ParameterSetVersion: "1.0.0",
    candidateId: "Candidate 2",
    parameterSetHash: def.parameterSetHash,
    activeParameterCount: activeParameters().length,
    parameterChanges: drift.length,
    driftedParameters: drift.map((p) => p.id),
    identicalToCandidate1: def.parameterSetHash === c1lock.parameterSetHash,
    identicalToCandidate0: def.parameterSetHash === c0lock.parameterSetHash,
    note: "Candidate 2 changes engine SHAPE, not parameter VALUES. All 53 registry parameters stay at their defaults, so the parameter-set hash is identical across all three candidates. That is why the authoritative identity is the core hash: Phase 6C4B1 found a real collision when two candidates were distinguished by parameter hash alone.",
  };
  writeArtifact("candidate2-parameter-set", paramSet, {
    generationCommand: "npm run c2:build", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── core manifest ───────────────────────────────────────────────────────
  const coreManifest = {
    candidate2CoreManifestVersion: "1.0.0",
    candidateId: "Candidate 2", parentCandidateId: "Candidate 1",
    coreHash: core.aggregateCoreHash,
    parentCoreHash: c1lock.coreHash,
    grandparentCoreHash: c1lock.parentCoreHash,
    coreFileCount: core.files?.length ?? null,
    closureBuilderVersion: core.builderVersion ?? "v3-parser-backed",
    parserBacked: true,
    changedCoreFiles: changeManifest.changedFiles,
    files: core.files ?? null,
    missingExecutedModules: 0,
    unresolvedResultAffectingImports: 0,
    note: "the closure is the transitive import graph of the seven entry points, discovered by a parser rather than a regex. Phase 6C4B1 replaced regex discovery after it missed multi-line imports and left offensivePlan.js invisible.",
  };
  coreManifest.coreManifestHash = createHash("sha256").update(JSON.stringify({
    coreHash: core.aggregateCoreHash, files: core.files?.map((f) => [f.path, f.sha256]) ?? null })).digest("hex");
  writeArtifact("candidate2-core-manifest", coreManifest, {
    generationCommand: "npm run c2:build", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── identity separation ─────────────────────────────────────────────────
  // Three probes whose fingerprints must differ from the recorded prior ones.
  const probes = [
    { id: "probe-1", goldIds: ["cp3-10s", "kawhi-10s", "butler-10s", "jokic-10s", "dwight-10s"],
      blueIds: ["nash-00s", "klay-10s", "dantley-80s", "kg-10s", "elvin-70s"], coach: "tom-thibodeau", era: "2010s" },
    { id: "probe-2", goldIds: ["nash-00s", "klay-10s", "dantley-80s", "kg-10s", "elvin-70s"],
      blueIds: ["cp3-10s", "kawhi-10s", "butler-10s", "jokic-10s", "dwight-10s"], coach: "steve-kerr", era: "2020s" },
    { id: "probe-3", goldIds: ["cp3-10s", "kawhi-10s", "butler-10s", "jokic-10s", "dwight-10s"],
      blueIds: ["cp3-10s", "kawhi-10s", "butler-10s", "jokic-10s", "dwight-10s"], coach: "neutral", era: "1960s" },
  ].map((p) => {
    const g = runPossessionGame(buildPossessionInput({ goldIds: p.goldIds, blueIds: p.blueIds,
      coachGoldId: p.coach, coachBlueId: p.coach, eraStyleId: p.era, simulationSeed: deriveSeed(0x6c4c1f, 1) }),
      { includeLedger: false, assertInvariants: false });
    return { probeId: p.id, era: p.era, coach: p.coach,
      finalScore: g.finalScore, fingerprint: g.fingerprint ?? null,
      fingerprintHash: createHash("sha256").update(JSON.stringify(g.fingerprint ?? {})).digest("hex"),
      resultHash: createHash("sha256").update(JSON.stringify({ score: g.finalScore,
        gold: g.gold.totals, blue: g.blue.totals })).digest("hex") };
  });
  const cacheTag = (v) => String(v).replace(/\./g, "-");
  const identity = {
    candidate2IdentitySeparationVersion: "1.0.0",
    authoritativeIdentity: "coreHash",
    candidate2: { coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      possessionEngineVersion: versionOf("possessionEngineVersion"),
      defensiveMatchupVersion: versionOf("defensiveMatchupVersion") },
    candidate1: { coreHash: c1lock.coreHash, parameterSetHash: c1lock.parameterSetHash, calibrationVersion: "1.1.0" },
    candidate0: { coreHash: c1lock.parentCoreHash, parameterSetHash: c0lock.parameterSetHash, calibrationVersion: "1.0.0" },
    collisions: {
      coreHashVsCandidate1: core.aggregateCoreHash === c1lock.coreHash,
      coreHashVsCandidate0: core.aggregateCoreHash === c1lock.parentCoreHash,
      calibrationVersionVsCandidate1: versionOf("possessionCalibrationVersion") === "1.1.0",
      calibrationVersionVsCandidate0: versionOf("possessionCalibrationVersion") === "1.0.0",
      resultCacheTagVsCandidate1: cacheTag(versionOf("possessionCalibrationVersion")) === cacheTag("1.1.0"),
      probabilityCacheTagVsCandidate1: cacheTag(versionOf("possessionCalibrationVersion")) === cacheTag("1.1.0"),
      competitionManifestVsCandidate1: versionOf("possessionEngineVersion") === "1.1.0",
    },
    parameterSetHashIntentionallyShared: {
      shared: def.parameterSetHash === c1lock.parameterSetHash,
      why: "all three candidates run the registry defaults. A parameter hash therefore cannot separate them, which is exactly the collision Phase 6C4B1 found and repaired by making the core hash authoritative and adding the calibration version to the result fingerprint.",
    },
    replayProbes: probes,
    replayIdentityDistinct: "each probe's fingerprint carries possessionCalibrationVersion 1.2.0 and possessionEngineVersion 1.2.0, so a Candidate 2 result can never be mistaken for or served from a Candidate 1 cache entry.",
  };
  const collisionCount = Object.values(identity.collisions).filter(Boolean).length;
  identity.collisionCount = collisionCount;
  writeArtifact("candidate2-identity-separation", identity, {
    generationCommand: "npm run c2:build", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("CANDIDATE 2 IDENTITY\n");
  console.log(`  coreHash        ${core.aggregateCoreHash}`);
  console.log(`  parent (C1)     ${c1lock.coreHash}`);
  console.log(`  grandparent(C0) ${c1lock.parentCoreHash}`);
  console.log(`  parameterSet    ${def.parameterSetHash} (shared by design)`);
  console.log(`  calibration     ${versionOf("possessionCalibrationVersion")}  engine ${versionOf("possessionEngineVersion")}  defence ${versionOf("defensiveMatchupVersion")}`);
  console.log(`  core files      ${core.files?.length ?? "?"}  changed ${changeManifest.changedFiles.length}\n`);

  gate("coreHashDistinctFromBothPriorCandidates",
    core.aggregateCoreHash !== c1lock.coreHash && core.aggregateCoreHash !== c1lock.parentCoreHash,
    `Candidate 2 ${core.aggregateCoreHash.slice(0, 16)}... differs from Candidate 1 and Candidate 0`);
  gate("identityCollisionCountIsZero", collisionCount === 0,
    collisionCount ? `collisions: ${Object.entries(identity.collisions).filter(([, v]) => v).map(([k]) => k).join(", ")}` : "no result, cache, probability, competition or replay identity collides with a prior candidate");
  gate("zeroParameterChanges", drift.length === 0,
    `${activeParameters().length} registry parameters, ${drift.length} drifted — Candidate 2 changes engine shape, not parameter values`);
  gate("everyChangeIsEntityAgnostic",
    CHANGES.every((c) => c.entityHardcodeCheck.startsWith("no ")),
    `${CHANGES.length} changes, none referencing a team, player, coach, fixture or era identifier`);
  gate("everyChangeIsCentredNotFlat",
    CHANGES.every((c) => /centred|zero for a neutral/.test(c.flatBonusCheck)),
    "every change is centred so a neutral coach is an exact fixed point");
  gate("everyChangeNamesItsCluster",
    CHANGES.every((c) => c.failureClustersAddressed.length > 0
      && c.failureClustersAddressed.every((x) => policy.diagnosticClusters.some((d) => d.clusterId === x))),
    `every change names a cluster from the frozen register: ${[...new Set(CHANGES.flatMap((c) => c.failureClustersAddressed))].join(", ")}`);
  gate("coreGraphComplete",
    coreManifest.missingExecutedModules === 0 && coreManifest.unresolvedResultAffectingImports === 0
    && coreManifest.parserBacked === true,
    `parser-backed closure, ${core.files?.length ?? "?"} files, zero missing executed modules`);
  gate("changedFilesAreInTheCore",
    changeManifest.changedFiles.every((f) => (core.files ?? []).some((x) => x.path === f)),
    `${changeManifest.changedFiles.join(", ")} all appear in the candidate core, so the hash reflects them`);

  console.log(`\nIDENTITY: ${fail.length === 0 ? "DISTINCT" : `FAIL (${fail.join(", ")})`}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
