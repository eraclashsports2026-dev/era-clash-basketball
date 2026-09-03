// ── Layer 2 — the Basketball environment: four controlled candidates ─────────
// CONTROL  fracture-core   the master brand, extended — dark, metallic, sport-neutral
// OPTION A night-court     dark arena, warm ivory for everything you read
// OPTION B modern-court    light bone product with a dark graphite arena inside it
// OPTION C hardwood-luxe   espresso arena, sandstone and cream reading surfaces
//
// Every theme supplies EVERY token. Values are hex (or rgba for soft/line
// tints derived from a hex) so the colour-area audit can classify pixels by
// family. Each theme also declares its 60–30–10 families and its semantic set;
// the audit reads those declarations rather than guessing.
//
// Luminance is tuned per surface so text passes WCAG AA; meanings never move.
// In particular Team Blue sits a step above the specification's hex on the dark
// themes: #2B82DE-class blues measure ~4.4:1 as TEXT on the card panels (OVR
// digits, dock heads), so each dark theme's blue is lifted to ≥ 5:1 at the same
// hue. The semantic declarations follow the text-bearing values:
// gold is Team Gold, blue is Team Blue, violet is Coach/Era, red is danger,
// green is success, platinum/graphite is neutral structure.
import { MASTER_BRAND, eraFractureGradient, ERA_FRACTURE_GLOW } from "./masterBrandTokens.js";

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const soft = (hex) => rgba(hex, 0.14);
const line = (hex) => rgba(hex, 0.45);

/** Shared semantic + arena derivations so every theme is built the same way. */
const arenaFamily = ({
  bg, arena, panel, panelRaised, panelSoft, text, textSecondary, textMuted,
  teamGold, teamBlue, coach, coachDeep, green, red, brandGold, accent, header, scrim,
  ctaHi, ctaMid, ctaLo, ctaInk, ctaGlow, border, borderStrong, courtOpacity, texture, spotWarm, spotCool,
  // Phase 9A.2. The four candidates keep the neutral divider they were compared
  // with; the production theme paints the Era Fracture. The portrait stage is a
  // product fix and is present in every theme.
  fracture = NEUTRAL_DIVIDER, fractureGlow = "0 0 0 0 transparent", fractureOn = "0",
  portraitField = "rgba(214, 222, 236, 0.30)", portraitWellHi = "#1E2A3B", portraitWellLo = "#0B1220",
}) => ({
  "bg": bg, "arena": arena, "panel": panel, "panel-raised": panelRaised, "panel-soft": panelSoft,
  "text": text, "text-secondary": textSecondary, "text-muted": textMuted,
  "gold": teamGold, "gold-soft": soft(teamGold), "gold-line": line(teamGold),
  "blue": teamBlue, "blue-soft": soft(teamBlue), "blue-line": line(teamBlue),
  "coach": coach, "coach-soft": soft(coach), "coach-line": line(coach), "coach-deep": coachDeep,
  "border": border, "border-strong": borderStrong, "green": green, "red": red,
  "brand-gold": brandGold, "accent": accent, "accent-soft": soft(accent), "accent-line": line(accent),
  "header": header, "scrim": scrim,
  "cta-hi": ctaHi, "cta-mid": ctaMid, "cta-lo": ctaLo, "cta-ink": ctaInk, "cta-glow": ctaGlow,
  "pc-deep-gold": "#8B5B08", "pc-deep-blue": "#0E4F91",
  "court-opacity": String(courtOpacity), "texture": texture, "spot-warm": spotWarm, "spot-cool": spotCool,
  "fracture": fracture, "fracture-glow": fractureGlow, "fracture-on": fractureOn,
  "portrait-field": portraitField, "portrait-well-hi": portraitWellHi, "portrait-well-lo": portraitWellLo,
});
/** The 8C.1 roster divider, as the four candidates were measured with it. */
const NEUTRAL_DIVIDER = "linear-gradient(to bottom, transparent, rgba(157, 178, 209, 0.22) 12%, rgba(157, 178, 209, 0.22) 88%, transparent)";

