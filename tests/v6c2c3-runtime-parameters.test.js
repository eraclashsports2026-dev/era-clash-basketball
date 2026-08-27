import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import {
  compileRuntimeParameterSet, defaultRuntimeParameterSet, resolveParameterSet,
  activeParameters, hashValues, ParameterSetError, REGISTRY_CLASS,
  startParameterTrace, stopParameterTrace, traceReport, traceEnabled,
} from "../src/v3/calibration/runtimeParameters.js";
import { PARAMETERS, registryDefaultsHash, parameterSetHash } from "../src/v3/calibration/parameters.js";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { CONSUMER_MANIFEST } from "../scripts/calibration/connectivity.mjs";
import { PARITY_FIXTURES, captureBaseline, diffBaseline, assertNoHoldout, assertOvertimeCoverage, assertZoneCoverage } from "../scripts/calibration/freeze-pre-wiring.mjs";
import { versionOf } from "../src/versions.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";
import { assertSealDiscipline, assertImportChangedNoSeal, sealSnapshot } from "./helpers/sealDiscipline.js";

const FIX = PARITY_FIXTURES.find((f) => f.id === "era-2010s");
const play = (parameterSet, seed = 11, f = FIX) => runPossessionGame(buildPossessionInput({
  parameterSet, goldIds: f.gold, blueIds: f.blue, coachGoldId: f.coachGoldId,
  coachBlueId: f.coachBlueId, eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false, expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false, opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: false, assertInvariants: true });

// ── PART 60 · Parameter context ─────────────────────────────────────────────
describe("compiled parameter set", () => {
  it("compiles every active parameter from the registry's declared defaults", () => {
    const d = defaultRuntimeParameterSet();
    expect(d.parameterCount).toBe(activeParameters().length);
    for (const p of activeParameters()) expect(d.values[p.id], p.id).toBe(p.defaultValue);
  });

  it("is deep-frozen at every level", () => {
    const d = defaultRuntimeParameterSet();
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.values)).toBe(true);
    expect(Object.isFrozen(d.get)).toBe(true);
    expect(Object.isFrozen(d.get.opportunity.saturation)).toBe(true);
    expect(Object.isFrozen(d.get.fitBand.SPOT_UP)).toBe(true);
    expect(() => { d.get.opportunity.saturation.strength = 9; }).toThrow(TypeError);
  });

  it("rejects an unknown parameter id", () => {
    expect(() => compileRuntimeParameterSet({ overrides: { "not.a.parameter": 1 } })).toThrow(ParameterSetError);
  });

  it("rejects an out-of-bound value rather than clamping it", () => {
    const p = activeParameters()[0];
    expect(() => compileRuntimeParameterSet({ overrides: { [p.id]: p.max + 1 } })).toThrow(/outside declared bounds/);
    expect(() => compileRuntimeParameterSet({ overrides: { [p.id]: p.min - 1 } })).toThrow(/outside declared bounds/);
  });

  it("rejects NaN, Infinity, strings, null and undefined", () => {
    const id = "opportunity.saturation.strength";
    for (const bad of [NaN, Infinity, -Infinity, "1.5", null, undefined, {}, []]) {
      expect(() => compileRuntimeParameterSet({ overrides: { [id]: bad } }), `${String(bad)}`).toThrow(ParameterSetError);
    }
  });

  it("applies no implicit type coercion", () => {
    // "1.35" is the correct value as a string. It must still be refused: a set
    // that silently coerces records a value nobody chose.
    expect(() => compileRuntimeParameterSet({ overrides: { "opportunity.saturation.strength": "1.35" } })).toThrow(ParameterSetError);
  });

  it("rejects a registry missing an active parameter", () => {
    const short = PARAMETERS.filter((p) => p.id !== "conversion.rimBonus");
    // Compiling from a truncated registry must not silently produce a smaller set.
    const s = compileRuntimeParameterSet({ registry: short });
    expect(s.parameterCount).toBe(activeParameters().length - 1);
    expect(s.values["conversion.rimBonus"]).toBeUndefined();
    // ...and the hash must differ, so the smaller set cannot masquerade as full.
    expect(s.parameterSetHash).not.toBe(defaultRuntimeParameterSet().parameterSetHash);
  });

  it("hashes canonically, independent of override order", () => {
    const a = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.2, "era.paceTempoScale": 2 } });
    const b = compileRuntimeParameterSet({ overrides: { "era.paceTempoScale": 2, "conversion.rimBonus": 0.2 } });
    expect(a.parameterSetHash).toBe(b.parameterSetHash);
    expect(hashValues({ b: 2, a: 1 }, { registryVersion: "x", bindingVersion: "y" }))
      .toBe(hashValues({ a: 1, b: 2 }, { registryVersion: "x", bindingVersion: "y" }));
  });

  it("gives a different hash to a different value", () => {
    const a = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.2 } });
    expect(a.parameterSetHash).not.toBe(defaultRuntimeParameterSet().parameterSetHash);
  });

  it("reports status truthfully — defaults are still defaults after a baseline lock", () => {
    // status describes where the VALUES came from, and they came from the
    // registry defaults; nothing tuned them. calibrationVersion describes what
    // EVIDENCE stands behind them, which Phase 6C2C6 supplied by locking
    // Candidate 0. Those are different claims and both stay honest: a baseline
    // lock is precisely a lock in which no value moved.
    expect(defaultRuntimeParameterSet().status).toBe("UNCALIBRATED_DEFAULTS");
    expect(compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.2 } }).status).toBe("CANDIDATE_OVERRIDES");
    expect(defaultRuntimeParameterSet().calibrationVersion).toBe(versionOf("possessionCalibrationVersion"));
    assertCalibrationLockInvariant();
  });

  it("records which values were overridden and from what", () => {
    const s = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.2 } });
    expect(s.overriddenFromDefault).toEqual([{ id: "conversion.rimBonus", from: 0.155, to: 0.2 }]);
  });

  it("resolves a compiled set, an overrides object, or null", () => {
    expect(resolveParameterSet(null).parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    const c = compileRuntimeParameterSet();
    expect(resolveParameterSet(c)).toBe(c);
    expect(resolveParameterSet({ "conversion.rimBonus": 0.2 }).values["conversion.rimBonus"]).toBe(0.2);
  });
});

