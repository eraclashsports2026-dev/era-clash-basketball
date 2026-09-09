// ── Phase 6C4B1S: the Synthetic V2 formal execution package ─────────────────
// Two kinds of assertion here. The ones that prove the package is complete and
// internally consistent, and the ones that prove nothing was opened to build
// it — both sealed sets are still at access zero and no formal result artifact
// exists that could be mistaken for a verdict.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readArtifact, artifactExists } from "../src/v3/calibration/artifacts.js";
import { setAccessCount, SEALED_SETS } from "../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2, SYNTHETIC_DEVELOPMENT_V2 } from "../data/calibration/sets-v3.mjs";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { CELL, FIXTURE, SET as SET_VERDICTS, ceilingCell, floorCell, bandCell, zeroCountCell,
  applyCatastrophicRule, fixtureVerdictFrom, aggregate } from "../scripts/synthetic/evalSynthetic.mjs";
import { synSurfaceSeed, proveDisjoint, SURFACE_SLOTS } from "../scripts/synthetic/seeds.mjs";
import { person } from "../scripts/synthetic/ratings.mjs";
import { mockFixtures, EXCLUDED_FOR_PROXIMITY, MAX_SHARED_PEOPLE } from "../scripts/synthetic/mockSet.mjs";

const DIR = "data/validation/6c4b1s";
const B1 = "data/validation/6c4b1";
const R = (n) => readArtifact(n, DIR);

describe("6C4B1S — nothing was opened", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("leaves Synthetic Stress Holdout V2 sealed and unread at access zero", () => {
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
      "no synthetic access log may exist").toBe(false);
  });

  // Phase 6C4B2R legitimately opened Historical V5. This assertion always
  // meant "THIS phase opened nothing", which stays true; the literal
  // access-count zero stopped being true when a later phase opened the set.
  // It becomes an attributability claim: the seal record for this phase says
  // zero, and any opening is attributable to a later phase with an operator,
  // a reason and a commit.
  it("opened neither holdout, and records V5 at access zero for its own phase", () => {
    expect(R("phase6c4b1s-preflight").data.historicalV5AccessCount).toBe(0);
    expect(R("phase6c4b1s-preflight").data.syntheticV2AccessCount).toBe(0);
    expect(R("phase6c4b1s-final-summary").data.whatWasNotDone.holdoutsOpened).toBe(0);
    expect(readArtifact("historical-holdout-v5-seal", B1).data.state).toBe("SEALED_UNREAD");
    expect(setAccessCount("historical-holdout-v5"),
      "a sealed set is opened at most once").toBeLessThanOrEqual(1);
  });

  it("produced no formal result artifact of its own", () => {
    // this phase authored a package, never a result. Synthetic V2 must still be
    // unopened, because the frozen stage order forbids opening it before a
    // historical holdout passes — and none has.
    expect(artifactExists("synthetic-v2-results", DIR),
      "a results artifact would be mistaken for a verdict").toBe(false);
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])).toBe(false);
    // a V5 results artifact, if one now exists, belongs to a LATER phase
    if (artifactExists("historical-holdout-v5-results", B1)) {
      const d = readArtifact("historical-holdout-v5-results", B1).data;
      expect(d.accessCountBefore).toBe(0);
      expect(d.accessEvent.openedAtCommit).toBeTruthy();
    }
  });

  it("records that the package was prepared without any synthetic observation", () => {
    expect(R("synthetic-v2-formal-policy").data.evidenceBasis.syntheticObservationsUsed).toBe(0);
    expect(R("synthetic-v2-dry-run").data.isolation.sealedFixturesEvaluated).toBe(0);
    expect(R("compound-formal-validation-package-v2").data
      .commandsExecutedInThisPhase["validation:synthetic-v2"]).toBe(0);
  });
});

