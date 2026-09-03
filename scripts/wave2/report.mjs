#!/usr/bin/env node
// ── Wave 2 operator reports (Phase 9A.3) ─────────────────────────────────────
//   node scripts/wave2/report.mjs <feedback|metrics|access|readiness> [--fixture=path] [--format=json|md|both]
// Data comes from the preview KV store (UPSTASH_REDIS_REST_* or KV_REST_API_*).
// Without a store every report runs in EXPLICIT EMPTY-DATA mode and says so.
// --fixture injects records for verification without touching any store.
// Wave isolation: only wave2-* keys are read; a record whose waveId is not the
// Wave 2 id is dropped and counted. Pseudonymous ids only — no keys, no emails.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { hasStore, cmd } from "../../api/_lib/store.js";
import { PREVIEW_ACCESS } from "../../config/previewAccess.js";
import { WAVE2, WAVE2_COHORTS, WAVE2_RATINGS, WAVE2_TASKS, WAVE2_TELEMETRY_EVENTS, cohortOf } from "../../src/wave2.js";

const [, , mode] = process.argv;
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || null;
const FORMAT = arg("format") || "both";
const OUT_DIR = "data/validation/9a3"; mkdirSync(OUT_DIR, { recursive: true });
const W = WAVE2.waveId;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const range = (xs) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
const SECRET_SHAPE = /\b[a-f0-9]{32}\b/;

// ── loading ──────────────────────────────────────────────────────────────────
const source = () => (arg("fixture") ? `fixture (${arg("fixture")})` : hasStore() ? "kv" : "EMPTY_DATA (no store credentials in this shell — nothing is claimed absent)");
const dedupPrimary = (rows) => { const m = new Map(); for (const r of rows) { const k = `${r.testerId}:${r.taskId}:${r.resultId ?? "-"}`; if (!m.has(k) || (r.revision ?? 1) > (m.get(k).revision ?? 1)) m.set(k, r); } return [...m.values()]; };
const loadFeedback = async () => {
  let raw = [];
  if (arg("fixture")) raw = JSON.parse(readFileSync(arg("fixture"), "utf8"));
  else if (hasStore()) raw = ((await cmd("LRANGE", "wave2-feedback:log", 0, 9999)) ?? []).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  const foreign = raw.filter((r) => r.waveId !== W).length;
  return { rows: dedupPrimary(raw.filter((r) => r.waveId === W)), rawCount: raw.length, foreignWaveDropped: foreign };
};
const counters = async (key) => (hasStore() && !arg("fixture") ? Object.fromEntries(Object.entries((await cmd("HGETALL", key)) ?? {}).map(([k, v]) => [k, Number(v)])) : {});
const scanSecrets = (obj) => { const s = JSON.stringify(obj); const hit = s.match(SECRET_SHAPE); return { clean: !hit, sample: hit ? `${hit[0].slice(0, 4)}…` : null }; };

const emit = (name, data, md) => {
  const scan = scanSecrets(data);
  if (!scan.clean) { console.error(`SECRET SCAN FAILED: a 32-hex token appears in the ${name} output (${scan.sample}) — not written`); process.exit(1); }
  const body = { artifact: name, phase: "9A.3 — Wave 2 private beta", generatedAt: new Date().toISOString(), generatedBy: `node scripts/wave2/report.mjs ${mode}`, waveId: W, secretScan: "clean", data };
  if (FORMAT !== "md") writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(body, null, 2) + "\n");
  if (FORMAT !== "json") writeFileSync(`${OUT_DIR}/${name}.md`, md + "\n");
  console.log(md); console.log(`\n→ ${OUT_DIR}/${name}.{json,md}`);
};
const cohortSplit = (rows) => Object.fromEntries(Object.keys(WAVE2_COHORTS).map((c) => [c, rows.filter((r) => (r.cohort ?? cohortOf(r.testerId)) === c)]));

