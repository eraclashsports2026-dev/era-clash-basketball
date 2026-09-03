#!/usr/bin/env node
// ── Deterministic fixture for the Basketball theme lab ───────────────────────
// The lab renders the REAL components in six states. Five of them come from the
// real Chaos state machine, replayed in the browser from a frozen seed. The
// finished game cannot be replayed in the browser (the possession engine does
// not belong in the client bundle), so it is computed HERE, once, from the same
// run's final rosters, staff and era — and frozen as JSON the lab reads.
//
//   node scripts/ui/theme-lab-fixture.mjs           # search a seed (if none is frozen) and write the JSON
//   node scripts/ui/theme-lab-fixture.mjs --check   # recompute and compare
//
// Seed search criteria (frozen once found): Roll 2 shows three held on each
// side and a revealed era, three coach offers are on the table, and the ten
// cards include at least one long name (≥ 16 characters). Nothing is invented:
// every value is what the machine and the engine produce for this seed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { startRun, submitRollDecisions, selectCoach, publicView } from "../../src/chaos/runState.js";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { computeResultPreview } from "../../api/_lib/previewEngine.js";
import { buildDeterministicSummary, buildExpandedAnalysis, eraImpactLine } from "../../api/_lib/postgameStory.js";
import { COACHES } from "../../src/v3/coaches.js";

const OUT = "src/ui/theme-lab/fixture-result.json";
const RUN_ID = "themelabrun1";
const CREATED_AT = 1_770_000_000_000;
const HOLDS = ["PG", "SG", "SF"];
const RESULT_SEED = 9001;

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr?.[i]) || null]));
const coachName = (id) => COACHES.find((c) => c.id === id)?.name || id;

/** Walk the machine for a seed. Returns null when the seed does not meet the criteria. */
export const walk = (seedId) => {
  const run = startRun({ runId: RUN_ID, seedId, createdAt: CREATED_AT });
  const keptRole = run.coachOffers.gold[0].role;
  const r1 = submitRollDecisions(run, { holdSlots: HOLDS, holdRoles: [keptRole], hydrate });
  if (!r1.ok) return null;
  const roll2 = publicView(run, { hydrate, includeCpuHolds: true, eraChange: { allowed: false, reason: "NOT_ENTITLED" } });
  if (roll2.roll !== 2 || !roll2.eraState?.revealed) return null;
  if ((roll2.blue.heldSlots || []).length !== 3 || (roll2.gold.heldSlots || []).length !== 3) return null;
  if (roll2.coachDraft?.offers?.length !== 3) return null;
  const names = [...roll2.gold.roster, ...roll2.blue.roster].map((c) => c?.name || "");
  if (!names.some((n) => n.length >= 16)) return null;
  const r2 = submitRollDecisions(run, { holdSlots: HOLDS, holdRoles: [keptRole], hydrate });
  if (!r2.ok) return null;
  const roll3 = publicView(run, { hydrate, includeCpuHolds: true, eraChange: { allowed: false, reason: "NOT_ENTITLED" } });
  if (!roll3.coachDraft?.selecting) return null;
  const hireCoachId = roll3.coachDraft.offers[0].coachId;
  const r3 = selectCoach(run, { coachId: hireCoachId });
  if (!r3.ok) return null;
  const ready = publicView(run, { hydrate, includeCpuHolds: true, eraChange: { allowed: false, reason: "NOT_ENTITLED" } });
  return { seedId, keptRole, hireCoachId, roll2, roll3, ready, goldIds: run.goldRoster, blueIds: run.blueRoster, selectedCoaches: run.selectedCoaches, eraId: run.revealedEraStyleId, longName: names.filter((n) => n.length >= 16)[0] };
};

const findSeed = () => {
  for (let i = 1; i < 5000; i++) {
    const seed = `themelab-${String(i).padStart(6, "0")}`;
    const w = walk(seed);
    if (w) return w;
  }
  throw new Error("no seed met the fixture criteria in 5000 tries");
};

