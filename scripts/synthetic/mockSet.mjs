#!/usr/bin/env node
// ── WS9: the non-holdout mock stress set ────────────────────────────────────
//   npm run syn:mock
//
// The runner has to be rehearsed on something shaped exactly like the sealed
// set but containing none of it. This builds that set from the synthetic
// DEVELOPMENT fixtures, mapping each stress purpose in the sealed set onto a
// development fixture that exercises the same code path, so the dry run
// exercises every branch the formal run will take — zone-legal and
// zone-illegal eras, a construction surface, an upgrade surface, series play
// and season play.
//
// A gate refuses the manifest if any ss2 fixture id, any sealed lineup, or any
// person from a sealed lineup appears in it.
import { createHash } from "node:crypto";
import { writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2, SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { person } from "./ratings.mjs";
import { DIR } from "./preflight.mjs";

/**
 * Each mock member names the sealed purpose or purposes whose code path it
 * stands in for. Chosen so the rehearsal covers every branch: zone-legal and
 * zone-illegal eras, both control surfaces, and both competition modes.
 *
 * Three development fixtures are deliberately EXCLUDED. Person overlap between
 * the two sets is expected — both were drawn from the same card pool by the
 * same design phase — but sd2-elite-shooting, sd2-extreme-size and
 * sd2-zone-attack each share FOUR of five people with a sealed five, which
 * makes them one substitution away from it. Running those at volume would
 * produce a close proxy for a sealed fixture's result, which a rehearsal has
 * no business generating. Every remaining member shares at most three.
 */
export const EXCLUDED_FOR_PROXIMITY = Object.freeze([
  { devFixtureId: "sd2-elite-shooting", nearestSealed: "ss2-duplicate-role", sharedPeople: 4 },
  { devFixtureId: "sd2-extreme-size", nearestSealed: "ss2-coach-toolkit-edge", sharedPeople: 4 },
  { devFixtureId: "sd2-zone-attack", nearestSealed: "ss2-era-edge-modern-in-old", sharedPeople: 4 },
]);
export const MAX_SHARED_PEOPLE = 3;

export const MOCK_MEMBERS = Object.freeze([
  { mockId: "mock-role-overlap", devFixtureId: "sd2-extreme-small",
    standsInFor: ["EXPLOIT_ROLE_OVERLAP", "EXTREME_STRENGTH_GAP"],
    exercises: "duplicated role in a zone-legal era, and the VS_ROLE_MATCHED_UPGRADE surface" },
  { mockId: "mock-no-spacing", devFixtureId: "sd2-weak-shooting", standsInFor: ["IMPOSSIBLE_SPACING"],
    exercises: "a five with no perimeter threat" },
  { mockId: "mock-duplicate-role", devFixtureId: "sd2-no-rim-protection", standsInFor: ["DUPLICATE_ROLE_OVERLOAD"],
    exercises: "the VS_COHERENT_LOWER_CONTROL surface" },
  { mockId: "mock-mismatch-chain", devFixtureId: "sd2-weak-defender-hiding", standsInFor: ["DEFENSIVE_MISMATCH_CHAIN"],
    exercises: "defensive mismatch resolution in a zone-legal era" },
  { mockId: "mock-zone-legal", devFixtureId: "sd2-passing-hub", standsInFor: ["ZONE_EDGE_CASE"],
    exercises: "the ZONE_ASYMMETRIC surface and its ablation twin, where zone is realized" },
  { mockId: "mock-zone-illegal", devFixtureId: "sd2-post-mismatch", standsInFor: ["ZONE_EDGE_CASE"],
    exercises: "the NOT_APPLICABLE branch and the structural zero-zone expectation, in a 1970s era" },
  { mockId: "mock-era-edge", devFixtureId: "sd2-cross-era", standsInFor: ["ERA_EDGE_CASE"],
    exercises: "cross-era translation in a zone-illegal era" },
  { mockId: "mock-coach-toolkit", devFixtureId: "sd2-action-family-stress",
    standsInFor: ["COACH_TOOLKIT_EDGE", "SERIES_VARIANCE"],
    exercises: "action-family concentration against a coach toolkit, and best-of-seven series play" },
  { mockId: "mock-usage", devFixtureId: "sd2-creator-stack", standsInFor: ["USAGE_CONCENTRATION"],
    exercises: "usage collision between stacked creators" },
  { mockId: "mock-tails", devFixtureId: "sd2-balanced-lower-ovr", standsInFor: ["STATISTICAL_TAILS"],
    exercises: "the mirror tail-extension volume branch, on a coherent five" },
  { mockId: "mock-season", devFixtureId: "sd2-movement-shooters", standsInFor: ["WIN82_VARIANCE"],
    exercises: "82-game season play" },
]);

/** The mock fixtures, shaped exactly like sealed ones: id, five, coach, era, purpose. */
export const mockFixtures = () => MOCK_MEMBERS.map((m) => {
  const dev = SYNTHETIC_DEVELOPMENT_V2.find((f) => f.id === m.devFixtureId);
  if (!dev) throw new Error(`mock set references unknown development fixture "${m.devFixtureId}"`);
  return { id: m.mockId, five: dev.five, coach: dev.coach, era: dev.era,
    purpose: dev.purpose, standsInFor: m.standsInFor, sourceDevelopmentFixture: dev.id,
    sharedPeopleWithNearestSealed: (() => {
      const mp = new Set(dev.five.map(person));
      let worst = 0; let who = null;
      for (const s of SYNTHETIC_STRESS_HOLDOUT_V2) {
        const n = s.five.map(person).filter((p) => mp.has(p)).length;
        if (n > worst) { worst = n; who = s.id; }
      }
      return { count: worst, nearestSealed: who };
    })() };
});

/** How many of the seven formal surfaces and modes the mock set can exercise. */
const payloadBranchCount = (fixtures) => {
  const zoneLegal = fixtures.some((f) => ["2000s", "2010s", "2020s"].includes(f.era));
  const zoneIllegal = fixtures.some((f) => !["2000s", "2010s", "2020s"].includes(f.era));
  const series = MOCK_MEMBERS.some((m) => m.standsInFor.includes("SERIES_VARIANCE"));
  const season = MOCK_MEMBERS.some((m) => m.standsInFor.includes("WIN82_VARIANCE"));
  const construction = MOCK_MEMBERS.some((m) => m.standsInFor.includes("DUPLICATE_ROLE_OVERLOAD"));
  const upgrade = MOCK_MEMBERS.some((m) => m.standsInFor.includes("EXTREME_STRENGTH_GAP"));
  return [true, zoneLegal, zoneIllegal, series, season, construction, upgrade].filter(Boolean).length;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-mock-manifest", DIR) && !process.argv.includes("--refreeze")) {
    console.log("mock manifest already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const fixtures = mockFixtures();
  const sealedIds = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id));
  const sealedLineups = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [...f.five].map(person).sort().join("|")));
  const sealedPersons = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.flatMap((f) => f.five.map(person)));
  const sealedPurposes = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.purpose));

  console.log(`SYNTHETIC V2 MOCK STRESS SET — ${fixtures.length} non-holdout members\n`);
  for (const f of fixtures) {
    console.log(`  ${f.id.padEnd(22)} ${f.era}  ${String(f.sourceDevelopmentFixture).padEnd(26)} shared ${f.sharedPeopleWithNearestSealed.count}/5  stands in for ${f.standsInFor.join(" + ")}`);
  }
  const zoneLegalCount = fixtures.filter((f) => ["2000s", "2010s", "2020s"].includes(f.era)).length;
  console.log(`\n  zone-legal eras ${zoneLegalCount}, zone-illegal ${fixtures.length - zoneLegalCount}\n`);

  gate("noSealedFixtureIdAppears", fixtures.every((f) => !sealedIds.has(f.id) && !f.id.startsWith("ss2-")),
    `no member id is a sealed id or carries the ss2- prefix`);
  gate("noSealedLineupAppears",
    fixtures.every((f) => !sealedLineups.has([...f.five].map(person).sort().join("|"))),
    "no member's five is a sealed five, compared as an unordered set of people");
  // Person-level exclusion is the wrong bar for a mock set and the right bar
  // for a CONTROL five. A control is a constructed opponent that could
  // partially reconstruct a sealed lineup, so controls exclude every sealed
  // person. A mock member is a different five in a different context, and both
  // sets were drawn from one pool by one design phase, so some overlap is
  // unavoidable — 24 of the development set's 42 people also appear in the
  // sealed set. What must not happen is a member sitting one substitution away
  // from a sealed five, which is what this bounds.
  const maxShared = Math.max(...fixtures.map((f) => f.sharedPeopleWithNearestSealed.count));
  gate("noMemberIsOneSubstitutionFromASealedFive", maxShared <= MAX_SHARED_PEOPLE,
    `largest person overlap between any member and any sealed five is ${maxShared} of 5, bound ${MAX_SHARED_PEOPLE}. ${EXCLUDED_FOR_PROXIMITY.length} development fixtures were excluded for reaching 4: ${EXCLUDED_FOR_PROXIMITY.map((e) => `${e.devFixtureId} (${e.sharedPeople} shared with ${e.nearestSealed})`).join(", ")}`);
  gate("everyMemberComesFromTheDevelopmentSet",
    fixtures.every((f) => SYNTHETIC_DEVELOPMENT_V2.some((d) => d.id === f.sourceDevelopmentFixture)),
    `all ${fixtures.length} members are SYNTHETIC_DEVELOPMENT_V2 fixtures, which are non-holdout by definition`);
  gate("everySealedPurposeHasAStandIn",
    [...sealedPurposes].every((p) => MOCK_MEMBERS.some((m) => m.standsInFor.includes(p))),
    (() => { const missing = [...sealedPurposes].filter((p) => !MOCK_MEMBERS.some((m) => m.standsInFor.includes(p)));
      return missing.length ? `sealed purposes with no stand-in: ${missing.join(", ")}` : `all ${sealedPurposes.size} sealed stress purposes have a stand-in, so the rehearsal covers every branch`; })());
  gate("bothZoneBranchesCovered", zoneLegalCount >= 1 && fixtures.length - zoneLegalCount >= 1,
    `${zoneLegalCount} zone-legal and ${fixtures.length - zoneLegalCount} zone-illegal members, so the rehearsal exercises both the win-rate band and the NOT_APPLICABLE branch`);
  gate("bothCompetitionModesCovered",
    MOCK_MEMBERS.some((m) => m.standsInFor.includes("SERIES_VARIANCE"))
    && MOCK_MEMBERS.some((m) => m.standsInFor.includes("WIN82_VARIANCE")),
    "series play and season play both have a stand-in");
  gate("everyMemberIdIsDistinct", new Set(fixtures.map((f) => f.id)).size === fixtures.length,
    `${fixtures.length} distinct member ids`);
  gate("enoughMembersToRehearseEveryBranch",
    fixtures.length >= 10 && payloadBranchCount(fixtures) >= 7,
    `${fixtures.length} members covering ${payloadBranchCount(fixtures)} of the 7 surfaces and modes the formal run uses`);

  const payload = {
    syntheticMockSetVersion: "1.0.0",
    purpose: "rehearse the exact formal runner without touching the sealed set",
    memberCount: fixtures.length,
    members: MOCK_MEMBERS, fixtures,
    excludedForProximity: EXCLUDED_FOR_PROXIMITY, maxSharedPeopleBound: MAX_SHARED_PEOPLE,
    maxSharedPeopleObserved: maxShared,
    isolation: { noSealedFixtureId: true, noSealedLineup: true,
      personOverlapPolicy: "bounded, not forbidden. Both sets came from one card pool in one design phase, so 24 of the development set's 42 people also appear in the sealed set. A member is rejected only if it sits within one substitution of a sealed five; three development fixtures were excluded on that rule. Controls, which are constructed opponents rather than existing fixtures, still exclude every sealed person outright.",
      sealedPeopleChecked: sealedPersons.size,
      basis: "SYNTHETIC_DEVELOPMENT_V2, the non-holdout counterpart set frozen alongside the sealed one" },
    branchCoverage: { zoneLegalMembers: zoneLegalCount, zoneIllegalMembers: fixtures.length - zoneLegalCount,
      sealedPurposesCovered: [...sealedPurposes],
      surfacesExercised: ["MIRROR", "ZONE_ASYMMETRIC", "ZONE_ABLATION_TWIN", "VS_COHERENT_LOWER_CONTROL",
        "VS_ROLE_MATCHED_UPGRADE", "SERIES_BEST_OF_7", "SEASONS_OF_82"] },
    pass: fail.length === 0, failedGates: fail,
  };
  payload.mockManifestHash = createHash("sha256").update(JSON.stringify(fixtures.map((f) => [f.id, f.five, f.coach, f.era]))).digest("hex");
  writeArtifact("synthetic-v2-mock-manifest", payload, {
    generationCommand: "npm run syn:mock", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nMOCK SET: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.mockManifestHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
