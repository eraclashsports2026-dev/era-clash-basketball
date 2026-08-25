// ── Phase 3.5: naming, versioning, fingerprints, caching, cost ────────────────
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { _memReset } from "../api/_lib/store.js";
import { REGISTRY, VERSION_STATUS, versionOf, statusOf, isActive, affectsResult, activeVersions, versionsByStatus, VERSIONS } from "../src/versions.js";
import { V3_VERSIONS } from "../src/v3/engine.js";
import { matchupFingerprint, resultFingerprint, canonicalMatchup, hash64 } from "../src/v3/fingerprint.js";
import { cacheKeys, NAMESPACES, namespaceOf, isPublicSafe } from "../api/_lib/cacheKeys.js";
import { redact, estimateCostUsd, MODEL_PRICING, cacheEvent, readCacheMetrics, CACHE_EVENTS } from "../api/_lib/cacheTelemetry.js";
import { buildReport, FIXTURE } from "../scripts/cache-report.mjs";
import { contentHash, isStale, retrieveSource, readRecord, recordFacts, verificationReport, parseArgs, PARSER_VERSION } from "../scripts/research/lib.mjs";
import { runCoachResearch, parseCoachSummary } from "../scripts/research/coaches.mjs";
import { runEraResearch, ERA_SOURCES } from "../scripts/research/eras.mjs";
import gameHandler from "../api/game.js";
import narrativeHandler from "../api/narrative.js";

const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const SESSION = "v".repeat(48);

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
const playGame = async () => {
  const res = mockRes();
  await gameHandler(mockReq({ body: { mode: "single", simulationId: `v35-${++n}-${Date.now()}`, goldIds: GOLD, blueIds: BLUE } }), res);
  return res;
};

beforeAll(() => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});
beforeEach(() => _memReset());

