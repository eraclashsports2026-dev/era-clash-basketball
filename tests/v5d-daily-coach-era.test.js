// ── Phase 5D: coach + Era Style in the Daily Challenge ────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { _memReset, getJSON } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import dailyHandler from "../api/daily.js";
import narrativeHandler from "../api/narrative.js";
import { utcDateKey, dailySeed, replayDaily, dailyOpponent } from "../src/dailyChallenge.js";
import {
  dailyConfig, dailyCoachOptions, dailyEraStyle, dailySimulationSeed,
  validateDailySelection, validateDailyVersions, bucketsFor,
  COACH_BUCKETS, DAILY_CONFIG_SCHEMA_VERSION, DAILY_COACH_OPTION_COUNT,
} from "../src/v3/dailyCoachEra.js";
import { COACHES, getCoach } from "../src/v3/coaches.js";
import { ERA_STYLE_IDS } from "../src/v3/eraStyleIntelligence.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { versionOf } from "../src/versions.js";
import { runDailyBenchmark } from "../benchmarks/v3/daily-coach-era.mjs";

const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const DECISIONS = [KEEP_ALL, KEEP_ALL, KEEP_ALL];
const SESSION = "d".repeat(48);

const mockRes = () => ({
  statusCode: 200, headers: {}, body: null,
  setHeader(k, v) { this.headers[k] = v; },
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});
const mockReq = ({ method = "POST", body = {}, headers = {}, query = {} } = {}, session = SESSION) => ({
  method, body, query,
  headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${session}`, ...headers },
});

// The Daily claim is per session, so a second "player" is just a second
// session against the SAME store — the narrative cache must survive, which is
// the whole point of the test. So: deliberately no store reset here.
const _memResetKeepingNothing = () => {};

let n = 0;
const dailyBody = (over = {}) => ({
  mode: "daily",
  simulationId: `d5d-${++n}-${Date.now()}`,
  goldIds: replayDaily(dailySeed(utcDateKey()), DECISIONS).map((p) => p.id),
  dailyDecisions: DECISIONS,
  ...over,
});
const playDaily = async (over = {}, session = SESSION) => {
  const res = mockRes();
  await gameHandler(mockReq({ body: dailyBody(over) }, session), res);
  return res;
};

beforeAll(() => { process.env.ECLASH_TEST_MEMORY_STORE = "1"; });
beforeEach(() => { _memReset(); delete process.env.DAILY_COACH_ERA_ENABLED; });
afterEach(() => { delete process.env.DAILY_COACH_ERA_ENABLED; });
// Reads the final score and FAILS LOUDLY if the shape moved. A comparison
// against a field that does not exist is not a test.
const scoreline = (r) => {
  const fs = r?.body?.result?.core?.finalScore;
  if (!fs || typeof fs.gold !== "number" || typeof fs.blue !== "number") {
    throw new Error(`daily result has no numeric finalScore: ${JSON.stringify(fs)}`);
  }
  return `${fs.gold}-${fs.blue}`;
};

const withFlag = (fn) => async () => {
  process.env.DAILY_COACH_ERA_ENABLED = "true";
  try { return await fn(); } finally { delete process.env.DAILY_COACH_ERA_ENABLED; }
};

describe("daily configuration", () => {
  it("the same UTC date returns the same configuration", () => {
    expect(JSON.stringify(dailyConfig("20260825"))).toBe(JSON.stringify(dailyConfig("20260825")));
  });

  it("a different date returns a different configuration", () => {
    const a = dailyConfig("20260825"), b = dailyConfig("20260826");
    expect(a.dailyId).not.toBe(b.dailyId);
    const changed = a.officialEraStyleId !== b.officialEraStyleId ||
      JSON.stringify(a.coachOptionIds) !== JSON.stringify(b.coachOptionIds);
    expect(changed).toBe(true);
  });

  it("is fully versioned and server-generated", () => {
    const c = dailyConfig("20260825");
    for (const k of ["dailyId", "utcDate", "dailySeed", "rosterConfiguration", "coachOptionIds",
                     "officialEraStyleId", "playerDataVersion", "coachDataVersion", "eraDataVersion",
                     "eraStyleVersion", "actionLibraryVersion", "simulationSeedPolicy", "configSchemaVersion"]) {
      expect(c[k], k).toBeDefined();
    }
    expect(c.configSchemaVersion).toBe(DAILY_CONFIG_SCHEMA_VERSION);
    expect(c.coachDataVersion).toBe(versionOf("coachDataVersion"));
    expect(c.simulationSeedPolicy).toBe("DERIVED_FROM_OFFICIAL_CHOICES");
  });

  it("there is ONE shared official era per day", () => {
    for (const d of ["20260825", "20260901", "20261115"]) {
      const era = dailyEraStyle(d);
      expect(ERA_STYLE_IDS).toContain(era);
      expect(dailyEraStyle(d)).toBe(era);           // stable
      expect(dailyConfig(d).officialEraStyleId).toBe(era);
    }
    // and across a month the era actually varies
    const eras = new Set(Array.from({ length: 20 }, (_, i) => dailyEraStyle(`202609${String(i + 1).padStart(2, "0")}`)));
    expect(eras.size).toBeGreaterThan(2);
  });

  it("every session sees the same coach options", () => {
    const a = dailyCoachOptions("20260825"), b = dailyCoachOptions("20260825");
    expect(a.map((x) => x.coachId)).toEqual(b.map((x) => x.coachId));
    expect(a.length).toBe(DAILY_COACH_OPTION_COUNT);
    for (const o of a) expect(COACHES.some((c) => c.id === o.coachId), o.coachId).toBe(true);
  });

  it("the options are strategically DIVERSE, one per bucket", () => {
    for (const d of ["20260825", "20260901", "20261001", "20261115"]) {
      const opts = dailyCoachOptions(d);
      expect(new Set(opts.map((o) => o.coachId)).size, `${d} repeated a coach`).toBe(opts.length);
      expect(new Set(opts.map((o) => o.bucket)).size, `${d} repeated a strategy`).toBe(opts.length);
    }
    expect(COACH_BUCKETS.length).toBeGreaterThanOrEqual(3);
    expect(bucketsFor(getCoach("tom-thibodeau"))).toContain("DEFENSIVE_STRUCTURE");
  });

  it("the options are NOT simply the highest-rated coaches", () => {
    // options are fixed before any roster exists, so they cannot be a ranking
    const opts = dailyCoachOptions("20260825").map((o) => o.coachId);
    const byWins = [...COACHES].sort((a, b) => b.pct - a.pct).slice(0, 3).map((c) => c.id);
    expect(opts).not.toEqual(byWins);
  });

  it("coach-option order never depends on array order in the data file", () => {
    const forward = dailyCoachOptions("20260825", { pool: COACHES });
    const reversed = dailyCoachOptions("20260825", { pool: [...COACHES].reverse() });
    expect(reversed.map((o) => o.coachId)).toEqual(forward.map((o) => o.coachId));
  });

  it("the cache key is keyed by DATE and REVISION, never by data version", () => {
    // Phase 5D versioned this key so a data change could not silently
    // reinterpret a Daily in progress. It achieved the opposite: a mid-day
    // deploy changed the key, generated a SECOND official configuration, and
    // split the day's leaderboard. Immutability belongs to the stored record —
    // the key must be stable for the date, and only an explicit revision may
    // name a different one.
    const k = cacheKeys.dailyConfig({ utcDate: "20260825", revision: 1 });
    expect(k).toBe("daily:v1-0-0:20260825:r1");
    // Match the PREFIXED segments the old key used (pd.../cd.../ed...), not the
    // bare values — eraDataVersion is 1.0.0 and so is the schema version, so a
    // bare-value assertion would fail on the schema tag it is supposed to keep.
    for (const prefix of ["pd", "cd", "ed"]) {
      expect(k, `a ${prefix}* data-version segment must not appear`).not.toMatch(new RegExp(`:${prefix}[0-9]`));
    }
    expect(cacheKeys.dailyConfig({ utcDate: "20260826", revision: 1 })).not.toBe(k);
    expect(cacheKeys.dailyConfig({ utcDate: "20260825", revision: 2 })).not.toBe(k);
    // A revision is required: an unspecified revision must not silently key r"".
    expect(() => cacheKeys.dailyConfig({ utcDate: "20260825" })).toThrow(/revision/);
  });
});

describe("daily validation", () => {
  const cfg = dailyConfig("20260825");

  it("accepts a legal coach and rejects a foreign one", () => {
    expect(validateDailySelection({ config: cfg, coachId: cfg.coachOptionIds[0] })).toEqual({ ok: true });
    const foreign = COACHES.find((c) => !cfg.coachOptionIds.includes(c.id));
    expect(validateDailySelection({ config: cfg, coachId: foreign.id }).code).toBe("DAILY_INVALID_COACH");
    expect(validateDailySelection({ config: cfg, coachId: null }).code).toBe("DAILY_INVALID_COACH");
    expect(validateDailySelection({ config: cfg, coachId: "made-up" }).code).toBe("DAILY_INVALID_COACH");
  });

  it("rejects a tampered era but accepts the official one", () => {
    const other = ERA_STYLE_IDS.find((e) => e !== cfg.officialEraStyleId);
    expect(validateDailySelection({ config: cfg, coachId: cfg.coachOptionIds[0], eraStyleId: other }).code).toBe("DAILY_INVALID_ERA");
    expect(validateDailySelection({ config: cfg, coachId: cfg.coachOptionIds[0], eraStyleId: cfg.officialEraStyleId }).ok).toBe(true);
  });

  it("rejects a version mismatch safely", () => {
    expect(validateDailyVersions({ config: cfg, submitted: null }).ok).toBe(true);
    expect(validateDailyVersions({ config: cfg, submitted: { coachDataVersion: cfg.coachDataVersion } }).ok).toBe(true);
    const bad = validateDailyVersions({ config: cfg, submitted: { coachDataVersion: "0.0.1" } });
    expect(bad.code).toBe("DAILY_VERSION_MISMATCH");
    expect(bad.field).toBe("coachDataVersion");
  });

  it("the server rejects an illegal coach through the real endpoint", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const foreign = COACHES.find((c) => !cfgToday.coachOptionIds.includes(c.id));
    const res = await playDaily({ coachGoldId: foreign.id });
    expect(res.body.code).toBe("DAILY_INVALID_COACH");
    // and the attempt was NOT consumed
    expect(await getJSON(`daily:claim:${utcDateKey()}:${SESSION}`)).toBeNull();
  }));

  it("the server rejects a tampered era through the real endpoint", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const other = ERA_STYLE_IDS.find((e) => e !== cfgToday.officialEraStyleId);
    const res = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0], eraStyleId: other });
    expect(res.body.code).toBe("DAILY_INVALID_ERA");
  }));

  it("an illegal roster is still rejected without consuming the attempt", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const res = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0], goldIds: ["jordan-90s", "curry-10s", "bird-80s", "duncan-00s", "hak-90s"] });
    expect(res.body.code).toBe("DAILY_INVALID_LINEUP");
    expect(await getJSON(`daily:claim:${utcDateKey()}:${SESSION}`)).toBeNull();
  }));

  it("the attempt is consumed exactly once", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const first = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0] });
    expect(first.statusCode).toBe(200);
    expect(first.body.records.daily.claimed).toBe(true);
    const second = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0] });
    expect(second.body.code).toBe("DAILY_ALREADY_COMPLETED");
  }));

  it("concurrent tabs produce exactly one claim", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const results = await Promise.all([1, 2, 3, 4].map(() => playDaily({ coachGoldId: cfgToday.coachOptionIds[0] })));
    const claimed = results.filter((r) => r.body?.records?.daily?.claimed === true);
    expect(claimed.length, "more than one claim was recorded").toBe(1);
  }));
});

describe("daily fairness", () => {
  const cfg = dailyConfig("20260825");
  const gold = ["a", "b", "c", "d", "e"];

  it("the same decisions produce the same seed", () => {
    const s = () => dailySimulationSeed({ config: cfg, goldIds: gold, coachId: cfg.coachOptionIds[0] }).seed;
    expect(s()).toBe(s());
  });

  it("a different legal coach produces a different game", () => {
    const a = dailySimulationSeed({ config: cfg, goldIds: gold, coachId: cfg.coachOptionIds[0] }).seed;
    const b = dailySimulationSeed({ config: cfg, goldIds: gold, coachId: cfg.coachOptionIds[1] }).seed;
    expect(a).not.toBe(b);
  });

  it("a different roster produces a different game", () => {
    const a = dailySimulationSeed({ config: cfg, goldIds: gold, coachId: cfg.coachOptionIds[0] }).seed;
    const b = dailySimulationSeed({ config: cfg, goldIds: ["z", ...gold.slice(1)], coachId: cfg.coachOptionIds[0] }).seed;
    expect(a).not.toBe(b);
  });

  it("the seed does NOT depend on user identity, session, or time", () => {
    const canonical = dailySimulationSeed({ config: cfg, goldIds: gold, coachId: cfg.coachOptionIds[0] }).canonical;
    for (const forbidden of ["session", "uid", "ip", "browser", "Date", "now", "random"]) {
      expect(canonical.toLowerCase(), `seed material must not contain ${forbidden}`).not.toContain(forbidden.toLowerCase());
    }
    const src = readFileSync(new URL("../src/v3/dailyCoachEra.js", import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/Math\.random|Date\.now|sessionId|clientIp/);
  });

  it("two different sessions making the same choices get the same result", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const a = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0] }, "a".repeat(48));
    _memReset();
    const b = await playDaily({ coachGoldId: cfgToday.coachOptionIds[0] }, "b".repeat(48));
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    // Read through a helper that FAILS on a missing field. Comparing
    // core.teamAPts (which does not exist) made this assertion vacuously
    // true — undefined === undefined — so a renamed score field must break
    // the test rather than silently stop testing anything.
    expect(scoreline(b)).toBe(scoreline(a));
    expect(b.body.result.core.winner).toBe(a.body.result.core.winner);
    expect(b.body.result.seed).toBe(a.body.result.seed);
  }));

  it("different legal coach choices can produce different outcomes", withFlag(async () => {
    const cfgToday = dailyConfig(utcDateKey());
    const seen = [];
    const sessions = ["c", "d", "e"];
    for (let i = 0; i < cfgToday.coachOptionIds.length; i++) {
      _memReset();
      const r = await playDaily({ coachGoldId: cfgToday.coachOptionIds[i] }, sessions[i].repeat(48));
      expect(r.statusCode).toBe(200);
      seen.push({ coachId: cfgToday.coachOptionIds[i], score: scoreline(r), seed: r.body.result.seed });
    }
    // Every option must be its own puzzle: a distinct seed each, and the
    // three must not collapse onto one identical scoreline. If the coach
    // choice could not move the result it would be decoration, not a choice.
    expect(new Set(seen.map((s) => s.seed)).size, "each coach must seed its own game").toBe(seen.length);
    expect(new Set(seen.map((s) => s.score)).size, "the coach choice must be a real decision").toBeGreaterThan(1);
  }));

  it("the daily seed is derived once, by the caller, versions included", withFlag(async () => {
    // Two derivations of the same number is a drift hazard: the engine used
    // to re-derive a version-blind daily seed from the date, which silently
    // beat the version-aware one. Exactly one derivation may be authoritative.
    const cfgToday = dailyConfig(utcDateKey());
    const coachId = cfgToday.coachOptionIds[0];
    _memReset();
    const r = await playDaily({ coachGoldId: coachId }, "f".repeat(48));
    expect(r.statusCode).toBe(200);
    const goldIds = r.body.result.goldIds;
    const expected = dailySimulationSeed({ config: cfgToday, goldIds, coachId }).seed;
    expect(r.body.result.seed, "engine must honor the caller-derived daily seed").toBe(expected);
  }));

  it("the benchmark confirms leaderboard comparability", () => {
    const rows = runDailyBenchmark(20);
    expect(rows.length).toBe(20);
    // no coach is always the answer
    const wins = {};
    for (const r of rows) wins[r.options[0].coachId] = (wins[r.options[0].coachId] || 0) + 1;
    expect(Math.max(...Object.values(wins)) / rows.length, "one coach dominates").toBeLessThan(0.5);
    // every option is a plausible route
    for (const r of rows) {
      expect(new Set(r.options.map((o) => o.bucket)).size, `${r.date} options overlap`).toBe(3);
      for (const o of r.options) expect(["WORKABLE", "GOOD", "EXCELLENT"], `${r.date} ${o.coachId}`).toContain(o.eraBand);
    }
    // every (day, coach) pair is its own game
    const seeds = rows.flatMap((r) => r.options.map((o) => o.seed));
    expect(new Set(seeds).size).toBe(seeds.length);
    // and the whole sweep reproduces
    expect(JSON.stringify(runDailyBenchmark(20))).toBe(JSON.stringify(rows));
  });
});

describe("daily failure behaviour", () => {
  it("a failed core simulation does not consume the attempt", withFlag(async () => {
    process.env.ENABLE_CHAOS_TESTS = "true";
    const cfgToday = dailyConfig(utcDateKey());
    const res = mockRes();
    await gameHandler(mockReq({ body: dailyBody({ coachGoldId: cfgToday.coachOptionIds[0] }), headers: { "x-chaos": "engine-fail" } }), res);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(await getJSON(`daily:claim:${utcDateKey()}:${SESSION}`)).toBeNull();
    delete process.env.ENABLE_CHAOS_TESTS;
  }));

  it("the config generator never throws on an odd date", () => {
    for (const d of ["20260101", "20261231", "20260229"]) {
      expect(() => dailyConfig(d)).not.toThrow();
      expect(dailyConfig(d).coachOptionIds.length).toBe(DAILY_COACH_OPTION_COUNT);
    }
  });
});

describe("daily isolation & rollback", () => {
  it("with the flag OFF the Daily behaves exactly as before", async () => {
    const res = await playDaily({});
    expect(res.statusCode).toBe(200);
    expect(res.body.records.daily.claimed).toBe(true);
    // no coach was required, and no era was forced
    expect(res.body.code).toBeUndefined();
  });

  it("with the flag OFF a foreign coach is NOT rejected as a daily-coach error", async () => {
    const res = await playDaily({ coachGoldId: "red-auerbach" });
    expect(res.body.code).not.toBe("DAILY_INVALID_COACH");
  });

  it("the flag defaults to OFF", () => {
    const src = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    expect(src).toMatch(/dailyCoachEra:\s*bool\("DAILY_COACH_ERA_ENABLED",\s*false\)/);
  });

  it("normal modes are unaffected", async () => {
    const res = mockRes();
    await gameHandler(mockReq({ body: { mode: "single", simulationId: `iso-${++n}-${Date.now()}`,
      goldIds: ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"],
      blueIds: ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.core.winner).toBeTruthy();
  });

  it("the config endpoint exposes UI support data but no internal ratings", withFlag(async () => {
    const res = mockRes();
    await dailyHandler(mockReq({ method: "GET", query: { config: "1" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.officialEraStyleId).toBeTruthy();
    expect(res.body.coachOptions.length).toBe(DAILY_COACH_OPTION_COUNT);
    for (const o of res.body.coachOptions) {
      expect(o.coachId).toBeTruthy();
      expect(o.strategy, "each option must say why it is different").toBeTruthy();
      // no raw internals may leak to the client
      for (const banned of ["offense", "defense", "management", "rosterFit", "ovr", "rating", "fit"]) {
        expect(o[banned], `${banned} must not be exposed`).toBeUndefined();
      }
    }
  }));

  it("with the flag OFF the config endpoint keeps its historical shape", async () => {
    const res = mockRes();
    await dailyHandler(mockReq({ method: "GET", query: { config: "1" } }), res);
    expect(res.body.date).toBeTruthy();
    expect(res.body.seed).toBeDefined();
    expect(res.body.coachOptions).toBeUndefined();
    expect(res.body.officialEraStyleId).toBeUndefined();
  });
});

// ── PART 42: Daily narrative cache reuse ──────────────────────────────────────
// A coach/era Daily makes every player who chooses the same coach play a
// byte-identical game. Writing that same recap once per player would be a
// paid provider call per player for one piece of text. These tests measure
// the provider calls at the network boundary — stubbing generateNarrative
// would only prove the mock works.
describe("daily narrative reuse", () => {
  let providerCalls = 0;
  const okResponse = () => ({
    ok: true, status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ summary: "The Daily turned on one run.", mvpReason: "Owned the paint.", turningPoint: "A third-quarter surge." }) }],
      usage: { input_tokens: 1300, output_tokens: 400 },
    }),
  });
  beforeEach(() => {
    providerCalls = 0;
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("api.anthropic.com")) { providerCalls++; return okResponse(); }
      throw new Error(`unexpected fetch ${url}`);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const narrate = async (resultId) => {
    const res = mockRes();
    await narrativeHandler(mockReq({ body: { resultId } }), res);
    return res;
  };

  it("two players who make the same official choices share ONE generation", withFlag(async () => {
    const cfg = dailyConfig(utcDateKey());
    const coachGoldId = cfg.coachOptionIds[0];
    const a = await playDaily({ coachGoldId }, "n".repeat(48));
    expect(a.statusCode).toBe(200);
    const first = await narrate(a.body.resultId);
    expect(first.statusCode).toBe(200);
    expect(providerCalls).toBe(1);

    // A DIFFERENT player, different session, identical decisions. Same game.
    _memResetKeepingNothing();
    const b = await playDaily({ coachGoldId }, "o".repeat(48));
    expect(b.statusCode).toBe(200);
    expect(b.body.resultId, "different players get their own result id").not.toBe(a.body.resultId);
    expect(scoreline(b), "identical decisions must be the identical game").toBe(scoreline(a));

    // ...so the recap is already written.
    const second = await narrate(b.body.resultId);
    expect(second.statusCode).toBe(200);
    expect(second.body.narrative.summary).toBe(first.body.narrative.summary);
    expect(providerCalls, "the same game must not be narrated twice").toBe(1);
  }));

  it("a different coach choice is a different game and IS narrated separately", withFlag(async () => {
    const cfg = dailyConfig(utcDateKey());
    const a = await playDaily({ coachGoldId: cfg.coachOptionIds[0] }, "p".repeat(48));
    await narrate(a.body.resultId);
    expect(providerCalls).toBe(1);
    const b = await playDaily({ coachGoldId: cfg.coachOptionIds[1] }, "q".repeat(48));
    await narrate(b.body.resultId);
    expect(providerCalls, "a different decision deserves its own recap").toBe(2);
  }));

  it("the shared identity comes from OUR record, never from the request", withFlag(async () => {
    // A client that could name the narrative key could read or poison another
    // game's recap. The handler must ignore any client-supplied key.
    const src = readFileSync(new URL("../api/narrative.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/req\.body\??\.narrativeKeyId/);
    expect(src, "identity must be bound from the stored result").toMatch(/validNarrativeKeyId\(result\.narrativeKeyId\)/);
  }));

  it("non-daily modes keep per-result narrative identity", async () => {
    // No flag: an ordinary game must not acquire a shared identity.
    const res = mockRes();
    await gameHandler(mockReq({ body: {
      mode: "single", simulationId: `nar-${Date.now()}`,
      goldIds: replayDaily(dailySeed(utcDateKey()), DECISIONS).map((p) => p.id),
      blueIds: dailyOpponent(utcDateKey()).map((p) => p.id),
    } }), res);
    expect(res.statusCode).toBe(200);
    const stored = await getJSON(`result:${res.body.resultId}`);
    expect(stored.narrativeKeyId, "only a coach/era Daily may share a narrative").toBeNull();
  });
});

// ── PART 43: Daily analytics ──────────────────────────────────────────────────
// Instrumentation that the server drops is instrumentation that does not
// exist, so these tests check BOTH ends: the client emits the event and the
// events endpoint accepts the name.
describe("daily analytics", () => {
  const DAILY_EVENTS = [
    "daily_config_loaded", "daily_era_viewed", "daily_coach_options_viewed",
    "daily_coach_selected", "daily_started", "daily_completed",
    "daily_invalid_coach", "daily_invalid_era", "daily_version_mismatch",
    "daily_result_shared",
  ];
  const appSrc = () => readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const eventsSrc = () => readFileSync(new URL("../api/events.js", import.meta.url), "utf8");

  it("every daily event is emitted by the client", () => {
    const src = appSrc();
    for (const e of DAILY_EVENTS) {
      expect(src, `${e} is never emitted`).toContain(`track("${e}"`);
    }
  });

  it("every daily event is accepted by /api/events", () => {
    const src = eventsSrc();
    for (const e of DAILY_EVENTS) {
      expect(src, `${e} would be silently dropped server-side`).toContain(`"${e}"`);
    }
  });

  it("daily events carry no personal data", () => {
    const src = appSrc();
    // Grab each daily track(...) call and check its props.
    const calls = src.match(/track\("daily_[a-z_]+",\s*\{[^}]*\}/g) || [];
    expect(calls.length, "no daily track calls found — the regex or the code moved").toBeGreaterThanOrEqual(8);
    for (const c of calls) {
      expect(c, `PII in analytics: ${c}`).not.toMatch(/email|display_?name|getDisplayName|uid:|legacyUid|session:|cookie/i);
    }
  });

  it("no daily event carries a rating, OVR, or projected outcome", () => {
    const src = appSrc();
    const calls = src.match(/track\("daily_[a-z_]+",\s*\{[^}]*\}/g) || [];
    for (const c of calls) {
      // Coach ids and era ids are fine; coach GRADES are not — publishing a
      // fit score to analytics is how a "best coach" leaks back into the UI.
      expect(c, `rating leak in analytics: ${c}`).not.toMatch(/\bovr\b|fit_score|coach_score|expected_|win_pct/i);
    }
  });
});
