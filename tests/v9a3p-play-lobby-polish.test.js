// ── Phase 9A.3P: Play Lobby polish — brand, CTA hierarchy, action language,
//    adaptive hero, mode signatures, registry authority, preservation ─────────
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  PLAY_MODES, MODE_STATUS, ACTION_LABEL, ACTION_HIERARCHY, ACCENT_ROLE, NAVIGATION_REGISTRY_VERSION, LOBBY_PRESENTATION_VERSION,
  actionLabelFor, actionHierarchyFor, accessibleActionName, resolveModeAction, resolveModeStatus, requiresAccount, findMode, lobbyModes,
} from "../src/navigation.js";
import { TIERS } from "../src/entitlements.js";
import { SIGNATURE_IDS } from "../src/components/lobby/signatureIds.js";
import { HERO_STATES, HERO_STATE_IDS, HERO_LINE, resolveHeroState } from "../src/components/lobby/heroState.js";
import { EVENTS_ALLOWLIST } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";

const read = (f) => readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const json = (f) => JSON.parse(read(f));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const PARENT = "ef0caa525c4cf6830fe20b4a8ef5d483e29afd86"; // Phase 9A.3 head = stable Wave 2 head
const git = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const parentAvailable = () => git(`git cat-file -t ${PARENT}`) === "commit";

const LABELS = { chaos: "Start Chaos Clash", dream: "Build Matchup", daily: "Play Today’s Clash", bo7: "Start Series", win82: "Start Season", tournament: "Enter Tournament", gauntlet: "Learn More" };
const SIGS = { chaos: "fracture-dice", dream: "crossing-timelines", daily: "spotlight-calendar", bo7: "series-ticks", win82: "season-arc", tournament: "bracket", gauntlet: "era-steps" };
const ACCENTS = { chaos: "gold", dream: "platinum-cobalt", daily: "cobalt", bo7: "platinum-gold", win82: "cobalt-platinum", tournament: "gold-platinum", gauntlet: "violet" };

describe("owner acceptance", () => {
  const REC = "data/validation/9a3p/play-lobby-polish-v1-owner-acceptance.json";
  // Each promotion flag may be true ONLY when its own authorization record exists
  // carrying the exact text. Written this way deliberately: a hard-coded `false`
  // became a stale pin at the Phase 9A.3 head when a later record-only commit
  // flipped one of these, so the assertion tracks the authorising artifact instead.
  const AUTHORIZERS = {
    wave2PromotionAuthorized: ["data/validation/9a3p/wave2-promotion-authorization.json", "AUTHORIZE WAVE 2 PROMOTION"],
    wave1PromotionAuthorized: ["data/validation/9a3p/wave1-promotion-authorization.json", "AUTHORIZE WAVE 1 PROMOTION"],
    parentMergeAuthorized: ["data/validation/9a3p/parent-merge-authorization.json", "AUTHORIZE PARENT MERGE"],
    productionPromotionAuthorized: ["data/validation/9a3p/production-promotion-authorization.json", "AUTHORIZE PRODUCTION PROMOTION"],
    testerDistributionAuthorized: ["data/validation/9a3p/polish-distribution-authorization.json", "AUTHORIZE POLISH DISTRIBUTION"],
    phase9bAuthorized: ["data/validation/9a3p/phase9b-authorization.json", "AUTHORIZE PHASE 9B"],
  };
  it("is recorded with the exact text, the branch-preview scope and the build it was reviewed on", () => {
    expect(existsSync(REC)).toBe(true);
    const a = json(REC);
    expect(a.acceptanceText).toBe("APPROVE PLAY LOBBY POLISH V1");
    expect(a.acceptanceAuthority).toBe("OWNER");
    expect(a.status).toBe("OWNER_ACCEPTED_ON_BRANCH_PREVIEW");
    expect(a.lobbyPresentationVersion).toBe(LOBBY_PRESENTATION_VERSION);
    expect(a.implementationBranch).toBe("phase-9a3p-play-lobby-brand-polish");
    expect(a.parent.commit).toBe(PARENT);
    expect(a.reviewedOn.buildStamp).toBe(json("data/validation/9a3p/lobby-preview-qa.json").deployment.buildStamp);
    expect(a.doesNotMean).toContain("production promotion");
    expect(a.doesNotMean).toContain("authorisation to begin Phase 9B");
  });
  it("authorises no promotion, merge, distribution or Phase 9B without its own authorization record", () => {
    const a = json(REC);
    for (const [flag, [file, text]] of Object.entries(AUTHORIZERS)) {
      expect(flag in a, flag).toBe(true);
      if (a[flag]) expect(existsSync(file) && json(file).authorizationText, flag).toBe(text);
      else expect(existsSync(file), `${flag} is false, so ${file} must not exist`).toBe(false);
    }
  });
  it("did not move the frozen builds", () => {
    const a = json(REC);
    expect(a.frozenAtAcceptance.stableWave2.head).toBe(PARENT);
    expect(a.frozenAtAcceptance.stableWave2.carriesPolish).toBe(false);
    expect(a.frozenAtAcceptance.stableWave2.buildStamp).toBe("eraclash-assets:2.7.2:d3d5455dcf91");
    expect(a.frozenAtAcceptance.wave1.buildStamp).toBe("eraclash-assets:2.7.2:2f35a3b70c30");
    expect(a.frozenAtAcceptance.main).toBe("9cd95ff8797f8cdef252bbe67d63158c01b9f9bd");
  });
  it("does not claim live tester activity it could not read", () => {
    expect(json(REC).humanTestActivity).toMatch(/not a claim that no tester activity exists/i);
  });
});

