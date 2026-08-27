// ── Phase 6C4C2: Historical V6 freeze and seal, Synthetic V2 rebinding ───────
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { SEALED_SETS, setAccessCount, allSealStatuses } from "../src/v3/calibration/holdoutSeal.js";
import { TRAIT_TABLE } from "../scripts/validation/traitRegistry.mjs";
import { STYLE_TO_REGISTRY, POOL_V6_SPEC, POOL_V6_EXPANSION, POOL_V6_WAVE3,
  V6_NAME_CORRECTIONS } from "../data/validation/corpus-v6-spec.mjs";
import { tsKey, lineupKey, calPerson, ERAS } from "../scripts/v6/eligibility.mjs";
import { tacticalDistance, scorePair, pairMetrics, REQUIRED_METRIC_COVERAGE } from "../scripts/v6/selection.mjs";
import { v6SurfaceSeed, proveDisjoint, proveTierDisjoint, DOMAIN } from "../scripts/v6/seeds.mjs";
import { clusterHardFails, clusterKey, applyDualGate, KNOWN_FLAGS } from "../scripts/validation/historical-holdout-v6.mjs";
import { compoundVerdict, COMPOUND_VERDICTS } from "../scripts/validation/candidate2FormalVerdict.mjs";
import { teamMatchesV4 } from "../scripts/validation/buildPlayersV4.mjs";
import { TEAM_ALIASES_V4 } from "../data/validation/corpus-v4-spec.mjs";
import { TEAM_ALIASES_V6 } from "../data/validation/corpus-v6-spec.mjs";

const DIR = "data/validation/6c4c2";
const read = (name) => JSON.parse(readFileSync(`${DIR}/${name}.json`, "utf8")).data;

describe("the V6 seal", () => {
  // Phase 6C4C3 legitimately opened V6 once. The assertion that mattered was
  // never the bare zero — it was that this phase opened nothing and that any
  // opening is attributable. That is what is checked now.
  it("registers historical-holdout-v6 with its own log, opened at most once and attributably", () => {
    expect(SEALED_SETS["historical-holdout-v6"]).toBeTruthy();
    const n = setAccessCount("historical-holdout-v6");
    expect(n).toBeLessThanOrEqual(1);
    if (n === 0) {
      expect(allSealStatuses()["historical-holdout-v6"].status).toBe("SEALED_UNREAD");
    } else {
      const r = JSON.parse(readFileSync(`${DIR}/historical-v6-results.json`, "utf8")).data;
      expect(r.accessCountBefore).toBe(0);
      expect(r.accessCountAfter).toBe(1);
      expect(r.accessEvent.actor).toBeTruthy();
      expect(r.identity.candidateId).toBe("Candidate 2");
    }
  });

  it("keeps Synthetic Stress Holdout V2 sealed while the consumed sets stay consumed", () => {
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    for (const s of ["historical-holdout-v3", "historical-holdout-v4", "historical-holdout-v5"]) {
      expect(setAccessCount(s), `${s} is consumed`).toBe(1);
    }
  });

  it("gives V6 its own access log, so its count cannot borrow another set's", () => {
    const logs = Object.values(SEALED_SETS);
    expect(new Set(logs).size).toBe(logs.length);
  });

  it("records the seal bound to Candidate 2, not Candidate 1", () => {
    const seal = read("historical-v6-seal");
    expect(seal.state).toBe("SEALED_UNREAD");
    expect(seal.accessCount).toBe(0);
    expect(seal.candidate.possessionCalibrationVersion).toBe("1.2.0");
    expect(Object.keys(seal.boundHashes).length).toBeGreaterThan(10);
  });
});

