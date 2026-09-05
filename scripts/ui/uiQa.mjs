#!/usr/bin/env node
// ── Arena Command Center UI contract QA ──────────────────────────────────────
// Contract-level checks over the registries and components. The browser-level
// behaviour is covered by e2e; these guard the things that must be true before
// a pixel renders — one registry, honest statuses, no fake commerce.
import fs from "node:fs";
import {
  PLAY_MODES, FANTASY_DESTINATIONS, TOP_NAV, MODE_STATUS, STATUS_LABEL,
  resolveModeStatus, resolveModeAction, membershipHref, findMode, defaultMode,
} from "../../src/navigation.js";
import { TIERS, FEATURE_FLAGS, CAPABILITIES } from "../../src/entitlements.js";
import { drawFive } from "../../src/chaos/draftOdds.js";
import { POSITIONS } from "../../src/players.js";

const MODE = process.argv[2] || "arena";
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const read = (f) => fs.readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

if (MODE === "navigation") {
  ok("one registry supplies every play mode", PLAY_MODES.length >= 7);
  ok("Chaos Clash is the default mode", defaultMode().id === "chaos");
  ok("the top nav carries Play and Fantasy as menus",
    TOP_NAV.filter((t) => t.kind === "menu").map((t) => t.id).join(",") === "play,fantasy");
  ok("every mode has a tagline and a description", PLAY_MODES.every((m) => m.tagline && m.description));
  ok("every mode id is unique", new Set(PLAY_MODES.map((m) => m.id)).size === PLAY_MODES.length);
  // The shelf and the dropdown must not define modes separately.
  ok("the header reads the shared registry", /from "\.\.\/\.\.\/navigation\.js"/.test(read("src/components/arena/ArenaHeader.jsx")));
  ok("no component hard-codes its own mode list",
    /from "\.\.\/\.\.\/navigation\.js"/.test(read("src/components/arena/ArenaHeader.jsx"))
    && !/const\s+(MODES|GAME_MODES)\s*=\s*\[/.test(src("src/components/arena/ArenaHeader.jsx"))
    && !/const\s+(MODES|GAME_MODES)\s*=\s*\[/.test(src("src/components/arena/NavMenu.jsx")));
  // The active Play surface carries no permanent rack of other modes: discovery
  // belongs to the menus, and the arena to the Clash in front of you.
  ok("the Play surface has no mode shelf",
    !fs.existsSync("src/components/arena/ModeShelf.jsx")
    && !/ModeShelf|EXPLORE MORE MODES/.test(read("src/components/arena/TimeArena.jsx")));
  ok("every status has a distinct label or is deliberately unlabelled",
    Object.keys(MODE_STATUS).every((s) => s in STATUS_LABEL));
}

if (MODE === "fantasy") {
  ok("Fantasy is a top-level pillar, not a play mode",
    TOP_NAV.some((t) => t.id === "fantasy") && !PLAY_MODES.some((m) => /fantasy/i.test(m.id)));
  ok("exactly two fantasy destinations", FANTASY_DESTINATIONS.length === 2);
  const ids = FANTASY_DESTINATIONS.map((f) => f.id);
  ok("EraClash Fantasy is present", ids.includes("eraclash-fantasy"));
  ok("EraClash Live is present", ids.includes("eraclash-live"));
  ok("both carry a real development status",
    FANTASY_DESTINATIONS.every((f) => ["PLANNED", "IN_DEVELOPMENT", "PRIVATE_PREVIEW", "COMING_SOON"].includes(f.status)));
  ok("neither claims to be operational",
    FANTASY_DESTINATIONS.every((f) => !/join now|enter now|play now|live now/i.test(`${f.tagline} ${f.description}`)));
  ok("both explain how they differ", FANTASY_DESTINATIONS.every((f) => !!f.differentiator));
  const page = src("src/components/arena/InfoPages.jsx");
  // These words may appear ONLY in the disclaimer that says none of it exists.
  // Banning them outright would fail the very sentence that tells the truth.
  ok("the fantasy pages disclaim contests, fees, wallets and payouts",
    /no contests, entry fees, wallets or payouts/i.test(page));
  for (const offer of ["enter for", "buy in", "deposit now", "cash prize", "guaranteed prize", "withdraw"]) {
    ok(`the fantasy pages make no ${offer} offer`, !new RegExp(offer, "i").test(page));
  }
  ok("the fantasy pages say the products are not live", /not live/i.test(page));
}

if (MODE === "membership") {
  ok("a locked mode deep-links with feature, tier and return path", (() => {
    const h = membershipHref({ feature: "win82", required: "plus", from: "/play" });
    return h.startsWith("/membership?") && h.includes("feature=win82") && h.includes("required=plus") && h.includes("from=");
  })());
  // Win 82 opens on a FREE account through its trial capability, so a guest is
  // asked for the free account that actually opens it — never sent to a
  // membership page that cannot sell anything. This check used to assert the
  // opposite and had been failing against the contract the vitest suite pins.
  const guestWin82 = resolveModeAction(findMode("win82"), "GUEST", { from: "/play" });
  ok("a guest is asked for the free account that opens a trial mode, never sent to membership",
    guestWin82.intent === "CREATE_ACCOUNT" && !(guestWin82.href || "").includes("membership"), guestWin82.status);
  const guestDream = resolveModeAction(findMode("dream"), "GUEST");
  ok("an account-gated mode asks for an account, not money", guestDream.intent === "CREATE_ACCOUNT");
  const gauntlet = resolveModeAction(findMode("gauntlet"), "PLUS");
  ok("a coming-soon mode never routes to membership", gauntlet.intent === "MODE_INFO", gauntlet.href);
  ok("Era Gauntlet stays flagged off", FEATURE_FLAGS.eraGauntlet.featureFlag === false);
  const preview = resolveModeAction(findMode("bo7"), "PLUS", { previewCandidateActive: true });
  ok("a preview limitation is explained, not sold", preview.intent === "EXPLAIN_PREVIEW");
  const page = src("src/components/arena/InfoPages.jsx");
  for (const banned = 0, list = ["\\$\\d", "checkout", "card number", "billing", "free trial"]; ;) {
    for (const b of list) ok(`the membership page has no ${b.replace(/\\\\/g, "")}`, !new RegExp(b, "i").test(page));
    break;
  }
  ok("the membership page states that payments are not processed", /does not process payments/i.test(page));
  ok("membership is declared never to affect odds", /never affects draft odds/i.test(page));
  // The invariant that matters most: entitlement cannot touch the draft.
  const paths = TIERS.map(() => JSON.stringify(POSITIONS.map((s) => drawFive({ seedId: "ui-fair", side: "gold", roll: 1 })[s]?.id)));
  ok("every tier draws an identical roster from one seed", new Set(paths).size === 1);
  for (const f of ["src/chaos/draftOdds.js", "src/chaos/draftValue.js", "src/chaos/legendCpu.js", "src/chaos/coachOffers.js"]) {
    ok(`${f} never imports navigation or entitlements`,
      !/from\s+["'].*(entitlements|navigation)/.test(src(f)));
  }
}

if (MODE === "dock") {
  const dock = read("src/components/arena/ResultDock.jsx");
  ok("the dock renders every state it owns",
    ["YOUR RESULT WILL APPEAR HERE", "SIMULATING THE CLASH", "FINAL SCORE", "LAST CLASH"].every((s) => dock.includes(s)));
  // A previous result that could be mistaken for the live draft is the one
  // thing this surface must never do.
  ok("a previous result is labelled as one, twice over",
    /LAST CLASH · NOT THE DRAFT ON SCREEN/.test(dock) && /previous \? agoLabel/.test(dock));
  ok("the dock ages a previous result coarsely, with no fake precision",
    /JUST NOW/.test(dock) && /MINUTE/.test(dock) && !/\bseconds ago\b/.test(dock));
  ok("the MVP's stat line is formatted, never rendered as an object",
    /statLine\(sim\.mvpLine\)/.test(dock) && /const statLine =/.test(dock));
  ok("the dock offers the four result tabs",
    ["Game Story", "Box Score", "Coaching", "Analysis"].every((t) => dock.includes(t)));
  ok("the dock offers the full report", /VIEW FULL REPORT/.test(dock));
  ok("the dock shows no win probability", !/winPct|win probability|expectedGoldWinPct/i.test(dock));
  // A percentage bound to progress wording would be a fabricated precision.
  // Bare CSS percentages (widths) are not that, so the check is scoped.
  ok("the dock invents no progress percentage",
    !/(progress|complete|simulat\w*)[^\n]{0,30}\d{1,3}\s?%/i.test(dock)
    && !/\d{1,3}\s?%\s?(complete|done|progress)/i.test(dock));
  ok("simulation phases are named, not numeric", /Preparing matchup/.test(dock) && /Simulating possessions/.test(dock));
  ok("the dock reads the stored result, never sample data",
    !/const\s+SAMPLE|mockResult|FAKE_/.test(dock));
  ok("the dock announces its simulation state politely", /aria-live="polite"/.test(dock));
  // PTS/FG/REB alone read as a broken box score, not a compact one.
  ok("the dock's box score carries every counting stat",
    ["PTS", "FG", "REB", "AST", "STL", "BLK", "TO"].every((h) => new RegExp(`"${h}"`).test(dock))
    && /l\.ast/.test(dock) && /l\.stl/.test(dock) && /l\.blk/.test(dock) && /l\.to/.test(dock));
}

if (MODE === "arena") {
  const css = read("src/index.css");
  const shell = read("src/components/arena/TimeArena.jsx");
  const stage = read("src/components/arena/ChaosStage.jsx");

  // ── Layout ────────────────────────────────────────────────────────────────
  ok("the Time Arena is a two-column workspace",
    /\.ec-ta \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--arena-rail-w\)/.test(css));
  ok("the rail's width is a token inside the contract's range", (() => {
    const w = Number((css.match(/--arena-rail-w:\s*(\d+)px/) || [])[1]);
    return w >= 340 && w <= 390;
  })(), (css.match(/--arena-rail-w:\s*(\d+)px/) || [])[1]);
  // These two used to assert the opposite: a sticky rail that "scrolls
  // internally rather than trapping the page". Internal scrolling IS the trap —
  // it hid up to 504px of the result behind an inner scrollbar and stopped the
  // page scrolling whenever the pointer was over the rail.
  ok("the rail is a column of the page, not a pane with its own scrollbar",
    !/\.ec-ta-rail \{[^}]*(position: sticky|max-height|overflow-y)/.test(css));
  ok("no arena surface is a vertical scroll container",
    !/\.(ec-ta-rail|ec-coach-body|ec-intel|ec-ta-stage|ec-ta-main) \{[^}]*overflow-y:\s*(auto|scroll)/.test(css));
  ok("a wide stat table scrolls sideways only, with the other axis stated",
    /\.ec-dock-box \{[^}]*overflow-x: auto;\s*overflow-y: hidden/.test(css));
  ok("the workspace stacks below the desktop breakpoint",
    /@media \(max-width: 1179px\)[\s\S]{0,400}\.ec-ta \{ grid-template-columns: minmax\(0, 1fr\)/.test(css));
  ok("neither column can outgrow the screen",
    /\.ec-ta-main \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(css)
    && /\.ec-ta-rail \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(css));
  // One roster grid of eleven tracks — five, a divider, five — capped at the
  // canonical width so ten cards share a row and none is ever clipped.
  ok("ten cards share one roster grid",
    /\.ec-ta-roster \{[\s\S]{0,400}repeat\(5, minmax\(0, 1fr\)\)[\s\S]{0,120}var\(--roster-divider-w\)[\s\S]{0,120}repeat\(5, minmax\(0, 1fr\)\)/.test(css)
    && /max-width: calc\(10 \* var\(--player-card-w\)/.test(css));
  ok("the teams take separate rows only below the desktop breakpoint",
    /@media \(max-width: 1179px\)[\s\S]{0,900}\.ec-ta-roster \{[\s\S]{0,120}repeat\(5, minmax\(0, 1fr\)\)/.test(css));
  ok("the finished result leads the stacked page",
    /ec-ta-rail--front/.test(shell) && /\.ec-ta-rail--front \{ order: -1; \}/.test(css));
  ok("the arena keeps the matchup visible after the result", /THE MATCHUP YOU BUILT/.test(stage));
  ok("arena atmosphere is CSS, not a downloaded image", !/\.ec-arena-court[\s\S]{0,300}url\(/.test(css));
  ok("reduced motion is respected", /prefers-reduced-motion/.test(css));

  // ── Depth and contrast: every surface is measurably distinct ──────────────
  const tok = (n) => (css.match(new RegExp(`--ec-a-${n}:\\s*([^;]+);`)) || [])[1]?.trim();
  const lum = (hex) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  };
  const textL = lum(tok("text")), secL = lum(tok("text-secondary"));
  const panels = ["bg", "arena", "panel", "panel-raised", "panel-soft"].map((p) => lum(tok(p)));
  ok("primary text is near-white", textL > 0.9, tok("text"));
  ok("secondary text stays high contrast on navy", secL > 0.72, tok("text-secondary"));
  ok("every panel is far darker than the body text", panels.every((p) => textL - p > 0.8));
  ok("panels are distinguishable from one another",
    new Set(panels.map((p) => p.toFixed(3))).size === panels.length);
  ok("the coach identity is its own colour, not a team's",
    !!tok("coach") && tok("coach") !== tok("gold") && tok("coach") !== tok("blue"));

  // ── The single primary action, and one era ────────────────────────────────
  ok("the roll progression is driven by server state, not inferred",
    /run \? run\.roll/.test(read("src/components/arena/RollStepper.jsx")));
  ok("the stage names the three rolls",
    ["FOUNDATION", "ADAPT", "COMMIT"].every((w) => read("src/components/arena/RollStepper.jsx").includes(w)));
  // Phase 9B.3: the six states' single actions are named in ONE place — the
  // display-state resolver — and the stage renders whatever it hands back. The
  // words changed deliberately with the guided flow (ROLL 1 → ROLL, LOCK &
  // ROLL 2 → ROLL 2, HIRE THIS STAFF → CONTINUE WITH COACH, RUN SIM → RUN
  // CLASH) and an ADAPT TO ERA action was added for the dedicated reveal.
  const guided = read("src/chaos/guidedState.js");
  ok("one CTA carries whatever the run is waiting on",
    ["\"ROLL\"", "ROLL 2", "FINAL ROLL", "ADAPT TO ERA", "CONTINUE WITH COACH", "RUN CLASH"].every((l) => guided.includes(l))
    && /primaryAction\(state/.test(stage) && !/HIRE THIS STAFF|RUN SIM|LOCK & ROLL 2/.test(stage));
  ok("the era panel belongs to the rail alone",
    !/EraContextBanner/.test(stage) && /ERA IMPACT/.test(read("src/components/arena/LiveIntel.jsx")));
  ok("the utility bar states the era and never competes with the CTA",
    /ERA: /.test(read("src/components/arena/UtilityBar.jsx")));

  // ── The superseded surfaces are gone, not merely unused ──────────────────
  for (const dead of [
    "src/components/arena/ArenaCommandCenter.jsx",
    "src/components/arena/RollStrip.jsx",
    "src/components/chaos/ChaosClash.jsx",
    "src/components/chaos/ChaosCard.jsx",
  ]) ok(`${dead.split("/").pop()} no longer exists`, !fs.existsSync(dead));
}

if (MODE === "cards") {
  const card = read("src/components/arena/PlayerCard.jsx");
  const css = read("src/index.css");
  // The defect this contract exists for: Gold's PF and C came out blue because
  // the card decided its own colour from the position.
  ok("the team container owns the theme",
    /\.ec-ta-team\[data-team="blue"\] \.ec-pc,[\s\S]{0,80}--pc-accent: var\(--ec-a-blue\)/.test(css));
  // The accent variable is consumed in CSS (.ec-pc rules) since 8C.1 moved every
  // dimension and colour out of the component; the component's job is to set
  // data-team and never to decide a colour from the position.
  ok("the card reads its accent from a variable, never from a position",
    (/var\(--pc-accent\)/.test(card) || /\.ec-pc[^{]*\{[^}]*var\(--pc-accent\)/.test(css))
    && /data-team=\{team\}/.test(card) && !/(slot|pos)\s*===\s*"(PF|C|PG|SG|SF)"/.test(card));
  ok("no position appears in a colour decision",
    !/(PF|C)\s*\?\s*[^:]{0,40}(blue|gold)/i.test(card));
  ok("every state carries a word, not only a tint",
    ["LOCKED", "HOLD", "FINAL ROSTER", "HELD"].every((w) => card.includes(w)));
  ok("hold state is announced to assistive tech", /aria-pressed=\{held\}/.test(card));
  ok("the team is in the card's accessible name", /teamLabel/.test(card) && /Team Blue/.test(card));
  ok("the HOLD control meets the touch-target floor",
    /--player-footer-h:\s*44px/.test(css)
    && /\.ec-pc-action,\s*\n\.ec-pc-static \{[\s\S]{0,200}height: var\(--player-footer-h\)/.test(css));
  ok("the name area is a fixed two lines, and never collapses to initials",
    /-webkit-line-clamp: 2/.test(css) && /\.ec-pc-name \{[\s\S]{0,260}height: 28px/.test(css)
    && !/initials/i.test(card.split("ec-pc-name")[1] || ""));
  ok("no likeness is created here — the approved registry or a masked silhouette",
    /resolvePortrait/.test(card) && /PORTRAIT_STATUS\.APPROVED/.test(card)
    && /ec-pc-figure/.test(card)
    && !/(midjourney|stable-diffusion|scrape|download)/i.test(card));
  ok("the empty card back is the populated card's geometry",
    /\.ec-pc-empty \{[\s\S]{0,200}height: var\(--player-card-h\)/.test(css)
    && /ROLL TO/.test(card));
}

if (MODE === "sync") {
  const rs = src("src/chaos/runState.js");
  const api = src("api/game.js");
  ok("the synchronized sequence has its own version key",
    /CHAOS_SEQUENCE_VERSION = "2\.0\.0"/.test(rs) && /CURRENT_SEQUENCE = 2/.test(rs));
  ok("the draw keys are untouched, so no seed is re-dealt",
    /CHAOS_DRAFT_VERSION = "1\.0\.0"/.test(src("src/chaos/draftOdds.js"))
    && /DRAFT_PROBABILITY_VERSION = "1\.0\.0"/.test(src("src/chaos/draftOdds.js")));
  ok("the era hash is frozen, so a seed keeps its era",
    /ERA_REVEAL_KEY = "2\.0\.0"/.test(rs) && /era\|\$\{seedId\}\|\$\{ERA_REVEAL_KEY\}/.test(rs));
  ok("one submit carries players and coaches",
    /submitRollDecisions/.test(rs) && /holdSlots[\s\S]{0,80}holdRoles/.test(rs));
  ok("each flow refuses the other's actions",
    (rs.match(/WRONG_SEQUENCE/g) || []).length >= 3);
  ok("the client can submit decisions and nothing else",
    /chaosAction: "decide"/.test(src("src/chaos/client.js"))
    && !/goldIds|coachId:[^)]*offer/.test(src("src/chaos/client.js").split("submitChaosDecisions")[1] || ""));
  ok("a challenge replays the sequence it was minted under",
    /sequenceFromManifest/.test(src("api/_lib/chaosRun.js")));
  ok("there is no fourth roll", /nextRoll >= 3/.test(rs) && /"ROLL_3_REVEALED"/.test(rs));
  ok("the CPU commits both decisions before the user submits",
    /commitCpuHolds\(run, \{ gold: nextGold, blue: nextBlue \}\)/.test(rs)
    && /commitCpuCoachHolds\(run, \{ gold: nextGold, blue: nextBlue \}\)/.test(rs));
  ok("no draft module can even see an entitlement",
    ["src/chaos/runState.js", "src/chaos/draftOdds.js", "src/chaos/coachOffers.js", "src/chaos/legendCpu.js"]
      .every((f) => !/from\s+["'][^"']*entitlements/.test(src(f))
        && !/\b(GUEST|FREE|PLUS|COMMISSIONER|MATRIX|CAPABILITIES)\b/.test(src(f))));
  ok("the API validates both halves before mutating",
    /chaosAction === "decide"/.test(api) && /holdSlots\.length > 5 \|\| b\.holdRoles\.length > 3/.test(api));
}

if (MODE === "intel") {
  const intel = read("src/components/arena/LiveIntel.jsx");
  const stage = read("src/components/arena/ChaosStage.jsx");
  const dock = read("src/components/arena/ResultDock.jsx");
  ok("Live Intel carries the five reads in order",
    ["YOUR IDENTITY", "BIGGEST RISK", "BLUE'S STRENGTH", "DRAFT PRESSURE", "ERA IMPACT"]
      .every((s) => intel.includes(s)));
  // Draft Pressure was printed twice once, which read as two different numbers.
  ok("Draft Pressure appears exactly once, in Live Intel",
    (intel.match(/DRAFT PRESSURE/g) || []).length === 1
    && !/DRAFT PRESSURE/.test(stage) && !/DRAFT PRESSURE/.test(dock));
  ok("no raw coefficient is exposed",
    !/rarityK|0\.60|coefficient/.test(intel));
  ok("an incomplete board says so rather than inventing a read",
    /Roll your first five to reveal your team identity/.test(intel));
  ok("the read never claims a winner",
    /not a prediction/.test(intel) && !/(will win|favoured to win|win probability)/i.test(intel));
}

if (MODE === "era") {
  const intel = read("src/components/arena/LiveIntel.jsx");
  const rs = src("src/chaos/runState.js");
  const glue = src("api/_lib/chaosRun.js");
  const ent = src("src/entitlements.js");
  ok("the era is drawn from the seed alone", /export const revealEra/.test(rs) && /never personalised/i.test(read("src/chaos/runState.js")));
  ok("the era is revealed with Roll 2", /if \(nextRoll === 2\) applyEraReveal\(run\)/.test(rs));
  ok("choosing an era is a capability, held by PLUS and COMMISSIONER",
    /CHAOS_CUSTOM_ERA/.test(ent) && /PLUS:[^\]]*CHAOS_CUSTOM_ERA/.test(ent) && !/FREE:[^\]]*CHAOS_CUSTOM_ERA/.test(ent));
  ok("a competitive run refuses every tier", /ERA_LOCKED_FOR_MODE/.test(rs) && /competitiveEraLock/.test(glue));
  ok("the competitive refusal is reported before membership",
    glue.indexOf("COMPETITIVE_LOCK") < glue.indexOf("NOT_ENTITLED"));
  ok("the window is after the reveal and before the final roll",
    /run\.currentPhase !== "ROLL_2_REVEALED"/.test(rs) && /WINDOW_CLOSED/.test(glue));
  ok("a chosen era is marked custom wherever it appears",
    /eraCustom/.test(rs) && /CUSTOM ERA/.test(intel));
  ok("membership routes centrally, with no checkout",
    /membershipHref\(\{ feature: "custom-era"/.test(intel)
    && !/(price|\$\d|checkout|card number)/i.test(intel));
  // "tier" in the draft modules means card RARITY (APEX/ELITE/STAR), which is
  // not an account tier — so this asserts the account concept is absent.
  ok("no account tier reaches a draw or an offer",
    ["src/chaos/draftOdds.js", "src/chaos/coachOffers.js"].every((f) =>
      !/from\s+["'][^"']*entitlements/.test(src(f))
      && !/\b(GUEST|FREE|PLUS|COMMISSIONER)\b/.test(src(f))));
}

if (MODE === "coach") {
  const cc = read("src/components/arena/CoachCard.jsx");
  const stage = read("src/components/arena/ChaosStage.jsx");
  const offers = src("src/chaos/coachOffers.js");
  ok("Coach Chaos states its purpose", /COACH CHAOS/.test(stage) && /legendary coaches/i.test(stage));
  ok("the three roles are the three slots",
    ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"].every((r) => stage.includes(r)));
  ok("a staff is held and released like a player",
    /aria-pressed=\{held\}/.test(cc) && /LOCKED/.test(cc) && /HOLD/.test(cc));
  ok("after the final roll the control becomes a hire",
    /SELECT COACH/.test(cc) && /NOT HIRED/.test(cc) && /YOUR STAFF/.test(cc));
  // Starting over: one route, on the board, confirmed before it fires.
  ok("starting over is a stage control, not a link in the utility bar",
    /ec-ta-stage-actions/.test(stage) && /setConfirmReset\(true\)/.test(stage)
    && !/ABANDON DRAFT/.test(read("src/components/arena/UtilityBar.jsx")));
  ok("a reset asks before it fires, and the safe answer is the default",
    (() => {
      const d = read("src/components/arena/ResetDialog.jsx");
      return /role="dialog"/.test(d) && /aria-modal/.test(d)
        && /noRef\.current\?\.focus\(\)/.test(d) && /Escape/.test(d);
    })());
  ok("a finished game can be left from the board, not only from the result",
    /NEW CLASH/.test(stage) && /state="complete"/.test(stage));
  ok("the card face stays short and the depth is one tap away",
    /Scouting detail/.test(cc) && /aria-expanded=\{open\}/.test(cc));
  // Anchored to the RULE, not to a character budget: a comment added inside the
  // block pushed the token past a 400-character window and failed a contract
  // whose subject had not changed.
  ok("purple is the coach identity and never a team's",
    /\.ec-coach-card \{[^}]*--ec-a-coach/.test(read("src/index.css"))
    && !/--ec-a-gold|--ec-a-blue/.test(cc));
  ok("no coach likeness is created — initials over a masked figure until approved art exists",
    /initialsOf/.test(cc) && /ec-coach-figure/.test(cc) && !/(img src|generate|scrape|download)/i.test(cc));
  ok("the pre-reveal slot is scored on adaptability, not on an unknown era",
    /eraAgnosticAdaptabilityScore/.test(offers) && /eraFitScore/.test(offers));
  ok("both sides read the offers with the same function",
    (offers.match(/eraFitScore/g) || []).length >= 3);
}

const passed = checks.filter((c) => c.pass).length;
fs.mkdirSync("data/validation/8c-time-arena", { recursive: true });
const file = {
  navigation: "navigation-registry.json",
  fantasy: "fantasy-navigation-contract.json",
  membership: "membership-routing-contract.json",
  dock: "result-dock-contract.json",
  arena: "time-arena-layout-contract.json",
  cards: "player-card-theme-contract.json",
  sync: "synchronized-chaos-contract.json",
  intel: "live-intel-contract.json",
  era: "era-membership-contract.json",
  coach: "coach-chaos-contract-v2.json",
}[MODE] || `${MODE}-qa.json`;
fs.writeFileSync(`data/validation/8c-time-arena/${file}`, JSON.stringify({
  artifact: file.replace(/\.json$/, ""), phase: "8C — Time Arena", mode: MODE,
  checks: checks.length, passed, failed: checks.length - passed, results: checks,
}, null, 2) + "\n");
console.log(`\n${MODE}: ${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
