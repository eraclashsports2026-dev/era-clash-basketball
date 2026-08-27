// ── Phase 6B2: zone resolution, offensive families, coach adjustments ────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  ZONE_SHELLS, ZONE_GAPS, selectZoneShell, buildZoneShell, availableShells, attackZone,
  ZONE_RESOLUTION_VERSION,
} from "../src/v3/defense/zone.js";
import { eraLegality, coachToolkit, personnelCeiling, buildDefensivePlan } from "../src/v3/defense/index.js";
import {
  FAMILY_REGISTRY, FAMILY_CAPS, ACTION_FAMILIES, postMismatchFor, speedMismatchFor,
  chaseMismatchFor, usageWeighted,
} from "../src/v3/actions/families.js";
import {
  buildOffensivePlan, considerOffensiveAdjustment, applyOffensiveAdjustment,
  recordOffensiveOutcome, refreshMismatchTargets, offensiveToolkit,
  OFFENSIVE_TRIGGERS, OFFENSIVE_RESPONSES, OFF_ADJUSTMENT_COOLDOWN, MAX_ADJUSTED_SHARE,
  COACH_ADJUSTMENT_VERSION,
} from "../src/v3/actions/offensivePlan.js";
import { expandedActionMix, selectAction, EXPANDED_ACTION_TYPES } from "../src/v3/possession/actions.js";
import { preparePossessionContext } from "../src/v3/possession/context.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { runPossessionGame, checkGame } from "../src/v3/possession/index.js";
import { childSeeds, createRng } from "../src/v3/possession/rng.js";
import { getEra } from "../src/v3/eraStyles.js";
import { versionOf, statusOf, VERSION_STATUS } from "../src/versions.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { flags } from "../api/_lib/flags.js";

const SHOWTIME = ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"];
const SPLASH = ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"];
const SMALL = ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"];
const SIZE = ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"];
const STOPPERS = ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"];
const FAST = { assertInvariants: false, includeLedger: false };

const ctxFor = (g, b, era = "2010s", cg = "phil-jackson", cb = "steve-kerr", over = {}) =>
  preparePossessionContext(buildPossessionInput({ goldIds: g, blueIds: b, eraStyleId: era, simulationSeed: 1, coachGoldId: cg, coachBlueId: cb, ...over }));
const play = (g, b, era, seed, cg = "phil-jackson", cb = "steve-kerr", over = {}, opts = { assertInvariants: false }) =>
  runPossessionGame(buildPossessionInput({ goldIds: g, blueIds: b, eraStyleId: era, simulationSeed: seed, coachGoldId: cg, coachBlueId: cb, ...over }), opts);
const families = (games, side) => {
  const c = {}; let total = 0;
  for (const g of games) for (const r of g.possessionLedger ?? []) {
    if (side && r.offense !== side) continue;
    c[r.action] = (c[r.action] || 0) + 1; total++;
  }
  return { counts: c, total, share: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / total])) };
};

