// ── Phase 6C5 resolution ledger ───────────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
export const DIR = "data/validation/6c5";
export const LEDGER_PATH = `${DIR}/phase6c5-resolution-ledger.json`;
export const readLedger = () => JSON.parse(readFileSync(LEDGER_PATH, "utf8")).data;

export const SEED = [
  { issueId: "p01", description: "preview package verification", severity: "HIGH" },
  { issueId: "p02", description: "deployment authorization (Vercel CLI unauthenticated; Git-integration previews active)", severity: "HIGH" },
  { issueId: "p03", description: "preview access restriction", severity: "HIGH" },
  { issueId: "p04", description: "preview environment isolation (env-scoped flag source)", severity: "HIGH" },
  { issueId: "p05", description: "Candidate 3 flag activation in preview only", severity: "HIGH" },
  { issueId: "p06", description: "production flag protection", severity: "HIGH" },
  { issueId: "p07", description: "result namespace isolation (deployed)", severity: "HIGH" },
  { issueId: "p08", description: "probability namespace isolation", severity: "MEDIUM" },
  { issueId: "p09", description: "narrative namespace isolation (deployed)", severity: "HIGH" },
  { issueId: "p10", description: "competition namespace isolation", severity: "MEDIUM" },
  { issueId: "p11", description: "Daily namespace isolation", severity: "MEDIUM" },
  { issueId: "p12", description: "Challenge namespace isolation", severity: "MEDIUM" },
  { issueId: "p13", description: "preview result-id prefix end-to-end (deployed)", severity: "HIGH" },
  { issueId: "p14", description: "candidate identity persistence (deployed)", severity: "HIGH" },
  { issueId: "p15", description: "deployed replay", severity: "HIGH" },
  { issueId: "p16", description: "deployed per-request fallback", severity: "HIGH" },
  { issueId: "p17", description: "emergency-off drill (deployed)", severity: "HIGH" },
  { issueId: "p18", description: "telemetry delivery (deployed, privacy-safe)", severity: "HIGH" },
  { issueId: "p19", description: "feedback submission end-to-end (deployed)", severity: "HIGH" },
  { issueId: "p20", description: "browser QA (deployed desktop)", severity: "HIGH" },
  { issueId: "p21", description: "mobile QA (deployed 375px)", severity: "HIGH" },
  { issueId: "p22", description: "deployed security checks", severity: "HIGH" },
  { issueId: "p23", description: "deployed soak", severity: "HIGH" },
  { issueId: "p24", description: "production health unchanged", severity: "HIGH" },
  { issueId: "p25", description: "preview health contract", severity: "MEDIUM" },
  { issueId: "p26", description: "operator documentation", severity: "MEDIUM" },
  { issueId: "p27", description: "tester documentation and scenario matrix", severity: "MEDIUM" },
  { issueId: "p28", description: "preview record shape mismatch: computeResultPreview did not fulfil the client postgame contract (record.core.*) — deployed preview would crash Postgame on flag enable", severity: "CRITICAL" },
  { issueId: "p29", description: "pv_ result ids unreadable: GET /api/game and /api/narrative rejected the preview id shape and read only production namespaces", severity: "CRITICAL" },
];

export const applyClosures = async (closures) => {
  const { writeArtifact } = await import("../../src/v3/calibration/artifacts.js");
  const prior = existsSync(LEDGER_PATH) ? readLedger() : { items: SEED };
  const items = prior.items.map((i) => {
    const c = closures.find((x) => x.issueId === i.issueId);
    return c ? { ...i, ...c } : i;
  });
  for (const c of closures) if (!items.some((i) => i.issueId === c.issueId)) items.push(c);
  const open = items.filter((i) => !["FIXED_AND_VERIFIED", "NOT_REPRODUCIBLE_WITH_EVIDENCE",
    "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"].includes(i.resolutionStatus));
  writeArtifact("phase6c5-resolution-ledger", { items,
    unresolvedTechnicalFailures: open.length, unresolvedIds: open.map((i) => i.issueId) },
    { generationCommand: "scripts/c5/ledger.mjs applyClosures", dir: DIR });
  return { unresolved: open.length, ids: open.map((i) => i.issueId) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await applyClosures([]);
  console.log(`ledger seeded: ${SEED.length} items, unresolved ${r.unresolved}`);
}
