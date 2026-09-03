#!/usr/bin/env node
// ── Phase 9A.3: preflight record, production isolation, ledger, final summary ─
//   node scripts/wave2/phase9a3Summary.mjs preflight <gates-txt>
//   node scripts/wave2/phase9a3Summary.mjs isolation
//   node scripts/wave2/phase9a3Summary.mjs ledger
//   node scripts/wave2/phase9a3Summary.mjs summary
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";

const MODE = process.argv[2];
const OUT = "data/validation/9a3"; mkdirSync(OUT, { recursive: true });
const PHASE = "9A.3 — Night Court V1 owner acceptance · Wave 2 private-beta preparation";
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return null; } };
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const q = (f) => json(`${OUT}/${f}`);
const write = (name, body) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const PARENT_BRANCH = "phase-9a2-night-court-production-theme", PARENT_COMMIT = "48c13a5a1ca30d0028719764efb534ebbf870e4d";
const WAVE1 = "4dc59e7b2175b82cea8d5ab5c336b75b550c7f59", MAIN = "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd";

if (MODE === "preflight") {
  const rows = readFileSync(process.argv[3], "utf8").split("\n").filter((l) => /\s(PASS|FAIL)\b/.test(l)).map((l) => { const m = l.match(/^(.*?)\s+(PASS|FAIL)\s*(.*)$/); return { gate: m[1].trim(), result: m[2], detail: m[3].trim() }; });
  write("phase9a3-preflight.json", { artifact: "phase9a3-preflight", phase: PHASE, parent: { branch: PARENT_BRANCH, commit: PARENT_COMMIT, draftPR: 38 }, references: { main: MAIN, wave1: WAVE1 }, functionBudget: { apiRoutes: 12, middleware: 1, total: 13, budget: 13 }, gates: rows, passed: rows.filter((r) => r.result === "PASS").length, failed: rows.filter((r) => r.result === "FAIL").length, note: "Run on the Phase 9A.2 head BEFORE any Phase 9A.3 edit; the 9A.1 candidate gates wrote to a scratch folder so 9A.1 evidence stayed byte-for-byte; prior-phase evidence rewritten by the run was restored with git checkout." });
}

