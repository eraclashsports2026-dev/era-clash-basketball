// ── Phase 9A: the Play Lobby contract, the route model and activation telemetry ─
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  PLAY_MODES, MODE_CATEGORY, MODE_STATUS, STATUS_LABEL, ACTION_LABEL, PLAY_LOBBY_ROUTE,
  lobbyModes, modeForRoute, isLobbyRoute, isPlayRoute, routeForAppMode, requiresAccount,
  resolveModeAction, resolveModeStatus, findMode, defaultMode, NAVIGATION_REGISTRY_VERSION, TOP_NAV,
} from "../src/navigation.js";
import { TIERS, TRIAL_CAPABILITY, MATRIX, CAPABILITIES } from "../src/entitlements.js";
import { ACTIVATION_EVENTS, bucketMs } from "../src/activation.js";

const read = (f) => readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one registry, extended for the lobby", () => {
  it("bumped its version for the route model", () => {
    expect(NAVIGATION_REGISTRY_VERSION).toBe("1.2.0");
  });
  it("gives every mode a route, a category, one sentence and an implementation note", () => {
    for (const m of PLAY_MODES) {
      expect(m.route, m.id).toMatch(/^\/play\/[a-z0-9-]+$/);
      expect([MODE_CATEGORY.PRIMARY, MODE_CATEGORY.SECONDARY], m.id).toContain(m.category);
      expect(m.shortDescription, m.id).toBeTruthy();
      expect(m.shortDescription.split(/[.!?]/).filter((s) => s.trim()).length, `${m.id} carries one sentence`).toBeLessThanOrEqual(3);
      expect(m.implementationNote, m.id).toBeTruthy();
      expect(typeof m.recommended).toBe("boolean");
      expect(typeof m.continuationSupport).toBe("boolean");
    }
  });
  it("routes are unique and never collide with the lobby", () => {
    const routes = PLAY_MODES.map((m) => m.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).not.toContain(PLAY_LOBBY_ROUTE);
  });
  it("the lobby leads with Chaos Clash, Dream Matchup and Daily Clash, in that order", () => {
    const { primary, secondary } = lobbyModes();
    expect(primary.map((m) => m.id)).toEqual(["chaos", "dream", "daily"]);
    expect(secondary.map((m) => m.id)).toEqual(["bo7", "win82", "tournament", "gauntlet"]);
    expect(primary.length + secondary.length).toBe(PLAY_MODES.length);
  });
  it("Chaos Clash is the one recommended mode, the default, and the one with continuation", () => {
    const rec = PLAY_MODES.filter((m) => m.recommended);
    expect(rec.map((m) => m.id)).toEqual(["chaos"]);
    expect(defaultMode().id).toBe("chaos");
    expect(PLAY_MODES.filter((m) => m.continuationSupport).map((m) => m.id)).toEqual(["chaos"]);
  });
  it("carries the lobby copy the specification names", () => {
    expect(findMode("chaos").shortDescription).toBe("Three rolls. Hold your legends. Adapt to the era.");
    expect(findMode("dream").shortDescription).toBe("Build any historical matchup.");
    expect(findMode("daily").shortDescription).toBe("One shared challenge for everyone.");
  });
  it("Fantasy stays a top-level pillar and never a play mode", () => {
    expect(TOP_NAV.find((t) => t.id === "fantasy")?.kind).toBe("menu");
    expect(PLAY_MODES.some((m) => /fantasy/i.test(`${m.id} ${m.label}`))).toBe(false);
  });
});

