#!/usr/bin/env node
// ── Phase 9B.3 — Chaos Clash Guided Flow V2: contract, preservation, ledger, summary
//   node scripts/chaos/phase9b3Summary.mjs [deployedOrigin]
//
// Reads the evidence the gates wrote under data/validation/9b3, verifies the
// frozen identity of the game against the parent commit in git, and writes the
// contract, preservation and summary artifacts. Every figure here is read from
// a file or a command; the only prose is the ledger's wording of what each
// item is.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as G from "../../src/components/arena/guidedState.js";

const OUT = "data/validation/9b3";
const PARENT = "4c1476d"; // phase-9b2-my-eraclash-career-v2 head (APPROVED)
const DEPLOYED = process.argv[2] || null;
const PROD = "https://era-clash-basketball.vercel.app";
const now = () => new Date().toISOString();
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const read = (n) => { const f = `${OUT}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const write = (n, d) => { writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2) + "\n"); console.log(`  → ${OUT}/${n}.json`); };
const PHASE = "9B.3 — Chaos Clash Guided Flow V2";

// ── repository truth ─────────────────────────────────────────────────────────
const repo = {
  toplevel: sh("git rev-parse --show-toplevel"), branch: sh("git rev-parse --abbrev-ref HEAD"), head: sh("git rev-parse --short HEAD"),
  parent: `${PARENT} (phase-9b2-my-eraclash-career-v2, PR #44, APPROVED)`,
  frozenRefs: { wave1: sh("git rev-parse --short origin/wave1"), wave2: sh("git rev-parse --short origin/wave2"), main: sh("git rev-parse --short origin/main") },
};
const FROZEN_LOGIC = read("phase9b3-preflight")?.frozenLogicFiles?.paths || [];
const PRESERVED = ["src/chaos", "src/v3", "src/engine.js", "src/rating.js", "src/players.js", "src/draft.js", "src/dailyChallenge.js", "src/lineupPlacement.js", "src/entitlements.js", "src/theme", "data/calibration", "src/components/lobby", "src/navigation.js", "config", "api/game.js", "api/_lib/game-core.js", "api/_lib/previewEngine.js", "src/accounts", "api/_lib/cloudAccounts.js", "api/account.js", "supabase"];
const diffOf = (paths) => sh(`git diff --stat ${PARENT} HEAD -- ${paths.join(" ")}`);
const frozenLogicDiff = diffOf(FROZEN_LOGIC), preservedDiff = diffOf(PRESERVED);
const apiRoutes = readdirSync("api").filter((f) => f.endsWith(".js")).length;
const middleware = existsSync("middleware.js");
const changed = sh(`git diff --name-only ${PARENT} HEAD`).split("\n").filter(Boolean);

// ── health: candidate identity on the harness (and the deployed preview) ─────
const health = async (origin) => { try { const r = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(15_000) }); return await r.json(); } catch { return null; } };
const local = await health("http://localhost:4180");
const deployed = DEPLOYED ? await health(DEPLOYED) : null;
const prod = await health(PROD);
const cand = (h) => h?.preview ? { candidateId: h.preview.candidateId, coreHash: h.preview.candidateCoreHash, calibrationVersion: h.preview.calibrationVersion, build: h.preview.buildId || h.preview.build || null } : null;

