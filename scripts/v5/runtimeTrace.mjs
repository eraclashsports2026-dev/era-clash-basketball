#!/usr/bin/env node
// ── Runtime module trace: what Candidate 1 ACTUALLY executes ────────────────
//   node scripts/v5/runtimeTrace.mjs <out.json>
//
// A static graph says what COULD run. This says what DID run, using Node's own
// module registry after exercising every simulation path. The gap between the
// two is where offensivePlan.js hid for four phases.
//
// Runs in its own process so the registry contains only what these paths
// pulled in, then reports every loaded repo module.
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const paths = [];
const note = (name) => paths.push(name);

// ── exercise every result-affecting path ─────────────────────────────────────
const { runPossessionGame, runPossessionSeries } = await import("../../src/v3/possession/index.js");
const { buildPossessionInput } = await import("../../src/v3/possession/testContext.js");
const { estimateWinProbability } = await import("../../src/v3/calibration/monteCarloProbability.js");
const { compileRuntimeParameterSet } = await import("../../src/v3/calibration/runtimeParameters.js");
const { buildCalibrationPlayerProfile } = await import("../../src/v3/calibration/calibrationPlayerAdapter.js");

const A = ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"];
const B = ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"];
const ZONE_D = ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"];

note("single game");
runPossessionGame(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "2010s", simulationSeed: 4242, coachGoldId: "steve-kerr", coachBlueId: "phil-jackson" }), { includeLedger: true });
note("best of 7");
runPossessionSeries(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "1990s", simulationSeed: 11, mode: "best7", coachGoldId: "pat-riley", coachBlueId: "phil-jackson" }), { games: 7, opts: { includeLedger: false } });
note("win 82");
runPossessionSeries(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "2020s", simulationSeed: 12, mode: "82" }), { games: 82, opts: { includeLedger: false } });
note("zone game (zone-heavy coach)");
runPossessionGame(buildPossessionInput({ goldIds: A, blueIds: ZONE_D, eraStyleId: "2010s", simulationSeed: 4242, coachGoldId: "steve-kerr", coachBlueId: "nick-nurse" }), { includeLedger: true });
note("coach-adjustment game");
runPossessionGame(buildPossessionInput({ goldIds: B, blueIds: A, eraStyleId: "1990s", simulationSeed: 999, coachGoldId: "mike-dantoni", coachBlueId: "jerry-sloan", offensiveAdjustments: true }), { includeLedger: true });
note("pre-three-point era game");
runPossessionGame(buildPossessionInput({ goldIds: ["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], blueIds: B, eraStyleId: "1960s", simulationSeed: 1960, coachGoldId: "red-auerbach", coachBlueId: "phil-jackson" }), { includeLedger: true });
note("flags-off path");
runPossessionGame(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "1990s", simulationSeed: 777, expandedActions: false, zoneResolution: false, offensiveAdjustments: false, opportunityAllocation: false }), { includeLedger: true });
note("compiled parameter set");
runPossessionGame(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "2010s", simulationSeed: 5, parameterSet: compileRuntimeParameterSet({ overrides: {} }) }), { includeLedger: false });
note("probability estimate");
estimateWinProbability({ teamA: { teamId: "A", playerIds: A, coachId: "steve-kerr" }, teamB: { teamId: "B", playerIds: B, coachId: "phil-jackson" },
  eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false });
note("replay (same input twice)");
for (let i = 0; i < 2; i++) runPossessionGame(buildPossessionInput({ goldIds: A, blueIds: B, eraStyleId: "2010s", simulationSeed: 31337 }), { includeLedger: true });
note("calibration profile adapter");
{
  const { readFileSync } = await import("node:fs");
  const store = JSON.parse(readFileSync("data/validation/6c3r/calibration-players-v4.json", "utf8"));
  for (const p of store.profiles.slice(0, 12)) buildCalibrationPlayerProfile(p);
}

// ── harvest what the loader hook recorded ────────────────────────────────────
// The hook (scripts/v5/traceHook.mjs, registered with --import) appends every
// resolved module URL to TRACE_URLS. Reading it here — after the paths above
// have run — gives the exact set of modules this process executed.
const { readFileSync, existsSync } = await import("node:fs");
const urlLog = process.env.TRACE_URLS;
const urls = urlLog && existsSync(urlLog) ? readFileSync(urlLog, "utf8").split("\n").filter(Boolean) : [];
const files = [...new Set(urls.map((u) => relative(ROOT, fileURLToPath(u))))]
  .filter((f) => !f.startsWith("..") && !f.startsWith("node_modules") && /\.(js|mjs|json)$/.test(f))
  .sort();
writeFileSync(process.argv[2], `${JSON.stringify({ pathsExercised: paths, executedModules: files, count: files.length, urlsObserved: urls.length }, null, 2)}\n`);
console.log(`exercised ${paths.length} paths · resolved urls ${urls.length} · executed repo modules ${files.length}`);
