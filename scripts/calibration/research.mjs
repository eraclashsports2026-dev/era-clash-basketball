#!/usr/bin/env node
// ── Calibration research surface ────────────────────────────────────────────
// One entry point for inspecting what the calibration data plane contains and
// where every value came from.
//
//   npm run research:calibration -- sources     source registry summary
//   npm run research:calibration -- provenance  per-fixture provenance
//   npm run research:calibration -- coverage    corpus, target and set coverage
//   npm run research:calibration -- policy      the source policy and exclusions
//   npm run research:calibration -- registry    rebuild the source registry
import { readFileSync, existsSync } from "node:fs";
import { buildRegistry, SOURCE_CLASSES, PROHIBITED_SOURCES, REGISTRY_PATH } from "./build-source-registry.mjs";

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "coverage";

  if (cmd === "sources") {
    const reg = read(REGISTRY_PATH) ?? buildRegistry();
    console.log(`SOURCES — ${reg.coverage.entries} entries\n`);
    for (const [k, v] of Object.entries(reg.coverage.byType)) console.log(`  ${String(v).padStart(4)}  ${k}`);
    console.log(`\n  ${reg.attributionStatement}`);
  } else if (cmd === "provenance") {
    const reg = read(REGISTRY_PATH) ?? buildRegistry();
    const corpus = read("data/calibration/historical-corpus-v3.json");
    const by = new Map(reg.entries.map((e) => [e.subject, e]));
    for (const f of corpus.fixtures) {
      console.log(`\n${f.fixtureId}  (${f.teamName} ${f.season}, ${f.fixtureType})`);
      for (const p of f.players) {
        const e = by.get(p.calibrationPlayerId);
        console.log(`  ${p.name.padEnd(22)} ${(e?.extractionRoute ?? "?").padEnd(24)} rev ${String(e?.revisionId ?? "-").padEnd(12)} ${e?.contentHash?.slice(0, 8) ?? ""}`);
      }
    }
  } else if (cmd === "coverage") {
    const corpus = read("data/calibration/historical-corpus-v3.json");
    const players = read("data/calibration/calibration-players-v3.json");
    const targets = read("data/calibration/historical-targets-v3.json");
    console.log(`CALIBRATION COVERAGE\n`);
    console.log(`  players  ${players?.profileCount ?? 0} profiles, ${players?.unresolvedCount ?? 0} unresolved`);
    console.log(`  corpus   ${corpus?.fixtures.length ?? 0} fixtures across ${Object.keys(corpus?.coverage.byEra ?? {}).length} eras`);
    console.log(`           ${JSON.stringify(corpus?.coverage.byEra ?? {})}`);
    console.log(`           ${JSON.stringify(corpus?.coverage.byFixtureType ?? {})}`);
    if (targets) console.log(`  targets  tiers ${JSON.stringify(targets.coverage ?? {}).slice(0, 200)}`);
  } else if (cmd === "policy") {
    console.log(`SOURCE POLICY\n`);
    console.log(`  Do not use any source whose terms prohibit its data from being used to train,`);
    console.log(`  fine-tune, prompt, instruct, calibrate, evaluate or otherwise develop AI or`);
    console.log(`  model technologies.\n`);
    console.log(`  permitted classes:`);
    for (const [k, v] of Object.entries(SOURCE_CLASSES)) if (v.permitted) console.log(`    ${k.padEnd(46)} ${v.note}`);
    console.log(`\n  prohibited and unused:`);
    for (const p of PROHIBITED_SOURCES) {
      console.log(`    ${p.publisher} (${p.id})`);
      console.log(`      ${p.reason}`);
      console.log(`      excluded routes: ${p.excludedRoutes.join(", ")}`);
      console.log(`      ${p.note}`);
    }
  } else if (cmd === "registry") {
    await import("./build-source-registry.mjs");
    console.log("run `node scripts/calibration/build-source-registry.mjs` to rebuild");
  } else {
    console.error(`unknown command "${cmd}"`);
    process.exit(1);
  }
}