if (mode === "feedback") {
  const { rows, rawCount, foreignWaveDropped } = await loadFeedback();
  const per = (rs) => {
    const R = (f) => rs.map((r) => r.ratings?.[f]).filter((v) => Number.isInteger(v));
    const byTester = {}; const byTask = {}; const categories = {}; const failures = [];
    for (const r of rs) { byTester[r.testerId] = (byTester[r.testerId] ?? 0) + 1; byTask[r.taskId] = (byTask[r.taskId] ?? 0) + 1; categories[r.issueCategory ?? "NONE"] = (categories[r.issueCategory ?? "NONE"] ?? 0) + 1; if (r.issueCategory && r.issueCategory !== "NONE") failures.push({ testerId: r.testerId, taskId: r.taskId, category: r.issueCategory, comment: r.optionalComment ?? null, resultId: r.resultId ?? null }); }
    return { records: rs.length, testers: byTester, tasks: byTask, ratings: Object.fromEntries(Object.keys(WAVE2_RATINGS).map((f) => [f, { n: R(f).length, median: median(R(f)), range: range(R(f)) }])), issueCategories: categories, taskFailures: failures, tasksNotYetCompleted: Object.fromEntries(Object.entries(WAVE2_COHORTS).flatMap(([c, k]) => k.testerIds.map((t) => [t, k.tasks.filter((task) => !rs.some((r) => r.testerId === t && r.taskId === task))]))) };
  };
  const split = cohortSplit(rows);
  const data = { source: source(), rawRecords: rawCount, primaryRecords: rows.length, foreignWaveDropped, cohorts: { "first-time": per(split["first-time"]), returning: per(split.returning) }, statisticsNote: "medians, counts and ranges only; five testers support no population-level certainty" };
  const line = (c) => { const d = data.cohorts[c]; return `**${WAVE2_COHORTS[c].label}** — records ${d.records}; testers ${JSON.stringify(d.testers)}; tasks ${JSON.stringify(d.tasks)}\n` + Object.entries(d.ratings).filter(([, v]) => v.n).map(([k, v]) => `- ${k}: median ${v.median} (n=${v.n}, range ${v.range.join("–")})`).join("\n") + (d.taskFailures.length ? `\n- task failures: ${d.taskFailures.length}` : "\n- task failures: none recorded"); };
  emit("wave2-feedback-report", data, `# Wave 2 feedback report\n\nsource: ${data.source} · primary records: ${rows.length} (raw ${rawCount}, foreign-wave dropped ${foreignWaveDropped})\n\n${line("first-time")}\n\n${line("returning")}\n\n${data.statisticsNote}`);
}

if (mode === "metrics") {
  const totals = await counters(`wave2-metrics:events:${W}`);
  const c = await counters("wave2-metrics:counters");
  const perTester = {};
  for (const [cohort, k] of Object.entries(WAVE2_COHORTS)) for (const t of k.testerIds) perTester[t] = { cohort, events: hasStore() && !arg("fixture") ? Object.fromEntries(Object.entries((await cmd("HGETALL", `wave2-metrics:${W}:${cohort}:${t}:*`)) ?? {})) : {} };
  const timings = hasStore() && !arg("fixture") ? { modeSelectionMs: ((await cmd("LRANGE", `wave2-metrics:timing:${W}:time_to_mode_selection_recorded`, 0, 999)) ?? []).map(Number), firstRollMs: ((await cmd("LRANGE", `wave2-metrics:timing:${W}:time_to_first_roll_recorded`, 0, 999)) ?? []).map(Number) } : { modeSelectionMs: [], firstRollMs: [] };
  const data = { source: source(), eventTotals: Object.fromEntries(WAVE2_TELEMETRY_EVENTS.map((e) => [e, totals[e] ?? 0])), counters: { gamesStarted: c.games_started ?? 0, gamesCompleted: c.games_completed ?? 0, fallbackInvoked: c.fallback_invoked ?? 0, feedbackSubmitted: c.feedback_submitted ?? 0, feedbackResubmitted: c.feedback_resubmitted ?? 0, sessionsStarted: c.sessions_started ?? 0 }, timings: { medianTimeToModeSelectionSeconds: timings.modeSelectionMs.length ? +(median(timings.modeSelectionMs) / 1000).toFixed(1) : null, medianTimeToFirstRollSeconds: timings.firstRollMs.length ? +(median(timings.firstRollMs) / 1000).toFixed(1) : null, n: { modeSelection: timings.modeSelectionMs.length, firstRoll: timings.firstRollMs.length } }, perTester, crossWaveAggregation: "none — Wave 1 counters (preview-metrics:*) are never read here" };
  emit("wave2-product-metrics", data, `# Wave 2 product metrics\n\nsource: ${data.source}\nevents: ${Object.entries(data.eventTotals).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ") || "none recorded"}\ngames ${data.counters.gamesStarted}→${data.counters.gamesCompleted} · fallback ${data.counters.fallbackInvoked} · feedback ${data.counters.feedbackSubmitted}\nmedian time to mode selection: ${data.timings.medianTimeToModeSelectionSeconds ?? "—"}s (n=${data.timings.n.modeSelection}) · to first roll: ${data.timings.medianTimeToFirstRollSeconds ?? "—"}s (n=${data.timings.n.firstRoll})`);
}

