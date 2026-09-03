#!/usr/bin/env node
// ── Phase 9A QA: Play Lobby, registry, active run, disclosure, placement,
//    telemetry, responsive, accessibility ──────────────────────────────────────
//   node scripts/ui/phase9aQa.mjs <lobby|registry|active-run|disclosure|multi-position|telemetry|contracts>
//   node scripts/ui/phase9aQa.mjs <responsive|accessibility> [baseUrl]   (browser, default http://localhost:4176)
//
// Contract modes read source and registries: the things that must be true
// before a pixel renders. The browser modes measure the built app — they need
// `vite preview` on 4176 (the lobby and the Dream Matchup builder are static
// surfaces; neither needs the API). e2e/phase9a-play-lobby.spec.js proves the
// live flows against the real handlers.
import fs from "node:fs";
import {
  PLAY_MODES, MODE_CATEGORY, MODE_STATUS, STATUS_LABEL, ACTION_LABEL, TOP_NAV, PLAY_LOBBY_ROUTE,
  lobbyModes, resolveModeAction, modeForRoute, isLobbyRoute, requiresAccount, findMode, NAVIGATION_REGISTRY_VERSION,
} from "../../src/navigation.js";
import { TIERS, TRIAL_CAPABILITY, GUEST_CHAOS_RUNS } from "../../src/entitlements.js";
import { ACTIVATION_EVENTS } from "../../src/activation.js";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import {
  eligiblePositions, placementPlan, place, isLegalLineup, describeSelection, SLOT_STATE, PLACEMENT_MODE, PLACEMENT_VERSION,
} from "../../src/lineupPlacement.js";

const MODE = process.argv[2] || "lobby";
const BASE = (process.argv[3] || "http://localhost:4176").replace(/\/$/, "");
const OUT = "data/validation/9a";
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: !!p, detail: String(d) }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const read = (f) => fs.readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const extra = {};

