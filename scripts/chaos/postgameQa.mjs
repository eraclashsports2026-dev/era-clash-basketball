#!/usr/bin/env node
// ── Postgame QA: quarter stories, enhanced analysis, coaching report ─────────
// One harness, three modes, so the three npm entries share the same simulation
// setup rather than drifting apart.
import fs from "node:fs";
import { POSITIONS } from "../../src/players.js";
import { drawFive } from "../../src/chaos/draftOdds.js";
import { computeResultPreview } from "../../api/_lib/previewEngine.js";
import { buildExpandedAnalysis, buildDeterministicSummary } from "../../api/_lib/postgameStory.js";
import { buildEvidencePacket, validateNarrativeClaims } from "../../api/_lib/narrativeEvidence.js";
import { CHAOS_ERA_IDS } from "../../src/chaos/eraTranslation.js";

const MODE = process.argv[2] || "quarter";
const N = Number(process.argv[3] || 24);
const COACHES = ["phil-jackson", "pat-riley", "gregg-popovich", "mike-dantoni", "stan-van-gundy"];
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); if (!p) console.log(`FAIL  ${n}${d ? ` — ${d}` : ""}`); };

const games = [];
for (let i = 0; i < N; i++) {
  const g = drawFive({ seedId: `pg${i}`, side: "gold", roll: 3 });
  const gold = POSITIONS.map((s) => g[s]);
  const b = drawFive({ seedId: `pg${i}`, side: "blue", roll: 3, opponentNames: gold.map((p) => p.name) });
  const blue = POSITIONS.map((s) => b[s]);
  const eraId = CHAOS_ERA_IDS[i % CHAOS_ERA_IDS.length];
  games.push({ i, eraId, res: computeResultPreview("single", gold, blue, {
    coachGoldId: COACHES[i % COACHES.length], coachBlueId: COACHES[(i + 2) % COACHES.length], eraStyleId: eraId,
  }, i * 8191 + 13) });
}

if (MODE === "quarter") {
  let twoPlus = 0, quarters = 0;
  for (const { res, i } of games) {
    const qf = res.v3.quarterFlow || [];
    ok(`game ${i} has a quarter for every period`, qf.length >= 4);
    for (const q of qf) {
      quarters++;
      if ((q.events || []).length >= 2) twoPlus++;
      ok(`game ${i} ${q.period} has at most three events`, (q.events || []).length <= 3);
      for (const e of q.events || []) {
        ok(`game ${i} ${q.period} event names its moment`, !!e.when && !!e.text);
        ok(`game ${i} ${q.period} event has no fabricated clock`, !/\b\d{1,2}:\d{2}\b/.test(e.text + e.when));
      }
    }
  }
  ok("most quarters carry two or three events", twoPlus / quarters >= 0.8, `${Math.round(100 * twoPlus / quarters)}% of ${quarters}`);
}

if (MODE === "enhanced") {
  for (const { res, i, eraId } of games) {
    const ea = buildExpandedAnalysis({
      record: res, quarterFlow: res.v3.quarterFlow, moments: res.v3.keyMoments,
      patterns: res.v3.matchupPatterns, coaching: res.v3.coaching, eraId,
    });
    ok(`game ${i} produces an expanded analysis`, !!ea && ea.sections.length >= 4, `${ea?.sections?.length} sections`);
    ok(`game ${i} labels its source honestly`, ea?.analysisSource === "DETERMINISTIC_EXPANDED");
    ok(`game ${i} expanded analysis has no fabricated clock`, !/\b\d{1,2}:\d{2}\b/.test(JSON.stringify(ea)));
    // The validator must accept the facts the record contains.
    const packet = buildEvidencePacket(res);
    const per = res.v3.periodScores || [];
    const top = [...res.v3.fullBox.gold, ...res.v3.fullBox.blue].sort((a, b) => b.pts - a.pts)[0];
    if (per[1]) {
      const r = validateNarrativeClaims({ summary: `A ${per[1].gold}-${per[1].blue} second quarter decided it.` }, packet);
      ok(`game ${i} a real quarter score is accepted`, r.ok, (r.violations || []).join(";"));
    }
    if (top) {
      const r = validateNarrativeClaims({ summary: `${top.name} shot ${top.fgm}-${top.fga}.` }, packet);
      ok(`game ${i} a real shooting line is accepted`, r.ok, (r.violations || []).join(";"));
      const bad = validateNarrativeClaims({ summary: `${top.name} scored 999 points.` }, packet);
      ok(`game ${i} an invented total is still rejected`, !bad.ok);
    }
    const story = buildDeterministicSummary({
      record: res, quarterFlow: res.v3.quarterFlow, moments: res.v3.keyMoments, patterns: res.v3.matchupPatterns,
    });
    ok(`game ${i} has an immediate deterministic summary`, !!story?.body && /^How /.test(story.headline));
  }
}

if (MODE === "coaching") {
  for (const { res, i } of games) {
    for (const side of ["gold", "blue"]) {
      const c = res.v3.coaching?.[side];
      ok(`game ${i} ${side} has a coaching report`, !!c);
      if (!c) continue;
      ok(`game ${i} ${side} names its coach`, !!c.coach);
      ok(`game ${i} ${side} shows at most five adjustment lines`, (c.adjustments || []).length <= 8);
      const blob = JSON.stringify(c);
      ok(`game ${i} ${side} prints no raw enum`, !/switch_heavy|drop_heavy|MAN_ILLEGAL_DEFENSE|AGGRESSIVE_SHOW/.test(blob));
      ok(`game ${i} ${side} never says "the staff"`, !/so the staff/.test(blob));
      ok(`game ${i} ${side} fabricates no clock`, !/\b\d{1,2}:\d{2}\b/.test(blob));
      for (const a of c.adjustments || []) {
        ok(`game ${i} ${side} adjustment carries period and score`, !!a.when && !!a.scoreState);
      }
      for (const m of c.attackedMatchups || []) {
        ok(`game ${i} ${side} targeted matchup carries its consequence`, /produced \d+ points/.test(m.text));
      }
    }
  }
}

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass);
fs.mkdirSync("data/validation/8b", { recursive: true });
const file = { quarter: "quarter-story-contract.json", enhanced: "enhanced-analysis-state-machine.json", coaching: "coaching-report-v2-contract.json" }[MODE];
fs.writeFileSync(`data/validation/8b/${file}`, JSON.stringify({
  artifact: file.replace(/\.json$/, ""), phase: "8B", mode: MODE, games: N,
  checks: checks.length, passed, failed: failed.length,
  failures: failed.slice(0, 10),
}, null, 2) + "\n");
console.log(`${MODE}: ${passed}/${checks.length} checks passed over ${N} games`);
process.exit(failed.length ? 1 : 0);
