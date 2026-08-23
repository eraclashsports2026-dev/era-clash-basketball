#!/usr/bin/env node
// ── Final preview soak — real Vercel + real Upstash KV ─────────────────────────
// Controlled, paced verification against the PREVIEW deployment. Respects the
// deployed rate limits (20 core sims/min/IP) by pacing phases across minute
// windows; concurrency bursts are sized to the fresh-window budget. Test
// identities are named SOAK-TEST-* so any leftover records are recognizable.
//   node scripts/preview-soak.mjs <preview-url>
const BASE = process.argv[2];
if (!BASE) { console.error("usage: preview-soak.mjs <url>"); process.exit(1); }

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const ROSTERS = [
  GOLD, BLUE,
  ["oscar-60s", "jerry-60s", "elgin-60s", "bob-60s", "bill-60s"],
  ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "hak-90s"],
  ["curry-20s", "klay-10s", "tatum-20s", "giannis-20s", "wemby-20s"],
  ["stock-90s", "kobe-00s", "lebron-10s", "duncan-00s", "shaq-90s"],
  ["trae-20s", "ant-20s", "butler-10s", "draymond-10s", "bam-20s"],
  ["kidd-00s", "wade-00s", "durant-10s", "dirk-00s", "embiid-20s"],
];
const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const DECISIONS = [KEEP_ALL, KEEP_ALL, KEEP_ALL];

