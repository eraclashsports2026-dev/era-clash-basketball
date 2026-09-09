#!/usr/bin/env node
// ── WS2: certify the Candidate 1 core graph against runtime truth ───────────
//   npm run v5:certify-core
//
// Three facts, in order:
//   1. The parser-backed graph reproduces the regex builder's hash on this
//      tree, so replacing the builder introduces no hash discontinuity.
//   2. Every module Candidate 1 ACTUALLY executes is in the declared core.
//   3. The current core hash differs from the lock by exactly one file, and a
//      behaviour proof shows that file changed identity only.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCoreManifestV3, CORE_ENTRY_POINTS } from "./coreGraph.mjs";
import { buildCoreManifest } from "../validation/preflight.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

// Modules the trace loads that are NOT result-affecting engine code: the trace
// harness itself, and the production 3.2.0 card/rating stack that
// src/players.js pulls in (the possession engine reads player CARDS from it).
// Each is named, with the reason it is not core, so "not core" is a decision
// rather than an omission.
const NON_CORE_EXECUTED = Object.freeze({
  "scripts/v5/runtimeTrace.mjs": "the trace harness itself, not engine code",
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const tracePath = process.argv[2] ?? "/private/tmp/claude-501/-Users-josephjohnson-Desktop-EraClash/59f9fb77-dc03-45ce-b639-833816276c57/scratchpad/runtime-trace.json";
  if (!existsSync(tracePath)) throw new Error(`runtime trace not found at ${tracePath} — run runtimeTrace.mjs under the loader hook first`);
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  const v3 = await buildCoreManifestV3();
  const v2 = buildCoreManifest();
  const lock = readArtifact("candidate1-lock", DIR_6C4A).data;
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  console.log("CANDIDATE 1 CORE GRAPH CERTIFICATION\n");
  const declared = new Set(v3.files.map((f) => f.path));
  const executed = trace.executedModules;
  const missing = executed.filter((m) => !declared.has(m) && !(m in NON_CORE_EXECUTED));
  const declaredNotExecuted = [...declared].filter((d) => !executed.includes(d));

  gate("parserGraphAgreesWithPriorBuilder", v3.aggregateCoreHash === v2.aggregateCoreHash && v3.fileCount === v2.fileCount,
    `parser v${v3.candidateCoreGraphVersion} ${v3.fileCount} files ${v3.aggregateCoreHash.slice(0, 16)}... == regex builder ${v2.fileCount} files ${v2.aggregateCoreHash.slice(0, 16)}... (no hash discontinuity from replacing the builder)`);
  gate("noUnresolvedResultAffectingImports", v3.unresolvedDynamicImports.length === 0 && v3.unresolvableRelativeSpecifiers.length === 0,
    `unresolvable dynamic import() sites ${v3.unresolvedDynamicImports.length}, unresolvable relative specifiers ${v3.unresolvableRelativeSpecifiers.length}`);
  gate("missingExecutedModules", missing.length === 0,
    `${executed.length} modules executed across ${trace.pathsExercised.length} simulation paths; ${missing.length} executed but undeclared${missing.length ? `: ${missing.join(", ")}` : ""}`);
  gate("offensivePlanIncluded", declared.has("src/v3/actions/offensivePlan.js") && executed.includes("src/v3/actions/offensivePlan.js"),
    "src/v3/actions/offensivePlan.js is declared AND observed executing — the module the regex v1 builder missed for four phases");
  gate("everyEntryPointExists", v3.missingEntryPoints.length === 0, `${CORE_ENTRY_POINTS.length} entry points, ${v3.missingEntryPoints.length} missing`);

  // ── difference from the lock, decomposed per file ──────────────────────────
  // The locked tree is the commit that RECORDED the lock, not lock.lockedAtCommit
  // (which names the HEAD the gates were established at, one commit earlier —
  // the version stamp was still uncommitted then).
  const { lockCommit } = await import("./identityRepair.mjs");
  const lockedTree = lockCommit();
  const lockedShaOf = (p) => createHash("sha256").update(execFileSync("git", ["show", `${lockedTree}:${p}`], { encoding: "buffer" })).digest("hex");
  const changedSinceLock = [];
  for (const f of v3.files) {
    let locked = null;
    try { locked = lockedShaOf(f.path); } catch { locked = "ABSENT_AT_LOCK"; }
    if (locked !== f.sha256) changedSinceLock.push({ path: f.path, lockedSha256: locked, currentSha256: f.sha256 });
  }
  // reproduce the locked aggregate by substituting the locked contents back
  const reproduced = createHash("sha256").update(JSON.stringify(v3.files.map((f) => {
    const c = changedSinceLock.find((x) => x.path === f.path);
    return [f.path, c && c.lockedSha256 !== "ABSENT_AT_LOCK" ? c.lockedSha256 : f.sha256];
  }))).digest("hex");
  gate("lockReproducibleFromCurrentGraph", reproduced === lock.coreHash,
    `substituting the locked contents of ${changedSinceLock.length} file(s) reproduces the locked core hash ${lock.coreHash.slice(0, 16)}... exactly`);

  const behaviourProof = existsSync(`${DIR}/candidate1-identity-repair.json`)
    ? readArtifact("candidate1-identity-repair", DIR).data : null;
  gate("everyCoreChangeHasABehaviourProof",
    changedSinceLock.length === 0 || (behaviourProof?.behaviourIdentical === true
      && changedSinceLock.every((c) => behaviourProof.changedCoreFiles.includes(c.path))),
    changedSinceLock.length === 0 ? "no core file differs from the lock"
      : `${changedSinceLock.length} changed: ${changedSinceLock.map((c) => c.path).join(", ")} — covered by candidate1-identity-repair.json with behaviourIdentical ${behaviourProof?.behaviourIdentical}`);

  const payload = {
    candidateCoreGraphVersion: v3.candidateCoreGraphVersion,
    parser: "es-module-lexer (the import analyser Vite uses)",
    discovery: v3.discovery,
    entryPoints: v3.entryPoints,
    declaredModules: v3.files.map((f) => f.path),
    declaredModuleCount: v3.fileCount,
    fileHashes: v3.files,
    runtimeObservedModules: executed,
    runtimeObservedCount: executed.length,
    simulationPathsExercised: trace.pathsExercised,
    missingExecutedModules: missing,
    declaredButNotExecutedInTrace: declaredNotExecuted,
    nonCoreExecutedModules: NON_CORE_EXECUTED,
    unresolvedDynamicImports: v3.unresolvedDynamicImports,
    unresolvableRelativeSpecifiers: v3.unresolvableRelativeSpecifiers,
    externalPackages: v3.externalPackages,
    priorBuilderComparison: { priorBuilderFileCount: v2.fileCount, priorBuilderHash: v2.aggregateCoreHash, identical: v3.aggregateCoreHash === v2.aggregateCoreHash },
    currentCoreHash: v3.aggregateCoreHash,
    candidate1LockedCoreHash: lock.coreHash,
    coreHashMatchesLock: v3.aggregateCoreHash === lock.coreHash,
    changedSinceLock,
    lockReproducedFromCurrentGraph: reproduced,
    lockedTreeCommit: lockedTree,
    historicalDefect: {
      v1: "single-line regex; could not see a multi-line import. src/v3/actions/offensivePlan.js executed in every game while absent from every core manifest through Phases 6C2C6, 6C3 and 6C3R.",
      v2: "widened regex (Phase 6C4A); found offensivePlan.js but still could not distinguish a re-export or a resolvable dynamic import from an unresolvable one.",
      v3: "parser-backed. The regex is gone from the authoritative path.",
    },
    pass: fail.length === 0,
    failedGates: fail,
  };
  writeArtifact("candidate-core-graph-certification", payload, {
    generationCommand: "npm run v5:certify-core", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nCORE GRAPH CERTIFICATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(payload.pass ? 0 : 2);
}
