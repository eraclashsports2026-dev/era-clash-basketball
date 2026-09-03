# EraClash Basketball — theme options

**Status:** THEME LAB COMPLETE — AWAITING OWNER PALETTE SELECTION. No option is
selected here. The four candidates share one DOM, one layout, one set of
deterministic fixtures and one measurement harness; the numbers below are what
the harness measured on the theme-lab build. Screens:
`data/validation/9a1/screens/<theme>/`; contact sheets:
`data/validation/9a1/screens/comparisons/`; comparison index:
`data/validation/9a1/theme-comparison-index.html`.

DOM invariant across themes: 108/108 checks (±2px primary regions, ±3px text).
Master brand shared by all four: obsidian, platinum, graphite, Fracture Gold,
Fracture Cobalt; a controlled diagonal Era Fracture; EraClash Logo Mk1.

## CONTROL — Fracture Core

**Character:** master-brand extension · premium · dark · metallic · futuristic · sport-neutral

| Layer | Family | Values |
|---|---|---|
| 60% dominant | Obsidian | #03060B, #060A12, #10161F |
| 30% secondary | Graphite + Platinum | #141A24, #1B2330, #1F2836, #2A3340, #E7EAF0, … |
| 10% accent | Fracture Gold + Fracture Cobalt | #E1A72C, #F3C452, #B8841C, #267CE8 (gold ≈ 6%, cobalt ≈ 4%) |
| semantic | Team Gold / Team Blue / Coach Violet / Success / Danger | #E4AA31 / #3F8FE6 / #A27BE6 / #35B875 / #EE6A6A |

**Measured (1536×1024 averages across the six fixtures):** dominant 62.8% · secondary 25.5% · decorative accent 2% · flags: PLATINUM_UNDERREPRESENTED.

**Contrast:** 1300/1300 visible text pairs pass WCAG AA across the six fixtures at desktop and phone; every named token pair passes AA. Long-form Postgame: average 10.3:1, lowest passing 6:1, 1 paragraphs, line-height 1.6, minimum 12.5px.

**Fatigue risk (thresholded, not a preference):** MODERATE — nearBlackAreaPct 62.8, lowContrastSecondaryShare 0, glowCount 6, glowNearText 0, borderedPer100kPx 3.683, longParagraphsOnDark 0, saturatedAccentPct 2, capsShare 0.257.

**Competitive differentiation:** DISTINCT WITH RISKS — dark ground + warm CTA is the same STRUCTURE as 82-0 (dark + warm button); differentiation rests on obsidian-not-navy, gold-not-orange, platinum structure and the cobalt fracture.

**Portrait compatibility:** silhouette-to-frame 1.2:1; uniform swatches with blend risk: 1 of 5.

**Rendering:** first paint 180ms · LCP 180ms · CLS 0 · theme switch ≤ 50ms.

**Preview:** `https://era-clash-basketball-git-phase-9a1-basketball-c3bb89-era-clash.vercel.app/dev/basketball-theme-lab?theme=fracture-core`

## OPTION A — Night Court Editorial

**Character:** premium night arena · sports editorial · modern broadcast · high readability · cinematic but restrained

| Layer | Family | Values |
|---|---|---|
| 60% dominant | Night Obsidian | #070A0F, #0A0E15, #10151D |
| 30% secondary | Warm Court Ivory + Editorial Ink | #F1EDE4, #FBF8F1, #F4EFE5, #E8E2D6, #151B24, … |
| 10% accent | Royal Violet | #7656D7 |
| semantic | Team Gold / Team Blue / Coach Violet / Success / Danger | #E8B13C / #4A92EA / #A08AE6 / #2FA96D / #E06060 |

**Measured (1536×1024 averages across the six fixtures):** dominant 56.3% · secondary 32.3% · decorative accent 1.9% · flags: PLATINUM_UNDERREPRESENTED.

**Contrast:** 1300/1300 visible text pairs pass WCAG AA across the six fixtures at desktop and phone; every named token pair passes AA. Long-form Postgame: average 9.56:1, lowest passing 4.69:1, 1 paragraphs, line-height 1.6, minimum 12.5px.

**Fatigue risk (thresholded, not a preference):** MODERATE — nearBlackAreaPct 56.3, lowContrastSecondaryShare 0, glowCount 6, glowNearText 0, borderedPer100kPx 3.683, longParagraphsOnDark 0, saturatedAccentPct 1.9, capsShare 0.257.

**Competitive differentiation:** CLEARLY DISTINCT.

**Portrait compatibility:** silhouette-to-frame 1.21:1; uniform swatches with blend risk: 1 of 5.