if (mode === "access") {
  const c = await counters("wave2-metrics:counters");
  const entries = PREVIEW_ACCESS.keys;
  let leaks = 0, scanned = false;
  const f = ".preview-secrets/wave2-access-keys.json";
  if (existsSync(f)) { scanned = true; for (const k of JSON.parse(readFileSync(f, "utf8")).keys) { const hits = execSync(`grep -rIl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.preview-secrets --exclude-dir=dist -e "${k.key}" . || true`, { encoding: "utf8" }).trim(); if (hits) { leaks++; console.error(`LEAK: key for ${k.testerId} found in:\n${hits}`); } } }
  const perms = existsSync(f) ? { dir: (require_stat(".preview-secrets").mode & 0o777).toString(8), file: (require_stat(f).mode & 0o777).toString(8) } : null;
  const data = { source: source(), waveIdInConfig: PREVIEW_ACCESS.waveId, waveMatchesStudy: PREVIEW_ACCESS.waveId === W, accessConfigVersion: PREVIEW_ACCESS.accessConfigVersion,
    entries: entries.map((k) => ({ testerId: k.testerId, role: k.role, cohort: k.cohort ?? null, keyVersion: k.keyVersion, enabled: k.enabled !== false, sha256Prefix: k.sha256.slice(0, 12) })),
    counts: { owner: entries.filter((k) => k.role === "owner").length, firstTime: entries.filter((k) => k.cohort === "first-time").length, returning: entries.filter((k) => k.cohort === "returning").length, enabled: entries.filter((k) => k.enabled !== false).length },
    wave1EntriesPresent: entries.filter((k) => /^wave1-|^owner$/.test(k.testerId)).length, sessionsStartedByTester: Object.fromEntries(entries.map((k) => [k.testerId, c[`sessions_${k.testerId}`] ?? 0])),
    failedAccessAttempts: { badKey: c.access_denied_key ?? 0, expiredSession: c.access_denied_expired ?? 0, revokedSession: c.access_denied_revoked ?? 0 },
    rawKeyLeakScan: { scanned, leaks }, secretFile: { path: f, present: existsSync(f), permissions: perms, gitIgnored: !!execSync(`git check-ignore ${f} || true`, { encoding: "utf8" }).trim() } };
  emit("wave2-access-audit", data, `# Wave 2 access audit\n\nwave in config: ${data.waveIdInConfig} (matches study: ${data.waveMatchesStudy})\nentries: ${data.entries.map((e) => `${e.testerId} (${e.role}${e.cohort ? ", " + e.cohort : ""}, v${e.keyVersion}${e.enabled ? "" : ", REVOKED"})`).join("; ")}\nWave 1 entries present: ${data.wave1EntriesPresent}\nraw-key leaks: ${scanned ? leaks : "scan skipped (no local secret file)"} · secret file ${data.secretFile.permissions ? `${data.secretFile.permissions.dir}/${data.secretFile.permissions.file}` : "absent"} · gitignored ${data.secretFile.gitIgnored}\nfailed attempts: ${JSON.stringify(data.failedAccessAttempts)} (${data.source})`);
  if (leaks || !data.waveMatchesStudy || data.wave1EntriesPresent) process.exit(1);
}

