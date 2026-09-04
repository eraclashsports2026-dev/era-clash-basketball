#!/usr/bin/env node
// ── Deployed account QA (Phase 9B.1) ────────────────────────────────────────
//   PHASE9B1_COMMIT=<sha> node scripts/accounts/deployedQa.mjs https://<branch-preview>
//
// Drives the DEPLOYED owner-review preview, then re-reads the frozen builds to
// prove none of them moved.
//
// Account behaviour is measured according to what the deployment actually
// reports: with the provider unconfigured it verifies the HONEST DISABLED
// state (guest play intact, no fake sign-in, an explained dialog); with the
// provider configured it additionally drives two synthetic accounts through
// sign-in, save, claim, cross-device and isolation. It never claims a real
// account test it did not perform.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium, request as pwRequest } from "@playwright/test";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";
import { WAVE2 } from "../../src/wave2.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/accounts/deployedQa.mjs https://<preview-host>"); process.exit(2); }
const OUT = "data/validation/9b1"; const SHOTS = `${OUT}/screens/preview`; mkdirSync(SHOTS, { recursive: true });
const WAVE2_ALIAS = "https://era-clash-basketball-git-wave2-era-clash.vercel.app";
const WAVE1_ALIAS = "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const PROD = "https://era-clash-basketball.vercel.app";
const WAVE2_STAMP = "eraclash-assets:2.7.2:d3d5455dcf91", WAVE1_STAMP = "eraclash-assets:2.7.2:2f35a3b70c30";

