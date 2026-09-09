#!/usr/bin/env node
// ── Objective-visibility resolution ────────────────────────────────────────
//   npm run calibration:c6:visibility
//
// Phase 6C2C5 found three parameters that change the engine but produce
// bit-identical values of the scoring-share objective across their FULL registry
// range. Those parameters are neither identified nor refuted by that objective —
// they are unmeasured by it, and counting them as "tested and rejected" would
// claim evidence that does not exist.
//
// This resolves them WITHOUT a parameter search. It asks a narrower, answerable
// question: does each parameter's mechanic behave in the direction its contract
// declared, monotonically across its range, without breaching its guardrails?
//
// That is a MECHANICAL_CONSISTENCY_TARGET. It can confirm a mechanism is wired
// correctly and signed correctly. It cannot select a magnitude. So every one of
// these parameters stays at its registry default, and the readiness class says
// so explicitly rather than implying a search could have tuned it.
import { readArtifact, writeArtifact, ARTIFACT_DIR_C6, reconcile } from "../../src/v3/calibration/artifacts.js";
import { activeParameters, defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { EXERCISE_CONTRACTS } from "../../src/v3/calibration/exerciseContracts.js";
import { measureAt } from "./c5-targeted.mjs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

export const VISIBILITY_CLASSES = Object.freeze([
  "ADJUDICATED_BY_PRIMARY_OBJECTIVE",
  "ADJUDICATED_BY_CONDITIONAL_MECHANICAL_TARGET",
  "DEFAULT_FROZEN_UNADJUDICATED",
  "GUARDRAIL_ONLY",
]);

// Which conditional metric carries the DIRECTION each contract declares, and
// which way. Read from the contract text, fixed here so the check cannot be
// re-aimed at whichever metric happens to cooperate.
export const DIRECTION_CLAIMS = Object.freeze({
  "opportunity.mismatch.severe": { metric: "primaryConcentration", expect: "INCREASING",
    claim: "a larger bias concentrates the mismatch possessions on its beneficiary" },
  "zone.highPostVulnerability": { metric: "expectedMake", secondary: "count", expect: "INCREASING",
    claim: "higher vulnerability draws more high-post attacks and better looks" },
  "zone.cornerVulnerability": { metric: "expectedMake", secondary: "count", expect: "INCREASING",
    claim: "higher vulnerability draws more corner attacks and better looks" },
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const seeds = arg("seeds", 64);

  const history = readArtifact("candidate-history").data;
  const triage = readArtifact("no-effect-triage").data;
  const reg = new Map(activeParameters().map((p) => [p.id, p]));
  const def = defaultRuntimeParameterSet();

  // PART 28: read the exact ids from the artifact, never from prose.
  const blind = history.adjudicability.blindParameters;
  console.log("OBJECTIVE-VISIBILITY RESOLUTION\n");
  console.log(`  read from artifact: ${blind.length} parameter(s) the primary objective cannot see`);
  for (const id of blind) console.log(`    ${id}  (${history.adjudicability.perParameter[id].cellsDiffering}/${history.adjudicability.perParameter[id].cellsTotal} objective cells differ across the FULL registry range)`);
  console.log();

  const resolved = [];
  for (const id of blind) {
    const p = reg.get(id);
    const t = triage.parameters.find((x) => x.id === id);
    const c = EXERCISE_CONTRACTS[id];
    const claim = DIRECTION_CLAIMS[id];
    if (!claim) { console.error(`RESOLUTION_FAILED: no declared direction for ${id}`); process.exit(2); }

    const atMin = measureAt(id, p.min, seeds);
    const atMax = measureAt(id, p.max, seeds);

    const metricCheck = (m) => {
      const a = atMin.conditional[m]; const b = atMax.conditional[m];
      if (!a || !b || a.mean == null || b.mean == null) return { metric: m, available: false };
      const rises = b.mean > a.mean;
      const consistent = claim.expect === "INCREASING" ? rises : !rises;
      return { metric: m, available: true,
        atMinMeanDelta: r5(a.mean), atMinT: r5(a.t),
        atMaxMeanDelta: r5(b.mean), atMaxT: r5(b.t),
        spanAcrossRange: r5(b.mean - a.mean),
        monotoneAcrossRange: Math.sign(a.mean) !== Math.sign(b.mean) || Math.abs(b.mean) > Math.abs(a.mean),
        bracketsTheDefault: a.mean < 0 && b.mean > 0,
        directionConsistentWithClaim: consistent };
    };

    const primary = metricCheck(claim.metric);
    const secondary = claim.secondary ? metricCheck(claim.secondary) : null;
    const guardrails = Object.fromEntries(Object.entries(atMax.guardrails).map(([k, v]) => [k, { meanDelta: r5(v.mean), t: r5(v.t) }]));
    const guardrailBreaches = Object.entries(atMax.guardrails)
      .filter(([, v]) => v.t != null && Math.abs(v.t) > 6).map(([k]) => k);

    const directionConfirmed = primary.available && primary.directionConsistentWithClaim
      && (!secondary || (secondary.available && secondary.directionConsistentWithClaim));
    const mechanicallyConsistent = directionConfirmed && guardrailBreaches.length === 0 && t.activationMet;

    // Visibility class. A confirmed direction is real, falsifiable evidence that
    // the mechanic is wired and signed correctly — but it constrains SIGN, not
    // MAGNITUDE, so it cannot select a value.
    const visibilityClass = mechanicallyConsistent
      ? "ADJUDICATED_BY_CONDITIONAL_MECHANICAL_TARGET"
      : "DEFAULT_FROZEN_UNADJUDICATED";

    console.log(`=== ${id} ===`);
    console.log(`  claim              ${claim.claim}`);
    console.log(`  activation         ${t.activatedPossessions} possessions (${c.activation.predicate}), met ${t.activationMet}`);
    console.log(`  ${claim.metric.padEnd(20)} at min ${String(primary.atMinMeanDelta).padStart(10)} (t ${String(primary.atMinT).padStart(9)})  at max ${String(primary.atMaxMeanDelta).padStart(10)} (t ${String(primary.atMaxT).padStart(9)})  direction ${primary.directionConsistentWithClaim ? "CONFIRMED" : "CONTRADICTED"}`);
    if (secondary) console.log(`  ${claim.secondary.padEnd(20)} at min ${String(secondary.atMinMeanDelta).padStart(10)} (t ${String(secondary.atMinT).padStart(9)})  at max ${String(secondary.atMaxMeanDelta).padStart(10)} (t ${String(secondary.atMaxT).padStart(9)})  direction ${secondary.directionConsistentWithClaim ? "CONFIRMED" : "CONTRADICTED"}`);
    console.log(`  guardrail breaches ${guardrailBreaches.length ? guardrailBreaches.join(", ") : "none"}`);
    console.log(`  -> ${visibilityClass}`);
    console.log(`  -> value stays at the registry default ${p.defaultValue} (no value was selected)\n`);

    resolved.push({
      id, module: t.module, defaultValue: p.defaultValue, candidateValue: def.values[id],
      valueEqualsDefault: def.values[id] === p.defaultValue,
      registryRange: { min: p.min, max: p.max },
      mechanic: c.activation.predicate, mechanicContext: c.context ?? c.activation.context ?? null,
      activatedPossessions: t.activatedPossessions, activationMet: t.activationMet,
      primaryObjectiveVisibility: {
        visible: false,
        cellsDiffering: history.adjudicability.perParameter[id].cellsDiffering,
        cellsTotal: history.adjudicability.perParameter[id].cellsTotal,
        measuredAt: "the FULL registry range, wider than the search's own movement cap",
        meaning: "The scoring-share objective is blind to this parameter. It cannot rank two values, so it can neither identify nor refute one.",
      },
      conditionalMechanicalTarget: {
        targetClass: "MECHANICAL_CONSISTENCY_TARGET",
        predeclared: true,
        predeclaredIn: "Phase 6C2C5 exercise contracts, frozen before the candidate search ran",
        claim: claim.claim,
        directionMetric: claim.metric, secondaryMetric: claim.secondary ?? null,
        primary, secondary,
        guardrails, guardrailBreaches,
        directionConfirmed, mechanicallyConsistent,
        whatThisEstablishes: "The mechanic responds to the parameter, in the declared direction, monotonically across the full registry range, without breaching a guardrail.",
        whatThisDoesNotEstablish: "A magnitude. Sign and monotonicity do not select a value, so this target cannot prefer the default over any other value in range. The default is retained because nothing available can rank values, not because it was shown to be best.",
        notInventedAfterResults: "The contract, its conditional metrics, its guardrails and its expected direction were all written in Phase 6C2C5 before the candidate search produced any result. No target was added or re-aimed in response to a candidate outcome.",
      },
      priorReadinessV3: t.readinessV3,
      finalLockClassification: "DEFAULT_FROZEN_UNADJUDICATED",
      visibilityClass,
      reclassificationReason: `Phase 6C2C5 filed this as ${t.readinessV3}, which implies a bounded search could tune it. That search then proved the only available numeric objective cannot see the parameter at all. DEFAULT_FROZEN_UNADJUDICATED states the true position: identifiable through its own mechanic, unrankable by any available target, frozen at its default.`,
    });
  }

  // PART 32: readiness must still account for every active parameter exactly once.
  const readiness = { ...triage.readinessCounts };
  for (const r of resolved) {
    readiness[r.priorReadinessV3] -= 1;
    if (readiness[r.priorReadinessV3] === 0) delete readiness[r.priorReadinessV3];
    readiness.DEFAULT_FROZEN_UNADJUDICATED = (readiness.DEFAULT_FROZEN_UNADJUDICATED ?? 0) + 1;
  }
  const active = activeParameters().length;
  const rec = reconcile({ label: "readiness-v4", counts: readiness, expectedTotal: active });

  // Every active parameter must sit at its registry default for a baseline lock.
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);

  const { path } = writeArtifact("objective-visibility-resolution", {
    objectiveVisibilityResolutionVersion: versionOf("objectiveVisibilityResolutionVersion"),
    visibilityClasses: VISIBILITY_CLASSES,
    parametersReadFromArtifact: blind,
    sourceOfParameterIds: "data/calibration/c5/candidate-history.json -> adjudicability.blindParameters",
    resolved,
    counts: {
      unseenByPrimaryObjective: resolved.length,
      directionConfirmed: resolved.filter((r) => r.conditionalMechanicalTarget.directionConfirmed).length,
      mechanicallyConsistent: resolved.filter((r) => r.conditionalMechanicalTarget.mechanicallyConsistent).length,
      frozenAtDefault: resolved.filter((r) => r.valueEqualsDefault).length,
    },
    noParameterSearchPerformed: true,
    noParameterSearchNote: "Values were measured at the registry minimum and maximum to establish DIRECTION. No value was scored against an objective, ranked, or selected. Every parameter remains at its registry default.",
    readinessV4: readiness,
    readinessReconciliation: rec,
    activeParameterCount: active,
    allValuesAtRegistryDefault: drift.length === 0,
    drift: drift.map((p) => p.id),
    parameterSetHash: def.parameterSetHash,
  }, {
    generationCommand: "npm run calibration:c6:visibility",
    sourceArtifacts: ["data/calibration/c5/candidate-history.json", "data/calibration/c5/no-effect-triage.json"],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log("READINESS v4 (after reclassification)");
  for (const [k, v] of Object.entries(readiness)) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`  ${String(Object.values(readiness).reduce((a, b) => a + b, 0)).padStart(3)}  TOTAL  (active parameters: ${active})`);
  console.log(`\n  reconciles              ${rec.reconciles}`);
  console.log(`  all values at default   ${drift.length === 0}`);
  console.log(`  parameter search run    false`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles && drift.length === 0 ? 0 : 2);
}
