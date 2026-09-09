#!/usr/bin/env node
// ── WS8c + the V6 manifest: freeze everything the formal run will read ──────
//   npm run v6:manifest
//
// After this artifact exists, no profile, coach, target, trait, reference or
// margin may change without a new holdout version. The trait policy is written
// alongside it because the two answer one question from opposite ends: which
// traits may be scored at all, and which traits each specific side actually
// claims.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { TRAIT_TABLE, DEPENDENCY_GROUPS, registryHash } from "../validation/traitRegistry.mjs";
import { METRICS } from "../validation/surface.mjs";
import { getCoach } from "../../src/v3/coaches.js";
import { DIR, C1D } from "./reconcile.mjs";
import { specIndex, allProfiles } from "./targets.mjs";

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

/** Coach verification recorded at store-build time, keyed by fixture id. */
export const coachChecks = () => {
  const m = new Map();
  for (const p of ["data/validation/6c3r/calibration-players-v4.json",
    "data/validation/6c4a/calibration-players-v5.json",
    `${DIR}/calibration-players-v6.json`]) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    for (const c of ((raw.data ?? raw).coachChecks ?? [])) m.set(c.fixtureId, c);
  }
  return m;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("historical-holdout-v6-manifest", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-holdout-v6-manifest already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const sel = readArtifact("historical-v6-selection", DIR).data;
  const pool = readArtifact("historical-v6-expanded-pool", DIR).data;
  const obs = readArtifact("historical-v6-observability-certification", DIR);
  const refs = readArtifact("era-reference-certification-candidate2", DIR);
  const margins = readArtifact("historical-v6-practical-margins", DIR).data;
  const verdict = readArtifact("historical-v6-verdict-policy", DIR).data;
  const targets = readArtifact("historical-v6-targets", DIR).data;
  const c2lock = readArtifact("candidate2-lock", C1D).data;

  const specs = specIndex();
  const profiles = allProfiles();
  const checks = coachChecks();
  const eligibleTraits = new Set(obs.data.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const certifiedRefs = new Map(refs.data.references.map((r) => [r.era, r]));
  const targetRows = new Map(targets.rows.map((r) => [`${r.matchupId}|${r.side}`, r]));
  const poolByKey = new Map(pool.eligible.map((t) => [t.key, t]));

  console.log("HISTORICAL HOLDOUT V6 MANIFEST\n");
  const frozenProfiles = []; const frozenCoaches = new Map();
  const matchups = sel.matchups.map((m) => {
    const sides = ["teamA", "teamB"].map((side) => {
      const s = m[side];
      const spec = specs.get(`${s.teamName}|${s.season}`);
      const five = profiles.filter((p) => p.teamName === s.teamName && p.season === s.season);
      const players = five.map((prof) => {
        const slotFromSpec = (spec?.five ?? []).find((f) => f.name === prof.name)?.slot ?? prof.primaryPosition;
        const row = {
          calibrationPlayerId: prof.calibrationPlayerId, calibrationPersonId: prof.calibrationPersonId,
          name: prof.name, season: prof.season, teamId: prof.teamId,
          assignedPosition: slotFromSpec, primaryPosition: prof.primaryPosition,
          sourceUrl: prof.provenance?.sourceUrl ?? null, sourceRevisionId: prof.provenance?.revisionId ?? null,
          membershipRoute: prof.provenance?.membershipRoute ?? null, confidence: prof.confidence,
          basicStats: prof.basicStats,
        };
        row.profileHash = sha(row);
        frozenProfiles.push(row);
        return row;
      });
      const coachRec = getCoach(s.coachId);
      const check = checks.get(spec?.fixtureId) ?? null;
      if (!frozenCoaches.has(s.coachId)) {
        frozenCoaches.set(s.coachId, {
          coachId: s.coachId, name: coachRec?.name ?? null, seasonVerifiedOn: s.season,
          sourceEvidence: check?.verification ?? null, sourceUrl: check?.sourceUrl ?? null,
          systemFields: { offense: coachRec?.offense ?? null, defense: coachRec?.defense ?? null,
            management: coachRec?.management ?? null },
          confidence: check?.verification === "SEASON_PAGE_NAMES_COACH" ? "SEASON_PAGE_VERIFIED" : "UNVERIFIED",
          recordHash: sha(coachRec ?? s.coachId),
        });
      }
      const descriptors = spec?.identity
        ? [spec.identity.pace, spec.identity.offense, spec.identity.defense, ...(spec.identity.tags ?? [])]
        : [];
      const scored = descriptors.filter((d) => eligibleTraits.has(d)).map((traitId) => ({
        traitId, observabilityClass: TRAIT_TABLE[traitId]?.cls ?? null,
        metric: TRAIT_TABLE[traitId]?.claim?.metric ?? null,
        direction: TRAIT_TABLE[traitId]?.claim?.direction ?? null,
        surface: TRAIT_TABLE[traitId]?.claim?.metric
          ? METRICS[TRAIT_TABLE[traitId].claim.metric].identifiableOn[0] : null,
        practicalMargin: TRAIT_TABLE[traitId]?.claim?.metric
          ? margins.metrics[TRAIT_TABLE[traitId].claim.metric]?.margin ?? null : null,
        confidence: "MEDIUM",
      }));
      const excluded = descriptors.filter((d) => !eligibleTraits.has(d)).map((traitId) => ({
        traitId,
        reason: !(traitId in TRAIT_TABLE) ? "NOT_IN_TRAIT_REGISTRY"
          : !TRAIT_TABLE[traitId].claim?.metric ? "NO_DIRECTIONAL_CLAIM"
            : "METRIC_NOT_CERTIFIED_UNDER_CANDIDATE_2",
        metric: TRAIT_TABLE[traitId]?.claim?.metric ?? null,
      }));
      return { fixtureId: spec?.fixtureId ?? null, key: s.key, teamId: s.teamId, teamName: s.teamName,
        season: s.season, eraStyleId: m.eraStyleId, coachId: s.coachId, players,
        documentedStyle: spec?.documentedStyle ?? null, identity: spec?.identity ?? null,
        scoredTraits: scored, excludedTraits: excluded,
        targets: targetRows.get(`${m.matchupId}|${side}`) ?? null,
        fiveKey: [...new Set(five.map((p) => p.calibrationPersonId))].sort().join("|"),
        nearestSeenLineupShared: poolByKey.get(s.key)?.nearestSeenLineup?.shared ?? null };
    });
    const ref = certifiedRefs.get(m.eraStyleId);
    return { matchupId: m.matchupId, eraStyleId: m.eraStyleId, teamA: sides[0], teamB: sides[1],
      tacticalDistance: m.tacticalDistance, scoreableMetrics: m.scoreableMetrics,
      eraReference: { era: m.eraStyleId, five: ref.five.map((p) => p.person ?? p), coach: ref.coach,
        referenceHash: ref.frozenReferenceHash, selfBaselines: ref.candidate2SelfBaselines },
      surfaces: verdict.protocol.surfacesPerMatchup };
  });

  const allPlayers = matchups.flatMap((m) => [...m.teamA.players, ...m.teamB.players]);
  const allTraits = matchups.flatMap((m) => [...m.teamA.scoredTraits, ...m.teamB.scoredTraits]);
  const allExcluded = matchups.flatMap((m) => [...m.teamA.excludedTraits, ...m.teamB.excludedTraits]);
  for (const m of matchups) {
    console.log(`  ${m.eraStyleId}  ${(m.teamA.teamName + " " + m.teamA.season).padEnd(30)} vs ${(m.teamB.teamName + " " + m.teamB.season).padEnd(30)} traits ${m.teamA.scoredTraits.length}+${m.teamB.scoredTraits.length} · excluded ${m.teamA.excludedTraits.length + m.teamB.excludedTraits.length}`);
  }
  console.log("");

  gate("everyPlayerResolves", allPlayers.length === 80 && allPlayers.every((p) => p.profileHash && p.calibrationPersonId),
    `${allPlayers.length} player profiles frozen with hashes`);
  gate("noDuplicatePersonWithinATeam",
    matchups.every((m) => [m.teamA, m.teamB].every((t) => new Set(t.players.map((p) => p.calibrationPersonId)).size === 5)),
    "each of the sixteen fives is five distinct persons");
  gate("everyPositionLegal",
    matchups.every((m) => [m.teamA, m.teamB].every((t) => new Set(t.players.map((p) => p.assignedPosition)).size === 5)),
    "each five fills PG/SG/SF/PF/C exactly once");
  gate("everyCoachResolves",
    [...frozenCoaches.values()].every((c) => c.name && c.sourceEvidence === "SEASON_PAGE_NAMES_COACH"),
    `${frozenCoaches.size} distinct coaches, each named on its season page`);
  gate("everyEraStyleResolves", matchups.every((m) => certifiedRefs.has(m.eraStyleId)),
    `${new Set(matchups.map((m) => m.eraStyleId)).size} era styles, each with a Candidate 2 certified reference`);
  gate("everyScoredTraitObservable",
    allTraits.every((t) => eligibleTraits.has(t.traitId) && t.metric && t.surface),
    `${allTraits.length} scored traits, all certified under Candidate 2, each with a metric, a surface and a margin`);
  gate("everyMetricHasAUnitAndMargin", allTraits.every((t) => t.practicalMargin != null),
    "every scored trait carries the frozen practical margin for its metric");
  gate("everyExcludedTraitHasAReason", allExcluded.every((t) => t.reason),
    `${allExcluded.length} excluded descriptors, each naming why: ${Object.entries(allExcluded.reduce((a, t) => { a[t.reason] = (a[t.reason] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  gate("everySideHasAtLeastOneScoredTrait",
    matchups.every((m) => m.teamA.scoredTraits.length >= 1 && m.teamB.scoredTraits.length >= 1),
    `fewest scored traits on any side: ${Math.min(...matchups.flatMap((m) => [m.teamA.scoredTraits.length, m.teamB.scoredTraits.length]))}`);
  gate("baselinesKeyedByMetricId",
    matchups.every((m) => m.eraReference.selfBaselines?.pppVsReference?.mean != null
      && m.eraReference.selfBaselines?.gamePace?.mean != null),
    "self-baselines resolve by METRIC ID, not sample field — the defect the V5 dry run caught before it could waste a one-time access");
  gate("everyScoredTraitHasABaseline",
    allTraits.every((t) => matchups.some((m) => m.eraReference.selfBaselines?.[t.metric]?.mean != null)),
    "every scored metric has a Candidate 2 reference baseline to compare against");
  gate("unavailableTargetsStayNull",
    matchups.every((m) => [m.teamA, m.teamB].every((t) => Object.values(t.targets?.teamTargets ?? {})
      .every((v) => (v.usable ? typeof v.value === "number" : v.value === null)))),
    "every unusable target field is null on all sixteen sides, never zero");
  gate("bothRepairedMechanismsScored",
    allTraits.some((t) => t.metric === "assistedRate") && allTraits.some((t) => t.metric === "refPppVsTeam"),
    `assistedRate on ${allTraits.filter((t) => t.metric === "assistedRate").length} scored traits, refPppVsTeam on ${allTraits.filter((t) => t.metric === "refPppVsTeam").length}`);

  const payload = {
    historicalHoldoutV6ManifestVersion: "1.0.0",
    set: "historical-holdout-v6",
    selectionVersion: sel.historicalV6SelectionVersion, selectionHash: sel.selectionHash,
    candidatePoolHash: pool.poolHash,
    matchupCount: matchups.length, teamCount: matchups.length * 2,
    playerProfileCount: allPlayers.length, coachCount: frozenCoaches.size,
    scoredTraitCount: allTraits.length, excludedTraitCount: allExcluded.length,
    scoredMetrics: [...new Set(allTraits.map((t) => t.metric))].sort(),
    matchups,
    frozenCoaches: [...frozenCoaches.values()],
    eraReferenceIds: matchups.map((m) => ({ era: m.eraStyleId, referenceHash: m.eraReference.referenceHash })),
    hashes: {
      traitPolicyHash: obs.data.certificationHash,
      practicalMarginPolicyHash: margins.policyHash,
      verdictPolicyHash: verdict.policyHash,
      eraReferenceCertificationHash: refs.data.certificationHash,
      targetsHash: targets.targetsHash,
      candidate2CoreHash: c2lock.coreHash,
      candidate2ParameterSetHash: def.parameterSetHash,
      candidate2CalibrationVersion: c2lock.possessionCalibrationVersion,
      traitRegistryHash: registryHash(),
    },
    profileFreeze: { profiles: frozenProfiles.length, allHashed: frozenProfiles.every((p) => p.profileHash) },
    targetFreeze: { rows: matchups.length * 2,
      usableTeamTargets: matchups.reduce((a, m) => a + [m.teamA, m.teamB]
        .reduce((b, t) => b + Object.values(t.targets?.teamTargets ?? {}).filter((v) => v.usable).length, 0), 0),
      nullTargets: matchups.reduce((a, m) => a + [m.teamA, m.teamB]
        .reduce((b, t) => b + Object.values(t.targets?.teamTargets ?? {}).filter((v) => !v.usable).length, 0), 0),
      note: "A null target contributes no error, no pass credit and no failure. It is never zero-filled." },
    immutability: "No profile, coach, target, trait, reference or margin may change after this manifest. A change requires a new holdout version.",
    pass: fail.length === 0, failedGates: fail,
  };
  payload.manifestHash = sha({ matchups: matchups.map((m) => [m.matchupId, m.teamA.key, m.teamB.key,
    m.teamA.players.map((p) => p.profileHash), m.teamB.players.map((p) => p.profileHash)]), hashes: payload.hashes });
  writeArtifact("historical-holdout-v6-manifest", payload, {
    generationCommand: "npm run v6:manifest", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS8c: the trait policy ───────────────────────────────────────────────
  const byMetric = {};
  for (const t of allTraits) (byMetric[t.metric] ??= []).push(t.traitId);
  const traitPolicy = {
    historicalV6TraitPolicyVersion: "1.0.0",
    governs: "which identity descriptors may be scored on Historical Holdout V6, on what surface, against what baseline, and what happens to the rest",
    vocabulary: {
      source: "scripts/validation/traitRegistry.mjs, keyed by the descriptor string",
      registryHash: registryHash(), traitsInRegistry: Object.keys(TRAIT_TABLE).length,
      projection: "data/validation/corpus-v6-spec.mjs STYLE_TO_REGISTRY projects documented prose onto the registry vocabulary, mechanically and identically for every fixture. The prose is retained as documentedStyle.",
      whyProjectionExists: "the registry is keyed by string, so prose resolves to no trait and no claim. 50 of 92 wave-two descriptors matched nothing, and three sides had no scoreable trait at all.",
      neverStrengthened: "a prose term maps only to a term of equal or weaker claim. STRONG_DEFENSE is not mapped to ELITE_DEFENSE: promoting a documented claim to make it scoreable would manufacture evidence.",
    },
    eligibility: {
      rule: "a descriptor is scored only if the Candidate 2 observability certification marks it scoringEligible, which requires its metric to have certified under Candidate 2",
      certificationArtifact: "historical-v6-observability-certification",
      metricsCertified: obs.data.metricsCertified, metricsTotal: obs.data.metricsTotal,
      certifiedMetrics: obs.data.certifiedMetrics, uncertifiedMetrics: obs.data.failedMetrics,
      lostSinceCandidate1: obs.data.metricsChangedFromCandidate1,
      lostSinceCandidate1Note: "interiorShotShare certified under Candidate 1 and does not under Candidate 2: its strong control no longer separates from neutral. Recorded as a scope reduction attributable to the assisted-offence repair. Raising the sample size until it certified would be choosing the protocol after seeing the result.",
    },
    scoring: {
      surfaceRule: "each metric is read only on the surface its registry entry declares identifiable, and offence and defence are never read from one mirror",
      baseline: "the Candidate 2 era-reference self-baselines, keyed by metric id",
      perTrait: verdict.traitGates.perTrait,
      aggregationUnit: verdict.aggregation.unit,
      duplicateLabels: "two descriptors on one side claiming the same metric, surface and direction are two labels on ONE measurement. Both are reported; the evidence count collapses to one cluster.",
      duplicatesPresent: Object.entries(byMetric).filter(([, ids]) => ids.length > 1)
        .map(([metric, ids]) => ({ metric, labels: ids.length })),
    },
    exclusion: {
      rule: "an excluded descriptor contributes no error, no pass credit and no failure. It is not scored, not approximated and not zero-filled.",
      reasons: allExcluded.reduce((a, t) => { a[t.reason] = (a[t.reason] ?? 0) + 1; return a; }, {}),
      excludedDescriptors: [...new Set(allExcluded.map((t) => t.traitId))].sort(),
    },
    dependencyGroups: DEPENDENCY_GROUPS,
    repairedMechanismCoverage: sel.requiredMetricCoverage,
    perSide: matchups.flatMap((m) => [m.teamA, m.teamB].map((t) => ({
      key: t.key, eraStyleId: t.eraStyleId,
      scoredTraits: t.scoredTraits.map((x) => ({ traitId: x.traitId, metric: x.metric, direction: x.direction, surface: x.surface, margin: x.practicalMargin })),
      excludedTraits: t.excludedTraits,
    }))),
    pass: fail.length === 0,
  };
  traitPolicy.traitPolicyHash = sha(traitPolicy);
  writeArtifact("historical-v6-trait-policy", traitPolicy, {
    generationCommand: "npm run v6:manifest", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nmatchups ${payload.matchupCount} · teams ${payload.teamCount} · profiles ${payload.playerProfileCount} · coaches ${payload.coachCount} · scored traits ${payload.scoredTraitCount} · excluded ${payload.excludedTraitCount}`);
  console.log(`scored metrics: ${payload.scoredMetrics.join(", ")}`);
  console.log(`MANIFEST: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.manifestHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
