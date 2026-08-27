#!/usr/bin/env node
// ── WS5 + WS6: offensive-role backfill and defensive-evidence inheritance ────
//   npm run d0:backfill
//
// Writes data/calibration/calibration-enrichment-v1.json. The base stores are
// never modified — enrichment FILLS nulls through the registry merge and every
// entry carries method, confidence and provenance.
//
// Forbidden inputs, enforced by construction: no V5/V6 trait label, no V5/V6
// result, no era-reference output and no team-name lookup appears anywhere in
// this derivation. Inputs are: the base season record, the linked public card's
// award counts, and the linked public intelligence profile where one exists.
import { readFileSync, writeFileSync } from "node:fs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { PLAYERS } from "../../src/players.js";
import INTELLIGENCE from "../../src/v3/data/intelligence.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { DIR, sha, r2 } from "./paths.mjs";
import { loadRegisteredProfiles } from "../validation/storeRegistry.mjs";

const ENRICH_PATH = "data/calibration/calibration-enrichment-v1.json";
const DERIVATION_VERSION = "calibrationRoleDerivationVersion 1.0.0";

/** The closed role vocabulary — exactly the public Player Intelligence set. */
export const ROLE_VOCABULARY = Object.freeze([...new Set(Object.values(INTELLIGENCE)
  .flatMap((p) => [p.roles?.primary, ...(p.roles?.secondary ?? [])]).filter(Boolean))].sort());

/**
 * Deterministic capability→role predicates, in the closed vocabulary. Each
 * returns a margin above its threshold; the largest margin selects primary.
 * These mirror the thresholds src/v3/teamIntelligence.js uses for coverage and
 * are documented proxies on capability fields the adapter derives from box
 * production — never from validation labels or results.
 */
export const ROLE_PREDICATES = Object.freeze({
  "Primary Creator": (p) => p.offense.selfCreation - 7.5,
  "Secondary Creator": (p) => Math.min(p.offense.selfCreation - 6, 7.4 - p.offense.selfCreation),
  "Floor General": (p) => Math.min(p.offense.passingVision - 7, ["PG"].includes(p.pos) ? 3 : -1),
  "Connector": (p) => Math.min(p.fit.connectivity - 6.5, p.offense.passingVision - 6),
  "Post Hub": (p) => p.offense.postThreat - 7,
  "Movement Shooter": (p) => Math.min(p.offense.spacingGravity - 7, p.offense.offBallMovement - 7),
  "Spot-Up Spacer": (p) => Math.min(p.offense.spacingGravity - 6, 6.9 - p.offense.offBallMovement),
  "Roll Threat": (p) => Math.min(p.offense.rimThreat - 6.5, p.offense.offBallMovement - 6),
  "Slasher": (p) => Math.min(p.offense.rimThreat - 6.5, ["PG", "SG", "SF"].includes(p.pos) ? 3 : -1),
  "Stretch Big": (p) => Math.min(p.offense.spacingGravity - 6, ["PF", "C"].includes(p.pos) ? 3 : -1),
  "Low-Usage Finisher": (p) => Math.min(5.5 - p.offense.usageAppetite, p.offense.rimThreat - 5.5),
  "Glass Cleaner": (p) => p.defense.defensiveRebounding - 7,
  "Rim Protector": (p) => p.defense.rimDeterrence - 7,
  "Defensive Anchor": (p) => Math.min(p.defense.interiorDeterrence - 7, p.defense.defensiveRebounding - 6),
  "Point-of-Attack Stopper": (p) => p.defense.perimeterContainment - 7,
  "Wing Stopper": (p) => p.defense.wingContainment - 7,
  "Help Defender": (p) => Math.min(p.defense.eventCreation - 6.5, p.defense.schemeVersatility - 5),
});

const deriveRoles = (built) => Object.entries(ROLE_PREDICATES)
  .map(([role, f]) => ({ role, margin: r2(f(built)) }))
  .filter((x) => x.margin > 0)
  .sort((a, b) => b.margin - a.margin || a.role.localeCompare(b.role));

