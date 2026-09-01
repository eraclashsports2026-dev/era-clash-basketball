#!/usr/bin/env node
// ── Coach Draft QA and fairness ──────────────────────────────────────────────
import fs from "node:fs";
import { POSITIONS, PLAYERS } from "../../src/players.js";
import { startRun, submitHolds, submitCoachHolds, selectCoach, publicView } from "../../src/chaos/runState.js";
import { generateOffers, explainOffer, OFFER_ROLES } from "../../src/chaos/coachOffers.js";
import { drawFive } from "../../src/chaos/draftOdds.js";
import { CHAOS_ERA_IDS } from "../../src/chaos/eraTranslation.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr[i]) || null]));
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

/** Drive a run to the coach draft. */
const toCoachDraft = (seedId) => {
  const r = startRun({ runId: "c".repeat(10), seedId, createdAt: 0 });
  submitHolds(r, { holdSlots: ["PG"], hydrate });
  submitHolds(r, { holdSlots: ["PG"], hydrate });
  return r;
};

{
  const r = toCoachDraft("cd-qa-1");
  const v = publicView(r, { hydrate });
  ok("the coach draft opens at Roll 1 of 3", v.coachDraft?.roll === 1 && v.coachDraft?.totalRolls === 3);
  ok("three offers in three strategic roles", v.coachDraft.offers.length === 3
    && new Set(v.coachDraft.offers.map((o) => o.role)).size === 3);
  ok("the CPU's coach holds are committed before the user's", !!v.coachDraft.cpuHoldCommit);
  ok("the era stays visible through the coach draft", !!v.eraContext);
  ok("each offer explains itself", v.coachDraft.offers.every((o) => o.offense && o.defense && o.sacrifice));

  const first = v.coachDraft.offers;
  const keep = first[0].role, keptId = first[0].coachId;
  const dropped = first.slice(1).map((o) => o.coachId);
  submitCoachHolds(r, { holdRoles: [keep], hydrate });
  const v2 = publicView(r, { hydrate, includeCpuHolds: true });
  ok("a held coach is kept across the roll", v2.coachDraft.offers.find((o) => o.role === keep)?.coachId === keptId);
  ok("released coaches are burned for the run", v2.coachDraft.offers.every((o) => !dropped.includes(o.coachId)));
  ok("the held role is reported back as held", v2.coachDraft.heldRoles.includes(keep));

  submitCoachHolds(r, { holdRoles: [], hydrate });
  const v3 = publicView(r, { hydrate });
  ok("after three coach rolls the offers lock for selection", v3.coachDraft.selecting === true);
  ok("a fourth coach roll is refused", submitCoachHolds(r, { holdRoles: [], hydrate }).ok === false);
  ok("a coach that was not offered is refused", selectCoach(r, { coachId: "not-a-coach" }).ok === false);
  ok("one of the three can be hired", selectCoach(r, { coachId: v3.coachDraft.offers[1].coachId }).ok === true);
}

// Determinism and branching.
{
  const a = toCoachDraft("branch-1"), b = toCoachDraft("branch-1");
  const ids = (r) => publicView(r, { hydrate }).coachDraft.offers.map((o) => o.coachId).join(",");
  ok("the same seed offers the same three coaches", ids(a) === ids(b));
  submitCoachHolds(a, { holdRoles: ["ROSTER_MAXIMIZER"], hydrate });
  submitCoachHolds(b, { holdRoles: ["ERA_ADAPTER"], hydrate });
  ok("different coach holds branch to a different offer set", ids(a) !== ids(b));
  const c = toCoachDraft("branch-1");
  submitCoachHolds(c, { holdRoles: ["ROSTER_MAXIMIZER"], hydrate });
  ok("each branch is itself reproducible", ids(a) === ids(c));
  ok("a different seed offers a different set", ids(a) !== ids(toCoachDraft("branch-2")));
}

// Offer fairness: distinct systems, wide reach, no identity leakage.
{
  let sets = 0, dupOffense = 0, dupCoach = 0;
  const names = new Set();
  for (let i = 0; i < 200; i++) {
    const g = drawFive({ seedId: `fair${i}`, side: "gold", roll: 3 });
    const bl = drawFive({ seedId: `fair${i}`, side: "blue", roll: 3, opponentNames: Object.values(g).map((p) => p.name) });
    const eraId = CHAOS_ERA_IDS[i % CHAOS_ERA_IDS.length];
    for (const roll of [1, 2, 3]) {
      const offers = generateOffers({ roster: g, opponentRoster: bl, eraId, seedId: `fair${i}`, side: "gold", roll });
      const ex = offers.map((o) => explainOffer({ offer: o, roster: g, opponentRoster: bl, eraId }));
      sets++;
      if (new Set(ex.map((e) => e.offense)).size < 3) dupOffense++;
      if (new Set(offers.map((o) => o.coachId)).size < 3) dupCoach++;
      offers.forEach((o) => names.add(o.coachId));
    }
  }
  ok("no offer set repeats an offensive identity", dupOffense === 0, `${sets} sets`);
  ok("no offer set repeats a coach", dupCoach === 0);
  ok("the offer pool is wide, not the same three every time", names.size >= 20, `${names.size} distinct coaches offered`);
  const src = fs.readFileSync("src/chaos/coachOffers.js", "utf8");
  for (const forbidden of ["accountTier", "paymentHistory", "testerId", "spending", "entitlement"]) {
    ok(`coach offers never read ${forbidden}`, !new RegExp(`\\b${forbidden}\\b`, "i").test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  }
}

const passed = checks.filter((c) => c.pass).length;
fs.mkdirSync("data/validation/8b", { recursive: true });
fs.writeFileSync("data/validation/8b/coach-chaos-fairness.json", JSON.stringify({
  artifact: "coach-chaos-fairness", phase: "8B", checks: checks.length, passed, results: checks,
}, null, 2) + "\n");
console.log(`\n${passed}/${checks.length} coach draft checks passed`);
process.exit(passed === checks.length ? 0 : 1);
