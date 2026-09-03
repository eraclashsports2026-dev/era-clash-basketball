// ── Phase 7B — UI truth, theme and contract tests ────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { T } from "../src/theme.js";
import { buildPregameRead, PREGAME_SNAPSHOT_VERSION } from "../api/_lib/pregameRead.js";
import { buildEvidencePacket, validateNarrativeClaims } from "../api/_lib/narrativeEvidence.js";
import { deriveCoaching } from "../api/_lib/previewCoaching.js";
import { computeResultPreview } from "../api/_lib/previewEngine.js";
import { resolveCoach, resolveEra } from "../src/v3/engine.js";
import { PLAYERS } from "../src/players.js";

const team = (ids) => ids.map((id) => ({ id, ...PLAYERS.find((p) => p.id === id) }));
const A = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
const B = team(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);
const srcFiles = () => readdirSync("src/components").filter((f) => f.endsWith(".jsx"))
  .map((f) => [`src/components/${f}`, readFileSync(`src/components/${f}`, "utf8")])
  .concat([["src/App.jsx", readFileSync("src/App.jsx", "utf8")]]);

describe("hybrid theme", () => {
  it("the page is warm light and the arena is navy", () => {
    // page/card surfaces are light, ink is dark — the inverse of the old shell
    // Phase 9A.1 made every T token a CSS-variable reference whose FALLBACK is
    // the value it always had — `var(--ec-t-bg, #f2efe8)` — so the default
    // product is unchanged. This contract reads that fallback.
    const hexOf = (v) => (String(v).match(/#[0-9a-fA-F]{6}/) || [v])[0];
    const lum = (v) => { const n = parseInt(hexOf(v).slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
    expect(lum(T.bg), "page background is light").toBeGreaterThan(0.8);
    expect(lum(T.bgCard), "cards are light").toBeGreaterThan(0.9);
    expect(lum(T.text), "ink is dark").toBeLessThan(0.25);
    expect(lum(T.arena), "the arena stays dark").toBeLessThan(0.2);
    expect(lum(T.onArena), "arena ink is light").toBeGreaterThan(0.85);
  });

  it("body text is at least 15px and the arena inset exists", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/font-size:\s*16px/);
    expect(css).toMatch(/\.ec-arena-inset/);
    expect(css).toMatch(/--ec-page:\s*#f2efe8/i);
  });

  it("no component still paints the old near-black shell", () => {
    for (const [f, s] of srcFiles()) {
      expect(s, `${f} still uses an opaque black overlay`).not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\.[3-9]/);
      expect(s, `${f} still uses the old gold literal`).not.toMatch(/#fdb927/);
    }
  });
});

describe("UI truth", () => {
  it("no legacy chemistry-as-engine copy anywhere in the UI", () => {
    for (const [f, s] of srcFiles()) {
      expect(s, f).not.toMatch(/unlock bonuses/i);
      expect(s, f).not.toMatch(/Smart Rating System/i);
      expect(s, f).not.toMatch(/AI Game Simulation/i);
      expect(s, f).not.toMatch(/ratings, chemistry & matchups/i);
      expect(s, f).not.toMatch(/PROVE IT WASN'T LUCK/i);
    }
  });

  it("roster panels show construction, not a chemistry score", () => {
    const rb = readFileSync("src/components/RosterBalance.jsx", "utf8");
    expect(rb).toMatch(/ROSTER BALANCE/);
    expect(rb).toMatch(/does not decide the game/);
    const app = readFileSync("src/App.jsx", "utf8");
    expect(app).not.toMatch(/ChemistryMeter/);
    expect(app).not.toMatch(/RATING <b/);
  });

  it("the box score has one source of truth and no PF column", () => {
    const pg = readFileSync("src/components/Postgame.jsx", "utf8");
    expect(pg).toMatch(/AuthoritativeBox/);
    expect(pg).not.toMatch(/POSSESSION BOX SCORE|FULL BOX SCORE/);
    const cols = pg.slice(pg.indexOf("BOX_COLUMNS = ["), pg.indexOf("];", pg.indexOf("BOX_COLUMNS = [")));
    expect(cols).toMatch(/"OREB"/); expect(cols).toMatch(/"TO"/);
    expect(cols, "PF has no foul-out or rotation consequence to justify it").not.toMatch(/"PF"/);
  });

  it("the postgame renders the stored read, never raw numeric edges", () => {
    const pg = readFileSync("src/components/Postgame.jsx", "utf8");
    expect(pg).toMatch(/StoredPregameRead/);
    expect(pg).not.toMatch(/EdgeBars/);
    expect(pg).not.toMatch(/\+\$\{Math\.abs\(e\.edge\)\}/);
  });

  it("era fit is gated behind an actual era selection", () => {
    const modal = readFileSync("src/components/CoachModal.jsx", "utf8");
    expect(modal).toMatch(/eraStyleId && rec\?\.eraFit/);
    const app = readFileSync("src/App.jsx", "utf8");
    expect(app).toMatch(/eraStyleId=\{eraLocked \? eraStyle : undefined\}/);
  });
});

describe("the one pregame read", () => {
  const read = buildPregameRead(A, B, resolveCoach("pat-riley"), resolveCoach("steve-kerr"), resolveEra("1990s"));

  it("is qualitative only — no numbers escape", () => {
    expect(read.pregameSnapshotVersion).toBe(PREGAME_SNAPSHOT_VERSION);
    for (const e of read.qualitativeEdges) {
      expect(e.label).toMatch(/^(Even|Gold Edge|Blue Edge|Strong Gold Edge|Strong Blue Edge)$/);
      expect(JSON.stringify(e)).not.toMatch(/[+-]?\d+(\.\d+)?(?=[,}])/);
    }
    expect(read.confidence).toMatch(/^(clear|mixed|close)$/);
  });

  it("is deterministic for the same inputs, so stored and displayed agree", () => {
    const again = buildPregameRead(A, B, resolveCoach("pat-riley"), resolveCoach("steve-kerr"), resolveEra("1990s"));
    expect(JSON.stringify(again)).toBe(JSON.stringify(read));
  });

  it("is stored on the result by the game route", () => {
    const game = readFileSync("api/game.js", "utf8");
    expect(game).toMatch(/pregame: pregameSnapshot/);
    expect(game).toMatch(/buildPregameRead\(gold, blue/);
  });
});

describe("narrative evidence and claim validation", () => {
  const result = { core: { winner: "Gold", finalScore: { gold: 110, blue: 101 }, seriesResult: "110-101", mvp: "Magic Johnson" },
    v3: { fullBox: { gold: [{ name: "Magic Johnson", pts: 30, oreb: 1, dreb: 5, ast: 9, to: 2 }],
                     blue: [{ name: "Michael Jordan", pts: 28, oreb: 0, dreb: 4, ast: 3, to: 3 }] }, possessions: 99 } };
  const packet = buildEvidencePacket(result);

  it("classifies margin honestly", () => {
    expect(packet.derived.margin).toBe(9);
    expect(packet.derived.marginBand).toBe("comfortable");
  });

  it("accepts a recap that matches the result", () => {
    expect(validateNarrativeClaims({ summary: "Team Gold won 110-101 behind Magic Johnson's 30 points." }, packet).ok).toBe(true);
  });

  it("rejects winner, score, margin, stat and inferred-cause contradictions", () => {
    const bad = [
      "Team Blue took the win in a tight one.",
      "Gold cruised 120-90.",
      "Gold was never in doubt, a wire-to-wire blowout.",
      "Magic Johnson poured in 41 points.",
      "Blue looked gassed and lost confidence late.",
    ];
    for (const summary of bad) {
      const r = validateNarrativeClaims({ summary }, packet);
      expect(r.ok, `should have been rejected: ${summary}`).toBe(false);
      expect(r.violations.length).toBeGreaterThan(0);
    }
  });

  it("requires a side for a person on both rosters", () => {
    const dup = { core: { winner: "Gold", finalScore: { gold: 100, blue: 99 }, mvp: "Michael Jordan" },
      v3: { fullBox: { gold: [{ name: "Michael Jordan", pts: 30, oreb: 0, dreb: 3, ast: 4, to: 1 }],
                       blue: [{ name: "Michael Jordan", pts: 28, oreb: 0, dreb: 3, ast: 4, to: 1 }] } } };
    const dp = buildEvidencePacket(dup);
    expect(dp.duplicatePeople).toEqual(["Michael Jordan"]);
    expect(validateNarrativeClaims({ summary: "Michael Jordan controlled the fourth." }, dp).ok).toBe(false);
    expect(validateNarrativeClaims({ summary: "Gold's Michael Jordan controlled the fourth." }, dp).ok).toBe(true);
    expect(validateNarrativeClaims({ summary: "Gold’s Michael Jordan controlled the fourth." }, dp).ok).toBe(true);
  });

  it("is wired into the generator, which rejects rather than caveats", () => {
    const ai = readFileSync("api/_lib/ai.js", "utf8");
    expect(ai).toMatch(/validateNarrativeClaims/);
    expect(ai).toMatch(/MODEL_CONTRADICTED_RESULT/);
    expect(ai).toMatch(/EVIDENCE RULE/);
  });
});

describe("coaching detail and moments", () => {
  const r = computeResultPreview("single", A, B, { coachGoldId: "pat-riley", coachBlueId: "steve-kerr", eraStyleId: "1990s" }, 7);

  it("records the real plan, scheme and adjustments", () => {
    const c = r.v3.coaching.gold;
    expect(c.coach).toBe("Pat Riley");
    expect(c.openingPlan.actions.length).toBeGreaterThan(0);
    expect(c.defense.shell).toBeTruthy();
    expect(Array.isArray(c.adjustments)).toBe(true);
    for (const a of c.adjustments) {
      expect(a.trigger).toBeTruthy();
      expect(a.response).toBeTruthy();
      expect(a.possession).toBeGreaterThan(0);
    }
  });

  it("qualifies a person who appears on both rosters", () => {
    const dupA = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
    const dupB = team(["curry-10s", "jordan-90s", "lebron-10s", "durant-10s", "shaq-90s"]);
    const d = computeResultPreview("single", dupA, dupB, { coachGoldId: "pat-riley", coachBlueId: "pat-riley", eraStyleId: "2010s" }, 11);
    expect(d.v3.coaching.duplicatePeople).toContain("Michael Jordan");
    const refs = [...d.v3.coaching.gold.attackedMatchups, ...d.v3.coaching.blue.attackedMatchups];
    for (const m of refs) {
      for (const who of [m.scorer, m.defender]) {
        if (who.includes("Michael Jordan")) expect(who, who).toMatch(/^(Gold|Blue)'s Michael Jordan$/);
      }
    }
  });

  it("keeps discrete moments and game-long patterns apart", () => {
    for (const m of r.v3.keyMoments) {
      expect(m.period, "a moment always has a period").toMatch(/^(Q[1-4]|OT\d?)$/);
      expect(m.text, "a moment is not a count over the whole game").not.toMatch(/\d+ times for \d+ points/);
    }
    for (const p of r.v3.matchupPatterns) {
      expect(p.period, "a pattern has no single period").toBeUndefined();
    }
  });
});