const readingFamily = ({
  bg, card, cardHover, muted, border, borderStrong, text, textDim, textMuted, cream,
  arena, arenaSoft, arenaBorder, onArena, onArenaDim, gold, goldOnDark, goldSoft, goldBorder,
  blue, blueOnDark, blueSoft, blueBorder, green, red, orange, onGold, insetHi, insetLo,
  fracture = `linear-gradient(120deg, ${goldOnDark} 30%, #ffffff 50%, ${blueOnDark} 70%)`,
}) => ({
  "bg": bg, "bg-card": card, "bg-card-hover": cardHover, "bg-muted": muted, "bg-panel": card,
  "border": border, "border-strong": borderStrong,
  "text": text, "text-dim": textDim, "text-muted": textMuted, "cream": cream,
  "arena": arena, "arena-soft": arenaSoft, "arena-border": arenaBorder, "on-arena": onArena, "on-arena-dim": onArenaDim,
  "gold": gold, "gold-on-dark": goldOnDark, "gold-soft": goldSoft, "gold-border": goldBorder,
  "blue": blue, "blue-on-dark": blueOnDark, "blue-soft": blueSoft, "blue-border": blueBorder,
  "green": green, "red": red, "orange": orange, "on-gold": onGold,
  "inset-hi": insetHi, "inset-lo": insetLo, "fracture": fracture,
});

const rootAliases = (r) => ({
  "ec-page": r.bg, "ec-surface": r["bg-card"], "ec-surface-muted": r["bg-muted"],
  "ec-navy": r.arena, "ec-navy-soft": r["arena-soft"], "ec-ink": r.text, "ec-border": r.border,
  "gold": r.gold, "gold-on-dark": r["gold-on-dark"], "blue": r.blue, "blue-on-dark": r["blue-on-dark"],
});

const lobbyFromArena = (a) => ({
  "bg": a.bg, "panel": a.panel, "panel-raised": a["panel-raised"], "panel-soft": a["panel-soft"],
  "text": a.text, "text-secondary": a["text-secondary"], "text-muted": a["text-muted"],
  "border": a.border, "border-strong": a["border-strong"],
  "page-text": a["text-secondary"], "page-muted": a["text-muted"], "glyph": a.gold,
  "hero-bg": "transparent", "hero-text": a["text-secondary"],
  "glyph-cool": a.gold, "glyph-era": a.gold, "card-shadow": "0 0 0 1px rgba(242, 181, 29, 0.18), 0 18px 40px rgba(0, 0, 0, 0.35)",
  "arc-opacity": "1",
});

/**
 * Editorial remap (Phase 9A.2): the --ec-a-* names that membership, fantasy and
 * mode-information pages read, given reading-surface values. Derived from each
 * theme's reading family so no theme can forget it.
 */
const editorialFromReading = (r, semantic) => ({
  "bg": r.bg, "arena": r.bg, "panel": r["bg-card"], "panel-raised": r["bg-card"], "panel-soft": r["bg-muted"],
  "text": r.text, "text-secondary": r["text-dim"], "text-muted": r["text-muted"],
  "gold": r.gold, "gold-soft": r["gold-soft"], "gold-line": r["gold-border"],
  "blue": r.blue, "blue-soft": r["blue-soft"], "blue-line": r["blue-border"],
  "coach": semantic.coachViolet, "coach-soft": soft(semantic.coachViolet), "coach-line": line(semantic.coachViolet),
  "border": r.border, "border-strong": r["border-strong"], "green": r.green, "red": r.red, "scrim": rgba(r.arena, 0.86),
});