describe("the dry-run taint, and why the two team-seasons are excluded", () => {
  const taint = JSON.parse(readFileSync(`${DIR}/v6-dry-run-taint.json`, "utf8"));

  it("names the team-seasons Candidate 2 simulated outside a formal run", () => {
    expect(taint.taintedTeamSeasons.map((t) => t.key).sort())
      .toEqual(["bostonceltics|195051", "minneapolislakers|195556"]);
  });

  it("preserves the tainted dry run as evidence rather than deleting it", () => {
    expect(existsSync(taint.evidence.artifact)).toBe(true);
  });

  it("excludes both from the pool with an attributable reason", () => {
    const pool = read("historical-v6-expanded-pool");
    for (const t of taint.taintedTeamSeasons) {
      const row = [...pool.eligible, ...pool.excluded].find((x) => x.key === t.key);
      expect(row, `${t.key} is in the pool audit`).toBeTruthy();
      expect(row.eligible).toBe(false);
      expect(row.exclusionReasons).toContain("SIMULATED_DURING_V6_DRY_RUN");
    }
  });

  it("keeps both out of the selection, so the seal's claim stays true", () => {
    const m = read("historical-holdout-v6-manifest");
    const selected = m.matchups.flatMap((x) => [x.teamA.key, x.teamB.key]);
    for (const t of taint.taintedTeamSeasons) expect(selected).not.toContain(t.key);
  });

  it("does not weaken the seal's claim to accommodate what happened", () => {
    const seal = read("historical-v6-seal");
    expect(seal.integrity.whatThisProves).toMatch(/never been simulated/);
  });
});

