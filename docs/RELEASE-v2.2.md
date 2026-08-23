# EraClash Basketball v2.2 — Unified Arena UI + Player Image System

Prepared 2026-08-23 on branch `v2-rebuild`, on top of v2.1. **Not deployed.**

## What changed

### Arena environment (one product, start to finish)
- CSS-only arena backdrop (`src/index.css` `.arena`): overhead light pools, faint court
  lines/center circle, seating gradients, vignette, gold/blue side ambience. Felt, not noticed.
- Design tokens centralized in `src/theme.js` (backgrounds, text tiers, gold/blue accents +
  borders + glows, shadows). Winner-dependent atmosphere: `.win-gold` / `.win-blue` shift the
  arena lighting after a result without recoloring the app.
- Compact persistent `GameHeader` (Play · Daily · Challenges · Leaderboard · My EraClash,
  streak flame, Save Career / profile chip) replaces the tall hero. Gameplay hero reduced to
  a three-line editorial masthead (~55% less vertical space).

### Main builder — a matchup, not a form
- TEAM GOLD (gold border/glow, warm panel) vs TEAM BLUE (blue border/glow, cool panel) with
  a central animated VS anchor.
- Solid elevated player slots (no dashed-placeholder look): position chip + plus affordance
  empty; premium card when filled — image/silhouette, name, era, team, archetypes, OVR, and
  **TEAM FIT** (EXCELLENT/GOOD/NEUTRAL/POOR, computed from real chemistry outcomes —
  `src/chemistryView.js`; OVR ≠ FIT is now visible).
- **Build methods**: 🎲 Chaos Draft (the existing 3-roll Yahtzee, unchanged logic) and
  ✍️ Manual Draft (new slot-scoped picker: search, era filter, sorted by slot OVR). Daily
  stays locked to seeded rolls (that IS the daily).
- **Opponent reveal**: for Single/Best-of-7/Daily the Blue five (same `genOpponent` pool as
  always) is revealed once Gold is locked — with a "New opponent" re-roll. Win 82/Tournament
  show era-pool explainers. Challenges show the rival's five immediately with rivalry record.
- **Chemistry panel**: live 0–100 score (documented rescaling of the real multiplier +
  bonuses/gaps — no new basketball math), 10-segment meter, named strengths/concerns, pulse
  animation on every pick.
- **Matchup Preview** in the center: locked until both fives are complete, then real engine
  matchup edges as gold/blue bars + win probability from the engine's actual elo model
  (clamped 4–96%, labeled as an engine prediction).
- ⚡ RUN THE SIM: premium gold gradient CTA, sticky on mobile, mode subtitle underneath.

### Simulation loading
- Dark-arena `SimulationLoading` panel (never leaves the environment): branding, GOLD vs
  BLUE, spinner, and REAL stages wired to the request lifecycle via `simClient` `onStage`
  ("Preparing matchup" → "Running simulation" → "Validating result" → "Retrying"), plus true
  Win 82 game-count progress. No fake timed stages.

### Postgame broadcast
- Scoreboard hero: lineup strips (5 tinted player images/silhouettes per side), giant
  gold/blue scores, VS, winner pill ("TEAM GOLD WINS"), series line for Best of 7.
- MVP feature card with real image (or silhouette), era/team, PTS/REB/AST/STL from the
  actual box score, grounded one-liner.
- WHY YOU WON/LOST summary · TURNING POINT (only when the result provides one) ·
  MATCHUP BREAKDOWN (gold-vs-blue bars from box-score totals) · per-team CHEMISTRY dials ·
  four-quadrant strengths/weaknesses · collapsible broadcast box score with MVP row
  highlight + pre-game engine edges.
- Context-sensitive action bar unchanged in logic, restyled (single→Best of 7,
  challenge→Rematch, daily→Share/Leaderboard, best7→Challenge This Team).

### Player image system (see docs/IMAGES.md for full policy)
- **No AI athlete likenesses, ever.** `<PlayerImage player variant team/>` is the single
  render path: approved era-matched real image → approved general image → branded
  silhouette (initials + era color + jersey mark). Fixed-size containers (no layout shift),
  lazy loading, team-tint treatments, error → silhouette (no broken images).
- Discovery pipeline (`image-pipeline/`): Commons Action API metadata search (no HTML
  scraping, no file downloads at discovery), license whitelist (PD/CC0/CC BY approvable;
  CC BY-SA flagged, NC/ND/unknown auto-rejected), era scoring, identity checks, full
  provenance per candidate. Human review page (`review.mjs` → review.html) + `approve.mjs`
  (downloads original to `public/players/originals/`, records attribution). Production
  serves only `src/images/approved.json` (currently EMPTY — nothing ships until Joe reviews).
- `/credits` surface: in-app Image Credits view auto-generated from the registry (footer link).

## Numbers
- Bundle: 90.6 kB gzip JS + 1.1 kB CSS (arena is pure CSS; zero image payload shipped).
- Tests: 46 passing (adds chemistry-view, team-fit, win-probability clamp, license
  whitelist, era matching, approved-registry invariants).
- Image discovery (at time of writing): in progress across all 330 entries; candidates are
  PENDING — none approved. Re-run `npm run images:discover` to resume (resumable, rate-limit
  aware), `npm run images:review` to regenerate the review page.

## CEO approval items
1. **KV provisioning** (carried from v2.1): Vercel dashboard → Storage → Create → Upstash
   Redis (Marketplace) → connect to the era-clash-basketball project. The env vars
   (`KV_REST_API_URL`/`KV_REST_API_TOKEN` or Upstash names) activate all persistence.
2. **Image approvals**: open `image-pipeline/review.html`, verify identity + license per
   candidate, then `npm run images:approve <candidate_id> ...`. Nothing renders real photos
   until then. CC BY-SA needs an explicit share-alike compliance decision first.
3. **Manual Draft** is a new build method (Chaos Draft preserved as default; Daily
   unaffected). Flag if you want it held back.
4. Engine-season Win 82 flag + prompt turningPoint (carried from v2.1).

## Known limitations
- OG share images still text-only (deferred; `/result/{id}` architecture ready).
- Likeness/right-of-publicity review by counsel still required before scaled monetization.
- Web-size derivative generation for approved originals is manual for now (originals can be
  large; generate resized copies before shipping many approvals).
- E2E browser tests remain manual (this session: builder/manual draft/daily/profile/
  leaderboard/challenge hub/postgame verified in-browser, mobile overflow checked).
