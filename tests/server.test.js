// ── Server authority, integrity & abuse tests ─────────────────────────────────
// Run against the real handlers with the in-memory store (full persistence
// paths: idempotency, atomic daily claims, immutable challenge games).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { _memReset } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import challengeHandler from "../api/challenge.js";
import dailyHandler from "../api/daily.js";
import profileHandler from "../api/profile.js";
import healthHandler from "../api/health.js";
import { isAllowedAssetUrl } from "../image-pipeline/approve.mjs";
import { utcDateKey, dailySeed, replayDaily } from "../src/dailyChallenge.js";

// A legal daily submission: replay today's official draft with keep-all.
const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const DAILY_DECISIONS = [KEEP_ALL, KEEP_ALL, KEEP_ALL];
const legalDaily = () => ({
  mode: "daily",
  goldIds: replayDaily(dailySeed(utcDateKey()), DAILY_DECISIONS).map((p) => p.id),
  dailyDecisions: DAILY_DECISIONS,
});

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const SESSION_A = "a".repeat(48);
const SESSION_B = "b".repeat(48);

const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  send(b) { this.body = b; return this; },
  end() { return this; },
});
const mockReq = ({ method = "POST", body = {}, headers = {}, query = {}, session } = {}) => ({
  method, body, query,
  headers: {
    host: "eraclash.test",
    origin: "https://eraclash.test",
    ...(session ? { cookie: `ec_session=${session}` } : {}),
    ...headers,
  },
});

let simCounter = 0;
const gameBody = (over = {}) => ({
  mode: "single",
  simulationId: `test-sim-${++simCounter}-${Math.random().toString(36).slice(2, 10)}`,
  goldIds: GOLD,
  blueIds: BLUE,
  ...over,
});

beforeAll(() => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.ENABLE_CHAOS_TESTS = "true";
});
beforeEach(() => _memReset());

describe("server-authoritative /api/game", () => {
  it("computes a valid core result and ignores fabricated client authority", async () => {
    const res = mockRes();
    await gameHandler(mockReq({
      session: SESSION_A,
      // attacker also sends fabricated authority fields — must be ignored
      body: gameBody({ winner: "Gold", wins: 82, score: "999-0", teamRating: 99999, chemistry: 2.0, streak: 50 }),
    }), res);
    expect(res.statusCode).toBe(200);
    const { result } = res.body;
    expect(["Gold", "Blue"]).toContain(result.core.winner);
    expect(result.core.teamAStats.reduce((s, r) => s + r.pts, 0)).toBe(result.core.finalScore.gold);
    expect(result.core.seriesResult).not.toBe("999-0");
    expect(result.fallbackSummary).toBeTruthy();
    expect(result.session).toBeUndefined(); // owner session never exposed
  });

  it("rejects invalid ids, duplicate persons, bad modes, oversized payloads", async () => {
    for (const body of [
      gameBody({ goldIds: ["fake-1", ...GOLD.slice(1)] }),
      gameBody({ goldIds: ["jordan-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"] }), // same person twice
      gameBody({ goldIds: GOLD.slice(0, 4) }),
      gameBody({ mode: "cheatmode" }),
      gameBody({ simulationId: "x" }),
    ]) {
      const res = mockRes();
      await gameHandler(mockReq({ session: SESSION_A, body }), res);
      expect(res.statusCode, JSON.stringify(body.mode)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILURE");
    }
    const big = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody({ junk: "x".repeat(10000) }) }), big);
    expect(big.statusCode).toBe(413);
  });

  it("rejects cross-origin mutations", async () => {
    const res = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody(), headers: { origin: "https://evil.example" } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("is idempotent: one simulationId → exactly one result", async () => {
    const body = gameBody();
    const r1 = mockRes(), r2 = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body }), r1);
    await gameHandler(mockReq({ session: SESSION_A, body }), r2);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r2.body.replayed).toBe(true);
    expect(r2.body.resultId).toBe(r1.body.resultId);
    expect(r2.body.result.core.seriesResult).toBe(r1.body.result.core.seriesResult);
  });

  it("engine failure records nothing and does not burn the Daily attempt", async () => {
    const fail = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody(legalDaily()), headers: { "x-chaos": "engine-fail" } }), fail);
    expect(fail.statusCode).toBe(500);
    expect(fail.body.code).toBe("ENGINE_FAILURE");
    // the attempt was NOT consumed — a retry succeeds and claims it
    const ok = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody(legalDaily()) }), ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body.records.daily.claimed).toBe(true);
  });

  it("daily: one official attempt per session; replays and refreshes rejected; other sessions unaffected", async () => {
    const first = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody({ ...legalDaily(), displayName: "Joe" }) }), first);
    expect(first.body.records.daily.claimed).toBe(true);
    const again = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody(legalDaily()) }), again);
    expect(again.statusCode).toBe(409);
    const other = mockRes();
    await gameHandler(mockReq({ session: SESSION_B, body: gameBody({ ...legalDaily(), displayName: "Rival" }) }), other);
    expect(other.body.records.daily.claimed).toBe(true);
    // board has exactly two entries — duplicates suppressed
    const board = mockRes();
    await dailyHandler(mockReq({ method: "GET", query: {} }), board);
    expect(board.body.count).toBe(2);
  });

  it("daily leaderboard write path is gone from the public endpoint", async () => {
    const res = mockRes();
    await dailyHandler(mockReq({ body: { action: "submit", won: true, margin: 50, date: "20260823", uid: "cheater" } }), res);
    expect(res.statusCode).toBe(400); // POST no longer exists
    const board = mockRes();
    await dailyHandler(mockReq({ method: "GET", query: {} }), board);
    expect(board.body.count).toBe(0); // nothing was written
  });

  it("82-game season is computed entirely server-side", async () => {
    const res = mockRes();
    await gameHandler(mockReq({ session: SESSION_A, body: gameBody({ mode: "82", blueIds: undefined }) }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.wins + res.body.result.losses).toBe(82);
    expect(res.body.result.core.winner).toBeTruthy(); // finale
  });
});

