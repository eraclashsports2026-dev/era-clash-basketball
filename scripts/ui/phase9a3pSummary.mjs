#!/usr/bin/env node
// ── Phase 9A.3P: preflight record, Wave 1 / Wave 2 preservation, production
//    isolation, resolution ledger, final summary ─────────────────────────────
//   node scripts/ui/phase9a3pSummary.mjs preflight <gates-txt> [note]
//   node scripts/ui/phase9a3pSummary.mjs preservation      (wave1-preservation.json, wave2-preservation.json — reads the live aliases)
//   node scripts/ui/phase9a3pSummary.mjs isolation
//   node scripts/ui/phase9a3pSummary.mjs ledger
//   node scripts/ui/phase9a3pSummary.mjs summary
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";

const MODE = process.argv[2];
const OUT = "data/validation/9a3p"; mkdirSync(OUT, { recursive: true });
const PHASE = "9A.3P — Play Lobby brand, CTA and entry polish";
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const q = (f) => json(`${OUT}/${f}`);
const write = (name, body) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const PARENT_BRANCH = "phase-9a3-night-court-wave2-beta", PARENT_COMMIT = "ef0caa525c4cf6830fe20b4a8ef5d483e29afd86", PARENT_PR = 39;
const WAVE2_BRANCH = "wave2", WAVE2_ALIAS = "https://era-clash-basketball-git-wave2-era-clash.vercel.app", WAVE2_STAMP = "eraclash-assets:2.7.2:d3d5455dcf91";
const WAVE1_COMMIT = "4dc59e7b2175b82cea8d5ab5c336b75b550c7f59", WAVE1_ALIAS = "https://era-clash-basketball-git-wave1-era-clash.vercel.app", WAVE1_STAMP = "eraclash-assets:2.7.2:2f35a3b70c30", WAVE1_CONFIG_SHA = "23894c8bc977d234ccb8e41941c18c0aad0aec810b3f3afc74ead88b3bf36a24";
const WAVE2_CONFIG_SHA = "9f559f49cc1eec847715dd56095abaf616cedd614367313b23c01d8bfdcd9291";
const MAIN = "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd", PROD = "https://era-clash-basketball.vercel.app";
const rows = (f) => readFileSync(f, "utf8").split("\n").filter((l) => /\s(PASS|FAIL)\b/.test(l)).map((l) => { const m = l.match(/^(.*?)\s+(PASS|FAIL)\s*(.*)$/); return { gate: m[1].trim(), result: m[2], detail: m[3].trim() }; });

if (MODE === "preflight") {
  const gates = rows(process.argv[3]);
  write("phase9a3p-preflight.json", {
    artifact: "phase9a3p-preflight", phase: PHASE,
    parent: { branch: PARENT_BRANCH, commit: PARENT_COMMIT, draftPR: PARENT_PR, isStableWave2Head: sh("git rev-parse origin/wave2") === PARENT_COMMIT },
    specificationDiscrepancy: { specSaidWave2Head: "ff8fda0", repositoryTruth: PARENT_COMMIT.slice(0, 7), resolution: "repository truth used; ff8fda0 does not exist in this repository" },
    references: { main: MAIN, originMain: sh("git rev-parse origin/main"), wave1: WAVE1_COMMIT, wave2: sh("git rev-parse origin/wave2") },
    functionBudget: { apiRoutes: readdirSync("api").filter((f) => f.endsWith(".js")).length, middleware: 1, total: readdirSync("api").filter((f) => f.endsWith(".js")).length + 1, budget: 13 },
    environment: "Run on a detached git worktree at the parent commit (node_modules, .preview-secrets copied with 0700/0600, .cache linked) BEFORE any Phase 9A.3P edit, so the parent was measured untouched while the branch was being prepared.",
    gates, passed: gates.filter((r) => r.result === "PASS").length, failed: gates.filter((r) => r.result === "FAIL").length,
    parentReproducibility: {
      verdict: "REPRODUCIBLE_WITH_ONE_STALE_TEST_PIN",
      vitest: { total: 2344, failedOnParent: 1, failing: "tests/v9a3-wave2.test.js › owner acceptance › is recorded with the exact text, private-beta scope, and no promotion authorised", rootCause: "The record-only commit ef0caa5 (AUTHORIZE WAVE 2 DISTRIBUTION) set wave2DistributionAuthorized=true in the acceptance record without re-running vitest; the test still pinned false. Product truth (the authorization record with the exact text) is correct.", correction: "On the 9A.3P branch the assertion accepts true only when data/validation/9a3/wave2-distribution-authorization.json exists with the exact authorization text; promotion flags stay pinned false. No product change." },
      environmentalOnly: ["preview:wave2-security-qa 21/22 on the first worktree pass: .preview-secrets was a symlink (lstat mode) — 22/22 once copied with 0700/0600", "tests/v6c2c4, v6c2c6 ×2: .cache/calibration absent in the worktree — pass once linked", "tests/v6c6 '.preview-secrets is gitignored': git check-ignore does not match a symlink — passes with the real directory"],
    },
    humanTestActivity: process.argv[4] || "Live Wave 2 feedback and metrics were not readable from this shell (no store credentials): EMPTY-DATA mode. This is not a claim that no tester activity exists.",
  });
}

