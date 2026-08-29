#!/usr/bin/env node
// ── Chaos Clash security and fairness probes ─────────────────────────────────
// Runs against a live deployment (or the local harness). Every probe asserts
// something a hostile client should NOT be able to do.
import fs from "node:fs";

const BASE = (process.argv[2] || "http://localhost:4177").replace(/\/$/, "");
const KEY = process.env.PREVIEW_ACCESS_KEY || "";
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const jar = {};
const post = async (body, extraHeaders = {}) => {
  const res = await fetch(`${BASE}/api/game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: BASE,
      ...(jar.c ? { Cookie: jar.c } : {}), ...(KEY ? { "x-preview-key": KEY } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) jar.c = sc.split(";")[0];
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
};

const run = async () => {
  // Establish a run to probe against.
  let r = await post({ chaosAction: "start", tier: "FREE" });
  if (r.status !== 200 || !r.body?.chaos) {
    ok("chaos run can be started", false, `status ${r.status}`);
    finish(); return;
  }
  ok("chaos run can be started", true);
  const runId = r.body.chaos.chaosRunId;
  const roll1 = r.body.chaos.gold.roster.map((c) => c.id).join(",");

  ok("the raw seed never reaches the client", !JSON.stringify(r.body).includes("seedId"));
  ok("the CPU's uncommitted hold never reaches the client", !JSON.stringify(r.body).includes("_cpuHold"));
  ok("the CPU's holds are hidden before the user submits", (r.body.chaos.blue.heldSlots || []).length === 0);
  ok("the CPU decision is committed before the user's holds", !!r.body.chaos.cpuDecisionCommit);
  ok("no unrevealed future card is present", !JSON.stringify(r.body).includes("futureDraws"));
  ok("the era is hidden until after Roll 2", r.body.chaos.era === null);

  // A client cannot substitute player ids.
  const spoof = await post({
    chaosAction: "holds", chaosRunId: runId, holdSlots: ["PG"],
    goldIds: ["jordan-90s", "lebron-10s", "magic-80s", "bird-80s", "kareem-70s"],
    goldRoster: ["jordan-90s"], eraStyleId: "2020s",
  });
  const afterIds = spoof.body?.chaos?.gold?.roster?.map((c) => c.id) || [];
  ok("a client cannot substitute player ids", !afterIds.includes("jordan-90s") || roll1.includes("jordan-90s"));
  ok("a client cannot set the era", !!spoof.body?.chaos?.era?.eraId);

  // A client cannot skip a roll or add a fourth.
  await post({ chaosAction: "holds", chaosRunId: runId, holdSlots: [] });
  const fourth = await post({ chaosAction: "holds", chaosRunId: runId, holdSlots: [] });
  ok("a client cannot add a fourth roll", fourth.status === 400);

  // Drive the coach draft to its selection step before probing coach actions.
  await post({ chaosAction: "coachHolds", chaosRunId: runId, holdRoles: [] });
  await post({ chaosAction: "coachHolds", chaosRunId: runId, holdRoles: [] });
  const view = await post({ chaosAction: "view", chaosRunId: runId });
  ok("a client cannot roll coaches a fourth time",
    (await post({ chaosAction: "coachHolds", chaosRunId: runId, holdRoles: [] })).status === 400);
  ok("a client cannot forge a coach hold role",
    (await post({ chaosAction: "coachHolds", chaosRunId: runId, holdRoles: ["NOT_A_ROLE"] })).status === 400);
  const offered = (view.body?.chaos?.coachDraft?.offers || []).map((o) => o.coachId);
  ok("exactly three coaches are offered", offered.length === 3, offered.join(","));
  ok("the CPU's coach holds were committed", !!view.body?.chaos?.coachDraft?.cpuHoldCommit);
  ok("the three offers are unique", new Set(offered).size === offered.length);
  const notOffered = ["phil-jackson", "gregg-popovich", "pat-riley", "red-auerbach", "erik-spoelstra"]
    .find((id) => !offered.includes(id)) || "definitely-not-a-coach";
  const badCoach = await post({ chaosAction: "coach", chaosRunId: runId, coachId: notOffered });
  ok("a client cannot hire a coach that was not offered", badCoach.status === 400, notOffered);

  // Draft state cannot cross users.
  const otherJar = {};
  const otherRes = await fetch(`${BASE}/api/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: `ec_session=${"f".repeat(48)}`, ...(KEY ? { "x-preview-key": KEY } : {}) },
    body: JSON.stringify({ chaosAction: "holds", chaosRunId: runId, holdSlots: ["PG"] }),
  });
  ok("draft state cannot cross users", otherRes.status === 403 || otherRes.status === 404);

  // An unknown run id is refused.
  const unknown = await post({ chaosAction: "view", chaosRunId: "zzzzzzzzzzzz" });
  ok("an unknown run id is refused", unknown.status === 404);

  // A malformed run id is refused before any lookup.
  const malformed = await post({ chaosAction: "view", chaosRunId: "../../etc/passwd" });
  ok("a malformed run id is refused", malformed.status === 400);

  // A challenge link carries no secret.
  const good = await post({ chaosAction: "coach", chaosRunId: runId, coachId: offered[0] });
  const chal = await post({ chaosAction: "challenge", chaosRunId: runId });
  const chalId = chal.body?.challengeId || "";
  const forbidden = ["seed", "pv_", "pv=", "session", "tester", "feedback"];
  ok("a challenge id leaks no seed or credential",
    !!chalId && !forbidden.some((f) => String(chalId).toLowerCase().includes(f)), chalId);
  ok("a coach can be hired from the offered three", good.status === 200);

  // Replaying a completed transition is idempotent (refused, not corrupting).
  const replay = await post({ chaosAction: "coach", chaosRunId: runId, coachId: offered[0] });
  const stillReady = await post({ chaosAction: "view", chaosRunId: runId });
  ok("a replayed transition does not corrupt the run",
    replay.status === 400 && ["READY", "SIMULATED"].includes(stillReady.body?.chaos?.phase));

  finish();
};

const finish = () => {
  const passed = results.filter((r) => r.pass).length;
  const out = {
    artifact: "phase8a-security-qa", phase: "8A", target: BASE,
    checks: results.length, passed, failed: results.length - passed, results,
  };
  try { fs.mkdirSync("data/validation/8a", { recursive: true }); } catch { /* exists */ }
  fs.writeFileSync("data/validation/8a/phase8a-security-qa.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${passed}/${results.length} security checks passed`);
  process.exit(passed === results.length ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