describe("the registry carries the lobby's presentation contract", () => {
  it("bumped its version for the presentation fields", () => { expect(NAVIGATION_REGISTRY_VERSION).toBe("1.2.0"); expect(LOBBY_PRESENTATION_VERSION).toBe("play-lobby-polish-v1"); });
  it("every mode declares actionLabel, actionVerb, actionHierarchy, visualSignature and accentRole", () => {
    for (const m of PLAY_MODES) {
      expect(m.actionLabel, m.id).toBeTruthy(); expect(m.actionVerb, m.id).toBeTruthy();
      expect(Object.values(ACTION_HIERARCHY), m.id).toContain(m.actionHierarchy);
      expect(SIGNATURE_IDS, m.id).toContain(m.visualSignature);
      expect(Object.values(ACCENT_ROLE), m.id).toContain(m.accentRole);
    }
  });
  it("uses the exact action labels the specification names", () => { for (const [id, label] of Object.entries(LABELS)) expect(findMode(id).actionLabel, id).toBe(label); });
  it("every mode has its own signature and accent role, and no two modes share a signature", () => {
    for (const [id, sig] of Object.entries(SIGS)) expect(findMode(id).visualSignature, id).toBe(sig);
    for (const [id, acc] of Object.entries(ACCENTS)) expect(findMode(id).accentRole, id).toBe(acc);
    expect(new Set(PLAY_MODES.map((m) => m.visualSignature)).size).toBe(PLAY_MODES.length);
    expect(SIGNATURE_IDS.length).toBe(7);
  });
  it("Chaos Clash is the ONLY primary action; every other playable mode is secondary; Era Gauntlet is unavailable", () => {
    expect(PLAY_MODES.filter((m) => m.actionHierarchy === ACTION_HIERARCHY.PRIMARY).map((m) => m.id)).toEqual(["chaos"]);
    expect(findMode("gauntlet").actionHierarchy).toBe(ACTION_HIERARCHY.UNAVAILABLE);
    for (const t of TIERS) {
      const primaries = PLAY_MODES.filter((m) => actionHierarchyFor(m, resolveModeStatus(m, t)) === ACTION_HIERARCHY.PRIMARY).map((m) => m.id);
      expect(primaries, t).toEqual(["chaos"]);
      expect(actionHierarchyFor(findMode("gauntlet"), resolveModeStatus(findMode("gauntlet"), t)), t).toBe(ACTION_HIERARCHY.UNAVAILABLE);
    }
    // A Chaos switched off in this deployment is unavailable, never a gold button to nowhere.
    expect(actionHierarchyFor(findMode("chaos"), resolveModeStatus(findMode("chaos"), "GUEST", { chaosAvailable: false }))).toBe(ACTION_HIERARCHY.UNAVAILABLE);
  });
  it("labels resolve per status: the mode's verb when playable or account-gated, Learn more when coming soon", () => {
    expect(actionLabelFor(findMode("chaos"), MODE_STATUS.AVAILABLE)).toBe("Start Chaos Clash");
    expect(actionLabelFor(findMode("dream"), MODE_STATUS.ACCOUNT_REQUIRED)).toBe("Build Matchup");
    expect(actionLabelFor(findMode("daily"), MODE_STATUS.AVAILABLE)).toBe("Play Today’s Clash");
    expect(actionLabelFor(findMode("gauntlet"), MODE_STATUS.COMING_SOON)).toBe("Learn More");
    expect(actionLabelFor(findMode("chaos"), MODE_STATUS.UNAVAILABLE_HERE)).toBe("Learn more");
    expect(actionLabelFor(findMode("bo7"), MODE_STATUS.DISABLED_FOR_PREVIEW)).toBe("Why not now");
    expect(actionLabelFor(findMode("bo7"), MODE_STATUS.SUBSCRIPTION_REQUIRED)).toBe("About membership");
  });
  it("no status resolves to Open, Continue, Enter or Go as a bare action word", () => {
    for (const s of Object.keys(MODE_STATUS)) for (const m of PLAY_MODES) expect(actionLabelFor(m, s), `${m.id}/${s}`).not.toMatch(/^(Open|Continue|Enter|Go)$/i);
    expect(Object.values(ACTION_LABEL)).not.toContain("Open");
  });
  it("accessible names say the purpose, the mode and the access fact", () => {
    expect(accessibleActionName(findMode("chaos"), MODE_STATUS.AVAILABLE)).toBe("Start Chaos Clash, recommended mode");
    expect(accessibleActionName(findMode("dream"), MODE_STATUS.ACCOUNT_REQUIRED)).toBe("Build Dream Matchup, free account required");
    expect(accessibleActionName(findMode("gauntlet"), MODE_STATUS.COMING_SOON)).toBe("Learn more about Era Gauntlet, coming soon");
    expect(accessibleActionName(findMode("daily"), MODE_STATUS.AVAILABLE)).toBe("Play Daily Clash");
  });
  it("routes, entitlements, availability, continuation and order are exactly the Phase 9A record", () => {
    const rec = json("data/validation/9a/mode-registry-verification.json").registry;
    for (const r of rec) {
      const m = findMode(r.id);
      expect(m.route, r.id).toBe(r.route); expect(m.category, r.id).toBe(r.category); expect(m.recommended, r.id).toBe(r.recommended);
      expect(m.continuationSupport, r.id).toBe(r.continuationSupport); expect(m.implemented, r.id).toBe(r.implemented);
      expect(requiresAccount(m), r.id).toBe(r.requiresAccount);
      for (const [tier, status] of Object.entries(r.statusByTier)) expect(resolveModeAction(m, tier, { from: "/play" }).status, `${r.id}/${tier}`).toBe(status);
    }
    expect(lobbyModes().primary.map((m) => m.id)).toEqual(["chaos", "dream", "daily"]);
    expect(lobbyModes().secondary.map((m) => m.id)).toEqual(["bo7", "win82", "tournament", "gauntlet"]);
  });
});