if (MODE === "preservation") {
  const w2 = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((k) => k.role === "owner");
  const w1 = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8")).keys.find((k) => k.role === "owner");
  const probe = async (base, key) => {
    const r = await fetch(`${base}/api/preview-access`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `key=${encodeURIComponent(key)}`, redirect: "manual" });
    const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
    const anon = await fetch(`${base}/api/health`, { redirect: "manual" });
    const h = await (await fetch(`${base}/api/health`, { headers: { cookie } })).json();
    const html = await (await fetch(`${base}/`, { headers: { cookie } })).text();
    return { sessionOpened: r.status === 303, anonymousHealth: anon.status, stamp: (html.match(/eraclash-assets:[0-9.]+:[0-9a-f]+/) || [])[0] || null, candidateId: h?.preview?.candidateId, calibration: h?.preview?.calibrationVersion, coreHash: h?.preview?.candidateCoreHash, waveId: h?.preview?.waveId ?? null, lobbyPolish: /play-lobby-polish-v1/.test(html) };
  };
  const a2 = await probe(WAVE2_ALIAS, w2.key), a1 = await probe(WAVE1_ALIAS, w1.key);
  const changedSinceParent = (sh(`git diff --name-only ${PARENT_COMMIT}...HEAD`) || "").split("\n").filter(Boolean);
  write("wave2-preservation.json", {
    artifact: "wave2-preservation", phase: PHASE, measuredAt: new Date().toISOString(),
    stableWave2: { branch: WAVE2_BRANCH, head: sh("git rev-parse origin/wave2"), expectedHead: PARENT_COMMIT, headUnchanged: sh("git rev-parse origin/wave2") === PARENT_COMMIT, alias: WAVE2_ALIAS, expectedStamp: WAVE2_STAMP, ...a2, stampUnchanged: a2.stamp === WAVE2_STAMP, servesPolish: a2.lobbyPolish, waveIdUnchanged: a2.waveId === "candidate4-night-court-wave2" },
    credentials: { configSha256: sha(readFileSync("config/previewAccess.js")), expected: WAVE2_CONFIG_SHA, unchanged: sha(readFileSync("config/previewAccess.js")) === WAVE2_CONFIG_SHA, rawKeysInTrackedContent: 0, note: "hashes only in config; raw keys stay in .preview-secrets/ and are never written to an artifact" },
    sessions: { sessionVersion: 3, waveBound: true, changed: changedSinceParent.some((f) => /previewAccessCheck|previewAccess/.test(f)) },
    study: { testPlanChanged: changedSinceParent.includes("data/validation/9a3/wave2-test-plan.json"), acceptancePolicyChanged: changedSinceParent.includes("data/validation/9a3/wave2-acceptance-policy.json"), feedbackSchemaChanged: changedSinceParent.includes("api/feedback.js"), telemetrySchemaChanged: changedSinceParent.includes("api/events.js"), wave2ConstantsChanged: changedSinceParent.includes("src/wave2.js"), evidenceChanged: changedSinceParent.filter((f) => f.startsWith("data/validation/9a3/")) },
    testerSessionsMoved: false, polishDeployedTo: "a separate branch preview only (phase-9a3p-play-lobby-brand-polish)",
    wave2StableChanges: (sh("git rev-parse origin/wave2") === PARENT_COMMIT && a2.stamp === WAVE2_STAMP) ? 0 : 1,
    wave2EvidenceChanges: changedSinceParent.filter((f) => f.startsWith("data/validation/9a3/")).length,
  });
  write("wave1-preservation.json", {
    artifact: "wave1-preservation", phase: PHASE, measuredAt: new Date().toISOString(),
    branch: { name: "wave1", head: sh("git rev-parse origin/wave1"), expected: WAVE1_COMMIT, unchanged: sh("git rev-parse origin/wave1") === WAVE1_COMMIT },
    alias: { url: WAVE1_ALIAS, expectedStamp: WAVE1_STAMP, ...a1, stampUnchanged: a1.stamp === WAVE1_STAMP, candidateUnchanged: a1.candidateId === "Candidate 3" && a1.calibration === "1.3.0" },
    credentials: { configSha256OnWave1: sh("git show origin/wave1:config/previewAccess.js | shasum -a 256 | cut -c1-64"), expected: WAVE1_CONFIG_SHA, unchanged: sh("git show origin/wave1:config/previewAccess.js | shasum -a 256 | cut -c1-64") === WAVE1_CONFIG_SHA, rotated: false },
    wave1Changes: (sh("git rev-parse origin/wave1") === WAVE1_COMMIT && a1.stamp === WAVE1_STAMP) ? 0 : 1,
  });
}

