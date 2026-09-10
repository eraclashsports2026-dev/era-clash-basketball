// A guest has three Chaos runs on a device. Spend them through the API in a
// fresh browser context, then tap ROLL on the phone and record what the board
// offers: the fourth start must be refused (403, gated) and the board must show
// the account gate — not an error, not a fourth draft.
//   node scripts/ui-release/guestLimitProbe.mjs <baseUrl> <outDir>
import { chromium } from "@playwright/test"; import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, ""); const OUT = process.argv[3] || "data/validation/audit"; mkdirSync(`${OUT}/screens`, { recursive: true });
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (BASE.startsWith("https://")) { const probe = await ctx.request.get(`${BASE}/api/health`).catch(() => null); if (!probe || probe.status() !== 200) { const k = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((x) => x.role === "owner"); await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 }); } }
const p = await ctx.newPage(); await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); } catch {} });
await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const post = (body) => p.evaluate(async (body) => { const r = await fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; }, body);
const starts = [];
for (let i = 1; i <= 4; i++) { const s = await post({ chaosAction: "start", tier: "GUEST" }); starts.push({ n: i, status: s.status, used: s.json?.guestRunsUsed ?? null, gated: !!s.json?.gated }); const id = s.json?.chaos?.chaosRunId; if (id) await post({ chaosAction: "abandon", chaosRunId: id, tier: "GUEST" }); }
await p.goto(`${BASE}/play/chaos`, { waitUntil: "networkidle" }); await p.waitForSelector('.ec-ta-stage[data-guided-state="EMPTY"]', { timeout: 60_000 });
await p.getByRole("button", { name: /^ROLL/ }).tap(); await p.waitForTimeout(2500);
const ui = await p.evaluate(() => ({ state: document.querySelector(".ec-ta-stage")?.dataset.guidedState || null, gateShown: /FREE ACCOUNT REQUIRED|Create a free account/i.test(document.body.innerText), signInOffered: /SIGN IN/i.test(document.body.innerText), deviceAccountOffered: /lives on this device/i.test(document.body.innerText), alert: document.querySelector("[role=alert]")?.innerText || null, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400) }));
await p.screenshot({ path: `${OUT}/screens/guest-limit-phone.png` }); await b.close();
const pass = starts.slice(0, 3).every((s) => s.status === 200) && starts[3].status === 403 && starts[3].gated && ui.gateShown && !ui.state && !ui.alert;
const rec = { artifact: "guest-limit-probe", origin: BASE, recordedAt: new Date().toISOString(), starts, ui, pass };
writeFileSync(`${OUT}/guest-limit-probe.json`, JSON.stringify(rec, null, 2) + "\n");
console.log(`${pass ? "PASS" : "FAIL"}  three guest runs, the fourth start is refused (${starts[3].status}), and the board shows the account gate${ui.signInOffered ? " (sign-in offered)" : ui.deviceAccountOffered ? " (device account — no provider on this origin)" : ""}`);
console.log(JSON.stringify(rec.ui).slice(0, 300)); process.exit(pass ? 0 : 1);