describe("no duplicated lobby action-label map exists", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : []; });
  it("the seven labels live in src/navigation.js and nowhere else in src/", () => {
    const files = walk("src").filter((f) => f !== "src/navigation.js");
    for (const label of Object.values(LABELS)) for (const f of files) expect(src(f), `${f} carries "${label}"`).not.toContain(label);
  });
  it("the lobby renders labels, hierarchy and names through the registry's resolvers and defines none", () => {
    const lobby = src("src/components/lobby/PlayLobby.jsx");
    expect(lobby).toMatch(/actionLabelFor\(mode, action\.status\)/); expect(lobby).toMatch(/actionHierarchyFor\(mode, action\.status\)/); expect(lobby).toMatch(/accessibleActionName\(mode, action\.status\)/);
    expect(lobby).not.toMatch(/(actionLabel|ACTION_LABEL)\s*[:=]\s*\{/); expect(lobby).not.toMatch(/"Open"|'Open'/);
    expect(lobby).toMatch(/data-hierarchy=\{hierarchy\}/); expect(lobby).toMatch(/data-signature=\{mode\.visualSignature/);
  });
  it("the header and the Play dropdown still read the same registry", () => {
    const header = src("src/components/arena/ArenaHeader.jsx");
    expect(header).toMatch(/PLAY_MODES\.map/); expect(header).not.toMatch(/const\s+(MODES|GAME_MODES|PLAY_MODES)\s*=\s*\[/);
    for (const label of Object.values(LABELS)) expect(header).not.toContain(label);
  });
});

describe("league marks", () => {
  const brandFiles = ["src/components/arena/ArenaHeader.jsx", "src/components/arena/AccountControl.jsx", "src/components/arena/NavMenu.jsx", "src/components/lobby/PlayLobby.jsx", "src/components/lobby/ModeGlyph.jsx", "src/components/lobby/ModeSignature.jsx", "src/components/lobby/ContinueCard.jsx", "src/components/brand/EraFracture.jsx"];
  it("the header renders exactly one image: EraClash Logo Mk1, manifested", () => {
    const header = src("src/components/arena/ArenaHeader.jsx");
    expect(header.match(/<img\b/g)?.length).toBe(1);
    expect(header).toMatch(/src="\/brand\/eraclash-logo-mk1\.png"/); expect(header).toMatch(/data-brand-mark="eraclash-logo-mk1"/);
    expect(existsSync("public/brand/eraclash-logo-mk1.png")).toBe(true);
    expect(json("data/validation/9a2/logo-mk1-manifest.json").product.sha256).toBe(sha(readFileSync("public/brand/eraclash-logo-mk1.png")));
  });
  it("no NBA or other league mark is referenced by any header, lobby or brand component, or shipped in public/", () => {
    for (const f of brandFiles) expect(src(f), f).not.toMatch(/\bnba\b|nba\.com|league logo|\.svg#nba|silhouette logo/i);
    const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
    expect(walk("public").filter((p) => /nba|league|logoman/i.test(p))).toEqual([]);
    expect(walk("src").filter((p) => /(^|[-_/.])nba([-_.]|$)/i.test(p))).toEqual([]);
    expect(read("src/index.css")).not.toMatch(/url\([^)]*nba/i);
  });
  it("historical league data in player, team and statistical records is untouched", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/players.js src/attributes.js data/players data/research data/calibration api/`)).toBe("");
  });
});

describe("the adaptive hero", () => {
  it("is one pure decision with three states", () => {
    expect(HERO_STATE_IDS).toEqual(["full", "compact-active-run", "compact-returning"]);
    expect(resolveHeroState({})).toBe(HERO_STATES.FULL);
    expect(resolveHeroState({ hasRememberedRun: true })).toBe(HERO_STATES.COMPACT_ACTIVE_RUN);
    expect(resolveHeroState({ hasRememberedRun: true, gamesPlayed: 4 })).toBe(HERO_STATES.COMPACT_ACTIVE_RUN);
    expect(resolveHeroState({ gamesPlayed: 1 })).toBe(HERO_STATES.COMPACT_RETURNING);
    expect(resolveHeroState({ recentGames: 1 })).toBe(HERO_STATES.COMPACT_RETURNING);
    expect(resolveHeroState({ returningDevice: true })).toBe(HERO_STATES.COMPACT_RETURNING);
    expect(resolveHeroState({ gamesPlayed: 0, recentGames: 0, returningDevice: false })).toBe(HERO_STATES.FULL);
    expect(HERO_LINE["compact-active-run"]).toMatch(/Chaos Clash/); expect(HERO_LINE["compact-returning"]).toMatch(/Welcome back/);
  });
  it("is decided before the first paint from existing state — no new storage, no cookie, no API", () => {
    const hero = src("src/components/lobby/heroState.js"), lobby = src("src/components/lobby/PlayLobby.jsx");
    expect(hero).not.toMatch(/setItem|document\.cookie|fetch\(|\/api\//); expect(hero).toMatch(/ec_career/); expect(hero).toMatch(/ec_recent/);
    expect(lobby).toMatch(/useState\(\(\) => \(lab \? \(fixture\?\.hero \|\| HERO_STATES\.FULL\) : readHeroState/);
    expect(lobby).toMatch(/getSession\(\)\.returning/);
    expect(lobby).not.toMatch(/setHero|document\.cookie/);
  });
  it("cannot start, delete or reveal a run: the lobby still only reads a remembered run", () => {
    const lobby = src("src/components/lobby/PlayLobby.jsx"), card = src("src/components/lobby/ContinueCard.jsx");
    expect(lobby).toMatch(/viewChaos\(id, tier\)/); expect(lobby).not.toMatch(/startChaos|submitChaos|chooseChaos|simulateChaos|chaosAction: "start"/);
    expect(lobby.match(/store\.clear\(\)/g).length).toBe(3); // a dead run on lookup, an explicit confirmed abandon, a dismissed expiry notice
    expect(card).toMatch(/eraState\?\.revealed \? run\.eraState\.eraStyleId : null/); expect(card).not.toMatch(/blue\?\.heldSlots|blue\.heldSlots/);
  });
  it("the Continue card renders above the mode grid, and the compact band keeps the one fracture moment", () => {
    const lobby = src("src/components/lobby/PlayLobby.jsx");
    expect(lobby.indexOf("<ContinueCard")).toBeLessThan(lobby.indexOf('className="ec-lobby-primary"'));
    expect(lobby.indexOf("<EraFractureDivider")).toBeLessThan(lobby.indexOf('className="ec-lobby-body"'));
    expect(lobby.match(/EraFractureDivider className="ec-lobby-fracture"/g).length).toBe(1);
    expect(lobby).toMatch(/ec-lobby-hero--compact/);
  });
  it("the theme lab can render every hero state deterministically with production components", () => {
    const lab = src("src/ui/theme-lab/ThemeLab.jsx");
    expect(lab).toMatch(/\["full", "compact-returning", "compact-active-run"\]\.includes\(q\.get\("hero"\)\)/);
    expect(lab).toMatch(/fixture=\{\{ hero, run: hero === "compact-active-run" \? labRun\("roll1"\) : null \}\}/);
  });
});

describe("mode signatures", () => {
  const sig = src("src/components/lobby/ModeSignature.jsx");
  it("seven original motifs in one grammar: thin strokes, currentColor, one viewBox, no imagery", () => {
    expect(SIGNATURE_IDS).toEqual(["fracture-dice", "crossing-timelines", "spotlight-calendar", "series-ticks", "season-arc", "bracket", "era-steps"]);
    expect(sig).not.toMatch(/<image|href=|http|url\(|\.png|\.jpg|\.svg/i);
    expect(sig).toMatch(/viewBox="0 0 120 120"/); expect(sig).toMatch(/stroke: "currentColor"/);
    for (const w of sig.match(/strokeWidth[:=]"?\s*"?([\d.]+)/g).map((m) => parseFloat(m.match(/([\d.]+)$/)[1]))) expect(w).toBeLessThanOrEqual(2.6);
  });
  it("is decorative: hidden from assistive tech, unfocusable, no pointer events, low opacity, restrained on hover", () => {
    expect(sig).toMatch(/aria-hidden="true" focusable="false"/);
    const css = read("src/index.css").slice(read("src/index.css").indexOf("PHASE 9A.3P"));
    expect(css).toMatch(/\.ec-mode-signature \{[\s\S]{0,300}pointer-events: none/);
    const base = parseFloat(css.match(/--ec-sig-opacity, ([\d.]+)\)/)[1]); const hover = parseFloat(css.match(/\.ec-mode-card:hover \.ec-mode-signature \{ opacity: ([\d.]+)/)[1]);
    expect(base).toBeGreaterThanOrEqual(0.04); expect(base).toBeLessThanOrEqual(0.10); expect(hover).toBeLessThanOrEqual(0.12);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ec-mode-action, \.ec-mode-action::after, \.ec-mode-signature \{ transition: none; \}/);
  });
  it("uses only the semantic accent families the theme already defines", () => {
    const css = read("src/index.css").slice(read("src/index.css").indexOf("PHASE 9A.3P"));
    for (const acc of Object.values(ACCENT_ROLE)) expect(css).toMatch(new RegExp(`\\.ec-mode-card\\[data-accent="${acc}"\\]`));
    expect(css.match(/--ec-sig-color: var\(--ec-l-(glyph|glyph-cool|glyph-era|text-secondary)/g).length).toBe(7);
    expect(css).not.toMatch(/#[0-9a-f]{6}/i); // no new palette — tokens only
  });
});

describe("button states", () => {
  const css = read("src/index.css").slice(read("src/index.css").indexOf("PHASE 9A — THE PLAY LOBBY"));
  it("exactly one filled-Gold rule, keyed by the primary hierarchy", () => {
    expect(css.match(/\.ec-mode-action\[data-hierarchy="primary"\] \{/g).length).toBe(1);
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="primary"\] \{[\s\S]{0,300}var\(--ec-a-cta-mid, var\(--ec-a-gold\)\)/);
    expect(css).not.toMatch(/\.ec-mode-card--primary \.ec-mode-action\[data-intent="OPEN_MODE"\]/);
  });
  it("secondary is bordered, ink-on-ivory, arrowed, lifts on hover; unavailable is dashed, muted and never lifts", () => {
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="secondary"\] \{[\s\S]{0,400}border: 1\.5px solid/);
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="secondary"\]::after \{[\s\S]{0,80}content: "→"/);
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="secondary"\]:hover \{[\s\S]{0,300}translateY\(-1px\)/);
    expect(css).toMatch(/\.ec-mode-action\[data-hierarchy="unavailable"\] \{[\s\S]{0,300}dashed/);
    expect(css).not.toMatch(/\.ec-mode-action\[data-hierarchy="unavailable"\]:hover \{[^}]*transform/);
    expect(css).toMatch(/\.ec-mode-action \{ text-transform: uppercase; white-space: nowrap;/);
    expect(css).toMatch(/\.ec-mode-action:focus-visible/);
  });
  it("the unavailable action is aria-disabled only when it is a button without a destination", () => {
    const lobby = src("src/components/lobby/PlayLobby.jsx");
    expect(lobby).toMatch(/aria-disabled=\{hierarchy === ACTION_HIERARCHY\.UNAVAILABLE \? "true" : undefined\}/);
    expect(resolveModeAction(findMode("gauntlet"), "GUEST").href).toBe("/modes/era-gauntlet"); // a real information destination → a real link
  });
});

describe("telemetry preservation", () => {
  it("adds NO event: the allowlist and the activation list are unchanged; the existing lobby event carries two bounded properties", () => {
    expect(EVENTS_ALLOWLIST.size).toBe(69); expect(ACTIVATION_EVENTS.length).toBe(22);
    const act = src("src/activation.js");
    expect(act).toMatch(/hero_state/); expect(act).toMatch(/lobby_presentation_version/);
    expect(act).toMatch(/HERO_STATE_SHAPE = \/\^\(full\|compact-active-run\|compact-returning\)\$\//);
    expect(act).not.toMatch(/email|cookie|token|password|key\b/i);
  });
  it("Wave 2 schemas, partitions and study constants are byte-identical to the parent", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/wave2.js api/ config/ middleware.js vercel.json data/validation/9a3/wave2-test-plan.json data/validation/9a3/wave2-acceptance-policy.json`)).toBe("");
  });
});

describe("preservation", () => {
  it("API surface: twelve routes plus middleware, none touched", () => {
    expect(readdirSync("api").filter((f) => f.endsWith(".js")).length).toBe(12); expect(existsSync("middleware.js")).toBe(true);
  });
  it("Wave 2 access config is the distributed one (hash-pinned) and Wave 1 stays on its own branch", () => {
    expect(sha(readFileSync("config/previewAccess.js"))).toBe("9f559f49cc1eec847715dd56095abaf616cedd614367313b23c01d8bfdcd9291");
    if (!parentAvailable()) return;
    expect(git("git show origin/wave1:config/previewAccess.js | shasum -a 256 | cut -c1-64")).toBe("23894c8bc977d234ccb8e41941c18c0aad0aec810b3f3afc74ead88b3bf36a24");
  });
  it("game, draft and placement logic are untouched", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/chaos src/v3 src/engine.js src/rating.js src/draft.js src/dailyChallenge.js src/lineupPlacement.js src/entitlements.js data/calibration`)).toBe("");
  });
  it("the Night Court theme contract is untouched", () => {
    if (!parentAvailable()) return;
    expect(git(`git diff --name-only ${PARENT} -- src/theme`)).toBe("");
  });
});
