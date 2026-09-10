// ── Generated archetype placeholders ─────────────────────────────────────────
// Every player has a portrait placeholder (owner request, 2026-09-09). None of
// them is anyone: they are faceless, era-styled figures — one guard, one wing
// and one big per decade — generated as non-identifying art and mapped to a
// player by DECADE and PRIMARY POSITION alone. docs/IMAGES.md still forbids a
// generated likeness of a real athlete; this layer never renders one, and it
// never sits above an approved, provenance-tracked photograph (portraits.js
// resolves those first). Presentation only: nothing in simulation data reads it.
import registry from "../../images/placeholders.json";

export const PLACEHOLDER_ARCHETYPES = Object.freeze(["guard", "wing", "big"]);
export const PLACEHOLDER_DECADES = Object.freeze(["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);

/** guard: PG/SG · wing: SF · big: PF/C — from the player's primary position, or the slot. */
export const archetypeOf = (p) => {
  const pos = String(p?.positions?.[0] || p?.pos || p?.slot || "").toUpperCase();
  if (pos === "PG" || pos === "SG") return "guard";
  if (pos === "SF") return "wing";
  return "big";
};

const byKey = new Map((registry.images || []).map((i) => [`${i.decade}-${i.archetype}`, i]));
const decadesWithArt = new Set((registry.images || []).map((i) => i.decade));

/** The player's decade when art exists for it, else the nearest decade that has some. */
export const nearestDecade = (decade) => {
  if (decadesWithArt.has(decade)) return decade;
  const i = PLACEHOLDER_DECADES.indexOf(decade);
  let best = null, bestD = Infinity;
  for (const d of decadesWithArt) { const dist = Math.abs(PLACEHOLDER_DECADES.indexOf(d) - (i < 0 ? 7 : i)); if (dist < bestD) { bestD = dist; best = d; } }
  return best;
};

// FNV-1a over the player id: a stable coin for the mirror, so two players who
// share an archetype rarely stand exactly alike, and the same player always does.
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * What a card or row draws when no approved portrait exists. `src` is the
 * portrait rendition (card zone), `thumb` the square rendition (phone row).
 * Returns null only when the registry is empty.
 */
export const resolvePlaceholderArt = (p) => {
  if (!p) return null;
  const archetype = archetypeOf(p);
  const decade = nearestDecade(p.decade);
  if (!decade) return null;
  const img = byKey.get(`${decade}-${archetype}`) || byKey.get(`${decade}-wing`) || byKey.get(`${decade}-guard`) || byKey.get(`${decade}-big`) || null;
  if (!img) return null;
  return {
    id: img.id, decade, archetype,
    src: img.path, thumb: img.thumb || img.path,
    flip: hash(p.id || p.name || "") % 2 === 1,
    alt: `${p.name || "Player"} — EraClash placeholder art, not a likeness`,
  };
};

/** Coverage, for the record: every decade × archetype present, and how many players fall on each. */
export const placeholderCoverage = (players = []) => {
  const missing = [];
  for (const d of PLACEHOLDER_DECADES) for (const a of PLACEHOLDER_ARCHETYPES) if (!byKey.has(`${d}-${a}`)) missing.push(`${d}-${a}`);
  const perImage = {};
  for (const p of players) { const r = resolvePlaceholderArt(p); if (r) perImage[r.id] = (perImage[r.id] || 0) + 1; }
  return { images: byKey.size, missing, playersCovered: Object.values(perImage).reduce((a, b) => a + b, 0), perImage };
};
