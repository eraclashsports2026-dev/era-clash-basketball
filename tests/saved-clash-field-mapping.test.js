// ── The saved Clash row reads the fields the stored record really has ────────
// buildSavedClash once read `record.previewCandidate`, `record.pregame.cards`
// and `record.pregame.coachGold` — fields only the browser's view model (or
// nothing at all) carries. Every real save therefore stored no candidate, no
// coaches and nameless rosters, so Run It Back sent no coach and the server
// played both sides with the neutral staff.
//
// The fixture is a REAL Candidate 4 Chaos Clash, captured from the local
// harness (ECLASH_FAKE_CLOUD=1 PREVIEW_SIM_ENGINE_ENABLED=1 VERCEL_ENV=preview
// node scripts/harness.mjs 4178) through GET /api/game?id=, which returns the
// stored record minus its device session.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { buildSavedClash, claimAndSaveResult } from "../api/_lib/cloudAccounts.js";
import { computeResultPreview } from "../api/_lib/previewEngine.js";
import { computeResultV3 } from "../api/_lib/game-core-v3.js";
import { runItBackSetup } from "../src/accounts/careerV2.js";
import { findCard } from "../src/players.js";
import { getCoach } from "../src/v3/coaches.js";

const CAPTURED = JSON.parse(readFileSync("tests/fixtures/saved-clash/candidate4-chaos-record.json", "utf8"));
const SESSION = "s".repeat(48);
const stored = (over = {}) => ({ ...structuredClone(CAPTURED), session: SESSION, ...over });
const build = (record) => buildSavedClash({ record, userId: "u-1", claimedFrom: "signed_in" });

/** The saved_rosters CHECK functions in 0003_career_v2.sql, which "save this five" must pass. */
const rosterSnapshotOk = (s) => Array.isArray(s) && s.length >= 1 && s.length <= 5 && s.every((e) =>
  e && typeof e.id === "string" && e.id.length >= 1 && e.id.length <= 40
  && Object.keys(e).every((k) => ["id", "name", "pos"].includes(k))
  && (e.name == null || (typeof e.name === "string" && e.name.length <= 40))
  && (e.pos == null || (typeof e.pos === "string" && e.pos.length <= 4)));
const coachSnapshotOk = (s) => s && typeof s === "object"
  && Object.keys(s).every((k) => ["id", "name"].includes(k))
  && String(s.id ?? "").length <= 40 && String(s.name ?? "").length <= 40;

const GOLD = ["beal-20s", "mullin-90s", "bowen-2ks", "nance-90s", "bob-mc-70s"];
const BLUE = ["conley-10s", "durant-10s", "bird-80s", "dave-c-70s", "gobert-10s"];

describe("the captured record is what the fix is written against", () => {
  it("is a real Candidate 4 Chaos result, and carries none of the fields the old mapping read", () => {
    expect(CAPTURED.preview).toBe(true);
    expect(CAPTURED.candidate.candidateId).toBe("Candidate 4");
    expect(CAPTURED.chaosDraft).toBeTruthy();
    expect(CAPTURED.coachIds.gold && CAPTURED.coachIds.blue).toBeTruthy();
    expect(CAPTURED.v3.fullBox.gold).toHaveLength(5);
    expect(CAPTURED.previewCandidate).toBeUndefined();
    expect(CAPTURED.pregame.cards).toBeUndefined();
    expect(CAPTURED.pregame.coachGold).toBeUndefined();
    expect(CAPTURED.coachGold).toBeUndefined();
    expect(CAPTURED.session).toBeUndefined();
  });
});

