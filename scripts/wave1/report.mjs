// ── Wave 1 operator reports ───────────────────────────────────────────────────
// Usage: node scripts/wave1/report.mjs <feedback|metrics|access> [--fixture=path] [--out=path]
// Data comes from the preview KV store (set UPSTASH_REDIS_REST_URL/TOKEN or the
// KV_REST_API_* pair — the same credentials the deployment uses). Without a
// store the reports run in explicit EMPTY-DATA mode. --fixture injects records
// for verification without touching any store. Pseudonymous ids only — no
// keys, no emails, no IPs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { hasStore, cmd, getJSON } from "../../api/_lib/store.js";
import { PREVIEW_ACCESS } from "../../config/previewAccess.js";

const [, , mode] = process.argv;
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || null;
const OUT_DIR = "data/validation/6c6";
mkdirSync(OUT_DIR, { recursive: true });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const dist = (xs) => { const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; for (const x of xs) d[x] = (d[x] ?? 0) + 1; return d; };

// primary records win: latest revision per tester/result (applies to fixtures
// too, so dedup behavior is verifiable without a store).
const dedupPrimary = (rows) => {
  const primary = new Map();
  for (const r of rows) {
    const k = `${r.resultId}:${r.testerId ?? r.uid ?? "anon"}`;
    if (!primary.has(k) || (r.revision ?? 1) > (primary.get(k).revision ?? 1)) primary.set(k, r);
  }
  return [...primary.values()];
};
const loadFeedback = async () => {
  const fx = arg("fixture");
  if (fx) return { source: "fixture", rows: dedupPrimary(JSON.parse(readFileSync(fx, "utf8"))) };
  if (!hasStore()) return { source: "EMPTY_DATA (no store credentials in this shell)", rows: [] };
  const raw = (await cmd("LRANGE", "preview-feedback:log", 0, 9999)) ?? [];
  const rows = raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  return { source: "kv", rows: dedupPrimary(rows) };
};
const counters = async () => (hasStore() ? Object.fromEntries(
  Object.entries((await cmd("HGETALL", "preview-metrics:counters")) ?? {}).map(([k, v]) => [k, Number(v)]),
) : {});

const emit = (name, data, md) => {
  const file = `${OUT_DIR}/${name}.json`;
  writeFileSync(file, JSON.stringify({ artifact: name, generatedBy: `node scripts/wave1/report.mjs ${mode}`, data }, null, 2) + "\n");
  console.log(md);
  console.log(`\n→ ${file}`);
};

if (mode === "feedback") {
  const { source, rows } = await loadFeedback();
  const R = (f) => rows.map((r) => r[f]).filter((v) => Number.isInteger(v));
  const byTester = {}; const byScenario = {}; const categories = {}; const negatives = [];
  for (const r of rows) {
    const t = r.testerId ?? "unattributed";
    byTester[t] = (byTester[t] ?? 0) + 1;
    byScenario[r.scenarioId ?? "FREE_FORM"] = (byScenario[r.scenarioId ?? "FREE_FORM"] ?? 0) + 1;
    categories[r.issueCategory ?? "NONE"] = (categories[r.issueCategory ?? "NONE"] ?? 0) + 1;
    if ((r.resultBelievability ?? 5) <= 2 || (r.issueCategory && r.issueCategory !== "NONE")) {
      negatives.push({ resultId: r.resultId, testerId: t, scenarioId: r.scenarioId, category: r.issueCategory, comment: r.optionalComment ?? null });
    }
  }
  const comments = rows.map((r) => (r.optionalComment ?? "").toLowerCase().trim()).filter(Boolean);
  const repeated = Object.entries(comments.reduce((m, c) => (m[c] = (m[c] ?? 0) + 1, m), {})).filter(([, n]) => n > 1);
  const c = await counters();
  const data = { source, waveId: "candidate3-wave1", feedbackRecords: rows.length,
    testerParticipation: byTester, scenarioCompletion: byScenario,
    guidedRecords: rows.filter((r) => /^w1-s/.test(r.scenarioId ?? "")).length,
    freeFormRecords: rows.filter((r) => (r.scenarioId ?? "FREE_FORM") === "FREE_FORM").length,
    rematchAnswers: { yes: c.would_rematch_yes ?? 0, no: c.would_rematch_no ?? 0 },
    medians: { resultBelievability: median(R("resultBelievability")), teamIdentityFeltAccurate: median(R("teamIdentityFeltAccurate")),
      coachDifferenceFeltMeaningful: median(R("coachDifferenceFeltMeaningful")), eraStyleFeltMeaningful: median(R("eraStyleFeltMeaningful")),
      postgameExplanationHelpful: median(R("postgameExplanationHelpful")) },
    distributions: { resultBelievability: dist(R("resultBelievability")) },
    issueCategories: categories, repeatedComments: repeated, negativeResultIds: negatives,
    candidateId: rows[0]?.candidateId ?? "Candidate 3", fallbackInvocations: c.fallback_invoked ?? 0 };
  emit("candidate3-wave1-feedback-report", data,
    `# Wave 1 feedback report\n\nsource: ${source} · records: ${rows.length}\n` +
    `medians: believability ${data.medians.resultBelievability ?? "—"} · team ${data.medians.teamIdentityFeltAccurate ?? "—"} · coach ${data.medians.coachDifferenceFeltMeaningful ?? "—"} · era ${data.medians.eraStyleFeltMeaningful ?? "—"} · postgame ${data.medians.postgameExplanationHelpful ?? "—"}\n` +
    `testers: ${JSON.stringify(byTester)}\nscenarios: ${JSON.stringify(byScenario)}\ncategories: ${JSON.stringify(categories)}\nnegative results: ${negatives.length}`);
}

