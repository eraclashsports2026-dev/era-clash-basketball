import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { previewCandidateIdentity } from "../api/_lib/previewEngine.js";
import { activeLockManifest, activeLockVersion } from "./helpers/candidateLineage.js";
import { versionOf } from "../src/versions.js";

// The audit of 2026-09-01 found /api/health reporting `candidateId: "Candidate 3"`
// and `calibrationVersion: "1.3.0"` beside Candidate 4's core hash: the id was a
// literal and the version came from `VERSIONS.registry?...?.version ?? "1.3.0"`,
// a path that does not exist on the VERSIONS object, so the fallback answered
// every request. api/_lib/pregameRead.js used the same non-existent path and so
// reported `null` source versions. These tests fail on a literal or that path,
// and are written against the lock manifest so a Candidate 5 needs no edit here.

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LIVE = ["api/health.js", "api/_lib/pregameRead.js", "api/_lib/previewEngine.js"];

describe("reported candidate identity tracks the active lock", () => {
  it("previewCandidateIdentity matches the head lock manifest", () => {
    const m = activeLockManifest();
    const id = previewCandidateIdentity();
    expect(id.coreHash).toBe(m.coreHash);
    expect(id.possessionCalibrationVersion).toBe(activeLockVersion());
    expect(id.candidateId).toBe(m.candidateId);
  });

  it("versionOf resolves the registry versions health and pregame report", () => {
    for (const key of ["possessionCalibrationVersion", "teamIntelligenceVersion"]) {
      expect(versionOf(key), key).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("no live route reads the non-existent VERSIONS.registry path", () => {
    for (const f of LIVE) {
      const code = read(f).replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/VERSIONS\s*\.\s*registry/);
    }
  });

  it("health reports the candidate id and version from the identity, not a literal", () => {
    const code = read("api/health.js").replace(/^\s*\/\/.*$/gm, "");
    const block = code.slice(code.indexOf("preview: {"));
    expect(block).toMatch(/candidateId:\s*identity\.candidateId/);
    expect(block).toMatch(/calibrationVersion:\s*identity\.possessionCalibrationVersion/);
    expect(block).not.toMatch(/candidateId:\s*"/);
    expect(block).not.toMatch(/calibrationVersion:\s*"/);
  });

  it("no user-facing string pins a candidate generation number", () => {
    for (const f of ["src/navigation.js"]) {
      const strings = read(f).replace(/^\s*\/\/.*$/gm, "").match(/"[^"]{20,}"/g) ?? [];
      for (const s of strings) expect(s, `${f}: ${s}`).not.toMatch(/Candidate \d/);
    }
  });
});
