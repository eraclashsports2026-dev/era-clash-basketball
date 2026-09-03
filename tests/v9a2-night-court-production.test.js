// ── Phase 9A.2: the owner-selected Night Court V1 hybrid is the product default ─
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { BASKETBALL_THEMES, NIGHT_COURT_V1 } from "../src/theme/basketballThemes.js";
import { THEME_IDS, CANDIDATE_THEME_IDS, PRODUCTION_THEME_ID, PRODUCTION_THEME_NAME, ARENA_KEYS, LOBBY_KEYS, READING_KEYS, EDITORIAL_KEYS } from "../src/theme/themeTypes.js";
import { themeCss, validateTheme, getTheme, applyTheme, themeTokenTable, THEME_RESOLVER_VERSION } from "../src/theme/themeResolver.js";
import { MASTER_BRAND, ERA_FRACTURE, eraFractureGradient } from "../src/theme/masterBrandTokens.js";
import { UNIFORM_TESTS } from "../src/ui/theme-lab/uniformFixtures.js";
import { LAB_FIXTURE_IDS, FIXTURE_IDS } from "../src/ui/theme-lab/fixtureIds.js";
import { T } from "../src/theme.js";

const read = (f) => readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const json = (f) => JSON.parse(read(f));
const lum = (h) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hue = (h) => { const n = parseInt(h.slice(1), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let hh; if (mx === r) hh = ((g - b) / (mx - mn)) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; return ((hh * 60) + 360) % 360; };
const P = getTheme(PRODUCTION_THEME_ID);

describe("the owner selection", () => {
  it("is recorded as the hybrid, by the owner, with no promotion authorised", () => {
    const sel = json("data/validation/9a2/basketball-theme-owner-selection.json");
    expect(sel.selection).toBe("HYBRID_NIGHT_COURT_EDITORIAL_FRACTURE_CORE");
    expect(sel.baseTheme).toBe("night-court"); expect(sel.masterBrandSignature).toBe("fracture-core");
    expect(sel.selectionAuthority).toBe("OWNER"); expect(sel.status).toBe("SELECTED_FOR_IMPLEMENTATION");
    expect(sel.stableWave1PromotionAuthorized).toBe(false); expect(sel.productionPromotionAuthorized).toBe(false);
    expect(sel.implementationStatus).toBe("OWNER_ACCEPTANCE_PENDING");
  });
});

describe("the production theme", () => {
  it("is the fifth lab entry and the product default, applied before first render", () => {
    expect(PRODUCTION_THEME_ID).toBe("night-court-production-hybrid"); expect(PRODUCTION_THEME_NAME).toBe("basketball-night-court-v1");
    expect(THEME_IDS).toEqual([...CANDIDATE_THEME_IDS, PRODUCTION_THEME_ID]);
    expect(P.role).toBe("PRODUCTION");
    expect(src("src/main.jsx")).toMatch(/applyTheme\(PRODUCTION_THEME_ID\)/);
    const root = { dataset: {} }; applyTheme(null, root); expect(root.dataset.theme).toBe(PRODUCTION_THEME_ID);
    expect(THEME_RESOLVER_VERSION).toBe("1.1.0");
  });
  it("carries the three layers with the specification's values", () => {
    expect(MASTER_BRAND.obsidian).toBe("#03060B"); expect(MASTER_BRAND.platinum).toBe("#E7EAF0"); expect(MASTER_BRAND.graphite).toBe("#141A24"); expect(MASTER_BRAND.fractureGold).toBe("#E1A72C"); expect(MASTER_BRAND.fractureCobalt).toBe("#267CE8");
    expect(NIGHT_COURT_V1.layer2).toEqual({ nightObsidian: "#070A0F", arenaGraphite: "#111823", raisedGraphite: "#172130", warmCourtIvory: "#F1EDE4", editorialInk: "#151B24", secondaryInk: "#505765", softIvoryDivider: "#D7D1C6" });
    expect(P.semantic).toEqual({ teamGold: "#E8B13C", teamBlue: "#2F83E7", coachViolet: "#7656D7", success: "#2FA96D", warning: "#C58B23", danger: "#D95050" });
    expect(P.arena.bg).toBe("#070A0F"); expect(P.arena.panel).toBe("#111823"); expect(P.arena["panel-raised"]).toBe("#172130"); expect(P.arena.text).toBe("#E7EAF0");
    expect(P.reading.bg).toBe("#F1EDE4"); expect(P.reading.text).toBe("#151B24"); expect(P.reading.border).toBe("#D7D1C6");
    expect(P.lobby.bg).toBe("#F1EDE4"); expect(P.lobby["hero-bg"]).toBe("#03060B");
  });
  it("keeps every meaning: gold, blue, violet, green, red at their hues; text-bearing lifts hold AA", () => {
    expect(hue(P.semantic.teamGold)).toBeGreaterThan(30); expect(hue(P.semantic.teamGold)).toBeLessThan(55);
    expect(hue(P.semantic.teamBlue)).toBeGreaterThan(200); expect(hue(P.semantic.teamBlue)).toBeLessThan(230);
    expect(hue(P.semantic.coachViolet)).toBeGreaterThan(245); expect(hue(P.semantic.coachViolet)).toBeLessThan(285);
    expect(hue(P.semantic.success)).toBeGreaterThan(135); expect(hue(P.semantic.success)).toBeLessThan(165);
    expect(hue(P.semantic.danger)).toBeLessThan(8);
    for (const [k, v] of Object.entries({ blue: P.arena.blue, coach: P.arena.coach, red: P.arena.red, gold: P.arena.gold, text: P.arena.text, muted: P.arena["text-muted"] })) expect(ratio(v, P.arena.panel), k).toBeGreaterThanOrEqual(4.5);
    for (const [k, v] of Object.entries({ text: P.reading.text, dim: P.reading["text-dim"], gold: P.reading.gold, blue: P.reading.blue, red: P.reading.red, green: P.reading.green })) expect(ratio(v, P.reading["bg-card"]), k).toBeGreaterThanOrEqual(4.5);
    expect(ratio(P.arena["cta-ink"], P.arena["cta-mid"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(P.lobby["hero-text"], P.lobby["hero-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(P.editorial.text, P.editorial.panel)).toBeGreaterThanOrEqual(7);
    // no orange CTA
    for (const c of [P.arena["cta-hi"], P.arena["cta-mid"], P.arena["cta-lo"]]) expect(hue(c)).toBeGreaterThan(36);
  });
  it("declares the two contexts of the contextual 60–30–10 rule", () => {
    expect(P.contexts.arena.fixtures).toEqual(["empty", "roll2", "coach", "result"]);
    expect(P.contexts.editorial.fixtures).toContain("postgame"); expect(P.contexts.editorial.fixtures).toContain("lobby");
    expect(P.contexts.arena.dominant.colors).toContain("#070A0F"); expect(P.contexts.editorial.dominant.colors).toContain("#F1EDE4");
    expect(P.contexts.arena.targets).toEqual({ dominant: [55, 68], secondary: [22, 35], accent: [6, 10] });
  });
});

describe("one resolver, four scopes", () => {
  it("every theme supplies every key in every scope, including the editorial remap; the sheet is in sync and scoped", () => {
    for (const id of THEME_IDS) expect(validateTheme(getTheme(id)), id).toEqual([]);
    expect(EDITORIAL_KEYS.length).toBe(22); expect(LOBBY_KEYS.length).toBe(18); expect(ARENA_KEYS).toContain("fracture"); expect(ARENA_KEYS).toContain("fracture-on"); expect(ARENA_KEYS).toContain("portrait-field"); expect(READING_KEYS).toContain("fracture");
    const css = read("src/theme/basketball-themes.css");
    expect(css).toBe(themeCss());
    expect(css).toContain(`html[data-theme="${PRODUCTION_THEME_ID}"] .ec-editorial-shell {`);
    expect(css).toContain(`html[data-theme="${PRODUCTION_THEME_ID}"] .ec-brand-header {`);
    for (const s of [...css.matchAll(/^([^\s{/][^{\n]*)\{/gm)].map((m) => m[1].trim())) expect(s).toMatch(/^html\[data-theme="/);
  });
  it("the editorial shell remaps arena names to reading values and the header pins the master brand", () => {
    expect(P.editorial.bg).toBe(P.reading.bg); expect(P.editorial.text).toBe(P.reading.text); expect(P.editorial.panel).toBe(P.reading["bg-card"]);
    const table = themeTokenTable(PRODUCTION_THEME_ID);
    expect(table.tokens.editorial[".ec-editorial-shell --ec-a-text"]).toBe("#151B24");
    expect(src("src/App.jsx")).toMatch(/editorialMode/); expect(src("src/App.jsx")).toMatch(/ec-editorial-shell/);
    expect(read("src/components/arena/ArenaHeader.jsx")).toMatch(/className="ec-brand-header"/);
  });
  it("the four Phase 9A.1 candidates are byte-identical on every key that existed then", () => {
    const frozen = json("data/validation/9a1/basketball-theme-contracts.json");
    for (const th of frozen.themes) {
      const now = themeTokenTable(th.id);
      for (const scope of ["arena", "lobby", "reading", "rootAliases"]) for (const [k, v] of Object.entries(th.tokens[scope])) expect(now.tokens[scope][k], `${th.id} ${k}`).toBe(v);
      expect(now.semantic).toEqual(th.semantic); expect(now.families).toEqual(th.families);
      expect(getTheme(th.id).arena["fracture-on"]).toBe("0");
    }
  });
});

describe("the Era Fracture", () => {
  it("is one geometry — 112°, gold to 46%, a 2% seam — painted only by the production theme", () => {
    expect(ERA_FRACTURE.angleDeg).toBe(112); expect(ERA_FRACTURE.goldStop).toBe(0.46); expect(ERA_FRACTURE.seamWidth).toBe(0.02);
    const g = eraFractureGradient();
    expect(g).toMatch(/^linear-gradient\(112deg, #E1A72C 0%/); expect(g).toMatch(/#267CE8 100%\)$/);
    expect(P.arena.fracture).toBe(g); expect(P.reading.fracture).toBe(g); expect(P.arena["fracture-on"]).toBe("1");
    for (const id of CANDIDATE_THEME_IDS) { expect(getTheme(id).arena.fracture).not.toContain("E1A72C"); expect(getTheme(id).arena["fracture-on"]).toBe("0"); }
  });
  it("ships as four primitives and ten approved CSS/JSX hooks, and nothing else draws a diagonal", () => {
    const mod = read("src/components/brand/EraFracture.jsx");
    for (const p of ["EraFractureDivider", "EraFractureActiveEdge", "EraFractureTransition", "EraFractureWatermark"]) expect(mod).toContain(`export function ${p}`);
    const css = read("src/index.css");
    expect(css).toMatch(/\.ec-ta-roster-divider \{[\s\S]{0,300}var\(--ec-a-fracture/);
    expect(css).toMatch(/\.ec-brand-header \.ec-nav-item\[aria-current="page"\]::after/);
    expect(css).toMatch(/\.ec-pc\[data-held="true"\]::before,\s*\.ec-coach-card\[data-on="true"\]::before,\s*\.ec-intel-era\[data-revealed="true"\]::before/);
    expect(src("src/components/arena/ChaosStage.jsx")).toMatch(/EraFractureTransition kind="roll"/); expect(src("src/components/arena/ChaosStage.jsx")).toMatch(/EraFractureTransition kind="sim"/);
    expect(src("src/components/arena/ResultDock.jsx")).toMatch(/EraFractureActiveEdge on=\{!previous\}/);
    expect(src("src/components/Postgame.jsx")).toMatch(/EraFractureWatermark/); expect(read("src/components/Postgame.jsx")).toMatch(/className="ec-fracture-text"/);
    expect(src("src/components/lobby/PlayLobby.jsx")).toMatch(/EraFractureDivider className="ec-lobby-fracture"/);
    // Forbidden: no fracture on every card, panel, row or paragraph.
    expect(css).not.toMatch(/\.ec-pc::before[\s\S]{0,80}fracture/); expect(css).not.toMatch(/\.ec-panel[^\n{]*\{[^}]*--ec-a-fracture/); expect(css).not.toMatch(/\btr\b[^\n{]*\{[^}]*fracture/); expect(css).not.toMatch(/\bp\b[^\n{]*\{[^}]*fracture/);
    // The sweep runs once and honours reduced motion.
    expect(css).toMatch(/animation: ec-fracture-sweep 900ms ease-out 1;/); expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ec-fracture-transition\[data-active="true"\] \{ animation: none/);
  });
});

describe("the portrait stage", () => {
  it("wraps every player image — arena cards and light-surface variants — in the same three layers and adds no geometry", () => {
    expect(read("src/components/brand/PortraitStage.jsx")).toMatch(/ec-portrait-field[\s\S]*ec-portrait-rim[\s\S]*ec-portrait-fade/);
    const card = src("src/components/arena/PlayerCard.jsx");
    expect(card).toMatch(/<PortraitStage team=\{team\}>/); expect((card.match(/<PortraitStage/g) || []).length).toBe(2);
    expect(card).toMatch(/resolvePortrait/); expect(card).toMatch(/PORTRAIT_STATUS\.APPROVED/);
    const img = src("src/components/PlayerImage.jsx");
    expect(img).toMatch(/ec-portrait-stage/); expect((img.match(/ec-portrait-field/g) || []).length).toBe(2);
    const css = read("src/index.css");
    expect(css).toMatch(/\.ec-portrait-stage \{[\s\S]{0,200}position: absolute; inset: 0;/);
    expect(css).toMatch(/\.ec-pc-portrait \{[\s\S]{0,600}var\(--ec-a-portrait-well-hi, #0e1a2b\)/);
    // frozen geometry tokens unchanged
    expect(css).toMatch(/--player-card-h: 322px/); expect(css).toMatch(/--player-portrait-h: 212px/); expect(css).toMatch(/--player-card-w: 104px/);
  });
  it("the lab's uniform tests are synthetic figures, never likenesses, and cover the required set", () => {
    const ids = UNIFORM_TESTS.map((u) => u.id);
    for (const id of ["dark-jersey", "light-jersey", "gold-jersey", "blue-jersey", "red-jersey", "white-historical", "bw-portrait", "silhouette-gold", "silhouette-blue"]) expect(ids).toContain(id);
    for (const u of UNIFORM_TESTS.filter((u) => u.art)) { expect(u.art.src).toMatch(/^data:image\/svg\+xml/); expect(u.art.alt).toMatch(/synthetic portrait test figure/); }
    expect(src("src/components/arena/PlayerCard.jsx")).not.toMatch(/midjourney|stable-diffusion|scrape/i);
    expect(LAB_FIXTURE_IDS).toEqual([...FIXTURE_IDS, "portraits", "gate", "membership", "simulating"]);
  });
});

describe("the master-brand shell", () => {
  it("renders the canonical Mk1 PNG, manifested with SHA-256, in the header and the lobby's obsidian band", () => {
    const m = json("data/validation/9a2/logo-mk1-manifest.json");
    for (const c of [m.canonical, m.product]) { expect(existsSync(c.path), c.path).toBe(true); expect(createHash("sha256").update(readFileSync(c.path)).digest("hex")).toBe(c.sha256); }
    expect(m.canonical.width).toBe(1983); expect(m.product.width).toBe(760); expect(m.background.verdict).toMatch(/TRANSPARENT/);
    const header = read("src/components/arena/ArenaHeader.jsx");
    expect(header).toMatch(/<img className="ec-brand-logo" src="\/brand\/eraclash-logo-mk1\.png"/); expect(header).not.toMatch(/ERA<span/);
    expect(header).toMatch(/BASKETBALL/);
    expect(read("src/components/lobby/PlayLobby.jsx")).toMatch(/ec-lobby-hero[\s\S]*eraclash-logo-mk1\.png[\s\S]*<EraFractureDivider/);
  });
  it("keeps the product free of a theme selector and of league or competitor marks", () => {
    for (const f of ["src/components/arena/ArenaHeader.jsx", "src/components/arena/AccountControl.jsx", "src/components/Profile.jsx", "src/components/lobby/PlayLobby.jsx", "src/navigation.js"]) expect(src(f), f).not.toMatch(/data-theme|applyTheme|Choose your Basketball theme|theme picker/i);
    expect(read("middleware.js")).toMatch(/ownerOnly/);
    for (const f of ["src/components/lobby/PlayLobby.jsx", "src/components/arena/ArenaHeader.jsx", "src/components/arena/ChaosStage.jsx", "src/components/Postgame.jsx"]) expect(read(f), f).not.toMatch(/82-0|vaulty|Get the App|nba\.com/i);
  });
  it("T keeps its default fallbacks (the pre-9A.2 reading surface) and gains the fracture", () => {
    expect(T.bg).toBe("var(--ec-t-bg, #f2efe8)"); expect(T.onGold).toBe("var(--ec-t-on-gold, #fffdf8)");
    expect(T.fracture).toMatch(/^var\(--ec-t-fracture, linear-gradient\(120deg/);
  });
});