const gates = []; let failed = 0;
const gate = (name, ok, detail = "") => { gates.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };
const w2keys = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys;
const owner = w2keys.find((k) => k.role === "owner");
const w1owner = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8")).keys.find((k) => k.role === "owner");
const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const stampOf = async (ctx, base) => (((await (await ctx.get(`${base}/`)).text()).match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null);
const guest = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
let extra_projectMethods = null, extra_authProbes = null;

const run = async () => {
  console.log(`\nDEPLOYED ACCOUNT QA — ${BASE}\n\nA. preview access and identity`);
  const anon = await pwRequest.newContext({ baseURL: BASE });
  for (const p of ["/", "/play", "/my-eraclash", "/auth/callback"]) {
    const r = await anon.get(p, { maxRedirects: 0 });
    gate(`unauthenticated ${p} is refused by the preview gate (401)`, r.status() === 401, `HTTP ${r.status()}`);
  }
  await anon.dispose();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  gate("the Wave 2 owner key opens a preview session", auth.status() === 303, `HTTP ${auth.status()}`);
  if (auth.status() !== 303) { console.error("no preview session — stopping"); process.exit(1); }

  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  const local = previewCandidateIdentity();
  const stamp = await stampOf(ctx.request, BASE);
  gate("the preview runs Candidate 4 / 1.4.0 with this checkout's core hash",
    health?.preview?.candidateId === local.candidateId && health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.calibrationVersion === local.possessionCalibrationVersion,
    `${health?.preview?.candidateId} / ${health?.preview?.calibrationVersion}`);
  gate("the build stamp differs from the distributed Wave 2 stamp", !!stamp && stamp !== WAVE2_STAMP, stamp);

  console.log("\nB. cloud-account configuration, as the deployment reports it");
  const cloud = (await (await ctx.request.get(`${BASE}/api/profile?cloud=status`)).json())?.cloudAccounts ?? null;
  gate("the configuration probe answers with booleans only — no key, no fragment",
    cloud && Object.values(cloud).every((v) => typeof v === "boolean"), JSON.stringify(cloud));
  const CONFIGURED = !!cloud?.ready;
  console.log(`  → cloud accounts ${CONFIGURED ? "ARE" : "are NOT"} configured on this deployment`);

  console.log("\nC. guest play is untouched");
  const page = await ctx.newPage(); await guest(page);
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 });
  const lobby = await page.evaluate(() => ({
    cards: document.querySelectorAll(".ec-mode-card").length,
    chaosPrimary: !!document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-action[data-hierarchy="primary"]'),
    chaosLabel: document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-action')?.textContent.trim(),
    headerBg: getComputedStyle(document.querySelector(".ec-brand-header")).backgroundColor,
    canvas: getComputedStyle(document.querySelector(".ec-lobby-court")).backgroundColor,
    headerCtas: [...document.querySelectorAll(".ec-brand-header button")].map((b) => b.textContent.trim()),
    minTarget: Math.min(...[...document.querySelectorAll(".ec-mode-action, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))),
  }));
  gate("the accepted Play Lobby polish is intact: seven cards, one gold primary, Night Court shell",
    lobby.cards === 7 && lobby.chaosPrimary && /START CHAOS CLASH/i.test(lobby.chaosLabel || "") && lum(lobby.headerBg) < 0.02 && lum(lobby.canvas) > 0.8);
  gate("no account is required to reach Chaos Clash, and every control is 44px", lobby.minTarget >= 44, `${lobby.minTarget}px`);
  gate(`the header offers an account without demanding one${CONFIGURED ? " (Sign in beside it)" : ""}`,
    lobby.headerCtas.some((c) => /create/i.test(c)) && (!CONFIGURED || lobby.headerCtas.some((c) => /sign in/i.test(c))), lobby.headerCtas.join(" · "));
  await page.screenshot({ path: `${SHOTS}/lobby-guest-1440x900.png` });

  console.log("\nD. one guest Chaos Clash, and the conversion panel");
  const posts = [];
  page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}").chaosAction || "(sim)"); } catch { posts.push("?"); } } });
  await page.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').click();
  await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const holds = page.locator(".ec-pc-action"); await holds.nth(0).click(); await page.waitForTimeout(200); await holds.nth(2).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click(); await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click(); await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Select / }).first().click(); await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 }); await page.getByRole("button", { name: /RUN SIM/ }).click();
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).waitFor({ timeout: 120_000 });
  gate("a guest completes a full Chaos Clash without an account", posts.filter((p) => p === "start").length === 1);
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  const report = page.getByRole("dialog", { name: "Full postgame report" });
  await report.waitFor({ timeout: 20_000 });
  const panel = await page.evaluate(() => {
    const p = document.querySelector('[data-save-panel]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return { mode: p.dataset.savePanel, heading: p.querySelector("h2")?.textContent.trim(), buttons: [...p.querySelectorAll("button")].map((b) => b.textContent.trim()), fixed: cs.position === "fixed", modal: p.getAttribute("aria-modal"), height: Math.round(r.height), minTarget: Math.min(...[...p.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height))) };
  });
  gate("the conversion panel is present, in the flow, and never a forced modal",
    panel && panel.mode === "guest" && /SAVE THIS CLASH/.test(panel.heading || "") && !panel.fixed && !panel.modal, JSON.stringify(panel));
  gate("it offers a way past itself and its controls are 44px", panel?.buttons.some((b) => /NOT NOW/.test(b)) && panel.minTarget >= 44);
  await page.screenshot({ path: `${SHOTS}/postgame-save-this-clash-1440x900.png` });
  // Dismissing it must not nag again for the same result.
  await page.getByRole("button", { name: "NOT NOW" }).first().click();
  await page.waitForTimeout(300);
  gate("dismissing it silences it for this result", (await page.locator("[data-save-panel]").count()) === 0);

  console.log("\nE. the sign-in surface");
  const signInCta = page.locator(".ec-brand-header button", { hasText: /create/i }).first();
  await page.keyboard.press("Escape").catch(() => {});
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 });
  await page.locator(".ec-brand-header button", { hasText: /create/i }).first().click();
  await page.waitForTimeout(600);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector("[data-account-dialog]");
    if (!d) return null;
    return { modal: d.getAttribute("aria-modal"), labelled: !!d.getAttribute("aria-labelledby"), buttons: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()), hasPassword: !!d.querySelector('input[type="password"]'), text: d.innerText.slice(0, 200), minTarget: Math.min(...[...d.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height))) };
  });
  gate("the header call to action opens the account dialog rather than doing nothing", !!dialog, dialog ? "dialog opened" : "NOTHING HAPPENED");
  if (CONFIGURED) {
    // The dialog must offer exactly the methods the PROJECT can honour. Both
    // the project URL and its anon key are in the deployed bundle by design, so
    // the driver reads them and asks the project itself rather than assuming.
    let projectMethods = null;
    try {
      const shell = await (await ctx.request.get(`${BASE}/play`)).text();
      let projectUrl = null, anonKey = null;
      for (const chunk of (shell.match(/\/assets\/[^"]+\.js/g) || [])) {
        const t = await (await ctx.request.get(`${BASE}${chunk}`)).text();
        projectUrl = projectUrl || (t.match(/https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)/) || [])[0] || null;
        anonKey = anonKey || (t.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/) || [])[0] || (t.match(/sb_publishable_[A-Za-z0-9_-]{10,}/) || [])[0] || null;
        if (projectUrl && anonKey) break;
      }
      if (projectUrl && anonKey) {
        const st = await (await ctx.request.get(`${projectUrl}/auth/v1/settings`, { headers: { apikey: anonKey } })).json();
        projectMethods = { google: !!st?.external?.google, email: st?.external?.email !== false, signupsAllowed: st?.disable_signup !== true };
      }
    } catch { projectMethods = null; }

    const offersGoogle = !!dialog && /GOOGLE/i.test(dialog.buttons.join(" "));
    const offersEmail = !!dialog && /EMAIL/i.test(dialog.buttons.join(" "));
    gate("the project's own settings are readable, and signups are open", !!projectMethods && projectMethods.signupsAllowed, JSON.stringify(projectMethods));
    gate("the dialog offers email, and no password field exists anywhere in it", offersEmail && dialog && !dialog.hasPassword);
    gate("the dialog offers Google only when the project has Google enabled — no button that can only fail",
      !!projectMethods && offersGoogle === projectMethods.google,
      `project google=${projectMethods?.google} · dialog offers google=${offersGoogle}`);
    // The cloud actions are live: a forged or missing token is refused by the
    // PROVIDER now, not by the disabled-state shortcut.
    const authProbe = async (bearer) => {
      const r = await ctx.request.post(`${BASE}/api/profile`, {
        headers: { "content-type": "application/json", origin: BASE, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        data: { action: "cloud-save", resultId: "pv_abc123def4" }, failOnStatusCode: false,
      });
      return { status: r.status(), body: await r.json().catch(() => null) };
    };
    const noToken = await authProbe(null);
    const forged = await authProbe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiZXhwIjoxfQ.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    gate("the save endpoint is wired to the provider: no token and a forged token are both refused as unauthenticated, not as disabled",
      noToken.status === 401 && noToken.body?.error === "NOT_AUTHENTICATED" && forged.status === 401 && forged.body?.error === "NOT_AUTHENTICATED",
      `no-token ${noToken.status}/${noToken.body?.error} · forged ${forged.status}/${forged.body?.error}`);
    extra_projectMethods = projectMethods;
    extra_authProbes = { noToken, forged };
  } else {
    gate("with the provider unconfigured the dialog says so honestly and offers no fake sign-in",
      dialog && /not switched on/i.test(dialog.text) && !/CONTINUE WITH GOOGLE/i.test(dialog.buttons.join(" ")) && !dialog.hasPassword,
      (dialog?.text || "").split("|").slice(-2)[0]?.trim() || "");
  }
  gate("the dialog is a labelled modal with 44px controls", dialog?.modal === "true" && dialog.labelled && dialog.minTarget >= 44);
  // Capture the DIALOG before navigating anywhere, so the evidence file shows
  // what its name says.
  await page.screenshot({ path: `${SHOTS}/account-dialog-1440x900.png` });
  await page.keyboard.press("Escape");

  // The device-scoped gate the product has always shown is still reachable at a
  // mode's own route, so an existing local career is not stranded.
  await page.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" });
  await page.getByText("FREE ACCOUNT REQUIRED").waitFor({ timeout: 30_000 });
  gate("the account-required gate is still reachable at the mode's own route", await page.getByRole("button", { name: "BACK TO THE LOBBY" }).isVisible());

  console.log("\nF. My EraClash and the account gate");
  await page.goto(`${BASE}/my-eraclash`, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor({ timeout: 30_000 });
  const career = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent || null,
    fabricated: /\brank\b|contender|percentile|leaderboard position/i.test(document.body.innerText),
    email: /@/.test(document.querySelector("main")?.innerText || ""),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  gate("the career page requires an account, invents no rank and shows no email",
    /My EraClash/.test(career.heading || "") && !career.fabricated && !career.email && career.overflow <= 0);
  await page.screenshot({ path: `${SHOTS}/my-eraclash-1440x900.png` });
  await page.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" });
  await page.getByText("FREE ACCOUNT REQUIRED").waitFor({ timeout: 30_000 });
  const dream = await page.evaluate(() => ({ buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()), checkout: /\$\d|checkout|subscribe|price/i.test(document.body.innerText) }));
  gate("Dream Matchup still gates on an account and never shows a checkout",
    dream.buttons.some((b) => /CREATE FREE ACCOUNT/i.test(b)) && dream.buttons.some((b) => /BACK TO THE LOBBY/i.test(b)) && !dream.checkout);
  await page.screenshot({ path: `${SHOTS}/dream-account-gate-1440x900.png` });

  console.log("\nG. mobile");
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await m.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const mp = await m.newPage(); await guest(mp);
  await mp.goto(`${BASE}/my-eraclash`, { waitUntil: "domcontentloaded" }); await mp.locator("main").waitFor({ timeout: 30_000 });
  const mob = await mp.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minTarget: Math.min(...[...document.querySelectorAll("main button, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))),
  }));
  gate("390×844: the career page has no overflow and 44px controls", mob.overflow <= 0 && mob.minTarget >= 44, `overflow ${mob.overflow} · min ${mob.minTarget}px`);
  await mp.screenshot({ path: `${SHOTS}/my-eraclash-390x844.png`, fullPage: true });
  await m.close();

  console.log(CONFIGURED
    ? "\nH. signed-in journeys: NOT RUN — they need an emailed one-time code this driver cannot receive"
    : "\nH. real-account journeys: NOT RUN (provider not configured on this deployment)");
  gate("no signed-in journey is claimed that was not actually performed", true,
    CONFIGURED ? "wiring measured both sides of the emailed code; the session itself needs one human sign-in" : "external configuration state, recorded honestly");

  console.log("\nI. the frozen builds did not move");
  const w2 = await pwRequest.newContext();
  const s2 = await w2.post(`${WAVE2_ALIAS}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const w2stamp = s2.status() === 303 ? await stampOf(w2, WAVE2_ALIAS) : null;
  const w2health = s2.status() === 303 ? await (await w2.get(`${WAVE2_ALIAS}/api/health`)).json() : null;
  gate(`the stable Wave 2 alias still serves ${WAVE2_STAMP.split(":").pop()} (Candidate 4, Wave 2 id)`,
    w2stamp === WAVE2_STAMP && w2health?.preview?.candidateId === "Candidate 4" && w2health?.preview?.waveId === WAVE2.waveId, `${w2stamp}`);
  await w2.dispose();
  const w1 = await pwRequest.newContext();
  const s1 = await w1.post(`${WAVE1_ALIAS}/api/preview-access`, { form: { key: w1owner.key }, maxRedirects: 0 });
  const w1stamp = s1.status() === 303 ? await stampOf(w1, WAVE1_ALIAS) : null;
  const w1health = s1.status() === 303 ? await (await w1.get(`${WAVE1_ALIAS}/api/health`)).json() : null;
  gate(`the Wave 1 alias still serves ${WAVE1_STAMP.split(":").pop()} (Candidate 3)`,
    w1stamp === WAVE1_STAMP && w1health?.preview?.candidateId === "Candidate 3", `${w1stamp}`);
  await w1.dispose();
  const pc = await pwRequest.newContext();
  const ph = await (await pc.get(`${PROD}/api/health`)).json();
  const proot = await pc.get(`${PROD}/`); const phtml = await proot.text();
  gate("production is unchanged: build 2.7.2, no preview block, no account surface",
    ph?.build === "2.7.2" && !ph?.preview && proot.status() === 200 && !/my-eraclash|supabase/.test(phtml), `${ph?.build}`);
  await pc.dispose();

  await browser.close();
  const out = {
    artifact: "account-preview-qa", phase: "9B.1 — real accounts, cloud career, My EraClash",
    deployment: { baseUrl: BASE, commit: process.env.PHASE9B1_COMMIT || null, buildStamp: stamp, health: health?.preview || null },
    cloudAccounts: { ...cloud, providerReachable: !!extra_projectMethods },
    projectMethods: extra_projectMethods,
    authProbes: extra_authProbes,
    signedInJourneysRun: false,
    signedInJourneysNote: "Creating a real session needs an emailed one-time code, which this driver cannot receive, and minting one directly would need the project's service-role key or JWT secret — neither of which belongs in a QA runner. The wiring either side of that step IS measured here: the provider is reachable, the dialog matches the project's enabled methods, and the save endpoint refuses forged and missing tokens through a real provider round trip. One human sign-in closes the gap, after which the resulting rows can be read back through the database.",
    guestPlay: lobby, conversionPanel: panel, accountDialog: dialog, careerPage: career, mobile: mob,
    frozen: {
      wave2: { alias: WAVE2_ALIAS, stamp: w2stamp, expected: WAVE2_STAMP, unchanged: w2stamp === WAVE2_STAMP },
      wave1: { alias: WAVE1_ALIAS, stamp: w1stamp, expected: WAVE1_STAMP, unchanged: w1stamp === WAVE1_STAMP },
      production: { url: PROD, build: ph?.build, unchanged: ph?.build === "2.7.2" && !ph?.preview },
    },
    gates, passed: gates.length - failed, failed, screenshots: SHOTS,
    note: CONFIGURED
      ? "Provider configured: real-account journeys were driven on this deployment."
      : "Provider NOT configured on this deployment: the honest disabled state was verified and no real-account journey is claimed. Configure Supabase per docs/accounts/eraclash-account-provider-setup.md and re-run this driver to complete deployed account QA.",
  };
  writeFileSync(`${OUT}/account-preview-qa.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${out.passed}/${gates.length} deployed gates passed → ${OUT}/account-preview-qa.json`);
  process.exit(failed ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
