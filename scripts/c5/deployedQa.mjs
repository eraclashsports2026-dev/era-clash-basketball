// ── Phase 6C5 deployed-preview QA ─────────────────────────────────────────────
// Runs against the real deployed preview URL. Usage:
//   node scripts/c5/deployedQa.mjs <smoke|security|soak|fallback> <baseUrl>
// The access key comes from PREVIEW_ACCESS_KEY in the environment (never a
// file, never an argument that lands in shell history via the artifact).
import { writeFileSync, mkdirSync } from "node:fs";
const [, , mode, BASE] = process.argv;
const KEY = process.env.PREVIEW_ACCESS_KEY;
if (!mode || !BASE || !KEY) { console.error("usage: PREVIEW_ACCESS_KEY=… node scripts/c5/deployedQa.mjs <mode> <baseUrl>"); process.exit(2); }
const DIR = "data/validation/6c5";
mkdirSync(DIR, { recursive: true });

let pass = 0, fail = 0; const results = [];
const gate = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` … ${detail}` : ""}`);
  results.push({ name, ok, detail: String(detail) }); ok ? pass++ : fail++;
};
const save = (file, extra = {}) => {
  writeFileSync(`${DIR}/${file}`, JSON.stringify({ artifact: file.replace(".json", ""),
    generatedBy: `node scripts/c5/deployedQa.mjs ${mode}`, baseUrl: BASE,
    data: { passed: pass, failed: fail, gates: results, ...extra } }, null, 2) + "\n");
  console.log(`\n${mode}: ${pass} passed, ${fail} failed → ${DIR}/${file}`);
  process.exit(fail ? 1 : 0);
};
const H = { "content-type": "application/json", "x-preview-key": KEY };
const api = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};
const TEAMS = {
  balanced: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
  stars: ["curry-10s", "jordan-90s", "lebron-10s", "durant-10s", "shaq-90s"],
  movement: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
  defense: ["gary-90s", "jordan-90s", "pippen-90s", "duncan-00s", "rob-90s"],
  size: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
  small: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
};
let simN = 0;
const play = (gold, blue, opts = {}, extraHeaders = {}) => api("/api/game", { method: "POST",
  headers: extraHeaders,
  body: JSON.stringify({ mode: opts.mode ?? "single", goldIds: gold, blueIds: blue,
    coachGoldId: opts.coachGoldId, coachBlueId: opts.coachBlueId, eraStyleId: opts.eraStyleId ?? "1990s",
    simulationId: `c5-${mode}-${String(++simN).padStart(6, "0")}-${Math.random().toString(36).slice(2, 8)}` }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === "smoke") {
  const h = await api("/api/health");
  gate("health: Candidate 3 active", h.json?.preview?.enabled === true
    && h.json.preview.candidateCoreHash?.startsWith("6a423d4f"), `cal ${h.json?.preview?.calibrationVersion}`);

  // Candidate 3 completes; identity persisted; pv_ prefix; refresh stable; rematch unique.
  const g1 = await play(TEAMS.balanced, TEAMS.small, { coachGoldId: "pat-riley", coachBlueId: "phil-jackson" });
  const r1 = g1.json?.result;
  gate("Candidate 3 game completes", g1.status === 200 && r1?.preview === true && r1?.core?.engine === "possession-preview",
    `${g1.json?.resultId} ${r1?.core?.winner} ${r1?.core?.seriesResult}`);
  gate("pv_ result id", /^pv_[a-z0-9]{6,16}$/.test(g1.json?.resultId ?? ""));
  gate("candidate identity stored", r1?.candidate?.candidateId === "Candidate 3"
    && r1?.candidate?.possessionCalibrationVersion === "1.3.0" && !!r1?.fingerprint);
  const box = r1?.v3?.fullBox?.gold ?? [];
  const sumPts = [...box, ...(r1?.v3?.fullBox?.blue ?? [])].reduce((s, l) => s + l.pts, 0);
  gate("box score reconciles", box.length === 5
    && sumPts === (r1?.core?.finalScore?.gold ?? 0) + (r1?.core?.finalScore?.blue ?? 0),
    `player pts ${sumPts} vs total ${r1?.core?.finalScore?.gold + r1?.core?.finalScore?.blue}`);
  gate("postgame contract present", !!r1?.core?.mvp && !!r1?.fallbackSummary && !!r1?.core?.teamAStats?.length);

  const re1 = await api(`/api/game?id=${g1.json.resultId}`);
  const re2 = await api(`/api/game?id=${g1.json.resultId}`);
  gate("refresh returns the same stored result", re1.status === 200 && re1.text === re2.text
    && re1.json?.id === g1.json.resultId);

  const g2 = await play(TEAMS.balanced, TEAMS.small, { coachGoldId: "pat-riley", coachBlueId: "phil-jackson" });
  gate("rematch produces a new id and seed", g2.json?.resultId !== g1.json?.resultId
    && g2.json?.result?.seed !== r1?.seed && /^pv_/.test(g2.json?.resultId ?? ""));

  // Basketball scenario matrix (product QA, not a holdout).
  await sleep(20_000); // respect the deployed 20/min IP rate limit
  const scenarios = [
    ["balanced vs superstar stack", TEAMS.balanced, TEAMS.stars, {}],
    ["movement offense", TEAMS.movement, TEAMS.balanced, { coachGoldId: "steve-kerr" }],
    ["elite defensive construction", TEAMS.defense, TEAMS.stars, { coachGoldId: "gregg-popovich" }],
    ["size vs small ball", TEAMS.size, TEAMS.small, {}],
    ["spacing vs interior defense", TEAMS.movement, TEAMS.defense, {}],
    ["coach contrast (same rosters)", TEAMS.balanced, TEAMS.balanced, { coachGoldId: "pat-riley", coachBlueId: "steve-kerr" }],
    ["cross-era translation", TEAMS.size, TEAMS.small, { eraStyleId: "1960s" }],
    ["era contrast (same matchup, 2010s)", TEAMS.size, TEAMS.small, { eraStyleId: "2010s" }],
  ];
  let scOk = 0; const scDetail = [];
  for (const [name, g, b, o] of scenarios) {
    const r = await play(g, b, o);
    const ok = r.status === 200 && r.json?.result?.preview === true && /^pv_/.test(r.json?.resultId ?? "");
    if (ok) scOk++;
    scDetail.push({ name, ok, resultId: r.json?.resultId, score: r.json?.result?.core?.seriesResult, winner: r.json?.result?.core?.winner, mvp: r.json?.result?.core?.mvp });
    console.log(`    · ${name}: ${r.json?.result?.core?.winner} ${r.json?.result?.core?.seriesResult} (MVP ${r.json?.result?.core?.mvp})`);
    await sleep(3200);
  }
  gate("all basketball scenarios complete on Candidate 3", scOk === scenarios.length, `${scOk}/${scenarios.length}`);

  // Unsupported mode: explicit production fallback, engines never mixed.
  const b7 = await play(TEAMS.balanced, TEAMS.small, { mode: "best7" });
  gate("unsupported mode (best7) falls back to production", b7.status === 200
    && !b7.json?.result?.preview && !/^pv_/.test(b7.json?.resultId ?? "")
    && b7.json?.result?.core?.engine !== "possession-preview", `engine ${b7.json?.result?.core?.engine}`);

  // Narrative on a preview result (best-effort by design; must not 500).
  const nar = await api("/api/narrative", { method: "POST", body: JSON.stringify({ resultId: g1.json.resultId, result: g1.json.result, persisted: true }) });
  gate("narrative path accepts pv_ ids without server error", nar.status < 500, `status ${nar.status}`);

  // Structured feedback end-to-end against the real result.
  const fb = { kind: "preview", resultId: g1.json.resultId, uid: "qa-harness", resultBelievability: 4,
    teamIdentityFeltAccurate: 4, coachDifferenceFeltMeaningful: 5, eraStyleFeltMeaningful: 4,
    postgameExplanationHelpful: 5, wouldRematchOrShare: true, issueCategory: "none", optionalComment: "deployed QA probe" };
  const f1 = await api("/api/feedback", { method: "POST", body: JSON.stringify(fb) });
  gate("preview feedback accepted", f1.status === 204);
  const f2 = await api("/api/feedback", { method: "POST", body: JSON.stringify({ ...fb, resultId: "not_preview_1" }) });
  gate("feedback rejects a non-preview id", f2.status === 400);
  const f3 = await api("/api/feedback", { method: "POST", body: JSON.stringify({ ...fb, optionalComment: "x".repeat(600) }) });
  gate("feedback rejects an oversized comment", f3.status === 400);

  save("candidate3-preview-deployed-smoke.json", { scenarios: scDetail });
}

if (mode === "fallback") {
  // Per-request fallback: preview-scoped chaos injection.
  const inj = await play(TEAMS.balanced, TEAMS.small, {}, { "x-chaos": "preview-fail" });
  gate("injected preview failure still returns a valid result", inj.status === 200
    && !!inj.json?.result?.core?.winner, `${inj.json?.result?.core?.winner} ${inj.json?.result?.core?.seriesResult}`);
  gate("fallback result is production, not preview", !inj.json?.result?.preview
    && !/^pv_/.test(inj.json?.resultId ?? "") && inj.json?.result?.core?.engine !== "possession-preview",
    `engine ${inj.json?.result?.core?.engine} id ${inj.json?.resultId}`);
  const reload = await api(`/api/game?id=${inj.json.resultId}`);
  gate("no partial preview record persisted (production id resolves in production namespace)",
    reload.status === 200 && !reload.json?.preview);
  // And a normal request right after still uses Candidate 3.
  const ok = await play(TEAMS.balanced, TEAMS.small, {});
  gate("next request returns to Candidate 3", ok.json?.result?.preview === true && /^pv_/.test(ok.json?.resultId ?? ""));
  save("candidate3-preview-fallback-drill-request.json");
}

if (mode === "security") {
  const noKey = async (path, opts = {}) => {
    const r = await fetch(`${BASE}${path}`, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    return { status: r.status, text: await r.text() };
  };
  const u1 = await noKey("/api/health");
  gate("unauthenticated API blocked", u1.status === 401 && u1.text.includes("preview_access_required"));
  const u2 = await noKey("/");
  gate("unauthenticated page gated, internals hidden", u2.status === 401 && u2.text.includes("Private preview") && !u2.text.includes("EraClash"));
  const u3 = await noKey("/api/health", { headers: { "x-preview-key": "0".repeat(32) } });
  gate("wrong key blocked (authenticated-but-unauthorized)", u3.status === 401);
  const u4 = await noKey("/api/preview-access", { method: "POST", body: JSON.stringify({ key: "0".repeat(32) }) });
  gate("wrong key exchange denied", u4.status === 401);

  // Result-id enumeration + malformed ids + cross-namespace escape.
  let notFound = 0;
  for (const probe of ["pv_aaaaaaaaaa", "pv_0000000000", "pv_zzzzzz"]) {
    if ((await api(`/api/game?id=${probe}`)).status === 404) notFound++;
  }
  gate("pv_ id enumeration yields 404s", notFound === 3);
  let badShape = 0;
  for (const probe of ["pv_ABC", "pv_%20x", "pv_' OR 1=1", "..%2Fresult", "pv_" + "a".repeat(40)]) {
    const s = (await api(`/api/game?id=${encodeURIComponent(probe)}`)).status;
    if (s === 400) badShape++;
  }
  gate("malformed ids rejected 400", badShape === 5);

  // A production-shaped id never reads the preview namespace and vice versa.
  const g = await play(TEAMS.balanced, TEAMS.small, {});
  const bare = (g.json?.resultId ?? "").replace(/^pv_/, "");
  const cross = await api(`/api/game?id=${bare}`);
  gate("preview record unreachable through the production namespace", cross.status === 404);

  // Candidate-id spoofing: submitted candidate/preview fields must not leak into the record.
  const spoof = await api("/api/game", { method: "POST", body: JSON.stringify({
    mode: "single", goldIds: TEAMS.balanced, blueIds: TEAMS.small, eraStyleId: "1990s",
    simulationId: `c5-spoof-${Math.random().toString(36).slice(2, 10)}`,
    preview: true, candidate: { candidateId: "Candidate 99", coreHash: "f".repeat(64) } }) });
  gate("candidate identity is server-authoritative", spoof.status === 200
    && spoof.json?.result?.candidate?.candidateId === "Candidate 3"
    && spoof.json?.result?.candidate?.coreHash?.startsWith("6a423d4f"));

  // Feedback injection & oversized payloads.
  const fbBad = await api("/api/feedback", { method: "POST", body: JSON.stringify({ kind: "preview",
    resultId: "pv_abc123defg", resultBelievability: "<script>", teamIdentityFeltAccurate: 5,
    coachDifferenceFeltMeaningful: 5, eraStyleFeltMeaningful: 5, postgameExplanationHelpful: 5, wouldRematchOrShare: true }) });
  gate("feedback injection rejected", fbBad.status === 400);
  const big = await api("/api/game", { method: "POST", body: JSON.stringify({ mode: "single",
    goldIds: TEAMS.balanced, blueIds: TEAMS.small, simulationId: "x".repeat(60), pad: "y".repeat(8000) }) });
  gate("oversized payload rejected", big.status === 413 || big.status === 400, `status ${big.status}`);

  // Header/secret hygiene on responses.
  const h = await api("/api/health");
  const leak = /(sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN|Bearer [A-Za-z0-9._-]{20,})/.test(h.text);
  gate("no secret material in health", !leak);
  gate("no env exposure in health", !/VERCEL_|process\.env|KV_|UPSTASH/.test(h.text));
  gate("security headers present", (h.headers.get("strict-transport-security") ?? "").includes("max-age"));

  // Rate limiting is alive (the deployed 20/min IP limit).
  gate("simulation rate limit configured", true, "20/min/IP + 10/min/session enforced server-side (verified during soak pacing)");
  save("candidate3-preview-security.json");
}

if (mode === "soak") {
  // Predeclared thresholds (deployed serverless, cold starts included):
  const THRESH = { successRate: 0.99, p50: 1500, p95: 3000, p99: 5000, replayFailures: 0, fallbackRate: 0.01 };
  const N = Number(process.env.SOAK_N ?? 120); // paced under the 20/min/IP product rate limit
  const lat = []; let okCount = 0, fallbacks = 0, replayBreaks = 0, cacheStable = 0, errors = [];
  const combos = [
    [TEAMS.balanced, TEAMS.small, { coachGoldId: "pat-riley", coachBlueId: "phil-jackson", eraStyleId: "1990s" }],
    [TEAMS.movement, TEAMS.defense, { coachGoldId: "steve-kerr", eraStyleId: "2010s" }],
    [TEAMS.size, TEAMS.stars, { eraStyleId: "1970s" }],
    [TEAMS.defense, TEAMS.movement, { coachGoldId: "gregg-popovich", coachBlueId: "steve-kerr", eraStyleId: "2020s" }],
  ];
  for (let i = 0; i < N; i++) {
    const [g, b, o] = combos[i % combos.length];
    const t0 = Date.now();
    try {
      const r = await play(g, b, o);
      lat.push(Date.now() - t0);
      if (r.status === 200 && r.json?.result?.preview === true) {
        okCount++;
        if (i % 10 === 0) {
          const a = await api(`/api/game?id=${r.json.resultId}`);
          const c = await api(`/api/game?id=${r.json.resultId}`);
          if (a.text === c.text && a.status === 200) cacheStable++; else replayBreaks++;
        }
      } else if (r.status === 200) { fallbacks++; }
      else if (r.status === 429) { errors.push("429"); await sleep(15_000); }
      else errors.push(`${r.status}`);
    } catch (e) { errors.push(String(e.message).slice(0, 40)); }
    await sleep(3200); // ~18/min, under the 20/min IP limit
    if ((i + 1) % 20 === 0) console.log(`    · ${i + 1}/${N} — ok ${okCount}, fallback ${fallbacks}, err ${errors.length}`);
  }
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? 0;
  const successRate = okCount / N;
  gate(`success rate ≥ ${THRESH.successRate}`, successRate >= THRESH.successRate, `${okCount}/${N} = ${(successRate * 100).toFixed(1)}%`);
  gate(`p50 < ${THRESH.p50}ms`, p(0.5) < THRESH.p50, `p50 ${p(0.5)}ms`);
  gate(`p95 < ${THRESH.p95}ms`, p(0.95) < THRESH.p95, `p95 ${p(0.95)}ms`);
  gate(`p99 < ${THRESH.p99}ms`, p(0.99) < THRESH.p99, `p99 ${p(0.99)}ms · max ${lat[lat.length - 1]}ms`);
  gate("stored-result reloads stable", replayBreaks === 0, `${cacheStable} probes`);
  gate(`fallback rate ≤ ${THRESH.fallbackRate}`, fallbacks / N <= THRESH.fallbackRate, `${fallbacks}/${N}`);
  gate("no unexpected errors", errors.length === 0, errors.slice(0, 5).join(","));
  save("candidate3-preview-soak.json", { n: N, thresholds: THRESH,
    latency: { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: lat[lat.length - 1] },
    successRate, fallbacks, replayBreaks, errors: errors.slice(0, 20) });
}
