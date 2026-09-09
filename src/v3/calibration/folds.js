// ── Internal validation folds ───────────────────────────────────────────────
// The holdout is sealed, so overfitting has to be detectable WITHOUT it.
//
// The corpus is split into deterministic, era-stratified folds. A parameter
// change is accepted only if it improves the tuning folds AND does not
// materially worsen the validation fold — a change that improves only the
// fixtures used to choose it has learned those fixtures, not the game.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const FOLD_VERSION = versionOf("calibrationObjectiveVersion");

/**
 * Deterministic assignment: a stable hash of the fixture id, so folds never
 * shift between runs and cannot be reshuffled until a change looks good.
 */
const foldOf = (fixtureId, k) => {
  const h = createHash("sha256").update(`fold:${fixtureId}`).digest();
  return h.readUInt32BE(0) % k;
};

/**
 * Era-stratified folds. Stratification matters more than usual here: with a
 * corpus this small, an unstratified split could put every 1980s fixture in one
 * fold and validate 1980s tuning against the 1960s alone.
 */
export const buildFolds = (fixtures, { k = 3 } = {}) => {
  const byEra = {};
  for (const f of fixtures) (byEra[f.eraStyleId] = byEra[f.eraStyleId] ?? []).push(f);

  const folds = Array.from({ length: k }, () => []);
  for (const era of Object.keys(byEra).sort()) {
    // Sorted, then round-robin from a deterministic offset, so each era is
    // spread across folds rather than concentrated in one.
    const inEra = byEra[era].slice().sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
    const offset = foldOf(era, k);
    inEra.forEach((f, i) => folds[(offset + i) % k].push(f.fixtureId));
  }
  return {
    foldVersion: FOLD_VERSION,
    k,
    folds: folds.map((ids, i) => ({ index: i, fixtureIds: ids.sort() })),
    hash: createHash("sha256").update(JSON.stringify(folds.map((f) => f.slice().sort()))).digest("hex").slice(0, 32),
  };
};

/** One tuning/validation split per fold. Rotated, not chosen. */
export const splits = (foldSet) =>
  foldSet.folds.map((f) => ({
    validationFold: f.index,
    validationIds: f.fixtureIds,
    tuningIds: foldSet.folds.filter((x) => x.index !== f.index).flatMap((x) => x.fixtureIds).sort(),
  }));

/** A fixture must never be in both halves of a split. */
export const splitOverlaps = (foldSet) =>
  splits(foldSet).flatMap((s) => s.validationIds.filter((id) => s.tuningIds.includes(id)));

/**
 * Whether the corpus can support cross-validation at all.
 *
 * With very few fixtures per fold, a fold's error is one or two teams and moves
 * on noise. Saying so is more useful than producing a validation number nobody
 * should believe.
 */
export const foldViability = (foldSet, { minPerFold = 3 } = {}) => {
  const sizes = foldSet.folds.map((f) => f.fixtureIds.length);
  const smallest = Math.min(...sizes);
  return {
    sizes,
    smallestFold: smallest,
    viable: smallest >= minPerFold,
    note: smallest >= minPerFold
      ? "Each fold holds enough fixtures for its error to mean something."
      : `The smallest fold holds ${smallest} fixture(s). A validation error over that few teams moves on noise, so cross-validation cannot detect overfitting here — that is a corpus limitation, not a tuning result.`,
  };
};
