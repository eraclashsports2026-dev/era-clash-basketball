// ── Measurement artifact governance ─────────────────────────────────────────
// Every quantitative claim in Phase 6C2C5 originates from a machine-readable
// artifact written by the command that measured it, and every rendered number
// is read back from that artifact.
//
// This exists because of a specific, repeated failure. Across Phases 6C2C3 and
// 6C2C4 I published category totals that were typed into prose rather than
// computed: a readiness table whose six counts summed to 59 against 53
// parameters, then a report quoting four of them summing to 44. No code produced
// any of them. Four further measurement bugs in 6C2C4 each produced a
// plausible-looking wrong number that only a targeted check exposed.
//
// A renderer that can only read artifacts cannot invent a total. That is the
// point: this is a structural fix, not a resolution to be more careful.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { versionOf } from "../../versions.js";

export const ARTIFACT_SCHEMA_VERSION = versionOf("calibrationReportArtifactSchemaVersion");
export const RENDERER_VERSION = versionOf("calibrationReportRendererVersion");
export const GOVERNANCE_VERSION = versionOf("measurementGovernanceVersion");

export const ARTIFACT_DIR = "data/calibration/c5";

// Phase 6C2C6 writes to its own directory. The c5 artifacts are evidence of what
// c5 measured and must not be overwritten by a later phase that reaches a
// different conclusion — the point of content-addressed artifacts is that the
// earlier record survives.
export const ARTIFACT_DIR_C6 = "data/calibration/c6";

// Phase 6C3 is formal VALIDATION rather than calibration, and its artifacts are
// the evidence a holdout verdict rests on. Separate directory so a calibration
// command can never overwrite a validation record.
export const ARTIFACT_DIR_6C3 = "data/validation/6c3";

/** Required provenance on every artifact. A number with no provenance is a rumour. */
export const REQUIRED_PROVENANCE = Object.freeze([
  "schemaVersion", "generationCommand", "generatedAt", "gitCommit", "branch",
  "parameterSetHash", "registryVersion", "bindingVersion", "outputHash",
]);

const git = (...args) => {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
  catch { return null; }
};

/** Stable hash of a payload, excluding volatile provenance fields. */
export const payloadHash = (payload) => {
  const { generatedAt, outputHash, ...stable } = payload;
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
};

/**
 * Wrap measured data in provenance and write it.
 *
 * `generatedAt` is deliberately excluded from `outputHash`, so re-running a
 * deterministic measurement produces an identical hash. A hash that changed on
 * every run could not detect drift, which is the only thing it is for.
 */
export const writeArtifact = (name, data, { generationCommand, sourceArtifacts = [], extra = {}, dir = ARTIFACT_DIR } = {}) => {
  if (!generationCommand) throw new Error(`writeArtifact(${name}): generationCommand is required`);
  const parameterSetHash = extra.parameterSetHash ?? null;
  const payload = {
    artifact: name,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    measurementGovernanceVersion: GOVERNANCE_VERSION,
    generationCommand,
    generatedAt: new Date().toISOString(),
    gitCommit: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    parameterSetHash,
    registryVersion: versionOf("calibrationParameterRegistryVersion"),
    bindingVersion: versionOf("runtimeParameterBindingVersion"),
    sourceArtifactHashes: Object.fromEntries(sourceArtifacts.map((p) => [p, existsSync(p) ? sha256File(p) : null])),
    ...extra,
    data,
  };
  payload.outputHash = payloadHash(payload);

  const path = `${dir}/${name}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { path, payload };
};

export const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

export const readArtifact = (name, dir = ARTIFACT_DIR) => {
  const path = `${dir}/${name}.json`;
  if (!existsSync(path)) throw new Error(`artifact "${name}" has not been generated — run its command first`);
  return JSON.parse(readFileSync(path, "utf8"));
};

export const artifactExists = (name, dir = ARTIFACT_DIR) => existsSync(`${dir}/${name}.json`);

/** Provenance completeness and hash integrity, checked rather than assumed. */
export const verifyArtifact = (name, dir = ARTIFACT_DIR) => {
  const a = readArtifact(name, dir);
  const missing = REQUIRED_PROVENANCE.filter((k) => a[k] === undefined);
  const recomputed = payloadHash(a);
  return {
    artifact: name,
    missingProvenance: missing,
    hashMatches: recomputed === a.outputHash,
    recordedHash: a.outputHash,
    recomputedHash: recomputed,
    valid: missing.length === 0 && recomputed === a.outputHash,
  };
};

// ── Reconciliation ──────────────────────────────────────────────────────────
/**
 * A category tally that must cover a known population exactly once.
 *
 * Returns the discrepancy rather than throwing, so a renderer can report
 * REPORT_GENERATION_FAILED with the specific defect instead of a stack trace.
 */
export const reconcile = ({ label, counts, expectedTotal, members = null, population = null }) => {
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  const problems = [];
  if (sum !== expectedTotal) problems.push(`${label}: counts sum to ${sum}, expected ${expectedTotal}`);
  if (members && population) {
    const seen = new Map();
    for (const [cls, ids] of Object.entries(members)) {
      for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), cls]);
    }
    for (const id of population) {
      const cls = seen.get(id);
      if (!cls) problems.push(`${label}: ${id} appears in no class`);
      else if (cls.length > 1) problems.push(`${label}: ${id} appears in ${cls.length} classes (${cls.join(", ")})`);
    }
    for (const id of seen.keys()) {
      if (!population.includes(id)) problems.push(`${label}: ${id} is classified but not in the population`);
    }
  }
  return { label, sum, expectedTotal, reconciles: problems.length === 0, problems };
};

/**
 * Format a number for a rendered table.
 *
 * The renderer is allowed to FORMAT and nothing else. It may not sum, average,
 * count or derive — those belong in the measuring command, where the inputs are
 * present and the result gets a hash. A renderer that computes is a renderer
 * that can disagree with its own artifact.
 */
export const fmt = (x, dp = 4) => {
  if (x === null || x === undefined) return "—";
  if (typeof x === "boolean") return x ? "yes" : "no";
  if (typeof x !== "number") return String(x);
  if (!Number.isFinite(x)) return String(x);
  return Number.isInteger(x) ? String(x) : x.toFixed(dp).replace(/\.?0+$/, "");
};

/** Renders a counts object as a markdown table, totals included, from data only. */
export const countsTable = (counts, { header = "Class", totalLabel = "TOTAL" } = {}) => {
  const rows = Object.entries(counts).map(([k, v]) => `| \`${k}\` | ${fmt(v)} |`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return [`| ${header} | Count |`, "|---|---|", ...rows, `| **${totalLabel}** | **${fmt(total)}** |`].join("\n");
};
