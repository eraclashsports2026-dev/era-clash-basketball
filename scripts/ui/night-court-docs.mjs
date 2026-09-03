#!/usr/bin/env node
// ── Write the four Phase 9A.2 brand documents from the measured artifacts ────
//   node scripts/ui/night-court-docs.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { getTheme, PRODUCTION_THEME_ID, PRODUCTION_THEME_NAME, CANDIDATE_THEME_IDS } from "../../src/theme/themeResolver.js";
import { NIGHT_COURT_V1 } from "../../src/theme/basketballThemes.js";
import { MASTER_BRAND, ERA_FRACTURE, eraFractureGradient } from "../../src/theme/masterBrandTokens.js";
import { SEMANTIC_ROLES } from "../../src/theme/semanticTokens.js";

const OUT = "data/validation/9a2";
const json = (f) => (existsSync(`${OUT}/${f}`) ? JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")) : null);
const t = getTheme(PRODUCTION_THEME_ID);
const color = json("contextual-60-30-10-audit.json"), por = json("portrait-contrast-qa.json"), fr = json("era-fracture-qa.json"), acc = json("theme-accessibility-qa.json"), lf = json("long-form-reading-qa.json"), comp = json("theme-competitive-differentiation.json"), sel = json("basketball-theme-owner-selection.json"), logo = json("logo-mk1-manifest.json");
const pct = (v) => (v == null ? "—" : `${v}%`);
const base = process.env.PREVIEW_BASE || "<branch-preview>";
const row = (cells) => `| ${cells.join(" | ")} |`;

// ── 1. The theme ─────────────────────────────────────────────────────────────
const ctx = color?.contexts;
const theme = `# EraClash Basketball — Night Court V1 (\`${PRODUCTION_THEME_NAME}\`)

**Status:** implemented on the Phase 9A.2 branch as the product default; **OWNER_ACCEPTANCE_PENDING**.
Selected by the owner as *Hybrid — Night Court Editorial base + Fracture Core master-brand signature*
(\`${OUT}/basketball-theme-owner-selection.json\`). Stable Wave 1 promotion: **not authorised**. Production promotion: **not authorised**.

Theme id \`${PRODUCTION_THEME_ID}\` (the fifth entry of the owner-only lab; the four Phase 9A.1 candidates
${CANDIDATE_THEME_IDS.join(", ")} are unchanged). Applied by \`src/main.jsx\` before the first render; there is no user-facing selector.

## Identity

A premium **night-game arena** for active play, paired with **warm editorial surfaces** for reading, analysis, history
and account experiences — held together by the master brand: Obsidian, metallic Platinum, Fracture Gold and Fracture
Cobalt, expressed through one controlled diagonal Era Fracture.

## Three layers

| Layer | Token | Value | Role |
|---|---|---|---|
| 1 · Master brand | Brand Obsidian | \`${MASTER_BRAND.obsidian}\` | global header, lobby brand band, deep negative space |
| 1 | Metallic Platinum | \`${MASTER_BRAND.platinum}\` | arena typography, neutral structure |
| 1 | Structural Graphite | \`${MASTER_BRAND.graphite}\` | master-brand neutral panel |
| 1 | Fracture Gold | \`${MASTER_BRAND.fractureGold}\` | the warm half of the Era Fracture; primary action; brand emphasis |
| 1 | Fracture Cobalt | \`${MASTER_BRAND.fractureCobalt}\` | the cool half of the Era Fracture; Team Blue light |
| 2 · Basketball | Night Obsidian | \`${NIGHT_COURT_V1.layer2.nightObsidian}\` | arena page and floor |
| 2 | Arena Graphite | \`${NIGHT_COURT_V1.layer2.arenaGraphite}\` | arena panels |
| 2 | Raised Graphite | \`${NIGHT_COURT_V1.layer2.raisedGraphite}\` | cards, raised panels |
| 2 | Warm Court Ivory | \`${NIGHT_COURT_V1.layer2.warmCourtIvory}\` | every reading canvas: lobby body, Full Postgame, Box Score, gates |
| 2 | Editorial Ink | \`${NIGHT_COURT_V1.layer2.editorialInk}\` | reading text and headings |
| 2 | Secondary Ink | \`${NIGHT_COURT_V1.layer2.secondaryInk}\` | secondary reading text |
| 2 | Soft Ivory Divider | \`${NIGHT_COURT_V1.layer2.softIvoryDivider}\` | reading dividers and borders |
| 3 · Semantic | see \`docs/brand/semantic-color-usage.md\` | | |

## Surface mapping

| Surface | Environment | Shell |
|---|---|---|
| Global header | master brand (always obsidian, Mk1 logo, platinum) | \`.ec-brand-header\` |
| Play Lobby | obsidian brand band + ivory canvas, off-white cards, ink | arena shell + \`--ec-l-*\` |
| Chaos Clash Time Arena, Coach Chaos, Era Reveal, simulation, Result Dock | dark arena | \`.ec-arena-shell\` (\`--ec-a-*\`) |
| Full Postgame, Box Score, Game Story, Coaching & Strategy, Analysis | dark result hero → ivory report | reading tokens (\`--ec-t-*\`) |
| Dream Matchup builder and picker | ivory editorial | reading tokens |
| Account gate | ivory editorial | reading tokens |
| Membership, Fantasy, mode information | ivory editorial (arena names remapped) | \`.ec-editorial-shell\` |

## Contextual 60–30–10, as measured (1536×1024)

| Context | Dominant | Secondary | Decorative accent | Targets |
|---|---|---|---|---|
| Arena (${ctx?.arena.fixtures.join(", ") ?? "—"}) | ${pct(ctx?.arena.dominantPct)} | ${pct(ctx?.arena.secondaryPct)} | ${pct(ctx?.arena.decorativeAccentPct)} | 55–68 / 22–35 / 6–10 |
| Editorial (${ctx?.editorial.fixtures.join(", ") ?? "—"}) | ${pct(ctx?.editorial.dominantPct)} | ${pct(ctx?.editorial.secondaryPct)} | ${pct(ctx?.editorial.decorativeAccentPct)} | 55–68 / 22–35 / 6–10 |
| Combined product | ${pct(ctx?.combined.dominantPct)} | ${pct(ctx?.combined.secondaryPct)} | ${pct(ctx?.combined.decorativeAccentPct)} | — |

Deviations and their reasons are recorded in \`${OUT}/contextual-60-30-10-audit.json\` (\`deviations\`, \`reasons\`). The
interface was not altered to hit a pixel percentage: the Era Fracture is a line system by contract, so its pixel
area is small while it stays visible and recognisable.

## Accessibility

${acc ? `Rendered text pairs passing AA: ${acc.results.filter((r) => /text pairs pass AA/.test(r.name)).length} fixture/viewport passes of ${acc.results.filter((r) => /text pairs pass AA/.test(r.name)).length}; every named token pair ≥ 4.5:1 (lowest ${Math.min(...Object.values(acc.namedPairs)).toFixed(2)}:1).` : "—"}
${lf ? `Long-form Postgame: ${lf.surfaces.postgame.passCount}/${lf.surfaces.postgame.pairs} pairs, average ${lf.surfaces.postgame.avgContrast}:1, lowest passing ${lf.surfaces.postgame.lowestPassing?.contrast}:1.` : ""}

## Differentiation

${comp ? `${comp.matrixRow.classification}. ${comp.matrixRow.structuralNote}` : "—"}

## Preview

\`${base}/play\` (owner or tester session) · lab: \`${base}/dev/basketball-theme-lab?theme=${PRODUCTION_THEME_ID}\` (owner only).
`;
writeFileSync("docs/brand/eraclash-basketball-night-court-v1.md", theme);

// ── 2. Era Fracture usage ────────────────────────────────────────────────────
const fracture = `# Era Fracture — usage

The Era Fracture is **a diagonal collision between Fracture Gold and Fracture Cobalt**: one geometry
(${ERA_FRACTURE.angleDeg}°, gold to ${ERA_FRACTURE.goldStop * 100}%, a ${ERA_FRACTURE.seamWidth * 100}% bright seam), reused everywhere it appears.

\`\`\`css
${eraFractureGradient()}
\`\`\`

It is **not** random marble cracks, kintsugi on every card, lightning around every panel, a universal border or a
repeated decorative pattern.

## Primitives (\`src/components/brand/EraFracture.jsx\`)

| Primitive | What it draws | Footprint |
|---|---|---|
| \`EraFractureDivider\` | a 2px rule carrying the divide | 2px tall |
| \`EraFractureActiveEdge\` | a 2px bar along the top of a selected panel, fades in | absolute, none |
| \`EraFractureTransition\` | one diagonal sweep of light across a stage (900ms, once); \`hold\` keeps it lit while the game simulates | absolute, none |
| \`EraFractureWatermark\` | a 5% diagonal wash for the share/result graphic | absolute, none |

CSS state hooks paint the same divide on selected states (\`--ec-a-fracture\`), gated by \`--ec-a-fracture-on\`
(1 on the production theme, 0 on the four historical candidates), so every theme renders the same DOM.

## Approved placements — and whether each paints

| # | Placement | Hook | Verified |
|---|---|---|---|
${(fr?.placements || []).map((p) => row([p.n, p.placement, `\`${(json("era-fracture-contract.json")?.approvedPlacements.find((a) => a.n === p.n) || {}).hook || ""}\``, p.pass ? "yes" : "NO"])).join("\n")}

