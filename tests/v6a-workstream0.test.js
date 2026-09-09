// ── Phase 6A Workstream 0: Phase 5 corrections ───────────────────────────────
// Four inconsistencies, four sets of tests. Each asserts the CORRECTED
// specification, never a loosened one.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { audit, RECORDING_WINDOW, REVIEW_STATUS, RECORDING_START_YEAR, classifyCard, curatedDefenseFields } from "../scripts/audit-pre1974-defense.mjs";
import { buildReport, REPORT_STATUS, FIXTURE, SOURCE, detectSource } from "../scripts/cache-report.mjs";
import { PLAYERS } from "../src/players.js";
import { PRE_1974_DEFENSE } from "../src/v3/data/preRecordingDefense.js";
import { _memReset } from "../api/_lib/store.js";
import { REGISTRY } from "../src/versions.js";
import { dailySimulationSeed } from "../src/v3/dailyCoachEra.js";
import {
  officialDailyConfig, issueEmergencyRevision, dailyConfigRevision, readPointer, DAILY_SOURCE,
} from "../api/_lib/dailyOfficial.js";

// ── CORRECTION 1 — pre-recording defensive counts ────────────────────────────
describe("pre-1974 defensive reconciliation", () => {
  const a = audit();

  it("the recording boundary is the 1973-74 season", () => {
    expect(RECORDING_START_YEAR).toBe(1973);
  });

  it("every card lands in exactly one recording window", () => {
    const sum = Object.values(a.byWindow).reduce((x, y) => x + y, 0);
    expect(sum).toBe(a.totalCards);
    expect(a.totalCards).toBe(PLAYERS.length);
    // No card may be silently omitted from the classification.
    for (const c of PLAYERS) {
      expect(Object.values(RECORDING_WINDOW), c.id).toContain(classifyCard(c).window);
    }
  });

  it("every affected card has exactly one review status, and they reconcile", () => {
    const sum = Object.values(a.byReview).reduce((x, y) => x + y, 0);
    expect(sum, "review statuses must account for every affected card exactly once").toBe(a.affectedCards);
    const evidence = a.byReview.RECORDED_STAT + a.byReview.DOCUMENTED_ROLE
      + a.byReview.CALCULATED + a.byReview.INFERRED + a.byReview.CURATED_ATTRIBUTE;
    expect(evidence).toBe(a.reviewed);
    expect(a.reviewed + a.byReview.UNREVIEWED + a.byReview.BLOCKED).toBe(a.affectedCards);
  });

  it("affected means any season could predate recording", () => {
    expect(a.affectedCards).toBe(
      a.byWindow[RECORDING_WINDOW.FULLY_PRE] + a.byWindow[RECORDING_WINDOW.MIXED] + a.byWindow[RECORDING_WINDOW.INDETERMINATE],
    );
    // Fully post-recording cards need no uncertainty handling at all.
    expect(a.rows.filter((r) => r.window === RECORDING_WINDOW.FULLY_POST && r.affected)).toHaveLength(0);
  });

  it("no fully pre-recording card declares a recorded steal or block", () => {
    // The whole point: an unrecorded statistic must not appear as a measurement.
    expect(a.impossible, JSON.stringify(a.impossible)).toHaveLength(0);
  });

  it("no coverage entry exists for a card that needs no handling", () => {
    expect(a.overCovered, `over-coverage: ${a.overCovered.join(", ")}`).toHaveLength(0);
  });

  it("all THREE review mechanisms are counted, not just the banded one", () => {
    // The contradictory 50-vs-45 reporting came from counting one mechanism.
    // preRecordingDefense.js holds bands; data/intelligence.js holds curated
    // attribute patches. Phase 6B2 added a third: a card with a NON-ZERO steal
    // or block average cannot have derived it from a season where the statistic
    // did not exist, so that value is a RECORDED measurement rather than a gap.
    // A count that sees only one mechanism is the original bug.
    expect(a.coverageEntries).toBe(Object.keys(PRE_1974_DEFENSE).length);
    expect(a.curatedEntries, "curated-only defensive coverage must be counted").toBeGreaterThan(0);
    expect(a.byReview.RECORDED_STAT, "recorded-event coverage must be counted").toBeGreaterThan(0);
    expect(a.reviewed).toBe(a.coverageEntries + a.curatedEntries + a.byReview.RECORDED_STAT - 2);
    // ...the -2 being the two banded cards that ALSO carry recorded events, and
    // which the band claims first by precedence.
    expect(a.byReview.UNREVIEWED, "Phase 6B2 closed the gap").toBe(0);
  });

  it("a curated entry counts only when it supplies a defensive field", () => {
    // Several curated cards patch offence alone. Counting those would inflate
    // defensive coverage without anyone having reviewed defense.
    const curatedCounted = a.rows.filter((r) => r.reviewStatus === REVIEW_STATUS.CURATED_ATTRIBUTE);
    for (const r of curatedCounted) {
      expect(curatedDefenseFields(r.id).length, `${r.id} counted with no defensive field`).toBeGreaterThan(0);
    }
  });

  it("every fully pre-recording card is covered", () => {
    const pre = a.rows.filter((r) => r.window === RECORDING_WINDOW.FULLY_PRE);
    const uncovered = pre.filter((r) => [REVIEW_STATUS.UNREVIEWED, REVIEW_STATUS.BLOCKED].includes(r.reviewStatus));
    expect(uncovered.map((r) => r.id), "a card with zero recorded seasons must not be unreviewed").toHaveLength(0);
  });

  it("a 1970s card is never classified by decade label alone", () => {
    // The 1970s decade straddles 1973-74, so the label cannot decide the
    // window. Such a card is INDETERMINATE unless per-season rows exist.
    const decadeOnly = a.rows.filter((r) => r.decade === "1970s" && r.source === "DECADE_SPAN_ONLY");
    expect(decadeOnly.length).toBeGreaterThan(0);
    for (const r of decadeOnly) expect(r.window, r.id).toBe(RECORDING_WINDOW.INDETERMINATE);
  });

  it("the documentation quotes the script, not a remembered number", () => {
    const doc = readFileSync(new URL("../docs/simulation-v3/pre1974-defense-reconciliation.md", import.meta.url), "utf8");
    for (const [label, n] of [
      ["total", a.totalCards], ["fully pre", a.byWindow[RECORDING_WINDOW.FULLY_PRE]],
      ["mixed", a.byWindow[RECORDING_WINDOW.MIXED]], ["indeterminate", a.byWindow[RECORDING_WINDOW.INDETERMINATE]],
      ["fully post", a.byWindow[RECORDING_WINDOW.FULLY_POST]], ["affected", a.affectedCards],
      ["reviewed", a.reviewed], ["unreviewed", a.byReview.UNREVIEWED],
    ]) {
      expect(doc, `${label} (${n}) is not in the reconciliation doc`).toContain(`**${n}**`);
    }
    // The debunked figure must be present as an explanation, never as a count.
    expect(doc).toContain("297");
  });

  it("the risk register no longer claims the stale evidence breakdown", () => {
    const reg = readFileSync(new URL("../docs/simulation-v3/player-data-risk-register.md", import.meta.url), "utf8");
    expect(reg).not.toMatch(/DOCUMENTED_ROLE 11/);
    expect(reg).not.toMatch(/CALCULATED 26/);
    expect(reg, "must point at the reproducible source").toContain("audit:pre1974-defense");
  });
});

