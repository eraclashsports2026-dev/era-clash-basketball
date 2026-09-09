#!/usr/bin/env node
// ── WS7: freeze the Historical V6 targets and prove their coverage ──────────
//   npm run v6:targets
//
// Targets are read from the same authorized source and the same typed schema
// V4 and V5 used. The rule that matters is negative: a metric this era or this
// licence does not give us stays null. It never becomes zero, never earns pass
// credit and never contributes a failure. The coverage artifact exists to make
// that auditable rather than asserted — it counts, per metric and per matchup,
// exactly what is scoreable and what is not.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fetchArticle, parseRecord, PUBLISHER, LICENSE_NOTE } from "../calibration/adapters/wikipedia.mjs";
import { notRecordedInEra, TEAM_TARGET_FIELDS } from "../../src/v3/calibration/targetSchema.js";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR } from "./reconcile.mjs";
import { V6_SPEC_ALL } from "./buildPlayersV6.mjs";
import { POOL_V4_SPEC } from "../../data/validation/corpus-v4-spec.mjs";
import { NEW_V5_SPEC } from "../../data/validation/pool-v5-spec.mjs";

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");

/** Shares over the selected five. Null-safe: an absent stat drops out of the
 *  denominator rather than counting as zero, and an all-null stat yields null. */
export const sharesOf = (entries) => {
  const usable = entries.filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  const total = usable.reduce((a, [, v]) => a + v, 0);
  if (!usable.length || total <= 0) return null;
  return Object.fromEntries(entries.map(([id, v]) =>
    [id, typeof v === "number" && Number.isFinite(v) ? Number((v / total).toFixed(6)) : null]));
};

const entry = (value, availability, provenance) =>
  ({ value, availability, provenance: value == null ? null : provenance, usable: value != null });

/** Every spec that has ever described a team-season, newest description last. */
export const specIndex = () => {
  const m = new Map();
  for (const f of [...POOL_V4_SPEC, ...NEW_V5_SPEC, ...V6_SPEC_ALL]) {
    const k = `${f.teamName}|${f.season}`;
    if (!m.has(k)) m.set(k, f);
  }
  return m;
};

