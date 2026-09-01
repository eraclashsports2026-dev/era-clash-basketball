// ── Synchronized player + coach Chaos draft (sequence 2) ─────────────────────
// One three-roll sequence now deals players AND coach offers together. These
// tests hold three separate lines:
//
//   1. The new mechanic behaves: three rolls, no fourth, multi-hold on both
//      boards, burns, era reveal at Roll 2, one hire from the final three.
//   2. The CPU plays the same game — same rolls, committed first, no peeking,
//      and no tier anywhere near a draw.
//   3. Nothing that already exists moved. A seed still reveals the same era, a
//      challenge id is still the same string, and a run minted under sequence 1
//      still walks the old flow.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  startRun, submitRollDecisions, submitHolds, submitCoachHolds, chooseEra, selectCoach, publicView,
  revealEra, sequenceOf, CURRENT_SEQUENCE, CHAOS_SEQUENCE_VERSION,
} from "../src/chaos/runState.js";
import { challengeId, buildManifest, FORBIDDEN_CHALLENGE_FIELDS } from "../src/chaos/challenge.js";
import { hashString } from "../src/v3/seed.js";
import { hydrate, eraChangeState } from "../api/_lib/chaosRun.js";
import { OFFER_ROLES, eraAgnosticAdaptabilityScore, eraFitScore } from "../src/chaos/coachOffers.js";
import { CHAOS_ERA_IDS } from "../src/chaos/eraTranslation.js";
import { POSITIONS, PLAYERS } from "../src/players.js";
import { COACHES } from "../src/v3/coaches.js";

const NOW = 1_760_000_000_000;
const start = (over = {}) => startRun({ runId: "run000000001", seedId: "syncseed00001", createdAt: NOW, ...over });
const decide = (run, holdSlots = [], holdRoles = []) => submitRollDecisions(run, { holdSlots, holdRoles, hydrate });
const view = (run, opts = {}) => publicView(run, { hydrate, ...opts });

// ── 3. Nothing that already exists moved ────────────────────────────────────
// ── The CPU's commitments must be BINDING, not decorative ───────────────────
// Every other input to these hashes is published in the same response and the
// message spaces are tiny — 32 hold subsets, 3 coach ids — so without a secret
// in the pre-image the committed value is recoverable by trying them all. That
// attack was reproduced against the unsalted construction before this guard.
describe("committed CPU decisions cannot be inverted before the user commits", () => {
  const SUBSETS = (() => {
    const out = [];
    for (let m = 0; m < 32; m++) out.push(POSITIONS.filter((_, i) => m & (1 << i)));
    return out;
  })();

  it("brute-forcing all 32 hold subsets over the published inputs finds nothing", () => {
    const run = start();
    const v = view(run);
    const salt = `${v.chaosRunId}|${run.currentRoll}`;
    const ver = v.versions.legendCpuVersion;
    const hits = SUBSETS.filter((sub) =>
      String(hashString(`${salt}|${[...sub].sort().join(",")}|${ver}`) >>> 0) === v.cpuDecisionCommit);
    expect(hits).toEqual([]);
    // and the value it protects is genuinely non-trivial
    expect(run._cpuHold.length).toBeGreaterThan(0);
  });

  it("the secret is absent from every pre-simulation view", () => {
    const run = start();
    expect(run._commitSecret).toBeTruthy();
    for (const phase of ["ROLL_1_REVEALED", "ROLL_2_REVEALED", "ROLL_3_REVEALED", "READY"]) {
      run.currentPhase = phase;
      const v = view(run, { includeCpuHolds: true });
      expect(v.commitSecret, phase).toBeNull();
      expect(JSON.stringify(v).includes(run._commitSecret), phase).toBe(false);
    }
  });

  it("once the game is played the commitment is verifiable", () => {
    const run = start();
    const committed = view(run).cpuDecisionCommit;
    const salt = `${run.chaosRunId}|${run.currentRoll}`;
    run.currentPhase = "SIMULATED";
    const done = view(run, { includeCpuHolds: true });
    expect(done.commitSecret).toBe(run._commitSecret);
    const recomputed = String(hashString(
      `${salt}|${[...run._cpuHold].sort().join(",")}|${done.versions.legendCpuVersion}|${done.commitSecret}`) >>> 0);
    expect(recomputed).toBe(committed);
  });

  it("the secret never rides a challenge link", () => {
    const run = start();
    const m = buildManifest({ seedId: run.seedId, createdAt: run.createdAt, originRunId: run.chaosRunId, sequence: 2 });
    expect(FORBIDDEN_CHALLENGE_FIELDS).toContain("commitSecret");
    expect(JSON.stringify(m).includes(run._commitSecret)).toBe(false);
  });

  it("a run stored before the secret existed re-derives it and stays verifiable", () => {
    const run = start();
    const expected = run._commitSecret;
    delete run._commitSecret;                 // a run stored before this existed
    decide(run, [], []);                      // the next commitment re-derives it
    expect(run._commitSecret).toBe(expected); // same stored state -> same secret
    const salt = `${run.chaosRunId}|${run.currentRoll}`;
    run.currentPhase = "SIMULATED";
    const done = view(run, { includeCpuHolds: true });
    const recomputed = String(hashString(
      `${salt}|${[...run._cpuHold].sort().join(",")}|${done.versions.legendCpuVersion}|${done.commitSecret}`) >>> 0);
    expect(recomputed).toBe(run.cpuDecisionCommit);
  });
});

