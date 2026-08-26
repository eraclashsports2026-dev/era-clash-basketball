#!/usr/bin/env node
// ── Calibration readiness reconciliation ────────────────────────────────────
// Derives exactly one eligibility class per active parameter, FROM DATA.
//
//   npm run calibration:readiness
//
// This module exists because Phase 6C2C3 asserted readiness numbers it never
// computed. The support-matrix JSON had no readiness field at all; the document
// carried six hand-written counts summing to 59 against 53 active parameters,
// and the report quoted four of them summing to 44. Readiness is now a function
// of measured inputs, and the process exits non-zero if the classes do not sum
// to the active parameter count.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { PARAMETERS } from "../../src/v3/calibration/parameters.js";
import { READINESS_CLASSES, IDENTIFIABILITY_V2 } from "../../src/v3/calibration/identifiabilityPolicy.js";
import { versionOf } from "../../src/versions.js";

export const READINESS_PATH = "data/calibration/calibration-readiness.json";
const IDV2 = ".cache/calibration/identifiability-v2.json";
const SUPPORT = "data/calibration/calibration-support-matrix.json";

/**
 * Movement caps by class, as a fraction of the declared range. Frozen in the
 * acceptance policy: free calibration may use the whole range, strongly
 * regularized movement is capped at 15%, and everything else is 0 — a frozen
 * parameter is frozen, not "mostly frozen".
 */
export const MOVEMENT_CAP = Object.freeze({
  FREE_CALIBRATION: 1.0,
  STRONGLY_REGULARIZED_CALIBRATION: 0.15,
  STRUCTURAL_CALIBRATION_ONLY: 0,
  DEFAULT_FROZEN_CONFOUNDED: 0,
  DEFAULT_FROZEN_NO_EFFECT: 0,
  DEFAULT_FROZEN_PENDING_EXTERNAL_DATA: 0,
});

/**
 * The decision function. Order matters, and it is the order of severity: a
 * parameter that cannot be separated from another is frozen regardless of how
 * well supported it is, and one with no authorized target is frozen regardless
 * of how strongly it measures.
 */
export const readinessOf = ({ identifiability, support, confoundedWith, safetyClamp }) => {
  if (safetyClamp) {
    return { readiness: "DEFAULT_FROZEN_NO_EFFECT",
      reason: "Reclassified as a safety clamp: a real consumer that only prevents impossible extremes, and never binds within the corpus. Tuning a guard rail is not calibration." };
  }
  if (identifiability === "NO_MEASURABLE_EFFECT") {
    return { readiness: "DEFAULT_FROZEN_NO_EFFECT",
      reason: "No primary-family metric clears both family-wise significance and its practical effect threshold." };
  }
  if (identifiability === "CONFOUNDED" || (confoundedWith?.length ?? 0) > 0) {
    return { readiness: "DEFAULT_FROZEN_CONFOUNDED",
      reason: `Primary-family response parallel to ${confoundedWith.join(", ")}. Fitting it would attribute a partner's effect to it.` };
  }
  if (identifiability === "UNSUPPORTED_BY_TARGET_DATA" || support === "UNSUPPORTED") {
    return { readiness: "DEFAULT_FROZEN_PENDING_EXTERNAL_DATA",
      reason: "Measurable, but no authorized target can judge which direction is better. Awaiting external data or legal clearance." };
  }
  if (support === "STRUCTURAL_VALIDATION_ONLY") {
    return { readiness: "STRUCTURAL_CALIBRATION_ONLY",
      reason: "Only structural checks apply — invariants, monotonicity, bounds. There is no value to fit it to." };
  }
  if (identifiability === "IDENTIFIABLE" && support === "HISTORICAL_NUMERIC_SUPPORT") {
    return { readiness: "FREE_CALIBRATION",
      reason: "Identifiable, distinct, practically meaningful, and judged against authorized historical numeric targets." };
  }
  if (identifiability === "IDENTIFIABLE" || identifiability === "WEAKLY_IDENTIFIABLE") {
    return { readiness: "STRONGLY_REGULARIZED_CALIBRATION",
      reason: support === "HISTORICAL_NUMERIC_SUPPORT"
        ? "Historically supported but only weakly identifiable. Small, heavily penalised movement only."
        : "Measurable and supported by synthetic control rather than history. Fitting the engine to itself, so movement is capped and penalised." };
  }
  return { readiness: "STRUCTURAL_CALIBRATION_ONLY", reason: `Unrecognised identifiability class "${identifiability}".` };
};

/**
 * Safety clamps. A parameter whose consumer runs but whose clamp never binds is
 * a guard rail against inputs the corpus does not contain — a different finding
 * from a dead knob, and not a calibration target either way.
 */
export const SAFETY_CLAMPS = Object.freeze({
  "era.paceBoundFraction": "Bounds realized pace around the era anchor. Measured unclamped pace lands at 96-98 inside an 82-109 band, so no coach tempo in the pool approaches it.",
  "era.threeAnchorMax": "Upper clamp on the three-point odds-ratio anchor. Measured ratios run 1.1-2.1 against a clamp at 12; even perturbed to 5 it does not engage.",
});

