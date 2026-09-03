// ── Phase 9A.1: the three-layer colour architecture and the four candidates ──
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { MASTER_BRAND, MASTER_BRAND_ROLES, ERA_FRACTURE, MASTER_BRAND_VERSION } from "../src/theme/masterBrandTokens.js";
import { SEMANTIC_ROLES, SEMANTIC_DEFAULTS, SEMANTIC_REGIONS, SEMANTIC_VERSION } from "../src/theme/semanticTokens.js";
import { BASKETBALL_THEMES } from "../src/theme/basketballThemes.js";
import { THEME_IDS, CONTROL_THEME_ID, ARENA_KEYS, LOBBY_KEYS, READING_KEYS, ROOT_ALIAS_KEYS } from "../src/theme/themeTypes.js";
import { themeCss, themeCssFor, validateTheme, getTheme, applyTheme, themeTokenTable, THEME_RESOLVER_VERSION } from "../src/theme/themeResolver.js";
import { T } from "../src/theme.js";

const read = (f) => readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hex = /^#[0-9A-Fa-f]{6}$/;
const lum = (h) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hue = (h) => { const n = parseInt(h.slice(1), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let hh; if (mx === r) hh = ((g - b) / (mx - mn)) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; return ((hh * 60) + 360) % 360; };
const sat = (h) => { const n = parseInt(h.slice(1), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

describe("layer 1 — the master brand", () => {
  it("is read from Logo Mk1: obsidian, platinum, fracture gold, fracture cobalt", () => {
    expect(MASTER_BRAND_VERSION).toBe("1.0.0");
    for (const k of ["obsidian", "platinum", "graphite", "fractureGold", "fractureCobalt"]) expect(MASTER_BRAND[k]).toMatch(hex);
    expect(lum(MASTER_BRAND.obsidian)).toBeLessThan(0.01);
    expect(lum(MASTER_BRAND.platinum)).toBeGreaterThan(0.8);
    expect(hue(MASTER_BRAND.fractureGold)).toBeGreaterThan(35); expect(hue(MASTER_BRAND.fractureGold)).toBeLessThan(50);
    expect(hue(MASTER_BRAND.fractureCobalt)).toBeGreaterThan(205); expect(hue(MASTER_BRAND.fractureCobalt)).toBeLessThan(225);
    expect(existsSync("public/brand/eraclash-logo-mk1.png")).toBe(true);
  });
  it("every brand colour has documented roles and the Era Fracture is a controlled diagonal", () => {
    for (const k of Object.keys(MASTER_BRAND)) if (k !== "platinumDeep") expect(MASTER_BRAND_ROLES[k]?.length, k).toBeGreaterThan(0);
    expect(ERA_FRACTURE.angleDeg).toBeGreaterThan(90);
    expect(ERA_FRACTURE.approvedLocations.length).toBeGreaterThanOrEqual(10);
    expect(ERA_FRACTURE.unapprovedLocations).toContain("every empty card");
  });
});

describe("layer 3 — semantic colours", () => {
  it("each semantic colour has exactly one documented purpose", () => {
    expect(SEMANTIC_VERSION).toBe("1.0.0");
    for (const k of Object.keys(SEMANTIC_DEFAULTS)) expect(typeof SEMANTIC_ROLES[k], k).toBe("string");
    expect(SEMANTIC_ROLES.teamGold).toMatch(/user's side/);
    expect(SEMANTIC_ROLES.teamBlue).toMatch(/Legend Rival/);
    expect(SEMANTIC_ROLES.coachViolet).toMatch(/never a team/);
    expect(SEMANTIC_ROLES.danger).toMatch(/errors/);
    expect(SEMANTIC_ROLES.success).toMatch(/success/);
  });
  it("meanings never reverse across themes: gold stays gold, blue stays blue, violet stays violet, red stays red, green stays green", () => {
    for (const id of THEME_IDS) {
      const s = getTheme(id).semantic;
      expect(hue(s.teamGold), `${id} gold`).toBeGreaterThan(30); expect(hue(s.teamGold), `${id} gold`).toBeLessThan(55);
      expect(hue(s.teamBlue), `${id} blue`).toBeGreaterThan(200); expect(hue(s.teamBlue), `${id} blue`).toBeLessThan(230);
      expect(hue(s.coachViolet), `${id} violet`).toBeGreaterThan(245); expect(hue(s.coachViolet), `${id} violet`).toBeLessThan(285);
      expect(hue(s.danger), `${id} red`).toBeLessThan(8);
      expect(hue(s.success), `${id} green`).toBeGreaterThan(135); expect(hue(s.success), `${id} green`).toBeLessThan(165);
    }
  });
  it("the semantic-versus-decorative rule is auditable by DOM region", () => {
    for (const k of ["teamGold", "teamBlue", "coachViolet"]) expect(SEMANTIC_REGIONS[k].length).toBeGreaterThan(0);
  });
});

describe("layer 2 — four Basketball candidates from one resolver", () => {
  it("defines exactly the four themes, with the control first", () => {
    expect(THEME_IDS).toEqual(["fracture-core", "night-court", "modern-court", "hardwood-luxe"]);
    expect(CONTROL_THEME_ID).toBe("fracture-core");
    expect(Object.keys(BASKETBALL_THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(getTheme("night-court").role).toBe("OPTION A");
    expect(getTheme("modern-court").role).toBe("OPTION B");
    expect(getTheme("hardwood-luxe").role).toBe("OPTION C");
  });
  it("every theme supplies every token in every scope, and nothing extra", () => {
    for (const id of THEME_IDS) expect(validateTheme(getTheme(id)), id).toEqual([]);
    expect(ARENA_KEYS.length).toBeGreaterThan(30); expect(LOBBY_KEYS.length).toBe(12); expect(READING_KEYS.length).toBeGreaterThan(28); expect(ROOT_ALIAS_KEYS.length).toBe(11);
  });
  it("declares a 60–30–10 structure per theme", () => {
    for (const id of THEME_IDS) {
      const f = getTheme(id).families;
      for (const k of ["dominant", "secondary", "accent"]) { expect(f[k].name, `${id} ${k}`).toBeTruthy(); for (const c of f[k].colors) expect(c, `${id} ${k}`).toMatch(hex); }
    }
    expect(getTheme("fracture-core").families.accent.split).toEqual({ gold: 0.06, cobalt: 0.04 });
  });
  it("uses the specified dominant, secondary and accent values", () => {
    expect(getTheme("fracture-core").families.dominant.colors[0]).toBe("#03060B");
    expect(getTheme("fracture-core").families.accent.colors).toContain("#E1A72C");
    expect(getTheme("fracture-core").families.accent.colors).toContain("#267CE8");
    expect(getTheme("night-court").families.dominant.colors[0]).toBe("#070A0F");
    expect(getTheme("night-court").families.secondary.colors).toContain("#F1EDE4");
    expect(getTheme("night-court").families.accent.colors[0]).toBe("#7656D7");
    expect(getTheme("modern-court").families.dominant.colors[0]).toBe("#F3F0E9");
    expect(getTheme("modern-court").families.secondary.colors[0]).toBe("#131923");
    expect(getTheme("modern-court").families.accent.colors[0]).toBe("#20B8B2");
    expect(getTheme("hardwood-luxe").families.dominant.colors[0]).toBe("#100C0A");
    expect(getTheme("hardwood-luxe").families.secondary.colors).toContain("#C7A475");
    expect(getTheme("hardwood-luxe").families.accent.colors[0]).toBe("#48A7F2");
  });
  it("no accent or sandstone drifts into an orange CTA system", () => {
    for (const id of THEME_IDS) {
      const t = getTheme(id);
      const ctas = [t.arena["cta-hi"], t.arena["cta-mid"], t.arena["cta-lo"]];
      for (const c of ctas) { const h = hue(c); expect(h, `${id} CTA ${c}`).toBeGreaterThan(36); } // orange sits below ~35°
      for (const c of t.families.accent.colors) expect(!(hue(c) >= 15 && hue(c) < 36 && sat(c) > 0.6), `${id} accent ${c} reads orange`).toBe(true);
      // Sandstone (Hardwood) is a desaturated warm neutral, not an orange.
      if (id === "hardwood-luxe") expect(sat("#C7A475")).toBeLessThan(0.5);
    }
  });
  it("body text clears WCAG AA on each theme's panels — arena, reading and lobby", () => {
    for (const id of THEME_IDS) {
      const t = getTheme(id);
      expect(ratio(t.arena.text, t.arena.panel), `${id} arena text`).toBeGreaterThanOrEqual(7);
      expect(ratio(t.arena["text-muted"], t.arena.panel), `${id} arena muted`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.reading.text, t.reading["bg-card"]), `${id} reading text`).toBeGreaterThanOrEqual(7);
      expect(ratio(t.reading["text-dim"], t.reading["bg-card"]), `${id} reading dim`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.reading["text-muted"], t.reading["bg-card"]), `${id} reading muted`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.reading.gold, t.reading["bg-card"]), `${id} gold on reading`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.reading.blue, t.reading["bg-card"]), `${id} blue on reading`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.lobby.text, t.lobby["panel-raised"]), `${id} lobby text`).toBeGreaterThanOrEqual(7);
      expect(ratio(t.lobby["text-muted"], t.lobby["panel-raised"]), `${id} lobby muted`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.arena["cta-ink"], t.arena["cta-mid"]), `${id} CTA ink`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.reading["on-gold"], t.reading.gold), `${id} button ink on gold`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("the generated stylesheet is in sync with the tokens and scoped to data-theme only", () => {
    const css = read("src/theme/basketball-themes.css");
    expect(css).toBe(themeCss());
    expect(css).toMatch(/GENERATED/);
    for (const id of THEME_IDS) {
      expect(css).toContain(`html[data-theme="${id}"] {`);
      expect(css).toContain(`html[data-theme="${id}"] .ec-arena-shell {`);
    }
    // Nothing applies without the attribute: no bare selector in the sheet.
    // One selector per line; the header comment has no brace and is skipped.
    const selectors = [...css.matchAll(/^([^\s{/][^{\n]*)\{/gm)].map((m) => m[1].trim());
    for (const s of selectors) expect(s, s).toMatch(/^html\[data-theme="/);
    expect(read("src/main.jsx")).toMatch(/theme\/basketball-themes\.css/);
    expect(THEME_RESOLVER_VERSION).toBe("1.0.0");
  });
  it("the default product is untouched: every T token falls back to its original value", () => {
    const originals = {
      bg: "#f2efe8", bgCard: "#fffdf8", bgCardHover: "#f6f2ea", bgMuted: "#e9edf3", border: "#d9dee7", borderStrong: "#bec7d4",
      text: "#121a2a", textDim: "#5a6577", textMuted: "#636c83", arena: "#0c1627", onArena: "#f1f4fa", onArenaDim: "#a9b6cc",
      gold: "#8b660b", goldOnDark: "#e9b949", goldSoft: "#fdf3d8", goldBorder: "#e0b955", blue: "#2d6bc2", blueOnDark: "#7ab0f5",
      green: "#1c7a4a", red: "#b5322b", orange: "#a4640a",
    };
    for (const [k, v] of Object.entries(originals)) expect(T[k], k).toBe(`var(--ec-t-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}, ${v})`);
    expect(T.onGold).toBe("var(--ec-t-on-gold, #fffdf8)");
    // Root variable defaults in index.css are unchanged.
    const root = read("src/index.css").slice(0, 600);
    for (const v of ["--ec-page: #f2efe8", "--ec-navy: #0c1627", "--gold: #8b660b", "--blue: #2d6bc2"]) expect(root).toContain(v);
    // The arena shell's own defaults are unchanged.
    const shell = read("src/index.css").match(/\.ec-arena-shell \{[\s\S]*?\n\}/)[0];
    for (const v of ["--ec-a-bg: #03070d", "--ec-a-gold: #f2b51d", "--ec-a-blue: #3b9bff", "--ec-a-coach: #a864e8"]) expect(shell).toContain(v);
  });
  it("applyTheme sets and clears data-theme and refuses unknown ids", () => {
    const root = { dataset: {} };
    expect(applyTheme("night-court", root)).toBe(true); expect(root.dataset.theme).toBe("night-court");
    expect(applyTheme("nope", root)).toBe(false); expect(root.dataset.theme).toBe("night-court");
    expect(applyTheme(null, root)).toBe(true); expect(root.dataset.theme).toBeUndefined();
  });
  it("a token table is exportable per theme", () => {
    const t = themeTokenTable("hardwood-luxe");
    expect(t.tokens.arena["--ec-a-accent"]).toBe("#48A7F2");
    expect(t.tokens.reading["--ec-t-bg"]).toBe("#F0E5D2");
    expect(t.tokens.rootAliases["--ec-page"]).toBe("#F0E5D2");
  });
});

describe("one DOM, one component tree", () => {
  it("no Time Arena, lobby or postgame component is duplicated for a theme", () => {
    for (const f of ["src/components/arena/TimeArena.jsx", "src/components/arena/ChaosStage.jsx", "src/components/lobby/PlayLobby.jsx", "src/components/Postgame.jsx"]) {
      expect(existsSync(f), f).toBe(true);
    }
    expect(existsSync("src/components/arena/TimeArenaDark.jsx")).toBe(false);
    expect(existsSync("src/components/arena/TimeArenaLight.jsx")).toBe(false);
    // The lab imports the product's components, never copies.
    const lab = src("src/ui/theme-lab/ThemeLab.jsx");
    for (const c of ["components/arena/TimeArena.jsx", "components/lobby/PlayLobby.jsx", "components/Postgame.jsx", "components/arena/ArenaHeader.jsx"]) expect(lab, c).toContain(c);
    expect(lab).toMatch(/applyTheme/);
  });
  it("theme selection reaches the product only through the lab route, never public navigation", () => {
    const app = src("src/App.jsx");
    expect(app).toMatch(/__EC_THEME_LAB__/);
    expect(app).toMatch(/\/dev\/basketball-theme-lab/);
    for (const f of ["src/components/arena/ArenaHeader.jsx", "src/components/arena/AccountControl.jsx", "src/components/Profile.jsx", "src/components/lobby/PlayLobby.jsx", "src/navigation.js"]) {
      expect(src(f), f).not.toMatch(/data-theme|applyTheme|Choose your Basketball theme|theme picker/i);
    }
    expect(read("middleware.js")).toMatch(/"\/dev\/:path\*"/);
    expect(read("middleware.js")).toMatch(/ownerOnly/);
    expect(JSON.parse(read("vercel.json")).rewrites.some((r) => r.source === "/dev/basketball-theme-lab")).toBe(true);
  });
  it("structural colours are tokens: the CTA gradient, header, scrims and card tints read variables", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/var\(--ec-a-cta-hi, #ffd257\)/);
    expect(css).toMatch(/--pc-deep: var\(--ec-a-pc-deep-gold/);
    expect(css).toMatch(/var\(--ec-a-court-opacity, 1\)/);
    expect(read("src/components/arena/ArenaHeader.jsx")).toMatch(/var\(--ec-a-header/);
    expect(read("src/components/arena/ResetDialog.jsx")).toMatch(/var\(--ec-a-scrim/);
    // Button ink on gold is a token, never a literal off-white.
    for (const f of ["src/App.jsx", "src/components/Postgame.jsx", "src/components/CoachModal.jsx", "src/components/Profile.jsx"]) expect(src(f), f).not.toMatch(/color: "#fffdf8"/);
  });
});

describe("team labels", () => {
  it("solo play says Your Five and Legend Rival, never CPU or User, in the arena and the lobby card", () => {
    const stage = src("src/components/arena/ChaosStage.jsx");
    expect(stage).toMatch(/sub="YOUR FIVE"/); expect(stage).toMatch(/sub="LEGEND RIVAL"/);
    expect(stage).not.toMatch(/sub="LEGEND CPU"|sub="YOUR PICKS"|>USER</);
    const card = src("src/components/lobby/ContinueCard.jsx");
    expect(card).toMatch(/Legend Rival/); expect(card).not.toMatch(/Legend CPU/);
    expect(src("src/components/arena/PlayerCard.jsx")).not.toMatch(/Legend CPU/);
    // Internal code keeps its terminology; result sides are not remapped.
    expect(existsSync("src/chaos/legendCpu.js")).toBe(true);
    expect(src("src/chaos/runState.js")).toMatch(/blueRoster/);
  });
});
