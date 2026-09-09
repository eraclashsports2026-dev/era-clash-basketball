// ── Runtime parameter set ───────────────────────────────────────────────────
// Compiles the calibration registry into one immutable object that the engine
// reads its coefficients from.
//
// Before this existed, the registry and the engine held two independent copies
// of every coefficient: `SATURATION.strength = 1.35` frozen inside an action
// file, and `opportunity.saturation.strength` declared separately in the
// registry with the same 1.35 and no connection between them. Phase 6C2C2 proved
// the consequence — every parameter pushed to its maximum, the parameter-set
// hash changed, and five seeded games returned byte-identical scores.
//
// Three properties matter more than convenience here:
//
//   1. IMMUTABLE. A compiled set is deep-frozen. A candidate cannot be edited
//      after the hash that identifies it was computed.
//   2. NO GLOBAL STATE. The set travels with the simulation. Two candidate sets
//      can run in the same process without touching each other, because neither
//      is stored anywhere shared.
//   3. VALIDATED AT THE BOUNDARY. An unknown id, a missing active parameter, an
//      out-of-bound value, a NaN — each is rejected at compile time, where the
//      caller can still be told what it did wrong.
import { createHash } from "node:crypto";
import { PARAMETERS, parameter } from "./parameters.js";
import { versionOf } from "../../versions.js";

export const RUNTIME_PARAMETER_BINDING_VERSION = versionOf("runtimeParameterBindingVersion");

/**
 * Registry classification. Only ACTIVE_RUNTIME_TUNABLE entries are compiled
 * into the runtime set; the others are recorded so that an entry's absence from
 * the engine is a documented decision rather than an oversight.
 */
export const REGISTRY_CLASS = Object.freeze({
  ACTIVE_RUNTIME_TUNABLE: "A bounded coefficient the development engine actually reads.",
  FIXED_BASKETBALL_RULE: "A rule or invariant. Not open to statistical tuning.",
  DERIVED_PARAMETER: "Computed from other inputs; not independently tunable.",
  REPORTING_ONLY: "Diagnostics or display. Never shapes an outcome.",
  RESERVED_FUTURE: "Belongs to a mechanic that does not exist yet.",
  DUPLICATE_ENTRY: "The same runtime mechanism as another entry.",
  INVALID_OR_AMBIGUOUS: "No clear basketball or runtime meaning.",
});

export class ParameterSetError extends Error {
  constructor(message, detail) { super(message); this.name = "ParameterSetError"; this.detail = detail; }
}

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Canonical id ordering. The hash must not depend on the order overrides were
 * supplied in, or the same candidate set would produce two different cache keys
 * depending on how it was written.
 */
const canonicalEntries = (values) => Object.keys(values).sort().map((k) => [k, values[k]]);

export const hashValues = (values, { registryVersion, bindingVersion }) =>
  createHash("sha256").update(JSON.stringify({
    registryVersion, bindingVersion, values: canonicalEntries(values),
  })).digest("hex");

/**
 * Nested accessor tree built once at compile time.
 *
 * The possession loop runs thousands of times per game, so it must not do string
 * splitting or Map lookups to read a coefficient. `set.get.opportunity.saturation.strength`
 * is a plain property read on a frozen object — the same cost as the module
 * constant it replaced.
 */