describe("eligibility key normalisation — the Phase 6C4C1 defect", () => {
  it("normalises a team-and-season key past punctuation and case", () => {
    expect(tsKey("Boston Celtics", "1956-57")).toBe(tsKey("boston celtics", "195657"));
    expect(tsKey("Minneapolis Lakers", "1955-56")).not.toBe(tsKey("Boston Celtics", "1955-56"));
  });

  it("resolves a calibration-player id to its person segment", () => {
    expect(calPerson("cal:MIN_LAKERS:1952:slater-martin")).toBe("slater-martin");
    expect(calPerson("bare-person")).toBe("bare-person");
  });

  it("makes a lineup key order-independent and duplicate-free", () => {
    expect(lineupKey(["b", "a", "c"])).toBe(lineupKey(["c", "a", "b"]));
    expect(lineupKey(["a", "a", "b"])).toBe(lineupKey(["a", "b"]));
  });

  it("fires the calibration and prior-holdout exclusions it once could not", () => {
    const pool = read("historical-v6-expanded-pool");
    for (const r of ["HISTORICAL_CALIBRATION_V3", "HISTORICAL_HOLDOUT_V3", "HISTORICAL_HOLDOUT_V5"]) {
      expect(pool.exclusionReasonCounts[r], `${r} actually fires`).toBeGreaterThan(0);
    }
  });

  it("counts pairs as C(n,2), not floor(n/2)", () => {
    const pool = read("historical-v6-expanded-pool");
    for (const era of ERAS) {
      const n = pool.byEra[era];
      expect(pool.pairsByEra[era]).toBe((n * (n - 1)) / 2);
      expect(pool.pairsByEra[era]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the documented-prose to registry-vocabulary projection", () => {
  it("never strengthens a documented claim to make it scoreable", () => {
    expect(STYLE_TO_REGISTRY.tags.STRONG_DEFENSE).toBeNull();
    expect(TRAIT_TABLE.ELITE_DEFENSE.claim.metric).toBe("refPppVsTeam");
  });

  it("drops a term with no registry equivalent rather than approximating it", () => {
    for (const k of ["GUARD_HEAVY", "PHYSICAL", "WING_HEAVY"]) {
      expect(STYLE_TO_REGISTRY.tags[k]).toBeNull();
    }
  });

  it("retains the original prose alongside the projection", () => {
    for (const f of [...POOL_V6_SPEC, ...POOL_V6_EXPANSION, ...POOL_V6_WAVE3]) {
      expect(f.documentedStyle, `${f.fixtureId} keeps its prose`).toBeTruthy();
      expect(f.identity).toBeTruthy();
    }
  });

  it("projects every V6 descriptor into the registry or drops it", () => {
    const unknown = new Set();
    for (const f of [...POOL_V6_SPEC, ...POOL_V6_EXPANSION, ...POOL_V6_WAVE3]) {
      for (const d of [f.identity.pace, f.identity.offense, f.identity.defense, ...f.identity.tags]) {
        if (!(d in TRAIT_TABLE)) unknown.add(d);
      }
    }
    // "balanced" is a genuine no-claim style with no registry term; it stays
    // unmapped and its fixture simply has fewer scoreable traits.
    expect([...unknown]).toEqual(["balanced"]);
  });

  it("records every name correction with a source-based reason", () => {
    expect(V6_NAME_CORRECTIONS.length).toBeGreaterThanOrEqual(4);
    for (const c of V6_NAME_CORRECTIONS) {
      expect(c.why.length).toBeGreaterThan(30);
      expect(c.fixtures.length).toBeGreaterThan(0);
    }
  });
});

describe("the team-alias table is actually consulted", () => {
  it("defaults to the V4 table, so V4 and V5 resolve unchanged", () => {
    expect(teamMatchesV4("BOS", "Boston")).toBe(true);
    expect(teamMatchesV4("DEN", "Denver")).toBe(false);
  });

  it("matches the V6 franchises once the V6 table is passed", () => {
    expect(teamMatchesV4("DEN", "Denver", TEAM_ALIASES_V6)).toBe(true);
    expect(teamMatchesV4("ORL", "Orlando", TEAM_ALIASES_V6)).toBe(true);
    expect(teamMatchesV4("MIL", "Milwaukee", TEAM_ALIASES_V6)).toBe(true);
  });

  it("appends rather than editing: every V4 alias set is byte-identical", () => {
    for (const [k, v] of Object.entries(TEAM_ALIASES_V4)) {
      expect(TEAM_ALIASES_V6[k]).toEqual(v);
    }
  });

  it("resolves Denver 1984-85 with real stats, not nulls off the roster path", () => {
    const store = JSON.parse(readFileSync(`${DIR}/calibration-players-v6.json`, "utf8"));
    const den = store.profiles.filter((p) => p.teamId === "DEN" && p.season === "1984-85");
    expect(den.length).toBe(5);
    for (const p of den) {
      expect(p.confidence).toBe("MEDIUM_HIGH");
      expect(p.basicStats.pointsPerGame).not.toBeNull();
    }
  });
});

describe("selection covers what 6C4C1 repaired", () => {
  const sel = read("historical-v6-selection");

  it("names both repaired mechanisms as required coverage", () => {
    expect(REQUIRED_METRIC_COVERAGE.map((r) => r.metric).sort()).toEqual(["assistedRate", "refPppVsTeam"]);
  });

  it("actually covers both across the sixteen sides", () => {
    for (const r of REQUIRED_METRIC_COVERAGE) {
      expect(sel.coveredMetrics, `${r.metric} is covered`).toContain(r.metric);
    }
  });

  it("selects eight matchups, one per era, on sixteen distinct team-seasons", () => {
    expect(sel.matchups.length).toBe(8);
    expect(new Set(sel.matchups.map((m) => m.eraStyleId)).size).toBe(8);
    const sides = sel.matchups.flatMap((m) => [m.teamA.key, m.teamB.key]);
    expect(new Set(sides).size).toBe(16);
  });

  it("never pairs a mirror, because a mirror cannot separate offence from defence", () => {
    for (const m of sel.matchups) expect(m.tacticalDistance).toBeGreaterThan(0);
  });

  it("is stable under every tested permutation of the pool", () => {
    expect(sel.reorderStability.allIdentical).toBe(true);
    expect(sel.reorderStability.permutationsTested).toBeGreaterThanOrEqual(8);
  });

  it("consulted no Candidate 2 output", () => {
    expect(sel.candidate2OutputUsed).toBe(false);
    expect(sel.candidate2SimulationsUsedForSelection).toBe(0);
  });
});

describe("the selection rule itself", () => {
  const team = (over) => ({ key: "k", teamId: "T", coachId: "c", scoreableMetrics: [],
    scoreableTraits: ["fast"], sharedWithNearestSeenLineup: 0, mediumHighProfiles: 5,
    identity: { pace: "fast", offense: "a", defense: "b", tags: ["X"] }, ...over });

  it("scores a mirror at zero tactical distance", () => {
    expect(tacticalDistance(team(), team())).toBe(0);
  });

  it("counts every differing descriptor and the tag symmetric difference", () => {
    const a = team();
    const b = team({ identity: { pace: "slow", offense: "a", defense: "b", tags: ["Y"] } });
    expect(tacticalDistance(a, b)).toBe(3);   // pace + X missing + Y added
  });

  it("prefers a pair introducing a metric no earlier era covered", () => {
    const a = team({ scoreableMetrics: ["gamePace"] });
    const b = team({ scoreableMetrics: ["assistedRate"] });
    const fresh = scorePair(a, b, new Set(), new Set());
    const stale = scorePair(a, b, new Set(), new Set(["gamePace", "assistedRate"]));
    expect(fresh[3]).toBe(2);
    expect(stale[3]).toBe(0);
  });

  it("unions the two sides' metrics for a pair", () => {
    expect(pairMetrics(team({ scoreableMetrics: ["a", "b"] }), team({ scoreableMetrics: ["b", "c"] })).sort())
      .toEqual(["a", "b", "c"]);
  });
});

describe("the V6 seed domain", () => {
  it("is a fresh domain with zero overlap against every prior population", () => {
    const p = proveDisjoint(4096);
    expect(DOMAIN).toBe("HISTORICAL_V6_FORMAL");
    expect(p.totalOverlap).toBe(0);
    expect(p.priorPopulations).toBeGreaterThanOrEqual(19);
  });

  it("includes both consumed V5 streams in what it must not touch", () => {
    const p = proveDisjoint(512);
    const keys = Object.keys(p.overlaps);
    expect(keys.some((k) => k.includes("v5:historical-holdout-v5"))).toBe(true);
    expect(keys.some((k) => k.includes("v5:v5-dryrun"))).toBe(true);
  });

  it("makes the tier part of the address, so escalation cannot reuse a decision seed", () => {
    const plan = read("historical-v6-sample-plan");
    const proof = proveTierDisjoint(plan.tiers, 8, 3);
    expect(proof.totalOverlap).toBe(0);
    expect(v6SurfaceSeed({ tier: 3, matchupIndex: 0, surfaceIndex: 0, pairIndex: 0 }))
      .not.toBe(v6SurfaceSeed({ tier: 4, matchupIndex: 0, surfaceIndex: 0, pairIndex: 0 }));
  });

  it("addresses deterministically", () => {
    const a = v6SurfaceSeed({ tier: 3, matchupIndex: 2, surfaceIndex: 1, pairIndex: 9 });
    const b = v6SurfaceSeed({ tier: 3, matchupIndex: 2, surfaceIndex: 1, pairIndex: 9 });
    expect(a).toBe(b);
  });
});

describe("cluster aggregation replaces label counting", () => {
  const t = (traitId, over) => ({ traitId, metric: "refPppVsTeam", surface: "REFERENCE_VS_TEAM",
    direction: "BELOW_REFERENCE_BASELINE", observed: 1.36011, reference: 1.32206, diff: 0.03805,
    practicalMargin: 0.02, hardFail: true, result: "FAIL", ...over });
  const results = (matchupId) => ({ matchupId, eraStyleId: "2020s",
    teamA: { teamName: "A", season: "2020-21", traits: [t("ELITE_DEFENSE"), t("elite team man defence")], notScored: [] },
    teamB: { teamName: "B", season: "2020-21", traits: [], notScored: [] } });

  it("collapses two labels on one measurement to one independent cluster", () => {
    const c = clusterHardFails([results("m1")]);
    expect(c.length).toBe(1);
    expect(c[0].formalLabelCount).toBe(2);
    expect(c[0].independentMeasurements).toBe(1);
  });

  it("preserves both labels while collapsing the count", () => {
    const c = clusterHardFails([results("m1")]);
    expect(c[0].formalTraitLabels.sort()).toEqual(["ELITE_DEFENSE", "elite team man defence"]);
    expect(c[0].duplicateLabelNote).toBeTruthy();
  });

  it("keeps the same metric on different matchups as separate evidence", () => {
    expect(clusterHardFails([results("m1"), results("m2")]).length).toBe(2);
  });

  it("excludes the trait label from the cluster key, so renaming cannot change the count", () => {
    expect(clusterKey("m", "teamA", t("X"))).toBe(clusterKey("m", "teamA", t("Y")));
  });

  it("separates clusters when the observation differs", () => {
    expect(clusterKey("m", "teamA", t("X"))).not.toBe(clusterKey("m", "teamA", t("X", { observed: 1.4 })));
  });

  it("makes the verdict policy aggregate on clusters, not labels", () => {
    const v = read("historical-v6-verdict-policy");
    expect(v.aggregation.unit).toBe("INDEPENDENT_MEASUREMENT_CLUSTER");
    expect(v.traitGates.aggregate.maxIndependentHardFailClusters).toBe(0);
    expect(v.traitGates.aggregate.maxHardFailLabelsNote).toMatch(/not a gate/);
  });
});

describe("the dual gate", () => {
  const base = { diff: 0.05, hardFail: true, result: "FAIL" };
  it("needs the wrong direction AND significance AND a margin breach", () => {
    expect(applyDualGate(base, "m", 0.02).hardFail).toBe(true);
    expect(applyDualGate({ ...base, diff: 0.01 }, "m", 0.02).hardFail).toBe(false);
    expect(applyDualGate({ ...base, hardFail: false }, "m", 0.02).hardFail).toBe(false);
  });

  it("calls a significant difference inside the margin indeterminate, never a failure", () => {
    const r = applyDualGate({ ...base, diff: 0.01 }, "m", 0.02);
    expect(r.indeterminate).toBe(true);
    expect(r.hardFail).toBe(false);
    expect(r.reportedState).toBe("STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT");
  });

  it("passes through a passing trait untouched", () => {
    expect(applyDualGate({ diff: -0.05, hardFail: false, result: "PASS" }, "m", 0.02).reportedState).toBe("PASS");
  });
});

describe("the compound verdict state machine", () => {
  const s = (over) => ({ ran: false, outcome: null, ...over });

  it("names no verdict before either stage runs", () => {
    expect(compoundVerdict({ s1: s(), s2: s(), identitySplit: false })).toBe("CANDIDATE2_NOT_YET_DETERMINED");
  });

  it("names stage one when stage one fails, rather than calling it incomplete", () => {
    const v = compoundVerdict({ s1: s({ ran: true, outcome: "FAIL" }), s2: s(), identitySplit: false });
    expect(v).toBe("CANDIDATE2_HISTORICAL_V6_FAILED");
    expect(COMPOUND_VERDICTS[v]).toMatch(/never opened/);
  });

  it("names stage one when stage one is invalid", () => {
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "INVALID_RUN" }), s2: s(), identitySplit: false }))
      .toBe("CANDIDATE2_HISTORICAL_V6_INVALID");
  });

  it("refuses to read a synthetic result obtained out of order", () => {
    expect(compoundVerdict({ s1: s(), s2: s({ ran: true, outcome: "PASS" }), identitySplit: false }))
      .toBe("CANDIDATE2_STAGE_ORDER_VIOLATED");
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "FAIL" }), s2: s({ ran: true, outcome: "PASS" }), identitySplit: false }))
      .toBe("CANDIDATE2_STAGE_ORDER_VIOLATED");
  });

  it("waits when stage one passed and stage two has not run", () => {
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "PASS" }), s2: s(), identitySplit: false }))
      .toBe("CANDIDATE2_NOT_YET_DETERMINED");
  });

  it("refuses to combine two stages that scored different candidates", () => {
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "PASS" }), s2: s({ ran: true, outcome: "PASS" }), identitySplit: true }))
      .toBe("CANDIDATE2_IDENTITY_SPLIT");
  });

  it("names stage two when stage two fails or is invalid", () => {
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "PASS" }), s2: s({ ran: true, outcome: "FAIL" }), identitySplit: false }))
      .toBe("CANDIDATE2_SYNTHETIC_V2_FAILED");
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "PASS" }), s2: s({ ran: true, outcome: "INVALID_RUN" }), identitySplit: false }))
      .toBe("CANDIDATE2_SYNTHETIC_V2_INVALID");
  });

  it("validates only when both stages pass on the same candidate", () => {
    expect(compoundVerdict({ s1: s({ ran: true, outcome: "PASS" }), s2: s({ ran: true, outcome: "PASS" }), identitySplit: false }))
      .toBe("CANDIDATE2_HOLDOUT_VALIDATED");
  });

  it("gives every verdict a meaning that names the deciding stage", () => {
    for (const [k, v] of Object.entries(COMPOUND_VERDICTS)) {
      expect(v.length, `${k} explains itself`).toBeGreaterThan(30);
    }
  });
});