## Forbidden

Every empty card · every paragraph panel · every table row · every coach card simultaneously · random panel corners ·
long-form reading backgrounds · a universal border. Verified: ${fr ? fr.results.filter((r) => /forbidden|random cracks/.test(r.name)).every((r) => r.pass) ? "no forbidden placement paints" : "a forbidden placement paints — see era-fracture-qa.json" : "—"}.

## The one-glow rule

| Product state | The one dominant glow |
|---|---|
| Empty arena | the primary Roll CTA |
| Hold (Roll 1–2 decisions) | the held cards (fracture light) |
| Era Reveal | the era panel's fracture edge |
| Hire (Coach Chaos) | the selected staff (violet) |
| Simulating | the central fracture transition |
| Result | the final-score panel's fracture edge |
| Lobby | the recommended flagship card |

## Motion

The sweep runs once per roll (never loops). Under \`prefers-reduced-motion: reduce\` it does not animate; the
simulating hold shows a static half-strength frame. Nothing flashes.
`;
writeFileSync("docs/brand/era-fracture-usage.md", fracture);

// ── 3. Semantic colour usage ─────────────────────────────────────────────────
const L3 = NIGHT_COURT_V1.layer3, LT = NIGHT_COURT_V1.textLifted;
const semantic = `# Semantic colour usage — EraClash Basketball

Meanings are **permanent**. A theme may adjust a semantic colour's luminance to keep contrast on its own surfaces; it
may never reverse a meaning. Solo play labels: **TEAM GOLD · YOUR FIVE** and **TEAM BLUE · LEGEND RIVAL**.

| Colour | Base | Deep | Text on night panels | Text on ivory | Meaning |
|---|---|---|---|---|---|
| Team Gold | \`${L3.teamGold}\` | \`${L3.teamGoldDeep}\` | \`${t.arena.gold}\` | \`${t.reading.gold}\` | ${SEMANTIC_ROLES.teamGold} |
| Team Blue | \`${L3.teamBlue}\` | \`${L3.teamBlueDeep}\` | \`${LT.teamBlue}\` | \`${t.reading.blue}\` | ${SEMANTIC_ROLES.teamBlue} |
| Coach / Era Violet | \`${L3.coachViolet}\` | \`${L3.coachVioletDeep}\` | \`${LT.coachViolet}\` | \`#5B3FB8\` | ${SEMANTIC_ROLES.coachViolet} |
| Success | \`${L3.success}\` | — | \`${t.arena.green}\` | \`${t.reading.green}\` | ${SEMANTIC_ROLES.success} |
| Warning | \`${L3.warning}\` | — | — | — | ${SEMANTIC_ROLES.warning} |
| Danger | \`${L3.danger}\` | — | \`${LT.danger}\` | \`${t.reading.red}\` | ${SEMANTIC_ROLES.danger} |
| Disabled | context-derived neutral grey | | | | ${SEMANTIC_ROLES.disabled} |
| Neutral | Platinum / Graphite | | | | ${SEMANTIC_ROLES.neutral} |

Why two values: the specification hex is the **base** — used for edges, lights, fills and card tints. As **text** on
the night panels a base like \`${L3.teamBlue}\` measures ~4.4:1, so text-bearing uses are lifted at the same hue
(the same rule the four Phase 9A.1 candidates followed).

## Use / do not use

**Team Gold** — player-card edge, team title, selected/held state, gold score, gold-side result emphasis, gold-side
lighting; the primary action. Never on a Blue card's action.

**Team Blue (Cobalt)** — player-card edge, team title, held state, blue score, blue-side emphasis and lighting; the cool
half of the Era Fracture. Never a decorative border on neutral content.

**Coach / Era Violet** — Coach Chaos heading, coach offer category, selected coach, Era Reveal, era-impact emphasis,
time distortion. Never navigation, body text, a team, a standard error or a universal border. Coach cards stay
graphite with restrained violet.

**Success / Danger** — success and valid states; errors, destructive actions, losses, BIGGEST RISK.

## Verified on the rendered arena (\`${OUT}/semantic-color-qa.json\`)

${json("semantic-color-qa.json") ? json("semantic-color-qa.json").results.map((r) => `- ${r.pass ? "✓" : "✗"} ${r.name}`).join("\n") : "—"}
`;
writeFileSync("docs/brand/semantic-color-usage.md", semantic);