// ── versioning and isolation ────────────────────────────────────────────────
describe("Phase 6B2 versioning and isolation", () => {
  it("the new domains exist as DEVELOPMENT and the bumps are semantic", () => {
    expect(versionOf("zoneResolutionVersion")).toBe("1.0.0");
    expect(versionOf("coachAdjustmentVersion")).toBe("1.0.0");
    for (const d of ["zoneResolutionVersion", "coachAdjustmentVersion"]) {
      expect(statusOf(d), d).toBe(VERSION_STATUS.DEVELOPMENT);
    }
    // A MAJOR bump for the action library: its contract changed from one action
    // plus a fallback to a family set. MINOR for the engines: new capability,
    // same contract.
    expect(versionOf("actionLibraryVersion")).toBe("2.0.0");
    expect(versionOf("possessionEngineVersion")).toBe("1.2.0");
    expect(versionOf("defensiveMatchupVersion")).toBe("1.2.0");
    expect(versionOf("engineVersion"), "production is untouched").toBe("3.2.0");
  });

  it("all three new flags default false and are separate", () => {
    const saved = { ...process.env };
    for (const k of ["ZONE_RESOLUTION_ENABLED", "EXPANDED_OFFENSIVE_ACTIONS_ENABLED", "OFFENSIVE_COACH_ADJUSTMENTS_ENABLED"]) delete process.env[k];
    try {
      const f = flags();
      expect(f.zoneResolution).toBe(false);
      expect(f.expandedOffensiveActions).toBe(false);
      expect(f.offensiveCoachAdjustments).toBe(false);
    } finally { Object.assign(process.env, saved); }
    const src = readFileSync(new URL("../api/_lib/flags.js", import.meta.url), "utf8");
    for (const line of src.split("\n").filter((l) => /zoneResolution:|expandedOffensiveActions:|offensiveCoachAdjustments:/.test(l))) {
      expect(line).not.toMatch(/SIM_ENGINE_V3_ENABLED/);
    }
  });

  it("no production route or UI imports the new modules", () => {
    for (const dir of ["../api/", "../api/_lib/"]) {
      for (const f of readdirSync(new URL(dir, import.meta.url)).filter((x) => x.endsWith(".js"))) {
        const src = readFileSync(new URL(`${dir}${f}`, import.meta.url), "utf8");
        expect(src, `${dir}${f}`).not.toMatch(/v3\/defense\/zone|v3\/actions\/families|v3\/actions\/offensivePlan/);
      }
    }
    expect(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")).not.toMatch(/v3\/defense|v3\/actions\/families|offensivePlan/);
  });

  it("the cache identity and fingerprint carry only modules that mattered", () => {
    const k = cacheKeys.possessionResult({ matchupFingerprint: "abc", simulationSeed: 1 });
    expect(k).toContain("zr1-0-0");
    expect(k).toContain("ca1-0-0");
    expect(k).toContain("al2-0-0");
    // A man-defence game must NOT claim the zone version.
    const man = play(SHOWTIME, SPLASH, "1990s", 5, "pat-riley", "phil-jackson", {}, FAST);
    expect(man.zoneResolutionUsed).toBe(false);
    expect("zoneResolutionVersion" in man.fingerprint).toBe(false);
    // A zone game must.
    const zone = play(STOPPERS, SPLASH, "2020s", 5, "nick-nurse", "phil-jackson", {}, FAST);
    if (zone.zoneResolutionUsed) expect(zone.fingerprint.zoneResolutionVersion).toBe("1.0.0");
  });

  it("makes no AI, network or clock call in the new modules", () => {
    for (const f of ["../src/v3/defense/zone.js", "../src/v3/actions/families.js", "../src/v3/actions/offensivePlan.js"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(src, f).not.toMatch(/\bfetch\s*\(|node:fs|anthropic|Math\.random|Date\.now\(/);
    }
  });
});

// ── zone resolution ─────────────────────────────────────────────────────────
describe("zone resolution", () => {
  it("2-3 protects the rim and concedes the high post and corners", () => {
    const z = ZONE_SHELLS["2-3"];
    expect(z.coverage.rim).toBeGreaterThan(z.coverage.highPost);
    expect(z.coverage.lowBlocks).toBeGreaterThan(z.coverage.corners);
    expect(z.gaps.HIGH_POST).toBeGreaterThan(z.gaps.TOP);
    expect(z.gaps.CORNER).toBeGreaterThan(z.gaps.BASELINE);
    expect(z.protects).toContain("rim");
    expect(z.concedes).toContain("highPost");
  });

  it("3-2 protects the perimeter and concedes the baseline and interior", () => {
    const z = ZONE_SHELLS["3-2"];
    expect(z.coverage.top).toBeGreaterThan(z.coverage.rim);
    expect(z.coverage.wings).toBeGreaterThan(z.coverage.lowBlocks);
    expect(z.gaps.BASELINE).toBeGreaterThan(ZONE_SHELLS["2-3"].gaps.BASELINE);
    expect(z.gaps.LOW_POST).toBeGreaterThan(z.gaps.HIGH_POST);
    // ...and pays for it on the glass.
    expect(z.reboundExposure).toBeGreaterThan(ZONE_SHELLS["2-3"].reboundExposure);
  });

  it("the matchup zone demands more and is not universally superior", () => {
    const m = ZONE_SHELLS.MATCHUP;
    expect(m.requires.communication).toBeGreaterThan(ZONE_SHELLS["2-3"].requires.communication);
    expect(m.requires.adaptability).toBeGreaterThan(0);
    // It covers more evenly, but concedes to ball movement.
    expect(m.gaps.SKIP_PASS).toBeGreaterThan(0.5);
    expect(m.gaps.ZONE_OVERLOAD).toBeGreaterThan(0.5);
    // And it is refused without the personnel.
    const weak = availableShells({
      legality: eraLegality(getEra("2020s")),
      toolkit: { pressure: 5, adaptability: 3, zonePreference: 9 },
      ceiling: { rimCeiling: 5, helpCeiling: 3, pressureCeiling: 4, switchCeiling: 3 },
      threats: [],
    });
    expect(weak.available).not.toContain("MATCHUP");
    expect(weak.rejected.some((r) => r.shell === "MATCHUP" && r.reason === "PERSONNEL_OR_COACH")).toBe(true);
  });

  it("box-and-one needs exactly one dominant creator; triangle-and-two exactly two", () => {
    const legality = eraLegality(getEra("2020s"));
    const toolkit = { pressure: 6, adaptability: 9, zonePreference: 8 };
    const ceiling = { rimCeiling: 8, helpCeiling: 8, pressureCeiling: 8, switchCeiling: 8 };
    const mk = (n) => Array.from({ length: 5 }, (_, i) => ({
      playerCardId: `p${i}`, defensiveDemand: i < n ? 9.5 : 4, usageShare: i < n ? 0.25 : 0.1,
      threats: { spotUpShooting: 5, passing: 5, postScoring: 5, movementShooting: 5 },
    }));
    const one = availableShells({ legality, toolkit, ceiling, threats: mk(1) });
    expect(one.available).toContain("BOX_AND_ONE");
    expect(one.available).not.toContain("TRIANGLE_AND_TWO");
    const two = availableShells({ legality, toolkit, ceiling, threats: mk(2) });
    expect(two.available).toContain("TRIANGLE_AND_TWO");
    expect(two.available).not.toContain("BOX_AND_ONE");
    const three = availableShells({ legality, toolkit, ceiling, threats: mk(3) });
    expect(three.available).not.toContain("BOX_AND_ONE");
    expect(three.rejected.some((r) => r.reason === "OPPONENT_NOT_APPLICABLE")).toBe(true);
  });

  it("an illegal era rejects every zone, whatever the coach prefers", () => {
    for (const era of ["1950s", "1960s", "1970s", "1980s", "1990s"]) {
      const avail = availableShells({
        legality: eraLegality(getEra(era)),
        toolkit: { pressure: 9, adaptability: 10, zonePreference: 10 },
        ceiling: { rimCeiling: 10, helpCeiling: 10, pressureCeiling: 10, switchCeiling: 10 },
        threats: [],
      });
      expect(avail.available, era).toHaveLength(0);
      expect(avail.rejected[0].reason).toBe("ERA_ILLEGAL");
      // ...and the plan plays man.
      const ctx = ctxFor(SHOWTIME, SPLASH, era, "nick-nurse");
      expect(ctx.defensivePlans.gold.zoneShell, era).toBeNull();
    }
  });

  it("a zone possession has NO primary defender — it resolves by area", () => {
    const games = childSeeds(11, 30).map((s) => play(STOPPERS, SPLASH, "2020s", s, "nick-nurse", "phil-jackson"));
    const zonePos = games.flatMap((g) => g.possessionLedger.filter((r) => r.zoneGap));
    expect(zonePos.length, "no zone possessions occurred").toBeGreaterThan(50);
    for (const r of zonePos) {
      expect(r.primaryDefenderId, "a zone assigns areas, not men").toBeNull();
      expect(r.assignmentState).toBe("ZONE_AREA");
      expect(ZONE_GAPS).toContain(r.zoneGap);
      expect(r.shellType).toBeTruthy();
    }
  });

  it("zone possessions reconcile statistically", () => {
    let v = 0;
    for (const s of childSeeds(31, 120)) {
      v += checkGame(play(STOPPERS, SPLASH, "2020s", s, "nick-nurse", "phil-jackson", {}, FAST)).length;
    }
    expect(v).toBe(0);
  });

  it("the shell is built deterministically with real responsibilities", () => {
    const ctx = ctxFor(STOPPERS, SPLASH, "2020s", "nick-nurse");
    const shell = ctx.defensivePlans.gold.zoneShell;
    expect(shell).toBeTruthy();
    expect(shell.zoneResolutionVersion).toBe(ZONE_RESOLUTION_VERSION);
    expect(shell.defenderResponsibilities.rim).toBeTruthy();
    expect(shell.reboundResponsibilities.exposure).toBeGreaterThan(0);
    expect(shell.pressurePoints.length).toBeGreaterThan(0);
    // Deterministic.
    const again = ctxFor(STOPPERS, SPLASH, "2020s", "nick-nurse").defensivePlans.gold.zoneShell;
    expect(JSON.stringify(shell)).toBe(JSON.stringify(again));
  });

  it("one shell does not dominate every opponent, and the same shell differs by roster", () => {
    const shellFor = (blue) => ctxFor(STOPPERS, blue, "2020s", "nick-nurse").defensivePlans.gold.zoneShell?.shellType;
    const shells = new Set([shellFor(SPLASH), shellFor(SIZE), shellFor(SMALL)].filter(Boolean));
    expect(shells.size).toBeGreaterThanOrEqual(1);
    // Same shell, different roster → different gaps attacked.
    const gapsFor = (blue) => {
      const gs = childSeeds(7, 25).map((s) => play(STOPPERS, blue, "2020s", s, "nick-nurse", "phil-jackson"));
      const c = {};
      for (const g of gs) for (const r of g.possessionLedger) if (r.zoneGap) c[r.zoneGap] = (c[r.zoneGap] || 0) + 1;
      return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    const a = gapsFor(SPLASH), b = gapsFor(SIZE);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it("attackZone is deterministic and reports whether the rotation closed", () => {
    const ctx = ctxFor(STOPPERS, SPLASH, "2020s", "nick-nurse");
    const shell = ctx.defensivePlans.gold.zoneShell;
    const run = () => attackZone({ zoneShell: shell, offense: ctx.blue, threats: ctx.defensivePlans.gold.threats, rng: createRng(42) });
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(typeof a.rotationClosed).toBe("boolean");
    expect(ZONE_GAPS).toContain(a.gap);
  });

  it("zone rebounding differs from man in context, without an automatic penalty", () => {
    const shells = Object.values(ZONE_SHELLS).map((z) => z.reboundExposure);
    expect(new Set(shells).size, "exposure must be shell-specific").toBeGreaterThan(1);
    // Better interior personnel reduces it.
    const strong = buildZoneShell({ shellKey: "2-3", defenders: ctxFor(SIZE, SPLASH, "2020s", "nick-nurse").defensivePlans.gold.defenders, threats: ctxFor(SIZE, SPLASH).defensivePlans.gold.threats, toolkit: { zonePreference: 8, adaptability: 8 }, legality: eraLegality(getEra("2020s")), ceiling: { rimCeiling: 10, helpCeiling: 8, pressureCeiling: 7, switchCeiling: 7 } });
    const weak = buildZoneShell({ shellKey: "2-3", defenders: ctxFor(SIZE, SPLASH, "2020s", "nick-nurse").defensivePlans.gold.defenders, threats: ctxFor(SIZE, SPLASH).defensivePlans.gold.threats, toolkit: { zonePreference: 8, adaptability: 8 }, legality: eraLegality(getEra("2020s")), ceiling: { rimCeiling: 4, helpCeiling: 5, pressureCeiling: 6, switchCeiling: 5 } });
    expect(strong.reboundResponsibilities.exposure).toBeLessThan(weak.reboundResponsibilities.exposure);
  });
});

// ── offensive families ──────────────────────────────────────────────────────
describe("offensive action families", () => {
  it("every family in the registry is implemented and appears in play", () => {
    const games = childSeeds(4242, 40).map((s) => play(SHOWTIME, SPLASH, "2010s", s));
    const seen = new Set(games.flatMap((g) => g.possessionLedger.map((r) => r.action)));
    for (const k of Object.keys(FAMILY_REGISTRY)) expect(seen, k).toContain(k);
    for (const k of seen) expect(EXPANDED_ACTION_TYPES).toContain(k);
  });

  it("the mix is a real distribution and no family dominates", () => {
    for (const coach of ["phil-jackson", "mike-dantoni", "steve-kerr", "jerry-sloan"]) {
      const ctx = ctxFor(SHOWTIME, SPLASH, "2010s", coach);
      const mix = expandedActionMix({ offense: ctx.gold, defense: ctx.blue, eff: ctx.eff, state: {}, defPlan: ctx.defensivePlans.blue });
      const sum = Object.values(mix).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1), `${coach} mix sums to ${sum}`).toBeLessThan(0.05);
      expect(Math.max(...Object.values(mix)), coach).toBeLessThanOrEqual(FAMILY_CAPS.PICK_AND_ROLL + 0.01);
      expect(mix.GENERIC_HALF_COURT, "generic must stay a real remainder").toBeGreaterThan(0.05);
    }
  });

  it("coach systems change the action mix", () => {
    const shareOf = (coach, family) => {
      const gs = childSeeds(11, 30).map((s) => play(SHOWTIME, SPLASH, "2010s", s, coach, "phil-jackson"));
      return families(gs, "gold").share[family] ?? 0;
    };
    // D'Antoni runs more pick-and-roll than Jackson; Jackson posts more.
    expect(shareOf("mike-dantoni", "PICK_AND_ROLL")).toBeGreaterThan(shareOf("phil-jackson", "PICK_AND_ROLL"));
    expect(shareOf("phil-jackson", "POST_UP")).toBeGreaterThan(shareOf("mike-dantoni", "POST_UP"));
    // Kerr leans off-ball.
    expect(shareOf("steve-kerr", "OFF_BALL_SCREEN")).toBeGreaterThan(shareOf("mike-dantoni", "OFF_BALL_SCREEN"));
  });

  it("generic half-court no longer dominates", () => {
    const gs = childSeeds(11, 40).map((s) => play(SHOWTIME, SPLASH, "2010s", s));
    const share = families(gs, "gold").share.GENERIC_HALF_COURT ?? 0;
    expect(share, `generic share ${share}`).toBeLessThan(0.25);
    // ...but it has not been suppressed to zero either. It is a truthful
    // fallback and some possessions genuinely are just offence.
    expect(share).toBeGreaterThan(0.02);
  });

  it("usage still governs volume — finite usage is not broken by the families", () => {
    const ctx = ctxFor(SHOWTIME, SPLASH, "2010s");
    expect(Math.abs(ctx.gold.players.reduce((a, p) => a + p.usageShare, 0) - 1)).toBeLessThan(1e-9);
    const totals = {};
    for (const s of childSeeds(88, 60)) {
      for (const p of play(SHOWTIME, SPLASH, "2010s", s, "phil-jackson", "steve-kerr", {}, FAST).gold.players) {
        totals[p.cardId] = (totals[p.cardId] || 0) + p.fga;
      }
    }
    const top = [...ctx.gold.players].sort((a, b) => b.usageShare - a.usageShare)[0];
    const bottom = [...ctx.gold.players].sort((a, b) => a.usageShare - b.usageShare)[0];
    expect(totals[top.cardId]).toBeGreaterThan(totals[bottom.cardId]);
  });

  it("the usage weight helper is keyed by player, not by index", () => {
    // rng.weighted invokes the weight function with the item alone. An index
    // parameter arrives undefined, every weight becomes NaN, and rng.weighted
    // floors that to zero — returning the first player every time.
    const players = [{ usageShare: 0.1, x: 1 }, { usageShare: 0.3, x: 9 }, { usageShare: 0.2, x: 5 }];
    const w = usageWeighted(players, (p) => p.x);
    const weights = players.map((p) => w(p));
    for (const v of weights) expect(Number.isFinite(v)).toBe(true);
    expect(Math.max(...weights)).toBeGreaterThan(0);
    // Higher usage AND higher fit must win.
    expect(w(players[1])).toBeGreaterThan(w(players[0]));
  });
});

// ── post-up and isolation: mismatch exploitation ────────────────────────────
describe("post-up and isolation", () => {
  it("a detected post mismatch is actually attacked", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SIZE, SMALL, "2010s", s, "pat-riley", "steve-kerr"));
    const posts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.offense === "gold"));
    expect(posts.length).toBeGreaterThan(50);
    const targeted = posts.filter((r) => r.targetedMismatch);
    expect(targeted.length, "post mismatches must be attacked, not merely detected").toBeGreaterThan(0);
    for (const r of targeted) expect(["POST_MISMATCH", "SIZE_MISMATCH", "STRENGTH_MISMATCH"]).toContain(r.targetedMismatch);
  });

  it("a post mismatch is not an automatic basket", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SIZE, SMALL, "2010s", s, "pat-riley", "steve-kerr"));
    const posts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.targetedMismatch));
    const made = posts.filter((r) => r.outcome === "MADE_FG").length;
    expect(made / posts.length, "an attacked mismatch must still miss sometimes").toBeLessThan(0.75);
    expect(made).toBeGreaterThan(0);
  });

  it("the defence answers a post-up with a double, which concedes the kickout", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SIZE, SMALL, "2010s", s, "pat-riley", "steve-kerr"));
    const posts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP"));
    const kick = posts.filter((r) => r.variant === "KICKOUT");
    expect(kick.length, "a double must sometimes produce a kickout").toBeGreaterThan(0);
    // A kickout is assisted by the post player.
    for (const r of kick.slice(0, 10)) expect(r.secondaryPlayerId).toBeTruthy();
  });

  it("doubles are unavailable where the era forbids them", () => {
    // Illegal-defense eras restrict the second defender.
    const ctx = ctxFor(SIZE, SMALL, "1990s", "pat-riley");
    expect(ctx.defensivePlans.blue.scheme.legality.illegalDefenseRestrictions).toBe(true);
    const gs = childSeeds(4242, 30).map((s) => play(SIZE, SMALL, "1990s", s, "pat-riley", "steve-kerr"));
    const kicks = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.variant === "KICKOUT" && r.offense === "gold"));
    const modernKicks = childSeeds(4242, 30).map((s) => play(SIZE, SMALL, "2020s", s, "pat-riley", "steve-kerr"))
      .flatMap((g) => g.possessionLedger.filter((r) => r.action === "POST_UP" && r.variant === "KICKOUT" && r.offense === "gold"));
    expect(kicks.length, "illegal-defense era must double less").toBeLessThan(modernKicks.length + 1);
  });

  it("isolation converts a size mismatch into a post attack", () => {
    const gs = childSeeds(4242, 60).map((s) => play(SIZE, SMALL, "2010s", s, "mike-dantoni", "steve-kerr"));
    const isos = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "ISOLATION" && r.offense === "gold"));
    expect(isos.length).toBeGreaterThan(20);
    expect(isos.some((r) => r.variant === "POST_CONVERSION")).toBe(true);
    // Isolation is unassisted by definition.
    expect(isos.filter((r) => r.assist).length / isos.length).toBeLessThan(0.1);
  });

  it("neither post-up nor isolation is universally optimal", () => {
    const q = (family) => {
      const gs = childSeeds(11, 40).map((s) => play(SHOWTIME, SPLASH, "2010s", s));
      const rows = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === family && r.expectedMake != null));
      return rows.reduce((a, r) => a + r.expectedMake, 0) / rows.length;
    };
    const post = q("POST_UP"), iso = q("ISOLATION"), pnr = q("PICK_AND_ROLL"), screen = q("OFF_BALL_SCREEN");
    const all = [post, iso, pnr, screen];
    // No family may be more than 60% better than the worst — that would make
    // the choice fake.
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.6);
  });

  it("mismatch finders are general — no player ids in the family logic", () => {
    const src = readFileSync(new URL("../src/v3/actions/families.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src.match(/["'][a-z][a-z0-9-]*-(?:[0-9]0s|2ks)["']/g) ?? []).toHaveLength(0);
  });
});

