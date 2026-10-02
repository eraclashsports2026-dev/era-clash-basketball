# Basketball presentation and asset exposure

This is an exposure inventory and implementation record, not legal clearance. Basketball only. Source catalogs, calibration, simulation and identifiers retain their accepted content. `inventory.json` lists source locations and every image asset path with hashes; regenerate it with `node scripts/loop-rights-inventory.mjs`.

## Display controls

`src/loop/rights.js` supplies text projection at rendering boundaries. League branding becomes “pro basketball” or “earlier pro league.” `NEUTRAL_TEAM_NAMING` defaults OFF. When ON, team labels become city/lineage plus era; franchise titles use the existing franchise display helper. Protected team values still control franchise filters, lineup validation and simulation. Descriptive club names are projected through a curated mapping; personal names such as Magic Johnson are preserved. Relocated historical teams receive city/lineage labels, not assertions about every season inside a decade statistical slice.

The actual consumers are era selection/reveal, coach selection/offers/details, live intelligence, roster grids/slots/manual picker, postgame narrative/key moments, coaching analysis and clash breakdown. New-mode pickers, Spin, franchise selection, Lab era notes and result headlines use the same presentation layer. The complete location inventory is in `teamLabelConsumers` and `imageryConsumers`, including line numbers.

Homepage metadata, manifest, result HTML/OG and franchise HTML/OG use neutral basketball marketing language. The footer states: “Not affiliated with, endorsed by, or sponsored by any professional basketball league or team.” Source URLs and historical research text retain their original names; source links have generic descriptive labels. Their destinations can contain league names because they are attribution, not marketing copy.

## Names, marks and imagery retained

The protected player and coach catalogs contain real people, team references, factual statistics and historical descriptions. `src/loop/franchises.js` contains curated team identities and owner-review lineup proposals; schedule data contains team identifiers. The flag reduces displayed team branding; it does not remove people, statistics or historical source attribution.

`src/images/approved.json` currently contains no approved real-player photographs. Both `PlayerImage` and Time Arena's portrait resolver require the approved registry for any real portrait. Existing illustrations come from `src/images/placeholders.json`: 24 declared non-identifying era/position archetypes with 48 local JPEG renditions. They render through `src/ui/time-arena/placeholders.js`, `PlayerImage`, `PlayerCard`, and `PortraitStage`. Coach cards use a masked figure and monogram. No third-party team or league logo is selected by those renderers.

The original EraClash wordmark is `public/brand/eraclash-logo-mk1.png`; icons are `public/favicon.svg`, `public/icon-192.png` and `public/icon-512.png`. Time Arena's original illustrations are under `src/ui/time-arena/assets/`. The homepage and dynamic sharing graphics contain typography, court geometry and score/roster text; no athlete likeness or third-party logo is embedded. Bundled Source Sans font files and their license are under `api/_lib/fonts/`.

Fresh manual spot checks covered the wordmark, 192px icon and 1980s wing archetype. The other assets are enumerated and hashed, with their declared provenance recorded; this inventory does not claim a new independent visual or license review of every image.

## Owner decisions

Review commercial use of real-player identities/statistics, curated franchise names and historical references before public release. Confirm provenance/license terms for all artwork and brand assets; an internal `approved_for_product` value alone is not legal evidence. Decide whether neutral naming remains OFF or becomes the launch default. Review historical city/lineage wording and every curated all-time five. Public hosting, outside-user testing and a rights review remain separate gates from local engineering checks.

## Verification

`npx vitest run tests/loop-rights.test.js` renders every era and coach, tests neutral naming over every protected catalog team label, verifies actual roster/narrative display boundaries, and checks public marketing metadata/disclaimer. `inventory.json` verifies that the player, coach and era source files exactly match the accepted PR69 commit. Full engine identity preservation is verified by the parent's protected baseline suites. The flag changes presentation only.
