# Franchise and Tonight content generation

These scripts generate reviewable Basketball artifacts locally. They do not deploy, send notifications, add XP, or insert ranked result records. Canonical origins must be supplied explicitly so a placeholder is never mistaken for the production host.

## All 435 franchise pairings

```sh
node scripts/loop/franchise-pages.mjs --origin https://your-preview.example --output artifacts/loop/franchise-pages
```

Replace the example host with the verified Preview host. This creates 435 HTML pages under `/clash/all-time/<a>-vs-<b>/index.html`, 435 original 1200×630 OG PNGs, `franchise-pages.json`, and `franchise-sitemap.xml`. Each page has an absolute canonical URL, OG/Twitter image metadata, 56 related internal matchup links, Watch and Take Control links, roster notes, and Privacy/Terms links. The static and runtime franchise pages call the same HTML layout and PNG model helpers. Unplayed previews have no fabricated score.

Pass `--neutral` or resolve `NEUTRAL_TEAM_NAMING=true` to use city and All-time names. The two Los Angeles entries remain Gold/Blue. The naming flag defaults OFF. For deployed dynamic routes the existing `api/share-page.js` franchise handler serves the same roster metadata and original PNG renderer; its canonical origin must be the verified deployment origin. Generated files are a static publication option and are not automatically deployed by running this command.

The sitemap should be included in the deployed sitemap index or copied to the public output at build time after the origin is verified. The handler/rewrite is the public runtime route. A locally valid sitemap alone is not proof that all 435 URLs are reachable on a deployment.

## October 20 dry run / nightly content

```sh
node scripts/loop/tonight.mjs --date 2026-10-20 --origin https://your-preview.example --output artifacts/loop/tonight
```

The opening-night dry run produces three cards, three actual deterministic engine result JSON files, one HTML review page and a manifest. The home franchise appears Gold and the away franchise Blue; that ordering creates no home-court modifier. The existing public-path feature flags select the engine: `PREVIEW_SIM_ENGINE_ENABLED=true` selects the locked preview path, otherwise the existing V3 production path applies (including the repository's Vercel Preview default when that environment is declared). Explicit `--engine` values must match that active flag policy or the command rejects them. Neutral coaches and 2020s era rules are used. Engine/candidate metadata comes directly from the existing compute functions; no model parameter or candidate lock is changed. Results are unranked content simulations and are not the scheduled real teams' scores.

Without `--date`, the current Eastern calendar date is used. The schedule is the official August release, not a live feed. Dates inside the Cup-dependent window can have unassigned games; metadata preserves that limitation rather than inventing fixtures.

No existing Basketball video renderer was found. Every card therefore includes four PNG frames with durations 4s + 4s + 4s + 3s = 15s in its manifest. This is a frame sequence and a timing plan, **not a rendered video clip**. Intermediate frames reveal lineups only; no invented partial-game score is displayed.

## Verification commands

```sh
node node_modules/vitest/vitest.mjs run tests/loop-franchises.test.js tests/loop-franchises-content.test.js
```

Tests cover all 30 legal existing-card fives; franchise lineage exceptions; all 435 unique unordered routes; neutral naming; the official 1,200/80/40/40 schedule counts; exact opening-night games; Eastern/UTC date boundaries; rejection of invalid dates/origins; all generated social/canonical metadata; ten sampled PNG signatures, dimensions and file limits; and reconciliation of nightly card scores with actual engine box scores.

Browser/crawler checks on the Preview deployment, all-mode journeys, and any SMTP delivery test belong to the broader three-run release verification. Local artifact generation alone does not establish deployment or public-launch readiness.