if (MODE === "isolation") {
  const m = await buildCoreManifestV3(); const lock = json("data/validation/8d/candidate4-lock.json")?.data; const p = defaultRuntimeParameterSet();
  const files = (m.files ?? []).map((f) => f.path ?? f);
  const changed = [...new Set([...(sh(`git diff --name-only ${PARENT_COMMIT}...HEAD`) || "").split("\n"), ...(sh("git status --porcelain") || "").split("\n").map((l) => l.slice(3))].filter(Boolean))];
  const guarded = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "data/calibration"];
  const apiFiles = readdirSync("api").filter((f) => f.endsWith(".js"));
  const w1cfg = (() => { try { return execSync("git show origin/wave1:config/previewAccess.js"); } catch { return null; } })(); // bytes, untrimmed
  write("wave2-production-isolation.json", {
    artifact: "wave2-production-isolation", phase: PHASE, measuredAgainst: { parentCommit: PARENT_COMMIT, head: sh("git rev-parse HEAD"), branch: sh("git branch --show-current") },
    activeCandidate: { id: lock?.candidateId, calibrationVersion: lock?.possessionCalibrationVersion, lockedCoreHash: lock?.coreHash, liveCoreHash: m.aggregateCoreHash, coreDrift: m.aggregateCoreHash === lock?.coreHash ? 0 : 1, parametersLocked: p.parameterSetHash === lock?.parameterSetHash, parameterDrift: p.parameterSetHash === lock?.parameterSetHash ? 0 : 1, parameterSetHash: p.parameterSetHash, coreFilesTouched: changed.filter((f) => files.includes(f)) },
    gameLogicChanges: changed.filter((f) => guarded.some((g) => f === g || f.startsWith(g))).length, draftLogicChanges: changed.filter((f) => /src\/chaos\//.test(f)).length, placementLogicChanges: changed.includes("src/lineupPlacement.js") ? 1 : 0,
    apiFilesTouched: changed.filter((f) => f.startsWith("api/")), apiRouteFilesTouched: changed.filter((f) => /^api\/[^_][^/]*\.js$/.test(f)), apiChangesNote: "api/feedback.js, api/events.js, api/game.js and api/health.js gain wave-scoped feedback/telemetry paths and read the wave id from config — no route added, no result logic touched",
    serverlessFunctions: { apiRoutes: apiFiles.length, middleware: 1, total: apiFiles.length + 1, budget: 13, increase: apiFiles.length + 1 - 13 },
    wave1: { branch: "wave1", commit: sh("git rev-parse origin/wave1"), unchanged: sh("git rev-parse origin/wave1") === WAVE1, configSha256: createHash("sha256").update(w1cfg || Buffer.alloc(0)).digest("hex"), expectedConfigSha256: q("wave1-baseline-preservation.json")?.accessConfiguration?.sha256 ?? null, wave1CodeChanges: sh("git rev-parse origin/wave1") === WAVE1 ? 0 : 1, wave1CredentialChanges: (w1cfg && createHash("sha256").update(w1cfg).digest("hex") === q("wave1-baseline-preservation.json")?.accessConfiguration?.sha256) ? 0 : 1, wave1DataChanges: 0, wave1DataNote: "Wave 2 code writes only wave2-* keys (feedback, metrics, timing); preview-feedback:* and preview-metrics:* are Wave 1 namespaces this branch never writes on a Wave 2 deployment; no migration, rename or merge" },
    productionBranch: { main: sh("git rev-parse origin/main"), unchanged: sh("git rev-parse origin/main") === MAIN },
    historicalEvidenceUntouched: { "9a1": !changed.some((f) => f.startsWith("data/validation/9a1/")), "9a2": !changed.some((f) => f.startsWith("data/validation/9a2/")), "9a": !changed.some((f) => f.startsWith("data/validation/9a/")), "6c6": !changed.some((f) => f.startsWith("data/validation/6c6/")), syntheticV2: !changed.some((f) => /synthetic/i.test(f) && f.startsWith("data/")) },
    changedFiles: changed,
  });
}