if (mode === "readiness") {
  const j = (f) => (existsSync(`${OUT_DIR}/${f}`) ? JSON.parse(readFileSync(`${OUT_DIR}/${f}`, "utf8")) : null);
  const acc = j("night-court-v1-owner-acceptance.json"), idn = j("wave2-identity.json"), plan = j("wave2-test-plan.json"), pol = j("wave2-acceptance-policy.json"), access = j("wave2-access-contract.json"), fb = j("wave2-feedback-contract.json"), tel = j("wave2-telemetry-contract.json"), alias = j("wave2-stable-alias-qa.json"), bp = j("wave2-branch-preview-qa.json"), w1 = j("wave1-baseline-preservation.json"), audit = j("wave2-access-audit.json");
  const checks = {
    ownerAcceptanceRecorded: acc?.acceptanceText === "APPROVE NIGHT COURT V1" && acc.themeStatus === "OWNER_ACCEPTED_FOR_PRIVATE_BETA",
    wave2IdentityFrozen: idn?.status === "FROZEN" && idn.waveId === W, testPlanFrozen: plan?.status?.startsWith("FROZEN") === true, acceptancePolicyFrozen: pol?.status?.startsWith("FROZEN") === true,
    feedbackSchemaFrozen: fb?.status === "FROZEN", telemetryContractFrozen: tel?.status === "FROZEN",
    credentials: access?.counts?.owner === 1 && access?.counts?.firstTime === 3 && access?.counts?.returning === 2 && access.status === "FROZEN",
    rawKeysNotTracked: audit ? audit.data.rawKeyLeakScan.leaks === 0 : null, wave1EntriesAbsent: audit ? audit.data.wave1EntriesPresent === 0 : null,
    branchPreviewQaPassed: bp ? bp.failed === 0 : null, stableAliasVerified: alias ? alias.failed === 0 : null, wave1Preserved: !!w1 && (alias ? alias.wave1Unchanged === true : null),
    humanTestingStarted: false, distributionAuthorized: acc?.wave2DistributionAuthorized === true,
  };
  const pending = Object.entries(checks).filter(([k, v]) => v !== true && k !== "humanTestingStarted" && k !== "distributionAuthorized").map(([k]) => k);
  const state = pending.length ? "NOT_READY" : checks.distributionAuthorized ? "DISTRIBUTION_AUTHORIZED — the owner may send the prepared invitations manually" : "READY_FOR_OWNER_DISTRIBUTION";
  const data = { source: source(), state, checks, pending, stableWave2Url: alias?.aliasUrl ?? null, keyFile: ".preview-secrets/wave2-access-keys.json", invitationsPrepared: access ? access.entries.filter((e) => e.role !== "owner").map((e) => `${e.testerId} (${e.cohort})`) : [], nextOwnerDecision: "AUTHORIZE WAVE 2 DISTRIBUTION" };
  emit("wave2-readiness", data, `# Wave 2 readiness\n\nstate: **${state}**\n${Object.entries(checks).map(([k, v]) => `- ${k}: ${v === true ? "yes" : v === false ? "no" : "pending"}`).join("\n")}\n${pending.length ? `pending: ${pending.join(", ")}` : "no pending items"}\nhuman testing started: no · distribution authorized: ${checks.distributionAuthorized ? "yes (owner, manual send)" : "no"}`);
}

import { statSync as require_stat } from "node:fs";
if (!["feedback", "metrics", "access", "readiness"].includes(mode)) { console.error("usage: node scripts/wave2/report.mjs <feedback|metrics|access|readiness> [--fixture=path] [--format=json|md|both]"); process.exit(2); }
