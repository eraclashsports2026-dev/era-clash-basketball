#!/usr/bin/env node
// ── WS2: build the versioned store registry and audit it ────────────────────
//   npm run d0:registry
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { REGISTRY_PATH, loadRegisteredProfiles, sha } from "../validation/storeRegistry.mjs";
import { DIR, C2D, A4, C6 } from "./paths.mjs";

const STORES = [
  { storeId: "calibration-players-v3", kind: "BASE", artifactPath: "data/calibration/calibration-players-v3.json" },
  { storeId: "calibration-players-v4", kind: "BASE", artifactPath: `${C6}/calibration-players-v4.json` },
  { storeId: "calibration-players-v5", kind: "BASE", artifactPath: `${A4}/calibration-players-v5.json` },
  { storeId: "calibration-players-v6", kind: "BASE", artifactPath: `${C2D}/calibration-players-v6.json` },
  { storeId: "calibration-enrichment-v1", kind: "ENRICHMENT", artifactPath: "data/calibration/calibration-enrichment-v1.json" },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  // enrichment store may not exist yet on first run; create an empty shell
  const enrichPath = "data/calibration/calibration-enrichment-v1.json";
  if (!existsSync(enrichPath)) {
    writeFileSync(enrichPath, JSON.stringify({ calibrationEnrichmentVersion: "1.0.0",
      note: "roles + defensive-evidence enrichment layer. Fills nulls only; never overwrites base data. Built by npm run d0:backfill.",
      entries: {} }, null, 2) + "\n");
  }
  const stores = STORES.map((s) => {
    const raw = readFileSync(s.artifactPath, "utf8");
    const parsed = JSON.parse(raw); const data = parsed.data ?? parsed;
    const profiles = data.profiles ?? Object.keys(data.entries ?? {});
    const seasons = (data.profiles ?? []).map((p) => p.seasonStartYear).filter((x) => x != null);
    return { ...s,
      storeVersion: data.calibrationPlayerStoreV4Version ?? data.calibrationPlayerStoreV6Version ?? data.calibrationEnrichmentVersion ?? data.calibrationPlayerDataVersion ?? "1.0.0",
      schemaVersion: data.calibrationPlayerSchemaVersion ?? (data.profiles?.[0]?.calibrationPlayerSchemaVersion) ?? null,
      profileCount: Array.isArray(profiles) ? profiles.length : 0,
      personCount: data.profiles ? new Set(data.profiles.map((p) => p.calibrationPersonId)).size : null,
      seasonRange: seasons.length ? [Math.min(...seasons), Math.max(...seasons)] : null,
      contentHash: sha(raw), enabled: true };
  });
  const registry = { calibrationProfileStoreRegistryVersion: "1.0.0",
    authority: "every consumer of calibration profiles loads through scripts/validation/storeRegistry.mjs. A future store becomes visible by adding an entry here; no runner edit is required or permitted.",
    identityAliases: [], stores };
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");

  // load through it, proving the invariants
  const { profiles, loaded, registryHash } = loadRegisteredProfiles();
  // order-independence: reload with reversed store order via a temp registry
  const rev = { ...registry, stores: [...registry.stores].reverse() };
  writeFileSync(`${DIR}/tmp-registry-reversed.json`, JSON.stringify(rev, null, 2));
  const revLoad = loadRegisteredProfiles({ registryPath: `${DIR}/tmp-registry-reversed.json` });
  const sameMerge = revLoad.profiles.size === profiles.size
    && [...profiles.keys()].every((k) => revLoad.profiles.has(k))
    && revLoad.registryHash === registryHash;
  // unregistered store files
  const known = new Set(STORES.map((s) => s.artifactPath));
  const candidates = [];
  for (const dir of ["data/calibration", C6, A4, C2D]) {
    for (const f of readdirSync(dir)) {
      if (/calibration-players.*\.json$|calibration-enrichment.*\.json$/.test(f) && !known.has(`${dir}/${f}`)) candidates.push(`${dir}/${f}`);
    }
  }
  writeArtifact("calibration-profile-store-registry", { ...registry, registryHash,
    registryArtifactPath: REGISTRY_PATH },
    { generationCommand: "npm run d0:registry", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("calibration-profile-store-audit", {
    calibrationProfileStoreRegistryVersion: "1.0.0",
    activeStoresRegistered: STORES.length, activeStoresLoaded: loaded.length,
    mergedProfileCount: profiles.size,
    duplicateProfileIds: 0, duplicateIdentities: 0,
    duplicateNote: "loading hard-fails on either duplicate class; a successful load proves zero",
    unregisteredActiveStores: candidates, unregisteredCount: candidates.length,
    orderIndependence: { reversedLoadIdentical: sameMerge, registryHash, reversedRegistryHash: revLoad.registryHash },
    loaded, pass: sameMerge && candidates.length === 0,
  }, { generationCommand: "npm run d0:registry", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`REGISTRY: ${STORES.length} stores · ${profiles.size} merged profiles · order-independent ${sameMerge} · unregistered ${candidates.length}`);
  console.log(`  registryHash ${registryHash.slice(0, 16)}…`);
  process.exit(sameMerge && candidates.length === 0 ? 0 : 2);
}
