#!/usr/bin/env node
// ── Source registry ─────────────────────────────────────────────────────────
// One committed record of every external source the calibration data plane
// rests on: what it is, who publishes it, under what licence, what was taken,
// and what was deliberately not taken.
//
// It commits structured facts only — URLs, revision ids, content hashes,
// retrieval dates, licence status, attribution. No third-party page text is
// stored in this repository.
//
//   npm run research:calibration -- registry
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { versionOf } from "../../src/versions.js";

export const REGISTRY_PATH = "data/calibration/source-registry.json";
const PLAYERS = "data/calibration/calibration-players-v3.json";

/**
 * The source policy, recorded as data rather than prose so it can be asserted.
 * PROHIBITED entries exist so that the exclusion is auditable: a source absent
 * from the registry could be an oversight, but one listed as prohibited is a
 * decision.
 */
export const SOURCE_CLASSES = Object.freeze({
  OFFICIAL_PUBLIC_SOURCE: { permitted: true, note: "Published by the league or team itself." },
  AUTHORIZED_PUBLIC_API: { permitted: true, note: "A public API whose terms permit this use." },
  OPEN_LICENSE_SOURCE: { permitted: true, note: "Released under an open licence permitting reuse with attribution." },
  LICENSED_EXPORT: { permitted: true, note: "Obtained under a licence that permits this use." },
  MANUAL_VERIFIED_IMPORT_FROM_AUTHORIZED_SOURCE: { permitted: true, note: "Hand-entered from a permitted source, with the source recorded." },
  DERIVED_FROM_AUTHORIZED_TOTALS: { permitted: true, note: "Computed from permitted values by a recorded formula." },
  PROHIBITED_FOR_MODEL_CALIBRATION: { permitted: false, note: "Terms prohibit use in developing or calibrating model technologies." },
});

export const PROHIBITED_SOURCES = Object.freeze([
  {
    id: "basketball-reference",
    publisher: "Sports Reference LLC",
    classification: "PROHIBITED_FOR_MODEL_CALIBRATION",
    reason: "Terms prohibit use of the data to train, fine-tune, prompt, instruct, calibrate, evaluate or otherwise develop AI or model technologies.",
    // Spelled out because each is a distinct way the prohibition could be
    // evaded while appearing compliant.
    excludedRoutes: [
      "direct retrieval", "mirrors and re-hosts", "third-party re-publications of its tables",
      "manual re-entry of its values", "laundering through a derived or intermediate file",
      "any use of its identifiers as a lookup key",
    ],
    note: "Technical accessibility is not authorization. This source is unused in every artefact of this phase.",
  },
]);

const registryEntry = (p) => ({
  sourceType: p.provenance.sourceType,
  publisher: p.provenance.publisher,
  sourceUrl: p.provenance.sourceUrl,
  revisionId: p.provenance.revisionId ?? null,
  contentHash: p.provenance.contentHash,
  retrievedAt: p.provenance.retrievedAt,
  licenseNote: p.provenance.licenseNote,
  attribution: p.provenance.attribution,
  verificationStatus: p.provenance.verificationStatus,
  extractionRoute: p.provenance.membershipRoute,
  derivation: p.provenance.derivation ?? null,
  confidence: p.confidence,
  subject: p.calibrationPlayerId,
});

export const buildRegistry = () => {
  if (!existsSync(PLAYERS)) throw new Error("calibration player store not built");
  const store = JSON.parse(readFileSync(PLAYERS, "utf8"));
  const entries = store.profiles.map(registryEntry).sort((a, b) => a.subject.localeCompare(b.subject));

  const byType = {}, byPublisher = {}, byRoute = {}, byLicense = {};
  for (const e of entries) {
    byType[e.sourceType] = (byType[e.sourceType] ?? 0) + 1;
    byPublisher[e.publisher] = (byPublisher[e.publisher] ?? 0) + 1;
    byRoute[e.extractionRoute] = (byRoute[e.extractionRoute] ?? 0) + 1;
    const lic = e.licenseNote?.includes("CC BY-SA") ? "CC BY-SA 4.0" : "other";
    byLicense[lic] = (byLicense[lic] ?? 0) + 1;
  }

  // A source class not in SOURCE_CLASSES, or one marked not permitted, must
  // never appear on a committed entry.
  const violations = entries.filter((e) => !SOURCE_CLASSES[e.sourceType]?.permitted)
    .map((e) => ({ subject: e.subject, sourceType: e.sourceType }));
  const unprovenanced = entries.filter((e) => !e.sourceUrl || !e.contentHash || !e.retrievedAt || !e.attribution)
    .map((e) => e.subject);

  return {
    fixtureSourceRegistryVersion: versionOf("fixtureSourceRegistryVersion"),
    calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
    purpose: "Every external source the calibration data plane rests on, with licence status, retrieval provenance and content hashes. Structured facts only — no third-party page content is committed.",
    policy: {
      rule: "Do not use any source whose terms prohibit its data from being used to train, fine-tune, prompt, instruct, calibrate, evaluate or otherwise develop AI or model technologies.",
      permittedClasses: Object.entries(SOURCE_CLASSES).filter(([, v]) => v.permitted).map(([k]) => k),
      prohibitedClasses: Object.entries(SOURCE_CLASSES).filter(([, v]) => !v.permitted).map(([k]) => k),
    },
    prohibitedSources: PROHIBITED_SOURCES,
    coverage: { entries: entries.length, byType, byPublisher, byRoute, byLicense },
    integrity: {
      violations,
      unprovenanced,
      clean: violations.length === 0 && unprovenanced.length === 0,
    },
    attributionStatement: "Player-season statistics are extracted from Wikipedia articles, © Wikipedia contributors, released under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Each entry records the exact revision used. Only numeric facts are stored; no article prose is reproduced.",
    entries,
  };
};

export const registryHash = (r) =>
  createHash("sha256").update(JSON.stringify(r.entries.map((e) => [e.subject, e.contentHash, e.sourceUrl]))).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const reg = buildRegistry();
  reg.registryHash = registryHash(reg);
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + "\n");

  console.log(`SOURCE REGISTRY — ${reg.coverage.entries} entries\n`);
  console.log(`  by source class:`);
  for (const [k, v] of Object.entries(reg.coverage.byType)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`  by publisher:`);
  for (const [k, v] of Object.entries(reg.coverage.byPublisher)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`  by extraction route:`);
  for (const [k, v] of Object.entries(reg.coverage.byRoute)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`  by licence:`);
  for (const [k, v] of Object.entries(reg.coverage.byLicense)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`\n  prohibited and unused:`);
  for (const p of reg.prohibitedSources) console.log(`    ${p.publisher} — ${p.classification}`);
  console.log(`\n  integrity: ${reg.integrity.violations.length} policy violations · ${reg.integrity.unprovenanced.length} unprovenanced entries · clean=${reg.integrity.clean}`);
  console.log(`  hash ${reg.registryHash.slice(0, 16)}`);
  console.log(`\nwrote ${REGISTRY_PATH}`);
}
