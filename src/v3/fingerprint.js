// ── Canonical matchup & result fingerprints ───────────────────────────────────
// A result fingerprint answers exactly one question:
//
//   Which data, algorithms, matchup inputs and seed produced THIS game?
//
// It is the difference between a reproducible product and a pile of numbers.
// benchmarks/v3/replay.mjs already depends on being able to reconstruct a game;
// this module makes that identity canonical instead of ad hoc.
//
// ── TWO SEPARATE IDENTITIES, AND WHY ─────────────────────────────────────────
//   matchupFingerprint — the CONTEXT: who plays, where they line up, which
//                        coaches, which era, which mode. Seed-free.
//   resultFingerprint  — the GAME: matchup + seed + every version that
//                        materially shaped it.
//
// Keeping them separate is what makes rematches work. Same matchup + same seed
// must reproduce a game exactly; same matchup + NEW seed must produce a new,
// plausible game. If the final-result cache were keyed on the matchup alone,
// every rematch would return the identical game and the product's core promise
// — a different night, same teams — would silently break.
//
// ── GOLD AND BLUE ARE NOT INTERCHANGEABLE ────────────────────────────────────
// Both rosters are NOT sorted into one pool. Gold-vs-Blue and Blue-vs-Gold are
// different matchup contexts: sides carry their own coach, their own position
// assignments, and their own place in the record. Sorting them together would
// collapse two distinct games onto one identity.
//
// WITHIN one team, order is normalised by explicit POSITION, never by array
// order — the same five players in the same five slots is the same team no
// matter how the array was built.
//
// ── ONLY ACTIVE VERSIONS MAY APPEAR ──────────────────────────────────────────
// A version enters the fingerprint only when its module actually influenced the
// result. Stamping a DEVELOPMENT layer that no simulation module imports, or a
// PLANNED module that does not exist, would make the fingerprint claim a
// provenance it does not have. Team Intelligence is deliberately absent today
// and enters automatically the moment its status becomes ACTIVE.
import { REGISTRY, versionOf, isActive, affectsResult } from "../versions.js";
import { resolveCardId } from "./data/cardAliases.js";

const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C"];

// FNV-1a, run twice with different offset bases to give a 64-bit identity.
// Deliberately not node:crypto — this module is imported from code that also
// runs in the browser bundle, and a cache identity needs determinism and
// portability rather than cryptographic strength.
const fnv = (s, offset) => {
  let h = offset >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
};
export const hash64 = (s) => fnv(s, 2166136261) + fnv(s, 1099511628) ;

/**
 * One side, normalised: five `slot=cardId` pairs in fixed slot order.
 *
 * Card ids are CANONICALISED first, so a retired alias and its canonical id
 * produce the same fingerprint. That is what makes an old stored lineup
 * re-derive to a stable identity after a card rename — the replay path reads
 * stored goldIds and re-derives, it never compares a stored hash string.
 */
const canonicalSide = (ids, positions) => {
  if (!Array.isArray(ids) || ids.length !== 5) throw new Error("canonicalSide: expected 5 player ids");
  const slots = positions ?? [];
  const pairs = ids.map((id, i) => ({ id: resolveCardId(String(id)), slot: slots[i] ?? SLOT_ORDER[i] }));
  return pairs
    .slice()
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.id.localeCompare(b.id))
    .map((p) => `${p.slot}=${p.id}`)
    .join(",");
};

/**
 * Canonical, human-readable matchup string. Seed-free by construction.
 * Coach and era are included ONLY when their data domains are active, so the
 * fingerprint never claims an input the engine did not actually use.
 */
export const canonicalMatchup = ({
  goldIds, blueIds, goldPositions = null, bluePositions = null,
  coachIds = null, eraId = null, mode = "single", seriesContext = null,
} = {}) => {
  const parts = [
    `mode=${String(mode)}`,
    `gold[${canonicalSide(goldIds, goldPositions)}]`,
    `blue[${canonicalSide(blueIds, bluePositions)}]`,
  ];
  if (coachIds && isActive("coachDataVersion")) {
    parts.push(`coach(gold=${coachIds.gold ?? "none"},blue=${coachIds.blue ?? "none"})`);
  }
  if (eraId != null && isActive("eraDataVersion")) parts.push(`era=${eraId}`);
  if (seriesContext) parts.push(`series=${seriesContext.seriesId ?? ""}#${seriesContext.gameNumber ?? ""}`);
  return parts.join("|");
};

/** Stable hash of the canonical matchup. Same inputs → same value, always. */
export const matchupFingerprint = (input) => hash64(canonicalMatchup(input));

/**
 * The immutable identity of one played game.
 *
 * Returns the explicit field set AND a hash. The fields are kept in the record
 * on purpose: a hash alone tells you two results differ but never why, and the
 * whole point of a fingerprint is to be able to answer that.
 */
export const resultFingerprint = ({ matchup, seed, extraVersions = {} } = {}) => {
  if (seed == null || !Number.isFinite(Number(seed))) throw new Error("resultFingerprint: a finite seed is required");
  const mfp = typeof matchup === "string" ? matchup : matchupFingerprint(matchup);

  // Required floor — these always materially shape a result today.
  const versions = {
    engineVersion: versionOf("engineVersion"),
    playerDataVersion: versionOf("playerDataVersion"),
    coachDataVersion: versionOf("coachDataVersion"),
    eraDataVersion: versionOf("eraDataVersion"),
    ratingVersion: versionOf("ratingVersion"),
    calibrationVersion: versionOf("calibrationVersion"),
  };
  // Layers that enter automatically once they become ACTIVE. No code change is
  // needed when Coach Intelligence or the possession engine ship — flipping
  // status in the registry is what admits them, which is the point.
  for (const name of ["possessionEngineVersion", "playerIntelligenceVersion", "teamIntelligenceVersion",
                      "coachIntelligenceVersion", "eraStyleVersion"]) {
    if (affectsResult(name)) versions[name] = versionOf(name);
  }
  Object.assign(versions, extraVersions);

  const canonical = `mfp=${mfp}|seed=${Number(seed)}|` +
    Object.keys(versions).sort().map((k) => `${k}=${versions[k]}`).join("|");

  return { matchupFingerprint: mfp, seed: Number(seed), versions, canonical, hash: hash64(canonical) };
};

/** Which registry domains are currently admitted into a result fingerprint. */
export const fingerprintVersionDomains = () =>
  Object.keys(REGISTRY).filter((k) =>
    ["engineVersion", "playerDataVersion", "coachDataVersion", "eraDataVersion", "ratingVersion", "calibrationVersion"].includes(k) ||
    (affectsResult(k) && ["possessionEngineVersion", "playerIntelligenceVersion", "teamIntelligenceVersion",
                          "coachIntelligenceVersion", "eraStyleVersion"].includes(k)));