describe("frozen derivations", () => {
  // Captured from the deployed build before the synchronized sequence existed.
  // A challenge link carries a seed: if these move, a link somebody already
  // sent becomes a different game.
  const ERA_PINS = [
    ["aaaaaaaaaaaaaa", "1960s"],
    ["zzzzzzzzzzzzzz", "2010s"],
    ["wave1seed00001", "1970s"],
    ["h7k2p9q4m1x8t3", "1960s"],
    ["0000000000000a", "2010s"],
    ["chaosseed12345", "1950s"],
    ["ownertestseed1", "2000s"],
    ["9f3k2m8p1q7x4t", "2010s"],
  ];
  const CHALLENGE_PINS = [
    ["aaaaaaaaaaaaaa", "0v3j0p8"],
    ["zzzzzzzzzzzzzz", "1krpupi"],
    ["wave1seed00001", "1t7qt4i"],
    ["h7k2p9q4m1x8t3", "17qko57"],
  ];

  it("a seed still reveals the era it always revealed", () => {
    for (const [seed, era] of ERA_PINS) expect(revealEra(seed), seed).toBe(era);
  });

  it("a seed still produces the same challenge id", () => {
    for (const [seed, id] of CHALLENGE_PINS) expect(challengeId(seed), seed).toBe(id);
  });

  it("the era derivation does not depend on the run version", () => {
    // The whole point of the frozen key: run-shape versions change, eras do not.
    const src = readRunState();
    expect(src).toMatch(/const ERA_REVEAL_KEY = "2\.0\.0";/);
    expect(src).not.toMatch(/era\|\$\{seedId\}\|\$\{CHAOS_RUN_VERSION\}/);
  });
});

const readRunState = () => readFileSync(new URL("../src/chaos/runState.js", import.meta.url), "utf8");

describe("sequence 1 runs are untouched", () => {
  it("opens with no coach board and refuses the synchronized submit", () => {
    const run = start({ sequence: 1 });
    expect(sequenceOf(run)).toBe(1);
    expect(run.coachOffers).toBeFalsy();
    expect(view(run).coachDraft).toBeNull();
    const r = decide(run, ["PG"], []);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("WRONG_SEQUENCE");
  });

  it("still walks the old player-only flow", () => {
    const run = start({ sequence: 1 });
    const r1 = submitHolds(run, { holdSlots: ["PG", "SG"], hydrate });
    expect(r1.ok).toBe(true);
    expect(run.currentPhase).toBe("ROLL_2_REVEALED");
    expect(run.revealedEraStyleId).toBeTruthy();
    const r2 = submitHolds(run, { holdSlots: ["PG"], hydrate });
    expect(r2.ok).toBe(true);
    // The old flow locks rosters and THEN opens a separate coach draft.
    expect(run.currentPhase).toBe("COACH_ROLL_1");
  });

  it("cannot be advanced by the synchronized action, and vice versa", () => {
    // One run walks ONE flow. Mixing them would re-open a board that had
    // already been dealt, which is extra rolls for free.
    const legacy = start({ sequence: 1 });
    expect(decide(legacy, [], []).code).toBe("WRONG_SEQUENCE");
    const sync = start();
    expect(submitHolds(sync, { holdSlots: [], hydrate }).code).toBe("WRONG_SEQUENCE");
    expect(submitCoachHolds(sync, { holdRoles: [], hydrate }).code).toBe("WRONG_SEQUENCE");
    expect(sync.currentRoll).toBe(1);
    expect(sync.currentPhase).toBe("ROLL_1_REVEALED");
  });

  it("a challenge minted under sequence 1 records sequence 1", () => {
    const m = buildManifest({ seedId: "syncseed00001", createdAt: NOW, originRunId: "r1", sequence: 1 });
    expect(m.chaosSequenceVersion).toBe("1.0.0");
    expect(m.eraStyleId).toBeNull();
  });
});

