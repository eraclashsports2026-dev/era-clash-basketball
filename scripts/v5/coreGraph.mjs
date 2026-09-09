#!/usr/bin/env node
// ── Parser-backed candidate-core module graph (v3) ──────────────────────────
//   npm run v5:core-graph
//
// v1 used a single-line regex and MISSED MULTI-LINE IMPORTS; v2 widened the
// regex and still could not see a re-export or tell a static dynamic import
// from an unresolvable one. A regex is not a parser, and a core manifest built
// by guessing which files run is a reproducibility claim with nothing behind
// it — src/v3/actions/offensivePlan.js executed in every game while sitting
// outside every manifest until Phase 6C4A caught it.
//
// v3 uses es-module-lexer (the parser Vite itself uses for import analysis),
// so the graph sees:
//   · single-line and multi-line imports
//   · `export … from` and `export * from` re-exports
//   · static dynamic imports  (import("./x.js"))
//   · UNRESOLVABLE dynamic imports (import(expr)), recorded explicitly
//   · directory/index resolution and extensionless specifiers
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, normalize } from "node:path";
import { init, parse } from "es-module-lexer";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

export const CORE_ENTRY_POINTS = Object.freeze([
  "src/v3/possession/index.js",
  "src/v3/possession/testContext.js",
  "src/v3/calibration/runtimeParameters.js",
  "src/v3/calibration/calibrationPlayerAdapter.js",
  "src/v3/calibration/monteCarloProbability.js",
  "src/v3/calibration/seedDomains.js",
  "src/v3/fingerprint.js",
]);

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const isRelative = (s) => s.startsWith("./") || s.startsWith("../");

/** Resolve a relative specifier the way Node ESM and Vite both would. */
export const resolveSpecifier = (fromFile, spec) => {
  const base = normalize(join(dirname(fromFile), spec));
  const tries = [base, `${base}.js`, `${base}.mjs`, `${base}.json`, join(base, "index.js"), join(base, "index.mjs")];
  for (const t of tries) {
    if (existsSync(t) && statSync(t).isFile()) return t;
  }
  return null;
};

/** Every import/re-export in one file, classified. */
export const importsOf = (file) => {
  const src = readFileSync(file, "utf8");
  const [found] = parse(src, file);
  const out = [];
  for (const im of found) {
    const spec = im.n;
    const dynamic = im.d > -1;
    if (spec == null) { out.push({ specifier: null, dynamic: true, kind: "UNRESOLVABLE_DYNAMIC", resolved: null, external: false }); continue; }
    if (!isRelative(spec)) { out.push({ specifier: spec, dynamic, kind: "BARE", resolved: null, external: true }); continue; }
    const resolved = resolveSpecifier(file, spec);
    out.push({ specifier: spec, dynamic, kind: dynamic ? "STATIC_DYNAMIC" : "STATIC", resolved, external: false });
  }
  return out;
};

/** Transitive closure over relative imports, parser-backed. */
export const buildGraph = async (entries = CORE_ENTRY_POINTS) => {
  await init;
  const seen = new Map();          // file -> edges
  const unresolvedDynamic = [];    // import(expr) sites
  const unresolvableRelative = []; // relative specifiers that resolve to nothing
  const externals = new Set();
  const missingEntries = entries.filter((e) => !existsSync(e));
  const stack = [...entries.filter((e) => existsSync(e))];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    const edges = importsOf(file);
    seen.set(file, edges);
    for (const e of edges) {
      if (e.kind === "UNRESOLVABLE_DYNAMIC") { unresolvedDynamic.push({ file }); continue; }
      if (e.external) { externals.add(e.specifier); continue; }
      if (!e.resolved) { unresolvableRelative.push({ file, specifier: e.specifier }); continue; }
      if (!seen.has(e.resolved)) stack.push(e.resolved);
    }
  }
  const files = [...seen.keys()].sort();
  return { files, edges: seen, unresolvedDynamic, unresolvableRelative, externals: [...externals].sort(), missingEntries };
};

/** The manifest: per-file hashes plus the aggregate core hash. */
export const buildCoreManifestV3 = async (entries = CORE_ENTRY_POINTS) => {
  const g = await buildGraph(entries);
  const files = g.files.map((p) => ({ path: p, sha256: sha(p), bytes: statSync(p).size }));
  const aggregateCoreHash = createHash("sha256")
    .update(JSON.stringify(files.map((f) => [f.path, f.sha256]))).digest("hex");
  return {
    candidateCoreGraphVersion: VALIDATION_VERSIONS.candidateCoreGraphVersion,
    discovery: "parser-backed transitive closure (es-module-lexer): multi-line imports, re-exports, static dynamic imports, index resolution",
    entryPoints: entries, missingEntryPoints: g.missingEntries,
    files, fileCount: files.length, aggregateCoreHash,
    unresolvedDynamicImports: g.unresolvedDynamic,
    unresolvableRelativeSpecifiers: g.unresolvableRelative,
    externalPackages: g.externals,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await buildCoreManifestV3();
  console.log(`parser-backed core graph v${m.candidateCoreGraphVersion}: ${m.fileCount} files`);
  console.log(`  aggregate core hash ${m.aggregateCoreHash}`);
  console.log(`  unresolved dynamic imports ${m.unresolvedDynamicImports.length} · unresolvable relative ${m.unresolvableRelativeSpecifiers.length}`);
  console.log(`  external packages: ${m.externalPackages.join(", ") || "none"}`);
  const { buildCoreManifest } = await import("../validation/preflight.mjs");
  const v2 = buildCoreManifest();
  const v2set = new Set(v2.files.map((f) => f.path));
  const v3set = new Set(m.files.map((f) => f.path));
  const onlyV3 = [...v3set].filter((f) => !v2set.has(f));
  const onlyV2 = [...v2set].filter((f) => !v3set.has(f));
  console.log(`  vs regex builder v2 (${v2.fileCount} files): parser-only ${JSON.stringify(onlyV3)} · regex-only ${JSON.stringify(onlyV2)}`);
}