// ── CONTROL — FRACTURE CORE ──────────────────────────────────────────────────
const fractureCoreArena = arenaFamily({
  bg: MASTER_BRAND.obsidian, arena: "#060A12", panel: "#10161F", panelRaised: MASTER_BRAND.graphite, panelSoft: "#1B2330",
  text: MASTER_BRAND.platinum, textSecondary: MASTER_BRAND.platinumDeep, textMuted: "#98A2B3",
  teamGold: "#E4AA31", teamBlue: "#3F8FE6", coach: "#A27BE6", coachDeep: "#4A2A85", green: "#35B875", red: "#EE6A6A",
  brandGold: MASTER_BRAND.fractureGold, accent: MASTER_BRAND.fractureCobalt,
  header: rgba(MASTER_BRAND.obsidian, 0.94), scrim: rgba(MASTER_BRAND.obsidian, 0.9),
  ctaHi: "#F3C452", ctaMid: MASTER_BRAND.fractureGold, ctaLo: "#B8841C", ctaInk: "#14100A", ctaGlow: "0 8px 18px rgba(225, 167, 44, 0.18)",
  border: rgba(MASTER_BRAND.platinum, 0.16), borderStrong: rgba(MASTER_BRAND.platinum, 0.32),
  courtOpacity: 1, texture: "none", spotWarm: rgba(MASTER_BRAND.fractureGold, 0.10), spotCool: rgba(MASTER_BRAND.fractureCobalt, 0.10),
});
const fractureCoreReading = readingFamily({
  bg: MASTER_BRAND.obsidian, card: MASTER_BRAND.graphite, cardHover: "#1B2330", muted: "#1F2836",
  border: "#2A3340", borderStrong: "#3A4657", text: MASTER_BRAND.platinum, textDim: "#B4BCC9", textMuted: "#98A2B3", cream: "#1B2330",
  arena: "#060A12", arenaSoft: "#10161F", arenaBorder: "#2A3340", onArena: MASTER_BRAND.platinum, onArenaDim: "#B4BCC9",
  gold: "#E4AA31", goldOnDark: "#E4AA31", goldSoft: soft("#E4AA31"), goldBorder: line("#E4AA31"),
  blue: "#5EA3F0", blueOnDark: "#5EA3F0", blueSoft: soft("#2B82DE"), blueBorder: line("#2B82DE"),
  green: "#35B875", red: "#F07070", orange: MASTER_BRAND.fractureGold, onGold: "#14100A", insetHi: "#0C121B", insetLo: MASTER_BRAND.obsidian,
});

// ── OPTION A — NIGHT COURT EDITORIAL ─────────────────────────────────────────
const nightCourtArena = arenaFamily({
  bg: "#070A0F", arena: "#0A0E15", panel: "#10151D", panelRaised: "#151B24", panelSoft: "#1B2230",
  text: "#F1EDE4", textSecondary: "#CFC9BC", textMuted: "#9A9890",
  // Royal violet #7656D7 is the accent for surfaces and lines; text-bearing
  // violet (coach role labels, era highlights) is lifted to clear AA on the
  // night panels (#A08AE6 on #151B24 ≈ 6:1). Same hue, same meaning.
  teamGold: "#E8B13C", teamBlue: "#4A92EA", coach: "#A08AE6", coachDeep: "#3E2A80", green: "#2FA96D", red: "#E06060",
  brandGold: MASTER_BRAND.fractureGold, accent: "#7656D7",
  header: rgba("#070A0F", 0.94), scrim: rgba("#070A0F", 0.9),
  ctaHi: "#F5C553", ctaMid: "#E8B13C", ctaLo: "#B9841F", ctaInk: "#14100A", ctaGlow: "0 8px 18px rgba(232, 177, 60, 0.18)",
  border: rgba("#F1EDE4", 0.15), borderStrong: rgba("#F1EDE4", 0.30),
  courtOpacity: 0.9, texture: "none", spotWarm: rgba("#E8B13C", 0.09), spotCool: rgba("#7656D7", 0.10),
});
const nightCourtReading = readingFamily({
  bg: "#F1EDE4", card: "#FBF8F1", cardHover: "#F4EFE5", muted: "#E6E9EE",
  border: "#DAD5CA", borderStrong: "#C2BBAE", text: "#151B24", textDim: "#4F5766", textMuted: "#5F6672", cream: "#F6F1E7",
  arena: "#0A0E15", arenaSoft: "#151B24", arenaBorder: "#2A3140", onArena: "#F1EDE4", onArenaDim: "#B9B4A8",
  gold: "#8A6410", goldOnDark: "#E8B13C", goldSoft: "#FBF0D2", goldBorder: "#E4BC5B",
  blue: "#2461B8", blueOnDark: "#7BB3F5", blueSoft: "#E6EFFC", blueBorder: "#92B7EA",
  green: "#237A4F", red: "#B54040", orange: "#A4640A", onGold: "#FFFDF8", insetHi: "#141B27", insetLo: "#070A0F",
});
const nightCourtLobby = {
  "bg": "#070A0F", "panel": "#F1EDE4", "panel-raised": "#FBF8F1", "panel-soft": "#E8E2D6",
  "text": "#151B24", "text-secondary": "#3A4150", "text-muted": "#5F6672", "border": "#D9D2C4", "border-strong": "#C3BAA8",
  // The page stays night obsidian; its own text is warm platinum.
  "page-text": "#CFC9BC", "page-muted": "#9A9890", "glyph": "#8A6410",
  "hero-bg": "transparent", "hero-text": "#CFC9BC",
  "glyph-cool": "#8A6410", "glyph-era": "#8A6410", "card-shadow": "0 0 0 1px rgba(242, 181, 29, 0.18), 0 18px 40px rgba(0, 0, 0, 0.35)",
  "arc-opacity": "1",
};