// ── 1. The new mechanic behaves ─────────────────────────────────────────────
describe("roll 1 deals both boards", () => {
  const run = start();

  it("defaults to the synchronized sequence", () => {
    expect(CURRENT_SEQUENCE).toBe(2);
    expect(CHAOS_SEQUENCE_VERSION).toBe("2.0.0");
    expect(sequenceOf(run)).toBe(2);
  });

  it("puts five players on each side and three offers on each side", () => {
    const v = view(run);
    expect(v.phase).toBe("ROLL_1_REVEALED");
    expect(v.roll).toBe(1);
    expect(v.gold.roster.filter(Boolean)).toHaveLength(5);
    expect(v.blue.roster.filter(Boolean)).toHaveLength(5);
    expect(v.coachDraft).toBeTruthy();
    expect(v.coachDraft.synchronized).toBe(true);
    expect(v.coachDraft.offers).toHaveLength(3);
    expect(v.coachDraft.offers.map((o) => o.role).sort()).toEqual([...OFFER_ROLES].sort());
    expect(run.coachOffers.blue).toHaveLength(3);
  });

  it("keeps the era hidden until Roll 2", () => {
    const v = view(run);
    expect(v.eraContext).toBeNull();
    expect(v.eraState.revealed).toBe(false);
    expect(v.coachDraft.selecting).toBe(false);
  });

  it("offers three distinct coaches per side", () => {
    const goldIds = run.coachOffers.gold.map((o) => o.coachId);
    expect(new Set(goldIds).size).toBe(3);
  });
});