describe("null targets never become zero", () => {
  const targets = read("historical-v6-targets");
  const coverage = read("historical-v6-target-coverage");

  it("leaves every unusable cell null with a stated reason", () => {
    for (const row of targets.rows) {
      for (const [k, v] of Object.entries(row.teamTargets)) {
        if (v.usable) expect(typeof v.value, `${row.key} ${k}`).toBe("number");
        else {
          expect(v.value, `${row.key} ${k}`).toBeNull();
          expect(["NOT_RECORDED_IN_ERA", "SOURCE_BLOCKED_LICENSING"]).toContain(v.availability);
        }
      }
    }
  });

  it("keeps the usable flag and the value in agreement", () => {
    for (const row of targets.rows) {
      for (const v of Object.values(row.teamTargets)) expect(v.usable).toBe(v.value != null);
    }
  });

  it("counts the nulls rather than asserting them", () => {
    expect(coverage.neverZeroFilled).toBe(true);
    expect(coverage.totals.nullTeamCells).toBeGreaterThan(0);
    expect(coverage.totals.usableTeamCells + coverage.totals.nullTeamCells).toBe(coverage.totals.teamCells);
  });

  it("excludes an unscoreable metric from the verdict entirely", () => {
    expect(coverage.interpretation).toMatch(/cannot be reached by any gate/);
  });
});

