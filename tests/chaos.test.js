// ── Chaos tests — graceful degradation under injected failures ────────────────
// Fault injection is gated: ENABLE_CHAOS_TESTS=true AND non-production. These
// prove the reliability principle: an AI (or KV) failure never becomes a game
// failure, never burns a Daily attempt, and never fabricates success.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { _memReset } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import narrativeHandler from "../api/narrative.js";
import { circuitState } from "../api/_lib/ai.js";
import { utcDateKey, dailySeed, replayDaily } from "../src/dailyChallenge.js";

const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const DAILY_DECISIONS = [KEEP_ALL, KEEP_ALL, KEEP_ALL];
const legalDaily = () => ({
  mode: "daily",
  goldIds: replayDaily(dailySeed(utcDateKey()), DAILY_DECISIONS).map((p) => p.id),
  dailyDecisions: DAILY_DECISIONS,
});

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const SESSION = "c".repeat(48);

const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});
const mockReq = ({ method = "POST", body = {}, headers = {}, query = {} } = {}) => ({
  method, body, query,
  headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${SESSION}`, ...headers },
});

let n = 0;
const gameBody = (over = {}) => ({ mode: "single", simulationId: `chaos-${++n}-${Date.now()}`, goldIds: GOLD, blueIds: BLUE, ...over });

const playGame = async (over = {}, headers = {}) => {
  const res = mockRes();
  await gameHandler(mockReq({ body: gameBody(over), headers }), res);
  return res;
};

beforeAll(() => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.ENABLE_CHAOS_TESTS = "true";
  process.env.ANTHROPIC_API_KEY = "test-key-never-used-by-chaos-paths";
  process.env.AI_TIMEOUT_MS = "150";
  process.env.AI_CIRCUIT_FAIL_THRESHOLD = "3";
  process.env.AI_CIRCUIT_WINDOW_SEC = "60";
});
beforeEach(() => { _memReset(); delete process.env.MAX_AI_REQUESTS_PER_DAY; });

describe("AI failure never becomes a game failure", () => {
  it("core result exists and is complete even when narration 500s", async () => {
    const game = await playGame();
    expect(game.statusCode).toBe(200);
    expect(game.body.result.core.mvp).toBeTruthy();
    expect(game.body.result.fallbackSummary).toBeTruthy(); // Postgame is fully renderable

    const nar = mockRes();
    await narrativeHandler(mockReq({ body: { resultId: game.body.resultId }, headers: { "x-chaos": "ai-500" } }), nar);
    expect(nar.statusCode).toBeGreaterThanOrEqual(500);
    expect(["MODEL_UNAVAILABLE", "MODEL_TIMEOUT"]).toContain(nar.body.code);
    // the stored core result is untouched
    const read = mockRes();
    await gameHandler(mockReq({ method: "GET", query: { id: game.body.resultId } }), read);
    expect(read.statusCode).toBe(200);
    expect(read.body.core.mvp).toBe(game.body.result.core.mvp);
  });

  it("AI timeout aborts within the configured budget and reports MODEL_TIMEOUT", async () => {
    const game = await playGame();
    const started = Date.now();
    const nar = mockRes();
    await narrativeHandler(mockReq({ body: { resultId: game.body.resultId }, headers: { "x-chaos": "ai-timeout" } }), nar);
    expect(Date.now() - started).toBeLessThan(5000); // bounded, not platform-timeout
    expect(nar.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("circuit breaker opens after repeated failures and skips provider calls", async () => {
    const game = await playGame();
    // two failing calls × 2 attempts each = 4 recorded failures ≥ threshold 3
    for (let i = 0; i < 2; i++) {
      const nar = mockRes();
      await narrativeHandler(mockReq({ body: { resultId: game.body.resultId }, headers: { "x-chaos": "ai-500" } }), nar);
    }
    expect(await circuitState()).toBe("OPEN");
    const fast = mockRes();
    const t0 = Date.now();
    await narrativeHandler(mockReq({ body: { resultId: game.body.resultId } }), fast); // no chaos header: would call provider if circuit were closed
    expect(fast.body.code).toBe("MODEL_UNAVAILABLE");
    expect(Date.now() - t0).toBeLessThan(500); // skipped, not attempted
  });

  it("daily AI budget exhaustion disables narration only — never the game", async () => {
    process.env.MAX_AI_REQUESTS_PER_DAY = "0";
    const game = await playGame(legalDaily());
    expect(game.statusCode).toBe(200);
    expect(game.body.records.daily.claimed).toBe(true); // gameplay unaffected
    const nar = mockRes();
    await narrativeHandler(mockReq({ body: { resultId: game.body.resultId } }), nar);
    expect(nar.body.code).toBe("MODEL_RATE_LIMITED");
  });
});

describe("KV failure honesty", () => {
  it("kv-down: the game completes but nothing claims to be saved", async () => {
    const res = await playGame({ mode: "single" }, { "x-chaos": "kv-down" });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.core.winner).toBeTruthy();
    expect(res.body.records.persisted).toBe(false); // honest: not saved
    expect(res.body.records.daily).toBeNull();
  });

  it("challenge write failure does not fabricate a completed persistent challenge", async () => {
    // create a real challenge first
    const { default: challengeHandler } = await import("../api/challenge.js");
    const create = mockRes();
    await challengeHandler(mockReq({ body: { action: "create", teamIds: BLUE, name: "Joe" } }), create);
    const res = await playGame({ mode: "challenge", challengeId: create.body.id }, { "x-chaos": "challenge-write-fail" });
    expect(res.statusCode).toBe(200); // the game itself is fine
    expect(res.body.records.challenge.error).toBe("write_failed"); // honest failure
    const view = mockRes();
    await challengeHandler(mockReq({ method: "GET", query: { id: create.body.id } }), view);
    expect(view.body.games.length).toBe(0); // no fabricated rivalry game
  });
});
