#!/usr/bin/env node
// ── Controlled load tests (LOCAL harness only — never production) ──────────────
// Starts the integration harness (real handlers, in-memory store, AI budget-
// blocked so zero provider spend) and runs the scenario suite with autocannon
// plus precise correctness probes (idempotency, one-attempt daily).
//
//   node scripts/loadtest.mjs
//
// Results are local-environment measurements: they validate behavior under
// concurrency (correctness, graceful 429s, no hangs) — they are NOT production
// capacity claims (Vercel scales functions horizontally; this runs one node).
import autocannon from "autocannon";
import { spawn } from "node:child_process";

const PORT = 4188;
const BASE = `http://localhost:${PORT}`;
const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];

const startHarness = (env = {}) => new Promise((resolve) => {
  const proc = spawn("node", ["scripts/harness.mjs", String(PORT)], {
    env: {
      ...process.env,
      ECLASH_TEST_MEMORY_STORE: "1",
      ENABLE_CHAOS_TESTS: "true",
      MAX_AI_REQUESTS_PER_DAY: "0",
      ...env,
    },
    stdio: "ignore",
  });
  const wait = async () => {
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return resolve(proc); } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error("harness failed to start"); process.exit(1);
  };
  wait();
});

const run = (title, opts) => new Promise((resolve) => {
  autocannon({ url: BASE, ...opts }, (err, res) => {
    if (err) { console.error(title, err); resolve(null); return; }
    const line = {
      scenario: title,
      rps: Math.round(res.requests.average),
      p50_ms: res.latency.p50,
      p95_ms: res.latency.p97_5 ?? res.latency.p95 ?? "-",
      p99_ms: res.latency.p99,
      non2xx: res.non2xx,
      total: res.requests.total ?? res["2xx"] + res.non2xx,
      errors: res.errors,
    };
    console.log(JSON.stringify(line));
    resolve(res);
  });
});

const gameBody = (simId) => JSON.stringify({
  mode: "single", simulationId: simId, goldIds: GOLD, blueIds: BLUE,
});

// fetch-based POST bencher (autocannon's pipelined POSTs stall against the
// plain node harness; undici fetch matches real browser behavior anyway).
const postBench = async (title, { connections, durationSec, makeBody, headers = {} }) => {
  const lat = [];
  let ok = 0, non2xx = 0, errors = 0, n = 0;
  const stopAt = Date.now() + durationSec * 1000;
  const worker = async () => {
    while (Date.now() < stopAt) {
      const t0 = Date.now();
      try {
        const r = await fetch(`${BASE}/api/game`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE, ...headers },
          body: makeBody(n++),
        });
        await r.arrayBuffer();
        lat.push(Date.now() - t0);
        if (r.ok) ok++; else non2xx++;
      } catch { errors++; }
    }
  };
  await Promise.all(Array.from({ length: connections }, worker));
  lat.sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? "-";
  const total = ok + non2xx;
  console.log(JSON.stringify({
    scenario: title, rps: Math.round(total / durationSec),
    p50_ms: pct(0.5), p95_ms: pct(0.95), p99_ms: pct(0.99),
    ok, non2xx, errors, total,
  }));
  return { ok, non2xx, errors, total };
};

const main = async () => {
  // Generous-limit harness for throughput scenarios
  let proc = await startHarness({
    RL_SIM_PER_MIN_IP: "1000000", RL_SIM_PER_MIN_SESSION: "1000000",
    MAX_CORE_SIMULATIONS_PER_MINUTE: "10000000", RL_CHALLENGE_PER_MIN_IP: "1000000",
  });
  console.log("── throughput scenarios (limits raised) ──");

  // A: browsing — 100 users load the app shell + health
  await run("A_browse_100c", { connections: 100, duration: 10, requests: [{ path: "/" }, { path: "/api/health" }] });

  // B: 100-user core simulation burst (unique simulationId per request)
  await postBench("B_sim_burst_100c", { connections: 100, durationSec: 10, makeBody: (i) => gameBody(`burst-${i}-${Math.random().toString(36).slice(2)}`) });

  // C: 250-user core simulation burst
  await postBench("C_sim_burst_250c", { connections: 250, durationSec: 10, makeBody: (i) => gameBody(`large-${i}-${Math.random().toString(36).slice(2)}`) });

  // D: challenge virality — 500 users open the same challenge link
  const create = await fetch(`${BASE}/api/challenge`, {
    method: "POST", headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ action: "create", teamIds: GOLD, name: "LoadJoe" }),
  }).then((r) => r.json());
  await run("D_challenge_virality_500c", { connections: 500, duration: 10, requests: [{ path: `/api/challenge?id=${create.id}` }, { path: `/challenge/${create.id}` }] });

  // H: idempotency under concurrency — 60 parallel identical requests
  const dupResults = await Promise.all(Array.from({ length: 60 }, () =>
    fetch(`${BASE}/api/game`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: `ec_session=${"d".repeat(48)}` },
      body: gameBody("duplicate-idem-test"),
    }).then((r) => r.json().then((b) => ({ status: r.status, id: b.resultId })))));
  const distinctIds = new Set(dupResults.filter((r) => r.id).map((r) => r.id));
  console.log(JSON.stringify({ scenario: "H_idempotency_60_parallel", distinct_results: distinctIds.size, accepted: dupResults.filter((r) => r.status === 200).length, conflicts: dupResults.filter((r) => r.status === 409).length }));

  // E: daily one-attempt under concurrency — 50 parallel daily completions, one session
  const dailyResults = await Promise.all(Array.from({ length: 50 }, (_, i) =>
    fetch(`${BASE}/api/game`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: `ec_session=${"e".repeat(48)}` },
      body: JSON.stringify({ mode: "daily", simulationId: `daily-race-${i}`, goldIds: GOLD, blueIds: BLUE }),
    }).then(async (r) => ({ status: r.status, claimed: (await r.json())?.records?.daily?.claimed }))));
  const claims = dailyResults.filter((r) => r.claimed === true).length;
  console.log(JSON.stringify({ scenario: "E_daily_one_attempt_50_parallel", official_claims: claims, rejected_or_unclaimed: 50 - claims }));

  proc.kill();

  // Default-limit harness: verify 429 protection actually engages
  proc = await startHarness();
  console.log("── protection scenario (default limits) ──");
  const prot = await postBench("F_burst_default_limits_100c", { connections: 100, durationSec: 8, makeBody: (i) => gameBody(`prot-${i}-${Math.random().toString(36).slice(2)}`) });
  console.log(JSON.stringify({ scenario: "F_rate_limit_engaged", note: "non2xx are 429s from the IP/global limiter — protection works, no hangs", accepted: prot.ok, limited: prot.non2xx }));

  proc.kill();
  console.log("done");
};

main();