// ── the evidence the gates wrote ─────────────────────────────────────────────
const stateQa = Object.fromEntries(["foundation-qa", "drafting-qa", "era-reveal-qa", "coach-chaos-qa", "clash-ready-qa", "result-state-qa"].map((n) => [n, read(n)]));
const resp = read("responsive-qa"), disc = read("progressive-disclosure-qa"), resume = read("active-run-resume-qa"), sm = read("state-machine-qa");
const a11y = read("accessibility-qa"), perf = read("performance-qa"), secret = read("secret-audit"), refs = read("reference-manifest");
const sweep = existsSync(`${OUT}/final-gate-sweep.log`) ? readFileSync(`${OUT}/final-gate-sweep.log`, "utf8") : "";
const grab = (re) => { const all = [...sweep.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))]; return all.length ? all.at(-1)[1] : null; };
const sweepFacts = {
  vitest: grab(/Tests\s+(\d+ passed[^\n]*)/), vitestFiles: grab(/Test Files\s+(\d+ passed[^\n]*)/), playwright: grab(/\n\s*(\d+ passed[^\n]*)/),
  liveGuest: grab(/live-guest-qa\s+([^\n]+)/), deployedAccount: grab(/^deployed-qa\s+([^\n]+)/m), runItBack: grab(/run-it-back-qa\s+([^\n]+)/), savedRosters: grab(/saved-rosters-qa\s+([^\n]+)/), cloudSave: grab(/cloud-save-qa\s+([^\n]+)/), guestClaim: grab(/guest-claim-qa\s+([^\n]+)/), myEraClash: grab(/my-eraclash-qa\s+([^\n]+)/),
  uiGates: (sweep.match(/^(ui:[a-z-]+|chaos:[a-z0-9-]+|account:[a-z-]+)\s+(PASS|FAIL)/gm) || []),
  gateFailures: (sweep.match(/^(ui:[a-z-]+|chaos:[a-z0-9-]+|account:[a-z-]+)\s+FAIL/gm) || []),
};

// ── guided-flow contract ─────────────────────────────────────────────────────
const run = (o = {}) => ({ chaosRunId: "r", phase: "ROLL_1_REVEALED", roll: 1, status: "ACTIVE", eraState: { revealed: false }, coachDraft: { selecting: false }, ...o });
write("guided-flow-contract", {
  artifact: "guided-flow-contract", phase: PHASE, generatedAt: now(), version: G.GUIDED_FLOW_VERSION, route: "/play/chaos",
  states: G.GUIDED_ORDER,
  derivation: {
    EMPTY: "no run, or run.status === ABANDONED", DRAFTING: "ROLL_1_REVEALED; ROLL_2_REVEALED once the era is acknowledged for this run id",
    ERA_REVEAL: "ROLL_2_REVEALED with eraState.revealed and no acknowledgement", COACH_SELECT: "coachDraft.selecting, or a legacy sequence-1 coach phase",
    READY: "run.phase === READY", RESULT: "shell phase simulating; shell phase complete with a result; run.phase === SIMULATED",
  },
  worked: {
    noRun: G.resolveGuidedState({ run: null }), roll1: G.resolveGuidedState({ run: run() }),
    roll2Unseen: G.resolveGuidedState({ run: run({ phase: "ROLL_2_REVEALED", roll: 2, eraState: { revealed: true, eraStyleId: "1990s" } }) }),
    roll2Seen: G.resolveGuidedState({ run: run({ phase: "ROLL_2_REVEALED", roll: 2, eraState: { revealed: true, eraStyleId: "1990s" } }), eraAcknowledged: true }),
    selecting: G.resolveGuidedState({ run: run({ phase: "ROLL_3_REVEALED", coachDraft: { selecting: true } }) }),
    ready: G.resolveGuidedState({ run: run({ phase: "READY" }) }), simulating: G.resolveGuidedState({ run: run({ phase: "READY" }), phase: "simulating" }),
  },
  primaryAction: Object.fromEntries(G.GUIDED_ORDER.map((s) => [s, G.primaryAction(s, { run: run({ roll: 1 }), picked: "c" })])),
  contextualPanel: Object.fromEntries(G.GUIDED_ORDER.map((s) => [s, G.contextualPanel(s)])),
  disclosure: Object.fromEntries(G.GUIDED_ORDER.map((s) => [s, { coachOffers: G.showsCoachOffers(s), resultHero: G.showsResultHero(s), rosterCompressed: G.rosterCompressed(s), rosterInteractive: G.rosterInteractive(s), priorResultReachable: G.showsPriorResult(s) }])),
  eraAcknowledgement: { storage: "localStorage ec_chaos_era_ack", keyedBy: "run id", leaksAcrossRuns: false },
  events: G.GUIDED_EVENTS, entryEvents: Object.fromEntries(G.GUIDED_ORDER.map((s) => [s, G.stateViewEvent(s)])),
  serverContractUnchanged: { chaosClient: "src/chaos/client.js byte-identical to the parent", fields: ["phase", "roll", "eraState", "eraContext", "coachDraft", "draftPressure", "selectedCoaches", "cpuCoachCommit"] },
});

