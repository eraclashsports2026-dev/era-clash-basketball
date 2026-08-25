#!/usr/bin/env node
// ── Era research runner (entry point only) ────────────────────────────────────
//   npm run research:eras
//
// The infrastructure is shared with coach research and is ready to use. The era
// SOURCE MANIFEST is deliberately empty: Era Style Intelligence is Phase 5, and
// populating era profiles now would mean inventing them. This command reports
// that honestly rather than producing fabricated era data that later work would
// have to unpick.
import { ensureCacheDirs, verificationReport, parseArgs } from "./lib.mjs";

/** Populate in Phase 5. Each entry mirrors the coach manifest shape. */
export const ERA_SOURCES = [];

export const runEraResearch = async ({ log = console.log } = {}) => {
  ensureCacheDirs();
  const report = verificationReport("eras");
  if (ERA_SOURCES.length === 0) {
    log("\nresearch:eras — infrastructure ready, manifest intentionally empty.");
    log("Era Style Intelligence is Phase 5. No era profiles are generated here,");
    log("because inventing them would be worse than not having them yet.\n");
  }
  return { sources: ERA_SOURCES.length, report };
};

if (import.meta.url === `file://${process.argv[1]}`) { parseArgs(); runEraResearch(); }
