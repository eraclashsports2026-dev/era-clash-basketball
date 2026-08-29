// ── Same-seed branching challenges ───────────────────────────────────────────
// "Challenge this chaos" reproduces the STARTING chaos and the branching rules,
// not the outcome. Two players who make the same decisions walk an identical
// path; two who decide differently branch — deterministically, so each branch is
// itself reproducible.
//
// The challenge id is opaque. The raw seed, the future branches, the preview
// access key, tester identity, the session token and feedback identity are all
// absent from the link by construction: the id is a one-way hash and the seed
// is recovered from the stored manifest, never from the URL.
import { hashString } from "../v3/seed.js";
import { DRAFT_VERSIONS } from "./runState.js";

export const CHALLENGE_MANIFEST_VERSION = "1.0.0";

export const challengeId = (seedId) =>
  String(hashString(`chal|${seedId}|${CHALLENGE_MANIFEST_VERSION}`) >>> 0).toString(36).padStart(7, "0");

/** The manifest stored server-side. The seed lives HERE, never in the link. */
export const buildManifest = ({ seedId, createdAt, originRunId }) => ({
  challengeManifestVersion: CHALLENGE_MANIFEST_VERSION,
  challengeId: challengeId(seedId),
  seedId,
  originRunId,
  versions: DRAFT_VERSIONS,
  createdAt,
});

/** What a link may carry. Anything not on this list is a leak. */
export const PUBLIC_CHALLENGE_FIELDS = Object.freeze(["challengeId"]);

export const publicChallenge = (manifest) => ({ challengeId: manifest.challengeId });

/**
 * Fields that must NEVER appear in a challenge link or its public payload.
 * Asserted by a security test against the real URL the client builds.
 */
export const FORBIDDEN_CHALLENGE_FIELDS = Object.freeze([
  "seedId", "seed", "serverSeed", "pv", "previewKey", "testerId", "session",
  "pv_session", "feedbackId", "futureDraws", "branches",
]);

export const challengeUrl = (origin, manifest) =>
  `${String(origin).replace(/\/$/, "")}/?chaos=${encodeURIComponent(manifest.challengeId)}`;
