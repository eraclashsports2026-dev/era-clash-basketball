#!/usr/bin/env node
// ── Deployed Chaos flow QA ───────────────────────────────────────────────────
// Drives complete Chaos runs against a real deployment: three rolls, holds,
// era reveal, coach offers, simulation, and the postgame contract on the stored
// result. This is the gate that proves the DEPLOYED build works, not the local one.
import fs from "node:fs";

const BASE = (process.argv[2] || "http://localhost:4177").replace(/\/$/, "");
const RUNS = Number(process.argv[3] || 3);
const KEY = process.env.PREVIEW_ACCESS_KEY || "";
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

const session = (i) => `${"0123456789abcdef"[i % 16]}`.repeat(48);
const mk = (sid) => async (body) => {
  const res = await fetch(`${BASE}/api/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: `ec_session=${sid}`, ...(KEY ? { "x-preview-key": KEY } : {}) },
    body: JSON.stringify(body),
  });
  let j = null; try { j = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: j };
};

const run = async () => {
  let completed = 0;
  for (let i = 0; i < RUNS; i++) {
    const post = mk(session(i));
    let r = await post({ chaosAction: "start", tier: "FREE" });
    if (r.status !== 200) { ok(`run ${i + 1} starts`, false, `status ${r.status}`); continue; }
    ok(`run ${i + 1} starts at Roll 1 with both fives`, r.body.chaos.roll === 1
      && r.body.chaos.gold.roster.filter(Boolean).length === 5
      && r.body.chaos.blue.roster.filter(Boolean).length === 5);
    const id = r.body.chaos.chaosRunId;
    const opening = r.body.chaos;

    r = await post({ chaosAction: "decide", chaosRunId: id, holdSlots: ["PG", "C"], holdRoles: [] });
    ok(`run ${i + 1} reaches Roll 2 with the era revealed`, r.body?.chaos?.roll === 2 && !!r.body?.chaos?.era?.eraId, r.body?.chaos?.era?.eraId);
    ok(`run ${i + 1} reveals the CPU's holds only after the user's`, Array.isArray(r.body?.chaos?.blue?.heldSlots));
    ok(`run ${i + 1} shows a Draft Pressure level`, ["LOW", "RISING", "HIGH"].includes(r.body?.chaos?.draftPressure?.level), r.body?.chaos?.draftPressure?.level);

    // The coach board is on the table from the FIRST roll now, and it is scored
    // against the era from the second one on.
    ok(`run ${i + 1} had coach offers from Roll 1`, opening.coachDraft?.offers?.length === 3);
    ok(`run ${i + 1} carries the same roll number on both boards`,
      r.body?.chaos?.coachDraft?.roll === r.body?.chaos?.roll, `${r.body?.chaos?.coachDraft?.roll} vs ${r.body?.chaos?.roll}`);

    const midOffers = r.body?.chaos?.coachDraft?.offers || [];
    const keepRoleEarly = midOffers[0]?.role, keptEarlyId = midOffers[0]?.coachId;
    const droppedEarly = midOffers.slice(1).map((o) => o.coachId);

    r = await post({ chaosAction: "decide", chaosRunId: id, holdSlots: ["PG"], holdRoles: keepRoleEarly ? [keepRoleEarly] : [] });
    ok(`run ${i + 1} locks the roster after three rolls`, r.body?.chaos?.rostersLocked === true);
    ok(`run ${i + 1} locks the final three offers for hiring`,
      r.body?.chaos?.coachDraft?.selecting === true && r.body?.chaos?.coachDraft?.offers?.length === 3);
    ok(`run ${i + 1} keeps the era visible after the roster locks`, !!r.body?.chaos?.eraContext);
    ok(`run ${i + 1} keeps a held staff through the final roll`,
      (r.body?.chaos?.coachDraft?.offers || []).find((o) => o.role === keepRoleEarly)?.coachId === keptEarlyId);
    ok(`run ${i + 1} burns a released staff`,
      (r.body?.chaos?.coachDraft?.offers || []).every((o) => !droppedEarly.includes(o.coachId)));
    ok(`run ${i + 1} offers no fourth roll`,
      (await post({ chaosAction: "decide", chaosRunId: id, holdSlots: [], holdRoles: [] })).status === 400);

    const first = r.body.chaos.coachDraft.offers;
    ok(`run ${i + 1} offers three unique coaches`, first.length === 3 && new Set(first.map((o) => o.coachId)).size === 3,
      first.map((o) => o.name).join(", "));
    ok(`run ${i + 1} offers three DISTINCT systems`, new Set(first.map((o) => o.offense)).size === 3);
    ok(`run ${i + 1} explains every offer`, first.every((o) => o.offense && o.defense && o.sacrifice));



    const finalOffers = first;
    ok(`run ${i + 1} refuses the superseded coach-roll action`,
      (await post({ chaosAction: "coachHolds", chaosRunId: id, holdRoles: [] })).status === 400);

    r = await post({ chaosAction: "coach", chaosRunId: id, coachId: finalOffers[0].coachId });
    ok(`run ${i + 1} reaches READY`, r.body?.chaos?.phase === "READY");

    const simulationId = Array.from({ length: 20 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    r = await post({ chaosAction: "simulate", chaosRunId: id, simulationId });
    if (r.status !== 200) { ok(`run ${i + 1} simulates`, false, `status ${r.status}`); continue; }
    const rec = r.body.result;
    completed++;
    ok(`run ${i + 1} simulates on the preview candidate`, String(r.body.resultId).startsWith("pv_"), rec.candidate?.candidateId);
    ok(`run ${i + 1} stores draft history`, (rec.chaosDraft?.rolls || []).length === 2);
    ok(`run ${i + 1} stores the pregame read before the sim`, !!rec.pregame);
    ok(`run ${i + 1} has a deterministic opening story`, !!rec.story?.body && /^How /.test(rec.story.headline || ""), rec.story?.headline);
    ok(`run ${i + 1} has salient key moments`, (rec.v3?.keyMoments || []).length >= 1);
    ok(`run ${i + 1} has a quarter-by-quarter flow`, (rec.v3?.quarterFlow || []).length >= 4);
    ok(`run ${i + 1} has an expanded analysis available`, (rec.expandedAnalysis?.sections || []).length >= 4);
    ok(`run ${i + 1} states a factual era impact`, !!rec.eraImpact && String(rec.eraImpact).includes(rec.eraId));
    ok(`run ${i + 1} carries two or three events in most quarters`,
      (rec.v3?.quarterFlow || []).filter((q) => (q.events || []).length >= 2).length >= 3);
    ok(`run ${i + 1} groups repeated coaching adjustments`, (() => {
      for (const side of ["gold", "blue"]) {
        const adj = rec.v3?.coaching?.[side]?.adjustments || [];
        const keys = adj.map((a) => `${a.trigger}|${a.response}`);
        if (new Set(keys).size !== keys.length) return false;
      }
      return true;
    })());
    ok(`run ${i + 1} fabricates no game clock`, !/\b\d{1,2}:\d{2}\b/.test(JSON.stringify({ k: rec.v3?.keyMoments, q: rec.v3?.quarterFlow, c: rec.v3?.coaching })));
    ok(`run ${i + 1} prints no raw enum in coaching`, !/so the staff|_heavy|switch_/.test(JSON.stringify(rec.v3?.coaching || {})));
    ok(`run ${i + 1} leaks no seed on the stored result`, !JSON.stringify(rec).includes("seedId"));
  }
  ok("every requested run completed", completed === RUNS, `${completed}/${RUNS}`);

  const passed = checks.filter((c) => c.pass).length;
  try { fs.mkdirSync("data/validation/8a", { recursive: true }); } catch { /* exists */ }
  fs.writeFileSync("data/validation/8a/phase8a-chaos-flow-qa.json", JSON.stringify({
    artifact: "phase8a-chaos-flow-qa", phase: "8A", target: BASE, runs: RUNS,
    checks: checks.length, passed, failed: checks.length - passed, results: checks,
  }, null, 2) + "\n");
  console.log(`\n${passed}/${checks.length} deployed chaos-flow checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
};
run().catch((e) => { console.error(e); process.exit(1); });
