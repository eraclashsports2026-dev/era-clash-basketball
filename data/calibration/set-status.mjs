// ── Calibration set status reconciliation ───────────────────────────────────
// What every prior set actually IS, and what may be done with it.
//
// Phase 6C2B described three sets as sealed. Measurement shows one of them was
// not: 19 of the 25 fixtures in synthetic stress v1 have their simulated output
// sitting in committed Phase 6C2A artefacts. Its access counter read zero only
// because those fixtures were simulated under their original corpus v1
// identities, before the set existed — the seal never guarded them.
//
// A set whose outputs engineering has already read is not a holdout, whatever
// its counter says. Calling it one would let a later phase claim independent
// validation it never had.
import { versionOf } from "../../src/versions.js";

export const ACCESS_POLICIES = Object.freeze({
  SEALED_UNREAD: "Never simulated. May be opened once, deliberately, for formal validation.",
  AVAILABLE_FOR_DIAGNOSTICS: "May be simulated freely for diagnosis. Must never be called a holdout.",
  AVAILABLE_FOR_DEVELOPMENT: "May be simulated freely during development and used as a tuning guardrail.",
  AVAILABLE_FOR_TUNING: "May be used to fit parameters.",
  PREVIOUSLY_INSPECTED_ARCHIVE: "Its outputs have already been read. It cannot serve as a holdout and is preserved for the record only.",
  FROZEN_ARCHIVE: "Preserved unchanged as part of the development record. Not used for new work.",
});

/**
 * Every set that existed before this phase, with the status the evidence
 * supports rather than the one the last report asserted.
 */
export const SET_STATUS = Object.freeze({
  legacyHoldoutV1: {
    setId: "legacy-holdout-v1",
    version: "1.0.0",
    fixtures: 7,
    classification: "LEGACY_MIXED_HOLDOUT",
    accessPolicy: "SEALED_UNREAD",
    comparisonAccessCount: 0,
    previouslySimulated: false,
    evidence: "No member appears in any committed or cached simulation artefact from Phase 6C2A or 6C2B.",
    why: "Mixes historical and synthetic fixtures under labels that overstated them, so it cannot serve as formal historical validation — but it is genuinely unread, and overwriting it would destroy something that cannot be recreated.",
    usableAsFormalHoldout: false,
  },
  historicalCorpusV2: {
    setId: "historical-corpus-v2",
    version: "2.0.0",
    fixtures: 10,
    classification: "LIMITED_HISTORICAL_SANITY_SET",
    accessPolicy: "AVAILABLE_FOR_DIAGNOSTICS",
    comparisonAccessCount: null,
    previouslySimulated: true,
    evidence: "Used for probability reliability measurement in Phase 6C2B.",
    why: "Ten source-valid fixtures across four eras and three franchises. Enough to sanity-check, not enough to tune.",
    usableAsFormalHoldout: false,
  },
  historicalCalibrationV2: {
    setId: "historical-calibration-v2",
    version: "2.0.0",
    fixtures: 7,
    classification: "INSUFFICIENT_FOR_TUNING",
    accessPolicy: "AVAILABLE_FOR_DIAGNOSTICS",
    comparisonAccessCount: null,
    previouslySimulated: true,
    evidence: "Simulated during Phase 6C2B probability reliability measurement.",
    why: "Seven fixtures from two franchises across three eras. Tuning against it would fit the Celtics and the Lakers, and the smallest internal fold held one fixture.",
    usableAsFormalHoldout: false,
  },
  historicalHoldoutV2: {
    setId: "historical-holdout-v2",
    version: "2.0.0",
    fixtures: 3,
    classification: "INSUFFICIENT_SAMPLE_ARCHIVE",
    accessPolicy: "SEALED_UNREAD",
    comparisonAccessCount: 0,
    previouslySimulated: false,
    evidence: "No member appears in any simulation artefact. Genuinely unread.",
    why: "Correctly sealed, but three fixtures cannot validate generalisation. Superseded by historical holdout v3 and archived unread rather than consumed.",
    usableAsFormalHoldout: false,
  },
  syntheticStressV1: {
    setId: "synthetic-stress-v1",
    version: "1.0.0",
    fixtures: 25,
    // The correction. This was reported as SEALED_UNREAD and was not.
    classification: "PREVIOUSLY_INSPECTED_ARCHIVE",
    accessPolicy: "PREVIOUSLY_INSPECTED_ARCHIVE",
    comparisonAccessCount: 0,
    previouslySimulated: true,
    evidence: "19 of 25 members have simulated output in committed Phase 6C2A artefacts: the zone matrix, coach matrix, field-goal decomposition, player tails, and both structural baselines.",
    why: "Its members are the reclassified corpus v1 fixtures, which were simulated extensively BEFORE this set was defined. The seal counter read zero because the seal was created afterwards and never guarded them. A set whose outputs have been read cannot validate anything independently.",
    usableAsFormalHoldout: false,
    correctsPriorReport: "Phase 6C2B reported this set as SEALED_UNREAD. That was wrong, and a later phase relying on it would have claimed independence it never had.",
  },
});

export const setStatus = (key) => {
  const s = SET_STATUS[key];
  if (!s) throw new Error(`setStatus: unknown set "${key}"`);
  return s;
};

/** Sets that may legitimately serve as a formal holdout. */
export const formalHoldoutCandidates = () =>
  Object.entries(SET_STATUS).filter(([, s]) => s.usableAsFormalHoldout).map(([k]) => k);

/** Sets whose outputs have been read, and therefore cannot validate anything. */
export const inspectedSets = () =>
  Object.entries(SET_STATUS).filter(([, s]) => s.previouslySimulated).map(([k]) => k);

/**
 * A status is only coherent if the policy matches the evidence. Claiming
 * SEALED_UNREAD for a set that has been simulated is exactly the error this
 * reconciliation exists to catch.
 */
export const statusInconsistencies = () => {
  const errs = [];
  for (const [key, s] of Object.entries(SET_STATUS)) {
    if (!(s.accessPolicy in ACCESS_POLICIES)) errs.push(`${key}: unknown access policy "${s.accessPolicy}"`);
    if (s.accessPolicy === "SEALED_UNREAD" && s.previouslySimulated) {
      errs.push(`${key}: claims SEALED_UNREAD but has been simulated`);
    }
    if (s.usableAsFormalHoldout && s.previouslySimulated) {
      errs.push(`${key}: cannot be a formal holdout after its outputs were read`);
    }
    if (!s.evidence) errs.push(`${key}: status asserted with no evidence`);
  }
  return errs;
};

export const reconciliation = () => ({
  fixtureSourceRegistryVersion: versionOf("fixtureSourceRegistryVersion"),
  sets: SET_STATUS,
  inconsistencies: statusInconsistencies(),
  formalHoldoutCandidates: formalHoldoutCandidates(),
  note: "No prior set qualifies as a formal holdout for Phase 6C3. Historical holdout v3 and synthetic stress holdout v2 are created fresh for that purpose.",
});