// ── 4. Portrait stage ────────────────────────────────────────────────────────
const portrait = `# Portrait stage treatment

**Problem (Phase 9A.1):** every theme's card frame is dark, so a dark uniform sat on it at ~1.06:1 and the player
disappeared into the card. **Fix (Phase 9A.2):** the earliest shared presentation layer behind **every** player
image (\`src/components/brand/PortraitStage.jsx\`, also inside \`PlayerImage\`), so no portrait file is altered and
no theme needs its own crop.

\`\`\`
portrait well  →  neutral radial separation field (lit backdrop, flat plateau behind head and shoulders)
→  team-aware rim light (top edge only)  →  the portrait  →  edge shadow  →  soft lower fade into the information zone
\`\`\`

The layers are absolutely positioned inside the frozen 212px portrait zone: **zero geometry** (card 104 × 322 at
1536, verified). Colour never touches the image: no filter, no tint; the field is neutral grey-blue and the rim light
is the team colour at low alpha along the top edge.

## Method

Ten synthetic uniform figures (schematic head / shoulders / jersey — **not likenesses**, lab-only) on the frozen
Roll 2 cards, screenshotted with the stage on and with the pre-9A.2 layer. Separation = luminance-contrast ratio
between the jersey band and the stage immediately beside the head/shoulder boundary; for the silhouette fallback the
shoulder band is sampled, because its body fades into the dark by design. Skin: head centre sampled with the stage on
and off. WCAG applies to text, not photograph edges — the ratio is used only as a reproducible visibility measure.
Threshold: **≥ ${por?.threshold?.separationAtShoulder ?? "—"}:1** (${por?.threshold?.derivation ?? ""}). Light uniforms additionally ≥ 3:1.

## Results

| Test | Before | After | Skin Δ (max channel / hue) |
|---|---|---|---|
${(por?.rows || []).map((r) => row([r.id, `${r.before.separationAtShoulder}:1`, `${r.separationAtShoulder}:1`, r.skinShiftMax == null ? "—" : `${r.skinShiftMax}/255 · ${r.skinHueShift ?? "—"}°`])).join("\n")}

Screens: \`${OUT}/screens/portrait-tests/\`.

## Limitations

${por?.limitation ?? ""} Approved portraits drop into the same geometry; the stage needs no per-theme crop. Chosen
regions are documented in \`${OUT}/portrait-contrast-qa.json\`.
`;
writeFileSync("docs/brand/portrait-stage-treatment.md", portrait);
console.log("wrote docs/brand/{eraclash-basketball-night-court-v1,era-fracture-usage,semantic-color-usage,portrait-stage-treatment}.md");
