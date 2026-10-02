# Franchise Clash contract

Version: `loop-franchises-1.0.0` · Basketball only · 2026-10-02.

`src/loop/franchises.js` defines 30 curated all-time franchise fives using only canonical, existing Basketball player-decade cards. Slot order is PG, SG, SF, PF, C. Every five must be legal under the existing lineup validator; it contains five different people. The 435 unordered pairings each have one canonical `/clash/all-time/<slug>` route. These are owner-review roster proposals, not official franchise rankings.

Watch uses the same player IDs shown on the pairing page, League-Average Staff for both sides, and 2020s rules. Take Control opens `/clash/franchise?gold=<id>&blue=<id>&entry=control`, lets the user select an eligible five from the current franchise pool, and exposes existing coach and era choices. Both call the existing server-owned simulation. No preview page invents a score or game result.

The current engine flag selects the existing production engine or the current preview candidate; this module adds no engine, calibration, player attributes, stats or synthetic player identities. Public sharing requires the implemented consent/ownership flow. Casual franchise play does not establish competitive human rating.

Default names include the historical franchise name plus “All-time.” The central neutral-naming flag uses city plus era; the two Los Angeles clubs remain distinguishable as Gold and Blue. Neutral names do not establish commercial rights clearance. Player names, historic franchise references, roster choices and operator/legal copy remain owner release decisions.

The Vite build generates the shipped `dist/sitemap.xml` directly from all 435 canonical pairing paths; no localhost sitemap is committed in `public/`. Origin priority is `PUBLIC_SITE_ORIGIN`, then HTTPS `VERCEL_PROJECT_PRODUCTION_URL`, then HTTPS `VERCEL_URL`. Hosted builds reject a missing origin, localhost or a non-HTTPS origin. Local builds explicitly warn that their fallback `http://localhost:4320` is for verification only. Set `PUBLIC_SITE_ORIGIN` to the actual verified deployment/domain value for public builds. `node scripts/loop/sitemap.mjs --local` can regenerate only the local emitted sitemap; a local canonical is not a production configuration. Generating the ignored HTML/PNG artifacts alone does not update the shipped sitemap.

The same validated build origin fills the home canonical, `og:url`, `og:image` and `twitter:image`; the existing simulation description is preserved. Source HTML contains a build token instead of a made-up deployment hostname. Copy the actual assigned hostname from the existing hosting Domains/deployment record when setting the owner variable.

Sources and per-franchise choices are in [roster provenance](../data/franchise-rosters-2026-10-02.md). `poolIds` is a conservative card-label/curated-five pool, not a complete career-affiliation database. Current omissions include era-appropriate candidates documented there; no missing athlete or decade card was invented. Existing cards retain their original data provenance, including legacy unverified records. Legal lineups and primary-source identity/affiliation notes do not establish that all underlying simulation stats are verified.

Acceptance evidence covers all 30 legal fives, all 435 pairings, canonical/social metadata, roster consistency, original 1200×630 PNGs, watch/control links and mobile geometry. Full user/account/game journeys and deployment identity require their separate pass evidence. This contract does not declare launch approval.
