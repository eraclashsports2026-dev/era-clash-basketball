// ── Clash Breakdown V1 ────────────────────────────────────────────────────────
// The pure engine and its contract, pinned with synthetic completed results
// shaped exactly like the stored record (v3.fullBox, v3.teamTotals,
// v3.periodScores, core.finalScore): determinism, no mutation, the allowlist,
// percentages and signs, directionality, thresholds, fewer-than-three,
// balanced games, zero attempts, overtime, long and Unicode names, and the
// preservation invariants (no game path imports the breakdown).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { buildBreakdown, selectInsights, selectPerformances, buildFlow, pct } from "../src/breakdown/engine.js";
import * as C from "../src/breakdown/contract.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";

const read = (p) => readFileSync(p, "utf8");
const has = (set, e) => (set.has ? set.has(e) : set.includes(e));

// ── fixture builder ──────────────────────────────────────────────────────────
const P = (name, o = {}) => ({ id: name.toLowerCase().replace(/\W+/g, "-"), name, pos: o.pos || "G", pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, ...o });
/** Five players; `spec` spreads team totals evenly so the box sums to them exactly. */
const team = (names, spec) => {
  const keys = ["fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to"];
  const players = names.map((n) => P(n));
  for (const k of keys) { const v = spec[k] || 0; for (let i = 0; i < 5; i++) players[i][k] = Math.floor(v / 5) + (i < v % 5 ? 1 : 0); }
  for (const p of players) p.pts = 2 * (p.fgm - p.tpm) + 3 * p.tpm + p.ftm;
  return players;
};
const sum = (box) => { const t = {}; for (const k of ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to"]) t[k] = box.reduce((a, p) => a + p[k], 0); t.reb = t.oreb + t.dreb; return t; };
const quarters = (g, b, n = 4) => Array.from({ length: n }, (_, i) => ({ period: i + 1, gold: Math.floor(g / n) + (i < g % n ? 1 : 0), blue: Math.floor(b / n) + (i < b % n ? 1 : 0) }));
const result = (goldSpec, blueSpec, { periods, withTotals = true, overtimes = 0, goldNames, blueNames, extra = {} } = {}) => {
  const gold = team(goldNames || ["Ann Able", "Bo Baker", "Cy Cole", "Di Dunn", "Ed Egan"], goldSpec);
  const blue = team(blueNames || ["Fay Fox", "Gus Gray", "Hal Hart", "Ivy Ives", "Jo Judd"], blueSpec);
  const g = sum(gold), b = sum(blue);
  return {
    id: "abc123def0", seed: 987654321, session: "device-secret", core: { finalScore: { gold: g.pts, blue: b.pts }, winner: g.pts > b.pts ? "Gold" : "Blue" },
    v3: { possessions: 98, overtimes, fullBox: { gold, blue }, ...(withTotals ? { teamTotals: { gold: { ...g, possessions: 97 }, blue: { ...b, possessions: 98 } } } : {}), periodScores: periods || quarters(g.pts, b.pts, 4 + overtimes), fingerprint: { simulationSeed: 42 }, keyMoments: [{ text: "narrative" }] },
    chaosDraft: { cpuDecisionCommit: "x" }, story: { headline: "How Gold Won" }, ...extra,
  };
};
const EVEN = { fgm: 40, fga: 85, tpm: 12, tpa: 34, ftm: 15, fta: 20, oreb: 10, dreb: 34, ast: 24, stl: 7, blk: 4, to: 13 };

describe("contract", () => {
  it("is versioned, with a separate key-performance rule version", () => {
    expect(C.CLASH_BREAKDOWN_VERSION).toBe("1.0.0"); expect(C.KEY_PERFORMANCE_RULE_VERSION).toBe("1.0.0");
    expect(C.MAX_INSIGHTS).toBe(3); expect(C.MAX_PERFORMANCES_PER_TEAM).toBe(2);
  });
  it("declares directionality: turnovers lower-is-stronger, possessions neutral, the rest higher", () => {
    const d = Object.fromEntries(C.TEAM_METRICS.map((m) => [m.key, m.direction]));
    expect(d.to).toBe("lower"); expect(d.possessions).toBe("neutral"); expect(d.reb).toBe("higher"); expect(d.fgPct).toBe("higher");
    expect(C.TEAM_METRICS.find((m) => m.key === "pf")).toBeUndefined();   // fouls are not modeled
  });
  it("thresholds are explicit and every family is in the tie-break order", () => {
    for (const c of C.INSIGHT_CANDIDATES) { expect(c.threshold).toBeGreaterThan(0); expect(C.FAMILY_ORDER).toContain(c.family); }
    expect(C.INSIGHT_CANDIDATES.find((c) => c.id === "fg_pct")).toMatchObject({ threshold: 5, minAttempts: 20 });
    expect(C.INSIGHT_CANDIDATES.find((c) => c.id === "rebounds").threshold).toBe(7);
    expect(C.INSIGHT_CANDIDATES.find((c) => c.id === "turnovers").threshold).toBe(4);
  });
  it("defers what the engine does not record, and says why", () => {
    const deferred = C.DEFERRED.map((d) => d.metric).join(" ");
    for (const m of ["lead changes", "largest lead", "scoring runs", "bench", "fouls", "minutes", "plus/minus", "pace"]) expect(deferred).toContain(m);
    expect(C.CAPABILITY.team.leadChanges).toBe("N"); expect(C.CAPABILITY.team.fouls).toBe("N"); expect(C.CAPABILITY.player.minutes).toBe("N");
  });
  it("carries no causal or attribution vocabulary in its copy", () => {
    const copy = [C.SECTION_TITLE, C.DESCRIPTIVE_NOTE, C.BALANCED_LINE, ...C.INSIGHT_CANDIDATES.map((c) => c.title), read("src/breakdown/engine.js"), read("src/components/breakdown/ClashBreakdown.jsx")].join("\n");
    expect(copy).not.toMatch(/\bwon because\b|\bcaused\b(?! the result\.)|\bdecided the game\b|\bturning point\b|\bmomentum\b|\bdagger\b|\bclutch\b|contributed \d+%|win probability/i);
    expect(copy).not.toMatch(/\bMVP\b/);
  });
});

describe("determinism, purity and the allowlist", () => {
  const r = result({ ...EVEN, oreb: 16, to: 9 }, { ...EVEN, to: 16 });
  it("the same result yields the same breakdown; the input is not mutated", () => {
    const before = JSON.stringify(r);
    const a = buildBreakdown(r), b = buildBreakdown(JSON.parse(before));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify(r)).toBe(before);
  });
  it("never carries the seed, session, fingerprint, draft, narrative or any forbidden field", () => {
    const out = JSON.stringify(buildBreakdown(r));
    for (const f of C.FORBIDDEN_OUTPUT_FIELDS) expect(out).not.toContain(`"${f}"`);
    expect(out).not.toContain("987654321"); expect(out).not.toContain("device-secret"); expect(out).not.toContain("narrative"); expect(out).not.toContain("How Gold Won");
  });
  it("the browser's sim shape and the server record shape give the same projection", () => {
    const sim = { finalScore: r.core.finalScore, v3: r.v3 };
    const a = buildBreakdown(r), b = buildBreakdown(sim);
    expect(JSON.stringify({ ...a, resultId: null })).toBe(JSON.stringify({ ...b, resultId: null }));
  });
  it("is unavailable, not guessed, without a final score or a box score", () => {
    expect(buildBreakdown({})).toMatchObject({ available: false, reason: "no_final_score" });
    expect(buildBreakdown({ core: { finalScore: { gold: 100, blue: 90 } }, v3: {} })).toMatchObject({ available: false, reason: "no_box_score" });
    expect(buildBreakdown(null).available).toBe(false);
  });
  it("sums the box when teamTotals is absent, and reports which source it used", () => {
    const a = buildBreakdown(result(EVEN, { ...EVEN, reb: 0, oreb: 2 }, { withTotals: false }));
    expect(a.dataCoverage.totalsSource).toBe("box_sum"); expect(a.dataCoverage.totalsMatchFinalScore).toBe(true);
  });
  it("shows no insight when the stored totals do not add up to the final score", () => {
    const bad = result({ ...EVEN, oreb: 25 }, EVEN); bad.core.finalScore.gold += 7;
    const a = buildBreakdown(bad);
    expect(a.dataCoverage.totalsMatchFinalScore).toBe(false); expect(a.keyDifferences).toEqual([]);
  });
});

describe("percentages, signs, directionality", () => {
  it("pct is one decimal from made/attempted and null on zero attempts", () => {
    expect(pct(44, 85)).toBe(51.8); expect(pct(1, 3)).toBe(33.3); expect(pct(0, 0)).toBeNull(); expect(pct(0, 10)).toBe(0);
  });
  it("zero three-point attempts (a pre-1979 era) render as a dash, never NaN, and are never an insight", () => {
    const a = buildBreakdown(result({ ...EVEN, tpm: 0, tpa: 0 }, { ...EVEN, tpm: 0, tpa: 0 }));
    const tp = a.teamComparison.find((m) => m.key === "tpPct");
    expect(tp.gold).toBe("—"); expect(tp.blue).toBe("—"); expect(tp.stronger).toBeNull();
    expect(JSON.stringify(a)).not.toMatch(/NaN|Infinity|undefined/);
    expect(a.keyDifferences.find((d) => d.family === "PERIMETER")).toBeUndefined();
  });
  it("fewer turnovers is the stronger side, in the table and in the insight", () => {
    const a = buildBreakdown(result({ ...EVEN, to: 9 }, { ...EVEN, to: 16 }));
    expect(a.teamComparison.find((m) => m.key === "to").stronger).toBe("gold");
    const d = a.keyDifferences.find((x) => x.id === "turnovers");
    expect(d.favours).toBe("gold"); expect(d.summary).toBe("Gold finished with 7 fewer turnovers.");
  });
  it("possessions and made/attempted splits are never highlighted", () => {
    const a = buildBreakdown(result({ ...EVEN, fgm: 50 }, EVEN));
    for (const k of ["fg", "tp", "ft", "possessions"]) expect(a.teamComparison.find((m) => m.key === k)?.stronger ?? null).toBeNull();
  });
  it("margin signs: a Blue edge is written for Blue with a positive count", () => {
    const a = buildBreakdown(result(EVEN, { ...EVEN, dreb: 44 }));
    const d = a.keyDifferences.find((x) => x.family === "REBOUNDING");
    expect(d.favours).toBe("blue"); expect(d.summary).toBe("Blue held a +10 rebounding margin.");
  });
  it("three-point scoring states the made gap and its points, with correct plurals", () => {
    // same accuracy (36.0% v 35.3%), six more makes: the made-shot sentence, not the accuracy one
    const four = buildBreakdown(result({ ...EVEN, tpm: 18, tpa: 50, fgm: 46, fga: 101 }, EVEN)).keyDifferences.find((x) => x.id === "three_made");
    expect(four.summary).toBe("Gold made 6 more three-pointers — 18 more points from threes.");
  });
});

describe("insight selection", () => {
  it("a statistically balanced game shows no insight and the balanced sentence", () => {
    const a = buildBreakdown(result(EVEN, { ...EVEN, to: 14, ast: 22 }));
    expect(a.keyDifferences).toEqual([]); expect(a.balanced).toBe(true); expect(a.balancedLine).toBe(C.BALANCED_LINE);
  });
  it("identical team stats: nothing highlighted, nothing selected", () => {
    const a = buildBreakdown(result(EVEN, EVEN));
    expect(a.keyDifferences).toEqual([]); expect(a.teamComparison.every((m) => m.stronger === null)).toBe(true);
  });
  it("below-threshold gaps never headline (a +1 rebound, a 0.8-point shooting gap)", () => {
    const a = buildBreakdown(result({ ...EVEN, dreb: 35 }, EVEN));
    expect(a.keyDifferences).toEqual([]);
  });
  it("fewer than three qualify → fewer than three shown (no filler)", () => {
    const a = buildBreakdown(result({ ...EVEN, to: 6 }, EVEN));
    expect(a.keyDifferences.map((d) => d.id)).toEqual(["turnovers"]);
  });
  it("ranks by strength relative to each threshold, not by raw size, one per family, at most three", () => {
    // +8 assists (8/6 = 1.33), +20 rebounds (20/7 = 2.86), +4 steals (1.0), -9 turnovers (2.25), +10 OREB inside the same family as rebounds
    const a = buildBreakdown(result({ ...EVEN, ast: 32, oreb: 20, dreb: 44, stl: 11, to: 4 }, EVEN));
    expect(a.keyDifferences.map((d) => d.id)).toEqual(["rebounds", "turnovers", "assists"]);
    expect(new Set(a.keyDifferences.map((d) => d.family)).size).toBe(a.keyDifferences.length);
    expect(a.keyDifferences[0].size).toBe("large");
  });
  it("shooting needs the attempt minimum on both sides", () => {
    const low = selectInsights({ gold: { fgm: 9, fga: 15, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0 }, blue: { fgm: 5, fga: 15, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0 } });
    expect(low.find((d) => d.id === "fg_pct")).toBeUndefined();
  });
  it("ties in strength fall to the documented family order", () => {
    // turnovers Δ4 (1.0) and three-pointers Δ4 (1.0): PERIMETER precedes BALL_SECURITY
    const a = buildBreakdown(result({ ...EVEN, tpm: 16, fgm: 44 }, { ...EVEN, to: 17 }));
    const ids = a.keyDifferences.map((d) => d.id);
    expect(ids.indexOf("three_made")).toBeLessThan(ids.indexOf("turnovers"));
  });
  it("an edge for the losing team is reported like any other (descriptive, not a verdict)", () => {
    const a = buildBreakdown(result({ ...EVEN, fgm: 50, fga: 85 }, { ...EVEN, tpm: 18, tpa: 34, fgm: 46 }));
    expect(a.keyDifferences.some((d) => d.favours === "blue")).toBe(true);
  });
});

describe("game results", () => {
  it("close game and blowout both describe the recorded margin", () => {
    const close = buildBreakdown(result(EVEN, { ...EVEN, ftm: 14 }));
    expect(close.score.margin).toBe(1);
    const blow = buildBreakdown(result({ ...EVEN, fgm: 58, fga: 90 }, { ...EVEN, fgm: 34 }));
    expect(blow.score.margin).toBeGreaterThan(25); expect(blow.keyDifferences[0].id).toBe("fg_pct");
  });
  it("high- and low-scoring games compute without special cases", () => {
    const hi = buildBreakdown(result({ ...EVEN, fgm: 62, fga: 110, ftm: 30, fta: 36 }, { ...EVEN, fgm: 60, fga: 108, ftm: 28, fta: 34 }));
    const lo = buildBreakdown(result({ ...EVEN, fgm: 28, fga: 70, tpm: 4, tpa: 16, ftm: 8, fta: 10 }, { ...EVEN, fgm: 27, fga: 72, tpm: 5, tpa: 18, ftm: 9, fta: 12 }));
    expect(hi.available && lo.available).toBe(true); expect(hi.score.gold).toBeGreaterThan(140); expect(lo.score.gold).toBeLessThan(80);
  });
  it("overtime: periods beyond four are labelled OT and the flow says so", () => {
    const r = result(EVEN, { ...EVEN, ftm: 13 }, { overtimes: 1 });
    const f = buildBreakdown(r).gameFlow;
    expect(f.periods.map((p) => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT"]); expect(f.overtimes).toBe(1); expect(f.facts.at(-1)).toBe("Decided in overtime.");
    const f2 = buildFlow(quarters(130, 128, 6), { gold: 130, blue: 128 });
    expect(f2.periods.map((p) => p.label).slice(4)).toEqual(["OT", "OT2"]);
  });
  it("a period ledger that does not add up to the final score is not shown", () => {
    const r = result(EVEN, EVEN, { periods: [{ period: 1, gold: 30, blue: 20 }, { period: 2, gold: 30, blue: 20 }, { period: 3, gold: 30, blue: 20 }, { period: 4, gold: 1, blue: 1 }] });
    expect(buildBreakdown(r).gameFlow).toBeNull();
  });
  it("game flow facts: halftime leader, second-half split, quarters won — period-level only", () => {
    const f = buildFlow([{ period: 1, gold: 26, blue: 28 }, { period: 2, gold: 31, blue: 33 }, { period: 3, gold: 28, blue: 23 }, { period: 4, gold: 29, blue: 24 }], { gold: 114, blue: 108 });
    expect(f.facts).toEqual(["Blue led 61–57 at halftime.", "Gold outscored Blue 57–47 after halftime.", "Gold won 2 of 4 quarters; Blue won 2."]);
    expect(f.granularity).toBe("period");
  });
  it("a level quarter is counted as level", () => {
    const f = buildFlow([{ period: 1, gold: 25, blue: 25 }, { period: 2, gold: 30, blue: 20 }, { period: 3, gold: 20, blue: 30 }, { period: 4, gold: 30, blue: 20 }], { gold: 105, blue: 95 });
    expect(f.facts[2]).toBe("Gold won 2 of 4 quarters; Blue won 1; 1 was level.");
  });
});

describe("key performances (rule 1.0.0)", () => {
  const line = (o) => P(o.name || "X", o);
  it("both teams always appear, the leading scorer first", () => {
    const a = buildBreakdown(result(EVEN, EVEN));
    expect(a.playerPerformances.gold[0].label).toBe("LEADING SCORER"); expect(a.playerPerformances.blue[0].label).toBe("LEADING SCORER");
  });
  it("one huge line plus a teammate with a distinction", () => {
    const perf = selectPerformances([line({ name: "Big One", pts: 48, fgm: 20, fga: 30, oreb: 5, dreb: 10, ast: 3 }), line({ name: "Dimes", pts: 12, fgm: 5, fga: 12, ast: 11, dreb: 3 }), line({ name: "Quiet A", pts: 8 }), line({ name: "Quiet B", pts: 6 }), line({ name: "Quiet C", pts: 4 })]);
    expect(perf.map((p) => p.name)).toEqual(["Big One", "Dimes"]);
    expect(perf[0].stats).toBe("48 PTS · 15 REB"); expect(perf[0].also).toContain("DOUBLE-DOUBLE"); expect(perf[0].also).toContain("EFFICIENT SCORING");
    expect(perf[1].label).toBe("DOUBLE-DOUBLE");
  });
  it("balanced scoring with no distinctions shows only the leading scorer", () => {
    const perf = selectPerformances([10, 11, 12, 13, 14].map((pts, i) => line({ name: `P${i}`, pts, fgm: 5, fga: 12, dreb: 3, ast: 2 })));
    expect(perf).toHaveLength(1); expect(perf[0].name).toBe("P4");
  });
  it("a scoring tie breaks on rebounds + assists, then fewer turnovers, then box order", () => {
    const perf = selectPerformances([line({ name: "A", pts: 20, dreb: 4 }), line({ name: "B", pts: 20, dreb: 6 }), line({ name: "C", pts: 20, dreb: 6, to: 3 })]);
    expect(perf[0].name).toBe("B");
  });
  it("triple-double is labelled; zero-attempt shooting reads 0-0", () => {
    const perf = selectPerformances([line({ name: "Star", pts: 18, fgm: 7, fga: 14, dreb: 12, ast: 12 }), line({ name: "Tri", pts: 12, dreb: 11, ast: 10, fgm: 5, fga: 10 }), line({ name: "Zero", pts: 2, ftm: 2, fta: 2 })]);
    expect(perf[1].label).toBe("TRIPLE-DOUBLE");
    expect(selectPerformances([line({ name: "Zero", pts: 2, ftm: 2, fta: 2 })])[0].shooting).toBe("0-0 FG");
  });
  it("long and Unicode names survive, capped and stripped of markup", () => {
    const a = buildBreakdown(result(EVEN, EVEN, { goldNames: ["Nikola Jokić", "Giannis Antetokounmpo-Longername Extra", "<script>x</script>", "Dražen Petrović", "Šarūnas Marčiulionis"] }));
    const names = JSON.stringify(a.playerPerformances);
    expect(names).not.toMatch(/[<>]/);
    for (const p of [...a.playerPerformances.gold, ...a.playerPerformances.blue]) expect(p.name.length).toBeLessThanOrEqual(40);
    const withUnicode = selectPerformances([line({ name: "Nikola Jokić", pts: 30 })]);
    expect(withUnicode[0].name).toBe("Nikola Jokić");
  });
  it("a missing optional stat counts as zero, never undefined", () => {
    const perf = selectPerformances([{ name: "Sparse", pts: 21 }].map((p) => ({ ...P("Sparse"), ...p, ast: undefined })));
    expect(perf[0].box.ast).toBe(0); expect(JSON.stringify(perf)).not.toMatch(/undefined|NaN/);
  });
});

describe("integration, flag and preservation", () => {
  it("one flag, preview-on / production-off, surfaced through the mode registry and read by the App", () => {
    // released 2026-09-24 on the owner's approval: on by default, CLASH_BREAKDOWN_V1_ENABLED=false is the kill switch
    expect(read("api/_lib/flags.js")).toContain('clashBreakdown: bool("CLASH_BREAKDOWN_V1_ENABLED", true)');
    expect(read("api/v3meta.js")).toContain("clashBreakdown: !!flags().clashBreakdown");
    expect(read("src/App.jsx")).toContain('setBreakdownEnabled(m.modes?.clashBreakdown === true)');
  });
  it("adds no serverless function and no migration", () => {
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12); expect(existsSync("middleware.js")).toBe(true);
    expect(readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().at(-1)).toBe("0008_rivalries_v1.sql");
  });
  it("closed telemetry: allowlisted and mirrored, metadata carries no names, scores or ids", () => {
    for (const e of Object.values(C.BREAKDOWN_EVENTS)) { expect(has(EVENTS_ALLOWLIST, e)).toBe(true); expect(has(ACTIVATION_EVENTS, e)).toBe(true); }
    for (const k of ["name", "resultId", "score", "gold", "blue", "userId"]) expect(C.BREAKDOWN_EVENT_METADATA_ALLOWED).not.toContain(k);
  });
  it("no simulation, draft, challenge, rating, progression or rivalry path imports or mentions the breakdown", () => {
    const paths = ["src/chaos/runState.js", "src/chaos/challenge.js", "src/engine.js", "api/game.js", "api/_lib/game-core.js", "api/_lib/game-core-v3.js", "api/_lib/previewEngine.js", "api/_lib/chaosRun.js",
      "api/_lib/challenges.js", "src/challenges/contract.js", "api/_lib/competitive.js", "src/competitive/contract.js", "api/_lib/progression.js", "src/progression/contract.js", "api/_lib/rivalries.js", "src/rivalries/contract.js", "src/cards/contract.js", "api/_lib/cards.js"].filter(existsSync);
    for (const p of paths) expect(read(p)).not.toMatch(/breakdown/i);
  });
  it("the engine imports nothing but its contract: no fetch, no model call, no clock, no randomness", () => {
    const src = read("src/breakdown/engine.js");
    expect([...src.matchAll(/\bfrom "([^"]+)"/g)].map((m) => m[1])).toEqual(["./contract.js"]);
    expect(src).not.toMatch(/fetch\(|Math\.random|Date\.now|new Date|anthropic|openai/i);
  });
});

// ── History reopen (the owner-only full-row read) ───────────────────────────
import { createTestProvider } from "../src/accounts/testAdapter.js";
import { loadSavedReport, SAVED_CLASH_LIST_COLUMNS, SAVED_CLASH_LIST_SELECT } from "../src/accounts/savedReport.js";

describe("reopening a Breakdown from Clash History", () => {
  const seeded = () => {
    const ctx = createTestProvider({ users: [{ userId: "u-a", email: "a@example.invalid" }, { userId: "u-b", email: "b@example.invalid" }] });
    const rec = { ...result({ ...EVEN, to: 6 }, EVEN), id: "pv_aaaa1111bb", session: "s".repeat(48), finalScore: { gold: 0, blue: 0 } };
    rec.finalScore = rec.core.finalScore;
    ctx.server.putResult(rec);
    expect(ctx.server.claimAndSave({ resultId: rec.id, token: "test-token.u-a", deviceSession: "s".repeat(48) }).status).toBe("saved");
    return { ctx, rec };
  };
  it("the History list carries the real provider's projection: no snapshot, no user id", async () => {
    const { ctx } = seeded(); ctx.signInAs("u-a");
    const [row] = await ctx.provider.listSavedClashes();
    expect(row.result_snapshot).toBeUndefined(); expect(row.user_id).toBeUndefined();
    expect(Object.keys(row).every((k) => SAVED_CLASH_LIST_COLUMNS.includes(k))).toBe(true);
    expect(read("src/accounts/provider.js")).toContain(".select(SAVED_CLASH_LIST_SELECT)");
    expect(SAVED_CLASH_LIST_SELECT).not.toMatch(/snapshot|user_id/);
  });
  it("account A reopens its own saved Clash and the Breakdown resolves from the snapshot", async () => {
    const { ctx, rec } = seeded(); ctx.signInAs("u-a");
    const [row] = await ctx.provider.listSavedClashes();
    const out = await loadSavedReport(row, (id) => ctx.provider.getSavedClash(id));
    expect(out.state).toBe("ready");
    const b = buildBreakdown(out.clash.result_snapshot);
    expect(b.available).toBe(true); expect(b.keyDifferences.map((d) => d.id)).toEqual(["turnovers"]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(buildBreakdown(rec)));   // the saved snapshot and the live record give the same breakdown
    expect(JSON.stringify(out.clash.result_snapshot)).not.toContain("s".repeat(48));   // no device session in the snapshot
  });
  it("account B asking for A's saved Clash gets the generic unavailable state — nothing about why", async () => {
    const { ctx } = seeded(); ctx.signInAs("u-a");
    const [row] = await ctx.provider.listSavedClashes();
    ctx.signInAs("u-b");
    expect(await ctx.provider.listSavedClashes()).toEqual([]);
    const out = await loadSavedReport(row, (id) => ctx.provider.getSavedClash(id));
    expect(out.state).toBe("unavailable"); expect(out.clash.result_snapshot).toBeUndefined();
    const unknown = await loadSavedReport({ result_id: "pv_nosuch00000" }, (id) => ctx.provider.getSavedClash(id));
    expect(unknown.state).toBe("unavailable");
  });
  it("signed out, the read fails closed", async () => {
    const { ctx } = seeded(); ctx.signInAs("u-a");
    const [row] = await ctx.provider.listSavedClashes(); ctx.signOut();
    expect((await loadSavedReport(row, (id) => ctx.provider.getSavedClash(id))).state).toBe("unavailable");
  });
  it("the App opens History rows through loadSavedReport and the owner-only getSavedClash", () => {
    const app = read("src/App.jsx");
    expect(app).toContain("onOpenReport={openSavedReport}");
    expect(app).toMatch(/loadSavedReport\(clash, \(id\) => withProvider\(\(p\) => p\.getSavedClash\(id\), null\)\)/);
    expect(app).toContain('This saved report could not be opened.');
  });
  it("adds no route: there is no /breakdown path and no new server action", () => {
    expect(read("vercel.json")).not.toMatch(/breakdown/i); expect(read("middleware.js")).not.toMatch(/breakdown/i); expect(read("api/profile.js")).not.toMatch(/breakdown/i);
  });
});