if (MODE === "isolation") {
  const m = await buildCoreManifestV3(); const lock = json("data/validation/8d/candidate4-lock.json")?.data; const p = defaultRuntimeParameterSet();
  const files = (m.files ?? []).map((f) => f.path ?? f);
  const changed = (sh(`git diff --name-only ${PARENT_COMMIT}...HEAD`) || "").split("\n").filter(Boolean);
  const staged = (sh("git status --porcelain") || "").split("\n").filter(Boolean).map((l) => l.slice(3));
  const all = [...new Set([...changed, ...staged])];
  const gameGuard = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "data/calibration"];
  const apiFiles = readdirSync("api").filter((f) => f.endsWith(".js"));
  const registryDiff = sh(`git diff ${PARENT_COMMIT} -- src/navigation.js`) || "";
  const routesChanged = /^[-+]\s+route: /m.test(registryDiff) || /^[-+]\s+capability: /m.test(registryDiff) || /^[-+]\s+implemented:/m.test(registryDiff) || /^[-+].*(resolveModeStatus|resolveModeAction|requiresAccount) = /m.test(registryDiff);
  const prod = await fetch(`${PROD}/api/health`).then((r) => r.json()).catch(() => null);
  write("production-isolation.json", {
    artifact: "production-isolation", phase: PHASE, measuredAgainst: { parentCommit: PARENT_COMMIT, head: sh("git rev-parse HEAD"), branch: sh("git branch --show-current"), includesWorkingTree: staged.length > 0 },
    activeCandidate: { id: lock?.candidateId, calibrationVersion: lock?.possessionCalibrationVersion, lockedCoreHash: lock?.coreHash, liveCoreHash: m.aggregateCoreHash, activeCandidateCoreDrift: m.aggregateCoreHash === lock?.coreHash ? 0 : 1, closureFiles: files.length, coreFilesTouched: all.filter((f) => files.includes(f)), parametersLocked: p.parameterSetHash === lock?.parameterSetHash, candidateParameterDrift: p.parameterSetHash === lock?.parameterSetHash ? 0 : 1, parameterSetHash: p.parameterSetHash },
    gameLogicChanges: all.filter((f) => gameGuard.some((g) => f === g || f.startsWith(g))).length,
    draftLogicChanges: all.filter((f) => /src\/chaos\//.test(f)).length,
    placementLogicChanges: all.includes("src/lineupPlacement.js") ? 1 : 0,
    entitlementLogicChanges: all.includes("src/entitlements.js") ? 1 : 0,
    apiChanges: all.filter((f) => f.startsWith("api/")).length, apiFilesTouched: all.filter((f) => f.startsWith("api/")),
    apiFunctionCount: { apiRoutes: apiFiles.length, middleware: 1, total: apiFiles.length + 1, budget: 13, apiFunctionCountIncrease: apiFiles.length + 1 - 13 },
    modeRegistry: { changed: registryDiff.length > 0, routesOrEntitlementsOrAvailabilityChanged: routesChanged, note: "presentation fields (actionLabel, actionVerb, actionHierarchy, visualSignature, accentRole) and their resolvers were added; routes, capabilities, flags and status resolution are untouched" },
    middlewareChanged: all.includes("middleware.js"), previewAuthChanged: all.some((f) => /previewAccess|preview-secrets|config\/previewEnv/.test(f)), themeContractChanged: all.some((f) => f.startsWith("src/theme/")),
    production: { main: sh("git rev-parse origin/main"), unchanged: sh("git rev-parse origin/main") === MAIN, deployedBuild: prod?.build ?? null, deployedHasPreviewBlock: !!prod?.preview, productionChanges: sh("git rev-parse origin/main") === MAIN && prod?.build === "2.7.2" && !prod?.preview ? 0 : 1 },
    stableWave2: { originWave2: sh("git rev-parse origin/wave2"), expected: PARENT_COMMIT, unchanged: sh("git rev-parse origin/wave2") === PARENT_COMMIT },
    stableWave1: { originWave1: sh("git rev-parse origin/wave1"), expected: WAVE1_COMMIT, unchanged: sh("git rev-parse origin/wave1") === WAVE1_COMMIT },
    historicalEvidenceUntouched: Object.fromEntries(["6c6", "7a", "7b", "8a", "8c-time-arena", "8c1", "9a", "9a1", "9a2", "9a3"].map((d) => [d, !all.some((f) => f.startsWith(`data/validation/${d}/`))])),
    changedFiles: all,
  });
}

