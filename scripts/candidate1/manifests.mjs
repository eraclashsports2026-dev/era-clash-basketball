#!/usr/bin/env node
// ── Phase 6C4A WS8: Candidate 1 formal manifests ─────────────────────────────
//   npm run c1:manifests
//
// Four artifacts that make Candidate 1 a first-class candidate:
//   candidate1-change-manifest   every changed core file, tied to root causes
//   candidate1-parameter-set     the compiled parameter set (all defaults)
//   candidate1-core-manifest     the full 53-file closure with per-file hashes
//   candidate1-vs-candidate0     the explicit diff against the parent
//
// The registry still says 1.0.0 here: stamping 1.1.0 while the candidate is
// DRAFT/UNLOCKED would be the exact status conflation Phase 6C2C5 committed.
// The version is stamped by the LOCK (WS10), which proves byte-wise that the
// stamp is the only difference between the validated core and the locked one.
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR } from "./failureRegister.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

// Every engine change, keyed to the root-cause class it repairs. This is the
// complete list — a core-file diff that names a file absent here fails WS8.
export const CHANGES = [
  { file: "src/v3/actions/families.js", rootCauses: ["ELIGIBILITY_STARVATION (v4f-09)"],
    change: "movement/isolation canSelect gates become low floors with continuous weight tapers; HANDOFF reads null height as UNKNOWN with a positional fallback; MOVEMENT_FAMILY_ACTIONS/isMovementFamilyAction exported as the single definition of the movement family" },
  { file: "src/v3/calibration/calibrationPlayerAdapter.js", rootCauses: ["ELIGIBILITY_STARVATION (v4f-09)", "INPUT_QUALITY_COMPRESSION (v4f-02, v4f-08)", "DEFENSIVE_PROXY_INVERSION (v4f-03/04/06/07)"],
    change: "offBallMovement reads perimeter craft + efficient finishing + role, not a three-point grade; scoring volume reads points per game alongside FGA; efficiency reads TS% or a labelled FG%/FT% estimate centred on the store-population median; interior diet from the two-point split or documented three volume; post threat falls back to recorded total boards; documented defensive bands become position-scoped floors in every era" },
  { file: "src/v3/defense/plan.js", rootCauses: ["COACH_DEPLOYMENT_SATURATION (zone step)"],
    change: "the zone shell is built whenever a legal shell exists and the coach zones at all, instead of only above the 5/10 step" },
  { file: "src/v3/defense/scheme.js", rootCauses: ["COACH_DEPLOYMENT_SATURATION (zone step)"],
    change: "manShellType records what the defence plays when not in its zone, so the per-possession ledger label can be truthful" },
  { file: "src/v3/possession/game.js", rootCauses: ["COACH_DEPLOYMENT_SATURATION (zone step)"],
    change: "zone use is a per-possession draw, continuous in the coach zone scale (p = (zoneUsage/10)^1.35 * 0.8); the standing offensive plan is built against man; zone possessions replace the plan mix" },
  { file: "src/v3/possession/actions.js", rootCauses: ["COACH_DEPLOYMENT_SATURATION (zone step)"],
    change: "schemeId is per-possession truth: ZONE:<shell> on zone possessions, the man fallback label otherwise" },
  { file: "src/v3/actions/offensivePlan.js", rootCauses: ["COACH_DEPLOYMENT_SATURATION (zone step)"],
    change: "a standing zone-attack plan is built only when the defence zones a material share of possessions" },
  { file: "src/v3/teamIntelligence.js", rootCauses: ["OFFENSIVE_GLASS_CHANNEL_MISWIRED (v4f-05)"],
    change: "offensiveGlass carries offensive-board evidence (postThreat) alongside board-craft, instead of defensive rebounding and position alone" },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const preservation = readArtifact("candidate0-preservation", DIR).data;
  const parentCommit = preservation.candidate0.gitCommitBeforeCandidate1;
  const live = buildCoreManifest();
  const def = defaultRuntimeParameterSet();
  const extra = { parameterSetHash: def.parameterSetHash };
  const gen = { generationCommand: "npm run c1:manifests", dir: DIR, extra };

  // core files changed since the parent commit
  const changedAll = git("diff", "--name-only", parentCommit, "HEAD", "--").split("\n").filter(Boolean);
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean).map((l) => l.slice(3));
  const coreFiles = new Set(live.files.map((f) => f.path));
  const changedCoreFiles = [...new Set([...changedAll, ...dirty])].filter((f) => coreFiles.has(f)).sort();
  const declared = new Set(CHANGES.map((c) => c.file));
  const undeclared = changedCoreFiles.filter((f) => !declared.has(f));
  const unchanged = CHANGES.filter((c) => !changedCoreFiles.includes(c.file));
  if (undeclared.length) throw new Error(`undeclared core changes: ${undeclared.join(", ")}`);
  if (unchanged.length) throw new Error(`declared but unchanged: ${unchanged.map((c) => c.file).join(", ")}`);

  writeArtifact("candidate1-change-manifest", {
    candidateId: "Candidate 1", parentCandidateId: "Candidate 0", parentCommit,
    changedCoreFiles, changes: CHANGES,
    dataChanges: [
      { store: "data/calibration/calibration-players-v3.json", change: "Sam Jones shooting backfill (2 profiles, null fields only) + defensive-accolade stamps", artifacts: ["calibration-shooting-backfill", "defensive-accolades"] },
      { store: "data/validation/6c3r/calibration-players-v4.json", change: "defensive-accolade stamps (same-season award pages)", artifacts: ["defensive-accolades"] },
    ],
    prohibitions: {
      entitySpecificCode: "none — every change is a generic mechanic or a documented data floor",
      flatBonuses: "none", forcedActionCadence: "none", guaranteedEfficiency: "none", eraLegalityOverrides: "none",
    },
    basis: "candidate1-root-cause-analysis.json — no engine change exists without a root-caused failure it repairs",
  }, gen);

  writeArtifact("candidate1-parameter-set", {
    candidateId: "Candidate 1",
    parameterSetHash: def.parameterSetHash,
    parameterCount: def.parameterCount,
    allAtRegistryDefaults: activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    parameterChangesFromParent: 0,
    note: "Candidate 1 changes MECHANICS and INPUT CONSTRUCTION, not parameter values: every active parameter is at its registry default, so the parameterSetHash equals Candidate 0's. The 53-parameter search stays closed.",
    possessionCalibrationVersionAtLock: "1.1.0",
    possessionCalibrationVersionNow: versionOf("possessionCalibrationVersion"),
    values: def.values,
  }, gen);

  writeArtifact("candidate1-core-manifest", {
    candidateId: "Candidate 1",
    aggregateCoreHash: live.aggregateCoreHash,
    fileCount: live.fileCount,
    closureBuilderVersion: live.closureBuilderVersion,
    entryPoints: live.entryPoints,
    files: live.files,
    note: "Computed under closure builder v2 (multi-line imports resolved); the lock stamps possessionCalibrationVersion 1.1.0 into src/versions.js and records the post-stamp hash with a byte-wise proof that the stamp is the only difference.",
  }, gen);

  const parentManifest = readArtifact("candidate-core-manifest", "data/validation/6c3").data;
  const parentByPath = new Map(parentManifest.files.map((f) => [f.path, f.sha256]));
  const fileDiff = live.files.map((f) => {
    const was = parentByPath.get(f.path);
    return { path: f.path, status: was == null ? "NEW_TO_MANIFEST(closure v2)" : was === f.sha256 ? "IDENTICAL" : "CHANGED" };
  });
  writeArtifact("candidate1-vs-candidate0", {
    parent: { candidateId: "Candidate 0", coreHash: preservation.candidate0.coreHash, files: 52, closureBuilderVersion: "1.0.0",
      parameterSetHash: preservation.candidate0.parameterSetHash, possessionCalibrationVersion: "1.0.0", commit: parentCommit },
    candidate: { candidateId: "Candidate 1", coreHash: live.aggregateCoreHash, files: live.fileCount, closureBuilderVersion: live.closureBuilderVersion,
      parameterSetHash: def.parameterSetHash },
    identicalFiles: fileDiff.filter((f) => f.status === "IDENTICAL").length,
    changedFiles: fileDiff.filter((f) => f.status === "CHANGED").map((f) => f.path),
    newToManifest: fileDiff.filter((f) => f.status.startsWith("NEW")).map((f) => f.path),
    parameterDelta: 0,
    behaviourDelta: "recorded in behaviour-snapshot-candidate0 vs behaviour-snapshot-candidate1-draft (29/30 possession-engine games differ; production 3.2.0 byte-identical)",
    fileDiff,
  }, gen);

  console.log(`change manifest: ${changedCoreFiles.length} core files, all declared`);
  console.log(`parameter set: ${def.parameterCount} at defaults · hash ${def.parameterSetHash.slice(0, 16)}...`);
  console.log(`core manifest: ${live.fileCount} files · ${live.aggregateCoreHash.slice(0, 16)}...`);
  console.log(`vs candidate 0: ${fileDiff.filter((f) => f.status === "CHANGED").length} changed · ${fileDiff.filter((f) => f.status === "IDENTICAL").length} identical`);
}
