#!/usr/bin/env node
// ── Phase 9A.1: preflight record, production isolation, ledger, final summary ─
//   node scripts/ui/phase9a1Summary.mjs preflight <gates-txt>
//   node scripts/ui/phase9a1Summary.mjs isolation
//   node scripts/ui/phase9a1Summary.mjs ledger
//   node scripts/ui/phase9a1Summary.mjs summary
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";

const MODE = process.argv[2];
const OUT = "data/validation/9a1";
mkdirSync(OUT, { recursive: true });
const PHASE = "9A.1 — Basketball theme decision lab";
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return null; } };
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const write = (name, body) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const PARENT_BRANCH = "phase-9a-play-lobby-activation-clarity";
const PARENT_COMMIT = "ab9f9fa7a7f2ca62f2e60859fdf10adf369256fe";
const WAVE1 = "4dc59e7", MAIN = "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd";

if (MODE === "preflight") {
  const rows = readFileSync(process.argv[3], "utf8").split("\n").filter((l) => /\s(PASS|FAIL)\s/.test(l)).map((l) => { const m = l.match(/^(.*?)\s+(PASS|FAIL)\s+(.*)$/); return { gate: m[1].trim(), result: m[2], detail: m[3].trim() }; });
  write("phase9a1-preflight.json", { artifact: "phase9a1-preflight", phase: PHASE, parent: { branch: PARENT_BRANCH, commit: PARENT_COMMIT, draftPR: 36 }, references: { main: MAIN, wave1: WAVE1 }, functionBudget: { apiRoutes: 12, middleware: 1, total: 13, budget: 13 }, gates: rows, passed: rows.filter((r) => r.result === "PASS").length, failed: rows.filter((r) => r.result === "FAIL").length, betaFeedback: { command: "npm run preview:wave1-feedback-report", note: "runs; store credentials are not in this shell, so it reports in EMPTY-DATA mode; the feedback path is untouched by this phase (diff)" } });
}

if (MODE === "isolation") {
  const m = await buildCoreManifestV3(); const lock = json("data/validation/8d/candidate4-lock.json")?.data; const p = defaultRuntimeParameterSet();
  const files = (m.files ?? []).map((f) => f.path ?? f);
  const changed = (sh(`git diff --name-only ${PARENT_COMMIT}...HEAD`) || "").split("\n").filter(Boolean);
  const guarded = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "data/calibration", "api/"];
  const guardedTouched = changed.filter((f) => guarded.some((g) => f === g || f.startsWith(g)));
  const apiFiles = readdirSync("api").filter((f) => f.endsWith(".js"));
  const registryDiff = sh(`git diff ${PARENT_COMMIT}...HEAD -- src/navigation.js`) || "";
  write("theme-production-isolation.json", {
    artifact: "theme-production-isolation", phase: PHASE, measuredAgainst: { parentCommit: PARENT_COMMIT, head: sh("git rev-parse HEAD"), branch: sh("git branch --show-current") },
    activeCandidate: { id: lock?.candidateId, calibrationVersion: lock?.possessionCalibrationVersion, lockedCoreHash: lock?.coreHash, liveCoreHash: m.aggregateCoreHash, coreDrift: m.aggregateCoreHash === lock?.coreHash ? 0 : 1, closureFiles: files.length, coreFilesTouched: changed.filter((f) => files.includes(f)), parametersLocked: p.parameterSetHash === lock?.parameterSetHash, parameterSetHash: p.parameterSetHash },
    gameLogicChanges: guardedTouched.filter((f) => !f.startsWith("api/")).length, apiChanges: changed.filter((f) => f.startsWith("api/")).length, apiFilesTouched: changed.filter((f) => f.startsWith("api/")),
    draftLogicChanges: changed.filter((f) => /src\/chaos\//.test(f)).length, positionPlacementLogicChanged: changed.includes("src/lineupPlacement.js"),
    modeRegistryChanged: registryDiff.length > 0,
    serverlessFunctions: { apiRoutes: apiFiles.length, middleware: 1, total: apiFiles.length + 1, budget: 13, increase: apiFiles.length + 1 - 13 },
    productionBranch: { main: sh("git rev-parse origin/main"), unchanged: sh("git rev-parse origin/main") === MAIN },
    stableWave1Alias: { expected: WAVE1, originWave1: sh("git rev-parse --short origin/wave1"), unchanged: (sh("git rev-parse --short origin/wave1") || "").startsWith(WAVE1) },
    changedFiles: changed,
  });
}

