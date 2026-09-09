#!/usr/bin/env node
// ── Calibration support matrix ──────────────────────────────────────────────
// For every registered parameter: is there any authorized target that could
// judge whether a change to it is an improvement?
//
// This is a question about DATA, asked before any question about sensitivity. A
// parameter can move the engine measurably and still be untunable, because
// nothing authorized exists to say which direction is better. Tuning it would be
// choosing a number and calling the choice calibration.
//
//   npm run calibration:support-matrix
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { PARAMETERS, FIXED_NOT_CALIBRATABLE } from "../../src/v3/calibration/parameters.js";
import { activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../../src/versions.js";

export const SUPPORT_PATH = "data/calibration/calibration-support-matrix.json";
const TIER_B = "data/calibration/historical-targets-tier-b.json";
const TARGETS_V3 = "data/calibration/historical-targets-v3.json";

export const SUPPORT_CLASSES = Object.freeze({
  HISTORICAL_NUMERIC_SUPPORT: "An authorized numeric historical target exists and is populated.",
  HISTORICAL_QUALITATIVE_SUPPORT: "Only documented qualitative identity exists — direction, not magnitude.",
  SYNTHETIC_CONTROL_SUPPORT: "No historical target, but a controlled synthetic comparison can bound it.",
  STRUCTURAL_VALIDATION_ONLY: "Can only be checked for structural sanity (invariants, monotonicity), not fitted.",
  UNSUPPORTED: "Moves the engine, but nothing authorized can judge which direction is better.",
});

/**
 * The registry already declares a `calibrationSource` per parameter, so
 * classification reads THAT rather than inferring from target-metric names. An
 * earlier draft of this file guessed the metric vocabulary and mis-bucketed 47
 * of 53 parameters — the registry's own declaration is authoritative and the
 * guess was not.
 */
export const DECLARED_SOURCE_SUPPORT = Object.freeze({
  "HISTORICAL_TIER_C + SYNTHETIC_GUARDRAIL": {
    support: "HISTORICAL_NUMERIC_SUPPORT",
    requires: "tierC",
    reason: "Judged against Tier C player-share targets (132 share maps across 30 fixtures) plus synthetic guardrails. Distributional support, not team efficiency.",
  },
  SYNTHETIC_GUARDRAIL: {
    support: "SYNTHETIC_CONTROL_SUPPORT",
    requires: "synthetic",
    reason: "No historical target. Bounded by controlled comparison on synthetic development v2, which development may inspect.",
  },
  ERA_ENVIRONMENT: {
    support: "UNSUPPORTED",
    requires: "eraEnvironmentAuthorized",
    // The Era Style environment values (pace, fgPct, tpaPerGame, tpPct,
    // ftaPerGame, astPerGame, tovPerGame, orebPct for all eight eras) cite
    // "Basketball Reference league index" in src/v3/data/eras.js. Under the
    // standing source policy those targets cannot judge a calibration, so a
    // parameter whose only judge is the era environment has no usable target.
    reason: "Judged against Era Style environment values whose recorded source is the publisher classified PROHIBITED_FOR_MODEL_CALIBRATION. The target exists but may not be used to calibrate. This predates Phase 6C2C2 and is live production data — see independent-source-verification.md.",
    blockedBySource: true,
  },
  STRUCTURAL: {
    support: "STRUCTURAL_VALIDATION_ONLY",
    requires: null,
    reason: "Checkable only for structural sanity — invariants, monotonicity, bounds — never fitted to a value.",
  },
});

export const buildMatrix = () => {
  // Which Tier B metrics are actually populated anywhere in the corpus.
  const populatedTierB = new Set();
  if (existsSync(TIER_B)) {
    const tb = JSON.parse(readFileSync(TIER_B, "utf8"));
    for (const r of tb.records) {
      for (const [m, f] of Object.entries(r.tierB)) {
        if (f.availability === "RECORDED_STATISTIC" && f.value !== null) populatedTierB.add(m);
      }
    }
  }
  let tierCPresent = false, tierDPresent = false;
  if (existsSync(TARGETS_V3)) {
    const t = JSON.parse(readFileSync(TARGETS_V3, "utf8"));
    tierCPresent = t.records.some((r) => Object.keys(r.unitTargets ?? {}).some((k) => k.startsWith("player")));
    tierDPresent = t.records.some((r) => (r.identityTargets ?? []).length > 0);
  }
  // The era environment is authorized only if its recorded sources are.
  const eraEnvironmentAuthorized = false;

  const have = { tierC: tierCPresent, tierD: tierDPresent, synthetic: true, eraEnvironmentAuthorized };

  // Only ACTIVE_RUNTIME_TUNABLE entries can be calibrated, so only they are
  // classified for support. Derived entries are reported separately rather than
  // being given a support class they cannot use.
  const rows = activeParameters().map((p) => {
    const declared = p.calibrationSource ?? "STRUCTURAL";
    const spec = DECLARED_SOURCE_SUPPORT[declared] ?? {
      support: "STRUCTURAL_VALIDATION_ONLY", requires: null,
      reason: `Unrecognised declared calibration source "${declared}".`,
    };
    // A declared source only counts if the evidence it names actually exists.
    const evidenceAvailable = spec.requires == null ? true : Boolean(have[spec.requires]);
    const support = evidenceAvailable ? spec.support : "UNSUPPORTED";
    const reason = evidenceAvailable ? spec.reason
      : `${spec.reason} The evidence it requires (${spec.requires}) is not available.`;
    return {
      id: p.id, module: p.module, defaultValue: p.defaultValue, min: p.min, max: p.max,
      targetMetrics: p.targetMetrics ?? [],
      declaredCalibrationSource: declared,
      support, reason,
      blockedBySource: Boolean(spec.blockedBySource),
      // Only numeric or synthetic-control support permits fitting. Everything
      // else stays at its default until data that could judge it exists.
      tunableOnDataGrounds: support === "HISTORICAL_NUMERIC_SUPPORT" || support === "SYNTHETIC_CONTROL_SUPPORT",
    };
  });

  const byClass = {}, byModule = {}, byDeclared = {};
  for (const r of rows) {
    byClass[r.support] = (byClass[r.support] ?? 0) + 1;
    byDeclared[r.declaredCalibrationSource] = (byDeclared[r.declaredCalibrationSource] ?? 0) + 1;
    byModule[r.module] = byModule[r.module] ?? {};
    byModule[r.module][r.support] = (byModule[r.module][r.support] ?? 0) + 1;
  }

  return {
    parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
    tierBTargetDataVersion: versionOf("tierBTargetDataVersion"),
    purpose: "Whether any authorized target exists that could judge a change to each parameter. A data question, asked before any sensitivity question.",
    supportClasses: SUPPORT_CLASSES,
    corpusEvidence: {
      populatedTierBMetrics: [...populatedTierB], tierCPresent, tierDPresent,
      eraEnvironmentAuthorized,
      eraEnvironmentNote: "src/v3/data/eras.js records its environment values as sourced from 'Basketball Reference league index'. Under the standing source policy those values cannot be used as calibration targets. This is pre-existing production data and was not introduced by Phase 6C2C2.",
    },
    coverage: { parameters: rows.length, byClass, byModule, byDeclaredSource: byDeclared,
      tunableOnDataGrounds: rows.filter((r) => r.tunableOnDataGrounds).length,
      frozenOnDataGrounds: rows.filter((r) => !r.tunableOnDataGrounds).length,
      blockedBySource: rows.filter((r) => r.blockedBySource).length },
    fixedNotCalibratable: FIXED_NOT_CALIBRATABLE,
    nonActiveEntries: PARAMETERS.filter((p) => p.registryClass !== "ACTIVE_RUNTIME_TUNABLE")
      .map((p) => ({ id: p.id, registryClass: p.registryClass, classNote: p.classNote })),
    parameters: rows,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = buildMatrix();
  m.matrixHash = createHash("sha256").update(JSON.stringify(m.parameters)).digest("hex");
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(SUPPORT_PATH, JSON.stringify(m, null, 2) + "\n");

  console.log(`CALIBRATION SUPPORT MATRIX — ${m.coverage.parameters} registered parameters\n`);
  console.log(`  populated Tier B metrics in the whole corpus: ${m.corpusEvidence.populatedTierBMetrics.join(", ") || "(none)"}`);
  console.log(`  Tier C player shares present: ${m.corpusEvidence.tierCPresent}   Tier D identity present: ${m.corpusEvidence.tierDPresent}\n`);
  for (const [k, v] of Object.entries(m.coverage.byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
  }
  console.log(`\n  tunable on data grounds  ${m.coverage.tunableOnDataGrounds}`);
  console.log(`  frozen on data grounds   ${m.coverage.frozenOnDataGrounds}`);
  console.log(`\n  by module:`);
  for (const [mod, classes] of Object.entries(m.coverage.byModule)) {
    console.log(`    ${mod.padEnd(20)} ${Object.entries(classes).map(([k, v]) => `${v} ${k.replace(/_/g, " ").toLowerCase()}`).join(" | ")}`);
  }
  const unsupported = m.parameters.filter((p) => p.support === "UNSUPPORTED");
  if (unsupported.length) {
    console.log(`\n  UNSUPPORTED (${unsupported.length}) — must remain at defaults:`);
    for (const p of unsupported) console.log(`    ${p.id.padEnd(44)} ${p.reason.slice(0, 90)}`);
  }
  console.log(`\n  hash ${m.matrixHash.slice(0, 16)}`);
  console.log(`\nwrote ${SUPPORT_PATH}`);
}