describe("6C4B1S — the frozen inputs were not altered", () => {
  it("leaves the sealed membership at sixteen fixtures with its frozen hash", () => {
    expect(SYNTHETIC_STRESS_HOLDOUT_V2).toHaveLength(16);
    expect(R("synthetic-v2-formal-policy").data.membership.membershipHash)
      .toBe("71267875cbf69a9ffa2bd420a2f4bb87437ecb78d6ca2029e7b6826759dbcd19");
  });

  it("carries the three frozen numeric thresholds through unchanged", () => {
    const t = R("synthetic-v2-formal-policy").data.thresholds;
    expect(t.maxSingleActionFamilyShare).toBe(HOLDOUT.syntheticGuardrails.maxSingleActionFamilyShare);
    expect(t.maxSingleShellWinRate).toBe(HOLDOUT.syntheticGuardrails.maxSingleShellWinRate);
    expect(t.minSingleShellWinRate).toBe(HOLDOUT.syntheticGuardrails.minSingleShellWinRate);
    expect(R("synthetic-v2-formal-policy").data.hashes.acceptancePolicyHash).toBe(acceptancePolicyHash());
  });

  it("registers every frozen guardrail key exactly once, without merging the thresholds away", () => {
    const reg = R("synthetic-v2-guardrail-registry").data;
    const frozen = Object.keys(HOLDOUT.syntheticGuardrails);
    expect(reg.guardrailCount).toBe(frozen.length);
    expect(reg.guardrails.map((g) => g.guardrailId).sort()).toEqual([...frozen].sort());
    expect(reg.adjudicableGuardrailCount + reg.thresholdParameterCount).toBe(frozen.length);
    // the count discrepancy is recorded rather than resolved by preference
    expect(reg.countReconciliation.priorProseSaid).toBe(10);
    expect(reg.countReconciliation.frozenKeys).toBe(11);
  });

  it("binds every threshold parameter to a parent guardrail that exists", () => {
    const reg = R("synthetic-v2-guardrail-registry").data;
    const ids = new Set(reg.guardrails.map((g) => g.guardrailId));
    for (const g of reg.guardrails.filter((x) => x.formalClass === "THRESHOLD_PARAMETER")) {
      expect(ids.has(g.parameterOf), `${g.guardrailId} names a parent that exists`).toBe(true);
    }
  });

  it("keeps Candidate 1 at its recertified identity with no parameter drift", () => {
    const def = defaultRuntimeParameterSet();
    const recert = readArtifact("candidate1-lock-recertification", B1).data;
    expect(R("synthetic-v2-formal-policy").data.hashes.parameterSetHash).toBe(def.parameterSetHash);
    expect(R("synthetic-v2-formal-policy").data.hashes.lockRevision).toBe(recert.lockRevision);
    expect(activeParameters().every((p) => def.values[p.id] === p.defaultValue)).toBe(true);
  });
});

describe("6C4B1S — coverage reconciles both ways", () => {
  it("maps every sealed fixture to at least one guardrail", () => {
    const reg = R("synthetic-v2-guardrail-registry").data;
    expect(reg.unmappedFixtures).toEqual([]);
    for (const f of SYNTHETIC_STRESS_HOLDOUT_V2) {
      expect(reg.fixtureCoverage[f.id].guardrails.length,
        `${f.id} is covered`).toBeGreaterThan(0);
    }
  });

  it("gives every adjudicable guardrail at least one applicable fixture", () => {
    const agg = R("synthetic-v2-aggregation-policy").data;
    expect(R("synthetic-v2-guardrail-registry").data.unmappedGuardrails).toEqual([]);
    for (const row of agg.guardrails) {
      expect(row.applicableFixtures, `${row.guardrailId} is decidable somewhere`).toBeGreaterThan(0);
      expect(row.minDecidedFixturesForSetPass).toBeGreaterThan(0);
    }
  });

  it("restricts the shell guardrail to the zone-legal fixtures", () => {
    const agg = R("synthetic-v2-aggregation-policy").data;
    const shell = agg.guardrails.find((g) => g.guardrailId === "forbidUniversalShellDominance");
    expect(shell.applicableFixtures).toBe(R("synthetic-v2-surface-plan").data.zoneDecidableFixtureCount);
    expect(shell.applicableFixtures).toBeLessThan(16);
    expect(shell.notApplicableFixtureIds.length).toBe(16 - shell.applicableFixtures);
  });

  it("tolerates zero fixture failures on every guardrail", () => {
    expect(R("synthetic-v2-aggregation-policy").data.fixtureFailureTolerance
      .perGuardrailAllowedFailures).toBe(0);
  });
});

