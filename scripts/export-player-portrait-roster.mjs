#!/usr/bin/env node

/**
 * Export the authoritative EraClash portrait-production roster.
 *
 * Usage from the EraClash Basketball repository root:
 *   node /path/to/export-player-portrait-roster.mjs
 *
 * Outputs:
 *   data/art/player-portrait-roster.csv
 *   data/art/player-portrait-roster.json
 *   data/art/player-portrait-roster-summary.md
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const playersPath = path.join(ROOT, "src", "players.js");
const personsPath = path.join(ROOT, "src", "v3", "data", "persons.js");

for (const required of [playersPath, personsPath]) {
  if (!fs.existsSync(required)) {
    console.error(`Missing required EraClash source: ${required}`);
    console.error("Run this command from the EraClash Basketball repository root.");
    process.exit(1);
  }
}

const [{ PLAYERS }, { PERSON_INDEX }] = await Promise.all([
  import(pathToFileURL(playersPath).href),
  import(pathToFileURL(personsPath).href),
]);

if (!Array.isArray(PLAYERS)) {
  throw new TypeError("PLAYERS must be an array.");
}
if (!(PERSON_INDEX instanceof Map)) {
  throw new TypeError("PERSON_INDEX must be a Map.");
}

const expectedCards = 381;
const expectedPeople = 323;
if (PLAYERS.length !== expectedCards) {
  throw new Error(`Roster drift: expected ${expectedCards} cards, found ${PLAYERS.length}. Verify the current branch before collecting references.`);
}
if (PERSON_INDEX.size !== expectedPeople) {
  throw new Error(`Person-registry drift: expected ${expectedPeople} people, found ${PERSON_INDEX.size}. Verify the current branch before collecting references.`);
}

const playerById = new Map(PLAYERS.map((player) => [player.id, player]));
const unique = (values) => [...new Set(values.filter(Boolean))];

const rows = [...PERSON_INDEX.values()]
  .map((person) => {
    const cards = person.cardIds.map((id) => {
      const player = playerById.get(id);
      if (!player) throw new Error(`Canonical person ${person.personId} references unknown card ${id}.`);
      return player;
    });

    const decades = unique(cards.map((card) => card.decade));
    const positions = unique(cards.flatMap((card) => card.positions ?? [card.pos]));
    const teams = unique(cards.flatMap((card) => String(card.team ?? "").split("/").map((value) => value.trim())));

    return {
      personId: person.personId,
      displayName: person.displayName,
      cardCount: cards.length,
      cardIds: cards.map((card) => card.id).join("|"),
      decades: decades.join("|"),
      teams: teams.join("|"),
      positions: positions.join("|"),
      ageVariantsNeeded: decades.length,
      referenceTarget: decades.length > 1 ? "8-12 total plus decade-specific images" : "6-8 identity references",
      referenceFolder: `portrait-sources/${person.personId}`,
      referenceStatus: "NOT_STARTED",
      identityMasterStatus: "NOT_STARTED",
      cardPortraitStatus: "NOT_STARTED",
      qaStatus: "NOT_REVIEWED",
      notes: "",
    };
  })
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

const coveredCards = rows.flatMap((row) => row.cardIds.split("|")).filter(Boolean);
if (coveredCards.length !== PLAYERS.length || new Set(coveredCards).size !== PLAYERS.length) {
  throw new Error("Export coverage failure: every player-decade card must appear exactly once.");
}

const headers = Object.keys(rows[0]);
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [
  headers.map(csvEscape).join(","),
  ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
].join("\n");

const outDir = path.join(ROOT, "data", "art");
fs.mkdirSync(outDir, { recursive: true });

const csvPath = path.join(outDir, "player-portrait-roster.csv");
const jsonPath = path.join(outDir, "player-portrait-roster.json");
const summaryPath = path.join(outDir, "player-portrait-roster-summary.md");

fs.writeFileSync(csvPath, `${csv}\n`, "utf8");
fs.writeFileSync(
  jsonPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: {
      players: "src/players.js",
      persons: "src/v3/data/persons.js",
    },
    totals: {
      playerDecadeCards: PLAYERS.length,
      canonicalPeople: rows.length,
      multiDecadePeople: rows.filter((row) => row.ageVariantsNeeded > 1).length,
    },
    people: rows,
  }, null, 2)}\n`,
  "utf8",
);

const byDecade = [...new Set(PLAYERS.map((player) => player.decade))]
  .sort()
  .map((decade) => `| ${decade} | ${PLAYERS.filter((player) => player.decade === decade).length} |`)
  .join("\n");

const summary = `# EraClash Player Portrait Production Roster\n\n` +
  `Generated from the authoritative player and canonical-person registries.\n\n` +
  `- Player-decade cards: **${PLAYERS.length}**\n` +
  `- Canonical people: **${rows.length}**\n` +
  `- People requiring multiple decade/age treatments: **${rows.filter((row) => row.ageVariantsNeeded > 1).length}**\n\n` +
  `## Card coverage by decade\n\n| Decade | Cards |\n|---|---:|\n${byDecade}\n\n` +
  `## Recommended source folder\n\n` +
  "```text\nportrait-sources/<personId>/\n  identity/\n  era/<decade>/\n  approved/\n  rejected/\n```\n";

fs.writeFileSync(summaryPath, summary, "utf8");

console.log(`Exported ${PLAYERS.length} cards across ${rows.length} canonical people.`);
console.log(path.relative(ROOT, csvPath));
console.log(path.relative(ROOT, jsonPath));
console.log(path.relative(ROOT, summaryPath));
