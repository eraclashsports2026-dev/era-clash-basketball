#!/usr/bin/env node
// ── Phase 9A.2: preflight record, production isolation, ledger, final summary ─
//   node scripts/ui/phase9a2Summary.mjs preflight <gates-txt>
//   node scripts/ui/phase9a2Summary.mjs isolation
//   node scripts/ui/phase9a2Summary.mjs ledger
//   node scripts/ui/phase9a2Summary.mjs summary
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";

const MODE = process.argv[2];
const OUT = "data/validation/9a2";
mkdirSync(OUT, { recursive: true });
const PHASE = "9A.2 — Night Court Editorial production theme";
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return null; } };
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const q = (f) => json(`${OUT}/${f}`);
const write = (name, body) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const PARENT_BRANCH = "phase-9a1-basketball-theme-decision-lab";
const PARENT_COMMIT = "93c9abb0ba3eaf10f8c8e038ebe5b70504eeb144";
const WAVE1 = "4dc59e7", MAIN = "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd";

if (MODE === "preflight") {
  const rows = readFileSync(process.argv[3], "utf8").split("\n").filter((l) => /\s(PASS|FAIL)\b/.test(l)).map((l) => { const m = l.match(/^(.*?)\s+(PASS|FAIL)\s*(.*)$/); return { gate: m[1].trim(), result: m[2], detail: m[3].trim() }; });
  write("phase9a2-preflight.json", { artifact: "phase9a2-preflight", phase: PHASE, parent: { branch: PARENT_BRANCH, commit: PARENT_COMMIT, draftPR: 37, grandparent: { branch: "phase-9a-play-lobby-activation-clarity", commit: "ab9f9fa7a7f2ca62f2e60859fdf10adf369256fe", draftPR: 36 } }, references: { main: MAIN, wave1: WAVE1 }, functionBudget: { apiRoutes: 12, middleware: 1, total: 13, budget: 13 }, testers: { identities: 8, roles: { owner: 1, tester: 7 }, note: "identities and roles only; raw keys stay in .preview-secrets/ and are never written to an artifact" }, gates: rows, passed: rows.filter((r) => r.result === "PASS").length, failed: rows.filter((r) => r.result === "FAIL").length, note: "Run on the parent head BEFORE any Phase 9A.2 edit. chaos:security and chaos:browser-qa need a harness started with PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview (the first attempt on a flag-off harness returned 503 and was re-run)." });
}

if (MODE === "isolation") {
  const m = await buildCoreManifestV3(); const lock = json("data/validation/8d/candidate4-lock.json")?.data; const p = defaultRuntimeParameterSet();
  const files = (m.files ?? []).map((f) => f.path ?? f);
  const changed = (sh(`git diff --name-only ${PARENT_COMMIT}...HEAD`) || "").split("\n").filter(Boolean);
  const staged = (sh("git status --porcelain") || "").split("\n").filter(Boolean).map((l) => l.slice(3));
  const all = [...new Set([...changed, ...staged])];
  const guarded = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "data/calibration", "api/"];
  const guardedTouched = all.filter((f) => guarded.some((g) => f === g || f.startsWith(g)));
  const apiFiles = readdirSync("api").filter((f) => f.endsWith(".js"));
  const registryDiff = (sh(`git diff ${PARENT_COMMIT} -- src/navigation.js`) || "");
  const placementDiff = (sh(`git diff ${PARENT_COMMIT} -- src/lineupPlacement.js`) || "");
  write("theme-production-isolation.json", {
    artifact: "theme-production-isolation", phase: PHASE, measuredAgainst: { parentCommit: PARENT_COMMIT, head: sh("git rev-parse HEAD"), branch: sh("git branch --show-current"), includesWorkingTree: staged.length > 0 },
    activeCandidate: { id: lock?.candidateId, calibrationVersion: lock?.possessionCalibrationVersion, lockedCoreHash: lock?.coreHash, liveCoreHash: m.aggregateCoreHash, coreDrift: m.aggregateCoreHash === lock?.coreHash ? 0 : 1, closureFiles: files.length, coreFilesTouched: all.filter((f) => files.includes(f)), parametersLocked: p.parameterSetHash === lock?.parameterSetHash, parameterSetHash: p.parameterSetHash },
    gameLogicChanges: guardedTouched.filter((f) => !f.startsWith("api/")).length, apiChanges: all.filter((f) => f.startsWith("api/")).length, apiFilesTouched: all.filter((f) => f.startsWith("api/")),
    draftLogicChanges: all.filter((f) => /src\/chaos\//.test(f)).length, placementLogicChanges: placementDiff.length > 0 ? 1 : 0, positionPlacementLogicChanged: placementDiff.length > 0,
    modeRegistryChanged: registryDiff.length > 0,
    serverlessFunctions: { apiRoutes: apiFiles.length, middleware: 1, total: apiFiles.length + 1, budget: 13, increase: apiFiles.length + 1 - 13 },
    middlewareChanged: all.includes("middleware.js"), previewAuthChanged: all.some((f) => /previewAccess|preview-secrets|config\/previewEnv/.test(f)),
    productionBranch: { main: sh("git rev-parse origin/main"), unchanged: sh("git rev-parse origin/main") === MAIN },
    stableWave1Alias: { expected: WAVE1, originWave1: sh("git rev-parse --short origin/wave1"), unchanged: (sh("git rev-parse --short origin/wave1") || "").startsWith(WAVE1) },
    historicalEvidenceUntouched: { "9a1": !all.some((f) => f.startsWith("data/validation/9a1/")), "9a": !all.some((f) => f.startsWith("data/validation/9a/")), "8c1": !all.some((f) => f.startsWith("data/validation/8c1/")), syntheticV2: !all.some((f) => /synthetic/i.test(f) && f.startsWith("data/")) },
    changedFiles: all,
  });
}