const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// cookie-jar identities
const jars = new Map();
const call = async (identity, path, { method = "GET", body, headers = {} } = {}) => {
  const jar = jars.get(identity) || "";
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: BASE, ...(jar ? { cookie: jar } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.getSetCookie?.() || [];
  for (const c of setC) if (c.startsWith("ec_session=")) jars.set(identity, c.split(";")[0]);
  let json = null;
  try { json = await res.json(); } catch { /* html/empty */ }
  return { status: res.status, json, ms: Date.now() - t0, headers: res.headers };
};

let simN = 0;
const simId = (tag) => `soak-${tag}-${++simN}-${Math.random().toString(36).slice(2, 10)}`;
const game = (identity, body, headers) => call(identity, "/api/game", { method: "POST", body: { simulationId: simId(body.mode), displayName: `SOAK-TEST-${identity}`, ...body }, headers });

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const freshMinute = async () => { const wait = 60000 - (Date.now() % 60000) + 500; out({ pacing: `waiting ${(wait / 1000).toFixed(0)}s for fresh rate-limit window` }); await sleep(wait); };

const main = async () => {
  // ── Phase 0: health, headers, daily config, PWA/cache ──────────────────────
  const health = await call("h", "/api/health");
  out({ phase: "health", status: health.status, body: health.json });

  const page = await fetch(`${BASE}/`);
  const H = (k) => page.headers.get(k);
  out({ phase: "headers", csp: (H("content-security-policy") || "MISSING").slice(0, 90), hsts: H("strict-transport-security"), nosniff: H("x-content-type-options"), referrer: H("referrer-policy"), permissions: (H("permissions-policy") || "").slice(0, 50), coop: H("cross-origin-opener-policy") });

  const cfg = await call("h", "/api/daily?config=1");
  out({ phase: "daily_config", body: cfg.json });

  const sw = await fetch(`${BASE}/sw.js`);
  const swText = await sw.text();
  const assetPath = (await (await fetch(`${BASE}/`)).text()).match(/\/assets\/index-[\w-]+\.js/)?.[0];
  const asset = assetPath ? await fetch(`${BASE}${assetPath}`) : null;
  out({ phase: "pwa_cache", sw_ok: sw.ok, sw_cache_name: (swText.match(/eraclash-v[\d.]+/) || [null])[0], sw_never_caches_api: swText.includes('startsWith("/api/")'), asset_cache: asset?.headers.get("cache-control"), api_cache: health.headers.get("cache-control"), manifest_ok: (await fetch(`${BASE}/manifest.json`)).ok });

  // ── Scenario A: 50 core simulations, mixed build methods ────────────────────
  const { genRoster, genOpponent } = await import("../src/draft.js");
  const { dailyRoll1: chaosFive, dailySeed: chaosSeed } = await import("../src/dailyChallenge.js");
  const lineupFor = (i) => {
    // rotate sources like real users: manual/manual, manual/random,
    // random/manual, random/random, chaos/random
    const mode = i % 5;
    const manualG = ROSTERS[i % ROSTERS.length], manualB = ROSTERS[(i + 3) % ROSTERS.length];
    if (mode === 0) return [manualG, manualB];
    if (mode === 1) return [manualG, genOpponent(Math.random).map((p) => p.id)];
    if (mode === 2) return [genRoster(Math.random).map((p) => p.id), manualB];
    if (mode === 3) return [genRoster(Math.random).map((p) => p.id), genOpponent(Math.random).map((p) => p.id)];
    return [chaosFive(chaosSeed(String(20260101 + i))).map((p) => p.id), genOpponent(Math.random).map((p) => p.id)];
  };
  const lat = []; let aOk = 0, aFail = [], resultIds = [];
  for (let batch = 0; batch < 3; batch++) {
    await freshMinute();
    const n = batch < 2 ? 18 : 14;
    for (let i = 0; i < n; i++) {
      const [gold, blue] = lineupFor(batch * 18 + i);
      const mode = i % 4 === 3 ? "best7" : "single";
      const r = await game(`a${(i % 6)}`, { mode, goldIds: gold, blueIds: blue });
      lat.push(r.ms);
      if (r.status === 200 && r.json?.result?.core?.winner && r.json?.records?.persisted) { aOk++; resultIds.push(r.json.resultId); }
      else aFail.push({ status: r.status, code: r.json?.code });
      await sleep(600);
    }
  }
  // persistence re-read: results survive across requests (real KV)
  let persisted = 0, reread = 0;
  for (const id of resultIds.slice(0, 10)) {
    const r = await call("h", `/api/game?id=${id}`);
    reread++;
    if (r.status === 200 && r.json?.core?.winner) persisted++;
  }
  out({ scenario: "A_core_sims", total: 50, ok: aOk, failures: aFail, p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), p99_ms: pct(lat, 0.99), persisted_rereads: `${persisted}/${reread}`, distinct_results: new Set(resultIds).size });

  // ── Scenario B: 10 Win 82 seasons ───────────────────────────────────────────
  await freshMinute();
  const wins = []; let bFail = 0; const blat = [];
  for (let i = 0; i < 10; i++) {
    const r = await game(`b${i % 3}`, { mode: "82", goldIds: ROSTERS[i % ROSTERS.length] });
    blat.push(r.ms);
    if (r.status === 200 && r.json?.result?.wins + r.json?.result?.losses === 82) wins.push(r.json.result.wins);
    else bFail++;
    await sleep(800);
  }
  out({ scenario: "B_win82", seasons: 10, failures: bFail, win_totals: wins, p95_ms: pct(blat, 0.95) });

  // ── Scenario C: Daily — legality + one-attempt (8 identities) ───────────────
  await freshMinute();
  const legalIds = (cfg.json?.seed != null)
    ? null : null; // lineup derived server-side; we replay locally via decisions only
  // fetch the official five by replaying keep-all through the client module is
  // not available here — instead complete legally via decisions (server replays)
  const dailyLegal = { mode: "daily", dailyDecisions: DECISIONS };
  // the goldIds must match the replay — get them from a helper endpoint-free way:
  // run one legal attempt per identity using ids from the first rejection message? No:
  // we bundled the shared module — import it directly.
  const { replayDaily, dailySeed, utcDateKey } = await import("../src/dailyChallenge.js");
  const officialFive = replayDaily(dailySeed(String(cfg.json?.date || utcDateKey())), DECISIONS).map((p) => p.id);
  let dClaims = 0, dRejects = 0, dConflicts = 0, dOther = [];
  for (let i = 0; i < 8; i++) {
    const r = await game(`d${i}`, { ...dailyLegal, goldIds: officialFive, blueIds: BLUE });
    if (r.json?.records?.daily?.claimed) dClaims++;
    else dOther.push({ status: r.status, code: r.json?.code, daily: r.json?.records?.daily });
    await sleep(400);
  }
  // illegal: dream team, tampered decisions, foreign seed, missing decisions
  const dream = await game("d0", { mode: "daily", goldIds: GOLD, blueIds: BLUE, dailyDecisions: DECISIONS });
  const tampered = await game("d9", { mode: "daily", goldIds: officialFive, blueIds: BLUE, dailyDecisions: [{ keeps: [false, false, false, false, false], respins: [null, null, null, null, null] }, KEEP_ALL, KEEP_ALL] });
  const missing = await game("d9", { mode: "daily", goldIds: officialFive, blueIds: BLUE });
  for (const r of [dream, tampered, missing]) (r.status === 400 && r.json?.code === "DAILY_INVALID_LINEUP") || r.status === 400 ? dRejects++ : dOther.push({ status: r.status, code: r.json?.code });
  // replay after completion
  const replay = await game("d0", { ...dailyLegal, goldIds: officialFive, blueIds: BLUE });
  if (replay.status === 409 || (replay.status === 400 && GOLD !== officialFive)) dConflicts++;
  const board = await call("h", "/api/daily");
  out({ scenario: "C_daily", legal_claims: dClaims, illegal_rejected: dRejects, replay_blocked: dConflicts, board_count: board.json?.count, unexpected: dOther, note: dream.status === 200 ? "DREAM TEAM ACCEPTED — CHECK: today's official five may equal it" : "dream team rejected" });

  // ── Scenario D: Challenges — create/complete/rematch/immutability ───────────
  await freshMinute();
  const chIds = [];
  for (let i = 0; i < 20; i++) {
    const r = await call(`c${i % 4}`, "/api/challenge", { method: "POST", body: { action: "create", teamIds: ROSTERS[i % ROSTERS.length], name: `SOAK-TEST-c${i % 4}`, record: "10-0" } });
    if (r.json?.id) chIds.push(r.json.id);
    await sleep(150);
  }
  let dComp = 0, dRematch = 0, immut = 0, crossFail = 0;
  for (let i = 0; i < 10; i++) {
    const id = chIds[i];
    const r = await game(`r${i % 4}`, { mode: "challenge", challengeId: id, goldIds: BLUE });
    if (r.json?.records?.challenge?.games === 1) dComp++;
    await sleep(500);
  }
  for (let i = 0; i < 5; i++) {
    const id = chIds[i];
    const before = (await call("h", `/api/challenge?id=${id}`)).json;
    const r = await game(`r${i % 4}`, { mode: "challenge", challengeId: id, goldIds: BLUE });
    const after = (await call("h", `/api/challenge?id=${id}`)).json;
    if (r.json?.records?.challenge?.games === 2) dRematch++;
    if (before?.games?.[0]?.score && after?.games?.[0]?.score === before.games[0].score) immut++;
    await sleep(500);
  }
  // duplicate challenge completion: replaying the same simulationId must not
  // append a second rivalry game
  const dupChId = chIds[10];
  const dupSim = simId("chdup");
  const c1 = await call("r9", "/api/game", { method: "POST", body: { mode: "challenge", challengeId: dupChId, simulationId: dupSim, goldIds: BLUE } });
  const c2 = await call("r9", "/api/game", { method: "POST", body: { mode: "challenge", challengeId: dupChId, simulationId: dupSim, goldIds: BLUE } });
  const dupView = (await call("h", `/api/challenge?id=${dupChId}`)).json;
  out({ scenario: "D2_duplicate_challenge_completion", first: c1.status, replay: { status: c2.status, replayed: c2.json?.replayed }, rivalry_games: dupView?.games?.length });

  // cross-user overwrite attempts (old complete action + arbitrary write)
  const ow1 = await call("evil", "/api/challenge", { method: "POST", body: { action: "complete", id: chIds[0], game: { winner: "opponent", score: "150-0" } } });
  const ow2 = await call("evil", "/api/challenge", { method: "POST", body: { action: "create", teamIds: ["fake-1", "x", "y", "z", "w"] } });
  if (ow1.status === 400) crossFail++;
  if (ow2.status === 400) crossFail++;
  out({ scenario: "D_challenges", created: chIds.length, completed: dComp, rematches: dRematch, prior_games_immutable: `${immut}/5`, overwrite_attempts_rejected: `${crossFail}/2` });

  // ── Scenario E: multi-session isolation ─────────────────────────────────────
  await freshMinute();
  await call("s1", "/api/profile", { method: "POST", body: { profile: { name: "SOAK-TEST-s1", stats: { wins: 5 } } } });
  const s2read = await call("s2", "/api/profile");
  await call("s2", "/api/profile", { method: "POST", body: { profile: { name: "<script>alert(1)</script>", stats: { wins: 999 } } } });
  const s1read = await call("s1", "/api/profile");
  const forged = await game("s3", { mode: "single", goldIds: GOLD, blueIds: BLUE, winner: "Gold", wins: 82, score: "999-0" });
  const oldDaily = await call("s3", "/api/daily", { method: "POST", body: { action: "submit", won: true, margin: 50 } });
  const probe = await call("s3", "/api/game?id=zzzzzzzzzz");
  out({ scenario: "E_isolation", cross_read_blocked: s2read.status === 404, own_profile_intact: s1read.json?.name === "SOAK-TEST-s1" && s1read.json?.stats?.wins === 5, xss_sanitized: !/[<>]/.test((await call("s2", "/api/profile")).json?.name || ""), forged_score_ignored: forged.json?.result?.core?.seriesResult !== "999-0", old_daily_write_rejected: oldDaily.status === 400, id_probe_404: probe.status === 404 });

  // ── Scenario H: idempotency burst + narrative + rate limits ────────────────
  await freshMinute();
  const dupId = simId("dup");
  const burst = await Promise.all(Array.from({ length: 25 }, () =>
    call("s1", "/api/game", { method: "POST", body: { mode: "single", simulationId: dupId, goldIds: GOLD, blueIds: BLUE } })));
  const distinct = new Set(burst.filter((r) => r.json?.resultId).map((r) => r.json.resultId));
  const statuses = burst.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  out({ scenario: "H_idempotency_25_parallel", distinct_results: distinct.size, statuses });

  // narrative: happy path (or graceful failure), invalid id, rate limit
  const narrTarget = resultIds[0];
  const n1 = await call("s1", "/api/narrative", { method: "POST", body: { resultId: narrTarget } });
  const nBad = await call("s1", "/api/narrative", { method: "POST", body: { resultId: "zzzzzzzzzz" } });
  const nBurst = [];
  for (let i = 0; i < 8; i++) nBurst.push((await call("s4", "/api/narrative", { method: "POST", body: { resultId: resultIds[i + 1] } })).status);
  out({ scenario: "AI_narrative", first: { status: n1.status, code: n1.json?.code, has_summary: !!n1.json?.narrative?.summary, summary_preview: (n1.json?.narrative?.summary || "").slice(0, 100) }, invalid_id_status: nBad.status, burst_statuses: nBurst, health_ai: (await call("h", "/api/health")).json?.aiNarrative });

  // ── Scenario F: daily-claim race (fresh window, one new session) ────────────
  await freshMinute();
  const race = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    call("racer", "/api/game", { method: "POST", body: { mode: "daily", simulationId: simId("race"), goldIds: officialFive, blueIds: BLUE, dailyDecisions: DECISIONS, displayName: "SOAK-TEST-racer" } })));
  const raceClaims = race.filter((r) => r.json?.records?.daily?.claimed === true).length;
  const raceStatuses = race.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  out({ scenario: "F_daily_race_12_parallel", official_claims: raceClaims, statuses: raceStatuses });

  out({ done: true, note: "leftovers: SOAK-TEST-* daily board entries (expire 40d), ~35 challenge docs (90d), ~70 result docs (180d), 5 test profiles — all namespaced SOAK-TEST, none affect future real users" });
};

main().catch((e) => { out({ fatal: String(e?.message || e) }); process.exit(1); });