export const buildReadiness = () => {
  if (!existsSync(IDV2)) throw new Error("run `npm run calibration:identifiability` first — readiness is derived from measured identifiability, not asserted");
  const idv2 = JSON.parse(readFileSync(IDV2, "utf8"));
  const support = JSON.parse(readFileSync(SUPPORT, "utf8"));
  const idById = new Map(idv2.parameters.map((p) => [p.id, p]));
  const supById = new Map(support.parameters.map((p) => [p.id, p.support]));

  const active = activeParameters();
  const rows = active.map((p) => {
    const i = idById.get(p.id);
    if (!i) throw new Error(`${p.id} has no identifiability v2 result — readiness cannot be asserted for it`);
    const s = supById.get(p.id) ?? "UNSUPPORTED";
    const clamp = SAFETY_CLAMPS[p.id];
    const r = readinessOf({
      identifiability: i.category, support: s,
      confoundedWith: i.confoundedWith ?? [], safetyClamp: Boolean(clamp),
    });
    const cap = MOVEMENT_CAP[r.readiness];
    return {
      id: p.id, module: p.module,
      defaultValue: p.defaultValue, min: p.min, max: p.max,
      identifiability: i.category,
      bestPrimaryMetric: i.bestPrimaryMetric,
      bestPooledT: i.bestPooledT,
      directionConsistency: i.directionConsistency,
      guardrailBreaches: i.guardrailBreaches ?? [],
      support: s,
      confoundedWith: i.confoundedWith ?? [],
      safetyClampNote: clamp ?? null,
      readiness: r.readiness,
      readinessReason: r.reason,
      movementCapFractionOfRange: cap,
      // The concrete window a search may explore. Zero-width when frozen.
      searchBounds: cap > 0
        ? { lo: Math.max(p.min, p.defaultValue - (p.max - p.min) * cap), hi: Math.min(p.max, p.defaultValue + (p.max - p.min) * cap) }
        : { lo: p.defaultValue, hi: p.defaultValue },
      eligibleForSearch: cap > 0,
    };
  });

  const counts = {};
  for (const k of Object.keys(READINESS_CLASSES)) counts[k] = 0;
  for (const r of rows) counts[r.readiness] += 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Every parameter in exactly one class. Both halves are checked: the sum, and
  // that no parameter carries an unrecognised class.
  const reconciles = total === active.length;
  const unknownClasses = rows.filter((r) => !(r.readiness in READINESS_CLASSES)).map((r) => r.id);

  return {
    calibrationReadinessVersion: versionOf("calibrationReadinessVersion"),
    parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
    identifiabilityPolicyHash: idv2.identifiabilityPolicyHash,
    purpose: "Exactly one calibration-eligibility class per active parameter, derived from measured identifiability and support. Phase 6C2C3 asserted these counts in prose without computing them; they summed to 59 against 53 parameters.",
    classes: READINESS_CLASSES,
    movementCaps: MOVEMENT_CAP,
    activeParameterCount: active.length,
    counts,
    reconciliation: {
      sumOfClasses: total,
      activeParameterCount: active.length,
      reconciles,
      unknownClasses,
      eligibleForSearch: rows.filter((r) => r.eligibleForSearch).length,
      frozen: rows.filter((r) => !r.eligibleForSearch).length,
    },
    nonActiveEntries: PARAMETERS.filter((p) => p.registryClass !== "ACTIVE_RUNTIME_TUNABLE")
      .map((p) => ({ id: p.id, registryClass: p.registryClass })),
    parameters: rows,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = buildReadiness();
  r.readinessHash = createHash("sha256").update(JSON.stringify(r.parameters.map((x) => [x.id, x.readiness, x.searchBounds]))).digest("hex");
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(READINESS_PATH, JSON.stringify(r, null, 2) + "\n");

  console.log(`CALIBRATION READINESS — ${r.activeParameterCount} active parameters\n`);
  for (const [k, v] of Object.entries(r.counts)) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`  ${"---".padStart(3)}`);
  console.log(`  ${String(r.reconciliation.sumOfClasses).padStart(3)}  TOTAL   (active ${r.activeParameterCount})`);
  console.log(`\n  reconciles: ${r.reconciliation.reconciles ? "YES" : "NO"}`);
  console.log(`  eligible for search: ${r.reconciliation.eligibleForSearch}   frozen: ${r.reconciliation.frozen}`);

  const free = r.parameters.filter((x) => x.readiness === "FREE_CALIBRATION");
  const reg = r.parameters.filter((x) => x.readiness === "STRONGLY_REGULARIZED_CALIBRATION");
  console.log(`\n  FREE_CALIBRATION (${free.length}):`);
  for (const x of free) console.log(`    ${x.id.padEnd(42)} t ${x.bestPooledT} on ${x.bestPrimaryMetric}  bounds ${x.searchBounds.lo}..${x.searchBounds.hi}`);
  console.log(`\n  STRONGLY_REGULARIZED_CALIBRATION (${reg.length}):`);
  for (const x of reg.slice(0, 14)) console.log(`    ${x.id.padEnd(42)} t ${String(x.bestPooledT).padStart(9)} on ${String(x.bestPrimaryMetric).padEnd(16)} ${x.support}`);
  if (reg.length > 14) console.log(`    ... and ${reg.length - 14} more`);

  console.log(`\n  hash ${r.readinessHash.slice(0, 16)}`);
  console.log(`\nwrote ${READINESS_PATH}`);

  if (!r.reconciliation.reconciles || r.reconciliation.unknownClasses.length) {
    console.error(`\nRECONCILIATION FAILED: classes sum to ${r.reconciliation.sumOfClasses}, active count is ${r.activeParameterCount}`);
    if (r.reconciliation.unknownClasses.length) console.error(`unknown classes on: ${r.reconciliation.unknownClasses.join(", ")}`);
    process.exit(2);
  }
}
