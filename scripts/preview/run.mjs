// ── Protected-preview command surface (Phase 6C4D0R) ─────────────────────────
// Local, non-production verification of the LOCKED preview candidate.
// Subcommands: preflight · smoke · soak · security · browser-qa
// Nothing here deploys, alters an environment, or touches production data.
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const mode = process.argv[2];
const t0 = Date.now();
let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` … ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const finish = () => {
  console.log(`\npreview:${mode} — ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(fail ? 1 : 0);
};

const lock = () => JSON.parse(readFileSync("data/validation/6c4d0/candidate3-lock.json", "utf8")).data;

if (mode === "preflight") {
  delete process.env.PREVIEW_SIM_ENGINE_ENABLED;
  const { flags } = await import("../../api/_lib/flags.js");
  gate("flag defaults off", flags().previewSimEngine === false);
  const m = lock();
  gate("candidate LOCKED", m.candidateLockStatus === "LOCKED" && m.calibrationStatus === "PREVIEW_READY_LOCKED",
    `${m.candidateSelectionStatus}/${m.candidateLockStatus}/${m.calibrationStatus}/${m.formalValidationStatus}`);
  gate("formal validation not claimed", m.formalValidationStatus === "FORMAL_VALIDATION_INCOMPLETE");
  const { PREVIEW_NAMESPACES, previewCandidateIdentity } = await import("../../api/_lib/previewEngine.js");
  gate("six preview namespaces, all preview-prefixed",
    Object.values(PREVIEW_NAMESPACES).length === 6 && Object.values(PREVIEW_NAMESPACES).every((n) => n.startsWith("preview-")));
  const id = previewCandidateIdentity();
  gate("identity is the locked identity", id.possessionCalibrationVersion === "1.3.0" && id.actionLibraryVersion === "2.1.0",
    `pc ${id.possessionCalibrationVersion} · al ${id.actionLibraryVersion} · fallback ${id.fallbackEngine}`);
  const { buildRunnerProfileMap } = await import("../validation/profileMap.mjs");
  const pm = await buildRunnerProfileMap();
  const n = pm.size ?? Object.keys(pm).length;
  gate("profile store resolves", n >= 500, `${n} records`);
  finish();
}

if (mode === "smoke" || mode === "soak") {
  const N = mode === "soak" ? 400 : 40;
  const { computeResultPreview } = await import("../../api/_lib/previewEngine.js");
  const T = [
    [["magic-80s","jordan-90s","pippen-90s","duncan-00s","hak-90s"], ["curry-10s","klay-10s","lebron-10s","kg-00s","shaq-90s"]],
    [["curry-10s","klay-10s","bird-80s","dirk-00s","rob-90s"], ["magic-80s","jordan-90s","bird-80s","kg-00s","shaq-90s"]],
  ];
  const coaches = ["neutral", "phil-jackson", "pat-riley", "gregg-popovich"];
  const eras = ["1970s", "1990s", "2010s", "2020s"];
  const team = (ids) => ids.map((id) => ({ id }));
  const lat = []; let replayBreaks = 0, scoreAnomalies = 0, failures = 0;
  for (let i = 0; i < N; i++) {
    const [a, b] = T[i % T.length];
    const opts = { coachGoldId: coaches[i % coaches.length], coachBlueId: coaches[(i + 1) % coaches.length], eraStyleId: eras[i % eras.length] };
    const s0 = Date.now();
    try {
      const r = computeResultPreview("single", team(a), team(b), opts, 1000 + i);
      lat.push(Date.now() - s0);
      if (r.core.finalScore.gold < 50 || r.core.finalScore.gold > 220 || r.core.finalScore.blue < 50 || r.core.finalScore.blue > 220) scoreAnomalies++;
      if (i % 10 === 0) {
        const again = computeResultPreview("single", team(a), team(b), opts, 1000 + i);
        if (JSON.stringify(again) !== JSON.stringify(r)) replayBreaks++;
      }
    } catch { failures++; }
  }
  lat.sort((x, y) => x - y);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
  gate(`${N} preview games computed`, failures === 0, `failures ${failures}`);
  gate("replay-stable", replayBreaks === 0, `${Math.ceil(N / 10)} replay probes`);
  gate("scores in sane range", scoreAnomalies === 0);
  gate("latency", p(0.5) < 500 && p(0.95) < 2000, `p50 ${p(0.5)}ms · p95 ${p(0.95)}ms · max ${lat[lat.length - 1]}ms`);
  let scopeOk = true;
  for (const m of ["season", "daily", "challenge"]) {
    try { computeResultPreview(m, team(T[0][0]), team(T[0][1]), {}, 1); scopeOk = false; }
    catch (e) { if (e.code !== "PREVIEW_SCOPE") scopeOk = false; }
  }
  gate("out-of-scope modes refuse (production fallback engages)", scopeOk);
  finish();
}

if (mode === "security") {
  const { previewEvent, ALLOWED_PREVIEW_EVENTS } = await import("../../api/_lib/previewTelemetry.js");
  const leak = previewEvent("simulation_started", { mode: "single", authorization: "Bearer x", cookie: "c", email: "a@b.c", apiToken: "t", sessionKey: "s", password: "p" });
  const s = JSON.stringify(leak);
  gate("telemetry strips secret/PII keys", !/authorization|cookie|email|token|session|password|Bearer/i.test(s), s);
  gate("unknown telemetry events dropped", previewEvent("exfiltrate", { x: 1 }) === null);
  gate("telemetry allowlist is operational-only",
    [...ALLOWED_PREVIEW_EVENTS].every((e) => !/user|name|email|account/i.test(e)), `${ALLOWED_PREVIEW_EVENTS.size} events`);
  const game = readFileSync("api/game.js", "utf8");
  gate("preview guarded by default-off flag", /f\.previewSimEngine\s*&&/.test(game));
  gate("preview persists only under preview-result:", /PREVIEW_NAMESPACES\.result/.test(game) && /pv_/.test(readFileSync("api/_lib/previewEngine.js", "utf8")));
  gate("catch path restores production", /fallback_invoked/.test(game) && /previewComputed \?\? \(f\.simV3/.test(game));
  for (const f of ["api/_lib/previewEngine.js", "api/_lib/previewTelemetry.js"]) {
    const src = readFileSync(f, "utf8");
    gate(`${f} carries no secret material`, !/(sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(src));
  }
  gate("no production route reaches the possession engine directly",
    readdirSync("api").filter((f) => f.endsWith(".js")).every((f) => !/v3\/possession/.test(readFileSync(`api/${f}`, "utf8"))));
  finish();
}

if (mode === "browser-qa") {
  // Product-unchanged QA: the full e2e journey suite runs against a local
  // build with the preview flag explicitly OFF — the shipped product must be
  // byte-identical in behaviour whether or not the preview code exists.
  console.log("  running playwright journeys with PREVIEW_SIM_ENGINE_ENABLED=false (local, non-production)");
  try {
    execSync("npx playwright test", { stdio: "inherit", env: { ...process.env, PREVIEW_SIM_ENGINE_ENABLED: "false" } });
    gate("e2e journeys pass with preview flag off", true);
  } catch { gate("e2e journeys pass with preview flag off", false); }
  finish();
}

console.error(`unknown preview command: ${mode}`);
process.exit(2);