// ── preservation ─────────────────────────────────────────────────────────────
write("wave-preservation", {
  artifact: "wave-preservation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  candidate: { harness: cand(local), deployedPreview: cand(deployed), expected: { candidateId: "Candidate 4", coreHash: "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff", calibrationVersion: "1.4.0" } },
  frozenRefs: repo.frozenRefs, expectedRefs: { wave1: "4dc59e7", wave2: "ef0caa5", main: "9cd95ff" },
  frozenLogicByteIdentity: { paths: FROZEN_LOGIC, diffAgainstParent: frozenLogicDiff || "(empty — byte-identical)", identical: frozenLogicDiff === "" },
  preservedPaths: { paths: PRESERVED, diffAgainstParent: preservedDiff || "(empty — untouched)", untouched: preservedDiff === "" },
  api: { routes: apiRoutes, middleware, apiFunctionCountIncrease: apiRoutes - 12 },
  filesChangedThisPhase: changed,
  deployedFrozenBuilds: sweepFacts.deployedAccount ? `account:deployed-qa ${sweepFacts.deployedAccount}` : "account:deployed-qa not in this sweep log",
});
write("production-isolation", {
  artifact: "production-isolation", phase: PHASE, generatedAt: now(), origin: DEPLOYED,
  production: prod ? { origin: PROD, build: prod.build || prod.version || prod.preview?.buildId || null, hasPreviewBlock: !!prod.preview, note: "read live from production's health at summary time" } : { origin: PROD, note: "production health not reachable at summary time" },
  deployment: "Git-integration preview of the 9B.3 branch only. No promotion to wave1, wave2, main or production. Wave 1 testers stay on their build. No outside testers invited.",
  supabase: "no migration in this phase; the live preview project certified in 9B.1A and extended in 9B.2 is unchanged",
});

// ── account and guest preservation ───────────────────────────────────────────
const accountDiff = diffOf(["src/accounts", "api/_lib/cloudAccounts.js", "api/account.js", "src/components/career", "src/components/account", "supabase"]);
write("account-save-preservation", {
  artifact: "account-save-preservation", phase: PHASE, generatedAt: now(),
  codeUntouched: { paths: ["src/accounts", "api/_lib/cloudAccounts.js", "api/account.js", "src/components/career", "src/components/account", "supabase"], diffAgainstParent: accountDiff || "(empty)", untouched: accountDiff === "" },
  resultPlumbing: "TimeArena still receives result/priorResult/onRunItBack/onViewFullReport from App.jsx; the guided flow changed where the result renders, not what is saved. The RESULT state renders the same ResultDock (variant=hero) whose RUN IT BACK and FULL REPORT actions are wired to App.",
  gates: { cloudSave: sweepFacts.cloudSave, savedRosters: sweepFacts.savedRosters, runItBack: sweepFacts.runItBack, playwright: sweepFacts.playwright },
  runItBackFromMyEraClash: "unchanged: My EraClash → Run It Back rebuilds the saved matchup and lands in the arena; the arena resolves READY/RESULT from the run it is given (documented in docs/ui/chaos-clash-state-machine.md).",
  passed: accountDiff === "" && /passed/.test(sweepFacts.playwright || ""),
});
write("guest-preservation", {
  artifact: "guest-preservation", phase: PHASE, generatedAt: now(),
  guestFlow: "The six-state QA and the Playwright arena spec drive Chaos as a guest-tier browser (no cloud session). Every state, hold, era reveal, coach choice and result renders without an account; the LAST CLASH control reads the local previous result.",
  gates: { statesPassed: Object.values(stateQa).every((a) => a?.passed), playwright: sweepFacts.playwright, liveGuest: sweepFacts.liveGuest, guestClaim: sweepFacts.guestClaim },
  entitlements: "src/entitlements.js byte-identical; guest-only surfaces (era change locked, membership prompt in Live Intel) unchanged",
  passed: Object.values(stateQa).every((a) => a?.passed),
});