describe("naming resolution", () => {
  it("the live production engine keeps the 3.x family", () => {
    expect(versionOf("engineVersion")).toMatch(/^3\./);
    expect(isActive("engineVersion")).toBe(true);
    expect(V3_VERSIONS.engine).toBe(versionOf("engineVersion"));
  });

  it("the possession engine is 1.x, DEVELOPMENT, and NOT reported as active", () => {
    // Phase 6A built it, so it is no longer PLANNED/null. What must still hold
    // is that it is not ACTIVE: the live production engine remains 3.2.0 and
    // nothing in production selects the possession engine.
    expect(statusOf("possessionEngineVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    expect(versionOf("possessionEngineVersion")).toMatch(/^1\./);
    expect(isActive("possessionEngineVersion")).toBe(false);
    // it must never appear among active versions
    expect(Object.keys(activeVersions())).not.toContain("possessionEngineVersion");
  });

  it("no unfinished module reports a fake active version", () => {
    for (const [name, v] of Object.entries(REGISTRY)) {
      if (v.status !== VERSION_STATUS.ACTIVE) expect(isActive(name), `${name}`).toBe(false);
    }
    // Every PLANNED domain that represents an unbuilt MODULE carries null, not
    // an invented number. (playerCardDesignVersion is PLANNED but holds a
    // defined key SPEC — a settled identity with no renderer, which is a
    // different thing from a module that does not exist.)
    // Phase 6A built the possession engine, so it joins the DEVELOPMENT set:
    // it has a version now, and it still affects no production result. Nothing
    // is left in the registry that is PLANNED and pretending to be a module —
    // playerCardDesignVersion is a key SPEC with no renderer, and it is null.
    for (const name of ["eraStyleVersion", "coachIntelligenceVersion", "actionLibraryVersion", "possessionEngineVersion"]) {
      expect(statusOf(name), name).toBe(VERSION_STATUS.DEVELOPMENT);
      expect(affectsResult(name), name).toBe(false);
    }
    // Coach Intelligence was built in Phase 4: it now has a version, but it is
    // DEVELOPMENT — built and tested, wired to nothing — so it must still be
    // excluded from result fingerprints.
    expect(statusOf("coachIntelligenceVersion")).toBe(VERSION_STATUS.DEVELOPMENT);
    expect(affectsResult("coachIntelligenceVersion")).toBe(false);
  });

  it("no second ambiguous SIM_ENGINE_V3_ENABLED-style flag was introduced", () => {
    const flags = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    // the existing production flag keeps its meaning and its single READ SITE
    expect(flags).toContain("SIM_ENGINE_V3_ENABLED");
    const code = flags.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const reads = code.split("SIM_ENGINE_V3_ENABLED").length - 1;
    expect(reads, "the production flag must not be duplicated or repurposed").toBe(1);
    expect(code).toMatch(/simV3:\s*bool\("SIM_ENGINE_V3_ENABLED"/);
  });

  it("version domains are independent of one another", () => {
    // data and algorithm versions are separate concepts
    expect("coachDataVersion" in REGISTRY).toBe(true);
    expect("coachIntelligenceVersion" in REGISTRY).toBe(true);
    expect(versionOf("coachDataVersion")).not.toBe(versionOf("coachIntelligenceVersion"));
    for (const d of ["playerIntelligenceVersion", "teamIntelligenceVersion", "coachIntelligenceVersion", "eraStyleVersion"]) {
      expect(d in REGISTRY, d).toBe(true);
    }
  });

  it("the registry is the sole source of version constants", () => {
    // the legacy VERSIONS shape is DERIVED, so the two cannot drift
    expect(VERSIONS.app).toBe(versionOf("appVersion"));
    expect(VERSIONS.rating).toBe(versionOf("ratingVersion"));
    expect(VERSIONS.player_data).toBe(versionOf("playerDataVersion"));
    // the engine no longer declares its own version independently
    const engineSrc = readFileSync(new URL("../src/v3/engine.js", import.meta.url), "utf8");
    expect(engineSrc).toMatch(/versionOf\("engineVersion"\)/);
    expect(engineSrc).not.toMatch(/engine:\s*"3\.\d/);
  });

  it("an unknown version domain throws instead of silently returning undefined", () => {
    expect(() => versionOf("notAVersion")).toThrow(/unknown version domain/);
    expect(() => statusOf("notAVersion")).toThrow();
  });

  it("ACTIVE and affects-result are different questions", () => {
    // chemistry ships and is displayed, but changes no simulated result
    expect(isActive("chemistryVersion")).toBe(true);
    expect(affectsResult("chemistryVersion")).toBe(false);
    expect(affectsResult("engineVersion")).toBe(true);
  });
});

describe("matchup & result fingerprints", () => {
  const base = { goldIds: GOLD, blueIds: BLUE, goldPositions: SLOTS, bluePositions: SLOTS, coachIds: { gold: "phil-jackson", blue: "pat-riley" }, eraId: "1980s", mode: "single" };

  it("is deterministic for identical canonical inputs", () => {
    expect(matchupFingerprint(base)).toBe(matchupFingerprint({ ...base }));
    expect(hash64("abc")).toBe(hash64("abc"));
  });

  it("array order does not matter, but explicit positions do", () => {
    const reordered = { ...base, goldIds: [...GOLD].reverse(), goldPositions: [...SLOTS].reverse() };
    expect(matchupFingerprint(reordered)).toBe(matchupFingerprint(base));
    const moved = { ...base, goldPositions: ["PG", "SG", "PF", "SF", "C"] };
    expect(matchupFingerprint(moved)).not.toBe(matchupFingerprint(base));
  });

  it("Gold and Blue are not interchangeable", () => {
    const swapped = { ...base, goldIds: BLUE, blueIds: GOLD };
    expect(matchupFingerprint(swapped)).not.toBe(matchupFingerprint(base));
  });

  it("a coach or era change changes the matchup", () => {
    expect(matchupFingerprint({ ...base, coachIds: { gold: "steve-kerr", blue: "pat-riley" } })).not.toBe(matchupFingerprint(base));
    expect(matchupFingerprint({ ...base, eraId: "2010s" })).not.toBe(matchupFingerprint(base));
  });

  it("the seed is NOT part of the matchup — that is what makes rematches work", () => {
    expect(canonicalMatchup(base)).not.toMatch(/seed/);
  });

  it("a new seed produces a different RESULT identity — no rematch cache collision", () => {
    const a = resultFingerprint({ matchup: base, seed: 1 });
    const b = resultFingerprint({ matchup: base, seed: 2 });
    expect(a.matchupFingerprint).toBe(b.matchupFingerprint);   // same matchup
    expect(a.hash).not.toBe(b.hash);                            // different game
    // same matchup + same seed reproduces exactly
    expect(resultFingerprint({ matchup: base, seed: 1 }).hash).toBe(a.hash);
  });

  it("a data or engine version change changes the result identity", () => {
    const a = resultFingerprint({ matchup: base, seed: 7 });
    const b = resultFingerprint({ matchup: base, seed: 7, extraVersions: { playerDataVersion: "9999-01-01" } });
    expect(b.hash).not.toBe(a.hash);
    const c = resultFingerprint({ matchup: base, seed: 7, extraVersions: { engineVersion: "4.0.0" } });
    expect(c.hash).not.toBe(a.hash);
  });

  it("records every version that materially shaped the result — and none that did not", () => {
    const fp = resultFingerprint({ matchup: base, seed: 3 });
    for (const req of ["engineVersion", "playerDataVersion", "coachDataVersion", "eraDataVersion"]) {
      expect(fp.versions[req], req).toBeTruthy();
    }
    // unwired layers must not claim provenance they do not have
    expect(fp.versions.teamIntelligenceVersion).toBeUndefined();
    expect(fp.versions.possessionEngineVersion).toBeUndefined();
    expect(fp.versions.chemistryVersion).toBeUndefined();
  });

  it("refuses to fingerprint without a seed", () => {
    expect(() => resultFingerprint({ matchup: base })).toThrow(/seed/);
    expect(() => resultFingerprint({ matchup: base, seed: "abc" })).toThrow(/seed/);
  });
});

describe("cache-key registry", () => {
  it("derived namespaces carry versions; live-data namespaces deliberately do not", () => {
    expect(cacheKeys.narrative({ resultId: "r1", provider: "anthropic", model: "m" })).toMatch(/^narrative:p[\d-]+:s[\d-]+:/);
    expect(cacheKeys.teamIntel({ lineupFingerprint: "abc" })).toMatch(/^teamintel:v[\d-]+/);
    // versioning a live-data key would ORPHAN production records, not invalidate them
    expect(cacheKeys.result("r1")).toBe("result:r1");
    expect(cacheKeys.idempotency("s1")).toBe("idem:s1");
    expect(NAMESPACES.result.versioned).toBe(false);
    expect(NAMESPACES.narrative.versioned).toBe(true);
  });

  it("every namespace documents retention and visibility", () => {
    for (const [ns, meta] of Object.entries(NAMESPACES)) {
      expect(meta.retention, ns).toBeTruthy();
      expect(meta.visibility, ns).toBeTruthy();
      expect(typeof meta.versioned, ns).toBe("boolean");
    }
  });

  it("rejects key injection and unknown segments", () => {
    expect(() => cacheKeys.result("evil:injected")).toThrow(/invalid/);
    expect(() => cacheKeys.result("has space")).toThrow(/invalid/);
    expect(() => cacheKeys.result("x".repeat(200))).toThrow(/invalid/);
    expect(() => cacheKeys.narrative({ resultId: "ok", provider: "a:b", model: "m" })).toThrow(/invalid/);
  });

  it("a key becomes buildable exactly when its module ships", () => {
    // Coach fit threw here before Phase 4, era style before Phase 5B, and the
    // possession result before Phase 6A. Each became buildable the moment its
    // module existed — that progression is what this guard tracks.
    expect(() => cacheKeys.coachFit({ coachId: "phil-jackson", teamFingerprint: "abc" })).not.toThrow();
    expect(() => cacheKeys.eraStyle({ eraId: "1980s" })).not.toThrow();
    expect(() => cacheKeys.possessionResult({ matchupFingerprint: "abc", simulationSeed: 1 })).not.toThrow();
    // ...and the only remaining PLANNED domain still refuses.
    expect(() => cacheKeys.playerCard({ playerCardId: "curry-10s", theme: "dark", size: "lg" })).toThrow(/PLANNED/);
  });

  it("separates public-safe namespaces from private ones", () => {
    expect(isPublicSafe(cacheKeys.result("r1"))).toBe(true);
    expect(isPublicSafe(cacheKeys.profile("s1"))).toBe(false);
    expect(isPublicSafe(cacheKeys.idempotency("s1"))).toBe(false);
    expect(namespaceOf(cacheKeys.narrative({ resultId: "r", provider: "p", model: "m" }))).toBe("narrative");
  });

  it("never embeds a full session identifier", () => {
    const long = "s".repeat(200);
    expect(cacheKeys.profile(long).length).toBeLessThan(long.length);
    expect(cacheKeys.dailyClaim("20260101", long)).not.toContain(long);
  });

  it("the documented version table matches the registry", () => {
    // A hand-maintained table drifts. This one had five wrong rows —
    // coachIntelligenceVersion, eraStyleVersion, coachDataVersion and
    // playerCardDesignVersion all stale, actionLibraryVersion and
    // dailyConfigSchemaVersion missing entirely — while the doc claimed to
    // describe the source of truth. Now the doc has to keep up.
    const doc = readFileSync(new URL("../docs/simulation-v3/naming-and-versioning.md", import.meta.url), "utf8");
    for (const [domain, entry] of Object.entries(REGISTRY)) {
      const row = doc.split("\n").find((l) => l.includes(`\`${domain}\``));
      expect(row, `${domain} is not documented`).toBeTruthy();
      const shown = entry.value === null ? "`null`" : `**${entry.value}**`;
      expect(row, `${domain} value is documented as something else`).toContain(shown);
      expect(row, `${domain} status is documented as something else`).toContain(entry.status);
    }
  });

  it("the player-card namespace refuses to key until the design ships", () => {
    // The card RENDERER belongs to the UI phase, so playerCardDesignVersion is
    // PLANNED. This test used to prove the key varied by theme and size — but
    // it could only do that because the PLANNED domain carried a placeholder
    // "1.0.0" and vtag guarded on a null VALUE rather than on STATUS. Caching
    // an artefact produced by a renderer that does not exist is the bug; the
    // key shape is specified, and building one must throw until it is real.
    expect(statusOf("playerCardDesignVersion")).toBe(VERSION_STATUS.PLANNED);
    expect(versionOf("playerCardDesignVersion"), "a PLANNED domain must be null, never a placeholder").toBeNull();
    expect(() => cacheKeys.playerCard({ playerCardId: "curry-10s", theme: "dark", size: "lg" }))
      .toThrow(/PLANNED version domain "playerCardDesignVersion"/);
  });

  it("no PLANNED version domain can build a cache key, whatever its value", () => {
    // The guard must be about status. A PLANNED domain that someone gives a
    // placeholder number must not silently start keying real cache entries —
    // that is how a cache outlives the system that filled it.
    //
    // Every PLANNED domain needs a builder listed here. A new PLANNED domain
    // with no entry FAILS this test rather than quietly going unguarded.
    const BUILDERS = {
      possessionEngineVersion: () => cacheKeys.possessionResult({ fingerprint: "abc123" }),
      playerCardDesignVersion: () => cacheKeys.playerCard({ playerCardId: "curry-10s", theme: "dark", size: "lg" }),
    };
    const planned = Object.keys(versionsByStatus(VERSION_STATUS.PLANNED));
    expect(planned.length, "no PLANNED domains left to guard").toBeGreaterThan(0);
    for (const d of planned) {
      expect(BUILDERS[d], `PLANNED domain "${d}" has no key builder under test`).toBeTypeOf("function");
      expect(BUILDERS[d], `${d} must refuse to key`).toThrow(/PLANNED version domain/);
    }
  });
});

describe("narrative cache", () => {
  // Stub the provider at the network boundary so the REAL validation and
  // caching paths run — a mock of generateNarrative would prove nothing.
  let providerCalls = 0;
  const okResponse = () => ({
    ok: true, status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ summary: "A close game decided late.", mvpReason: "Controlled the paint.", turningPoint: "A fourth-quarter run." }) }],
      usage: { input_tokens: 1250, output_tokens: 380 },
    }),
  });

  beforeEach(() => {
    providerCalls = 0;
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

  it("first request misses and calls the provider exactly once; the second hits cache", async () => {
    const game = await playGame();
    const a = await narrate(game.body.resultId);
    expect(a.statusCode).toBe(200);
    expect(a.body.status).toBe("complete");
    expect(providerCalls).toBe(1);

    const b = await narrate(game.body.resultId);
    expect(b.body.cached).toBe(true);
    expect(b.body.narrative.summary).toBe(a.body.narrative.summary);
    expect(providerCalls, "a reload must never trigger another paid call").toBe(1);
  });

  it("CONCURRENT requests produce exactly one provider call", async () => {
    const game = await playGame();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => narrate(game.body.resultId)));
    expect(providerCalls, "cache stampede — the generation lock did not hold").toBe(1);
    // every caller either got the narrative or an explicit pending state
    for (const r of results) {
      expect([200, 202]).toContain(r.statusCode);
      if (r.statusCode === 200) expect(r.body.narrative.summary).toBeTruthy();
      else expect(r.body.status).toBe("pending");
    }
    expect(results.some((r) => r.statusCode === 200)).toBe(true);
  });

  it("a prompt, schema, or model change is a different artefact and misses", () => {
    const id = { resultId: "r1", provider: "anthropic", model: "claude-sonnet-4-6" };
    const current = cacheKeys.narrative(id);
    expect(cacheKeys.narrative({ ...id, model: "some-other-model" })).not.toBe(current);
    expect(cacheKeys.narrative({ ...id, provider: "other" })).not.toBe(current);
    // prompt + schema versions are baked into the key shape
    expect(current).toContain(`p${String(versionOf("narrativePromptVersion")).replace(/\./g, "-")}`);
    expect(current).toContain(`s${String(versionOf("narrativeSchemaVersion")).replace(/\./g, "-")}`);
  });

  it("invalid model output is never cached as a narrative", async () => {
    const game = await playGame();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "banana" }], usage: {} }) })));
    const r = await narrate(game.body.resultId);
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    // and the failure marker is explicitly a failure, never text
    const { getJSON } = await import("../api/_lib/store.js");
    const stored = await getJSON(cacheKeys.narrative({ resultId: game.body.resultId, provider: "anthropic", model: "claude-sonnet-4-6" }));
    expect(stored?.status).toBe("failed");
    expect(stored?.narrative).toBeUndefined();
  });

  it("the generation lock has a finite TTL so a dead worker cannot deadlock a result", () => {
    const src = readFileSync(new URL("../api/narrative.js", import.meta.url), "utf8");
    const ttl = /LOCK_TTL_SEC\s*=\s*(\d+)/.exec(src);
    expect(ttl).toBeTruthy();
    expect(Number(ttl[1])).toBeGreaterThan(30);
    expect(Number(ttl[1])).toBeLessThan(600);
    expect(src).toMatch(/setNX\(lockKey/);
  });
});

