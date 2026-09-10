// Preview isolation + credential check (Workstream 2 verification).
//   node scripts/ui-release/previewIsolationCheck.mjs <previewUrl> [outDir]
// As an operator (owner key from .preview-secrets, sent as X-Preview-Key): the
// preview must name the PREVIEW project in browser and server, its server
// credential must be accepted, account surfaces must answer, anonymous protected
// reads must still be refused, and nothing on the preview may name production.
import { chromium } from "@playwright/test"; import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const BASE = (process.argv[2] || "").replace(/\/$/, ""); const OUT = process.argv[3] || "data/validation/closeout"; mkdirSync(OUT, { recursive: true });
if (!BASE) { console.error("preview url required"); process.exit(2); }
const PROD = "dxdtnhdeaanhfoqngdel", PREV = "lfybiphmqkiecfrqsfzt";
const keys = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys; const owner = keys.find((k) => k.role === "owner").key;
const b = await chromium.launch(); const rows = []; let fails = 0;
const ok = (name, pass, fact = "") => { if (!pass) fails++; rows.push({ name, pass: !!pass, fact: String(fact).slice(0, 200) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${fact ? ` — ${fact}` : ""}`); };
const op = await b.newContext(); await op.request.post(`${BASE}/api/preview-access`, { form: { key: owner }, maxRedirects: 0 });
const h = await (await op.request.get(`${BASE}/api/health?deep=1`, { headers: { "x-preview-key": owner } })).json(); const d = h.diagnostics || {};
ok("this is a preview deployment", d.environment === "preview", d.environment);
ok("server and browser name the same project", d.serverAndBrowserSameProject === true);
ok("the preview is NOT pointed at production", d.previewPointedAtProduction === false);
ok("the provider accepts the preview server credential", d.serverCredentialAccepted === true, `probe ${d.serverCredentialProbeStatus}`);
ok("account features are ready on the preview", h.cloudAccounts?.ready === true && h.cloudAccounts?.enabled === true, JSON.stringify(h.cloudAccounts));
const html = await (await op.request.get(`${BASE}/`)).text(); const asset = (html.match(/assets\/index-[\w-]+\.js/) || [])[0]; const js = asset ? await (await op.request.get(`${BASE}/${asset}`)).text() : "";
const hosts = [...new Set(js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/g) || [])];
ok("the browser bundle names the PREVIEW project only", hosts.length === 1 && hosts[0].includes(PREV) && !js.includes(PROD), JSON.stringify(hosts));
const lb = await op.request.post(`${BASE}/api/profile`, { data: { action: "competitive-leaderboard" }, headers: { "content-type": "application/json" }, failOnStatusCode: false });
ok("the leaderboard answers 200 on the preview", lb.status() === 200, `${lb.status()} ${(await lb.text()).slice(0, 80)}`);
const pp = await op.request.post(`${BASE}/api/profile`, { data: { action: "profile-public", slug: "00000000000000000000" }, headers: { "content-type": "application/json" }, failOnStatusCode: false });
ok("a public-profile lookup answers 200 (found:false) — no 502", pp.status() === 200 && /"found":false/.test(await pp.text()), `${pp.status()}`);
const anon = await op.request.post(`${BASE}/api/profile`, { data: { action: "progression-get" }, headers: { "content-type": "application/json" }, failOnStatusCode: false });
ok("anonymous protected reads are still refused", anon.status() === 401, `${anon.status()}`);
const forged = await op.request.post(`${BASE}/api/profile`, { data: { action: "progression-get" }, headers: { "content-type": "application/json", authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, failOnStatusCode: false });
ok("a forged token is refused", forged.status() === 401, `${forged.status()}`);
// the My EraClash surface renders (signed out: the account invitation, no error state)
const p = await op.newPage(); await p.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" }); const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
ok("My EraClash renders without an error state", /My EraClash/.test(t) && !/could not be loaded|Something went wrong/i.test(t));
await p.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" }); const t2 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
ok("the Leaderboard page loads its rows (or an honest empty state), not the failure card", /Challenge Rating/.test(t2) && !/could not be loaded/i.test(t2), t2.slice(0, 120));
await b.close();
writeFileSync(`${OUT}/preview-isolation-check.json`, JSON.stringify({ artifact: "preview-isolation-check", origin: BASE, recordedAt: new Date().toISOString(), diagnostics: { environment: d.environment, serverAndBrowserSameProject: d.serverAndBrowserSameProject, previewPointedAtProduction: d.previewPointedAtProduction, serverCredentialAccepted: d.serverCredentialAccepted, probe: d.serverCredentialProbeStatus }, browserHosts: hosts, checks: rows, pass: fails === 0 }, null, 2) + "\n");
console.log(`\npreview isolation: ${rows.length - fails}/${rows.length} — ${fails ? "FAIL" : "PASS"}`); process.exit(fails ? 1 : 0);
