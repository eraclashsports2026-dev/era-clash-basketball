#!/usr/bin/env node
// ── WS10: freeze the V5 manifest, profiles, coaches and targets ─────────────
//   npm run v5:manifest
//
// Everything the formal run will read, pinned by hash before the set is
// sealed. After this artifact exists no profile, coach, target, trait or
// reference may change without a new holdout version.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { readTargetValue } from "../validation/targetAccess.mjs";
import { loadPlayersV4 } from "../validation/buildPlayersV4.mjs";
import { loadCorpusV4, loadTargetsV4 } from "../validation/buildCorpusV4.mjs";
import { TRAIT_TABLE } from "../validation/traitRegistry.mjs";
import { METRICS } from "../validation/surface.mjs";
import { getCoach } from "../../src/v3/coaches.js";
import { DIR } from "./preflight6c4b1.mjs";
import { PLAYERS_V5_PATH } from "./poolV2.mjs";

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const sel = readArtifact("historical-v5-selection", DIR);
  const pool = readArtifact("historical-v5-candidate-pool-v2", DIR);
  const policy = readArtifact("historical-holdout-v5-policy", DIR);
  const margins = readArtifact("trait-practical-margin-policy-v5", DIR);
  const obs = readArtifact("historical-observability-certification-candidate1", DIR);
  const refs = readArtifact("era-reference-certification-candidate1", DIR);
  const recert = readArtifact("candidate1-lock-recertification", DIR);
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };
  // Frozen artifacts refuse silent overwrite: a re-issue is a decision.
  if (artifactExists("historical-holdout-v5-manifest", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-holdout-v5-manifest already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const v4store = loadPlayersV4();
  const v5store = JSON.parse(readFileSync(PLAYERS_V5_PATH, "utf8"));
  const profiles = new Map([...v4store.profiles, ...v5store.profiles].map((p) => [p.calibrationPlayerId, p]));
  const corpusV4 = loadCorpusV4();
  const targetsV4 = new Map(loadTargetsV4().records.map((r) => [r.fixtureId, r]));
  const poolTeams = new Map(pool.data.teams.map((t) => [t.fixtureId, t]));
  const eligibleTraits = new Set(obs.data.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const certifiedRefs = new Map(refs.data.references.map((r) => [r.era, r]));

  console.log("HISTORICAL HOLDOUT V5 MANIFEST\n");
  const frozenProfiles = []; const frozenCoaches = new Map(); const frozenTargets = [];
  const matchups = sel.data.matchups.map((m) => {
    const sides = ["teamA", "teamB"].map((side) => {
      const fid = m[side];
      const t = poolTeams.get(fid);
      const fx = corpusV4.fixtures.find((f) => f.fixtureId === fid) ?? null;
      const players = t.players.map((p) => {
        const prof = profiles.get(p.calibrationPlayerId);
        const row = {
          calibrationPlayerId: prof.calibrationPlayerId, calibrationPersonId: prof.calibrationPersonId,
          name: prof.name, season: prof.season, teamId: prof.teamId, assignedPosition: p.assignedPosition,
          primaryPosition: prof.primaryPosition,
          sourceUrl: prof.provenance.sourceUrl, sourceRevisionId: prof.provenance.revisionId,
          membershipRoute: prof.provenance.membershipRoute, confidence: prof.confidence,
          basicStats: prof.basicStats,
          profileHash: sha(prof),
        };
        frozenProfiles.push(row);
        return row;
      });
      const coachRec = getCoach(t.coachId);
      if (!frozenCoaches.has(t.coachId)) {
        frozenCoaches.set(t.coachId, {
          coachId: t.coachId, name: coachRec?.name ?? null,
          seasonVerifiedOn: t.season, sourceEvidence: t.coachVerification,
          systemFields: { offense: coachRec?.offense ?? null, defense: coachRec?.defense ?? null, management: coachRec?.management ?? null },
          confidence: "SEASON_PAGE_VERIFIED",
          recordHash: sha(coachRec ?? t.coachId),
        });
      }
      // targets, read through the typed accessor; unavailable stays null
      const tgt = targetsV4.get(fid) ?? null;
      const teamTargets = Object.fromEntries(Object.entries(tgt?.teamTargets ?? {}).map(([k, e]) => {
        const v = readTargetValue(e);
        return [k, { value: v.usable ? v.value : null, availability: e.availability, usable: v.usable,
          provenance: v.usable ? e.provenance?.sourceUrl ?? null : null }];
      }));
      const unit = tgt?.unitTargets ?? null;
      const targetRow = { fixtureId: fid, teamTargets,
        shareTargets: unit ? Object.fromEntries(Object.entries(unit).filter(([k]) => k.startsWith("player"))) : {},
        shareFormula: unit?.formula ?? null, availabilityClass: unit?.availability ?? null,
        provenance: unit?.provenance?.sourceUrl ?? null };
      frozenTargets.push(targetRow);

      const scored = t.observableTraits.map((traitId) => ({
        traitId, observabilityClass: TRAIT_TABLE[traitId]?.cls ?? null,
        metric: TRAIT_TABLE[traitId]?.claim?.metric ?? null,
        direction: TRAIT_TABLE[traitId]?.claim?.direction ?? null,
        surface: TRAIT_TABLE[traitId]?.claim?.metric ? METRICS[TRAIT_TABLE[traitId].claim.metric].identifiableOn[0] : null,
        practicalMargin: TRAIT_TABLE[traitId]?.claim?.metric ? margins.data.metrics[TRAIT_TABLE[traitId].claim.metric]?.margin ?? null : null,
        confidence: "MEDIUM",
      }));
      const excludedTraits = t.claimedTraits.filter((c) => !eligibleTraits.has(c)).map((traitId) => ({
        traitId, reason: TRAIT_TABLE[traitId] ? "METRIC_NOT_CERTIFIED_UNDER_CANDIDATE_1" : "NOT_IN_TRAIT_REGISTRY" }));
      return { fixtureId: fid, teamId: t.teamId, teamName: t.teamName, season: t.season,
        eraStyleId: t.eraStyleId, coachId: t.coachId, players, scoredTraits: scored, excludedTraits,
        targets: targetRow, fiveKey: t.fiveKey };
    });
    const ref = certifiedRefs.get(m.era);
    return { matchupId: m.matchupId, eraStyleId: m.era, pairType: m.pairType,
      teamA: sides[0], teamB: sides[1],
      eraReference: { era: m.era, five: ref.five.map((p) => p.id), coach: ref.coach,
        referenceHash: ref.frozenReferenceHash,
        selfBaselines: ref.candidate1SelfBaselines },
      surfaces: policy.data.protocol.surfacesPerMatchup };
  });

  const allPlayers = matchups.flatMap((m) => [...m.teamA.players, ...m.teamB.players]);
  const allTraits = matchups.flatMap((m) => [...m.teamA.scoredTraits, ...m.teamB.scoredTraits]);
  gate("everyPlayerResolves", allPlayers.length === 80 && allPlayers.every((p) => p.profileHash && p.calibrationPersonId),
    `${allPlayers.length} player profiles frozen with hashes`);
  gate("noDuplicatePersonWithinATeam", matchups.every((m) => [m.teamA, m.teamB].every((t) => new Set(t.players.map((p) => p.calibrationPersonId)).size === 5)),
    "each of the sixteen fives is five distinct persons");
  gate("everyPositionLegal", matchups.every((m) => [m.teamA, m.teamB].every((t) => new Set(t.players.map((p) => p.assignedPosition)).size === 5)),
    "each five fills PG/SG/SF/PF/C exactly once");
  gate("everyCoachResolves", [...frozenCoaches.values()].every((c) => c.name && c.sourceEvidence === "SEASON_PAGE_NAMES_COACH"),
    `${frozenCoaches.size} distinct coaches, each named on its season page`);
  gate("everyEraStyleResolves", matchups.every((m) => certifiedRefs.has(m.eraStyleId)), `${new Set(matchups.map((m) => m.eraStyleId)).size} era styles, each with a certified reference`);
  gate("everyScoredTraitObservable", allTraits.every((t) => eligibleTraits.has(t.traitId) && t.metric && t.surface),
    `${allTraits.length} scored traits, all certified under Candidate 1, each with a metric, a surface and a margin`);
  gate("everyMetricHasAUnitAndMargin", allTraits.every((t) => t.practicalMargin != null), "every scored trait carries the frozen practical margin for its metric");
  gate("unavailableTargetsStayNull", frozenTargets.every((t) => Object.values(t.teamTargets).every((v) => v.usable ? typeof v.value === "number" : v.value === null)),
    `${frozenTargets.length} target rows: every unusable field is null, never zero`);
  gate("everyTargetHasProvenance", frozenTargets.every((t) => Object.entries(t.teamTargets).every(([, v]) => !v.usable || v.provenance)),
    "every usable target names its source");

  const payload = {
    historicalHoldoutManifestVersion: VALIDATION_VERSIONS.historicalHoldoutV5ManifestVersion,
    holdoutVersion: VALIDATION_VERSIONS.historicalHoldoutV5SetVersion,
    set: "historical-holdout-v5",
    selectionVersion: sel.data.historicalV5SelectionVersion,
    selectionHash: sel.data.selectionHash,
    candidatePoolHash: pool.data.poolHash,
    matchupCount: matchups.length, teamCount: matchups.length * 2,
    playerProfileCount: allPlayers.length, coachCount: frozenCoaches.size,
    scoredTraitCount: allTraits.length,
    excludedTraitCount: matchups.reduce((a, m) => a + m.teamA.excludedTraits.length + m.teamB.excludedTraits.length, 0),
    matchups,
    frozenCoaches: [...frozenCoaches.values()],
    eraReferenceIds: matchups.map((m) => ({ era: m.eraStyleId, referenceHash: m.eraReference.referenceHash })),
    hashes: {
      traitPolicyHash: obs.outputHash,
      practicalMarginPolicyHash: margins.data.policyHash,
      acceptancePolicyHash: policy.data.policyHash,
      eraReferenceCertificationHash: refs.outputHash,
      candidate1CoreHash: recert.data.coreHash,
      candidate1ParameterSetHash: def.parameterSetHash,
      candidate1CalibrationVersion: recert.data.possessionCalibrationVersion,
    },
    profileFreeze: { profiles: frozenProfiles.length, allHashed: frozenProfiles.every((p) => p.profileHash) },
    targetFreeze: { rows: frozenTargets.length,
      usableTeamTargets: frozenTargets.reduce((a, t) => a + Object.values(t.teamTargets).filter((v) => v.usable).length, 0),
      nullTargets: frozenTargets.reduce((a, t) => a + Object.values(t.teamTargets).filter((v) => !v.usable).length, 0),
      note: "A null target contributes no error, no pass credit and no failure. It is never zero-filled." },
    immutability: "No profile, coach, target, trait, reference or margin may change after this manifest. A change requires a new holdout version.",
    pass: fail.length === 0, failedGates: fail,
  };
  payload.manifestHash = createHash("sha256").update(JSON.stringify({ matchups: matchups.map((m) => [m.matchupId, m.teamA.fixtureId, m.teamB.fixtureId, m.teamA.players.map((p) => p.profileHash), m.teamB.players.map((p) => p.profileHash)]), hashes: payload.hashes })).digest("hex");
  writeArtifact("historical-holdout-v5-manifest", payload, {
    generationCommand: "npm run v5:manifest", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nmatchups ${payload.matchupCount} · teams ${payload.teamCount} · profiles ${payload.playerProfileCount} · coaches ${payload.coachCount} · scored traits ${payload.scoredTraitCount} · excluded ${payload.excludedTraitCount}`);
  console.log(`MANIFEST: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.manifestHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
