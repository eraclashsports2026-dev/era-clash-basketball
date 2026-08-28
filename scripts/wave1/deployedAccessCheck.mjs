// Deployed rotated-access verification. Reads raw keys from the local secret
// file; prints only tester ids and pass/fail — never a key.
import { readFileSync, writeFileSync } from "node:fs";
const BASE = process.argv[2] ?? "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const { keys } = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8"));
let pass = 0, fail = 0; const gates = [];
const gate = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` … ${detail}` : ""}`); gates.push({ name, ok, detail }); ok ? pass++ : fail++; };

const status = async (path, opts = {}) => { const r = await fetch(`${BASE}${path}`, opts); return r; };

// 1. Exposed v1 keys are dead.
for (const [label, old] of [["v1-owner", "c3db0203453b5ff57285ec6bc0d08453"], ["v1-tester", "5866914beb2a928b06d1840fcf3fc581"]]) {
  const r = await status("/api/health", { headers: { "x-preview-key": old } });
  gate(`old ${label} key unauthorized`, r.status === 401);
  const x = await status("/api/preview-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: old }) });
  gate(`old ${label} key exchange denied`, x.status === 401);
}
// 2. Every new key works per role; session cookie is a signed session.
for (const k of keys) {
  const r = await status("/api/preview-access", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k.key }) });
  const sc = r.headers.get("set-cookie") ?? "";
  const ok = r.status === 303 && /pv_session=v2\./.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Max-Age=604800/.test(sc)
    && !sc.includes(k.key);
  gate(`${k.testerId} (…${k.sha256.slice(-4)}) exchange → signed session, no raw key in cookie`, ok);
  const session = (sc.match(/pv_session=([^;]+)/) ?? [])[1];
  const h = await status("/api/health", { headers: { cookie: `pv_session=${session}` } });
  gate(`${k.testerId} session admits`, h.status === 200);
}
// 3. Garbage/tampered sessions refused.
gate("tampered session refused", (await status("/api/health", { headers: { cookie: "pv_session=v2.eyJ2IjoyfQ.AAAA" } })).status === 401);
gate("no credentials refused", (await status("/api/health")).status === 401);
// 4. Candidate 3 active via owner header; unattributed telemetry avoided (identity present).
const owner = keys.find((k) => k.role === "owner");
const health = await (await status("/api/health", { headers: { "x-preview-key": owner.key } })).json();
gate("Candidate 3 active at the stable address", health.preview?.enabled === true && health.preview.candidateCoreHash?.startsWith("6a423d4f"));
console.log(`\naccess check: ${pass} passed, ${fail} failed`);
writeFileSync("data/validation/6c6/candidate3-wave1-access-control.json", JSON.stringify({
  artifact: "candidate3-wave1-access-control", generatedBy: "node scripts/wave1/deployedAccessCheck.mjs", baseUrl: BASE,
  data: { passed: pass, failed: fail, gates,
    sessionModel: "HMAC-signed pv_session (v2), 7d expiry, HttpOnly/Secure/Lax; revocation and rotation kill issued sessions on next request; raw key never stored in the browser",
    unitCoverage: "expiry, tampering, wrong-secret, revocation, role-escalation, fail-closed — tests/v6c6-wave1.test.js" } }, null, 2) + "\n");
process.exit(fail ? 1 : 0);