describe("the Synthetic V2 rebind", () => {
  const binding = read("synthetic-v2-candidate2-binding");

  it("rebinds rather than replacing, because no metric or guardrail changed meaning", () => {
    expect(binding.action).toBe("REBIND");
    expect(binding.replacedWithV3).toBe(false);
    expect(binding.disposition).toBe("POLICY_COMPATIBLE_REBIND_REQUIRED");
    expect(binding.dispositionVerification.metricMeaningsChanged).toBe(0);
  });

  it("binds Candidate 2's core, not Candidate 1's", () => {
    expect(binding.hashes.possessionCalibrationVersion).toBe("1.2.0");
    expect(binding.hashes.candidateCoreHash).not.toBe(binding.supersedesCandidate1Binding.candidateCoreHash);
  });

  it("re-derives the development thresholds from Candidate 2 evidence", () => {
    expect(binding.thresholdDerivation.derivedUnder).toBe("Candidate 2");
    expect(binding.thresholdDerivation.syntheticObservationsUsed).toBe(0);
    expect(binding.thresholdDerivation.marginEvidenceHash)
      .not.toBe(binding.thresholdDerivation.candidate1MarginEvidenceHash);
    expect(binding.thresholdDerivation.talentGapLadderHash)
      .not.toBe(binding.thresholdDerivation.candidate1TalentGapLadderHash);
  });

  it("carries the candidate-independent acceptance thresholds unchanged", () => {
    const frozen = binding.thresholdComparison.filter((c) => c.kind === "FROZEN_ACCEPTANCE_POLICY");
    expect(frozen.length).toBeGreaterThan(0);
    for (const c of frozen) expect(c.changed).toBe(false);
  });

  it("addresses every item the compatibility audit required", () => {
    expect(binding.rebindItems.length).toBe(4);
    for (const r of binding.rebindItems) expect(r.addressed).toBe(true);
  });

  it("gates stage two on Historical V6, not on the consumed and failed V5", () => {
    expect(binding.stageOrder.precondition).toMatch(/historical-holdout-v6/);
    expect(binding.stageOrder.refusalCode).toBe("SYNTHETIC_ACCESS_REFUSED");
    expect(binding.stageOrder.whyNotV5).toMatch(/FAIL/);
  });

  it("never opened the set it rebinds", () => {
    expect(binding.sealState.accessCount).toBe(0);
    expect(binding.notDoneHere.join(" ")).toMatch(/not opened/);
  });
});

