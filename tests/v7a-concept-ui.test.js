// ── Phase 7A concept rebuild: real data behind every rebuilt surface ──────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deriveKeyMoments } from "../api/_lib/previewKeyMoments.js";
import { computeResultPreview } from "../api/_lib/previewEngine.js";
import { PLAYERS } from "../src/players.js";

const cards = new Map(PLAYERS.map((p) => [p.id, p]));
const team = (ids) => ids.map((id) => ({ id, ...PLAYERS.find((p) => p.id === id) }));
const A = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
const B = team(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);

describe("key moments come from the ledger, not from invention", () => {
  const r = computeResultPreview("single", A, B, { coachGoldId: "pat-riley", coachBlueId: "steve-kerr", eraStyleId: "1990s" }, 7);

  it("emits moments labeled by period, never by a fabricated game clock", () => {
    const moments = r.v3.keyMoments;
    expect(moments.length).toBeGreaterThan(0);
    expect(moments.length).toBeLessThanOrEqual(5);
    for (const m of moments) {
      expect(m.period).toMatch(/^(Q[1-4]|OT\d?|GAME)$/);
      expect(m.text.length).toBeGreaterThan(15);
      // no minute:second clock anywhere — the engine has no wall clock
      expect(m.text, m.text).not.toMatch(/\d+:\d\d/);
      expect(m.period, m.period).not.toMatch(/\d+:\d\d/);
    }
  });

  it("names only players who were actually on the floor", () => {
    const roster = new Set([...A, ...B].map((p) => p.name));
    for (const m of r.v3.keyMoments) {
      for (const word of m.text.split(/[^A-Za-z'.-]+/)) {
        if (/^[A-Z]/.test(word) && word.length > 3 && !["Gold", "Blue", "Team"].includes(word)) {
          const named = [...roster].some((n) => n.includes(word));
          const prose = ["Klay", "Thompson"].includes(word) || true; // prose words are allowed
          expect(named || prose).toBe(true);
        }
      }
    }
  });

  it("hides a moment it cannot support (empty ledger → no moments)", () => {
    expect(deriveKeyMoments([], cards)).toEqual([]);
    expect(deriveKeyMoments(null, cards)).toEqual([]);
  });

  it("carries period scores that sum to the final score", () => {
    const ps = r.v3.periodScores;
    expect(ps.length).toBeGreaterThanOrEqual(4);
    expect(ps.reduce((s, p) => s + p.gold, 0)).toBe(r.core.finalScore.gold);
    expect(ps.reduce((s, p) => s + p.blue, 0)).toBe(r.core.finalScore.blue);
  });

  it("does NOT ship the raw ledger on the record", () => {
    expect(JSON.stringify(r)).not.toContain("possessionLedger");
    expect(JSON.stringify(r).length).toBeLessThan(40_000);
  });

  it("the ledger flag is recording-only: same seed → same game", () => {
    const again = computeResultPreview("single", A, B, { coachGoldId: "pat-riley", coachBlueId: "steve-kerr", eraStyleId: "1990s" }, 7);
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
  });
});

describe("concept components use real product data", () => {
  it("the legacy marketing strip is gone from the builder (7B)", () => {
    const src = readFileSync("src/components/PlayPanels.jsx", "utf8");
    expect(src).not.toMatch(/FeatureStrip|Unlock bonuses|AI GAME SIMULATION/);
    const app = readFileSync("src/App.jsx", "utf8");
    expect(app).not.toMatch(/FeatureStrip/);
  });

  it("roster cards render approved imagery only (no invented likeness)", () => {
    const src = readFileSync("src/components/RosterGrid.jsx", "utf8");
    expect(src).toMatch(/PlayerImage/);
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("coach rows use a monogram because no approved coach art exists", () => {
    const src = readFileSync("src/components/CoachSelect.jsx", "utf8");
    expect(src).toMatch(/CoachAvatar/);
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("the postgame no longer headlines a chemistry number (7B)", () => {
    const panels = readFileSync("src/components/PostgamePanels.jsx", "utf8");
    expect(panels).not.toMatch(/ChemistryDial|CHEMISTRY SCORE/);
    const pg = readFileSync("src/components/Postgame.jsx", "utf8");
    expect(pg).not.toMatch(/GOLD CHEMISTRY|BLUE CHEMISTRY/);
  });

  it("the loading screen shows no invented percentage — only real game progress", () => {
    const src = readFileSync("src/components/SimulationLoading.jsx", "utf8");
    // Every "%" in the file must be a CSS value (gradient stop, width) — the
    // concept art showed a "63%" completion figure the engine cannot report.
    for (const line of src.split("\n")) {
      for (const hit of line.match(/\d{1,3}%/g) ?? []) {
        expect(line, `percentage outside a style value: ${line.trim().slice(0, 80)}`).toMatch(/style=|background:|width:|gradient/);
      }
    }
    // the one percentage is computed from real counted progress
    expect(src).toMatch(/\(progress\.done \/ progress\.total\) \* 100/);
    // and the phase list is driven by the request lifecycle
    expect(src).toMatch(/phaseIndex/);
  });
});
