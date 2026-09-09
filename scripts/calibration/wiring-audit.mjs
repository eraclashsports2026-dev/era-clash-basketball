#!/usr/bin/env node
// ── Parameter wiring audit ──────────────────────────────────────────────────
// Asks the question that must be answered before any sensitivity analysis:
// does changing a registered parameter change anything the engine does?
//
// The registry's own header states its purpose — "Every coefficient that Phase
// 6C2B or later may tune lives HERE, once" — precisely to prevent "a tuned magic
// number sitting inside an action file where the parameter history cannot see
// it". This audit checks whether that intent was actually realised in code.
//
//   npm run calibration:wiring-audit
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { PARAMETERS } from "../../src/v3/calibration/parameters.js";
import { versionOf } from "../../src/versions.js";

export const WIRING_PATH = "data/calibration/parameter-wiring-audit.json";

const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".js") ? [`${dir}/${e.name}`] : []) : []);

/** Every engine source file, excluding the calibration plane itself. */
const engineFiles = () => walk("src").filter((f) => !f.includes("/calibration/"));

export const auditWiring = () => {
  const files = engineFiles();
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

  // Does anything outside the calibration plane reach the registry at all?
  //
  // Two routes count. A direct import of parameters.js, and an import of
  // runtimeParameters.js, which is the registry's runtime face — it compiles the
  // registry into the immutable set the engine reads. Counting only the direct
  // import would have reported "unwired" after Phase 6C2C3 wired everything
  // through the compiler, which is the wrong answer for the right regex.
  const directImporters = files.filter((f) => /from\s+["'][^"']*calibration\/parameters(\.js)?["']/.test(sources.get(f)));
  const bindingImporters = files.filter((f) => /from\s+["'][^"']*calibration\/runtimeParameters(\.js)?["']/.test(sources.get(f)));
  const importers = [...new Set([...directImporters, ...bindingImporters])];
  const valueOfCallers = files.filter((f) => /\bvalueOf\s*\(/.test(sources.get(f)));
  // A consumer reads its coefficient off the compiled accessor tree.
  const accessorReaders = files.filter((f) => /\bparams(eterSet)?\??\.get\b|\.parameterSet\b/.test(sources.get(f)));

  const rows = PARAMETERS.map((p) => {
    // Where does this parameter's default value physically live?
    const lit = String(p.defaultValue);
    const literalSites = [];
    for (const [f, src] of sources) {
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Match the number as a whole token, so 1.35 does not match 11.352.
        const re = new RegExp(`(^|[^\\w.])${lit.replace(".", "\\.")}(?![\\d])`);
        if (re.test(lines[i]) && !/^\s*(\/\/|\*)/.test(lines[i])) {
          literalSites.push({ file: f, line: i + 1, text: lines[i].trim().slice(0, 100) });
        }
      }
    }
    // Is the parameter's id referenced anywhere in the engine?
    const idReferenced = files.some((f) => sources.get(f).includes(p.id));

    return {
      id: p.id, module: p.module, defaultValue: p.defaultValue,
      idReferencedInEngine: idReferenced,
      literalOccurrences: literalSites.length,
      // A literal in the module the parameter claims is a strong signal that the
      // value was duplicated rather than wired.
      literalInClaimedModule: literalSites.filter((s) => s.file.toLowerCase().includes(p.module.toLowerCase().replace(/([A-Z])/g, "$1")) ||
        s.file.toLowerCase().includes(p.module.toLowerCase())).slice(0, 3),
      sampleSites: literalSites.slice(0, 3),
      // Wired means: the engine reads this parameter through the registry.
      wired: idReferenced,
    };
  });

  const wired = rows.filter((r) => r.wired);
  return {
    parameterIdentifiabilityVersion: versionOf("parameterIdentifiabilityVersion"),
    calibrationParameterRegistryVersion: versionOf("calibrationParameterRegistryVersion"),
    purpose: "Whether changing a registered parameter changes anything the engine does. Asked before any sensitivity analysis, because a sensitivity measurement on an unwired parameter would measure nothing and report zero effect.",
    engineFilesScanned: files.length,
    registryImportersOutsideCalibrationPlane: importers,
    directRegistryImporters: directImporters,
    runtimeBindingImporters: bindingImporters,
    accessorReaders,
    valueOfCallersOutsideCalibrationPlane: valueOfCallers,
    coverage: {
      parameters: rows.length,
      wired: wired.length,
      unwired: rows.length - wired.length,
      // If nothing imports the registry, no parameter can be wired regardless
      // of what any individual row says.
      registryReachableFromEngine: importers.length > 0,
    },
    parameters: rows,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = auditWiring();
  a.auditHash = createHash("sha256").update(JSON.stringify(a.parameters)).digest("hex");
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(WIRING_PATH, JSON.stringify(a, null, 2) + "\n");

  console.log(`PARAMETER WIRING AUDIT — ${a.coverage.parameters} registered parameters\n`);
  console.log(`  engine files scanned                       ${a.engineFilesScanned}`);
  console.log(`  files importing the registry               ${a.registryImportersOutsideCalibrationPlane.length}`);
  console.log(`    direct registry imports                  ${a.directRegistryImporters.length}`);
  console.log(`    runtime-binding imports                  ${a.runtimeBindingImporters.length}`);
  console.log(`  files reading the compiled accessor tree   ${a.accessorReaders.length}`);
  console.log(`  files calling valueOf()                    ${a.valueOfCallersOutsideCalibrationPlane.length}`);
  console.log(`  registry reachable from the engine at all   ${a.coverage.registryReachableFromEngine}`);
  console.log(`\n  WIRED    ${a.coverage.wired}`);
  console.log(`  UNWIRED  ${a.coverage.unwired}`);

  if (!a.coverage.registryReachableFromEngine) {
    console.log(`\n  Nothing outside the calibration plane imports the registry, so no`);
    console.log(`  registered parameter can currently influence a simulated game. The`);
    console.log(`  registry is a SPECIFICATION of intended knobs, not a set of live`);
    console.log(`  controls. Changing currentValue would change no result.`);
  }

  const dup = a.parameters.filter((r) => !r.wired && r.literalOccurrences > 0);
  console.log(`\n  unwired parameters whose default appears as a literal in engine source: ${dup.length}`);
  for (const r of dup.slice(0, 12)) {
    const s = r.sampleSites[0];
    console.log(`    ${r.id.padEnd(40)} ${String(r.defaultValue).padStart(7)}  ${s ? `${s.file}:${s.line}` : ""}`);
  }
  console.log(`\n  hash ${a.auditHash.slice(0, 16)}`);
  console.log(`\nwrote ${WIRING_PATH}`);
}
