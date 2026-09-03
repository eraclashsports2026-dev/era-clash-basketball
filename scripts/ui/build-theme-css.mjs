#!/usr/bin/env node
// ── Write src/theme/basketball-themes.css from the token modules ─────────────
// The stylesheet is generated, committed, and pinned by a test that regenerates
// it in memory and compares: a hand edit to the CSS or a token change without a
// rebuild both fail the suite.
//   node scripts/ui/build-theme-css.mjs          # write
//   node scripts/ui/build-theme-css.mjs --check  # exit 1 if out of date
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { themeCss } from "../../src/theme/themeResolver.js";

const OUT = "src/theme/basketball-themes.css";
const css = themeCss();
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== css) { console.error(`${OUT} is out of date — run node scripts/ui/build-theme-css.mjs`); process.exit(1); }
  console.log(`${OUT} is current (${css.length} bytes)`);
} else {
  writeFileSync(OUT, css);
  console.log(`wrote ${OUT} (${css.length} bytes)`);
}