if (mode === "metrics") {
  const c = await counters();
  const { rows } = await loadFeedback();
  const started = c.games_started ?? 0, completed = c.games_completed ?? 0;
  const scen = hasStore() ? ((await cmd("HGETALL", "preview-metrics:scenario-feedback")) ?? {}) : {};
  const data = { source: hasStore() ? "kv" : "EMPTY_DATA (no store credentials in this shell)",
    sessionsStarted: c.sessions_started ?? 0, gamesStarted: started, gamesCompleted: completed,
    completionRate: started ? +(completed / started).toFixed(4) : null,
    fallbackInvoked: c.fallback_invoked ?? 0, fallbackRate: started ? +((c.fallback_invoked ?? 0) / started).toFixed(4) : null,
    feedbackSubmitted: c.feedback_submitted ?? 0, feedbackResubmitted: c.feedback_resubmitted ?? 0,
    feedbackRate: completed ? +((c.feedback_submitted ?? 0) / completed).toFixed(4) : null,
    rematchAnswers: { yes: c.would_rematch_yes ?? 0, no: c.would_rematch_no ?? 0 },
    scenarioFeedback: scen,
    latency: { avgMs: completed ? Math.round((c.latency_ms_sum ?? 0) / completed) : null,
      buckets: { lt250: c.latency_lt250 ?? 0, lt500: c.latency_lt500 ?? 0, lt1000: c.latency_lt1000 ?? 0, lt2000: c.latency_lt2000 ?? 0, gte2000: c.latency_gte2000 ?? 0 } },
    accessDenied: { badKey: c.access_denied_key ?? 0, expired: c.access_denied_expired ?? 0, revoked: c.access_denied_revoked ?? 0 },
    feedbackRecordsSeen: rows.length };
  emit("candidate3-wave1-product-metrics", data,
    `# Wave 1 product metrics\n\nsource: ${data.source}\nsessions ${data.sessionsStarted} · games ${started}→${completed} (rate ${data.completionRate ?? "—"}) · fallback ${data.fallbackInvoked} · feedback ${data.feedbackSubmitted} · avg latency ${data.latency.avgMs ?? "—"}ms`);
}

if (mode === "access") {
  const c = await counters();
  const active = PREVIEW_ACCESS.keys.filter((k) => k.enabled !== false);
  const sessionsByTester = {};
  for (const k of PREVIEW_ACCESS.keys) sessionsByTester[k.testerId] = c[`sessions_${k.testerId}`] ?? 0;
  // raw-key leakage scan: every raw key in the local secret file must appear
  // nowhere in the repository or generated artifacts.
  let leaks = 0; let scanned = false;
  try {
    const secret = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8"));
    const { execSync } = await import("node:child_process");
    scanned = true;
    for (const k of secret.keys) {
      const hits = execSync(`grep -rIl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.preview-secrets -e "${k.key}" . || true`, { encoding: "utf8" }).trim();
      if (hits) { leaks++; console.error(`LEAK: key for ${k.testerId} found in:\n${hits}`); }
    }
  } catch { /* no local secret file: scan skipped, reported below */ }
  const data = { accessConfigVersion: PREVIEW_ACCESS.accessConfigVersion,
    activeTesterIds: active.map((k) => k.testerId),
    revokedTesterIds: PREVIEW_ACCESS.keys.filter((k) => k.enabled === false).map((k) => k.testerId),
    keyVersions: [...new Set(PREVIEW_ACCESS.keys.map((k) => k.keyVersion))],
    sessionsStartedByTester: sessionsByTester,
    failedAccessAttempts: { badKey: c.access_denied_key ?? 0, expiredSession: c.access_denied_expired ?? 0, revokedSession: c.access_denied_revoked ?? 0 },
    rawKeyLeakScan: { scanned, leaks },
    source: hasStore() ? "kv" : "EMPTY_DATA for counters (no store credentials in this shell)" };
  emit("candidate3-wave1-access-audit", data,
    `# Wave 1 access audit\n\nactive: ${data.activeTesterIds.join(", ")}\nrevoked: ${data.revokedTesterIds.join(", ") || "none"}\nkey versions: ${data.keyVersions}\nraw-key leaks: ${scanned ? leaks : "scan skipped (no local secret file)"}\nfailed attempts: ${JSON.stringify(data.failedAccessAttempts)}`);
  if (leaks) process.exit(1);
}
if (!["feedback", "metrics", "access"].includes(mode)) { console.error("usage: node scripts/wave1/report.mjs <feedback|metrics|access>"); process.exit(2); }