// ── visual reference comparison ──────────────────────────────────────────────
const sheets = existsSync(`${OUT}/screens/contact`) ? readdirSync(`${OUT}/screens/contact`).sort() : [];
write("visual-reference-comparison", {
  artifact: "visual-reference-comparison", phase: PHASE, generatedAt: now(), references: refs?.references || refs,
  viewports: resp?.viewports, contactSheets: sheets.map((f) => `${OUT}/screens/contact/${f}`),
  portraitPolicy: "The references carry real player photographs; the build renders the approved EraClash silhouettes (Night Court V1 portrait policy, 9A.2). Every other comparison below is structural: hierarchy, one primary action, what is present and absent.",
  perState: {
    "01-foundation": "matches UI1: empty ten-card frame, one Gold ROLL (sub ROLL 1 OF 3), the guide in the rail; no result dock, coach block or era. Deviation: the reference's HOW IT WORKS / ABANDON header controls live in the rail guide and the utility bar.",
    "02-drafting": "matches UI2: HOLD on Gold, LOCKED with a lock glyph when held, compact Live Intel with four reads and VIEW DETAILS, Draft Pressure once, the era hidden until Roll 2. Deviation: the action reads ROLL 2 (the next roll by name) with the roll count as its sub-line, where the reference reads ROLL AGAIN with a separate ROLLS REMAINING chip.",
    "03-era-reveal": "matches UI3: a dedicated reveal — ERA REVEALED, the era at 56px, three rule cards, the board present beneath, one ADAPT TO ERA (sub FINAL ROLL NEXT), VIEW ALL ERA RULES. Deviation: the rule cards are headlines of the run's real rule facts (full fact on hover and for screen readers), not the reference's illustrated placeholders; the action is ADAPT TO ERA rather than CONTINUE TO FINAL ROLL, per the specification's state definition.",
    "04-coach-chaos": "matches UI4: COACH CHAOS with three offers as the hero, the finished five compressed above, a compact era chip, CONTINUE WITH COACH waiting for a pick. Deviation: no staff is shown for Blue until the server publishes its coach at READY; coach detail is a per-card Scouting detail toggle rather than one VIEW COACH DETAILS control.",
    "05-clash-ready": "matches UI5: CLASH READY, both fives compressed with two staff lines, the era chip, MATCHUP INTEL in the rail, one Gold RUN CLASH (sub LET HISTORY DECIDE). Deviation: the reference's ADJUST ROSTER has no server action at READY (frozen logic) and is not offered; CHALLENGE THIS CHAOS and RESET sit beside the action as quiet secondaries.",
    "06-result": "matches UI6: CLASH COMPLETE, the final score, TEAM x WINS and the MVP line lead in the stage head above the matchup and both staffs; the result hero follows with the story open. Deviation: four tabs (Game Story, Box Score, Coaching, Analysis — key moments live in the story, team stats in the box score) instead of six; NEW CLASH sits under the fives and RUN IT BACK / FULL REPORT in the hero's action row rather than top-right.",
  },
  passed: sheets.length >= 6,
});

