#!/usr/bin/env node
// ── Phase 6C4B1 WS1: the V5 readiness blocker register ──────────────────────
//   npm run v5:blockers            build / refresh the register
//   npm run v5:blockers -- --audit write a new resolution AUDIT artifact
//
// Blockers are read from historical-v5-readiness.json and never from prose.
// The register is append-only in spirit: resolution is recorded through a new
// audit artifact, never by overwriting the phase-start register.
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

export const CATEGORIES = Object.freeze(["CANDIDATE_INTEGRITY", "CORE_GRAPH", "IDENTITY_SEPARATION",
  "REFERENCE_CERTIFICATION", "OBSERVABILITY_CERTIFICATION", "ZONE_MEASUREMENT", "PRACTICAL_MARGIN_POLICY",
  "CANDIDATE_POOL", "SELECTION_POLICY", "TARGET_COMPLETENESS", "SEED_DISJOINTNESS", "RUNNER_PREFLIGHT",
  "SEAL_INTEGRITY", "OTHER"]);

// How each source blocker maps onto this phase. Keyed by the source item id,
// so a blocker the source artifact names but this table does not cover fails
// the build rather than being silently dropped.
const PLAN = {
  RE_CERTIFY_ERA_REFERENCES: {
    category: "REFERENCE_CERTIFICATION", ownerWorkstream: "WS4",
    requiredEvidence: "era-reference-certification-candidate1.json — all eight era references re-measured under Candidate 1 on frozen non-holdout seeds",
    passCondition: "eight eras certified, zero failed references, zero V5-pool overlap, zero side-symmetry failures, zero invariant failures, zero replay failures",
    resolvedByArtifact: "era-reference-certification-candidate1",
  },
  RE_CERTIFY_TRAIT_OBSERVABILITY: {
    category: "OBSERVABILITY_CERTIFICATION", ownerWorkstream: "WS5",
    requiredEvidence: "historical-observability-certification-candidate1.json — strong/neutral/weak controls re-run under Candidate 1 for every scored trait, plus the metric-dependency graph and the Candidate 1 residual dispositions",
    passCondition: "scoredTraitsWithFailedObservability = 0, unobservableTraitsContributingToVerdict = 0, contradictoryDependentRules = 0, unresolvedSubstantiveCandidate1Residuals = 0",
    resolvedByArtifact: "historical-observability-certification-candidate1",
  },
  SELECT_V5_MATCHUPS: {
    category: "SELECTION_POLICY", ownerWorkstream: "WS8-WS9",
    requiredEvidence: "historical-v5-selection-policy.json frozen before historical-v5-selection.json is produced; selection deterministic and output-blind",
    passCondition: "8 matchups, 16 distinct team-seasons, 1 per era style, 0 Candidate 1 outputs consulted, reorder-invariant, 0 prior-set overlaps",
    resolvedByArtifact: "historical-v5-selection",
  },
  FREEZE_V5_POLICY_AND_SEEDS: {
    category: "PRACTICAL_MARGIN_POLICY", ownerWorkstream: "WS6+WS11",
    requiredEvidence: "trait-practical-margin-policy-v5.json and historical-holdout-v5-policy.json frozen before selection results exist; historical-holdout-v5-seeds.json proven disjoint from every prior domain",
    passCondition: "policy hashes frozen and recorded before any V5 simulation, margins derived from non-holdout controls only, seed overlap with every prior domain = 0",
    resolvedByArtifact: "historical-holdout-v5-policy",
  },
  REGISTER_V5_SEAL: {
    category: "SEAL_INTEGRITY", ownerWorkstream: "WS13",
    requiredEvidence: "historical-holdout-v5-seal.json plus a real entry in the sealed-set registry with its own access log",
    passCondition: "state SEALED_UNREAD, accessCount 0, normal commands refuse the set, seal independent of V3/V4/synthetic seals",
    resolvedByArtifact: "historical-holdout-v5-seal",
  },
  RUN_V5_DRY_RUN: {
    category: "RUNNER_PREFLIGHT", ownerWorkstream: "WS12",
    requiredEvidence: "historical-v5-runner-dry-run.json — the EXACT V5 runner exercised end to end on a mock seal with crash/resume and duplicate-run refusal",
    passCondition: "mock unlock increments once, resume continues the same event, second run refused, identity/policy/profile-map mismatches refused, real V5 access count still 0",
    resolvedByArtifact: "historical-v5-runner-dry-run",
  },
};

export const buildRegister = () => {
  const readiness = readArtifact("historical-v5-readiness", DIR_6C4A);
  const source = readiness.data.outstandingBeforeV5;
  const unplanned = source.filter((s) => !PLAN[s.item]);
  if (unplanned.length) throw new Error(`source blockers with no resolution plan: ${unplanned.map((s) => s.item).join(", ")}`);
  const ids = source.map((s) => s.item);
  const duplicates = ids.filter((x, i) => ids.indexOf(x) !== i);
  const blockers = source.map((s, i) => ({
    blockerId: `v5b-${String(i + 1).padStart(2, "0")}`,
    sourceItem: s.item,
    description: s.why,
    sourceArtifact: `${DIR_6C4A}/historical-v5-readiness.json`,
    sourceArtifactHash: readiness.outputHash,
    blocking: s.blocking,
    ...PLAN[s.item],
    currentStatus: "OPEN",
    resolutionCommit: null,
    resolvedByArtifactHash: null,
  }));
  return { blockers, duplicates, sourceCount: source.length };
};