describe("6C4B1S — the dual gate", () => {
  it("passes, fails and abstains on a ceiling", () => {
    expect(ceilingCell({ observed: 0.30, se: 0.001, ceiling: 0.60, margin: 0.01 }).outcome).toBe(CELL.PASS);
    expect(ceilingCell({ observed: 0.65, se: 0.001, ceiling: 0.60, margin: 0.01 }).outcome).toBe(CELL.FAIL);
    expect(ceilingCell({ observed: 0.598, se: 0.001, ceiling: 0.60, margin: 0.01 }).outcome)
      .toBe(CELL.INDETERMINATE);
  });

  it("passes, fails and abstains on a floor", () => {
    expect(floorCell({ observed: 16, se: 0.3, floor: 13, margin: 0.83 }).outcome).toBe(CELL.PASS);
    expect(floorCell({ observed: 11, se: 0.3, floor: 13, margin: 0.83 }).outcome).toBe(CELL.FAIL);
    expect(floorCell({ observed: 13.5, se: 0.3, floor: 13, margin: 0.83 }).outcome).toBe(CELL.INDETERMINATE);
  });

  it("fails at both edges of a band and abstains inside the margin", () => {
    const b = (o) => bandCell({ observed: o, se: 0.01, min: 0.35, max: 0.65, margin: 0.033 }).outcome;
    expect(b(0.50)).toBe(CELL.PASS);
    expect(b(0.30)).toBe(CELL.FAIL);
    expect(b(0.70)).toBe(CELL.FAIL);
    expect(b(0.36)).toBe(CELL.INDETERMINATE);
    expect(b(0.64)).toBe(CELL.INDETERMINATE);
  });

  it("applies no margin to a count", () => {
    expect(zeroCountCell({ observed: 0, what: "x" }).outcome).toBe(CELL.PASS);
    expect(zeroCountCell({ observed: 1, what: "x" }).outcome).toBe(CELL.FAIL);
    expect(zeroCountCell({ observed: 1, what: "x" }).practicalMargin).toBe(0);
  });

  it("never turns an unmeasured observation into a zero", () => {
    for (const c of [
      ceilingCell({ observed: null, se: null, ceiling: 0.6, margin: 0.01 }),
      floorCell({ observed: null, se: null, floor: 13, margin: 0.8 }),
      bandCell({ observed: null, se: null, min: 0.35, max: 0.65, margin: 0.03 }),
      zeroCountCell({ observed: null, what: "x" }),
    ]) {
      expect(c.observed).toBeNull();
      expect(c.outcome).toBe(CELL.NOT_MEASURED);
    }
  });

  it("keeps every margin at or above three standard errors of its own metric", () => {
    for (const [k, m] of Object.entries(R("synthetic-v2-practical-margins").data.margins)) {
      expect(m.margin, `${k}`).toBeGreaterThanOrEqual(3 * m.maxObservedSe - 1e-9);
      expect(m.margin).toBeGreaterThan(0);
    }
  });

  it("leaves every derived threshold clear of the weakest development observation", () => {
    const d = R("synthetic-v2-practical-margins").data;
    const t = d.derivedThresholds; const m = d.margins;
    expect(t.minCombinedScoreSd.value + m.combinedScoreSd.margin)
      .toBeLessThan(t.minCombinedScoreSd.evidence.developmentMin);
    expect(t.constructionWinRateFloor.value + m.coherentLowerControlWinRate.margin)
      .toBeLessThan(t.constructionWinRateFloor.evidence.min);
    expect(t.talentWinRateFloor.value + m.roleMatchedUpgradeWinRate.margin)
      .toBeLessThan(t.talentWinRateFloor.evidence.min);
  });
});

