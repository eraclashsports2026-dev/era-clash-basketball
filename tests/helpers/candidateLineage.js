import { existsSync, readFileSync } from "node:fs";
import { expect } from "vitest";

// Newest first. A lock RE-CERTIFICATION supersedes the lock it names: same
// candidate, same behaviour, a new core hash because a core file changed for
// identity reasons only. It must still carry a parent, so the chain back to
// Candidate 0 is unbroken.
const MANIFESTS = [
  "data/validation/6c4d0/candidate3-lock.json",
  "data/validation/6c4c1/candidate2-lock.json",
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

/**
 * Every succession hop on disk, newest first, as {parentCoreHash, coreHash}.
 * A re-certification hop is behaviour-neutral; a candidate hop is not, and must
 * cite root-cause evidence and name its changed files.
 */
export const successionChain = () => {
  const hops = [];
  for (const p of MANIFESTS) {
    if (!existsSync(p)) continue;
    const d = JSON.parse(readFileSync(p, "utf8")).data;
    if (d.lockRevision > 1 && d.supersedesCoreHash) {
      // a re-certification of the SAME candidate: behaviour must be identical
      if (d.behaviourIdentical !== true) continue;
      hops.push({ from: d.supersedesCoreHash, to: d.coreHash, kind: "RECERTIFICATION",
        behaviourIdentical: true, changedCoreFiles: d.changedCoreFiles ?? [],
        changeBasis: d.revisionReason ?? "", candidateId: d.candidateId });
      if (d.parentCoreHash && d.parentCoreHash !== d.supersedesCoreHash) {
        hops.push({ from: d.parentCoreHash, to: d.supersedesCoreHash, kind: "CANDIDATE",
          behaviourIdentical: false, changedCoreFiles: d.changedCoreFiles ?? [],
          changeBasis: d.revisionReason ?? "", candidateId: d.candidateId });
      }
      continue;
    }
    if (d.parentCoreHash && d.coreHash) {
      hops.push({ from: d.parentCoreHash, to: d.coreHash, kind: "CANDIDATE",
        behaviourIdentical: d.engineBehaviourChanged === false,
        changedCoreFiles: d.changedCoreFiles ?? [], changeBasis: d.changeBasis ?? "",
        candidateId: d.candidateId });
    }
  }
  return hops;
};

/**
 * Assert the live core hash is the recorded one, or reachable from it through a
 * CHAIN of attributable successions.
 *
 * Phase 6C4C1 made this a chain rather than a single hop: Candidate 0 to
 * Candidate 1 to Candidate 2. An artifact recorded under Candidate 0 must still
 * verify against a live Candidate 2 core, and it does — but only by walking
 * hops that each name a parent, a changed-file list and root-cause evidence.
 * Silent drift still fails, and so does a chain with a missing link.
 */
export const assertCoreHashLineage = (recordedHash, liveHash, label = "core hash") => {
  if (liveHash === recordedHash) return "IDENTICAL";
  const hops = successionChain();
  expect(hops.length, `${label}: live core differs from the recorded hash and NO succession manifest exists — this is silent drift`).toBeGreaterThan(0);
  // walk forward from the recorded hash
  const path = [];
  let cur = recordedHash;
  const seen = new Set([cur]);
  for (let guard = 0; guard < MANIFESTS.length + 2; guard += 1) {
    const hop = hops.find((h) => h.from === cur && !seen.has(h.to));
    if (!hop) break;
    path.push(hop); cur = hop.to; seen.add(cur);
    if (cur === liveHash) break;
  }
  expect(cur, `${label}: no attributable succession path reaches the live core from the recorded hash. Path found: ${path.map((h) => `${h.from.slice(0, 8)}->${h.to.slice(0, 8)}`).join(", ") || "(none)"}`).toBe(liveHash);
  for (const hop of path) {
    if (hop.kind === "RECERTIFICATION") {
      expect(hop.behaviourIdentical, `${label}: a re-certification hop must be behaviour-neutral`).toBe(true);
      continue;
    }
    expect(hop.changedCoreFiles.length, `${label}: an attributable succession names its changed files`).toBeGreaterThan(0);
    expect(hop.changeBasis, `${label}: an attributable succession cites its root-cause evidence`).toMatch(/root-cause|root-caused|IDENTITY/i);
  }
  return path.length === 1 ? "ATTRIBUTABLE_SUCCESSOR" : `ATTRIBUTABLE_SUCCESSION_CHAIN_${path.length}`;
};
