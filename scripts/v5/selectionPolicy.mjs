#!/usr/bin/env node
// ── WS8: the deterministic V5 selection policy ──────────────────────────────
//   npm run v5:selection-policy
//
// Frozen BEFORE the selector runs. The selector may read only source facts —
// eligibility, source completeness, coach completeness, observable-trait
// coverage, target coverage, confidence, tactical and franchise diversity,
// pair type — and a stable hash tie-breaker. It may not read a Candidate 1
// result, and it has no import path to one.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { DIR } from "./preflight6c4b1.mjs";

/** Pair types, most preferred first. A real opponent pairing is better
 *  evidence than a constructed one, but never at the cost of source
 *  completeness or observability — a labelled matchup nobody can score is
 *  worse than an unlabelled one that can be. */
export const PAIR_TYPE_PRIORITY = Object.freeze([
  "ACTUAL_FINALS_OPPONENTS", "ACTUAL_PLAYOFF_OPPONENTS",
  "ACTUAL_REGULAR_SEASON_OPPONENTS", "SAME_ERA_CONTRAST_PAIR", "SAME_FRANCHISE_CONTRAST_PAIR",
]);

/** Tactical dimensions the eight selected pairs should span, where the
 *  eligible pool permits. Only OBSERVABLE traits may count. */
export const DIVERSITY_DIMENSIONS = Object.freeze({
  ELITE_OFFENCE: ["ELITE_OFFENSE"],
  ELITE_DEFENCE: ["ELITE_DEFENSE", "elite team man defence", "elite physical man", "elite team man", "elite scheme-driven man"],
  FAST_PACE: ["very fast", "fast", "PACE_EXTREME", "TRANSITION"],
  SLOW_PACE: ["slow", "very slow", "SLOW_HALF_COURT"],
  INTERIOR_OFFENCE: ["POST_HEAVY", "SIZE_HEAVY"],
  MOVEMENT_OFFENCE: ["MOTION"],
  TRANSITION_OFFENCE: ["TRANSITION"],
  BALL_MOVEMENT: ["PASSING_HUB"],
  PICK_AND_ROLL: ["PICK_AND_ROLL"],
  OFFENSIVE_REBOUNDING: ["STRONG_OFFENSIVE_REBOUNDING"],
  ZONE_SCHEME: ["ZONE_CAPABLE"],
});

/** Weights, frozen. Every term is a source fact or a diversity credit. */
export const SCORING = Object.freeze({
  observableTraitUnion: 3.0,     // how much of the matchup is actually scorable
  bothTeamsObservable: 4.0,      // both sides must carry an observable claim
  targetCoverage: 1.0,           // share targets available per team
  sourceConfidence: 2.0,         // MEDIUM_HIGH > MEDIUM > LOW, per team
  crossFranchise: 2.0,           // two different franchises read as a matchup
  pairTypeRank: 3.0,             // priority index above, higher for better types
  diversityCredit: 5.0,          // dimensions this pair adds that the set still lacks
  tieBreaker: "sha256(pairId + poolHash), lexicographic — stable under input reorder",
});

export const CONSTRAINTS = Object.freeze({
  matchups: 8, distinctTeams: 16, oneMatchupPerEraStyle: true,
  noTeamTwice: true, noFiveTwice: true,
  everyMatchupNeedsAnObservableTraitOnBothSides: true,
  candidateOutputsAllowed: 0,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("historical-v5-selection", DIR)) {
    throw new Error("REFUSED: a selection already exists. The policy is frozen before selection, never after.");
  }
  const pool = readArtifact("historical-v5-candidate-pool-v2", DIR);
  const payload = {
    historicalV5SelectionVersion: VALIDATION_VERSIONS.historicalV5SelectionVersion,
    frozenBeforeSelection: true,
    poolArtifact: "historical-v5-candidate-pool-v2",
    poolHash: pool.data.poolHash,
    poolArtifactHash: pool.outputHash,
    permittedInputs: ["eligibility", "source completeness", "coach completeness", "observable-trait coverage",
      "target coverage", "player-data confidence", "tactical diversity", "franchise diversity", "pair type",
      "stable hash tie-breaker"],
    forbiddenInputs: ["Candidate 1 game results", "Candidate 1 probabilities", "Candidate 1 trait scores",
      "Candidate 1 points per possession", "Candidate 1 opportunity errors", "Candidate 1 win rates"],
    pairTypePriority: PAIR_TYPE_PRIORITY,
    diversityDimensions: DIVERSITY_DIMENSIONS,
    scoring: SCORING,
    constraints: CONSTRAINTS,
    algorithm: [
      "1. Read the eligible pairs from the pool artifact. Sort them by pairId so the input order cannot matter.",
      "2. Score every pair on the frozen terms above. Diversity credit is evaluated against the dimensions the partial selection still lacks, so it depends on the order eras are filled — step 3 fixes that order.",
      "3. Fill era styles in a FROZEN order (chronological), one matchup each. Chronological is chosen because it is a property of the data, not of any result.",
      "4. Within an era, take the highest-scoring pair whose teams are unused. Break ties on sha256(pairId + poolHash), lexicographically smallest.",
      "5. Record every rejected alternative with its score and the reason the winner beat it.",
      "6. Refuse to emit a selection that violates any constraint, rather than repairing it by hand.",
    ],
    determinism: {
      inputReorderInvariant: "pairs are sorted by pairId before scoring",
      repeatedExecutionInvariant: "no randomness; the tie-breaker is a content hash",
      manualSubstitutionForbidden: "a selected pair may not be replaced after the output is seen; a defect is fixed in the pool or the policy, with a version bump, and the selector re-run",
    },
  };
  const policyHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  writeArtifact("historical-v5-selection-policy", { ...payload, policyHash, frozen: true }, {
    generationCommand: "npm run v5:selection-policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`V5 SELECTION POLICY FROZEN · hash ${policyHash.slice(0, 16)}... · pool ${pool.data.poolHash.slice(0, 16)}...`);
  console.log(`  ${pool.data.eligiblePairCount} eligible pairs across ${pool.data.erasWithAtLeastTwoEligiblePairs} eras with 2+ pairs`);
}