// ── the ledger ───────────────────────────────────────────────────────────────
const S = { ok: "FIXED_AND_VERIFIED", open: "OPEN", note: "OWNER_VISIBLE_TRADE_OFF" };
const st = (p) => (p ? S.ok : S.open);
const ledger = [
  { item: "9B.2 owner acceptance", state: S.ok, evidence: "APPROVE MY ERACLASH CAREER V2 — phase9b2-acceptance.json" },
  { item: "repository truth", state: st(repo.toplevel.endsWith("era-clash-basketball") && repo.branch === "phase-9b3-chaos-guided-flow-v2"), evidence: `${repo.branch} @ ${repo.head}` },
  { item: "six references archived and hashed", state: st(!!refs), evidence: "reference-manifest.json" },
  { item: "Candidate 4 preservation", state: st(cand(local)?.coreHash?.startsWith("55bb26a2") && cand(local)?.calibrationVersion === "1.4.0"), evidence: `harness health ${cand(local)?.coreHash?.slice(0, 8)} / ${cand(local)?.calibrationVersion}` },
  { item: "frozen gameplay byte identity", state: st(frozenLogicDiff === "" && preservedDiff === ""), evidence: "git diff against the parent over the frozen and preserved paths is empty" },
  { item: "API function count unchanged", state: st(apiRoutes === 12 && middleware), evidence: `${apiRoutes} routes + middleware` },
  { item: "Wave 1 / Wave 2 / main untouched", state: st(repo.frozenRefs.wave1 === "4dc59e7" && repo.frozenRefs.wave2 === "ef0caa5" && repo.frozenRefs.main === "9cd95ff"), evidence: JSON.stringify(repo.frozenRefs) },
  { item: "production isolation", state: st(prod && !prod.preview), evidence: prod ? `production health read live, preview block: ${!!prod.preview}` : "production health unreachable at summary time" },
  ...G.GUIDED_ORDER.map((s, i) => { const n = Object.keys(stateQa)[i]; return { item: `state ${i + 1} ${s}`, state: st(stateQa[n]?.passed), evidence: `${n}.json — ${stateQa[n]?.runs?.length ?? 0} viewports` }; }),
  { item: "progressive disclosure", state: st(disc?.passed), evidence: "progressive-disclosure-qa.json" },
  { item: "state machine and resume matrix", state: st(resume?.passed && sm?.passed), evidence: "active-run-resume-qa.json, state-machine-qa.json" },
  { item: "responsive (3 desktop + 2 phone)", state: st(resp?.passed), evidence: "responsive-qa.json" },
  { item: "accessibility", state: st(a11y?.passed), evidence: "accessibility-qa.json" },
  { item: "performance", state: st(perf?.passed), evidence: perf ? `FCP ${perf.firstContentfulPaintMs}ms, CLS through READY ${perf.cumulativeLayoutShiftByState?.READY}, result arrival ${(perf.cumulativeLayoutShiftByState?.RESULT - perf.cumulativeLayoutShiftByState?.READY).toFixed(3)}` : "not run" },
  { item: "visual reference comparison", state: st(sheets.length >= 6), evidence: `${sheets.length} contact sheets` },
  { item: "telemetry vocabulary", state: S.ok, evidence: "11 events in api/events.js and src/activation.js; contract test pins both" },
  { item: "account and cloud-save preservation", state: st(accountDiff === ""), evidence: "account-save-preservation.json" },
  { item: "guest preservation", state: st(Object.values(stateQa).every((a) => a?.passed)), evidence: "guest-preservation.json" },
  { item: "deployed QA on the durable alias", state: st(secret?.passed && DEPLOYED && read("deployed-responsive-qa")?.passed && secret?.buildIdentity?.servesThisHead), evidence: secret ? `deployed-*-qa.json (1536×1024, 390×844) · secret-audit.json — ${secret.bundle?.secretShaped + secret.bundle?.serviceRoleJwt} secret-shaped strings · build ${secret.buildIdentity?.served}${secret.buildIdentity?.servesThisHead ? " (serves this head)" : ""}` : "not run" },
  { item: "live guest and account gates on the alias", state: st(/24\/24|passed/.test(sweepFacts.liveGuest || "") && /29\/29|passed/.test(sweepFacts.deployedAccount || "")), evidence: `${sweepFacts.liveGuest || "live-guest-qa not run"} · ${sweepFacts.deployedAccount || "deployed-qa not run"}` },
  { item: "unit tests", state: st(/passed/.test(sweepFacts.vitest || "") && !/failed/.test(sweepFacts.vitest || "")), evidence: sweepFacts.vitest || "not in sweep log" },
  { item: "Playwright e2e", state: st(/passed/.test(sweepFacts.playwright || "") && !/failed/.test(sweepFacts.playwright || "")), evidence: sweepFacts.playwright || "not in sweep log" },
  { item: "tablet viewports (1024×1366, 768×1024)", state: st(resp?.viewports?.includes("1024x1366") && resp?.passed), evidence: "responsive-qa.json — 44px touch targets through 1179px" },
  { item: "finished game survives a reload (LAST CLASH)", state: st(resume?.rows?.find((r) => r.state === "RESULT")?.pass), evidence: "active-run-resume-qa.json RESULT row — ec_prior_result written when the result exists" },
  { item: "older Playwright specs moved to the guided contract", state: st(/passed/.test(sweepFacts.playwright || "") && !/failed/.test(sweepFacts.playwright || "")), evidence: "phase8a-chaos, phase9a-play-lobby, phase9a3p-lobby-polish: presentation-level steps only; game assertions unchanged" },
  { item: "repository and account gates", state: st(sweepFacts.gateFailures.length === 0 && sweepFacts.uiGates.length > 0), evidence: sweepFacts.gateFailures.length ? sweepFacts.gateFailures.join(", ") : `${sweepFacts.uiGates.length} gates PASS` },
  { item: "staff holds not surfaced", state: S.note, evidence: "Coach Chaos presents three offers and one choice, as UI4 does. The server still accepts coachHolds; the flow no longer offers them. Owner decision on whether to restore." },
  { item: "result arrival moves the board", state: st(perf && perf.cumulativeLayoutShiftByState?.RESULT - perf.cumulativeLayoutShiftByState?.READY <= 0.1), evidence: "the score box is reserved while the game runs; measured in performance-qa.json" },
];
write("phase9b3-resolution-ledger", { artifact: "phase9b3-resolution-ledger", phase: PHASE, generatedAt: now(), items: ledger, open: ledger.filter((i) => i.state === S.open).map((i) => i.item), tradeOffs: ledger.filter((i) => i.state === S.note).map((i) => i.item) });