describe("challenge integrity", () => {
  const createChallenge = async (session, name) => {
    const res = mockRes();
    await challengeHandler(mockReq({ session, body: { action: "create", teamIds: GOLD, name, record: "72-10" } }), res);
    expect(res.statusCode).toBe(200);
    return res.body.id;
  };

  it("completion goes through /api/game; client blueIds are ignored for challenges", async () => {
    const id = await createChallenge(SESSION_A, "Joe");
    const res = mockRes();
    await gameHandler(mockReq({
      session: SESSION_B,
      body: gameBody({ mode: "challenge", challengeId: id, blueIds: BLUE /* attacker tries a weaker rival five */ }),
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.blueIds).toEqual(GOLD); // server used the STORED rival five
    expect(res.body.records.challenge.games).toBe(1);
  });

  it("completed games are immutable; rematches append to the rivalry chain", async () => {
    const id = await createChallenge(SESSION_A, "Joe");
    const g1 = mockRes();
    await gameHandler(mockReq({ session: SESSION_B, body: gameBody({ mode: "challenge", challengeId: id }) }), g1);
    const firstScore = (await getChallenge(id)).games[0].score;
    const g2 = mockRes();
    await gameHandler(mockReq({ session: SESSION_B, body: gameBody({ mode: "challenge", challengeId: id }) }), g2);
    const ch = await getChallenge(id);
    expect(ch.games.length).toBe(2);
    expect(ch.games[0].score).toBe(firstScore); // game 1 untouched
    expect(ch.record.challenger + ch.record.opponent).toBe(2);
  });

  it("the old client 'complete' action is rejected and public views hide sessions", async () => {
    const id = await createChallenge(SESSION_A, "Joe");
    const res = mockRes();
    await challengeHandler(mockReq({ session: SESSION_B, body: { action: "complete", id, game: { winner: "opponent", score: "120-80" } } }), res);
    expect(res.statusCode).toBe(400);
    const view = await getChallenge(id);
    expect(view.games.length).toBe(0); // nothing written
    expect(JSON.stringify(view)).not.toContain(SESSION_A.slice(0, 16));
  });

  async function getChallenge(id) {
    const res = mockRes();
    await challengeHandler(mockReq({ method: "GET", query: { id } }), res);
    return res.body;
  }
});

describe("profile isolation (IDOR/BOLA)", () => {
  it("sessions cannot read or modify each other's profiles", async () => {
    const w = mockRes();
    await profileHandler(mockReq({ session: SESSION_A, body: { profile: { name: "Joe", stats: { wins: 10 } } } }), w);
    expect(w.statusCode).toBe(200);
    // B reads → not found (session-keyed, no uid parameter accepted)
    const rB = mockRes();
    await profileHandler(mockReq({ method: "GET", session: SESSION_B, query: { uid: "anything" } }), rB);
    expect(rB.statusCode).toBe(404);
    // B writes its own; A's remains intact
    await profileHandler(mockReq({ session: SESSION_B, body: { profile: { name: "Mallory", stats: { wins: 999 } } } }), mockRes());
    const rA = mockRes();
    await profileHandler(mockReq({ method: "GET", session: SESSION_A }), rA);
    expect(rA.body.name).toBe("Joe");
    expect(rA.body.stats.wins).toBe(10);
  });

  it("XSS payloads in names and text are neutralized", async () => {
    const res = mockRes();
    await profileHandler(mockReq({
      session: SESSION_A,
      body: { profile: { name: "<script>alert(1)</script>", recentGames: [{ mvp: "<img src=x onerror=alert(1)>", mode: "single" }] } },
    }), res);
    expect(res.body.name).not.toMatch(/[<>]/);
    expect(res.body.recentGames[0].mvp).not.toMatch(/[<>]/);
  });
});

describe("health + SSRF allowlist", () => {
  it("health exposes only coarse states", async () => {
    const res = mockRes();
    await healthHandler(mockReq({ method: "GET" }), res);
    expect(res.body.status).toBeTruthy();
    expect(res.body.coreEngine).toBe("ok");
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/key|token|secret|redis|upstash/i);
  });

  it("image importer only accepts approved HTTPS asset hosts", () => {
    expect(isAllowedAssetUrl("https://upload.wikimedia.org/wikipedia/commons/a/a1/x.jpg")).toBe(true);
    for (const bad of [
      "http://upload.wikimedia.org/x.jpg",           // not https
      "https://localhost/x.jpg",
      "https://127.0.0.1/x.jpg",
      "https://169.254.169.254/latest/meta-data",     // cloud metadata
      "https://10.0.0.5/internal.jpg",
      "https://upload.wikimedia.org:8443/x.jpg",      // unusual port
      "https://evil.example/upload.wikimedia.org/x.jpg",
      "https://user:pass@upload.wikimedia.org/x.jpg",
      "file:///etc/passwd",
      "ftp://upload.wikimedia.org/x.jpg",
    ]) {
      expect(isAllowedAssetUrl(bad), bad).toBe(false);
    }
  });
});