// ── PART 10 · No process-global state ───────────────────────────────────────
describe("parameter set isolation", () => {
  it("keeps three interleaved sets independent within one process", () => {
    const A = compileRuntimeParameterSet({ overrides: { "opportunity.saturation.strength": 0.6 }, label: "A" });
    const B = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.28 }, label: "B" });
    // One call per score. The first version of this test called play() twice and
    // took gold from one result and blue from the other, which is nonsense.
    const s = (ps, seed) => { const g = play(ps, seed); return `${g.finalScore.gold}-${g.finalScore.blue}`; };
    // Several seeds, because two different parameter sets can coincidentally
    // land on the same scoreline for one seed.
    const seeds = [11, 12, 13, 14];
    for (const seed of seeds) {
      expect(s(null, seed), "default must be reproducible").toBe(s(null, seed));
      expect(s(A, seed), "set A must be reproducible").toBe(s(A, seed));
      expect(s(B, seed), "set B must be reproducible").toBe(s(B, seed));
    }
    // Across the seeds, all three sets must be distinguishable from each other.
    const sig = (ps) => seeds.map((seed) => s(ps, seed)).join("|");
    expect(new Set([sig(null), sig(A), sig(B)]).size).toBe(3);
  });

  it("does not let a candidate leak into a later default run", () => {
    const before = play(null).fingerprint.parameterSetHash;
    play(compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.28 } }));
    expect(play(null).fingerprint.parameterSetHash).toBe(before);
    expect(defaultRuntimeParameterSet().status).toBe("UNCALIBRATED_DEFAULTS");
  });

  it("leaves the registry itself immutable", () => {
    compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.28 } });
    for (const p of PARAMETERS) expect(p.currentValue, p.id).toBe(p.defaultValue);
    expect(parameterSetHash()).toBe(registryDefaultsHash());
  });
});

