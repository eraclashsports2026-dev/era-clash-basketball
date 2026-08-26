import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  POLICY, policyHash, POLICY_VERSIONS, SIDE_SYMMETRY, TIER_B_COVERAGE,
  INDEPENDENT_SOURCE, IDENTIFIABILITY, CALIBRATION, PROBABILITY, HOLDOUT,
  PRIVATE_PREVIEW, PRODUCTION, EVIDENCE_STATES,
} from "../src/v3/calibration/acceptancePolicy.js";
import { versionOf, VERSION_STATUS } from "../src/versions.js";
import { buildFreeze, FROZEN_ARTIFACTS, FREEZE_PATH, APPROVED_CORRECTIONS } from "../scripts/calibration/freeze-precalibration.mjs";

// The hash of the policy as frozen in Workstream 0, before any 6C2C2
// experiment ran. If this test fails, a threshold moved — which is allowed only
// with a policy version bump and a recorded justification.
const FROZEN_POLICY_HASH = "a3583d6ada42d61ff9ee40322d999154250613ba94a2cd6f073e2196315919b0";

describe("frozen acceptance policy", () => {
  it("has not changed since it was frozen", () => {
    expect(policyHash(), [
      "The Phase 6C2C2 acceptance policy changed.",
      "This is allowed ONLY with: a policy version bump, the old and new values",
      "recorded, a justification valid independent of the result that prompted it,",
      "and a re-run of every stage the threshold governs.",
      "If you did all four, update FROZEN_POLICY_HASH and say so in the commit.",
    ].join("\n")).toBe(FROZEN_POLICY_HASH);
  });

  it("declares itself frozen before results exist", () => {
    expect(POLICY.frozenBeforeResults).toBe(true);
    expect(POLICY.phase).toBe("6C2C2");
  });

  // Phase 6C2C4 deliberately superseded four of the domains this policy pinned.
  // The 6C2C2 policy file is NOT rewritten — its hash is asserted above, and
  // editing it would erase the record of what 6C2C2 was judged against. The
  // supersession is recorded here instead, with the reason.
  const SUPERSEDED_IN_6C2C4 = {
    parameterIdentifiabilityVersion: { was: "1.0.0", now: "2.0.0", why: "v1 tested max|t| over ~32 metrics against a threshold below its own null median. v2 uses declared metric families with family-wise control." },
    internalCalibrationFoldVersion: { was: "2.0.0", now: "3.0.0", why: "Folds rebuilt with leakage grouping for scoped calibration." },
    calibrationObjectiveVersion: { was: "2.0.0", now: "3.0.0", why: "Objective restructured for the scoped-calibration search." },
    probabilityValidationVersion: { was: "1.0.0", now: "2.0.0", why: "Fresh validation seed block, so a candidate is not judged on the seeds its predecessor was measured against." },
  };

  it("registers every policy version, or records why it was superseded", () => {
    for (const [k, v] of Object.entries(POLICY_VERSIONS)) {
      const sup = SUPERSEDED_IN_6C2C4[k];
      if (!sup) {
        expect(versionOf(k), `${k} must exist in src/versions.js`).toBe(v);
        continue;
      }
      // The policy recorded what this domain was at 6C2C2...
      expect(sup.was, `${k} supersession must record the 6C2C2 value`).toBe(v);
      // ...and the registry must now hold the declared successor.
      expect(versionOf(k), `${k} must hold its declared successor`).toBe(sup.now);
      expect(sup.why.length, `${k} supersession needs a reason`).toBeGreaterThan(40);
    }
  });

  it("keeps possessionCalibrationVersion null until internal gates pass", () => {
    expect(versionOf("possessionCalibrationVersion")).toBeNull();
  });

  it("provides the calibration lifecycle statuses without inventing a version bump", () => {
    for (const s of ["DEVELOPMENT_LOCKED", "HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "HOLDOUT_FAILED"]) {
      expect(VERSION_STATUS[s]).toBe(s);
    }
  });
});

describe("side-symmetry policy", () => {
  it("separates aggregate equivalence from per-cell noise", () => {
    expect(SIDE_SYMMETRY.maxAggregateGoldAdvantagePp).toBe(0.5);
    expect(SIDE_SYMMETRY.aggregateCiMustFitWithinPp).toBe(1.0);
    // A per-cell flag must be looser than the aggregate gate, or every run
    // fails on noise in one cell.
    expect(SIDE_SYMMETRY.perCellPracticalEffectPp).toBeGreaterThan(SIDE_SYMMETRY.maxAggregateGoldAdvantagePp);
  });

  it("controls for multiple comparisons and for systematic direction", () => {
    expect(SIDE_SYMMETRY.perCellMultipleComparisonControl).toBe("benjamini-hochberg");
    expect(SIDE_SYMMETRY.maxSystematicTStatistic).toBe(2.0);
    expect(SIDE_SYMMETRY.maxSameDirectionCellFraction).toBeLessThan(1.0);
  });

  it("demands a sample large enough to resolve the effect it gates on", () => {
    // Aggregate gate is 0.5pp; the standard error at the required sample must
    // be well below that or the gate is unmeasurable.
    const se = Math.sqrt(0.25 / SIDE_SYMMETRY.minPairedGamesAggregate) * 100;
    expect(se).toBeLessThan(SIDE_SYMMETRY.maxAggregateGoldAdvantagePp / 2);
    expect(SIDE_SYMMETRY.minPairedGamesPerMajorCell).toBeGreaterThanOrEqual(5000);
  });

  it("records that it is sampling-error aware, unlike the 6C2C1 precedent", () => {
    expect(SIDE_SYMMETRY.samplingErrorAware).toBe(true);
  });
});

describe("data gates refuse fabrication", () => {
  it("forbids zero as a stand-in for a missing target", () => {
    expect(TIER_B_COVERAGE.forbidZeroForMissing).toBe(true);
    expect(TIER_B_COVERAGE.maxUnjustifiedMissingFields).toBe(0);
    expect(TIER_B_COVERAGE.maxUnprovenancedValues).toBe(0);
    expect(TIER_B_COVERAGE.maxUnauthorizedSourceValues).toBe(0);
  });

  it("forbids deriving a metric from incomplete inputs", () => {
    expect(TIER_B_COVERAGE.requireCompleteInputsForDerivation).toBe(true);
  });

  it("requires the holdout be enriched without being simulated", () => {
    expect(TIER_B_COVERAGE.requireHoldoutEnrichedBlind).toBe(true);
    expect(TIER_B_COVERAGE.maxHoldoutSimulationAccessDuringEnrichment).toBe(0);
  });

  it("rejects a mirror as an independent second source", () => {
    expect(INDEPENDENT_SOURCE.requireEditoriallyIndependentPublisher).toBe(true);
    expect(INDEPENDENT_SOURCE.forbidUnattributedMirror).toBe(true);
  });

  it("forbids resolving a source disagreement toward better model fit", () => {
    expect(INDEPENDENT_SOURCE.forbidFitDirectedResolution).toBe(true);
    expect(INDEPENDENT_SOURCE.forbidSilentAveraging).toBe(true);
  });

  it("requires complete independent verification of every holdout fixture", () => {
    const h = INDEPENDENT_SOURCE.historicalHoldout;
    expect(h.fixtureRostersVerified).toBe(h.ofTotal);
    expect(h.coachSeasonsVerified).toBe(h.ofTotal);
    expect(h.coreTierARowsVerifiedFraction).toBe(1.0);
  });
});

describe("identifiability policy", () => {
  it("requires signal well above simulation noise before tuning", () => {
    expect(IDENTIFIABILITY.identifiableMinSnr).toBeGreaterThanOrEqual(3.0);
    expect(IDENTIFIABILITY.weaklyIdentifiableMinSnr).toBeGreaterThanOrEqual(2.0);
    expect(IDENTIFIABILITY.identifiableMinSnr).toBeGreaterThan(IDENTIFIABILITY.weaklyIdentifiableMinSnr);
  });

  it("freezes everything that is not identifiable", () => {
    expect(IDENTIFIABILITY.maxMovementOther).toBe(0);
    expect(IDENTIFIABILITY.maxMovementWeaklyIdentifiable).toBeLessThan(0.25);
    expect(IDENTIFIABILITY.forbidTuningUnsupported).toBe(true);
    expect(IDENTIFIABILITY.forbidTuningConfoundedTogether).toBe(true);
  });

  it("forbids reclassifying to enlarge the tunable set", () => {
    expect(IDENTIFIABILITY.forbidReclassificationToEnlargeTunableSet).toBe(true);
    expect(IDENTIFIABILITY.requireEveryParameterClassified).toBe(true);
  });

  it("covers every category the classification can produce", () => {
    expect(IDENTIFIABILITY.categories).toHaveLength(6);
    expect(IDENTIFIABILITY.categories).toContain("CONFOUNDED");
    expect(IDENTIFIABILITY.categories).toContain("NO_MEASURABLE_EFFECT");
  });
});

describe("calibration acceptance", () => {
  it("refuses a single opaque score", () => {
    expect(CALIBRATION.forbidCollapsingToSingleOpaqueScore).toBe(true);
    expect(CALIBRATION.requireAllComponentsReported).toBe(true);
    expect(CALIBRATION.components.length).toBeGreaterThanOrEqual(11);
  });

  it("rejects a candidate that improves only the tuning fold", () => {
    expect(CALIBRATION.requireTuningObjectiveImprovement).toBe(true);
    expect(CALIBRATION.maxInternalValidationRelativeDegradation).toBeLessThanOrEqual(0.01);
  });

  it("keeps formal holdouts out of the folds", () => {
    expect(CALIBRATION.forbidHoldoutInFolds).toBe(true);
    expect(CALIBRATION.freezeFoldMembershipBeforeTuning).toBe(true);
  });

  it("forbids per-player and per-team exceptions", () => {
    expect(CALIBRATION.forbidPlayerSpecificExceptions).toBe(true);
    expect(CALIBRATION.forbidTeamSpecificExceptions).toBe(true);
  });
});

describe("probability policy", () => {
  it("pins the baselines it will be judged against", () => {
    expect(PROBABILITY.analyticalBaselineBrier).toBe(0.2507);
    expect(PROBABILITY.constantBaselineBrier).toBe(0.25);
    expect(PROBABILITY.preCalibrationMonteCarloBrier).toBe(0.2195);
  });

  it("forbids comparing Brier scores across scales", () => {
    expect(PROBABILITY.forbidCrossScaleBrierComparison).toBe(true);
  });

  it("requires the seed domains stay disjoint", () => {
    expect(PROBABILITY.requirePredictionSeedsDisjointFromActualGame).toBe(true);
    expect(PROBABILITY.requirePredictionSeedsDisjointFromValidation).toBe(true);
  });
});

describe("holdout policy", () => {
  it("permits exactly one opening per set", () => {
    expect(HOLDOUT.maxOpeningsPerSet).toBe(1);
    expect(HOLDOUT.forbidAnyParameterChangeAfterOpening).toBe(true);
    expect(HOLDOUT.requireLockCommitPushedBeforeOpening).toBe(true);
  });

  it("sets a degradation ratio that a fitted calibration would exceed", () => {
    expect(HOLDOUT.maxHoldoutToInternalCompositeRatio).toBeGreaterThan(1.0);
    expect(HOLDOUT.maxHoldoutToInternalCompositeRatio).toBeLessThanOrEqual(2.0);
  });

  it("names the consequence of failure before any holdout is opened", () => {
    expect(HOLDOUT.onFailure).toMatch(/HOLDOUT_FAILED/);
    expect(HOLDOUT.onFailure).toMatch(/[Dd]o not retune/);
    expect(HOLDOUT.onFailure).toMatch(/new unseen holdout/);
  });

  it("bounds shell win rates so no shell can dominate universally", () => {
    const g = HOLDOUT.syntheticGuardrails;
    expect(g.maxSingleShellWinRate).toBeLessThan(0.7);
    expect(g.minSingleShellWinRate).toBeGreaterThan(0.3);
    expect(g.maxSingleShellWinRate + g.minSingleShellWinRate).toBeCloseTo(1.0, 6);
    expect(g.requireConstructionCanBeatHigherOvr).toBe(true);
    expect(g.requireExtremeTalentRemainsMeaningful).toBe(true);
  });
});

describe("preview and production policy", () => {
  it("cannot simulate human review", () => {
    expect(PRIVATE_PREVIEW.requireRealHumanReview).toBe(true);
    expect(PRIVATE_PREVIEW.forbidFabricatedReviewerResponses).toBe(true);
    expect(PRIVATE_PREVIEW.humanReviewBlocksProduction).toBe(true);
  });

  it("requires explicit CEO approval and forbids inferring it", () => {
    expect(PRODUCTION.requireExplicitCeoApproval).toBe(true);
    expect(PRODUCTION.approvalPhrase).toBe("GO LIVE");
    expect(PRODUCTION.forbidInferredApproval).toBe(true);
    expect(PRODUCTION.forbidSelfApproval).toBe(true);
  });

  it("keeps the rollout staged, reversible and unmixed", () => {
    expect(PRODUCTION.stages.length).toBeGreaterThanOrEqual(9);
    expect(PRODUCTION.forbidSkippingToFullRollout).toBe(true);
    expect(PRODUCTION.forbidMixedEnginesWithinCompetitionObject).toBe(true);
    expect(PRODUCTION.requireRollbackTestedBeforeActivation).toBe(true);
    expect(PRODUCTION.requireFallbackEngineRetained).toBe("3.2.0");
  });

  it("forbids claiming a watch window that was not observed", () => {
    expect(PRODUCTION.forbidClaimingUnobservedWatchWindow).toBe(true);
  });
});

describe("evidence vocabulary", () => {
  it("keeps the states distinct so a report cannot blur them", () => {
    expect(EVIDENCE_STATES).toContain("BLOCKED");
    expect(EVIDENCE_STATES).toContain("MEASURED");
    expect(EVIDENCE_STATES).toContain("HOLDOUT_VALIDATED");
    expect(EVIDENCE_STATES).toContain("PARTIALLY_ACTIVE");
    expect(new Set(EVIDENCE_STATES).size).toBe(EVIDENCE_STATES.length);
  });
});

describe("pre-calibration artefact freeze", () => {
  it("recorded a freeze before the phase began", () => {
    expect(existsSync(FREEZE_PATH)).toBe(true);
    const f = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    expect(f.phase).toBe("6C2C2");
    expect(f.acceptancePolicyHash).toBe(FROZEN_POLICY_HASH);
    expect(f.missing).toEqual([]);
  });

  it("covers the corpus, sets, seals, seeds and probability implementation", () => {
    const joined = FROZEN_ARTIFACTS.join(" ");
    for (const needle of ["historical-corpus-v3", "historical-holdout-v3-manifest", "holdoutSeal",
      "seedDomains", "monteCarloProbability", "parameters.js", "source-registry"]) {
      expect(joined).toContain(needle);
    }
  });

  it("leaves the corpus, sets and seals unchanged apart from named corrections", () => {
    const frozen = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    const current = buildFreeze();
    const approved = new Set(APPROVED_CORRECTIONS.map((c) => c.path));
    // parameters.js is expected to move once calibration runs. Everything else
    // must either match the freeze or appear in APPROVED_CORRECTIONS with a
    // recorded reason — the freeze makes change visible, not impossible.
    const structural = Object.keys(frozen.artefacts)
      .filter((p) => !p.includes("parameters.js") && !approved.has(p));
    for (const p of structural) {
      expect(current.artefacts[p], `${p} changed since the pre-calibration freeze and is not an approved correction`)
        .toBe(frozen.artefacts[p]);
    }
  });

  it("gives every approved correction a reason and a scope", () => {
    for (const c of APPROVED_CORRECTIONS) {
      expect(c.reason.length, `${c.path} needs a real reason`).toBeGreaterThan(80);
      expect(c.approvedIn).toBeTruthy();
      // A correction may fix how a classification is JUSTIFIED without changing
      // the classification itself. One that changes the classification is a
      // policy decision, not a correction.
      expect(c.changesClassification).toBe(false);
    }
  });

});

describe("holdouts remain sealed through Workstream 0", () => {
  it("has opened nothing", async () => {
    const { allSealStatuses } = await import("../src/v3/calibration/holdoutSeal.js");
    for (const [id, v] of Object.entries(allSealStatuses())) {
      expect(v.accessCount, `${id} was accessed`).toBe(0);
    }
  });
});