**Rendering:** first paint 176ms · LCP 176ms · CLS 0 · theme switch ≤ 49.9ms.

**Preview:** `https://era-clash-basketball-git-phase-9a1-basketball-c3bb89-era-clash.vercel.app/dev/basketball-theme-lab?theme=night-court`

## OPTION B — Modern Court Light

**Character:** modern sports technology · editorial clarity · premium light platform · dark arena inside a light product · strong differentiation

| Layer | Family | Values |
|---|---|---|
| 60% dominant | Warm Bone | #F3F0E9, #FAF8F3, #FFFFFF, #F1EDE4, #ECE8DF |
| 30% secondary | Midnight Graphite | #131923, #1A2130, #202838, #27303F, #CDD2DC, … |
| 10% accent | Electric Teal | #20B8B2 |
| semantic | Team Gold / Team Blue / Coach Violet / Success / Danger | #E0A52A / #5296E3 / #A991E8 / #34A772 / #EA6E6E |

**Measured (1536×1024 averages across the six fixtures):** dominant 27.1% · secondary 61.7% · decorative accent 1.8% · flags: PLATINUM_UNDERREPRESENTED.

**Contrast:** 1300/1300 visible text pairs pass WCAG AA across the six fixtures at desktop and phone; every named token pair passes AA. Long-form Postgame: average 9.71:1, lowest passing 4.69:1, 1 paragraphs, line-height 1.6, minimum 12.5px.

**Fatigue risk (thresholded, not a preference):** LOW — nearBlackAreaPct 0, lowContrastSecondaryShare 0, glowCount 6, glowNearText 0, borderedPer100kPx 3.683, longParagraphsOnDark 0, saturatedAccentPct 1.8, capsShare 0.257.

**Competitive differentiation:** CLEARLY DISTINCT.

**Portrait compatibility:** silhouette-to-frame 1.42:1; uniform swatches with blend risk: 1 of 5.

**Rendering:** first paint 176ms · LCP 176ms · CLS 0 · theme switch ≤ 64.6ms.

**Preview:** `https://era-clash-basketball-git-phase-9a1-basketball-c3bb89-era-clash.vercel.app/dev/basketball-theme-lab?theme=modern-court`

## OPTION C — Hardwood Luxe

**Character:** luxury hardwood · historic basketball · modern scoreboard light · warm and tactile · distinct from navy sports products

| Layer | Family | Values |
|---|---|---|
| 60% dominant | Espresso Black | #100C0A, #150F0C, #1C1511 |
| 30% secondary | Court Sandstone + Warm Cream | #C7A475, #F0E5D2, #F8F1E4, #EFE3CF, #E6DCC9, … |
| 10% accent | Ice Cobalt | #48A7F2 |
| semantic | Team Gold / Team Blue / Coach Violet / Success / Danger | #E5B23E / #2C79CF / #8B61CE / #37A66E / #D2504A |

**Measured (1536×1024 averages across the six fixtures):** dominant 48.2% · secondary 40.4% · decorative accent 1.8% · no colour flags.

**Contrast:** 1300/1300 visible text pairs pass WCAG AA across the six fixtures at desktop and phone; every named token pair passes AA. Long-form Postgame: average 9.55:1, lowest passing 5.08:1, 1 paragraphs, line-height 1.6, minimum 12.5px.

**Fatigue risk (thresholded, not a preference):** LOW — nearBlackAreaPct 48.2, lowContrastSecondaryShare 0, glowCount 6, glowNearText 0, borderedPer100kPx 3.683, longParagraphsOnDark 0, saturatedAccentPct 1.8, capsShare 0.257.

**Competitive differentiation:** DISTINCT WITH RISKS — warm sandstone/gold family shares warmth with an orange system — kept desaturated (sandstone saturation 0.41) and gold-hued (CTA hue ≈ 41°); watch any brightening.

**Portrait compatibility:** silhouette-to-frame 1.24:1; uniform swatches with blend risk: 1 of 5.

**Rendering:** first paint 180ms · LCP 180ms · CLS 0 · theme switch ≤ 64.6ms.

**Preview:** `https://era-clash-basketball-git-phase-9a1-basketball-c3bb89-era-clash.vercel.app/dev/basketball-theme-lab?theme=hardwood-luxe`

## How to decide

Open the comparison index or the four preview links, look at the same fixture
in each theme at 1536×1024, 1440×900 and 390×844, and read the long-form
Postgame in each. Then reply in the decision format:

```
SELECT:
Fracture Core
Night Court Editorial
Modern Court Light
Hardwood Luxe
or Hybrid: [precise combination]
```