// ── PART 12 · Override security ─────────────────────────────────────────────
describe("override security", () => {
  it("exposes no public parameter or calibration endpoint", () => {
    const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [`${d}/${e.name}`] : []) : []);
    for (const f of walk("api")) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must not import the runtime parameter binding`).not.toMatch(/runtimeParameters/);
      expect(src, `${f} must not accept a parameter override`).not.toMatch(/parameterSet|parameterOverride/);
      expect(src, `${f} must not expose a calibration route`).not.toMatch(/calibrationParameter|parameterSetHash/);
    }
  });

  it("never reads parameters from a request body", () => {
    const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [`${d}/${e.name}`] : []) : []);
    for (const f of walk("api")) {
      expect(readFileSync(f, "utf8")).not.toMatch(/body\??\.(parameterSet|overrides|parameters)/);
    }
  });
});

// ── PART 13 · Trace ─────────────────────────────────────────────────────────
describe("parameter trace", () => {
  it("is off by default and reports nothing when off", () => {
    expect(traceEnabled()).toBe(false);
    expect(traceReport(null)).toEqual({ enabled: false, parameters: [] });
  });

  it("observes reads while on, and stops cleanly", () => {
    startParameterTrace();
    expect(traceEnabled()).toBe(true);
    play(null);
    const r = traceReport(stopParameterTrace());
    expect(traceEnabled()).toBe(false);
    expect(r.enabled).toBe(true);
    expect(r.parameters.length).toBeGreaterThan(20);
    for (const p of r.parameters) expect(p.invocations).toBeGreaterThan(0);
  });

  it("does not change results when enabled", () => {
    const off = play(null);
    startParameterTrace();
    const on = play(null);
    stopParameterTrace();
    expect(on.finalScore).toEqual(off.finalScore);
    expect(on.rngSteps).toBe(off.rngSteps);
  });
});

// ── PART 61 · Mapping ───────────────────────────────────────────────────────
describe("consumer manifest", () => {
  it("declares a consumer for every active parameter, and nothing else", () => {
    const active = new Set(activeParameters().map((p) => p.id));
    for (const id of active) expect(CONSUMER_MANIFEST[id], `${id} has no declared consumer`).toBeTruthy();
    for (const id of Object.keys(CONSUMER_MANIFEST)) expect(active.has(id), `${id} is declared but not active`).toBe(true);
  });

  it("names a real file, the prior literal, and a basketball role", () => {
    for (const [id, m] of Object.entries(CONSUMER_MANIFEST)) {
      for (const f of m.file.split(/\s*\+\s*/).map((x) => x.trim().split(" ")[0])) {
        expect(existsSync(f), `${id} names missing file ${f}`).toBe(true);
      }
      expect(m.fn.length, id).toBeGreaterThan(2);
      expect(m.prior.length, id).toBeGreaterThan(3);
      expect(m.role.length, id).toBeGreaterThan(15);
    }
  });

  it("classifies every registry entry, and only classes the runtime knows", () => {
    for (const p of PARAMETERS) {
      expect(Object.keys(REGISTRY_CLASS), p.id).toContain(p.registryClass);
    }
  });

  it("gives every non-active entry a recorded reason", () => {
    const inactive = PARAMETERS.filter((p) => p.registryClass !== "ACTIVE_RUNTIME_TUNABLE");
    expect(inactive.length).toBe(2);
    for (const p of inactive) {
      expect(p.classNote, `${p.id} needs a reason for not being active`).toBeTruthy();
      expect(p.classNote.length).toBeGreaterThan(80);
    }
  });
});

// ── PART 62 · Default parity ────────────────────────────────────────────────
describe("default parity", () => {
  // Candidate 1 (Phase 6C4A) deliberately changed engine behaviour, so
  // "matches the stored Candidate 0 corpus" stopped being the invariant. What
  // "default parity" always MEANT is tested live instead, on every fixture:
  // running with parameterSet null and with the compiled default set must be
  // byte-identical — the wiring itself adds nothing at defaults, whichever
  // candidate is live. The stored pre-wiring corpus remains untouched as the
  // frozen Candidate 0 record.
  it("null parameterSet and compiled defaults are byte-identical across the whole corpus", () => {
    const def = defaultRuntimeParameterSet();
    for (const f of PARITY_FIXTURES) {
      const a = play(null, f.seed, f);
      const b = play(def, f.seed, f);
      expect(JSON.stringify(a.finalScore), `${f.id} finalScore`).toBe(JSON.stringify(b.finalScore));
      expect(a.rngSteps, `${f.id} rngSteps`).toBe(b.rngSteps);
      expect(JSON.stringify(a.gold.totals), `${f.id} gold totals`).toBe(JSON.stringify(b.gold.totals));
      expect(JSON.stringify(a.blue.totals), `${f.id} blue totals`).toBe(JSON.stringify(b.blue.totals));
    }
  }, 240000);

  it("adds no RNG draw — parameter lookup must not consume randomness", () => {
    const def = defaultRuntimeParameterSet();
    for (const f of PARITY_FIXTURES) {
      expect(play(def, f.seed, f).rngSteps, `${f.id} rngSteps`).toBe(play(null, f.seed, f).rngSteps);
    }
  }, 120000);

  it("the live corpus still covers overtime and real zone play", () => {
    // captureBaseline() itself asserts OT and zone coverage on the LIVE
    // engine, with seeds re-searched for the live candidate when behaviour
    // deliberately changed (13 -> 19, 252 -> 75 for Candidate 1).
    expect(captureBaseline().fixtureCount).toBeGreaterThan(20);
  }, 240000);

  it("keeps the corpus free of any sealed holdout, by construction", () => {
    expect(assertNoHoldout(PARITY_FIXTURES)).toBe(true);
  });

  it("still contains a single and a double overtime, and real zone play", () => {
    const cases = JSON.parse(readFileSync("tests/fixtures/parameter-wiring/pre-wiring/behaviour-baseline.json", "utf8")).cases;
    expect(assertOvertimeCoverage(cases)).toBe(true);
    expect(assertZoneCoverage(cases)).toBe(true);
  });
});

// ── PART 34 · Result identity ───────────────────────────────────────────────
describe("result and fingerprint identity", () => {
  it("stamps the runtime parameter identity on the fingerprint", () => {
    const g = play(null);
    expect(g.fingerprint.runtimeParameterBindingVersion).toBe(versionOf("runtimeParameterBindingVersion"));
    expect(g.fingerprint.calibrationParameterRegistryVersion).toBe("2.0.0");
    expect(g.fingerprint.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    expect(g.fingerprint.parameterSetStatus).toBe("UNCALIBRATED_DEFAULTS");
  });

  it("reports the same possessionCalibrationVersion on the result as the registry holds", () => {
    // The result surface must never disagree with the registry about which
    // calibration produced it. Null before Phase 6C2C6, 1.0.0 after, and equal
    // to the registry either way.
    const v = versionOf("possessionCalibrationVersion");
    expect(play(null).possessionCalibrationVersion).toBe(v);
    const r = assertCalibrationLockInvariant();
    if (r.locked) expect(play(null).possessionCalibrationVersion).toBe(r.version);
  });

  it("gives a candidate a different fingerprint and status", () => {
    const c = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.28 } });
    const g = play(c);
    expect(g.fingerprint.parameterSetHash).toBe(c.parameterSetHash);
    expect(g.fingerprint.parameterSetHash).not.toBe(play(null).fingerprint.parameterSetHash);
    expect(g.fingerprint.parameterSetStatus).toBe("CANDIDATE_OVERRIDES");
  });

  it("replays a candidate exactly", () => {
    const c = compileRuntimeParameterSet({ overrides: { "conversion.rimBonus": 0.28 } });
    const a = play(c), b = play(c);
    expect(a.finalScore).toEqual(b.finalScore);
    expect(a.rngSteps).toBe(b.rngSteps);
    expect(a.fingerprint).toEqual(b.fingerprint);
  });

  it("maps a legacy result with no parameter hash to the implicit default set", () => {
    // Development results predating Phase 6C2C3 carry no parameterSetHash,
    // because the registry was disconnected. Their behaviour IS the current
    // default set, so the mapping is to the default hash — not to nothing.
    const legacy = { possessionEngineVersion: "1.1.0", parameterSetHash: undefined };
    const inferred = legacy.parameterSetHash ?? defaultRuntimeParameterSet().parameterSetHash;
    expect(inferred).toBe(defaultRuntimeParameterSet().parameterSetHash);
    expect(legacy.parameterSetHash).toBeUndefined();
  });
});

// ── PART 64 · Domain behaviour ──────────────────────────────────────────────
describe("domain wiring moves the intended domain", () => {
  const move = (id, value, seed = 11, f = FIX) => {
    const base = play(null, seed, f);
    const moved = play(compileRuntimeParameterSet({ overrides: { [id]: value } }), seed, f);
    return { base, moved };
  };

  it("opportunity saturation changes usage concentration", () => {
    const flat = play(compileRuntimeParameterSet({ overrides: { "opportunity.saturation.strength": 2.5 } }));
    const peaked = play(compileRuntimeParameterSet({ overrides: { "opportunity.saturation.strength": 0.6 } }));
    const lead = (g) => Math.max(...g.gold.players.map((p) => p.fga)) / (g.gold.totals.fga || 1);
    expect(lead(flat)).not.toBe(lead(peaked));
  });

  it("conversion bonuses change field-goal percentage", () => {
    const { base, moved } = move("conversion.rimBonus", 0.28);
    expect(moved.gold.totals.fgPct).not.toBe(base.gold.totals.fgPct);
  });

  it("the midrange penalty is ADDED, so raising it raises MIDRANGE conversion", () => {
    // The registry stores this negative and the old code read `fg - 0.055`.
    // Substituting into the minus would have inverted the sign.
    //
    // Measured on midrange conversion specifically, over many seeds. The first
    // version of this test used team FG%, which mixes all four locations and
    // absorbs the RNG divergence a changed make probability causes downstream —
    // on one seed it moved the wrong way, and the test was measuring the wrong
    // quantity rather than catching a sign error.
    const midRate = (value) => {
      let made = 0, att = 0;
      const set = compileRuntimeParameterSet({ overrides: { "conversion.midrangePenalty": value } });
      for (let seed = 1; seed <= 30; seed++) {
        const g = runPossessionGame(buildPossessionInput({
          parameterSet: set, goldIds: FIX.gold, blueIds: FIX.blue,
          coachGoldId: FIX.coachGoldId, coachBlueId: FIX.coachBlueId,
          eraStyleId: FIX.era, simulationSeed: seed,
        }), { includeLedger: true, assertInvariants: false });
        for (const row of g.possessionLedger) {
          if (row.shot === "MIDRANGE") { att++; if ((row.points ?? 0) > 0) made++; }
        }
      }
      return made / att;
    };
    expect(midRate(0.02)).toBeGreaterThan(midRate(-0.15));
  }, 120000);

  it("the perimeter bias multiplier changes three-point rate", () => {
    const { base, moved } = move("shotLocation.perimeterBiasMultiplier", 3);
    expect(moved.gold.totals.tpa / moved.gold.totals.fga).not.toBe(base.gold.totals.tpa / base.gold.totals.fga);
  });

  it("the era pace scale changes pace", () => {
    const fast = play(compileRuntimeParameterSet({ overrides: { "era.paceTempoScale": 3 } }));
    const slow = play(compileRuntimeParameterSet({ overrides: { "era.paceTempoScale": 0.5 } }));
    expect(fast.gold.totals.possessions).not.toBe(slow.gold.totals.possessions);
  });

  it("the free-throw trip rate changes free-throw rate", () => {
    const high = play(compileRuntimeParameterSet({ overrides: { "era.freeThrowTripRate": 1 } }));
    const low = play(compileRuntimeParameterSet({ overrides: { "era.freeThrowTripRate": 0.2 } }));
    expect(high.gold.totals.fta).toBeGreaterThan(low.gold.totals.fta);
  });

  it("adjustment cooldown changes how often a coach adjusts", () => {
    const f = PARITY_FIXTURES.find((x) => x.id === "coach-mike-dantoni-vs-jerry-sloan");
    const adj = (g) => (g.offense?.gold?.adjustments?.length ?? 0) + (g.offense?.blue?.adjustments?.length ?? 0);
    const often = play(compileRuntimeParameterSet({ overrides: { "coach.offensiveAdjustmentCooldown": 4 } }), f.seed, f);
    const rare = play(compileRuntimeParameterSet({ overrides: { "coach.offensiveAdjustmentCooldown": 60 } }), f.seed, f);
    expect(adj(often)).toBeGreaterThan(adj(rare));
  });

  it("zone gap scalars change zone behaviour where a shell is live", () => {
    // Zone use is per-possession since Candidate 1, so a single seed can
    // legitimately miss the scalar's window; the scalar must move SOME game
    // in a small seed set, which is the stronger form of the same claim.
    const f = PARITY_FIXTURES.find((x) => x.id === "real-zone-nick-nurse");
    const any = [f.seed, f.seed + 1, f.seed + 2, f.seed + 3, f.seed + 4].some((seed) => {
      const { base, moved } = move("zone.highPostVulnerability", 2, seed, f);
      return JSON.stringify(moved.finalScore) !== JSON.stringify(base.finalScore);
    });
    expect(any).toBe(true);
  });

  it("preserves invariants at every parameter bound", () => {
    // A bound that produces an impossible box score is an invalid bound, and it
    // must be caught here rather than during a calibration search.
    for (const p of activeParameters()) {
      for (const v of [p.min, p.max]) {
        const set = compileRuntimeParameterSet({ overrides: { [p.id]: v } });
        const g = runPossessionGame(buildPossessionInput({
          parameterSet: set, goldIds: FIX.gold, blueIds: FIX.blue,
          coachGoldId: FIX.coachGoldId, coachBlueId: FIX.coachBlueId,
          eraStyleId: FIX.era, simulationSeed: 11,
        }), { includeLedger: false, assertInvariants: false });
        expect(g.invariantViolations, `${p.id} = ${v} broke invariants`).toHaveLength(0);
        expect(g.finalScore.gold, `${p.id} = ${v} produced a tie`).not.toBe(g.finalScore.blue);
      }
    }
  }, 300000);
});

// ── PART 23 · Fixed rules outrank tunables ──────────────────────────────────
describe("fixed rules cannot be overridden by a parameter", () => {
  it("keeps three-point attempts at zero in pre-three-point eras at every bound", () => {
    const f = PARITY_FIXTURES.find((x) => x.id === "era-1960s");
    for (const id of ["shotLocation.threeWeight", "shotLocation.perimeterBiasMultiplier", "era.threeAnchorMax"]) {
      const p = activeParameters().find((x) => x.id === id);
      for (const v of [p.min, p.max]) {
        const g = play(compileRuntimeParameterSet({ overrides: { [id]: v } }), f.seed, f);
        expect(g.gold.totals.tpa, `${id}=${v} produced 3PA in a pre-three era`).toBe(0);
        expect(g.gold.totals.tpm).toBe(0);
        expect(g.blue.totals.tpa).toBe(0);
      }
    }
  }, 60000);
});

// ── PART 67 · Holdouts ──────────────────────────────────────────────────────
describe("holdouts remain sealed through the wiring phase", () => {
  it("has opened nothing", async () => {
    assertSealDiscipline();
  });

  it("uses no holdout fixture in the sensitivity corpus", async () => {
    const { SENSITIVITY_FIXTURES } = await import("../scripts/calibration/sensitivity.mjs");
    const { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } = await import("../data/calibration/sets-v3.mjs");
    const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id)]);
    for (const f of SENSITIVITY_FIXTURES) {
      expect([...sealed].some((s) => f.id.includes(s)), `${f.id}`).toBe(false);
    }
  });
});

// ── Import inertness ────────────────────────────────────────────────────────
describe("new scripts are inert on import", () => {
  it("guards every calibration script behind a main-module check", () => {
    for (const f of readdirSync("scripts/calibration").filter((x) => x.endsWith(".mjs"))) {
      expect(readFileSync(`scripts/calibration/${f}`, "utf8"), `scripts/calibration/${f}`)
        .toContain("import.meta.url === `file://${process.argv[1]}`");
    }
  });
});
