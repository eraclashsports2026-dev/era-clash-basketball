#!/usr/bin/env node
// ── The exact runner profile map ─────────────────────────────────────────────
// The V4 runner crashed AFTER consuming its unlock because its profile map
// omitted the v3 store the era-reference fives live in — and the dry run never
// caught it because it preflighted a SIMPLIFIED map (V4 store only). Both
// defects have the same fix: one function builds the map, and both the runner
// and every preflight use it. A preflight that resolves a different map than
// the run proves nothing.
import { loadPlayersV4 } from "./buildPlayersV4.mjs";
import { loadReferences } from "./eraReferences.mjs";

/** Build the exact profile map a sealed-set run resolves players through:
 *  v3 store (era-reference fives) + V4 store (holdout teams), keyed by
 *  calibrationPlayerId. This is the ONLY sanctioned constructor. */
export const buildRunnerProfileMap = async () => {
  const { loadPlayers } = await import("../calibration/build-players-v3.mjs");
  const v3store = loadPlayers();
  const v4store = loadPlayersV4();
  return new Map([...v3store.profiles, ...v4store.profiles].map((p) => [p.calibrationPlayerId, p]));
};

/** Every profile id a run over `fixtures` will dereference: each fixture's
 *  five plus every era-reference five member. Preflight must resolve ALL of
 *  these through buildRunnerProfileMap() before any unlock is consumed. */
export const requiredProfileIds = (fixtures) => {
  const ids = new Set();
  for (const f of fixtures) for (const p of f.players) ids.add(p.calibrationPlayerId);
  for (const r of loadReferences().data.references) for (const p of r.five) ids.add(p.id);
  return ids;
};

/** The runner preflight: resolve every required id through the exact map.
 *  Returns { pass, required, resolved, missing } — refuse the run if !pass. */
export const preflightProfileResolution = async (fixtures) => {
  const map = await buildRunnerProfileMap();
  const required = requiredProfileIds(fixtures);
  const missing = [...required].filter((id) => !map.has(id));
  return { pass: missing.length === 0, required: required.size, resolved: required.size - missing.length, missing };
};