// "00s"/"10s"/"20s" are 2000s/2010s/2020s in this repository; "30s"-"90s" are 19xx.
const cardDecade = (cardId) => { const m = /-(\d0)s$/.exec(cardId ?? ""); return m ? `${Number(m[1]) <= 20 ? "20" + m[1] : "19" + m[1]}s` : null; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  // load base stores WITHOUT enrichment (fresh derivation, not self-referential):
  // read via registry but ignore prior enrichment by rebuilding from base rows
  const { profiles } = loadRegisteredProfiles({ verifyHashes: false });
  // A person can have several decade cards (kg-00s and kg-10s). Group them and
  // pick per season: the decade-matched card first, else the nearest decade —
  // the prior closest in time to the season being profiled.
  const cardsByPerson = new Map();
  for (const c of PLAYERS) {
    const pid = personIdForCard(c.id);
    if (!cardsByPerson.has(pid)) cardsByPerson.set(pid, []);
    cardsByPerson.get(pid).push(c);
  }
  const cardForSeason = (pid, eraStyleId) => {
    const cards = cardsByPerson.get(pid);
    if (!cards?.length) return null;
    const eraYear = Number(String(eraStyleId).slice(0, 4));
    return [...cards].sort((a, b) => {
      const da = Math.abs(Number(String(cardDecade(a.id)).slice(0, 4)) - eraYear);
      const db = Math.abs(Number(String(cardDecade(b.id)).slice(0, 4)) - eraYear);
      return da - db || a.id.localeCompare(b.id);
    })[0];
  };

  const entries = {}; const rows = [];
  for (const [id, rec] of profiles) {
    // strip any prior enrichment so derivation is from base evidence only
    const base = { ...rec }; delete base.offensiveRoleDetail; delete base.__enrichment;
    if ((rec.__enrichment?.appliedFields ?? []).includes("offensiveRoles")) base.offensiveRoles = [];
    if ((rec.__enrichment?.appliedFields ?? []).includes("defensiveEvidence")
      && base.defensiveEvidence?.basis === "PUBLIC_PERSON_PRIOR") base.defensiveEvidence = null;
    const built = buildCalibrationPlayerProfile(base);
    const card = base.publicPersonId ? cardForSeason(base.publicPersonId, base.eraStyleId) : null;
    const intel = card ? INTELLIGENCE[card.id] : null;

    // ── offensive + descriptive roles ───────────────────────────────────────
    const derived = deriveRoles(built);
    let roleEntry = null;
    const hasStats = Object.values(base.basicStats ?? {}).some((x) => x != null);
    if (intel?.roles?.primary) {
      // Tier 1: inherit the person prior; season production adjusts ordering,
      // never erases the prior.
      const inheritedAll = [intel.roles.primary, ...(intel.roles.secondary ?? [])];
      const seasonTop = derived[0]?.role ?? null;
      const inheritedPrimarySupported = derived.some((d) => d.role === intel.roles.primary)
        || (ROLE_PREDICATES[intel.roles.primary] ? ROLE_PREDICATES[intel.roles.primary](built) > -1.5 : true);
      const primary = inheritedPrimarySupported ? intel.roles.primary : (seasonTop ?? intel.roles.primary);
      const allRoles = [...new Set([primary, ...inheritedAll, ...derived.map((d) => d.role)])];
      roleEntry = { primaryRole: primary,
        secondaryRoles: allRoles.filter((r) => r !== primary).slice(0, 3),
        allRoles, roleResolutionMethod: inheritedPrimarySupported ? "PUBLIC_PRIOR_INHERITED" : "PUBLIC_PRIOR_SEASON_ADJUSTED",
        confidence: base.confidence === "LOW" ? "LOW" : "MEDIUM",
        provenance: { publicCardId: card.id, intelligenceProfile: true, seasonRecord: id,
          derivation: DERIVATION_VERSION,
          note: inheritedPrimarySupported ? "person-level prior inherited; season capability consistent"
            : `season capability does not support the inherited primary; season-derived ${seasonTop} promoted, prior retained in secondaries` },
        sourceFields: ["public intelligence roles", "adapter capability fields from recorded season production"] };
    } else if (hasStats && derived.length) {
      roleEntry = { primaryRole: derived[0].role,
        secondaryRoles: derived.slice(1, 4).map((d) => d.role),
        allRoles: derived.map((d) => d.role),
        roleResolutionMethod: card ? "CAPABILITY_DERIVED_LINKED" : "CAPABILITY_DERIVED",
        confidence: base.confidence === "LOW" ? "LOW" : "MEDIUM",
        provenance: { publicCardId: card?.id ?? null, intelligenceProfile: false, seasonRecord: id,
          derivation: DERIVATION_VERSION,
          note: "deterministic capability-predicate derivation on adapter fields built from recorded season production" },
        sourceFields: ["primaryPosition", "basicStats", "rateStats", "shootingProfile", "lineupRole"] };
    } else {
      roleEntry = { primaryRole: null, secondaryRoles: [], allRoles: [],
        roleResolutionMethod: "INSUFFICIENT_EVIDENCE", confidence: "LOW",
        provenance: { publicCardId: card?.id ?? null, seasonRecord: id, derivation: DERIVATION_VERSION,
          note: hasStats ? "no capability clears any role threshold" : "no recorded production to derive from" },
        sourceFields: [] };
    }

    // ── defensive evidence (fill only when the base has no band) ────────────
    let defEntry = null;
    if (!base.defensiveEvidence?.band && card) {
      const score = (card.dpoy ?? 0) * 3 + (card.ad1 ?? 0) * 2 + (card.ad2 ?? 0);
      const decadeMatch = cardDecade(card.id) === base.eraStyleId;
      let band = null;
      if (score >= 6 && decadeMatch) band = "ELITE";
      else if (score >= 6) band = "STRONG";
      else if (score >= 2) band = decadeMatch ? "STRONG" : "AVERAGE";
      if (band) {
        defEntry = { band,
          documentedRole: (intel?.roles
            ? ["Defensive Anchor", "Rim Protector", "Point-of-Attack Stopper", "Wing Stopper", "Help Defender"]
              .find((r) => r === intel.roles.primary || (intel.roles.secondary ?? []).includes(r))
            : null) ?? null,
          basis: "PUBLIC_PERSON_PRIOR",
          evidence: { dpoy: card.dpoy ?? 0, allDefensiveFirst: card.ad1 ?? 0, allDefensiveSecond: card.ad2 ?? 0,
            awardScore: score, cardDecade: cardDecade(card.id), seasonEra: base.eraStyleId, decadeMatched: decadeMatch },
          confidence: decadeMatch ? "MEDIUM" : "LOW",
          provenance: { publicCardId: card.id, derivation: DERIVATION_VERSION,
            note: "person-level defensive prior from the public card's verified award counts. A prior, not a season-specific award assertion; the season page was not consulted and no season award is claimed." },
          derivedNotFabricated: "band floors capability via the frozen adapter's documented BAND_FLOOR path; unknown stays unknown where no prior exists" };
      }
    }

    if (roleEntry || defEntry) {
      entries[id] = {};
      if (roleEntry) entries[id].offensiveRoles = roleEntry;
      if (defEntry) entries[id].defensiveEvidence = defEntry;
    }
    rows.push({ id, store: rec.__storeId, linked: Boolean(card), intelligence: Boolean(intel),
      method: roleEntry.roleResolutionMethod, primaryRole: roleEntry.primaryRole,
      roleCount: roleEntry.allRoles.length, confidence: roleEntry.confidence,
      defensiveBand: defEntry?.band ?? base.defensiveEvidence?.band ?? null,
      defensiveBasis: defEntry ? "PUBLIC_PERSON_PRIOR" : base.defensiveEvidence ? "PRE_EXISTING" : null });
  }

  writeFileSync(ENRICH_PATH, JSON.stringify({ calibrationEnrichmentVersion: "1.0.0",
    calibrationRoleDerivationVersion: "1.0.0",
    note: "roles + defensive-evidence enrichment. Fills nulls through the registry merge; never overwrites base data. Derivation inputs: base season records, linked public-card award counts, linked public intelligence profiles. No V5/V6 label, result or reference output.",
    entries }, null, 2) + "\n");

  const by = (f) => rows.reduce((a, r) => { const k = f(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const coverage = {
    profilesExamined: rows.length,
    linkedPublicPersonProfiles: rows.filter((r) => r.linked).length,
    intelligenceProfileLinked: rows.filter((r) => r.intelligence).length,
    calibrationOnlyProfiles: rows.filter((r) => !r.linked).length,
    rolesInherited: rows.filter((r) => r.method === "PUBLIC_PRIOR_INHERITED").length,
    rolesSeasonAdjusted: rows.filter((r) => r.method === "PUBLIC_PRIOR_SEASON_ADJUSTED").length,
    rolesDerived: rows.filter((r) => r.method.startsWith("CAPABILITY_DERIVED")).length,
    insufficientEvidence: rows.filter((r) => r.method === "INSUFFICIENT_EVIDENCE").length,
    emptyRoleProfiles: rows.filter((r) => r.roleCount === 0).length,
    emptyRoleReason: "every empty-role profile carries roleResolutionMethod INSUFFICIENT_EVIDENCE with a note",
    silentEmptyRoles: 0,
    confidenceDistribution: by((r) => r.confidence),
    methodDistribution: by((r) => r.method),
    primaryRoleDistribution: by((r) => r.primaryRole ?? "(none)"),
    defensiveBandsAdded: rows.filter((r) => r.defensiveBasis === "PUBLIC_PERSON_PRIOR").length,
    defensiveBandDistribution: by((r) => r.defensiveBand ?? "(none)"),
    roleVocabulary: ROLE_VOCABULARY, roleVocabularySize: ROLE_VOCABULARY.length,
    vocabularyCoverage: ROLE_VOCABULARY.filter((role) => rows.some((r) => r.primaryRole === role)).length,
    formalLabelsConsumed: 0, formalResultsConsumed: 0,
  };
  writeArtifact("calibration-offensive-role-vocabulary", {
    calibrationRoleDerivationVersion: "1.0.0", closedVocabulary: ROLE_VOCABULARY,
    source: "src/v3/data/intelligence.js — the public Player Intelligence role set, reused exactly; no parallel vocabulary invented",
    predicates: Object.keys(ROLE_PREDICATES),
  }, { generationCommand: "npm run d0:backfill", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("calibration-offensive-role-backfill", {
    calibrationRoleDerivationVersion: "1.0.0", enrichmentStore: ENRICH_PATH,
    enrichmentHash: sha(readFileSync(ENRICH_PATH, "utf8")), ...coverage, rows,
  }, { generationCommand: "npm run d0:backfill", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("calibration-offensive-role-coverage", { calibrationRoleDerivationVersion: "1.0.0", ...coverage },
    { generationCommand: "npm run d0:backfill", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("calibration-offensive-role-provenance", {
    calibrationRoleDerivationVersion: "1.0.0",
    provenanceRule: "every entry names its method, confidence, source fields, derivation version and — where linked — the public card. Forbidden inputs (V5/V6 labels, V5/V6 results, era-reference output, team-name lookups, desired validation outcomes) appear nowhere in the derivation.",
    sampleEntries: Object.fromEntries(Object.entries(entries).slice(0, 5)),
  }, { generationCommand: "npm run d0:backfill", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`BACKFILL: ${rows.length} profiles examined`);
  console.log(`  inherited ${coverage.rolesInherited} · season-adjusted ${coverage.rolesSeasonAdjusted} · derived ${coverage.rolesDerived} · insufficient ${coverage.insufficientEvidence}`);
  console.log(`  defensive bands added ${coverage.defensiveBandsAdded} (${JSON.stringify(coverage.defensiveBandDistribution)})`);
  console.log(`  vocabulary ${coverage.vocabularySize ?? ROLE_VOCABULARY.length} roles, ${coverage.vocabularyCoverage} appear as a primary`);
  process.exit(0);
}