// ── Registry ─────────────────────────────────────────────────────────────────
if (MODE === "registry") {
  ok("registry version carries the route model", NAVIGATION_REGISTRY_VERSION === "1.1.0", NAVIGATION_REGISTRY_VERSION);
  ok("seven modes, each with id, label, route, category, one sentence, status inputs",
    PLAY_MODES.length === 7 && PLAY_MODES.every((m) => m.id && m.label && /^\/play\//.test(m.route) && m.category && m.shortDescription && "capability" in m));
  ok("mode ids are unique", new Set(PLAY_MODES.map((m) => m.id)).size === PLAY_MODES.length);
  ok("mode routes are unique and not the lobby", new Set(PLAY_MODES.map((m) => m.route)).size === PLAY_MODES.length && !PLAY_MODES.some((m) => m.route === PLAY_LOBBY_ROUTE));
  ok("Chaos Clash, Dream Matchup, Daily Clash are primary, in order",
    lobbyModes().primary.map((m) => m.id).join(",") === "chaos,dream,daily");
  ok("Best of 7, Win 82, Tournament, Era Gauntlet are secondary, in order",
    lobbyModes().secondary.map((m) => m.id).join(",") === "bo7,win82,tournament,gauntlet");
  ok("Chaos Clash alone is recommended and supports continuation",
    PLAY_MODES.filter((m) => m.recommended).map((m) => m.id).join() === "chaos"
    && PLAY_MODES.filter((m) => m.continuationSupport).map((m) => m.id).join() === "chaos");
  ok("every status has a label decision and an action word",
    Object.keys(MODE_STATUS).every((s) => s in STATUS_LABEL && !!ACTION_LABEL[s]));
  const reached = new Set();
  for (const m of PLAY_MODES) for (const t of TIERS) for (const ctx of [{}, { previewCandidateActive: true }, { chaosAvailable: false }]) reached.add(resolveModeAction(m, t, ctx).status);
  ok("statuses reachable in this build are the truthful five",
    [...reached].sort().join(",") === "ACCOUNT_REQUIRED,AVAILABLE,COMING_SOON,DISABLED_FOR_PREVIEW,UNAVAILABLE_HERE", [...reached].sort().join(","));
  ok("no mode is behind a subscription for any tier",
    !PLAY_MODES.some((m) => TIERS.some((t) => [MODE_STATUS.SUBSCRIPTION_REQUIRED, MODE_STATUS.COMMISSIONER_REQUIRED].includes(resolveModeAction(m, t).status))));
  ok("Coming soon never routes to checkout", TIERS.every((t) => !/membership|checkout/.test(resolveModeAction(findMode("gauntlet"), t).href)));
  ok("a locked (account) mode routes to its own address, where the gate is", resolveModeAction(findMode("dream"), "GUEST").href === "/play/dream");
  ok("requiresAccount is derived from the entitlement matrix", requiresAccount(findMode("dream")) && !requiresAccount(findMode("chaos")) && !requiresAccount(findMode("daily")) && requiresAccount(findMode("win82")));
  ok("the trial pairing in entitlements agrees with the registry",
    PLAY_MODES.filter((m) => m.trialCapability).every((m) => TRIAL_CAPABILITY[m.capability]?.trial === m.trialCapability));
  ok("entitlements no longer defines a mode list", !/export const MODES\s*=/.test(src("src/entitlements.js")));
  ok("the header, the lobby and the App read the registry and define no mode list",
    ["src/components/arena/ArenaHeader.jsx", "src/components/lobby/PlayLobby.jsx", "src/App.jsx"].every((f) => /navigation\.js"/.test(src(f)) && !/const\s+(MODES|GAME_MODES|PLAY_MODES)\s*=\s*\[/.test(src(f))));
  ok("Fantasy is a top-level pillar, not a play mode", TOP_NAV.find((t) => t.id === "fantasy")?.kind === "menu" && !PLAY_MODES.some((m) => /fantasy/i.test(m.id)));
  ok("every mode route resolves back to its mode", PLAY_MODES.every((m) => modeForRoute(m.route)?.id === m.id) && !modeForRoute("/play") && isLobbyRoute("/") && isLobbyRoute("/play"));
  extra.registry = PLAY_MODES.map((m) => ({
    id: m.id, label: m.label, route: m.route, category: m.category, recommended: m.recommended, continuationSupport: m.continuationSupport,
    implemented: m.implemented, requiresAccount: requiresAccount(m), shortDescription: m.shortDescription, implementationNote: m.implementationNote,
    statusByTier: Object.fromEntries(TIERS.map((t) => [t, resolveModeAction(m, t, { from: PLAY_LOBBY_ROUTE }).status])),
  }));
  extra.statusMapping = {
    note: "The specification names PLUS_REQUIRED and PREVIEW_DISABLED; the repository's registry predates it with SUBSCRIPTION_REQUIRED and DISABLED_FOR_PREVIEW, which the tests and e2e already pin. The names are kept; the meaning is the same. UNAVAILABLE_HERE is new: the server has a mode switched off in this deployment.",
    PLUS_REQUIRED: "SUBSCRIPTION_REQUIRED", PREVIEW_DISABLED: "DISABLED_FOR_PREVIEW",
  };
}

// ── Lobby ────────────────────────────────────────────────────────────────────
if (MODE === "lobby") {
  const lobby = read("src/components/lobby/PlayLobby.jsx");
  const lobbyCode = src("src/components/lobby/PlayLobby.jsx");
  const card = read("src/components/lobby/ContinueCard.jsx");
  const css = read("src/index.css");
  const lobbyCss = css.slice(css.indexOf("PHASE 9A — THE PLAY LOBBY"));
  const app = src("src/App.jsx");
  ok("the lobby exists as its own component", fs.existsSync("src/components/lobby/PlayLobby.jsx"));
  ok("the lobby reads the registry's two tiers", /lobbyModes\(\)/.test(lobbyCode) && /primary\.map/.test(lobbyCode) && /secondary\.map/.test(lobbyCode));
  ok("each card carries a glyph, a name, one sentence, a status badge and ONE action",
    /ModeGlyph/.test(lobbyCode) && /ec-mode-title/.test(lobbyCode) && /shortDescription/.test(lobbyCode) && /STATUS_LABEL\[action\.status\]/.test(lobbyCode)
    && (lobbyCode.match(/className="ec-mode-action"/g) || []).length === 2 /* one <a>, one <button> alternative */);
  ok("a card's action is a real link when it has an address", /<a className="ec-mode-action" href=\{action\.href\}/.test(lobbyCode));
  ok("the recommended flag is a word, not only a colour", /RECOMMENDED/.test(lobbyCode) && /recommended/.test(lobbyCode));
  ok("the lobby never starts a game", !/startChaos/.test(lobbyCode) && !/chaosAction: "start"/.test(lobbyCode));
  ok("the lobby only READS a remembered run", /viewChaos\(/.test(lobbyCode) && !/submitChaos|chooseChaos|simulateChaos/.test(lobbyCode));
  ok("the EraClash Mk1 logo is the lobby's mark", /\/brand\/eraclash-logo-mk1\.png/.test(lobby) && fs.existsSync("public/brand/eraclash-logo-mk1.png"));
  ok("no competitor asset, name or wording is referenced",
    ["src/components/lobby/PlayLobby.jsx", "src/components/lobby/ContinueCard.jsx", "src/components/lobby/ModeGlyph.jsx"].every((f) => !/82-0|vaulty|Get the App|CHOOSE YOUR MODE|Can you go/i.test(read(f))));
  ok("no simulation statistics, roster intelligence or comparison tables on a card",
    !/ppg|rpg|apg|OVR|analysis|bestStrength|biggestRisk/.test(lobbyCode));
  ok("the primary action is EraClash gold, not an orange system",
    /\.ec-mode-card--primary \.ec-mode-action\[data-intent="OPEN_MODE"\][\s\S]{0,220}var\(--ec-a-gold\)/.test(lobbyCss) && !/orange/i.test(lobbyCss));
  ok("touch targets are at least 44px", /\.ec-mode-action \{[\s\S]{0,200}min-height: 48px/.test(lobbyCss) && /\.ec-mode-card--secondary \.ec-mode-action \{ min-height: 44px/.test(lobbyCss) && /\.ec-continue-quiet \{[\s\S]{0,120}min-height: 44px/.test(lobbyCss));
  ok("three columns, then two, then one", /\.ec-lobby-primary \{[\s\S]{0,120}repeat\(3, minmax\(0, 1fr\)\)/.test(lobbyCss)
    && /@media \(max-width: 1024px\) \{[\s\S]{0,200}\.ec-lobby-primary \{ grid-template-columns: repeat\(2/.test(lobbyCss)
    && /@media \(max-width: 640px\) \{[\s\S]{0,300}\.ec-lobby-primary \{ grid-template-columns: minmax\(0, 1fr\)/.test(lobbyCss));
  ok("focus is visible on a card's action", /\.ec-mode-action:focus-visible/.test(lobbyCss));
  ok("reduced motion is respected", /prefers-reduced-motion: reduce\) \{\s*\.ec-mode-card/.test(lobbyCss));
  ok("`/` and /play render the lobby; the Time Arena keeps /play/chaos", /showLobby = isLobbyRoute\(route\) && nav === "Play"/.test(app) && /<PlayLobby/.test(app) && /navigate\("\/play\/chaos"\)/.test(app));
  ok("the logo goes to the lobby without touching the run", /onNav\("Play"\)/.test(src("src/components/arena/ArenaHeader.jsx")) && !/ec_chaos_run/.test(app.split("const handleNav")[1]?.split("\n")[0] || ""));
  ok("a game-opening link bypasses the lobby", /q\.get\("chaos"\)\) p = "\/play\/chaos"/.test(app) && /q\.get\("scenario"\)\) p = "\/play\/dream"/.test(app));
  ok("the lobby fits the access gate and the SPA rewrites", /"\/play", "\/play\/:path\*"/.test(read("middleware.js")) && JSON.parse(read("vercel.json")).rewrites.some((r) => r.source === "/play/:path*"));
  ok("the Continue card shows stage, era status, last activity, both identities, Continue and Abandon",
    ["CONTINUE YOUR CHAOS CLASH", "era not yet revealed", "last activity", "TEAM GOLD", "TEAM BLUE", "Legend Rival", "Your Five", "CONTINUE", "ABANDON"].every((w) => card.includes(w)));
}

// ── Active run ───────────────────────────────────────────────────────────────
if (MODE === "active-run") {
  const lobby = src("src/components/lobby/PlayLobby.jsx");
  const card = src("src/components/lobby/ContinueCard.jsx");
  const stage = src("src/components/arena/ChaosStage.jsx");
  const api = src("api/game.js");
  const glue = src("api/_lib/chaosRun.js");
  const dialog = read("src/components/arena/ResetDialog.jsx");
  ok("the Continue card exists only for a remembered, live run", /store\.get\(RUN_KEY\)/.test(lobby) && /run\.status !== "ABANDONED" && run\.phase !== "SIMULATED"/.test(lobby));
  ok("a forgotten or expired run is cleared and reported, never shown as resumable", /expired: true/.test(lobby) && /active_run_expired_shown/.test(lobby) && /store\.clear\(\)/.test(lobby));
  ok("Continue resumes the run the server holds — the arena re-reads it", /viewChaos\(id, tier\)/.test(stage) && /adopt\(r\.chaos\)/.test(stage));
  ok("the card reveals the era only once the server has", /eraState\?\.revealed \? run\.eraState\.eraStyleId : null/.test(card));
  ok("the card never mentions the Legend CPU's holds", !/blue\?\.heldSlots|blue\.heldSlots/.test(card));
  ok("last activity is a browser-side stamp written when the run is touched", /RUN_AT_KEY/.test(stage) && /localStorage\.setItem\(RUN_AT_KEY/.test(stage));
  ok("Abandon asks first, with the safe answer focused", /state="abandon"/.test(lobby) && /abandon: \{/.test(dialog) && /noRef\.current\?\.focus\(\)/.test(dialog));
  ok("Abandon is server-side, then local", /abandonChaos\(id, tier\)/.test(lobby) && /store\.clear\(\)/.test(lobby));
  ok("a guest run is spent when it STARTS", /consumeGuestRun\(session\)/.test(api) && api.indexOf("consumeGuestRun") < api.indexOf('chaosAction === "abandon"'));
  ok("abandoning refunds nothing", !/DECR/.test(glue) && !/guest/i.test(api.split('chaosAction === "abandon"')[1]?.split("if (chaosAction")[0] || ""));
  ok("an abandoned run can never be advanced or resumed", /run\.status === "ABANDONED" && chaosAction !== "view"/.test(api));
  ok("the guest budget is three runs", GUEST_CHAOS_RUNS === 3, String(GUEST_CHAOS_RUNS));
  ok("the App drops its run state when the lobby abandons one", /onAbandoned=\{\(\) => \{ setChaosRun\(null\)/.test(src("src/App.jsx")));
  ok("choosing another mode does not touch the run", !/ec_chaos_run/.test((src("src/App.jsx").split("const handleModeAction")[1] || "").split("const goHome")[0]));
  ok("the continuation events are tracked", ["active_run_continue_clicked", "active_run_abandon_started", "active_run_abandoned"].every((e) => lobby.includes(e)));
}

// ── Progressive disclosure ───────────────────────────────────────────────────
if (MODE === "disclosure") {
  const stage = src("src/components/arena/ChaosStage.jsx");
  const dock = src("src/components/arena/ResultDock.jsx");
  const intel = src("src/components/arena/LiveIntel.jsx");
  const css = read("src/index.css");
  ok("one primary action object per state", (stage.match(/className="ec-ta-cta"/g) || []).length === 1 && /const cta = !run \?/.test(stage));
  ok("the states name the one action each", ["ROLL 1", "LOCK & ROLL 2", "FINAL ROLL", "HIRE THIS STAFF", "RUN SIM"].every((l) => stage.includes(l)));
  ok("the stage declares its focus", /data-focus=\{focus\}/.test(stage) && /"empty" : drafting \? "hold" : selecting \? "hire" : ready \? "ready"/.test(stage));
  ok("the coach section says whether it is actionable", /data-active=\{coachActive/.test(stage) && /coachActive = offers\.length > 0 && \(drafting \|\| selecting\)/.test(stage));
  ok("an inactive coach section is visibly subdued", /\.ec-ta-coach\[data-active="false"\] \{ opacity: 0\.58; \}/.test(css));
  ok("the empty board's placeholder staffs are desaturated", /data-focus="empty"\] \.ec-ta-coach \.ec-coach-card \{ filter: saturate/.test(css));
  ok("completed rolls compress to ticks", /state === "COMPLETE" \? "✓"/.test(src("src/components/arena/RollStepper.jsx")));
  ok("the supporting line under the action is concise and stateful", /ec-ta-cta-sub/.test(stage) && /holding \$\{holds\.length\}\/5/.test(stage));
  ok("the era stays hidden until the server reveals it", /ERA HIDDEN/.test(intel) && /Revealed with Roll 2/.test(intel));
  ok("Live Intel keeps one strength, one risk and the pressure — no prediction", /YOUR IDENTITY/.test(intel) && /BIGGEST RISK/.test(intel) && /DRAFT PRESSURE/.test(intel) && /not a prediction/.test(intel));
  ok("a finished game leads with the Story, the other sections one tap away; the reference state keeps its closed tabs",
    /prevPhase\.current === "simulating" && phase === "complete"\) setTab\("story"\)/.test(dock) && /useState\(null\)/.test(dock)
    && ["Game Story", "Box Score", "Coaching", "Analysis"].every((t) => dock.includes(t)));
  ok("a finished game compresses the board and keeps the matchup", /THE MATCHUP YOU BUILT/.test(stage) && /phase === "simulating" \|\| phase === "complete"/.test(stage));
  ok("the rail stays: Live Intel and the Result Dock are untouched surfaces", /<LiveIntel/.test(src("src/components/arena/TimeArena.jsx")) && /<ResultDock/.test(src("src/components/arena/TimeArena.jsx")));
  ok("no permanent rack of other modes in the arena", !fs.existsSync("src/components/arena/ModeShelf.jsx"));
  ok("the transition respects reduced motion", /prefers-reduced-motion: no-preference\) \{\s*\.ec-ta-coach \{ transition/.test(css));
}

// ── Multi-position placement ─────────────────────────────────────────────────
if (MODE === "multi-position") {
  const mod = src("src/lineupPlacement.js");
  const grid = src("src/components/RosterGrid.jsx");
  const picker = src("src/components/ManualPicker.jsx");
  const app = src("src/App.jsx");
  const pc = src("src/components/arena/PlayerCard.jsx");
  ok("placement rules live in one pure module", fs.existsSync("src/lineupPlacement.js") && PLACEMENT_VERSION === "1.0.0");
  ok("eligibility reads card data only — never height, team, decade, name or rating",
    /p\.positions/.test(mod) && !/height|\.team\b|\.decade\b|\.pts\b|\.reb\b|rating/.test(mod) && !/name\.(includes|match)/.test(mod));
  const multi = PLAYERS.filter((p) => p.positions.length > 1).length;
  ok(`${multi} of ${PLAYERS.length} cards are multi-position and every card has ≥1 legal slot`, multi > 200 && PLAYERS.every((p) => eligiblePositions(p).length >= 1));
  ok("the four slot states are words", Object.values(SLOT_STATE).join() === "ELIGIBLE,SELECTED,OCCUPIED,INELIGIBLE" && ["PLACE HERE", "SWAP", "NOT ELIGIBLE", "SELECTED"].every((w) => grid.includes(w)));
  ok("the grid renders states from the module's plan, not its own rules", /placement\?\.plan/.test(grid) && /slot\?\.state/.test(grid) && !/positions\.includes/.test(grid));
  ok("ineligible slots are not controls and explain why", /aria-disabled/.test(grid) && /is not eligible at/.test(grid));
  ok("eligible slots and swaps are buttons with full names", /Place \$\{placingName\} at/.test(grid) && /Swap \$\{p\.name\} for \$\{placingName\}/.test(grid));
  ok("every card lists ALL eligible positions and the team", /eligibleLabel\(p\)/.test(grid) && /p\.team/.test(grid) && /eligibleLabel\(p\)/.test(picker));
  ok("the picker has a player-first shape", /slotPos = null/.test(picker) && /CHOOSE A/.test(picker) && /Filter by eligible position/.test(picker));
  ok("one legal slot places automatically and announces it", /PLACEMENT_MODE\.AUTO\) \{ applyPlacement\(target, player, plan\.autoIndex, \{ auto: true \}\)/.test(app) && /dream_player_auto_placed/.test(app));
  ok("several legal slots require a choice, and only those are offered", /PLACEMENT_MODE\.AUTO/.test(app) && /setPlacing\(\{ player, target, plan \}\)/.test(app) && /eligible_position_choice_shown/.test(app));
  ok("an occupied slot is a swap, never a silent replacement", /OCCUPIED/.test(grid) && /dream_player_swap_completed/.test(app) && !/silently/.test(mod.split("place = ")[1] || "x"));
  ok("a duplicate canonical person is refused", /DUPLICATE_PERSON/.test(mod) && /PLACEMENT_MODE\.DUPLICATE_PERSON\) \{/.test(app));
  ok("Undo restores the previous five", /const undoPlacement/.test(app) && /setUndo\(\{ five: before/.test(app) && /dream_player_placement_undone/.test(app));
  ok("selection and placement are announced to assistive tech", /aria-live="polite"/.test(app) && /describeSelection\(plan\)/.test(app) && /describePlacement\(r, \{ auto \}\)/.test(app));
  ok("Escape cancels a pending placement", /e\.key === "Escape"\) cancelPlacement\(\)/.test(app));
  ok("Chaos cards show every eligible position as information, with slot logic unchanged", /ec-pc-elig/.test(pc) && !/onPlace|placement/.test(pc) && !/lineupPlacement/.test(src("src/chaos/runState.js")));
  // The rules, exercised.
  const kd = PLAYERS.find((p) => p.id === "durant-10s");
  const plan = placementPlan([null, null, null, null, null], kd);
  ok("Durant (SF · PF · SG) sees three eligible slots", plan.open.map((i) => POSITIONS[i]).sort().join() === "PF,SF,SG" && plan.mode === PLACEMENT_MODE.CHOOSE);
  ok("the announcement names every eligible position and the count", describeSelection(plan) === "Kevin Durant selected. Eligible positions: small forward, power forward and shooting guard. Three legal positions available.");
  let illegal = 0, seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let t = 0; t < 300; t++) {
    const five = [null, null, null, null, null];
    for (let i = 0; i < 5; i++) if (rnd() < 0.6) { const pool = PLAYERS.filter((p) => eligiblePositions(p).includes(POSITIONS[i]) && !five.some((x) => x && x.name === p.name)); five[i] = pool[Math.floor(rnd() * pool.length)]; }
    const p = PLAYERS[Math.floor(rnd() * PLAYERS.length)];
    for (let i = 0; i < 5; i++) { const r = place(five, p, i); if (r.ok && !isLegalLineup(r.five)) illegal++; }
  }
  ok("1,500 random placements produced zero illegal lineups", illegal === 0, `${illegal} illegal`);
}

// ── Telemetry ────────────────────────────────────────────────────────────────
if (MODE === "telemetry") {
  const events = read("api/events.js");
  const clients = ["src/App.jsx", "src/activation.js", "src/components/lobby/PlayLobby.jsx", "src/components/arena/ChaosStage.jsx"].map(src).join("\n");
  ok("every activation event is allowlisted by the server", ACTIVATION_EVENTS.every((e) => new RegExp(`"${e}"`).test(events)));
  ok("every activation event is tracked in the client", ACTIVATION_EVENTS.every((e) => new RegExp(`"${e}"`).test(clients)));
  const block = events.slice(events.indexOf("Phase 9A activation"), events.indexOf("]);", events.indexOf("Phase 9A activation")));
  const listed = [...block.matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]).sort();
  ok("the server's 9A block and the client's list are the same set", listed.join() === [...ACTIVATION_EVENTS].sort().join());
  ok("the specification's events are all present", ["play_lobby_viewed", "play_mode_selected", "active_run_continue_clicked", "active_run_abandon_started", "active_run_abandoned", "account_gate_shown", "membership_gate_shown", "dream_player_selected", "eligible_position_choice_shown", "dream_player_placed", "dream_player_auto_placed", "dream_player_swap_completed", "time_to_first_roll_recorded"].every((e) => ACTIVATION_EVENTS.includes(e)));
  ok("the analytics wrapper is the only transport", /from "\.\.\/analytics\.js"|from "\.\/analytics\.js"|from "\.\.\/\.\.\/analytics\.js"/.test(clients) && !/fetch\("\/api\/events"/.test(clients));
  ok("no email, raw key, cookie, session token, IP or free text in an event property",
    !/track\([^)]*(email|accessKey|access_key|cookie|token|clientIp|searchText|freeText)/i.test(clients));
  ok("first-roll timing is milliseconds and a coarse bucket", /bucketMs/.test(src("src/activation.js")) && /time_to_first_roll_recorded/.test(src("src/activation.js")));
  ok("the server still drops anything not allowlisted", /ALLOWED\.has\(e\.event\)/.test(events) && /MAX_EVENT_BYTES/.test(events));
  ok("no new serverless function was added for telemetry", fs.readdirSync("api").filter((f) => f.endsWith(".js")).length === 12);
  extra.events = ACTIVATION_EVENTS.map((e) => ({ event: e, allowlisted: new RegExp(`"${e}"`).test(events), tracked: new RegExp(`"${e}"`).test(clients) }));
  extra.forbiddenProperties = ["email", "raw access key", "cookie", "session token", "full IP", "raw search text", "unbounded user text"];
  extra.measures = ["Lobby → Chaos selection (play_mode_selected mode_id=chaos)", "Lobby → first roll time (time_to_first_roll_recorded ms/bucket, from=lobby)", "Mode-card selection distribution (play_mode_selected)", "Continue-run usage (active_run_continue_clicked / active_run_abandoned)", "Account-gate exposure (account_gate_shown)", "Eligible-position completion (eligible_position_choice_shown → dream_player_placed)", "Placement undo rate (dream_player_placement_undone / dream_player_placed)"];
  extra.note = "No conclusions are drawn here: the events exist and are wired; tester data decides what they mean.";
}

// ── Static contracts (written, not measured) ─────────────────────────────────
if (MODE === "contracts") {
  const write = (name, body) => { fs.writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
  write("play-lobby-contract.json", {
    artifact: "play-lobby-contract", phase: "9A — Play Lobby, activation clarity, multi-position placement", status: "FROZEN",
    routes: { entrance: "/", lobby: PLAY_LOBBY_ROUTE, modes: Object.fromEntries(PLAY_MODES.map((m) => [m.id, m.route])) },
    layers: { publicEntrance: "/ — the lobby with the product line", playLobby: "/play — visual mode selection; starts nothing", timeArena: "/play/chaos — where Chaos Clash is played" },
    hierarchy: { primary: lobbyModes().primary.map((m) => m.id), secondary: lobbyModes().secondary.map((m) => m.id), recommended: "chaos" },
    card: { contains: ["original glyph", "mode name", "one sentence", "status or entitlement badge", "one action"], excludes: ["long descriptions", "simulation statistics", "roster intelligence", "comparison tables", "competing buttons", "promotional panels"] },
    identity: { logo: "public/brand/eraclash-logo-mk1.png (EraClash Logo Mk1)", palette: ["near-black arena base", "metallic silver", "EraClash gold", "cobalt", "coach violet"], forbidden: ["dominant orange CTA system", "competitor icons, wording, animations, rules"] },
    rules: ["/play never silently starts a Chaos run", "direct Chaos links open Chaos", "challenge links (?chaos=) open the challenge", "Dream Matchup links open its account gate or builder", "Back returns predictably (history API)", "refresh preserves the route", "logo navigation preserves an active run", "abandonment is explicit and confirmed"],
    continuation: { shows: ["stage", "era status (only if revealed)", "time since last activity (browser stamp)", "compact Gold/Blue identity", "Continue", "Abandon"], never: ["unrevealed era", "Legend CPU holds", "a false card when no run exists"] },
    responsive: { desktop: "3 primary cards, secondary row, one viewport when practical", tablet: "2 columns", mobile: "1 column, Chaos first, 44px targets, no page overflow" },
  });
  write("multi-position-contract.json", {
    artifact: "multi-position-contract", phase: "9A", status: "FROZEN", version: PLACEMENT_VERSION,
    authoritativeSource: "src/players.js — each card's `positions` array (primary `pos` first). Never inferred from name, height, team, decade or rating.",
    display: { card: ["primary position", "all eligible positions", "team", "decade", "draft-guide OVR"], example: "KEVIN DURANT — Eligible: SF · PF · SG" },
    slotStates: Object.values(SLOT_STATE), modes: Object.values(PLACEMENT_MODE),
    behaviour: {
      select: ["determine legal slots", "highlight eligible", "disable ineligible", "explain unavailable", "keyboard and pointer", "preserve legal roster structure", "prevent duplicate canonical people"],
      oneLegalSlot: "place automatically, announce, offer Undo",
      severalLegalSlots: "present only those; ineligible slots are not controls",
      allEligibleOccupied: "offer a swap; never replace silently; never produce an illegal lineup",
      swapValidity: "a swap is valid only when the resulting lineup remains legal; a displaced player with exactly one other open eligible slot is moved there, otherwise leaves (announced, undoable)",
    },
    announcement: describeSelection(placementPlan([null, null, null, null, null], { id: "spec", name: "Kevin Durant", pos: "SF", positions: ["SF", "PF"] })),
    chaosBoundary: { cardsShowEligiblePositions: true, slotLogicChanged: false, postDraftRepositioning: "not added — recorded as a future fairness-tested enhancement" },
    tested: ["SF/PF", "PG/SG", "PF/C", "three-position players", "one-position specialists", "occupied slots", "undo", "same person with multiple decade cards", "keyboard placement", "mobile placement"],
  });
  write("activation-telemetry-contract.json", {
    artifact: "activation-telemetry-contract", phase: "9A", status: "FROZEN",
    transport: "src/analytics.js → POST /api/events (existing route; allowlisted; no new function)",
    events: ACTIVATION_EVENTS,
    forbidden: ["email", "raw access key", "cookie", "session token", "full IP", "raw search text", "unbounded user text"],
    measures: ["Lobby → Chaos selection", "Lobby → first roll time", "mode-card selection distribution", "continue-run usage", "account-gate exposure", "eligible-position completion", "placement undo rate"],
    interpretation: "None before tester data exists.",
  });
  write("competitive-decisions.json", {
    artifact: "competitive-decisions", phase: "9A", source: "owner review of 82-0.com (26 screenshots, 2026-09-02), used as interaction evidence only; no competitor asset is referenced at runtime",
    classification: ["ADOPT", "ADAPT", "OUTPERFORM", "REJECT", "DEFER"],
    decisions: [
      { element: "Simple visual mode selection (three cards on the home surface)", decision: "ADAPT", how: "A dedicated Play Lobby at / and /play with three primary cards and a quieter secondary row, read from the one navigation registry." },
      { element: "One obvious action at a time", decision: "ADOPT", how: "One action per lobby card; one primary CTA per Time Arena state (already the arena's rule, now attributed and measured)." },
      { element: "Locked controls until actionable", decision: "ADAPT", how: "The coach section is visibly subdued while not actionable (data-active); placeholder staffs desaturate on an empty board. Nothing is hidden, nothing competes." },
      { element: "Clear finite respin resources", decision: "ADAPT", how: "Three rolls, named FOUNDATION · ADAPT · COMMIT, with completed rolls compressed to ticks; a guest's three runs stated on the abandon dialog." },
      { element: "Automatic progression", decision: "REJECT", how: "Chaos progression stays on explicit decisions (hold, lock, hire, run) — the decisions ARE the game." },
      { element: "Eligible-position highlighting when a player is selected", decision: "OUTPERFORM", how: "Player-first placement with four worded slot states, auto-placement for one legal slot, a legal swap workflow, Undo, duplicate-person refusal and a screen-reader announcement — from authoritative card data." },
      { element: "Concise results", decision: "ADAPT", how: "The Result Dock leads with the Story; Box Score, Coaching and Analysis stay one tap away. Depth on demand, not removed." },
      { element: "Simple account and social navigation", decision: "DEFER", how: "Accounts, friends, leaderboards and XP are Phases 9B–9C by decision; the existing header nav is unchanged." },
      { element: "Cross-platform mental-model consistency", decision: "ADOPT", how: "Same mode names, order, glyphs, statuses and sentences on desktop, tablet, phone and PWA; only the physical layout reflows." },
      { element: "Projected record and letter grade", decision: "REJECT", how: "EraClash reports simulated results, never a projected record or grading vocabulary." },
      { element: "Dark-orange colour identity, logo, icons, text, slot animation", decision: "REJECT", how: "EraClash Logo Mk1, near-black arena base, silver, gold, cobalt and coach violet; original stroke glyphs; original copy." },
      { element: "Sign-in prompt on the result and leaderboard rank", decision: "DEFER", how: "Phase 9B (accounts) and 9C (leaderboards). Not built here; no fake sign-in." },
      { element: "Language selector", decision: "DEFER", how: "Phase 9F localization foundation." },
      { element: "Trivia / additional games shelf", decision: "REJECT", how: "Out of scope by decision; Fantasy remains its own pillar and is not mixed into Play." },
      { element: "Ads between the game and the player", decision: "REJECT", how: "None." },
    ],
  });
}

// ── Browser: responsive + accessibility on the static build ──────────────────
if (MODE === "responsive" || MODE === "accessibility") {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const withAccount = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
  if (MODE === "responsive") {
    const rows = [];
    for (const [w, h, touch] of [[1536, 1024, false], [1280, 800, false], [1024, 768, false], [768, 1024, true], [430, 932, true], [390, 844, true], [375, 812, true]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await withAccount(page);
      await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
      await page.waitForSelector(".ec-lobby", { timeout: 20_000 });
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")];
        const sec = [...document.querySelectorAll(".ec-lobby-secondary .ec-mode-card")];
        const cols = (els) => new Set(els.map((c) => Math.round(c.getBoundingClientRect().x))).size;
        const targets = [...document.querySelectorAll(".ec-mode-action")].map((b) => Math.round(b.getBoundingClientRect().height));
        const compressed = cards.filter((c) => c.getBoundingClientRect().width < 240).length;
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          primaryColumns: cols(cards), secondaryColumns: cols(sec), minTarget: Math.min(...targets),
          docHeight: document.documentElement.scrollHeight, firstMode: cards[0]?.dataset.mode, compressedCards: compressed,
          logoWidth: Math.round(document.querySelector(".ec-lobby-logo")?.getBoundingClientRect().width || 0),
        };
      });
      fs.mkdirSync(`${OUT}/screens`, { recursive: true });
      await page.screenshot({ path: `${OUT}/screens/lobby-${w}x${h}.png` });
      rows.push({ viewport: `${w}x${h}`, ...m });
      ok(`${w}x${h}: no page-level horizontal overflow`, m.overflow <= 0, `${m.overflow}px`);
      ok(`${w}x${h}: every action is at least 44px`, m.minTarget >= 44, `${m.minTarget}px`);
      ok(`${w}x${h}: Chaos Clash is first`, m.firstMode === "chaos");
      const wantCols = w <= 640 ? 1 : w <= 1024 ? 2 : 3;
      ok(`${w}x${h}: ${wantCols} primary column(s)`, m.primaryColumns === wantCols, String(m.primaryColumns));
      if (w <= 640) ok(`${w}x${h}: no horizontally compressed desktop card`, m.compressedCards === 0 || m.primaryColumns === 1, `${m.compressedCards} narrow`);
      if (w >= 1280) ok(`${w}x${h}: the lobby fits one viewport`, m.docHeight <= h, `${m.docHeight}px of ${h}`);
      await ctx.close();
    }
    // Placement on a phone.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await withAccount(page);
    await page.goto(`${BASE}/play/dream`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
    await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant");
    await page.locator('button[data-player="durant-10s"]').click();
    const grid = page.locator('.roster-grid[aria-label="Team Gold lineup"]');
    const mobile = await grid.evaluate((g) => ({
      placing: g.dataset.placing,
      eligible: g.querySelectorAll('[data-place-state="ELIGIBLE"]').length,
      ineligible: g.querySelectorAll('[data-place-state="INELIGIBLE"]').length,
      minTarget: Math.min(...[...g.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height))),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    await page.screenshot({ path: `${OUT}/screens/placement-390x844.png` });
    ok("390x844: placement highlights three eligible slots for Durant", mobile.placing === "true" && mobile.eligible === 3 && mobile.ineligible === 2, JSON.stringify(mobile));
    ok("390x844: eligible slot controls are touch-sized", mobile.minTarget >= 44, `${mobile.minTarget}px`);
    ok("390x844: no overflow while placing", mobile.overflow <= 0, `${mobile.overflow}px`);
    await page.getByRole("button", { name: "Place Kevin Durant at Power Forward" }).tap();
    ok("390x844: a tap places the player", await grid.locator('[data-slot="PF"]').innerText().then((t) => /Durant/.test(t)));
    await ctx.close();
    extra.rows = rows;
  }
  if (MODE === "accessibility") {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await withAccount(page);
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    await page.waitForSelector(".ec-lobby", { timeout: 20_000 });
    const a = await page.evaluate(() => {
      const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); if (a == null || b == null) return null; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      const shell = document.querySelector(".ec-arena-shell");
      // Phase 9A.2: the lobby cards carry their own family (--ec-l-*); the text is
      // measured against the card it actually sits on, else the arena panel.
      const panel = getComputedStyle(shell).getPropertyValue("--ec-l-panel-raised").trim() || getComputedStyle(shell).getPropertyValue("--ec-a-panel").trim() || "#091321";
      const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
      const line = document.querySelector(".ec-mode-line");
      const title = document.querySelector(".ec-mode-title");
      const badge = document.querySelector(".ec-mode-badge");
      const actions = [...document.querySelectorAll(".ec-mode-action")];
      return {
        main: !!document.querySelector('main[aria-labelledby="ec-lobby-title"]'),
        h1: document.getElementById("ec-lobby-title")?.textContent || null,
        headings: document.querySelectorAll(".ec-mode-card h2").length,
        sections: [...document.querySelectorAll(".ec-lobby section[aria-label]")].map((s) => s.getAttribute("aria-label")),
        actions: actions.map((el) => ({ tag: el.tagName, name: el.getAttribute("aria-label"), href: el.getAttribute("href") })),
        describedBy: actions.length === document.querySelectorAll(".ec-mode-card[aria-describedby]").length,
        lineContrast: ratio(getComputedStyle(line).color, hex(panel)),
        titleContrast: ratio(getComputedStyle(title).color, hex(panel)),
        badgeText: badge?.textContent.trim() || null,
        recommendedWord: !!document.querySelector(".ec-mode-flag"),
        logoAlt: document.querySelector(".ec-lobby-logo")?.getAttribute("alt"),
        reducedMotionRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.media && /prefers-reduced-motion: reduce/.test(r.media.mediaText) && /ec-mode-card/.test(r.cssText)); } catch { return false; } }),
      };
    });
    ok("the lobby is a labelled main landmark with an h1", a.main && /Play EraClash Basketball/.test(a.h1 || ""));
    ok("every mode card has a heading", a.headings === 7, String(a.headings));
    ok("the two tiers are labelled regions", a.sections.join("|") === "Game modes|More ways to play", a.sections.join("|"));
    ok("every card action is a real link or button with a full name", a.actions.length === 7 && a.actions.every((x) => ["A", "BUTTON"].includes(x.tag) && x.name && /Chaos Clash|Dream Matchup|Daily Clash|Best of 7|Win 82|Tournament|Era Gauntlet/.test(x.name)));
    ok("the recommended card says so in its name and as a word", /recommended/.test(a.actions[0]?.name || "") && a.recommendedWord);
    ok("status badges are text", !!a.badgeText, a.badgeText);
    ok("cards are described by their sentence", a.describedBy);
    ok("body copy clears WCAG AA on the panel", (a.lineContrast || 0) >= 4.5, `${(a.lineContrast || 0).toFixed(2)}:1`);
    ok("titles clear WCAG AA on the panel", (a.titleContrast || 0) >= 4.5, `${(a.titleContrast || 0).toFixed(2)}:1`);
    ok("the logo has alt text", a.logoAlt === "EraClash Basketball", a.logoAlt);
    ok("reduced motion is respected by the lobby", a.reducedMotionRule);
    // Keyboard: Tab reaches the first action; Enter opens the route.
    await page.keyboard.press("Tab");
    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) {
      reached = await page.evaluate(() => document.activeElement?.classList.contains("ec-mode-action"));
      if (!reached) await page.keyboard.press("Tab");
    }
    ok("Tab reaches a mode card's action", reached);
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    ok("focus is visible", outline !== "none", outline);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    ok("Enter opens the mode's route", /\/play\/[a-z0-9-]+$/.test(page.url()), page.url());
    // Placement announcements.
    await page.goto(`${BASE}/play/dream`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
    await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant");
    await page.locator('button[data-player="durant-10s"]').click();
    const live = await page.locator('[role="status"][aria-live="polite"]').first().innerText();
    ok("a selection is announced with every eligible position and the count", live === "Kevin Durant selected. Eligible positions: small forward, power forward and shooting guard. Three legal positions available.", live);
    const ineligible = await page.locator('.roster-grid[aria-label="Team Gold lineup"] [data-place-state="INELIGIBLE"] .sr-only').first().innerText();
    ok("an ineligible slot explains itself to assistive tech", /not eligible at/.test(ineligible), ineligible);
    await page.getByRole("button", { name: "Place Kevin Durant at Power Forward" }).focus();
    await page.keyboard.press("Enter");
    const placed = await page.locator('[role="status"][aria-live="polite"]').first().innerText();
    ok("a placement is announced with Undo", /placed at power forward\. Undo is available\./.test(placed), placed);
    ok("Undo is a reachable control", (await page.getByRole("button", { name: "Undo the last placement" }).count()) === 1);
    await ctx.close();
    extra.accessibility = a;
  }
  await browser.close();
}

// ── Evidence ─────────────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.pass).length;
const file = {
  lobby: "play-lobby-qa.json", registry: "mode-registry-verification.json", "active-run": "active-run-continuation-qa.json",
  disclosure: "progressive-disclosure-qa.json", "multi-position": "multi-position-qa.json", telemetry: "activation-telemetry-qa.json",
  responsive: "responsive-qa.json", accessibility: "accessibility-qa.json",
}[MODE];
if (file) {
  fs.writeFileSync(`${OUT}/${file}`, JSON.stringify({
    artifact: file.replace(/\.json$/, ""), phase: "9A — Play Lobby, activation clarity, multi-position placement", mode: MODE,
    generatedAt: new Date().toISOString(), baseUrl: ["responsive", "accessibility"].includes(MODE) ? BASE : null,
    checks: checks.length, passed, failed: checks.length - passed, results: checks, ...extra,
  }, null, 2) + "\n");
  console.log(`\n${MODE}: ${passed}/${checks.length} checks passed → ${OUT}/${file}`);
  process.exit(passed === checks.length ? 0 : 1);
}