describe("buildSavedClash maps a real Candidate 4 Chaos result", () => {
  const record = stored();
  const row = build(record);

  it("stores the candidate identity from record.candidate", () => {
    expect(row.candidate_id).toBe("Candidate 4");
    expect(row.calibration_version).toBe(record.candidate.possessionCalibrationVersion);
    expect(row.candidate_core_hash).toBe(record.candidate.coreHash);
    expect(row.candidate_core_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores both coaches from record.coachIds, named from the catalog", () => {
    expect(row.gold_coach).toEqual({ id: record.coachIds.gold, name: getCoach(record.coachIds.gold).name });
    expect(row.blue_coach).toEqual({ id: record.coachIds.blue, name: getCoach(record.coachIds.blue).name });
    expect(row.gold_coach).toEqual({ id: "doc-rivers", name: "Doc Rivers" });
    expect(row.blue_coach).toEqual({ id: "gregg-popovich", name: "Gregg Popovich" });
  });

  it("names every player in both fives, in the stored order, from the game's own box score", () => {
    expect(row.gold_roster.map((p) => p.id)).toEqual(record.goldIds);
    expect(row.blue_roster.map((p) => p.id)).toEqual(record.blueIds);
    for (const side of ["gold", "blue"]) {
      const box = new Map(record.v3.fullBox[side].map((l) => [l.id, l]));
      for (const p of row[`${side}_roster`]) {
        expect(p.name, p.id).toBe(box.get(p.id).name);
        expect(p.pos, p.id).toBe(box.get(p.id).pos);
      }
    }
    // The slot actually played, which a Chaos draft can differ from the card's primary position.
    expect(row.gold_roster[0]).toEqual({ id: "beal-20s", name: "Bradley Beal", pos: "PG" });
  });

  it("keeps the snapshot exactly as before: the record without its device session", () => {
    const { session, ...withoutSession } = record;
    expect(row.result_snapshot).toEqual(withoutSession);
    expect(JSON.stringify(row)).not.toContain(SESSION);
  });

  it("keeps the fields that were already right", () => {
    expect(row).toMatchObject({
      result_id: record.id, mode: "chaos", user_side: "gold", era_id: record.eraId,
      gold_score: record.core.finalScore.gold, blue_score: record.core.finalScore.blue,
      outcome: record.core.finalScore.gold > record.core.finalScore.blue ? "win" : "loss",
    });
    expect(row.mvp.name).toBe(record.core.mvp);
  });

  it("Run It Back from the saved row sends the real coaches, era and both fives", () => {
    expect(runItBackSetup(row)).toEqual({
      goldIds: record.goldIds, blueIds: record.blueIds,
      coachGoldId: "doc-rivers", coachBlueId: "gregg-popovich",
      eraStyleId: record.eraId, tag: "chaos",
    });
  });

  it("the saved report and career label name the candidate, not the production engine", () => {
    // The same expression src/App.jsx and MyEraClash.jsx render.
    const label = [row.candidate_id, row.calibration_version].filter(Boolean).join(" · ") || "production engine";
    expect(label).toBe(`Candidate 4 · ${record.candidate.possessionCalibrationVersion}`);
  });

  it("stays inside the saved_rosters snapshot constraints, so 'save this five' still works", () => {
    expect(rosterSnapshotOk(row.gold_roster)).toBe(true);
    expect(rosterSnapshotOk(row.blue_roster)).toBe(true);
    expect(coachSnapshotOk(row.gold_coach)).toBe(true);
    expect(coachSnapshotOk(row.blue_coach)).toBe(true);
  });
});

describe("buildSavedClash tracks the engines' live output, not a frozen copy", () => {
  const gold = GOLD.map(findCard), blue = BLUE.map(findCard);
  // Shaped as api/game.js assembles it: ids, then the computed result spread in.
  const asStored = (computed) => ({ v: 1, id: "pv_live123456", session: SESSION, mode: "single",
    goldIds: GOLD, blueIds: BLUE, ...computed, chaosDraft: null, challengeId: null, created_at: 1 });

  it("a freshly computed preview result maps its candidate and coaches", () => {
    const computed = computeResultPreview("single", gold, blue,
      { coachGoldId: "phil-jackson", coachBlueId: "pat-riley", eraStyleId: "1990s" }, 4242);
    const row = build(asStored(computed));
    expect(row.candidate_id).toBe(computed.candidate.candidateId);
    expect(row.calibration_version).toBe(computed.candidate.possessionCalibrationVersion);
    expect(row.candidate_core_hash).toBe(computed.candidate.coreHash);
    expect(row.gold_coach).toEqual({ id: "phil-jackson", name: getCoach("phil-jackson").name });
    expect(row.blue_coach).toEqual({ id: "pat-riley", name: getCoach("pat-riley").name });
    expect(row.gold_roster.every((p) => p.name && p.pos)).toBe(true);
    expect(row.mode).toBe("single");
  });

  it("a production-engine result has coaches but no candidate, and is labelled as the production engine", () => {
    const computed = computeResultV3("single", gold, blue,
      { coachGoldId: "gregg-popovich", coachBlueId: "phil-jackson", eraStyleId: "2000s" }, 99);
    const row = build({ ...asStored(computed), id: "live123456" });
    expect(computed.candidate).toBeUndefined();
    expect(row.candidate_id).toBe(null);
    expect(row.calibration_version).toBe(null);
    expect(row.candidate_core_hash).toBe(null);
    expect(row.gold_coach).toEqual({ id: "gregg-popovich", name: "Gregg Popovich" });
    expect(row.blue_coach).toEqual({ id: "phil-jackson", name: getCoach("phil-jackson").name });
    expect(row.gold_roster.every((p) => p.name && p.pos)).toBe(true);
  });
});

describe("the edges of the mapping", () => {
  it("the neutral staff is no coach: stored null, so Run It Back defaults to the same staff", () => {
    const row = build(stored({ coachIds: { gold: "neutral", blue: "gregg-popovich" } }));
    expect(row.gold_coach).toBe(null);
    expect(row.blue_coach).toEqual({ id: "gregg-popovich", name: "Gregg Popovich" });
    expect(runItBackSetup(row).coachGoldId).toBe(null);
  });

  it("a coach id the catalog no longer knows keeps its id, without inventing a name", () => {
    expect(build(stored({ coachIds: { gold: "retired-coach", blue: null } })).gold_coach).toEqual({ id: "retired-coach", name: null });
  });

  it("a record with no coachIds (the pre-V3 engine) stores no coaches", () => {
    const { coachIds, ...rest } = stored();
    const row = build(rest);
    expect(row.gold_coach).toBe(null);
    expect(row.blue_coach).toBe(null);
  });

  it("a candidate is read only from a preview result, the same gate the browser applies", () => {
    const row = build(stored({ preview: false }));
    expect(row.candidate_id).toBe(null);
    expect(row.calibration_version).toBe(null);
    expect(row.candidate_core_hash).toBe(null);
  });

  it("without a box score, names come from the catalog, through the alias-aware lookup", () => {
    const { v3, ...rest } = stored();
    const row = build({ ...rest, goldIds: ["luol-70s", ...GOLD.slice(1)] });
    const canonical = findCard("curtis-perry-70s");
    expect(row.gold_roster[0]).toEqual({ id: "luol-70s", name: canonical.name, pos: canonical.pos });
    expect(row.gold_roster.slice(1).map((p) => p.name)).toEqual(GOLD.slice(1).map((id) => findCard(id).name));
  });

  it("an id nobody knows keeps its id, with no name or position", () => {
    const { v3, ...rest } = stored();
    expect(build({ ...rest, goldIds: ["not-a-card", ...GOLD.slice(1)] }).gold_roster[0]).toEqual({ id: "not-a-card", name: null, pos: null });
  });

  it("the fields the old mapping read are ignored, whatever they hold", () => {
    const row = build(stored({
      previewCandidate: { candidateId: "Forged", calibrationVersion: "9.9.9", candidateCoreHash: "f".repeat(64) },
      coachGold: { id: "forged-coach", name: "Forged" },
      pregame: { ...CAPTURED.pregame, cards: [{ id: "beal-20s", name: "Forged", pos: "C" }], coachGold: { id: "forged-coach", name: "Forged" } },
    }));
    expect(row.candidate_id).toBe("Candidate 4");
    expect(row.calibration_version).not.toBe("9.9.9");
    expect(row.gold_coach.id).toBe("doc-rivers");
    expect(row.gold_roster[0].name).toBe("Bradley Beal");
  });
});

describe("through the real save path, into the provider", () => {
  const USER = "11111111-1111-4111-8111-111111111111";
  let fc;
  beforeAll(async () => {
    process.env.ECLASH_TEST_MEMORY_STORE = "1";
    const { installFakeCloud } = await import("../scripts/lib/fakeCloud.mjs");
    fc = installFakeCloud({ users: [{ userId: USER, displayName: "Joseph" }] });
  });

  it("claimAndSaveResult writes a row with the candidate, both coaches and named rosters", async () => {
    const record = stored();
    const out = await claimAndSaveResult({ resultId: record.id, userId: USER, deviceSession: SESSION, claimedFrom: "guest_claim" }, { record });
    expect(out).toMatchObject({ status: "saved", resultId: record.id, mode: "chaos" });
    const row = fc.tables.saved_clashes.find((r) => r.result_id === record.id);
    expect(row).toMatchObject({
      user_id: USER, claimed_from: "guest_claim",
      candidate_id: "Candidate 4", calibration_version: record.candidate.possessionCalibrationVersion, candidate_core_hash: record.candidate.coreHash,
      gold_coach: { id: "doc-rivers", name: "Doc Rivers" }, blue_coach: { id: "gregg-popovich", name: "Gregg Popovich" },
    });
    expect(row.gold_roster.every((p) => p.name && p.pos)).toBe(true);
    expect(row.result_snapshot.session).toBeUndefined();
    expect(runItBackSetup(row)).toMatchObject({ coachGoldId: "doc-rivers", coachBlueId: "gregg-popovich" });
  });
});