/** The App's viewSim mapping, reproduced so the lab's `sim` is the product's shape. */
const viewSim = (record) => ({
  ...record.core,
  simulation_id: record.id,
  summary: record.fallbackSummary,
  teamAStrengths: record.goldChem?.strengths || [], teamAWeaknesses: record.goldChem?.weaknesses || [],
  teamBStrengths: record.blueChem?.strengths || [], teamBWeaknesses: record.blueChem?.weaknesses || [],
  mvpReason: record.mvpFallback || null,
  turningPoint: record.core?.turningPoint || null,
  v3: record.v3 || null,
  story: record.story || null,
  expandedAnalysis: record.expandedAnalysis || null,
  eraImpact: record.eraImpact || null,
  draftConsequences: null,
  previewCandidate: record.candidate ?? null,
  pregame: record.pregame ?? null,
  eraId: record.eraId || null,
  coachIds: record.coachIds || null,
  coachNames: { gold: coachName(record.coachIds?.gold), blue: coachName(record.coachIds?.blue) },
  eraLabel: null,
});

export const build = (frozenSeed = null) => {
  const w = frozenSeed ? walk(frozenSeed) : findSeed();
  if (!w) throw new Error(`frozen seed ${frozenSeed} no longer meets the criteria`);
  const team = (ids) => ids.map((id) => ({ id }));
  const computed = computeResultPreview("single", team(w.goldIds), team(w.blueIds),
    { coachGoldId: w.selectedCoaches.gold, coachBlueId: w.selectedCoaches.blue, eraStyleId: w.eraId }, RESULT_SEED);
  const enrich = (rec) => {
    let story = null, expandedAnalysis = null;
    try { story = buildDeterministicSummary({ record: rec, quarterFlow: rec.v3?.quarterFlow || [], moments: rec.v3?.keyMoments || [], patterns: rec.v3?.matchupPatterns || [] }); } catch { story = null; }
    try { expandedAnalysis = buildExpandedAnalysis({ record: rec, quarterFlow: rec.v3?.quarterFlow || [], moments: rec.v3?.keyMoments || [], patterns: rec.v3?.matchupPatterns || [], coaching: rec.v3?.coaching || null, eraId: rec.eraId || null }); } catch { expandedAnalysis = null; }
    return { ...rec, id: "themelabresult", goldIds: w.goldIds, blueIds: w.blueIds, story, expandedAnalysis, eraImpact: rec.eraId ? eraImpactLine(rec.eraId) : null, pregame: null };
  };
  const record = enrich(computed);
  const sim = viewSim(record);
  return {
    artifact: "theme-lab-fixture", version: "1.0.0",
    note: "Deterministic. The run is replayed in the browser from seedId with these decisions; the result was computed once from the READY rosters, staff and era by the locked candidate engine and frozen here.",
    seedId: w.seedId, runId: RUN_ID, createdAt: CREATED_AT, holds: HOLDS, keptRole: w.keptRole, hireCoachId: w.hireCoachId,
    eraId: w.eraId, longName: w.longName, resultSeed: RESULT_SEED,
    teamIds: w.goldIds, oppIds: w.blueIds, coachIds: w.selectedCoaches,
    won: String(record.core.winner).toLowerCase().includes("gold"),
    candidate: record.candidate?.candidateId || null,
    sim,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const fixture = build(existing?.seedId || null);
  const json = JSON.stringify(fixture, null, 2) + "\n";
  if (check) {
    if (!existing || JSON.stringify(existing) !== JSON.stringify(fixture)) { console.error(`${OUT} does not reproduce — the machine or the engine moved`); process.exit(1); }
    console.log(`${OUT} reproduces (seed ${fixture.seedId}, ${fixture.eraId}, ${fixture.won ? "Gold" : "Blue"} won)`);
  } else {
    writeFileSync(OUT, json);
    console.log(`wrote ${OUT}: seed ${fixture.seedId} · era ${fixture.eraId} · long name "${fixture.longName}" · ${fixture.sim.finalScore?.gold}-${fixture.sim.finalScore?.blue} · MVP ${fixture.sim.mvp}`);
  }
}
