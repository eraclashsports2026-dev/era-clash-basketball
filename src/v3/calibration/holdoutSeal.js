// ── Holdout seal ────────────────────────────────────────────────────────────
// The holdout is only worth having if it is genuinely untouched. Good
// intentions do not enforce that, so access is a deliberate, logged act:
// reading the holdout requires --unlock-holdout and writes an access record.
//
// This is not security — anyone with the repo can edit this file. It is an
// AUDIT TRAIL, so a later reader can tell whether the holdout was consulted
// before tuning, which is exactly the thing that would invalidate it.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export const HOLDOUT_ACCESS_LOG = "data/calibration/holdout-access-log.jsonl";

export class HoldoutSealError extends Error {
  constructor(message) {
    super(message);
    this.name = "HoldoutSealError";
    this.code = "HOLDOUT_SEALED";
  }
}

/**
 * Throws unless the caller explicitly unlocked the holdout. `reason` is
 * required: an access record that does not say why is not an audit trail.
 */
export const requireHoldoutUnlock = ({ argv = process.argv, reason = null, actor = "unknown", log = true } = {}) => {
  if (!argv.includes("--unlock-holdout")) {
    throw new HoldoutSealError(
      "The holdout validation set is sealed. Pass --unlock-holdout to read it.\n" +
        "Before you do: the holdout exists to test whether tuning GENERALISED. " +
        "Looking at it before or during tuning destroys that, permanently, and no " +
        "later result can restore it. Tune against the calibration set instead.",
    );
  }
  if (!reason) throw new HoldoutSealError("--unlock-holdout requires a reason. An unexplained access is not an audit record.");
  const record = {
    // No wall-clock timestamp here: the caller supplies one if it has one, so
    // the log stays reproducible in tests. Ordering in the file is the sequence.
    seq: accessCount() + 1,
    actor,
    reason,
    argv: argv.slice(2).filter((a) => !a.startsWith("--token") && !a.includes("=")),
  };
  if (log) {
    mkdirSync(dirname(HOLDOUT_ACCESS_LOG), { recursive: true });
    appendFileSync(HOLDOUT_ACCESS_LOG, `${JSON.stringify(record)}\n`);
  }
  return record;
};

export const accessCount = () => {
  if (!existsSync(HOLDOUT_ACCESS_LOG)) return 0;
  return readFileSync(HOLDOUT_ACCESS_LOG, "utf8").split("\n").filter((l) => l.trim()).length;
};

export const accessLog = () => {
  if (!existsSync(HOLDOUT_ACCESS_LOG)) return [];
  return readFileSync(HOLDOUT_ACCESS_LOG, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
};

/**
 * The holdout's integrity claim, for the report. A holdout that has been read
 * is not automatically compromised — reading it AFTER tuning is the intended
 * use — but the count belongs in the report either way.
 */
export const sealStatus = () => {
  const n = accessCount();
  return {
    accessCount: n,
    status: n === 0 ? "SEALED_UNREAD" : "UNSEALED",
    integrity: n === 0
      ? "Never read. Any Phase 6C2 tuning result can be honestly validated against it."
      : `Read ${n} time(s). Check the access log before treating a holdout result as independent.`,
  };
};

// ── Phase 6C2B: two new sealed sets ─────────────────────────────────────────
// Separate logs per set, because "was the historical holdout read?" and "was
// the synthetic stress set read?" are different questions with different
// consequences, and one shared counter could not answer either.
export const SEALED_SETS = Object.freeze({
  "historical-holdout-v2": "data/calibration/historical-holdout-v2-access-log.jsonl",
  "synthetic-stress-v1": "data/calibration/synthetic-stress-v1-access-log.jsonl",
  // Phase 6C2C1. Separate logs again, because "was the historical holdout
  // read?" and "was the synthetic stress set read?" remain different questions
  // with different consequences.
  "historical-holdout-v3": "data/calibration/historical-holdout-v3-access-log.jsonl",
  "synthetic-stress-holdout-v2": "data/calibration/synthetic-stress-holdout-v2-access-log.jsonl",
});

/**
 * Throws unless the caller explicitly unlocked THIS set. A normal calibration
 * command must never be able to reach either.
 */
export const requireSetUnlock = (set, { argv = process.argv, reason = null, actor = "unknown", parameterVersion = null, commit = null, log = true } = {}) => {
  const path = SEALED_SETS[set];
  if (!path) throw new HoldoutSealError(`unknown sealed set "${set}"`);
  const flag = `--unlock-${set}`;
  if (!argv.includes(flag)) {
    throw new HoldoutSealError(
      `The ${set} set is sealed. Pass ${flag} to read it.\n` +
        "Before you do: this set exists to test whether tuning GENERALISED. Reading " +
        "it during tuning destroys that permanently, and no later result restores it.",
    );
  }
  if (!reason) throw new HoldoutSealError(`${flag} requires a reason. An unexplained access is not an audit record.`);
  const record = {
    seq: setAccessCount(set) + 1,
    set, actor, reason, parameterVersion, commit,
    argv: argv.slice(2).filter((a) => !a.startsWith("--token") && !a.includes("=")),
  };
  if (log) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`);
  }
  return record;
};

export const setAccessCount = (set) => {
  const path = SEALED_SETS[set];
  if (!path || !existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).length;
};

export const setSealStatus = (set) => {
  const n = setAccessCount(set);
  return {
    set,
    accessCount: n,
    status: n === 0 ? "SEALED_UNREAD" : "UNSEALED",
    integrity: n === 0
      ? "Never read. A Phase 6C3 validation against it is genuinely independent."
      : `Read ${n} time(s). Check the access log before treating a result as independent.`,
  };
};

/** Every sealed set's state, for the report. */
export const allSealStatuses = () => ({
  "legacy-holdout-v1": { ...sealStatus(), set: "legacy-holdout-v1", note: "LEGACY_MIXED_HOLDOUT — preserved unchanged, not reused for formal historical validation." },
  "historical-holdout-v2": { ...setSealStatus("historical-holdout-v2"), note: "INSUFFICIENT_SAMPLE_ARCHIVE — genuinely unread, but three fixtures cannot validate generalisation. Superseded by v3 and archived rather than consumed." },
  // Reported by measurement, not by its counter: 19 of its 25 fixtures were
  // simulated during Phase 6C2A, under their original corpus v1 identities and
  // before this seal existed.
  "synthetic-stress-v1": { ...setSealStatus("synthetic-stress-v1"), status: "PREVIOUSLY_INSPECTED_ARCHIVE", note: "Its counter reads 0 because the seal was created after the simulations. Not a holdout." },
  "historical-holdout-v3": setSealStatus("historical-holdout-v3"),
  "synthetic-stress-holdout-v2": setSealStatus("synthetic-stress-holdout-v2"),
});