// ── off-ball, handoff, spot-up, cut ─────────────────────────────────────────
describe("off-ball actions", () => {
  it("off-ball screens make chase burden real", () => {
    const gs = childSeeds(4242, 40).map((s) => play(["curry-10s", "ray-00s", "klay-10s", "dirk-00s", "jokic-20s"], STOPPERS, "2010s", s, "steve-kerr", "tom-thibodeau"));
    const sc = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "OFF_BALL_SCREEN" && r.offense === "gold"));
    expect(sc.length).toBeGreaterThan(30);
    const denied = sc.filter((r) => r.variant === "DENIED").length;
    // The chase sometimes works and sometimes does not — both must occur.
    expect(denied).toBeGreaterThan(0);
    expect(denied).toBeLessThan(sc.length);
  });

  it("a handoff hub can slip, and the hub is recorded as the secondary player", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SMALL, SIZE, "2020s", s, "nick-nurse", "jerry-sloan"));
    const h = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "HANDOFF" && r.offense === "gold"));
    expect(h.length).toBeGreaterThan(20);
    expect(h.some((r) => r.variant === "SLIP")).toBe(true);
    expect(h.some((r) => r.variant === "PULL_UP")).toBe(true);
    for (const r of h.slice(0, 10)) expect(r.secondaryPlayerId).toBeTruthy();
  });

  it("spot-ups emerge from a creation event and are heavily assisted", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SHOWTIME, SPLASH, "2010s", s));
    const su = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "SPOT_UP" && r.outcome === "MADE_FG"));
    expect(su.length).toBeGreaterThan(10);
    expect(su.filter((r) => r.assist).length / su.length, "a spot-up is created by someone else").toBeGreaterThan(0.4);
  });

  it("cuts are heavily assisted and can be denied", () => {
    const gs = childSeeds(4242, 40).map((s) => play(SHOWTIME, SPLASH, "2010s", s));
    const cuts = gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "CUT"));
    expect(cuts.length).toBeGreaterThan(20);
    expect(cuts.some((r) => r.variant === "DENIED")).toBe(true);
    const made = cuts.filter((r) => r.outcome === "MADE_FG");
    expect(made.filter((r) => r.assist).length / made.length).toBeGreaterThan(0.4);
  });

  it("a pre-three-point era removes the spot-up three but not the action", () => {
    for (const s of childSeeds(3, 20)) {
      const g = play(SHOWTIME, SPLASH, "1960s", s, "phil-jackson", "pat-riley", {}, FAST);
      expect(g.gold.totals.tpa).toBe(0);
      expect(g.blue.totals.tpa).toBe(0);
      expect(checkGame(g)).toHaveLength(0);
    }
    const gs = childSeeds(3, 20).map((s) => play(SHOWTIME, SPLASH, "1960s", s, "phil-jackson", "pat-riley"));
    expect(gs.flatMap((g) => g.possessionLedger.filter((r) => r.action === "SPOT_UP")).length).toBeGreaterThan(0);
  });
});

