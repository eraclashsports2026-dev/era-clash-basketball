#!/usr/bin/env node
// ── Candidate 3 identity, change manifest, parameter set, separation ─────────
//   npm run d0:c3-identity
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { DIR, C1D, git, sha } from "./paths.mjs";

const def = defaultRuntimeParameterSet();
const core = await buildCoreManifestV3();
const c2lock = readArtifact("candidate2-lock", C1D).data;
const c2ident = readArtifact("candidate2-identity-separation", C1D).data;
const fail = [];
const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

const changes = [
  { changeId: "c3-01", module: "src/v3/actions/families.js",
    failureClustersAddressed: ["SA movementShare (mechanism)", "modest-roster coach intent generally"],
    beforeBehavior: "ISOLATION, OFF_BALL_SCREEN and CUT multiplied their entire weight — coach term included — by a roster-capability reach() gate; a motion-10 coach with sub-threshold movers expressed a -0.0006 movement delta vs neutral",
    afterBehavior: "the coach term carries past the gate at INTENT_CARRY (floor 0.5, scaling to 1.0 with roster support); roster, era and mismatch terms stay gated exactly as before",
    rootCause: "frequency doctrine violated: coach tendency sets how often a family is attempted, execution quality is priced at resolution",
    mechanicalRationale: "mirror of Candidate 2's defensive SCHEME_TRANSFER (rate 0.5); neutral coach remains an exact mirror fixed point",
    entityHardcodeCheck: "no team, player, coach or fixture id appears; verified by review and by the strong-roster cells being byte-identical",
    flatBonusCheck: "no universal term: saturated-gate rosters are an exact no-op and low-motion coaches remain below neutral",
    parameterChange: "none — frozen constant INTENT_CARRY, not a registry parameter (same convention as ASSIST_IDENTITY and SCHEME_TRANSFER)",
    dataChange: "none", versionChange: "actionLibraryVersion 2.0.0 -> 2.1.0",
    tests: ["movement-intent-controls-candidate2/3 artifacts", "vitest families suite"], regressionRisk: "action-mix normalization shifts for unsaturated rosters only" },
  { changeId: "c3-02", module: "src/v3/calibration/calibrationPlayerAdapter.js",
    failureClustersAddressed: ["Houston postUpShare", "Portland orebRate (via reference mix)", "Boston assistedRate (via mix)"],
    beforeBehavior: "postThreat = scaled rebounds x 0.5 + big-man base 4: nine sub-10-ppg players rated 7+, Rodman (5.5 ppg) 9.0, Ben Wallace 8.4 > Yao 7.9",
    afterBehavior: "postThreat = interior scoring volume x 0.62 + bounded rebound evidence x 0.22 + position base 2.2/0.6",
    rootCause: "a THREAT derivation dominated by a non-scoring statistic set post-up baselines by players who cannot score on the block",
    mechanicalRationale: "interior volume is the same volume-through-the-interior term rimThreat already uses; documented anchors, no fitted coefficients",
    entityHardcodeCheck: "position-scoped constants only", flatBonusCheck: "re-ranks by evidence; corpus-wide zero sub-10-ppg players at 7+",
    parameterChange: "none", dataChange: "none (derivation, not data)",
    versionChange: "possessionCalibrationVersion 1.2.0 -> 1.3.0 (covers both changes)",
    tests: ["corpus ordering assertions in vitest", "corrected diagnostic"], regressionRisk: "post-up frequency and Post Hub role coverage shift for rebound-heavy non-scorers" },
];
writeArtifact("candidate3-change-manifest", { candidate3ChangeManifestVersion: "1.0.0",
  candidateId: "Candidate 3", parentCandidateId: "Candidate 2", changes, changeCount: changes.length,
  changeManifestHash: sha(changes) }, { generationCommand: "npm run d0:c3-identity", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

writeArtifact("preview-candidate-parameter-set", { candidateId: "Candidate 3",
  parameterSetHash: def.parameterSetHash,
  parameterChanges: 0, registeredParameters: activeParameters().length,
  allAtDefaults: activeParameters().every((p) => def.values[p.id] === p.defaultValue),
  sharedWithParent: "the parameter-set hash is intentionally shared with Candidates 0-2; the core hash and version fields separate the candidates, exactly as between Candidates 0 and 1",
}, { generationCommand: "npm run d0:c3-identity", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

writeArtifact("preview-candidate-core-manifest", { candidateId: "Candidate 3",
  parentCoreHash: c2lock.coreHash, aggregateCoreHash: core.aggregateCoreHash,
  coreFileCount: core.files?.length ?? null, closureBuilderVersion: core.candidateCoreGraphVersion ?? "3.0.0",
  changedCoreFiles: ["src/v3/actions/families.js", "src/v3/calibration/calibrationPlayerAdapter.js", "src/versions.js"],
}, { generationCommand: "npm run d0:c3-identity", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

// replay + fingerprint probes
const SHOW = ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"];
const input = buildPossessionInput({ goldIds: SHOW, blueIds: SHOW, coachGoldId: "pat-riley", coachBlueId: "phil-jackson", eraStyleId: "1990s", simulationSeed: 424242 });
const g1 = runPossessionGame(input, { includeLedger: true });
const g2 = runPossessionGame(input, { includeLedger: true });
const fp = g1.fingerprint;
const replayExact = JSON.stringify(g1.finalScore) === JSON.stringify(g2.finalScore)
  && JSON.stringify(g1.gold.totals) === JSON.stringify(g2.gold.totals);
gate("replayExact", replayExact, `same seed twice -> identical scores and totals`);
gate("fingerprintCarriesCandidate3", fp.possessionCalibrationVersion === "1.3.0" && fp.actionLibraryVersion === "2.1.0",
  `possessionCalibrationVersion ${fp.possessionCalibrationVersion} · actionLibraryVersion ${fp.actionLibraryVersion}`);
gate("coreHashDiffersFromEveryParent",
  core.aggregateCoreHash !== c2lock.coreHash && core.aggregateCoreHash !== c2lock.parentCoreHash
  && core.aggregateCoreHash !== c2lock.grandparentCoreHash,
  `C3 ${core.aggregateCoreHash.slice(0, 12)}… vs C2 ${c2lock.coreHash.slice(0, 12)}… vs C1 ${String(c2lock.parentCoreHash).slice(0, 12)}… vs C0 ${String(c2lock.grandparentCoreHash).slice(0, 12)}…`);

const collisions = {
  coreHashVsCandidate2: core.aggregateCoreHash === c2lock.coreHash,
  coreHashVsCandidate1: core.aggregateCoreHash === c2lock.parentCoreHash,
  coreHashVsCandidate0: core.aggregateCoreHash === c2lock.grandparentCoreHash,
  calibrationVersionVsCandidate2: versionOf("possessionCalibrationVersion") === "1.2.0",
  actionLibraryVersionVsCandidate2: versionOf("actionLibraryVersion") === "2.0.0",
};
const collisionCount = Object.values(collisions).filter(Boolean).length;
gate("identityCollisionsZero", collisionCount === 0, JSON.stringify(collisions));
writeArtifact("preview-candidate-identity-separation", { candidateId: "Candidate 3",
  parentCandidateId: "Candidate 2", collisions, collisionCount,
  authoritativeIdentity: { possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    actionLibraryVersion: versionOf("actionLibraryVersion"), possessionEngineVersion: versionOf("possessionEngineVersion"),
    coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash },
  replayProbe: { seed: 424242, fingerprint: fp, replayExact },
  cacheSeparation: "every result fingerprint, result cache key, probability cache key, competition manifest and replay manifest carries possessionCalibrationVersion and actionLibraryVersion, both of which differ from every prior candidate — a Candidate 3 result can never be served from a prior candidate's cache",
  parameterSetHashIntentionallyShared: c2ident.parameterSetHashIntentionallyShared ?? true,
  pass: fail.length === 0,
}, { generationCommand: "npm run d0:c3-identity", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
console.log(`\nC3 IDENTITY: ${fail.length === 0 ? "SEPARATED" : `FAIL (${fail.join(", ")})`} · core ${core.aggregateCoreHash.slice(0, 16)}…`);
process.exit(fail.length === 0 ? 0 : 2);
