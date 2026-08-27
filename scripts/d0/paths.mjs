// ── Shared paths and helpers for Phase 6C4D0 ────────────────────────────────
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const DIR = "data/validation/6c4d0";
export const D1 = "data/validation/6c4d1";
export const C3D = "data/validation/6c4c3";
export const C2D = "data/validation/6c4c2";
export const C1D = "data/validation/6c4c1";
export const B1 = "data/validation/6c4b1";
export const B1S = "data/validation/6c4b1s";
export const B2R = "data/validation/6c4b2r";
export const A4 = "data/validation/6c4a";
export const C6 = "data/validation/6c3r";

export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
export const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
/** Every recorded value carries the artifact path it came from. */
export const v = (value, source) => ({ value, source });
export const unwrap = (x) => (x && typeof x === "object" && !Array.isArray(x) && "value" in x ? x.value : x);
export const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
export const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e5) / 1e5);
export const avg = (xs) => { const f = xs.filter((x) => typeof x === "number" && Number.isFinite(x)); return f.length ? r2(f.reduce((a, b) => a + b, 0) / f.length) : null; };
/** sha256 of a file exactly as stored on disk, for immutability binding. */
export const fileHash = (p) => (existsSync(p) ? sha(readFileSync(p, "utf8")) : null);