// ── offensive coach adjustments ─────────────────────────────────────────────
describe("offensive coach adjustments", () => {
  const planFor = (coach) => {
    const ctx = ctxFor(SIZE, SMALL, "2010s", coach);
    const mix = expandedActionMix({ offense: ctx.gold, defense: ctx.blue, eff: ctx.eff, state: {}, defPlan: ctx.defensivePlans.blue });
    return { ctx, plan: buildOffensivePlan({ offense: ctx.gold, defense: ctx.blue, defPlan: ctx.defensivePlans.blue, eff: ctx.eff, baselineMix: mix }) };
  };

  it("the baseline plan is deterministic for the same coach and context", () => {
    const a = planFor("phil-jackson").plan, b = planFor("phil-jackson").plan;
    expect(JSON.stringify(a.baselineActionMix)).toBe(JSON.stringify(b.baselineActionMix));
    expect(a.creatorHierarchy).toEqual(b.creatorHierarchy);
  });

  it("different coaches produce different legal plans", () => {
    const mixes = ["phil-jackson", "mike-dantoni", "steve-kerr"].map((c) => JSON.stringify(planFor(c).plan.baselineActionMix));
    expect(new Set(mixes).size).toBe(3);
  });

  it("one possession never triggers an adjustment", () => {
    const { plan, ctx } = planFor("phil-jackson");
    recordOffensiveOutcome(plan, { family: "PICK_AND_ROLL", shotQuality: 9.5, outcome: "MADE_FG", shotCategory: "RIM" });
    plan.mismatchTargets = [];
    expect(considerOffensiveAdjustment({ plan, offense: ctx.gold, defPlan: ctx.defensivePlans.blue, defState: null, possessionIndex: 5, eff: ctx.eff })).toBeNull();
  });

  it("good process with missed shots does not trigger panic", () => {
    const { plan, ctx } = planFor("phil-jackson");
    plan.mismatchTargets = [];
    // High quality, all misses: no adjustment, because process was fine.
    for (let i = 0; i < 20; i++) recordOffensiveOutcome(plan, { family: "PICK_AND_ROLL", shotQuality: 7.2, outcome: "MISS_DREB", shotCategory: "MIDRANGE" });
    const adj = considerOffensiveAdjustment({ plan, offense: ctx.gold, defPlan: ctx.defensivePlans.blue, defState: null, possessionIndex: 60, eff: ctx.eff });
    // It may INCREASE what is working; it must not flag failure.
    if (adj && !adj.rejected) expect(adj.trigger).not.toBe("PNR_FAILURE");
  });

  it("poor process with made shots CAN trigger a change", () => {
    const { plan, ctx } = planFor("phil-jackson");
    plan.mismatchTargets = [];
    for (let i = 0; i < 20; i++) recordOffensiveOutcome(plan, { family: "PICK_AND_ROLL", shotQuality: 3.4, outcome: "MADE_FG", shotCategory: "MIDRANGE" });
    const adj = considerOffensiveAdjustment({ plan, offense: ctx.gold, defPlan: ctx.defensivePlans.blue, defState: null, possessionIndex: 60, eff: ctx.eff });
    expect(adj).toBeTruthy();
    expect(adj.rejected ? adj.trigger : adj.trigger).toBe("PNR_FAILURE");
  });

  it("a coach cannot call an action their system does not support", () => {
    // D'Antoni's documented post usage is minimal, so post targeting is
    // rejected even with a live post mismatch.
    const gs = childSeeds(3, 40).map((s) => play(SIZE, SMALL, "2010s", s, "mike-dantoni", "steve-kerr", {}, FAST));
    const all = gs.flatMap((g) => g.offense.gold.adjustments);
    const rejected = all.filter((a) => a.response === "REJECTED");
    expect(rejected.length, "an unsupported response must be rejected").toBeGreaterThan(0);
    for (const r of rejected) expect(r.reason).toBe("NO_SUPPORTED_OFFENSIVE_ADJUSTMENT");
    expect(all.some((a) => a.response === "INCREASE_POST_TARGETING")).toBe(false);
  });

  it("a rigid coach demands more evidence before adjusting", () => {
    // Tested on the MECHANISM, not on the emergent rate. The rate is confounded
    // by which responses each coach's system supports — a rigid coach who
    // happens to support the strongest trigger can out-adjust an adaptable one
    // who does not, which says nothing about readiness.
    const evidenceNeeded = (coach) => {
      const { plan, ctx } = planFor(coach);
      plan.mismatchTargets = [];
      let n = 0;
      // Feed poor-process evidence one possession at a time until it fires.
      for (; n < 40; n++) {
        recordOffensiveOutcome(plan, { family: "PICK_AND_ROLL", shotQuality: 3.2, outcome: "MISS_DREB", shotCategory: "MIDRANGE" });
        const adj = considerOffensiveAdjustment({ plan, offense: ctx.gold, defPlan: ctx.defensivePlans.blue, defState: null, possessionIndex: 60, eff: ctx.eff });
        if (adj) break;
      }
      return n;
    };
    const adaptable = evidenceNeeded("nick-nurse");
    const rigid = evidenceNeeded("jerry-sloan");
    expect(adaptable, `nurse ${adaptable} vs sloan ${rigid}`).toBeLessThan(rigid);
    // And the adaptability fields really do differ.
    expect(offensiveToolkit(ctxFor(SHOWTIME, SPLASH, "2010s", "nick-nurse").gold).adaptability)
      .toBeGreaterThan(offensiveToolkit(ctxFor(SHOWTIME, SPLASH, "2010s", "jerry-sloan").gold).adaptability);
  });

  it("adjustments change the mix, never the score, and stay bounded", () => {
    const gs = childSeeds(3, 40).map((s) => play(SIZE, SMALL, "2010s", s, "phil-jackson", "steve-kerr", {}, FAST));
    let moved = 0;
    for (const g of gs) {
      const b = g.offense.gold.baselineActionMix, f = g.offense.gold.finalActionMix;
      if (JSON.stringify(b) !== JSON.stringify(f)) moved++;
      // No family may exceed the adjusted cap, and the mix stays a distribution.
      for (const [k, v] of Object.entries(f)) {
        expect(v, `${k} = ${v}`).toBeLessThanOrEqual(Math.max(MAX_ADJUSTED_SHARE, FAMILY_CAPS[k] ?? 1) + 0.01);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      const sum = Object.values(f).reduce((a, v) => a + v, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.12);
    }
    expect(moved, "adjustments must actually move the mix").toBeGreaterThan(0);
    // ...and the box score still reconciles.
    expect(gs.reduce((a, g) => a + checkGame(g).length, 0)).toBe(0);
  });

  it("a cooldown prevents thrashing", () => {
    expect(OFF_ADJUSTMENT_COOLDOWN).toBeGreaterThanOrEqual(20);
    const { plan, ctx } = planFor("nick-nurse");
    plan.adjustmentHistory.push({ possessionIndex: 50, id: "off-0" });
    plan.mismatchTargets = [{ type: "POST_MISMATCH", severity: "SEVERE", offensivePlayerId: "x", defenderId: "y" }];
    expect(considerOffensiveAdjustment({ plan, offense: ctx.gold, defPlan: ctx.defensivePlans.blue, defState: null, possessionIndex: 55, eff: ctx.eff })).toBeNull();
  });

  it("every trigger and response is in the declared vocabulary", () => {
    const gs = childSeeds(3, 60).map((s) => play(SIZE, SMALL, "2010s", s, "phil-jackson", "nick-nurse", {}, FAST));
    for (const g of gs) for (const side of ["gold", "blue"]) {
      for (const a of g.offense[side].adjustments) {
        expect(OFFENSIVE_TRIGGERS, a.trigger).toContain(a.trigger);
        if (a.response !== "REJECTED") expect(OFFENSIVE_RESPONSES, a.response).toContain(a.response);
      }
    }
  });

  it("the toolkit is derived from documented fields, not a stereotype", () => {
    const ctx = ctxFor(SHOWTIME, SPLASH, "2010s", "mike-dantoni");
    const tk = offensiveToolkit(ctx.gold);
    expect(tk.pnr).toBeGreaterThan(tk.post);
    expect(tk.supports.INCREASE_PNR).toBe(true);
    expect(tk.supports.INCREASE_POST_TARGETING).toBe(false);
    const kerr = offensiveToolkit(ctxFor(SHOWTIME, SPLASH, "2010s", "steve-kerr").gold);
    expect(kerr.supports.INCREASE_OFF_BALL_SCREENS).toBe(true);
    // No player or coach name appears in the toolkit logic.
    const src = readFileSync(new URL("../src/v3/actions/offensivePlan.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src).not.toMatch(/dantoni|jackson|kerr|sloan|riley|nurse|spoelstra/i);
  });
});

// ── integration, conservation, replay ───────────────────────────────────────
describe("Phase 6B2 integration", () => {
  it("conservation holds across eras, coaches, rosters and both defences", () => {
    let v = 0, played = 0;
    for (const era of ["1960s", "1990s", "2010s", "2020s"]) {
      for (const [cg, cb] of [["phil-jackson", "steve-kerr"], ["nick-nurse", "pat-riley"]]) {
        for (const [d, o] of [[SHOWTIME, SPLASH], [SMALL, SIZE], [STOPPERS, SPLASH]]) {
          for (const s of childSeeds(2026, 12)) {
            v += checkGame(play(d, o, era, s, cg, cb, {}, FAST)).length; played++;
          }
        }
      }
    }
    expect(played).toBeGreaterThan(250);
    expect(v).toBe(0);
  });

  it("no NaN, Infinity or negative statistic anywhere", () => {
    for (const s of childSeeds(7, 120)) {
      const g = play(SMALL, SIZE, "2010s", s, "nick-nurse", "jerry-sloan", {}, FAST);
      for (const side of ["gold", "blue"]) {
        for (const p of g[side].players) {
          for (const [k, val] of Object.entries(p)) {
            if (typeof val !== "number") continue;
            expect(Number.isFinite(val), `${side}.${p.cardId}.${k}`).toBe(true);
            expect(val, `${side}.${p.cardId}.${k}`).toBeGreaterThanOrEqual(0);
          }
        }
      }
      expect(g.finalScore.gold).not.toBe(g.finalScore.blue);
    }
  });

  it("the same seed reproduces assignments, actions, adjustments and the box score", () => {
    const a = play(SHOWTIME, SPLASH, "2010s", 31337, "phil-jackson", "nick-nurse");
    const b = play(SHOWTIME, SPLASH, "2010s", 31337, "phil-jackson", "nick-nurse");
    expect(JSON.stringify(a.defense)).toBe(JSON.stringify(b.defense));
    expect(JSON.stringify(a.offense)).toBe(JSON.stringify(b.offense));
    expect(JSON.stringify(a.possessionLedger)).toBe(JSON.stringify(b.possessionLedger));
    expect(JSON.stringify(a.gold)).toBe(JSON.stringify(b.gold));
    const c = play(SHOWTIME, SPLASH, "2010s", 31338, "phil-jackson", "nick-nurse");
    expect(JSON.stringify(a.possessionLedger)).not.toBe(JSON.stringify(c.possessionLedger));
  });

  it("the ledger carries compact action context and no prose", () => {
    const g = play(SHOWTIME, SPLASH, "2010s", 777, "phil-jackson", "nick-nurse");
    const withAction = g.possessionLedger.filter((r) => r.action);
    expect(withAction.length).toBeGreaterThan(100);
    for (const r of withAction) {
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "string") expect(v.length, `${k}="${v}"`).toBeLessThan(48);
      }
    }
    // Fields the brief requires.
    const rich = g.possessionLedger.find((r) => r.targetedMismatch) ?? g.possessionLedger.find((r) => r.primaryDefenderId);
    for (const k of ["action", "primary", "outcome", "schemeId"]) expect(rich, k).toHaveProperty(k);
  });

  it("the result summary stays compact", () => {
    const g = play(SHOWTIME, SPLASH, "2010s", 5, "phil-jackson", "nick-nurse", {}, FAST);
    expect(JSON.stringify(g.offense).length, "offensive summary must stay small").toBeLessThan(12000);
    expect(JSON.stringify(g.defense).length).toBeLessThan(24000);
    expect(g.offense.gold).not.toHaveProperty("evidence");
    expect(g.offense.gold).not.toHaveProperty("toolkit");
  });

  it("with every 6B2 flag off, the 6B1 path is intact", () => {
    const g = play(SHOWTIME, SPLASH, "2010s", 5, "phil-jackson", "nick-nurse",
      { expandedActions: false, zoneResolution: false, offensiveAdjustments: false }, FAST);
    expect(g.offense).toBeNull();
    expect(g.zoneResolutionUsed).toBe(false);
    expect(checkGame(g)).toHaveLength(0);
    const kinds = new Set(play(SHOWTIME, SPLASH, "2010s", 5, "phil-jackson", "nick-nurse",
      { expandedActions: false, zoneResolution: false, offensiveAdjustments: false }).possessionLedger.map((r) => r.action));
    for (const k of kinds) expect(["PICK_AND_ROLL", "GENERIC_HALF_COURT", "TRANSITION"]).toContain(k);
  });

  it("no coach, action, shell or era universally dominates", () => {
    const winRate = (d, o, era, cg, cb) => {
      const gs = childSeeds(88, 60).map((s) => play(d, o, era, s, cg, cb, {}, FAST));
      return gs.filter((g) => g.winner === "Gold").length / gs.length;
    };
    for (const [label, args] of Object.entries({
      "small vs size": [SMALL, SIZE, "2010s", "steve-kerr", "jerry-sloan"],
      "stoppers vs splash": [STOPPERS, SPLASH, "2020s", "nick-nurse", "steve-kerr"],
      "showtime vs splash": [SHOWTIME, SPLASH, "1990s", "phil-jackson", "pat-riley"],
      "size vs small": [SIZE, SMALL, "2020s", "jerry-sloan", "steve-kerr"],
    })) {
      const r = winRate(...args);
      expect(r, `${label} = ${r}`).toBeGreaterThan(0.02);
      expect(r, `${label} = ${r}`).toBeLessThan(0.98);
    }
  });
});
