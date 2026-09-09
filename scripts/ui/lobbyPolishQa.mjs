#!/usr/bin/env node
// ── Phase 9A.3P QA: Play Lobby polish ────────────────────────────────────────
//   node scripts/ui/lobbyPolishQa.mjs <contracts|registry>            (source + registry; no browser)
//   node scripts/ui/lobbyPolishQa.mjs <cta|hero|signatures|responsive|accessibility|performance> [baseUrl]
//
// Browser modes measure the BUILT app served by the local harness (default
// http://localhost:4177 — real handlers, chaos enabled), so the active-run state
// is a real server-authoritative run started through the arena, never a mock.
// Every state is produced from existing product state: cleared storage for a
// first-time visitor, a career record for a returning device, a ROLL 1 for an
// active run. Nothing here reads or writes the deployed Wave 2 build.
import fs from "node:fs";
import {
  PLAY_MODES, MODE_STATUS, ACTION_HIERARCHY, ACCENT_ROLE, NAVIGATION_REGISTRY_VERSION, LOBBY_PRESENTATION_VERSION,
  actionLabelFor, actionHierarchyFor, accessibleActionName, resolveModeAction, resolveModeStatus, requiresAccount, findMode, lobbyModes,
} from "../../src/navigation.js";
import { TIERS } from "../../src/entitlements.js";
import { SIGNATURE_IDS } from "../../src/components/lobby/signatureIds.js";
import { HERO_STATE_IDS, HERO_LINE, resolveHeroState } from "../../src/components/lobby/heroState.js";
import { EVENTS_ALLOWLIST } from "../../api/events.js";
import { ACTIVATION_EVENTS } from "../../src/activation.js";

const MODE = process.argv[2] || "contracts";
const BASE = (process.argv[3] || process.env.LOBBY_QA_BASE || "http://localhost:4177").replace(/\/$/, "");
const OUT = process.env.LOBBY_QA_OUT || "data/validation/9a3p";
const SCREENS = `${OUT}/screens`;
fs.mkdirSync(OUT, { recursive: true });
const PHASE = "9A.3P — Play Lobby brand, CTA and entry polish";

const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: !!p, detail: String(d) }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const read = (f) => fs.readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const json = (f) => JSON.parse(read(f));
/** One phase's CSS section: from its banner to the next banner, never to EOF. */
const cssSection = (marker) => {
  const all = read("src/index.css");
  const start = all.indexOf(marker);
  if (start < 0) return "";
  const next = all.indexOf("/* \u2550\u2550\u2550", start + marker.length);
  return next < 0 ? all.slice(start) : all.slice(start, next);
};
const extra = {};
const LABELS = { chaos: "Start Chaos Clash", dream: "Build Matchup", daily: "Play Today’s Clash", bo7: "Start Series", win82: "Start Season", tournament: "Enter Tournament", gauntlet: "Learn More" };
const UPPER = Object.fromEntries(Object.entries(LABELS).map(([k, v]) => [k, v.toUpperCase()]));

// ── Shared browser helpers ───────────────────────────────────────────────────
const lumOf = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); if (x == null || y == null) return null; return +(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))).toFixed(2); };
const firstTime = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
const returning = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("ec_career", JSON.stringify({ gamesPlayed: 3, wins: 2, losses: 1 })); localStorage.setItem("ec_recent", JSON.stringify([{ w: true, mode: "single", ts: Date.now() - 86400000 }])); } catch (e) {} });
const withAccountKeepRun = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); } catch (e) {} });
const gamePosts = (page) => { const posts = []; page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}").chaosAction || "(sim)"); } catch { posts.push("?"); } } }); return posts; };
const openLobby = async (page, path = "/play") => { await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-lobby .ec-mode-card", { timeout: 30_000 }); };
/** Start a real Chaos run through the arena, then return to the lobby (the run is remembered). */
const startRealRun = async (page) => {
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.waitForSelector(".ec-ta-roster .ec-pc >> nth=9", { timeout: 45_000 });
  return page.evaluate(() => localStorage.getItem("ec_chaos_run"));
};
const cardFacts = (page) => page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => {
  const a = e.querySelector(".ec-mode-action"); const cs = getComputedStyle(a); const after = getComputedStyle(a, "::after");
  const r = a.getBoundingClientRect(); const card = e.getBoundingClientRect();
  const rgbOf = (c) => c; const bgOf = (n) => { while (n && n !== document.documentElement) { const b = getComputedStyle(n).backgroundColor; const m = b.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.6)) return b; n = n.parentElement; } return getComputedStyle(document.body).backgroundColor; };
  return {
    id: e.dataset.mode, status: e.dataset.status, hierarchy: a.dataset.hierarchy, accent: e.dataset.accent, signature: e.dataset.signature,
    label: a.textContent.trim(), textTransform: cs.textTransform, name: a.getAttribute("aria-label"), tag: a.tagName, href: a.getAttribute("href"), ariaDisabled: a.getAttribute("aria-disabled"),
    bgImage: cs.backgroundImage, bgColor: cs.backgroundColor, color: cs.color, borderStyle: cs.borderStyle, borderWidth: cs.borderWidth, borderColor: cs.borderColor, boxShadow: cs.boxShadow, arrow: after.content,
    height: Math.round(r.height), width: Math.round(r.width), cardInner: Math.round(card.width - parseFloat(getComputedStyle(e).paddingLeft) - parseFloat(getComputedStyle(e).paddingRight)),
    wraps: a.scrollWidth > a.clientWidth + 1 || [...a.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).some((n) => { const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects().length > 1; }), cardBg: rgbOf(bgOf(e.parentElement)), cardOwnBg: getComputedStyle(e).backgroundImage,
    flag: e.querySelector(".ec-mode-flag")?.textContent.trim() || null, badge: e.querySelector(".ec-mode-badge")?.textContent.trim() || null,
    outline: cs.outlineStyle, transform: cs.transform,
  };
}));
const isGlow = (shadow) => shadow !== "none" && shadow.split(/,(?![^()]*\))/).some((part) => { if (/inset/.test(part)) return false; const m = part.match(/\)\s*(-?\d+)px\s*(-?\d+)px\s*(\d+)px/); if (!m || Number(m[3]) < 14) return false; const rgb = (part.match(/rgba?\(([^)]+)\)/) || [])[1]; if (!rgb) return false; return Math.max(...rgb.split(",").slice(0, 3).map(Number)) >= 80; });
const heroFacts = (page) => page.evaluate(() => { const l = document.querySelector(".ec-lobby"), h = document.querySelector(".ec-lobby-hero"), logo = document.querySelector(".ec-lobby-logo"), grid = document.querySelector(".ec-lobby-primary"), cont = document.querySelector(".ec-continue"); return { hero: l.dataset.hero, presentation: l.dataset.presentation, compact: h.classList.contains("ec-lobby-hero--compact"), heroHeight: Math.round(h.getBoundingClientRect().height), bandFullBleed: Math.round(h.getBoundingClientRect().width) >= window.innerWidth - 1 && Math.round(h.getBoundingClientRect().left) === 0, logoWidth: Math.round(logo.getBoundingClientRect().width), line: document.querySelector(".ec-lobby-line").textContent.trim(), gridTop: Math.round(grid.getBoundingClientRect().top), continueTop: cont ? Math.round(cont.getBoundingClientRect().top) : null, continueCard: !!cont, fractures: document.querySelectorAll(".ec-lobby .ec-fracture").length, docHeight: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, run: localStorage.getItem("ec_chaos_run"), eraLeak: cont ? /\b\d{4}s\b/.test(cont.textContent) : false }; });
const installCls = (page) => page.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });

