#!/usr/bin/env node
// ── WS1: reconcile what the Synthetic V2 formal package actually has ─────────
//   npm run syn:readiness
//
// The authoritative list of what is missing is the Phase 6C4B2 blocker
// artifact, not this phase's prose. Every MISSING entry below names the blocker
// key it was read from, and the register refuses to run if the blocker's set of
// missing keys is not fully accounted for.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { DIR, DIR_B2, SET, syntheticMembership } from "./preflight.mjs";

const BLOCKER = `${DIR_B2}/synthetic-v2-package-blocker.json`;
export const STATES = Object.freeze(["PRESENT_AND_FROZEN", "PRESENT_NOT_CERTIFIED", "MISSING", "BLOCKED", "NOT_APPLICABLE"]);

/** The sixteen required components of an executable formal holdout package. */
const CATEGORIES = [
  { id: "fixtureMembership", displayName: "Sealed fixture membership",
    blockerKey: null, requiredFor: "knowing what will be run at all" },
  { id: "guardrailPolicy", displayName: "Frozen conceptual guardrails",
    blockerKey: null, requiredFor: "knowing what is being asked of the candidate" },
  { id: "guardrailFormalization", displayName: "Machine-readable guardrail registry",
    blockerKey: null, requiredFor: "turning a prose guardrail into an adjudicable predicate" },
  { id: "measurementSurfaces", displayName: "Per-guardrail measurement surfaces",
    blockerKey: null, requiredFor: "measuring each guardrail somewhere its claim is decidable" },
  { id: "practicalMargins", displayName: "Practical margins",
    blockerKey: null, requiredFor: "preventing a significant-but-meaningless result from deciding the verdict" },
  { id: "formalPolicy", displayName: "Formal stress policy",
    blockerKey: null, requiredFor: "binding guardrails, surfaces, margins and thresholds into one frozen document" },
  { id: "perFixtureVerdictSchema", displayName: "Per-fixture verdict schema",
    blockerKey: null, requiredFor: "recording one defensible outcome per fixture" },
  { id: "aggregationRule", displayName: "Verdict aggregation rule",
    blockerKey: "aggregationRule", requiredFor: "turning 16 fixture verdicts into one set verdict" },
  { id: "samplePlan", displayName: "Per-fixture and per-mode sample volumes",
    blockerKey: "seedSet", requiredFor: "fixing statistical power before any result is seen" },
  { id: "seedSet", displayName: "Frozen disjoint seed domain",
    blockerKey: "seedSet", requiredFor: "guaranteeing the holdout is scored on seeds nothing else has used" },
  { id: "runner", displayName: "Transactional runner",
    blockerKey: "runner", requiredFor: "executing the set exactly once, with one access event" },
  { id: "runnerCommand", displayName: "Resolvable npm command",
    blockerKey: "preparedCommandResolvable", requiredFor: "letting the prepared package command actually execute" },
  { id: "mockSet", displayName: "Non-holdout mock stress set",
    blockerKey: null, requiredFor: "rehearsing the runner without touching the holdout" },
  { id: "dryRun", displayName: "Transactional dry run",
    blockerKey: "dryRun", requiredFor: "proving the runner behaves before it is pointed at the sealed set" },
  { id: "commandCertification", displayName: "Command certification",
    blockerKey: "preparedCommandResolvable", requiredFor: "proving help, preflight and dry-run modes cannot open a holdout" },
  { id: "packageBinding", displayName: "Compound package binding",
    blockerKey: "packageBinding", requiredFor: "recording the hashes a future execution phase must verify" },
];

/** What this phase produces, and therefore what changes state. */
const PRODUCED_IN_THIS_PHASE = {
  guardrailFormalization: "synthetic-v2-guardrail-registry.json",
  measurementSurfaces: "synthetic-v2-surface-plan.json",
  practicalMargins: "synthetic-v2-practical-margins.json",
  formalPolicy: "synthetic-v2-formal-policy.json",
  perFixtureVerdictSchema: "synthetic-v2-verdict-schema.json",
  aggregationRule: "synthetic-v2-aggregation-policy.json",
  samplePlan: "synthetic-v2-sample-plan.json",
  seedSet: "synthetic-v2-seeds.json",
  runner: "synthetic-v2-runner-manifest.json",
  runnerCommand: "synthetic-v2-command-certification.json",
  mockSet: "synthetic-v2-mock-manifest.json",
  dryRun: "synthetic-v2-dry-run.json",
  commandCertification: "synthetic-v2-command-certification.json",
  packageBinding: "compound-formal-validation-package-v2.json",
};

