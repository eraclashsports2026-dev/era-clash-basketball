#!/usr/bin/env node
// ── Postgame story contract QA ───────────────────────────────────────────────
// Simulates games directly through the preview engine and asserts the postgame
// story contract on every one of them.
import fs from "node:fs";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { drawFive } from "../../src/chaos/draftOdds.js";
import { computeResultPreview } from "../../api/_lib/previewEngine.js";
import { buildDeterministicSummary } from "../../api/_lib/postgameStory.js";
import { mulberry32, hashString } from "../../src/v3/seed.js";

const N = Number(process.argv[2] || 40);
const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const COACHES = ["phil-jackson", "gregg-popovich", "red-auerbach", "mike-dantoni", "pat-riley"];
const fails = [];
const note = (i, msg) => fails.push(`game ${i}: ${msg}`);

let momentCounts = [], withStory = 0;
for (let i = 0; i < N; i++) {
  // Use the real Chaos draw: it respects positional eligibility and
  // person-uniqueness, which a naive random five does not — the engine
  // rightly refuses a card in a slot it cannot play.
  const g = drawFive({ seedId: `story${i}`, side: "gold", roll: 3 });
  const gold = POSITIONS.map((s2) => g[s2]);
  const b = drawFive({ seedId: `story${i}`, side: "blue", roll: 3, opponentNames: gold.map((p) => p.name) });
  const blue = POSITIONS.map((s2) => b[s2]);
  const res = computeResultPreview("single", gold, blue, {
    coachGoldId: COACHES[i % COACHES.length], coachBlueId: COACHES[(i + 2) % COACHES.length],
    eraStyleId: ERAS[i % ERAS.length],
  }, (i * 7919) | 0);

  const story = buildDeterministicSummary({
    record: res, quarterFlow: res.v3.quarterFlow, moments: res.v3.keyMoments, patterns: res.v3.matchupPatterns,
  });
  if (!story?.body) note(i, "no deterministic summary");
  else {
    withStory++;
    if (/pre-?game|comfortable win|chemistry/i.test(story.body)) note(i, `summary leads on a forbidden concept: ${story.body.slice(0, 60)}`);
    if (!/^[A-Z]/.test(story.body)) note(i, "summary does not start with a capital");
  }
  const km = res.v3.keyMoments || [];
  momentCounts.push(km.length);
  if (km.length < 1) note(i, "no key moments at all");
  if (km.length > 5) note(i, `${km.length} key moments (max 5)`);
  const cats = km.map((m) => m.category);
  if (new Set(cats).size !== cats.length) note(i, "duplicate moment category");
  // No fabricated clock, anywhere in the story surfaces.
  const blob = JSON.stringify({ km, qf: res.v3.quarterFlow, co: res.v3.coaching });
  if (/\b\d{1,2}:\d{2}\b/.test(blob)) note(i, "a game clock appears in the story surfaces");
  if (/\bQ5\b/.test(blob)) note(i, "overtime is labelled Q5");
  // Moments and patterns must not print the same sentence.
  const pt = new Set((res.v3.matchupPatterns || []).map((p) => p.text));
  for (const m of km) if (pt.has(m.text)) note(i, "a sentence appears in both moments and patterns");
  // Coaching must read as English.
  const co = JSON.stringify(res.v3.coaching?.gold?.adjustments || []);
  if (/so the staff/.test(co)) note(i, "an adjustment says 'the staff' instead of a coach");
  for (const a of res.v3.coaching?.gold?.adjustments || []) {
    if (!a.when || !a.text) note(i, "an adjustment has no period/score context");
  }
}

const out = {
  artifact: "postgame-story-qa", phase: "8A", games: N,
  gamesWithDeterministicSummary: withStory,
  keyMomentCount: { min: Math.min(...momentCounts), max: Math.max(...momentCounts), mean: momentCounts.reduce((a, b) => a + b, 0) / momentCounts.length },
  failures: fails,
};
fs.writeFileSync("data/validation/8a/postgame-story-qa.json", JSON.stringify(out, null, 2) + "\n");
console.log(`games ${N} · summaries ${withStory}/${N} · moments min ${out.keyMomentCount.min} max ${out.keyMomentCount.max} mean ${out.keyMomentCount.mean.toFixed(2)}`);
if (fails.length) { console.log(`\n${fails.length} failures:`); fails.slice(0, 12).forEach((f) => console.log("  " + f)); }
else console.log("story contract holds on every game");
process.exit(fails.length ? 1 : 0);