describe("the execution package", () => {
  const pkg = read("candidate2-formal-execution-package");

  it("namespaces every bound hash by stage", () => {
    for (const k of Object.keys(pkg.hashes)) {
      expect(k, `${k} is namespaced`).toMatch(/^(candidate|historicalV6|synthetic|compound)\./);
    }
  });

  it("has real key collisions, so the namespacing is load-bearing", () => {
    expect(pkg.hashNamespacing.collidingKeyNames.length).toBeGreaterThan(0);
    expect(pkg.hashNamespacing.collidingKeyNames).toContain("policyHash");
    expect(pkg.hashNamespacing.collidingKeyNames).toContain("seedSetHash");
  });

  it("loses no hash to the merge", () => {
    const stage1 = Object.keys(pkg.hashes).filter((k) => k.startsWith("historicalV6.")).length;
    const stage2 = Object.keys(pkg.hashes).filter((k) => k.startsWith("synthetic.")).length;
    expect(stage1).toBe(Object.keys(pkg.stages[0].hashes).length);
    expect(stage2).toBe(Object.keys(pkg.stages[1].hashes).length);
  });

  it("binds both stages to the same candidate", () => {
    expect(pkg.hashes["historicalV6.candidateCoreHash"]).toBe(pkg.hashes["synthetic.candidateCoreHash"]);
  });

  it("orders the stages and says why", () => {
    expect(pkg.stageOrder.order).toEqual(["historical-holdout-v6", "synthetic-stress-holdout-v2"]);
    expect(pkg.stageOrder.enforcedBy).toMatch(/in code/);
  });

  it("claims no status it has not earned", () => {
    for (const s of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(pkg.notClaimed).toContain(s);
    }
    expect(pkg.productionActivation).toMatch(/CEO GO LIVE/);
  });

  it("records that neither stage ran in this phase", () => {
    expect(pkg.executionForbiddenInThisPhase.historicalV6ResultsExists).toBe(false);
    expect(pkg.executionForbiddenInThisPhase.syntheticResultsExists).toBe(false);
  });
});