// ── OPTION B — MODERN COURT LIGHT ────────────────────────────────────────────
const modernCourtArena = arenaFamily({
  bg: "#F3F0E9", arena: "#131923", panel: "#1A2130", panelRaised: "#202838", panelSoft: "#27303F",
  text: "#F3F0E9", textSecondary: "#D8DCE4", textMuted: "#A6AEBC",
  teamGold: "#E0A52A", teamBlue: "#5296E3", coach: "#A991E8", coachDeep: "#4A2F8C", green: "#34A772", red: "#EA6E6E",
  brandGold: MASTER_BRAND.fractureGold, accent: "#20B8B2",
  header: "#131923", scrim: rgba("#131923", 0.9),
  ctaHi: "#F0B84A", ctaMid: "#D99B21", ctaLo: "#B27C12", ctaInk: "#14100A", ctaGlow: "0 8px 18px rgba(217, 155, 33, 0.16)",
  border: rgba("#F3F0E9", 0.16), borderStrong: rgba("#F3F0E9", 0.32),
  courtOpacity: 0.8, texture: "none", spotWarm: rgba("#D99B21", 0.09), spotCool: rgba("#20B8B2", 0.09),
});
const modernCourtReading = readingFamily({
  bg: "#F3F0E9", card: "#FAF8F3", cardHover: "#F1EDE4", muted: "#E7EAEE",
  border: "#DCD7CC", borderStrong: "#C6BFB1", text: "#131923", textDim: "#4C5464", textMuted: "#5F6776", cream: "#F6F3EC",
  arena: "#131923", arenaSoft: "#202838", arenaBorder: "#2F3848", onArena: "#F3F0E9", onArenaDim: "#B7BFCC",
  gold: "#8A6210", goldOnDark: "#E5AC33", goldSoft: "#FBF1D6", goldBorder: "#E2BA55",
  blue: "#235FB5", blueOnDark: "#7FB2F2", blueSoft: "#E5EFFC", blueBorder: "#92B6EA",
  green: "#1F7A50", red: "#B04343", orange: "#9E6410", onGold: "#FFFDF8", insetHi: "#1B2331", insetLo: "#0F141D",
});
const modernCourtLobby = {
  "bg": "#F3F0E9", "panel": "#FAF8F3", "panel-raised": "#FFFFFF", "panel-soft": "#ECE8DF",
  "text": "#131923", "text-secondary": "#3B4352", "text-muted": "#5F6776", "border": "#DCD7CC", "border-strong": "#C6BFB1",
  "page-text": "#3B4352", "page-muted": "#5F6776", "glyph": "#8A6210",
  "hero-bg": "transparent", "hero-text": "#3B4352",
  "glyph-cool": "#8A6210", "glyph-era": "#8A6210", "card-shadow": "0 0 0 1px rgba(242, 181, 29, 0.18), 0 18px 40px rgba(0, 0, 0, 0.35)",
  "arc-opacity": "0",
};