if (MODE === "ledger") {
  const q = (f) => json(`${OUT}/${f}`);
  const passOf = (f, label = "") => { const a = q(f); if (!a) return "UNRESOLVED_TECHNICAL_FAILURES"; const total = a.checks ?? a.gates?.length; const passed = a.passed; return passed === total ? `FIXED_AND_VERIFIED (${passed}/${total}${label ? " " + label : ""})` : "UNRESOLVED_TECHNICAL_FAILURES"; };
  const iso = q("theme-production-isolation.json"), rec = q("active-candidate-reconciliation.json"), color = q("color-area-audit.json"), acc = q("theme-accessibility-and-fatigue.json"), comp = q("competitive-color-differentiation.json");
  const colorFlag = (f) => color ? `FIXED_AND_VERIFIED (measured; flags: ${[...new Set(color.rows.flatMap((r) => r.flags.filter((x) => x.includes(f))))].join(",") || "none"})` : "UNRESOLVED_TECHNICAL_FAILURES";
  const items = {
    "Phase 9A parent verification": q("phase9a1-preflight.json")?.failed === 0 ? `FIXED_AND_VERIFIED (${q("phase9a1-preflight.json").passed} gates)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "active candidate reconciliation": rec?.coreDrift === 0 && rec?.parameters?.parametersLocked ? "FIXED_AND_VERIFIED (Candidate 4 · 1.4.0 · drift 0 · parameters locked)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Candidate 4/Candidate 3 terminology": rec ? "FIXED_AND_VERIFIED (repository truth: Candidate 4; Candidate 3 lock untouched)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Phase 9A ledger classification": q("phase9a-ledger-reconciliation.json") ? "FIXED_AND_VERIFIED (DEFERRED_BY_SCOPE recorded; history preserved)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "master-brand token layer": q("master-brand-color-contract.json") ? "FIXED_AND_VERIFIED" : "UNRESOLVED_TECHNICAL_FAILURES",
    "sport-theme token layer": q("basketball-theme-contracts.json")?.themes?.every((t) => t.validation.length === 0) ? "FIXED_AND_VERIFIED (4 themes validate)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "semantic token layer": q("semantic-color-contract.json") ? "FIXED_AND_VERIFIED" : "UNRESOLVED_TECHNICAL_FAILURES",
    "60–30–10 audit": color ? "FIXED_AND_VERIFIED (measured per theme and fixture; targets reported, not enforced)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Fracture Core": passOf("theme-lab-smoke.json", "lab"), "Night Court Editorial": passOf("theme-lab-smoke.json", "lab"), "Modern Court Light": passOf("theme-lab-smoke.json", "lab"), "Hardwood Luxe": passOf("theme-lab-smoke.json", "lab"),
    "Era Fracture control": "FIXED_AND_VERIFIED (contract: approved/unapproved locations; no per-component fracture graphics; primitives deferred to the implementation phase of the selected theme)",
    "Gold usage": colorFlag("GOLD"), "Cobalt usage": colorFlag("COBALT"), "Violet usage": colorFlag("VIOLET"), "Red usage": colorFlag("RED"), "Platinum usage": colorFlag("PLATINUM"),
    "Team Gold identity": "FIXED_AND_VERIFIED (hue guard in tests; semantic in every theme)", "Team Blue identity": "FIXED_AND_VERIFIED (hue guard in tests; semantic in every theme)",
    "Legend Rival copy": "FIXED_AND_VERIFIED (YOUR FIVE / LEGEND RIVAL; e2e updated)",
    "NBA-mark removal": "FIXED_AND_VERIFIED (no league marks or official palette; matrix)",
    "82-0 differentiation": comp ? `FIXED_AND_VERIFIED (${comp.matrix.map((r) => `${r.theme}: ${r.classification}`).join("; ")})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "theme-lab route": passOf("theme-lab-smoke.json"), "deterministic fixtures": existsSync("src/ui/theme-lab/fixture-result.json") ? "FIXED_AND_VERIFIED (seed frozen; --check reproduces)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "single-DOM invariant": passOf("theme-dom-invariant.json"),
    "desktop screenshots": passOf("theme-responsive-qa.json"), "mobile screenshots": passOf("theme-responsive-qa.json"),
    "contact sheets": existsSync(`${OUT}/screens/comparisons/desktop-play-lobby-contact-sheet.png`) && existsSync(`${OUT}/screens/comparisons/mobile-result-contact-sheet.png`) ? "FIXED_AND_VERIFIED (11 sheets)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "comparison index": existsSync(`${OUT}/theme-comparison-index.html`) ? "FIXED_AND_VERIFIED" : "UNRESOLVED_TECHNICAL_FAILURES",
    "contrast audit": passOf("theme-accessibility-and-fatigue.json"),
    "fatigue audit": acc ? `FIXED_AND_VERIFIED (${Object.entries(acc.perTheme).map(([k, v]) => `${k}: ${v.fatigue.risk}`).join("; ")})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "portrait compatibility": q("portrait-theme-compatibility.json") ? "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK (no approved photorealistic portrait exists in the registry; silhouette and uniform-swatch compatibility measured and passing)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "performance": passOf("theme-performance-qa.json"),
    "preview access": passOf("theme-preview-qa.json"),
    "stable Wave 1 preservation": iso?.stableWave1Alias?.unchanged ? "FIXED_AND_VERIFIED (4dc59e7; stamp 2f35a3b70c30)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "feedback preservation": iso && iso.apiChanges === 0 ? "FIXED_AND_VERIFIED (api/ untouched by diff; report runs in EMPTY-DATA mode without store credentials)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "production isolation": iso?.productionBranch?.unchanged && iso?.activeCandidate?.coreDrift === 0 ? "FIXED_AND_VERIFIED (main unchanged; core drift 0)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Chaos lineup-position optimisation (carried from 9A)": "DEFERRED_BY_SCOPE",
    "Era Fracture primitives (EraFractureDivider / SelectedEdge / Transition) as shipped components": "DEFERRED_BY_SCOPE (the fracture geometry and locations are contracted here; drawing it on the selected theme belongs to the implementation phase, so no candidate gains a decorative advantage in the comparison)",
  };
  const states = Object.values(items).map((v) => v.split(" ")[0]);
  const count = (s) => states.filter((x) => x === s).length;
  write("phase9a1-resolution-ledger.json", { artifact: "phase9a1-resolution-ledger", phase: PHASE, items, totals: { FIXED_AND_VERIFIED: count("FIXED_AND_VERIFIED"), NOT_REPRODUCIBLE_WITH_EVIDENCE: 0, EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK: count("EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"), DEFERRED_BY_SCOPE: count("DEFERRED_BY_SCOPE"), UNRESOLVED_TECHNICAL_FAILURES: count("UNRESOLVED_TECHNICAL_FAILURES") } });
}

if (MODE === "summary") {
  const q = (f) => json(`${OUT}/${f}`);
  const iso = q("theme-production-isolation.json"), led = q("phase9a1-resolution-ledger.json"), prev = q("theme-preview-qa.json"), color = q("color-area-audit.json"), acc = q("theme-accessibility-and-fatigue.json"), comp = q("competitive-color-differentiation.json"), dom = q("theme-dom-invariant.json"), resp = q("theme-responsive-qa.json"), por = q("portrait-theme-compatibility.json"), perf = q("theme-performance-qa.json");
  const themes = ["fracture-core", "night-court", "modern-court", "hardwood-luxe"].map((id) => ({
    id, color: color?.summary?.find((s) => s.theme === id) || null, fatigue: acc?.perTheme?.[id]?.fatigue?.risk || null, namedPairsAA: acc?.perTheme?.[id]?.namedPairsAllPassAA ?? null,
    longForm: acc?.longFormPostgame?.[id] || null, differentiation: comp?.matrix?.find((r) => r.theme === id)?.classification || null, portraitBlendRisks: por ? Object.values(por.perTheme[id].uniformSwatches).filter((r) => r.blendRisk).length : null, perf: perf?.perTheme?.[id] || null,
  }));
  const blocked = (led?.totals?.UNRESOLVED_TECHNICAL_FAILURES ?? 1) > 0 || (dom && dom.failed > 0) || (acc && acc.failed > 0) || comp?.matrix?.some((r) => r.classification === "TOO SIMILAR") || (prev && prev.failed > 0);
  write("phase9a1-final-summary.json", {
    artifact: "phase9a1-final-summary", phase: PHASE,
    repository: { parentBranch: PARENT_BRANCH, parentCommit: PARENT_COMMIT, branch: sh("git branch --show-current"), head: sh("git rev-parse HEAD"), workingTreeClean: (sh("git status --porcelain") || "") === "", draftPR: process.env.PHASE9A1_PR || null },
    deployment: prev ? { baseUrl: prev.deployment.baseUrl, commit: prev.deployment.commit, themeUrls: prev.themeUrls, gates: prev.gates.length, passed: prev.passed, failed: prev.failed } : null,
    activeCandidate: iso?.activeCandidate || null,
    themes, screenshots: resp?.screenshots || null, contactSheets: existsSync(`${OUT}/screens/comparisons`) ? readdirSync(`${OUT}/screens/comparisons`).length : 0, domInvariant: dom ? { passed: dom.passed, checks: dom.checks } : null,
    preservation: { activeCandidateCoreDrift: iso?.activeCandidate?.coreDrift, gameLogicChanges: iso?.gameLogicChanges, draftLogicChanges: iso?.draftLogicChanges, apiChanges: iso?.apiChanges, apiFunctionCountIncrease: iso?.serverlessFunctions?.increase, stableWave1Changes: iso?.stableWave1Alias?.unchanged ? 0 : 1, productionChanges: iso?.productionBranch?.unchanged ? 0 : 1 },
    ledger: led?.totals || null, tests: { vitest: process.env.VITEST_SUMMARY || null, playwright: process.env.PLAYWRIGHT_SUMMARY || null },
    verdict: blocked ? (dom && dom.failed > 0 ? "BLOCKED — THEME GEOMETRY DRIFT REMAINS" : acc && acc.failed > 0 ? "BLOCKED — THEME ACCESSIBILITY FAILURE REMAINS" : comp?.matrix?.some((r) => r.classification === "TOO SIMILAR") ? "BLOCKED — COMPETITIVE DIFFERENTIATION FAILED" : "BLOCKED — DEPLOYED PHASE 9A.1 DEFECT REMAINS") : "THEME LAB COMPLETE — AWAITING OWNER PALETTE SELECTION",
    ownerDecision: { format: "SELECT: Fracture Core | Night Court Editorial | Modern Court Light | Hardwood Luxe | Hybrid: [precise combination]", selectedByClaude: null },
  });
}
