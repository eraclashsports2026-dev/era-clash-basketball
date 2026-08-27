#!/usr/bin/env node
// ── Phase 6C4A WS2: instrumentation, target-access and resolution repairs ───
//   npm run c1:instrumentation
//
// Three audited defects from 6C3R, each repaired at the shared-module level and
// then proven repaired against the real stores:
//   1. Target availability read by object truthiness  -> readTargetValue()
//   2. Profile resolution tolerant of ambiguity        -> exact-id map + audit
//   3. Runner preflight on a simplified profile map    -> preflightProfileResolution()
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { readTargetValue, naiveTruthinessRead, VALUE_BEARING } from "../validation/targetAccess.mjs";
import { buildRunnerProfileMap, requiredProfileIds, preflightProfileResolution } from "../validation/profileMap.mjs";
import { loadCorpusV4, loadTargetsV4 } from "../validation/buildCorpusV4.mjs";
import { loadPlayersV4 } from "../validation/buildPlayersV4.mjs";
import { DIR } from "./failureRegister.mjs";

const extra = { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash };

// ── 1. target schema validation: the typed census vs the truthiness census ──
export const targetCensus = () => {
  const targets = loadTargetsV4();
  const perField = {}; const violations = [];
  let typedUsable = 0, naiveAvailable = 0, entriesTotal = 0;
  for (const rec of targets.records) {
    for (const field of Object.keys(rec.teamTargets)) {
      entriesTotal += 1;
      const t = readTargetValue(rec.teamTargets[field]);
      const n = naiveTruthinessRead(rec.teamTargets[field]);
      perField[field] ??= { usable: 0, legitimatelyNull: 0, violations: 0 };
      if (t.usable) { typedUsable += 1; perField[field].usable += 1; }
      else if (t.reason === "LEGITIMATELY_NULL") perField[field].legitimatelyNull += 1;
      else { perField[field].violations += 1; violations.push({ fixtureId: rec.fixtureId, field, reason: t.reason, availability: t.availability }); }
      if (n) naiveAvailable += 1;
    }
  }
  return { records: targets.records.length, entriesTotal, typedUsable, naiveAvailable, perField, violations };
};