describe("no duplicated mode definitions", () => {
  it("entitlements no longer carries a mode list; its trial pairing agrees with the registry", () => {
    expect(src("src/entitlements.js")).not.toMatch(/export const MODES\s*=/);
    for (const m of PLAY_MODES.filter((x) => x.trialCapability)) {
      expect(TRIAL_CAPABILITY[m.capability]?.trial, m.id).toBe(m.trialCapability);
      expect(TRIAL_CAPABILITY[m.capability]?.label, m.id).toBe(m.label);
    }
    for (const cap of Object.keys(TRIAL_CAPABILITY)) {
      expect(PLAY_MODES.some((m) => m.capability === cap && m.trialCapability === TRIAL_CAPABILITY[cap].trial), cap).toBe(true);
    }
  });
  it("App.jsx reads mode presentation from the registry, not its own list", () => {
    const app = src("src/App.jsx");
    expect(app).not.toMatch(/const\s+GAME_MODES\s*=\s*\[/);
    expect(app).not.toMatch(/const\s+MODE_ICON\s*=/);
    expect(app).toMatch(/PLAY_MODES\.find\(\(m\) => m\.appMode === appMode\)/);
  });
  it("the lobby and the header both read the registry, and neither defines a mode", () => {
    for (const f of ["src/components/lobby/PlayLobby.jsx", "src/components/arena/ArenaHeader.jsx"]) {
      expect(src(f), f).toMatch(/navigation\.js"/);
      expect(src(f), f).not.toMatch(/const\s+(MODES|GAME_MODES|PLAY_MODES)\s*=\s*\[/);
    }
    expect(src("src/components/lobby/PlayLobby.jsx")).toMatch(/lobbyModes\(\)/);
  });
});

describe("truthful statuses", () => {
  it("every status has a label decision and an action word", () => {
    for (const s of Object.keys(MODE_STATUS)) {
      expect(s in STATUS_LABEL, s).toBe(true);
      expect(ACTION_LABEL[s], s).toBeTruthy();
    }
  });
  it("Coming Soon never routes to checkout, from any tier", () => {
    for (const tier of TIERS) {
      const a = resolveModeAction(findMode("gauntlet"), tier, { from: PLAY_LOBBY_ROUTE });
      expect(a.status).toBe(MODE_STATUS.COMING_SOON);
      expect(a.intent).toBe("MODE_INFO");
      expect(a.href).not.toMatch(/membership|checkout/);
    }
  });
  it("a deployment with Chaos off says so, without selling anything", () => {
    const a = resolveModeAction(findMode("chaos"), "FREE", { chaosAvailable: false });
    expect(a.status).toBe(MODE_STATUS.UNAVAILABLE_HERE);
    expect(a.intent).toBe("MODE_INFO");
    expect(STATUS_LABEL.UNAVAILABLE_HERE).toBe("Not available here");
    expect(resolveModeStatus(findMode("dream"), "FREE", { chaosAvailable: false })).toBe(MODE_STATUS.AVAILABLE);
  });
  it("a guest sees the account requirement as a fact, with the mode's own route as the link", () => {
    const a = resolveModeAction(findMode("dream"), "GUEST", { from: PLAY_LOBBY_ROUTE });
    expect(a.status).toBe(MODE_STATUS.ACCOUNT_REQUIRED);
    expect(a.intent).toBe("CREATE_ACCOUNT");
    expect(a.href).toBe("/play/dream");
    expect(requiresAccount(findMode("dream"))).toBe(true);
    expect(requiresAccount(findMode("chaos"))).toBe(false);
    expect(requiresAccount(findMode("daily"))).toBe(false);
  });
  it("every available mode links to its own route", () => {
    for (const m of PLAY_MODES) {
      const a = resolveModeAction(m, "PLUS", { from: PLAY_LOBBY_ROUTE });
      if (a.status === MODE_STATUS.AVAILABLE) expect(a.href, m.id).toBe(m.route);
    }
  });
});

describe("the route model", () => {
  it("`/` and `/play` are the lobby; nothing else is", () => {
    expect(isLobbyRoute("/")).toBe(true);
    expect(isLobbyRoute("/play")).toBe(true);
    expect(isLobbyRoute("/play/")).toBe(true);
    expect(isLobbyRoute("/play/chaos")).toBe(false);
    expect(isLobbyRoute("/membership")).toBe(false);
  });
  it("resolves every mode route and rejects strangers", () => {
    for (const m of PLAY_MODES) expect(modeForRoute(m.route)?.id, m.route).toBe(m.id);
    expect(modeForRoute("/play")).toBeNull();
    expect(modeForRoute("/play/nope")).toBeNull();
    expect(modeForRoute("/")).toBeNull();
    expect(isPlayRoute("/play/win-82")).toBe(true);
    expect(isPlayRoute("/fantasy/live")).toBe(false);
  });
  it("maps App-level mode names to their routes", () => {
    expect(routeForAppMode("Chaos")).toBe("/play/chaos");
    expect(routeForAppMode("Single")).toBe("/play/dream");
    expect(routeForAppMode("Best7")).toBe("/play/best-of-7");
    expect(routeForAppMode("Win82")).toBe("/play/win-82");
    expect(routeForAppMode("Tournament")).toBe("/play/tournament");
    expect(routeForAppMode("Nope")).toBeNull();
  });
  it("finds a mode by its route slug too", () => {
    expect(findMode("best-of-7")?.id).toBe("bo7");
    expect(findMode("win-82")?.id).toBe("win82");
  });
  it("the deployment rewrites and the access gate both cover the play routes", () => {
    const vercel = JSON.parse(read("vercel.json"));
    const sources = vercel.rewrites.map((r) => r.source);
    expect(sources).toContain("/play");
    expect(sources).toContain("/play/:path*");
    const mw = read("middleware.js");
    expect(mw).toMatch(/"\/play",\s*"\/play\/:path\*"/);
    // No new serverless function: the play routes are SPA rewrites to index.html.
    for (const r of vercel.rewrites.filter((x) => x.source.startsWith("/play"))) expect(r.destination).toBe("/index.html");
  });
  it("the App never starts a Chaos run from a route or the lobby", () => {
    const app = src("src/App.jsx");
    const lobby = src("src/components/lobby/PlayLobby.jsx");
    // startChaos is called from the stage's ROLL 1 button and nowhere else.
    expect(app).not.toMatch(/startChaos/);
    expect(lobby).not.toMatch(/startChaos/);
    expect(lobby).toMatch(/viewChaos/); // a READ of a remembered run is the only game call
    expect(lobby).toMatch(/abandonChaos/);
  });
  it("a game-opening link on the entrance bypasses the lobby", () => {
    const app = src("src/App.jsx");
    expect(app).toMatch(/q\.get\("chaos"\)\) p = "\/play\/chaos"/);
    expect(app).toMatch(/q\.get\("scenario"\)\) p = "\/play\/dream"/);
  });
});

describe("activation telemetry", () => {
  it("every activation event is allowlisted by the server, and every 9A allowlist entry is declared", () => {
    const events = read("api/events.js");
    for (const e of ACTIVATION_EVENTS) expect(events, e).toMatch(new RegExp(`"${e}"`));
    const block = events.slice(events.indexOf("Phase 9A activation"), events.indexOf("]);", events.indexOf("Phase 9A activation")));
    const listed = [...block.matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...ACTIVATION_EVENTS].sort());
  });
  it("names the events the specification asks for", () => {
    for (const e of [
      "play_lobby_viewed", "play_mode_selected", "active_run_continue_clicked", "active_run_abandon_started",
      "active_run_abandoned", "account_gate_shown", "membership_gate_shown", "dream_player_selected",
      "eligible_position_choice_shown", "dream_player_placed", "dream_player_auto_placed",
      "dream_player_swap_completed", "time_to_first_roll_recorded",
    ]) expect(ACTIVATION_EVENTS).toContain(e);
  });
  it("every event is actually tracked somewhere in the client", () => {
    const client = ["src/App.jsx", "src/activation.js", "src/components/lobby/PlayLobby.jsx", "src/components/arena/ChaosStage.jsx"]
      .map(src).join("\n");
    for (const e of ACTIVATION_EVENTS) expect(client, e).toMatch(new RegExp(`"${e}"`));
  });
  it("sends no PII, key, cookie, token, IP or free text", () => {
    // The App slice is cut on its section comments, so it is read raw.
    const files = ["src/activation.js", "src/components/lobby/PlayLobby.jsx"].map(src).join("\n")
      + read("src/App.jsx").split("Placement (Phase 9A)")[1].split("Draft: Manual + Random")[0];
    expect(files).not.toMatch(/email|accessKey|access_key|cookie|token|clientIp|\bip\b|searchText|query:\s*q\b/i);
  });
  it("buckets first-roll timings coarsely", () => {
    expect(bucketMs(3_000)).toBe("<10s");
    expect(bucketMs(20_000)).toBe("10-30s");
    expect(bucketMs(45_000)).toBe("30-60s");
    expect(bucketMs(120_000)).toBe("1-3m");
    expect(bucketMs(400_000)).toBe(">3m");
  });
});