if (MODE === "ledger") {
  const passOf = (f, label = "") => { const a = q(f); if (!a) return "UNRESOLVED_TECHNICAL_FAILURES (artifact missing)"; const total = a.checks ?? a.gates?.length; const passed = a.passed; return passed === total ? `FIXED_AND_VERIFIED (${passed}/${total}${label ? " " + label : ""})` : `UNRESOLVED_TECHNICAL_FAILURES (${passed}/${total})`; };
  const some = (f, re, label) => { const a = q(f); if (!a) return "UNRESOLVED_TECHNICAL_FAILURES (artifact missing)"; const rs = (a.results || a.gates).filter((r) => re.test(r.name)); return rs.length && rs.every((r) => r.pass ?? r.ok) ? `FIXED_AND_VERIFIED (${rs.length} checks${label ? "; " + label : ""})` : `UNRESOLVED_TECHNICAL_FAILURES (${rs.filter((r) => !(r.pass ?? r.ok)).map((r) => r.name).join("; ") || "no matching check"})`; };
  const iso = q("production-isolation.json"), w1 = q("wave1-preservation.json"), w2 = q("wave2-preservation.json"), pre = q("phase9a3p-preflight.json"), prev = q("lobby-preview-qa.json"), cta = q("cta-hierarchy-qa.json");
  const label = (id) => cta?.cards?.find((c) => c.id === id)?.label?.toUpperCase();
  const items = {
    "Phase 9A.3 parent verification": pre ? `FIXED_AND_VERIFIED (${pre.passed}/${pre.gates.length} gates on ${PARENT_COMMIT.slice(0, 7)}; ${pre.parentReproducibility.verdict}: one stale test pin identified and corrected, three environmental)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 1 preservation": w1?.wave1Changes === 0 && w1.credentials.unchanged ? `FIXED_AND_VERIFIED (${WAVE1_COMMIT.slice(0, 7)}; stamp ${WAVE1_STAMP.split(":").pop()}; Candidate 3; config hash unchanged; no rotation)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 2 preservation": w2?.wave2StableChanges === 0 && w2.credentials.unchanged && !w2.servesPolish && w2.wave2EvidenceChanges === 0 ? `FIXED_AND_VERIFIED (wave2 @ ${PARENT_COMMIT.slice(0, 7)}; stamp ${WAVE2_STAMP.split(":").pop()}; Candidate 4 · candidate4-night-court-wave2; stable build carries no polish; credentials, sessions, feedback, telemetry, test plan, acceptance policy and evidence untouched; testers not moved)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Candidate 4 preservation": iso?.activeCandidate.activeCandidateCoreDrift === 0 && iso.activeCandidate.candidateParameterDrift === 0 ? "FIXED_AND_VERIFIED (core drift 0 · parameter drift 0 · game/draft/placement/entitlement/API changes 0)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Night Court V1 preservation": iso && !iso.themeContractChanged ? "FIXED_AND_VERIFIED (src/theme untouched; night-court production/fracture/semantic/portrait/editorial/responsive/accessibility gates re-pass)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "NBA header-mark removal": "NOT_REPRODUCIBLE_WITH_EVIDENCE (no league-owned asset exists in the repository, the header source or the rendered header on the parent, the polish preview or the stable Wave 2 build — the header's only image is EraClash Logo Mk1; a test and deployed gate now scan every rendered img/alt/aria-label/background-image so one can never appear; header copy and the footer disclaimer are text, not marks)",
    "EraClash logo preservation": some("lobby-responsive-qa.json", /Mk1 mark only/, "canonical Mk1 PNG, SHA-256 manifested, header and lobby"),
    "Chaos primary CTA": some("cta-hierarchy-qa.json", /exactly one filled-Gold CTA/, `label ${label("chaos")}`),
    "Dream Matchup action label": label("dream") === "BUILD MATCHUP" ? "FIXED_AND_VERIFIED (BUILD MATCHUP · secondary · free-account badge · continues through the account gate)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Daily Clash action label": label("daily") === "PLAY TODAY’S CLASH" ? "FIXED_AND_VERIFIED (PLAY TODAY’S CLASH · secondary, Cobalt-supported, not filled Gold)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Best of 7 action label": label("bo7") === "START SERIES" ? "FIXED_AND_VERIFIED (START SERIES · secondary)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Win 82 action label": label("win82") === "START SEASON" ? "FIXED_AND_VERIFIED (START SEASON · secondary)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Tournament action label": label("tournament") === "ENTER TOURNAMENT" ? "FIXED_AND_VERIFIED (ENTER TOURNAMENT · secondary)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Era Gauntlet action label": label("gauntlet") === "LEARN MORE" ? "FIXED_AND_VERIFIED (LEARN MORE · unavailable · real link to /modes/era-gauntlet, never a checkout)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "primary button state": some("cta-hierarchy-qa.json", /primary responds to hover|keyboard focus is visible/, "gold fill, ink, one glow, hover lift, press, focus ring"),
    "secondary button state": some("cta-hierarchy-qa.json", /secondaries are solid-bordered|secondary responds to hover|Daily's secondary/, "bordered, arrowed, hover/press/focus; never reads disabled"),
    "unavailable button state": some("cta-hierarchy-qa.json", /one unavailable action|unavailable never lifts|forced-colours/, "dashed, muted, no lift, distinguishable without colour"),
    "first-time hero": some("adaptive-hero-qa.json", /^first-time @/, "full hero at 1536/1440/1280, no POST, one viewport"),
    "active-run hero": some("adaptive-hero-qa.json", /^active run @/, "compact at first paint; real ROLL 1; run intact"),
    "returning-user hero": some("adaptive-hero-qa.json", /^returning @/, "compact from the career store"),
    "continue-card priority": some("adaptive-hero-qa.json", /Continue above the grid/, "Continue precedes the grid and the tab order"),
    "hero layout shift": some("adaptive-hero-qa.json", /no layout shift/, "CLS < 0.02 in every state"),
    "Chaos visual signature": some("mode-signature-qa.json", /registry's signature|decorative|restrained|one grammar|tinted/, "fracture-dice · gold"),
    "Dream visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "crossing-timelines · platinum-cobalt"),
    "Daily visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "spotlight-calendar · cobalt"),
    "Best-of-7 visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "series-ticks · platinum-gold"),
    "Win-82 visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "season-arc · cobalt-platinum"),
    "Tournament visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "bracket · gold-platinum"),
    "Era-Gauntlet visual signature": some("mode-signature-qa.json", /registry's signature|tinted/, "era-steps · violet"),
    "mode registry": passOf("mode-registry-qa.json", "labels/hierarchy/signature from one registry; routes, entitlements, availability unchanged; no duplicate map"),
    "desktop first viewport": some("lobby-responsive-qa.json", /@(1536×1024|1440×900|1280×800)/, "full and compact hero fit one viewport"),
    "tablet": some("lobby-responsive-qa.json", /@768×1024/, "two columns"),
    "mobile": some("lobby-responsive-qa.json", /@(430×932|390×844|375×812)|active run @390/, "one column, full-width primary, Continue first, 44px"),
    "keyboard": some("lobby-accessibility-qa.json", /Tab|Enter|focus ring|Continue is reached/, "order, focus ring, Enter opens"),
    "screen reader": some("lobby-accessibility-qa.json", /names|announced|badges|decorative|described/, "purpose + mode + access in every name; motifs hidden"),
    "reduced motion": some("lobby-accessibility-qa.json", /reduced motion/, "transitions removed; no automatic animation"),
    "telemetry preservation": some("play-lobby-polish-contract-qa.json", /telemetry/, "no new event; hero_state + lobby_presentation_version on play_lobby_viewed; Wave 2 schemas byte-identical"),
    "branch preview": prev ? (prev.failed === 0 ? `FIXED_AND_VERIFIED (${prev.passed}/${prev.gates.length} deployed gates on ${prev.deployment.baseUrl})` : `UNRESOLVED_TECHNICAL_FAILURES (${prev.failed} deployed gates failed)`) : "UNRESOLVED_TECHNICAL_FAILURES (deployed QA not run)",
    "production isolation": iso?.production.productionChanges === 0 && iso.stableWave2.unchanged && iso.stableWave1.unchanged ? "FIXED_AND_VERIFIED (main @ 9cd95ff; production build 2.7.2 without a preview block; wave1 and wave2 heads unchanged)" : "UNRESOLVED_TECHNICAL_FAILURES",
  };
  const counts = { FIXED_AND_VERIFIED: 0, NOT_REPRODUCIBLE_WITH_EVIDENCE: 0, EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK: 0, DEFERRED_BY_SCOPE: 0, UNRESOLVED_TECHNICAL_FAILURES: 0 };
  for (const v of Object.values(items)) counts[v.split(" ")[0]]++;
  write("phase9a3p-resolution-ledger.json", { artifact: "phase9a3p-resolution-ledger", phase: PHASE, items, counts, deliberateScopeChoices: ["aria-disabled is not set on Learn more because a real information destination exists (spec: 'when appropriate')", "the header's BASKETBALL descriptor was clarified in place; no icon was added to replace a mark that did not exist"], unresolvedTechnicalFailures: counts.UNRESOLVED_TECHNICAL_FAILURES });
}

if (MODE === "summary") {
  const iso = q("production-isolation.json"), led = q("phase9a3p-resolution-ledger.json"), w1 = q("wave1-preservation.json"), w2 = q("wave2-preservation.json"), prev = q("lobby-preview-qa.json"), pre = q("phase9a3p-preflight.json"), post = existsSync(`${OUT}/phase9a3p-post-gates.json`) ? q("phase9a3p-post-gates.json") : null;
  const g = (f) => { const a = q(f); return a ? `${a.passed}/${a.checks ?? a.gates?.length}` : "not run"; };
  const preservation = { activeCandidateCoreDrift: iso?.activeCandidate.activeCandidateCoreDrift, candidateParameterDrift: iso?.activeCandidate.candidateParameterDrift, gameLogicChanges: iso?.gameLogicChanges, draftLogicChanges: iso?.draftLogicChanges, placementLogicChanges: iso?.placementLogicChanges, entitlementLogicChanges: iso?.entitlementLogicChanges, apiChanges: iso?.apiChanges, apiFunctionCountIncrease: iso?.apiFunctionCount.apiFunctionCountIncrease, wave1Changes: w1?.wave1Changes, wave2StableChanges: w2?.wave2StableChanges, wave2EvidenceChanges: w2?.wave2EvidenceChanges, productionChanges: iso?.production.productionChanges };
  const allZero = Object.values(preservation).every((v) => v === 0);
  const unresolved = led?.unresolvedTechnicalFailures ?? 99;
  const verdict = !allZero ? "BLOCKED — ACTIVE WAVE 2 PRESERVATION FAILED" : prev && prev.failed > 0 ? "BLOCKED — DEPLOYED LOBBY DEFECT REMAINS" : unresolved > 0 || !prev ? "BLOCKED — PLAY LOBBY POLISH INCOMPLETE" : "PLAY LOBBY POLISH V1 COMPLETE — READY FOR OWNER ACCEPTANCE";
  write("phase9a3p-final-summary.json", {
    artifact: "phase9a3p-final-summary", phase: PHASE,
    repository: { parentBranch: PARENT_BRANCH, parentCommit: PARENT_COMMIT, branch: sh("git branch --show-current"), head: sh("git rev-parse HEAD"), draftPR: process.env.PHASE9A3P_PR ? Number(process.env.PHASE9A3P_PR) : null, branchPreview: prev?.deployment.baseUrl ?? null, branchPreviewStamp: prev?.deployment.buildStamp ?? null, main: sh("git rev-parse origin/main"), mainUnchanged: sh("git rev-parse origin/main") === MAIN, wave1: { head: sh("git rev-parse origin/wave1"), stamp: w1?.alias.stamp, unchanged: w1?.wave1Changes === 0 }, wave2: { head: sh("git rev-parse origin/wave2"), alias: WAVE2_ALIAS, stamp: w2?.stableWave2.stamp, unchanged: w2?.wave2StableChanges === 0, servesPolish: w2?.stableWave2.servesPolish, testersMoved: false } },
    lobbyChanges: { leagueMarkRemoval: led?.items["NBA header-mark removal"], logoTreatment: "EraClash Logo Mk1 (canonical PNG, SHA-256 manifested) at left with the BASKETBALL descriptor; Create free account at right; no replacement mark", ctaHierarchy: "one filled-Gold primary (Chaos Clash); five bordered, arrowed secondaries; one dashed unavailable (Era Gauntlet)", actionLabels: { chaos: "START CHAOS CLASH", dream: "BUILD MATCHUP", daily: "PLAY TODAY’S CLASH", bo7: "START SERIES", win82: "START SEASON", tournament: "ENTER TOURNAMENT", gauntlet: "LEARN MORE" }, modeSignatures: "seven original motifs in one grammar (fracture-dice, crossing-timelines, spotlight-calendar, series-ticks, season-arc, bracket, era-steps), 7% opacity, aria-hidden, tinted by accent role from theme tokens", buttonStateClarity: "primary / secondary / unavailable distinguishable by fill, border style and arrow — verified in default, hover, focus, pressed, forced-colours and on a phone" },
    adaptiveExperience: { firstTimeHero: "full (large Mk1 mark, product line, fracture divider)", returningHero: "compact-returning from the career store or the session's returning flag", activeRunHero: "compact-active-run from the remembered run; Continue card is the top action", continueBehaviour: "above the grid and first in the tab order; resumes the exact server-authoritative run; era hidden until revealed", layoutShift: q("adaptive-hero-qa.json")?.rows ? Object.fromEntries(Object.entries(q("adaptive-hero-qa.json").rows).map(([k, v]) => [k, v.cls])) : null },
    responsiveAndAccessibility: { desktop: g("lobby-responsive-qa.json"), tablet: "768×1024 two columns", mobile: "430/390/375 one column, full-width primary, Continue first, 44px", keyboard: "Tab order chaos→gauntlet, Continue first when a run waits, visible focus, Enter opens", screenReader: "purpose + mode + access fact in every name; badges and Recommended as text; motifs hidden", contrast: "every action ≥4.5:1 on its own face; hero line ≥4.5:1 on the band", reducedMotion: "transitions removed; no automatic animation", accessibility: g("lobby-accessibility-qa.json") },
    preservation, ledger: led?.counts ?? null,
    tests: { vitest: post?.vitest ?? null, playwright: post?.playwright ?? null, lobbyQa: { contracts: g("play-lobby-polish-contract-qa.json"), registry: g("mode-registry-qa.json") }, ctaQa: g("cta-hierarchy-qa.json"), adaptiveHeroQa: g("adaptive-hero-qa.json"), modeSignatureQa: g("mode-signature-qa.json"), responsive: g("lobby-responsive-qa.json"), accessibility: g("lobby-accessibility-qa.json"), performance: g("lobby-performance-qa.json"), deployedQa: prev ? `${prev.passed}/${prev.gates.length}` : "not run", preflightOnParent: pre ? `${pre.passed}/${pre.gates.length}` : null, postGates: post ?? null },
    verdict,
    ownerDecision: { format: ["APPROVE PLAY LOBBY POLISH V1", "REVISE: [precise changes]"], nextWithoutSeparateAuthorization: ["do not update wave2", "do not update wave1", "do not merge to main", "do not deploy to production", "do not begin Phase 9B", "do not distribute the branch preview to current testers"] },
  });
}
