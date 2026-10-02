# Tonight’s Clash contract

Version: `tonight-content-1.0.0` · roster dependency `loop-franchises-1.0.0` · Basketball only · 2026-10-02.

Tonight’s Clash loads actual published 2026–27 schedule pairings and simulates the curated all-time franchise proposals. It does not predict the real game, use real current-season lineups, or present a synthetic result as an official score. Gold is the listed home franchise and Blue the listed away franchise; current content uses the existing engine’s neutral-court model without estimating a real venue effect.

The schedule source is the NBA’s August 13, 2026 by-date PDF. `data/schedule/2026-27.json` contains its 1,200 dated games: 80 appearances per club, 40 home and 40 away. The additional 30 Cup-dependent regular-season fixtures (two per club) remain explicitly unscheduled until officially resolved. Neutral venues and source annotations are retained. Date selection uses the America/New_York calendar and published Eastern tipoff times. Source URLs, PDF hash and validation counts are in [schedule provenance](../data/schedule-2026-27-provenance.md).

Watch loads the sourced pairing and uses League-Average Staff on both teams and 2020s rules. Take Control uses the same franchise UI and existing legal roster/coach/era controls described by the [Franchise Clash contract](../franchise-clash/contract.md). No lineup contains a fabricated missing card. A reported LeBron James move does not change the all-time roster proposal.

`scripts/loop/tonight.mjs` generates reproducible, unranked content using the active existing server engine flag: `computeResultPreview` when `PREVIEW_SIM_ENGINE_ENABLED` resolves true, otherwise `computeResultV3`. An explicit engine argument conflicting with the flag is rejected. Candidate identity, engine/model metadata, roster IDs and score are recorded in the actual result JSON and agree with the public card. The generator does not publish content, deploy, contact a social platform or award competitive rating.

Example: `PUBLIC_SITE_ORIGIN=<verified-origin> PREVIEW_SIM_ENGINE_ENABLED=true node scripts/loop/tonight.mjs --date 2026-10-20`. Local verification uses an explicit `--origin http://localhost:4320`; this is not a production origin. A date without listed games returns an honest empty result. Schedule corrections require a freshly verified/versioned snapshot.

Generated assets are an original PNG card, actual simulated result JSON, and a four-frame 15-second composition plan (4+4+4+3 seconds). No completed video encoder/export exists in this slice; the plan and frame PNGs are not an MP4. Public and social posting, final rights clearance, owner roster approval and real schedule updates require separate evidence.