// ── CORRECTION 3 — cache-report statuses ─────────────────────────────────────
describe("cache report statuses", () => {
  const R = (metrics, opts = {}) => buildReport(metrics, { source: SOURCE.FIXTURE, ...opts });

  it("NO_TELEMETRY when no events exist", () => {
    const r = R({});
    expect(r.status).toBe(REPORT_STATUS.NO_TELEMETRY);
    // The old report blamed pricing for an absence of data.
    expect(r.costMethod).not.toMatch(/no configured pricing/);
    expect(r.pricingKnown, "pricing IS configured — the absence was of data").toBe(true);
    expect(r.costAvoidedUsd, "never report $0 saved when nothing was measured").toBeNull();
  });

  it("ZERO_REQUESTS when telemetry exists but no narrative requests", () => {
    const r = R({ "cache_hit:teamintel": 12, narrative_requests: 0 });
    expect(r.status).toBe(REPORT_STATUS.ZERO_REQUESTS);
    expect(r.requests).toBe(0);
  });

  it("ZERO_CACHE_HITS when requests exist but none were cached", () => {
    const r = R({ narrative_requests: 40, "cache_hit:narrative": 0, "cache_miss:narrative": 40, provider_calls: 40 });
    expect(r.status).toBe(REPORT_STATUS.ZERO_CACHE_HITS);
    expect(r.reconciles).toBe(true);
    expect(r.hitRate).toBe(0);
  });

  it("MODEL_PRICING_UNAVAILABLE only when tokens exist and pricing does not", () => {
    const r = R({
      narrative_requests: 100, "cache_hit:narrative": 60, "cache_miss:narrative": 40,
      provider_calls: 40, tokens_avoided_input: 75000, tokens_avoided_output: 22800,
    }, { model: "some-unpriced-model" });
    expect(r.status).toBe(REPORT_STATUS.MODEL_PRICING_UNAVAILABLE);
    expect(r.pricingKnown).toBe(false);
    expect(r.costAvoidedUsd, "null, never zero").toBeNull();
    expect(r.reasons.join(" ")).toMatch(/no approved pricing/);
    // Avoided calls and tokens are real regardless of pricing.
    expect(r.tokensAvoidedInput).toBe(75000);
  });

  it("PARTIAL_TELEMETRY when the dataset cannot reconcile", () => {
    const r = R({ narrative_requests: 100, "cache_hit:narrative": 10, provider_calls: 10 });
    expect(r.status).toBe(REPORT_STATUS.PARTIAL_TELEMETRY);
    expect(r.reconciles).toBe(false);
    expect(r.pending, "unreconciled counts must be surfaced, not hidden").toBe(80);
  });

  it("PARTIAL_TELEMETRY on malformed metrics", () => {
    const r = R({ narrative_requests: "not-a-number", "cache_hit:narrative": 5 });
    expect(r.status).toBe(REPORT_STATUS.PARTIAL_TELEMETRY);
    expect(r.malformed).toContain("narrative_requests");
  });

  it("TELEMETRY_AVAILABLE when everything reconciles", () => {
    const r = R({ ...FIXTURE, cost_avoided_microusd: null });
    expect(r.status).toBe(REPORT_STATUS.TELEMETRY_AVAILABLE);
    expect(r.reconciles).toBe(true);
    expect(r.costAvoidedUsd).toBeGreaterThan(0);
  });

  it("the identity holds: requests = hits + provider calls + lock waits", () => {
    const r = R({ ...FIXTURE, cost_avoided_microusd: null });
    expect(r.hits + r.providerCalls + r.lockWaits).toBe(r.requests);
    // Provider failures are a SUBSET of provider calls, not a fourth term:
    // asserting them as one would guarantee a false imbalance on every
    // failed generation.
    expect(r.providerFailures).toBeLessThanOrEqual(r.providerCalls);
  });

  it("a lock-waiting request is counted once, not twice", () => {
    // cache_miss already counts the request; the lock-wait event must not
    // count it again or the report can never reconcile.
    const src = readFileSync(new URL("../api/narrative.js", import.meta.url), "utf8");
    const lockWaitEvents = src.split('cacheEvent("cache_lock_wait"').slice(1);
    expect(lockWaitEvents.length).toBeGreaterThan(0);
    for (const chunk of lockWaitEvents) {
      const body = chunk.slice(0, chunk.indexOf("});"));
      expect(body, "cache_lock_wait must not set narrativeRequest").not.toMatch(/narrativeRequest:\s*true/);
    }
  });

  it("every source is labelled, and a fixture can never read as live", () => {
    expect(R({}, { source: SOURCE.FIXTURE }).isLive).toBe(false);
    expect(R({}, { source: SOURCE.BENCHMARK }).isLive).toBe(false);
    expect(buildReport({}, { source: SOURCE.PRODUCTION }).isLive).toBe(true);
    expect(detectSource({ VERCEL_ENV: "production" })).toBe(SOURCE.PRODUCTION);
    expect(detectSource({ VERCEL_ENV: "preview" })).toBe(SOURCE.PREVIEW);
    expect(detectSource({})).toBe(SOURCE.LOCAL);
  });

  it("every documented status is reachable and explained", () => {
    const doc = readFileSync(new URL("../docs/simulation-v3/cache-report-statuses.md", import.meta.url), "utf8");
    for (const s of Object.values(REPORT_STATUS)) expect(doc, `${s} undocumented`).toContain(s);
  });
});

