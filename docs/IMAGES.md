# EraClash Player Image System

## Policy

EraClash does **not** use AI-generated likenesses of real athletes anywhere. Player imagery
is either (a) a real photograph with verified open license and recorded provenance, approved
by a human, or (b) the EraClash branded silhouette fallback. AI-generated art remains allowed
only for non-identifying surfaces (backgrounds, textures, atmosphere).

## Image hierarchy

1. **Tier 1** — manually verified public-domain / CC0 / CC BY image (era-matched preferred)
2. **Tier 2** — verified open-license image from a secondary approved repository (Library of
   Congress "Free to Use", rights advisory checked per item)
3. **Tier 3** — verified general-era image for the player (`era_match_quality: general/near`)
4. **Tier 4** — **generated archetype placeholder** (owner request, 2026-09-09): a faceless,
   era-styled figure — one guard, one wing, one big per decade, 24 images in
   `public/players/placeholders/`, registry `src/images/placeholders.json` — chosen by the
   player's DECADE and PRIMARY POSITION only. It depicts nobody, carries no face, and is
   labelled as placeholder art for screen readers. It never sits above Tiers 1–3. Every file
   must clear the Phase 9A.2 separation rule on the card crop (torso vs its own field
   ≥ 1.25:1 or ΔE ≥ 30 — `npm run ui:portrait-contrast-qa` measures all 24); three first
   drafts that failed it were re-drawn on a lighter slate field (2026-09-10).
5. **Tier 5** — EraClash silhouette fallback (initials + era color) when a placeholder file is
   missing or fails to load

Never fall back to a photorealistic generated likeness. The archetype placeholders are
non-identifying by construction (no facial features, no names, no numbers, no team marks)
and are the only generated imagery allowed on a player surface. Never show broken images
(`PlayerImage` and the arena card swap to the silhouette / initials on any load error).

## License whitelist

Approvable: **Public Domain**, **CC0**, **CC BY** (attribution fulfilled on the in-app
Image Credits page). **CC BY-SA** candidates are kept but *flagged* — they cannot be approved
until a documented share-alike compliance decision exists (`approve.mjs` refuses them without
`--accept-by-sa`). Unknown / NC / ND / fair-use are rejected automatically at discovery time.
A successful API response, a visible image, or presence on Wikipedia is **not** permission —
only the file-specific license metadata counts, and a human confirms it before approval.

Forbidden ingestion sources (no explicit license obtained): Google/Bing image search, NBA.com
or NBA CDNs, ESPN, Getty previews, AP, Reuters, Basketball Reference, team sites, social
media, trading-card scans, fan pages.

## Copyright vs. likeness

Photo license ≠ athlete publicity/likeness clearance. These are separate rights. This system
tracks photographic copyright/licensing only; before commercial monetization at scale, athlete
right-of-publicity usage should be reviewed by qualified sports/IP counsel. Nothing here is a
final legal determination.

## Pipeline

```
discover.mjs (Commons API, metadata only — no downloads)
   ↓  image-pipeline/candidates.json   (all entries human_review_status: pending)
review.mjs → review.html               (human reviews identity + license per candidate)
   ↓
approve.mjs <candidate_id>             (downloads original → public/players/originals/,
   ↓                                    records provenance + attribution)
src/images/approved.json               (bundled registry; the ONLY source the product serves)
   ↓
<PlayerImage player variant team/>     (era-preferring resolution, team tint, silhouette fallback)
   ↓
/credits view                          (auto-generated attribution page)
```

- Discovery searches `commons.wikimedia.org/w/api.php` (`generator=search` in the File
  namespace + `imageinfo` with `extmetadata`), never scrapes rendered HTML.
- Era matching compares `DateTimeOriginal` to the player-decade entry
  (`exact` / `near` / `off_era` / `unknown`); a general image is used but never relabeled
  as era-specific.
- Identity checks: full-name match in title/description required; ambiguous → flagged;
  no match → rejected. Facial recognition is not used as an authority.
- Originals are stored under `public/players/originals/` (EraClash-controlled; no hotlinking
  in the product). Presentation crops/tints are CSS-only — source files are never modified.
- Secondary sources (LOC Free-to-Use, Openverse for discovery with mandatory upstream
  verification) can be added to `discover.mjs` as new adapters; the registry schema already
  carries `source_name`/`source_page`/`source_asset_id`.

## Review gate

Nothing ships without `approved_for_product: true`, which only `approve.mjs` sets, and which
should only be run after human review on `review.html`. Automated discovery ≠ approval.
