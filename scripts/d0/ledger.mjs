#!/usr/bin/env node
// ── IDEA #101 resolution ledger ──────────────────────────────────────────────
//   npm run d0:ledger [-- --close=<issueId> --status=... ]  (updates come from scripts)
// The ledger is rebuilt by this script as issues resolve; every item must end
// FIXED_AND_VERIFIED, NOT_REPRODUCIBLE_WITH_EVIDENCE, or
// EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK.
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR } from "./paths.mjs";

export const LEDGER_PATH = `${DIR}/idea101-resolution-ledger.json`;
export const readLedger = () => JSON.parse(readFileSync(LEDGER_PATH, "utf8")).data;

export const SEED = [
  { issueId: "i01", description: "Historical V6 original FAIL needs a validity adjudication that does not rewrite the record", severity: "CRITICAL" },
  { issueId: "i02", description: "hard-coded calibration store imports in the runner profile map", severity: "CRITICAL" },
  { issueId: "i03", description: "v5/v6 stores omitted from the runner map — every V6 player fell back", severity: "CRITICAL" },
  { issueId: "i04", description: "manifest fallback used instead of full records when full records exist", severity: "CRITICAL" },
  { issueId: "i05", description: "profile adapter contract undefined; 12 of 18 inputs silently absent", severity: "CRITICAL" },
  { issueId: "i06", description: "NaN decade values on every V6 subject side", severity: "HIGH" },
  { issueId: "i07", description: "uniform hidden spacingGravity fallback (4.30) across all sixteen sides", severity: "HIGH" },
  { issueId: "i08", description: "subject/reference profile-path asymmetry", severity: "CRITICAL" },
  { issueId: "i09", description: "offensiveRoles empty across all 560 active calibration records", severity: "HIGH" },
  { issueId: "i10", description: "defensive evidence missing on most post-1974 records (e.g. a DPOY season rating near average)", severity: "HIGH" },
  { issueId: "i11", description: "runner preflight unable to detect an incomplete profile map before access", severity: "CRITICAL" },
  { issueId: "i12", description: "diagnostic cluster recorder read observed/reference — fields absent from the trait schema", severity: "MEDIUM" },
  { issueId: "i13", description: "movement under-expression (persistent V6 diagnostic)", severity: "HIGH" },
  { issueId: "i14", description: "assisted-offense under-expression (persistent V6 diagnostic)", severity: "HIGH" },
  { issueId: "i15", description: "defensive suppression under-expression (persistent V6 diagnostic)", severity: "HIGH" },
  { issueId: "i16", description: "post-up identity residual (Houston 2007-08 persistent diagnostic)", severity: "HIGH" },
  { issueId: "i17", description: "rebounding identity residual (Portland 1974-75 persistent diagnostic)", severity: "MEDIUM" },
  { issueId: "i18", description: "pace residual (Houston 2007-08 persistent diagnostic)", severity: "MEDIUM" },
  { issueId: "i19", description: "prior-phase artifacts that can overwrite themselves (frozen producers)", severity: "MEDIUM" },
  { issueId: "i20", description: "non-accessing commands that write output", severity: "MEDIUM" },
  { issueId: "i21", description: "stale tests that pin historical access counts at literal values", severity: "MEDIUM" },
  { issueId: "i22", description: "preview candidate/result identity requirements", severity: "HIGH" },
  { issueId: "i23", description: "preview cache/persistence isolation", severity: "HIGH" },
  { issueId: "i24", description: "production fallback requirements (engine 3.2.0 must remain the fallback)", severity: "HIGH" },
];

/** Apply resolution updates from a workstream script and rewrite the ledger. */
export const applyClosures = async (closures) => {
  const { writeArtifact: wa } = await import("../../src/v3/calibration/artifacts.js");
  const { defaultRuntimeParameterSet: dr } = await import("../../src/v3/calibration/runtimeParameters.js");
  const prior = readLedger();
  const items = prior.items.map((i) => {
    const c = closures.find((x) => x.issueId === i.issueId);
    return c ? { ...i, ...c } : i;
  });
  const open = items.filter((i) => !["FIXED_AND_VERIFIED", "NOT_REPRODUCIBLE_WITH_EVIDENCE",
    "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"].includes(i.resolutionStatus));
  wa("idea101-resolution-ledger", { ...prior, items,
    unresolvedTechnicalFailures: open.length, unresolvedIds: open.map((i) => i.issueId) },
    { generationCommand: "ledger applyClosures", dir: DIR, extra: { parameterSetHash: dr().parameterSetHash } });
  return { unresolved: open.length };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const prior = existsSync(LEDGER_PATH) ? readLedger() : null;
  const items = SEED.map((s) => {
    const p = prior?.items?.find((x) => x.issueId === s.issueId);
    return p ?? { ...s, rootCause: null, files: [], resolutionStatus: "OPEN",
      implementedFix: null, verification: null, regressionTests: [], remainingRisk: null, externalDependency: null };
  });
  const open = items.filter((i) => !["FIXED_AND_VERIFIED", "NOT_REPRODUCIBLE_WITH_EVIDENCE",
    "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"].includes(i.resolutionStatus));
  writeArtifact("idea101-resolution-ledger", {
    idea101ResolutionLedgerVersion: "1.0.0",
    motto: "a discovered problem is not a completed deliverable",
    items, itemCount: items.length,
    unresolvedTechnicalFailures: open.length,
    unresolvedIds: open.map((i) => i.issueId),
  }, { generationCommand: "npm run d0:ledger", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`LEDGER: ${items.length} items · unresolved ${open.length} (${open.map((i) => i.issueId).join(", ")})`);
}