describe("6C4B1S — the catastrophic rule", () => {
  const cells = () => ({
    requireZeroInvariantFailures: { outcome: CELL.FAIL, observed: 3 },
    requireZeroImpossibleResults: { outcome: CELL.PASS, observed: 0 },
    requireSameSeedReplay: { outcome: CELL.PASS, observed: 0 },
    forbidUniversalActionDominance: { outcome: CELL.PASS, observed: 0.2 },
    requireNewSeedVariance: { outcome: CELL.PASS, observed: 16 },
    forbidUniversalShellDominance: { outcome: CELL.NOT_APPLICABLE, observed: null },
  });

  it("demotes every non-structural pass measured on contradicted games", () => {
    const after = applyCatastrophicRule(cells()).cells;
    expect(after.forbidUniversalActionDominance.outcome).toBe(CELL.INDETERMINATE);
    expect(after.requireNewSeedVariance.outcome).toBe(CELL.INDETERMINATE);
    expect(after.forbidUniversalActionDominance.demotedByCatastrophicRule).toBe(true);
  });

  it("leaves a NOT_APPLICABLE cell alone", () => {
    expect(applyCatastrophicRule(cells()).cells.forbidUniversalShellDominance.outcome)
      .toBe(CELL.NOT_APPLICABLE);
  });

  it("still fails the fixture, because a contradicted game is the candidate's fault", () => {
    expect(fixtureVerdictFrom(applyCatastrophicRule(cells()).cells)).toBe(FIXTURE.FAIL);
  });

  it("refuses to pass a fixture with no decided cell", () => {
    expect(fixtureVerdictFrom({ a: { outcome: CELL.INDETERMINATE }, b: { outcome: CELL.NOT_APPLICABLE } }))
      .toBe(FIXTURE.INVALID_RUN);
  });

  it("invalidates a fixture with a missing measurement rather than failing the candidate", () => {
    expect(fixtureVerdictFrom({ a: { outcome: CELL.PASS }, b: { outcome: CELL.NOT_MEASURED } }))
      .toBe(FIXTURE.INVALID_RUN);
  });
});

describe("6C4B1S — aggregation cannot pass by absence of evidence", () => {
  const agg = () => R("synthetic-v2-aggregation-policy").data;
  const record = (id, verdict, outcome) => ({ fixtureId: id, verdict, totalGames: 100,
    cells: Object.fromEntries(agg().guardrails.map((g) => [g.guardrailId, { outcome }])) });

  it("fails the set on a single failed fixture", () => {
    const rs = SYNTHETIC_STRESS_HOLDOUT_V2.map((f, i) =>
      record(f.id, i === 0 ? FIXTURE.FAIL : FIXTURE.PASS, i === 0 ? CELL.FAIL : CELL.PASS));
    expect(aggregate({ records: rs, aggregationPolicy: agg() }).verdict).toBe(SET_VERDICTS.FAIL);
  });

  it("refuses to pass the set when every cell is undecided", () => {
    const rs = SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => record(f.id, FIXTURE.PASS, CELL.INDETERMINATE));
    const out = aggregate({ records: rs, aggregationPolicy: agg() });
    expect(out.verdict).toBe(SET_VERDICTS.INVALID_RUN);
    expect(out.shortfalls.length).toBeGreaterThan(0);
  });

  it("refuses to pass the set when one fixture is an invalid run", () => {
    const rs = SYNTHETIC_STRESS_HOLDOUT_V2.map((f, i) =>
      record(f.id, i === 0 ? FIXTURE.INVALID_RUN : FIXTURE.PASS, CELL.PASS));
    expect(aggregate({ records: rs, aggregationPolicy: agg() }).verdict).not.toBe(SET_VERDICTS.PASS);
  });
});

describe("6C4B1S — the seed domain", () => {
  it("overlaps no prior population at the frozen proof volume", () => {
    const seeds = R("synthetic-v2-seeds").data;
    expect(seeds.disjointnessProof.totalOverlap).toBe(0);
    expect(seeds.disjointnessProof.priorPopulationsChecked).toBeGreaterThanOrEqual(20);
    expect(seeds.disjointnessProof.seedsPerStream).toBeGreaterThanOrEqual(65536);
  });

  it("still overlaps nothing when re-proved live", () => {
    expect(proveDisjoint(2048).totalOverlap).toBe(0);
  });

  it("gives every surface slot a distinct seed at the same address", () => {
    const seeds = Object.keys(SURFACE_SLOTS)
      .map((slot) => synSurfaceSeed({ fixtureIndex: 4, surfaceSlot: slot, pairIndex: 9 }));
    expect(new Set(seeds).size).toBe(Object.keys(SURFACE_SLOTS).length);
  });

  it("is a pure function of its address, so a resume re-derives the same seeds", () => {
    expect(synSurfaceSeed({ fixtureIndex: 2, surfaceSlot: "MIRROR", pairIndex: 5 }))
      .toBe(synSurfaceSeed({ fixtureIndex: 2, surfaceSlot: "MIRROR", pairIndex: 5 }));
  });

  it("keeps the dry-run stream away from the formal stream", () => {
    expect(synSurfaceSeed({ stream: "synthetic-v2-dryrun", fixtureIndex: 0, surfaceSlot: "MIRROR", pairIndex: 0 }))
      .not.toBe(synSurfaceSeed({ stream: "synthetic-stress-holdout-v2", fixtureIndex: 0, surfaceSlot: "MIRROR", pairIndex: 0 }));
  });

  it("refuses a pair index beyond the frozen stride", () => {
    expect(() => synSurfaceSeed({ fixtureIndex: 0, surfaceSlot: "MIRROR", pairIndex: 40000 })).toThrow(/stride/);
  });
});

