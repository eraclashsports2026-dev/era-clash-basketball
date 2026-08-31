// ── Phase 8C: navigation, entitlement routing and arena contracts ────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PLAY_MODES, FANTASY_DESTINATIONS, TOP_NAV, MODE_STATUS, STATUS_LABEL,
  resolveModeStatus, resolveModeAction, membershipHref, findMode, defaultMode,
  NAVIGATION_REGISTRY_VERSION,
} from "../src/navigation.js";
import { TIERS, FEATURE_FLAGS, CAPABILITIES } from "../src/entitlements.js";
import { drawFive } from "../src/chaos/draftOdds.js";
import { POSITIONS } from "../src/players.js";
import { startRun, submitHolds, submitRollDecisions, publicView } from "../src/chaos/runState.js";
import { hydrate } from "../api/_lib/chaosRun.js";

const src = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one authoritative registry", () => {
  it("carries every game mode, with Chaos Clash the default", () => {
    expect(NAVIGATION_REGISTRY_VERSION).toBeTruthy();
    const ids = PLAY_MODES.map((m) => m.id);
    for (const want of ["chaos", "dream", "daily", "bo7", "win82", "tournament", "gauntlet"]) {
      expect(ids).toContain(want);
    }
    expect(defaultMode().id).toBe("chaos");
  });

  it("is the only place modes are defined", () => {
    for (const f of ["src/components/arena/ModeShelf.jsx", "src/components/arena/ArenaHeader.jsx"]) {
      expect(src(f)).toMatch(/from "\.\.\/\.\.\/navigation\.js"/);
      expect(src(f), `${f} must not define its own mode list`).not.toMatch(/const\s+(MODES|GAME_MODES|PLAY_MODES)\s*=\s*\[/);
    }
  });

  it("resolves a mode by id or by its info-route slug", () => {
    expect(findMode("gauntlet")?.id).toBe("gauntlet");
    expect(findMode("era-gauntlet")?.id).toBe("gauntlet");
    expect(findMode("nope")).toBeNull();
  });
});

describe("entitlement routing", () => {
  it("opens an available mode", () => {
    expect(resolveModeAction(findMode("chaos"), "GUEST").intent).toBe("OPEN_MODE");
  });

  it("asks a guest for an account rather than money", () => {
    const a = resolveModeAction(findMode("dream"), "GUEST");
    expect(a.status).toBe(MODE_STATUS.ACCOUNT_REQUIRED);
    expect(a.intent).toBe("CREATE_ACCOUNT");
  });

  it("sends a locked paid mode to ONE membership destination with context", () => {
    const a = resolveModeAction(findMode("win82"), "GUEST", { from: "/play" });
    expect(a.intent).toBe("MEMBERSHIP");
    expect(a.href).toContain("/membership?");
    expect(a.href).toContain("feature=win82");
    expect(a.href).toContain("required=plus");
    expect(a.href).toContain("from=");
  });

  it("never routes a coming-soon mode to checkout", () => {
    const a = resolveModeAction(findMode("gauntlet"), "PLUS");
    expect(a.status).toBe(MODE_STATUS.COMING_SOON);
    expect(a.intent).toBe("MODE_INFO");
    expect(a.href).not.toContain("membership");
  });

  it("explains a preview limitation instead of selling past it", () => {
    const a = resolveModeAction(findMode("bo7"), "PLUS", { previewCandidateActive: true });
    expect(a.status).toBe(MODE_STATUS.DISABLED_FOR_PREVIEW);
    expect(a.intent).toBe("EXPLAIN_PREVIEW");
    expect(a.message).toBeTruthy();
  });

  it("gives every status a distinct behaviour", () => {
    const intents = new Set();
    for (const s of Object.keys(MODE_STATUS)) expect(s in STATUS_LABEL).toBe(true);
    for (const [mode, tier, ctx] of [
      [findMode("chaos"), "GUEST", {}], [findMode("dream"), "GUEST", {}],
      [findMode("win82"), "GUEST", {}], [findMode("gauntlet"), "PLUS", {}],
      [findMode("bo7"), "PLUS", { previewCandidateActive: true }],
    ]) intents.add(resolveModeAction(mode, tier, ctx).intent);
    // Five statuses, five genuinely different behaviours: open the mode, ask
    // for an account, route to membership, show the mode's own page, or
    // explain a preview limitation.
    expect(intents.size).toBe(5);
    expect([...intents].sort()).toEqual(["CREATE_ACCOUNT", "EXPLAIN_PREVIEW", "MEMBERSHIP", "MODE_INFO", "OPEN_MODE"]);
  });
});