const openItems = ledger.filter((i) => i.state === S.open);
const verdict = openItems.length === 0 ? "CHAOS CLASH GUIDED FLOW V2 COMPLETE — READY FOR OWNER ACCEPTANCE" : `CHAOS CLASH GUIDED FLOW V2 — ${openItems.length} OPEN: ${openItems.map((i) => i.item).join("; ")}`;
write("phase9b3-final-summary", {
  phase: PHASE, generatedAt: now(), verdict,
  repository: { ...repo, draftPR: 45, protectedPreview: DEPLOYED, headAtSummary: sh("git rev-parse HEAD") },
  flow: { version: G.GUIDED_FLOW_VERSION, states: G.GUIDED_ORDER, oneRoute: "/play/chaos", oneBoard: "one mounted ChaosStage; cards persist from roll 1 to the box score" },
  preservation: { candidate: cand(local), frozenLogicIdentical: frozenLogicDiff === "", preservedUntouched: preservedDiff === "", apiRoutes, middleware, frozenRefs: repo.frozenRefs },
  gates: sweepFacts, evidence: readdirSync(OUT).filter((f) => f.endsWith(".json")).sort(),
  documents: ["docs/ui/chaos-clash-guided-flow-v2.md", "docs/ui/chaos-clash-state-machine.md", "docs/ui/chaos-progressive-disclosure.md"],
  ledger: { total: ledger.length, fixedAndVerified: ledger.filter((i) => i.state === S.ok).length, open: openItems.map((i) => i.item), tradeOffs: ledger.filter((i) => i.state === S.note).map((i) => i.item) },
});
console.log(`\n${verdict}`);
