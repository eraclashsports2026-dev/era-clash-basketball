#!/usr/bin/env node
// ── The exact runner profile map ─────────────────────────────────────────────
// TWO defects share this file's history. The V4 runner crashed after consuming
// its unlock because this map omitted the v3 store — fixed by making one
// function the only sanctioned constructor. Then Historical V6 was adjudicated
// INVALID because that one function still hard-coded v3+v4 while every V6
// player lived in v5/v6: all 80 fell back to 13-field manifest rows, and the
// subjects were measured against references built from complete records.
//
// The permanent fix is that this file no longer knows what stores exist. It
// loads THROUGH the versioned registry (scripts/validation/storeRegistry.mjs);
// a future store is added by registering it, never by editing this file.
import { loadRegisteredProfiles } from "./storeRegistry.mjs";
import { loadReferences } from "./eraReferences.mjs";

/** Build the exact profile map every historical validation resolves players
 *  through: EVERY registered calibration store, enrichment applied, keyed by
 *  calibrationPlayerId. Still the ONLY sanctioned constructor. */
export const buildRunnerProfileMap = async () => {
  const { profiles } = loadRegisteredProfiles();
  return profiles;
};

/** Registry metadata for preflights that need to bind store hashes. */
export const runnerProfileMapProvenance = async () => {
  const { loaded, registryHash, enrichmentApplied } = loadRegisteredProfiles();
  return { loaded, registryHash, enrichmentApplied };
};

/** Every profile id a run over `fixtures` will dereference. */
export const requiredProfileIds = (fixtures) => {
  const ids = new Set();
  for (const f of fixtures) for (const p of f.players) ids.add(p.calibrationPlayerId);
  for (const r of loadReferences().data.references) for (const p of r.five) ids.add(p.id);
  return ids;
};

/** The runner preflight: resolve every required id through the exact map. */
export const preflightProfileResolution = async (fixtures) => {
  const map = await buildRunnerProfileMap();
  const required = requiredProfileIds(fixtures);
  const missing = [...required].filter((id) => !map.has(id));
  return { pass: missing.length === 0, required: required.size, resolved: required.size - missing.length, missing };
};