// ── OPTION C — HARDWOOD LUXE ─────────────────────────────────────────────────
const hardwoodArena = arenaFamily({
  bg: "#100C0A", arena: "#150F0C", panel: "#1C1511", panelRaised: "#241B15", panelSoft: "#2C221A",
  text: "#F0E5D2", textSecondary: "#D6C7AD", textMuted: "#A99479",
  teamGold: "#E5B23E", teamBlue: "#4A93E0", coach: "#9B78D8", coachDeep: "#4B2F86", green: "#37A66E", red: "#DC5A54",
  brandGold: MASTER_BRAND.fractureGold, accent: "#48A7F2",
  header: rgba("#100C0A", 0.94), scrim: rgba("#100C0A", 0.9),
  ctaHi: "#F4C558", ctaMid: "#E5B23E", ctaLo: "#B8861F", ctaInk: "#14100A", ctaGlow: "0 8px 18px rgba(229, 178, 62, 0.18)",
  border: rgba("#C7A475", 0.22), borderStrong: rgba("#C7A475", 0.42),
  courtOpacity: 1,
  // A subtle grain: 1px sandstone lines every 9px at 4% — texture, not colour.
  texture: "repeating-linear-gradient(90deg, rgba(199, 164, 117, 0.04) 0 1px, transparent 1px 9px)",
  spotWarm: rgba("#C7A475", 0.10), spotCool: rgba("#48A7F2", 0.08),
});
const hardwoodReading = readingFamily({
  bg: "#F0E5D2", card: "#F8F1E4", cardHover: "#EFE3CF", muted: "#E6DCC9",
  border: "#D9C6A6", borderStrong: "#C7A475", text: "#1E1712", textDim: "#5C4E42", textMuted: "#6B5C4E", cream: "#F5ECDC",
  arena: "#150F0C", arenaSoft: "#241B15", arenaBorder: "#3A2E24", onArena: "#F0E5D2", onArenaDim: "#C4B39A",
  gold: "#7A580A", goldOnDark: "#E5B23E", goldSoft: "#F6E7C2", goldBorder: "#DDB65A",
  blue: "#1F5FA8", blueOnDark: "#7FB6F2", blueSoft: "#E4EEFA", blueBorder: "#8FB4E5",
  green: "#23784C", red: "#AE3F3A", orange: "#9C6414", onGold: "#FFFDF8", insetHi: "#241B15", insetLo: "#100C0A",
});


