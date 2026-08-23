// ── Daily Challenge server verification ────────────────────────────────────────
// Proves the final launch-blocker fix: the server independently re-derives the
// official UTC-seeded daily draft and rejects any lineup it could not produce.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { _memReset } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import dailyHandler from "../api/daily.js";
import {
  utcDateKey, dailySeed, dailyRoll1, applyDailyRoll, replayDaily, verifyDailyLineup, validDecisions,
} from "../src/dailyChallenge.js";

const SESSION = "f".repeat(48);
const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});
const mockReq = ({ method = "POST", body = {}, headers = {}, query = {}, session = SESSION } = {}) => ({
  method, body, query,
  headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${session}`, ...headers },
});

const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const KEEP_NONE = { keeps: [false, false, false, false, false], respins: [null, "era", "position", null, "era"] };
const keepAllDecisions = [KEEP_ALL, KEEP_ALL, KEEP_ALL];

let n = 0;
const dailyBody = (goldIds, decisions, over = {}) => ({
  mode: "daily",
  simulationId: `daily-verify-${++n}-${Date.now()}`,
  goldIds,
  blueIds: ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"],
  dailyDecisions: decisions,
  ...over,
});

beforeAll(() => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.ENABLE_CHAOS_TESTS = "true";
});
beforeEach(() => _memReset());

describe("shared daily generator", () => {
  it("is pure and identical for everyone (no session state, no Math.random)", () => {
    const seed = dailySeed("20260823");
    expect(dailyRoll1(seed).map((p) => p.id)).toEqual(dailyRoll1(seed).map((p) => p.id));
    const d = [KEEP_NONE, KEEP_ALL, KEEP_ALL];
    expect(replayDaily(seed, d).map((p) => p.id)).toEqual(replayDaily(seed, d).map((p) => p.id));
  });
  it("changes across UTC date boundaries", () => {
    const a = dailyRoll1(dailySeed("20260823")).map((p) => p.id);
    const b = dailyRoll1(dailySeed("20260824")).map((p) => p.id);
    expect(a).not.toEqual(b);
  });
  it("respects roll semantics: keeps survive, re-spins draw legally", () => {
    const seed = dailySeed("20260823");
    const r1 = dailyRoll1(seed);
    const r2 = applyDailyRoll(seed, 1, r1, [true, false, true, false, true], [null, "era", null, "position", null]);
    expect(r2[0].id).toBe(r1[0].id);
    expect(r2[2].id).toBe(r1[2].id);
    expect(r2[4].id).toBe(r1[4].id);
    const names = new Set(r2.map((p) => p.name));
    expect(names.size).toBe(5); // one person per lineup holds through re-spins
  });
  it("rejects malformed decision shapes", () => {
    expect(validDecisions(null)).toBe(false);
    expect(validDecisions([KEEP_ALL, KEEP_ALL])).toBe(false); // must be 3 steps
    expect(validDecisions([KEEP_ALL, KEEP_ALL, { keeps: [true], respins: [null] }])).toBe(false);
    expect(validDecisions([KEEP_ALL, KEEP_ALL, { keeps: [1, 1, 1, 1, 1], respins: [null, null, null, null, null] }])).toBe(false);
  });
});

describe("server-side daily lineup verification (/api/game)", () => {
  const todayIds = () => replayDaily(dailySeed(utcDateKey()), keepAllDecisions).map((p) => p.id);

  it("accepts a legitimately drafted daily lineup and claims once", async () => {
    const res = mockRes();
    await gameHandler(mockReq({ body: dailyBody(todayIds(), keepAllDecisions) }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.records.daily.claimed).toBe(true);
  });

  it("rejects an illegal dream team without consuming the attempt", async () => {
    const dream = ["jordan-90s", "magic-80s", "bird-80s", "duncan-00s", "hak-90s"];
    const res = mockRes();
    await gameHandler(mockReq({ body: dailyBody(dream, keepAllDecisions) }), res);
    // (if the day's roll ever legitimately IS the dream team, this would pass —
    // verify the ids differ first)
    expect(todayIds()).not.toEqual(dream);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("DAILY_INVALID_LINEUP");
    // attempt NOT consumed: the legal lineup still claims afterwards
    const ok = mockRes();
    await gameHandler(mockReq({ body: dailyBody(todayIds(), keepAllDecisions) }), ok);
    expect(ok.body.records.daily.claimed).toBe(true);
  });

  it("rejects decision tampering that doesn't reproduce the submitted five", async () => {
    const legal = todayIds();
    const tampered = [KEEP_NONE, KEEP_ALL, KEEP_ALL]; // different path → different five
    const res = mockRes();
    await gameHandler(mockReq({ body: dailyBody(legal, tampered) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("DAILY_INVALID_LINEUP");
  });

  it("ignores client-supplied seeds and dates — server UTC date is the authority", async () => {
    const foreignSeed = dailySeed("19990101");
    const foreignIds = replayDaily(foreignSeed, keepAllDecisions).map((p) => p.id);
    const res = mockRes();
    await gameHandler(mockReq({
      body: dailyBody(foreignIds, keepAllDecisions, { seed: foreignSeed, date: "19990101", dailyDate: "19990101" }),
    }), res);
    expect(res.statusCode).toBe(400); // replayed against TODAY's seed → mismatch
  });

  it("rejects missing decisions outright", async () => {
    const res = mockRes();
    await gameHandler(mockReq({ body: dailyBody(todayIds(), undefined) }), res);
    expect(res.statusCode).toBe(400);
  });

  it("multiple tabs / replays: exactly one official completion", async () => {
    const legal = todayIds();
    const results = await Promise.all(Array.from({ length: 20 }, () => {
      const res = mockRes();
      return gameHandler(mockReq({ body: dailyBody(legal, keepAllDecisions) }), res).then(() => res);
    }));
    const claims = results.filter((r) => r.body?.records?.daily?.claimed === true).length;
    expect(claims).toBe(1);
  });

  it("engine failure before a result never consumes the verified attempt", async () => {
    const legal = todayIds();
    const fail = mockRes();
    await gameHandler(mockReq({ body: dailyBody(legal, keepAllDecisions), headers: { "x-chaos": "engine-fail" } }), fail);
    expect(fail.statusCode).toBe(500);
    const ok = mockRes();
    await gameHandler(mockReq({ body: dailyBody(legal, keepAllDecisions) }), ok);
    expect(ok.body.records.daily.claimed).toBe(true);
  });

  it("GET /api/daily?config=1 publishes the official UTC config", async () => {
    const res = mockRes();
    await dailyHandler(mockReq({ method: "GET", query: { config: "1" } }), res);
    expect(res.body.date).toBe(utcDateKey());
    expect(res.body.seed).toBe(dailySeed(utcDateKey()));
  });
});

describe("verifyDailyLineup unit behavior", () => {
  it("accepts only the exact reachable five in slot order", () => {
    const date = "20260823";
    const legal = replayDaily(dailySeed(date), keepAllDecisions).map((p) => p.id);
    expect(verifyDailyLineup(date, keepAllDecisions, legal).ok).toBe(true);
    expect(verifyDailyLineup(date, keepAllDecisions, [...legal].reverse()).ok).toBe(false);
    expect(verifyDailyLineup(date, keepAllDecisions, legal.slice(0, 4)).ok).toBe(false);
    expect(verifyDailyLineup(date, null, legal).ok).toBe(false);
  });
});
