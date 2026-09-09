// ── Transactional sealed-set runner ─────────────────────────────────────────
//
// A holdout can be opened once. That makes the run a transaction, not a script:
// a crash after the unlock has already consumed the access event, because the
// set has been seen whether or not the process finished. So the runner writes
// incrementally, resumes under the SAME access event, and refuses to start a
// second one.
//
// The seal adapter is injected so the dry run can exercise every path on a mock
// set without touching a real one.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const RUN_STATES = Object.freeze({ RUNNING: "RUNNING", COMPLETE: "COMPLETE" });
export const RUN_OUTCOMES = Object.freeze({ PASS: "PASS", FAIL: "FAIL", INVALID_RUN: "INVALID_RUN" });

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`); };

export class RunRefused extends Error {
  constructor(message, code) { super(message); this.name = "RunRefused"; this.code = code; }
}

/**
 * Run a sealed set exactly once, resumably.
 *
 * @param seal      { accessCount(), unlock({reason, actor}), name }
 * @param identity  hashes that must match on resume: candidate, core, policy, holdout
 * @param members   fixture ids to evaluate, in a fixed order
 * @param evaluate  (memberId, index) => result object
 * @param runPath   where the incremental run state lives
 */
export const runSealedSetOnce = ({ seal, identity, members, evaluate, runPath, reason, actor, resume = false }) => {
  const priorAccess = seal.accessCount();
  const existing = existsSync(runPath) ? readJson(runPath) : null;

  // ── refuse a second, independent run ─────────────────────────────────────
  if (priorAccess > 0 && !resume) {
    throw new RunRefused(
      `${seal.name} has already been opened (access count ${priorAccess}). A sealed set is opened ONCE.\n` +
      (existing?.status === RUN_STATES.RUNNING
        ? "A RUNNING run exists. Pass --resume to continue the SAME access event. Do not start a fresh run."
        : "A completed run exists. Its result stands. A second run would not be independent evidence."),
      "SECOND_RUN_REFUSED");
  }
  if (resume) {
    if (!existing) throw new RunRefused(`--resume given but no run state at ${runPath}`, "NOTHING_TO_RESUME");
    if (existing.status === RUN_STATES.COMPLETE) throw new RunRefused(`${seal.name} run is already COMPLETE. Nothing to resume.`, "ALREADY_COMPLETE");
    if (priorAccess !== 1) throw new RunRefused(`resume expects exactly one access event, found ${priorAccess}`, "ACCESS_COUNT_UNEXPECTED");
    for (const k of Object.keys(identity)) {
      if (existing.identity[k] !== identity[k]) {
        throw new RunRefused(
          `resume identity mismatch on ${k}: run recorded ${existing.identity[k]}, current ${identity[k]}. ` +
          "A resume must continue the same candidate, core, policy and holdout. This is an INVALID_RUN.",
          "IDENTITY_MISMATCH");
      }
    }
  }

  // ── one access event ─────────────────────────────────────────────────────
  let accessEvent = existing?.accessEvent ?? null;
  if (!resume) {
    accessEvent = seal.unlock({ reason, actor });
    accessEvent = { ...accessEvent, openedAtCommit: git("rev-parse", "HEAD") };
  }
  const afterAccess = seal.accessCount();

  const state = existing && resume ? existing : {
    set: seal.name, status: RUN_STATES.RUNNING,
    identity, accessEvent,
    accessCountBefore: priorAccess, accessCountAfter: afterAccess,
    members, memberCount: members.length,
    results: [], completedMembers: [],
  };
  state.status = RUN_STATES.RUNNING;
  writeJson(runPath, state);

  const done = new Set(state.completedMembers);
  for (const [i, id] of members.entries()) {
    if (done.has(id)) continue;
    const result = evaluate(id, i);
    state.results.push(result);
    state.completedMembers.push(id);
    // Written after EVERY member, so a crash loses at most one fixture's work
    // and the resume knows exactly where it stopped.
    writeJson(runPath, state);
  }

  state.status = RUN_STATES.COMPLETE;
  state.completedAtCommit = git("rev-parse", "HEAD");
  state.runHash = createHash("sha256").update(JSON.stringify({ identity, results: state.results })).digest("hex");
  writeJson(runPath, state);
  return state;
};

/** A seal adapter over the real per-set access log. */
export const realSeal = async (setName) => {
  const { setAccessCount, requireSetUnlock } = await import("../../src/v3/calibration/holdoutSeal.js");
  return {
    name: setName,
    accessCount: () => setAccessCount(setName),
    unlock: ({ reason, actor }) => requireSetUnlock(setName, { reason, actor, argv: process.argv }),
  };
};

/** A seal adapter over a disposable log, for the dry run. */
export const mockSeal = (name, logPath) => ({
  name,
  accessCount: () => (existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim()).length : 0),
  unlock: ({ reason, actor }) => {
    if (!process.argv.includes(`--unlock-${name}`)) {
      throw new RunRefused(`The ${name} set is sealed. Pass --unlock-${name} to read it.`, "MOCK_SEALED");
    }
    if (!reason) throw new RunRefused("unlock requires a reason", "NO_REASON");
    const rec = { seq: 1, set: name, actor, reason };
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, `${JSON.stringify(rec)}\n`, { flag: "a" });
    return rec;
  },
});