describe("one decision covers both boards", () => {
  it("keeps held players and held coaches, and burns the rest", () => {
    const run = start();
    const keptPlayers = ["PG", "SG", "C"];
    const keptRole = run.coachOffers.gold[0].role;
    const keptCoachId = run.coachOffers.gold[0].coachId;
    const heldNames = keptPlayers.map((s) => hydrate(run.goldRoster)[s].name);
    const releasedIds = POSITIONS.filter((s) => !keptPlayers.includes(s))
      .map((s) => hydrate(run.goldRoster)[s].id);
    const releasedCoachIds = run.coachOffers.gold.slice(1).map((o) => o.coachId);

    const r = decide(run, keptPlayers, [keptRole]);
    expect(r.ok).toBe(true);

    const g = hydrate(run.goldRoster);
    expect(keptPlayers.map((s) => g[s].name)).toEqual(heldNames);
    for (const id of releasedIds) expect(run.burnedPersonIds).toContain(id);
    const stillOffered = run.coachOffers.gold.find((o) => o.role === keptRole);
    expect(stillOffered.coachId).toBe(keptCoachId);
    for (const id of releasedCoachIds) expect(run.burnedCoachIds).toContain(id);
  });

  it("never returns a burned player or a burned coach", () => {
    const run = start();
    decide(run, [], []);
    const burnedPeople = new Set(run.burnedPersonIds);
    const burnedCoaches = new Set(run.burnedCoachIds);
    for (const id of run.goldRoster.concat(run.blueRoster)) expect(burnedPeople.has(id)).toBe(false);
    for (const o of run.coachOffers.gold.concat(run.coachOffers.blue)) {
      expect(burnedCoaches.has(o.coachId)).toBe(false);
    }
  });

  it("reveals the era with Roll 2, before the final decision", () => {
    const run = start();
    decide(run, ["PG"], []);
    expect(run.currentPhase).toBe("ROLL_2_REVEALED");
    expect(run.currentRoll).toBe(2);
    const v = view(run);
    expect(v.eraState.revealed).toBe(true);
    expect(v.eraState.eraStyleId).toBe(revealEra("syncseed00001"));
    expect(v.eraState.custom).toBe(false);
    expect(v.eraContext.headline).toContain(v.eraState.eraStyleId);
    // The offers drawn WITH the era are explained against it.
    expect(v.coachDraft.offers.every((o) => o.role && o.name)).toBe(true);
  });

  it("refuses a malformed decision without mutating the run", () => {
    const run = start();
    const before = JSON.stringify({ g: run.goldRoster, c: run.coachOffers, p: run.currentPhase });
    for (const bad of [
      { slots: ["QB"], roles: [] },
      { slots: ["PG", "PG"], roles: [] },
      { slots: [], roles: ["HEAD_COACH"] },
      { slots: [], roles: ["ROSTER_MAXIMIZER", "ROSTER_MAXIMIZER"] },
      { slots: null, roles: [] },
      { slots: [], roles: null },
    ]) {
      const r = submitRollDecisions(run, { holdSlots: bad.slots, holdRoles: bad.roles, hydrate });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(JSON.stringify({ g: run.goldRoster, c: run.coachOffers, p: run.currentPhase })).toBe(before);
  });

  it("refuses holding a role that is not on the table", () => {
    const run = start();
    run.coachOffers.gold = run.coachOffers.gold.filter((o) => o.role !== "ERA_ADAPTER");
    const r = decide(run, [], ["ERA_ADAPTER"]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROLE_NOT_OFFERED");
  });
});

describe("three rolls and no fourth", () => {
  const run = start();
  decide(run, ["PG", "SG"], [run.coachOffers.gold[0].role]);
  decide(run, ["PG"], []);

  it("locks the roster and the final three offers on Roll 3", () => {
    expect(run.currentRoll).toBe(3);
    expect(run.currentPhase).toBe("ROLL_3_REVEALED");
    const v = view(run);
    expect(v.rostersLocked).toBe(true);
    expect(v.coachDraft.selecting).toBe(true);
    expect(v.coachDraft.offers).toHaveLength(3);
  });

  it("refuses a fourth roll", () => {
    const r = decide(run, ["PG"], []);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID_TRANSITION");
    expect(run.currentRoll).toBe(3);
  });

  it("hires exactly one of the three offers and reaches READY", () => {
    const offered = run.coachOffers.gold.map((o) => o.coachId);
    const bad = selectCoach(run, { coachId: COACHES.find((c) => !offered.includes(c.id)).id });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe("COACH_NOT_OFFERED");

    const ok = selectCoach(run, { coachId: offered[1] });
    expect(ok.ok).toBe(true);
    expect(run.currentPhase).toBe("READY");
    expect(run.selectedCoaches.gold).toBe(offered[1]);
    // The CPU's coach was committed before the user chose, and is revealed now.
    expect(run.selectedCoaches.blue).toBeTruthy();
    expect(run.cpuCoachCommit).toBeTruthy();
    expect(view(run).selectedCoaches.blue).toBe(run.selectedCoaches.blue);
  });
});

// ── 2. The CPU plays the same game ──────────────────────────────────────────
describe("Legend CPU parity", () => {
  it("commits both of its decisions before the user submits either", () => {
    const run = start();
    expect(run.cpuDecisionCommit).toBeTruthy();
    expect(run.cpuCoachHoldCommit).toBeTruthy();
    const playerCommit = run.cpuDecisionCommit, coachCommit = run.cpuCoachHoldCommit;
    // What the user does cannot change a decision already committed.
    const cpuPlayers = [...(run._cpuHold || [])], cpuCoaches = [...(run._cpuCoachHold || [])];
    decide(run, ["PG", "SG", "SF", "PF", "C"], run.coachOffers.gold.map((o) => o.role));
    expect(run.history[0].blueHeld).toEqual(cpuPlayers);
    expect(run.coachHistory[0].blueHeld).toEqual(cpuCoaches);
    expect(playerCommit).toBeTruthy();
    expect(coachCommit).toBeTruthy();
  });

  it("gets the same number of rolls on both boards", () => {
    const run = start();
    decide(run, [], []);
    decide(run, [], []);
    expect(run.history).toHaveLength(2);
    expect(run.coachHistory).toHaveLength(2);
    expect(run.history.map((h) => h.roll)).toEqual([1, 2]);
    expect(run.coachHistory.map((h) => h.roll)).toEqual([1, 2]);
  });

  it("hides its holds until the user has committed", () => {
    const run = start();
    const before = view(run, { includeCpuHolds: false });
    expect(before.blue.heldSlots).toEqual([]);
    expect(before.coachDraft.opponent.every((o) => o.held === false)).toBe(true);
    decide(run, ["PG"], []);
    const after = view(run, { includeCpuHolds: true });
    expect(after.blue.heldSlots).toEqual(run.history[0].blueHeld);
  });

  it("never sees an unrevealed draw in the client view", () => {
    const run = start();
    const v = JSON.stringify(view(run, { includeCpuHolds: true }));
    expect(v).not.toContain("seedId");
    expect(v).not.toContain(run.seedId);
    expect(v).not.toContain("_cpuHold");
    expect(v).not.toContain("_cpuCoach");
    expect(v).not.toContain("pinnedEra");
  });

  it("draws from the seed alone — no tier reaches a draw", () => {
    const a = start(), b = start();
    expect(a.goldRoster).toEqual(b.goldRoster);
    expect(a.blueRoster).toEqual(b.blueRoster);
    expect(a.coachOffers.gold.map((o) => o.coachId)).toEqual(b.coachOffers.gold.map((o) => o.coachId));
  });
});

describe("determinism and branching", () => {
  it("the same decisions reproduce the same draft", () => {
    const a = start(), b = start();
    for (const run of [a, b]) {
      decide(run, ["PG", "C"], [run.coachOffers.gold[0].role]);
      decide(run, ["SG"], []);
    }
    expect(a.goldRoster).toEqual(b.goldRoster);
    expect(a.blueRoster).toEqual(b.blueRoster);
    expect(a.coachOffers.gold.map((o) => o.coachId)).toEqual(b.coachOffers.gold.map((o) => o.coachId));
    expect(a.revealedEraStyleId).toBe(b.revealedEraStyleId);
  });

  it("different decisions branch", () => {
    const a = start(), b = start();
    decide(a, ["PG", "C"], []);
    decide(b, ["SG"], []);
    expect(a.goldRoster).not.toEqual(b.goldRoster);
  });

  it("the era is the seed's era whatever the decisions", () => {
    const a = start(), b = start();
    decide(a, [], []);
    decide(b, ["PG", "SG", "SF"], []);
    expect(a.revealedEraStyleId).toBe(b.revealedEraStyleId);
  });
});

// ── Era entitlement ─────────────────────────────────────────────────────────
describe("era control", () => {
  const atRoll2 = (over = {}) => {
    const run = start(over);
    decide(run, [], []);
    return run;
  };

  it("is refused before the reveal and after the window closes", () => {
    const fresh = start();
    expect(chooseEra(fresh, { eraStyleId: "1990s" }).code).toBe("INVALID_TRANSITION");
    const run = atRoll2();
    decide(run, [], []);          // now at Roll 3
    expect(chooseEra(run, { eraStyleId: "1990s" }).code).toBe("INVALID_TRANSITION");
  });

  it("accepts a real era at Roll 2 and marks the run custom", () => {
    const run = atRoll2();
    const seedEra = revealEra("syncseed00001");
    const target = CHAOS_ERA_IDS.find((e) => e !== seedEra);
    const r = chooseEra(run, { eraStyleId: target });
    expect(r.ok).toBe(true);
    expect(run.revealedEraStyleId).toBe(target);
    expect(run.seedEraStyleId).toBe(seedEra);
    expect(run.eraCustom).toBe(true);
    const v = view(run);
    expect(v.eraState.custom).toBe(true);
    expect(v.eraState.seedEraStyleId).toBe(seedEra);
  });

  it("refuses an era that does not exist", () => {
    const run = atRoll2();
    expect(chooseEra(run, { eraStyleId: "1930s" }).code).toBe("UNKNOWN_ERA");
    expect(chooseEra(run, { eraStyleId: "" }).code).toBe("UNKNOWN_ERA");
  });

  it("refuses a same-seed challenge run for every tier", () => {
    const run = atRoll2({ competitiveEraLock: true });
    expect(chooseEra(run, { eraStyleId: "1990s" }).code).toBe("ERA_LOCKED_FOR_MODE");
    // And the state the client is shown says so BEFORE it says anything about
    // membership, so nobody is asked to pay for something no tier can do.
    const ctl = eraChangeState(run, { entitled: true, gate: { kind: "MEMBERSHIP" } });
    expect(ctl.allowed).toBe(false);
    expect(ctl.reason).toBe("COMPETITIVE_LOCK");
  });

  it("reports why it is unavailable to an unentitled account", () => {
    const run = atRoll2();
    const ctl = eraChangeState(run, { entitled: false, gate: { kind: "MEMBERSHIP", message: "m" } });
    expect(ctl.allowed).toBe(false);
    expect(ctl.reason).toBe("NOT_ENTITLED");
    expect(ctl.gate.kind).toBe("MEMBERSHIP");
  });

  it("is available to an entitled account at Roll 2 only", () => {
    const run = atRoll2();
    const open = eraChangeState(run, { entitled: true });
    expect(open.allowed).toBe(true);
    expect(open.eras).toEqual([...CHAOS_ERA_IDS]);
    decide(run, [], []);
    expect(eraChangeState(run, { entitled: true }).reason).toBe("WINDOW_CLOSED");
  });

  it("is not offered at all on a sequence 1 run", () => {
    const run = start({ sequence: 1 });
    expect(eraChangeState(run, { entitled: true }).reason).toBe("NOT_SUPPORTED");
  });

  it("travels with a challenge only when it was chosen", () => {
    const rolled = buildManifest({ seedId: "s", createdAt: NOW, originRunId: "r", sequence: 2, eraStyleId: null });
    expect(rolled.eraStyleId).toBeNull();
    const custom = buildManifest({ seedId: "s", createdAt: NOW, originRunId: "r", sequence: 2, eraStyleId: "1990s" });
    expect(custom.eraStyleId).toBe("1990s");
    expect(custom.chaosSequenceVersion).toBe("2.0.0");
  });

  it("plays a pinned era on both sides of the challenge", () => {
    const run = start({ pinnedEraStyleId: "1990s", competitiveEraLock: true });
    decide(run, [], []);
    expect(run.revealedEraStyleId).toBe("1990s");
    expect(run.seedEraStyleId).toBe(revealEra("syncseed00001"));
    expect(run.eraCustom).toBe(true);
  });
});

// ── The pre-reveal ERA ADAPTER slot ─────────────────────────────────────────
describe("era adaptability before the reveal", () => {
  const roster = Object.fromEntries(POSITIONS.map((s, i) => [s, PLAYERS[i]]));

  it("scores a coach who travels above one who peaks in a single era", () => {
    const scored = COACHES.map((c) => ({ c, s: eraAgnosticAdaptabilityScore(c, roster) }));
    const best = scored.reduce((a, b) => (b.s > a.s ? b : a));
    const worst = scored.reduce((a, b) => (b.s < a.s ? b : a));
    expect(best.s).toBeGreaterThan(worst.s);
    // A modern three-point system cannot be the most adaptable when half the
    // eras pay two for a long shot.
    const bestEras = best.c.eras || [];
    expect(bestEras.some((e) => ["1970s", "1980s", "1990s", "2000s"].includes(e))).toBe(true);
  });

  it("falls back to the real era once it is known", () => {
    const c = COACHES[0];
    expect(eraFitScore(c, roster, "1990s")).not.toBe(eraAgnosticAdaptabilityScore(c, roster));
    expect(eraFitScore(c, roster, null)).toBe(eraAgnosticAdaptabilityScore(c, roster));
    expect(eraFitScore(c, roster, "1930s")).toBe(eraAgnosticAdaptabilityScore(c, roster));
  });
});

// ── Draft Pressure is one value, in one place ───────────────────────────────
describe("draft pressure", () => {
  it("appears exactly once in the run view, with words rather than coefficients", () => {
    const run = start();
    const v = view(run);
    const json = JSON.stringify(v);
    expect((json.match(/"draftPressure"/g) || [])).toHaveLength(1);
    expect(v.draftPressure.level).toMatch(/^(LOW|RISING|HIGH)$/);
    expect(v.draftPressure.tooltip).not.toMatch(/\d+(\.\d+)?\s*(coefficient|k=|rarity)/i);
  });
});