// ── CORRECTION 4 — Daily configuration immutability ──────────────────────────
// One UTC date has ONE official Daily. That has to survive a deployment: the
// morning's players and the afternoon's players must be playing the same
// challenge, or the leaderboard compares nothing.
describe("daily configuration immutability", () => {
  const DATE = "20260825";

  beforeAll(() => { process.env.ECLASH_TEST_MEMORY_STORE = "1"; });
  beforeEach(() => _memReset());

  // Swap a live version value and restore it, so a "deployment" can be
  // simulated against the real registry rather than a mock of it.
  const withVersions = async (patch, fn) => {
    const saved = {};
    for (const [k, v] of Object.entries(patch)) { saved[k] = REGISTRY[k].value; REGISTRY[k].value = v; }
    try { return await fn(); } finally { for (const k of Object.keys(patch)) REGISTRY[k].value = saved[k]; }
  };

  it("the first request creates the official record and stores it", async () => {
    const first = await officialDailyConfig(DATE);
    expect(first.source).toBe(DAILY_SOURCE.CREATED);
    expect(first.revision).toBe(1);
    expect(first.config.officialDailyId).toBe(`daily-${DATE}-r1`);
    expect(first.config.dailyId, "the two names must be one identity").toBe(first.config.officialDailyId);

    const second = await officialDailyConfig(DATE);
    expect(second.source).toBe(DAILY_SOURCE.STORED);
    expect(second.cached).toBe(true);
    expect(second.config.officialDailyId).toBe(first.config.officialDailyId);
  });

  it("a MID-DAY DEPLOYMENT does not change today's official Daily", async () => {
    // 09:00 UTC — the Daily is created under version set A.
    const morning = await officialDailyConfig(DATE);
    const A = {
      playerDataVersion: morning.config.playerDataVersion,
      coachDataVersion: morning.config.coachDataVersion,
      eraDataVersion: morning.config.eraDataVersion,
    };
    expect(A.playerDataVersion).toBeTruthy();

    // 14:00 UTC — a deployment changes the active data versions to set B.
    await withVersions(
      { playerDataVersion: "2099-01-01", coachDataVersion: "9.9.9", eraDataVersion: "9.9.9" },
      async () => {
        const afternoon = await officialDailyConfig(DATE);

        // Same record, same identity, same revision — no r2 was created.
        expect(afternoon.config.officialDailyId).toBe(morning.config.officialDailyId);
        expect(afternoon.revision).toBe(1);
        expect(afternoon.source).toBe(DAILY_SOURCE.STORED);

        // Still the ORIGINAL versions: A, not B.
        expect(afternoon.config.playerDataVersion).toBe(A.playerDataVersion);
        expect(afternoon.config.coachDataVersion).toBe(A.coachDataVersion);
        expect(afternoon.config.eraDataVersion).toBe(A.eraDataVersion);
        expect(afternoon.config.playerDataVersion).not.toBe("2099-01-01");

        // The puzzle itself is untouched.
        expect(afternoon.config.officialEraStyleId).toBe(morning.config.officialEraStyleId);
        expect(afternoon.config.coachOptionIds).toEqual(morning.config.coachOptionIds);

        // And the game everyone plays is unchanged, because the seed is
        // derived from the STORED versions.
        const args = { goldIds: ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"], coachId: morning.config.coachOptionIds[0] };
        expect(dailySimulationSeed({ config: afternoon.config, ...args }).seed)
          .toBe(dailySimulationSeed({ config: morning.config, ...args }).seed);
      },
    );
  });

  it("a normal deployment never creates revision 2", async () => {
    await officialDailyConfig(DATE);
    await withVersions({ playerDataVersion: "2099-01-01" }, async () => {
      for (let i = 0; i < 5; i++) await officialDailyConfig(DATE);
    });
    expect(await dailyConfigRevision(DATE, 2), "no r2 may appear without an explicit act").toBeNull();
    expect(await readPointer(DATE)).toBe(1);
  });

  it("the NEXT UTC date does pick up the new versions", async () => {
    await officialDailyConfig(DATE);
    await withVersions({ playerDataVersion: "2099-01-01" }, async () => {
      const tomorrow = await officialDailyConfig("20260826");
      expect(tomorrow.source).toBe(DAILY_SOURCE.CREATED);
      expect(tomorrow.config.playerDataVersion, "a new day starts on current data").toBe("2099-01-01");
      // ...while today is still on the old versions.
      const today = await officialDailyConfig(DATE);
      expect(today.config.playerDataVersion).not.toBe("2099-01-01");
    });
  });

  it("CONCURRENT first requests resolve to exactly one configuration", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => officialDailyConfig(DATE)));
    const ids = new Set(results.map((r) => r.config.officialDailyId));
    expect(ids.size, "two workers must never disagree about today's Daily").toBe(1);
    expect(new Set(results.map((r) => r.revision)).size).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r.config.coachOptionIds))).size).toBe(1);
    expect(new Set(results.map((r) => r.config.officialEraStyleId)).size).toBe(1);
    // Exactly one of them may claim to have created it.
    expect(results.filter((r) => r.source === DAILY_SOURCE.CREATED).length).toBe(1);
  });

  it("an EXPLICIT emergency revision creates a distinct Daily and preserves the prior one", async () => {
    const r1 = await officialDailyConfig(DATE);
    const rev = await issueEmergencyRevision({
      utcDate: DATE, reason: "coach option pool contained a retired coach id", operator: "ops:jj",
    });

    expect(rev.revision).toBe(2);
    expect(rev.previousRevision).toBe(1);
    expect(rev.config.officialDailyId).toBe(`daily-${DATE}-r2`);
    expect(rev.config.officialDailyId).not.toBe(r1.config.officialDailyId);
    expect(rev.priorPreserved).toBe(true);

    // Provenance is recorded, not implied.
    expect(rev.config.replacementReason).toMatch(/retired coach id/);
    expect(rev.config.replacedBy).toBe("ops:jj");
    expect(rev.config.replacedAt).toBeGreaterThan(0);
    expect(rev.config.replaces).toBe(r1.config.officialDailyId);

    // The replacement is a genuinely different puzzle — reissuing the same
    // three coaches after replacing the Daily for broken coach options would
    // accomplish nothing.
    const changed = rev.config.officialEraStyleId !== r1.config.officialEraStyleId
      || JSON.stringify(rev.config.coachOptionIds) !== JSON.stringify(r1.config.coachOptionIds);
    expect(changed).toBe(true);

    // The pointer now names r2...
    expect(await readPointer(DATE)).toBe(2);
    expect((await officialDailyConfig(DATE)).config.officialDailyId).toBe(rev.config.officialDailyId);
    // ...and r1 remains readable, with its results still attributable.
    const preserved = await dailyConfigRevision(DATE, 1);
    expect(preserved, "the superseded config must not be overwritten").toBeTruthy();
    expect(preserved.officialDailyId).toBe(r1.config.officialDailyId);
    expect(preserved.coachOptionIds).toEqual(r1.config.coachOptionIds);
  });

  it("an emergency revision refuses to run without a reason and an operator", async () => {
    await officialDailyConfig(DATE);
    await expect(issueEmergencyRevision({ utcDate: DATE, operator: "ops:jj" })).rejects.toThrow(/reason/);
    await expect(issueEmergencyRevision({ utcDate: DATE, reason: "too short" , operator: "ops:jj" })).rejects.toThrow(/reason/);
    await expect(issueEmergencyRevision({ utcDate: DATE, reason: "a properly stated reason for replacement" })).rejects.toThrow(/operator/);
    expect(await readPointer(DATE), "a refused revision must not move the pointer").toBe(1);
  });

  it("leaderboard identity follows the official Daily id, and revisions are separate", async () => {
    const r1 = await officialDailyConfig(DATE);
    const rev = await issueEmergencyRevision({ utcDate: DATE, reason: "official era style was mis-generated", operator: "ops:jj" });
    // Distinct ids mean distinct leaderboard identities — an r2 score is never
    // silently ranked against r1 scores played on a different puzzle.
    expect(rev.config.officialDailyId).not.toBe(r1.config.officialDailyId);
    expect(rev.config.dailyRevision).toBe(2);
    expect(r1.config.dailyRevision).toBe(1);
  });

  it("the game route reads the stored config instead of building one", () => {
    // Regression guard for the actual defect: api/game.js called dailyConfig()
    // and rebuilt the configuration from whatever versions were live.
    const src = readFileSync(new URL("../api/game.js", import.meta.url), "utf8");
    expect(src).toMatch(/officialDailyConfig\(/);
    expect(src, "the game route must not build a daily config").not.toMatch(/=\s*dailyConfig\(/);
    expect(src, "dailyConfig must not even be imported here").not.toMatch(/import \{[^}]*\bdailyConfig\b[^}]*\} from "\.\.\/src\/v3\/dailyCoachEra\.js"/);
  });

  it("no store means no false claim of persistence", async () => {
    // With nothing to be authoritative WITH, the resolver says so rather than
    // implying a stored record exists.
    const saved = process.env.ECLASH_TEST_MEMORY_STORE;
    delete process.env.ECLASH_TEST_MEMORY_STORE;
    try {
      const r = await officialDailyConfig(DATE);
      expect(r.source).toBe(DAILY_SOURCE.EPHEMERAL);
      expect(r.cached).toBe(false);
    } finally { process.env.ECLASH_TEST_MEMORY_STORE = saved; }
  });
});