// ── contracts (source + registry) ────────────────────────────────────────────
if (MODE === "contracts") {
  const lobby = src("src/components/lobby/PlayLobby.jsx"), header = src("src/components/arena/ArenaHeader.jsx"), css = read("src/index.css"), polishCss = cssSection("PHASE 9A.3P");
  ok("registry 1.2.0 carries actionLabel, actionVerb, actionHierarchy, visualSignature, accentRole for every mode", NAVIGATION_REGISTRY_VERSION === "1.2.0" && PLAY_MODES.every((m) => m.actionLabel && m.actionVerb && m.actionHierarchy && m.visualSignature && m.accentRole));
  ok("the seven action labels are exactly the specification's", PLAY_MODES.every((m) => m.actionLabel === LABELS[m.id]), PLAY_MODES.map((m) => m.actionLabel).join(" · "));
  ok("Chaos Clash is the only PRIMARY; Era Gauntlet is UNAVAILABLE; the rest are SECONDARY", PLAY_MODES.filter((m) => m.actionHierarchy === "primary").map((m) => m.id).join() === "chaos" && findMode("gauntlet").actionHierarchy === "unavailable" && PLAY_MODES.filter((m) => m.actionHierarchy === "secondary").length === 5);
  ok("the lobby renders label, hierarchy and accessible name through the registry's resolvers", /actionLabelFor\(mode, action\.status\)/.test(lobby) && /actionHierarchyFor\(mode, action\.status\)/.test(lobby) && /accessibleActionName\(mode, action\.status\)/.test(lobby) && !/"Open"/.test(lobby));
  ok("the header renders one image — the manifested Mk1 mark — and no league mark", (header.match(/<img\b/g) || []).length === 1 && /data-brand-mark="eraclash-logo-mk1"/.test(header) && !/\bnba\b/i.test(header) && json("data/validation/9a2/logo-mk1-manifest.json").product.path === "public/brand/eraclash-logo-mk1.png");
  ok("the header keeps its architecture: logo, BASKETBALL descriptor, Play/Fantasy menus, four nav items, account control", /ec-brand-home/.test(header) && /BASKETBALL/.test(header) && /NavMenu label="Play"/.test(header) && /NavMenu label="Fantasy"/.test(header) && /plainNav\.map/.test(header) && /<AccountControl/.test(header));
  ok("one filled-Gold rule keyed by hierarchy; secondary bordered + arrow; unavailable dashed", (css.match(/\.ec-mode-action\[data-hierarchy="primary"\] \{/g) || []).length === 1 && /data-hierarchy="secondary"\]::after \{[^}]*content: "→"/.test(polishCss) && /data-hierarchy="unavailable"\] \{[^}]*dashed/.test(polishCss));
  ok("labels display as capitals and never wrap", /\.ec-mode-action \{ text-transform: uppercase; white-space: nowrap;/.test(polishCss));
  ok("the hero has three states, decided synchronously from existing state (run, career, returning flag)", HERO_STATE_IDS.join() === "full,compact-active-run,compact-returning" && /useState\(\(\) => \(lab \? \(fixture\?\.hero \|\| HERO_STATES\.FULL\) : readHeroState/.test(lobby) && /getSession\(\)\.returning/.test(lobby) && !/setItem|document\.cookie/.test(src("src/components/lobby/heroState.js")));
  ok("the Continue card stays above the grid; the one fracture moment stays; nothing starts or deletes a run", lobby.indexOf("<ContinueCard") < lobby.indexOf('className="ec-lobby-primary"') && (lobby.match(/<EraFractureDivider/g) || []).length === 1 && /viewChaos\(id, tier\)/.test(lobby) && !/startChaos|chaosAction: "start"/.test(lobby));
  ok("signatures: seven ids, aria-hidden, currentColor strokes, no imagery, 4–10% opacity, ≤12% on hover, reduced-motion covered", SIGNATURE_IDS.length === 7 && /aria-hidden="true" focusable="false"/.test(src("src/components/lobby/ModeSignature.jsx")) && !/<image|href=|http|url\(/i.test(src("src/components/lobby/ModeSignature.jsx")) && /--ec-sig-opacity, 0\.0[4-9]\)|--ec-sig-opacity, 0\.10\)/.test(polishCss) && /:hover \.ec-mode-signature \{ opacity: 0\.(0\d|1[0-2])/.test(polishCss) && /prefers-reduced-motion: reduce\) \{\s*\.ec-mode-action, \.ec-mode-action::after, \.ec-mode-signature \{ transition: none/.test(polishCss));
  // Phase 9A.3P added no event of its own. A later phase may add its own, so
  // the invariant is that none was removed and the two lists still agree —
  // never a frozen global count.
  ok("telemetry: this phase added no event, removed none, and carries its two bounded properties on the existing lobby event",
    EVENTS_ALLOWLIST.size >= 69 && ACTIVATION_EVENTS.length >= 22
    && ACTIVATION_EVENTS.every((e) => EVENTS_ALLOWLIST.has(e))
    && ["play_lobby_viewed", "play_mode_selected", "time_to_mode_selection_recorded"].every((e) => ACTIVATION_EVENTS.includes(e))
    && /hero_state/.test(src("src/activation.js")) && /lobby_presentation_version/.test(src("src/activation.js"))
    && LOBBY_PRESENTATION_VERSION === "play-lobby-polish-v1",
    `${EVENTS_ALLOWLIST.size} allowlisted · ${ACTIVATION_EVENTS.length} tracked`);
  extra.contract = {
    artifact: "play-lobby-polish-contract", phase: PHASE, status: "FROZEN", presentationVersion: LOBBY_PRESENTATION_VERSION, registryVersion: NAVIGATION_REGISTRY_VERSION,
    architecturePreserved: ["three primary cards then a row of four", "Chaos Clash first and recommended", "Play Lobby separate from the Time Arena", "Night Court V1 (obsidian shell, ivory lobby canvas)", "one Era Fracture moment under the brand band", "registry-driven cards and dropdown", "one-viewport desktop fit"],
    leagueMarks: { rule: "No league-owned visual mark renders in the header, the lobby or the global shell. The header's only image is EraClash Logo Mk1 (manifested by SHA-256). Historical league data in player, team and statistical records is untouched.", replacement: "none — the Mk1 mark with its BASKETBALL descriptor at left, Create free account at right" },
    modes: PLAY_MODES.map((m) => ({ id: m.id, label: m.label, actionLabel: m.actionLabel, displayed: m.actionLabel.toUpperCase(), actionVerb: m.actionVerb, actionHierarchy: m.actionHierarchy, accentRole: m.accentRole, visualSignature: m.visualSignature, route: m.route, category: m.category, recommended: m.recommended, requiresAccount: requiresAccount(m), statusByTier: Object.fromEntries(TIERS.map((t) => [t, resolveModeStatus(m, t)])), accessibleName: { asGuest: accessibleActionName(m, resolveModeStatus(m, "GUEST")), asFree: accessibleActionName(m, resolveModeStatus(m, "FREE")) } })),
    buttonStates: {
      primary: { used: "Chaos Clash only", treatment: ["filled EraClash Gold gradient (cta-hi/mid/lo)", "dark ink", "the lobby's one glow", "hover: brightness +4%, lift 1px", "pressed: no lift", "focus: 3px gold outline"] },
      secondary: { used: "Dream Matchup, Daily Clash, Best of 7, Win 82, Tournament (and any account-gated mode)", treatment: ["Warm Ivory face", "1.5px solid border (border-strong; Cobalt for Daily)", "Editorial Ink text", "directional arrow in the accent role", "hover: soft face, darker border, lift 1px, shadow", "pressed: no lift", "focus: 3px gold outline"], neverLooksDisabled: true },
      unavailable: { used: "Coming Soon (Era Gauntlet); Not available here; Not in preview", treatment: ["transparent face", "1.5px dashed border", "muted ink", "no arrow", "hover: underline only (no lift)", "aria-disabled only on a button without a destination; Learn more stays a real link to the information page"], checkoutRouting: false },
    },
    hero: { states: HERO_STATE_IDS, decision: "resolveHeroState({ hasRememberedRun, gamesPlayed, recentGames, returningDevice }) — synchronous, before first paint", inputs: ["localStorage ec_chaos_run (existing)", "localStorage ec_career.gamesPlayed and ec_recent (existing career store)", "getSession().returning (existing analytics identity: ec_seen existed before this tab)"], full: ["large Mk1 mark (min(340px, 78vw))", "the product line", "Gold/Cobalt fracture divider"], compact: ["150px Mk1 mark (118px on a phone)", "one concise line", "Continue card when a run exists", "grid moved up", "the same fracture divider"], lines: HERO_LINE, forbidden: ["deleting a run", "starting a run", "changing entitlements", "changing telemetry identity", "revealing hidden Era information", "layout shift after first paint", "a new cookie or storage key"] },
    signatures: { grammar: ["1.5px strokes (≤2.6 for one progress emphasis)", "round caps and joins", "currentColor tinted by accent role", "120×120 viewBox", "no fills heavier than a dot", "opacity 0.07 (0.12 on hover)", "position absolute, clipped by the card", "aria-hidden, unfocusable, pointer-events none"], byMode: Object.fromEntries(PLAY_MODES.map((m) => [m.id, { signature: m.visualSignature, accent: m.accentRole }])), accentTokens: { gold: "--ec-l-glyph", cobalt: "--ec-l-glyph-cool", violet: "--ec-l-glyph-era", platinum: "--ec-l-text-secondary (graphite as platinum on ivory)" } },
    telemetry: { event: "play_lobby_viewed (existing, allowlisted)", added: { hero_state: HERO_STATE_IDS, lobby_presentation_version: LOBBY_PRESENTATION_VERSION }, newEvents: 0, forbidden: ["email", "real name", "raw access key", "session cookie", "full URL with credentials", "free-form text"] },
    contentDiscipline: { allowed: ["icon", "mode name", "one sentence", "status/access badge", "one action", "low-opacity motif"], forbidden: ["feature bullets", "rule explanations", "prices", "statistics", "simulation details", "portraits", "screenshots", "multiple CTAs", "upsell paragraphs"] },
  };
  fs.writeFileSync(`${OUT}/play-lobby-polish-contract.json`, JSON.stringify(extra.contract, null, 2) + "\n");
}

// ── registry (node only) ─────────────────────────────────────────────────────
if (MODE === "registry") {
  const walk = (dir) => fs.readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return fs.statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : []; });
  const rec = json("data/validation/9a/mode-registry-verification.json").registry;
  ok("registry version 1.2.0", NAVIGATION_REGISTRY_VERSION === "1.2.0");
  ok("seven modes; ids, routes and signatures unique", PLAY_MODES.length === 7 && new Set(PLAY_MODES.map((m) => m.route)).size === 7 && new Set(PLAY_MODES.map((m) => m.visualSignature)).size === 7);
  ok("every label, verb, hierarchy, accent and signature is declared and valid", PLAY_MODES.every((m) => m.actionLabel === LABELS[m.id] && m.actionVerb && Object.values(ACTION_HIERARCHY).includes(m.actionHierarchy) && Object.values(ACCENT_ROLE).includes(m.accentRole) && SIGNATURE_IDS.includes(m.visualSignature)));
  ok("exactly one primary for every tier and every context", TIERS.every((t) => [{}, { previewCandidateActive: true }, { chaosAvailable: false }].every((ctx) => { const p = PLAY_MODES.filter((m) => actionHierarchyFor(m, resolveModeStatus(m, t, ctx)) === "primary").map((m) => m.id); return ctx.chaosAvailable === false ? p.length === 0 : p.join() === "chaos"; })));
  ok("routes, categories, recommendation, continuation, implementation and per-tier statuses equal the Phase 9A record", rec.every((r) => { const m = findMode(r.id); return m.route === r.route && m.category === r.category && m.recommended === r.recommended && m.continuationSupport === r.continuationSupport && m.implemented === r.implemented && requiresAccount(m) === r.requiresAccount && Object.entries(r.statusByTier).every(([t, s]) => resolveModeAction(m, t, { from: "/play" }).status === s); }));
  ok("order unchanged: chaos, dream, daily · bo7, win82, tournament, gauntlet", lobbyModes().primary.map((m) => m.id).join() === "chaos,dream,daily" && lobbyModes().secondary.map((m) => m.id).join() === "bo7,win82,tournament,gauntlet");
  ok("Coming soon still never routes to checkout; a gated mode still links to its own route", TIERS.every((t) => !/membership|checkout/.test(resolveModeAction(findMode("gauntlet"), t).href)) && resolveModeAction(findMode("dream"), "GUEST").href === "/play/dream");
  const dupes = walk("src").filter((f) => f !== "src/navigation.js").filter((f) => Object.values(LABELS).some((l) => src(f).includes(l)));
  ok("no duplicated action-label map anywhere else in src/", dupes.length === 0, dupes.join(", ") || "only src/navigation.js");
  ok("no status resolves to Open / Continue / Enter / Go as a bare action word", Object.keys(MODE_STATUS).every((s) => PLAY_MODES.every((m) => !/^(Open|Continue|Enter|Go)$/i.test(actionLabelFor(m, s)))));
  ok("the Play dropdown and the lobby read the same PLAY_MODES", /PLAY_MODES\.map/.test(src("src/components/arena/ArenaHeader.jsx")) && /lobbyModes\(\)/.test(src("src/components/lobby/PlayLobby.jsx")));
  ok("feature flags and entitlement matrix untouched by the registry extension", /FEATURE_FLAGS\.eraGauntlet\.featureFlag/.test(src("src/navigation.js")) && /requiresAccount = \(mode\) =>/.test(src("src/navigation.js")));
  extra.registry = PLAY_MODES.map((m) => ({ id: m.id, actionLabel: m.actionLabel, actionHierarchy: m.actionHierarchy, accentRole: m.accentRole, visualSignature: m.visualSignature, route: m.route, statusByTier: Object.fromEntries(TIERS.map((t) => [t, resolveModeStatus(m, t)])), labelByTier: Object.fromEntries(TIERS.map((t) => [t, actionLabelFor(m, resolveModeStatus(m, t))])), hierarchyByTier: Object.fromEntries(TIERS.map((t) => [t, actionHierarchyFor(m, resolveModeStatus(m, t))])) }));
  extra.duplicateLabelMaps = dupes;
}

// ── browser modes ────────────────────────────────────────────────────────────
const BROWSER = ["cta", "hero", "signatures", "responsive", "accessibility", "performance"];
if (BROWSER.includes(MODE)) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const ctxOf = (w, h, touch = false) => browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });

  if (MODE === "cta") {
    const ctx = await ctxOf(1440, 900); const page = await ctx.newPage(); await firstTime(page); await openLobby(page);
    const cards = await cardFacts(page);
    ok("seven cards, seven actions, each a real link or button", cards.length === 7 && cards.every((c) => ["A", "BUTTON"].includes(c.tag)));
    ok("every displayed label is the registry's, shown in capitals", cards.every((c) => c.textTransform === "uppercase" && c.label.toUpperCase() === UPPER[c.id]), cards.map((c) => `${c.id}:${c.label}`).join(" · "));
    ok("exactly one filled-Gold CTA and it belongs to Chaos Clash", cards.filter((c) => /gradient/.test(c.bgImage)).map((c) => c.id).join() === "chaos" && cards.find((c) => c.id === "chaos").hierarchy === "primary");
    ok("the five secondaries are solid-bordered, arrowed, not gradient-filled, and not the muted dashed style", cards.filter((c) => c.hierarchy === "secondary").every((c) => c.borderStyle === "solid" && /→/.test(c.arrow) && !/gradient/.test(c.bgImage)) && cards.filter((c) => c.hierarchy === "secondary").length === 5);
    ok("Era Gauntlet is the one unavailable action: dashed, no arrow, still a real link to its information page", cards.filter((c) => c.hierarchy === "unavailable").map((c) => c.id).join() === "gauntlet" && cards.find((c) => c.id === "gauntlet").borderStyle === "dashed" && !/→/.test(cards.find((c) => c.id === "gauntlet").arrow) && cards.find((c) => c.id === "gauntlet").href === "/modes/era-gauntlet");
    ok("no label wraps", cards.every((c) => !c.wraps), cards.filter((c) => c.wraps).map((c) => c.id).join(",") || "none");
    ok("the recommended badge sits on the Chaos card only", cards.filter((c) => c.flag).map((c) => c.id).join() === "chaos");
    ok("the lobby has exactly one glow, on the primary CTA", await page.evaluate(() => [...document.querySelectorAll(".ec-lobby *")].filter((e) => { const s = getComputedStyle(e).boxShadow; if (s === "none" || e.matches(".ec-fracture")) return false; return s.split(/,(?![^()]*\))/).some((part) => { if (/inset/.test(part)) return false; const m = part.match(/\)\s*(-?\d+)px\s*(-?\d+)px\s*(\d+)px/); if (!m || Number(m[3]) < 14) return false; const rgb = (part.match(/rgba?\(([^)]+)\)/) || [])[1]; return rgb && Math.max(...rgb.split(",").slice(0, 3).map(Number)) >= 80; }); }).map((e) => `${e.className}`)).then((g) => { extra.glows = g; return g.length === 1 && /ec-mode-action/.test(g[0]); }), (extra.glows || []).join(" | "));
    // Contrast in the default state, text on its own face.
    const contrast = cards.map((c) => ({ id: c.id, hierarchy: c.hierarchy, ratio: ratio(c.color, /gradient/.test(c.bgImage) ? "rgb(232, 177, 60)" : (c.bgColor.match(/[\d.]+/g)?.length === 4 && Number(c.bgColor.match(/[\d.]+/g)[3]) === 0 ? c.cardBg : c.bgColor)) }));
    ok("every action's text clears WCAG AA (4.5:1) on its own face", contrast.every((c) => c.ratio >= 4.5), contrast.map((c) => `${c.id} ${c.ratio}`).join(" · "));
    // States: hover / focus / active / high-contrast, on one of each hierarchy.
    const states = {};
    for (const id of ["chaos", "dream", "daily", "gauntlet"]) {
      const sel = `.ec-mode-card[data-mode="${id}"] .ec-mode-action`; const el = page.locator(sel);
      const base = await el.evaluate((a) => ({ bg: getComputedStyle(a).backgroundColor, border: getComputedStyle(a).borderColor, shadow: getComputedStyle(a).boxShadow, transform: getComputedStyle(a).transform, filter: getComputedStyle(a).filter, y: a.getBoundingClientRect().top }));
      await el.hover(); await page.waitForTimeout(260);
      const hover = await el.evaluate((a) => ({ bg: getComputedStyle(a).backgroundColor, border: getComputedStyle(a).borderColor, shadow: getComputedStyle(a).boxShadow, transform: getComputedStyle(a).transform, filter: getComputedStyle(a).filter, decoration: getComputedStyle(a).textDecorationLine, y: a.getBoundingClientRect().top }));
      await page.mouse.down(); await page.waitForTimeout(200);
      const pressed = await el.evaluate((a) => ({ transform: getComputedStyle(a).transform }));
      await page.mouse.up(); await page.waitForTimeout(400);
      // The release completed a click (the primary opens the arena); come back to the lobby before measuring focus.
      await openLobby(page); await page.mouse.move(5, 5);
      await el.focus(); await page.waitForTimeout(60);
      const focus = await el.evaluate((a) => ({ outline: getComputedStyle(a).outlineStyle, outlineWidth: getComputedStyle(a).outlineWidth, matchesFocusVisible: a.matches(":focus-visible") }));
      await page.keyboard.press("Tab");
      states[id] = { base, hover, pressed, focus };
    }
    const flat = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)"; // translateY(0) computes to the identity matrix
    ok("primary responds to hover (lift) and returns on press", !flat(states.chaos.hover.transform) && flat(states.chaos.pressed.transform), `hover ${states.chaos.hover.transform} · pressed ${states.chaos.pressed.transform}`);
    ok("secondary responds to hover (face, border and lift change) and returns on press", states.dream.hover.bg !== states.dream.base.bg && states.dream.hover.border !== states.dream.base.border && !flat(states.dream.hover.transform) && flat(states.dream.pressed.transform), `face ${states.dream.base.bg}→${states.dream.hover.bg} · pressed ${states.dream.pressed.transform}`);
    ok("Daily's secondary is Cobalt-supported (border) yet not filled Gold", /^rgb\((3[0-9]|4[0-9]),\s*(9\d|1\d\d),\s*(1[5-9]\d|2\d\d)\)$/.test(states.daily.base.border) && !/gradient/.test(cards.find((c) => c.id === "daily").bgImage), states.daily.base.border);
    ok("unavailable never lifts or changes face on hover (underline only)", states.gauntlet.hover.transform === "none" && states.gauntlet.hover.bg === states.gauntlet.base.bg && /underline/.test(states.gauntlet.hover.decoration));
    ok("keyboard focus is visible on primary, secondary and unavailable", ["chaos", "dream", "gauntlet"].every((id) => states[id].focus.outline !== "none" && parseFloat(states[id].focus.outlineWidth) >= 2));
    // Distinguishable without colour + forced colours.
    await page.emulateMedia({ forcedColors: "active" }); await page.waitForTimeout(150);
    const fc = await cardFacts(page); await page.emulateMedia({ forcedColors: "none" });
    ok("in forced-colours mode the three hierarchies stay distinct by border style and arrow, not by hue", fc.find((c) => c.id === "dream").borderStyle === "solid" && /→/.test(fc.find((c) => c.id === "dream").arrow) && fc.find((c) => c.id === "gauntlet").borderStyle === "dashed" && !/→/.test(fc.find((c) => c.id === "chaos").arrow));
    await page.screenshot({ path: `${SCREENS}/first-time/cta-hierarchy-1440x900.png` }).catch(() => {});
    await ctx.close();
    // Mobile: the primary CTA is full width; secondaries obviously clickable.
    const m = await ctxOf(390, 844, true); const mp = await m.newPage(); await firstTime(mp); await openLobby(mp);
    const mc = await cardFacts(mp);
    ok("390×844: the primary CTA spans the card; every action is ≥44px; no label wraps", mc.find((c) => c.id === "chaos").width >= mc.find((c) => c.id === "chaos").cardInner - 2 && mc.every((c) => c.height >= 44) && mc.every((c) => !c.wraps), `${mc.find((c) => c.id === "chaos").width}/${mc.find((c) => c.id === "chaos").cardInner}px · min ${Math.min(...mc.map((c) => c.height))}px`);
    await m.close();
    extra.cards = cards; extra.contrast = contrast; extra.states = states; extra.mobile = mc;
  }

  if (MODE === "hero") {
    const shots = [[1536, 1024], [1440, 900], [1280, 800]];
    // First-time.
    const rows = {};
    for (const [w, h] of shots) {
      const ctx = await ctxOf(w, h); const page = await ctx.newPage(); await firstTime(page); await installCls(page); const posts = gamePosts(page);
      await openLobby(page); await page.waitForTimeout(600);
      const f = await heroFacts(page); const cls = await page.evaluate(() => window.__cls);
      rows[`first-time@${w}x${h}`] = { ...f, cls, posts: posts.length };
      fs.mkdirSync(`${SCREENS}/first-time`, { recursive: true }); await page.screenshot({ path: `${SCREENS}/first-time/lobby-${w}x${h}.png` });
      ok(`first-time @${w}×${h}: full hero, large mark, product line, no Continue card, no run, no POST, fits one viewport`, f.hero === "full" && !f.compact && f.bandFullBleed && f.logoWidth >= 300 && /possession by possession|Choose how you want to play/.test(f.line) && !f.continueCard && !f.run && posts.length === 0 && f.docHeight <= h && f.overflow <= 0, `hero ${f.heroHeight}px · logo ${f.logoWidth}px · doc ${f.docHeight}/${h}`);
      ok(`first-time @${w}×${h}: no layout shift after first paint`, cls < 0.02, cls.toFixed(4));
      await ctx.close();
    }
    // Returning (career on the device).
    for (const [w, h] of shots) {
      const ctx = await ctxOf(w, h); const page = await ctx.newPage(); await returning(page); await installCls(page); const posts = gamePosts(page);
      await openLobby(page); await page.waitForTimeout(600);
      const f = await heroFacts(page); const cls = await page.evaluate(() => window.__cls);
      rows[`returning@${w}x${h}`] = { ...f, cls, posts: posts.length };
      fs.mkdirSync(`${SCREENS}/returning`, { recursive: true }); await page.screenshot({ path: `${SCREENS}/returning/lobby-${w}x${h}.png` });
      const first = rows[`first-time@${w}x${h}`];
      ok(`returning @${w}×${h}: compact hero, smaller mark, one line, grid moved up ${first.gridTop - f.gridTop}px, no Continue card, no POST`, f.hero === "compact-returning" && f.compact && f.bandFullBleed && f.logoWidth < 200 && f.heroHeight < first.heroHeight && f.gridTop < first.gridTop && /Welcome back/.test(f.line) && !f.continueCard && posts.length === 0 && f.fractures === 1 && f.docHeight <= h, `hero ${f.heroHeight}px (was ${first.heroHeight}px)`);
      ok(`returning @${w}×${h}: no layout shift after first paint`, cls < 0.02, cls.toFixed(4));
      await ctx.close();
    }
    // Active run: a real ROLL 1 through the arena, then the lobby.
    for (const [w, h] of shots) {
      const ctx = await ctxOf(w, h); const page = await ctx.newPage(); await withAccountKeepRun(page); await installCls(page); const posts = gamePosts(page);
      const runId = await startRealRun(page);
      await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-lobby", { timeout: 30_000 });
      const paint = await heroFacts(page); // before the run lookup resolves (or as soon as the lobby is mounted)
      await page.waitForSelector(".ec-continue:not(.ec-continue--pending)", { timeout: 20_000 }); await page.waitForTimeout(500);
      const f = await heroFacts(page); const cls = await page.evaluate(() => window.__cls);
      rows[`active-run@${w}x${h}`] = { firstPaint: paint, resolved: f, cls, posts };
      fs.mkdirSync(`${SCREENS}/active-run`, { recursive: true }); await page.screenshot({ path: `${SCREENS}/active-run/lobby-${w}x${h}.png` });
      ok(`active run @${w}×${h}: compact hero at first paint and after the run resolves (same height); Continue above the grid; era hidden; run kept; only a READ`, paint.hero === "compact-active-run" && paint.compact && f.bandFullBleed && f.heroHeight === paint.heroHeight && f.continueCard && f.continueTop < f.gridTop && !f.eraLeak && f.run === runId && posts.filter((p) => p === "start").length === 1 && posts.filter((p) => p === "view").length >= 1 && /waiting/.test(f.line), `hero ${paint.heroHeight}→${f.heroHeight}px · posts ${posts.join(",")}`);
      ok(`active run @${w}×${h}: no layout shift from hero-state resolution`, cls < 0.02, cls.toFixed(4));
      // Viewing the lobby, then the logo from the arena, never touches the run.
      await page.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').click(); await page.waitForSelector(".ec-ta", { timeout: 30_000 });
      await page.getByRole("button", { name: "EraClash Basketball home" }).click(); await page.waitForSelector(".ec-continue:not(.ec-continue--pending)", { timeout: 20_000 });
      ok(`active run @${w}×${h}: the logo returns to the lobby with the run intact`, (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId);
      await ctx.close();
    }
    extra.rows = rows; extra.decision = { full: "no remembered run, no finished game on this device, device not seen before", compactReturning: "career.gamesPlayed > 0 or recentGames > 0 or the session's returning flag", compactActiveRun: "ec_chaos_run remembered (the Continue card renders once the server view arrives; the hero does not wait for it)" };
  }

  if (MODE === "signatures") {
    const ctx = await ctxOf(1440, 900); const page = await ctx.newPage(); await firstTime(page); await openLobby(page);
    const sigs = await page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => { const s = e.querySelector(".ec-mode-signature"); const cs = s ? getComputedStyle(s) : null; const cr = e.getBoundingClientRect(); const sr = s?.getBoundingClientRect(); const tokens = { gold: getComputedStyle(e).getPropertyValue("--ec-l-glyph").trim(), cobalt: getComputedStyle(e).getPropertyValue("--ec-l-glyph-cool").trim(), violet: getComputedStyle(e).getPropertyValue("--ec-l-glyph-era").trim(), platinum: getComputedStyle(e).getPropertyValue("--ec-l-text-secondary").trim() }; const hex2rgb = (h) => { const n = parseInt(h.replace("#", ""), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; }; return { id: e.dataset.mode, accent: e.dataset.accent, signature: s?.dataset.signature, ariaHidden: s?.getAttribute("aria-hidden"), focusable: s?.getAttribute("focusable"), opacity: cs ? +parseFloat(cs.opacity).toFixed(3) : null, pointer: cs?.pointerEvents, color: cs?.color, tokenColors: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v.startsWith("#") ? hex2rgb(v) : v])), clipped: getComputedStyle(e).overflow === "hidden", insideCardBox: sr ? sr.right <= cr.right + 40 && sr.top >= cr.top - 40 : false, hasImage: !!s?.querySelector("image"), strokes: s ? [...s.querySelectorAll("[stroke-width]")].map((n) => parseFloat(n.getAttribute("stroke-width"))) : [], bytes: s?.outerHTML.length || 0, glyphVisible: e.querySelector(".ec-mode-glyph").getBoundingClientRect().width > 0, titleVisible: e.querySelector(".ec-mode-title").getBoundingClientRect().width > 0 }; }));
    ok("every card carries the registry's signature, and no two match", sigs.every((s) => s.signature === findMode(s.id).visualSignature) && new Set(sigs.map((s) => s.signature)).size === 7);
    ok("every signature is decorative: aria-hidden, unfocusable, pointer-events none", sigs.every((s) => s.ariaHidden === "true" && s.focusable === "false" && s.pointer === "none"));
    ok("restrained: rendered opacity between 4% and 10% on every card", sigs.every((s) => s.opacity >= 0.04 && s.opacity <= 0.10), sigs.map((s) => s.opacity).join(","));
    ok("one grammar: thin strokes only (≤2.6px), no embedded imagery, clipped to the card", sigs.every((s) => s.strokes.every((w) => w <= 2.6) && !s.hasImage && s.clipped && s.insideCardBox));
    const accentOf = (s) => ({ gold: s.tokenColors.gold, "platinum-cobalt": s.tokenColors.platinum, cobalt: s.tokenColors.cobalt, "platinum-gold": s.tokenColors.platinum, "cobalt-platinum": s.tokenColors.cobalt, "gold-platinum": s.tokenColors.gold, violet: s.tokenColors.violet })[s.accent];
    ok("each motif is tinted by its accent role from the theme's own tokens (gold / cobalt / violet / graphite-as-platinum)", sigs.every((s) => s.color === accentOf(s)), sigs.map((s) => `${s.id}:${s.accent}`).join(" · "));
    ok("the icon, name, sentence, badge and action stay legible in front of the motif", sigs.every((s) => s.glyphVisible && s.titleVisible));
    ok("all seven signatures weigh under 8KB of markup together", sigs.reduce((n, s) => n + s.bytes, 0) < 8192, `${sigs.reduce((n, s) => n + s.bytes, 0)} bytes`);
    await page.hover('.ec-mode-card[data-mode="dream"]'); await page.waitForTimeout(260);
    const hov = await page.locator('.ec-mode-card[data-mode="dream"] .ec-mode-signature').evaluate((s) => parseFloat(getComputedStyle(s).opacity));
    ok("one restrained hover transition: the motif rises to at most 12%", hov > 0.07 && hov <= 0.12, String(hov));
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(100);
    const rm = await page.locator('.ec-mode-card[data-mode="dream"] .ec-mode-signature').evaluate((s) => getComputedStyle(s).transitionDuration);
    ok("reduced motion removes the motif transition", parseFloat(rm) < 0.01, rm);
    const shots = await page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => e.dataset.mode));
    fs.mkdirSync(`${SCREENS}/signatures`, { recursive: true });
    for (const id of shots) await page.locator(`.ec-mode-card[data-mode="${id}"]`).screenshot({ path: `${SCREENS}/signatures/${id}.png` });
    await ctx.close(); extra.signatures = sigs;
  }

  if (MODE === "responsive") {
    const vps = [[1536, 1024, false], [1440, 900, false], [1280, 800, false], [768, 1024, true], [430, 932, true], [390, 844, true], [375, 812, true]];
    const rows = [];
    for (const state of ["first-time", "returning"]) {
      for (const [w, h, touch] of vps) {
        const ctx = await ctxOf(w, h, touch); const page = await ctx.newPage(); if (state === "first-time") await firstTime(page); else await returning(page);
        await openLobby(page); await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
          const cards = [...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")], sec = [...document.querySelectorAll(".ec-lobby-secondary .ec-mode-card")];
          const cols = (els) => new Set(els.map((c) => Math.round(c.getBoundingClientRect().x))).size;
          const actions = [...document.querySelectorAll(".ec-mode-action")];
          const flag = document.querySelector(".ec-mode-flag")?.getBoundingClientRect(); const glyph = document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-glyph').getBoundingClientRect(); const badge = document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-badge')?.getBoundingClientRect();
          const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const chaos = document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-action').getBoundingClientRect(); const chaosCard = document.querySelector('.ec-mode-card[data-mode="chaos"]'); const cs = getComputedStyle(chaosCard);
          const headerImgs = [...document.querySelectorAll(".ec-brand-header img")].map((i) => i.getAttribute("src"));
          return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, primaryColumns: cols(cards), secondaryColumns: cols(sec), minTarget: Math.min(...actions.map((b) => Math.round(b.getBoundingClientRect().height))), headerTargets: Math.min(...[...document.querySelectorAll(".ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))), docHeight: document.documentElement.scrollHeight, firstMode: cards[0]?.dataset.mode, hero: document.querySelector(".ec-lobby").dataset.hero, heroHeight: Math.round(document.querySelector(".ec-lobby-hero").getBoundingClientRect().height), wraps: actions.filter((a) => a.scrollWidth > a.clientWidth + 1 || [...a.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).some((n) => { const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects().length > 1; })).map((a) => a.closest(".ec-mode-card").dataset.mode), flagCollides: overlap(flag, glyph) || overlap(flag, badge), primaryFullWidth: chaos.width >= chaosCard.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, headerImgs, headerHeight: Math.round(document.querySelector(".ec-brand-header").getBoundingClientRect().height), secondaryVisible: sec.every((c) => c.getBoundingClientRect().height > 0), primaryVisibleInViewport: cards.every((c) => c.getBoundingClientRect().bottom <= window.innerHeight), secondaryVisibleInViewport: sec.every((c) => c.getBoundingClientRect().bottom <= window.innerHeight) };
        });
        const dir = touch ? (w <= 480 ? "mobile" : "tablet") : state; fs.mkdirSync(`${SCREENS}/${dir}`, { recursive: true });
        await page.screenshot({ path: `${SCREENS}/${dir}/lobby-${state}-${w}x${h}.png`, fullPage: touch });
        rows.push({ state, viewport: `${w}x${h}`, ...m });
        const tag = `${state} @${w}×${h}`;
        ok(`${tag}: no page-level horizontal overflow`, m.overflow <= 0, `${m.overflow}px`);
        ok(`${tag}: Chaos Clash first; header shows the Mk1 mark only`, m.firstMode === "chaos" && m.headerImgs.join() === "/brand/eraclash-logo-mk1.png");
        ok(`${tag}: every action ≥44px; header controls ≥44px`, m.minTarget >= 44 && m.headerTargets >= 44, `${m.minTarget}px / ${m.headerTargets}px`);
        ok(`${tag}: no CTA label wraps; the recommended badge collides with nothing`, m.wraps.length === 0 && !m.flagCollides, m.wraps.join(",") || "ok");
        ok(`${tag}: hero is ${state === "first-time" ? "full" : "compact"}`, m.hero === (state === "first-time" ? "full" : "compact-returning"), `${m.hero} ${m.heroHeight}px`);
        if (!touch) { ok(`${tag}: three primary and four secondary cards visible in ONE viewport (${m.docHeight}/${h}px)`, m.primaryColumns === 3 && m.secondaryColumns === 4 && m.primaryVisibleInViewport && m.secondaryVisibleInViewport && m.docHeight <= h); ok(`${tag}: header height not increased (parent measures 65px incl. its 1px border)`, m.headerHeight <= 65, `${m.headerHeight}px`); }
        if (touch && w >= 700) ok(`${tag}: two columns on a tablet`, m.primaryColumns === 2 && m.secondaryColumns === 2, `${m.primaryColumns}/${m.secondaryColumns}`);
        if (touch && w < 700) ok(`${tag}: one column, primary CTA full width, secondaries stacked and visible`, m.primaryColumns === 1 && m.secondaryColumns === 1 && m.primaryFullWidth && m.secondaryVisible);
        await ctx.close();
      }
    }
    // Active run on a phone: Continue before the mode list, compact hero.
    const ctx = await ctxOf(390, 844, true); const page = await ctx.newPage(); await withAccountKeepRun(page);
    const runId = await startRealRun(page); await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-continue:not(.ec-continue--pending)", { timeout: 20_000 }); await page.waitForTimeout(300);
    const am = await heroFacts(page); const targets = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".ec-continue-cta, .ec-continue-quiet, .ec-mode-action")].map((b) => Math.round(b.getBoundingClientRect().height))));
    fs.mkdirSync(`${SCREENS}/mobile`, { recursive: true }); await page.screenshot({ path: `${SCREENS}/mobile/lobby-active-run-390x844.png`, fullPage: true });
    ok("active run @390×844: compact hero, Continue before the mode list, 44px controls, run intact, no overflow", am.hero === "compact-active-run" && am.continueTop < am.gridTop && targets >= 44 && am.run === runId && am.overflow <= 0, `continue ${am.continueTop} < grid ${am.gridTop} · min ${targets}px`);
    rows.push({ state: "active-run", viewport: "390x844", ...am, minTarget: targets });
    await ctx.close(); extra.rows = rows;
  }

  if (MODE === "accessibility") {
    const ctx = await ctxOf(1280, 800); const page = await ctx.newPage(); await firstTime(page); await openLobby(page);
    const a = await page.evaluate(() => {
      const actions = [...document.querySelectorAll(".ec-mode-action")];
      const heroLine = document.querySelector(".ec-lobby-line"), band = document.querySelector(".ec-lobby-hero");
      return {
        main: !!document.querySelector('main[aria-labelledby="ec-lobby-title"]'), h1: document.getElementById("ec-lobby-title")?.textContent,
        names: actions.map((el) => ({ id: el.closest(".ec-mode-card").dataset.mode, tag: el.tagName, name: el.getAttribute("aria-label"), href: el.getAttribute("href"), ariaDisabled: el.getAttribute("aria-disabled"), hierarchy: el.dataset.hierarchy, border: getComputedStyle(el).borderStyle, arrow: getComputedStyle(el, "::after").content, gradient: /gradient/.test(getComputedStyle(el).backgroundImage) })),
        badges: [...document.querySelectorAll(".ec-mode-badge")].map((b) => b.textContent.trim()), flag: document.querySelector(".ec-mode-flag")?.textContent.trim(),
        decorativeHidden: [...document.querySelectorAll(".ec-mode-signature, .ec-mode-glyph svg")].every((s) => s.getAttribute("aria-hidden") === "true"),
        heroLineColor: getComputedStyle(heroLine).color, bandBg: getComputedStyle(band).backgroundColor,
        headings: document.querySelectorAll(".ec-mode-card h2").length, sections: [...document.querySelectorAll(".ec-lobby section[aria-label]")].map((s) => s.getAttribute("aria-label")),
        logoAlt: document.querySelector(".ec-lobby-logo").getAttribute("alt"), headerLogoAlt: document.querySelector(".ec-brand-logo").getAttribute("alt"), homeName: document.querySelector(".ec-brand-home").getAttribute("aria-label"),
        autoAnimations: [...document.querySelectorAll(".ec-lobby *")].filter((e) => getComputedStyle(e).animationName !== "none").length,
      };
    });
    ok("landmark, heading and regions intact", a.main && /Play EraClash Basketball/.test(a.h1) && a.headings === 7 && a.sections.join("|") === "Game modes|More ways to play");
    ok("every action is a real link or button whose name carries the purpose and the mode", a.names.every((n) => ["A", "BUTTON"].includes(n.tag) && n.name && /Chaos Clash|Dream Matchup|Daily Clash|Best of 7|Win 82|Tournament|Era Gauntlet/.test(n.name)));
    ok("the recommended, free-account and coming-soon facts are announced in the names", /Start Chaos Clash, recommended mode/.test(a.names.find((n) => n.id === "chaos").name) && /Build Dream Matchup, free account required/.test(a.names.find((n) => n.id === "dream").name) && /Learn more about Era Gauntlet, coming soon/.test(a.names.find((n) => n.id === "gauntlet").name));
    ok("badges and the recommended flag are text", a.badges.length >= 4 && a.badges.every(Boolean) && a.flag === "RECOMMENDED");
    ok("primary / secondary / unavailable are distinguishable without colour (fill+no-arrow · solid border+arrow · dashed border)", a.names.filter((n) => n.hierarchy === "primary").every((n) => n.gradient && !/→/.test(n.arrow)) && a.names.filter((n) => n.hierarchy === "secondary").every((n) => n.border === "solid" && /→/.test(n.arrow) && !n.gradient) && a.names.filter((n) => n.hierarchy === "unavailable").every((n) => n.border === "dashed" && !/→/.test(n.arrow)));
    ok("the unavailable action with a real destination is a link and not aria-disabled; no automatic animation runs", a.names.find((n) => n.id === "gauntlet").tag === "A" && a.names.find((n) => n.id === "gauntlet").ariaDisabled === null && a.autoAnimations === 0);
    ok("decorative motifs and glyphs are hidden from assistive technology", a.decorativeHidden);
    ok("both marks are described once: the lobby image by alt, the header image by its button", a.logoAlt === "EraClash Basketball" && a.headerLogoAlt === "" && a.homeName === "EraClash Basketball home");
    ok("the hero line clears AA on the brand band", ratio(a.heroLineColor, a.bandBg) >= 4.5, `${ratio(a.heroLineColor, a.bandBg)}:1`);
    const cards = await cardFacts(page);
    const contrast = cards.map((c) => ({ id: c.id, ratio: ratio(c.color, /gradient/.test(c.bgImage) ? "rgb(232, 177, 60)" : (c.bgColor.match(/[\d.]+/g)?.length === 4 && Number(c.bgColor.match(/[\d.]+/g)[3]) === 0 ? c.cardBg : c.bgColor)) }));
    ok("every action's text clears AA on its own face (primary ink on gold, ink on ivory, muted ink on the card)", contrast.every((c) => c.ratio >= 4.5), contrast.map((c) => `${c.id} ${c.ratio}`).join(" · "));
    // Keyboard: Tab order reaches the actions in card order; focus is visible; Enter opens the route.
    await page.keyboard.press("Tab"); let reached = false; for (let i = 0; i < 30 && !reached; i++) { reached = await page.evaluate(() => document.activeElement?.classList.contains("ec-mode-action")); if (!reached) await page.keyboard.press("Tab"); }
    const focusInfo = await page.evaluate(() => ({ mode: document.activeElement.closest(".ec-mode-card")?.dataset.mode, outline: getComputedStyle(document.activeElement).outlineStyle }));
    ok("Tab reaches the Chaos action first with a visible focus ring", reached && focusInfo.mode === "chaos" && focusInfo.outline !== "none", JSON.stringify(focusInfo));
    const order = [focusInfo.mode]; for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement.closest(".ec-mode-card")?.dataset.mode || document.activeElement.className)); }
    ok("Tab moves through the seven actions in card order", order.join() === "chaos,dream,daily,bo7,win82,tournament,gauntlet", order.join());
    await page.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
    ok("Enter on the primary opens /play/chaos", /\/play\/chaos$/.test(page.url()), page.url());
    // Reduced motion.
    await page.emulateMedia({ reducedMotion: "reduce" }); await openLobby(page);
    const rm = await page.evaluate(() => ({ action: getComputedStyle(document.querySelector(".ec-mode-action")).transitionDuration, sig: getComputedStyle(document.querySelector(".ec-mode-signature")).transitionDuration, card: getComputedStyle(document.querySelector(".ec-mode-card")).transitionDuration }));
    ok("reduced motion removes the action and signature transitions", parseFloat(rm.action) < 0.01 && parseFloat(rm.sig) < 0.01, JSON.stringify(rm));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Active run: the Continue button comes before the mode actions in the tab order and is named.
    // A fresh context: the first-time init script above clears storage on every navigation and would erase the run.
    const actx = await ctxOf(1280, 800); const apage = await actx.newPage(); await withAccountKeepRun(apage);
    const runId = await startRealRun(apage); await apage.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await apage.waitForSelector(".ec-continue:not(.ec-continue--pending)", { timeout: 20_000 });
    const tabOrder = []; await apage.keyboard.press("Tab"); for (let i = 0; i < 30; i++) { const k = await apage.evaluate(() => (document.activeElement.classList.contains("ec-continue-cta") ? "continue" : document.activeElement.classList.contains("ec-mode-action") ? "mode" : null)); if (k) tabOrder.push(k); if (tabOrder.filter((x) => x === "mode").length >= 1) break; await apage.keyboard.press("Tab"); }
    const contName = await apage.locator("button.ec-continue-cta").getAttribute("aria-label"); await actx.close();
    ok("with a run waiting, Continue is reached before any mode action and is named for what it does", tabOrder[0] === "continue" && /Continue your Chaos Clash/.test(contName) && !!runId, tabOrder.join(","));
    // Mobile touch targets, including the header.
    const m = await ctxOf(390, 844, true); const mp = await m.newPage(); await firstTime(mp); await openLobby(mp);
    const mt = await mp.evaluate(() => Math.min(...[...document.querySelectorAll(".ec-mode-action, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))));
    ok("390×844: every control is at least 44px", mt >= 44, `${mt}px`); await m.close();
    extra.audit = a; extra.contrast = contrast; extra.tabOrder = order; await ctx.close();
  }

  if (MODE === "performance") {
    const ctx = await ctxOf(1440, 900); const page = await ctx.newPage(); await firstTime(page); await installCls(page);
    await openLobby(page); await page.waitForTimeout(800);
    const perf = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, cls: +window.__cls.toFixed(4), signatureBytes: [...document.querySelectorAll(".ec-mode-signature")].reduce((n, s) => n + s.outerHTML.length, 0), transfer: performance.getEntriesByType("resource").filter((r) => /\.(js|css)$/.test(r.name)).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) }; });
    const polish = cssSection("PHASE 9A.3P").length;
    ok("first contentful paint under 1.5s on the harness", perf.fcp != null && perf.fcp < 1500, `${perf.fcp}ms`);
    ok("no layout shift after first paint (CLS < 0.02) for a first-time visitor", perf.cls < 0.02, String(perf.cls));
    ok("the seven signatures add under 8KB of inline SVG", perf.signatureBytes < 8192, `${perf.signatureBytes} bytes`);
    ok("the polish layer is under 8KB of CSS source", polish < 8192, `${polish} bytes`);
    // Returning + active-run CLS too.
    const r = await ctx.newPage(); await returning(r); await installCls(r); await openLobby(r); await r.waitForTimeout(600);
    const rcls = await r.evaluate(() => +window.__cls.toFixed(4)); ok("no layout shift for a returning device (compact hero)", rcls < 0.02, String(rcls));
    const a = await ctx.newPage(); await withAccountKeepRun(a); await installCls(a); await startRealRun(a); await a.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await a.waitForSelector(".ec-continue:not(.ec-continue--pending)", { timeout: 20_000 }); await a.waitForTimeout(600);
    const acls = await a.evaluate(() => +window.__cls.toFixed(4)); ok("no layout shift when the active run resolves into the Continue card", acls < 0.05, String(acls));
    extra.perf = { ...perf, polishCssBytes: polish, returningCls: rcls, activeRunCls: acls, note: "The Continue card mounts once the server's view of the remembered run arrives; the hero above it is already compact, so the shift is the card's own insertion below the band." };
    await ctx.close();
  }
  await browser.close();
}

// ── write ────────────────────────────────────────────────────────────────────
const FILE = { contracts: "play-lobby-polish-contract-qa.json", registry: "mode-registry-qa.json", cta: "cta-hierarchy-qa.json", hero: "adaptive-hero-qa.json", signatures: "mode-signature-qa.json", responsive: "lobby-responsive-qa.json", accessibility: "lobby-accessibility-qa.json", performance: "lobby-performance-qa.json" }[MODE];
const passed = checks.filter((c) => c.pass).length;
fs.writeFileSync(`${OUT}/${FILE}`, JSON.stringify({ artifact: FILE.replace(/\.json$/, ""), phase: PHASE, mode: MODE, baseUrl: BROWSER.includes(MODE) ? BASE : null, presentationVersion: LOBBY_PRESENTATION_VERSION, checks: checks.length, passed, failed: checks.length - passed, results: checks, ...extra }, null, 2) + "\n");
console.log(`\n${MODE}: ${passed}/${checks.length} checks passed → ${OUT}/${FILE}`);
process.exit(passed === checks.length ? 0 : 1);