describe("6C4B1S — the mock set cannot stand in for the sealed one", () => {
  const mocks = mockFixtures();

  it("uses no sealed fixture id", () => {
    const sealed = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id));
    for (const m of mocks) {
      expect(sealed.has(m.id)).toBe(false);
      expect(m.id.startsWith("ss2-")).toBe(false);
    }
  });

  it("uses no sealed lineup", () => {
    const sealed = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [...f.five].map(person).sort().join("|")));
    for (const m of mocks) expect(sealed.has([...m.five].map(person).sort().join("|"))).toBe(false);
  });

  it("keeps every member more than one substitution from a sealed five", () => {
    for (const m of mocks) {
      expect(m.sharedPeopleWithNearestSealed.count,
        `${m.id} vs ${m.sharedPeopleWithNearestSealed.nearestSealed}`).toBeLessThanOrEqual(MAX_SHARED_PEOPLE);
    }
  });

  it("excludes the three development fixtures that sit four of five from a sealed five", () => {
    expect(EXCLUDED_FOR_PROXIMITY).toHaveLength(3);
    const ids = new Set(mocks.map((m) => m.sourceDevelopmentFixture));
    for (const e of EXCLUDED_FOR_PROXIMITY) {
      expect(e.sharedPeople).toBe(4);
      expect(ids.has(e.devFixtureId), `${e.devFixtureId} is excluded`).toBe(false);
    }
  });

  it("draws every member from the non-holdout development set", () => {
    const dev = new Set(SYNTHETIC_DEVELOPMENT_V2.map((f) => f.id));
    for (const m of mocks) expect(dev.has(m.sourceDevelopmentFixture)).toBe(true);
  });

  it("covers every sealed stress purpose and both zone branches", () => {
    const mock = R("synthetic-v2-mock-manifest").data;
    const purposes = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.purpose));
    const covered = new Set(mock.members.flatMap((m) => m.standsInFor));
    for (const p of purposes) expect(covered.has(p), `${p} has a stand-in`).toBe(true);
    expect(mock.branchCoverage.zoneLegalMembers).toBeGreaterThan(0);
    expect(mock.branchCoverage.zoneIllegalMembers).toBeGreaterThan(0);
  });
});