// ── PRODUCTION — NIGHT COURT V1 (owner-selected hybrid, Phase 9A.2) ──────────
// Night Court Editorial base + Fracture Core master-brand signature:
//   Layer 1 (master brand)  Brand Obsidian header and brand band, metallic
//                           Platinum typography, Fracture Gold + Fracture Cobalt
//                           in ONE controlled diagonal Era Fracture.
//   Layer 2 (Basketball)    Night Obsidian arena, Arena/Raised Graphite cards,
//                           Warm Court Ivory reading surfaces, Editorial Ink.
//   Layer 3 (semantic)      Team Gold, Team Blue, Coach/Era Violet, Success,
//                           Warning, Danger — meanings fixed, luminance tuned.
// Text-bearing semantic colours are lifted for AA on the night panels exactly as
// the candidates were (Team Blue #2F83E7 → #4A92EA as text; Danger #D95050 →
// #E06060 as text; Coach Violet #7656D7 → #A08AE6 as text). The specification
// hex is the semantic BASE and is used for edges, lights and fills.
export const NIGHT_COURT_V1 = Object.freeze({
  layer2: { nightObsidian: "#070A0F", arenaGraphite: "#111823", raisedGraphite: "#172130", warmCourtIvory: "#F1EDE4", editorialInk: "#151B24", secondaryInk: "#505765", softIvoryDivider: "#D7D1C6" },
  layer3: { teamGold: "#E8B13C", teamGoldDeep: "#8E6416", teamBlue: "#2F83E7", teamBlueDeep: "#174F94", coachViolet: "#7656D7", coachVioletDeep: "#432A88", success: "#2FA96D", warning: "#C58B23", danger: "#D95050" },
  textLifted: { teamBlue: "#4A92EA", coachViolet: "#A08AE6", danger: "#E06060" },
});
const NC1 = NIGHT_COURT_V1.layer2, NC3 = NIGHT_COURT_V1.layer3, NCT = NIGHT_COURT_V1.textLifted;
const productionArena = arenaFamily({
  bg: NC1.nightObsidian, arena: "#0A0E15", panel: NC1.arenaGraphite, panelRaised: NC1.raisedGraphite, panelSoft: "#1D2838",
  text: MASTER_BRAND.platinum, textSecondary: MASTER_BRAND.platinumDeep, textMuted: "#98A2B3",
  teamGold: NC3.teamGold, teamBlue: NCT.teamBlue, coach: NCT.coachViolet, coachDeep: NC3.coachVioletDeep, green: NC3.success, red: NCT.danger,
  brandGold: MASTER_BRAND.fractureGold, accent: MASTER_BRAND.fractureCobalt,
  header: rgba(MASTER_BRAND.obsidian, 0.94), scrim: rgba(MASTER_BRAND.obsidian, 0.9),
  ctaHi: "#F5C553", ctaMid: NC3.teamGold, ctaLo: "#B9841F", ctaInk: "#14100A", ctaGlow: "0 8px 18px rgba(232, 177, 60, 0.18)",
  border: rgba(MASTER_BRAND.platinum, 0.15), borderStrong: rgba(MASTER_BRAND.platinum, 0.30),
  courtOpacity: 0.9, texture: "none", spotWarm: rgba(NC3.teamGold, 0.09), spotCool: rgba(MASTER_BRAND.fractureCobalt, 0.10),
  fracture: eraFractureGradient(), fractureGlow: ERA_FRACTURE_GLOW, fractureOn: "1",
  portraitField: "rgba(214, 222, 236, 0.32)", portraitWellHi: "#1E2A3B", portraitWellLo: "#0B1220",
});
// Team Blue and Danger BASE hexes drive the card tints (never text).
productionArena["blue-soft"] = soft(NC3.teamBlue); productionArena["blue-line"] = line(NC3.teamBlue);
productionArena["pc-deep-gold"] = NC3.teamGoldDeep; productionArena["pc-deep-blue"] = NC3.teamBlueDeep;
productionArena["coach-soft"] = rgba(NC3.coachViolet, 0.10); productionArena["coach-line"] = rgba(NC3.coachViolet, 0.38);
const productionReading = readingFamily({
  bg: NC1.warmCourtIvory, card: "#FBF8F1", cardHover: "#F4EFE5", muted: "#E9E6DF",
  border: NC1.softIvoryDivider, borderStrong: "#C3BAA8", text: NC1.editorialInk, textDim: NC1.secondaryInk, textMuted: NC1.secondaryInk, cream: "#F6F1E7",
  arena: "#0A0E15", arenaSoft: NC1.raisedGraphite, arenaBorder: "#2A3140", onArena: MASTER_BRAND.platinum, onArenaDim: "#B9B4A8",
  gold: "#8A6410", goldOnDark: NC3.teamGold, goldSoft: "#FBF0D2", goldBorder: "#E4BC5B",
  blue: "#2461B8", blueOnDark: "#7BB3F5", blueSoft: "#E6EFFC", blueBorder: "#92B7EA",
  green: "#237A4F", red: "#B54040", orange: "#A4640A", onGold: "#FFFDF8", insetHi: "#141B27", insetLo: NC1.nightObsidian,
  fracture: eraFractureGradient(),
});
const productionLobby = {
  // Ivory canvas, off-white cards, ink type; the brand band above is obsidian.
  "bg": NC1.warmCourtIvory, "panel": "#FBF8F1", "panel-raised": "#FFFFFF", "panel-soft": "#ECE6DA",
  "text": NC1.editorialInk, "text-secondary": "#3A4150", "text-muted": NC1.secondaryInk, "border": NC1.softIvoryDivider, "border-strong": "#C3BAA8",
  "page-text": "#3A4150", "page-muted": NC1.secondaryInk, "glyph": "#8A6410",
  "hero-bg": MASTER_BRAND.obsidian, "hero-text": MASTER_BRAND.platinumDeep,
  "glyph-cool": "#2461B8", "glyph-era": "#5B3FB8", "card-shadow": "0 0 0 1px rgba(225, 167, 44, 0.22), 0 14px 30px rgba(21, 27, 36, 0.14)",
  "arc-opacity": "0",
};

/**
 * The four candidates and the production hybrid. `families` is the theme's own 60–30–10 declaration —
 * the audit classifies pixels against these lists — and `semantic` is its
 * tuned semantic set. `secondaryIsLight` says whether reading surfaces are
 * light (they are in A, B and C).
 */