describe("the lobby's own assets are ours", () => {
  it("uses the EraClash Mk1 logo from the repository, and no competitor asset", () => {
    expect(existsSync("public/brand/eraclash-logo-mk1.png")).toBe(true);
    const lobby = read("src/components/lobby/PlayLobby.jsx");
    expect(lobby).toMatch(/\/brand\/eraclash-logo-mk1\.png/);
    for (const f of ["src/components/lobby/PlayLobby.jsx", "src/components/lobby/ModeGlyph.jsx", "src/components/lobby/ContinueCard.jsx", "src/index.css"]) {
      expect(read(f), f).not.toMatch(/82-0|82_0|Competition Screenshots|vaulty/i);
    }
  });
  it("no dominant orange CTA system: the lobby's primary action is EraClash gold", () => {
    const css = read("src/index.css").slice(read("src/index.css").indexOf("PHASE 9A — THE PLAY LOBBY"));
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="primary"\][\s\S]{0,200}var\(--ec-a-gold\)/);
    expect(css).not.toMatch(/#f{2}[6-9a][0-9a-f]00|orange/i);
  });
  it("no casino or gambling language reaches a card", () => {
    // User-facing copy only: label, sentence, tagline, and the rendered JSX
    // strings of the lobby components (comments stripped). Implementation notes
    // are operator documentation and are not rendered.
    const copy = PLAY_MODES.map((m) => `${m.label} ${m.shortDescription} ${m.tagline}`).join(" ")
      + src("src/components/lobby/PlayLobby.jsx") + src("src/components/lobby/ContinueCard.jsx");
    expect(copy).not.toMatch(/\b(spin|spins|jackpot|bet|bets|wager|casino|slot machine|free trial|checkout|\$\d)\b/i);
  });
});
