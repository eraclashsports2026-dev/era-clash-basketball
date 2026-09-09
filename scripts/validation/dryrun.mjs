#!/usr/bin/env node
// ── Holdout pipeline dry run, on a MOCK sealed set ──────────────────────────
//   npm run validation:dryrun
//
// Exercises every path the real run will take — seal refusal, explicit unlock,
// access logging, incremental writing, crash recovery, resume under the same
// event, refusal of a second run, artifact reconciliation — using NON-holdout
// development fixtures under a disposable log.
//
// A pipeline first exercised on the real thing has been tested once, on the one
// dataset that cannot be re-run.
import { existsSync, rmSync, readFileSync } from "node:fs";
import { writeArtifact, ARTIFACT_DIR_6C3 } from "../../src/v3/calibration/artifacts.js";
import { runSealedSetOnce, mockSeal, RunRefused, RUN_STATES } from "./runner.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";

const LOG = ".cache/validation/mock-sealed-access-log.jsonl";
const RUN = ".cache/validation/mock-sealed-run.json";

if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); };

  for (const p of [LOG, RUN]) if (existsSync(p)) rmSync(p);

  // Mock members: real development fixtures, never a holdout id.
  const sealedIds = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const members = historicalCalibrationV3Ids().slice(0, 4);
  const contaminated = members.filter((m) => sealedIds.has(m));
  check("mockMembersAreNotHoldoutFixtures", contaminated.length === 0,
    contaminated.length ? `CONTAMINATED: ${contaminated.join(", ")}` : `${members.length} development fixtures: ${members.join(", ")}`);

  const identity = { candidate: "mock-candidate", core: "mock-core", policy: "mock-policy", holdout: "mock-holdout" };
  const seal = mockSeal("mock-sealed", LOG);

  console.log("\nDRY RUN — MOCK SEALED SET\n");

  // 1. sealed by default
  let refused = null;
  try {
    runSealedSetOnce({ seal, identity, members, runPath: RUN, reason: "dry run", actor: "dryrun", evaluate: () => ({}) });
  } catch (e) { refused = e; }
  check("sealedWithoutExplicitUnlock", refused?.code === "MOCK_SEALED", refused ? refused.message.split("\n")[0] : "NOT REFUSED");
  check("accessCountStillZeroAfterRefusal", seal.accessCount() === 0, `access count ${seal.accessCount()}`);

  // 2. unlock and run, with a crash injected midway
  process.argv.push("--unlock-mock-sealed");
  let crashed = null;
  try {
    runSealedSetOnce({ seal, identity, members, runPath: RUN, reason: "dry run", actor: "dryrun",
      evaluate: (id, i) => { if (i === 2) throw new Error("injected crash"); return { fixtureId: id, ok: true }; } });
  } catch (e) { crashed = e; }
  check("crashPropagatesRatherThanSilentlyPassing", crashed?.message === "injected crash", crashed?.message ?? "no crash");
  const partial = JSON.parse(readFileSync(RUN, "utf8"));
  check("accessEventCreatedExactlyOnce", seal.accessCount() === 1, `access count ${seal.accessCount()}`);
  check("statusIsRunningAfterCrash", partial.status === RUN_STATES.RUNNING, `status ${partial.status}`);
  check("partialResultsWrittenIncrementally", partial.results.length === 2 && partial.completedMembers.length === 2,
    `${partial.results.length} of ${members.length} members written before the crash`);
  check("crashAfterUnlockConsumesTheAccessEvent", partial.accessCountAfter === 1,
    "the set has been seen whether or not the process finished, so the event counts");

  // 3. a fresh run is refused
  let second = null;
  try {
    runSealedSetOnce({ seal, identity, members, runPath: RUN, reason: "second try", actor: "dryrun", evaluate: () => ({}) });
  } catch (e) { second = e; }
  check("secondIndependentRunRefused", second?.code === "SECOND_RUN_REFUSED", second?.message.split("\n")[0] ?? "NOT REFUSED");

  // 4. resume with a mismatched identity is refused
  let mismatch = null;
  try {
    runSealedSetOnce({ seal, identity: { ...identity, core: "TAMPERED" }, members, runPath: RUN,
      reason: "resume", actor: "dryrun", resume: true, evaluate: () => ({}) });
  } catch (e) { mismatch = e; }
  check("resumeWithChangedCoreRefused", mismatch?.code === "IDENTITY_MISMATCH", mismatch?.message.split("\n")[0] ?? "NOT REFUSED");

  // 5. legitimate resume completes, without a second access event
  const resumed = runSealedSetOnce({ seal, identity, members, runPath: RUN, reason: "resume", actor: "dryrun",
    resume: true, evaluate: (id) => ({ fixtureId: id, ok: true }) });
  check("resumeCompletesUnderTheSameAccessEvent", resumed.status === RUN_STATES.COMPLETE && seal.accessCount() === 1,
    `status ${resumed.status}, access count ${seal.accessCount()}`);
  check("resumeDidNotRepeatCompletedMembers", resumed.results.length === members.length,
    `${resumed.results.length} results for ${members.length} members — no duplicates`);
  check("everyMemberEvaluatedExactlyOnce",
    new Set(resumed.completedMembers).size === members.length && resumed.completedMembers.length === members.length,
    `${resumed.completedMembers.length} completed, ${new Set(resumed.completedMembers).size} distinct`);
  check("runHashPresentOnCompletion", typeof resumed.runHash === "string" && resumed.runHash.length === 64, resumed.runHash);

  // 6. resuming a COMPLETE run is refused
  let done = null;
  try {
    runSealedSetOnce({ seal, identity, members, runPath: RUN, reason: "again", actor: "dryrun", resume: true, evaluate: () => ({}) });
  } catch (e) { done = e; }
  check("resumingACompletedRunRefused", done?.code === "ALREADY_COMPLETE", done?.message ?? "NOT REFUSED");

  // 7. the real seals are untouched throughout
  const hAccess = setAccessCount("historical-holdout-v3");
  const sAccess = setAccessCount("synthetic-stress-holdout-v2");
  check("realHistoricalHoldoutStillSealed", hAccess === 0, `access count ${hAccess}`);
  check("realSyntheticHoldoutStillSealed", sAccess === 0, `access count ${sAccess}`);

  for (const p of [LOG, RUN]) if (existsSync(p)) rmSync(p);
  check("mockArtifactsDisposed", !existsSync(LOG) && !existsSync(RUN), "mock log and run state removed");

  const pass = checks.every((c) => c.pass);
  const { path } = writeArtifact("holdout-pipeline-dryrun", {
    formalHoldoutRunVersion: versionOf("formalHoldoutRunVersion"),
    mockMembers: members,
    mockMembersAreHoldoutFixtures: false,
    checks, checksPassed: checks.filter((c) => c.pass).length, checksTotal: checks.length,
    realSealsUntouched: { historicalHoldoutV3: hAccess, syntheticStressHoldoutV2: sAccess },
    allPass: pass,
    purpose: "Every path the real run takes, exercised on a disposable mock set. A pipeline first exercised on the real holdout has been tested once, on the one dataset that cannot be re-run.",
  }, {
    generationCommand: "npm run validation:dryrun",
    sourceArtifacts: [],
    extra: {},
    dir: ARTIFACT_DIR_6C3,
  });
  console.log(`\n  ${checks.filter((c) => c.pass).length}/${checks.length} checks pass`);
  console.log(`  DRY RUN ${pass ? "PASSED" : "FAILED"}`);
  console.log(`\nwrote ${path}`);
  process.exit(pass ? 0 : 2);
}