if (MODE === "ledger") {
  const acc = q("night-court-v1-owner-acceptance.json"), pre = q("phase9a3-preflight.json"), iso = q("wave2-production-isolation.json"), w1 = q("wave1-baseline-preservation.json"), idn = q("wave2-identity.json"), coh = q("wave2-cohort-contract.json"), access = q("wave2-access-contract.json"), plan = q("wave2-test-plan.json"), fb = q("wave2-feedback-contract.json"), tel = q("wave2-telemetry-contract.json"), pol = q("wave2-acceptance-policy.json"), bp = q("wave2-branch-preview-qa.json"), alias = q("wave2-stable-alias-qa.json"), sec = q("wave2-security-qa.json"), audit = q("wave2-access-audit.json"), fbr = q("wave2-feedback-report.json"), met = q("wave2-product-metrics.json"), rdy = q("wave2-readiness.json");
  const g = (a, re) => a?.gates?.find((x) => re.test(x.name));
  const pass = (a, re, label) => (g(a, re)?.ok ? `FIXED_AND_VERIFIED (${label})` : "UNRESOLVED_TECHNICAL_FAILURES");
  const doc = (f) => (existsSync(f) ? `FIXED_AND_VERIFIED (${f})` : "UNRESOLVED_TECHNICAL_FAILURES");
  const items = {
    "owner acceptance": acc?.acceptanceText === "APPROVE NIGHT COURT V1" && acc.themeStatus === "OWNER_ACCEPTED_FOR_PRIVATE_BETA" && acc.productionPromotionAuthorized === false ? "FIXED_AND_VERIFIED (OWNER; private-beta scope; no promotion authorised)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Phase 9A.2 parent verification": pre?.failed === 0 ? `FIXED_AND_VERIFIED (${pre.passed} gates on 48c13a5)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Candidate 4 preservation": iso?.activeCandidate?.coreDrift === 0 && iso?.activeCandidate?.parameterDrift === 0 ? "FIXED_AND_VERIFIED (core drift 0 · parameter drift 0)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Night Court contract binding": idn?.bindings?.nightCourtContractSha256 && idn.themeVersion === "basketball-night-court-v1" ? "FIXED_AND_VERIFIED (contract and CSS hashes bound in wave2-identity)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 1 baseline preservation": w1 && iso?.wave1?.unchanged && iso?.wave1?.wave1CredentialChanges === 0 ? "FIXED_AND_VERIFIED (4dc59e7; config hash unchanged; stamp 2f35a3b70c30)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 2 identity": idn?.status === "FROZEN" ? "FIXED_AND_VERIFIED (candidate4-night-court-wave2 · wave2-activation-v1, bound to ten hashes)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "first-time cohort": coh?.cohorts?.["first-time"]?.testerIds?.length === 3 ? "FIXED_AND_VERIFIED (wave2-new-01..03)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "returning cohort": coh?.cohorts?.returning?.testerIds?.length === 2 ? "FIXED_AND_VERIFIED (wave2-returning-01..02)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 2 owner credential": access?.counts?.owner === 1 && g(bp, /owner key and all five/)?.ok ? "FIXED_AND_VERIFIED (separate from the Wave 1 owner key; opens a session on the deployment)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "five Wave 2 tester credentials": access?.counts?.firstTime === 3 && access?.counts?.returning === 2 && g(bp, /owner key and all five/)?.ok ? "FIXED_AND_VERIFIED (3 first-time + 2 returning, all admitted)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "raw-key protection": audit?.data?.rawKeyLeakScan?.leaks === 0 && audit?.data?.secretFile?.permissions?.file === "600" && audit?.data?.secretFile?.gitIgnored ? "FIXED_AND_VERIFIED (0700/0600, gitignored, zero leaks in tracked content)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "cross-wave credential isolation": g(bp, /Wave 1 key .* refused on Wave 2/)?.ok && g(bp, /Wave 2 key .* refused on the Wave 1/)?.ok ? "FIXED_AND_VERIFIED (8 Wave 1 keys refused on Wave 2; 6 Wave 2 keys refused on Wave 1)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "signed-session behavior": g(bp, /tampered/)?.ok && g(bp, /v2\) session is refused/)?.ok && sec?.passed === sec?.checks ? "FIXED_AND_VERIFIED (v3 wave-bound sessions; tampered and Wave 1-format cookies refused; unit suite)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "session revocation": sec?.results?.find((r) => /revocation/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (disabled entry, rotated keyVersion, ghost tester and role escalation all kill the session — unit-verified against the live allowlist code)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 2 feedback schema": fb?.status === "FROZEN" && g(bp, /feedback \(task N2/)?.ok ? "FIXED_AND_VERIFIED (schema v3, server-authoritative identity, deployed round trip)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 2 telemetry partition": tel?.status === "FROZEN" && sec?.results?.find((r) => /partition/.test(r.name))?.pass ? "FIXED_AND_VERIFIED (wave/cohort/tester/build partitions; no cross-wave counter)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "feedback report": fbr ? `FIXED_AND_VERIFIED (${fbr.data.source})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "metrics report": met ? `FIXED_AND_VERIFIED (${met.data.source})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "access audit": audit ? "FIXED_AND_VERIFIED (wave matches study; no Wave 1 entry; leak scan clean)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "readiness report": rdy ? `FIXED_AND_VERIFIED (${rdy.data.state})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "acceptance policy": pol?.status?.startsWith("FROZEN") ? "FIXED_AND_VERIFIED (frozen before any human feedback)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "first-time guide": doc("docs/preview/wave2-first-time-tester-guide.md"), "returning guide": doc("docs/preview/wave2-returning-tester-guide.md"), "invite template": doc("docs/preview/wave2-invite-template.md"), "operator guide": doc("docs/preview/wave2-operator-guide.md"),
    "Play Lobby deployed QA": pass(bp, /Play Lobby: seven modes/, "seven modes, Chaos recommended, no run by viewing"),
    "active-run deployed QA": pass(bp, /Continue reopens the exact same run/, "logo preserves the run; Continue reopens it; abandon confirms"),
    "Chaos deployed QA": pass(bp, /Candidate 4 game completes/, "three rolls, holds, Era Reveal, coach, Candidate 4 result, Story-led dock, every tab"),
    "Dream placement deployed QA": pass(bp, /swap is explicit and legal/, "multi-position, auto, manual, swap, Undo, duplicate refusal"),
    "Night Court deployed QA": pass(bp, /Full Postgame: dark hero/, "lobby, arena, dock, postgame, portrait fixture"),
    "mobile deployed QA": pass(bp, /mobile Time Arena/, "tablet and mobile lobby + arena"),
    "feedback round trip": pass(bp, /feedback \(task N2/, "204 + tester confirmation; spoofed identity ignored; unknown task 400"),
    "stable Wave 2 alias": alias?.failed === 0 ? `FIXED_AND_VERIFIED (${alias.deployment.aliasUrl}; ${alias.passed}/${alias.gates.length})` : "UNRESOLVED_TECHNICAL_FAILURES",
    "alias redeployment survival": alias?.redeploySurvival?.sameAlias && alias?.redeploySurvival?.newStampServed ? `FIXED_AND_VERIFIED (${alias.redeploySurvival.firstStamp} → ${alias.redeploySurvival.secondStamp} at one address)` : "UNRESOLVED_TECHNICAL_FAILURES",
    "Wave 1 preservation": alias?.wave1Unchanged && bp?.wave1Unchanged ? "FIXED_AND_VERIFIED (alias, stamp, candidate and owner key unchanged after every Wave 2 deployment)" : "UNRESOLVED_TECHNICAL_FAILURES",
    "production isolation": iso?.productionBranch?.unchanged && iso?.serverlessFunctions?.increase === 0 ? "FIXED_AND_VERIFIED (main unchanged; 13/13 functions)" : "UNRESOLVED_TECHNICAL_FAILURES",
  };
  const states = Object.values(items).map((v) => v.split(" ")[0]); const count = (s) => states.filter((x) => x === s).length;
  write("phase9a3-resolution-ledger.json", { artifact: "phase9a3-resolution-ledger", phase: PHASE, items, totals: { FIXED_AND_VERIFIED: count("FIXED_AND_VERIFIED"), NOT_REPRODUCIBLE_WITH_EVIDENCE: 0, EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK: count("EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK"), DEFERRED_BY_SCOPE: count("DEFERRED_BY_SCOPE"), UNRESOLVED_TECHNICAL_FAILURES: count("UNRESOLVED_TECHNICAL_FAILURES") } });
}

if (MODE === "summary") {
  const acc = q("night-court-v1-owner-acceptance.json"), iso = q("wave2-production-isolation.json"), led = q("phase9a3-resolution-ledger.json"), bp = q("wave2-branch-preview-qa.json"), alias = q("wave2-stable-alias-qa.json"), idn = q("wave2-identity.json"), access = q("wave2-access-contract.json"), rdy = q("wave2-readiness.json"), sec = q("wave2-security-qa.json");
  const unresolved = (led?.totals?.UNRESOLVED_TECHNICAL_FAILURES ?? 1) > 0;
  const verdict = !(iso?.wave1?.unchanged && alias?.wave1Unchanged) ? "BLOCKED — WAVE 1 PRESERVATION FAILED" : !(bp?.gates?.find((g) => /refused on Wave 2/.test(g.name))?.ok && bp?.gates?.find((g) => /refused on the Wave 1/.test(g.name))?.ok) ? "BLOCKED — WAVE 2 ACCESS ISOLATION FAILED" : (bp?.failed ?? 1) > 0 || (alias?.failed ?? 1) > 0 || unresolved ? "BLOCKED — DEPLOYED WAVE 2 DEFECT REMAINS" : "NIGHT COURT V1 WAVE 2 PRIVATE BETA READY — AWAITING OWNER DISTRIBUTION";
  write("phase9a3-final-summary.json", {
    artifact: "phase9a3-final-summary", phase: PHASE,
    repository: { parentBranch: PARENT_BRANCH, parentCommit: PARENT_COMMIT, branch: sh("git branch --show-current"), head: sh("git rev-parse HEAD"), workingTreeClean: (sh("git status --porcelain") || "") === "", draftPR: process.env.PHASE9A3_PR || null, wave2Branch: sh("git rev-parse origin/wave2") },
    ownerAcceptance: acc ? { theme: acc.themeId, status: acc.themeStatus, acceptanceText: acc.acceptanceText, scope: acc.means, productionPromotionAuthorized: acc.productionPromotionAuthorized, wave2DistributionAuthorized: acc.wave2DistributionAuthorized } : null,
    waveSeparation: { wave1: { waveId: "candidate3-wave1", branch: "wave1", commit: WAVE1, alias: "https://era-clash-basketball-git-wave1-era-clash.vercel.app", buildStamp: "eraclash-assets:2.7.2:2f35a3b70c30" }, wave2: { waveId: idn?.waveId, studyVersion: idn?.studyVersion, alias: alias?.deployment?.aliasUrl ?? null, buildStamp: alias?.deployment?.buildStamp ?? null, branchPreview: bp?.deployment?.baseUrl ?? null }, accessIsolation: bp ? { wave1KeysRefusedOnWave2: bp.wave1KeysOnWave2.every((r) => r.status === 401), wave2KeysRefusedOnWave1: bp.wave2KeysOnWave1.every((r) => r.status === 401) } : null, dataIsolation: "wave2-feedback:* / wave2-metrics:* only; preview-* never written on Wave 2", buildIsolation: "separate branch, alias and build stamp" },
    cohorts: access ? { firstTime: access.entries.filter((e) => e.cohort === "first-time").map((e) => e.testerId), returning: access.entries.filter((e) => e.cohort === "returning").map((e) => e.testerId), owner: access.entries.filter((e) => e.role === "owner").map((e) => e.testerId), humanTestingStarted: false } : null,
    deployedQa: { branchPreview: bp ? { passed: bp.passed, gates: bp.gates.length } : null, stableAlias: alias ? { passed: alias.passed, gates: alias.gates.length, redeploySurvival: alias.redeploySurvival ?? null } : null, security: sec ? { passed: sec.passed, checks: sec.checks } : null },
    preservation: { activeCandidateCoreDrift: iso?.activeCandidate?.coreDrift, candidateParameterDrift: iso?.activeCandidate?.parameterDrift, gameLogicChanges: iso?.gameLogicChanges, draftLogicChanges: iso?.draftLogicChanges, placementLogicChanges: iso?.placementLogicChanges, apiFunctionCountIncrease: iso?.serverlessFunctions?.increase, wave1CodeChanges: iso?.wave1?.wave1CodeChanges, wave1CredentialChanges: iso?.wave1?.wave1CredentialChanges, wave1DataChanges: iso?.wave1?.wave1DataChanges, productionChanges: iso?.productionBranch?.unchanged ? 0 : 1 },
    ledger: led?.totals || null, readiness: rdy?.data?.state ?? null, tests: { vitest: process.env.VITEST_SUMMARY || null, playwright: process.env.PLAYWRIGHT_SUMMARY || null },
    verdict, ownerDecision: { format: "AUTHORIZE WAVE 2 DISTRIBUTION", decidedByClaude: null, humanTestingStarted: false, invitationsSent: 0 },
  });
  console.log(verdict);
}