const buildAccessTree = (values) => {
  const root = {};
  for (const [id, value] of Object.entries(values)) {
    const parts = id.split(".");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] ?? {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  const deepFreeze = (o) => {
    for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
    return Object.freeze(o);
  };
  return deepFreeze(root);
};

/** The active parameters, i.e. those the engine is expected to read. */
export const activeParameters = (registry = PARAMETERS) =>
  registry.filter((p) => (p.registryClass ?? "ACTIVE_RUNTIME_TUNABLE") === "ACTIVE_RUNTIME_TUNABLE");

/**
 * Compile a runtime parameter set.
 *
 * Rejects rather than coerces. A silently-coerced parameter is worse than a
 * thrown one: the run continues, the hash records a value nobody chose, and the
 * result is attributed to a calibration that never existed.
 */
export const compileRuntimeParameterSet = ({
  registry = PARAMETERS,
  overrides = {},
  registryVersion = versionOf("calibrationParameterRegistryVersion"),
  bindingVersion = RUNTIME_PARAMETER_BINDING_VERSION,
  label = null,
} = {}) => {
  const active = activeParameters(registry);
  const byId = new Map(active.map((p) => [p.id, p]));

  const unknown = Object.keys(overrides).filter((id) => !byId.has(id));
  if (unknown.length) {
    throw new ParameterSetError(
      `unknown parameter id(s): ${unknown.join(", ")}`,
      { unknown, hint: "An id absent from the active registry cannot reach the engine. Check for a typo, or for an entry that was reclassified out of ACTIVE_RUNTIME_TUNABLE." });
  }

  const values = {};
  const problems = [];
  const overridden = [];
  for (const p of active) {
    // Defaults come from the registry's declared default, never from a module
    // constant — that duplication is what this file removes.
    const supplied = Object.prototype.hasOwnProperty.call(overrides, p.id);
    const v = supplied ? overrides[p.id] : p.defaultValue;

    if (!isFiniteNumber(v)) {
      problems.push({ id: p.id, value: v, reason: v === undefined ? "missing" : "not a finite number" });
      continue;
    }
    if (v < p.min || v > p.max) {
      problems.push({ id: p.id, value: v, reason: `outside declared bounds [${p.min}, ${p.max}]` });
      continue;
    }
    values[p.id] = v;
    if (supplied && v !== p.defaultValue) overridden.push({ id: p.id, from: p.defaultValue, to: v });
  }

  if (problems.length) {
    throw new ParameterSetError(
      `${problems.length} invalid parameter value(s): ${problems.map((x) => `${x.id} (${x.reason})`).join("; ")}`,
      { problems });
  }
  const missing = active.filter((p) => !(p.id in values)).map((p) => p.id);
  if (missing.length) throw new ParameterSetError(`missing active parameter(s): ${missing.join(", ")}`, { missing });

  const parameterSetHash = hashValues(values, { registryVersion, bindingVersion });

  return Object.freeze({
    registryVersion,
    runtimeParameterBindingVersion: bindingVersion,
    // Truthful about what this is. Defaults are not a calibration.
    status: overridden.length ? "CANDIDATE_OVERRIDES" : "UNCALIBRATED_DEFAULTS",
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    label,
    parameterCount: active.length,
    values: Object.freeze({ ...values }),
    get: buildAccessTree(values),
    overriddenFromDefault: Object.freeze(overridden),
    parameterSetHash,
  });
};

/**
 * The default set, compiled once. Safe to share because it is deep-frozen and
 * nothing can mutate it — the point of freezing rather than copying.
 */
let cachedDefault = null;
export const defaultRuntimeParameterSet = () => (cachedDefault ??= compileRuntimeParameterSet({ label: "default" }));

/** Test hook. Only needed when the registry itself is restructured. */
export const clearDefaultCache = () => { cachedDefault = null; };

/**
 * Resolve whatever a caller supplied into a valid compiled set.
 *
 * Accepts a compiled set, an overrides object, or nothing. Returning the shared
 * default for `null` is what lets every call site read parameters without every
 * call site having to know about them.
 */
export const resolveParameterSet = (input) => {
  if (input == null) return defaultRuntimeParameterSet();
  if (input.parameterSetHash && input.get) return input;
  if (typeof input === "object") return compileRuntimeParameterSet({ overrides: input });
  throw new ParameterSetError("parameterSet must be a compiled set, an overrides object, or null", { got: typeof input });
};

// ── Consumption trace ───────────────────────────────────────────────────────
// Development-only evidence that a parameter is actually read at runtime.
// Phase 6C2C2's whole problem was a registry nobody consumed; a static import
// check can be satisfied by an unreachable branch, so connectivity needs to be
// observed rather than inferred.
//
// Disabled by default and costs one boolean check when off, because it sits in
// the possession loop.
let trace = null;

export const startParameterTrace = () => { trace = new Map(); return trace; };
export const stopParameterTrace = () => { const t = trace; trace = null; return t; };
export const traceEnabled = () => trace !== null;

/** Records one read. Consumers call this only in traced runs. */
export const noteParameterRead = (id, value) => {
  if (trace === null) return;
  const e = trace.get(id);
  if (e) { e.count += 1; e.lastValue = value; }
  else trace.set(id, { count: 1, lastValue: value });
};

export const traceReport = (t = trace) => {
  if (!t) return { enabled: false, parameters: [] };
  return {
    enabled: true,
    parameters: [...t.entries()].map(([id, e]) => ({ id, invocations: e.count, lastValue: e.lastValue }))
      .sort((a, b) => b.invocations - a.invocations),
  };
};
