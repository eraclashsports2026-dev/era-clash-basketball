// ── Shared paths, ids and helpers for Phase 6C4D1 ───────────────────────────
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const DIR = "data/validation/6c4d1";
export const C3D = "data/validation/6c4c3";
export const C2D = "data/validation/6c4c2";
export const C1D = "data/validation/6c4c1";
export const B1 = "data/validation/6c4b1";
export const B1S = "data/validation/6c4b1s";
export const A4 = "data/validation/6c4a";
export const C6 = "data/validation/6c3r";

export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
export const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
/** Every recorded value carries its source path. */
export const v = (value, source) => ({ value, source });
export const unwrap = (x) => (x && typeof x === "object" && !Array.isArray(x) && "value" in x ? x.value : x);
export const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
export const avg = (xs) => { const v2 = xs.filter((x) => typeof x === "number" && Number.isFinite(x)); return v2.length ? r2(v2.reduce((a, b) => a + b, 0) / v2.length) : null; };

/** The 18 season-record fields src/v3/calibration/calibrationPlayerAdapter.js reads. */
export const ADAPTER_INPUTS = Object.freeze(["accolades", "basicStats", "calibrationPersonId",
  "calibrationPlayerId", "confidence", "defensiveEvidence", "eraStyleId", "lineupRole", "name",
  "offensiveRoles", "physicalProfile", "primaryPosition", "provenance", "publicPersonId",
  "rateStats", "seasonStartYear", "secondaryPositions", "shootingProfile"]);

export const CAL_STORES = Object.freeze([
  { tag: "v3", path: "data/calibration/calibration-players-v3.json" },
  { tag: "v4", path: `${C6}/calibration-players-v4.json` },
  { tag: "v5", path: `${A4}/calibration-players-v5.json` },
  { tag: "v6", path: `${C2D}/calibration-players-v6.json` },
]);

/** Every calibration season record this repository holds, keyed by player id. */
export const allSeasonRecords = () => {
  const m = new Map();
  for (const s of CAL_STORES) {
    if (!existsSync(s.path)) continue;
    const raw = JSON.parse(readFileSync(s.path, "utf8"));
    for (const p of ((raw.data ?? raw).profiles ?? [])) {
      if (!m.has(p.calibrationPlayerId)) m.set(p.calibrationPlayerId, { ...p, __store: s.tag });
    }
  }
  return m;
};