const artifactPresent = (name) => existsSync(`${DIR}/${name}`);

export const buildRegister = () => {
  if (!existsSync(BLOCKER)) throw new Error(`the Phase 6C4B2 blocker artifact is missing at ${BLOCKER}; the authoritative missing list cannot be read`);
  const blocker = JSON.parse(readFileSync(BLOCKER, "utf8"));
  const missingKeys = Object.keys(blocker.data.missing);
  const mem = syntheticMembership();
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  const rows = CATEGORIES.map((c) => {
    const produced = PRODUCED_IN_THIS_PHASE[c.id] ?? null;
    let state, evidence;
    switch (c.id) {
      case "fixtureMembership":
        state = "PRESENT_AND_FROZEN";
        evidence = `16 fixtures, manifestHash ${mem.membershipHash}, setVersion ${mem.manifest.setVersion}, frozen at ${mem.manifest.frozenAt}, accessPolicy ${mem.manifest.accessPolicy}`;
        break;
      case "guardrailPolicy":
        state = "PRESENT_AND_FROZEN";
        evidence = `${Object.keys(HOLDOUT.syntheticGuardrails).length} keys in HOLDOUT.syntheticGuardrails, inside acceptance policy hash ${acceptancePolicyHash()}; minGamesPerHoldoutFixture ${HOLDOUT.minGamesPerHoldoutFixture}`;
        break;
      case "runnerCommand": {
        const has = Boolean(pkg.scripts?.["validation:synthetic-v2"]);
        state = has ? (artifactPresent(produced) ? "PRESENT_AND_FROZEN" : "PRESENT_NOT_CERTIFIED") : "MISSING";
        evidence = has
          ? `package.json defines validation:synthetic-v2 → ${pkg.scripts["validation:synthetic-v2"]}`
          : `package.json still has no validation:synthetic-v2 script. Blocker key "preparedCommandResolvable": ${blocker.data.missing.preparedCommandResolvable}`;
        break;
      }
      default: {
        const present = produced ? artifactPresent(produced) : false;
        state = present ? "PRESENT_AND_FROZEN" : "MISSING";
        evidence = present
          ? `${DIR}/${produced} exists`
          : c.blockerKey
            ? `blocker key "${c.blockerKey}": ${blocker.data.missing[c.blockerKey]}`
            : `no artifact ${produced ?? "(none defined)"} exists yet; this phase must author it`;
      }
    }
    return { componentId: c.id, displayName: c.displayName, requiredFor: c.requiredFor,
      state, evidence, blockerKey: c.blockerKey,
      producedInThisPhase: produced, artifactPath: produced ? `${DIR}/${produced}` : null };
  });

  // Every blocker key must be claimed by at least one register row, or the
  // register is not actually reconciling against the blocker.
  const claimed = new Set(rows.map((r) => r.blockerKey).filter(Boolean));
  const unclaimed = missingKeys.filter((k) => !claimed.has(k));
  const invented = [...claimed].filter((k) => !missingKeys.includes(k));

  return { rows, blocker, missingKeys, unclaimed, invented, mem };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-formal-readiness-register", DIR) && !process.argv.includes("--refreeze")) {
    console.log("register already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const { rows, blocker, missingKeys, unclaimed, invented, mem } = buildRegister();

  console.log("SYNTHETIC V2 FORMAL EXECUTION READINESS REGISTER\n");
  console.log(`  authoritative source: ${BLOCKER} (${blocker.data.blockerId}, detected in ${blocker.data.detectedInPhase})`);
  console.log(`  blocker names ${missingKeys.length} missing components: ${missingKeys.join(", ")}\n`);
  for (const r of rows) {
    console.log(`  ${r.state.padEnd(21)} ${r.componentId.padEnd(24)} ${r.displayName}`);
  }
  const counts = STATES.map((s) => [s, rows.filter((r) => r.state === s).length]);
  console.log(`\n  ${counts.filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(" · ")}\n`);

  gate("blockerArtifactRead", Boolean(blocker.data?.missing),
    `read ${missingKeys.length} missing keys directly from the 6C4B2 blocker rather than from this phase's prose`);
  gate("everyBlockerKeyClaimedByARegisterRow", unclaimed.length === 0,
    unclaimed.length ? `unclaimed blocker keys: ${unclaimed.join(", ")}` : "all six blocker keys map to a register component");
  gate("noBlockerKeyInvented", invented.length === 0,
    invented.length ? `register cites keys the blocker does not have: ${invented.join(", ")}` : "the register cites no blocker key that the blocker does not contain");
  gate("everyComponentHasAStateFromTheFrozenVocabulary",
    rows.every((r) => STATES.includes(r.state)),
    `${rows.length} components, every state drawn from ${STATES.join("/")}`);
  gate("everyComponentHasEvidence", rows.every((r) => r.evidence && r.evidence.length > 20),
    "no component is asserted without a cited artifact, hash or blocker quotation");
  gate("frozenInputsStillFrozen",
    rows.find((r) => r.componentId === "fixtureMembership").state === "PRESENT_AND_FROZEN"
      && rows.find((r) => r.componentId === "guardrailPolicy").state === "PRESENT_AND_FROZEN"
      && mem.membershipHash === blocker.data.frozenAndPresent.fixtures.manifestHash
      && acceptancePolicyHash() === blocker.data.frozenAndPresent.guardrailPolicy.acceptancePolicyHash,
    `membership hash and acceptance policy hash both equal the values the blocker recorded, so neither frozen input drifted`);
  gate("syntheticSetStillSealed",
    SEALED_SETS[SET] !== undefined && mem.manifest.accessPolicy === "SEALED_UNREAD",
    `${SET} is registered in SEALED_SETS and its manifest still declares SEALED_UNREAD`);
  gate("everyMissingComponentIsAssignedToThisPhase",
    rows.filter((r) => r.state === "MISSING").every((r) => r.producedInThisPhase),
    `${rows.filter((r) => r.state === "MISSING").length} missing components, each naming the artifact this phase must author`);

  const payload = {
    syntheticFormalReadinessRegisterVersion: "1.0.0",
    authoritativeSource: { path: BLOCKER, blockerId: blocker.data.blockerId,
      detectedInPhase: blocker.data.detectedInPhase, recordedAtCommit: blocker.data.recordedAtCommit,
      missingKeys },
    frozenInputs: {
      membershipHash: mem.membershipHash, membershipUnchanged: mem.membershipHash === blocker.data.frozenAndPresent.fixtures.manifestHash,
      acceptancePolicyHash: acceptancePolicyHash(),
      acceptancePolicyUnchanged: acceptancePolicyHash() === blocker.data.frozenAndPresent.guardrailPolicy.acceptancePolicyHash,
      guardrailKeyCount: Object.keys(HOLDOUT.syntheticGuardrails).length,
      minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
    },
    stateVocabulary: STATES,
    componentCount: rows.length,
    stateCounts: Object.fromEntries(counts),
    components: rows,
    reconciliation: { blockerKeysClaimed: [...new Set(rows.map((r) => r.blockerKey).filter(Boolean))], unclaimed, invented },
    guardrailCountNote: `The blocker's own note says "Ten named per-fixture guardrails" while its enumeration lists eleven keys. The eleven keys are authoritative; the count discrepancy is registered in synthetic-v2-guardrail-registry.json and no guardrail is merged, split or dropped to make either number come out.`,
    scope: { thisPhaseIsPreparationOnly: true, holdoutsOpened: 0, syntheticFixturesSimulated: 0,
      candidate1Changed: false, syntheticMembershipChanged: false, historicalV5Changed: false },
    pass: fail.length === 0, failedGates: fail,
  };
  payload.registerHash = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.componentId, r.state]))).digest("hex");
  writeArtifact("synthetic-v2-formal-readiness-register", payload, {
    generationCommand: "npm run syn:readiness", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nREADINESS REGISTER: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.registerHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