describe("command surfaces", () => {
  const cert = read("candidate2-command-certification");

  it("closes the accepted-flag list on the historical runner", () => {
    expect(KNOWN_FLAGS).toContain("--unlock-historical-holdout-v6");
    expect(KNOWN_FLAGS).not.toContain("--force");
  });

  it("certifies every invocation by measuring the access counters", () => {
    expect(cert.invocations.length).toBeGreaterThanOrEqual(19);
    for (const i of cert.invocations) {
      expect(i.ok, `${i.command} ${i.args.join(" ")}`).toBe(true);
      expect(i.setsOpened).toEqual([]);
    }
  });

  it("leaves both sealed sets at zero end to end", () => {
    for (const s of ["historical-holdout-v6", "synthetic-stress-holdout-v2"]) {
      expect(cert.accessCountsBefore[s]).toBe(0);
      expect(cert.accessCountsAfter[s]).toBe(0);
    }
  });

  it("certifies the destructive mode by its refusal", () => {
    const runs = cert.invocations.filter((i) => i.args.includes("--run"));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) { expect(r.exitCode).toBe(2); expect(r.sealUntouched).toBe(true); }
  });
});

describe("readiness", () => {
  const r = read("candidate2-formal-execution-readiness");

  it("may execute Phase 6C4C3", () => {
    expect(r.mayExecutePhase6C4C3).toBe(true);
    for (const req of r.requirements) expect(req.met, req.requirement).toBe(true);
  });

  it("did not move engine behaviour during a preparation phase", () => {
    expect(r.candidate.possessionCalibrationVersion).toBe("1.2.0");
  });

  it("forbids the next phase from re-deriving or re-sealing anything", () => {
    expect(r.whatPhase6C4C3MayNotDo.join(" ")).toMatch(/re-select, re-seal or re-derive/);
    expect(r.whatPhase6C4C3MayNotDo.join(" ")).toMatch(/merge to main/);
  });

  it("claims no validated status", () => {
    expect(r.notClaimed).toContain("HOLDOUT_VALIDATED");
    expect(r.productionActivation).toMatch(/CEO GO LIVE/);
  });
});