export const allProfiles = () => {
  const out = [];
  for (const p of ["data/calibration/calibration-players-v3.json",
    "data/validation/6c3r/calibration-players-v4.json",
    "data/validation/6c4a/calibration-players-v5.json",
    `${DIR}/calibration-players-v6.json`]) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    out.push(...((raw.data ?? raw).profiles ?? []));
  }
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("historical-v6-targets", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-v6-targets already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const sel = readArtifact("historical-v6-selection", DIR).data;
  const specs = specIndex();
  const profiles = allProfiles();
  const sides = sel.matchups.flatMap((m) => [
    { matchupId: m.matchupId, era: m.eraStyleId, side: "teamA", ...m.teamA },
    { matchupId: m.matchupId, era: m.eraStyleId, side: "teamB", ...m.teamB }]);

  console.log("HISTORICAL V6 TARGETS — frozen from the authorized source\n");
  const rows = [];
  for (const s of sides) {
    const spec = specs.get(`${s.teamName}|${s.season}`);
    if (!spec) { rows.push({ ...s, error: "NO_SPEC_ROW" }); continue; }
    const art = await fetchArticle(spec.teamArticle);
    const record = parseRecord(art.html);
    const prov = { sourceType: "AUTHORIZED_PUBLIC_API", publisher: PUBLISHER, sourceUrl: art.sourceUrl,
      revisionId: art.revisionId, contentHash: art.contentHash, retrievedAt: art.retrievedAt,
      licenseNote: LICENSE_NOTE, attribution: "Wikipedia contributors, CC BY-SA 4.0",
      verificationStatus: "PARSED_FROM_SOURCE" };

    const teamTargets = {};
    if (record) {
      teamTargets.games = entry(record.games, "RECORDED_STATISTIC", prov);
      teamTargets.wins = entry(record.wins, "RECORDED_STATISTIC", prov);
      teamTargets.losses = entry(record.losses, "RECORDED_STATISTIC", prov);
    }
    for (const f of TEAM_TARGET_FIELDS) {
      if (teamTargets[f]) continue;
      teamTargets[f] = entry(null, notRecordedInEra(f, s.era) ? "NOT_RECORDED_IN_ERA" : "SOURCE_BLOCKED_LICENSING", null);
    }

    const five = profiles.filter((p) => p.teamName === s.teamName && p.season === s.season);
    const stat = (k) => five.map((p) => [p.calibrationPlayerId, p.basicStats?.[k] ?? null]);
    const unitTargets = {
      unitType: "SELECTED_FIVE", selectedFiveOnly: true,
      availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
      confidence: five.some((p) => p.confidence === "LOW") ? "LOW" : "MEDIUM",
      playerScoringShares: sharesOf(stat("pointsPerGame")),
      playerReboundShares: sharesOf(stat("rebounds")),
      playerAssistShares: sharesOf(stat("assists")),
      playerStealShares: sharesOf(stat("steals")),
      playerBlockShares: sharesOf(stat("blocks")),
      playerOpportunityShares: null, playerUsageShares: null, playerTurnoverShares: null,
      formula: "share_i = stat_i / sum(stat over the five verified season profiles); a null stat leaves the denominator rather than entering it as zero",
      provenance: { ...prov, verificationStatus: "DERIVED_FROM_AUTHORIZED_TOTALS" },
    };
    const identityTargets = Object.entries(spec.identity ?? {}).flatMap(([trait, value]) =>
      Array.isArray(value) ? value.map((v) => ({ trait, value: v, kind: "DOCUMENTED_STYLE", confidence: "MEDIUM" }))
        : [{ trait, value, kind: "DOCUMENTED_STYLE", confidence: "MEDIUM" }]);

    const row = { matchupId: s.matchupId, side: s.side, key: s.key, fixtureId: spec.fixtureId,
      teamId: s.teamId, teamName: s.teamName, season: s.season, eraStyleId: s.era,
      set: "historical-holdout-v6", teamTargets, unitTargets, identityTargets,
      profileCount: five.length };
    row.targetRowHash = sha(row);
    rows.push(row);
    const usable = Object.values(teamTargets).filter((v) => v.usable).length;
    console.log(`  ${s.era}  ${(s.teamName + " " + s.season).padEnd(30)} ${String(usable).padStart(2)}/${TEAM_TARGET_FIELDS.length} team targets usable · shares ${Object.entries(unitTargets).filter(([k, v]) => k.startsWith("player") && v).length}/8`);
  }

  // ── coverage, counted rather than claimed ────────────────────────────────
  const perMetric = Object.fromEntries(TEAM_TARGET_FIELDS.map((f) => {
    const cells = rows.map((r) => r.teamTargets?.[f]).filter(Boolean);
    const byAvail = {};
    for (const c of cells) byAvail[c.availability] = (byAvail[c.availability] ?? 0) + 1;
    return [f, { sides: cells.length, usable: cells.filter((c) => c.usable).length,
      null: cells.filter((c) => !c.usable).length, byAvailability: byAvail,
      scoreable: cells.some((c) => c.usable) }];
  }));
  const perMatchup = sel.matchups.map((m) => {
    const mr = rows.filter((r) => r.matchupId === m.matchupId);
    return { matchupId: m.matchupId, eraStyleId: m.eraStyleId, sides: mr.length,
      usableTeamTargets: mr.reduce((a, r) => a + Object.values(r.teamTargets ?? {}).filter((v) => v.usable).length, 0),
      nullTeamTargets: mr.reduce((a, r) => a + Object.values(r.teamTargets ?? {}).filter((v) => !v.usable).length, 0),
      shareFamiliesPresent: mr.reduce((a, r) => a + Object.entries(r.unitTargets ?? {}).filter(([k, v]) => k.startsWith("player") && v).length, 0),
      bothSidesHaveRecord: mr.length === 2 && mr.every((r) => r.teamTargets?.games?.usable) };
  });

  const usableTotal = rows.reduce((a, r) => a + Object.values(r.teamTargets ?? {}).filter((v) => v.usable).length, 0);
  const nullTotal = rows.reduce((a, r) => a + Object.values(r.teamTargets ?? {}).filter((v) => !v.usable).length, 0);

  console.log("");
  gate("sixteenTargetRows", rows.length === 16 && rows.every((r) => !r.error),
    `${rows.length} rows, ${rows.filter((r) => r.error).length} in error`);
  gate("everyRowHasFiveProfiles", rows.every((r) => r.profileCount === 5),
    `profile counts: ${[...new Set(rows.map((r) => r.profileCount))].join(", ")}`);
  gate("unavailableTargetsStayNull",
    rows.every((r) => Object.values(r.teamTargets).every((v) => v.usable ? typeof v.value === "number" : v.value === null)),
    `${nullTotal} unavailable cells, every one null — no zero-fill anywhere`);
  gate("noNullIsClassifiedUsable",
    rows.every((r) => Object.values(r.teamTargets).every((v) => v.usable === (v.value != null))),
    "usable and value agree on every cell, so a null cannot enter scoring through a mislabelled flag");
  gate("everyNullCarriesAReason",
    rows.every((r) => Object.values(r.teamTargets).every((v) => v.usable
      || v.availability === "NOT_RECORDED_IN_ERA" || v.availability === "SOURCE_BLOCKED_LICENSING")),
    "every null names why it is null, so exclusion is attributable rather than incidental");
  gate("everyUsableTargetHasProvenance",
    rows.every((r) => Object.values(r.teamTargets).every((v) => !v.usable || v.provenance?.sourceUrl)),
    `${usableTotal} usable cells, each naming its source url and revision`);
  gate("bothSidesOfEveryMatchupHaveARecord", perMatchup.every((m) => m.bothSidesHaveRecord),
    `${perMatchup.filter((m) => m.bothSidesHaveRecord).length}/8 matchups where both sides carry a parsed win-loss record`);
  gate("atLeastOneScoreableTeamMetric", Object.values(perMetric).some((m) => m.scoreable),
    `scoreable team metrics: ${Object.entries(perMetric).filter(([, m]) => m.scoreable).map(([k]) => k).join(", ") || "none"}`);
  gate("shareFamiliesPresentEverywhere",
    rows.every((r) => ["playerScoringShares", "playerReboundShares", "playerAssistShares"].every((k) => r.unitTargets?.[k])),
    "scoring, rebound and assist shares derive on all sixteen sides");

  const targetsPayload = {
    historicalV6TargetsVersion: "1.0.0", set: "historical-holdout-v6",
    selectionHash: sel.selectionHash, selectionPolicyHash: sel.selectionPolicyHash,
    rows,
    nullPolicy: "A null target contributes no error, no pass credit and no failure. It is never zero-filled, never imputed and never treated as a measurement of zero.",
    sourcePolicy: "Wikipedia only, CC BY-SA 4.0, extracted numeric facts. basketball-reference.com is PROHIBITED_FOR_MODEL_CALIBRATION and is the reason SOURCE_BLOCKED_LICENSING cells exist rather than being filled.",
    pass: fail.length === 0, failedGates: fail,
  };
  targetsPayload.targetsHash = sha(rows.map((r) => r.targetRowHash ?? r.error).join("|"));
  writeArtifact("historical-v6-targets", targetsPayload, {
    generationCommand: "npm run v6:targets", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("historical-v6-target-coverage", {
    historicalV6TargetCoverageVersion: "1.0.0",
    targetsHash: targetsPayload.targetsHash, selectionHash: sel.selectionHash,
    totals: { sides: rows.length, teamMetricFields: TEAM_TARGET_FIELDS.length,
      teamCells: usableTotal + nullTotal, usableTeamCells: usableTotal, nullTeamCells: nullTotal,
      usableFraction: Number((usableTotal / (usableTotal + nullTotal)).toFixed(4)) },
    perMetric, perMatchup,
    scoreableTeamMetrics: Object.entries(perMetric).filter(([, m]) => m.scoreable).map(([k]) => k),
    unscoreableTeamMetrics: Object.entries(perMetric).filter(([, m]) => !m.scoreable).map(([k]) => k),
    interpretation: "An unscoreable metric is excluded from the verdict entirely. It cannot be reached by any gate, so it can neither pass nor fail, and its absence is not evidence either way. The verdict rests only on the scoreable set.",
    neverZeroFilled: true,
    pass: fail.length === 0, failedGates: fail,
  }, { generationCommand: "npm run v6:targets", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nTARGETS: ${targetsPayload.pass ? "FROZEN" : `FAIL (${fail.join(", ")})`}`);
  console.log(`  ${usableTotal} usable team cells, ${nullTotal} null · targetsHash ${targetsPayload.targetsHash.slice(0, 16)}...`);
  process.exit(targetsPayload.pass ? 0 : 2);
}