describe("6C4B1S — the package is executable", () => {
  it("passed the dry run of the exact runner", () => {
    const dry = R("synthetic-v2-dry-run").data;
    expect(dry.pass).toBe(true);
    expect(dry.failedChecks).toEqual([]);
    expect(dry.checkCount).toBeGreaterThanOrEqual(33);
    expect(dry.isolation.syntheticAccessAfter).toBe(0);
    expect(dry.isolation.historicalV5AccessAfter).toBe(0);
  });

  it("certified every command by executing its non-accessing modes", () => {
    const cert = R("synthetic-v2-command-certification").data;
    expect(cert.pass).toBe(true);
    for (const c of cert.commands) expect(c.registered, c.npmScript).toBe(true);
    for (const m of cert.commands.flatMap((c) => c.modes)) expect(m.accessUnchanged).toBe(true);
    expect(cert.accessCounts.after["synthetic-stress-holdout-v2"]).toBe(0);
    expect(cert.accessCounts.after["historical-holdout-v5"]).toBe(0);
  });

  it("resolves the command Phase 6C4B2 could not run", () => {
    expect(R("synthetic-v2-command-certification").data.blockerResolved.nowResolvesTo)
      .toMatch(/synthetic-stress-holdout-v2\.mjs/);
  });

  it("closes every component the blocker listed as missing", () => {
    const reg = R("synthetic-v2-formal-readiness-register").data;
    expect(reg.reconciliation.unclaimed).toEqual([]);
    expect(reg.reconciliation.invented).toEqual([]);
    for (const key of reg.authoritativeSource.missingKeys) {
      const rows = reg.components.filter((c) => c.blockerKey === key);
      expect(rows.length, `${key} is claimed by a component`).toBeGreaterThan(0);
    }
  });

  it("binds both stages without losing a hash to a key collision", () => {
    const pkg = R("compound-formal-validation-package-v2").data;
    expect(pkg.pass).toBe(true);
    const [one, two] = pkg.stages;
    expect(Object.keys(pkg.boundHashes).length)
      .toBe(Object.keys(one.hashes).length + Object.keys(two.hashes).length);
    for (const [k, v] of Object.entries(one.hashes)) expect(pkg.boundHashes[`stage1.${k}`]).toBe(v);
    for (const [k, v] of Object.entries(two.hashes)) expect(pkg.boundHashes[`stage2.${k}`]).toBe(v);
    expect(pkg.hashNamespacing.collidingKeyNames.length).toBeGreaterThan(0);
  });

  it("marks the superseded package without overwriting it", () => {
    const pkg = R("compound-formal-validation-package-v2").data;
    expect(pkg.supersedes.status).toBe("SUPERSEDED_INCOMPLETE");
    expect(existsSync(pkg.supersedes.path), "the original file still exists").toBe(true);
    expect(readArtifact("phase6c4b2-validation-package", B1).data
      .phase6C4B2ValidationPackageVersion).toBeTruthy();
  });

  it("requires stage one to pass before stage two may open", () => {
    const policy = R("synthetic-v2-formal-policy").data;
    expect(policy.stage.number).toBe(2);
    expect(policy.stage.stageOne).toBe("historical-holdout-v5");
    expect(policy.stage.order).toMatch(/SYNTHETIC_ACCESS_REFUSED/);
  });

  it("plans at least the frozen minimum volume on every fixture", () => {
    for (const f of R("synthetic-v2-sample-plan").data.fixtures) {
      expect(f.totalGames, f.fixtureId).toBeGreaterThanOrEqual(HOLDOUT.minGamesPerHoldoutFixture);
    }
  });

  it("side-balances every adjudicating surface", () => {
    for (const f of R("synthetic-v2-sample-plan").data.fixtures) {
      for (const [name, s] of Object.entries(f.surfaces)) {
        if (!s.adjudicates) continue;
        expect(s.games, `${f.fixtureId} ${name}`).toBe(s.pairs * 2);
      }
    }
  });

  it("keeps the zone ablation twin out of every verdict", () => {
    for (const f of R("synthetic-v2-sample-plan").data.fixtures) {
      expect(f.surfaces.ZONE_ABLATION_TWIN.adjudicates).toBe(false);
    }
  });
});

describe("6C4B1S — claims this phase may not make", () => {
  it("claims no validated or production status anywhere in its artifacts", () => {
    const forbidden = ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY"];
    for (const name of ["synthetic-v2-formal-policy", "compound-formal-validation-package-v2",
      "synthetic-v2-dry-run", "phase6c4b1s-preflight"]) {
      const text = JSON.stringify(R(name));
      for (const f of forbidden) {
        // the strings may appear only inside an explicit disclaimer
        const idx = text.indexOf(f);
        if (idx === -1) continue;
        const around = text.slice(Math.max(0, idx - 260), idx + 80);
        expect(around, `${name} mentions ${f} outside a disclaimer`)
          .toMatch(/does not|not authorize|never claim|belongs to the phase/i);
      }
    }
  });

  it("records that both stages passing authorizes no deployment", () => {
    expect(R("compound-formal-validation-package-v2").data.whatBothStagesPassingDoesNotAuthorize)
      .toMatch(/GO LIVE/);
    expect(R("synthetic-v2-formal-policy").data.outcomes.whatAPassDoesNotAuthorize)
      .toMatch(/GO LIVE/);
  });
});
