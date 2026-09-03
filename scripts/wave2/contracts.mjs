#!/usr/bin/env node
// ── Wave 2 frozen contracts (Phase 9A.3) ─────────────────────────────────────
//   node scripts/wave2/contracts.mjs [--stamp=<deployment build stamp>] [--base=<url>]
// Writes the identity, cohort, access, test-plan, feedback, telemetry and
// acceptance-policy contracts under data/validation/9a3 from ONE source: the
// study constants in src/wave2.js, the allowlist hashes in config/previewAccess.js
// and the Phase 9A/9A.2 artifacts. Hashes only — never a raw key.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { WAVE2, WAVE2_COHORTS, WAVE2_RATINGS, WAVE2_TASKS, WAVE2_ISSUE_CATEGORIES, WAVE2_COMMENT_MAX, WAVE2_TELEMETRY_EVENTS } from "../../src/wave2.js";
import { PREVIEW_ACCESS } from "../../config/previewAccess.js";

const OUT = "data/validation/9a3"; mkdirSync(OUT, { recursive: true });
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=") || null;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const fileSha = (f) => (existsSync(f) ? sha(readFileSync(f)) : null);
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return null; } };
const write = (name, body) => { writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const json = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const PHASE = "9A.3 — Wave 2 private-beta preparation";
const now = new Date().toISOString();

// ── test plan ────────────────────────────────────────────────────────────────
const testPlan = {
  artifact: "wave2-test-plan", phase: PHASE, status: "FROZEN — before any human Wave 2 feedback", frozenAt: now, waveId: WAVE2.waveId, studyVersion: WAVE2.studyVersion,
  principle: "Tasks preserve genuine activation evidence: the first-time sequence gives no guidance beyond the task line; comparison questions are asked only after the initial interaction is recorded.",
  firstTime: {
    cohort: "first-time", testerIds: WAVE2_COHORTS["first-time"].testerIds,
    tasks: [
      { id: "N1", title: "Choose what to play", instruction: "Open the link and begin the game that looks like the main EraClash experience.", guidance: "none beyond the instruction", observe: ["whether Chaos Clash is selected", "time to mode selection", "confusion or hesitation", "whether the tester understands the mode differences"], telemetry: ["play_lobby_viewed", "play_mode_selected", "time_to_mode_selection_recorded"], ratings: WAVE2_TASKS.N1.ratings },
      { id: "N2", title: "Complete one Chaos Clash", observe: ["time to first roll", "hold understanding", "Era Reveal understanding", "coach choice understanding", "completion", "result comprehension"], telemetry: ["time_to_first_roll_recorded", "chaos_roll_completed", "chaos_era_revealed", "chaos_coach_selected", "chaos_game_completed"], ratings: WAVE2_TASKS.N2.ratings },
      { id: "N3", title: "Postgame exploration", instruction: "Explore whatever interests you.", observe: ["first result tab used", "whether the Story is understood", "whether the Box Score is found", "whether Coaching is useful", "whether Analysis is attempted"], telemetry: ["result_tab_opened"], ratings: WAVE2_TASKS.N3.ratings },
      { id: "N4", title: "Voluntary continuation signal", instruction: "none — do not instruct the tester to play again", observe: ["starts another Chaos Clash", "runs a rematch", "opens Dream Matchup", "creates a challenge", "exits"], telemetry: ["new_clash_started", "rematch_started", "play_mode_selected"], ratings: WAVE2_TASKS.N4.ratings, note: "diagnostic signal, not a hard pass/fail gate at this sample size" },
      { id: "N5", title: "Mobile check", instruction: "At least one first-time tester completes the entry and one full game on a phone.", ratings: WAVE2_TASKS.N5.ratings },
    ],
  },
  returning: {
    cohort: "returning", testerIds: WAVE2_COHORTS.returning.testerIds,
    eligibility: ["a Wave 1 tester may join only after completing their Wave 1 sessions", "after their Wave 1 feedback is preserved", "through a separate Wave 2 credential", "with a distinct Wave 2 tester id"],
    tasks: [
      { id: "R1", title: "Compare the entry", steps: ["open the Wave 2 lobby", "say whether starting is easier than Wave 1 (asked only after the lobby interaction is recorded)", "continue an active run", "verify the logo preserves the run"], telemetry: ["play_lobby_viewed", "active_run_continue_clicked"], ratings: WAVE2_TASKS.R1.ratings },
      { id: "R2", title: "Dream Matchup placement", steps: ["select Kevin Durant or another multi-position player", "place manually", "trigger automatic placement with a one-position player", "test an occupied-slot swap", "test Undo"], telemetry: ["dream_player_selected", "eligible_position_choice_shown", "dream_player_placed", "dream_player_auto_placed", "dream_player_swap_completed"], ratings: WAVE2_TASKS.R2.ratings },
      { id: "R3", title: "Night Court comparison", compare: ["Lobby", "Time Arena", "Result Dock", "Full Postgame", "Mobile"], rule: "do not reveal the intended answer", ratings: WAVE2_TASKS.R3.ratings },
    ],
  },
  operatorRules: ["no rescue unless the tester is stuck for 3 minutes; every rescue is recorded as a failure of the task", "record observations in the operator log with tester id and task id only", "never type a tester's key for them in a shared screen"],
};
write("wave2-test-plan.json", testPlan);

// ── acceptance policy ────────────────────────────────────────────────────────
const policy = {
  artifact: "wave2-acceptance-policy", phase: PHASE, status: "FROZEN — before any human Wave 2 feedback; not to be altered after seeing results", frozenAt: now, waveId: WAVE2.waveId,
  technicalGates: { accessSuccess: "100%", guidedTaskCompletion: "≥ 95%", resultReloadConsistency: "100%", candidateIdentityPreservation: "100%", unexpectedFallbackRate: "≤ 1%", uncaughtClientErrors: 0, p0Defects: 0, p1Defects: 0, crossWaveCredentialAcceptance: 0, crossWaveDataWrites: 0 },
  firstTimeActivationGates: { evaluateWhen: "all three first-time testers have completed N1–N3 (N5 by at least one)", medianModeChoiceClarity: "≥ 4.0 / 5", medianStartingClarity: "≥ 4.0 / 5", medianDraftClarity: "≥ 4.0 / 5", medianVisualComfort: "≥ 4.0 / 5", medianResultClarity: "≥ 4.0 / 5", medianBrandDistinctiveness: "≥ 4.0 / 5", medianTimeToModeSelectionSeconds: "≤ 45", medianTimeToFirstRollSeconds: "≤ 90", testersRequiringOperatorRescue: 0 },
  placementGate: { guidedMultiPositionTaskCompletion: "100%", illegalLineupsCreated: 0, unexplainedAutoPlacements: 0, failedUndo: 0 },
  diagnosticNotGates: ["voluntary second game", "preferred result tab", "preferred mode", "share intent", "challenge intent", "subscription interest"],
  statistics: "medians, counts, ranges and individual task failures only — no population-level certainty from five testers",
  cohortsReportedSeparately: true,
};
write("wave2-acceptance-policy.json", policy);

// ── feedback contract ────────────────────────────────────────────────────────
const feedback = {
  artifact: "wave2-feedback-contract", phase: PHASE, status: "FROZEN", frozenAt: now, schemaVersion: WAVE2.feedbackSchemaVersion, route: "POST /api/feedback with kind: \"wave2\" (existing route; no new function)",
  serverAuthoritative: ["waveId", "studyVersion", "testerId", "cohort", "sessionId", "candidateId", "calibrationVersion", "candidateCoreHash", "themeVersion", "buildStamp", "submittedAt", "revision"], clientIdentityFieldsIgnored: true,
  clientFields: { taskId: Object.keys(WAVE2_TASKS), resultId: "pv_<id> — required for tasks with needsResult, must exist in preview-result:*", mode: "≤ 16 chars", ratings: WAVE2_RATINGS, ratingsShownPerTask: Object.fromEntries(Object.entries(WAVE2_TASKS).map(([k, v]) => [k, v.ratings])), issueCategory: WAVE2_ISSUE_CATEGORIES, optionalComment: `≤ ${WAVE2_COMMENT_MAX} chars, cleaned, no HTML execution`, clientBuildStamp: "recorded as reported, separate from the server's buildStamp" },
  storage: { primary: "wave2-feedback:primary:<testerId>:<taskId>[:<resultId>] — one primary per tester/task, resubmission REPLACES it and increments revision", log: "wave2-feedback:log (LPUSH, capped 9999)", categories: "wave2-feedback:categories", counters: "wave2-metrics:counters" },
  neverStored: ["email", "real name", "raw key", "cookie", "authorization header", "full IP", "device fingerprint", "unbounded text"],
  isolation: "keys are prefixed wave2-*; Wave 1's preview-feedback:* namespace is never written by Wave 2 code paths",
};
write("wave2-feedback-contract.json", feedback);

// ── telemetry contract ───────────────────────────────────────────────────────
const telemetry = {
  artifact: "wave2-telemetry-contract", phase: PHASE, status: "FROZEN", frozenAt: now, version: WAVE2.telemetryContractVersion, transport: "src/analytics.js → POST /api/events (existing route; allowlisted; no new function)",
  events: WAVE2_TELEMETRY_EVENTS, serverSideEvents: ["preview_fallback_invoked (api/game.js → counters)"],
  partitions: ["waveId", "cohort", "testerId", "buildStamp"], partitionKey: "wave2-metrics:<waveId>:<cohort>:<testerId>:<buildStamp> (HINCRBY <event>) plus wave2-metrics:events:<waveId> totals per event",
  identitySource: "the signed preview session (server), never the client payload", forbidden: ["email", "key", "cookie", "token", "IP", "free text"], crossWaveAggregation: "none — no counter mixes waves",
  timings: ["time_to_mode_selection_recorded {ms, bucket}", "time_to_first_roll_recorded {ms, bucket, from}"],
};
write("wave2-telemetry-contract.json", telemetry);

// ── cohorts ──────────────────────────────────────────────────────────────────
write("wave2-cohort-contract.json", { artifact: "wave2-cohort-contract", phase: PHASE, status: "FROZEN", frozenAt: now, waveId: WAVE2.waveId, cohorts: WAVE2_COHORTS, pseudonymous: true, realIdentityInRepository: false, wave1CrossoverRule: testPlan.returning.eligibility, humanTestingStarted: false });

// ── access contract (hashes only) ────────────────────────────────────────────
const w2 = PREVIEW_ACCESS.keys;
write("wave2-access-contract.json", {
  artifact: "wave2-access-contract", phase: PHASE, status: PREVIEW_ACCESS.waveId === WAVE2.waveId ? "FROZEN" : "PENDING — config/previewAccess.js still carries the previous wave", frozenAt: now,
  accessConfigVersion: PREVIEW_ACCESS.accessConfigVersion, waveId: PREVIEW_ACCESS.waveId, entries: w2.map((k) => ({ testerId: k.testerId, role: k.role, cohort: k.cohort ?? null, waveId: PREVIEW_ACCESS.waveId, keyVersion: k.keyVersion, enabled: k.enabled !== false, sha256: k.sha256, createdAt: k.createdAt ?? null })),
  counts: { owner: w2.filter((k) => k.role === "owner").length, firstTime: w2.filter((k) => k.cohort === "first-time").length, returning: w2.filter((k) => k.cohort === "returning").length },
  rawKeys: { location: ".preview-secrets/wave2-access-keys.json", directoryMode: "0700", fileMode: "0600", gitIgnored: true, committed: false },
  session: { cookie: "pv_session", format: "v3.<payload>.<hmac>", payload: ["v", "wave", "testerId", "role", "keyVersion", "sid", "iat", "exp"], secret: "HMAC over `pv-session-v3|<store token>|<waveId>` — wave-bound, so a Wave 1 session cannot verify here and a Wave 2 session cannot verify on Wave 1", ttlSeconds: 604800, revocation: "every request re-checks the allowlist entry (enabled, keyVersion, role, wave)" },
  isolation: ["Wave 1 tester keys are not in this allowlist and are refused", "Wave 2 keys are not in the Wave 1 allowlist and are refused there", "the Wave 2 owner key is separate from the Wave 1 owner key"],
});

// ── identity (bound to hashes) ───────────────────────────────────────────────
const lock = json("data/validation/8d/candidate4-lock.json");
write("wave2-identity.json", {
  artifact: "wave2-identity", phase: PHASE, status: "FROZEN", frozenAt: now, ...WAVE2,
  bindings: {
    phase9a2Commit: "48c13a5a1ca30d0028719764efb534ebbf870e4d", phase9a3HeadAtFreeze: sh("git rev-parse HEAD"),
    nightCourtContractSha256: fileSha("data/validation/9a2/production-theme-contract.json"), themeCssSha256: fileSha("src/theme/basketball-themes.css"),
    candidateLockCoreHash: lock?.data?.coreHash ?? null, candidateParameterSetHash: lock?.data?.parameterSetHash ?? null, candidateLockSha256: fileSha("data/validation/8d/candidate4-lock.json"),
    modeRegistrySha256: fileSha("src/navigation.js"), placementContractSha256: fileSha("data/validation/9a/multi-position-contract.json"), placementModuleSha256: fileSha("src/lineupPlacement.js"),
    feedbackSchemaSha256: sha(JSON.stringify({ ...feedback, frozenAt: undefined })), telemetryContractSha256: sha(JSON.stringify({ ...telemetry, frozenAt: undefined })), acceptancePolicySha256: sha(JSON.stringify({ ...policy, frozenAt: undefined })), testPlanSha256: sha(JSON.stringify({ ...testPlan, frozenAt: undefined })),
    testerGuideSha256: { firstTime: fileSha("docs/preview/wave2-first-time-tester-guide.md"), returning: fileSha("docs/preview/wave2-returning-tester-guide.md"), operator: fileSha("docs/preview/wave2-operator-guide.md"), invite: fileSha("docs/preview/wave2-invite-template.md") },
    accessConfigSha256: fileSha("config/previewAccess.js"), wave2ModuleSha256: fileSha("src/wave2.js"),
    deploymentBuildStamp: arg("stamp"), branchPreviewBase: arg("base"),
  },
  wave1: { waveId: "candidate3-wave1", branch: "wave1", commit: sh("git rev-parse origin/wave1"), buildStamp: "eraclash-assets:2.7.2:2f35a3b70c30", relation: "frozen baseline; no shared credential, session, namespace or counter" },
});