// ── 2. profile resolution audit: exact-title, exact-id, ambiguity counted ───
export const profileAudit = async () => {
  const map = await buildRunnerProfileMap();
  const v4 = loadPlayersV4();
  const { loadPlayers } = await import("../calibration/build-players-v3.mjs");
  const v3 = loadPlayers();
  const all = [...v3.profiles, ...v4.profiles];

  // last-name collision census across the combined store: every collision is a
  // profile last-name-only matching could silently mis-resolve
  const byLast = new Map();
  for (const p of all) {
    const last = p.name.trim().split(/\s+/).at(-1).toLowerCase();
    if (!byLast.has(last)) byLast.set(last, new Set());
    byLast.get(last).add(p.calibrationPersonId);
  }
  const collisions = [...byLast.entries()].filter(([, s]) => s.size > 1)
    .map(([last, s]) => ({ lastName: last, distinctPersons: s.size }));

  // resolution-route check. Three legitimate shapes, one prohibited one:
  //   EXACT_PLAYER_TITLE   slug is the player's full (possibly disambiguated) name
  //   TEAM_SEASON_SOURCE   numbers parsed from the team-season article by design
  //   ALIAS_TITLE          a distinct exact article title (Satch Sanders, JJ Redick)
  //   BARE_SURNAME         prohibited: resolving by last name alone
  const routes = { EXACT_PLAYER_TITLE: 0, TEAM_SEASON_SOURCE: 0, ALIAS_TITLE: 0 };
  const aliasTitles = []; const bareSurname = [];
  for (const p of all) {
    const slug = decodeURIComponent(new URL(p.provenance.sourceUrl).pathname.replace("/wiki/", "")).replace(/_/g, " ");
    const base = slug.replace(/\s*\(.*\)$/, "").toLowerCase();
    const name = p.name.trim().toLowerCase();
    const last = name.split(/\s+/).at(-1);
    if (base === name) routes.EXACT_PLAYER_TITLE += 1;
    else if (/season$/.test(base) || /^\d{4}/.test(base)) routes.TEAM_SEASON_SOURCE += 1;
    else if (base === last) bareSurname.push({ id: p.calibrationPlayerId, name: p.name, slug });
    else { routes.ALIAS_TITLE += 1; aliasTitles.push({ id: p.calibrationPlayerId, name: p.name, slug }); }
  }

  return {
    combinedProfiles: all.length, v3Profiles: v3.profiles.length, v4Profiles: v4.profiles.length,
    unresolved: (v3.unresolvedCount ?? 0) + (v4.unresolvedCount ?? 0),
    mapSize: map.size, duplicateIds: all.length - map.size,
    lastNameCollisions: collisions.length,
    worstCollisions: collisions.sort((a, b) => b.distinctPersons - a.distinctPersons).slice(0, 8),
    resolutionRoutes: routes, aliasTitles, bareSurnameResolutions: bareSurname,
    rule: "Profiles are resolved by exact calibrationPlayerId; profile articles by exact (disambiguated) title. Last-name-only matching is prohibited: the combined store proves it ambiguous.",
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const census = targetCensus();
  writeArtifact("target-schema-validation", {
    accessor: "readTargetValue (scripts/validation/targetAccess.mjs)",
    valueBearingStatuses: VALUE_BEARING,
    defectRepaired: "6C3R census read availability by object truthiness; an entry {value:null} is truthy, so it reported every field available",
    census,
    truthinessOverreport: census.naiveAvailable - census.typedUsable,
    schemaViolations: census.violations.length,
    pass: census.violations.length === 0 && census.typedUsable < census.naiveAvailable,
  }, { generationCommand: "npm run c1:instrumentation", dir: DIR, extra });
  console.log(`targets: ${census.entriesTotal} entries · typed usable ${census.typedUsable} · naive "available" ${census.naiveAvailable} · violations ${census.violations.length}`);

  profileAudit().then(async (audit) => {
    writeArtifact("profile-resolution-audit", { ...audit, pass: audit.unresolved === 0 && audit.bareSurnameResolutions.length === 0 && audit.duplicateIds === 0 },
      { generationCommand: "npm run c1:instrumentation", dir: DIR, extra });
    console.log(`profiles: ${audit.combinedProfiles} combined · map ${audit.mapSize} · last-name collisions ${audit.lastNameCollisions} · alias titles ${audit.aliasTitles.length} · bare-surname resolutions ${audit.bareSurnameResolutions.length}`);

    // ── 3. runner preflight audit: exact map vs the simplified map ──────────
    const corpus = loadCorpusV4();
    const exact = await preflightProfileResolution(corpus.fixtures);
    const v4Only = new Map(loadPlayersV4().profiles.map((p) => [p.calibrationPlayerId, p]));
    const required = requiredProfileIds(corpus.fixtures);
    const missingUnderSimplified = [...required].filter((id) => !v4Only.has(id));
    writeArtifact("runner-preflight-audit", {
      rule: "A sealed-set runner preflights profile resolution through buildRunnerProfileMap() — the exact map the run dereferences — over every fixture player AND every era-reference five member, before any unlock is consumed.",
      defectRepaired: "The V4 dry run preflighted a simplified V4-only map; the real runner crashed on the first era-reference build AFTER consuming its unlock.",
      exactMap: { required: exact.required, resolved: exact.resolved, missing: exact.missing, pass: exact.pass },
      simplifiedMapWouldHaveMissed: missingUnderSimplified.length,
      simplifiedMapMissingSample: missingUnderSimplified.slice(0, 10),
      pass: exact.pass && missingUnderSimplified.length > 0,
    }, { generationCommand: "npm run c1:instrumentation", dir: DIR, extra });
    console.log(`runner preflight: exact map resolves ${exact.resolved}/${exact.required} · simplified map would miss ${missingUnderSimplified.length}`);
  });
}
