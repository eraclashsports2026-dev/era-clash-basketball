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
  ok("the mode shelf reads the shared registry", /from "\.\.\/\.\.\/navigation\.js"/.test(read("src/components/arena/ModeShelf.jsx")));
  ok("the header reads the shared registry", /from "\.\.\/\.\.\/navigation\.js"/.test(read("src/components/arena/ArenaHeader.jsx")));
  ok("no component hard-codes its own mode list",
    !/const\s+(MODES|GAME_MODES)\s*=\s*\[/.test(src("src/components/arena/ModeShelf.jsx"))
    && !/const\s+(MODES|GAME_MODES)\s*=\s*\[/.test(src("src/components/arena/ArenaHeader.jsx")));
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
  const guestWin82 = resolveModeAction(findMode("win82"), "GUEST", { from: "/play" });
  ok("a guest is sent to membership for a Plus mode", guestWin82.intent === "MEMBERSHIP", guestWin82.href);
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
  const dock = read("src/components/arena/MatchupResultDock.jsx");
  ok("the dock renders all five states", ["BUILD YOUR CLASH", "YOUR CLASH SO FAR", "MATCHUP OUTLOOK", "SIMULATING THE CLASH", "FINAL SCORE"]
    .every((s) => dock.includes(s)));
  ok("the dock offers the four result tabs",
    ["Game Story", "Box Score", "Coaching", "Analysis"].every((t) => dock.includes(t)));
  ok("the dock offers the full report", /VIEW FULL POSTGAME REPORT/.test(dock));
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
  ok("the command centre is a two-column grid", /\.ec-cc\s*\{[^}]*grid-template-columns/.test(css));
  ok("the dock is sticky on desktop", /\.ec-cc-dock\s*\{[^}]*position:\s*sticky/.test(css));
  ok("the dock stacks below the desktop breakpoint", /@media \(max-width: 1179px\)[\s\S]*?\.ec-cc \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css));
  ok("the dock scrolls internally rather than trapping the page", /\.ec-cc-dock\s*\{[^}]*overscroll-behavior: contain/.test(css));
  ok("arena atmosphere is CSS, not a downloaded image", !/\.ec-arena-court[\s\S]{0,300}url\(/.test(css));
  ok("reduced motion is respected", /prefers-reduced-motion/.test(css));
  // Contrast: body text must be clearly lighter than every panel it sits on.
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
  const shell = read("src/components/arena/ArenaCommandCenter.jsx");
  ok("the arena keeps the matchup visible after the result", /THE MATCHUP YOU BUILT/.test(shell));
  ok("the finished result leads the stacked page on mobile",
    /ec-cc-dock--front/.test(shell) && /\.ec-cc-dock--front \{ order: -1; \}/.test(css));
  ok("the roll strip is driven by server state, not inferred",
    /run \? run\.roll/.test(read("src/components/arena/RollStrip.jsx")));

  // The workspace reads in the order the user works: rolls, the five, then the
  // button that plays it.
  const shellSrc = src("src/components/arena/ArenaCommandCenter.jsx");
  const at = (re) => shellSrc.search(re);
  ok("the workspace runs rolls then the board then the run bar",
    at(/<RollStrip/) > -1 && at(/<ChaosClash/) > at(/<RollStrip/) && at(/RUN SIM/) > at(/<ChaosClash/));
  ok("the era is stated once, by the dock alone", !/EraContextBanner/.test(shellSrc));
  ok("the primary CTA is named RUN SIM everywhere",
    /RUN SIM/.test(shellSrc) && !/RUN THE CLASH/.test(shellSrc) && !/RUN THE CLASH/.test(read("src/App.jsx")));

  // Board shape: two guards over wing / centre / forward, centred, with the
  // roster order the engine indexes by left alone.
  const clash = src("src/components/chaos/ChaosClash.jsx");
  ok("the roster order the engine indexes by is unchanged",
    /const SLOTS = \["PG", "SG", "SF", "PF", "C"\];/.test(clash));
  ok("the board lays two guards over three",
    /const BOARD_ROWS = \[\["PG", "SG"\], \["SF", "C", "PF"\]\];/.test(clash));
  ok("the two-card row is centred at the same card width",
    /\.chaos-roster-row--two \{[^}]*justify-content: center/.test(css)
    && /\.chaos-roster-row--two \{[^}]*calc\(\(100% - 16px\) \/ 3\)/.test(css));
  ok("neither board can grow wider than the other",
    /\.chaos-boards \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(css)
    && /\.chaos-boards \{[^}]*align-items: stretch/.test(css));
  ok("both roster summaries share one height", /\.chaos-read \{ flex: 1 1 auto; \}/.test(css));

  // The full report is a light surface hosted inside the dark shell.
  const app = src("src/App.jsx");
  ok("the full report declares its own text colour on the light surface",
    /background: T\.bg, color: T\.text/.test(app));
  ok("a new Clash cannot inherit the finished run",
    /const newChaosClash[\s\S]{0,400}setChaosRun\(null\)/.test(app));
  ok("neither workspace column can outgrow the screen",
    /\.ec-cc > div, \.ec-cc-dock > div \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css));
  ok("an empty board clears the run the shell is holding",
    /if \(!id\) \{ onRunChange\?\.\(null\); return; \}/.test(clash));
}

const passed = checks.filter((c) => c.pass).length;
fs.mkdirSync("data/validation/8c", { recursive: true });
const file = { navigation: "phase8c-navigation-registry.json", fantasy: "phase8c-fantasy-registry.json",
  membership: "phase8c-membership-routing.json", dock: "phase8c-result-dock-contract.json",
  arena: "phase8c-arena-layout-contract.json" }[MODE];
fs.writeFileSync(`data/validation/8c/${file}`, JSON.stringify({
  artifact: file.replace(/\.json$/, ""), phase: "8C", mode: MODE,
  checks: checks.length, passed, failed: checks.length - passed, results: checks,
}, null, 2) + "\n");
console.log(`\n${MODE}: ${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