describe("cache telemetry & cost report", () => {
  it("token COUNTS survive redaction but credentials never do", () => {
    const out = redact({ tokensAvoidedInput: 10, outputTokens: 5, model: "m", apiKey: "sk-x", token: "t", authorization: "Bearer z", cookie: "c", password: "p", email: "a@b.com", payload: { big: 1 } });
    expect(out).toEqual({ tokensAvoidedInput: 10, outputTokens: 5, model: "m" });
  });

  it("cost is computed from configured pricing, or null — never guessed", () => {
    expect(estimateCostUsd("claude-sonnet-4-6", 1_000_000, 0)).toBeCloseTo(MODEL_PRICING["claude-sonnet-4-6"].inputPerMTok, 5);
    expect(estimateCostUsd("a-model-with-no-pricing", 1000, 500)).toBeNull();
    expect(estimateCostUsd("claude-sonnet-4-6", "x", 1)).toBeNull();
  });

  it("records events and reconciles them into a report", async () => {
    await cacheEvent("cache_miss", { namespace: "narrative", narrativeRequest: true, providerCall: true });
    for (let i = 0; i < 3; i++) {
      await cacheEvent("cache_hit", {
        namespace: "narrative", narrativeRequest: true, model: "claude-sonnet-4-6",
        tokensAvoidedInput: 1000, tokensAvoidedOutput: 300,
        costAvoidedUsd: estimateCostUsd("claude-sonnet-4-6", 1000, 300),
      });
    }
    const metrics = await readCacheMetrics();
    const report = buildReport(metrics, { source: "live" });
    expect(report.requests).toBe(4);
    expect(report.hits).toBe(3);
    expect(report.providerCalls).toBe(1);
    expect(report.reconciles).toBe(true);
    expect(report.costAvoidedUsd).toBeGreaterThan(0);
    expect(report.tokensAvoidedInput).toBe(3000);
  });

  it("a fixture report is labelled a fixture and still balances", () => {
    const r = buildReport({ ...FIXTURE, cost_avoided_microusd: null }, { source: "TEST_FIXTURE" });
    expect(r.source).toBe("TEST_FIXTURE");
    expect(r.isLive, "a fixture must never read as live usage").toBe(false);
    // Corrected identity: a lock-waiting request is a third resolution, not a
    // leftover. It used to be counted as a request TWICE (cache_miss and
    // cache_lock_wait both set narrativeRequest), so the balance only ever
    // held by ignoring lock waits entirely.
    expect(r.requests).toBe(r.hits + r.providerCalls + r.lockWaits);
    expect(r.pending).toBe(0);
    expect(r.providerFailures, "failures are a subset of provider calls").toBeLessThanOrEqual(r.providerCalls);
    expect(r.reconciles).toBe(true);
    expect(r.costMethod).toMatch(/configured/);
  });

  it("an unknown model yields a null cost rather than a fabricated saving", () => {
    const r = buildReport({ narrative_requests: 5, "cache_hit:narrative": 5, tokens_avoided_input: 100, tokens_avoided_output: 50 }, { source: "live" });
    if (r.model === null) expect(r.costAvoidedUsd).toBeNull();
    expect(CACHE_EVENTS).toContain("cache_lock_wait");
  });

  it("never throws, even on garbage input", async () => {
    await expect(cacheEvent("not_a_real_event", {})).resolves.toBeUndefined();
    await expect(cacheEvent("cache_hit", null)).resolves.toBeUndefined();
  });
});

