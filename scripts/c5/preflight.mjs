// ── Phase 6C5 WS1 — preview package certification ─────────────────────────────
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { DIR } from "./ledger.mjs";

const gate = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` … ${detail}` : ""}`);
  if (!ok) { console.error(`preflight blocked: ${name}`); process.exit(1); }
};
delete process.env.PREVIEW_SIM_ENGINE_ENABLED; delete process.env.VERCEL_ENV;

// The ACTIVE candidate lock, and its parent. Phase 8D minted Candidate 4 from
// Candidate 3 under Candidate 3's own postLockMutationPolicy.
const lock = JSON.parse(readFileSync("data/validation/8d/candidate4-lock.json", "utf8")).data;
const c2 = JSON.parse(readFileSync("data/validation/6c4d0/candidate3-lock.json", "utf8")).data;
const { versionOf } = await import("../../src/versions.js");
const { defaultRuntimeParameterSet } = await import("../../src/v3/calibration/runtimeParameters.js");
const { flags } = await import("../../api/_lib/flags.js");
const { PREVIEW_NAMESPACES, PREVIEW_RESULT_ID_PREFIX, PREVIEW_CANDIDATE_CORE_HASH, previewCandidateIdentity, computeResultPreview } = await import("../../api/_lib/previewEngine.js");
const { PREVIEW_ACCESS } = await import("../../config/previewAccess.js");
const { PLAYERS } = await import("../../src/players.js");

// Candidate 4 lock, live
gate("candidate lock states", lock.candidateSelectionStatus === "SELECTED" && lock.candidateLockStatus === "LOCKED"
  && lock.calibrationStatus === "PREVIEW_READY_LOCKED" && lock.formalValidationStatus === "FORMAL_VALIDATION_INCOMPLETE");
gate("parent is Candidate 3, chain intact", lock.parentCandidateId === "Candidate 3" && lock.parentCoreHash === c2.coreHash && c2.candidateLockStatus === "LOCKED");
gate("calibration version live = locked", versionOf("possessionCalibrationVersion") === lock.possessionCalibrationVersion && lock.possessionCalibrationVersion === "1.4.0");
gate("parameter hash live = locked", defaultRuntimeParameterSet().parameterSetHash === lock.parameterSetHash,
  lock.parameterSetHash.slice(0, 16));
gate("embedded core hash = locked core hash", PREVIEW_CANDIDATE_CORE_HASH === lock.coreHash, lock.coreHash.slice(0, 16));

// Preview package
gate("flag defaults false", flags().previewSimEngine === false);
gate("six preview namespaces", Object.values(PREVIEW_NAMESPACES).length === 6
  && Object.values(PREVIEW_NAMESPACES).every((n) => n.startsWith("preview-")));
gate("pv_ prefix", PREVIEW_RESULT_ID_PREFIX === "pv_");
gate("access allowlist: hashes only, owner present", PREVIEW_ACCESS.keys.length >= 1
  && PREVIEW_ACCESS.keys.every((k) => /^[a-f0-9]{64}$/.test(k.sha256))
  && PREVIEW_ACCESS.keys.some((k) => k.label === "owner"));

// Result + probability + replay identity probe
const team = (ids) => ids.map((id) => ({ id, ...PLAYERS.find((p) => p.id === id) }));
const A = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
const B = team(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);
const r1 = computeResultPreview("single", A, B, { coachGoldId: "neutral", coachBlueId: "neutral" }, 99);
const r2 = computeResultPreview("single", A, B, { coachGoldId: "neutral", coachBlueId: "neutral" }, 99);
gate("replay identity", JSON.stringify(r1) === JSON.stringify(r2));
gate("record fulfils postgame contract", ["Gold", "Blue"].includes(r1.core.winner)
  && r1.core.teamAStats.length === 5 && !!r1.core.mvp && !!r1.fallbackSummary && r1.v3.fullBox.gold.length === 5);
gate("record carries candidate identity", r1.candidate.coreHash === lock.coreHash && !!r1.fingerprint);

// Seals + suites
const logLines = (p) => { try { return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).length; } catch { return 0; } };
gate("V6 access log unchanged (1 formal read)", logLines("data/calibration/historical-holdout-v6-access-log.jsonl") === 1);
gate("Synthetic V2 never accessed", logLines("data/calibration/synthetic-stress-holdout-v2-access-log.jsonl") === 0);
const suites = execSync("npm run --silent preview:preflight 2>&1 && npm run --silent preview:security 2>&1", { encoding: "utf8" });
gate("preview preflight + security suites", !/FAIL/.test(suites));

const { writeArtifact } = await import("../../src/v3/calibration/artifacts.js");
writeArtifact("phase6c5-preflight", {
  candidate3LockValid: true,
  previewPackageValid: true,
  productionFallbackValid: true,
  previewDeploymentMayBegin: true,
  candidate: { candidateId: lock.candidateId, parentCandidateId: lock.parentCandidateId,
    coreHash: lock.coreHash, parameterSetHash: lock.parameterSetHash,
    possessionCalibrationVersion: lock.possessionCalibrationVersion, lockedAtCommit: lock.lockedAtCommit },
  deploymentWorkflow: "Vercel Git integration — every pushed branch builds a Preview deployment; production deploys only from main",
  accessControl: { method: "hashed-key allowlist (config/previewAccess.js) enforced by edge middleware on VERCEL_ENV=preview", keyCount: PREVIEW_ACCESS.keys.length },
}, { generationCommand: "node scripts/c5/preflight.mjs", dir: DIR });
console.log("\npreflight artifact written — previewDeploymentMayBegin = true");
