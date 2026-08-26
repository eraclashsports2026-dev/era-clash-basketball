#!/usr/bin/env node
// ── Pre-calibration artifact freeze ─────────────────────────────────────────
// Content hashes of everything Phase 6C2C2 must not silently rewrite, taken
// before any 6C2C2 experiment ran.
//
// The point is not backup — git already does that. The point is that a later
// claim ("the corpus was always like this", "the holdout manifest is
// unchanged") becomes checkable rather than assertable.
//
//   npm run calibration:freeze -- [--verify]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { policyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { parameterSetHash } from "../../src/v3/calibration/parameters.js";

export const FREEZE_PATH = "data/calibration/phase-6c2c2-precalibration-freeze.json";

export const FROZEN_ARTIFACTS = Object.freeze([
  // Corpus and sets
  "data/calibration/historical-corpus-v3.json",
  "data/calibration/calibration-players-v3.json",
  "data/calibration/historical-targets-v3.json",
  "data/calibration/source-registry.json",
  "data/calibration/sets-v3.mjs",
  "data/calibration/corpus-v3-spec.mjs",
  "data/calibration/set-status.mjs",
  // Set manifests
  "data/calibration/historical-calibration-v3-manifest.json",
  "data/calibration/historical-holdout-v3-manifest.json",
  "data/calibration/synthetic-development-v2-manifest.json",
  "data/calibration/synthetic-stress-holdout-v2-manifest.json",
  // Seeds and probability
  "data/calibration/seeds.mjs",
  "src/v3/calibration/seedDomains.js",
  "src/v3/calibration/monteCarloProbability.js",
  "src/v3/calibration/probabilityValidation.js",
  // Parameters and objective, at defaults
  "src/v3/calibration/parameters.js",
  "src/v3/calibration/objective.js",
  "src/v3/calibration/folds.js",
  "src/v3/calibration/probability.js",
  // Seals
  "src/v3/calibration/holdoutSeal.js",
  // Prior-phase v1/v2 artefacts that must remain readable and unchanged
  "data/calibration/fixtures.mjs",
  "data/calibration/historical-corpus-v2.json",
  "data/calibration/historical-targets-v2.json",
  "data/calibration/sets-v2.mjs",
]);

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

export const buildFreeze = () => {
  const artefacts = {};
  const missing = [];
  for (const p of FROZEN_ARTIFACTS) {
    if (!existsSync(p)) { missing.push(p); continue; }
    artefacts[p] = sha(p);
  }
  return {
    phase: "6C2C2",
    purpose: "Content hashes taken before any Phase 6C2C2 experiment ran, so that a later claim of 'unchanged' is checkable rather than assertable.",
    frozenAt: "phase-6c2c2-workstream-0",
    acceptancePolicyHash: policyHash(),
    defaultParameterSetHash: parameterSetHash(),
    artefactCount: Object.keys(artefacts).length,
    missing,
    artefacts,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const verify = process.argv.includes("--verify");
  const current = buildFreeze();

  if (verify) {
    if (!existsSync(FREEZE_PATH)) { console.error("no freeze recorded"); process.exit(1); }
    const frozen = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    const drift = [];
    for (const [p, h] of Object.entries(frozen.artefacts)) {
      if (!existsSync(p)) { drift.push({ path: p, change: "DELETED" }); continue; }
      const now = sha(p);
      if (now !== h) drift.push({ path: p, change: "MODIFIED", was: h.slice(0, 12), now: now.slice(0, 12) });
    }
    const policyMoved = frozen.acceptancePolicyHash !== current.acceptancePolicyHash;
    const paramsMoved = frozen.defaultParameterSetHash !== current.defaultParameterSetHash;

    console.log(`PRE-CALIBRATION FREEZE VERIFY — ${Object.keys(frozen.artefacts).length} artefacts\n`);
    if (policyMoved) console.log(`  ACCEPTANCE POLICY CHANGED  ${frozen.acceptancePolicyHash.slice(0, 16)} -> ${current.acceptancePolicyHash.slice(0, 16)}`);
    if (paramsMoved) console.log(`  PARAMETER SET CHANGED      ${frozen.defaultParameterSetHash.slice(0, 16)} -> ${current.defaultParameterSetHash.slice(0, 16)}`);
    if (!drift.length) console.log(`  no artefact drift`);
    for (const d of drift) console.log(`  ${d.change.padEnd(9)} ${d.path}${d.was ? `  ${d.was} -> ${d.now}` : ""}`);
    // Parameter movement is EXPECTED once calibration runs; artefact drift in
    // corpus, sets or seals is not. They are reported separately for that reason.
    const structuralDrift = drift.filter((d) => !d.path.includes("parameters.js"));
    console.log(`\n  structural drift: ${structuralDrift.length}  ·  policy drift: ${policyMoved ? "YES" : "no"}`);
    process.exit(structuralDrift.length || policyMoved ? 2 : 0);
  }

  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(FREEZE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`PRE-CALIBRATION FREEZE — ${current.artefactCount} artefacts\n`);
  console.log(`  acceptance policy hash  ${current.acceptancePolicyHash.slice(0, 32)}`);
  console.log(`  default parameter hash  ${current.defaultParameterSetHash.slice(0, 32)}`);
  if (current.missing.length) {
    console.log(`\n  MISSING (${current.missing.length}):`);
    for (const m of current.missing) console.log(`    ${m}`);
  }
  console.log(`\nwrote ${FREEZE_PATH}`);
}