/** Resolution status of one blocker, decided by its artifact, never by hand. */
const resolutionOf = (b) => {
  if (!artifactExists(b.resolvedByArtifact, DIR)) return { status: "OPEN", hash: null, detail: "artifact not yet written" };
  const art = readArtifact(b.resolvedByArtifact, DIR);
  const d = art.data;
  const pass = d.pass ?? d.certified ?? d.frozen ?? d.sealed ?? false;
  return { status: pass ? "RESOLVED" : "FAILED", hash: art.outputHash,
    detail: pass ? "artifact exists and reports pass" : "artifact exists but does not report pass" };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = process.argv.includes("--audit");
  const def = defaultRuntimeParameterSet();
  const extra = { parameterSetHash: def.parameterSetHash };
  const { blockers, duplicates, sourceCount } = buildRegister();

  if (!audit) {
    if (artifactExists("historical-v5-blocker-register", DIR)) {
      console.log("register already exists — refusing to overwrite a phase-start record. Use --audit for resolution status.");
      const d = readArtifact("historical-v5-blocker-register", DIR).data;
      console.log(`  ${d.blockerCount} blockers, reconciles ${d.reconciles}`);
      process.exit(0);
    }
    const byCategory = {};
    for (const b of blockers) byCategory[b.category] = (byCategory[b.category] ?? 0) + 1;
    const payload = {
      historicalV5BlockerRegisterVersion: VALIDATION_VERSIONS.historicalV5BlockerRegisterVersion,
      sourceArtifact: `${DIR_6C4A}/historical-v5-readiness.json`,
      sourceBlockerCount: sourceCount,
      blockerCount: blockers.length,
      reconciles: blockers.length === sourceCount && duplicates.length === 0,
      unregisteredBlockers: 0, duplicateBlockers: duplicates.length,
      unclassified: blockers.filter((b) => !CATEGORIES.includes(b.category)).length,
      byCategory, categories: CATEGORIES,
      blockers,
      rule: "A blocker resolves only when its required artifact exists, its hash is recorded, its pass condition is machine-verified, and the resolution is recorded through a NEW audit artifact. The phase-start register is never rewritten.",
      phaseFindings: [
        { findingId: "6c4b1-f01", title: "Candidate 0 and Candidate 1 produced identical result fingerprints",
          detail: "Not a source blocker — discovered in this phase while building WS2's identity-separation evidence. Candidate 1 left every module version and the parameter-set hash equal to Candidate 0's, and the development possession fingerprint did not state the calibration version, so two of three probe matchups produced byte-identical result fingerprints for materially different games. Resolved inside WS2 (its own workstream) rather than added as a seventh blocker, so the register still reconciles with its source.",
          ownerWorkstream: "WS2", resolvedByArtifact: "candidate-identity-separation" },
      ],
    };
    const { path } = writeArtifact("historical-v5-blocker-register", payload, {
      generationCommand: "npm run v5:blockers", dir: DIR, extra });
    console.log(`source blockers ${sourceCount} · registered ${blockers.length} · reconciles ${payload.reconciles} · duplicates ${duplicates.length}`);
    for (const b of blockers) console.log(`  ${b.blockerId}  ${b.category.padEnd(26)} ${b.ownerWorkstream.padEnd(9)} ${b.sourceItem}`);
    console.log(`wrote ${path}`);
    process.exit(payload.reconciles ? 0 : 2);
  }

  // ── audit pass: a NEW artifact recording resolution, never an overwrite ────
  const reg = readArtifact("historical-v5-blocker-register", DIR).data;
  const rows = reg.blockers.map((b) => { const r = resolutionOf(b); return { ...b, currentStatus: r.status, resolvedByArtifactHash: r.hash, resolutionDetail: r.detail }; });
  const resolved = rows.filter((r) => r.currentStatus === "RESOLVED");
  const payload = {
    historicalV5BlockerRegisterVersion: reg.historicalV5BlockerRegisterVersion,
    auditOf: "historical-v5-blocker-register",
    registerHash: readArtifact("historical-v5-blocker-register", DIR).outputHash,
    totalBlockers: rows.length, resolvedBlockers: resolved.length, unresolvedBlockers: rows.length - resolved.length,
    reconciles: rows.length === reg.sourceBlockerCount,
    blockers: rows,
    pass: rows.length - resolved.length === 0 && rows.length === reg.sourceBlockerCount,
  };
  writeArtifact("historical-v5-blocker-audit", payload, { generationCommand: "npm run v5:blockers -- --audit", dir: DIR, extra });
  console.log(`BLOCKER AUDIT — ${resolved.length}/${rows.length} resolved · unresolved ${payload.unresolvedBlockers}`);
  for (const r of rows) console.log(`  ${r.blockerId}  ${r.currentStatus.padEnd(9)} ${r.sourceItem.padEnd(32)} ${r.resolutionDetail}`);
  process.exit(payload.pass ? 0 : 1);
}
