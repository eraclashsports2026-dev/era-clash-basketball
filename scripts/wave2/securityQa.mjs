#!/usr/bin/env node
// ── Wave 2 security QA (Phase 9A.3) ──────────────────────────────────────────
//   node scripts/wave2/securityQa.mjs
// Exercises the LIVE access code (config/previewAccess.js + previewAccessCheck.js)
// with a test signing secret: Wave 2 keys admit with their cohort, every Wave 1
// key is refused, sessions are wave-bound, and expiry / tampering / ghost /
// rotation / escalation / disabled-entry all kill a session. Namespace and raw-key
// pins are checked against the source. Nothing here touches a store or prints a key.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
process.env.PREVIEW_SESSION_SECRET = "wave2-security-qa-secret";
const { PREVIEW_ACCESS } = await import("../../config/previewAccess.js");
const { verifyPreviewKey, verifySession, signSession, previewIdentity, SESSION_VERSION, WAVE_ID, COOKIE_NAME } = await import("../../api/_lib/previewAccessCheck.js");
const { validateWave2Feedback } = await import("../../api/feedback.js");
const { wave2PartitionKey } = await import("../../api/events.js");
const { WAVE2, WAVE2_TELEMETRY_EVENTS } = await import("../../src/wave2.js");

const checks = []; const ok = (n, p, d = "") => { checks.push({ name: n, pass: !!p, detail: String(d) }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const read = (f) => readFileSync(f, "utf8");
const w2 = existsSync(".preview-secrets/wave2-access-keys.json") ? JSON.parse(read(".preview-secrets/wave2-access-keys.json")).keys : null;
const w1 = existsSync(".preview-secrets/wave1-access-keys.json") ? JSON.parse(read(".preview-secrets/wave1-access-keys.json")).keys : null;

ok("the allowlist is the Wave 2 pool: 1 owner + 3 first-time + 2 returning, config v3, wave id bound", PREVIEW_ACCESS.waveId === WAVE2.waveId && PREVIEW_ACCESS.accessConfigVersion === 3 && PREVIEW_ACCESS.keys.length === 6 && PREVIEW_ACCESS.keys.filter((k) => k.cohort === "first-time").length === 3 && PREVIEW_ACCESS.keys.filter((k) => k.cohort === "returning").length === 2 && WAVE_ID === WAVE2.waveId);
if (w2) {
  let admit = 0; for (const k of w2) { const r = await verifyPreviewKey(k.key); if (r.ok && r.testerId === k.testerId && r.cohort === k.cohort && r.waveId === WAVE2.waveId) admit++; }
  ok("correct Wave 2 keys admit with their cohort and wave", admit === 6, `${admit}/6`);
} else ok("correct Wave 2 keys admit (local key file present)", false, "no .preview-secrets/wave2-access-keys.json on this machine");
ok("a wrong key refuses; a malformed key refuses", !(await verifyPreviewKey("00000000000000000000000000000000")).ok && !(await verifyPreviewKey("not-a-key")).ok);
if (w1) { let refused = 0; for (const k of w1) if (!(await verifyPreviewKey(k.key)).ok) refused++; ok(`every Wave 1 key (${w1.length}, owner included) refuses on Wave 2`, refused === w1.length, `${refused}/${w1.length}`); }
ok("Wave 2 keys are absent from the Wave 1 allowlist (source of the frozen wave1 branch)", (() => { const cfg = execSync("git show origin/wave1:config/previewAccess.js", { encoding: "utf8" }); return PREVIEW_ACCESS.keys.every((k) => !cfg.includes(k.sha256)); })());

const live = PREVIEW_ACCESS.keys.find((k) => k.testerId === "wave2-returning-01"); const entry = { testerId: live.testerId, role: live.role, keyVersion: live.keyVersion };
const tok = await signSession(entry); const payload = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
ok("a session is v3, names its wave, carries no key or hash, and verifies with cohort", tok.startsWith(`v${SESSION_VERSION}.`) && payload.wave === WAVE2.waveId && !/[a-f0-9]{32}/.test(JSON.stringify(payload)) && (await verifySession(tok)).cohort === "returning");
ok("a Wave 1-format (v2) session refuses (wrong-version)", (await verifySession("v2.eyJ2IjoyLCJ0ZXN0ZXJJZCI6Im93bmVyIiwicm9sZSI6Im93bmVyIn0.AAAA")).reason === "wrong-version");
{ const [, body, mac] = tok.split("."); const p = JSON.parse(Buffer.from(body, "base64url").toString()); p.wave = "candidate3-wave1"; ok("a session body rewritten to another wave fails the signature", (await verifySession(`v3.${Buffer.from(JSON.stringify(p)).toString("base64url")}.${mac}`)).reason === "bad-signature"); }
ok("an expired session refuses", (await verifySession(await signSession(entry, Date.now() - 8 * 24 * 3600 * 1000))).reason === "expired");
ok("a tampered signature refuses", (await verifySession(tok.slice(0, -3) + "xxx")).reason === "bad-signature");
ok("a ghost tester refuses (revoked)", (await verifySession(await signSession({ testerId: "wave2-new-09", role: "tester", keyVersion: 1 }))).reason === "revoked");
ok("key-version rotation kills the old session (revoked)", (await verifySession(await signSession({ ...entry, keyVersion: entry.keyVersion + 1 }))).reason === "revoked" && (await verifySession(await signSession({ ...entry, keyVersion: 0 }))).reason === "revoked");
ok("a tester cannot escalate to owner (revoked)", (await verifySession(await signSession({ ...entry, role: "owner" }))).reason === "revoked");
ok("revocation: every verification re-checks the entry's enabled flag, so setting enabled:false kills issued sessions (predicate pinned in source)", /enabled !== false && x\.keyVersion === p\.keyVersion/.test(read("api/_lib/previewAccessCheck.js")) && /entryFor\(\(k\) => k\.sha256 === h && k\.enabled !== false\)/.test(read("api/_lib/previewAccessCheck.js")));
ok("the HMAC secret is wave-bound", /pv-session-v\$\{SESSION_VERSION\}\|\$\{m\}\|\$\{WAVE_ID\}/.test(read("api/_lib/previewAccessCheck.js")));
ok("previewIdentity resolves cohort and wave from the session, else refuses", (await previewIdentity({ cookie: `${COOKIE_NAME}=${encodeURIComponent(tok)}` })).cohort === "returning" && !(await previewIdentity({})).ok);
ok("Wave 2 feedback: client identity fields never validate; result-bound tasks require a preview result id", (() => { const r = validateWave2Feedback({ taskId: "N1", ratings: { startingClarity: 5, modeChoiceClarity: 5, visualComfort: 5, visualPremiumQuality: 5, brandDistinctiveness: 5 }, testerId: "spoof", waveId: "x" }); return r && r.testerId === undefined && r.waveId === undefined && validateWave2Feedback({ taskId: "N2", ratings: { draftClarity: 5, eraClarity: 5, coachChoiceClarity: 5, resultClarity: 5, visualComfort: 5 } }) === null; })());
ok("Wave 2 data writes only wave2-* keys; Wave 1 namespaces are never written on this branch's wave2 paths", (() => { const fb = read("api/feedback.js").split('if (b.kind === "wave2")')[1].split('if (b.kind === "preview")')[0]; const ev = read("api/events.js"); return /wave2-feedback:/.test(fb) && !/preview-feedback:|preview-metrics:/.test(fb) && !/preview-metrics:/.test(ev) && /wave2-metrics:/.test(ev); })());
ok("telemetry partition key is wave/cohort/tester/build and rejects a malformed build", wave2PartitionKey(WAVE2.waveId, "first-time", "wave2-new-01", "abcdef") === `wave2-metrics:${WAVE2.waveId}:first-time:wave2-new-01:abcdef` && wave2PartitionKey(WAVE2.waveId, null, "x", "../evil").endsWith(":unknown:x:unknown") && WAVE2_TELEMETRY_EVENTS.length >= 20);
ok("no cross-wave aggregate: api/game.js counters use the wave's namespace, never a hardcoded wave id", !/waveId: "candidate3-wave1"/.test(read("api/game.js")) && /COUNTERS = PREVIEW_ACCESS\.waveId === "candidate3-wave1" \? "preview-metrics:counters" : "wave2-metrics:counters"/.test(read("api/game.js")));
ok("the raw-key file is 0600 in a 0700 directory and gitignored; no raw key in tracked content", (() => { const f = ".preview-secrets/wave2-access-keys.json"; if (!existsSync(f)) return false; const st = (p) => (execSync(`stat -f %Lp ${p}`, { encoding: "utf8" }).trim()); const ign = execSync(`git check-ignore ${f} || true`, { encoding: "utf8" }).trim() !== ""; const leaks = w2.filter((k) => execSync(`git grep -l "${k.key}" -- . ':!.preview-secrets' || true`, { encoding: "utf8" }).trim() !== "").length; return st(".preview-secrets") === "700" && st(f) === "600" && ign && leaks === 0; })());
ok("no serverless function was added (12 routes + middleware = 13)", execSync("ls api/*.js | grep -v _lib | wc -l", { encoding: "utf8" }).trim() === "12");

const passed = checks.filter((c) => c.pass).length;
writeFileSync("data/validation/9a3/wave2-security-qa.json", JSON.stringify({ artifact: "wave2-security-qa", phase: "9A.3 — Wave 2 private beta", method: "the live allowlist and session code, exercised in-process with a test signing secret; Wave 1 and Wave 2 raw keys read from the local 0600 files and never written anywhere", checks: checks.length, passed, failed: checks.length - passed, results: checks }, null, 2) + "\n");
console.log(`\nsecurity: ${passed}/${checks.length} checks passed`); process.exit(passed === checks.length ? 0 : 1);
