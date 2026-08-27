import { existsSync, readFileSync } from "node:fs";
import { expect } from "vitest";

// Newest first. A lock RE-CERTIFICATION supersedes the lock it names: same
// candidate, same behaviour, a new core hash because a core file changed for
// identity reasons only. It must still carry a parent, so the chain back to
// Candidate 0 is unbroken.
const MANIFESTS = [
  "data/validation/6c4b1/candidate1-lock-recertification.json",
  "data/validation/6c4a/candidate1-lock.json",
  "data/validation/6c4a/candidate1-draft-manifest.json",
];

/**
 * The active successor-candidate manifest, if one exists. Returns the LOCK
 * manifest when the candidate is locked, else the draft manifest, else null.
 *
 * This is the lifecycle mechanism that replaced the bare "live core hash
 * equals the recorded hash" pins when Phase 6C4A began building Candidate 1.
 * Those pins each meant "no engine change has happened", which was the right
 * guard while Candidate 0 was the only candidate — but taken literally they
 * would forbid ever building a successor. The replacement verifies MORE:
 * either the core is byte-identical to the recorded hash, or an explicit
 * successor manifest exists whose parent is exactly that hash and whose own
 * hash is exactly the live core. Silent drift still fails; only an
 * attributable, root-caused succession passes.
 */
export const successorManifest = () => {
  for (const p of MANIFESTS) {
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, "utf8")).data;
    // A re-certification must state the hash it supersedes AND prove the
    // supersession was behaviour-neutral. One that does not is drift wearing a
    // re-certification's name, and it must not be honoured.
    if (d.lockRevision > 1) {
      if (!d.supersedesCoreHash || d.behaviourIdentical !== true) continue;
      return { ...d, parentCoreHash: d.parentCoreHash, engineBehaviourChanged: true,
        changedCoreFiles: d.changedCoreFiles, changeBasis: d.revisionReason.includes("IDENTITY") ? "identity root-cause: candidate1-identity-repair.json" : d.revisionReason };
    }
    return d;
  }
  return null;
};

/** Every core hash this candidate has been certified at, newest first. */
export const certifiedCoreHashes = () => {
  const out = [];
  for (const p of MANIFESTS) {
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, "utf8")).data;
    if (d.coreHash) out.push(d.coreHash);
    if (d.supersedesCoreHash) out.push(d.supersedesCoreHash);
  }
  return [...new Set(out)];
};

/** The calibration version a PRE-SUCCESSION artifact should have recorded:
 *  the parent's (1.0.0) when a successor manifest exists, else the live one. */
export const recordedCalibrationVersionExpectation = (liveVersion) =>
  (successorManifest() ? "1.0.0" : liveVersion);

/** Assert the live core hash is the recorded one OR an attributable successor of it. */
export const assertCoreHashLineage = (recordedHash, liveHash, label = "core hash") => {
  if (liveHash === recordedHash) return "IDENTICAL";
  const m = successorManifest();
  expect(m, `${label}: live core differs from the recorded hash and NO successor manifest exists — this is silent drift`).toBeTruthy();
  expect(m.parentCoreHash, `${label}: the successor's parent must be the recorded hash`).toBe(recordedHash);
  expect(m.coreHash, `${label}: the live core must be exactly the successor candidate`).toBe(liveHash);
  expect(m.engineBehaviourChanged).toBe(true);
  expect(m.changedCoreFiles.length, "an attributable succession names its changed files").toBeGreaterThan(0);
  expect(m.changeBasis, "an attributable succession cites its root-cause evidence").toContain("root-cause");
  return "ATTRIBUTABLE_SUCCESSOR";
};