export const BASKETBALL_THEMES = Object.freeze({
  "fracture-core": {
    id: "fracture-core", label: "Fracture Core", role: "CONTROL",
    character: ["master-brand extension", "premium", "dark", "metallic", "futuristic", "sport-neutral"],
    families: {
      dominant: { name: "Obsidian", colors: [MASTER_BRAND.obsidian, "#060A12", "#10161F"] },
      secondary: { name: "Graphite + Platinum", colors: [MASTER_BRAND.graphite, "#1B2330", "#1F2836", "#2A3340", MASTER_BRAND.platinum, MASTER_BRAND.platinumDeep, "#B4BCC9", "#98A2B3"] },
      accent: { name: "Fracture Gold + Fracture Cobalt", colors: [MASTER_BRAND.fractureGold, "#F3C452", "#B8841C", MASTER_BRAND.fractureCobalt], split: { gold: 0.06, cobalt: 0.04 } },
    },
    semantic: { teamGold: "#E4AA31", teamBlue: "#3F8FE6", coachViolet: "#A27BE6", success: "#35B875", danger: "#EE6A6A" },
    secondaryIsLight: false,
    arena: fractureCoreArena, reading: fractureCoreReading, lobby: lobbyFromArena(fractureCoreArena),
    editorial: editorialFromReading(fractureCoreReading, { coachViolet: "#A27BE6" }),
  },
  "night-court": {
    id: "night-court", label: "Night Court Editorial", role: "OPTION A",
    character: ["premium night arena", "sports editorial", "modern broadcast", "high readability", "cinematic but restrained"],
    families: {
      dominant: { name: "Night Obsidian", colors: ["#070A0F", "#0A0E15", "#10151D"] },
      secondary: { name: "Warm Court Ivory + Editorial Ink", colors: ["#F1EDE4", "#FBF8F1", "#F4EFE5", "#E8E2D6", "#151B24", "#1B2230", "#CFC9BC", "#9A9890"] },
      accent: { name: "Royal Violet", colors: ["#7656D7"] },
    },
    semantic: { teamGold: "#E8B13C", teamBlue: "#4A92EA", coachViolet: "#A08AE6", success: "#2FA96D", danger: "#E06060" },
    secondaryIsLight: true,
    arena: nightCourtArena, reading: nightCourtReading, lobby: nightCourtLobby,
    editorial: editorialFromReading(nightCourtReading, { coachViolet: "#5B3FB8" }),
  },
  "modern-court": {
    id: "modern-court", label: "Modern Court Light", role: "OPTION B",
    character: ["modern sports technology", "editorial clarity", "premium light platform", "dark arena inside a light product", "strong differentiation"],
    families: {
      dominant: { name: "Warm Bone", colors: ["#F3F0E9", "#FAF8F3", "#FFFFFF", "#F1EDE4", "#ECE8DF"] },
      secondary: { name: "Midnight Graphite", colors: ["#131923", "#1A2130", "#202838", "#27303F", "#CDD2DC", "#9AA3B2"] },
      accent: { name: "Electric Teal", colors: ["#20B8B2"] },
    },
    semantic: { teamGold: "#E0A52A", teamBlue: "#5296E3", coachViolet: "#A991E8", success: "#34A772", danger: "#EA6E6E" },
    secondaryIsLight: false,
    arena: modernCourtArena, reading: modernCourtReading, lobby: modernCourtLobby,
    editorial: editorialFromReading(modernCourtReading, { coachViolet: "#5B3FB8" }),
  },
  "hardwood-luxe": {
    id: "hardwood-luxe", label: "Hardwood Luxe", role: "OPTION C",
    character: ["luxury hardwood", "historic basketball", "modern scoreboard light", "warm and tactile", "distinct from navy sports products"],
    families: {
      dominant: { name: "Espresso Black", colors: ["#100C0A", "#150F0C", "#1C1511"] },
      secondary: { name: "Court Sandstone + Warm Cream", colors: ["#C7A475", "#F0E5D2", "#F8F1E4", "#EFE3CF", "#E6DCC9", "#D6C7AD", "#A99479", "#241B15", "#2C221A"] },
      accent: { name: "Ice Cobalt", colors: ["#48A7F2"] },
    },
    semantic: { teamGold: "#E5B23E", teamBlue: "#2C79CF", coachViolet: "#8B61CE", success: "#37A66E", danger: "#D2504A" },
    secondaryIsLight: true,
    arena: hardwoodArena, reading: hardwoodReading, lobby: lobbyFromArena(hardwoodArena),
    editorial: editorialFromReading(hardwoodReading, { coachViolet: "#5B3FB8" }),
  },
  "night-court-production-hybrid": {
    id: "night-court-production-hybrid", label: "Night Court V1 (production)", role: "PRODUCTION",
    character: ["premium night arena for play", "warm editorial surfaces for reading", "master-brand obsidian/platinum shell", "one controlled Era Fracture", "clearly EraClash"],
    // Combined declaration (what the 9A.1 harness reads) …
    families: {
      dominant: { name: "Night Obsidian", colors: [NC1.nightObsidian, "#0A0E15", NC1.arenaGraphite, MASTER_BRAND.obsidian] },
      secondary: { name: "Graphite + Platinum · Warm Court Ivory + Editorial Ink", colors: [NC1.raisedGraphite, "#1D2838", MASTER_BRAND.platinum, MASTER_BRAND.platinumDeep, "#98A2B3", NC1.warmCourtIvory, "#FBF8F1", "#FFFFFF", "#F4EFE5", "#ECE6DA", NC1.editorialInk, "#3A4150", NC1.secondaryInk, NC1.softIvoryDivider] },
      accent: { name: "Fracture Gold + Fracture Cobalt", colors: [MASTER_BRAND.fractureGold, "#F5C553", "#B9841F", MASTER_BRAND.fractureCobalt, "#8A6410", "#2461B8"], split: { gold: 0.04, cobalt: 0.03 } },
    },
    // … and the CONTEXTUAL declaration the 9A.2 audit reads: the product has two
    // intentionally different environments and each has its own 60–30–10.
    contexts: {
      arena: {
        fixtures: ["empty", "roll2", "coach", "result"],
        dominant: { name: "Night Obsidian / deep arena", colors: [NC1.nightObsidian, "#0A0E15", MASTER_BRAND.obsidian, "#050B14", "#030811"] },
        secondary: { name: "Graphite / Platinum structure", colors: [NC1.arenaGraphite, NC1.raisedGraphite, "#1D2838", MASTER_BRAND.platinum, MASTER_BRAND.platinumDeep, "#98A2B3"] },
        accent: { name: "Gold + Cobalt (+ Violet reported separately)", colors: [MASTER_BRAND.fractureGold, "#F5C553", "#B9841F", MASTER_BRAND.fractureCobalt] },
        targets: { dominant: [55, 68], secondary: [22, 35], accent: [6, 10] },
      },
      editorial: {
        fixtures: ["lobby", "postgame", "gate", "membership"],
        dominant: { name: "Warm Court Ivory", colors: [NC1.warmCourtIvory, "#FBF8F1", "#FFFFFF", "#F4EFE5", "#ECE6DA", "#E9E6DF", "#F6F1E7"] },
        secondary: { name: "Editorial Ink / Graphite", colors: [NC1.editorialInk, "#3A4150", NC1.secondaryInk, NC1.softIvoryDivider, "#C3BAA8", MASTER_BRAND.obsidian, "#0A0E15", NC1.nightObsidian, MASTER_BRAND.platinum, MASTER_BRAND.platinumDeep] },
        accent: { name: "Gold / Cobalt / Violet accents", colors: [MASTER_BRAND.fractureGold, "#8A6410", "#E4BC5B", MASTER_BRAND.fractureCobalt, "#2461B8", "#92B7EA"] },
        targets: { dominant: [55, 68], secondary: [22, 35], accent: [6, 10] },
      },
    },
    semantic: { teamGold: NC3.teamGold, teamBlue: NC3.teamBlue, coachViolet: NC3.coachViolet, success: NC3.success, warning: NC3.warning, danger: NC3.danger },
    secondaryIsLight: true,
    arena: productionArena, reading: productionReading, lobby: productionLobby,
    editorial: editorialFromReading(productionReading, { coachViolet: "#5B3FB8" }),
  },
});

export const themeRootAliases = (theme) => rootAliases(theme.reading);