describe("research cache", () => {
  const fakeSource = (body) => vi.fn(async () => ({ status: 200, body }));
  // The research cache is a real directory on disk, so test subjects must be
  // removed between runs or the second run of the suite sees a cache hit where
  // it expects a fetch. Prefixed with __test- so nothing real is ever deleted.
  const TEST_SUBJECTS = ["__test-coach", "__test-force", "__test-hash", "__test-prov"];
  beforeEach(async () => {
    const { rmSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { CACHE_ROOT } = await import("../scripts/research/lib.mjs");
    for (const id of TEST_SUBJECTS) {
      const f = join(CACHE_ROOT, "coaches", `${id}.json`);
      if (existsSync(f)) rmSync(f);
    }
  });

  it("first retrieval fetches; second uses cache", async () => {
    const fetcher = fakeSource(JSON.stringify({ title: "Test Coach", extract: "x" }));
    const a = await retrieveSource({ subjectType: "coaches", subjectId: "__test-coach", url: "https://example.test/a", fetcher });
    expect(a.fetched).toBe(true);
    const b = await retrieveSource({ subjectType: "coaches", subjectId: "__test-coach", url: "https://example.test/a", fetcher });
    expect(b.cacheHit).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("forced refresh bypasses the cache", async () => {
    const fetcher = fakeSource(JSON.stringify({ title: "T" }));
    await retrieveSource({ subjectType: "coaches", subjectId: "__test-force", url: "https://example.test/b", fetcher });
    const forced = await retrieveSource({ subjectType: "coaches", subjectId: "__test-force", url: "https://example.test/b", fetcher, force: true });
    expect(forced.fetched).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("the content hash changes with the source content, and is stable otherwise", async () => {
    expect(contentHash("a")).toBe(contentHash("a"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
    const f1 = fakeSource("one");
    const r1 = await retrieveSource({ subjectType: "coaches", subjectId: "__test-hash", url: "https://example.test/c", fetcher: f1, force: true });
    const f2 = fakeSource("two");
    const r2 = await retrieveSource({ subjectType: "coaches", subjectId: "__test-hash", url: "https://example.test/c", fetcher: f2, force: true });
    expect(r2.entry.contentHash).not.toBe(r1.entry.contentHash);
    expect(r2.entry.changedSinceLastFetch).toBe(true);
  });

  it("records provenance on every source", async () => {
    const fetcher = fakeSource(JSON.stringify({ title: "P" }));
    const { entry } = await retrieveSource({ subjectType: "coaches", subjectId: "__test-prov", url: "https://example.test/d", title: "P", publisher: "Example", tier: 2, fetcher, force: true });
    for (const k of ["url", "retrievedAt", "contentHash", "sourceTier", "parserVersion", "retrievalToolVersion", "httpStatus", "usageNote"]) {
      expect(entry[k], k).toBeDefined();
    }
    expect(entry.sourceTier).toBe(2);
    expect(entry.usageNote).toMatch(/never committed/i);
  });

  it("a stale or differently-parsed record is refetched", () => {
    expect(isStale(null)).toBe(true);
    expect(isStale({ retrievedAt: new Date().toISOString(), parserVersion: PARSER_VERSION })).toBe(false);
    expect(isStale({ retrievedAt: "2000-01-01T00:00:00Z", parserVersion: PARSER_VERSION })).toBe(true);
    expect(isStale({ retrievedAt: new Date().toISOString(), parserVersion: "0.0.0" })).toBe(true);
  });

  it("the runner is cache-first and can scope a refresh to one coach", async () => {
    const fetcher = fakeSource(JSON.stringify({ title: "Phil Jackson", extract: "e", content_urls: { desktop: { page: "u" } } }));
    const first = await runCoachResearch({ fetcher, only: "phil-jackson", force: true, log: () => {} });
    // force:true guarantees a fetch regardless of what a previous real run left
    expect(first.stats.fetched).toBe(1);
    expect(first.stats.subjects).toBe(1);
    const second = await runCoachResearch({ fetcher, only: "phil-jackson", log: () => {} });
    expect(second.stats.cacheHits).toBe(1);
    expect(second.stats.fetched).toBe(0);
    await expect(runCoachResearch({ fetcher, only: "not-a-coach", log: () => {} })).rejects.toThrow(/unknown coach/);
  });

  it("parses structured facts rather than storing article bodies", () => {
    const parsed = parseCoachSummary(JSON.stringify({ title: "T", description: "d", extract: "e".repeat(5000), content_urls: { desktop: { page: "u" } } }));
    expect(parsed.title).toBe("T");
    expect(parsed.extract.length).toBeLessThanOrEqual(1200);   // lead summary only
    expect(parseCoachSummary("not json")).toBeNull();
  });

  it("the research cache directory is git-ignored", () => {
    const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
    expect(ignore).toMatch(/^\.cache\/?$/m);
  });

  it("era research is now populated, with rules and environment sourced separately", async () => {
    // This asserted an EMPTY manifest in Phase 3.5, when populating it would
    // have meant inventing era profiles. Phase 5B researched them.
    expect(ERA_SOURCES.length).toBe(8);
    for (const e of ERA_SOURCES) {
      expect(e.sources.some((s) => s.kind === "rules"), e.eraId).toBe(true);
      expect(e.sources.some((s) => s.kind === "environment"), e.eraId).toBe(true);
    }
  });

  it("parses --coach style flags", () => {
    expect(parseArgs(["--coach=phil-jackson", "--force"])).toMatchObject({ coach: "phil-jackson", force: true });
    expect(parseArgs([]).force).toBe(false);
  });
});

describe("cache security & public caching", () => {
  it("API responses are never publicly cached", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const api = vercel.headers.find((h) => h.source === "/api/(.*)");
    expect(api.headers.find((x) => x.key === "Cache-Control").value).toBe("no-store");
  });

  it("a missing public result is NOT publicly cached", () => {
    const src = readFileSync(new URL("../api/result-page.js", import.meta.url), "utf8");
    // strip comments first — the explanation of WHY sits between the branch and
    // the header, so a raw character window reads only prose
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const start = code.indexOf("if (!r)");
    expect(start).toBeGreaterThan(-1);
    const notFound = code.slice(start, code.indexOf("return res.status(200)", start));
    expect(notFound, "the not-found branch must not be publicly cached").toMatch(/no-store/);
    // and the found branch caches the immutable record for longer
    expect(code).toMatch(/public,\s*max-age=86400/);
  });

  it("immutable public assets use versioned long-lived caching", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const assets = vercel.headers.find((h) => h.source === "/assets/(.*)");
    expect(assets.headers.find((x) => x.key === "Cache-Control").value).toMatch(/immutable/);
    // ...and only there — never on a private or mutable route
    for (const h of vercel.headers) {
      const cc = h.headers.find((x) => x.key === "Cache-Control")?.value ?? "";
      if (cc.includes("immutable")) expect(h.source).toMatch(/assets/);
    }
  });

  it("secrets never reach telemetry", async () => {
    const logs = [];
    const orig = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    try {
      await cacheEvent("cache_hit", { namespace: "narrative", apiKey: "sk-super-secret", authorization: "Bearer abc", model: "m" });
    } finally { console.log = orig; }
    const joined = logs.join("\n");
    expect(joined).not.toContain("sk-super-secret");
    expect(joined).not.toContain("Bearer abc");
    expect(joined).toContain("narrative");
  });
});
