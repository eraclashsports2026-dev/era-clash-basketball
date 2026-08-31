// ── Phase 8A: Chaos Clash server authority ───────────────────────────────────
// Runs against the real /api/game handler with the in-memory store, so these
// exercise the actual persistence, phase validation and ownership paths.
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { _memReset } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import { POSITIONS } from "../src/players.js";
import { setJSON } from "../api/_lib/store.js";
import { buildManifest } from "../src/chaos/challenge.js";

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
const mockReq = ({ body = {}, session = SESSION_A } = {}) => ({
  method: "POST", body, query: {},
  headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${session}` },
});
const call = async (body, session = SESSION_A) => {
  const res = mockRes();
  await gameHandler(mockReq({ body, session }), res);
  return res;
};

// One roll decision under the CURRENT (synchronized) sequence: player holds and
// coach holds travel together.
const roll = (chaosRunId, holdSlots = [], holdRoles = [], session = SESSION_A) =>
  call({ chaosAction: "decide", chaosRunId, holdSlots, holdRoles }, session);

// A challenge minted before the synchronized sequence existed. Seeded straight
// into the store so the legacy path can be driven end to end.
const seedLegacyChallenge = async (seedId = "legacyseed0001") => {
  const m = buildManifest({ seedId, createdAt: Date.now(), originRunId: "legacyrun001", sequence: 1 });
  await setJSON(`chaos-chal:${m.challengeId}`, m, 3600);
  return m.challengeId;
};

beforeAll(() => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1";
  process.env.CHAOS_CLASH_ENABLED = "true";
});
beforeEach(() => _memReset());

/**
 * Drive a run to READY under the synchronized sequence: three rolls that deal
 * players AND coach offers together, then one coach hired from the final three.
 */
const toReady = async (session = SESSION_A) => {
  const start = await call({ chaosAction: "start" }, session);
  const runId = start.body.chaos.chaosRunId;
  await roll(runId, ["PG"], [], session);
  const r3 = await roll(runId, ["PG", "C"], [], session);
  const coachId = r3.body.chaos.coachDraft.offers[0].coachId;
  const ready = await call({ chaosAction: "coach", chaosRunId: runId, coachId }, session);
  return { runId, view: ready.body.chaos };
};

describe("Chaos Clash — server-authoritative draft", () => {
  it("starts a run at Roll 1 with both rosters revealed and the CPU committed", async () => {
    const res = await call({ chaosAction: "start" });
    expect(res.statusCode).toBe(200);
    const v = res.body.chaos;
    expect(v.phase).toBe("ROLL_1_REVEALED");
    expect(v.roll).toBe(1);
    expect(v.totalRolls).toBe(3);
    expect(v.gold.roster.filter(Boolean)).toHaveLength(5);
    expect(v.blue.roster.filter(Boolean)).toHaveLength(5);
    // Committed BEFORE the user's holds are submitted.
    expect(v.cpuDecisionCommit).toBeTruthy();
  });

  it("hides the CPU's holds until the user has locked their own", async () => {
    const res = await call({ chaosAction: "start" });
    expect(res.body.chaos.blue.heldSlots).toEqual([]);
  });

  it("reveals the era after Roll 2 and before the final holds", async () => {
    const start = await call({ chaosAction: "start" });
    expect(start.body.chaos.era).toBeNull();
    const runId = start.body.chaos.chaosRunId;
    const r = await roll(runId, ["PG"]);
    expect(r.body.chaos.roll).toBe(2);
    expect(r.body.chaos.phase).toBe("ROLL_2_REVEALED");
    expect(r.body.chaos.era?.eraId).toBeTruthy();
    // The era stays on screen from here on.
    expect(r.body.chaos.eraContext?.headline).toMatch(/ERA$/);
  });

  it("puts three distinct coach offers on the table with the first five", async () => {
    const { view } = await toReady();
    expect(view.selectedCoaches).toBeTruthy();
    const start = await call({ chaosAction: "start" });
    const draft = start.body.chaos.coachDraft;
    expect(draft.synchronized).toBe(true);
    expect(draft.roll).toBe(1);
    expect(draft.totalRolls).toBe(3);
    expect(draft.offers).toHaveLength(3);
    expect(new Set(draft.offers.map((o) => o.coachId)).size).toBe(3);
    expect(new Set(draft.offers.map((o) => o.role)).size).toBe(3);
    // Three genuinely different systems, not three names.
    expect(new Set(draft.offers.map((o) => o.offense)).size).toBe(3);
    // And no era yet: the offers arrive one roll before the environment does.
    expect(start.body.chaos.eraState.revealed).toBe(false);
  });

  it("holds and burns coaches across the same three rolls, and refuses a fourth", async () => {
    const start = await call({ chaosAction: "start" });
    const runId = start.body.chaos.chaosRunId;
    const first = start.body.chaos.coachDraft.offers;
    const keptRole = first[0].role, keptId = first[0].coachId;
    const dropped = first.slice(1).map((o) => o.coachId);

    const r2 = await roll(runId, [], [keptRole]);
    const second = r2.body.chaos.coachDraft.offers;
    expect(r2.body.chaos.coachDraft.roll).toBe(2);
    expect(second.find((o) => o.role === keptRole).coachId).toBe(keptId);
    // A released coach is burned for the run.
    for (const o of second) expect(dropped).not.toContain(o.coachId);

    const r3 = await roll(runId, [], []);
    expect(r3.body.chaos.coachDraft.selecting).toBe(true);
    expect(r3.body.chaos.phase).toBe("ROLL_3_REVEALED");
    const fourth = await roll(runId, [], []);
    expect(fourth.statusCode).toBe(400);
    // The old player-only and coach-only actions cannot advance this run at all.
    expect((await call({ chaosAction: "holds", chaosRunId: runId, holdSlots: [] })).statusCode).toBe(400);
    expect((await call({ chaosAction: "coachHolds", chaosRunId: runId, holdRoles: [] })).statusCode).toBe(400);
  });

  it("runs exactly three rolls and refuses a fourth", async () => {
    const start = await call({ chaosAction: "start" });
    const runId = start.body.chaos.chaosRunId;
    await roll(runId, []);
    const r2 = await roll(runId, []);
    expect(r2.body.chaos.roll).toBe(3);
    const r3 = await roll(runId, []);
    expect(r3.statusCode).toBe(400);
    // The run is left untouched by the refused transition.
    const after = await call({ chaosAction: "view", chaosRunId: runId });
    expect(after.body.chaos.roll).toBe(3);
    expect(after.body.chaos.phase).toBe("ROLL_3_REVEALED");
  });

  it("refuses a coach that was not offered", async () => {
    const start = await call({ chaosAction: "start" });
    const runId = start.body.chaos.chaosRunId;
    await roll(runId, []);
    const c3 = await roll(runId, []);
    const offered = c3.body.chaos.coachDraft.offers.map((o) => o.coachId);
    const notOffered = ["phil-jackson", "gregg-popovich", "pat-riley", "red-auerbach"].find((id) => !offered.includes(id));
    const bad = await call({ chaosAction: "coach", chaosRunId: runId, coachId: notOffered });
    expect(bad.statusCode).toBe(400);
  });

  it("keeps one user's draft state away from another session", async () => {
    const start = await call({ chaosAction: "start" }, SESSION_A);
    const runId = start.body.chaos.chaosRunId;
    const stolen = await roll(runId, ["PG"], [], SESSION_B);
    expect(stolen.statusCode).toBe(403);
  });

  it("ignores client-supplied player ids, era and coaches at simulate time", async () => {
    const { runId, view } = await toReady();
    const authoritativeGold = view.gold.roster.map((c) => c.id);
    const res = await call({
      chaosAction: "simulate", chaosRunId: runId, simulationId: "s".repeat(20),
      // Every one of these is a spoof attempt and must be discarded.
      goldIds: ["jordan-90s", "lebron-10s", "magic-80s", "bird-80s", "kareem-70s"],
      blueIds: ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"],
      eraStyleId: "2020s", coachGoldId: "phil-jackson", coachBlueId: "phil-jackson",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.goldIds).toEqual(authoritativeGold);
    expect(res.body.result.chaosDraft.mode).toBe("chaos");
  });

  it("stores draft history without any unrevealed future card", async () => {
    const { runId } = await toReady();
    const res = await call({ chaosAction: "simulate", chaosRunId: runId, simulationId: "t".repeat(20) });
    const h = res.body.result.chaosDraft;
    expect(h.rolls).toHaveLength(2);
    expect(h.coachRolls).toHaveLength(2);
    expect(h.challengeId).toMatch(/^[a-z0-9]+$/);
    // The seed is never written to a public record.
    expect(JSON.stringify(h)).not.toContain("seedId");
    expect(h.selectedCoaches.gold).toBeTruthy();
    expect(h.selectedCoaches.blue).toBeTruthy();
  });

  it("refuses to simulate a run that is not READY", async () => {
    const start = await call({ chaosAction: "start" });
    const res = await call({ chaosAction: "simulate", chaosRunId: start.body.chaos.chaosRunId, simulationId: "u".repeat(20) });
    expect(res.statusCode).toBe(400);
  });

  it("never lets a burned person return, and never duplicates a person", async () => {
    const start = await call({ chaosAction: "start" });
    const runId = start.body.chaos.chaosRunId;
    const goldR1 = start.body.chaos.gold.roster.map((c) => c.id);
    // The user rerolls everything. The CPU decides its own holds independently,
    // so blue cards may legitimately persist — only BURNED cards must not.
    const r1 = await roll(runId, []);
    const goldAfter = r1.body.chaos.gold.roster.map((c) => c.id);
    for (const id of goldAfter) expect(goldR1).not.toContain(id);
    const cpuHeld = r1.body.chaos.blue.heldSlots;
    const blueAfter = r1.body.chaos.blue.roster;
    for (const c of blueAfter) {
      if (!cpuHeld.includes(c.slot)) {
        expect(start.body.chaos.blue.roster.map((x) => x.id)).not.toContain(c.id);
      }
    }
    // One canonical person, once, across the whole matchup.
    const names = [...r1.body.chaos.gold.roster, ...blueAfter].map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reproduces the same starting chaos from a challenge id and branches on different decisions", async () => {
    const { runId } = await toReady();
    const ch = await call({ chaosAction: "challenge", chaosRunId: runId });
    const challengeId = ch.body.challengeId;
    expect(challengeId).toBeTruthy();

    const a = await call({ chaosAction: "start", challengeId }, SESSION_B);
    const b = await call({ chaosAction: "start", challengeId }, SESSION_B);
    const idsOf = (v) => v.gold.roster.map((c) => c.id).join(",");
    expect(idsOf(a.body.chaos)).toBe(idsOf(b.body.chaos));

    // Same seed, DIFFERENT decisions → a different but reproducible branch.
    const ra = await roll(a.body.chaos.chaosRunId, ["PG"], [], SESSION_B);
    const rb = await roll(b.body.chaos.chaosRunId, ["SG"], [], SESSION_B);
    expect(idsOf(ra.body.chaos)).not.toBe(idsOf(rb.body.chaos));
  });

  it("never exposes the raw seed to the client", async () => {
    const start = await call({ chaosAction: "start" });
    const body = JSON.stringify(start.body);
    expect(body).not.toContain("seedId");
    expect(body).not.toContain("_cpuHold");
    expect(body).not.toContain("serverSeed");
  });
});

describe("Chaos Clash — entitlements never touch the draft", () => {
  it("gives a guest a bounded number of runs, server-side", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await call({ chaosAction: "start", tier: "GUEST" }, SESSION_A);
      expect(r.statusCode).toBe(200);
    }
    const blocked = await call({ chaosAction: "start", tier: "GUEST" }, SESSION_A);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body.gate.kind).toBe("ACCOUNT");
  });

  it("does not limit a signed-in account", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call({ chaosAction: "start", tier: "FREE" }, SESSION_B);
      expect(r.statusCode).toBe(200);
    }
  });

  it("draws an IDENTICAL roster for every tier from the same seed and decisions", async () => {
    // The strongest fairness statement in the mode: paid access buys modes,
    // never odds. Each tier replays the SAME challenge seed with the SAME
    // decisions and must receive a byte-identical draft path.
    const seedRun = await call({ chaosAction: "start", tier: "FREE" }, SESSION_A);
    const ch = await call({ chaosAction: "challenge", chaosRunId: seedRun.body.chaos.chaosRunId }, SESSION_A);
    const challengeId = ch.body.challengeId;
    expect(challengeId).toBeTruthy();

    const paths = [];
    const tiers = ["GUEST", "FREE", "PLUS", "COMMISSIONER"];
    for (let i = 0; i < tiers.length; i++) {
      // A distinct session per tier, so the guest budget is not shared. The
      // store is NOT reset: the challenge manifest has to survive.
      // Session ids must be hex — a non-hex cookie is rejected and the server
      // mints a fresh session, which would fail the ownership check.
      const s = "0123456789abcdef"[i].repeat(48);
      const start = await call({ chaosAction: "start", tier: tiers[i], challengeId }, s);
      expect(start.statusCode).toBe(200);
      const runId = start.body.chaos.chaosRunId;
      const r1 = await roll(runId, ["PG", "C"], [], s);
      const r2 = await roll(runId, ["PG"], [], s);
      paths.push(JSON.stringify({
        roll1: start.body.chaos.gold.roster.map((c) => c.id),
        roll2: r1.body.chaos.gold.roster.map((c) => c.id),
        roll3: r2.body.chaos.gold.roster.map((c) => c.id),
        cpu: r2.body.chaos.blue.roster.map((c) => c.id),
        era: r2.body.chaos.era?.eraId,
        offers: r2.body.chaos.coachOffers?.map((o) => o.coachId),
      }));
    }
    expect(paths).toHaveLength(4);
    expect(new Set(paths).size).toBe(1);
  });
});
