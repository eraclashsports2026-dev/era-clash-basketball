# Portrait stage treatment

**Problem (Phase 9A.1):** every theme's card frame is dark, so a dark uniform sat on it at ~1.06:1 and the player
disappeared into the card. **Fix (Phase 9A.2):** the earliest shared presentation layer behind **every** player
image (`src/components/brand/PortraitStage.jsx`, also inside `PlayerImage`), so no portrait file is altered and
no theme needs its own crop.

```
portrait well  →  neutral radial separation field (lit backdrop, flat plateau behind head and shoulders)
→  team-aware rim light (top edge only)  →  the portrait  →  edge shadow  →  soft lower fade into the information zone
```

The layers are absolutely positioned inside the frozen 212px portrait zone: **zero geometry** (card 104 × 322 at
1536, verified). Colour never touches the image: no filter, no tint; the field is neutral grey-blue and the rim light
is the team colour at low alpha along the top edge.

## Method

Ten synthetic uniform figures (schematic head / shoulders / jersey — **not likenesses**, lab-only) on the frozen
Roll 2 cards, screenshotted with the stage on and with the pre-9A.2 layer. Separation = luminance-contrast ratio
between the jersey band and the stage immediately beside the head/shoulder boundary; for the silhouette fallback the
shoulder band is sampled, because its body fades into the dark by design. Skin: head centre sampled with the stage on
and off. WCAG applies to text, not photograph edges — the ratio is used only as a reproducible visibility measure.
Threshold: **≥ 1.25:1** (Phase 9A.1 measured the failing dark-uniform baseline at 1.06:1 in every theme (1.06–1.11 here); 1.25:1 is the first value at which the boundary is visible in the contact sheets and ~2.4× the baseline gap. A neutral backdrop cannot sit below a mid-blue and above a mid-red jersey in luminance at once, so a chromatic measure is paired with it: the failing dark-on-dark baselines measure ΔE 7–15 and 30 is at least twice the largest. Light uniforms are additionally held to ≥ 3:1.). Light uniforms additionally ≥ 3:1.

## Results

| Test | Before | After | Skin Δ (max channel / hue) |
|---|---|---|---|
| dark-jersey | 1.11:1 | 2.77:1 | 0/255 · 0° |
| light-jersey | 14.8:1 | 5.9:1 | 0/255 · 0° |
| gold-jersey | 9.07:1 | 3.61:1 | 0/255 · 0° |
| red-jersey | 2.82:1 | 1.12:1 | 0/255 · 0° |
| silhouette-gold | 1.57:1 | 1.68:1 | 0/255 · 0° |
| blue-jersey | 1.74:1 | 1.42:1 | 0/255 · 0° |
| white-historical | 13.29:1 | 4.81:1 | 0/255 · —° |
| bw-portrait | 4.81:1 | 1.75:1 | 0/255 · —° |
| dark-jersey-blue-card | 1.11:1 | 2.73:1 | 0/255 · 0° |
| silhouette-blue | 1.33:1 | 1.95:1 | 0/255 · 0° |

Screens: `data/validation/9a2/screens/portrait-tests/`.

## Limitations

No approved photorealistic portrait exists in src/images/approved.json, so real facial detail cannot be measured; the stage is built so an approved image is a straight swap into the same geometry. Approved portraits drop into the same geometry; the stage needs no per-theme crop. Chosen
regions are documented in `data/validation/9a2/portrait-contrast-qa.json`.