describe("membership never touches the game", () => {
  it("draws an identical roster for every tier from one seed", () => {
    const paths = TIERS.map(() => JSON.stringify(POSITIONS.map((s) => drawFive({ seedId: "nav-fair", side: "gold", roll: 1 })[s]?.id)));
    expect(new Set(paths).size).toBe(1);
  });

  it("keeps navigation and entitlements out of every draft module", () => {
    for (const f of ["src/chaos/draftOdds.js", "src/chaos/draftValue.js", "src/chaos/legendCpu.js", "src/chaos/coachOffers.js", "src/chaos/runState.js"]) {
      expect(src(f), `${f} must not import navigation or entitlements`).not.toMatch(/from\s+["'].*(entitlements|navigation)/);
    }
  });

  it("shows no price, checkout or trial anywhere", () => {
    const page = src("src/components/arena/InfoPages.jsx");
    for (const banned of [/\$\d/, /checkout/i, /card number/i, /free trial/i, /billing/i]) {
      expect(page).not.toMatch(banned);
    }
    expect(page).toMatch(/does not process payments/i);
  });
});

describe("fantasy is a truthful first-class pillar", () => {
  it("sits in the top nav and not inside Play", () => {
    expect(TOP_NAV.some((t) => t.id === "fantasy" && t.kind === "menu")).toBe(true);
    expect(PLAY_MODES.some((m) => /fantasy/i.test(m.id))).toBe(false);
  });

  it("offers exactly EraClash Fantasy and EraClash Live", () => {
    expect(FANTASY_DESTINATIONS.map((f) => f.id).sort()).toEqual(["eraclash-fantasy", "eraclash-live"]);
    expect(FANTASY_DESTINATIONS.every((f) => f.route.startsWith("/fantasy/"))).toBe(true);
  });

  it("states a real development status and claims nothing operational", () => {
    for (const f of FANTASY_DESTINATIONS) {
      expect(["PLANNED", "IN_DEVELOPMENT", "PRIVATE_PREVIEW", "COMING_SOON"]).toContain(f.status);
      expect(`${f.tagline} ${f.description}`).not.toMatch(/join now|play now|enter now|live now/i);
    }
    const page = src("src/components/arena/InfoPages.jsx");
    expect(page).toMatch(/not live/i);
    expect(page).toMatch(/no contests, entry fees, wallets or payouts/i);
  });
});

describe("the result dock reads real state", () => {
  const dock = readFileSync("src/components/arena/ResultDock.jsx", "utf8");

  it("implements every state it owns and the four tabs", () => {
    // The draft-time reads moved to Live Intel in the Time Arena; the dock is a
    // result surface, and one of its states is the PREVIOUS result.
    for (const s of ["YOUR RESULT WILL APPEAR HERE", "SIMULATING THE CLASH", "FINAL SCORE", "LAST CLASH"]) {
      expect(dock).toContain(s);
    }
    for (const t of ["Game Story", "Box Score", "Coaching", "Analysis"]) expect(dock).toContain(t);
    expect(dock).toMatch(/VIEW FULL REPORT/);
    // A previous result can never read as the draft on screen.
    expect(dock).toContain("LAST CLASH · NOT THE DRAFT ON SCREEN");
  });

  it("shows no win probability and no invented progress figure", () => {
    expect(dock).not.toMatch(/winPct|expectedGoldWinPct|win probability/i);
    expect(dock).not.toMatch(/(progress|simulat\w*)[^\n]{0,30}\d{1,3}\s?%/i);
  });

  it("contains no sample data from the concept mockup", () => {
    for (const banned of [/REED/, /Legend Tier/, /const\s+SAMPLE/, /mockResult/]) {
      expect(dock).not.toMatch(banned);
    }
  });
});

describe("the arena preserves Phase 8B draft behaviour", () => {
  it("still opens empty, rolls three times and locks", () => {
    const r = startRun({ runId: "z".repeat(10), seedId: "arena-1", createdAt: 0 });
    expect(r.currentRoll).toBe(1);
    const hold = (slots) => submitRollDecisions(r, { holdSlots: slots, holdRoles: [], hydrate });
    hold(["PG"]);
    expect(r.currentRoll).toBe(2);
    expect(r.revealedEraStyleId).toBeTruthy();
    hold(["PG"]);
    expect(publicView(r, { hydrate }).rostersLocked).toBe(true);
    expect(hold([]).ok).toBe(false);
  });

  it("keeps the roll strip driven by server state", () => {
    expect(src("src/components/arena/RollStepper.jsx")).toMatch(/run \? run\.roll/);
  });
});

describe("new destinations are gated like every other page", () => {
  it("adds them to the preview middleware matcher", () => {
    const mw = readFileSync("middleware.js", "utf8");
    for (const p of ["/membership", "/fantasy/:path*", "/modes/:path*"]) expect(mw).toContain(p);
  });

  it("adds a SPA rewrite for each, without a new serverless function", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    const sources = v.rewrites.map((r) => r.source);
    for (const p of ["/membership", "/fantasy/:path*", "/modes/:path*"]) expect(sources).toContain(p);
    for (const r of v.rewrites) {
      if (["/membership", "/fantasy/:path*", "/modes/:path*"].includes(r.source)) {
        expect(r.destination).toBe("/index.html");
      }
    }
  });
});

describe("the account header shows real state", () => {
  it("hard-codes no user and no tier", () => {
    const c = src("src/components/arena/AccountControl.jsx");
    expect(c).not.toMatch(/REED/);
    expect(c).not.toMatch(/Legend Tier/);
    expect(c).toMatch(/currentTier\(\)/);
    // The honest description of a device-local account.
    expect(c).toMatch(/saved on this device/i);
  });
});

describe("a chaos-disabled deployment is never a dead end", () => {
  it("gates Dream Matchup only while Chaos Clash is available", () => {
    // Phase 8A put Dream Matchup behind an account gate. On a deployment where
    // Chaos Clash is switched off — production today — Dream Matchup IS the
    // Play experience, so gating it left a signed-out visitor facing a wall
    // with nothing they could open. The gate is now conditional on Chaos being
    // available as the free default.
    const app = readFileSync("src/App.jsx", "utf8");
    expect(app).toMatch(/const dreamMatchupGated = chaosAvailable/);
    expect(app).toMatch(/\) : dreamMatchupGated \? \(/);
    // The derivation must precede its use, or the render throws on a temporal
    // dead zone that the bundler does not catch.
    expect(app.indexOf("const dreamMatchupGated")).toBeLessThan(app.indexOf(") : dreamMatchupGated ? ("));
  });

  it("still offers a guest something playable in every configuration", () => {
    // Chaos on: Chaos Clash is open to guests.
    expect(resolveModeStatus(findMode("chaos"), "GUEST")).toBe(MODE_STATUS.AVAILABLE);
    // Chaos off: the Daily is open to guests too.
    expect(resolveModeStatus(findMode("daily"), "GUEST")).toBe(MODE_STATUS.AVAILABLE);
  });
});
