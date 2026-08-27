// ── Versioned calibration profile-store registry ─────────────────────────────
//
// Historical V6 was adjudicated INVALID because buildRunnerProfileMap loaded a
// hard-coded pair of stores (v3+v4) while every V6 player lived in v5/v6. The
// registry replaces every hard-coded store import with one authoritative,
// versioned index: a future store becomes visible to every consumer by adding a
// registry entry — never by editing a runner.
//
// Invariants enforced at load:
//   · every enabled store's file exists (missing ⇒ hard fail)
//   · recorded contentHash matches the file on disk (drift ⇒ hard fail)
//   · duplicate calibrationPlayerId across stores ⇒ hard fail
//   · duplicate canonical person+season+team ⇒ hard fail unless explicitly aliased
//   · merged output is independent of store order (keyed map + duplicate rejection)
//   · ENRICHMENT layers only FILL null/empty fields; they never overwrite base data
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const REGISTRY_PATH = "data/calibration/calibration-profile-store-registry.json";
export const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

export class StoreRegistryError extends Error {
  constructor(message, code) { super(message); this.name = "StoreRegistryError"; this.code = code; }
}

export const readRegistry = (path = REGISTRY_PATH) => {
  if (!existsSync(path)) throw new StoreRegistryError(`no store registry at ${path}`, "REGISTRY_MISSING");
  return JSON.parse(readFileSync(path, "utf8"));
};

const loadStoreFile = (path) => {
  if (!existsSync(path)) throw new StoreRegistryError(`registered store file missing: ${path}`, "STORE_FILE_MISSING");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  return { raw, data: parsed.data ?? parsed };
};

/**
 * Load every enabled store through the registry and return the merged,
 * enrichment-applied profile map keyed by calibrationPlayerId.
 */
export const loadRegisteredProfiles = ({ registryPath = REGISTRY_PATH, verifyHashes = true } = {}) => {
  const registry = readRegistry(registryPath);
  const enabled = registry.stores.filter((s) => s.enabled);
  const merged = new Map();
  const identity = new Map(); // canonical person|season|team -> calibrationPlayerId
  const loaded = [];

  for (const store of enabled.filter((s) => s.kind === "BASE")) {
    const { raw, data } = loadStoreFile(store.artifactPath);
    const hash = sha(raw);
    if (verifyHashes && store.contentHash && hash !== store.contentHash) {
      throw new StoreRegistryError(
        `store ${store.storeId} drifted: registered ${store.contentHash.slice(0, 16)}… on-disk ${hash.slice(0, 16)}…`,
        "STORE_HASH_DRIFT");
    }
    const profiles = data.profiles ?? [];
    for (const p of profiles) {
      if (merged.has(p.calibrationPlayerId)) {
        throw new StoreRegistryError(
          `duplicate calibrationPlayerId ${p.calibrationPlayerId} (stores ${merged.get(p.calibrationPlayerId).__storeId} and ${store.storeId})`,
          "DUPLICATE_PROFILE_ID");
      }
      const idKey = `${p.calibrationPersonId}|${p.seasonStartYear}|${p.teamId}`;
      const prior = identity.get(idKey);
      const aliased = (registry.identityAliases ?? []).some((a) => a.identity === idKey);
      if (prior && !aliased) {
        throw new StoreRegistryError(
          `duplicate person-season-team identity ${idKey} (${prior} and ${p.calibrationPlayerId}) with no registered alias`,
          "DUPLICATE_IDENTITY");
      }
      identity.set(idKey, p.calibrationPlayerId);
      merged.set(p.calibrationPlayerId, { ...p, __storeId: store.storeId });
    }
    loaded.push({ storeId: store.storeId, kind: store.kind, profiles: profiles.length, contentHash: hash });
  }

  // ── enrichment layers: fill, never overwrite ─────────────────────────────
  let enrichmentApplied = 0;
  for (const store of enabled.filter((s) => s.kind === "ENRICHMENT")) {
    const { raw, data } = loadStoreFile(store.artifactPath);
    const hash = sha(raw);
    if (verifyHashes && store.contentHash && hash !== store.contentHash) {
      throw new StoreRegistryError(`enrichment ${store.storeId} drifted`, "STORE_HASH_DRIFT");
    }
    for (const [id, add] of Object.entries(data.entries ?? {})) {
      const base = merged.get(id);
      if (!base) continue; // enrichment for an unknown id is reported by the audit, not fatal
      if (add.offensiveRoles?.allRoles?.length && !(base.offensiveRoles ?? []).length) {
        base.offensiveRoles = add.offensiveRoles.allRoles;
        base.offensiveRoleDetail = add.offensiveRoles;      // primary/secondary/method/provenance
      }
      if (add.defensiveEvidence?.band && !(base.defensiveEvidence?.band)) {
        base.defensiveEvidence = { ...(base.defensiveEvidence ?? {}), ...add.defensiveEvidence };
      }
      base.__enrichment = { storeId: store.storeId, appliedFields: Object.keys(add) };
      enrichmentApplied += 1;
    }
    loaded.push({ storeId: store.storeId, kind: store.kind, entries: Object.keys(data.entries ?? {}).length, contentHash: hash });
  }

  const registryHash = sha(loaded.map((l) => [l.storeId, l.contentHash]).sort((a, b) => a[0].localeCompare(b[0])));
  return { profiles: merged, loaded, enrichmentApplied, registryHash, registryVersion: registry.calibrationProfileStoreRegistryVersion };
};

/**
 * Resolve one selected player id through the merged map.
 * Fuzzy matching is deliberately absent: exact id, or a registered alias, or fail.
 */
export const resolveProfile = (map, calibrationPlayerId, { aliases = [] } = {}) => {
  if (map.has(calibrationPlayerId)) {
    return { state: "FULL_RECORD", record: map.get(calibrationPlayerId) };
  }
  const alias = aliases.find((a) => a.from === calibrationPlayerId);
  if (alias && map.has(alias.to)) {
    return { state: "FULL_RECORD", record: map.get(alias.to), via: alias };
  }
  return { state: "UNRESOLVED", record: null };
};
