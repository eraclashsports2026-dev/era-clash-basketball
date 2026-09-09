// ── Portrait registry ────────────────────────────────────────────────────────
// One resolver for every portrait the Time Arena draws. It does NOT hold its own
// image data: the approved, provenance-tracked list in src/images/approved.json
// stays the single source of truth, and this layer adds only the presentation
// facts a card needs — where to crop, how much to scale, and which state the
// card is rendering.
//
// The point of the indirection is that an approved portrait becomes an ASSET
// SWAP: the card's portrait zone is a fixed 212px whether it holds a photograph
// or the masked silhouette fallback, so adding art later moves nothing.
import approvedData from "../../images/approved.json";

export const PORTRAIT_STATUS = Object.freeze({
  APPROVED: "APPROVED",   // provenance-tracked, cleared for the product
  PILOT: "PILOT",         // present but not cleared: never rendered in product
  FALLBACK: "FALLBACK",   // no image exists — the masked silhouette is used
});

const byPerson = new Map();
for (const img of approvedData.images || []) {
  const list = byPerson.get(img.player_id) || [];
  list.push(img);
  byPerson.set(img.player_id, list);
}

/** Prefer an exact-era image, then a near one, then anything approved. */
const bestFor = (personId, decade) => {
  const list = byPerson.get(personId);
  if (!list?.length) return null;
  const rank = (x) => {
    if (x.decade && decade && x.decade === decade) return 0;
    if (x.era_match_quality === "exact") return 1;
    if (x.era_match_quality === "near") return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b))[0];
};

/**
 * What a card should draw for this person.
 *
 * `objectPosition` and `scale` exist so a portrait can be aimed inside the
 * fixed zone without the card changing shape: a chest-up crop that sits low is
 * nudged with focalPoint rather than by resizing the card.
 */
export const resolvePortrait = (personId, decade = null) => {
  const img = bestFor(personId, decade);
  if (!img) {
    return {
      personId, portraitStatus: PORTRAIT_STATUS.FALLBACK,
      src: null, objectPosition: "top center", scale: 1, focalPoint: null, decadeVariant: decade,
    };
  }
  if (!img.approved_for_product) {
    // Present but not cleared. The product renders the fallback, never this.
    return {
      personId, portraitStatus: PORTRAIT_STATUS.PILOT,
      src: null, objectPosition: "top center", scale: 1, focalPoint: null, decadeVariant: decade,
    };
  }
  const focal = img.focal_point || null;
  return {
    personId,
    portraitStatus: PORTRAIT_STATUS.APPROVED,
    src: img.local_asset_path,
    objectPosition: focal ? `${focal.x}% ${focal.y}%` : (img.object_position || "top center"),
    scale: Number(img.scale) || 1,
    focalPoint: focal,
    decadeVariant: img.decade || decade,
  };
};

/** Initials for the fallback artwork. The full name always shows below it. */
export const initialsOf = (name) =>
  String(name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** Registry coverage, for the phase artifacts. */
export const portraitCoverage = () => {
  let approved = 0, pilot = 0;
  for (const list of byPerson.values()) {
    if (list.some((i) => i.approved_for_product)) approved += 1;
    else pilot += 1;
  }
  return { approved, pilot, registryEntries: byPerson.size };
};
