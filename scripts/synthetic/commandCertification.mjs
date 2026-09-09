#!/usr/bin/env node
// ── WS11: certify the formal validation commands ────────────────────────────
//   npm run syn:commands
//
// The Phase 6C4B2 package prepared a command that did not exist: package.json
// had no validation:synthetic-v2 script, so the prepared command could not
// execute. This registers all three formal commands and certifies each one by
// ACTUALLY RUNNING its non-accessing modes in a child process and checking the
// access logs before and after — not by reading the source and reasoning about
// what it would do.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { DIR } from "./preflight.mjs";

export const COMMANDS = Object.freeze([
  { npmScript: "validation:historical-v5", module: "scripts/validation/historical-holdout-v5.mjs",
    set: "historical-holdout-v5", stage: 1,
    preparedCommand: 'npm run validation:historical-v5 -- --unlock-holdout --unlock-historical-holdout-v5 --operator="<name>" --reason="<why>"',
    nonAccessingModes: [] },
  { npmScript: "validation:synthetic-v2", module: "scripts/validation/synthetic-stress-holdout-v2.mjs",
    set: "synthetic-stress-holdout-v2", stage: 2,
    preparedCommand: 'npm run validation:synthetic-v2 -- --unlock-holdout --unlock-synthetic-stress-holdout-v2 --operator="<name>" --reason="<why>"',
    nonAccessingModes: ["--help", "--dry-run", "--preflight"] },
  { npmScript: "validation:candidate1-formal-verdict", module: "scripts/validation/candidate1FormalVerdict.mjs",
    set: null, stage: 3,
    preparedCommand: "npm run validation:candidate1-formal-verdict",
    nonAccessingModes: ["--help"] },
]);

const SEALS = ["historical-holdout-v5", "synthetic-stress-holdout-v2"];
const counts = () => Object.fromEntries(SEALS.map((s) => [s, setAccessCount(s)]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-command-certification", DIR) && !process.argv.includes("--refreeze")) {
    console.log("command certification already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  console.log("FORMAL VALIDATION COMMAND CERTIFICATION\n");
  const before = counts();
  console.log(`  access counts before: ${Object.entries(before).map(([k, v]) => `${k} ${v}`).join(", ")}\n`);

  const rows = [];
  for (const c of COMMANDS) {
    const registered = Boolean(pkg.scripts?.[c.npmScript]);
    const resolvesToModule = registered && pkg.scripts[c.npmScript].includes(c.module.replace("scripts/", ""));
    const modes = [];
    for (const mode of c.nonAccessingModes) {
      const b = counts();
      let exitCode = 0; let output = ""; let threw = null;
      try {
        output = execFileSync("npm", ["run", "--silent", c.npmScript, "--", mode],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
      } catch (e) {
        exitCode = e.status ?? -1; output = `${e.stdout ?? ""}${e.stderr ?? ""}`; threw = e.message;
      }
      const a = counts();
      const unchanged = SEALS.every((s) => a[s] === b[s]);
      modes.push({ mode, exitCode, accessCountsBefore: b, accessCountsAfter: a, accessUnchanged: unchanged,
        producedOutput: output.trim().length > 0,
        outputFirstLine: output.trim().split("\n")[0]?.slice(0, 160) ?? null,
        note: threw && exitCode === 2 ? "exited 2, which is a refusal rather than a crash" : null });
      console.log(`  ${c.npmScript} ${mode.padEnd(12)} exit ${String(exitCode).padStart(2)}  access ${unchanged ? "UNCHANGED" : "CHANGED"}  ${modes.at(-1).outputFirstLine ?? "(no output)"}`);
    }
    rows.push({ ...c, registered, resolvesToModule,
      script: registered ? pkg.scripts[c.npmScript] : null, modes });
  }
  const after = counts();

  console.log("");
  gate("everyCommandIsRegistered", rows.every((r) => r.registered),
    rows.filter((r) => !r.registered).map((r) => r.npmScript).join(", ")
      || `all ${rows.length} commands exist in package.json: ${rows.map((r) => r.npmScript).join(", ")}`);
  gate("everyCommandResolvesToItsModule", rows.every((r) => r.resolvesToModule),
    rows.map((r) => `${r.npmScript} -> ${r.script}`).join("; "));
  gate("theBlockedCommandNowResolves",
    Boolean(pkg.scripts?.["validation:synthetic-v2"]),
    `Phase 6C4B2 recorded "package.json has no validation:synthetic-v2 script, so the prepared command cannot execute". It is now ${pkg.scripts["validation:synthetic-v2"]}`);
  gate("everyNonAccessingModeWasActuallyExecuted",
    rows.flatMap((r) => r.modes).length >= 4,
    `${rows.flatMap((r) => r.modes).length} non-accessing mode invocations were run in child processes, not reasoned about from source`);
  gate("noNonAccessingModeTouchedASeal",
    rows.flatMap((r) => r.modes).every((m) => m.accessUnchanged),
    (() => { const bad = rows.flatMap((r) => r.modes.map((m) => ({ ...m, cmd: r.npmScript }))).filter((m) => !m.accessUnchanged);
      return bad.length ? `these modes changed an access count: ${bad.map((m) => `${m.cmd} ${m.mode}`).join(", ")}`
        : `every --help, --preflight and --dry-run invocation left both access logs untouched`; })());
  gate("helpAndDryRunExitCleanly",
    rows.flatMap((r) => r.modes).filter((m) => m.mode === "--help" || m.mode === "--dry-run")
      .every((m) => m.exitCode === 0 && m.producedOutput),
    "--help and --dry-run print guidance and exit 0 without doing anything");
  gate("preflightRefusesRatherThanOpening",
    (() => { const p = rows.find((r) => r.npmScript === "validation:synthetic-v2")?.modes.find((m) => m.mode === "--preflight");
      return p != null && p.exitCode === 2 && p.accessUnchanged; })(),
    "--preflight reports its verifications and exits 2 because Historical V5 has not run — a refusal, with both seals still untouched. That is the intended state today: stage two cannot be cleared before stage one exists.");
  gate("accessCountsUnchangedAcrossTheWholeCertification",
    SEALS.every((s) => after[s] === before[s] && after[s] === 0),
    `${SEALS.map((s) => `${s} ${before[s]} -> ${after[s]}`).join(", ")}`);
  gate("stageOrderIsRepresentedInTheCommandSet",
    rows.map((r) => r.stage).join(",") === "1,2,3",
    "stage one (historical), stage two (synthetic) and stage three (the compound verdict) are all registered, in order");

  const payload = {
    syntheticCommandCertificationVersion: "1.0.0",
    certificationMethod: "each non-accessing mode was executed in a child process and the per-set access logs were read immediately before and after. Nothing here is certified by inspecting source.",
    commands: rows,
    accessCounts: { before, after, sealsWatched: SEALS },
    blockerResolved: { key: "preparedCommandResolvable",
      wasRecordedAs: 'the B2 package prepares "npm run validation:synthetic-v2 ..." but package.json has no validation:synthetic-v2 script, so the prepared command cannot execute',
      nowResolvesTo: pkg.scripts?.["validation:synthetic-v2"] ?? null },
    preparedCommands: Object.fromEntries(rows.map((r) => [r.npmScript, r.preparedCommand])),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.certificationHash = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.npmScript, r.registered,
    r.modes.map((m) => [m.mode, m.exitCode, m.accessUnchanged])]))).digest("hex");
  writeArtifact("synthetic-v2-command-certification", payload, {
    generationCommand: "npm run syn:commands", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nCOMMAND CERTIFICATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.certificationHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
