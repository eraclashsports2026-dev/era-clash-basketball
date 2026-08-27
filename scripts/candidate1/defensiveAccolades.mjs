#!/usr/bin/env node
// ── Phase 6C4A WS6: per-season defensive accolades from the award pages ─────
//   npm run c1:defensive-accolades
//
// The DEFENSIVE_PROXY_INVERSION root cause: steals and blocks are the only
// defensive inputs in recorded eras, so documented elite man defenders rate
// below the era median. The documented evidence exists — the season-by-season
// All-Defensive Team and Defensive Player of the Year award pages — and the
// project convention is that accolades come from per-season award pages,
// never from recall. This extracts them once and stamps each store profile's
// defensiveEvidence with what THAT season's page records.
import { readFileSync, writeFileSync } from "node:fs";
import { fetchArticle } from "../calibration/adapters/wikipedia.mjs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR } from "./failureRegister.mjs";

const STORE_PATHS = { v4: "data/validation/6c3r/calibration-players-v4.json", v3: "data/calibration/calibration-players-v3.json" };
const strip = (x) => x.replace(/<[^>]+>/g, " ").replace(/&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const cleanName = (x) => strip(x).replace(/[*†‡^]/g, "").replace(/\(\d+\)/g, "").trim();
const norm = (x) => cleanName(x).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const seasonKey = (label) => label.replace(/–|—/g, "-");

/** season -> { first: Set<normName>, second: Set<normName> } */
export const parseAllDefensive = (html) => {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
  // the season table is the one whose header row starts with Season
  const table = tables.find((t) => /Season/.test(t) && /First team/i.test(t));
  if (!table) throw new Error("All-Defensive season table not found");
  const out = new Map();
  let season = null;
  for (const r of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (r.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map((c) => c);
    if (!cells.length) continue;
    let i = 0;
    if (/^\d{4}[–-]\d{2}$/.test(strip(cells[0]))) { season = seasonKey(strip(cells[0])); i = 1; }
    if (!season || cells.length - i < 2) continue;
    const first = cleanName(cells[i] ?? ""); const second = cleanName(cells[i + 2] ?? "");
    if (!out.has(season)) out.set(season, { first: new Set(), second: new Set() });
    if (first && !/^Players|^Teams/.test(first)) out.get(season).first.add(norm(first));
    if (second && !/^Players|^Teams/.test(second)) out.get(season).second.add(norm(second));
  }
  return out;
};

/** season -> normName (winner) */
export const parseDpoy = (html) => {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
  const table = tables.find((t) => /Season/.test(t) && /Player/.test(t) && /\d{4}[–-]\d{2}/.test(t));
  if (!table) throw new Error("DPOY season table not found");
  const out = new Map();
  for (const r of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (r.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map((c) => strip(c));
    if (cells.length < 2 || !/^\d{4}[–-]\d{2}$/.test(cells[0])) continue;
    out.set(seasonKey(cells[0]), norm(cleanName(cells[1])));
  }
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const adArt = await fetchArticle("NBA All-Defensive Team");
  const dpArt = await fetchArticle("NBA Defensive Player of the Year Award");
  const allDef = parseAllDefensive(adArt.html);
  const dpoy = parseDpoy(dpArt.html);
  console.log(`All-Defensive seasons parsed: ${allDef.size} · DPOY seasons: ${dpoy.size}`);

  const stamped = [];
  for (const [k, path] of Object.entries(STORE_PATHS)) {
    const store = JSON.parse(readFileSync(path, "utf8"));
    for (const p of store.profiles) {
      const sel = allDef.get(p.season);
      const n = norm(p.name);
      const accolades = [];
      if (dpoy.get(p.season) === n) accolades.push("DEFENSIVE_PLAYER_OF_THE_YEAR");
      if (sel?.first.has(n)) accolades.push("ALL_DEFENSIVE_FIRST_TEAM");
      else if (sel?.second.has(n)) accolades.push("ALL_DEFENSIVE_SECOND_TEAM");
      if (!accolades.length) continue;
      p.defensiveEvidence = {
        ...(p.defensiveEvidence ?? {}),
        seasonAccolades: accolades,
        band: accolades.includes("DEFENSIVE_PLAYER_OF_THE_YEAR") || accolades.includes("ALL_DEFENSIVE_FIRST_TEAM") ? "ELITE" : "STRONG",
        basis: "PER_SEASON_AWARD_PAGE",
        provenance: {
          allDefensive: { sourceUrl: adArt.sourceUrl, revisionId: adArt.revisionId, retrievedAt: adArt.retrievedAt },
          dpoy: { sourceUrl: dpArt.sourceUrl, revisionId: dpArt.revisionId, retrievedAt: dpArt.retrievedAt },
        },
      };
      stamped.push({ store: k, id: p.calibrationPlayerId, name: p.name, season: p.season, accolades, band: p.defensiveEvidence.band });
    }
    store.defensiveAccoladesVersion = "1.0.0";
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
  }
  for (const s of stamped) console.log(`  ${s.store} ${s.name.padEnd(20)} ${s.season}  ${s.accolades.join("+")} -> ${s.band}`);
  writeArtifact("defensive-accolades", {
    defensiveAccoladesVersion: "1.0.0",
    allDefensiveSeasonsParsed: allDef.size, dpoySeasonsParsed: dpoy.size,
    profilesStamped: stamped.length, stamped,
    discipline: "same-season award-page selections only; a selection in another season stamps nothing; unmatched profiles keep their existing defensiveEvidence",
  }, { generationCommand: "npm run c1:defensive-accolades", dir: DIR,
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash } });
  console.log(`stamped ${stamped.length} profiles`);
}