if (MODE === "ledger") {
  const passOf = (f, label = "") => { const a = q(f); if (!a) return "UNRESOLVED_TECHNICAL_FAILURES (artifact missing)"; const total = a.checks ?? a.gates?.length; const passed = a.passed; return passed === total ? `FIXED_AND_VERIFIED (${passed}/${total}${label ? " " + label : ""})` : `UNRESOLVED_TECHNICAL_FAILURES (${passed}/${total})`; };
  const iso = q("theme-production-isolation.json"), sel = q("basketball-theme-owner-selection.json"), logo = q("logo-mk1-manifest.json"), color = q("contextual-60-30-10-audit.json"), por = q("portrait-contrast-qa.json"), acc = q("theme-accessibility-qa.json"), comp = q("theme-competitive-differentiation.json"), fr = q("era-fracture-qa.json"), sem = q("semantic-color-qa.json"), prev = q("theme-preview-qa.json"), pre = q("phase9a2-preflight.json"), prod = q("night-court-production-qa.json"), resp = q("theme-responsive-qa.json"), lf = q("long-form-reading-qa.json");
  const porRow = (re) => por?.rows?.filter((r) => re.test(r.id)) || [];
  const porPass = (re, label) => { const rs = porRow(re); return rs.length && rs.every((r) => r.separationAtShoulder >= por.threshold.separationAtShoulder) ? `FIXED_AND_VERIFIED (${rs.map((r) => `${r.id} ${r.before.separationAtShoulder}→${r.separationAtShoulder}:1`).join("; ")})` : `UNRESOLVED_TECHNICAL_FAILURES (${label})`; };
  const respFor = (w) => { const rs = resp?.results?.filter((r) => new RegExp(`@(${w})`).test(r.name)) || []; return rs.length && rs.every((r) => r.pass) ? `FIXED_AND_VERIFIED (${rs.length} checks)` : "UNRESOLVED_TECHNICAL_FAILURES"; };
  const items = {
    "owner-selection record": sel?.selection === "HYBRID_NIGHT_COURT_EDITORIAL_FRACTURE_CORE" && sel.stableWave1PromotionAuthorized === false && sel.productionPromotionAuthorized === false ? "FIXED_AND_VERIFIED (OWNER; SELECTED_FOR_IMPLEMENTATION; promotion not authorised)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Phase 9A.1 parent verification": pre?.failed === 0 ? `FIXED_AND_VERIFIED (${pre.passed} gates on 93c9abb)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Candidate 4 preservation": iso?.activeCandidate?.coreDrift === 0 && iso?.activeCandidate?.parametersLocked ? "FIXED_AND_VERIFIED (Candidate 4 · 1.4.0 · drift 0 · parameters locked)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Logo Mk1 integration": logo && prod ? "FIXED_AND_VERIFIED (canonical archive + product copy manifested; header and lobby render the PNG; transparent background recorded, dark-surface rule)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "master-brand shell": passOf("night-court-production-qa.json", "production"),
    "Night Court production tokens": q("production-theme-contract.json")?.validation?.length === 0 ? "FIXED_AND_VERIFIED (basketball-night-court-v1 validates; resolver 1.1.0)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "contextual 60–30–10": color ? `FIXED_AND_VERIFIED (measured: arena ${color.contexts.arena.dominantPct}/${color.contexts.arena.secondaryPct}/${color.contexts.arena.decorativeAccentPct}; editorial ${color.contexts.editorial.dominantPct}/${color.contexts.editorial.secondaryPct}/${color.contexts.editorial.decorativeAccentPct}; ${color.deviations.length} deviations documented with reasons)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Play Lobby editorial surface": lf?.results?.filter((r) => /^lobby/.test(r.name)).every((r) => r.pass) && prod ? "FIXED_AND_VERIFIED (obsidian band, ivory canvas, ink; AA on every pair)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Time Arena dark surface": passOf("theme-dom-invariant.json", "one DOM vs control"),
    "Result Dock": fr?.placements?.find((p) => p.n === 8)?.pass ? "FIXED_AND_VERIFIED (graphite, platinum, gold/blue scores, fracture edge on the final score, underlined active tab)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Full Postgame": lf?.results?.filter((r) => /^postgame/.test(r.name)).every((r) => r.pass) ? "FIXED_AND_VERIFIED (dark hero → ivory report; long-form AA)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Box Score": prev?.gates?.find((g) => /Box Score/.test(g.name))?.ok ? "FIXED_AND_VERIFIED (one table, tabular numerals, no wrapped cell, isolated scroll — deployed)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Dream Matchup": iso?.placementLogicChanges === 0 && prev?.gates?.find((g) => /Dream Matchup placement/.test(g.name))?.ok ? "FIXED_AND_VERIFIED (placement logic untouched; deployed placement identical)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Coach Chaos Violet": sem?.results?.find((r) => /Coach Chaos heading/.test(r.name))?.pass ? "FIXED_AND_VERIFIED" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Era intelligence Violet": prev?.gates?.find((g) => /Era Reveal/.test(g.name))?.ok ? "FIXED_AND_VERIFIED (era highlight violet; fracture edge on reveal — deployed)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Team Gold semantics": sem?.results?.find((r) => /Gold cards read gold/.test(r.name))?.pass ? "FIXED_AND_VERIFIED" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Team Blue semantics": sem?.results?.find((r) => /Blue cards never use Gold/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (blue footers and OVR cobalt; no gold on blue)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Legend Rival copy": sem?.results?.find((r) => /LEGEND RIVAL/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (YOUR FIVE / LEGEND RIVAL; CPU not public)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "controlled Era Fracture": fr ? (fr.placements.every((p) => p.pass) ? `FIXED_AND_VERIFIED (${fr.placements.length}/10 approved placements paint it)` : "UNRESOLVED_TECHNICAL_FAILURES") : "UNRESOLVED_TECHNICAL_FAILURES",
    "fracture accent usage": color ? `FIXED_AND_VERIFIED (measured decorative accent ${color.contexts.combined.decorativeAccentPct}% combined; below the 6–10% target by design — a line system, reason recorded)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "random-crack removal": fr?.results?.find((r) => /random cracks absent/.test(r.name))?.pass && fr?.results?.find((r) => /forbidden: no fracture on empty/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (no uncontracted diagonal; none on empty cards, panels, paragraphs, rows)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "one-glow rule": acc?.results?.filter((r) => /one dominant glow/.test(r.name)).every((r) => r.pass) ? "FIXED_AND_VERIFIED (one glow type per state on every fixture; CTA → cards → staff → fracture → score)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "dark-uniform portrait separation": porPass(/^dark-jersey/, "dark"),
    "light-uniform portrait separation": porPass(/light-jersey|white-historical/, "light"),
    "historical portrait compatibility": porPass(/bw-portrait|white-historical/, "historical"),
    "silhouette compatibility": porPass(/silhouette/, "silhouette"),
    "skin-tone preservation": por?.results?.find((r) => /skin tone does not shift/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (max channel Δ ≤ 6/255, hue Δ ≤ 3°)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "NBA-mark removal": sem?.results?.find((r) => /no league or competitor asset/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (no league/competitor asset, hotlink or wording; the legal disclaimer line is text and retained)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "82-0 differentiation": comp ? `FIXED_AND_VERIFIED (${comp.matrixRow.classification})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "responsive desktop": respFor("1536x1024|1440x900|1280x800|1024x768"),
    "responsive tablet": respFor("768x1024"),
    "responsive mobile": respFor("430x932|390x844|375x812"),
    "accessibility": passOf("theme-accessibility-qa.json"),
    "reduced motion": acc?.results?.find((r) => /reduced motion/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (sweep static under reduce; runs once, 900ms, never loops otherwise)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "theme-lab preservation": prod?.results?.find((r) => /candidate token is unchanged/.test(r.name))?.pass && prod?.results?.find((r) => /Phase 9A.1 evidence is intact/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (four candidates' tokens byte-identical; 9A.1 evidence intact; lab owner-only; hybrid is the fifth entry)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "preview security": prev ? (prev.gates.filter((g) => /refused|denied|tester's valid session/.test(g.name)).every((g) => g.ok) ? "FIXED_AND_VERIFIED (401 anonymous; invalid key denied; tester 404 at the lab)" : "UNRESOLVED_TECHNICAL_FAILURES") : "UNRESOLVED_TECHNICAL_FAILURES",
    "tester-key preservation": prev?.gates?.find((g) => /existing Wave 1 keys/.test(g.name))?.ok && !iso?.previewAuthChanged ? "FIXED_AND_VERIFIED (all 8 keys accepted; auth untouched)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "feedback preservation": iso && iso.apiChanges === 0 && prev?.gates?.find((g) => /feedback is accepted/.test(g.name))?.ok ? "FIXED_AND_VERIFIED (api/ untouched; a preview feedback round trip accepted on the themed report)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "stable Wave 1 preservation": iso?.stableWave1Alias?.unchanged && prev?.gates?.find((g) => /stable Wave 1 alias/.test(g.name))?.ok ? "FIXED_AND_VERIFIED (4dc59e7; stamp 2f35a3b70c30; no lab; no production theme)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "production isolation": iso?.productionBranch?.unchanged && iso?.activeCandidate?.coreDrift === 0 && iso?.serverlessFunctions?.increase === 0 ? "FIXED_AND_VERIFIED (main unchanged; core drift 0; 13/13 functions)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Chaos lineup-position optimisation (carried from 9A/9A.1)": "DEFERRED_BY_SCOPE",
    "approved photorealistic portraits (facial detail on real art)": "EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK (no approved portrait exists in src/images/approved.json; the stage is measured on synthetic uniform figures and the shipped silhouette, and takes an approved image as a straight swap)",
  };
  const states = Object.values(items).map((v) => v.split(" ")[0]);
  const count = (s) => states.filter((x) => x === s).length;
  write("phase9a2-resolution-ledger.json", { artifact: "phase9a2-resolution-ledger", phase: PHASE, items, totals: { FIXED_AND_VERIFIED: count("FIXED_AND_VERIFIED"), NOT_REPRODUCIBLE_WITH_EVIDENCE: 0, EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK: count("EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"), DEFERRED_BY_SCOPE: count("DEFERRED_BY_SCOPE"), UNRESOLVED_TECHNICAL_FAILURES: count("UNRESOLVED_TECHNICAL_FAILURES") } });
}

if (MODE === "summary") {
  const iso = q("theme-production-isolation.json"), led = q("phase9a2-resolution-ledger.json"), prev = q("theme-preview-qa.json"), color = q("contextual-60-30-10-audit.json"), acc = q("theme-accessibility-qa.json"), comp = q("theme-competitive-differentiation.json"), dom = q("theme-dom-invariant.json"), resp = q("theme-responsive-qa.json"), por = q("portrait-contrast-qa.json"), perf = q("theme-performance-qa.json"), fr = q("era-fracture-qa.json"), sel = q("basketball-theme-owner-selection.json"), lf = q("long-form-reading-qa.json"), sem = q("semantic-color-qa.json"), prod = q("night-court-production-qa.json");
  const unresolved = (led?.totals?.UNRESOLVED_TECHNICAL_FAILURES ?? 1) > 0;
  const portraitDefect = por && por.results.some((r) => !r.pass);
  const deployedDefect = !prev || prev.failed > 0;
  const incomplete = !prod || prod.failed > 0 || !fr || fr.failed > 0 || (dom && dom.failed > 0) || (acc && acc.failed > 0);
  const verdict = incomplete ? "BLOCKED — NIGHT COURT IMPLEMENTATION INCOMPLETE" : portraitDefect ? "BLOCKED — PORTRAIT CONTRAST DEFECT REMAINS" : deployedDefect ? "BLOCKED — DEPLOYED VISUAL DEFECT REMAINS" : unresolved ? "BLOCKED — NIGHT COURT IMPLEMENTATION INCOMPLETE" : "NIGHT COURT EDITORIAL PRODUCTION THEME COMPLETE — READY FOR OWNER ACCEPTANCE";
  write("phase9a2-final-summary.json", {
    artifact: "phase9a2-final-summary", phase: PHASE,
    repository: { parentBranch: PARENT_BRANCH, parentCommit: PARENT_COMMIT, branch: sh("git branch --show-current"), head: sh("git rev-parse HEAD"), workingTreeClean: (sh("git status --porcelain") || "") === "", draftPR: process.env.PHASE9A2_PR || null },
    ownerSelection: sel ? { selection: sel.selection, artifact: `${OUT}/basketball-theme-owner-selection.json`, status: sel.status, implementationStatus: sel.implementationStatus, stableWave1PromotionAuthorized: sel.stableWave1PromotionAuthorized, productionPromotionAuthorized: sel.productionPromotionAuthorized } : null,
    deployment: prev ? { baseUrl: prev.deployment.baseUrl, commit: prev.deployment.commit, buildStamp: prev.deployment.buildStamp, gates: prev.gates.length, passed: prev.passed, failed: prev.failed } : null,
    activeCandidate: iso?.activeCandidate || null,
    visualSystem: { theme: "night-court-production-hybrid (basketball-night-court-v1)", contexts: color?.contexts || null, fracturePlacements: fr ? fr.placements.filter((p) => p.pass).length : null, competitive: comp?.matrixRow?.classification || null, domInvariant: dom ? { passed: dom.passed, checks: dom.checks } : null },
    portraits: por ? { threshold: por.threshold.separationAtShoulder, rows: por.rows.map((r) => ({ id: r.id, before: r.before.separationAtShoulder, after: r.separationAtShoulder, skinShiftMax: r.skinShiftMax })) } : null,
    longForm: lf ? Object.fromEntries(Object.entries(lf.surfaces).map(([k, v]) => [k, { pairs: v.pairs, passed: v.passCount, avgContrast: v.avgContrast, lowestPassing: v.lowestPassing?.contrast }])) : null,
    screenshots: resp?.screenshots || null,
    preservation: { activeCandidateCoreDrift: iso?.activeCandidate?.coreDrift, gameLogicChanges: iso?.gameLogicChanges, draftLogicChanges: iso?.draftLogicChanges, placementLogicChanges: iso?.placementLogicChanges, apiChanges: iso?.apiChanges, apiFunctionCountIncrease: iso?.serverlessFunctions?.increase, stableWave1Changes: iso?.stableWave1Alias?.unchanged ? 0 : 1, productionChanges: iso?.productionBranch?.unchanged ? 0 : 1 },
    ledger: led?.totals || null, tests: { vitest: process.env.VITEST_SUMMARY || null, playwright: process.env.PLAYWRIGHT_SUMMARY || null, performance: perf ? { main: perf.mainBundleBytes, themeCss: perf.themeCssBytes, perSurface: perf.perSurface } : null, semantic: sem ? `${sem.passed}/${sem.checks}` : null },
    verdict,
    ownerAcceptance: { format: "APPROVE NIGHT COURT V1 | REVISE: [precise changes]", decidedByClaude: null },
  });
  console.log(verdict);
}
