#!/usr/bin/env node
// ── The complete regression pass, one command ─────────────────────────────────
//   node scripts/foundation/fullPassSweep.mjs <label>
//
// Runs every existing local gate (accounts, career, Challenges, rating,
// progression, profiles, Clash Cards + Rivalries, Clash Breakdown, the golden
// fixture), each against a FRESH fake-cloud harness (4178) and fixtures harness
// (4179) so no gate inherits another's rows. Records command, exit code and the
// gate's own "N/M passed" line into data/validation/foundation/<label>.json,
// then restores every historical validation artifact the gates rewrote, so the
// only records this pass changes are its own.
import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, mkdirSync, openSync } from "node:fs";

const LABEL = process.argv[2] || "first-pass";
const SHA = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim();
const RL = { RL_PROFILE_PER_MIN_IP: "500", RL_CHALLENGE_ACTIONS_PER_MIN_IP: "500", RL_CHALLENGE_VIEW_PER_MIN_IP: "500", RL_PROGRESSION_PER_MIN_IP: "500", RL_COMPETITIVE_PER_MIN_IP: "500", RL_PROFILE_PUBLIC_PER_MIN_IP: "500", RL_SOCIAL_PER_MIN_IP: "500" };
const HARNESS_ENV = { ...process.env, PREVIEW_SIM_ENGINE_ENABLED: "1", VERCEL_ENV: "preview", ECLASH_FAKE_CLOUD: "1", ...RL };
const kill = (port) => { const pid = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim(); if (pid) for (const p of pid.split(/\s+/)) spawnSync("kill", ["-9", p]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (port) => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${port}/api/health`); if (r.ok) return true; } catch {} await sleep(250); } return false; };
const fresh = async () => {
  kill(4178); kill(4179); await sleep(400);
  mkdirSync("/tmp/eraclash-sweep", { recursive: true });
  spawn("node", ["scripts/harness.mjs", "4178"], { env: HARNESS_ENV, detached: true, stdio: ["ignore", openSync("/tmp/eraclash-sweep/4178.log", "a"), openSync("/tmp/eraclash-sweep/4178.log", "a")] }).unref();
  spawn("node", ["scripts/harness.mjs", "4179"], { env: { ...HARNESS_ENV, ECLASH_DIST: "dist-fixtures" }, detached: true, stdio: ["ignore", openSync("/tmp/eraclash-sweep/4179.log", "a"), openSync("/tmp/eraclash-sweep/4179.log", "a")] }).unref();
  return (await up(4178)) && (await up(4179));
};

const GATES = [
  ["accounts", "scripts/accounts/accountQa.mjs", ["preflight", "migrations", "rls", "auth", "guest-claim", "cloud-save", "security", "my-eraclash", "responsive"]],
  ["career", "scripts/accounts/careerV2Qa.mjs", ["saved-rosters", "run-it-back", "export", "deletion", "reauthentication", "device-reconciliation", "responsive", "accessibility", "performance"]],
  ["challenges", "scripts/challenges/challengeQa.mjs", ["contract", "seed", "rls", "security", "history", "responsive", "accessibility", "performance"]],
  ["competitive", "scripts/competitive/competitiveQa.mjs", ["contract", "rating", "backfill", "concurrency", "privacy", "leaderboard", "rls", "security", "responsive", "accessibility", "performance"]],
  ["progression", "scripts/progression/progressionQa.mjs", ["contract", "xp", "achievement", "backfill", "reconcile", "result", "challenge", "rls", "security", "concurrency", "responsive", "accessibility", "performance"]],
  ["profiles", "scripts/profiles/profileQa.mjs", ["contract", "identifier", "visibility", "projection", "featured", "provisional", "display-name", "deletion", "enumeration", "rls", "cross-account", "leaderboard", "sharing", "responsive", "accessibility", "performance"]],
  ["social", "scripts/social/socialQa.mjs", ["contract", "rls", "lifecycle", "cards", "harness", "fixture"]],
  ["breakdown", "scripts/breakdown/breakdownQa.mjs", ["capability", "journey", "responsive", "screens"]],
  ["foundation", "scripts/foundation/goldenFixtureQa.mjs", [""]],
];

const rows = [];
for (const [group, script, modes] of GATES) {
  for (const mode of modes) {
    const ready = await fresh();
    // accountQa's browser modes default to a :4177 harness nothing starts; they run against the fake cloud here
    const originArg = script.endsWith("accountQa.mjs") && ["my-eraclash", "responsive"].includes(mode) ? ["http://localhost:4178"] : [];
    const args = [script, ...(mode ? [mode] : []), ...originArg];
    const t0 = Date.now();
    const r = spawnSync("node", args, { encoding: "utf8", timeout: 900_000, env: { ...process.env, FIXTURE_ORIGIN: "http://localhost:4179" }, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    const summary = (out.match(/(\d+)\/(\d+)[^\n]*passed[^\n]*/g) || []).pop() || null;
    const fails = (out.match(/^\s*FAIL\s+.*$/gm) || []).map((l) => l.trim().slice(0, 200));
    const row = { group, command: `node ${args.join(" ")}`, harnessReady: ready, exit: r.status, seconds: Math.round((Date.now() - t0) / 1000), summary, fails, error: r.status !== 0 && !fails.length ? out.split("\n").filter((l) => /Error|at /.test(l)).slice(0, 4).join(" | ").slice(0, 400) : null };
    rows.push(row);
    console.log(`${r.status === 0 ? "PASS" : "FAIL"}  ${row.command}  ${summary || ""}${fails.length ? `  (${fails.length} failed)` : ""}`);
  }
}
kill(4178); kill(4179);
// restore every historical artifact a gate rewrote (this pass records only its own file)
spawnSync("git", ["checkout", "--", "data/validation"], { stdio: "inherit" });
spawnSync("git", ["clean", "-fdq", "data/validation"], { stdio: "inherit" });
mkdirSync("data/validation/foundation", { recursive: true });
const passed = rows.every((r) => r.exit === 0);
writeFileSync(`data/validation/foundation/${LABEL}.json`, JSON.stringify({ artifact: LABEL, commit: SHA, generatedAt: new Date().toISOString(), gates: rows.length, passed: rows.filter((r) => r.exit === 0).length, failed: rows.filter((r) => r.exit !== 0).length, allPassed: passed, rows }, null, 2) + "\n");
console.log(`\n${rows.filter((r) => r.exit === 0).length}/${rows.length} gates passed → data/validation/foundation/${LABEL}.json`);
process.exit(passed ? 0 : 1);
